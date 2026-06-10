# Telegram Bot Integration — Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Один общий `@LinkeonAgentBot` подключается к Telegram-группам клиентов. Клиент в кабинете Linkeon выбирает роль (пресет или кастомную из Plan 1), режим реагирования (strict/always/smart), голосовое поведение, имя — и добавляет бота в группу через нативный Telegram deep-link. Бот понимает текст и голос (Whisper STT, OpenAI TTS), отвечает по правилам, списывает Linkeon-токены с владельца.

**Architecture:** Новый бэковый NestJS-модуль `tg-bot/` в `spirits_back` с webhook-эндпоинтом, разбит на сервисы по ответственности: identity / claim / config / router / voice / billing / commands. Один процесс PM2, нет фоновых очередей в MVP — апдейты обрабатываются синхронно с advisory-lock per chat. Фронт: новая страница `/telegram-bots` с wizard созданием через deep-link.

**Tech Stack:** NestJS 10, PostgreSQL, Redis (для in-memory rate-limit и pub/sub re-check), `grammy` (Telegram bot lib), **`ClaudeCliService`** (OAuth-вызов локального `claude` CLI — `claude-sonnet-4-6` для ответов, `claude-haiku-4-5` для smart-gate; БЕЗ `ANTHROPIC_API_KEY`), OpenAI SDK (Whisper STT + TTS), React 18, Tailwind.

**Spec:** [docs/superpowers/specs/2026-06-08-telegram-bot-agents-design.md](../specs/2026-06-08-telegram-bot-agents-design.md) — все разделы кроме 3 (custom agents — Plan 1).

**Зависимости:** Plan 1 должен быть смержен в main и развёрнут на test (минимум). Эндпоинт `/webhook/custom-agents` используется во фронте wizard'а для отображения кастомных агентов в выборе роли.

**Repositories:**
- Backend: `~/Downloads/spirits_back/` (задачи помечены `[backend]`)
- Frontend: `~/Downloads/spirits_front/` (задачи помечены `[frontend]`)

---

## File Structure

### Backend (`~/Downloads/spirits_back/src/`)

```
tg-bot/                                   (NEW MODULE)
├── tg-bot.module.ts                      — модуль, setWebhook в onModuleInit
├── tg-bot.controller.ts                  — POST /webhook/telegram/:secret (no JwtGuard, ручная проверка секрета)
├── tg-bot-config.controller.ts           — /webhook/tg-bot/* (JwtGuard)
├── tg-bot.service.ts                     — оркестратор update'ов
├── tg-identity.service.ts                — AUTH_TOKEN + DM bind
├── tg-claim.service.ts                   — CLAIM_TOKEN + group activation + conflict handling
├── tg-config.service.ts                  — CRUD configs (HTTP)
├── tg-router.service.ts                  — режимы A/B/C, триггеры, rate-limit, LLM-вызовы
├── tg-voice.service.ts                   — Whisper STT + OpenAI TTS
├── tg-billing.service.ts                 — формула + deduct
├── tg-commands.service.ts                — /help /balance /silent /resume
├── tg-grammy.client.ts                   — обёртка над grammy Bot
├── tg-bot.dto.ts                         — DTO для controller'ов
└── migrations/
    ├── 001_tg_bot_schema.sql             — все 4 таблицы
    └── 002_tg_bot_custom_agent_fk.sql    — FK-блок custom_agents → tg_bot_configs

custom-agents/                            (MODIFY)
├── custom-agents.service.ts              — добавить check на использование в configs перед remove
└── ...

app.module.ts                             — добавить TgBotModule
```

### Frontend (`~/Downloads/spirits_front/src/`)

```
pages/
└── TelegramBotsPage.tsx                  — /telegram-bots

components/tg-bot/
├── TgBotsListView.tsx                    — список конфигов (active/archived)
├── TgBotCard.tsx                         — карточка
├── TgBotCreateWizard.tsx                 — 3-шаговый мастер
├── TgBotEditModal.tsx                    — редактирование
├── TgBotMessagesView.tsx                 — история сообщений
├── TgIdentityBindCallout.tsx             — баннер «привяжи Telegram»
└── role-picker/
    └── RolePickerField.tsx               — выбор роли (пресеты + кастомные)

services/
└── tgBotApi.ts

App.tsx                                   — routes /telegram-bots/*
components/layout/Navigation.tsx          — пункт «Мои боты»
components/profile/ProfileView.tsx        — блок «Telegram»
i18n/locales/{ru,en}.json                 — tgBot.*
```

### Backend tests (`~/Downloads/spirits_back/tests/`)

```
unit/tgRouterTriggers.test.js             — детектор триггеров режима A
unit/tgBillingFormula.test.js             — пересчёт USD→tokens
unit/tgIdentityClaim.test.js              — генерация/валидация токенов
api.test.js                               — добавить блок «tg-bot endpoints»
e2e.test.js                               — full claim flow (mock Telegram webhook calls)
```

---

## Phase 1: Foundation — deps, миграция, webhook controller

### Task 1.1: Установить grammy + openai

**Files:**
- Modify: `~/Downloads/spirits_back/package.json`

- [ ] **Step 1: Установить пакеты**

```bash
cd ~/Downloads/spirits_back
pnpm add grammy openai
```

- [ ] **Step 2: Проверить версии**

```bash
grep -E "\"(grammy|openai)\":" package.json
```
Ожидание: обе строки присутствуют с актуальными версиями.

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Коммит**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(tg-bot): add grammy + openai dependencies"
```

---

### Task 1.2: Миграция БД — все 4 таблицы

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/migrations/001_tg_bot_schema.sql`

- [ ] **Step 1: Создать миграцию**

```sql
-- 001_tg_bot_schema.sql
-- Telegram bot integration: identities, configs, claim tokens, message history.

-- 1. Привязка Telegram-аккаунта к Linkeon-пользователю (1:1)
-- linkeon_user_id = text (телефон/email-уникальный — НЕ uuid; см. smm_campaign.user_id, tasks.user_id, custom_agents.owner_user_id)
CREATE TABLE IF NOT EXISTS tg_user_identities (
  linkeon_user_id  text PRIMARY KEY,
  tg_user_id       bigint UNIQUE NOT NULL,
  tg_username      text,
  tg_first_name    text,
  bound_at         timestamptz NOT NULL DEFAULT now()
);

-- 2. Конфигурация бота для группы (1 group ↔ 1 active config)
CREATE TABLE IF NOT EXISTS tg_bot_configs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id            text NOT NULL,
  tg_chat_id               bigint,
  tg_chat_title            text,
  display_name             text NOT NULL,
  preset_agent_id          text,
  custom_agent_id          uuid,
  addressing_mode          text NOT NULL CHECK (addressing_mode IN ('strict','always','smart')),
  voice_reply_mode         text NOT NULL CHECK (voice_reply_mode IN ('never','mirror','always')),
  status                   text NOT NULL CHECK (status IN ('pending','active','silent','archived','deleted')),
  last_low_balance_dm_at   timestamptz,
  last_zero_balance_msg_at timestamptz,
  last_reply_at            timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  archived_at              timestamptz,
  CHECK (preset_agent_id IS NOT NULL OR custom_agent_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_bot_configs_active_chat
  ON tg_bot_configs (tg_chat_id) WHERE status IN ('active','silent');
CREATE INDEX IF NOT EXISTS idx_tg_bot_configs_owner_status
  ON tg_bot_configs (owner_user_id, status);

-- 3. Одноразовые токены onboarding-флоу
CREATE TABLE IF NOT EXISTS tg_claim_tokens (
  token         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('auth','claim')),
  owner_user_id text NOT NULL,
  config_id     uuid,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tg_claim_tokens_pending
  ON tg_claim_tokens (expires_at) WHERE consumed_at IS NULL;

-- 4. История сообщений
CREATE TABLE IF NOT EXISTS tg_bot_messages (
  id             bigserial PRIMARY KEY,
  config_id      uuid NOT NULL REFERENCES tg_bot_configs(id) ON DELETE CASCADE,
  tg_chat_id     bigint NOT NULL,
  tg_message_id  bigint,
  tg_user_id     bigint,
  tg_user_name   text,
  role           text NOT NULL CHECK (role IN ('user','assistant','system')),
  content        text NOT NULL,
  content_type   text NOT NULL CHECK (content_type IN ('text','voice_transcript','voice_reply')),
  tokens_charged int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tg_bot_messages_config
  ON tg_bot_messages (config_id, created_at DESC);
```

- [ ] **Step 2: Коммит**

```bash
git add src/tg-bot/migrations/001_tg_bot_schema.sql
git commit -m "feat(tg-bot): миграция 001 — 4 таблицы (identities, configs, tokens, messages)"
```

---

### Task 1.3: Скаффолд модуля tg-bot с миграцией

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-bot.module.ts`
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-bot.service.ts`
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-bot.controller.ts`
- Modify: `~/Downloads/spirits_back/src/app.module.ts`

- [ ] **Step 1: Создать tg-bot.service.ts со скелетом + миграция**

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PgService } from '../common/services/pg.service';

@Injectable()
export class TgBotService implements OnModuleInit {
  private readonly logger = new Logger(TgBotService.name);

  constructor(private readonly pg: PgService) {}

  async onModuleInit() {
    await this.applyMigration('001_tg_bot_schema.sql');
  }

  private async applyMigration(filename: string) {
    const candidates = [
      path.join(__dirname, 'migrations', filename),
      path.join(__dirname, '..', '..', 'src', 'tg-bot', 'migrations', filename),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          await this.pg.query(fs.readFileSync(p, 'utf8'));
          this.logger.log(`tg-bot migration ${filename} applied from ${p}`);
          return;
        }
      } catch (e: any) {
        this.logger.error(`tg-bot migration ${filename} failed (${p}): ${e.message}`);
      }
    }
    this.logger.warn(`tg-bot migration ${filename} not found, skipping`);
  }

  // Methods get added in subsequent tasks
}
```

- [ ] **Step 2: Создать пустой controller**

```typescript
import { Controller, Post, Param, Req, Res, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TgBotService } from './tg-bot.service';

@Controller('')
export class TgBotController {
  constructor(private readonly bot: TgBotService) {}

  @Post('webhook/telegram/:secret')
  @HttpCode(200)
  async handle(
    @Param('secret') secret: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Telegram ждёт 200 как можно быстрее — обработку запускаем fire-and-forget,
    // ответ возвращаем сразу. Это рекомендованный паттерн в grammy/Telegram docs.
    return res.status(200).json({ ok: true });
  }
}
```

- [ ] **Step 3: Создать tg-bot.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { TgBotController } from './tg-bot.controller';
import { TgBotService } from './tg-bot.service';

@Module({
  controllers: [TgBotController],
  providers: [TgBotService],
  exports: [TgBotService],
})
export class TgBotModule {}
```

- [ ] **Step 4: Зарегистрировать в app.module.ts**

В импортах:
```typescript
import { TgBotModule } from './tg-bot/tg-bot.module';
```
В массиве `imports` — добавить `TgBotModule`.

- [ ] **Step 5: Build**

```bash
cd ~/Downloads/spirits_back && pnpm build
```

- [ ] **Step 6: Коммит**

```bash
git add src/tg-bot/ src/app.module.ts
git commit -m "feat(tg-bot): скаффолд модуля + миграция onModuleInit"
```

---

### Task 1.4: grammy client + setWebhook в onModuleInit

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-grammy.client.ts`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.service.ts`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.controller.ts`

- [ ] **Step 1: Создать grammy-обёртку**

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Bot, InputFile } from 'grammy';
import type { Update } from 'grammy/types';

@Injectable()
export class TgGrammyClient implements OnModuleInit {
  private readonly logger = new Logger(TgGrammyClient.name);
  private bot!: Bot;

  async onModuleInit() {
    const token = process.env.TG_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TG_BOT_TOKEN not set — Telegram bot disabled');
      return;
    }
    this.bot = new Bot(token);

    // Register webhook — idempotent
    const baseUrl = process.env.TG_WEBHOOK_BASE_URL || 'https://my.linkeon.io';
    const urlSecret = process.env.TG_WEBHOOK_URL_SECRET;
    const headerSecret = process.env.TG_WEBHOOK_HEADER_SECRET;
    if (!urlSecret || !headerSecret) {
      this.logger.error('TG_WEBHOOK_URL_SECRET or TG_WEBHOOK_HEADER_SECRET missing');
      return;
    }
    const webhookUrl = `${baseUrl}/webhook/telegram/${urlSecret}`;
    try {
      await this.bot.api.setWebhook(webhookUrl, {
        secret_token: headerSecret,
        allowed_updates: ['message', 'edited_message', 'my_chat_member', 'callback_query'],
        drop_pending_updates: false,
      });
      this.logger.log(`Telegram webhook set: ${webhookUrl}`);
    } catch (e: any) {
      this.logger.error(`setWebhook failed: ${e.message}`);
    }
  }

  // Public methods — wrappers
  async sendMessage(chatId: number, text: string, options: any = {}) {
    return this.bot.api.sendMessage(chatId, text, options);
  }

  async sendVoice(chatId: number, voice: Buffer, options: any = {}) {
    return this.bot.api.sendVoice(chatId, new InputFile(voice), options);
  }

  async leaveChat(chatId: number) {
    return this.bot.api.leaveChat(chatId);
  }

  async getFile(fileId: string) {
    return this.bot.api.getFile(fileId);
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const token = process.env.TG_BOT_TOKEN!;
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const resp = await fetch(url);
    return Buffer.from(await resp.arrayBuffer());
  }

  // Direct access if needed for update parsing
  getBot(): Bot {
    return this.bot;
  }
}
```

- [ ] **Step 2: Зарегистрировать в module**

В `tg-bot.module.ts` добавить `TgGrammyClient` в providers и exports.

- [ ] **Step 3: Дописать controller — проверка секретов + передача в service**

Заменить содержимое `tg-bot.controller.ts`:

```typescript
import { Controller, Post, Param, Req, Res, HttpCode, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TgBotService } from './tg-bot.service';

@Controller('')
export class TgBotController {
  constructor(private readonly bot: TgBotService) {}

  @Post('webhook/telegram/:secret')
  @HttpCode(200)
  async handle(
    @Param('secret') urlSecret: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // 1. URL-секрет
    if (urlSecret !== process.env.TG_WEBHOOK_URL_SECRET) {
      throw new UnauthorizedException('bad url secret');
    }
    // 2. Header-секрет (выставляется Telegram'ом из setWebhook secret_token)
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== process.env.TG_WEBHOOK_HEADER_SECRET) {
      throw new UnauthorizedException('bad header secret');
    }

    // 3. Ответ 200 быстро + обработка в фоне (fire-and-forget)
    res.status(200).json({ ok: true });
    setImmediate(() => {
      this.bot.handleUpdate(req.body).catch((e) => {
        // Логирование уже внутри handleUpdate, тут только catch чтобы не было unhandled rejection
      });
    });
    return;
  }
}
```

- [ ] **Step 4: Добавить пустой `handleUpdate` в tg-bot.service**

В `TgBotService` добавить:

```typescript
async handleUpdate(update: any): Promise<void> {
  this.logger.debug(`update received: ${JSON.stringify(update).substring(0, 200)}`);
  // Routing будет реализован в следующих фазах
}
```

- [ ] **Step 5: Добавить env-секреты в .env.example**

```bash
cat >> ~/Downloads/spirits_back/.env.example <<'EOF'

# Telegram bot integration
TG_BOT_TOKEN=
TG_WEBHOOK_URL_SECRET=
TG_WEBHOOK_HEADER_SECRET=
TG_WEBHOOK_BASE_URL=https://my.linkeon.io
TG_BOT_LOW_BALANCE_THRESHOLD=1000
OPENAI_API_KEY=
EOF
```

- [ ] **Step 6: Build + коммит**

```bash
pnpm build
git add src/tg-bot/ .env.example
git commit -m "feat(tg-bot): grammy client + setWebhook + secret validation"
```

---

## Phase 2: Identity binding (DM /start AUTH_TOKEN)

### Task 2.1: tg-identity.service — генерация AUTH_TOKEN

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-identity.service.ts`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.module.ts`
- Create: `~/Downloads/spirits_back/tests/unit/tgIdentityClaim.test.js`

- [ ] **Step 1: Написать падающий тест**

`~/Downloads/spirits_back/tests/unit/tgIdentityClaim.test.js`:

```javascript
/**
 * Unit-tests для генерации/валидации AUTH/CLAIM токенов.
 * Inline-копия как в существующих unit-тестах.
 */

function makePgMock() {
  const calls = [];
  const state = { token: null, identity: null };
  const pg = {
    queries: calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/INSERT INTO tg_claim_tokens/.test(sql)) {
        state.token = { token: '11111111-1111-1111-1111-111111111111', kind: params[0], owner_user_id: params[1], expires_at: params[2], consumed_at: null };
        return { rows: [state.token] };
      }
      if (/SELECT.*FROM tg_claim_tokens.*WHERE token/.test(sql)) {
        if (!state.token || state.token.consumed_at) return { rows: [] };
        if (state.token.token !== params[0]) return { rows: [] };
        return { rows: [state.token] };
      }
      if (/UPDATE tg_claim_tokens.*SET consumed_at/.test(sql)) {
        if (state.token) state.token.consumed_at = new Date();
        return { rows: [] };
      }
      if (/INSERT INTO tg_user_identities/.test(sql)) {
        state.identity = { linkeon_user_id: params[0], tg_user_id: params[1] };
        return { rows: [state.identity] };
      }
      return { rows: [] };
    },
    state,
  };
  return pg;
}

function makeIdentityService(pg) {
  return {
    async createAuthToken(ownerId) {
      const expires = new Date(Date.now() + 15 * 60 * 1000);
      const r = await pg.query(
        `INSERT INTO tg_claim_tokens (kind, owner_user_id, expires_at) VALUES ($1, $2, $3) RETURNING token`,
        ['auth', ownerId, expires],
      );
      return r.rows[0].token;
    },
    async consumeAuthToken(token, tgUserId, tgUsername, tgFirstName) {
      const r = await pg.query(
        `SELECT * FROM tg_claim_tokens WHERE token = $1 AND kind = 'auth' AND consumed_at IS NULL AND expires_at > now() LIMIT 1`,
        [token],
      );
      if (r.rows.length === 0) throw new Error('invalid or expired token');
      const row = r.rows[0];
      await pg.query(`UPDATE tg_claim_tokens SET consumed_at = now() WHERE token = $1`, [token]);
      await pg.query(
        `INSERT INTO tg_user_identities (linkeon_user_id, tg_user_id, tg_username, tg_first_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (linkeon_user_id) DO UPDATE SET tg_user_id = EXCLUDED.tg_user_id, tg_username = EXCLUDED.tg_username, tg_first_name = EXCLUDED.tg_first_name`,
        [row.owner_user_id, tgUserId, tgUsername, tgFirstName],
      );
      return row.owner_user_id;
    },
  };
}

describe('tg-identity AUTH_TOKEN lifecycle', () => {
  test('создаёт токен и затем привязывает identity', async () => {
    const pg = makePgMock();
    const svc = makeIdentityService(pg);
    const tok = await svc.createAuthToken('owner-1');
    expect(tok).toMatch(/^[0-9a-f-]+$/);
    const userId = await svc.consumeAuthToken(tok, 123456, 'vasya', 'Вася');
    expect(userId).toBe('owner-1');
    expect(pg.state.identity).toEqual({ linkeon_user_id: 'owner-1', tg_user_id: 123456 });
  });

  test('повторное использование токена — ошибка', async () => {
    const pg = makePgMock();
    const svc = makeIdentityService(pg);
    const tok = await svc.createAuthToken('owner-1');
    await svc.consumeAuthToken(tok, 123456, 'vasya', 'Вася');
    await expect(svc.consumeAuthToken(tok, 123456, 'vasya', 'Вася')).rejects.toThrow('invalid or expired');
  });
});
```

- [ ] **Step 2: Запустить тест**

```bash
cd ~/Downloads/spirits_back/tests
npx jest unit/tgIdentityClaim
```
Ожидание: оба теста PASS (логика inline в тесте).

- [ ] **Step 3: Создать tg-identity.service.ts**

```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';

@Injectable()
export class TgIdentityService {
  private readonly logger = new Logger(TgIdentityService.name);
  private readonly TOKEN_TTL_MS = 15 * 60 * 1000;

  constructor(private readonly pg: PgService) {}

  async createAuthToken(ownerId: string): Promise<string> {
    const expires = new Date(Date.now() + this.TOKEN_TTL_MS);
    const r = await this.pg.query(
      `INSERT INTO tg_claim_tokens (kind, owner_user_id, expires_at)
       VALUES ('auth', $1, $2)
       RETURNING token`,
      [ownerId, expires],
    );
    return r.rows[0].token;
  }

  async consumeAuthToken(
    token: string,
    tgUserId: number,
    tgUsername: string | null,
    tgFirstName: string | null,
  ): Promise<string> {
    const r = await this.pg.query(
      `SELECT owner_user_id FROM tg_claim_tokens
        WHERE token = $1 AND kind = 'auth' AND consumed_at IS NULL AND expires_at > now()
        LIMIT 1`,
      [token],
    );
    if (r.rows.length === 0) {
      throw new BadRequestException('invalid or expired auth token');
    }
    const ownerId = r.rows[0].owner_user_id;
    await this.pg.query(
      `UPDATE tg_claim_tokens SET consumed_at = now() WHERE token = $1`,
      [token],
    );
    await this.pg.query(
      `INSERT INTO tg_user_identities (linkeon_user_id, tg_user_id, tg_username, tg_first_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (linkeon_user_id) DO UPDATE SET
         tg_user_id = EXCLUDED.tg_user_id,
         tg_username = EXCLUDED.tg_username,
         tg_first_name = EXCLUDED.tg_first_name`,
      [ownerId, tgUserId, tgUsername, tgFirstName],
    );
    return ownerId;
  }

  async getIdentityByLinkeonId(ownerId: string): Promise<{ tgUserId: number; tgUsername: string | null; tgFirstName: string | null } | null> {
    const r = await this.pg.query(
      `SELECT tg_user_id, tg_username, tg_first_name FROM tg_user_identities WHERE linkeon_user_id = $1 LIMIT 1`,
      [ownerId],
    );
    if (r.rows.length === 0) return null;
    return {
      tgUserId: Number(r.rows[0].tg_user_id),
      tgUsername: r.rows[0].tg_username,
      tgFirstName: r.rows[0].tg_first_name,
    };
  }

  async getLinkeonIdByTgUserId(tgUserId: number): Promise<string | null> {
    const r = await this.pg.query(
      `SELECT linkeon_user_id FROM tg_user_identities WHERE tg_user_id = $1 LIMIT 1`,
      [tgUserId],
    );
    return r.rows[0]?.linkeon_user_id ?? null;
  }
}
```

- [ ] **Step 4: Зарегистрировать в module**

В `tg-bot.module.ts` добавить `TgIdentityService` в providers и exports.

- [ ] **Step 5: Коммит**

```bash
git add src/tg-bot/tg-identity.service.ts src/tg-bot/tg-bot.module.ts tests/unit/tgIdentityClaim.test.js
git commit -m "feat(tg-bot): TgIdentityService + unit-тесты"
```

---

### Task 2.2: HTTP-эндпоинты identity-link и identity-status

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-bot-config.controller.ts`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.module.ts`

- [ ] **Step 1: Создать config-controller**

```typescript
import { Body, Controller, Get, Post, Param, Patch, Delete, Req, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { TgIdentityService } from './tg-identity.service';

@Controller('webhook/tg-bot')
@UseGuards(JwtGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class TgBotConfigController {
  constructor(private readonly identity: TgIdentityService) {}

  @Get('identity-status')
  async identityStatus(@CurrentUser() user: any, @Res() res: Response) {
    const id = await this.identity.getIdentityByLinkeonId(user.userId);
    if (!id) return res.status(200).json({ bound: false });
    return res.status(200).json({
      bound: true,
      tgUsername: id.tgUsername,
      tgFirstName: id.tgFirstName,
    });
  }

  @Post('identity-link')
  async identityLink(@CurrentUser() user: any, @Res() res: Response) {
    const token = await this.identity.createAuthToken(user.userId);
    const botUsername = process.env.TG_BOT_USERNAME || 'LinkeonAgentBot';
    const deepLink = `https://t.me/${botUsername}?start=${token}`;
    return res.status(200).json({ token, deepLink });
  }
}
```

- [ ] **Step 2: Зарегистрировать в module**

В `tg-bot.module.ts` добавить `TgBotConfigController` в `controllers`.

- [ ] **Step 3: Добавить TG_BOT_USERNAME в .env.example**

```bash
echo "TG_BOT_USERNAME=LinkeonAgentBot" >> ~/Downloads/spirits_back/.env.example
```

- [ ] **Step 4: Коммит**

```bash
git add src/tg-bot/tg-bot-config.controller.ts src/tg-bot/tg-bot.module.ts .env.example
git commit -m "feat(tg-bot): эндпоинты identity-status и identity-link"
```

---

### Task 2.3: Обработка /start AUTH_TOKEN в DM

**Files:**
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.service.ts`

- [ ] **Step 1: Добавить роутинг в handleUpdate**

Заменить заглушку `handleUpdate` в `tg-bot.service.ts`:

```typescript
constructor(
  private readonly pg: PgService,
  private readonly identity: TgIdentityService,
  private readonly grammy: TgGrammyClient,
) {}

async handleUpdate(update: any): Promise<void> {
  try {
    const msg = update.message ?? update.edited_message;
    if (msg) {
      await this.handleMessage(msg);
      return;
    }
    if (update.my_chat_member) {
      await this.handleMyChatMember(update.my_chat_member);
      return;
    }
  } catch (e: any) {
    this.logger.error(`handleUpdate failed: ${e.message}\n${e.stack}`);
  }
}

private async handleMessage(msg: any): Promise<void> {
  // Защиты от петель и сервисных сообщений
  if (msg.from?.is_bot) return;
  if (msg.new_chat_members || msg.left_chat_member || msg.pinned_message) return;

  const chatType = msg.chat?.type;  // 'private' | 'group' | 'supergroup' | 'channel'

  // DM с /start AUTH_TOKEN — identity binding
  if (chatType === 'private' && msg.text?.startsWith('/start ')) {
    const token = msg.text.substring('/start '.length).trim();
    await this.handleDmStart(msg, token);
    return;
  }

  // DM просто /start без аргументов
  if (chatType === 'private' && msg.text === '/start') {
    await this.grammy.sendMessage(msg.chat.id, 'Привет! Для подключения зайди в Linkeon и нажми «Подключить Telegram».');
    return;
  }

  // Group — будет обработано в следующих фазах
  if (chatType === 'group' || chatType === 'supergroup') {
    // TODO: claim + router (Phase 3+)
  }
}

private async handleMyChatMember(_event: any): Promise<void> {
  // TODO: kick / archive (Phase 9)
}

private async handleDmStart(msg: any, token: string): Promise<void> {
  try {
    const ownerId = await this.identity.consumeAuthToken(
      token,
      msg.from.id,
      msg.from.username ?? null,
      msg.from.first_name ?? null,
    );
    await this.grammy.sendMessage(
      msg.chat.id,
      `Привет, ${msg.from.first_name}! Твой Telegram привязан к Linkeon. Теперь возвращайся в кабинет и создавай ботов для групп.`,
    );
    this.logger.log(`identity bound: linkeon=${ownerId} tg=${msg.from.id}`);
  } catch (e: any) {
    await this.grammy.sendMessage(
      msg.chat.id,
      `Не получилось привязать: ${e.message}. Сгенерируй новую ссылку в Linkeon (старая могла истечь — TTL 15 минут).`,
    );
  }
}
```

Обновить импорты:
```typescript
import { TgIdentityService } from './tg-identity.service';
import { TgGrammyClient } from './tg-grammy.client';
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

- [ ] **Step 3: Коммит**

```bash
git add src/tg-bot/tg-bot.service.ts
git commit -m "feat(tg-bot): обработка /start AUTH_TOKEN в DM (identity binding)"
```

---

## Phase 3: Config CRUD + Claim flow

### Task 3.1: tg-config.service — CRUD pending/active configs

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-config.service.ts`
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-bot.dto.ts`

- [ ] **Step 1: Создать DTO**

```typescript
import { IsEnum, IsOptional, IsString, IsUUID, MinLength, MaxLength } from 'class-validator';

export class CreateBotConfigDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;

  @IsOptional()
  @IsString()
  presetAgentId?: string;

  @IsOptional()
  @IsUUID()
  customAgentId?: string;

  @IsEnum(['strict', 'always', 'smart'])
  addressingMode!: 'strict' | 'always' | 'smart';

  @IsEnum(['never', 'mirror', 'always'])
  voiceReplyMode!: 'never' | 'mirror' | 'always';
}

export class UpdateBotConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  presetAgentId?: string;

  @IsOptional()
  @IsUUID()
  customAgentId?: string;

  @IsOptional()
  @IsEnum(['strict', 'always', 'smart'])
  addressingMode?: 'strict' | 'always' | 'smart';

  @IsOptional()
  @IsEnum(['never', 'mirror', 'always'])
  voiceReplyMode?: 'never' | 'mirror' | 'always';
}
```

- [ ] **Step 2: Создать tg-config.service**

```typescript
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { TgGrammyClient } from './tg-grammy.client';

export interface TgBotConfigRow {
  id: string;
  owner_user_id: string;
  tg_chat_id: string | null;
  tg_chat_title: string | null;
  display_name: string;
  preset_agent_id: string | null;
  custom_agent_id: string | null;
  addressing_mode: 'strict' | 'always' | 'smart';
  voice_reply_mode: 'never' | 'mirror' | 'always';
  status: 'pending' | 'active' | 'silent' | 'archived' | 'deleted';
  last_low_balance_dm_at: string | null;
  last_zero_balance_msg_at: string | null;
  last_reply_at: string | null;
  created_at: string;
  archived_at: string | null;
}

@Injectable()
export class TgConfigService {
  private readonly logger = new Logger(TgConfigService.name);
  private readonly CLAIM_TTL_MS = 15 * 60 * 1000;

  constructor(
    private readonly pg: PgService,
    private readonly grammy: TgGrammyClient,
  ) {}

  async createPending(
    ownerId: string,
    data: {
      displayName: string;
      presetAgentId?: string;
      customAgentId?: string;
      addressingMode: 'strict' | 'always' | 'smart';
      voiceReplyMode: 'never' | 'mirror' | 'always';
    },
  ): Promise<{ config: TgBotConfigRow; claimToken: string; deepLink: string }> {
    if (!data.presetAgentId && !data.customAgentId) {
      throw new BadRequestException('either presetAgentId or customAgentId required');
    }
    if (data.presetAgentId && data.customAgentId) {
      throw new BadRequestException('only one of presetAgentId/customAgentId');
    }
    // Создаём pending-конфиг
    const cfgRes = await this.pg.query(
      `INSERT INTO tg_bot_configs (
         owner_user_id, display_name, preset_agent_id, custom_agent_id,
         addressing_mode, voice_reply_mode, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        ownerId,
        data.displayName.trim(),
        data.presetAgentId ?? null,
        data.customAgentId ?? null,
        data.addressingMode,
        data.voiceReplyMode,
      ],
    );
    const config: TgBotConfigRow = cfgRes.rows[0];

    // Генерируем CLAIM_TOKEN, привязанный к этому конфигу
    const expires = new Date(Date.now() + this.CLAIM_TTL_MS);
    const tokRes = await this.pg.query(
      `INSERT INTO tg_claim_tokens (kind, owner_user_id, config_id, expires_at)
       VALUES ('claim', $1, $2, $3)
       RETURNING token`,
      [ownerId, config.id, expires],
    );
    const claimToken = tokRes.rows[0].token;

    const botUsername = process.env.TG_BOT_USERNAME || 'LinkeonAgentBot';
    const deepLink = `https://t.me/${botUsername}?startgroup=${claimToken}`;

    return { config, claimToken, deepLink };
  }

  async listForOwner(ownerId: string): Promise<TgBotConfigRow[]> {
    const r = await this.pg.query(
      `SELECT * FROM tg_bot_configs
        WHERE owner_user_id = $1 AND status != 'deleted'
        ORDER BY created_at DESC`,
      [ownerId],
    );
    return r.rows;
  }

  async getById(id: string, ownerId: string): Promise<TgBotConfigRow> {
    const r = await this.pg.query(
      `SELECT * FROM tg_bot_configs WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
      [id, ownerId],
    );
    if (r.rows.length === 0) throw new NotFoundException(`config ${id} not found`);
    return r.rows[0];
  }

  async update(
    id: string,
    ownerId: string,
    patch: {
      displayName?: string;
      presetAgentId?: string;
      customAgentId?: string;
      addressingMode?: 'strict' | 'always' | 'smart';
      voiceReplyMode?: 'never' | 'mirror' | 'always';
    },
  ): Promise<TgBotConfigRow> {
    await this.getById(id, ownerId);
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (patch.displayName !== undefined) { fields.push(`display_name = $${idx++}`); params.push(patch.displayName.trim()); }
    if (patch.presetAgentId !== undefined) {
      fields.push(`preset_agent_id = $${idx++}`); params.push(patch.presetAgentId || null);
      fields.push(`custom_agent_id = NULL`);
    }
    if (patch.customAgentId !== undefined) {
      fields.push(`custom_agent_id = $${idx++}`); params.push(patch.customAgentId || null);
      fields.push(`preset_agent_id = NULL`);
    }
    if (patch.addressingMode !== undefined) { fields.push(`addressing_mode = $${idx++}`); params.push(patch.addressingMode); }
    if (patch.voiceReplyMode !== undefined) { fields.push(`voice_reply_mode = $${idx++}`); params.push(patch.voiceReplyMode); }
    if (fields.length === 0) return this.getById(id, ownerId);
    params.push(id, ownerId);
    const r = await this.pg.query(
      `UPDATE tg_bot_configs SET ${fields.join(', ')} WHERE id = $${idx++} AND owner_user_id = $${idx} RETURNING *`,
      params,
    );
    return r.rows[0];
  }

  async archive(id: string, ownerId: string): Promise<void> {
    const cfg = await this.getById(id, ownerId);
    if (cfg.tg_chat_id && ['active', 'silent'].includes(cfg.status)) {
      try {
        await this.grammy.leaveChat(Number(cfg.tg_chat_id));
      } catch (e: any) {
        this.logger.warn(`leaveChat failed for ${cfg.tg_chat_id}: ${e.message}`);
      }
    }
    await this.pg.query(
      `UPDATE tg_bot_configs SET status = 'archived', archived_at = now() WHERE id = $1`,
      [id],
    );
  }

  async getActiveByTgChatId(tgChatId: number): Promise<TgBotConfigRow | null> {
    const r = await this.pg.query(
      `SELECT * FROM tg_bot_configs WHERE tg_chat_id = $1 AND status IN ('active','silent') LIMIT 1`,
      [tgChatId],
    );
    return r.rows[0] ?? null;
  }

  async getMessagesForConfig(configId: string, ownerId: string, limit: number = 50): Promise<any[]> {
    await this.getById(configId, ownerId);  // owner check
    const r = await this.pg.query(
      `SELECT id, tg_user_id, tg_user_name, role, content, content_type, tokens_charged, created_at
         FROM tg_bot_messages
        WHERE config_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [configId, limit],
    );
    return r.rows;
  }
}
```

- [ ] **Step 3: Зарегистрировать в module**

`TgConfigService` в providers + exports.

- [ ] **Step 4: Коммит**

```bash
git add src/tg-bot/tg-config.service.ts src/tg-bot/tg-bot.dto.ts src/tg-bot/tg-bot.module.ts
git commit -m "feat(tg-bot): TgConfigService — CRUD + DTO"
```

---

### Task 3.2: HTTP-эндпоинты для config CRUD

**Files:**
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot-config.controller.ts`

- [ ] **Step 1: Добавить методы в TgBotConfigController**

Заменить content контроллера на полный (отступы и стиль как в текущем):

```typescript
import { Body, Controller, Get, Post, Param, Patch, Delete, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { TgIdentityService } from './tg-identity.service';
import { TgConfigService, TgBotConfigRow } from './tg-config.service';
import { CreateBotConfigDto, UpdateBotConfigDto } from './tg-bot.dto';

@Controller('webhook/tg-bot')
@UseGuards(JwtGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class TgBotConfigController {
  constructor(
    private readonly identity: TgIdentityService,
    private readonly configs: TgConfigService,
  ) {}

  @Get('identity-status')
  async identityStatus(@CurrentUser() user: any, @Res() res: Response) {
    const id = await this.identity.getIdentityByLinkeonId(user.userId);
    if (!id) return res.status(200).json({ bound: false });
    return res.status(200).json({ bound: true, tgUsername: id.tgUsername, tgFirstName: id.tgFirstName });
  }

  @Post('identity-link')
  async identityLink(@CurrentUser() user: any, @Res() res: Response) {
    const token = await this.identity.createAuthToken(user.userId);
    const botUsername = process.env.TG_BOT_USERNAME || 'LinkeonAgentBot';
    return res.status(200).json({ token, deepLink: `https://t.me/${botUsername}?start=${token}` });
  }

  @Get('configs')
  async list(@CurrentUser() user: any, @Res() res: Response) {
    const rows = await this.configs.listForOwner(user.userId);
    return res.status(200).json(rows.map(this.toJson));
  }

  @Post('configs')
  async create(@CurrentUser() user: any, @Body() dto: CreateBotConfigDto, @Res() res: Response) {
    const result = await this.configs.createPending(user.userId, dto);
    return res.status(201).json({
      config: this.toJson(result.config),
      claimToken: result.claimToken,
      deepLink: result.deepLink,
    });
  }

  @Get('configs/:id')
  async detail(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const cfg = await this.configs.getById(id, user.userId);
    return res.status(200).json(this.toJson(cfg));
  }

  @Patch('configs/:id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateBotConfigDto,
    @Res() res: Response,
  ) {
    const cfg = await this.configs.update(id, user.userId, dto);
    return res.status(200).json(this.toJson(cfg));
  }

  @Delete('configs/:id')
  async remove(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    await this.configs.archive(id, user.userId);
    return res.status(200).json({ ok: true });
  }

  @Get('configs/:id/messages')
  async messages(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const rows = await this.configs.getMessagesForConfig(id, user.userId);
    return res.status(200).json(rows);
  }

  private toJson(cfg: TgBotConfigRow) {
    return {
      id: cfg.id,
      tgChatId: cfg.tg_chat_id ? String(cfg.tg_chat_id) : null,
      tgChatTitle: cfg.tg_chat_title,
      displayName: cfg.display_name,
      presetAgentId: cfg.preset_agent_id,
      customAgentId: cfg.custom_agent_id,
      addressingMode: cfg.addressing_mode,
      voiceReplyMode: cfg.voice_reply_mode,
      status: cfg.status,
      lastReplyAt: cfg.last_reply_at,
      createdAt: cfg.created_at,
      archivedAt: cfg.archived_at,
    };
  }
}
```

- [ ] **Step 2: Build**

```bash
pnpm build
```

- [ ] **Step 3: Коммит**

```bash
git commit -am "feat(tg-bot): HTTP-эндпоинты config CRUD"
```

---

### Task 3.3: tg-claim.service + обработка /start CLAIM_TOKEN в группе

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-claim.service.ts`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.service.ts`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.module.ts`

- [ ] **Step 1: Создать tg-claim.service**

```typescript
import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { TgIdentityService } from './tg-identity.service';

@Injectable()
export class TgClaimService {
  private readonly logger = new Logger(TgClaimService.name);

  constructor(
    private readonly pg: PgService,
    private readonly identity: TgIdentityService,
  ) {}

  /**
   * Привязка pending-config к группе по CLAIM_TOKEN.
   * Возвращает activated config row или бросает исключение.
   */
  async claim(
    token: string,
    tgUserId: number,
    tgChatId: number,
    tgChatTitle: string | null,
  ): Promise<{ ownerUserId: string; configId: string; displayName: string }> {
    // 1. Найти токен
    const tokRes = await this.pg.query(
      `SELECT t.owner_user_id, t.config_id, c.display_name
         FROM tg_claim_tokens t
         LEFT JOIN tg_bot_configs c ON c.id = t.config_id
        WHERE t.token = $1 AND t.kind = 'claim'
          AND t.consumed_at IS NULL AND t.expires_at > now()
        LIMIT 1`,
      [token],
    );
    if (tokRes.rows.length === 0) {
      throw new BadRequestException('invalid or expired claim token');
    }
    const { owner_user_id: ownerId, config_id: configId, display_name: displayName } = tokRes.rows[0];

    // 2. Проверить identity владельца — он должен быть привязан и совпадать с tgUserId
    const expectedTgUserId = await this.identity.getIdentityByLinkeonId(ownerId);
    if (!expectedTgUserId || expectedTgUserId.tgUserId !== tgUserId) {
      throw new BadRequestException('claim token не принадлежит этому Telegram-аккаунту');
    }

    // 3. Проверить что группа не занята другим конфигом
    const conflictRes = await this.pg.query(
      `SELECT id FROM tg_bot_configs
        WHERE tg_chat_id = $1 AND status IN ('active','silent') AND id != $2 LIMIT 1`,
      [tgChatId, configId],
    );
    if (conflictRes.rows.length > 0) {
      throw new ConflictException('эта группа уже привязана к другому аккаунту Linkeon');
    }

    // 4. Активировать конфиг + пометить токен использованным
    await this.pg.query(
      `UPDATE tg_bot_configs SET tg_chat_id = $1, tg_chat_title = $2, status = 'active'
        WHERE id = $3`,
      [tgChatId, tgChatTitle, configId],
    );
    await this.pg.query(
      `UPDATE tg_claim_tokens SET consumed_at = now() WHERE token = $1`,
      [token],
    );

    return { ownerUserId: ownerId, configId, displayName };
  }
}
```

- [ ] **Step 2: Зарегистрировать в module**

`TgClaimService` в providers + exports.

- [ ] **Step 3: Дописать handleMessage в tg-bot.service для группового /start**

В `handleMessage` после блока «DM с /start» добавить ветку для группы. Заменить блок `// Group — будет обработано в следующих фазах`:

```typescript
if (chatType === 'group' || chatType === 'supergroup') {
  // /start CLAIM_TOKEN в группе — активация бота
  if (msg.text?.startsWith('/start ')) {
    const token = msg.text.substring('/start '.length).trim();
    await this.handleGroupClaim(msg, token);
    return;
  }
  // Обработка сообщений активного бота — Phase 4+
  // TODO: route to TgRouterService
  return;
}

if (chatType === 'channel') {
  // Каналы не поддерживаем
  try {
    await this.grammy.leaveChat(msg.chat.id);
  } catch {}
  return;
}
```

Добавить новый приватный метод:

```typescript
private async handleGroupClaim(msg: any, token: string): Promise<void> {
  try {
    const result = await this.claim.claim(
      token,
      msg.from.id,
      msg.chat.id,
      msg.chat.title ?? null,
    );
    await this.grammy.sendMessage(
      msg.chat.id,
      `Я ${result.displayName}. Зови меня @${process.env.TG_BOT_USERNAME || 'LinkeonAgentBot'} или ответом на это сообщение.`,
    );
    this.logger.log(`config ${result.configId} activated for chat ${msg.chat.id}`);
  } catch (e: any) {
    const ownerTgId = msg.from.id;
    try {
      await this.grammy.sendMessage(ownerTgId, `Не получилось привязать бота: ${e.message}`);
    } catch {}
    this.logger.warn(`claim failed for chat ${msg.chat.id}: ${e.message}`);
    // Если конфликт или ошибка — бот выйдет если был добавлен
    try { await this.grammy.leaveChat(msg.chat.id); } catch {}
  }
}
```

Обновить конструктор service:
```typescript
constructor(
  private readonly pg: PgService,
  private readonly identity: TgIdentityService,
  private readonly claim: TgClaimService,
  private readonly grammy: TgGrammyClient,
) {}
```

- [ ] **Step 4: Build + коммит**

```bash
pnpm build
git add src/tg-bot/
git commit -m "feat(tg-bot): claim flow — /start CLAIM_TOKEN в группе"
```

---

## Phase 4: Router — strict mode + текстовые ответы

### Task 4.1: tg-router.service — детектор триггеров режима A

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-router.service.ts`
- Create: `~/Downloads/spirits_back/tests/unit/tgRouterTriggers.test.js`

- [ ] **Step 1: Написать падающий unit-тест**

```javascript
/**
 * Unit-tests для shouldRespondStrict — детектор триггеров режима A.
 * Inline-копия — как другие тесты в каталоге.
 */

function shouldRespondStrict(msg, botUsername, displayName, botUserId) {
  const text = String(msg.text || msg.transcript || '').toLowerCase();
  if (!text) return false;
  // 1. @-mention
  if (text.includes(`@${botUsername.toLowerCase()}`)) return true;
  // 2. Reply на сообщение бота
  if (msg.reply_to_message?.from?.id === botUserId) return true;
  // 3. display_name в тексте (substring)
  if (displayName && text.includes(displayName.toLowerCase())) return true;
  // 4. /команда (не /start) — в этой ветке только /help|balance|silent|resume
  if (/^\/(help|balance|silent|resume)(\s|@|$)/.test(text)) return true;
  return false;
}

describe('shouldRespondStrict', () => {
  const ctx = { botUsername: 'LinkeonAgentBot', displayName: 'Финансист', botUserId: 9999 };

  test('@mention триггерит', () => {
    expect(shouldRespondStrict({ text: 'эй @LinkeonAgentBot скажи что-то' }, ctx.botUsername, ctx.displayName, ctx.botUserId)).toBe(true);
  });
  test('reply на сообщение бота триггерит', () => {
    expect(shouldRespondStrict({ text: 'ну?', reply_to_message: { from: { id: 9999 } } }, ctx.botUsername, ctx.displayName, ctx.botUserId)).toBe(true);
  });
  test('display_name (case-insensitive) триггерит', () => {
    expect(shouldRespondStrict({ text: 'спросим финансиста что думает' }, ctx.botUsername, ctx.displayName, ctx.botUserId)).toBe(true);
  });
  test('обычное сообщение не триггерит', () => {
    expect(shouldRespondStrict({ text: 'привет ребят, как сегодня день' }, ctx.botUsername, ctx.displayName, ctx.botUserId)).toBe(false);
  });
  test('/help триггерит', () => {
    expect(shouldRespondStrict({ text: '/help' }, ctx.botUsername, ctx.displayName, ctx.botUserId)).toBe(true);
  });
  test('/start не триггерит роутер (он обрабатывается отдельно)', () => {
    expect(shouldRespondStrict({ text: '/start' }, ctx.botUsername, ctx.displayName, ctx.botUserId)).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить тест**

```bash
cd ~/Downloads/spirits_back/tests
npx jest unit/tgRouterTriggers
```
Ожидание: PASS.

- [ ] **Step 3: Создать tg-router.service.ts (только триггеры пока)**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { TgGrammyClient } from './tg-grammy.client';
import { TgConfigService, TgBotConfigRow } from './tg-config.service';

export interface IncomingMessageContext {
  chatId: number;
  msgId: number;
  fromTgUserId: number;
  fromTgUserName: string | null;
  text: string;
  replyToBotMessageId?: number;
  replyToFromBot?: boolean;
  isVoice: boolean;
  voiceFileId?: string;
}

@Injectable()
export class TgRouterService {
  private readonly logger = new Logger(TgRouterService.name);
  private cachedBotUserId: number | null = null;

  constructor(
    private readonly pg: PgService,
    private readonly grammy: TgGrammyClient,
    private readonly configs: TgConfigService,
  ) {}

  private async getBotUserId(): Promise<number> {
    if (this.cachedBotUserId !== null) return this.cachedBotUserId;
    const me = await this.grammy.getBot().api.getMe();
    this.cachedBotUserId = me.id;
    return me.id;
  }

  private shouldRespondStrict(
    text: string,
    botUsername: string,
    displayName: string,
    replyToFromBot: boolean,
  ): boolean {
    const lo = text.toLowerCase();
    if (!lo) return false;
    if (lo.includes(`@${botUsername.toLowerCase()}`)) return true;
    if (replyToFromBot) return true;
    if (displayName && lo.includes(displayName.toLowerCase())) return true;
    if (/^\/(help|balance|silent|resume)(\s|@|$)/.test(lo)) return true;
    return false;
  }

  /**
   * Main entry point — вызывается из TgBotService.handleMessage для сообщений
   * в группе с активным конфигом. Возвращает true если бот должен ответить.
   */
  async shouldRespond(
    cfg: TgBotConfigRow,
    ctx: IncomingMessageContext,
  ): Promise<boolean> {
    if (cfg.status === 'silent') return false;
    const botUsername = process.env.TG_BOT_USERNAME || 'LinkeonAgentBot';

    if (cfg.addressing_mode === 'strict') {
      return this.shouldRespondStrict(
        ctx.text,
        botUsername,
        cfg.display_name,
        !!ctx.replyToFromBot,
      );
    }

    if (cfg.addressing_mode === 'always') {
      // Rate-limit 3 сек
      if (cfg.last_reply_at) {
        const elapsed = Date.now() - new Date(cfg.last_reply_at).getTime();
        if (elapsed < 3000) return false;
      }
      return true;
    }

    if (cfg.addressing_mode === 'smart') {
      // Rate-limit 60 сек
      if (cfg.last_reply_at) {
        const elapsed = Date.now() - new Date(cfg.last_reply_at).getTime();
        if (elapsed < 60_000) return false;
      }
      // Гейт через Haiku — реализуется в Phase 5
      // Пока — fallback на strict (защитная заглушка)
      return this.shouldRespondStrict(
        ctx.text,
        botUsername,
        cfg.display_name,
        !!ctx.replyToFromBot,
      );
    }

    return false;
  }
}
```

- [ ] **Step 4: Зарегистрировать в module**

`TgRouterService` в providers + exports.

- [ ] **Step 5: Коммит**

```bash
git add src/tg-bot/tg-router.service.ts src/tg-bot/tg-bot.module.ts tests/unit/tgRouterTriggers.test.js
git commit -m "feat(tg-bot): TgRouterService с детектором триггеров + unit-тесты"
```

---

### Task 4.2: LLM-вызов через Anthropic SDK + persist истории

**Files:**
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-router.service.ts`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.module.ts` (импорт AgentsService)

- [ ] **Step 1: Расширить TgRouterService**

Добавить в класс:

```typescript
import { AgentsService } from '../agents/agents.service';
import { ClaudeCliService } from '../common/services/claude-cli.service';

// расширить конструктор (ClaudeCliService — OAuth-вызов через локальный
// claude CLI, БЕЗ ANTHROPIC_API_KEY. Это project-wide стандарт после
// миграции на subscription-auth — см. chat.service / tasks.service /
// custom-agents.service)
constructor(
  private readonly pg: PgService,
  private readonly grammy: TgGrammyClient,
  private readonly configs: TgConfigService,
  private readonly agents: AgentsService,
  private readonly claudeCli: ClaudeCliService,
) {}

/**
 * Resolve system prompt по конфигу: либо preset из agents-table, либо custom_agents.
 */
private async resolveSystemPrompt(cfg: TgBotConfigRow): Promise<{ name: string; systemPrompt: string }> {
  if (cfg.custom_agent_id) {
    const r = await this.pg.query(
      `SELECT name, system_prompt FROM custom_agents WHERE id = $1 LIMIT 1`,
      [cfg.custom_agent_id],
    );
    if (r.rows[0]) return { name: r.rows[0].name, systemPrompt: r.rows[0].system_prompt };
  }
  if (cfg.preset_agent_id) {
    const preset = await this.agents.getAgentById(cfg.preset_agent_id);
    if (preset) return { name: preset.name, systemPrompt: preset.system_prompt };
  }
  throw new Error(`Config ${cfg.id} has no resolvable agent`);
}

/**
 * Сохранить входящее сообщение в историю.
 */
async persistUserMessage(cfg: TgBotConfigRow, ctx: IncomingMessageContext): Promise<void> {
  await this.pg.query(
    `INSERT INTO tg_bot_messages (config_id, tg_chat_id, tg_message_id, tg_user_id, tg_user_name, role, content, content_type, tokens_charged)
     VALUES ($1, $2, $3, $4, $5, 'user', $6, $7, 0)`,
    [
      cfg.id,
      ctx.chatId,
      ctx.msgId,
      ctx.fromTgUserId,
      ctx.fromTgUserName,
      ctx.text,
      ctx.isVoice ? 'voice_transcript' : 'text',
    ],
  );
}

/**
 * Последние 20 сообщений в формате для Claude messages API.
 */
private async loadHistory(configId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const r = await this.pg.query(
    `SELECT role, tg_user_name, content
       FROM tg_bot_messages
      WHERE config_id = $1 AND role IN ('user','assistant')
      ORDER BY created_at DESC
      LIMIT 20`,
    [configId],
  );
  const rows = r.rows.reverse();  // chronological
  return rows.map((row: any) => ({
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.role === 'user' ? `[${row.tg_user_name || 'user'}]: ${row.content}` : row.content,
  }));
}

/**
 * Вызов Claude через ClaudeCliService (OAuth, no API key).
 * История диалога склеивается в одну строку и идёт как user-prompt;
 * system prompt передаётся отдельно. CLI возвращает уже подсчитанный cost.
 */
async generateReply(cfg: TgBotConfigRow, ownerFirstName: string): Promise<{ text: string; costUsd: number }> {
  const { systemPrompt } = await this.resolveSystemPrompt(cfg);
  const history = await this.loadHistory(cfg.id);

  const systemWithCtx = `Ты в Telegram-группе. Владелец бота, который платит за твою работу: ${ownerFirstName}. Текущая дата/время: ${new Date().toISOString()}.

${systemPrompt}`;

  // ClaudeCliService.text() — one-shot, без streaming. Это OK для Telegram-бота
  // (мы всё равно ждём полный ответ, чтобы sendMessage). История склеивается
  // в одну user-строку — CLI принимает только prompt + system (см. claude-cli.service.ts).
  const userPrompt = history.length > 0
    ? history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    : '(empty conversation — say hello)';

  const { text, costUsd } = await this.claudeCli.textWithCost(userPrompt, {
    system: systemWithCtx,
    model: 'claude-sonnet-4-6',
    timeoutMs: 90_000,
  });

  return { text: text.trim() || '...', costUsd };
}

async persistAssistantReply(cfg: TgBotConfigRow, content: string, contentType: 'text' | 'voice_reply', tokensCharged: number): Promise<void> {
  await this.pg.query(
    `INSERT INTO tg_bot_messages (config_id, tg_chat_id, role, content, content_type, tokens_charged)
     VALUES ($1, $2, 'assistant', $3, $4, $5)`,
    [cfg.id, Number(cfg.tg_chat_id), content, contentType, tokensCharged],
  );
  await this.pg.query(
    `UPDATE tg_bot_configs SET last_reply_at = now() WHERE id = $1`,
    [cfg.id],
  );
}
```

В импорты файла добавить `AgentsService` и `ClaudeCliService`.

- [ ] **Step 2: Импортировать AgentsModule + CommonModule в TgBotModule**

`ClaudeCliService` экспортируется из `CommonModule` (см. `src/common/common.module.ts`).

В `tg-bot.module.ts`:
```typescript
import { AgentsModule } from '../agents/agents.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [AgentsModule, CommonModule],
  ...
})
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Коммит**

```bash
git commit -am "feat(tg-bot): LLM-вызов через ClaudeCliService (OAuth) + persist истории"
```

---

### Task 4.3: Wire router в handleMessage + advisory-lock per chat

**Files:**
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.service.ts`

- [ ] **Step 1: Расширить TgBotService**

Добавить в конструктор `TgRouterService` и `TgConfigService`. Заменить блок «TODO: route to TgRouterService» в `handleMessage`:

```typescript
if (chatType === 'group' || chatType === 'supergroup') {
  if (msg.text?.startsWith('/start ')) {
    const token = msg.text.substring('/start '.length).trim();
    await this.handleGroupClaim(msg, token);
    return;
  }
  await this.handleGroupMessage(msg);
  return;
}
```

Добавить новый метод:

```typescript
private async handleGroupMessage(msg: any): Promise<void> {
  const cfg = await this.configs.getActiveByTgChatId(msg.chat.id);
  if (!cfg) return;  // бот добавлен но нет активного конфига (краевой случай)

  // Извлекаем текст / voice file id
  const isVoice = !!(msg.voice || msg.audio);
  const text = msg.text ?? msg.caption ?? '';

  // Для voice — транскрипция (будет в Phase 6). Пока — игнорим если нет текста.
  if (isVoice) {
    this.logger.debug(`voice message in chat ${msg.chat.id} — STT pipeline not implemented yet`);
    return;
  }

  const botUserId = await this.getBotUserIdCached();

  const ctx = {
    chatId: msg.chat.id,
    msgId: msg.message_id,
    fromTgUserId: msg.from.id,
    fromTgUserName: msg.from.first_name ?? msg.from.username ?? null,
    text,
    replyToBotMessageId: msg.reply_to_message?.message_id,
    replyToFromBot: msg.reply_to_message?.from?.id === botUserId,
    isVoice: false,
  };

  // Advisory-lock per chat — последовательная обработка
  const lockId = this.hashLock(`tg-chat:${msg.chat.id}`);
  const lockRes = await this.pg.query(`SELECT pg_try_advisory_lock($1)`, [lockId]);
  if (!lockRes.rows[0].pg_try_advisory_lock) {
    this.logger.debug(`chat ${msg.chat.id} busy, skipping`);
    return;
  }

  try {
    await this.router.persistUserMessage(cfg, ctx);

    const should = await this.router.shouldRespond(cfg, ctx);
    if (!should) return;

    // TODO: тут будут команды /help /balance /silent /resume — Phase 8
    // Пока сразу LLM-путь

    // Получить first_name владельца для system prompt
    const ownerRes = await this.pg.query(
      `SELECT first_name FROM users WHERE id = $1 LIMIT 1`,
      [cfg.owner_user_id],
    );
    const ownerFirstName = ownerRes.rows[0]?.first_name ?? 'Linkeon-пользователь';

    const reply = await this.router.generateReply(cfg, ownerFirstName);
    await this.grammy.sendMessage(msg.chat.id, reply.text, {
      reply_to_message_id: msg.message_id,
    });

    // Билтинг будет в Phase 7 — пока tokensCharged=0
    await this.router.persistAssistantReply(cfg, reply.text, 'text', 0);
  } finally {
    await this.pg.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
  }
}

private async getBotUserIdCached(): Promise<number> {
  if (this.botUserIdCache !== null) return this.botUserIdCache;
  const me = await this.grammy.getBot().api.getMe();
  this.botUserIdCache = me.id;
  return me.id;
}
private botUserIdCache: number | null = null;

private hashLock(key: string): number {
  // hashtext-эквивалент: возвращает 32-битный знаковый int
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return h;
}
```

В импорты добавить `TgRouterService`, `TgConfigService`.

- [ ] **Step 2: Build**

```bash
pnpm build
```

- [ ] **Step 3: Коммит**

```bash
git commit -am "feat(tg-bot): wire router в handleGroupMessage + advisory-lock"
```

---

## Phase 5: Smart-gate (mode C)

### Task 5.1: Smart-gate через Haiku 4.5

**Files:**
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-router.service.ts`

- [ ] **Step 1: Заменить заглушку в `shouldRespond` для режима smart**

В методе `shouldRespond` блок `if (cfg.addressing_mode === 'smart')` — заменить fallback на реальный вызов:

```typescript
if (cfg.addressing_mode === 'smart') {
  if (cfg.last_reply_at) {
    const elapsed = Date.now() - new Date(cfg.last_reply_at).getTime();
    if (elapsed < 60_000) return false;
  }
  // 1. Если триггер сработал явно (как в strict) — пускаем сразу, без гейта
  const botUsername = process.env.TG_BOT_USERNAME || 'LinkeonAgentBot';
  if (this.shouldRespondStrict(ctx.text, botUsername, cfg.display_name, !!ctx.replyToFromBot)) {
    return true;
  }
  // 2. Иначе — гейт через Haiku
  return await this.smartGate(cfg, ctx);
}
```

- [ ] **Step 2: Добавить метод smartGate**

```typescript
private async smartGate(cfg: TgBotConfigRow, ctx: IncomingMessageContext): Promise<boolean> {
  const { systemPrompt } = await this.resolveSystemPrompt(cfg);
  // Последние 10 сообщений как контекст
  const history = await this.loadHistory(cfg.id);
  const recent = history.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');

  const gatePrompt = `Роль ассистента: ${systemPrompt.substring(0, 500)}...

Последние сообщения группы:
${recent}

Новое сообщение от ${ctx.fromTgUserName || 'user'}: "${ctx.text}"

Должен ли этот ассистент вмешаться сейчас? Ответь строго "yes" или "no" — больше ничего.`;

  try {
    // ClaudeCliService через OAuth (тот же путь что generateReply).
    // Гейт — бесплатный для пользователя (мы не пробрасываем costUsd в billing
    // согласно спеку §5: «STT и smart-gate не списываются с владельца»).
    const text = await this.claudeCli.text(gatePrompt, {
      model: 'claude-haiku-4-5',
      timeoutMs: 15_000,
    });
    return text.trim().toLowerCase().startsWith('yes');
  } catch (e: any) {
    this.logger.warn(`smart-gate failed, defaulting to no: ${e.message}`);
    return false;
  }
}
```

- [ ] **Step 3: Build + коммит**

```bash
pnpm build
git commit -am "feat(tg-bot): smart-gate в режиме C через Haiku 4.5"
```

---

## Phase 6: Voice — Whisper STT + OpenAI TTS

### Task 6.1: tg-voice.service — Whisper STT

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-voice.service.ts`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.module.ts`

- [ ] **Step 1: Создать service**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';
import { TgGrammyClient } from './tg-grammy.client';

@Injectable()
export class TgVoiceService {
  private readonly logger = new Logger(TgVoiceService.name);
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(private readonly grammy: TgGrammyClient) {}

  async transcribe(fileId: string): Promise<string> {
    const file = await this.grammy.getFile(fileId);
    if (!file.file_path) throw new Error('no file_path in Telegram getFile response');
    const buf = await this.grammy.downloadFile(file.file_path);

    const resp = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: await toFile(buf, 'voice.oga', { type: 'audio/ogg' }),
      language: 'ru',
    });
    return resp.text.trim();
  }

  /**
   * Genera ttv .ogg / opus. Возвращает Buffer + стоимость в USD.
   */
  async synthesize(text: string): Promise<{ buffer: Buffer; costUsd: number }> {
    const resp = await this.openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
      response_format: 'opus',  // Telegram-friendly
    });
    const buffer = Buffer.from(await resp.arrayBuffer());
    // OpenAI TTS pricing: $15 / 1M characters
    const costUsd = (text.length / 1_000_000) * 15;
    return { buffer, costUsd };
  }
}
```

- [ ] **Step 2: Зарегистрировать в module**

`TgVoiceService` в providers + exports.

- [ ] **Step 3: Коммит**

```bash
git add src/tg-bot/tg-voice.service.ts src/tg-bot/tg-bot.module.ts
git commit -m "feat(tg-bot): TgVoiceService — Whisper STT + OpenAI TTS"
```

---

### Task 6.2: Wire voice in/out в handleGroupMessage

**Files:**
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.service.ts`

- [ ] **Step 1: Расширить handleGroupMessage**

В конструктор добавить `TgVoiceService`. Заменить блок «if (isVoice)» на:

```typescript
let voiceTtsCostUsd = 0;
let workingText = text;
let actualIsVoice = false;

if (isVoice) {
  const fileId = msg.voice?.file_id ?? msg.audio?.file_id;
  if (!fileId) return;
  try {
    workingText = await this.voice.transcribe(fileId);
    actualIsVoice = true;
    this.logger.log(`voice transcribed in chat ${msg.chat.id}: "${workingText.substring(0, 50)}..."`);
  } catch (e: any) {
    this.logger.warn(`STT failed: ${e.message}`);
    return;
  }
}
```

После `await this.router.persistUserMessage(cfg, ctx);` и LLM-вызова заменить блок `sendMessage` на условную отправку с учётом `voice_reply_mode`:

```typescript
const wantsVoice =
  cfg.voice_reply_mode === 'always' ||
  (cfg.voice_reply_mode === 'mirror' && actualIsVoice);

let contentType: 'text' | 'voice_reply' = 'text';
if (wantsVoice) {
  try {
    const tts = await this.voice.synthesize(reply.text);
    voiceTtsCostUsd = tts.costUsd;
    await this.grammy.sendVoice(msg.chat.id, tts.buffer, {
      reply_to_message_id: msg.message_id,
      caption: reply.text.substring(0, 1024),  // дублируем текст в caption (опционально)
    });
    contentType = 'voice_reply';
  } catch (e: any) {
    this.logger.warn(`TTS failed, fallback to text: ${e.message}`);
    await this.grammy.sendMessage(msg.chat.id, reply.text, { reply_to_message_id: msg.message_id });
  }
} else {
  await this.grammy.sendMessage(msg.chat.id, reply.text, { reply_to_message_id: msg.message_id });
}

// Билтинг — Phase 7. Пока tokensCharged = 0
await this.router.persistAssistantReply(cfg, reply.text, contentType, 0);
```

Также при создании `ctx` использовать `workingText`:
```typescript
const ctx = {
  ...
  text: workingText,
  isVoice: actualIsVoice,
  voiceFileId: actualIsVoice ? (msg.voice?.file_id ?? msg.audio?.file_id) : undefined,
};
```

- [ ] **Step 2: Build + коммит**

```bash
pnpm build
git commit -am "feat(tg-bot): wire voice STT/TTS в handleGroupMessage"
```

---

## Phase 7: Биллинг + balance alerts

### Task 7.1: tg-billing.service

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-billing.service.ts`
- Create: `~/Downloads/spirits_back/tests/unit/tgBillingFormula.test.js`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.module.ts`

- [ ] **Step 1: Unit-тест**

`~/Downloads/spirits_back/tests/unit/tgBillingFormula.test.js`:

```javascript
function tokensFromUsd(usd) {
  return Math.ceil(usd * 100_000);
}

describe('tg-billing formula', () => {
  test('$0.0001 → 10 токенов', () => {
    expect(tokensFromUsd(0.0001)).toBe(10);
  });
  test('$0.005 → 500 токенов', () => {
    expect(tokensFromUsd(0.005)).toBe(500);
  });
  test('$0 → 0', () => {
    expect(tokensFromUsd(0)).toBe(0);
  });
  test('round-up для нецелых: $0.00001 → 1 токен (нельзя списать 0.1)', () => {
    expect(tokensFromUsd(0.0000099)).toBe(1);
  });
});
```

- [ ] **Step 2: Запустить**

```bash
cd ~/Downloads/spirits_back/tests
npx jest unit/tgBillingFormula
```

- [ ] **Step 3: Создать service**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { TgGrammyClient } from './tg-grammy.client';

@Injectable()
export class TgBillingService {
  private readonly logger = new Logger(TgBillingService.name);

  constructor(
    private readonly pg: PgService,
    private readonly grammy: TgGrammyClient,
  ) {}

  tokensFromUsd(usd: number): number {
    return Math.ceil(usd * 100_000);
  }

  /**
   * Списать `tokens` с баланса владельца. Возвращает новый баланс.
   * Атомарно: использует UPDATE...RETURNING.
   */
  async deduct(ownerUserId: string, tokens: number): Promise<number> {
    if (tokens <= 0) return await this.getBalance(ownerUserId);
    const r = await this.pg.query(
      `UPDATE ai_profiles_consolidated SET tokens = tokens - $1
        WHERE user_id = $2
        RETURNING tokens`,
      [tokens, ownerUserId],
    );
    return Number(r.rows[0]?.tokens ?? 0);
  }

  async getBalance(ownerUserId: string): Promise<number> {
    const r = await this.pg.query(
      `SELECT tokens FROM ai_profiles_consolidated WHERE user_id = $1 LIMIT 1`,
      [ownerUserId],
    );
    return Number(r.rows[0]?.tokens ?? 0);
  }

  /**
   * Проверить пороги и отправить alert владельцу. Вызывается после каждого списания.
   */
  async checkBalanceAlerts(configId: string, ownerUserId: string, ownerTgUserId: number | null): Promise<void> {
    if (!ownerTgUserId) return;
    const threshold = Number(process.env.TG_BOT_LOW_BALANCE_THRESHOLD ?? '1000');
    const balance = await this.getBalance(ownerUserId);
    // Low balance — DM с кулдауном 1/сутки
    if (balance < threshold && balance > 0) {
      const r = await this.pg.query(
        `SELECT last_low_balance_dm_at FROM tg_bot_configs WHERE id = $1`,
        [configId],
      );
      const last = r.rows[0]?.last_low_balance_dm_at;
      const dayMs = 24 * 60 * 60 * 1000;
      if (!last || Date.now() - new Date(last).getTime() > dayMs) {
        try {
          await this.grammy.sendMessage(
            ownerTgUserId,
            `⚠️ На твоём боте осталось меньше ${threshold} токенов (баланс: ${balance}). Пополни: https://my.linkeon.io/tokens`,
          );
          await this.pg.query(
            `UPDATE tg_bot_configs SET last_low_balance_dm_at = now() WHERE id = $1`,
            [configId],
          );
        } catch (e: any) {
          this.logger.warn(`low-balance DM failed: ${e.message}`);
        }
      }
    }
  }

  async hasZeroBalanceFlag(configId: string): Promise<boolean> {
    const r = await this.pg.query(
      `SELECT last_zero_balance_msg_at FROM tg_bot_configs WHERE id = $1`,
      [configId],
    );
    return !!r.rows[0]?.last_zero_balance_msg_at;
  }

  async markZeroBalanceNotified(configId: string): Promise<void> {
    await this.pg.query(
      `UPDATE tg_bot_configs SET last_zero_balance_msg_at = now() WHERE id = $1`,
      [configId],
    );
  }

  async clearZeroBalanceFlag(configId: string): Promise<void> {
    await this.pg.query(
      `UPDATE tg_bot_configs SET last_zero_balance_msg_at = NULL WHERE id = $1`,
      [configId],
    );
  }
}
```

- [ ] **Step 4: Зарегистрировать в module и закоммитить**

```bash
git add src/tg-bot/tg-billing.service.ts src/tg-bot/tg-bot.module.ts tests/unit/tgBillingFormula.test.js
git commit -m "feat(tg-bot): TgBillingService — формула + deduct + alerts"
```

---

### Task 7.2: Wire billing в handleGroupMessage

**Files:**
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.service.ts`

- [ ] **Step 1: Расширить конструктор**

Добавить `TgBillingService`, `TgIdentityService` (если ещё нет).

- [ ] **Step 2: Pre-flight balance check + post-reply deduction**

В `handleGroupMessage` ДО LLM-вызова добавить:

```typescript
// Pre-flight balance check
const balance = await this.billing.getBalance(cfg.owner_user_id);
if (balance <= 0) {
  // Однократное сообщение в группе при первом попадании на нуль
  const notified = await this.billing.hasZeroBalanceFlag(cfg.id);
  if (!notified) {
    await this.grammy.sendMessage(
      msg.chat.id,
      `У владельца закончились токены. Пополнить: https://my.linkeon.io/tokens`,
    );
    await this.billing.markZeroBalanceNotified(cfg.id);
  }
  return;
}
```

После `reply` (но до persist) добавить:

```typescript
const tokensCharged = this.billing.tokensFromUsd(reply.costUsd + voiceTtsCostUsd);
const newBalance = await this.billing.deduct(cfg.owner_user_id, tokensCharged);
this.logger.log(`tg-bot billing: config=${cfg.id} cost=$${(reply.costUsd + voiceTtsCostUsd).toFixed(5)} deducted=${tokensCharged} new_balance=${newBalance}`);

// Reset zero-balance flag — пользователь пополнил
if (newBalance > 0) {
  await this.billing.clearZeroBalanceFlag(cfg.id);
}
```

И в `persistAssistantReply` — передавать `tokensCharged` вместо 0.

После `persistAssistantReply` добавить:

```typescript
// Balance alerts (после успешного списания)
const ownerId = await this.identity.getIdentityByLinkeonId(cfg.owner_user_id);
await this.billing.checkBalanceAlerts(cfg.id, cfg.owner_user_id, ownerId?.tgUserId ?? null);
```

- [ ] **Step 3: Build + коммит**

```bash
pnpm build
git commit -am "feat(tg-bot): wire billing — pre-flight check, deduction, alerts"
```

---

## Phase 8: Команды бота

### Task 8.1: tg-commands.service — /help /balance /silent /resume

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/tg-commands.service.ts`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.module.ts`

- [ ] **Step 1: Создать service**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { TgGrammyClient } from './tg-grammy.client';
import { TgConfigService, TgBotConfigRow } from './tg-config.service';
import { TgBillingService } from './tg-billing.service';
import { TgIdentityService } from './tg-identity.service';

@Injectable()
export class TgCommandsService {
  private readonly logger = new Logger(TgCommandsService.name);

  constructor(
    private readonly pg: PgService,
    private readonly grammy: TgGrammyClient,
    private readonly configs: TgConfigService,
    private readonly billing: TgBillingService,
    private readonly identity: TgIdentityService,
  ) {}

  /**
   * Если text — команда из нашего списка, обработать и вернуть true.
   * Иначе — false (роутер пойдёт дальше в LLM).
   */
  async tryHandle(cfg: TgBotConfigRow, msg: any): Promise<boolean> {
    const text = (msg.text || '').toLowerCase().trim();
    if (!text.startsWith('/')) return false;

    // Strip @-suffix (например /balance@LinkeonAgentBot)
    const cmd = text.split('@')[0].split(' ')[0];
    const isOwner = await this.isOwner(cfg, msg.from.id);

    switch (cmd) {
      case '/help': await this.handleHelp(cfg, msg); return true;
      case '/balance': await this.handleBalance(cfg, msg, isOwner); return true;
      case '/silent': await this.handleSilent(cfg, msg, isOwner); return true;
      case '/resume': await this.handleResume(cfg, msg, isOwner); return true;
      default: return false;
    }
  }

  private async isOwner(cfg: TgBotConfigRow, tgUserId: number): Promise<boolean> {
    const id = await this.identity.getIdentityByLinkeonId(cfg.owner_user_id);
    return id?.tgUserId === tgUserId;
  }

  private async handleHelp(cfg: TgBotConfigRow, msg: any): Promise<void> {
    const modeMap: Record<string, string> = {
      strict: 'отвечает только по обращению',
      always: 'отвечает на каждое сообщение',
      smart: 'отвечает когда видит, что стоит вмешаться',
    };
    const text = `Я *${cfg.display_name}* — ${modeMap[cfg.addressing_mode]}.

Команды:
/help — это сообщение
/balance — баланс владельца (только владельцу)
/silent — замолчать (только владельцу)
/resume — возобновить (только владельцу)

Веб-кабинет: https://my.linkeon.io/telegram-bots`;
    await this.grammy.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
  }

  private async handleBalance(cfg: TgBotConfigRow, msg: any, isOwner: boolean): Promise<void> {
    if (!isOwner) {
      await this.grammy.sendMessage(msg.chat.id, 'Эта команда доступна только владельцу бота.', { reply_to_message_id: msg.message_id });
      return;
    }
    const bal = await this.billing.getBalance(cfg.owner_user_id);
    await this.grammy.sendMessage(
      msg.chat.id,
      `Баланс: *${bal.toLocaleString('ru-RU')}* токенов.\nПополнить: https://my.linkeon.io/tokens`,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id },
    );
  }

  private async handleSilent(cfg: TgBotConfigRow, msg: any, isOwner: boolean): Promise<void> {
    if (!isOwner) {
      await this.grammy.sendMessage(msg.chat.id, 'Эта команда доступна только владельцу бота.', { reply_to_message_id: msg.message_id });
      return;
    }
    await this.pg.query(`UPDATE tg_bot_configs SET status = 'silent' WHERE id = $1`, [cfg.id]);
    await this.grammy.sendMessage(msg.chat.id, '🤫 Замолкаю до /resume.', { reply_to_message_id: msg.message_id });
  }

  private async handleResume(cfg: TgBotConfigRow, msg: any, isOwner: boolean): Promise<void> {
    if (!isOwner) {
      await this.grammy.sendMessage(msg.chat.id, 'Эта команда доступна только владельцу бота.', { reply_to_message_id: msg.message_id });
      return;
    }
    await this.pg.query(`UPDATE tg_bot_configs SET status = 'active' WHERE id = $1`, [cfg.id]);
    await this.grammy.sendMessage(msg.chat.id, '✅ Снова на связи.', { reply_to_message_id: msg.message_id });
  }
}
```

- [ ] **Step 2: Зарегистрировать в module + wire в handleGroupMessage**

В module — providers + exports. В `tg-bot.service.ts` ДО блока `should = router.shouldRespond(...)` добавить:

```typescript
const handled = await this.commands.tryHandle(cfg, msg);
if (handled) return;
```

Добавить `TgCommandsService` в конструктор.

- [ ] **Step 3: Build + коммит**

```bash
pnpm build
git add src/tg-bot/
git commit -m "feat(tg-bot): команды /help /balance /silent /resume"
```

---

## Phase 9: Lifecycle — kick, archive, custom_agents FK-block

### Task 9.1: my_chat_member → archive при kick

**Files:**
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.service.ts`

- [ ] **Step 1: Реализовать handleMyChatMember**

```typescript
private async handleMyChatMember(event: any): Promise<void> {
  const newStatus = event.new_chat_member?.status;
  if (!['left', 'kicked'].includes(newStatus)) return;

  const cfg = await this.configs.getActiveByTgChatId(event.chat.id);
  if (!cfg) return;

  await this.pg.query(
    `UPDATE tg_bot_configs SET status = 'archived', archived_at = now() WHERE id = $1`,
    [cfg.id],
  );
  this.logger.log(`config ${cfg.id} archived — bot ${newStatus} from chat ${event.chat.id}`);

  // DM владельцу
  const ownerTg = await this.identity.getIdentityByLinkeonId(cfg.owner_user_id);
  if (ownerTg) {
    try {
      await this.grammy.sendMessage(
        ownerTg.tgUserId,
        `Бот «${cfg.display_name}» удалён из «${cfg.tg_chat_title ?? 'группы'}». Конфигурация архивирована — её можно восстановить в кабинете.`,
      );
    } catch {}
  }
}
```

- [ ] **Step 2: Коммит**

```bash
git commit -am "feat(tg-bot): архивирование при kick через my_chat_member"
```

---

### Task 9.2: Custom-agents FK-блок при удалении

**Files:**
- Create: `~/Downloads/spirits_back/src/tg-bot/migrations/002_tg_bot_custom_agent_fk.sql`
- Modify: `~/Downloads/spirits_back/src/tg-bot/tg-bot.service.ts` (применить миграцию)
- Modify: `~/Downloads/spirits_back/src/custom-agents/custom-agents.service.ts`

- [ ] **Step 1: Миграция — FK**

```sql
-- 002_tg_bot_custom_agent_fk.sql
-- Связать tg_bot_configs.custom_agent_id с custom_agents.id (без CASCADE — блок удаления).
-- Идемпотентно: DO-блок не упадёт при повторных запусках onModuleInit.
DO $$ BEGIN
  ALTER TABLE tg_bot_configs
    ADD CONSTRAINT fk_tg_bot_configs_custom_agent
      FOREIGN KEY (custom_agent_id) REFERENCES custom_agents(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN
  -- constraint уже есть, скипаем
  NULL;
END $$;
```

- [ ] **Step 2: Применить через onModuleInit**

В `tg-bot.service.ts` в `onModuleInit` добавить вторую миграцию:

```typescript
async onModuleInit() {
  await this.applyMigration('001_tg_bot_schema.sql');
  await this.applyMigration('002_tg_bot_custom_agent_fk.sql');
}
```

- [ ] **Step 3: Расширить custom-agents.service.remove**

В `~/Downloads/spirits_back/src/custom-agents/custom-agents.service.ts` метод `remove`:

```typescript
async remove(id: string, ownerId: string): Promise<void> {
  await this.getById(id, ownerId);
  // Проверка использования в активных tg_bot_configs
  const usageRes = await this.pg.query(
    `SELECT id, display_name FROM tg_bot_configs
      WHERE custom_agent_id = $1 AND status != 'deleted'`,
    [id],
  );
  if (usageRes.rows.length > 0) {
    const names = usageRes.rows.map((r: any) => r.display_name).join(', ');
    throw new BadRequestException(
      `Эта роль используется в ${usageRes.rows.length} ботах: ${names}. Сначала отвяжи или удали их.`,
    );
  }
  await this.pg.query(
    `DELETE FROM custom_agents WHERE id = $1 AND owner_user_id = $2`,
    [id, ownerId],
  );
}
```

Добавить импорт `BadRequestException` если ещё нет.

- [ ] **Step 4: Build + коммит**

```bash
pnpm build
git add src/tg-bot/migrations/002_tg_bot_custom_agent_fk.sql src/tg-bot/tg-bot.service.ts src/custom-agents/custom-agents.service.ts
git commit -m "feat(tg-bot): FK-блок удаления custom_agents с активным конфигом"
```

---

## Phase 10: Frontend — tgBotApi + UI

### Task 10.1: tgBotApi.ts

**Files:**
- Create: `~/Downloads/spirits_front/src/services/tgBotApi.ts`

- [ ] **Step 1: Создать service**

```typescript
import { apiClient } from './apiClient';

export type AddressingMode = 'strict' | 'always' | 'smart';
export type VoiceReplyMode = 'never' | 'mirror' | 'always';
export type BotStatus = 'pending' | 'active' | 'silent' | 'archived';

export interface TgBotConfig {
  id: string;
  tgChatId: string | null;
  tgChatTitle: string | null;
  displayName: string;
  presetAgentId: string | null;
  customAgentId: string | null;
  addressingMode: AddressingMode;
  voiceReplyMode: VoiceReplyMode;
  status: BotStatus;
  lastReplyAt: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface IdentityStatus {
  bound: boolean;
  tgUsername?: string | null;
  tgFirstName?: string | null;
}

export interface ConfigCreateResponse {
  config: TgBotConfig;
  claimToken: string;
  deepLink: string;
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let message = `HTTP ${response.status}`;
  try { const b = await response.json(); message = b?.message ?? b?.error ?? message; } catch {}
  throw new Error(message);
}

export const tgBotApi = {
  async identityStatus(): Promise<IdentityStatus> {
    const r = await apiClient.get('/webhook/tg-bot/identity-status');
    return parseOrThrow(r);
  },
  async identityLink(): Promise<{ token: string; deepLink: string }> {
    const r = await apiClient.post('/webhook/tg-bot/identity-link', {});
    return parseOrThrow(r);
  },
  async list(): Promise<TgBotConfig[]> {
    const r = await apiClient.get('/webhook/tg-bot/configs');
    return parseOrThrow(r);
  },
  async create(body: {
    displayName: string;
    presetAgentId?: string;
    customAgentId?: string;
    addressingMode: AddressingMode;
    voiceReplyMode: VoiceReplyMode;
  }): Promise<ConfigCreateResponse> {
    const r = await apiClient.post('/webhook/tg-bot/configs', body);
    return parseOrThrow(r);
  },
  async get(id: string): Promise<TgBotConfig> {
    const r = await apiClient.get(`/webhook/tg-bot/configs/${id}`);
    return parseOrThrow(r);
  },
  async update(id: string, body: Partial<{ displayName: string; presetAgentId: string; customAgentId: string; addressingMode: AddressingMode; voiceReplyMode: VoiceReplyMode }>): Promise<TgBotConfig> {
    const r = await apiClient.patch(`/webhook/tg-bot/configs/${id}`, body);
    return parseOrThrow(r);
  },
  async remove(id: string): Promise<{ ok: boolean }> {
    const r = await apiClient.delete(`/webhook/tg-bot/configs/${id}`);
    return parseOrThrow(r);
  },
  async messages(id: string): Promise<any[]> {
    const r = await apiClient.get(`/webhook/tg-bot/configs/${id}/messages`);
    return parseOrThrow(r);
  },
};
```

- [ ] **Step 2: Коммит**

```bash
git add src/services/tgBotApi.ts
git commit -m "feat(tg-bot): фронт-сервис tgBotApi"
```

---

### Task 10.2: RolePickerField — выбор роли (пресет / кастом)

**Files:**
- Create: `~/Downloads/spirits_front/src/components/tg-bot/role-picker/RolePickerField.tsx`

- [ ] **Step 1: Создать компонент**

```tsx
import React, { useEffect, useState } from 'react';
import { Bot, Star } from 'lucide-react';
import { apiClient } from '../../../services/apiClient';
import { customAgentsApi, type CustomAgent } from '../../../services/customAgentsApi';

interface Preset {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string | null;
}

interface Props {
  value: { type: 'preset' | 'custom'; id: string } | null;
  onChange: (v: { type: 'preset' | 'custom'; id: string }) => void;
}

export const RolePickerField: React.FC<Props> = ({ value, onChange }) => {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [customs, setCustoms] = useState<CustomAgent[]>([]);

  useEffect(() => {
    apiClient.get('/webhook/agents')
      .then(r => r.json())
      .then(setPresets)
      .catch(() => {});
    customAgentsApi.list().then(setCustoms).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      {customs.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Мои</div>
          <div className="grid grid-cols-1 gap-2">
            {customs.map(c => {
              const selected = value?.type === 'custom' && value.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onChange({ type: 'custom', id: c.id })}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left ${selected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                >
                  <Star size={18} className="text-blue-600" />
                  <div className="flex-1">
                    <div className="font-medium">{c.name}</div>
                    {c.description && <div className="text-xs text-gray-600">{c.description}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Пресеты Linkeon</div>
        <div className="grid grid-cols-1 gap-2">
          {presets.map(p => {
            const selected = value?.type === 'preset' && value.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ type: 'preset', id: p.id })}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left ${selected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
              >
                <Bot size={18} className="text-gray-600" />
                <div className="flex-1">
                  <div className="font-medium">{p.displayName || p.name}</div>
                  {p.description && <div className="text-xs text-gray-600">{p.description}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Коммит**

```bash
git add src/components/tg-bot/role-picker/RolePickerField.tsx
git commit -m "feat(tg-bot): RolePickerField"
```

---

### Task 10.3: TgBotCreateWizard

**Files:**
- Create: `~/Downloads/spirits_front/src/components/tg-bot/TgBotCreateWizard.tsx`

- [ ] **Step 1: Создать wizard**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, ExternalLink, Check, Copy } from 'lucide-react';
import { tgBotApi, type AddressingMode, type VoiceReplyMode } from '../../services/tgBotApi';
import { RolePickerField } from './role-picker/RolePickerField';

type Step = 'identity' | 'config' | 'addgroup';

export const TgBotCreateWizard: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('identity');

  const [identityBound, setIdentityBound] = useState<boolean | null>(null);
  const [identityDeepLink, setIdentityDeepLink] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<{ type: 'preset' | 'custom'; id: string } | null>(null);
  const [addressingMode, setAddressingMode] = useState<AddressingMode>('strict');
  const [voiceReplyMode, setVoiceReplyMode] = useState<VoiceReplyMode>('never');

  const [claimDeepLink, setClaimDeepLink] = useState<string | null>(null);

  useEffect(() => {
    tgBotApi.identityStatus().then(s => {
      setIdentityBound(s.bound);
      if (s.bound) setStep('config');
    });
  }, []);

  const generateIdentityLink = async () => {
    try {
      const r = await tgBotApi.identityLink();
      setIdentityDeepLink(r.deepLink);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const submitConfig = async () => {
    if (!displayName.trim() || !role) {
      toast.error('Заполни имя и выбери роль');
      return;
    }
    try {
      const r = await tgBotApi.create({
        displayName: displayName.trim(),
        presetAgentId: role.type === 'preset' ? role.id : undefined,
        customAgentId: role.type === 'custom' ? role.id : undefined,
        addressingMode,
        voiceReplyMode,
      });
      setClaimDeepLink(r.deepLink);
      setStep('addgroup');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success('Скопировано');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Создать Telegram-бота</h1>

      {step === 'identity' && (
        <div className="bg-white rounded-2xl p-5 border border-gray-200">
          <h2 className="font-semibold mb-2">Шаг 1: Привяжи свой Telegram</h2>
          <p className="text-sm text-gray-600 mb-4">
            Это нужно один раз. Бот узнает, что твой Telegram-аккаунт связан с Linkeon — чтобы /balance был доступен только тебе.
          </p>
          {!identityDeepLink ? (
            <button onClick={generateIdentityLink} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium">
              Сгенерировать ссылку
            </button>
          ) : (
            <>
              <a href={identityDeepLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium">
                <ExternalLink size={16} /> Открыть в Telegram
              </a>
              <button
                onClick={async () => {
                  const s = await tgBotApi.identityStatus();
                  if (s.bound) { setIdentityBound(true); setStep('config'); toast.success('Привязано'); }
                  else toast.error('Ещё не привязан. Нажми /start в Telegram.');
                }}
                className="ml-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium"
              >
                Я нажал /start
              </button>
            </>
          )}
        </div>
      )}

      {step === 'config' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Имя бота в группе</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Финансист"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                maxLength={80}
              />
              <span className="text-xs text-gray-500 mt-1 block">
                Бот будет реагировать, когда в сообщении встретится это имя
              </span>
            </label>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <h2 className="font-semibold mb-3">Роль</h2>
            <RolePickerField value={role} onChange={setRole} />
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <h2 className="font-semibold mb-3">Когда отвечает</h2>
            {([
              ['strict', 'По обращению', 'Только когда зовут @-mention, reply на бота, или произносят его имя'],
              ['smart', 'Умно', 'Сам решает, когда уместно вмешаться (rate-limit 60 сек)'],
              ['always', 'Всегда', 'На каждое сообщение в группе (rate-limit 3 сек)'],
            ] as const).map(([val, label, desc]) => (
              <label key={val} className="flex items-start gap-3 py-2 cursor-pointer">
                <input type="radio" name="addr" checked={addressingMode === val} onChange={() => setAddressingMode(val)} className="mt-1" />
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-gray-600">{desc}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <h2 className="font-semibold mb-3">Голосовые ответы</h2>
            {([
              ['never', 'Никогда', 'Всегда текстом'],
              ['mirror', 'Зеркально', 'Голос на голос, текст на текст'],
              ['always', 'Всегда', 'Каждый ответ голосом'],
            ] as const).map(([val, label, desc]) => (
              <label key={val} className="flex items-start gap-3 py-2 cursor-pointer">
                <input type="radio" name="voice" checked={voiceReplyMode === val} onChange={() => setVoiceReplyMode(val)} className="mt-1" />
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-gray-600">{desc}</div>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={submitConfig}
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-2"
          >
            Создать и получить ссылку для группы <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === 'addgroup' && claimDeepLink && (
        <div className="bg-white rounded-2xl p-5 border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><Check size={16} /></div>
            <h2 className="font-semibold">Шаг 3: Добавь бота в группу</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Открой ссылку — Telegram предложит выбрать группу. После добавления бот сам активируется.
            Ссылка работает 15 минут.
          </p>
          <div className="flex items-center gap-2 mb-4">
            <input type="text" value={claimDeepLink} readOnly className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono" />
            <button onClick={() => copy(claimDeepLink)} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50">
              <Copy size={16} />
            </button>
          </div>
          <a
            href={claimDeepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            <ExternalLink size={16} /> Открыть в Telegram
          </a>
          <button onClick={() => navigate('/telegram-bots')} className="ml-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium">
            Готово
          </button>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Коммит**

```bash
git add src/components/tg-bot/TgBotCreateWizard.tsx
git commit -m "feat(tg-bot): TgBotCreateWizard"
```

---

### Task 10.4: TgBotCard + TgBotsListView + TgBotEditModal + TgBotMessagesView

**Files:**
- Create: `~/Downloads/spirits_front/src/components/tg-bot/TgBotCard.tsx`
- Create: `~/Downloads/spirits_front/src/components/tg-bot/TgBotsListView.tsx`
- Create: `~/Downloads/spirits_front/src/components/tg-bot/TgBotEditModal.tsx`
- Create: `~/Downloads/spirits_front/src/components/tg-bot/TgBotMessagesView.tsx`

Эти компоненты делаются по тем же паттернам, что `CustomAgentCard` / `CustomAgentsListView` из Plan 1. Структура каждого:

- [ ] **TgBotCard.tsx** — карточка: имя бота, имя группы (или «Ждёт добавления в группу» если status=pending), бейдж режима, кнопки «изменить», «история», «архивировать». Использует `tgBotApi.remove` для архивирования (с подтверждением). По дизайну — копия CustomAgentCard.tsx с другими полями и кнопками.

- [ ] **TgBotsListView.tsx** — Header с кнопкой «Создать» → navigate('/telegram-bots/new'). Табы Active/Archived (фильтрация по status). Грид карточек. По дизайну — копия CustomAgentsListView.tsx.

- [ ] **TgBotEditModal.tsx** — те же поля, что в Step 2 wizard'а (`displayName`, `RolePickerField`, режим, voice), но через `tgBotApi.update(id, ...)`. По дизайну — копия CustomAgentEditModal.tsx.

- [ ] **TgBotMessagesView.tsx** — `useEffect → tgBotApi.messages(id)` → список с `tg_user_name`, `content`, `tokens_charged`, `created_at`. Простая хронологическая лента (от старых к новым).

- [ ] **Step 5: Коммит после всех 4**

```bash
git add src/components/tg-bot/
git commit -m "feat(tg-bot): TgBotCard + ListView + EditModal + MessagesView"
```

---

### Task 10.5: TelegramBotsPage + routing + Navigation + ProfileView

**Files:**
- Create: `~/Downloads/spirits_front/src/pages/TelegramBotsPage.tsx`
- Modify: `~/Downloads/spirits_front/src/App.tsx`
- Modify: `~/Downloads/spirits_front/src/components/layout/Navigation.tsx`
- Modify: `~/Downloads/spirits_front/src/components/profile/ProfileView.tsx`

- [ ] **Step 1: TelegramBotsPage**

```tsx
import React from 'react';
import { useParams } from 'react-router-dom';
import { TgBotsListView } from '../components/tg-bot/TgBotsListView';
import { TgBotCreateWizard } from '../components/tg-bot/TgBotCreateWizard';
import { TgBotEditModal } from '../components/tg-bot/TgBotEditModal';
import { TgBotMessagesView } from '../components/tg-bot/TgBotMessagesView';

const TelegramBotsPage: React.FC = () => <TgBotsListView />;
export default TelegramBotsPage;

export const TelegramBotsNewPage: React.FC = () => <TgBotCreateWizard />;

export const TelegramBotsDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <TgBotEditModal botId={id} />
      <TgBotMessagesView botId={id} />
    </div>
  );
};
```

Подбери сигнатуры пропсов `TgBotEditModal`/`TgBotMessagesView` под этот вызов (с botId как пропс или через useParams внутри — выбери одно).

- [ ] **Step 2: Routes в App.tsx**

```typescript
import TelegramBotsPage, { TelegramBotsNewPage, TelegramBotsDetailPage } from './pages/TelegramBotsPage';

// в Routes
<Route path="/telegram-bots" element={<TelegramBotsPage />} />
<Route path="/telegram-bots/new" element={<TelegramBotsNewPage />} />
<Route path="/telegram-bots/:id" element={<TelegramBotsDetailPage />} />
```

- [ ] **Step 3: Navigation — пункт «Мои боты»**

В `Navigation.tsx` добавить пункт с иконкой `Send` (или `MessageCircle`) из lucide-react: `{ to: '/telegram-bots', label: t('tgBot.nav'), icon: Send }`.

- [ ] **Step 4: ProfileView — блок Telegram**

В `ProfileView.tsx` добавить секцию: подтянуть `tgBotApi.identityStatus()`, показать привязанный @username или кнопку «Привязать Telegram» (ведёт на /telegram-bots/new).

```tsx
const [tgIdentity, setTgIdentity] = useState<IdentityStatus | null>(null);
useEffect(() => { tgBotApi.identityStatus().then(setTgIdentity).catch(() => {}); }, []);

// в JSX:
<section className="bg-white rounded-2xl p-5 border border-gray-200">
  <h2 className="font-semibold mb-3">Telegram</h2>
  {tgIdentity?.bound ? (
    <div className="text-sm text-gray-700">
      Привязан: <span className="font-medium">@{tgIdentity.tgUsername ?? '—'}</span>
    </div>
  ) : (
    <div>
      <p className="text-sm text-gray-600 mb-3">Подключи Telegram, чтобы создавать ботов для групп.</p>
      <Link to="/telegram-bots/new" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm inline-block">
        Подключить Telegram
      </Link>
    </div>
  )}
</section>
```

- [ ] **Step 5: i18n**

В `ru.json`:
```json
"tgBot": {
  "nav": "Мои боты",
  "title": "Мои Telegram-боты",
  "createButton": "Создать"
}
```
В `en.json` — соответственно.

- [ ] **Step 6: Smoke в браузере**

```bash
cd ~/Downloads/spirits_front && pnpm dev
# 1. /telegram-bots → пустой список с кнопкой «Создать»
# 2. /telegram-bots/new → wizard → identity step
# 3. Profile → блок Telegram
```

- [ ] **Step 7: Коммит**

```bash
git add src/pages/TelegramBotsPage.tsx src/App.tsx src/components/layout/Navigation.tsx src/components/profile/ProfileView.tsx src/i18n/locales/
git commit -m "feat(tg-bot): страницы + navigation + ProfileView блок"
```

---

## Phase 11: API-тесты + deploy

### Task 11.1: API-тесты на эндпоинты

**Files:**
- Modify: `~/Downloads/spirits_back/tests/api.test.js`

- [ ] **Step 1: Добавить блок**

```javascript
describe('tg-bot endpoints (auth required)', () => {
  test('GET /webhook/tg-bot/identity-status — 401 без токена', async () => {
    const r = await http.get('/webhook/tg-bot/identity-status');
    assertStatus(r, 401);
  });
  test('POST /webhook/tg-bot/identity-link — 401', async () => {
    const r = await http.post('/webhook/tg-bot/identity-link', {});
    assertStatus(r, 401);
  });
  test('GET /webhook/tg-bot/configs — 401', async () => {
    const r = await http.get('/webhook/tg-bot/configs');
    assertStatus(r, 401);
  });
  test('POST /webhook/tg-bot/configs — 401', async () => {
    const r = await http.post('/webhook/tg-bot/configs', {});
    assertStatus(r, 401);
  });
  test('POST /webhook/telegram/wrong-secret — 401', async () => {
    const r = await http.post('/webhook/telegram/wrong-secret-here', { update_id: 1 });
    assertStatus(r, 401);
  });
});
```

- [ ] **Step 2: Запустить против test.linkeon.io**

```bash
cd ~/Downloads/spirits_back/tests
BASE_URL=https://test.linkeon.io node runner.js --suite api 2>&1 | grep tg-bot
```

- [ ] **Step 3: Коммит**

```bash
git commit -am "test(tg-bot): API auth-checks"
```

---

### Task 11.2: BotFather setup + secrets prod/test

- [ ] **Step 1: Зарегистрировать @LinkeonAgentBot в BotFather (одноразово)**

```
/newbot
имя: Linkeon Agent
username: LinkeonAgentBot

/setprivacy → Disable
/setjoingroups → Enable
/setcommands
help - что это за бот
balance - баланс владельца
silent - замолчать (владельцу)
resume - возобновить (владельцу)

Скопировать токен из BotFather.
```

- [ ] **Step 2: Положить секреты на test и prod**

```bash
# Test (85.192.61.231)
ssh dv@85.192.61.231 'sudo tee -a /home/dvolkov/spirits_back/.env <<EOF
TG_BOT_TOKEN=<paste>
TG_WEBHOOK_URL_SECRET=<openssl rand -hex 16>
TG_WEBHOOK_HEADER_SECRET=<openssl rand -hex 16>
TG_BOT_USERNAME=LinkeonAgentBot
TG_BOT_LOW_BALANCE_THRESHOLD=1000
EOF
'

# Prod (212.113.106.202) — те же значения BUT отдельные секреты (не переиспользуем test→prod)
ssh dvolkov@212.113.106.202 'tee -a /home/dvolkov/spirits_back/.env <<EOF
...
EOF
'
```

⚠️ Прод и тест должны иметь **разные** TG_BOT_TOKEN — иначе оба процесса будут пытаться поллить один webhook. Зарегистрировать второго бота `@LinkeonAgentBotTest` для test.linkeon.io.

- [ ] **Step 3: Проверить env на обоих серверах**

```bash
ssh dv@85.192.61.231 'grep TG_BOT /home/dvolkov/spirits_back/.env'
ssh dvolkov@212.113.106.202 'grep TG_BOT /home/dvolkov/spirits_back/.env'
```

---

### Task 11.3: Деплой через двухфазный pipeline

- [ ] **Step 1: Local build green**

```bash
cd ~/Downloads/spirits_back && pnpm build
cd ~/Downloads/spirits_front && pnpm build
```

- [ ] **Step 2: deploy.sh**

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```

Ожидание:
- Фаза test: миграции 001+002 применились, setWebhook вызван, smoke зелёный
- Фаза prod: то же самое

- [ ] **Step 3: Ручной smoke на test.linkeon.io**

```
1. https://test.linkeon.io под тестовым аккаунтом
2. Profile → блок Telegram → «Подключить»
3. /telegram-bots/new → identity step → открыть Telegram → /start → возврат → identity bound
4. Шаг конфига: имя «Тестовый Финансист», роль «Финансист» (пресет), strict, never (voice off)
5. → addgroup step → открыть deep link → выбрать тестовую группу → добавить
6. В группе бот пишет приветствие
7. Послать в группе: «Эй Финансист, что думаешь о акциях?» — получить ответ
8. Послать обычное сообщение «привет всем» — бот молчит (strict mode)
9. Прислать voice-сообщение со словом «финансист» — бот транскрибирует и отвечает текстом
10. /balance в группе — баланс
11. /silent → послать обращение → молчит → /resume → отвечает
12. На /telegram-bots увидеть карточку. На детали бота — историю
13. Архивировать — бот выходит из группы
```

- [ ] **Step 4: На прод-стороне — повторить smoke с минимумом реальных вызовов (после успешного теста)**

---

## Acceptance Criteria

- [ ] Webhook `POST /webhook/telegram/:secret` отвечает 200 при правильном секрете и 401 при неправильном
- [ ] `setWebhook` вызывается в onModuleInit и идемпотентен
- [ ] Identity binding: deep link → /start AUTH_TOKEN в DM → `tg_user_identities` запись
- [ ] Claim: deep link с startgroup → /start CLAIM_TOKEN в группе → config status `active`, приветствие в чате
- [ ] Конфликт claim: вторая попытка в ту же группу другим owner → отказ, leaveChat
- [ ] Strict mode: триггер по @mention, reply, display_name, /команде
- [ ] Always mode: ответ на каждое сообщение, rate-limit 3 сек
- [ ] Smart mode: явный триггер → ответ; иначе → Haiku-гейт; rate-limit 60 сек
- [ ] Voice in: Whisper транскрибирует, текст идёт в обычный пайплайн
- [ ] Voice out: TTS по правилу (never/mirror/always)
- [ ] Биллинг: tokens списываются с владельца по формуле; STT и smart-gate не списываются
- [ ] Pre-flight at balance ≤ 0: однократное сообщение в группе, дальше silence
- [ ] DM low-balance alert при < 1000 (с 24h кулдауном)
- [ ] Команды: /help (всем), /balance, /silent, /resume (только владельцу)
- [ ] Kick: `my_chat_member` → status archived + DM владельцу
- [ ] Удаление кастомного агента, используемого в активном конфиге → BadRequest с именем бота
- [ ] Frontend: `/telegram-bots`, wizard, list, edit, history — все работают
- [ ] Smoke `deploy.sh` зелёный на обеих фазах

---

## Self-Review

**Spec coverage (по разделам design.md):**
- §1 Цели/не-цели — отражено в Plan 1+2 целиком, не-цели не реализуются
- §2 Identity + Claim — Phase 2-3
- §3 Библиотека агентов — Plan 1 (custom agents) + Phase 4 интеграция в TgRouterService.resolveSystemPrompt
- §4 Режимы + голос — Phase 4-6
- §5 Биллинг + команды + lifecycle — Phase 7-9
- §6 Архитектура — Phase 1 (миграция, скаффолд), 4 (advisory-lock в handleGroupMessage), 11 (BotFather, deploy)
- §7 Frontend — Phase 10
- §8 Тестирование — Phase 4 (router unit), 7 (billing unit), 11 (API)

**Placeholder scan:** Task 10.4 содержит структурный план без полного кода 4 компонентов (TgBotCard, TgBotsListView, TgBotEditModal, TgBotMessagesView) — указано «по аналогии с Plan 1». Это компромисс на размер плана; реальный код будет писаться по существующим Plan 1 шаблонам с минимальными изменениями (поля и кнопки). Если этот компромисс не устраивает — расширить Task 10.4 до 4 отдельных тасков с полным кодом каждого.

**Type consistency:** `AddressingMode`, `VoiceReplyMode`, `TgBotConfig` — единые типы во фронте и бэке (snake_case → camelCase mapping в `TgBotConfigController.toJson`). `IncomingMessageContext` — единый интерфейс для router. `TgBotConfigRow` — БД-форма, не используется во фронте.

**Open questions, оставленные за рамками плана (как помечено в спеке §9):**
- Redis pub/sub vs cron для re-check после нулевого баланса: в плане реализовано ленивое восстановление (clearZeroBalanceFlag при следующем успешном deduct). Активный re-check не нужен в MVP.
- Вынос формулы `Math.ceil(usd × 100_000)` в общий util — оставлено как дублирование в TgBillingService.tokensFromUsd (yagni)
- Финальное имя бота — `@LinkeonAgentBot` (Plan 11.2 предполагает проверку доступности при регистрации)
