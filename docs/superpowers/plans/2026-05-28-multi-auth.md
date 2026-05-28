# Multi-method auth (Email + Google + Yandex + Phone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователю выбор из четырёх равноправных способов входа (SMS, email magic-link, Google OAuth, Yandex OAuth) с автоматическим merge по подтверждённому email и управлением привязками в Settings.

**Architecture:** Единый `IdentityService` владеет всем что связано с identity (создание, поиск, merge, welcome bonus). Auth-модули остаются тонкими адаптерами: каждый верифицирует свой метод и зовёт `IdentityService.resolveOrCreate(provider, data)` или `linkMethod(userId, ...)`. JWT-payload переименовывается `phone` → `userId`, везде в backend `req.user.phone` → `req.user.userId` (codemod). Новые юзеры получают `internal_id = UUID`, существующие со старым phone-as-id не трогаются. Welcome bonus 25k — единовременно за верифицированную identity + блок tempmail-доменов как anti-sybil.

**Tech Stack:**
- Backend (`~/Downloads/spirits_back/`): NestJS 10, PostgreSQL, Redis, Jest для unit, `tests/api.test.js` для API, `tests/e2e.test.js` для E2E. Новые зависимости: `bcryptjs`, `disposable-email-domains`, `resend` (или `nodemailer` если решим иначе). OAuth — через `axios` (как сейчас).
- Frontend (`~/Downloads/spirits_front/`): React 18 + TS + Vite + Tailwind, `react-i18next`, `lucide-react`.

**Спека:** [`docs/superpowers/specs/2026-05-28-multi-auth-design.md`](../specs/2026-05-28-multi-auth-design.md).

**Деплой:** через `bash ~/Downloads/spirits_back/scripts/deploy.sh` (test → smoke → prod → smoke). MVP — один большой деплой в конце.

**PATH note:** все node-команды требуют префикса `export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"` перед `pnpm`/`npx`/`jest`.

---

## Phase A — Backend identity foundation (`~/Downloads/spirits_back/`)

### Task 1: DB migration — `user_identities` + `user_id` extra columns

**Files:**
- Create: `src/identity/migrations/001_identity_init.sql`

- [ ] **Step 1: Создать миграционный SQL**

```sql
-- 001_identity_init.sql
BEGIN;

CREATE TABLE IF NOT EXISTS user_identities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text NOT NULL REFERENCES user_id(internal_id) ON DELETE CASCADE,
  provider       text NOT NULL CHECK (provider IN ('phone','email','google','yandex')),
  provider_sub   text NOT NULL,
  email          text,
  email_verified boolean NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  last_used_at   timestamptz,
  UNIQUE(provider, provider_sub)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_identities_email_verified ON user_identities(email) WHERE email_verified;

ALTER TABLE user_id ADD COLUMN IF NOT EXISTS password_hash    text;
ALTER TABLE user_id ADD COLUMN IF NOT EXISTS signup_method    text;
ALTER TABLE user_id ADD COLUMN IF NOT EXISTS welcome_bonus_at timestamptz;

-- Backfill: existing users считаем что бонус уже получили
UPDATE user_id SET welcome_bonus_at = create_date WHERE welcome_bonus_at IS NULL;

-- Backfill: existing users (с непустым internal_id) получают phone-identity
INSERT INTO user_identities (user_id, provider, provider_sub, email_verified)
SELECT internal_id, 'phone', internal_id, false
FROM user_id
WHERE internal_id IS NOT NULL AND internal_id != ''
ON CONFLICT (provider, provider_sub) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Заверификация на dev/test**

Сначала прогон на test-сервере:
```bash
scp ~/Downloads/spirits_back/src/identity/migrations/001_identity_init.sql dv@85.192.61.231:/tmp/
ssh dv@85.192.61.231 'PGPASSWORD=linkeon_pass_2026 psql -U linkeon -h localhost -p 5433 -d linkeon -f /tmp/001_identity_init.sql'
```
Ожидание: `BEGIN`, серия `CREATE TABLE`/`ALTER TABLE`/`CREATE INDEX`/`UPDATE`/`INSERT`, `COMMIT` — без ошибок.

Проверка:
```bash
ssh dv@85.192.61.231 'PGPASSWORD=linkeon_pass_2026 psql -U linkeon -h localhost -p 5433 -d linkeon -c "\d user_identities; SELECT COUNT(*) FROM user_identities WHERE provider=\"phone\";"'
```
Expected: schema видна, count > 0 (количество существующих юзеров).

- [ ] **Step 3: Auto-apply via TasksService pattern**

В `src/identity/identity.service.ts` (создадим в Task 2) — `onModuleInit` будет применять миграцию из той же папки (как делает `TasksService` — см. `src/tasks/tasks.service.ts:44-63`). На этом шаге создаём только SQL-файл, привязка к коду — в Task 2.

- [ ] **Step 4: Commit миграционного SQL**

```bash
cd ~/Downloads/spirits_back
mkdir -p src/identity/migrations
# (файл уже создан в Step 1)
git add src/identity/migrations/001_identity_init.sql
git commit -m "feat(identity): миграция 001 — user_identities + user_id extras + backfill"
```

---

### Task 2: `IdentityService` skeleton + Module + types

**Files:**
- Create: `src/identity/identity.service.ts`
- Create: `src/identity/identity.module.ts`
- Create: `src/identity/identity.types.ts`
- Modify: `src/app.module.ts` (импорт `IdentityModule`)

- [ ] **Step 1: Создать типы**

`src/identity/identity.types.ts`:
```ts
export type Provider = 'phone' | 'email' | 'google' | 'yandex';

export interface PhoneData   { phone: string }
export interface EmailData   { email: string }
export interface GoogleData  { sub: string; email: string; emailVerified: boolean }
export interface YandexData  { sub: string; email: string; emailVerified: boolean }

export type ProviderData<P extends Provider> =
  P extends 'phone'  ? PhoneData :
  P extends 'email'  ? EmailData :
  P extends 'google' ? GoogleData :
  P extends 'yandex' ? YandexData : never;

export interface Identity {
  id: string;
  provider: Provider;
  providerSub: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ResolveResult {
  userId: string;
  isNew: boolean;
  mergedExisting: boolean;
}
```

- [ ] **Step 2: Создать скелет сервиса с onModuleInit (auto-migrate)**

`src/identity/identity.service.ts`:
```ts
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PgService } from '../common/services/pg.service';
import type { Provider, ProviderData, Identity, ResolveResult } from './identity.types';

@Injectable()
export class IdentityService implements OnModuleInit {
  private readonly logger = new Logger(IdentityService.name);
  private readonly WELCOME_BONUS = 25000;

  constructor(@Optional() private readonly pg?: PgService) {}

  async onModuleInit() {
    if (!this.pg) return;
    const candidates = [
      path.join(__dirname, 'migrations', '001_identity_init.sql'),
      path.join(__dirname, '..', '..', 'src', 'identity', 'migrations', '001_identity_init.sql'),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const sql = fs.readFileSync(p, 'utf8');
          await this.pg.query(sql);
          this.logger.log(`identity migration 001 applied from ${p}`);
          return;
        }
      } catch (e: any) {
        this.logger.error(`identity migration failed (${p}): ${e.message}`);
      }
    }
    this.logger.warn('identity migration sql not found, skipping');
  }

  // Нормализация provider_sub из сырого ProviderData (всегда вызывается перед lookup/insert)
  private normalize<P extends Provider>(provider: P, data: ProviderData<P>): string {
    if (provider === 'phone') return (data as PhoneData).phone.replace(/\D/g, '');
    if (provider === 'email') return (data as EmailData).email.trim().toLowerCase();
    if (provider === 'google') return (data as GoogleData).sub;
    if (provider === 'yandex') return (data as YandexData).sub;
    throw new Error(`unknown provider: ${provider}`);
  }

  // Извлекает email и emailVerified из ProviderData (если применимо)
  private extractEmail<P extends Provider>(provider: P, data: ProviderData<P>): { email: string | null; verified: boolean } {
    if (provider === 'email')  return { email: this.normalize('email', data as EmailData), verified: true };
    if (provider === 'google') return { email: (data as GoogleData).email.trim().toLowerCase(), verified: (data as GoogleData).emailVerified };
    if (provider === 'yandex') return { email: (data as YandexData).email.trim().toLowerCase(), verified: (data as YandexData).emailVerified };
    return { email: null, verified: false };
  }

  // Stubs — заполнятся в следующих тасках
  async resolveOrCreate<P extends Provider>(_provider: P, _data: ProviderData<P>): Promise<ResolveResult> {
    throw new Error('not implemented');
  }
  async linkMethod<P extends Provider>(_userId: string, _provider: P, _data: ProviderData<P>): Promise<{ ok: true } | { ok: false; reason: 'conflict' | 'invalid' }> {
    throw new Error('not implemented');
  }
  async unlinkMethod(_userId: string, _identityId: string): Promise<{ ok: true } | { ok: false; reason: 'last_method' }> {
    throw new Error('not implemented');
  }
  async listIdentities(_userId: string): Promise<Identity[]> {
    throw new Error('not implemented');
  }
}

interface PhoneData  { phone: string }
interface EmailData  { email: string }
interface GoogleData { sub: string; email: string; emailVerified: boolean }
interface YandexData { sub: string; email: string; emailVerified: boolean }
```

- [ ] **Step 3: Создать модуль**

`src/identity/identity.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { PgService } from '../common/services/pg.service';

@Module({
  providers: [IdentityService, PgService],
  exports: [IdentityService],
})
export class IdentityModule {}
```

- [ ] **Step 4: Зарегистрировать в `app.module.ts`**

Найди `imports` в `src/app.module.ts`, добавь `IdentityModule`:
```ts
import { IdentityModule } from './identity/identity.module';
// ...
@Module({
  imports: [
    // ... existing
    IdentityModule,
  ],
  // ...
})
```

- [ ] **Step 5: Билд + commit**

```bash
export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"
cd ~/Downloads/spirits_back
pnpm build
```
Expected: успех.

```bash
git add src/identity/
git add src/app.module.ts
git commit -m "feat(identity): IdentityService skeleton + types + module + auto-migrate"
```

---

### Task 3: `IdentityService.resolveOrCreate` (+ welcome bonus + tests)

**Files:**
- Modify: `src/identity/identity.service.ts`
- Create: `tests/unit/identity-resolveOrCreate.test.js`

- [ ] **Step 1: Написать failing-тест**

`tests/unit/identity-resolveOrCreate.test.js`:
```js
const { IdentityService } = require('../../dist/identity/identity.service');

function makePg(scripted) {
  let i = 0;
  return {
    query: jest.fn(async (sql, params) => {
      const r = scripted[i++];
      if (!r) throw new Error(`pg.query #${i} unexpected: ${sql.slice(0,60)}`);
      return r;
    }),
  };
}

describe('IdentityService.resolveOrCreate', () => {
  test('lookup существующей identity → возвращает userId, isNew=false', async () => {
    const pg = makePg([
      { rows: [{ user_id: 'u1' }] },          // SELECT user_id from user_identities
      { rows: [], rowCount: 1 },               // UPDATE last_used_at
    ]);
    const svc = new IdentityService(pg);
    const out = await svc.resolveOrCreate('phone', { phone: '79030169187' });
    expect(out).toEqual({ userId: 'u1', isNew: false, mergedExisting: false });
  });

  test('новый user — INSERT user_id, ai_profiles_consolidated, user_identities, welcome bonus', async () => {
    const pg = makePg([
      { rows: [] },                                                    // lookup user_identities — пусто
      // (для не-email/oauth — мерж пропускается)
      { rows: [], rowCount: 0 },                                       // BEGIN
      { rows: [{ internal_id: 'NEW-UUID' }] },                          // INSERT user_id RETURNING
      { rows: [], rowCount: 1 },                                       // INSERT ai_profiles_consolidated
      { rows: [], rowCount: 1 },                                       // INSERT user_identities
      { rows: [{ id: 'NEW-UUID' }] },                                  // UPDATE welcome_bonus_at RETURNING
      { rows: [], rowCount: 1 },                                       // UPDATE ai_profiles_consolidated tokens
      { rows: [], rowCount: 0 },                                       // COMMIT
    ]);
    const svc = new IdentityService(pg);
    const out = await svc.resolveOrCreate('phone', { phone: '79030169187' });
    expect(out.isNew).toBe(true);
    expect(out.userId).toBe('NEW-UUID');
    expect(out.mergedExisting).toBe(false);
  });

  test('OAuth с verified email — merge к существующему юзеру с тем же verified email', async () => {
    const pg = makePg([
      { rows: [] },                                              // lookup (google,sub-X) — пусто
      { rows: [{ user_id: 'EXISTING' }] },                       // mergeByVerifiedEmail — нашёл
      { rows: [], rowCount: 1 },                                 // INSERT user_identities (новая google для existing)
    ]);
    const svc = new IdentityService(pg);
    const out = await svc.resolveOrCreate('google', { sub: 'g-123', email: 'foo@gmail.com', emailVerified: true });
    expect(out).toEqual({ userId: 'EXISTING', isNew: false, mergedExisting: true });
  });

  test('phone нормализуется (убираем +, скобки, пробелы)', async () => {
    const pg = makePg([
      { rows: [{ user_id: 'u1' }] },
      { rows: [], rowCount: 1 },
    ]);
    const svc = new IdentityService(pg);
    await svc.resolveOrCreate('phone', { phone: '+7 (903) 016-91-87' });
    const lookupParams = pg.query.mock.calls[0][1];
    expect(lookupParams).toContain('79030169187');
  });
});
```

- [ ] **Step 2: Прогон — FAIL**

```bash
export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"
cd ~/Downloads/spirits_back/tests && npx jest unit/identity-resolveOrCreate.test.js
```
Expected: FAIL — `not implemented`.

- [ ] **Step 3: Реализовать**

Замени stub в `src/identity/identity.service.ts`:

```ts
async resolveOrCreate<P extends Provider>(provider: P, data: ProviderData<P>): Promise<ResolveResult> {
  if (!this.pg) throw new Error('pg not configured');

  const providerSub = this.normalize(provider, data);
  const { email, verified } = this.extractEmail(provider, data);

  // 1) Lookup
  const found = await this.pg.query(
    `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_sub = $2 LIMIT 1`,
    [provider, providerSub],
  );
  if (found.rows.length) {
    const userId = found.rows[0].user_id;
    await this.pg.query(
      `UPDATE user_identities SET last_used_at = now() WHERE provider = $1 AND provider_sub = $2`,
      [provider, providerSub],
    );
    return { userId, isNew: false, mergedExisting: false };
  }

  // 2) Merge by verified email (для email/google/yandex с подтверждённым email)
  if (email && verified) {
    const merge = await this.pg.query(
      `SELECT user_id FROM user_identities WHERE email = $1 AND email_verified = true LIMIT 1`,
      [email],
    );
    if (merge.rows.length) {
      const userId = merge.rows[0].user_id;
      await this.pg.query(
        `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified, last_used_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [userId, provider, providerSub, email, verified],
      );
      return { userId, isNew: false, mergedExisting: true };
    }
  }

  // 3) Create new — в транзакции
  await this.pg.query(`BEGIN`);
  try {
    let userId: string;
    if (provider === 'phone') {
      // Phone-юзеры сохраняют convention: internal_id = phone (для совместимости со старыми)
      userId = providerSub;
      await this.pg.query(
        `INSERT INTO user_id (primary_phone, state, internal_id, signup_method)
         VALUES ($1, 'active', $2, $3) ON CONFLICT (internal_id) DO NOTHING
         RETURNING internal_id`,
        [providerSub, userId, provider],
      );
    } else {
      // Не-phone — UUID
      const ins = await this.pg.query(
        `INSERT INTO user_id (state, internal_id, primary_email, signup_method)
         VALUES ('active', gen_random_uuid()::text, $1, $2)
         RETURNING internal_id`,
        [email, provider],
      );
      userId = ins.rows[0].internal_id;
    }
    await this.pg.query(
      `INSERT INTO ai_profiles_consolidated (user_id, tokens, isadmin) VALUES ($1, 0, false) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    await this.pg.query(
      `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified, last_used_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [userId, provider, providerSub, email, verified],
    );
    await this.issueWelcomeBonus(userId);
    await this.pg.query(`COMMIT`);
    return { userId, isNew: true, mergedExisting: false };
  } catch (e: any) {
    await this.pg.query(`ROLLBACK`);
    throw e;
  }
}

private async issueWelcomeBonus(userId: string): Promise<void> {
  if (!this.pg) return;
  const claimed = await this.pg.query(
    `UPDATE user_id SET welcome_bonus_at = now()
     WHERE internal_id = $1 AND welcome_bonus_at IS NULL
     RETURNING internal_id`,
    [userId],
  );
  if (claimed.rows.length === 0) return; // уже выдавали
  await this.pg.query(
    `UPDATE ai_profiles_consolidated SET tokens = tokens + $1 WHERE user_id = $2`,
    [this.WELCOME_BONUS, userId],
  );
  this.logger.log(`welcome bonus ${this.WELCOME_BONUS} → ${userId}`);
}
```

- [ ] **Step 4: Билд + прогон тестов**

```bash
cd ~/Downloads/spirits_back && pnpm build && cd tests && npx jest unit/identity-resolveOrCreate.test.js
```
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/identity/identity.service.ts tests/unit/identity-resolveOrCreate.test.js
git commit -m "feat(identity): resolveOrCreate с merge-by-email + welcome bonus в транзакции"
```

---

### Task 4: `IdentityService.linkMethod` + `unlinkMethod` + `listIdentities`

**Files:**
- Modify: `src/identity/identity.service.ts`
- Create: `tests/unit/identity-link-unlink.test.js`

- [ ] **Step 1: Написать failing-тест**

`tests/unit/identity-link-unlink.test.js`:
```js
const { IdentityService } = require('../../dist/identity/identity.service');

function makePg(scripted) {
  let i = 0;
  return { query: jest.fn(async () => {
    const r = scripted[i++];
    if (!r) throw new Error(`unexpected pg.query #${i}`);
    return r;
  }) };
}

describe('linkMethod', () => {
  test('успешная привязка нового метода', async () => {
    const pg = makePg([
      { rows: [] },                  // existing identity by (provider, sub) — пусто
      { rows: [], rowCount: 1 },     // INSERT
    ]);
    const svc = new IdentityService(pg);
    const out = await svc.linkMethod('u1', 'email', { email: 'new@x.com' });
    expect(out).toEqual({ ok: true });
  });

  test('attempt на чужую identity — conflict', async () => {
    const pg = makePg([
      { rows: [{ user_id: 'u-other' }] },   // занята другим
    ]);
    const svc = new IdentityService(pg);
    const out = await svc.linkMethod('u1', 'email', { email: 'taken@x.com' });
    expect(out).toEqual({ ok: false, reason: 'conflict' });
  });

  test('повторная привязка той же identity своему userId — ok', async () => {
    const pg = makePg([
      { rows: [{ user_id: 'u1' }] },   // та же identity уже привязана тому же юзеру
    ]);
    const svc = new IdentityService(pg);
    const out = await svc.linkMethod('u1', 'email', { email: 'mine@x.com' });
    expect(out).toEqual({ ok: true });
  });
});

describe('unlinkMethod', () => {
  test('успешно удаляет когда есть другие методы', async () => {
    const pg = makePg([
      { rows: [{ count: '2' }] },       // SELECT count
      { rows: [], rowCount: 1 },        // DELETE
    ]);
    const svc = new IdentityService(pg);
    const out = await svc.unlinkMethod('u1', 'identity-uuid');
    expect(out).toEqual({ ok: true });
  });

  test('отказ если это последний метод', async () => {
    const pg = makePg([
      { rows: [{ count: '1' }] },
    ]);
    const svc = new IdentityService(pg);
    const out = await svc.unlinkMethod('u1', 'identity-uuid');
    expect(out).toEqual({ ok: false, reason: 'last_method' });
  });
});

describe('listIdentities', () => {
  test('возвращает identities юзера в camelCase', async () => {
    const pg = makePg([
      { rows: [
        { id: 'a', provider: 'phone', provider_sub: '79030169187', email: null, email_verified: false, created_at: '2026-01-01', last_used_at: '2026-05-28' },
        { id: 'b', provider: 'email', provider_sub: 'me@x.com', email: 'me@x.com', email_verified: true, created_at: '2026-05-28', last_used_at: null },
      ]},
    ]);
    const svc = new IdentityService(pg);
    const out = await svc.listIdentities('u1');
    expect(out).toEqual([
      { id: 'a', provider: 'phone', providerSub: '79030169187', email: null, emailVerified: false, createdAt: '2026-01-01', lastUsedAt: '2026-05-28' },
      { id: 'b', provider: 'email', providerSub: 'me@x.com', email: 'me@x.com', emailVerified: true, createdAt: '2026-05-28', lastUsedAt: null },
    ]);
  });
});
```

- [ ] **Step 2: Прогон — FAIL**

```bash
npx jest unit/identity-link-unlink.test.js
```

- [ ] **Step 3: Реализовать**

Замени stubs в `IdentityService`:

```ts
async linkMethod<P extends Provider>(userId: string, provider: P, data: ProviderData<P>): Promise<{ ok: true } | { ok: false; reason: 'conflict' | 'invalid' }> {
  if (!this.pg) return { ok: false, reason: 'invalid' };

  const providerSub = this.normalize(provider, data);
  const { email, verified } = this.extractEmail(provider, data);

  const existing = await this.pg.query(
    `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_sub = $2 LIMIT 1`,
    [provider, providerSub],
  );
  if (existing.rows.length) {
    if (existing.rows[0].user_id === userId) return { ok: true }; // уже привязано к нам — noop
    return { ok: false, reason: 'conflict' };
  }
  await this.pg.query(
    `INSERT INTO user_identities (user_id, provider, provider_sub, email, email_verified, last_used_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [userId, provider, providerSub, email, verified],
  );
  return { ok: true };
}

async unlinkMethod(userId: string, identityId: string): Promise<{ ok: true } | { ok: false; reason: 'last_method' }> {
  if (!this.pg) return { ok: false, reason: 'last_method' };
  const cnt = await this.pg.query(
    `SELECT count(*)::int AS count FROM user_identities WHERE user_id = $1`,
    [userId],
  );
  if (parseInt(cnt.rows[0].count, 10) <= 1) return { ok: false, reason: 'last_method' };
  await this.pg.query(
    `DELETE FROM user_identities WHERE id = $1 AND user_id = $2`,
    [identityId, userId],
  );
  return { ok: true };
}

async listIdentities(userId: string): Promise<Identity[]> {
  if (!this.pg) return [];
  const res = await this.pg.query(
    `SELECT id, provider, provider_sub, email, email_verified, created_at, last_used_at
       FROM user_identities WHERE user_id = $1
       ORDER BY created_at`,
    [userId],
  );
  return res.rows.map(r => ({
    id: r.id,
    provider: r.provider,
    providerSub: r.provider_sub,
    email: r.email,
    emailVerified: r.email_verified,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}
```

- [ ] **Step 4: Билд + тесты**

```bash
cd ~/Downloads/spirits_back && pnpm build && cd tests && npx jest unit/identity-link-unlink.test.js
```
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/identity/identity.service.ts tests/unit/identity-link-unlink.test.js
git commit -m "feat(identity): linkMethod + unlinkMethod + listIdentities"
```

---

### Task 5: Refactor phone-flow через IdentityService

**Files:**
- Modify: `src/auth/auth.service.ts`
- Modify: `src/auth/auth.module.ts`

- [ ] **Step 1: Импортировать IdentityService в auth.module**

`src/auth/auth.module.ts` — добавить:
```ts
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [/* existing */, IdentityModule],
  // ...
})
```

- [ ] **Step 2: Заинжектить в AuthService и заменить INSERT'ы**

В `src/auth/auth.service.ts`:
- В constructor добавить `private readonly identity: IdentityService` после `jwtSvc`.
- Импорт: `import { IdentityService } from '../identity/identity.service';`
- В `requestSmsCode` удалить блок `// Create user if not exists` (lines ~36-46 примерно — `INSERT user_id` + `INSERT ai_profiles_consolidated`). Создание юзера теперь происходит в `checkCode` через `IdentityService.resolveOrCreate`.
- В `checkCode` после успешной валидации SMS-кода — заменить логику issuance JWT:

Найти место, где сейчас issue токенов (после `await this.redis.del`), и поставить:
```ts
const { userId } = await this.identity.resolveOrCreate('phone', { phone });
const tokens = {
  'access-token':  this.jwtSvc.signAccess({ userId, sub: userId, type: 'access' }),
  'refresh-token': this.jwtSvc.signRefresh({ userId, sub: userId, type: 'refresh' }),
};
return tokens;
```

(Точный код зависит от текущей формы `checkCode`; нужно посмотреть в файле и заменить старую issuance логику. JWT payload меняется с `phone` на `userId` — это часть Task 6 codemod, но здесь начинаем.)

- [ ] **Step 3: Билд**

```bash
cd ~/Downloads/spirits_back && pnpm build
```
Если есть TS-ошибки из-за `signAccess({ userId, ... })` вместо старого `{ phone, ... }` — это нормально, исправим в Task 6.

Временный workaround: если `jwtSvc.signAccess` ожидает `{phone}`, передаём `{phone: userId, ...}` (как в варианте B из брейнштурма) — это переходное состояние ДО полного rename.

Реальная финальная форма — после Task 6. На этом шаге допустимо чтобы код компилировался любой ценой; merge с Task 6 закрывает.

- [ ] **Step 4: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.module.ts
git commit -m "feat(auth): refactor phone-flow на IdentityService.resolveOrCreate"
```

---

### Task 6: Codemod `req.user.phone` → `req.user.userId` + JWT payload rename

**Files:**
- Modify: `src/common/services/jwt.service.ts` (тип payload)
- Modify: `src/common/guards/jwt.guard.ts` (request.user shape)
- Modify: `src/auth/auth.service.ts` (issueTokens, если ещё не)
- Modify: ~5 контроллеров с `req.user.phone`

- [ ] **Step 1: Найти все usages**

```bash
cd ~/Downloads/spirits_back
grep -rn "req\.user\.phone\|request\.user\.phone\|\.user\.phone" src/ --include="*.ts"
```
Должно показать ~10 строк в 5 файлах (smm/* в основном).

- [ ] **Step 2: Запустить codemod**

```bash
find src -name "*.ts" -not -name "*.d.ts" -exec sed -i.bak \
  -e 's/req\.user\.phone/req.user.userId/g' \
  -e 's/request\.user\.phone/request.user.userId/g' \
  {} \;
find src -name "*.ts.bak" -delete
```

- [ ] **Step 3: Поправить JwtService и JwtGuard**

`src/common/services/jwt.service.ts` — найти интерфейсы/типы payload, переименовать `phone: string` → `userId: string`. Если есть generic функция `signAccess<T>(payload: T)` без своего типа — менять не надо, она и так принимает любой объект.

`src/common/guards/jwt.guard.ts` — в самом конце метода `canActivate`:
```ts
// до:  request.user = { phone, sub: payload.sub, isAdmin };
// после:
const userId: string = payload.userId;  // или: payload.userId ?? payload.phone (на переходный период)
// ...
const r = await this.pg.query(
  `SELECT isadmin FROM ai_profiles_consolidated WHERE user_id = $1`,
  [userId],   // было: [phone]
);
// ...
request.user = { userId, sub: payload.sub, isAdmin };
```

Если хочется максимальной защиты на переход — `const userId = payload.userId ?? payload.phone;` (на случай если в проде есть JWT'ы старой формы с полем `phone`). После одного refresh-cycle все токены будут новой формы.

- [ ] **Step 4: Билд + проверка**

```bash
cd ~/Downloads/spirits_back && pnpm build
```
Если TS ругается — пройдись по каждому месту, замени локальные `const phone = ...` на `const userId = ...` где это уже не phone-номер.

```bash
grep -rn "req\.user\.phone\|request\.user\.phone\|\.user\.phone" src/ --include="*.ts" | wc -l
```
Expected: `0`.

- [ ] **Step 5: Прогон unit-тестов**

```bash
cd tests && npx jest unit/
```
Expected: все 4+ test suites зелёные.

- [ ] **Step 6: Commit**

```bash
cd ~/Downloads/spirits_back
git add -u src/
git commit -m "refactor(auth): codemod req.user.phone → req.user.userId, JWT payload userId"
```

---

## Phase B — Email magic-link backend

### Task 7: Установить зависимости + создать EmailService

**Files:**
- Modify: `package.json`
- Create: `src/auth/email.service.ts`
- Create: `src/identity/tempmail-domains.json` (data file)

- [ ] **Step 1: Установить пакеты**

```bash
export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"
cd ~/Downloads/spirits_back
pnpm add bcryptjs disposable-email-domains resend
pnpm add -D @types/bcryptjs
```

- [ ] **Step 2: Создать data-файл tempmail-доменов**

```bash
node -e "
const d = require('disposable-email-domains');
require('fs').writeFileSync('src/identity/tempmail-domains.json', JSON.stringify(d, null, 0));
console.log('domains:', d.length);
"
```
Expected: domains > 3000.

- [ ] **Step 3: Создать `EmailService` скелет**

`src/auth/email.service.ts`:
```ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { RedisService } from '../common/services/redis.service';
import { PgService } from '../common/services/pg.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private tempmailDomains: Set<string>;
  private resend: Resend | null = null;
  private readonly fromAddress = process.env.EMAIL_FROM || 'noreply@my.linkeon.io';

  constructor(
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly pg?: PgService,
  ) {
    this.tempmailDomains = this.loadTempmailDomains();
    const key = process.env.RESEND_API_KEY;
    if (key) this.resend = new Resend(key);
  }

  private loadTempmailDomains(): Set<string> {
    const candidates = [
      path.join(__dirname, '..', 'identity', 'tempmail-domains.json'),
      path.join(__dirname, '..', '..', 'src', 'identity', 'tempmail-domains.json'),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return new Set(JSON.parse(fs.readFileSync(p, 'utf8')));
      } catch {}
    }
    this.logger.warn('tempmail-domains.json not found, blocking disabled');
    return new Set();
  }

  isTempmail(email: string): boolean {
    const domain = email.toLowerCase().split('@')[1] || '';
    return this.tempmailDomains.has(domain);
  }

  async generateMagicToken(email: string): Promise<string> {
    if (!this.redis) throw new Error('redis not configured');
    const token = crypto.randomBytes(32).toString('base64url');
    await this.redis.set(`ml-${token}`, email, 600);
    return token;
  }

  async consumeMagicToken(token: string): Promise<string | null> {
    if (!this.redis) return null;
    const email = await this.redis.get(`ml-${token}`);
    if (!email) return null;
    await this.redis.del(`ml-${token}`);
    return email;
  }

  async sendMagicLink(email: string, token: string): Promise<void> {
    const url = `${process.env.PUBLIC_BASE_URL || 'https://my.linkeon.io'}/webhook/auth/email/confirm?token=${token}`;
    if (!this.resend) {
      this.logger.warn(`Resend not configured. Magic-link for ${email}: ${url}`);
      return;
    }
    await this.resend.emails.send({
      from: this.fromAddress,
      to: email,
      subject: 'Вход в linkeon.io',
      html: `
        <p>Чтобы войти в linkeon.io, кликни по этой ссылке:</p>
        <p><a href="${url}">${url}</a></p>
        <p>Ссылка действует 10 минут. Если ты не запрашивал вход — просто игнорируй это письмо.</p>
      `,
    });
    this.logger.log(`magic-link sent to ${email}`);
  }

  async checkRateLimit(email: string, ip: string): Promise<{ ok: true } | { ok: false; reason: 'per_email' | 'per_ip' }> {
    if (!this.redis) return { ok: true };
    const perEmail = await this.redis.get(`ml-rate-${email}`);
    if (perEmail) return { ok: false, reason: 'per_email' };
    await this.redis.set(`ml-rate-${email}`, '1', 60);
    const ipCount = parseInt((await this.redis.get(`ml-rate-ip-${ip}`)) || '0', 10);
    if (ipCount >= 10) return { ok: false, reason: 'per_ip' };
    await this.redis.set(`ml-rate-ip-${ip}`, String(ipCount + 1), 600);
    return { ok: true };
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
```

- [ ] **Step 4: Билд**

```bash
cd ~/Downloads/spirits_back && pnpm build
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/identity/tempmail-domains.json src/auth/email.service.ts
git commit -m "feat(auth): EmailService skeleton (magic-link, tempmail-block, rate-limit, bcrypt)"
```

---

### Task 8: Email magic-link endpoints (request + confirm)

**Files:**
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.module.ts`
- Modify: `src/auth/auth.service.ts` (или новый wrapper)

- [ ] **Step 1: Зарегистрировать EmailService в AuthModule**

`src/auth/auth.module.ts`:
```ts
import { EmailService } from './email.service';
// ...
@Module({
  imports: [/* existing */, IdentityModule],
  providers: [AuthService, EmailService],
  controllers: [AuthController],
})
```

- [ ] **Step 2: Добавить хендлеры в `AuthController`**

В импортах:
```ts
import { Body, Controller, Get, Post, Param, Query, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { IdentityService } from '../identity/identity.service';
```

В constructor:
```ts
constructor(
  private readonly authService: AuthService,
  private readonly email: EmailService,
  private readonly identity: IdentityService,
  private readonly jwt: JwtService,  // если нужен — импорт из common
) {}
```

Добавить методы:

```ts
@Post('webhook/auth/email/request')
async emailRequest(@Body() body: { email?: string }, @Req() req: Request, @Res() res: Response) {
  const rawEmail = (body?.email || '').trim().toLowerCase();
  if (!rawEmail || !rawEmail.includes('@')) {
    return res.set(CORS).status(400).json({ error: 'invalid email' });
  }
  if (this.email.isTempmail(rawEmail)) {
    return res.set(CORS).status(400).json({ error: 'tempmail_blocked', message: 'Используйте постоянную почту' });
  }
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0];
  const rl = await this.email.checkRateLimit(rawEmail, ip);
  if (!rl.ok) {
    return res.set(CORS).status(429).json({ error: 'rate_limit', reason: rl.reason });
  }
  const token = await this.email.generateMagicToken(rawEmail);
  await this.email.sendMagicLink(rawEmail, token);
  return res.set(CORS).status(200).json({ sent: true });
}

@Get('webhook/auth/email/confirm')
async emailConfirm(@Query('token') token: string, @Req() req: Request, @Res() res: Response) {
  if (!token) {
    return res.set(CORS).status(400).send('<html><body><h1>Ссылка устарела</h1></body></html>');
  }
  const email = await this.email.consumeMagicToken(token);
  if (!email) {
    return res.set(CORS).status(400).send('<html><body><h1>Ссылка устарела или уже использована</h1></body></html>');
  }
  const { userId } = await this.identity.resolveOrCreate('email', { email });
  const tokens = {
    'access-token':  this.jwt.signAccess({ userId, sub: userId, type: 'access' }),
    'refresh-token': this.jwt.signRefresh({ userId, sub: userId, type: 'refresh' }),
  };
  // JSON для XHR-ответа (если фронт сам зовёт endpoint), HTML с inline-script для прямого GET клика по ссылке
  if ((req.headers['accept'] || '').includes('application/json')) {
    return res.set(CORS).status(200).json(tokens);
  }
  const escapedAccess  = JSON.stringify(tokens['access-token']);
  const escapedRefresh = JSON.stringify(tokens['refresh-token']);
  res.set(CORS).status(200).type('html').send(`
<!doctype html>
<html><head><meta charset="utf-8"><title>Вход выполнен</title></head>
<body style="font-family:system-ui;padding:40px;text-align:center">
<p>Заходим...</p>
<script>
try {
  localStorage.setItem('jwt_access_token', ${escapedAccess});
  localStorage.setItem('jwt_refresh_token', ${escapedRefresh});
  localStorage.setItem('authToken', ${escapedAccess});
} catch(e) {}
location.replace('/chat');
</script>
</body></html>
  `);
}
```

(`CORS` — уже импортируется в начале файла.)

- [ ] **Step 3: Билд + ручной smoke**

```bash
cd ~/Downloads/spirits_back && pnpm build
```

Локально (если есть `.env`) или после деплоя:
```bash
curl -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com"}' https://test.linkeon.io/webhook/auth/email/request
# Expected: {"sent":true}

# Tempmail block:
curl -X POST -H "Content-Type: application/json" -d '{"email":"test@10minutemail.com"}' https://test.linkeon.io/webhook/auth/email/request
# Expected: 400 {"error":"tempmail_blocked",...}
```

- [ ] **Step 4: Добавить API-тесты**

В `tests/api.test.js`:
```js
'POST /webhook/auth/email/request — invalid email → 400': async () => {
  const resp = await http.post('/webhook/auth/email/request', { email: 'notanemail' }, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 400);
},
'POST /webhook/auth/email/request — tempmail → 400': async () => {
  const resp = await http.post('/webhook/auth/email/request', { email: 'foo@10minutemail.com' }, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 400);
  if (resp.data?.error !== 'tempmail_blocked') throw new Error(`expected tempmail_blocked, got ${JSON.stringify(resp.data)}`);
},
'GET /webhook/auth/email/confirm — без токена → 400': async () => {
  const resp = await http.get('/webhook/auth/email/confirm');
  assertStatus(resp, 400);
},
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.controller.ts src/auth/auth.module.ts tests/api.test.js
git commit -m "feat(auth): magic-link request + confirm endpoints (HTML+JSON, tempmail-block, rate-limit)"
```

---

### Task 9: Email password — set + login

**Files:**
- Modify: `src/auth/auth.controller.ts`

- [ ] **Step 1: Endpoint POST /webhook/auth/email/login**

В `AuthController`:
```ts
@Post('webhook/auth/email/login')
async emailLogin(@Body() body: { email?: string; password?: string }, @Res() res: Response) {
  const email = (body?.email || '').trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) return res.set(CORS).status(400).json({ error: 'missing fields' });

  // Lookup identity
  const idRes = await this.identity['pg']!.query(
    `SELECT user_id FROM user_identities WHERE provider = 'email' AND provider_sub = $1 AND email_verified = true LIMIT 1`,
    [email],
  );
  if (!idRes.rows.length) return res.set(CORS).status(401).json({ error: 'invalid credentials' });
  const userId = idRes.rows[0].user_id;

  // Lookup password
  const pwRes = await this.identity['pg']!.query(
    `SELECT password_hash FROM user_id WHERE internal_id = $1`,
    [userId],
  );
  const hash = pwRes.rows[0]?.password_hash;
  if (!hash) return res.set(CORS).status(401).json({ error: 'no password set' });

  const ok = await this.email.verifyPassword(password, hash);
  if (!ok) return res.set(CORS).status(401).json({ error: 'invalid credentials' });

  await this.identity['pg']!.query(
    `UPDATE user_identities SET last_used_at = now() WHERE provider = 'email' AND provider_sub = $1`,
    [email],
  );

  return res.set(CORS).status(200).json({
    'access-token':  this.jwt.signAccess({ userId, sub: userId, type: 'access' }),
    'refresh-token': this.jwt.signRefresh({ userId, sub: userId, type: 'refresh' }),
  });
}
```

- [ ] **Step 2: Endpoint POST /webhook/auth/email/set-password (для залогиненного юзера)**

```ts
@UseGuards(JwtGuard)
@Post('webhook/auth/email/set-password')
async setPassword(@Body() body: { password?: string }, @Req() req: any, @Res() res: Response) {
  const password = body?.password;
  if (!password || password.length < 8) {
    return res.set(CORS).status(400).json({ error: 'password must be 8+ chars' });
  }
  const userId = req.user?.userId;
  if (!userId) return res.set(CORS).status(401).json({ error: 'unauthorized' });

  const hash = await this.email.hashPassword(password);
  await this.identity['pg']!.query(
    `UPDATE user_id SET password_hash = $1 WHERE internal_id = $2`,
    [hash, userId],
  );
  return res.set(CORS).status(200).json({ ok: true });
}
```

`UseGuards` импорт: `import { UseGuards } from '@nestjs/common'; import { JwtGuard } from '../common/guards/jwt.guard';`

- [ ] **Step 3: Билд + API-тесты**

```bash
cd ~/Downloads/spirits_back && pnpm build
```

В `tests/api.test.js`:
```js
'POST /webhook/auth/email/login — missing fields → 400': async () => {
  const resp = await http.post('/webhook/auth/email/login', {}, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 400);
},
'POST /webhook/auth/email/login — unknown email → 401': async () => {
  const resp = await http.post('/webhook/auth/email/login', { email: 'nobody@example.com', password: 'xxxxxxxx' }, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 401);
},
'POST /webhook/auth/email/set-password — without token → 401': async () => {
  const resp = await http.post('/webhook/auth/email/set-password', { password: 'abcdefgh' }, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 401);
},
```

- [ ] **Step 4: Commit**

```bash
git add src/auth/auth.controller.ts tests/api.test.js
git commit -m "feat(auth): email/login (password) + email/set-password endpoints"
```

---

### Task 10: Debug email-token endpoint + рефактор `IdentityService` доступа

**Files:**
- Modify: `src/identity/identity.service.ts` (вынести pg в protected чтобы не лазить через `['pg']`)
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/misc/misc.controller.ts` (или там где debug/sms-code сейчас)

- [ ] **Step 1: Открыть pg-доступ через метод**

В `IdentityService` добавь public-метод для прямых SQL-запросов от auth-модулей (это не идеально, но проще чем дублировать SELECT-ы), либо — лучше — добавь конкретные методы:

```ts
async findIdentityByProviderSub(provider: Provider, providerSub: string): Promise<{ userId: string } | null> {
  if (!this.pg) return null;
  const sub = this.normalize(provider, { phone: providerSub, email: providerSub, sub: providerSub } as any);
  // (для email/phone normalize применит lowercase/digits; для google/yandex — pass-through)
  const r = await this.pg.query(
    `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_sub = $2 AND email_verified = $3 LIMIT 1`,
    [provider, sub, provider === 'email'],
  );
  return r.rows[0] ? { userId: r.rows[0].user_id } : null;
}

async getUserPasswordHash(userId: string): Promise<string | null> {
  if (!this.pg) return null;
  const r = await this.pg.query(`SELECT password_hash FROM user_id WHERE internal_id = $1`, [userId]);
  return r.rows[0]?.password_hash || null;
}

async setUserPasswordHash(userId: string, hash: string): Promise<void> {
  if (!this.pg) return;
  await this.pg.query(`UPDATE user_id SET password_hash = $1 WHERE internal_id = $2`, [hash, userId]);
}

async touchIdentity(provider: Provider, providerSub: string): Promise<void> {
  if (!this.pg) return;
  await this.pg.query(
    `UPDATE user_identities SET last_used_at = now() WHERE provider = $1 AND provider_sub = $2`,
    [provider, providerSub],
  );
}
```

В `auth.controller.ts` (Task 9) заменить `this.identity['pg']!.query(...)` на эти методы.

- [ ] **Step 2: Debug-эндпоинт `/webhook/debug/email-token/:email`**

Найти где сейчас debug/sms-code endpoint (`src/misc/misc.controller.ts` или похожее). Добавить рядом:

```ts
@Get('webhook/debug/email-token/:email')
async debugEmailToken(@Param('email') email: string, @Res() res: Response) {
  if (process.env.DEBUG_SMS_CODES !== 'true') {
    return res.status(404).json({ error: 'not enabled' });
  }
  // ищем активный ml-* токен для этого email в Redis
  const allKeys = await this.redis.keys('ml-*');
  for (const key of allKeys) {
    const v = await this.redis.get(key);
    if (v === email.toLowerCase().trim()) {
      return res.status(200).json({ token: key.slice(3), email: v });
    }
  }
  return res.status(404).json({ error: 'no active token' });
}
```

`this.redis.keys` может не существовать как метод — проверь `src/common/services/redis.service.ts`. Если нет — добавь:
```ts
async keys(pattern: string): Promise<string[]> {
  return this.client.keys(pattern);
}
```

- [ ] **Step 3: Билд + commit**

```bash
cd ~/Downloads/spirits_back && pnpm build
git add -u src/
git commit -m "feat(auth): refactor IdentityService pg access + debug email-token endpoint"
```

---

## Phase C — OAuth backend

### Task 11: OAuth init endpoint + Google service

**Files:**
- Create: `src/auth/oauth-google.service.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.module.ts`

- [ ] **Step 1: Создать `OAuthGoogleService`**

`src/auth/oauth-google.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class OAuthGoogleService {
  private readonly logger = new Logger(OAuthGoogleService.name);
  private readonly clientId = process.env.GOOGLE_CLIENT_ID || '';
  private readonly clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  private readonly redirectUri = `${process.env.PUBLIC_BASE_URL || 'https://my.linkeon.io'}/auth/google/callback`;

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCodeForUserinfo(code: string): Promise<{ sub: string; email: string; emailVerified: boolean }> {
    const tokenResp = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const accessToken = tokenResp.data?.access_token;
    if (!accessToken) throw new Error('no access_token from Google');

    const userinfo = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { sub, email, email_verified } = userinfo.data || {};
    if (!sub || !email) throw new Error('Google userinfo missing sub/email');
    return { sub, email, emailVerified: Boolean(email_verified) };
  }
}
```

- [ ] **Step 2: Зарегистрировать в `auth.module.ts`**

```ts
providers: [AuthService, EmailService, OAuthGoogleService],
```

- [ ] **Step 3: Endpoint `/oauth/init` + `/oauth/google`**

В `AuthController` (импорт `OAuthGoogleService`, `RedisService`):

```ts
@Post('webhook/auth/oauth/init')
async oauthInit(@Body() body: { provider?: string; intent?: 'login' | 'link' }, @Req() req: any, @Res() res: Response) {
  const provider = body?.provider;
  if (provider !== 'google' && provider !== 'yandex') {
    return res.set(CORS).status(400).json({ error: 'invalid provider' });
  }
  const intent = body?.intent === 'link' ? 'link' : 'login';

  let userId: string | undefined;
  if (intent === 'link') {
    // Достаём userId из JWT вручную (этот endpoint не под JwtGuard, чтобы login flow тоже работал)
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return res.set(CORS).status(401).json({ error: 'auth required for link' });
    }
    try {
      const payload = this.jwt.verify(authHeader.substring(7));
      userId = payload.userId;
    } catch {
      return res.set(CORS).status(401).json({ error: 'invalid token' });
    }
  }

  const state = require('crypto').randomBytes(24).toString('base64url');
  await this.redis.set(`oauth-state-${state}`, JSON.stringify({ provider, intent, userId }), 300);

  const authorizeUrl = provider === 'google'
    ? this.googleOAuth.buildAuthorizeUrl(state)
    : this.yandexOAuth.buildAuthorizeUrl(state);  // Task 12 добавит

  return res.set(CORS).status(200).json({ authorizeUrl });
}

@Post('webhook/auth/oauth/google')
async oauthGoogle(@Body() body: { code?: string; state?: string }, @Res() res: Response) {
  const { code, state } = body || {};
  if (!code || !state) return res.set(CORS).status(400).json({ error: 'missing code/state' });

  const stateRaw = await this.redis.get(`oauth-state-${state}`);
  if (!stateRaw) return res.set(CORS).status(400).json({ error: 'state expired' });
  await this.redis.del(`oauth-state-${state}`);
  const stateData = JSON.parse(stateRaw);
  if (stateData.provider !== 'google') return res.set(CORS).status(400).json({ error: 'state mismatch' });

  let userInfo;
  try {
    userInfo = await this.googleOAuth.exchangeCodeForUserinfo(code);
  } catch (e: any) {
    return res.set(CORS).status(400).json({ error: 'google exchange failed', detail: e.message });
  }

  if (stateData.intent === 'link' && stateData.userId) {
    const r = await this.identity.linkMethod(stateData.userId, 'google', userInfo);
    if (!r.ok) return res.set(CORS).status(409).json({ error: 'conflict' });
    return res.set(CORS).status(200).json({ linked: true });
  }

  const { userId } = await this.identity.resolveOrCreate('google', userInfo);
  return res.set(CORS).status(200).json({
    'access-token':  this.jwt.signAccess({ userId, sub: userId, type: 'access' }),
    'refresh-token': this.jwt.signRefresh({ userId, sub: userId, type: 'refresh' }),
  });
}
```

(Импорт `RedisService` в constructor и `OAuthGoogleService`.)

- [ ] **Step 4: Билд + commit**

```bash
cd ~/Downloads/spirits_back && pnpm build
```

```bash
git add src/auth/oauth-google.service.ts src/auth/auth.controller.ts src/auth/auth.module.ts
git commit -m "feat(auth): Google OAuth — init + callback exchange"
```

---

### Task 12: Yandex OAuth (зеркало Google)

**Files:**
- Create: `src/auth/oauth-yandex.service.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.module.ts`

- [ ] **Step 1: Создать `OAuthYandexService`**

`src/auth/oauth-yandex.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class OAuthYandexService {
  private readonly logger = new Logger(OAuthYandexService.name);
  private readonly clientId = process.env.YANDEX_CLIENT_ID || '';
  private readonly clientSecret = process.env.YANDEX_CLIENT_SECRET || '';
  private readonly redirectUri = `${process.env.PUBLIC_BASE_URL || 'https://my.linkeon.io'}/auth/yandex/callback`;

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state,
    });
    return `https://oauth.yandex.ru/authorize?${params}`;
  }

  async exchangeCodeForUserinfo(code: string): Promise<{ sub: string; email: string; emailVerified: boolean }> {
    const tokenResp = await axios.post('https://oauth.yandex.ru/token', new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const accessToken = tokenResp.data?.access_token;
    if (!accessToken) throw new Error('no access_token from Yandex');

    const userinfo = await axios.get('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
    const { id, default_email } = userinfo.data || {};
    if (!id || !default_email) throw new Error('Yandex userinfo missing id/default_email');
    return { sub: String(id), email: default_email, emailVerified: true };
  }
}
```

- [ ] **Step 2: Register в module**

```ts
providers: [AuthService, EmailService, OAuthGoogleService, OAuthYandexService],
```

- [ ] **Step 3: Endpoint `/oauth/yandex` (зеркало Google)**

В `AuthController` (после `oauthGoogle`):

```ts
@Post('webhook/auth/oauth/yandex')
async oauthYandex(@Body() body: { code?: string; state?: string }, @Res() res: Response) {
  const { code, state } = body || {};
  if (!code || !state) return res.set(CORS).status(400).json({ error: 'missing code/state' });

  const stateRaw = await this.redis.get(`oauth-state-${state}`);
  if (!stateRaw) return res.set(CORS).status(400).json({ error: 'state expired' });
  await this.redis.del(`oauth-state-${state}`);
  const stateData = JSON.parse(stateRaw);
  if (stateData.provider !== 'yandex') return res.set(CORS).status(400).json({ error: 'state mismatch' });

  let userInfo;
  try {
    userInfo = await this.yandexOAuth.exchangeCodeForUserinfo(code);
  } catch (e: any) {
    return res.set(CORS).status(400).json({ error: 'yandex exchange failed', detail: e.message });
  }

  if (stateData.intent === 'link' && stateData.userId) {
    const r = await this.identity.linkMethod(stateData.userId, 'yandex', userInfo);
    if (!r.ok) return res.set(CORS).status(409).json({ error: 'conflict' });
    return res.set(CORS).status(200).json({ linked: true });
  }

  const { userId } = await this.identity.resolveOrCreate('yandex', userInfo);
  return res.set(CORS).status(200).json({
    'access-token':  this.jwt.signAccess({ userId, sub: userId, type: 'access' }),
    'refresh-token': this.jwt.signRefresh({ userId, sub: userId, type: 'refresh' }),
  });
}
```

- [ ] **Step 4: API-тесты**

```js
'POST /webhook/auth/oauth/init — invalid provider → 400': async () => {
  const resp = await http.post('/webhook/auth/oauth/init', { provider: 'facebook' }, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 400);
},
'POST /webhook/auth/oauth/google — missing code/state → 400': async () => {
  const resp = await http.post('/webhook/auth/oauth/google', {}, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 400);
},
'POST /webhook/auth/oauth/yandex — missing code/state → 400': async () => {
  const resp = await http.post('/webhook/auth/oauth/yandex', {}, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 400);
},
'POST /webhook/auth/oauth/google — invalid state → 400': async () => {
  const resp = await http.post('/webhook/auth/oauth/google', { code: 'x', state: 'not-in-redis' }, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 400);
},
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/oauth-yandex.service.ts src/auth/auth.controller.ts src/auth/auth.module.ts tests/api.test.js
git commit -m "feat(auth): Yandex OAuth (зеркало Google) + API-тесты oauth endpoints"
```

---

## Phase D — Settings linking endpoints

### Task 13: Identity management endpoints (list/link/unlink)

**Files:**
- Modify: `src/auth/auth.controller.ts`

- [ ] **Step 1: Endpoints**

В `AuthController`:

```ts
@UseGuards(JwtGuard)
@Get('webhook/auth/identities')
async listMyIdentities(@Req() req: any, @Res() res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.set(CORS).status(401).json({ error: 'unauthorized' });
  const items = await this.identity.listIdentities(userId);
  return res.set(CORS).status(200).json(items);
}

@UseGuards(JwtGuard)
@Post('webhook/auth/identities/link/phone')
async linkPhone(@Body() body: { phone?: string; code?: string }, @Req() req: any, @Res() res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.set(CORS).status(401).json({ error: 'unauthorized' });
  const phone = (body?.phone || '').replace(/\D/g, '');
  const code = body?.code;
  if (!phone || !code) return res.set(CORS).status(400).json({ error: 'missing phone/code' });

  // Validate SMS code (same logic as login)
  const stored = await this.redis.get(`sc-${phone}`);
  if (!stored || stored !== code) return res.set(CORS).status(401).json({ error: 'invalid code' });
  await this.redis.del(`sc-${phone}`);

  const r = await this.identity.linkMethod(userId, 'phone', { phone });
  if (!r.ok) return res.set(CORS).status(409).json({ error: r.reason });
  return res.set(CORS).status(200).json({ ok: true });
}

@UseGuards(JwtGuard)
@Post('webhook/auth/identities/link/email')
async linkEmail(@Body() body: { token?: string }, @Req() req: any, @Res() res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.set(CORS).status(401).json({ error: 'unauthorized' });
  const token = body?.token;
  if (!token) return res.set(CORS).status(400).json({ error: 'missing token' });

  const email = await this.email.consumeMagicToken(token);
  if (!email) return res.set(CORS).status(400).json({ error: 'invalid token' });

  const r = await this.identity.linkMethod(userId, 'email', { email });
  if (!r.ok) return res.set(CORS).status(409).json({ error: r.reason });
  return res.set(CORS).status(200).json({ ok: true });
}

@UseGuards(JwtGuard)
@Delete('webhook/auth/identities/:id')
async unlinkIdentity(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
  const userId = req.user?.userId;
  if (!userId) return res.set(CORS).status(401).json({ error: 'unauthorized' });
  const r = await this.identity.unlinkMethod(userId, id);
  if (!r.ok) return res.set(CORS).status(400).json({ error: r.reason });
  return res.set(CORS).status(200).json({ ok: true });
}
```

Импорты в начале: `Delete`, `UseGuards`, `JwtGuard`.

(`link/google` и `link/yandex` уже работают через основной OAuth-flow — там логика linkMethod включена в Task 11/12, инициатор передаёт `intent='link'`.)

- [ ] **Step 2: Билд + API-тесты**

```js
'GET /webhook/auth/identities — without token → 401': async () => {
  const resp = await http.get('/webhook/auth/identities');
  assertStatus(resp, 401);
},
'DELETE /webhook/auth/identities/:id — without token → 401': async () => {
  const resp = await http.delete('/webhook/auth/identities/some-uuid');
  assertStatus(resp, 401);
},
'POST /webhook/auth/identities/link/phone — without token → 401': async () => {
  const resp = await http.post('/webhook/auth/identities/link/phone', { phone: '79030169187', code: '123456' }, { headers: { 'Content-Type': 'application/json' } });
  assertStatus(resp, 401);
},
```

- [ ] **Step 3: Commit**

```bash
git add src/auth/auth.controller.ts tests/api.test.js
git commit -m "feat(auth): Settings — list/link/unlink identity endpoints"
```

---

## Phase E — Backend deploy + smoke

### Task 14: E2E тест для magic-link flow

**Files:**
- Modify: `tests/e2e.test.js`

- [ ] **Step 1: Добавить helper и тест**

В `tests/e2e.test.js` после `loginWithOtp` добавить:

```js
async function loginWithMagicLink(email) {
  // 1. Request magic-link
  const reqResp = await http.post('/webhook/auth/email/request',
    { email },
    { headers: { 'Content-Type': 'application/json' } });
  if (reqResp.status !== 200) throw new Error(`request failed: ${reqResp.status}`);

  // 2. Get token via debug endpoint
  await new Promise(r => setTimeout(r, 500));
  const tokenResp = await http.get(`/webhook/debug/email-token/${encodeURIComponent(email)}`);
  if (!tokenResp.data?.token) throw new Error(`no debug token: ${JSON.stringify(tokenResp.data)}`);

  // 3. Confirm with Accept: application/json
  const confirmResp = await http.get(`/webhook/auth/email/confirm?token=${tokenResp.data.token}`,
    { headers: { Accept: 'application/json' } });
  if (!confirmResp.data?.['access-token']) throw new Error(`confirm failed: ${JSON.stringify(confirmResp.data)}`);

  return {
    access: confirmResp.data['access-token'],
    refresh: confirmResp.data['refresh-token'],
  };
}
```

Добавить тест в test export:
```js
'magic-link flow: request → debug-token → confirm → /profile works': async () => {
  const testEmail = `e2e-test-${Date.now()}@example.com`;
  const tokens = await loginWithMagicLink(testEmail);

  // Verify JWT works on protected endpoint
  const profile = await http.get('/webhook/profile', { headers: { Authorization: `Bearer ${tokens.access}` } });
  if (profile.status !== 200) throw new Error(`profile failed with new JWT: ${profile.status}`);
},
```

- [ ] **Step 2: Локальный прогон против test-сервера**

После деплоя на test:
```bash
cd ~/Downloads/spirits_back/tests
BASE_URL=https://test.linkeon.io node runner.js --suite e2e
```
Expected: новый тест зелёный.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e.test.js
git commit -m "test(e2e): magic-link login flow"
```

---

### Task 15: Прод-env переменные + бэк-деплой

**Files (на проде, не в репо):**
- `~/spirits_back/.env`

- [ ] **Step 1: Зарегистрировать Google OAuth app**

На стороне владельца:
1. Открыть https://console.cloud.google.com/ → создать OAuth client.
2. Authorized redirect URIs: `https://my.linkeon.io/auth/google/callback` + `https://test.linkeon.io/auth/google/callback`.
3. Получить `client_id` и `client_secret`.

- [ ] **Step 2: Зарегистрировать Yandex OAuth app**

На стороне владельца:
1. Открыть https://oauth.yandex.ru/ → создать приложение.
2. Включить scope «доступ к email» (`login:email`).
3. Redirect URIs: `https://my.linkeon.io/auth/yandex/callback` + `https://test.linkeon.io/auth/yandex/callback`.
4. Получить `client_id` (= app id) и `client_secret` (= password).

- [ ] **Step 3: Получить Resend API-ключ**

1. Зарегистрироваться на https://resend.com (free tier 3000 emails/month).
2. Подтвердить домен `my.linkeon.io` (добавить DNS-записи).
3. Получить API key.

- [ ] **Step 4: Прописать переменные на серверах**

На prod (`dvolkov@212.113.106.202:~/spirits_back/.env`) и test (`dv@85.192.61.231:~/spirits_back/.env`):
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
YANDEX_CLIENT_ID=...
YANDEX_CLIENT_SECRET=...
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@my.linkeon.io
PUBLIC_BASE_URL=https://my.linkeon.io        # на test: https://test.linkeon.io
DEBUG_SMS_CODES=true                          # уже стоит, проверь
```

- [ ] **Step 5: Push + деплой**

```bash
cd ~/Downloads/spirits_back
git push origin b2b
bash ~/Downloads/spirits_back/scripts/deploy.sh
```
Test phase должен показать новые smoke-тесты зелёными. На прод деплой пойдёт автоматически если test зелёный.

- [ ] **Step 6: Smoke на проде**

```bash
# Magic-link flow
curl -X POST -H "Content-Type: application/json" -d '{"email":"e2e@example.com"}' https://my.linkeon.io/webhook/auth/email/request
# Expected: {"sent":true}

# Должен прийти email на e2e@example.com (или дебаг-токен через DEBUG_SMS_CODES)
curl https://my.linkeon.io/webhook/debug/email-token/e2e@example.com
# Expected: {"token":"...","email":"..."}

# OAuth init
curl -X POST -H "Content-Type: application/json" -d '{"provider":"google","intent":"login"}' https://my.linkeon.io/webhook/auth/oauth/init
# Expected: {"authorizeUrl":"https://accounts.google.com/o/oauth2/v2/auth?..."}
```

---

## Phase F — Frontend onboarding (`~/Downloads/spirits_front/`)

### Task 16: `LoginTabs` skeleton

**Files:**
- Create: `src/components/onboarding/LoginTabs.tsx`

- [ ] **Step 1: Создать skeleton с 4 табами**

```tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Mail } from 'lucide-react';

type TabKey = 'sms' | 'email' | 'google' | 'yandex';

const LoginTabs: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = localStorage.getItem('lastLoginTab') as TabKey | null;
    return saved && ['sms','email','google','yandex'].includes(saved) ? saved : 'sms';
  });
  useEffect(() => { localStorage.setItem('lastLoginTab', tab); }, [tab]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'sms',    label: 'SMS',     icon: <Smartphone className="w-4 h-4" /> },
    { key: 'email',  label: 'Email',   icon: <Mail className="w-4 h-4" /> },
    { key: 'google', label: 'Google',  icon: <span className="w-4 h-4 inline-block">G</span> },
    { key: 'yandex', label: 'Yandex',  icon: <span className="w-4 h-4 inline-block">Я</span> },
  ];

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              tab === t.key
                ? 'border-forest-600 text-forest-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'sms'    && <div>SMS pane TBD (Task 17)</div>}
        {tab === 'email'  && <div>Email pane TBD (Task 18)</div>}
        {tab === 'google' && <div>Google pane TBD (Task 19)</div>}
        {tab === 'yandex' && <div>Yandex pane TBD (Task 19)</div>}
      </div>
    </div>
  );
};

export default LoginTabs;
```

- [ ] **Step 2: Билд**

```bash
export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"
cd ~/Downloads/spirits_front && pnpm build
```
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/LoginTabs.tsx
git commit -m "feat(login-tabs): skeleton с 4 табами и persistence в localStorage"
```

---

### Task 17: SMS pane (перенести текущий PhoneInput+OTPInput)

**Files:**
- Modify: `src/components/onboarding/LoginTabs.tsx`
- Modify: `src/pages/OnboardingPage.tsx` (или где сейчас рендерится PhoneInput)

- [ ] **Step 1: Найти существующий SMS-flow**

```bash
grep -rn "PhoneInput\|OTPInput" ~/Downloads/spirits_front/src/ --include="*.tsx" | head -10
```

- [ ] **Step 2: Вынести SMS-flow в подкомпонент `SmsLoginPane.tsx`**

`src/components/onboarding/SmsLoginPane.tsx`:
Перенести из `OnboardingPage` (или текущего родителя) код, который рендерит PhoneInput → OTPInput → handle login. Сделать его самодостаточным компонентом. Props: ничего (использует useAuth напрямую).

Пример скелета:
```tsx
import React, { useState } from 'react';
import PhoneInput from './PhoneInput';
import OTPInput from './OTPInput';
import { authService } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';

const SmsLoginPane: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const { login } = useAuth();

  // ... перенос текущей логики
};
export default SmsLoginPane;
```

(Точная форма зависит от текущего кода. Не упускай существующий UX/тексты.)

- [ ] **Step 3: Использовать в `LoginTabs`**

```tsx
import SmsLoginPane from './SmsLoginPane';
// ...
{tab === 'sms' && <SmsLoginPane />}
```

- [ ] **Step 4: Билд + ручной QA**

```bash
pnpm dev
```
Открыть `http://localhost:5173/`, переключиться на SMS tab — должен работать как раньше.

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/
git commit -m "feat(login-tabs): SMS pane (вынесено из OnboardingPage)"
```

---

### Task 18: Email pane (magic-link request + password vars)

**Files:**
- Create: `src/components/onboarding/EmailLoginPane.tsx`
- Modify: `src/components/onboarding/LoginTabs.tsx`
- Modify: `src/services/authService.ts`

- [ ] **Step 1: Добавить методы в `authService.ts`**

В `src/services/authService.ts`:
```ts
async requestMagicLink(email: string): Promise<{ sent: boolean }> {
  const resp = await apiClient.post('/webhook/auth/email/request', { email });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body?.error || 'request failed');
  }
  return await resp.json();
},

async loginWithEmailPassword(email: string, password: string): Promise<AuthResponse> {
  const resp = await apiClient.post('/webhook/auth/email/login', { email, password });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body?.error || 'login failed');
  }
  return await resp.json();
},
```

(`AuthResponse` тип — посмотри в `src/types/auth.ts`.)

- [ ] **Step 2: Создать компонент**

`src/components/onboarding/EmailLoginPane.tsx`:
```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, ArrowLeft, Loader } from 'lucide-react';
import { authService } from '../../services/authService';

const EmailLoginPane: React.FC = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'input' | 'sent'>('input');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.requestMagicLink(email.trim().toLowerCase());
      setStep('sent');
    } catch (err: any) {
      const msg = err?.message || 'failed';
      if (msg === 'tempmail_blocked') setError(t('auth.email.tempmailBlocked', 'Используйте постоянную почту'));
      else if (msg === 'rate_limit') setError(t('auth.email.rateLimit', 'Слишком частые запросы, подожди минуту'));
      else setError(t('auth.email.requestError', 'Не удалось отправить ссылку'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'sent') {
    return (
      <div className="space-y-4 text-center py-6">
        <Mail className="w-12 h-12 text-forest-600 mx-auto" />
        <h3 className="text-lg font-medium">{t('auth.email.sentTitle', 'Проверь почту')}</h3>
        <p className="text-sm text-gray-600">
          {t('auth.email.sentBody', 'Мы отправили ссылку для входа на')} <span className="font-medium">{email}</span>
        </p>
        <button
          onClick={() => setStep('input')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-3 h-3" />
          {t('common.back', 'Назад')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-gray-700">{t('auth.email.label', 'Электронная почта')}</span>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-forest-500 focus:ring-1 focus:ring-forest-500"
          placeholder="you@example.com"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !email}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50"
      >
        {loading && <Loader className="w-4 h-4 animate-spin" />}
        {t('auth.email.submit', 'Получить ссылку для входа')}
      </button>
    </form>
  );
};

export default EmailLoginPane;
```

(Опциональный password-вариант — можно добавить позже как отдельный mini-state в этом же компоненте. Не блокер для MVP.)

- [ ] **Step 3: Wire в LoginTabs**

```tsx
import EmailLoginPane from './EmailLoginPane';
// ...
{tab === 'email' && <EmailLoginPane />}
```

- [ ] **Step 4: Билд + commit**

```bash
pnpm build
git add src/components/onboarding/EmailLoginPane.tsx src/components/onboarding/LoginTabs.tsx src/services/authService.ts
git commit -m "feat(login-tabs): email magic-link pane (request + sent state)"
```

---

### Task 19: Google + Yandex OAuth panes

**Files:**
- Create: `src/components/onboarding/OAuthButton.tsx`
- Modify: `src/components/onboarding/LoginTabs.tsx`
- Modify: `src/services/authService.ts`

- [ ] **Step 1: Добавить метод `oauthInit` в authService**

```ts
async oauthInit(provider: 'google' | 'yandex', intent: 'login' | 'link' = 'login'): Promise<{ authorizeUrl: string }> {
  const resp = await apiClient.post('/webhook/auth/oauth/init', { provider, intent });
  if (!resp.ok) throw new Error('oauth init failed');
  return await resp.json();
},
```

- [ ] **Step 2: Создать `OAuthButton.tsx`**

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from 'lucide-react';
import { authService } from '../../services/authService';

interface Props {
  provider: 'google' | 'yandex';
}

const OAuthButton: React.FC<Props> = ({ provider }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { authorizeUrl } = await authService.oauthInit(provider, 'login');
      window.location.href = authorizeUrl;
    } catch {
      setLoading(false);
      alert(t('auth.oauth.initFailed', 'Не удалось начать вход через провайдер'));
    }
  };

  const label = provider === 'google'
    ? t('auth.oauth.google', 'Войти через Google')
    : t('auth.oauth.yandex', 'Войти через Yandex');

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
    >
      {loading
        ? <Loader className="w-5 h-5 animate-spin" />
        : <span className={`inline-flex w-6 h-6 rounded ${provider === 'google' ? 'bg-white border' : 'bg-red-600 text-white'} items-center justify-center font-bold text-sm`}>
            {provider === 'google' ? 'G' : 'Я'}
          </span>
      }
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  );
};

export default OAuthButton;
```

- [ ] **Step 3: Wire в LoginTabs**

```tsx
import OAuthButton from './OAuthButton';
// ...
{tab === 'google' && <OAuthButton provider="google" />}
{tab === 'yandex' && <OAuthButton provider="yandex" />}
```

- [ ] **Step 4: Билд + commit**

```bash
pnpm build
git add src/components/onboarding/OAuthButton.tsx src/components/onboarding/LoginTabs.tsx src/services/authService.ts
git commit -m "feat(login-tabs): Google + Yandex OAuth panes"
```

---

### Task 20: Callback pages

**Files:**
- Create: `src/pages/AuthEmailConfirmPage.tsx`
- Create: `src/pages/AuthOAuthCallbackPage.tsx`
- Modify: `src/App.tsx` (routes)

- [ ] **Step 1: AuthEmailConfirmPage**

Эта страница нужна **только** если фронт перехватывает clicks по magic-link (например, если бэкенд НЕ отдаёт HTML напрямую, а делает 302 redirect на фронт). При нашей текущей архитектуре бэк сам отдаёт HTML с inline-script — фронту делать особо нечего. Но добавим заглушку на случай если юзер залетел на `/auth/email/confirm` без токена:

```tsx
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthEmailConfirmPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  if (!token) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h1 className="text-2xl font-semibold">Ссылка устарела</h1>
        <p className="mt-2 text-gray-600">Попробуй запросить новую</p>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 bg-forest-600 text-white rounded-lg">
          Назад к входу
        </button>
      </div>
    );
  }

  // Если token есть — let backend serve HTML. Этот page рендерится только при no-token.
  return null;
};

export default AuthEmailConfirmPage;
```

(На практике юзер с правильной ссылкой попадёт на бэк `/webhook/auth/email/confirm?token=...`, который сам сделает redirect. SPA-роут `/auth/email/confirm` без `/webhook/` префикса — только для тех, кто как-то слетел с правильного URL.)

- [ ] **Step 2: AuthOAuthCallbackPage**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';

const AuthOAuthCallbackPage: React.FC = () => {
  const { provider } = useParams<{ provider: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setTokens } = useAuth();  // должен быть метод; если нет — кладём в localStorage вручную и reload
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const errParam = params.get('error');

    if (errParam) { setError('Провайдер вернул ошибку: ' + errParam); return; }
    if (!code || !state || !provider) { setError('Битая ссылка'); return; }
    if (provider !== 'google' && provider !== 'yandex') { setError('Неизвестный провайдер'); return; }

    (async () => {
      try {
        const resp = await apiClient.post(`/webhook/auth/oauth/${provider}`, { code, state });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          setError(body?.error || 'oauth callback failed');
          return;
        }
        const data = await resp.json();
        if (data.linked) {
          // intent='link' flow — возвращаемся в Settings
          navigate('/settings?linked=1');
          return;
        }
        // intent='login' flow — кладём токены и идём в /chat
        localStorage.setItem('jwt_access_token', data['access-token']);
        localStorage.setItem('jwt_refresh_token', data['refresh-token']);
        localStorage.setItem('authToken', data['access-token']);
        window.location.replace('/chat');
      } catch (e: any) {
        setError(e?.message || 'failed');
      }
    })();
  }, [provider, params, navigate]);

  if (error) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h1 className="text-xl font-semibold">Не удалось войти</h1>
        <p className="mt-2 text-gray-600 text-sm">{error}</p>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 bg-forest-600 text-white rounded-lg">
          Назад
        </button>
      </div>
    );
  }
  return <div className="max-w-md mx-auto py-20 text-center"><p className="text-gray-500">Входим...</p></div>;
};

export default AuthOAuthCallbackPage;
```

- [ ] **Step 3: Добавить routes в `App.tsx`**

```tsx
import AuthOAuthCallbackPage from './pages/AuthOAuthCallbackPage';
import AuthEmailConfirmPage from './pages/AuthEmailConfirmPage';
// ...
<Routes>
  {/* existing */}
  <Route path="/auth/:provider/callback" element={<AuthOAuthCallbackPage />} />
  <Route path="/auth/email/confirm" element={<AuthEmailConfirmPage />} />
</Routes>
```

Эти маршруты доступны без auth — фронт-роутер должен пропускать их даже когда `!isAuthenticated`.

- [ ] **Step 4: Билд + commit**

```bash
pnpm build
git add src/pages/AuthOAuthCallbackPage.tsx src/pages/AuthEmailConfirmPage.tsx src/App.tsx
git commit -m "feat(auth): OAuth + Email confirm callback pages"
```

---

### Task 21: Wire `LoginTabs` в `OnboardingPage`

**Files:**
- Modify: `src/pages/OnboardingPage.tsx` (или текущая main onboarding view)

- [ ] **Step 1: Найти и заменить старый flow**

`src/pages/OnboardingPage.tsx` — заменить старый PhoneInput-only рендер на `<LoginTabs />`. Сохранить вокруг то же layout (логотип, hero-текст, legal-чекбокс) — меняется только сам auth-блок.

```tsx
import LoginTabs from '../components/onboarding/LoginTabs';
// ...
<LoginTabs />
```

- [ ] **Step 2: Ручной QA**

```bash
pnpm dev
```
- Тапы переключаются.
- SMS-логин работает как раньше.
- Email-логин → "Проверь почту".
- Google/Yandex кнопки делают редирект на провайдера (если ENV настроены).

- [ ] **Step 3: Commit**

```bash
git add src/pages/OnboardingPage.tsx
git commit -m "feat(onboarding): подключаю LoginTabs вместо old phone-only flow"
```

---

## Phase G — Settings linked accounts

### Task 22: `LinkedAccountsView` + wire в Settings

**Files:**
- Create: `src/components/settings/LinkedAccountsView.tsx`
- Modify: `src/components/settings/SettingsView.tsx`
- Modify: `src/services/authService.ts`

- [ ] **Step 1: Методы в authService**

```ts
async listIdentities(): Promise<Identity[]> {
  const resp = await apiClient.get('/webhook/auth/identities');
  if (!resp.ok) throw new Error('list identities failed');
  return await resp.json();
},

async unlinkIdentity(id: string): Promise<{ ok: boolean }> {
  const resp = await apiClient.delete(`/webhook/auth/identities/${id}`);
  return { ok: resp.ok };
},
```

`Identity` тип — добавь в `src/types/auth.ts`:
```ts
export interface Identity {
  id: string;
  provider: 'phone' | 'email' | 'google' | 'yandex';
  providerSub: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}
```

- [ ] **Step 2: Компонент `LinkedAccountsView.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Mail, Loader, X } from 'lucide-react';
import { authService } from '../../services/authService';
import type { Identity } from '../../types/auth';

const providerLabel = (p: Identity['provider']): string => {
  if (p === 'phone')  return 'Телефон';
  if (p === 'email')  return 'Email';
  if (p === 'google') return 'Google';
  return 'Yandex';
};

const LinkedAccountsView: React.FC = () => {
  const { t } = useTranslation();
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUnlink, setPendingUnlink] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await authService.listIdentities();
      setIdentities(data);
      setError(null);
    } catch {
      setError(t('settings.linkedAccounts.loadError', 'Не удалось загрузить'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleUnlink = async (id: string) => {
    setPendingUnlink(id);
    const r = await authService.unlinkIdentity(id);
    setPendingUnlink(null);
    if (r.ok) load();
    else setError(t('settings.linkedAccounts.unlinkError', 'Не удалось отвязать'));
  };

  const handleLinkOAuth = async (provider: 'google' | 'yandex') => {
    try {
      const { authorizeUrl } = await authService.oauthInit(provider, 'link');
      window.location.href = authorizeUrl;
    } catch {
      setError(t('settings.linkedAccounts.oauthError', 'Не удалось начать привязку'));
    }
  };

  if (!identities && loading) {
    return <div className="py-8 flex justify-center"><Loader className="w-5 h-5 animate-spin text-forest-600" /></div>;
  }

  const linkedProviders = new Set(identities?.map(i => i.provider));
  const isLastMethod = (identities?.length ?? 0) <= 1;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium">
        {t('settings.linkedAccounts.title', 'Способы входа')}
      </div>
      {error && <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">{error}</div>}
      <div className="divide-y divide-gray-100">
        {identities?.map(id => (
          <div key={id.id} className="px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {id.provider === 'phone' && <Smartphone className="w-4 h-4 text-gray-500" />}
              {id.provider === 'email' && <Mail className="w-4 h-4 text-gray-500" />}
              {(id.provider === 'google' || id.provider === 'yandex') && (
                <span className={`inline-flex w-5 h-5 rounded ${id.provider === 'google' ? 'bg-white border' : 'bg-red-600 text-white'} items-center justify-center text-xs font-bold`}>
                  {id.provider === 'google' ? 'G' : 'Я'}
                </span>
              )}
              <div>
                <p className="text-sm font-medium">{providerLabel(id.provider)}</p>
                <p className="text-xs text-gray-500">{id.providerSub}</p>
              </div>
            </div>
            <button
              onClick={() => handleUnlink(id.id)}
              disabled={isLastMethod || pendingUnlink === id.id}
              title={isLastMethod ? t('settings.linkedAccounts.lastMethod', 'Это единственный способ входа') : ''}
              className="text-xs text-red-600 hover:text-red-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {pendingUnlink === id.id ? '...' : t('settings.linkedAccounts.unlink', 'Отвязать')}
            </button>
          </div>
        ))}

        {/* Add Google */}
        {!linkedProviders.has('google') && (
          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex w-5 h-5 rounded bg-white border items-center justify-center text-xs font-bold">G</span>
              <p className="text-sm">Google</p>
            </div>
            <button onClick={() => handleLinkOAuth('google')} className="text-xs text-forest-600 hover:text-forest-800">
              {t('settings.linkedAccounts.link', 'Привязать')}
            </button>
          </div>
        )}
        {!linkedProviders.has('yandex') && (
          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex w-5 h-5 rounded bg-red-600 text-white items-center justify-center text-xs font-bold">Я</span>
              <p className="text-sm">Yandex</p>
            </div>
            <button onClick={() => handleLinkOAuth('yandex')} className="text-xs text-forest-600 hover:text-forest-800">
              {t('settings.linkedAccounts.link', 'Привязать')}
            </button>
          </div>
        )}
        {/* (Email/Phone привязка-flow в MVP — открываем модал; пока ограничимся OAuth-вариантами и текущий phone/email юзер уже видит привязанные) */}
      </div>
    </div>
  );
};

export default LinkedAccountsView;
```

(Phone/Email привязка через модал — можно расширить позже; в MVP отвязка работает + OAuth-привязка работает.)

- [ ] **Step 3: Wire в SettingsView**

В `src/components/settings/SettingsView.tsx`:
```tsx
import LinkedAccountsView from './LinkedAccountsView';
// ...
<LinkedAccountsView />
```
Разместить логично (например, перед или после раздела про аккаунт).

- [ ] **Step 4: Билд + ручной QA**

```bash
pnpm build && pnpm dev
```
Открыть `/profile` → Settings → должна появиться секция «Способы входа». Кнопки «Привязать Google» должны работать (редирект на консент).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/LinkedAccountsView.tsx src/components/settings/SettingsView.tsx src/services/authService.ts src/types/auth.ts
git commit -m "feat(settings): LinkedAccountsView — список и управление привязками"
```

---

## Phase H — i18n + frontend deploy

### Task 23: i18n строки

**Files:**
- Modify: `src/i18n/locales/ru.json`
- Modify: `src/i18n/locales/en.json`

- [ ] **Step 1: Добавить новые namespaces в обе locale**

В `ru.json` под top-level:
```json
"auth": {
  "tabs": { "sms": "SMS", "email": "Email", "google": "Google", "yandex": "Yandex" },
  "email": {
    "label": "Электронная почта",
    "submit": "Получить ссылку для входа",
    "sentTitle": "Проверь почту",
    "sentBody": "Мы отправили ссылку для входа на",
    "tempmailBlocked": "Используйте постоянную почту",
    "rateLimit": "Слишком частые запросы, подожди минуту",
    "requestError": "Не удалось отправить ссылку"
  },
  "oauth": {
    "google": "Войти через Google",
    "yandex": "Войти через Yandex",
    "initFailed": "Не удалось начать вход через провайдер"
  }
},
"settings": {
  ...,
  "linkedAccounts": {
    "title": "Способы входа",
    "unlink": "Отвязать",
    "link": "Привязать",
    "lastMethod": "Это единственный способ входа",
    "loadError": "Не удалось загрузить",
    "unlinkError": "Не удалось отвязать",
    "oauthError": "Не удалось начать привязку"
  }
}
```

И в `common`: `back: "Назад"` если ещё нет.

- [ ] **Step 2: Зеркало в en.json**

```json
"auth": {
  "tabs": { "sms": "SMS", "email": "Email", "google": "Google", "yandex": "Yandex" },
  "email": {
    "label": "Email address",
    "submit": "Get login link",
    "sentTitle": "Check your inbox",
    "sentBody": "We sent a login link to",
    "tempmailBlocked": "Please use a permanent email",
    "rateLimit": "Too many requests, wait a minute",
    "requestError": "Failed to send link"
  },
  "oauth": {
    "google": "Continue with Google",
    "yandex": "Continue with Yandex",
    "initFailed": "Failed to start provider login"
  }
},
"settings": {
  ...,
  "linkedAccounts": {
    "title": "Sign-in methods",
    "unlink": "Unlink",
    "link": "Link",
    "lastMethod": "This is your only sign-in method",
    "loadError": "Failed to load",
    "unlinkError": "Failed to unlink",
    "oauthError": "Failed to start linking"
  }
}
```

- [ ] **Step 3: Валидация JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/ru.json','utf8')); console.log('ru ok')"
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json','utf8')); console.log('en ok')"
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "i18n(auth): RU/EN строки для login tabs + linked accounts"
```

---

### Task 24: Frontend deploy

- [ ] **Step 1: Push**

```bash
cd ~/Downloads/spirits_front
git push origin b2b
```

- [ ] **Step 2: Combined deploy**

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```

(Если бэк уже задеплоен в Task 15 и не было изменений — скрипт это поймёт и пропустит. Если были бэк-изменения, они пойдут вместе с фронтом.)

- [ ] **Step 3: Прод-проверка**

Открыть https://my.linkeon.io в инкогнито. Должен увидеть LoginTabs с 4 табами.

Сценарии:
1. **SMS:** работает как раньше с test-номером.
2. **Email magic-link:** ввёл `me@gmail.com` → "Проверь почту" → проверь почту → клик по ссылке → залогинен в `/chat`.
3. **Google:** клик → редирект на Google → подтверждение → возвращает в `/chat`.
4. **Yandex:** то же самое.
5. **Settings → Способы входа:** видим список, кнопки «Привязать» работают.

- [ ] **Step 4: Финальный smoke + monitoring**

```bash
TOKEN=$(curl -s 'https://my.linkeon.io/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/70000000000' >/dev/null && sleep 1 && curl -s 'https://my.linkeon.io/webhook/debug/sms-code/70000000000' | python3 -c 'import sys,json; print(json.load(sys.stdin)["code"])' | xargs -I {} curl -s "https://my.linkeon.io/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/70000000000/{}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["access-token"])')

curl -s -H "Authorization: Bearer $TOKEN" 'https://my.linkeon.io/webhook/auth/identities' | python3 -m json.tool
```
Expected: массив identities test-юзера.

---

## Self-review checklist

### Spec coverage

- ✅ Identity-service single-точка — Tasks 2-4
- ✅ DB schema (user_identities + columns + backfill) — Task 1
- ✅ Email magic-link + tempmail block + rate-limit — Tasks 7-8, 10
- ✅ Email password (set + login) — Task 9
- ✅ Google OAuth — Task 11
- ✅ Yandex OAuth — Task 12
- ✅ Account merge by verified email — встроено в resolveOrCreate (Task 3)
- ✅ Welcome bonus 25k идемпотентно — Task 3
- ✅ Backend rename phone→userId — Task 6
- ✅ LoginTabs UI с 4 табами — Tasks 16-21
- ✅ Settings → Linked accounts — Task 22
- ✅ OAuth init с `intent: login|link` — Task 11
- ✅ i18n — Task 23
- ✅ Deploy через единый scripts/deploy.sh — Tasks 15 + 24

### Placeholder scan

- "TBD (Task 17)" в Task 16 step 1 — это допустимый плейсхолдер ВНУТРИ кода для последующих тасков. Не оставит дыру — Task 17 явно заменяет.
- "/ опциональный password-вариант — можно добавить позже как отдельный mini-state" в Task 18 — допустимо, MVP его не требует.
- "Точная форма зависит от текущего кода" в Task 17 step 2 — это намёк engineer'у читать existing file. Допустимо.

### Type consistency

- `Provider` = `'phone' | 'email' | 'google' | 'yandex'` — везде идентично.
- `ProviderData<P>` — последовательно по типу.
- `Identity` shape — одинаковый в backend (snake_case) и frontend (camelCase, с конверсией в listIdentities).
- `req.user.userId: string` — везде в backend после Task 6.

### Открытые вопросы из спеки

1. **Email-провайдер** — план зафиксировал **Resend** (Task 7). Если решишь иначе — поправь Task 7+15.
2. **OAuth client credentials** — manual setup в Task 15.
3. **`disposable-email-domains` версия** — pin'нем при установке в Task 7.

---

## Что вне MVP-плана

- 2FA, биометрия, WebAuthn — отдельные фичи.
- Полный wizard merge-конфликтов — ручной саппорт пока.
- Привязка phone/email через модал в Settings — в MVP только OAuth-варианты (Google/Yandex). Phone/email пользователь уже привязал при входе.
- Sliding session / device-list — отдельная фича.
- Уведомления о новом входе — отдельная фича.
