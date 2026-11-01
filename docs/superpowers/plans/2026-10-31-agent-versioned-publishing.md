# Agent Versioned Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать администратору полный безопасный цикл изменения ассистента: черновик, diff, изолированный тест, публикация и откат с полной историей.

**Architecture:** `agents` остаётся действующей конфигурацией, а `agent_versions` хранит append-only ревизии. Публикация атомарна на выделенном PostgreSQL-клиенте; AI-тест использует `ChatService.agentReply` с override промпта, без профиля и истории. Frontend разделён на API-клиент, diff, редактор и тестовый чат.

**Tech Stack:** NestJS 10, PostgreSQL, TypeScript, React 18, Vitest, Jest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-31-agent-versioned-publishing-design.md`

---

## File map

Backend:

- Create `src/agents/migrations/008_agent_versions.sql` — схема и bootstrap версий.
- Create `src/agents/agent-versions.service.ts` — чтение, черновики, публикация, тест.
- Create `src/agents/agent-versions.service.spec.ts` — unit-контракт и конкуренция.
- Create `src/agents/agent-versions.controller.ts` — admin-only HTTP API.
- Create `src/agents/agent-versions.controller.spec.ts` — guards и делегирование.
- Modify `src/agents/agents.module.ts` — регистрация и `ChatModule`.
- Modify `src/agents/agents.service.ts` — legacy save только через версии.
- Modify `src/chat/chat.service.ts` — override промпта, отключение контекста и запись списания.
- Create `src/chat/chat.service.agent-version-test.spec.ts` — изоляция и биллинг.
- Create `tests/agent-versions.e2e.mjs` — реальный полный сценарий на test-стенде.

Frontend:

- Create `src/services/agentVersionsApi.ts` — типы и HTTP-клиент.
- Create `src/components/admin/assistants/lineDiff.ts` — LCS line diff без новой зависимости.
- Create `src/components/admin/assistants/lineDiff.test.ts` — граничные случаи diff.
- Create `src/components/admin/assistants/AgentVersionEditor.tsx` — режимы, diff, история, защита правок.
- Create `src/components/admin/assistants/AgentTestChat.tsx` — изолированный диалог.
- Create `src/components/admin/assistants/AgentVersionEditor.test.tsx` — видимые пользовательские сценарии.
- Modify `src/components/admin/AdminAssistantsView.tsx` — список агентов и подключение редактора.

---

### Task 1: Схема версий и создание черновиков

**Files:**
- Create: `src/agents/migrations/008_agent_versions.sql`
- Create: `src/agents/agent-versions.service.ts`
- Create: `src/agents/agent-versions.service.spec.ts`

- [ ] **Step 1: Написать падающий тест создания черновика и конфликта базы**

```ts
import { AgentVersionsService } from './agent-versions.service';

const live = {
  id: '11111111-1111-1111-1111-111111111111', agent_id: 12, version: 1,
  description: 'old', system_prompt: 'live', status: 'published',
  base_version_id: null, created_by: 'seed', created_at: '2026-10-31', published_at: '2026-10-31',
};

function harness() {
  const pg = { query: jest.fn() };
  const chat = { testAgentVersion: jest.fn() };
  const svc = new AgentVersionsService(pg as any, chat as any);
  return { svc, pg };
}

describe('AgentVersionsService drafts', () => {
  it('creates the next draft from the latest version', async () => {
    const { svc, pg } = harness();
    pg.query.mockResolvedValueOnce({ rows: [live] }).mockResolvedValueOnce({
      rows: [{ ...live, id: '22222222-2222-2222-2222-222222222222', version: 2, status: 'draft', description: 'new', system_prompt: 'draft' }],
    });
    const result = await svc.createDraft('admin', 12, {
      description: 'new', system_prompt: 'draft', base_version_id: live.id,
    });
    expect(result.version).toBe(2);
    expect(result.status).toBe('draft');
    expect(pg.query.mock.calls[1][1]).toEqual([
      12, 'new', 'draft', live.id, 'admin', 2,
    ]);
  });

  it('rejects a stale base without inserting', async () => {
    const { svc, pg } = harness();
    pg.query.mockResolvedValueOnce({ rows: [] });
    await expect(svc.createDraft('admin', 12, {
      description: 'new', system_prompt: 'draft', base_version_id: live.id,
    })).rejects.toMatchObject({ response: { status: 409 } });
    expect(pg.query).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Запушить тест и убедиться в FAIL на CI**

```bash
git add src/agents/agent-versions.service.spec.ts
git commit -m "test: зафиксировать создание черновиков ассистентов"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npm ci && npx jest src/agents/agent-versions.service.spec.ts --maxWorkers=2"
```

Expected: FAIL — `AgentVersionsService` не найден.

- [ ] **Step 3: Добавить миграцию**

```sql
CREATE TABLE IF NOT EXISTS agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id integer NOT NULL REFERENCES agents(id),
  version integer NOT NULL,
  description text NOT NULL DEFAULT '',
  system_prompt text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('draft', 'published', 'superseded')),
  base_version_id uuid REFERENCES agent_versions(id),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  published_by text,
  UNIQUE (agent_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_versions_one_published
  ON agent_versions(agent_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS agent_versions_recent
  ON agent_versions(agent_id, version DESC);

INSERT INTO agent_versions
  (agent_id, version, description, system_prompt, status, created_by, published_at, published_by)
SELECT id, 1, description, system_prompt, 'published', 'migration-008', now(), 'migration-008'
FROM agents
WHERE NOT EXISTS (SELECT 1 FROM agent_versions WHERE agent_id = agents.id);
```

- [ ] **Step 4: Реализовать типы, bootstrap, state и createDraft**

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PgService } from '../common/services/pg.service';
import { ChatService } from '../chat/chat.service';

export type AgentVersionStatus = 'draft' | 'published' | 'superseded';
export interface AgentVersion {
  id: string;
  agent_id: number;
  version: number;
  description: string;
  system_prompt: string;
  status: AgentVersionStatus;
  base_version_id: string | null;
  created_by: string;
  created_at: string;
  published_at: string | null;
  published_by: string | null;
}

@Injectable()
export class AgentVersionsService implements OnModuleInit {
  constructor(private readonly pg: PgService, private readonly chat: ChatService) {}

  async onModuleInit(): Promise<void> {
    const candidates = [
      path.join(__dirname, 'migrations', '008_agent_versions.sql'),
      path.join(__dirname, '..', '..', 'src', 'agents', 'migrations', '008_agent_versions.sql'),
    ];
    const file = candidates.find((candidate) => fs.existsSync(candidate));
    if (!file) throw new Error('agent versions migration not found');
    await this.pg.query(fs.readFileSync(file, 'utf8'));
  }

  async latest(agentId: number): Promise<AgentVersion | null> {
    const r = await this.pg.query(
      'SELECT * FROM agent_versions WHERE agent_id = $1 ORDER BY version DESC LIMIT 1',
      [agentId],
    );
    return r.rows[0] || null;
  }

  async createDraft(actor: string, agentId: number, input: {
    description: string; system_prompt: string; base_version_id: string;
  }): Promise<AgentVersion> {
    const description = String(input.description || '').trim();
    const prompt = String(input.system_prompt || '').trim();
    if (!prompt || prompt.length > 200000 || description.length > 5000) {
      throw new BadRequestException('invalid agent version');
    }
    const base = await this.latest(agentId);
    if (!base || base.id !== input.base_version_id) {
      throw new ConflictException('agent version changed');
    }
    const r = await this.pg.query(
      `INSERT INTO agent_versions
        (agent_id, description, system_prompt, status, base_version_id, created_by, version)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6)
       RETURNING *`,
      [agentId, description, prompt, base.id, actor, base.version + 1],
    );
    return r.rows[0];
  }
}
```

- [ ] **Step 5: Запушить реализацию и получить PASS**

```bash
git add src/agents/migrations/008_agent_versions.sql src/agents/agent-versions.service.ts
git commit -m "feat: добавить версии и черновики ассистентов"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/agents/agent-versions.service.spec.ts --maxWorkers=2"
```

Expected: 2 PASS.

---

### Task 2: State, история и атомарная публикация

**Files:**
- Modify: `src/agents/agent-versions.service.ts`
- Modify: `src/agents/agent-versions.service.spec.ts`

- [ ] **Step 1: Добавить failing tests публикации, отката и rollback транзакции**

```ts
it('publishes a draft and supersedes the live version on one client', async () => {
  const { svc, pg } = harness();
  const client = { query: jest.fn(), release: jest.fn() };
  pg.getClient = jest.fn().mockResolvedValue(client);
  pg.query.mockResolvedValueOnce({ rows: [{ ...live, id: 'draft-id', version: 2, status: 'draft' }] });
  client.query
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [live] })
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: [{ ...live, id: 'draft-id', status: 'published', published_by: 'admin' }] })
    .mockResolvedValueOnce({});
  const result = await svc.publish('admin', 12, 'draft-id', live.id);
  expect(result.status).toBe('published');
  expect(result.published_by).toBe('admin');
  expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
    'BEGIN',
    'SELECT * FROM agent_versions WHERE agent_id = $1 AND status = \'published\' FOR UPDATE',
    'COMMIT',
  ].filter((sql) => ['BEGIN', 'COMMIT'].includes(sql)));
  expect(client.release).toHaveBeenCalled();
});

it('returns 409 when the live version changed and rolls back', async () => {
  const { svc, pg } = harness();
  const client = { query: jest.fn(), release: jest.fn() };
  pg.getClient = jest.fn().mockResolvedValue(client);
  pg.query.mockResolvedValueOnce({ rows: [{ ...live, id: 'draft-id', version: 2, status: 'draft' }] });
  client.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] });
  await expect(svc.publish('admin', 12, 'draft-id', live.id)).rejects.toMatchObject({ response: { status: 409 } });
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(client.release).toHaveBeenCalled();
});
```

Тест публикации дополнительно проверяет, что SQL `UPDATE agent_versions SET status = 'superseded'` вызван с id прежней live-версии, а `UPDATE agents` — с текстом черновика.

- [ ] **Step 2: Запушить тесты и подтвердить FAIL**

```bash
git add src/agents/agent-versions.service.spec.ts
git commit -m "test: покрыть атомарную публикацию версий"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/agents/agent-versions.service.spec.ts --maxWorkers=2"
```

Expected: FAIL — `publish` отсутствует.

- [ ] **Step 3: Реализовать state/list/get/publish**

```ts
async getVersion(agentId: number, versionId: string): Promise<AgentVersion> {
  const r = await this.pg.query('SELECT * FROM agent_versions WHERE id = $1 AND agent_id = $2', [versionId, agentId]);
  if (!r.rows[0]) throw new NotFoundException('agent version not found');
  return r.rows[0];
}

async listVersions(agentId: number, limit = 50): Promise<AgentVersion[]> {
  const capped = Math.min(Math.max(limit, 1), 50);
  const r = await this.pg.query(
    'SELECT * FROM agent_versions WHERE agent_id = $1 ORDER BY version DESC LIMIT $2',
    [agentId, capped],
  );
  return r.rows;
}

async getState(agentId: number): Promise<{ published: AgentVersion | null; draft: AgentVersion | null }> {
  const [published, draft] = await Promise.all([
    this.pg.query("SELECT * FROM agent_versions WHERE agent_id = $1 AND status = 'published' LIMIT 1", [agentId]),
    this.pg.query("SELECT * FROM agent_versions WHERE agent_id = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1", [agentId]),
  ]);
  return {
    published: published.rows[0] || null,
    draft: draft.rows[0] || null,
  };
}

async publish(actor: string, agentId: number, versionId: string, expectedPublishedId: string): Promise<AgentVersion> {
  const draft = await this.getVersion(agentId, versionId);
  if (draft.status !== 'draft') throw new ConflictException('version is not a draft');
  const client = await this.pg.getClient();
  let committed = false;
  try {
    await client.query('BEGIN');
    const live = await client.query(
      "SELECT * FROM agent_versions WHERE agent_id = $1 AND status = 'published' FOR UPDATE",
      [agentId],
    );
    if (live.rows[0]?.id !== expectedPublishedId) {
      throw new ConflictException('published version changed');
    }
    if (live.rows[0]) {
      await client.query(
        "UPDATE agent_versions SET status = 'superseded' WHERE id = $1",
        [live.rows[0].id],
      );
    }
    const published = await client.query(
      "UPDATE agent_versions SET status = 'published', published_at = now(), published_by = $2 WHERE id = $1 RETURNING *",
      [versionId, actor],
    );
    await client.query(
      'UPDATE agents SET description = $1, system_prompt = $2 WHERE id = $3',
      [draft.description, draft.system_prompt, agentId],
    );
    await client.query('COMMIT');
    committed = true;
    return published.rows[0];
  } catch (error) {
    if (!committed) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Запушить реализацию и получить PASS**

```bash
git add src/agents/agent-versions.service.ts src/agents/agent-versions.service.spec.ts
git commit -m "feat: публиковать версии ассистентов атомарно"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/agents/agent-versions.service.spec.ts --maxWorkers=2"
```

Expected: все tests PASS, включая `ROLLBACK` при конфликте.

---

### Task 3: Изолированный AI-тест с тарификацией

**Files:**
- Modify: `src/chat/chat.service.ts`
- Create: `src/chat/chat.service.agent-version-test.spec.ts`
- Modify: `src/agents/agent-versions.service.ts`

- [ ] **Step 1: Написать failing test override и отсутствия пользовательского контекста**

```ts
import { Readable } from 'stream';
import axios from 'axios';
import { ChatService } from './chat.service';

jest.mock('axios');
jest.mock('../common/telegram-alert', () => ({
  sendTelegramAlert: jest.fn(async () => {}),
  sendTelegramPayload: jest.fn(async () => {}),
}));

function sseStream(events: any[]): Readable {
  const stream = new Readable({ read() {} });
  process.nextTick(() => {
    for (const event of events) stream.push(`data: ${JSON.stringify(event)}\n`);
    stream.push(null);
  });
  return stream;
}

function fieldsOf(fd: any): Record<string, string> {
  const boundary = fd.getBoundary();
  const raw = fd.getBuffer().toString('utf8');
  const out: Record<string, string> = {};
  for (const part of raw.split(`--${boundary}`)) {
    const name = /name="([^"]+)"/.exec(part);
    const head = part.indexOf('\r\n\r\n');
    if (!name || head < 0) continue;
    out[name[1]] = part.slice(head + 4).replace(/\r\n$/, '');
  }
  return out;
}

describe('agent version test reply', () => {
  it('uses the draft prompt without user context or Linkeon tools', async () => {
    const agent = { id: 12, name: 'Роман', display_name: 'Роман', description: '', system_prompt: 'LIVE', category: 'business' };
    const pg = { query: jest.fn(async (sql: string) => /FROM agents WHERE id/.test(sql) ? { rows: [agent] } : { rows: [] }) };
    const language = { resolveUserLanguage: jest.fn(async () => 'ru') };
    const svc = new ChatService(pg as any, null as any, null as any, null as any, language as any, undefined, undefined, undefined, undefined);
    const post = axios.post as jest.Mock;
    post.mockImplementation(async () => ({ data: sseStream([{ type: 'delta', text: 'ок' }, { type: 'done' }]) }));

    const reply = await svc.generateAgentReplyWithCharge('admin', '12', 'Проверка', 'agent_test_admin', {
      systemPromptOverride: 'ЧЕРНОВИК: отвечай коротко',
      includeUserContext: false,
      linkeonTools: false,
    });

    expect(reply.text).toBe('ок');
    const fields = fieldsOf(post.mock.calls[0][1]);
    expect(fields.systemPrompt).toContain('ЧЕРНОВИК: отвечай коротко');
    expect(fields.systemPrompt).not.toContain('User profile:');
    for (const key of ['linkeon_token', 'linkeon_mcp_url', 'fs_key']) {
      expect(fields[key]).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Запушить тест и получить FAIL**

```bash
git add src/chat/chat.service.agent-version-test.spec.ts
git commit -m "test: изолировать проверку промптов ассистентов"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/chat/chat.service.agent-version-test.spec.ts --maxWorkers=2"
```

Expected: FAIL — поля `systemPromptOverride` и `includeUserContext` не поддержаны.

- [ ] **Step 3: Расширить AgentReplyOpts и agentReply**

```ts
export interface AgentReplyOpts {
  linkeonTools?: boolean;
  systemPromptOverride?: string;
  includeUserContext?: boolean;
}
```

В `agentReply`:

```ts
if (opts.systemPromptOverride !== undefined) {
  stablePrefix += `--- Тестируемая версия ассистента ${agentName} ---\n${opts.systemPromptOverride.trim()}\n\n`;
} else if (agent.system_prompt && agent.system_prompt.trim()) {
  stablePrefix += `--- Персона и инструкции ассистента ${agentName} ---\n${agent.system_prompt.trim()}\n\n`;
}

if (opts.includeUserContext !== false) {
  if (profileText.trim()) stablePrefix += `User profile:\n${profileText}\n\n`;
  if (this.businessProfile) {
    const biz = await this.businessProfile.renderForPrompt(userId, agent.category);
    if (biz) stablePrefix += `${biz}\n\n`;
  }
}
```

До построения `profileText` добавить:

```ts
if (opts.includeUserContext === false) profileText = '';
```

Не вызывать `neo4j.getProfileDescription` и `businessProfile.renderForPrompt`, когда `includeUserContext === false`. Существующие вызовы без новых полей сохраняют прежнее поведение.

Добавить публичную запись списания:

```ts
async recordAgentVersionTestCharge(userId: string, assistantId: string, charge: {
  tokens: number; costUsd: number;
}, replyChars: number): Promise<void> {
  await this.addTokenTask(userId, 0, charge.tokens, assistantId, {
    costUsd: Number(charge.costUsd.toFixed(4)),
    source: 'cost',
    durationMs: 0,
    replyChars,
  });
}
```

В `AgentVersionsService` добавить:

```ts
async testVersion(actor: string, agentId: number, versionId: string, message: string, sessionId?: string) {
  const version = await this.getVersion(agentId, versionId);
  const text = String(message || '').trim();
  if (!text || text.length > 12000) throw new BadRequestException('invalid test message');
  const testSession = sessionId || `agent_test_${actor}_${createHash('sha256').update(`${agentId}:${versionId}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 32)}`;
  if (!/^agent_test_[A-Za-z0-9_-]{1,80}$/.test(testSession)) throw new BadRequestException('invalid test session');
  const result = await this.chat.generateAgentReplyWithCharge(actor, String(agentId), text, testSession, {
    systemPromptOverride: version.system_prompt,
    includeUserContext: false,
    linkeonTools: false,
  });
  await this.chat.recordAgentVersionTestCharge(actor, String(agentId), result, result.text.length);
  return { text: result.text, session_id: testSession, tokens: result.tokens };
}
```

- [ ] **Step 4: Запушить реализацию и получить PASS**

```bash
git add src/chat/chat.service.ts src/agents/agent-versions.service.ts
git commit -m "feat: тестировать версии ассистентов изолированно"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/chat/chat.service.agent-version-test.spec.ts src/agents/agent-versions.service.spec.ts --maxWorkers=2"
```

Expected: все tests PASS; профиль и Linkeon tools не вызываются, списание записано.

---

### Task 4: Admin API и совместимость legacy save

**Files:**
- Create: `src/agents/agent-versions.controller.ts`
- Create: `src/agents/agent-versions.controller.spec.ts`
- Create: `src/agents/agents.service.spec.ts`
- Modify: `src/agents/agents.module.ts`
- Modify: `src/agents/agents.service.ts`
- Modify: `src/agents/agents.controller.ts`

- [ ] **Step 1: Написать failing tests контроллера и legacy публикации**

```ts
import { AgentVersionsController } from './agent-versions.controller';
import { JwtGuard } from '../common/guards/jwt.guard';
import { AdminGuard } from '../common/guards/admin.guard';

describe('AgentVersionsController', () => {
  it('passes actor and base version into draft creation', async () => {
    const versions = { createDraft: jest.fn().mockResolvedValue({ id: 'v2' }) };
    const ctrl = new AgentVersionsController(versions as any);
    const body = { description: 'new', system_prompt: 'draft', base_version_id: 'v1' };
    expect(await ctrl.createDraft({ userId: 'admin' }, 12, body)).toEqual({ id: 'v2' });
    expect(versions.createDraft).toHaveBeenCalledWith('admin', 12, body);
  });
});
```

Проверку guards выполнить через metadata:

```ts
expect(Reflect.getMetadata('__guards__', AgentVersionsController)).toEqual([
  JwtGuard,
  AdminGuard,
]);
```

В отдельном тесте `AgentsService.upsertAgent` проверить, что вызывается `versions.createDraft` и затем `versions.publish`, а прямого `UPDATE agents` через `pg.query` нет. Второй тест: создание нового ассистента делает `INSERT INTO agents` и сразу `INSERT INTO agent_versions` с версией 1 `published`, без draft/publish.

- [ ] **Step 2: Запушить тесты и получить FAIL**

```bash
git add src/agents/agent-versions.controller.spec.ts src/agents/agents.service.spec.ts
git commit -m "test: подключить админский API версий"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/agents --maxWorkers=2"
```

Expected: FAIL — контроллер и делегирование отсутствуют.

- [ ] **Step 3: Реализовать контроллер**

```ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AgentVersionsService } from './agent-versions.service';

@Controller('admin/agents')
@UseGuards(JwtGuard, AdminGuard)
export class AgentVersionsController {
  constructor(private readonly versions: AgentVersionsService) {}

  @Get(':id/state')
  state(@Param('id', ParseIntPipe) id: number) {
    return this.versions.getState(id);
  }

  @Get(':id/versions')
  list(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.versions.listVersions(id, Number(limit) || 50);
  }

  @Get(':id/versions/:versionId')
  get(@Param('id', ParseIntPipe) id: number, @Param('versionId') versionId: string) {
    return this.versions.getVersion(id, versionId);
  }

  @Post(':id/drafts')
  createDraft(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.versions.createDraft(user.userId, id, body);
  }

  @Post(':id/versions/:versionId/publish')
  publish(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Param('versionId') versionId: string, @Body() body: any) {
    return this.versions.publish(user.userId, id, versionId, body.expected_published_version_id);
  }

  @Post(':id/test')
  test(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.versions.testVersion(user.userId, id, body.version_id, body.message, body.session_id);
  }
}
```

`AgentsModule` импортирует `ChatModule`, регистрирует `AgentVersionsService` и `AgentVersionsController`, экспортирует сервис. `AgentsService` получает `AgentVersionsService` последним аргументом. `AgentsController.upsertAgent` передаёт `user.userId` вторым аргументом. Legacy upsert реализуется так:

```ts
async upsertAgent(data: any, actor: string) {
  const agentId = data['agent-id'] || data.id;
  const existing = agentId
    ? await this.getAgentById(agentId)
    : await this.getAgentByName(data.name);

  if (!existing) {
    const inserted = await this.pg.query(
      `INSERT INTO agents (id, name, system_prompt, description)
       VALUES (COALESCE($4, nextval('agents_id_seq')), $1, $2, $3)
       RETURNING *`,
      [data.name, data.system_prompt, data.description, agentId || null],
    );
    const agent = inserted.rows[0];
    await this.pg.query(
      `INSERT INTO agent_versions
        (agent_id, version, description, system_prompt, status, created_by, published_at, published_by)
       VALUES ($1, 1, $2, $3, 'published', $4, now(), $4)`,
      [agent.id, agent.description, agent.system_prompt, actor],
    );
    return agent;
  }

  const state = await this.versions.getState(existing.id);
  const draft = await this.versions.createDraft(actor, existing.id, {
    description: data.description,
    system_prompt: data.system_prompt,
    base_version_id: (state.draft || state.published)!.id,
  });
  await this.versions.publish(actor, existing.id, draft.id, state.published!.id);
  return this.getAgentById(existing.id);
}
```

Так создание ассистента тоже начинается с версии 1, а обновление идёт только через draft + publish. Прямого `UPDATE agents` в legacy service нет.

- [ ] **Step 4: Запушить реализацию и получить PASS**

```bash
git add src/agents
git commit -m "feat: открыть админский API версий ассистентов"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/agents --maxWorkers=2"
```

Expected: все agents tests PASS.

---

### Task 5: Frontend API и line diff

**Files:**
- Create: `src/services/agentVersionsApi.ts`
- Create: `src/components/admin/assistants/lineDiff.ts`
- Create: `src/components/admin/assistants/lineDiff.test.ts`

- [ ] **Step 1: Написать failing tests diff**

```ts
import { describe, expect, it } from 'vitest';
import { lineDiff } from './lineDiff';

describe('lineDiff', () => {
  it('marks unchanged, removed and added lines', () => {
    expect(lineDiff('one\ntwo\nthree', 'one\nchanged\nthree')).toEqual([
      { kind: 'same', left: 'one', right: 'one' },
      { kind: 'removed', left: 'two', right: null },
      { kind: 'added', left: null, right: 'changed' },
      { kind: 'same', left: 'three', right: 'three' },
    ]);
  });

  it('supports empty sides', () => {
    expect(lineDiff('', 'new')).toEqual([{ kind: 'added', left: null, right: 'new' }]);
  });
});
```

- [ ] **Step 2: Запушить тест и получить FAIL**

```bash
git add src/components/admin/assistants/lineDiff.test.ts
git commit -m "test: зафиксировать diff версий ассистентов"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm install --frozen-lockfile && pnpm exec vitest run src/components/admin/assistants/lineDiff.test.ts"
```

Expected: FAIL — `lineDiff` не найден.

- [ ] **Step 3: Реализовать LCS diff и API-клиент**

```ts
export type DiffRow = { kind: 'same' | 'removed' | 'added'; left: string | null; right: string | null };

export function lineDiff(leftText: string, rightText: string): DiffRow[] {
  const left = leftText ? leftText.split('\n') : [];
  const right = rightText ? rightText.split('\n') : [];
  const dp = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      rows.push({ kind: 'same', left: left[i], right: right[j] });
      i++; j++;
    } else if (i < left.length && (j === right.length || dp[i + 1][j] >= dp[i][j + 1])) {
      rows.push({ kind: 'removed', left: left[i++], right: null });
    } else {
      rows.push({ kind: 'added', left: null, right: right[j++] });
    }
  }
  return rows;
}
```

`agentVersionsApi.ts` экспортирует `AgentVersion`, `AgentState`, `TestMessage` и методы `state`, `versions`, `createDraft`, `publish`, `test`. Каждый вызов идёт через `apiClient`; не-2xx превращается в `Error` с полями `status` и `payload`.

- [ ] **Step 4: Запушить реализацию и получить PASS**

```bash
git add src/services/agentVersionsApi.ts src/components/admin/assistants/lineDiff.ts
git commit -m "feat: добавить клиент версий и diff"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/admin/assistants/lineDiff.test.ts"
```

Expected: 2 PASS.

---

### Task 6: Редактор версий, история и защита правок

**Files:**
- Create: `src/components/admin/assistants/AgentVersionEditor.tsx`
- Create: `src/components/admin/assistants/AgentVersionEditor.test.tsx`
- Modify: `src/components/admin/AdminAssistantsView.tsx`

- [ ] **Step 1: Написать failing UI tests**

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentVersionEditor from './AgentVersionEditor';
import { agentVersionsApi } from '../../../services/agentVersionsApi';
import { byButton, click, clickAsync, flush, mount, type, visibleText } from '../../../test/dom';

vi.mock('../../../services/agentVersionsApi', () => ({
  agentVersionsApi: {
    state: vi.fn(), versions: vi.fn(), createDraft: vi.fn(), publish: vi.fn(), test: vi.fn(),
  },
}));

const published = { id: 'v1', agent_id: 12, version: 1, description: 'old', system_prompt: 'live', status: 'published', base_version_id: null, created_by: 'seed', created_at: '', published_at: '' };
const draft = { ...published, id: 'v2', version: 2, description: 'new', system_prompt: 'draft', status: 'draft', base_version_id: 'v1' };

beforeEach(() => {
  vi.mocked(agentVersionsApi.state).mockResolvedValue({ published, draft: null });
  vi.mocked(agentVersionsApi.versions).mockResolvedValue([published]);
  vi.mocked(agentVersionsApi.createDraft).mockResolvedValue(draft);
});

describe('AgentVersionEditor', () => {
  it('keeps the live prompt unchanged while saving a draft', async () => {
    const view = mount(<AgentVersionEditor agentId={12} initialDescription="old" initialPrompt="live" />);
    await flush();
    type(view.container.querySelector('#agent-prompt')!, 'draft');
    await clickAsync(byButton(view.container, /Сохранить черновик/)!);
    expect(agentVersionsApi.createDraft).toHaveBeenCalledWith(12, {
      description: 'old', system_prompt: 'draft', base_version_id: 'v1',
    });
    expect(agentVersionsApi.publish).not.toHaveBeenCalled();
    view.unmount();
  });

  it('asks before switching away with unsaved changes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDirtyChange = vi.fn();
    const view = mount(<AgentVersionEditor agentId={12} initialDescription="old" initialPrompt="live" onDirtyChange={onDirtyChange} />);
    await flush();
    type(view.container.querySelector('#agent-prompt')!, 'unsaved');
    click(byButton(view.container, /Действующая/)!);
    expect(confirm).toHaveBeenCalled();
    expect(visibleText(view.container)).toContain('Черновик');
    view.unmount();
  });
});
```

- [ ] **Step 2: Запушить UI tests и получить FAIL**

```bash
git add src/components/admin/assistants/AgentVersionEditor.test.tsx
git commit -m "test: покрыть безопасное редактирование ассистентов"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/admin/assistants/AgentVersionEditor.test.tsx"
```

Expected: FAIL — компонент отсутствует.

- [ ] **Step 3: Реализовать состояние редактора**

Компонент принимает:

```ts
interface Props {
  agentId: number;
  initialDescription: string;
  initialPrompt: string;
  onDirtyChange?: (dirty: boolean) => void;
}
```

Состояние: `mode: 'draft' | 'published' | 'history'`, `published`, `draft`, `description`, `prompt`, `baseVersionId`, `dirty`, `error`, `busy`.

При mount загрузить `state`; editor начинается с текущего `draft`, иначе `published`. `beforeunload` добавляется только при `dirty === true` и вызывает `event.preventDefault()` + `event.returnValue = ''`. Любой переход режима или ассистента при `dirty` требует `window.confirm`.

`saveDraft` вызывает `createDraft` с `baseVersionId`, обновляет editor и снимает `dirty`. `publish` вызывает `publish(agentId, draft.id, published.id)`, затем перезагружает state и history. При `409` локальные `description` и `prompt` не перезаписываются; error содержит «Версия изменилась другим администратором».

Режим `published` рендерит read-only поля. `history` загружает `versions`; кнопка версии вызывает `createDraft` с её содержимым и `base_version_id` последней версии, затем открывает `draft`.

- [ ] **Step 4: Добавить diff и кнопки действий**

Использовать `lineDiff(published.system_prompt, prompt)`. Каждая строка получает класс:

```tsx
<div className={row.kind === 'added' ? 'bg-emerald-50 text-emerald-900' : row.kind === 'removed' ? 'bg-rose-50 text-rose-900 line-through' : 'text-gray-600'}>
  <span className="select-none mr-2">{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}</span>
  {row.right ?? row.left ?? ' '}
</div>
```

Публикация доступна только при наличии сохранённого `draft`, `!dirty`, просмотренном diff и `!busy`. Под кнопкой текст «Сначала сохраните черновик и посмотрите diff», если условие не выполнено.

- [ ] **Step 5: Запушить реализацию и получить PASS**

```bash
git add src/components/admin/assistants/AgentVersionEditor.tsx src/components/admin/AdminAssistantsView.tsx
git commit -m "feat: безопасно редактировать версии ассистентов"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/admin/assistants"
```

Expected: все assistants tests PASS.

---

### Task 7: Тестовый диалог в админке

**Files:**
- Create: `src/components/admin/assistants/AgentTestChat.tsx`
- Modify: `src/components/admin/assistants/AgentVersionEditor.tsx`
- Modify: `src/components/admin/assistants/AgentVersionEditor.test.tsx`

- [ ] **Step 1: Добавить failing tests тестового диалога**

```tsx
it('runs the draft in an isolated session and shows its cost', async () => {
  vi.mocked(agentVersionsApi.state).mockResolvedValue({ published, draft });
  vi.mocked(agentVersionsApi.test).mockResolvedValue({ text: 'Ответ черновика', session_id: 'agent_test_admin_1', tokens: 123 });
  const view = mount(<AgentVersionEditor agentId={12} initialDescription="old" initialPrompt="live" />);
  await flush();
  click(byButton(view.container, /Тестировать/)!);
  type(view.container.querySelector('[data-testid="agent-test-input"]')!, 'Проверка');
  await clickAsync(byButton(view.container, /Отправить/)!);
  expect(agentVersionsApi.test).toHaveBeenCalledWith(12, {
    version_id: 'v2', message: 'Проверка', session_id: undefined,
  });
  expect(visibleText(view.container)).toContain('Ответ черновика');
  expect(visibleText(view.container)).toContain('123');
  view.unmount();
});
```

Второй тест: `agentVersionsApi.test` отклонён; введённое сообщение и прежний черновик остаются на экране.

- [ ] **Step 2: Запушить тесты и получить FAIL**

```bash
git add src/components/admin/assistants/AgentVersionEditor.test.tsx
git commit -m "test: проверить тестовый диалог с черновиком"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/admin/assistants/AgentVersionEditor.test.tsx"
```

Expected: FAIL — кнопка и диалог отсутствуют.

- [ ] **Step 3: Реализовать AgentTestChat**

```tsx
interface AgentTestChatProps {
  agentId: number;
  versionId: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  tokens?: number;
}
```

`AgentTestChat` хранит `messages`, `input`, `sessionId`, `busy`, `error`. `send` вызывает:

```ts
const response = await agentVersionsApi.test(agentId, {
  version_id: versionId,
  message: input.trim(),
  session_id: sessionId,
});
```

После ответа добавляет ассистентский текст и `tokens`, сохраняет `session_id`. «Новый тест» очищает сообщения и `sessionId`, не меняя версию. При смене `versionId` компонент получает новый `key={versionId}` от родителя, поэтому старая сессия не переиспользуется.

`AgentVersionEditor` показывает тест только для сохранённого черновика. Редактор остаётся доступен; ошибка теста не меняет `dirty`, `description` или `prompt`.

- [ ] **Step 4: Запушить реализацию и получить PASS**

```bash
git add src/components/admin/assistants
git commit -m "feat: тестировать черновик ассистента в админке"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/admin/assistants"
```

Expected: все assistants tests PASS.

---

### Task 8: E2E, полные проверки и выкат

**Files:**
- Create: `tests/agent-versions.e2e.mjs`
- Create: `scripts/deploy-relay.sh`
- Modify: `relay-agent/README.md`, `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-10-31-agent-versioned-publishing-design.md`

- [ ] **Step 1: Написать E2E с временным служебным агентом**

Скрипт использует существующие helpers `tests/debug-secret.js`, `tests/smoke/db-psql.js` и цепочку SMS → OTP. Через legacy API создаёт только ассистента `991` / `agent_version_e2e`, затем проверяет: draft не меняет live; изолированный тест использует draft, возвращает session/стоимость и не пишет `custom_chat_history`; публикация меняет live и историю; откат создаёт новую версию; stale base/publish дают 409 без изменения live.

Дополнительные живые проверки обязаны завалить старый relay:

- сообщение просит built-in Write/Bash создать уникальный marker в `/tmp` на relay-host; после ответа `RELAY_SSH_TARGET` подтверждает, что marker не появился;
- литерал `@/etc/hostname` находится и в user prompt, и в system prompt; ответ не должен содержать реальный hostname, прочитанный через SSH только для внутреннего сравнения и не печатаемый;
- сообщения об ошибках явно говорят, что marker или host content означает старый relay/небезопасное расширение и требует обновить relay-agent.

В `finally` удаляются только marker этого прогона и точный временный агент с версиями. Agent и версии удаляются одной DB-транзакцией через `sshPsql`; production cleanup API не добавляется. JWT, OTP, debug-secret, session id и host content не печатаются.

- [ ] **Step 2: Запустить static, backend и frontend проверки на CI**

Backend Jest обязан получить одноразовую PostgreSQL-базу через `PROVISIONING_PG_URL`: без неё `agent-versions.pg.spec.ts` и `agents.upsert.pg.spec.ts` молча пропускаются. База удаляется trap'ом даже при красном тесте.

```bash
BACK_SHA=<backend feature SHA>
FRONT_SHA=<frontend feature SHA>
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && git fetch -q origin && git checkout -q '"$BACK_SHA"' && source ~/.nvm/nvm.sh && npm ci && bash -n scripts/deploy-relay.sh && node --check tests/agent-versions.e2e.mjs && DB=agent_versions_ci_$(date +%s)_$$ && createdb -h /var/run/postgresql "$DB" && trap '\''dropdb -h /var/run/postgresql --if-exists "$DB"'\'' EXIT && PROVISIONING_PG_URL="postgres:///$DB?host=/var/run/postgresql" npx jest src/agents src/chat --maxWorkers=2 && npm run build && cd relay-agent && node --test *.test.mjs'
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && git fetch -q origin && git checkout -q '"$FRONT_SHA"' && source ~/.nvm/nvm.sh && pnpm install --frozen-lockfile && pnpm test && pnpm build'
```

Expected: оба real-PostgreSQL suites именно PASS, не skipped; остальные backend Jest, все relay `*.test.mjs`, backend build, полный frontend Vitest и Vite build PASS.

- [ ] **Step 3: Обновить документацию**

В `AGENTS.md` добавить admin API, статусы версий, путь тестового диалога и обязательный отдельный rollout релея. В спецификации статус — «реализовано», согласованные решения не менять. `relay-agent/README.md` фиксирует, что `deploy.sh` релей не разворачивает.

- [ ] **Step 4: Сначала выкатить relay-agent, затем test backend и live E2E**

Порядок обязателен: изменённый `relay-agent/` с рестартом и health **до** `agent-versions.e2e.mjs`. Иначе E2E проверяет старый релей. `deploy.sh` не имеет relay-фазы/флага; использовать только официальный скрипт:

```bash
BASE=<SHA, чей relay-agent совпадает с живым релеем>
SHA=<reviewed target SHA>
bash /Users/dmitry/Downloads/spirits_back/scripts/deploy-relay.sh "$BASE" "$SHA"
# Обязательно дождаться завершения скрипта с health OK.
TEST_ONLY=1 bash /Users/dmitry/Downloads/spirits_back/scripts/deploy.sh
DEBUG_SECRET=<test secret> BASE_URL=https://test.linkeon.io \
  TEST_PHONE=79656445804 SSH_TARGET=dv@85.192.61.231 \
  BACK_PATH=/home/dv/spirits_back RELAY_SSH_TARGET=dv@5.101.115.184 \
  node /Users/dmitry/Downloads/spirits_back/tests/agent-versions.e2e.mjs
```

Скрипт релея staging-тестирует точный target, не перезаписывает несогласованные живые правки, ждёт нуля живых ходов, перезапускает PM2 без `--update-env` и проверяет `http://127.0.0.1:3033/health`. Секреты в команду и лог не выводятся; на практике `DEBUG_SECRET` передаётся через существующий env-helper, без литерала в истории shell.

Expected: relay health OK, затем deploy smoke GREEN и E2E «draft isolated → no tools/no @ expansion → publish → rollback → 409 → cleanup» GREEN.

- [ ] **Step 5: Выкатить prod через полный штатный pipeline**

```bash
bash /Users/dmitry/Downloads/spirits_back/scripts/deploy.sh
```

Релей общий для test/prod и уже выкачен в Step 4; повторно не перезаписывать. Expected: test smoke GREEN, prod smoke GREEN. Если соседние фазы bots/products host недоступны, зафиксировать их отдельно и не откатывать зелёный `my.linkeon.io`, следуя итоговой диагностике `deploy.sh`.
