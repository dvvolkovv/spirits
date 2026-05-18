# SMM Producer Plan 4f — Claude OAuth Text Helper (claude CLI subprocess) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить direct `anthropic.messages.create()` text-only вызовы на subprocess `claude -p` (OAuth через Claude Max подписку, без `ANTHROPIC_API_KEY`) в 5 простых местах. Самое критичное — `scenario.service.ts`, который сейчас блокирует E2E SMM Producer flow.

**Architecture:** Один общий `ClaudeCliService.text(prompt, opts)` хелпер. Внутри: `child_process.spawn('claude', ['-p', prompt, '--model', model, '--output-format', 'json', '--allowedTools', ''])`, ждём exit, парсим `{result, total_cost_usd}` из stdout JSON. Возвращаем `string` (Claude's text response). Никаких MCP tools — это путь "prompt-in / text-out". Для streaming/multimodal/tool-calling сайтов — отдельные планы (Plan 4f не трогает их).

**Tech Stack:** Node `child_process` (built-in), Claude Code CLI v2.1.97 уже на PROD (`/usr/bin/claude`), OAuth credentials в `~/.claude/.credentials.json` (Plan 4e уже всё это использует).

**End-state demo:**
- В чате с SMM Producer: "Сгенерируй 1 ролик про долги" → Claude tool_use `generate_scenarios` → `ScenarioService.generateScenarios()` вместо direct Anthropic call использует `claudeCli.text(prompt, {system, model})` → возвращает JSON со сценариями → продюсер рендерит как scenario_card → юзер видит ✅
- Profile compaction cron работает через OAuth (вместо тихого фейла без API key)
- Neo4j semantic search работает через OAuth
- Dozvon summary генерация работает через OAuth

---

## Scope

**В скоупе** (5 сайтов):
1. `src/smm/producer/scenario.service.ts:81, 129` — **THE BLOCKER**
2. `src/scheduler/profile-compaction.service.ts:235, 303` — profile compaction cron (2 места)
3. `src/neo4j/neo4j.service.ts:509` — semantic search
4. `src/dozvon/dozvon.service.ts:416` — звонок-сводка
5. `src/support/health-probe.service.ts:119` — replace API-key probe с `claude --version`

**НЕ в скоупе** (отдельный Plan 4g):
- `src/misc/misc.service.ts:753` — streaming чат-completion (требует `--output-format stream-json` + перевод в существующий streaming endpoint)
- `src/chat/chat.controller.ts:257` — PDF/multimodal через `content: [{type:'document', base64}]` (требует `--file` flag + tmp file)
- `src/support/support.service.ts:361` — tool-calling с `tools: SUPPORT_TOOLS` (требует Claude Agent SDK путь как SMM Producer)
- `src/dozvon/dozvon-chat.service.ts:118` — streaming + `web_search` built-in tool (Claude Agent SDK путь)

---

## File Structure

**Создаётся:**
```
spirits_back/
└── src/common/services/
    └── claude-cli.service.ts                # NEW: ClaudeCliService.text() helper
```

**Модифицируется:**
```
spirits_back/
├── src/common/common.module.ts              # register ClaudeCliService
├── src/smm/producer/scenario.service.ts     # replace 2 Anthropic calls
├── src/scheduler/profile-compaction.service.ts  # replace 2 Anthropic calls
├── src/neo4j/neo4j.service.ts               # replace 1 Anthropic call
├── src/dozvon/dozvon.service.ts             # replace 1 Anthropic call
└── src/support/health-probe.service.ts      # replace API-key probe с claude --version
```

---

## Task 1: ClaudeCliService — общий subprocess хелпер

**Files:**
- Create: `src/common/services/claude-cli.service.ts`
- Modify: `src/common/common.module.ts` (register provider + export)

`claude -p <prompt> --output-format json` запускает one-shot interaction с Claude через OAuth, возвращает single JSON object с `{result, total_cost_usd, usage, ...}`. Это идеально для prompt-in/text-out flow.

- [ ] **Step 1.1: Create ClaudeCliService**

```typescript
// src/common/services/claude-cli.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';

export interface ClaudeCliOptions {
  /** System prompt prepended to user message. Concatenated with prompt via SYSTEM marker. */
  system?: string;
  /** Model alias or full name. Defaults to claude-haiku-4-5. */
  model?: string;
  /** Timeout in ms. Default 60_000 (60s). */
  timeoutMs?: number;
}

@Injectable()
export class ClaudeCliService {
  private readonly logger = new Logger(ClaudeCliService.name);
  private readonly claudeBin = process.env.CLAUDE_BIN ?? '/usr/bin/claude';

  /**
   * Run one-shot Claude prompt via OAuth (no API key required).
   * Returns the assistant's text response.
   * Throws on subprocess failure or non-zero exit.
   */
  async text(prompt: string, opts: ClaudeCliOptions = {}): Promise<string> {
    const model = opts.model ?? 'claude-haiku-4-5';
    const timeoutMs = opts.timeoutMs ?? 60_000;

    // Compose final prompt: system + user (claude -p has no separate --system arg)
    const fullPrompt = opts.system
      ? `${opts.system}\n\n---\n\nUSER REQUEST:\n${prompt}`
      : prompt;

    const args = [
      '-p',
      fullPrompt,
      '--model', model,
      '--output-format', 'json',
      '--allowedTools', '',          // disable all built-in tools
      '--disallowedTools', 'all',
    ];

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(this.claudeBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`claude CLI timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout.on('data', (b) => { stdout += b.toString(); });
      proc.stderr.on('data', (b) => { stderr += b.toString(); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          this.logger.error(`claude CLI exit ${code}: ${stderr.slice(0, 400)}`);
          reject(new Error(`claude CLI exited with code ${code}: ${stderr.slice(0, 200)}`));
          return;
        }
        try {
          const json = JSON.parse(stdout);
          if (json.is_error) {
            reject(new Error(`claude CLI error: ${json.result ?? 'unknown'}`));
            return;
          }
          const text: string = json.result ?? '';
          if (json.total_cost_usd) {
            this.logger.debug(`claude CLI cost: $${json.total_cost_usd.toFixed(4)}, ${json.duration_ms}ms`);
          }
          resolve(text);
        } catch (e: any) {
          this.logger.error(`claude CLI parse error: ${e.message}, stdout: ${stdout.slice(0, 200)}`);
          reject(new Error(`claude CLI returned invalid JSON: ${e.message}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`claude CLI spawn error: ${err.message}`));
      });
    });
  }
}
```

- [ ] **Step 1.2: Register in CommonModule**

Open `src/common/common.module.ts`. Add to providers + exports:
```typescript
import { ClaudeCliService } from './services/claude-cli.service';

// In @Module:
providers: [..., ClaudeCliService],
exports: [..., ClaudeCliService],
```

- [ ] **Step 1.3: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
rm -rf dist && npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 1.4: Local smoke test against PROD (read-only)**

```bash
ssh dvolkov@212.113.106.202 'cd /tmp && cat > cli-test.mjs <<EOF
import { spawn } from "child_process";
const proc = spawn("/usr/bin/claude", ["-p", "Reply just OK", "--model", "claude-haiku-4-5", "--output-format", "json", "--allowedTools", "", "--disallowedTools", "all"], { stdio: ["ignore", "pipe", "pipe"] });
let out = ""; proc.stdout.on("data", b => out += b.toString());
proc.on("close", code => {
  console.log("exit:", code);
  try { console.log("result:", JSON.parse(out).result); } catch { console.log("raw:", out.slice(0, 200)); }
});
EOF
node cli-test.mjs'
```

Expected: `exit: 0, result: OK` за ~1.5 секунды.

- [ ] **Step 1.5: Commit**

```bash
git add src/common/services/claude-cli.service.ts src/common/common.module.ts
git -c commit.gpgsign=false commit -m "feat(common): ClaudeCliService — claude CLI subprocess wrapper (Plan 4f Task 1)

text(prompt, opts) spawns 'claude -p ... --output-format json' и
возвращает result. Все built-in tools отключены. OAuth через
~/.claude/.credentials.json (Plan 4e). Заменяет direct
anthropic.messages.create() в text-only сайтах.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migrate ScenarioService (THE BLOCKER)

**Files:**
- Modify: `src/smm/producer/scenario.service.ts`

ScenarioService имеет 2 места которые зовут Anthropic:
- `generateScenarios()` line ~81 — генерация N сценариев из user-msg + system
- `regenerateScenario()` line ~129 — переделка одного сценария

Оба возвращают JSON массив/объект, который потом парсится `extractJson(text)`.

- [ ] **Step 2.1: Inject ClaudeCliService**

Open `src/smm/producer/scenario.service.ts`. В constructor добавь:
```typescript
import { ClaudeCliService } from '../../common/services/claude-cli.service';

constructor(
  // existing deps...
  private readonly claudeCli: ClaudeCliService,
) { /* existing body */ }
```

- [ ] **Step 2.2: Replace both anthropic.messages.create calls**

Найди первое место (line ~81):
```typescript
const resp = await this.anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 4000,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userMsg }],
});
const textBlock = (resp.content as any[]).find((b) => b.type === 'text');
if (!textBlock) throw new Error('Claude returned no text block');
const text = (textBlock.text as string).trim();
```

ЗАМЕНИ на:
```typescript
const text = (await this.claudeCli.text(userMsg, {
  system: SYSTEM_PROMPT,
  model: 'claude-haiku-4-5',
})).trim();
if (!text) throw new Error('Claude returned empty text');
```

Найди второе место (line ~129):
```typescript
const resp = await this.anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 4000,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userMsg }],
});
const textBlock = (resp.content as any[]).find((b) => b.type === 'text');
if (!textBlock) throw new Error('Claude returned no text block on regen');
```

ЗАМЕНИ на:
```typescript
const text = (await this.claudeCli.text(userMsg, {
  system: SYSTEM_PROMPT,
  model: 'claude-haiku-4-5',
})).trim();
if (!text) throw new Error('Claude returned empty text on regen');
```

Будь careful — после второй замены может быть строка `const text = (textBlock.text as string).trim();` уже не нужна (если структура была `if (!textBlock) throw; const text = ...`). Удали обе устаревшие строки.

- [ ] **Step 2.3: Remove anthropic field if no longer used**

После замены проверь:
```bash
grep -n "this.anthropic\|process.env.ANTHROPIC_API_KEY\|new Anthropic" src/smm/producer/scenario.service.ts
```

Если `this.anthropic` больше нигде не используется в файле — убери `private anthropic: Anthropic;` field и init code в constructor. Import `Anthropic` тоже убрать если не используется.

- [ ] **Step 2.4: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 2.5: Commit**

```bash
git add src/smm/producer/scenario.service.ts
git -c commit.gpgsign=false commit -m "feat(smm): ScenarioService через Claude OAuth (Plan 4f Task 2)

generateScenarios() и regenerateScenario() заменили
direct anthropic.messages.create() на claudeCli.text(userMsg, {system}).
Это unblock'ает E2E SMM Producer — теперь generate_scenarios
tool работает без ANTHROPIC_API_KEY (через Claude Max OAuth).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Migrate profile-compaction + neo4j + dozvon

Параллельные простые миграции — все следуют тому же паттерну.

**Files:**
- Modify: `src/scheduler/profile-compaction.service.ts` (2 места)
- Modify: `src/neo4j/neo4j.service.ts` (1 место)
- Modify: `src/dozvon/dozvon.service.ts` (1 место)

- [ ] **Step 3.1: profile-compaction.service.ts**

Find the two `client.messages.create({...})` blocks (lines ~232-241 and ~300-309). Both have the shape:
```typescript
if (anthropicKey) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: anthropicKey });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: X,
    messages: [{ role: 'user', content: prompt }],
  });
  content = msg.content?.[0]?.text || null;
}
```

Replace EACH block with:
```typescript
try {
  content = await this.claudeCli.text(prompt, { model: 'claude-haiku-4-5' });
} catch (e: any) {
  this.logger.warn(`claude CLI failed in profile-compaction: ${e.message}`);
  content = null;
}
```

Inject `ClaudeCliService` in the constructor:
```typescript
import { ClaudeCliService } from '../common/services/claude-cli.service';

constructor(
  // existing...
  private readonly claudeCli: ClaudeCliService,
) {}
```

Remove the `const anthropicKey = process.env.ANTHROPIC_API_KEY;` line + the `else if (orKey) {...}` OpenRouter fallback if you want simplification (or keep the fallback if it's still useful for other env scenarios).

Recommended: keep OpenRouter fallback in case `claude` is not on PATH. Just change the primary branch:
```typescript
// OLD: if (anthropicKey) { ... new Anthropic ... } else if (orKey) { ... }
// NEW:
try {
  content = await this.claudeCli.text(prompt, { model: 'claude-haiku-4-5' });
} catch {
  // Fallback to OpenRouter
  if (orKey) { /* existing block */ }
}
```

- [ ] **Step 3.2: neo4j.service.ts**

Same pattern — find the `if (anthropicKey) { ... client.messages.create({...}) ... }` block at line ~506-514. Replace primary branch with `claudeCli.text(prompt, {model: 'claude-haiku-4-5'})`. Keep OpenRouter fallback.

Inject `ClaudeCliService` in constructor.

- [ ] **Step 3.3: dozvon.service.ts**

Find line ~416:
```typescript
const msg = await this.anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 512,
  messages: [{
    role: 'user',
    content: `Составь краткое резюме результатов звонков:\n${lines}\n\nВерни JSON: ...`,
  }],
});
const text = (msg.content[0] as any).text;
```

Replace with:
```typescript
const prompt = `Составь краткое резюме результатов звонков:\n${lines}\n\nВерни JSON: {"text":"...", "success_count":N, "failed_count":N}`;
const text = await this.claudeCli.text(prompt, { model: 'claude-haiku-4-5' });
```

Inject `ClaudeCliService` in constructor.

Then check if `this.anthropic` field is used elsewhere in the file — `grep -n "this.anthropic" src/dozvon/dozvon.service.ts`. If not, remove the `private readonly anthropic = new Anthropic({...})` field declaration + `Anthropic` import.

- [ ] **Step 3.4: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 3.5: Commit**

```bash
git add src/scheduler/profile-compaction.service.ts \
        src/neo4j/neo4j.service.ts \
        src/dozvon/dozvon.service.ts
git -c commit.gpgsign=false commit -m "feat: profile-compaction + neo4j + dozvon через Claude OAuth (Plan 4f Task 3)

3 простые text-only миграции с direct Anthropic SDK на ClaudeCliService:
  - profile-compaction.service.ts: 2 места (cron-based summarization)
  - neo4j.service.ts: 1 место (semantic search prompt)
  - dozvon.service.ts: 1 место (call summary)

OpenRouter fallback сохранён (на случай если claude CLI не в PATH).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Adapt health-probe для OAuth check

**Files:**
- Modify: `src/support/health-probe.service.ts`

Текущий `probeAnthropic()` делает `GET /v1/models` с `x-api-key` header'ом. Без API key — статус 'unknown'. После Plan 4f мы можем заменить на проверку `claude --version` exit code.

- [ ] **Step 4.1: Replace probeAnthropic**

Find `probeAnthropic()` method (line ~117). Replace its body with subprocess check:

```typescript
  private async probeAnthropic(): Promise<ProbeResult> {
    const t0 = Date.now();
    return new Promise<ProbeResult>((resolve) => {
      const proc = require('child_process').spawn('/usr/bin/claude', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      proc.stdout.on('data', (b: Buffer) => { out += b.toString(); });
      proc.on('close', (code: number) => {
        const lat = Date.now() - t0;
        if (code === 0) {
          resolve({
            service: 'anthropic',
            status: 'healthy',
            latencyMs: lat,
            lastError: null,
            details: `claude CLI ${out.trim()}`,
          });
        } else {
          resolve({
            service: 'anthropic',
            status: 'unhealthy',
            latencyMs: lat,
            lastError: `claude --version exit ${code}`,
          });
        }
      });
      proc.on('error', (err: Error) => {
        resolve({
          service: 'anthropic',
          status: 'unhealthy',
          latencyMs: Date.now() - t0,
          lastError: err.message,
        });
      });
    });
  }
```

If `ProbeResult.details` field doesn't exist on the type, drop the `details:` line. Match existing return shape exactly.

- [ ] **Step 4.2: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
```

- [ ] **Step 4.3: Commit**

```bash
git add src/support/health-probe.service.ts
git -c commit.gpgsign=false commit -m "feat(support): health-probe проверяет claude CLI вместо API key (Plan 4f Task 4)

probeAnthropic() заменён с GET /v1/models (требовал API key) на
'claude --version' subprocess. Теперь health-probe работает с OAuth
(если claude CLI в PATH и авторизован — healthy).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Deploy + E2E smoke (full SMM Producer flow)

**Files:** (deploy only)

- [ ] **Step 5.1: Merge worktree → b2b**

```bash
cd /Users/dmitry/Downloads/spirits_back
git checkout b2b
git pull --ff-only 2>&1 | tail -3 || true
git merge --no-ff <plan-4f-branch> -m "Merge Plan 4f: Claude OAuth text helper for 5 text-only sites"
git push origin b2b 2>&1 | tail -3
```

- [ ] **Step 5.2: Deploy + restart**

```bash
rsync -az --timeout=30 \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' \
  --exclude='.worktrees/' --exclude='.env' \
  --exclude='tests/node_modules/' --exclude='public/generated/' \
  --exclude='worker/node_modules' --exclude='worker/dist' \
  ~/Downloads/spirits_back/ dvolkov@212.113.106.202:/home/dvolkov/spirits_back/

ssh dvolkov@212.113.106.202 'cd ~/spirits_back && npm run build 2>&1 | tail -3 && pm2 restart linkeon-api && sleep 6 && pm2 list | head -7'
```

- [ ] **Step 5.3: E2E smoke — chat → generate → approve → render → publish to Telegram**

```bash
# Get fresh JWT via SMS+Redis
curl -sf "https://my.linkeon.io/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/79030169187" >/dev/null
sleep 1
CODE=$(ssh dvolkov@212.113.106.202 'docker exec redis redis-cli GET "sc-79030169187"')
JWT=$(curl -s "https://my.linkeon.io/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/79030169187/$CODE" | jq -r '."access-token"')
echo "JWT len: ${#JWT}"

# Step A: generate scenario through chat
echo "--- A: generate scenario ---"
curl -sN --max-time 120 -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"assistantId":15, "message":"Сгенерируй 1 короткий ролик про долги"}' \
  "https://my.linkeon.io/webhook/soulmate/chat" 2>&1 > /tmp/chat-gen.log
cat /tmp/chat-gen.log | jq -c 'select(.type == "tool_result")' | head -3
SCENARIO_ID=$(cat /tmp/chat-gen.log | jq -r 'select(.type == "tool_result" and .tool == "generate_scenarios") | .result.scenarios[0].id' | head -1)
echo "Scenario ID: $SCENARIO_ID"

# Step B: approve scenario → kicks render
echo "--- B: approve scenario ---"
APPROVE=$(curl -s -X POST -H "Authorization: Bearer $JWT" \
  "https://my.linkeon.io/webhook/smm/scenarios/$SCENARIO_ID/approve")
echo "$APPROVE" | jq '.'
VIDEO_ID=$(echo "$APPROVE" | jq -r '.approved[0].videoId')
echo "Video ID: $VIDEO_ID"

# Step C: wait for render (~75s)
echo "--- C: waiting for render ---"
for i in $(seq 1 12); do
  STATUS=$(ssh dvolkov@212.113.106.202 "PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -tA -c \"SELECT status FROM smm_video WHERE id='$VIDEO_ID'\"")
  echo "[$i] status=$STATUS"
  if [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 8
done

# Step D: approve video + publish through chat
echo "--- D: approve + publish to Telegram ---"
curl -sN --max-time 60 -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d "{\"assistantId\":15, \"message\":\"Подтверди ролик $VIDEO_ID и опубликуй в Telegram прямо сейчас\"}" \
  "https://my.linkeon.io/webhook/soulmate/chat" 2>&1 > /tmp/chat-publish.log
cat /tmp/chat-publish.log | jq -c 'select(.type == "tool_start" or .type == "tool_result")' | head -10

# Step E: wait ~10 sec for worker to pick up the publish job, check publication status
sleep 10
ssh dvolkov@212.113.106.202 'PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -c "SELECT status, external_url, error_message FROM smm_publication ORDER BY created_at DESC LIMIT 3"'
```

Expected:
- A: `tool_result.result.scenarios[0].id` present
- B: `approved[0].videoId` returned
- C: status goes to `ready` within ~75 sec
- D: `tool_start: approve_video`, `tool_result: approve_video {ok:true}`, `tool_start: schedule_publication`, `tool_result: schedule_publication {scheduled: [...]}`
- E: publication row with `status='published'` + `external_url` to t.me post

Verify the post in Telegram channel. If yes — Plan 4f end-to-end ✅.

- [ ] **Step 5.4: Tag release**

```bash
cd /Users/dmitry/Downloads/spirits_back
git tag -a smm-plan-4f-deployed -m "Plan 4f (Claude OAuth text helper) deployed to PROD

5 простых text-only сайтов мигрированы с direct Anthropic SDK на
ClaudeCliService.text() через subprocess 'claude -p ... --output-format json'.
Все используют Claude Max OAuth (~/.claude/.credentials.json).

Сайты:
  - scenario.service.ts (generate_scenarios + regenerate)
  - profile-compaction.service.ts (2 places, cron)
  - neo4j.service.ts (semantic search)
  - dozvon.service.ts (call summary)
  - health-probe.service.ts (probe via claude --version)

E2E подтверждено: чат → generate_scenarios → approve → render →
schedule_publication → реальный пост в TG.

Out-of-scope (Plan 4g):
  - misc.service.ts streaming
  - chat.controller.ts PDF/multimodal
  - support.service.ts tool-calling
  - dozvon-chat.service.ts streaming+websearch"
git push origin smm-plan-4f-deployed
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ClaudeCliService.text() helper — ✓ Task 1
- ScenarioService migration (unblocks E2E) — ✓ Task 2
- profile-compaction × 2 — ✓ Task 3
- neo4j semantic search — ✓ Task 3
- dozvon summary — ✓ Task 3
- health-probe → claude --version — ✓ Task 4
- E2E smoke full flow — ✓ Task 5

**2. Placeholder scan:** каждый step имеет конкретный код / команды.

**3. Type consistency:**
- `ClaudeCliService.text(prompt, opts): Promise<string>` — single signature, used identically in all 5 sites
- Helper handles errors (timeout, non-zero exit, parse failure) — each site decides how to react (throw / fallback / log)
- `--allowedTools ''` + `--disallowedTools all` — double-secure that built-in tools off (`claude --help`: --allowedTools '' means "none allowed", --disallowedTools 'all' is a sentinel)

**4. Known risks / mitigations:**
- **claude CLI not in PATH** — `CLAUDE_BIN` env override + default `/usr/bin/claude`. На PROD проверено.
- **OAuth expired** — `~/.claude/.credentials.json.expiresAt` далеко в будущем (Claude Max), но в принципе может истечь. **Mitigation:** subprocess вернёт non-zero exit → service throws → каждый caller гасит ошибку (try/catch с warn log или fallback на OpenRouter).
- **Subprocess overhead** — каждый вызов spawn'ит новый `claude` процесс (~50-200ms startup + Claude inference time). Это нормально для редких вызовов (cron, scenario gen) но не для high-QPS. SMM Producer chat-loop уже использует persistent subprocess через Claude Agent SDK (Plan 4e), так что не пересекается.
- **Concurrency** — 2+ одновременных subprocess'ов могут спорить за rate-limit одной OAuth-подписки. **Mitigation:** Claude Max имеет high rate-limit (>5/min). Если упрёмся — добавить queue.

**5. Cross-task coherence:**
- Task 1 создаёт ClaudeCliService
- Tasks 2-4 инжектят и используют — все по одному паттерну
- Task 5 проверяет всё вместе через E2E

---

## Out of scope / Follow-ups (Plan 4g)

- **misc.service.ts** streaming через `claude -p --output-format stream-json` — нужен подкат под NDJSON стрим
- **chat.controller.ts** PDF/multimodal — `--file path:file_id` flag claude CLI
- **support.service.ts** tool-calling — Claude Agent SDK с SUPPORT_TOOLS как MCP (по образцу SMM Producer)
- **dozvon-chat.service.ts** streaming + web_search — Claude Agent SDK с включённым WebSearch built-in
- **Concurrency limit** — semaphore вокруг ClaudeCliService.text() если упрёмся в rate-limit
