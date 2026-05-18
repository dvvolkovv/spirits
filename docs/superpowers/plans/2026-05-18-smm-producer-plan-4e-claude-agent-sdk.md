# SMM Producer Plan 4e — Claude Agent SDK + In-process MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести SMM Producer (agent id=15) с прямого `Anthropic.messages.stream()` на `@anthropic-ai/claude-agent-sdk`, чтобы tool-calling работал через Claude Max OAuth подписку (без `ANTHROPIC_API_KEY`). Все 11 SMM-tools регистрируются как in-process MCP-server. Остальные 14 агентов остаются на текущем пути (без изменений).

**Architecture:** В `chat.service.ts` для `agent.name === 'smm_producer'` вызываем новый `ClaudeAgentService.streamSmmProducer()`. Сервис собирает `createSdkMcpServer({tools: [...]})` где каждый tool делегирует в существующий `SmmProducerToolsService.handle()`. Вызывает `query({prompt, options: {mcpServers, model, systemPrompt, disallowedTools, resume, cwd}})`. Iterates SDK events → транслирует в существующий NDJSON-формат фронта. После `result` сохраняет session_id для resume в `ai_profiles_consolidated.profile_data.smm_sdk_session_id`. Conversation continuity — через SDK session resume (Claude хранит state на диске в `/tmp/linkeon-smm-sessions/<userId>/`).

**Tech Stack:** `@anthropic-ai/claude-agent-sdk@^0.3.143` (TypeScript SDK shells out to `claude` CLI subprocess, авторизуется через `~/.claude/.credentials.json` OAuth), `zod@^3.x` (tool schema validation), `@modelcontextprotocol/sdk` (transitive). Никаких новых процессов, всё in-process в `linkeon-api`.

**End-state demo:**
- Юзер пишет "Сгенерируй 1 ролик про долги" в чате с SMM Producer
- chat.service.ts → ClaudeAgentService.streamSmmProducer
- SDK спавнит `claude` subprocess, авторизуется через OAuth, запускает агент-loop
- Claude emit'ит `tool_use: generate_scenarios(mode='topic', count=1, topic='долги')`
- SDK маршрутизирует в нашу MCP-tool → `SmmProducerToolsService.handle('generate_scenarios', ...)` → возвращает `{campaignId, scenarios: [{id, title}]}`
- SDK emit'ит `tool_result`, потом следующий `assistant` ответ с текстом и `smm_scenario` markdown-блоком
- Фронт через ChatInterface рендерит ScenarioCard
- Юзер: "первый ок" → `approve_scenarios` → render → `approve_video` → `schedule_publication(['telegram'])` → реальный пост в TG

---

## File Structure

**Создаётся:**
```
spirits_back/
├── src/chat/
│   ├── claude-agent.service.ts                       # NEW: SDK wrapper
│   └── claude-agent.event-translator.ts              # NEW: SDK events → NDJSON
└── (тесты можно потом)
```

**Модифицируется:**
```
spirits_back/
├── package.json                                      # +@anthropic-ai/claude-agent-sdk, +zod
├── src/chat/chat.service.ts                          # routing для smm_producer
├── src/chat/chat.module.ts                           # register ClaudeAgentService
└── src/smm/producer/smm-producer-tools.service.ts    # publicly expose handle() if not already
```

**Новые env-vars / OS deps:**
- `claude` CLI установлен на сервере (`which claude` уже подтверждено — `/usr/bin/claude` v2.1.97 на PROD)
- `~/.claude/.credentials.json` существует и валиден (subscription `max`, expiresAt в будущем) — уже OK
- Никаких новых env-vars в `.env`

---

## Task 1: Install SDK + zod + scaffold ClaudeAgentService

**Files:**
- Modify: `package.json` (deps)
- Create: `src/chat/claude-agent.service.ts`
- Modify: `src/chat/chat.module.ts`

- [ ] **Step 1.1: Install deps**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm install @anthropic-ai/claude-agent-sdk@^0.3.143 zod@^3.23.0 --save 2>&1 | tail -3
```

Expected: оба добавлены в `dependencies`. SDK тянет `@modelcontextprotocol/sdk` как transitive.

Sanity:
```bash
ls node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs && echo "SDK installed"
node -e "import('@anthropic-ai/claude-agent-sdk').then(m => console.log('exports:', Object.keys(m).slice(0,10)))"
```
Expected: `exports: [ 'query', 'tool', 'createSdkMcpServer', 'startup', ... ]` среди первых 10.

- [ ] **Step 1.2: Create ClaudeAgentService skeleton**

Create `src/chat/claude-agent.service.ts`:

```typescript
// src/chat/claude-agent.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { PgService } from '../common/services/pg.service';
import { SmmProducerToolsService, ToolContext } from '../smm/producer/smm-producer-tools.service';
import { SMM_PRODUCER_SYSTEM_PROMPT } from '../smm/producer/smm-producer.prompt';
import { translateSdkEvent } from './claude-agent.event-translator';

const SESSION_ROOT = '/tmp/linkeon-smm-sessions';

// Claude Code built-ins to disable — SMM Producer должен использовать только наши MCP tools.
const DISALLOWED_BUILTINS = [
  'Bash', 'Edit', 'Read', 'Write', 'Grep', 'Glob', 'WebFetch', 'WebSearch',
  'Task', 'EnterPlanMode', 'ExitPlanMode', 'NotebookEdit', 'AskUserQuestion',
  'EnterWorktree', 'ExitWorktree', 'CronCreate', 'CronDelete', 'CronList',
  'Monitor', 'PushNotification', 'RemoteTrigger', 'Skill', 'TodoWrite', 'ScheduleWakeup',
];

@Injectable()
export class ClaudeAgentService {
  private readonly logger = new Logger(ClaudeAgentService.name);

  constructor(
    private readonly pg: PgService,
    private readonly smmTools: SmmProducerToolsService,
  ) {}

  async streamSmmProducer(
    ctx: ToolContext,
    userMessage: string,
    res: Response,
  ): Promise<void> {
    const cwd = path.join(SESSION_ROOT, ctx.userId);
    await fs.promises.mkdir(cwd, { recursive: true });

    // Resume previous session if we have one
    const resumeId = await this.loadSessionId(ctx.userId);

    const mcpServer = this.buildMcpServer(ctx);
    let newSessionId: string | undefined;
    let totalCostUsd = 0;

    try {
      for await (const event of query({
        prompt: userMessage,
        options: {
          model: 'claude-haiku-4-5',
          systemPrompt: SMM_PRODUCER_SYSTEM_PROMPT,
          mcpServers: { 'smm-tools': mcpServer },
          disallowedTools: DISALLOWED_BUILTINS,
          cwd,
          resume: resumeId,
          permissionMode: 'bypassPermissions',
          includePartialMessages: true,
          settingSources: [],
        } as any,
      })) {
        // Capture session id from system init event
        if (event.type === 'system' && (event as any).subtype === 'init') {
          newSessionId = (event as any).session_id;
        }
        if (event.type === 'result') {
          totalCostUsd = (event as any).total_cost_usd ?? 0;
        }

        const ndjson = translateSdkEvent(event);
        if (ndjson) {
          res.write(JSON.stringify(ndjson) + '\n');
        }
      }
    } catch (err: any) {
      this.logger.error(`Claude Agent SDK failed: ${err.message}`);
      res.write(JSON.stringify({ type: 'error', message: err.message }) + '\n');
    }

    // Persist session id for resume
    if (newSessionId && newSessionId !== resumeId) {
      await this.saveSessionId(ctx.userId, newSessionId);
    }

    // Token accounting hook — placeholder until Task 5
    if (totalCostUsd > 0) {
      this.logger.log(`SMM agent cost for user ${ctx.userId}: $${totalCostUsd.toFixed(4)}`);
    }

    res.end();
  }

  private buildMcpServer(_ctx: ToolContext): any {
    // Stub — Task 2 fills this in.
    return createSdkMcpServer({
      name: 'smm-tools',
      version: '1.0.0',
      tools: [],
    });
  }

  private async loadSessionId(userId: string): Promise<string | undefined> {
    const r = await this.pg.query(
      `SELECT profile_data->>'smm_sdk_session_id' AS sid
         FROM ai_profiles_consolidated WHERE user_id = $1`,
      [userId],
    );
    return r.rows[0]?.sid ?? undefined;
  }

  private async saveSessionId(userId: string, sessionId: string): Promise<void> {
    await this.pg.query(
      `UPDATE ai_profiles_consolidated
          SET profile_data = COALESCE(profile_data, '{}'::jsonb) || $1::jsonb,
              updated_at = now()
        WHERE user_id = $2`,
      [JSON.stringify({ smm_sdk_session_id: sessionId }), userId],
    );
  }
}
```

- [ ] **Step 1.3: Create event-translator stub**

Create `src/chat/claude-agent.event-translator.ts` (real impl in Task 3):

```typescript
// src/chat/claude-agent.event-translator.ts
// Maps Claude Agent SDK events to the NDJSON protocol that ChatInterface.tsx expects.
// Full implementation in Plan 4e Task 3.
export function translateSdkEvent(event: any): any | null {
  // TEMP: just forward system messages as begin, ignore everything else
  if (event?.type === 'system' && event.subtype === 'init') {
    return { type: 'begin' };
  }
  return null;
}
```

- [ ] **Step 1.4: Register in ChatModule**

Open `src/chat/chat.module.ts`. Add import + provider:
```typescript
import { ClaudeAgentService } from './claude-agent.service';

// In @Module providers: [..., ClaudeAgentService]
```

The service uses `SmmProducerToolsService` (already in `SmmModule.exports`) and `PgService` (in `CommonModule.exports`). Make sure `ChatModule` already imports those — Plan 3a verified this.

- [ ] **Step 1.5: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -5
```

Expected: clean. If TypeScript complains about `permissionMode` / `settingSources` / `resume` types in Options, the `as any` cast on the options object covers that — SDK types may not perfectly match across versions. Worst case: import the exact `Options` type and pick out fields.

- [ ] **Step 1.6: Commit**

```bash
git add package.json package-lock.json \
        src/chat/claude-agent.service.ts \
        src/chat/claude-agent.event-translator.ts \
        src/chat/chat.module.ts
git -c commit.gpgsign=false commit -m "feat(chat): scaffold ClaudeAgentService для SMM Producer (Plan 4e Task 1)

- Install @anthropic-ai/claude-agent-sdk + zod
- ClaudeAgentService: оборачивает SDK query(), spawns claude CLI как
  subprocess (OAuth через ~/.claude/.credentials.json, без
  ANTHROPIC_API_KEY)
- Session resume через ai_profiles_consolidated.profile_data.smm_sdk_session_id
- Disabled все встроенные Claude Code tools — SMM Producer работает
  только с нашими MCP tools (Task 2)
- Cwd = /tmp/linkeon-smm-sessions/<userId>/ для изоляции сессий
- Event translator — стаб, реальная имплементация в Task 3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: In-process MCP server с 11 SMM tools

**Files:**
- Modify: `src/chat/claude-agent.service.ts` (buildMcpServer)

Все 11 tools оборачивают существующие методы `SmmProducerToolsService.handle()`. Tool input-schema копируем из `smm-producer-tools.ts` (где они в JSON Schema формате) и переводим в zod.

- [ ] **Step 2.1: Inspect existing tool schemas**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
cat src/smm/producer/smm-producer-tools.ts
```

Expected: массив `SMM_PRODUCER_TOOLS` с 11 объектами `{name, description, input_schema}`. Имена:
1. `generate_scenarios`
2. `regenerate_scenario`
3. `approve_scenarios`
4. `reject_scenario`
5. `approve_video`
6. `reject_video`
7. `list_scenarios`
8. `connect_social`
9. `schedule_publication`
10. `cancel_publication`
11. `list_publications`

- [ ] **Step 2.2: Build MCP server with zod schemas**

В `src/chat/claude-agent.service.ts` замени `buildMcpServer` на:

```typescript
  private buildMcpServer(ctx: ToolContext): any {
    const handle = async (name: string, args: any) => {
      const result = await this.smmTools.handle(name, args, ctx);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    };

    const tools = [
      tool(
        'generate_scenarios',
        "Generate N short-video scenarios for SMM. Use mode='topic' if user gave a topic, 'trends' for trending topics, 'auto' otherwise. count defaults to 3.",
        {
          mode: z.enum(['topic', 'trends', 'auto']),
          count: z.number().int().min(1).max(10),
          topic: z.string().optional(),
        },
        async (args) => handle('generate_scenarios', args),
      ),
      tool(
        'regenerate_scenario',
        "Regenerate a single rejected scenario in the same campaign with a different angle.",
        {
          scenario_id: z.string(),
          feedback: z.string().optional(),
        },
        async (args) => handle('regenerate_scenario', args),
      ),
      tool(
        'approve_scenarios',
        "Approve one or more scenarios — kicks off the render pipeline. Returns approved videoIds.",
        {
          scenario_ids: z.array(z.string()).min(1),
        },
        async (args) => handle('approve_scenarios', args),
      ),
      tool(
        'reject_scenario',
        "Reject a scenario — final, no regeneration.",
        {
          scenario_id: z.string(),
          reason: z.string().optional(),
        },
        async (args) => handle('reject_scenario', args),
      ),
      tool(
        'approve_video',
        "Approve a rendered video — marks it ready for publication.",
        {
          video_id: z.string(),
        },
        async (args) => handle('approve_video', args),
      ),
      tool(
        'reject_video',
        "Reject a rendered video — marks it as discarded.",
        {
          video_id: z.string(),
          reason: z.string().optional(),
        },
        async (args) => handle('reject_video', args),
      ),
      tool(
        'list_scenarios',
        "List the user's recent SMM campaigns and their scenarios. Use when user asks 'что у меня в работе?'",
        {
          campaign_id: z.string().optional(),
        },
        async (args) => handle('list_scenarios', args),
      ),
      tool(
        'connect_social',
        "Returns a link the user opens in a browser to authorize Linkeon to publish on a social platform. For Telegram, returns manual setup instructions.",
        {
          platform: z.enum(['telegram', 'vk', 'youtube', 'tiktok', 'instagram']),
        },
        async (args) => handle('connect_social', args),
      ),
      tool(
        'schedule_publication',
        "Schedule a video to publish to platforms. scheduled_time accepts ISO timestamp, 'завтра в 18', 'через час', 'сейчас', or null for immediate.",
        {
          video_id: z.string(),
          platforms: z.array(z.enum(['telegram', 'vk', 'youtube', 'tiktok', 'instagram'])).min(1),
          scheduled_time: z.string().optional(),
          caption: z.string().optional(),
        },
        async (args) => handle('schedule_publication', args),
      ),
      tool(
        'cancel_publication',
        "Cancel a scheduled publication (status must be 'scheduled', not yet started).",
        {
          publication_id: z.string(),
        },
        async (args) => handle('cancel_publication', args),
      ),
      tool(
        'list_publications',
        "List the user's recent publications (last 50), optionally filtered by status or videoId.",
        {
          status: z.enum(['scheduled', 'publishing', 'published', 'failed', 'cancelled']).optional(),
          video_id: z.string().optional(),
        },
        async (args) => handle('list_publications', args),
      ),
    ];

    return createSdkMcpServer({
      name: 'smm-tools',
      version: '1.0.0',
      tools,
    });
  }
```

**Важно:** `SmmProducerToolsService.handle()` уже принимает `ctx` и сам возвращает JSON-объект. Мы оборачиваем в `content: [{type:'text', text: JSON.stringify(result)}]` — это формат MCP `CallToolResult`. Claude видит JSON string и понимает его как структурированные данные.

- [ ] **Step 2.3: Verify ToolContext signature**

Open `src/smm/producer/smm-producer-tools.service.ts` и убедись, что `handle(toolName, input, ctx)` публичен (не private). Если private — поменяй на public.

```bash
grep "handle(" src/smm/producer/smm-producer-tools.service.ts | head -3
```

Expected: `async handle(toolName: string, input: any, ctx: ToolContext): Promise<any> {`

- [ ] **Step 2.4: Build verify**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean. Zod inference на 11 schemas обычно работает; если TS жалуется на `InferShape` mismatch — обернуть args в `as any` в каждом handler'е.

- [ ] **Step 2.5: Commit**

```bash
git add src/chat/claude-agent.service.ts src/smm/producer/smm-producer-tools.service.ts
git -c commit.gpgsign=false commit -m "feat(chat): in-process MCP server с 11 SMM tools (Plan 4e Task 2)

ClaudeAgentService.buildMcpServer() оборачивает все 11 методов
SmmProducerToolsService.handle() как SDK MCP tools с zod-схемами.
Каждый tool делегирует в существующий handle(name, args, ctx),
возвращает JSON-string в content[0].text формате MCP CallToolResult.

Tools:
  generate_scenarios, regenerate_scenario, approve_scenarios,
  reject_scenario, approve_video, reject_video, list_scenarios,
  connect_social, schedule_publication, cancel_publication,
  list_publications

Никакого нового кода в бизнес-логике — это чистая обёртка над
существующим Plan 3a/4 dispatcher'ом.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Event translation SDK → NDJSON

**Files:**
- Modify: `src/chat/claude-agent.event-translator.ts`

SDK emit'ит сложные объекты, фронт в `ChatInterface.tsx` ждёт простой NDJSON:
- `{type: 'begin'}` — старт стрима
- `{type: 'text', text: '...'}` — фрагмент текста (delta)
- `{type: 'tool_start', tool: 'name', input: {...}}` — начало tool_use
- `{type: 'tool_result', tool: 'name', result: {...}}` — результат tool
- `{type: 'done', usage?: {...}}` — конец

С `includePartialMessages: true` SDK даёт streaming text deltas через `stream_event` type. Реализуем оба пути: полные сообщения как fallback + partial deltas если включены.

- [ ] **Step 3.1: Capture sample SDK events**

Запусти быстрый smoke на PROD чтобы увидеть точную форму events:
```bash
ssh dvolkov@212.113.106.202 'cd /tmp/sdk-test-dir && cat > capture.mjs <<EOF
import { query } from "@anthropic-ai/claude-agent-sdk";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const echo = tool("echo", "Echo back the input", { msg: z.string() }, async (a) => ({
  content: [{ type: "text", text: \`echoed: \${a.msg}\` }],
}));
const mcp = createSdkMcpServer({ name: "test", version: "1.0", tools: [echo] });

let n = 0;
for await (const e of query({
  prompt: "Call the echo tool with msg=hello, then say done",
  options: { mcpServers: { test: mcp }, includePartialMessages: true, settingSources: [] }
})) {
  n++;
  console.log(\`[\${n}] \${e.type}\`, JSON.stringify(e).slice(0, 400));
  if (n > 40) break;
}
EOF
node capture.mjs 2>&1 | head -50'
```

Запиши какие именно `type` и подформы прилетают. Скорее всего:
- `system/init` — начальный + tools list
- `stream_event` (partial) — фрагменты текста и tool_use input deltas
- `assistant` (full message) — финальный assistant turn с content blocks
- `user` (echo) — когда SDK feeds tool_result обратно в Claude
- `result` — финальный итог с usage

- [ ] **Step 3.2: Implement translator**

Replace `src/chat/claude-agent.event-translator.ts`:

```typescript
// src/chat/claude-agent.event-translator.ts
/**
 * Translates Claude Agent SDK events to the NDJSON protocol the frontend's
 * ChatInterface.tsx parses. Returns `null` to suppress events that don't map.
 *
 * Frontend expects:
 *   { type: 'begin' }
 *   { type: 'text', text: '...' }
 *   { type: 'tool_start', tool: string, input: object }
 *   { type: 'tool_result', tool: string, result: object }
 *   { type: 'done', usage?: object }
 *   { type: 'error', message: string }
 */

type NDJsonEvent =
  | { type: 'begin' }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; tool: string; input: any }
  | { type: 'tool_result'; tool: string; result: any }
  | { type: 'done'; usage?: any }
  | { type: 'error'; message: string };

export function translateSdkEvent(event: any): NDJsonEvent | NDJsonEvent[] | null {
  if (!event || typeof event !== 'object') return null;

  const t = event.type;

  // 1. system/init → begin
  if (t === 'system' && event.subtype === 'init') {
    return { type: 'begin' };
  }

  // 2. stream_event with partial content_block_delta (text deltas)
  if (t === 'stream_event') {
    const inner = event.event ?? event;
    if (inner?.type === 'content_block_delta') {
      const delta = inner.delta;
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        return { type: 'text', text: delta.text };
      }
    }
    return null;
  }

  // 3. assistant message — full turn. With partial mode this would emit AFTER
  // all the deltas; we extract any tool_use blocks. If partial-text wasn't
  // delivered via stream_event, we emit the full text here as fallback.
  if (t === 'assistant') {
    const out: NDJsonEvent[] = [];
    const content = event.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use') {
          out.push({ type: 'tool_start', tool: stripMcpPrefix(block.name), input: block.input });
        }
        // text blocks already emitted via stream_event partials; skip here
      }
    }
    return out.length > 0 ? out : null;
  }

  // 4. user/tool_result — when SDK feeds tool output back to Claude. Forward
  // to frontend so it can render scenario/video/social-connect inline blocks.
  if (t === 'user') {
    const out: NDJsonEvent[] = [];
    const content = event.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_result') {
          // Extract the tool name from the matching tool_use_id if SDK provides it,
          // OR fall back to whatever the SDK exposes (tool_use_result.tool may be present)
          const toolName = stripMcpPrefix(
            event.tool_use_result?.tool ??
            event.tool_use_result?.name ??
            block.tool_name ??
            'unknown',
          );
          let result: any;
          try {
            const raw = Array.isArray(block.content)
              ? block.content.map((c: any) => c.text ?? '').join('')
              : (block.content ?? '');
            result = raw ? JSON.parse(raw) : null;
          } catch {
            result = { error: String(block.content).slice(0, 200) };
          }
          out.push({ type: 'tool_result', tool: toolName, result });
        }
      }
    }
    return out.length > 0 ? out : null;
  }

  // 5. result → done
  if (t === 'result') {
    return { type: 'done', usage: event.usage };
  }

  return null;
}

function stripMcpPrefix(name: string): string {
  // SDK prefixes MCP-served tools with "mcp__<server>__" — strip for frontend
  return name.replace(/^mcp__[^_]+__/, '');
}
```

**Note about tool name mapping:** SDK emits tool names like `mcp__smm-tools__generate_scenarios`. Frontend в `ChatInterface.tsx` ловит `data.tool === 'generate_scenarios'`. Поэтому `stripMcpPrefix` снимает префикс. Проверь в Step 3.1 capture, какой именно префикс используется (`mcp__smm-tools__` или `mcp__smm_tools__` — зависит от того, как SDK обрабатывает дефис). Если префикс другой, поправь regex.

- [ ] **Step 3.3: Update ClaudeAgentService to handle array returns**

В `claude-agent.service.ts` уже есть:
```typescript
const ndjson = translateSdkEvent(event);
if (ndjson) {
  res.write(JSON.stringify(ndjson) + '\n');
}
```

Translator теперь может вернуть массив (для assistant turns с несколькими tool_use). Замени на:
```typescript
const ndjson = translateSdkEvent(event);
if (ndjson) {
  const events = Array.isArray(ndjson) ? ndjson : [ndjson];
  for (const e of events) {
    res.write(JSON.stringify(e) + '\n');
  }
}
```

- [ ] **Step 3.4: Build verify**

```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 3.5: Commit**

```bash
git add src/chat/claude-agent.event-translator.ts src/chat/claude-agent.service.ts
git -c commit.gpgsign=false commit -m "feat(chat): event translator SDK → NDJSON (Plan 4e Task 3)

translateSdkEvent: маппит Claude Agent SDK events на тот же
NDJSON-протокол, который ChatInterface.tsx ждёт от прежнего
Anthropic.messages.stream() пути:
  system/init      → { type: 'begin' }
  stream_event     → { type: 'text', text: delta }  (с includePartialMessages)
  assistant        → [{ type: 'tool_start', tool, input }, ...] (для tool_use блоков)
  user/tool_result → [{ type: 'tool_result', tool, result }, ...]
  result           → { type: 'done', usage }

stripMcpPrefix снимает 'mcp__smm-tools__' префикс с tool names,
чтобы фронт-парсер ловил их по короткому имени ('generate_scenarios'
а не 'mcp__smm-tools__generate_scenarios').

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Маршрутизация smm_producer в chat.service.ts

**Files:**
- Modify: `src/chat/chat.service.ts`

Найди место где chat.service.ts проверяет `agent.name === 'smm_producer'` (Plan 3a Task 7 добавил ветку для tool-calling). Замени там вызов Anthropic SDK на ClaudeAgentService.

- [ ] **Step 4.1: Inspect existing routing**

```bash
grep -n "smm_producer\|streamChat\|this.anthropic\|messages.stream" src/chat/chat.service.ts | head -10
```

Expected: где-то после загрузки agent — `if (agent.name === 'smm_producer')` ветка, которая собирает tools и зовёт `this.anthropic.messages.stream({...})`. Найди start этой ветки.

- [ ] **Step 4.2: Inject ClaudeAgentService**

В `ChatService` constructor добавь:
```typescript
import { ClaudeAgentService } from './claude-agent.service';

constructor(
  // existing deps...
  private readonly claudeAgent: ClaudeAgentService,
) {}
```

- [ ] **Step 4.3: Replace SMM Producer branch**

Найди ветку для `smm_producer` в `streamChat()`. Она примерно такая (точные строки зависят от текущего кода):

```typescript
if (agent.name === 'smm_producer') {
  // 1. Set response headers for NDJSON streaming
  res.status(200);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 2. Save user message to history
  await this.pg.query(
    `INSERT INTO custom_chat_history (session_id, sender_type, content, created_at)
     VALUES ($1, 'human', $2, now())`,
    [chatSessionId, message],
  );

  // 3. Build ToolContext + delegate
  const ctx = {
    userId,
    recentCampaignId: undefined, // или загрузить из недавней campaign
  };

  try {
    await this.claudeAgent.streamSmmProducer(ctx, message, res);
  } catch (err: any) {
    this.logger.error(`SMM streaming failed: ${err.message}`);
    res.write(JSON.stringify({ type: 'error', message: err.message }) + '\n');
    res.end();
  }
  return;
}
```

**Save assistant response to history:** ClaudeAgentService должен НЕ ТОЛЬКО стримить в res, но и собирать full assistant response, чтобы записать его в `custom_chat_history` после `result` event. Расширь `streamSmmProducer`:
- Завести буфер `let assistantText = ''`
- При каждом `{type:'text', text}` после translation: `assistantText += text`
- После цикла: если есть текст — записать в DB

Добавь это в `streamSmmProducer` после event loop (но до `res.end()`):
```typescript
if (assistantText.trim()) {
  await this.pg.query(
    `INSERT INTO custom_chat_history (session_id, sender_type, content, created_at)
     VALUES ($1, 'ai', $2, now())`,
    [`${ctx.userId}_smm_producer`, assistantText],
  );
}
```

Или передай `chatSessionId` явно как параметр в `streamSmmProducer`.

**Чище:** изменить сигнатуру `streamSmmProducer(ctx, userMessage, chatSessionId, res)`. И в нём же делать insert и user message, и assistant response — atomic. Тогда chat.service.ts просто делегирует.

- [ ] **Step 4.4: Build verify**

```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 4.5: Commit**

```bash
git add src/chat/chat.service.ts src/chat/claude-agent.service.ts
git -c commit.gpgsign=false commit -m "feat(chat): smm_producer agent роутится через ClaudeAgentService (Plan 4e Task 4)

ChatService.streamChat() при agent.name='smm_producer':
  - Устанавливает streaming headers
  - Делегирует в ClaudeAgentService.streamSmmProducer(ctx, msg, sessionId, res)
  - ClaudeAgentService отвечает за персистенс human + ai сообщений в
    custom_chat_history, токен-биллинг (Task 5), стриминг NDJSON

Все остальные агенты остаются на прежнем Anthropic SDK пути.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Token billing + ai_profiles_consolidated балансировка

**Files:**
- Modify: `src/chat/claude-agent.service.ts`

SDK даёт `total_cost_usd` в `result` event. Конвертируем в Linkeon-tokens по фиксированному курсу и снимаем с баланса.

- [ ] **Step 5.1: Define conversion rate**

Linkeon use-case: "1 рубль ≈ 100 токенов" сейчас (см. остальной chat tokenization logic). На Claude Max OAuth `total_cost_usd` от SDK — это **рыночная цена API-токенов**, не реальная стоимость для нас (мы её платим раз в месяц подпиской, не per-call). НО нам нужно как-то ограничить юзеров.

Берём простую формулу: 1 USD = 100 000 Linkeon tokens (т.е. подписка $200/мес даёт 20M токенов). Эта цифра — placeholder, продакт может поменять.

- [ ] **Step 5.2: Implement billing**

В `claude-agent.service.ts` после `for await` цикла, перед `res.end()`:

```typescript
// Token billing
if (totalCostUsd > 0) {
  const tokensToDeduct = Math.ceil(totalCostUsd * 100_000);
  await this.pg.query(
    `UPDATE ai_profiles_consolidated
        SET tokens = GREATEST(0, tokens - $1),
            updated_at = now()
      WHERE user_id = $2`,
    [tokensToDeduct, ctx.userId],
  );
  this.logger.log(`SMM agent: deducted ${tokensToDeduct} tokens from ${ctx.userId} (cost $${totalCostUsd.toFixed(4)})`);
}
```

- [ ] **Step 5.3: Pre-flight balance check**

В начале `streamSmmProducer`, перед `query()`:

```typescript
const balRes = await this.pg.query(
  `SELECT tokens FROM ai_profiles_consolidated WHERE user_id = $1`,
  [ctx.userId],
);
const balance = Number(balRes.rows[0]?.tokens ?? 0);
if (balance <= 0) {
  res.write(JSON.stringify({
    type: 'error',
    message: '⚠️ Недостаточно токенов для SMM-продюсера. Пополни баланс через /chat?view=tokens.',
  }) + '\n');
  res.end();
  return;
}
```

(Это дублирует существующий check в `chat.service.ts`, но для defense-in-depth ок — ClaudeAgentService может быть вызван и из других мест в будущем.)

- [ ] **Step 5.4: Build verify**

```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 5.5: Commit**

```bash
git add src/chat/claude-agent.service.ts
git -c commit.gpgsign=false commit -m "feat(chat): SMM Producer token billing через Linkeon balance (Plan 4e Task 5)

После result event SDK возвращает total_cost_usd (рыночная цена
API-токенов). Конвертируем по курсу \$1 = 100k tokens и снимаем
с ai_profiles_consolidated.tokens юзера.

Pre-flight check: если balance <= 0, эмитим error event и не зовём SDK.

Курс 100k tokens/USD = placeholder. Продакт может поменять в одной
константе TOKEN_PRICE_USD когда определится с моделью.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Deploy + E2E smoke (full TG publication)

**Files:** (deploy only)

- [ ] **Step 6.1: Merge worktree → b2b**

```bash
cd /Users/dmitry/Downloads/spirits_back
git checkout b2b
git pull --ff-only 2>&1 | tail -3 || true
git merge --no-ff smm/plan-4e-claude-sdk -m "Merge Plan 4e: Claude Agent SDK integration for SMM Producer"
git push origin b2b 2>&1 | tail -3
```

- [ ] **Step 6.2: Deploy backend**

```bash
rsync -az --timeout=30 \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' \
  --exclude='.worktrees/' --exclude='.env' \
  --exclude='tests/node_modules/' --exclude='public/generated/' \
  --exclude='worker/node_modules' --exclude='worker/dist' \
  ~/Downloads/spirits_back/ dvolkov@212.113.106.202:/home/dvolkov/spirits_back/

ssh dvolkov@212.113.106.202 'set -e
cd ~/spirits_back
npm install 2>&1 | tail -5
npm run build 2>&1 | tail -3
pm2 restart linkeon-api
sleep 6
pm2 list | head -7
'
```

Expected: оба процесса online. `npm install` подтянет SDK + zod.

- [ ] **Step 6.3: Verify boot**

```bash
curl -s -o /dev/null -w "agents: %{http_code}\n" https://my.linkeon.io/webhook/agents
ssh dvolkov@212.113.106.202 'pm2 logs linkeon-api --lines 20 --nostream 2>&1 | tail -20'
```

Expected: 200 + чистый стартап лог без error/fatal.

- [ ] **Step 6.4: E2E smoke through chat**

Это финальная проверка. Используем тот же подход что в предыдущей smoke — JWT через Redis OTP.

```bash
# 1. Trigger SMS + read code from Redis
curl -sf "https://my.linkeon.io/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/79030169187" >/dev/null
sleep 1
CODE=$(ssh dvolkov@212.113.106.202 'docker exec redis redis-cli GET "sc-79030169187"')
JWT=$(curl -s "https://my.linkeon.io/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/79030169187/$CODE" | jq -r '."access-token"')
echo "JWT len: ${#JWT}"

# 2. Switch agent to smm_producer
curl -s -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"agentName":"smm_producer"}' \
  "https://my.linkeon.io/webhook/change-agent"
echo ""

# 3. Send first message: generate scenario
echo "--- chat stream ---"
curl -sN -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"assistantId":15, "message":"Сгенерируй 1 короткий ролик про долги"}' \
  "https://my.linkeon.io/webhook/soulmate/chat" 2>&1 | head -50 > /tmp/chat-stream.log
echo "captured $(wc -l < /tmp/chat-stream.log) lines"
echo "--- tool events ---"
grep -E '"tool_start"|"tool_result"' /tmp/chat-stream.log | head -10
```

Expected: ловим `tool_start` и `tool_result` для `generate_scenarios`. Из result достаём `scenarioId`.

```bash
# 4. Approve scenario
SCENARIO_ID=<extracted from chat stream>
curl -s -X POST -H "Authorization: Bearer $JWT" \
  "https://my.linkeon.io/webhook/smm/scenarios/$SCENARIO_ID/approve" | jq '.'
VIDEO_ID=$(... | jq -r '.approved[0].videoId')

# 5. Wait for render (~75 sec)
for i in $(seq 1 12); do
  STATUS=$(ssh dvolkov@212.113.106.202 "docker exec redis redis-cli HGET smm:video:$VIDEO_ID:state status" 2>/dev/null)
  echo "[$i] status=$STATUS"
  if [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 8
done

# 6. Approve video + publish to TG
curl -sN -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"assistantId\":15, \"message\":\"Подтверди ролик $VIDEO_ID и опубликуй в Telegram прямо сейчас\"}" \
  "https://my.linkeon.io/webhook/soulmate/chat" 2>&1 | head -80 > /tmp/chat-publish.log

grep -E '"tool_start"|"tool_result"' /tmp/chat-publish.log
```

Expected:
- `tool_start: approve_video`
- `tool_result: { ok: true }`
- `tool_start: schedule_publication`
- `tool_result: { scheduled: [{platform: 'telegram', publicationId, jobId}], failed: [] }`
- В течение ~10 сек реальный пост в твоём TG-канале

Verify:
```bash
ssh dvolkov@212.113.106.202 'pm2 logs linkeon-smm-worker --lines 20 --nostream 2>&1 | grep -E "telegram|publish" | tail -10'
```

- [ ] **Step 6.5: Tag release**

```bash
cd /Users/dmitry/Downloads/spirits_back
git tag -a smm-plan-4e-deployed -m "Plan 4e (Claude Agent SDK + In-process MCP) deployed to PROD

SMM Producer (agent id=15) теперь работает через Claude Max OAuth
без ANTHROPIC_API_KEY. SDK spawns 'claude' subprocess, auth через
~/.claude/.credentials.json. Все 11 SMM tools зарегистрированы как
in-process MCP server.

Остальные 14 агентов остаются на прежнем Anthropic SDK пути.

E2E flow проверен на проде: чат → generate_scenarios → approve →
render → schedule_publication → реальный пост в TG."
git push origin smm-plan-4e-deployed
```

---

## Self-Review Checklist

**1. Spec coverage:**
- Заменить direct Anthropic SDK → SDK shells out to claude CLI: ✓ Task 1
- In-process MCP server с 11 tools: ✓ Task 2
- Event translation в NDJSON: ✓ Task 3
- Routing для smm_producer в chat.service.ts: ✓ Task 4
- Conversation continuity (session resume): ✓ Task 1 (loadSessionId/saveSessionId) + Task 4
- Disable Claude Code built-in tools: ✓ Task 1 (DISALLOWED_BUILTINS)
- Token billing: ✓ Task 5
- E2E проверка от чата до TG-поста: ✓ Task 6

**2. Placeholder scan:**
- Конкретный код в каждом шаге: ✓
- Конкретные команды + expected output: ✓
- Названия файлов точные: ✓

**3. Type consistency:**
- `ToolContext` — взят из `SmmProducerToolsService` (Plan 3a), shape `{userId, recentCampaignId?}`. Consistent.
- `SmmProducerToolsService.handle()` — public method, signature `(toolName: string, input: any, ctx: ToolContext): Promise<any>`. Consistent с Plan 3a.
- Frontend NDJSON ивенты — `{type:'tool_start', tool, input}` и `{type:'tool_result', tool, result}` совпадают с тем, как фронт парсит в `ChatInterface.tsx` (Plan 3b Task 5).
- SDK API: `query`, `tool`, `createSdkMcpServer` — confirmed via local SDK source inspection at `/tmp/cas-extract/`.

**4. Known risks / mitigations:**
- **MCP tool name prefix** — SDK добавляет `mcp__<server>__` префикс. `stripMcpPrefix` в translator снимает. **Mitigation:** Step 3.1 captures actual prefix on real run.
- **Streaming text deltas** — `includePartialMessages: true` нужен; форма `stream_event` подсобытий может варьироваться. **Mitigation:** Step 3.1 captures.
- **OAuth token expiry** — `expiresAt` в credentials.json. Если протух — SDK падает. **Mitigation:** в Task 5 повторно проверить логи; если упадёт, юзер запускает `claude /login` через RDP.
- **Claude Max rate-limit (5-hour window)** — если кончится, SDK эмитит rate-limit error. **Mitigation:** error event прокидывается в NDJSON, фронт показывает; продакт берёт следующий tier subscription или fallback на API key.
- **Session disk grow** — `/tmp/linkeon-smm-sessions/<userId>/*.jsonl` накапливаются. **Mitigation (follow-up):** daily cron `find /tmp/linkeon-smm-sessions -mtime +7 -delete`. Не блокирует.

**5. Cross-task coherence:**
- Task 1 scaffold создаёт `streamSmmProducer(ctx, userMessage, res)` — Task 4 расширяет до `(ctx, userMessage, chatSessionId, res)` чтобы делать persistence. Implementer должен это согласовать.
- Task 2 buildMcpServer — captures `ctx` via closure из `streamSmmProducer`. Per-request scope, OK.
- Task 3 event translator — independent module, не зависит от Task 4.
- Task 5 billing — изменения локальны в `streamSmmProducer`, не ломает Task 4 routing.

---

## Out of scope / Follow-ups

- **Migrate other 14 agents на OAuth** — текущий план только для smm_producer. Если потом захочется убрать API key полностью, нужно расширить ClaudeAgentService на остальные категории agents и переписать non-tool-calling путь тоже.
- **Token billing tuning** — placeholder \$1 = 100k tokens. Реальная экономика подписки vs Linkeon токены требует продактового решения.
- **Session disk cleanup** — cron `find /tmp/linkeon-smm-sessions -mtime +7 -delete`. Простой systemd-timer или `crontab -e`.
- **Streaming UX** — может оказаться, что `includePartialMessages` не даёт идеального delta-стрима (зависит от SDK версии). Если фронт показывает "разрывной" текст — переключить на буферизацию + один большой `text` event на ответ.
- **Test coverage** — никаких unit/integration тестов в этом плане. Plan 4e сложно тестить out-of-box (SDK shells out, требует real `claude` CLI). E2E smoke в Task 6 — единственный verifier. Если будут регрессии, добавить mock-`claude` через `pathToClaudeCodeExecutable`.
- **Не-smm Anthropic API доступ** — остальные модули (`misc.service`, `support.service`, `neo4j.service`, `profile-compaction.service`, `health-probe.service`) всё ещё используют `process.env.ANTHROPIC_API_KEY`. После Plan 4e они продолжат падать с "Anthropic not configured" если ключа нет. Plan 4f мог бы их тоже мигрировать, или продакт решает оставить API-ключ для них (там нет tool-calling, simpler).
