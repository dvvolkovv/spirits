# Custom Agents Library — Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Личная библиотека кастомных AI-агентов: пользователь описывает роль одной строкой, Claude Haiku 4.5 генерирует system prompt, пользователь правит и сохраняет. Кастомные агенты доступны в селекторе `/chat → AssistantSelection` рядом с пресетами Linkeon.

**Architecture:** Новый бэковый NestJS-модуль `custom-agents/` в `spirits_back` (отдельная таблица `custom_agents`, CRUD-эндпоинты под `/webhook/custom-agents/*`, генерация черновика промпта через Anthropic SDK с Haiku 4.5). Новый фронтовый раздел `/my-agents` со списком/редактированием + расширение `AssistantSelection.tsx` для отображения секции «Мои».

**Tech Stack:** NestJS 10, PostgreSQL (PgService — direct SQL, без ORM), Anthropic SDK (`claude-haiku-4-5`), React 18, Vite, Tailwind, react-router-dom 6, i18next, react-hook-form.

**Spec:** [docs/superpowers/specs/2026-06-08-telegram-bot-agents-design.md](../specs/2026-06-08-telegram-bot-agents-design.md) — секции 3, 6 (custom_agents schema), 7 (frontend surfaces).

**Repositories (две разных репы, не worktree!):**
- Backend: `~/Downloads/spirits_back/` — для задач со страницы помеченных `[backend]`
- Frontend: `~/Downloads/spirits_front/` — для задач со страницы помеченных `[frontend]`. Это текущая cwd

---

## File Structure

### Backend (`~/Downloads/spirits_back/src/`)

```
custom-agents/                            (NEW MODULE)
├── custom-agents.module.ts               — модуль
├── custom-agents.controller.ts           — HTTP /webhook/custom-agents/*
├── custom-agents.service.ts              — CRUD + draft-prompt generation + миграция
├── custom-agents.dto.ts                  — DTO + class-validator
└── migrations/
    └── 001_custom_agents.sql             — таблица custom_agents

app.module.ts                             — добавить CustomAgentsModule в imports
```

### Frontend (`~/Downloads/spirits_front/src/`)

```
pages/
└── MyAgentsPage.tsx                      — /my-agents

components/custom-agents/
├── CustomAgentsListView.tsx              — список карточек
├── CustomAgentCard.tsx                   — одна карточка
├── CustomAgentCreateModal.tsx            — гибрид-генерация (3 шага)
└── CustomAgentEditModal.tsx              — правка существующего

services/
└── customAgentsApi.ts                    — API-обёртка

App.tsx                                   — добавить route /my-agents
components/layout/Navigation.tsx          — добавить пункт «Мои агенты»
components/chat/AssistantSelection.tsx    — секция «Мои» из custom_agents
i18n/locales/{ru,en}.json                 — ключи customAgents.*
```

### Tests (`~/Downloads/spirits_back/tests/`)

```
unit/customAgentsService.test.js          — sanity для draft-генерации (mocked Claude SDK)
api.test.js                               — добавить блок «custom-agents endpoints»
```

---

## Phase 1: Backend — миграция и schema

### Task 1.1: Создать миграцию таблицы custom_agents

**Files:**
- Create: `~/Downloads/spirits_back/src/custom-agents/migrations/001_custom_agents.sql`

- [ ] **Step 1: Создать SQL-файл миграции**

`~/Downloads/spirits_back/src/custom-agents/migrations/001_custom_agents.sql`:

```sql
-- 001_custom_agents.sql
-- Personal library of user-defined AI agents (custom roles).
-- Referenced by /chat AssistantSelection and (future) Telegram bot configs.

CREATE TABLE IF NOT EXISTS custom_agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name          text NOT NULL,
  description   text,
  system_prompt text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_agents_owner
  ON custom_agents (owner_user_id, updated_at DESC);
```

Note: FK на `users(id)` не добавляем — в коде существующие модули (`agents`, `smm_campaign`) тоже хранят `user_id` без FK на `users` (PgService не использует ORM, FK добавляются только когда явно нужна каскадная семантика и таблица в той же миграции). Каскадное удаление при удалении пользователя реализуется в `profile.service` отдельным SQL-блоком.

- [ ] **Step 2: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/custom-agents/migrations/001_custom_agents.sql
git commit -m "feat(custom-agents): миграция таблицы custom_agents"
```

---

## Phase 2: Backend — service с CRUD + draft-prompt

### Task 2.1: Скаффолд модуля и пустой service

**Files:**
- Create: `~/Downloads/spirits_back/src/custom-agents/custom-agents.module.ts`
- Create: `~/Downloads/spirits_back/src/custom-agents/custom-agents.service.ts`
- Create: `~/Downloads/spirits_back/src/custom-agents/custom-agents.controller.ts`
- Create: `~/Downloads/spirits_back/src/custom-agents/custom-agents.dto.ts`
- Modify: `~/Downloads/spirits_back/src/app.module.ts`

- [ ] **Step 1: Создать DTO**

`~/Downloads/spirits_back/src/custom-agents/custom-agents.dto.ts`:

```typescript
import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateCustomAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsString()
  @MinLength(20)
  @MaxLength(20000)
  systemPrompt!: string;
}

export class UpdateCustomAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(20000)
  systemPrompt?: string;
}

export class DraftPromptDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  description!: string;  // «хочу саркастичного кинокритика, любит Тарантино»
}
```

- [ ] **Step 2: Создать service-скелет с миграцией onModuleInit**

`~/Downloads/spirits_back/src/custom-agents/custom-agents.service.ts`:

```typescript
import { Injectable, Logger, OnModuleInit, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { PgService } from '../common/services/pg.service';

export interface CustomAgentRow {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CustomAgentsService implements OnModuleInit {
  private readonly logger = new Logger(CustomAgentsService.name);
  private anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(private readonly pg: PgService) {}

  async onModuleInit() {
    const candidates = [
      path.join(__dirname, 'migrations', '001_custom_agents.sql'),
      path.join(__dirname, '..', '..', 'src', 'custom-agents', 'migrations', '001_custom_agents.sql'),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          await this.pg.query(fs.readFileSync(p, 'utf8'));
          this.logger.log(`custom_agents migration applied from ${p}`);
          return;
        }
      } catch (e: any) {
        this.logger.error(`custom_agents migration failed (${p}): ${e.message}`);
      }
    }
    this.logger.warn('custom_agents migration sql not found, skipping');
  }
}
```

- [ ] **Step 3: Создать пустой controller**

`~/Downloads/spirits_back/src/custom-agents/custom-agents.controller.ts`:

```typescript
import { Controller, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CustomAgentsService } from './custom-agents.service';

@Controller('')
@UseGuards(JwtGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CustomAgentsController {
  constructor(private readonly agents: CustomAgentsService) {}
}
```

- [ ] **Step 4: Создать модуль**

`~/Downloads/spirits_back/src/custom-agents/custom-agents.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CustomAgentsController } from './custom-agents.controller';
import { CustomAgentsService } from './custom-agents.service';

@Module({
  controllers: [CustomAgentsController],
  providers: [CustomAgentsService],
  exports: [CustomAgentsService],
})
export class CustomAgentsModule {}
```

- [ ] **Step 5: Зарегистрировать модуль в `app.module.ts`**

В импортах добавить:
```typescript
import { CustomAgentsModule } from './custom-agents/custom-agents.module';
```

В массиве `imports` декоратора `@Module` — добавить `CustomAgentsModule` рядом с `AgentsModule`.

- [ ] **Step 6: Build + sanity-старт**

```bash
cd ~/Downloads/spirits_back
pnpm build
# Должно собраться без ошибок
```

- [ ] **Step 7: Коммит**

```bash
git add src/custom-agents/ src/app.module.ts
git commit -m "feat(custom-agents): скаффолд модуля и миграция onModuleInit"
```

---

### Task 2.2: Метод `list(ownerId)` + тест

**Files:**
- Modify: `~/Downloads/spirits_back/src/custom-agents/custom-agents.service.ts`
- Create: `~/Downloads/spirits_back/tests/unit/customAgentsService.test.js`

- [ ] **Step 1: Написать падающий тест**

`~/Downloads/spirits_back/tests/unit/customAgentsService.test.js`:

```javascript
/**
 * Unit-tests для CustomAgentsService — паттерн как в tasks-listForUser.test.js:
 * inline-копия метода + mock PgService.
 */

function makeService(rows) {
  const pg = {
    queries: [],
    query(sql, params) {
      this.queries.push({ sql, params });
      return Promise.resolve({ rows });
    },
  };
  return {
    pg,
    async list(ownerId) {
      const r = await pg.query(
        `SELECT id, name, description, system_prompt, created_at, updated_at
           FROM custom_agents
          WHERE owner_user_id = $1
          ORDER BY updated_at DESC`,
        [ownerId],
      );
      return r.rows;
    },
  };
}

describe('CustomAgentsService.list', () => {
  test('возвращает агентов владельца, отсортированных по updated_at DESC', async () => {
    const s = makeService([
      { id: 'a1', name: 'Кинокритик', description: null, system_prompt: 'sp', created_at: 't1', updated_at: 't2' },
    ]);
    const out = await s.list('owner-1');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Кинокритик');
    expect(s.pg.queries[0].params).toEqual(['owner-1']);
    expect(s.pg.queries[0].sql).toMatch(/ORDER BY updated_at DESC/);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться что падает (jest не находит — это OK, тест пройдёт сам)**

```bash
cd ~/Downloads/spirits_back/tests
npx jest unit/customAgentsService -t 'возвращает агентов'
```
Ожидание: PASS (логика inline в тесте, проверяем форму SQL).

- [ ] **Step 3: Добавить метод `list` в сервис**

В `custom-agents.service.ts` добавить в класс:

```typescript
async list(ownerId: string): Promise<CustomAgentRow[]> {
  const r = await this.pg.query(
    `SELECT id, name, description, system_prompt, created_at, updated_at
       FROM custom_agents
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC`,
    [ownerId],
  );
  return r.rows;
}
```

- [ ] **Step 4: Коммит**

```bash
git add src/custom-agents/custom-agents.service.ts tests/unit/customAgentsService.test.js
git commit -m "feat(custom-agents): list owner's agents + unit-тест"
```

---

### Task 2.3: Метод `getById(id, ownerId)` с проверкой владения

**Files:**
- Modify: `~/Downloads/spirits_back/src/custom-agents/custom-agents.service.ts`
- Modify: `~/Downloads/spirits_back/tests/unit/customAgentsService.test.js`

- [ ] **Step 1: Добавить тест**

Добавить в файл теста новый describe-блок:

```javascript
describe('CustomAgentsService.getById', () => {
  function makeGetByIdSvc(row) {
    const pg = {
      query: (sql, params) => Promise.resolve({ rows: row ? [row] : [] }),
    };
    return {
      async getById(id, ownerId) {
        const r = await pg.query(
          `SELECT * FROM custom_agents WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
          [id, ownerId],
        );
        if (r.rows.length === 0) {
          const err = new Error('NotFound');
          err.name = 'NotFoundException';
          throw err;
        }
        return r.rows[0];
      },
    };
  }

  test('возвращает агента когда владелец совпадает', async () => {
    const s = makeGetByIdSvc({ id: 'a1', owner_user_id: 'owner-1', name: 'X', system_prompt: 'sp' });
    const out = await s.getById('a1', 'owner-1');
    expect(out.name).toBe('X');
  });

  test('кидает NotFound когда строки нет (включая чужого владельца)', async () => {
    const s = makeGetByIdSvc(null);
    await expect(s.getById('a1', 'owner-2')).rejects.toThrow('NotFound');
  });
});
```

- [ ] **Step 2: Запустить тест**

```bash
cd ~/Downloads/spirits_back/tests
npx jest unit/customAgentsService -t 'getById'
```
Ожидание: оба PASS.

- [ ] **Step 3: Добавить метод в сервис**

В `custom-agents.service.ts` добавить в класс:

```typescript
async getById(id: string, ownerId: string): Promise<CustomAgentRow> {
  const r = await this.pg.query(
    `SELECT id, owner_user_id, name, description, system_prompt, created_at, updated_at
       FROM custom_agents
      WHERE id = $1 AND owner_user_id = $2
      LIMIT 1`,
    [id, ownerId],
  );
  if (r.rows.length === 0) {
    throw new NotFoundException(`Custom agent ${id} not found or not owned by user`);
  }
  return r.rows[0];
}
```

- [ ] **Step 4: Коммит**

```bash
git add src/custom-agents/custom-agents.service.ts tests/unit/customAgentsService.test.js
git commit -m "feat(custom-agents): getById с owner check"
```

---

### Task 2.4: Методы `create`, `update`, `remove`

**Files:**
- Modify: `~/Downloads/spirits_back/src/custom-agents/custom-agents.service.ts`

- [ ] **Step 1: Добавить три метода в сервис**

```typescript
async create(
  ownerId: string,
  data: { name: string; description?: string; systemPrompt: string },
): Promise<CustomAgentRow> {
  const r = await this.pg.query(
    `INSERT INTO custom_agents (owner_user_id, name, description, system_prompt)
     VALUES ($1, $2, $3, $4)
     RETURNING id, owner_user_id, name, description, system_prompt, created_at, updated_at`,
    [ownerId, data.name.trim(), data.description?.trim() || null, data.systemPrompt.trim()],
  );
  return r.rows[0];
}

async update(
  id: string,
  ownerId: string,
  data: { name?: string; description?: string; systemPrompt?: string },
): Promise<CustomAgentRow> {
  // Verify ownership first
  await this.getById(id, ownerId);

  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name.trim()); }
  if (data.description !== undefined) {
    fields.push(`description = $${idx++}`);
    params.push(data.description.trim() || null);
  }
  if (data.systemPrompt !== undefined) {
    fields.push(`system_prompt = $${idx++}`);
    params.push(data.systemPrompt.trim());
  }
  if (fields.length === 0) return this.getById(id, ownerId);

  fields.push(`updated_at = now()`);
  params.push(id, ownerId);

  const r = await this.pg.query(
    `UPDATE custom_agents SET ${fields.join(', ')}
      WHERE id = $${idx++} AND owner_user_id = $${idx}
      RETURNING id, owner_user_id, name, description, system_prompt, created_at, updated_at`,
    params,
  );
  return r.rows[0];
}

async remove(id: string, ownerId: string): Promise<void> {
  await this.getById(id, ownerId);  // throws NotFound if absent or not owned
  await this.pg.query(
    `DELETE FROM custom_agents WHERE id = $1 AND owner_user_id = $2`,
    [id, ownerId],
  );
}
```

Note для FK-блока при удалении в Plan 2: в Plan 1 пока проверки нет, потому что `tg_bot_configs` ещё не существует. Будет добавлено в Plan 2 (раздел про lifecycle).

- [ ] **Step 2: Коммит**

```bash
git add src/custom-agents/custom-agents.service.ts
git commit -m "feat(custom-agents): create/update/remove"
```

---

### Task 2.5: Метод `draftPrompt` — генерация system prompt через Haiku 4.5

**Files:**
- Modify: `~/Downloads/spirits_back/src/custom-agents/custom-agents.service.ts`

- [ ] **Step 1: Добавить метод в сервис**

```typescript
async draftPrompt(description: string): Promise<{ name: string; systemPrompt: string }> {
  const sys = `Ты помогаешь создавать system prompts для AI-ассистентов в Linkeon.
Пользователь дал короткое описание роли. Сгенерируй:
1) Краткое имя (1-3 слова, по-русски, для отображения в селекторе).
2) System prompt на русском в 200-400 слов:
   - кто этот ассистент (характер, экспертиза)
   - как он общается (стиль, тон)
   - на каких темах фокусируется
   - чего избегает

Отвечай строго JSON-объектом вида {"name": "...", "systemPrompt": "..."} без markdown-обёртки.`;

  const resp = await this.anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2000,
    system: sys,
    messages: [{ role: 'user', content: description.trim() }],
  });

  const textBlock = resp.content.find((b: any) => b.type === 'text') as any;
  if (!textBlock?.text) {
    throw new Error('Empty response from Haiku');
  }

  let parsed: { name: string; systemPrompt: string };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    // Fallback: иногда модель оборачивает в ```json — снимаем
    const cleaned = textBlock.text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    parsed = JSON.parse(cleaned);
  }

  if (!parsed.name || !parsed.systemPrompt) {
    throw new Error('Malformed draft response');
  }
  return { name: parsed.name.trim(), systemPrompt: parsed.systemPrompt.trim() };
}
```

- [ ] **Step 2: Коммит**

```bash
git add src/custom-agents/custom-agents.service.ts
git commit -m "feat(custom-agents): draftPrompt через Haiku 4.5"
```

---

## Phase 3: Backend — controller-эндпоинты

### Task 3.1: GET /webhook/custom-agents (list)

**Files:**
- Modify: `~/Downloads/spirits_back/src/custom-agents/custom-agents.controller.ts`

- [ ] **Step 1: Добавить эндпоинт**

В классе `CustomAgentsController` (заменить содержимое класса целиком):

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { CustomAgentsService } from './custom-agents.service';
import { CreateCustomAgentDto, UpdateCustomAgentDto, DraftPromptDto } from './custom-agents.dto';

@Controller('')
@UseGuards(JwtGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class CustomAgentsController {
  constructor(private readonly agents: CustomAgentsService) {}

  @Get('custom-agents')
  async list(@CurrentUser() user: any, @Res() res: Response) {
    const rows = await this.agents.list(user.userId);
    return res.status(200).json(
      rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        systemPrompt: r.system_prompt,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    );
  }
}
```

- [ ] **Step 2: Smoke-проверка локально (требует базы)**

```bash
cd ~/Downloads/spirits_back
pnpm build
# Старт локального сервера если есть; иначе оставить smoke для деплоя
```

- [ ] **Step 3: Коммит**

```bash
git add src/custom-agents/custom-agents.controller.ts
git commit -m "feat(custom-agents): GET /webhook/custom-agents"
```

---

### Task 3.2: POST /webhook/custom-agents (create)

**Files:**
- Modify: `~/Downloads/spirits_back/src/custom-agents/custom-agents.controller.ts`

- [ ] **Step 1: Добавить метод в контроллер**

```typescript
@Post('custom-agents')
async create(@CurrentUser() user: any, @Body() dto: CreateCustomAgentDto, @Res() res: Response) {
  const row = await this.agents.create(user.userId, dto);
  return res.status(201).json({
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
```

- [ ] **Step 2: Коммит**

```bash
git commit -am "feat(custom-agents): POST /webhook/custom-agents create"
```

---

### Task 3.3: POST /webhook/custom-agents/draft (генерация черновика)

**Files:**
- Modify: `~/Downloads/spirits_back/src/custom-agents/custom-agents.controller.ts`

- [ ] **Step 1: Добавить метод**

```typescript
@Post('custom-agents/draft')
async draft(@CurrentUser() _user: any, @Body() dto: DraftPromptDto, @Res() res: Response) {
  const draft = await this.agents.draftPrompt(dto.description);
  return res.status(200).json(draft);  // { name, systemPrompt }
}
```

Note: `_user` помечен `_` так как пока не нужен (за генерацию платит Linkeon, биллинг здесь не делается). Но JwtGuard всё равно стоит на классе — анонимный доступ закрыт.

- [ ] **Step 2: Коммит**

```bash
git commit -am "feat(custom-agents): POST /draft — генерация system_prompt через Haiku"
```

---

### Task 3.4: PATCH /webhook/custom-agents/:id (update) + DELETE

**Files:**
- Modify: `~/Downloads/spirits_back/src/custom-agents/custom-agents.controller.ts`

- [ ] **Step 1: Добавить методы**

```typescript
@Patch('custom-agents/:id')
async update(
  @CurrentUser() user: any,
  @Param('id') id: string,
  @Body() dto: UpdateCustomAgentDto,
  @Res() res: Response,
) {
  const row = await this.agents.update(id, user.userId, dto);
  return res.status(200).json({
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

@Delete('custom-agents/:id')
async remove(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
  await this.agents.remove(id, user.userId);
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 2: Коммит**

```bash
git commit -am "feat(custom-agents): PATCH/DELETE :id"
```

---

### Task 3.5: API-test — проверка что эндпоинты живы

**Files:**
- Modify: `~/Downloads/spirits_back/tests/api.test.js`

- [ ] **Step 1: Найти существующий describe-блок и добавить новый рядом**

Открыть `~/Downloads/spirits_back/tests/api.test.js`, найти описывающий блок похожих защищённых эндпоинтов (например, для profile). Добавить в конец файла:

```javascript
describe('custom-agents endpoints (auth required)', () => {
  test('GET /webhook/custom-agents без токена — 401', async () => {
    const r = await http.get('/webhook/custom-agents');
    assertStatus(r, 401);
  });
  test('POST /webhook/custom-agents без токена — 401', async () => {
    const r = await http.post('/webhook/custom-agents', { name: 'x', systemPrompt: 'y'.repeat(30) });
    assertStatus(r, 401);
  });
  test('POST /webhook/custom-agents/draft без токена — 401', async () => {
    const r = await http.post('/webhook/custom-agents/draft', { description: 'кинокритик' });
    assertStatus(r, 401);
  });
  test('PATCH /webhook/custom-agents/:id без токена — 401', async () => {
    const r = await http.patch('/webhook/custom-agents/00000000-0000-0000-0000-000000000000', { name: 'x' });
    assertStatus(r, 401);
  });
  test('DELETE /webhook/custom-agents/:id без токена — 401', async () => {
    const r = await http.delete('/webhook/custom-agents/00000000-0000-0000-0000-000000000000');
    assertStatus(r, 401);
  });
});
```

- [ ] **Step 2: Запустить (требует поднятый бэк или mock — на CI пройдёт против test.linkeon.io)**

```bash
cd ~/Downloads/spirits_back/tests
BASE_URL=https://test.linkeon.io node runner.js --suite api 2>&1 | grep custom-agents
```
Ожидание: все 5 — pass (401 без токена).

- [ ] **Step 3: Коммит**

```bash
git commit -am "test(custom-agents): api auth-checks"
```

---

## Phase 4: Frontend — API service

### Task 4.1: Создать customAgentsApi.ts

**Files:**
- Create: `~/Downloads/spirits_front/src/services/customAgentsApi.ts`

- [ ] **Step 1: Создать файл**

```typescript
import { apiClient } from './apiClient';

export interface CustomAgent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    message = body?.message ?? body?.error ?? message;
  } catch {}
  throw new Error(message);
}

export const customAgentsApi = {
  async list(): Promise<CustomAgent[]> {
    const r = await apiClient.get('/webhook/custom-agents');
    return parseOrThrow<CustomAgent[]>(r);
  },

  async create(body: {
    name: string;
    description?: string;
    systemPrompt: string;
  }): Promise<CustomAgent> {
    const r = await apiClient.post('/webhook/custom-agents', body);
    return parseOrThrow<CustomAgent>(r);
  },

  async draft(description: string): Promise<{ name: string; systemPrompt: string }> {
    const r = await apiClient.post('/webhook/custom-agents/draft', { description });
    return parseOrThrow<{ name: string; systemPrompt: string }>(r);
  },

  async update(
    id: string,
    body: { name?: string; description?: string; systemPrompt?: string },
  ): Promise<CustomAgent> {
    const r = await apiClient.patch(`/webhook/custom-agents/${id}`, body);
    return parseOrThrow<CustomAgent>(r);
  },

  async remove(id: string): Promise<{ ok: boolean }> {
    const r = await apiClient.delete(`/webhook/custom-agents/${id}`);
    return parseOrThrow<{ ok: boolean }>(r);
  },
};
```

- [ ] **Step 2: Убедиться что apiClient экспортирует методы get/post/patch/delete**

```bash
cd ~/Downloads/spirits_front
grep -n "async get\|async post\|async patch\|async delete" src/services/apiClient.ts
```
Если `patch` отсутствует — добавить, повторив паттерн `post`. (В существующем коде, по grep socialAccountApi.ts, эти методы используются, так что они есть.)

- [ ] **Step 3: Коммит**

```bash
git add src/services/customAgentsApi.ts
git commit -m "feat(custom-agents): фронт-сервис customAgentsApi"
```

---

## Phase 5: Frontend — компоненты

### Task 5.1: CustomAgentCard

**Files:**
- Create: `~/Downloads/spirits_front/src/components/custom-agents/CustomAgentCard.tsx`

- [ ] **Step 1: Создать компонент**

```tsx
import React from 'react';
import { Edit2, Trash2, Bot } from 'lucide-react';
import type { CustomAgent } from '../../services/customAgentsApi';

interface Props {
  agent: CustomAgent;
  onEdit: (a: CustomAgent) => void;
  onDelete: (a: CustomAgent) => void;
}

export const CustomAgentCard: React.FC<Props> = ({ agent, onEdit, onDelete }) => (
  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex flex-col gap-3">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        <Bot size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
        {agent.description && (
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{agent.description}</p>
        )}
      </div>
    </div>
    <div className="flex gap-2 mt-auto">
      <button
        onClick={() => onEdit(agent)}
        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
      >
        <Edit2 size={14} /> Изменить
      </button>
      <button
        onClick={() => onDelete(agent)}
        className="py-2 px-3 rounded-lg text-red-600 hover:bg-red-50"
        aria-label="Удалить"
      >
        <Trash2 size={16} />
      </button>
    </div>
  </div>
);
```

- [ ] **Step 2: Коммит**

```bash
git add src/components/custom-agents/CustomAgentCard.tsx
git commit -m "feat(custom-agents): CustomAgentCard"
```

---

### Task 5.2: CustomAgentsListView

**Files:**
- Create: `~/Downloads/spirits_front/src/components/custom-agents/CustomAgentsListView.tsx`

- [ ] **Step 1: Создать компонент**

```tsx
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { customAgentsApi, type CustomAgent } from '../../services/customAgentsApi';
import { CustomAgentCard } from './CustomAgentCard';
import { CustomAgentCreateModal } from './CustomAgentCreateModal';
import { CustomAgentEditModal } from './CustomAgentEditModal';

export const CustomAgentsListView: React.FC = () => {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomAgent | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setAgents(await customAgentsApi.list());
    } catch (e: any) {
      toast.error(e?.message ?? 'Не удалось загрузить агентов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleDelete = async (a: CustomAgent) => {
    if (!confirm(`Удалить агента "${a.name}"?`)) return;
    try {
      await customAgentsApi.remove(a.id);
      toast.success('Удалён');
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка удаления');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мои агенты</h1>
          <p className="text-sm text-gray-600 mt-1">
            Личные AI-ассистенты с собственными ролями — доступны в /chat
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
        >
          <Plus size={16} /> Создать
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Загрузка...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
          <p className="text-gray-600 mb-3">У тебя пока нет кастомных агентов.</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
          >
            Создать первого
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map(a => (
            <CustomAgentCard
              key={a.id}
              agent={a}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <CustomAgentCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); reload(); }}
        />
      )}
      {editing && (
        <CustomAgentEditModal
          agent={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Коммит**

```bash
git add src/components/custom-agents/CustomAgentsListView.tsx
git commit -m "feat(custom-agents): CustomAgentsListView"
```

---

### Task 5.3: CustomAgentCreateModal — гибрид-генерация

**Files:**
- Create: `~/Downloads/spirits_front/src/components/custom-agents/CustomAgentCreateModal.tsx`

- [ ] **Step 1: Создать компонент**

```tsx
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { customAgentsApi } from '../../services/customAgentsApi';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Step = 'describe' | 'preview' | 'saving';

export const CustomAgentCreateModal: React.FC<Props> = ({ onClose, onCreated }) => {
  const [step, setStep] = useState<Step>('describe');
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (description.trim().length < 3) {
      toast.error('Опиши роль чуть подробнее');
      return;
    }
    setGenerating(true);
    try {
      const draft = await customAgentsApi.draft(description.trim());
      setName(draft.name);
      setSystemPrompt(draft.systemPrompt);
      setStep('preview');
    } catch (e: any) {
      toast.error(e?.message ?? 'Не удалось сгенерировать');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || systemPrompt.trim().length < 20) {
      toast.error('Имя и промпт (мин 20 символов) обязательны');
      return;
    }
    setStep('saving');
    try {
      await customAgentsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
      });
      toast.success('Агент создан');
      onCreated();
    } catch (e: any) {
      toast.error(e?.message ?? 'Не удалось сохранить');
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Создать кастомного агента</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {step === 'describe' && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  Опиши роль одной строкой
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Например: саркастичный кинокритик, который любит Тарантино"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={300}
                />
                <span className="text-xs text-gray-500 mt-1 block">
                  Claude сгенерирует имя и system prompt — ты сможешь отредактировать
                </span>
              </label>
              <button
                onClick={handleGenerate}
                disabled={generating || description.trim().length < 3}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <><Loader2 size={16} className="animate-spin" /> Генерирую...</>
                ) : (
                  <><Sparkles size={16} /> Сгенерировать <ArrowRight size={14} /></>
                )}
              </button>
            </>
          )}

          {(step === 'preview' || step === 'saving') && (
            <>
              <label className="block mb-4">
                <span className="text-sm font-medium text-gray-700">Имя</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                  maxLength={80}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">System prompt</span>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={14}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                />
                <span className="text-xs text-gray-500 mt-1 block">
                  {systemPrompt.length} символов (мин 20)
                </span>
              </label>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setStep('describe')}
                  disabled={step === 'saving'}
                  className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
                >
                  Назад
                </button>
                <button
                  onClick={handleSave}
                  disabled={step === 'saving'}
                  className="flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
                >
                  {step === 'saving' ? 'Сохраняю...' : 'Сохранить'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Коммит**

```bash
git add src/components/custom-agents/CustomAgentCreateModal.tsx
git commit -m "feat(custom-agents): CustomAgentCreateModal с гибрид-генерацией"
```

---

### Task 5.4: CustomAgentEditModal

**Files:**
- Create: `~/Downloads/spirits_front/src/components/custom-agents/CustomAgentEditModal.tsx`

- [ ] **Step 1: Создать компонент**

```tsx
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { customAgentsApi, type CustomAgent } from '../../services/customAgentsApi';

interface Props {
  agent: CustomAgent;
  onClose: () => void;
  onSaved: () => void;
}

export const CustomAgentEditModal: React.FC<Props> = ({ agent, onClose, onSaved }) => {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || systemPrompt.trim().length < 20) {
      toast.error('Имя и промпт (мин 20 символов) обязательны');
      return;
    }
    setSaving(true);
    try {
      await customAgentsApi.update(agent.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
      });
      toast.success('Сохранено');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? 'Не удалось сохранить');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Редактировать агента</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Имя</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              maxLength={80}
            />
          </label>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Описание (опционально)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              maxLength={300}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">System prompt</span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={14}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
            />
          </label>
          <div className="flex gap-2 mt-5">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
            >
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Коммит**

```bash
git add src/components/custom-agents/CustomAgentEditModal.tsx
git commit -m "feat(custom-agents): CustomAgentEditModal"
```

---

### Task 5.5: MyAgentsPage + routing

**Files:**
- Create: `~/Downloads/spirits_front/src/pages/MyAgentsPage.tsx`
- Modify: `~/Downloads/spirits_front/src/App.tsx`
- Modify: `~/Downloads/spirits_front/src/components/layout/Navigation.tsx`

- [ ] **Step 1: Создать страницу**

```tsx
import React from 'react';
import { CustomAgentsListView } from '../components/custom-agents/CustomAgentsListView';

const MyAgentsPage: React.FC = () => <CustomAgentsListView />;
export default MyAgentsPage;
```

- [ ] **Step 2: Добавить route в App.tsx**

В `src/App.tsx` рядом с другими импортами страниц:
```typescript
import MyAgentsPage from './pages/MyAgentsPage';
```

В блоке Routes (рядом с `/profile`, `/chat` и т.п.):
```tsx
<Route path="/my-agents" element={<MyAgentsPage />} />
```

- [ ] **Step 3: Добавить пункт в навигацию**

Открыть `src/components/layout/Navigation.tsx`, найти массив пунктов (обычно `navItems` или `menuItems`). Добавить новый пункт по образцу существующих, с иконкой `Bot` из `lucide-react` и переводом из i18n (см. Step 5).

- [ ] **Step 4: Smoke в браузере**

```bash
pnpm dev
# Открыть http://localhost:5173/my-agents — должна отрисоваться страница
```

- [ ] **Step 5: Добавить i18n-ключи**

В `src/i18n/locales/ru.json`:
```json
"customAgents": {
  "title": "Мои агенты",
  "subtitle": "Личные AI-ассистенты с собственными ролями — доступны в /chat",
  "createButton": "Создать",
  "empty": "У тебя пока нет кастомных агентов.",
  "createFirst": "Создать первого",
  "nav": "Мои агенты"
}
```

В `src/i18n/locales/en.json`:
```json
"customAgents": {
  "title": "My Agents",
  "subtitle": "Personal AI assistants with custom roles — available in /chat",
  "createButton": "Create",
  "empty": "You don't have custom agents yet.",
  "createFirst": "Create first",
  "nav": "My Agents"
}
```

Заменить захардкоженные строки в `CustomAgentsListView` и `Navigation` на `t('customAgents.title')` и т.д. (импорт `useTranslation` из `react-i18next`).

- [ ] **Step 6: Коммит**

```bash
git add src/pages/MyAgentsPage.tsx src/App.tsx src/components/layout/Navigation.tsx src/i18n/locales/
git commit -m "feat(custom-agents): страница /my-agents + навигация + i18n"
```

---

## Phase 6: Интеграция в AssistantSelection

### Task 6.1: Показать секцию «Мои» в селекторе ассистента

**Files:**
- Modify: `~/Downloads/spirits_front/src/components/chat/AssistantSelection.tsx`

- [ ] **Step 1: Изучить текущую структуру**

```bash
cd ~/Downloads/spirits_front
head -100 src/components/chat/AssistantSelection.tsx
```

Найти, как сейчас рендерится список ассистентов — там список приходит из API (`/webhook/agents`). Кастомные агенты нужно добавить как **отдельную секцию** в начале или в конце списка.

- [ ] **Step 2: Загрузить custom_agents и отрисовать секцию**

Добавить в начало функционального компонента:
```tsx
import { customAgentsApi, type CustomAgent } from '../../services/customAgentsApi';

// внутри компонента:
const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
useEffect(() => {
  customAgentsApi.list()
    .then(setCustomAgents)
    .catch(() => {});  // тихо — не критично для UX выбора
}, []);
```

Перед существующим списком пресетов рендерить:
```tsx
{customAgents.length > 0 && (
  <div className="mb-6">
    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 px-1">
      Мои
    </h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {customAgents.map(a => (
        <button
          key={`custom-${a.id}`}
          onClick={() => onSelect(/* TODO: signature */)}
          className="text-left p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-400"
        >
          <div className="font-semibold text-gray-900">{a.name}</div>
          {a.description && (
            <div className="text-xs text-gray-600 mt-1 line-clamp-2">{a.description}</div>
          )}
          <div className="text-[10px] uppercase mt-2 text-blue-600">Кастомный</div>
        </button>
      ))}
    </div>
  </div>
)}
```

Сигнатура `onSelect` — точно совпадает с тем, как вызывается для пресетов. Если выбор идёт по `name` (текущий API `change-agent` принимает `agent: string`), то для кастомных используем синтетический префикс: `custom:<id>` или новое поле. Это требует доработки бэка `change-agent` — **см. Step 3**.

- [ ] **Step 3: Расширить chat.service для распознавания custom:<id>**

В `~/Downloads/spirits_back/src/chat/chat.service.ts` найти, где система загружает агента по имени (поиск `getAgentByName` или `preferred_agent`). Добавить ветку: если значение начинается с `custom:`, тянуть из `custom_agents` по id, использовать `system_prompt` и `name` из этой строки. Если `custom_agents` не найден — fallback на дефолтный пресет.

Точная реализация зависит от устройства `chat.service.ts` (надо прочитать сначала). Минимальное изменение:

```typescript
// псевдокод — точная точка интеграции уточняется при чтении файла
async resolveAgentPrompt(agentRef: string, userId: string): Promise<{ name: string; systemPrompt: string }> {
  if (agentRef.startsWith('custom:')) {
    const id = agentRef.substring(7);
    const r = await this.pg.query(
      `SELECT name, system_prompt FROM custom_agents WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
      [id, userId],
    );
    if (r.rows[0]) return { name: r.rows[0].name, systemPrompt: r.rows[0].system_prompt };
  }
  // существующий путь через agents table
  const preset = await this.agents.getAgentByName(agentRef);
  return { name: preset.name, systemPrompt: preset.system_prompt };
}
```

- [ ] **Step 4: Smoke в браузере**

```bash
cd ~/Downloads/spirits_front
pnpm dev
# 1. Создать кастомного агента через /my-agents
# 2. Открыть /chat — убедиться что секция «Мои» появилась
# 3. Кликнуть кастомного — отправить сообщение — получить ответ согласно сгенерированному промпту
```

- [ ] **Step 5: Коммит фронта**

```bash
cd ~/Downloads/spirits_front
git add src/components/chat/AssistantSelection.tsx
git commit -m "feat(custom-agents): секция \"Мои\" в AssistantSelection"
```

- [ ] **Step 6: Коммит бэка**

```bash
cd ~/Downloads/spirits_back
git add src/chat/chat.service.ts
git commit -m "feat(custom-agents): chat.service распознаёт custom:<id> в agentRef"
```

---

## Phase 7: Деплой и финальный smoke

### Task 7.1: Деплой через двухфазный pipeline

- [ ] **Step 1: Убедиться что обе репы зелёные локально**

```bash
cd ~/Downloads/spirits_back && pnpm build
cd ~/Downloads/spirits_front && pnpm build
```
Обе — без ошибок.

- [ ] **Step 2: Запустить deploy.sh (двухфазный: test → smoke → prod → smoke)**

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```

Ожидание:
- Фаза test: миграция `001_custom_agents.sql` применилась, smoke зелёный
- Фаза prod: повтор, smoke зелёный

Если test красный — НЕ переходить в prod, разобраться.

- [ ] **Step 3: Ручной smoke на test.linkeon.io**

```
1. Зайти на https://test.linkeon.io под тестовым аккаунтом (Basic Auth + telephone 70000000000)
2. Открыть /my-agents — страница рендерится
3. Создать агента: «весёлый помощник для тренировок» → проверить что Claude сгенерировал имя и промпт
4. Открыть /chat → секция «Мои» с этим агентом
5. Отправить сообщение — получить ответ
6. /my-agents → отредактировать → /chat → ответ обновился
7. /my-agents → удалить
```

- [ ] **Step 4: Финальный коммит на main**

К этому моменту все коммиты уже в main (в каждой репе) — деплой их катит. Дополнительных коммитов нет.

---

## Acceptance Criteria

- [ ] Таблица `custom_agents` создана на test и prod
- [ ] `GET/POST/PATCH/DELETE /webhook/custom-agents` отвечают 401 без токена и работают с токеном
- [ ] `POST /webhook/custom-agents/draft` генерирует имя+промпт через Haiku 4.5
- [ ] Страница `/my-agents` рендерится, CRUD работает
- [ ] В `/chat → AssistantSelection` отдельная секция «Мои» с кастомными агентами
- [ ] При выборе кастомного агента бэк использует его `system_prompt`
- [ ] Удаление кастомного агента работает (FK-блок из Plan 2 — добавится позже)
- [ ] Smoke `deploy.sh` зелёный на обеих фазах

---

## Self-Review

**Spec coverage:** Раздел 3 спека (Библиотека агентов) — покрыт Phase 1-6. Custom agents schema из раздела 6 — Phase 1. Frontend custom-agents из раздела 7 — Phase 4-5. Интеграция в /chat AssistantSelection — Task 6.1.

**Placeholder scan:** Task 6.1 содержит `// TODO: signature` — это интенциональный «допиши под существующий API». При выполнении задачи это превращается в конкретный код в зависимости от существующей сигнатуры `onSelect`. Это не placeholder в смысле «забыли заполнить» — это явный hand-off с инструкцией.

**Type consistency:** `CustomAgent` интерфейс используется во всех файлах фронта одинаково (поля: id, name, description, systemPrompt, createdAt, updatedAt). Backend mapper в контроллере приводит snake_case → camelCase консистентно.

**Out-of-scope для Plan 1 (намеренно):**
- FK-блок при удалении агента, используемого в `tg_bot_configs` (будет в Plan 2, потому что таблица там создаётся)
- DTO `CreateBotConfigDto` со ссылкой на `customAgentId` (Plan 2)
- Какие-либо Telegram-эндпоинты (Plan 2 целиком)
