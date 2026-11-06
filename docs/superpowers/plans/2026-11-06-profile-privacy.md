# Profile Privacy and Discoverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователю два действующих независимых переключателя: остановить автоматический личный/деловой профайлинг и скрыться от новых знакомств без разрыва существующих связей.

**Architecture:** Единый модуль `privacy` содержит функции политики над уже существующим `PgService`; новых позиционных DI-зависимостей в крупных сервисах нет. Нижнеуровневые gates останавливают сбор и prompt-использование, а requester→target policy применяется до vector search, чтения сущностей, LLM и сериализации. Frontend использует отдельный компонент с optimistic save и не хранит чужие поисковые карточки в `localStorage`.

**Tech Stack:** NestJS 10, PostgreSQL, Neo4j, TypeScript, Jest, React 18, Vite 5, Vitest, i18next, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-profile-privacy-design.md`

---

## Рабочие каталоги и обязательные правила

- Backend: `/Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy`, ветка `feat/profile-privacy`.
- Frontend: `/Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design`, ветка `feat/profile-privacy`.
- Основные чекауты и чужие воркдеревья не менять.
- Backend использует `npm ci`, frontend — `pnpm`.
- Backend Jest и все сборки выполняются на `dv@85.192.61.231`; локально допустимы только указанные точечные frontend Vitest.
- CI-клоны: `~/ci/wt/profile-privacy-back` и `~/ci/wt/profile-privacy-front`. Ставить их на конкретный SHA, не на имя ветки.
- Real PG использует `postgres:///pl_test?host=/var/run/postgresql` и отдельную per-process schema. Не направлять эти тесты на production/shared public schema.
- В каждом SSH-вызове загружать `~/.nvm/nvm.sh`.
- Коммиты обеих задач RED и GREEN содержат attribution. Не делать merge/deploy до отдельного OK владельца.

Один раз подготовить CI-клоны:

```bash
ssh dv@85.192.61.231 'mkdir -p ~/ci/wt && if [ ! -d ~/ci/wt/profile-privacy-back/.git ]; then git clone git@github.com:dvvolkovv/spirits_back.git ~/ci/wt/profile-privacy-back; fi'
ssh dv@85.192.61.231 'mkdir -p ~/ci/wt && if [ ! -d ~/ci/wt/profile-privacy-front/.git ]; then git clone git@github.com:dvvolkovv/spirits.git ~/ci/wt/profile-privacy-front; fi'
```

## File map

### Backend

- Create `src/privacy/profile-privacy.ts` — типы, JSONB settings, relationship policy, candidate filters.
- Create `src/privacy/profile-privacy.spec.ts` — defaults и validation.
- Create `src/privacy/profile-privacy.pg-helper.ts` — disposable-schema real-PG harness.
- Create `src/privacy/profile-privacy.pg.spec.ts` — атомарность и независимость полей.
- Create `src/privacy/profile-access.pg.spec.ts` — stranger/contact/peer/block матрица.
- Create `src/privacy/privacy.controller.ts` — собственные GET/POST настройки.
- Create `src/privacy/privacy.controller.spec.ts` — guard и HTTP validation.
- Create `src/privacy/privacy.module.ts` — регистрация controller без нового глобального provider.
- Modify `src/app.module.ts` — подключение `PrivacyModule`.
- Create `src/neo4j/neo4j.privacy.spec.ts` — collection/prompt/race gates.
- Modify `src/neo4j/neo4j.service.ts` — consolidation, embedding, profile-description gates.
- Create `src/business-profile/business-profile.privacy.spec.ts` — extraction/render/race gates.
- Modify `src/business-profile/business-profile.service.ts` — business gates; ручной `merge` не блокировать.
- Create `src/scheduler/profile-compaction.privacy.spec.ts` — nightly и per-write checks.
- Modify `src/scheduler/profile-compaction.service.ts` — SQL prefilter и per-user gates.
- Create `src/voice-call/profile-turns-privacy.spec.ts` — пустой результат без сдвига cursor.
- Modify `src/voice-call/voice-call.service.ts` — profileTurns checks.
- Create `src/chat/chat.privacy.spec.ts` — финальные prompt insertions и продолжение tasks.
- Modify `src/chat/chat.service.ts` — три second checks; task extraction не гейтить.
- Create `src/profile/profile-public.ts` — other-user serializer без fallback-утечки.
- Create `src/profile/profile-public.spec.ts` — serializer.
- Modify `src/profile/profile.controller.ts` — requester в `getUserProfile` и единый 404.
- Modify `src/profile/profile.service.ts` — initial/final access checks и conditional Neo4j.
- Create `src/contacts/contacts.privacy.spec.ts` — public profile и contact-request privacy.
- Modify `src/contacts/contacts.service.ts` — public/flat/rich gates и proposal check.
- Modify `src/contacts/contacts.controller.ts` — сохранить 404 вместо blanket 400.
- Create `src/peer/peer.privacy.spec.ts` — hidden/nonexistent одинаковы, existing rules сохранены.
- Modify `src/peer/peer.service.ts` — pre-existence proposal check.
- Modify `src/peer/peer.controller.ts` — `u.userId` вместо несуществующего `u.phone`.
- Create `src/misc/misc.search-privacy.spec.ts` — pre-vector, pre-LLM и final-card фильтры.
- Modify `src/misc/misc.service.ts` — eligible-only cosine search и compatibility preflight.
- Modify `src/misc/misc.search-mate.spec.ts` — policy mocks для существующих сценариев.
- Create `src/misc/misc.compatibility-privacy.spec.ts` — 404/422 до graph/LLM и mid-flight revoke.
- Modify `src/platform-kb/articles/profile.ts` — описание двух настроек.
- Modify `src/platform-kb/articles/networking.ts` — скрытие и совместимость.
- Modify `src/platform-kb/articles/how-it-works.ts` — кто видит данные.
- Modify `src/platform-kb/label-keys.json` — две новые подписи.
- Modify generated `src/platform-kb/labels.generated.ts` — только через sync script.
- Create `src/platform-kb/privacy.spec.ts` — regression текста справки.
- Create `tests/playwright/privacy.spec.js` — live API/UI smoke, автоматически входит в test-фазу до prod.

### Frontend

- Create `src/components/settings/PrivacySettings.tsx` — загрузка, сохранение, rollback, доступные switches.
- Create `src/components/settings/PrivacySettings.test.tsx` — isolated jsdom tests.
- Modify `src/components/settings/SettingsView.tsx` — заменить три локальных контрола.
- Modify `src/i18n/locales/{ru,en,es,de,fr,pt,zh}.json` — `settings.privacy_controls` и ошибки совместимости.
- Create `src/components/search/compatibilityError.ts` — код ошибки → locale key.
- Create `src/components/search/compatibilityError.test.ts` — 404/422/generic.
- Create `src/i18n/privacyLocales.test.ts` — покрытие новых строк и замена контролов.
- Modify `src/components/search/CompatibilityInterface.tsx` — честная ошибка без stream.
- Create `src/components/search/SearchInterface.storage.test.tsx` — удаление legacy и запрет нового кеша.
- Modify `src/components/search/SearchInterface.tsx` — сохранять только собственный query.

---

### Task 1: JSONB settings и собственный API

**Files:**
- Create: `src/privacy/profile-privacy.ts`
- Create: `src/privacy/profile-privacy.spec.ts`
- Create: `src/privacy/profile-privacy.pg-helper.ts`
- Create: `src/privacy/profile-privacy.pg.spec.ts`
- Create: `src/privacy/privacy.controller.ts`
- Create: `src/privacy/privacy.controller.spec.ts`
- Create: `src/privacy/privacy.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Написать failing unit tests defaults и validation**

```ts
import { assertPrivacySettingsPatch, parsePrivacySettings, PrivacySettingsDataError } from './profile-privacy';

describe('privacy settings contract', () => {
  it('defaults missing fields to true', () => {
    expect(parsePrivacySettings(null)).toEqual({ automaticProfiling: true, discoverable: true });
    expect(parsePrivacySettings({})).toEqual({ automaticProfiling: true, discoverable: true });
    expect(parsePrivacySettings({ automaticProfiling: false })).toEqual({ automaticProfiling: false, discoverable: true });
  });

  it('rejects non-boolean stored values', () => {
    expect(() => parsePrivacySettings({ automaticProfiling: 'false' })).toThrow(PrivacySettingsDataError);
    expect(() => parsePrivacySettings({ discoverable: 0 })).toThrow(PrivacySettingsDataError);
  });

  it('accepts one or two boolean fields and rejects empty/unknown/non-boolean patches', () => {
    expect(() => assertPrivacySettingsPatch({ automaticProfiling: false })).not.toThrow();
    expect(() => assertPrivacySettingsPatch({ automaticProfiling: false, discoverable: true })).not.toThrow();
    for (const value of [{}, { unknown: true }, { automaticProfiling: 'false' }, null, []]) {
      expect(() => assertPrivacySettingsPatch(value)).toThrow();
    }
  });
});
```

- [ ] **Step 2: Добавить disposable-schema helper и failing real-PG tests**

`src/privacy/profile-privacy.pg-helper.ts`:

```ts
import { Pool } from 'pg';

export const PG_URL = process.env.PROVISIONING_PG_URL;
export const describePg = PG_URL ? describe : describe.skip;

export async function createPrivacyPg() {
  const schema = `privacy_${process.pid}_${Date.now()}`;
  const admin = new Pool({ connectionString: PG_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: PG_URL, options: `-c search_path=${schema}` });
  await pool.query(`
    CREATE TABLE ai_profiles_consolidated (
      id serial PRIMARY KEY,
      user_id text NOT NULL UNIQUE,
      email text,
      profile_data jsonb,
      updated_at timestamptz DEFAULT now()
    )
  `);
  return {
    pool,
    pg: { query: (text: string, params?: any[]) => pool.query(text, params) } as any,
    async close() {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
```

`src/privacy/profile-privacy.pg.spec.ts`:

```ts
import { createPrivacyPg, describePg } from './profile-privacy.pg-helper';
import { getPrivacySettings, updatePrivacySettings } from './profile-privacy';

describePg('privacy settings real PG', () => {
  let harness: Awaited<ReturnType<typeof createPrivacyPg>>;
  beforeAll(async () => { harness = await createPrivacyPg(); });
  afterAll(async () => { await harness.close(); });
  beforeEach(async () => {
    await harness.pool.query(`INSERT INTO ai_profiles_consolidated(user_id, profile_data) VALUES ('u1', '{"keep":"yes"}'), ('u2', null)`);
  });
  afterEach(async () => { await harness.pool.query('TRUNCATE ai_profiles_consolidated RESTART IDENTITY'); });

  it('preserves unrelated JSON and makes two fields independently immediately visible', async () => {
    expect(await getPrivacySettings(harness.pg, 'u2')).toEqual({ automaticProfiling: true, discoverable: true });
    await Promise.all([
      updatePrivacySettings(harness.pg, 'u1', { automaticProfiling: false }),
      updatePrivacySettings(harness.pg, 'u1', { discoverable: false }),
    ]);
    expect(await getPrivacySettings(harness.pg, 'u1')).toEqual({ automaticProfiling: false, discoverable: false });
    expect(await getPrivacySettings(harness.pg, 'u2')).toEqual({ automaticProfiling: true, discoverable: true });
    const row = await harness.pool.query(`SELECT profile_data FROM ai_profiles_consolidated WHERE user_id = 'u1'`);
    expect(row.rows[0].profile_data.keep).toBe('yes');
  });

  it('updates both fields atomically in one call', async () => {
    const saved = await updatePrivacySettings(harness.pg, 'u1', { automaticProfiling: false, discoverable: false });
    expect(saved).toEqual({ automaticProfiling: false, discoverable: false });
  });
});
```

- [ ] **Step 3: Закоммитить тесты, запушить и подтвердить RED на ноде**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/privacy && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(privacy): зафиксировать настройки профиля" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push -u origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npm ci && PROVISIONING_PG_URL='postgres:///pl_test?host=/var/run/postgresql' npx jest --runInBand --runTestsByPath src/privacy/profile-privacy.spec.ts src/privacy/profile-privacy.pg.spec.ts"
```

Expected: FAIL — модуль `profile-privacy` отсутствует.

- [ ] **Step 4: Реализовать policy, controller и module**

`src/privacy/profile-privacy.ts`:

```ts
import { PgService } from '../common/services/pg.service';

export const PRIVACY_KEYS = ['automaticProfiling', 'discoverable'] as const;
export type PrivacyKey = typeof PRIVACY_KEYS[number];
export interface PrivacySettings { automaticProfiling: boolean; discoverable: boolean }
export type PrivacySettingsPatch = Partial<PrivacySettings>;
export class PrivacySettingsDataError extends Error {}
export class PrivacyProfileNotFoundError extends Error {}

export function parsePrivacySettings(input: unknown): PrivacySettings {
  if (input !== null && input !== undefined && (typeof input !== 'object' || Array.isArray(input))) throw new PrivacySettingsDataError('invalid profile_data');
  const data = (input ?? {}) as Record<string, unknown>;
  const read = (key: PrivacyKey): boolean => {
    if (data[key] === undefined) return true;
    if (typeof data[key] !== 'boolean') throw new PrivacySettingsDataError(`invalid ${key}`);
    return data[key] as boolean;
  };
  return { automaticProfiling: read('automaticProfiling'), discoverable: read('discoverable') };
}

export function assertPrivacySettingsPatch(body: unknown): asserts body is PrivacySettingsPatch {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid privacy patch');
  const entries = Object.entries(body as Record<string, unknown>);
  if (!entries.length || entries.some(([key, value]) => !PRIVACY_KEYS.includes(key as PrivacyKey) || typeof value !== 'boolean')) {
    throw new Error('invalid privacy patch');
  }
}

export async function getPrivacySettings(pg: PgService, userId: string): Promise<PrivacySettings> {
  const result = await pg.query('SELECT profile_data FROM ai_profiles_consolidated WHERE user_id = $1', [userId]);
  if (!result.rows[0]) throw new PrivacyProfileNotFoundError(userId);
  return parsePrivacySettings(result.rows[0].profile_data);
}

export async function updatePrivacySettings(pg: PgService, userId: string, patch: PrivacySettingsPatch): Promise<PrivacySettings> {
  assertPrivacySettingsPatch(patch);
  const params: any[] = [userId];
  let expression = `coalesce(profile_data, '{}'::jsonb)`;
  for (const key of PRIVACY_KEYS) {
    if (patch[key] === undefined) continue;
    params.push(patch[key]);
    expression = `jsonb_set(${expression}, '{${key}}', to_jsonb($${params.length}::boolean), true)`;
  }
  const result = await pg.query(
    `UPDATE ai_profiles_consolidated SET profile_data = ${expression}, updated_at = now() WHERE user_id = $1 RETURNING profile_data`,
    params,
  );
  if (!result.rows[0]) throw new PrivacyProfileNotFoundError(userId);
  return parsePrivacySettings(result.rows[0].profile_data);
}

export async function automaticProfilingAllowed(pg: PgService, userId: string): Promise<boolean> {
  try { return (await getPrivacySettings(pg, userId)).automaticProfiling; } catch { return false; }
}

export async function canReceiveNewProposal(pg: PgService, targetId: string): Promise<boolean> {
  try { return (await getPrivacySettings(pg, targetId)).discoverable; } catch { return false; }
}
```

`src/privacy/privacy.controller.ts`:

```ts
import { BadRequestException, Body, Controller, Get, NotFoundException, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/user.decorator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { PgService } from '../common/services/pg.service';
import { assertPrivacySettingsPatch, getPrivacySettings, PrivacyProfileNotFoundError, updatePrivacySettings } from './profile-privacy';

@Controller('privacy-settings')
@UseGuards(JwtGuard)
export class PrivacyController {
  constructor(private readonly pg: PgService) {}

  @Get()
  async get(@CurrentUser() user: any) {
    try { return await getPrivacySettings(this.pg, user.userId); } catch (error) { this.fail(error); }
  }

  @Post()
  async post(@CurrentUser() user: any, @Body() body: unknown) {
    try { assertPrivacySettingsPatch(body); } catch { throw new BadRequestException({ code: 'INVALID_PRIVACY_SETTINGS' }); }
    try { return await updatePrivacySettings(this.pg, user.userId, body as any); } catch (error) { this.fail(error); }
  }

  private fail(error: unknown): never {
    if (error instanceof PrivacyProfileNotFoundError) throw new NotFoundException({ code: 'PROFILE_NOT_AVAILABLE' });
    throw new ServiceUnavailableException({ code: 'PRIVACY_SETTINGS_UNAVAILABLE' });
  }
}
```

`src/privacy/privacy.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PrivacyController } from './privacy.controller';

@Module({ imports: [CommonModule], controllers: [PrivacyController] })
export class PrivacyModule {}
```

В `src/app.module.ts` добавить `import { PrivacyModule } from './privacy/privacy.module';` и `PrivacyModule` сразу после `CommonModule` в `imports`.

`src/privacy/privacy.controller.spec.ts`:

```ts
import * as fs from 'fs';
import { PrivacyController } from './privacy.controller';

describe('PrivacyController', () => {
  it('has JWT guard on the controller', () => {
    expect(fs.readFileSync(`${__dirname}/privacy.controller.ts`, 'utf8')).toContain('@UseGuards(JwtGuard)');
  });

  it('rejects invalid body before touching PG', async () => {
    const pg = { query: jest.fn() };
    const controller = new PrivacyController(pg as any);
    await expect(controller.post({ userId: 'u1' }, { automaticProfiling: 'false' })).rejects.toMatchObject({ status: 400 });
    expect(pg.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Закоммитить реализацию и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/privacy src/app.module.ts && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(privacy): добавить настройки приватности" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npm ci && PROVISIONING_PG_URL='postgres:///pl_test?host=/var/run/postgresql' npx jest --runInBand --runTestsByPath src/privacy/profile-privacy.spec.ts src/privacy/profile-privacy.pg.spec.ts src/privacy/privacy.controller.spec.ts && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: все privacy tests PASS, tsc PASS.

---

### Task 2: Requester→target relationships и candidate filters

**Files:**
- Modify: `src/privacy/profile-privacy.ts`
- Create: `src/privacy/profile-access.pg.spec.ts`

- [ ] **Step 1: Написать failing real-PG матрицу**

`src/privacy/profile-access.pg.spec.ts` целиком:

```ts
import { createPrivacyPg, describePg } from './profile-privacy.pg-helper';
import { canUseProfileForRequester, canViewProfile, filterSearchCandidateIds, listSearchCandidateIds } from './profile-privacy';

describePg('profile access real PG', () => {
  let harness: Awaited<ReturnType<typeof createPrivacyPg>>;
  beforeAll(async () => {
    harness = await createPrivacyPg();
    await harness.pool.query(`
      CREATE TABLE contact_requests (
        id serial PRIMARY KEY,
        requester_id integer NOT NULL,
        target_id integer NOT NULL,
        status varchar(16) NOT NULL,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE peer_conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_a_id text NOT NULL,
        user_b_id text NOT NULL
      );
      CREATE TABLE user_blocks (
        blocker_id text NOT NULL,
        blocked_id text NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id)
      );
    `);
  });
  afterAll(async () => { await harness.close(); });
  beforeEach(async () => {
    await harness.pool.query(`INSERT INTO ai_profiles_consolidated(id, user_id, profile_data) VALUES
      (1, 'requester', '{}'), (2, 'target', '{"discoverable":false}'), (3, 'open', '{}'),
      (4, 'paused', '{"automaticProfiling":false}')`);
  });
  afterEach(async () => {
    await harness.pool.query('TRUNCATE contact_requests, peer_conversations, user_blocks, ai_profiles_consolidated RESTART IDENTITY');
  });

  it('allows only self, approved contact or unblocked peer when discoverable is false', async () => {
    expect(await canViewProfile(harness.pg, 'target', 'target')).toBe(true);
    expect(await canViewProfile(harness.pg, 'requester', 'target')).toBe(false);
    await harness.pool.query(`INSERT INTO contact_requests(requester_id, target_id, status) VALUES (1, 2, 'approved')`);
    expect(await canViewProfile(harness.pg, 'requester', 'target')).toBe(true);
    await harness.pool.query(`INSERT INTO user_blocks VALUES ('requester', 'target')`);
    expect(await canViewProfile(harness.pg, 'requester', 'target')).toBe(false);
    await harness.pool.query(`DELETE FROM user_blocks`);
    await harness.pool.query(`INSERT INTO peer_conversations(user_a_id, user_b_id) VALUES ('requester', 'target')`);
    expect(await canViewProfile(harness.pg, 'requester', 'target')).toBe(true);
  });

  it('keeps a paused profile directly visible but removes it from semantic candidates', async () => {
    expect(await canViewProfile(harness.pg, 'requester', 'paused')).toBe(true);
    expect(await canUseProfileForRequester(harness.pg, 'requester', 'paused')).toBe(false);
    expect(await canUseProfileForRequester(harness.pg, 'paused', 'paused')).toBe(true);
    expect(await listSearchCandidateIds(harness.pg, 'requester')).toEqual(new Set(['open']));
    expect(await filterSearchCandidateIds(harness.pg, 'requester', ['open', 'paused', 'target', 'missing'])).toEqual(new Set(['open']));
  });
});
```

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/privacy && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(privacy): покрыть связи и кандидатов" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL='postgres:///pl_test?host=/var/run/postgresql' npx jest --runInBand --runTestsByPath src/privacy/profile-access.pg.spec.ts"
```

Expected: FAIL — access-функции отсутствуют.

- [ ] **Step 3: Добавить access-функции в `profile-privacy.ts`**

```ts
export interface ProfileAccess { exists: boolean; visible: boolean; automaticProfiling: boolean }

export async function readProfileAccess(pg: PgService, requesterId: string, targetId: string): Promise<ProfileAccess> {
  const result = await pg.query(`
    WITH me AS (SELECT id, user_id FROM ai_profiles_consolidated WHERE user_id = $1),
    target AS (SELECT id, user_id, profile_data FROM ai_profiles_consolidated WHERE user_id = $2)
    SELECT target.profile_data,
      EXISTS(SELECT 1 FROM contact_requests cr JOIN me ON true JOIN target ON true
        WHERE cr.status = 'approved' AND ((cr.requester_id = me.id AND cr.target_id = target.id) OR (cr.requester_id = target.id AND cr.target_id = me.id))) AS approved_contact,
      EXISTS(SELECT 1 FROM peer_conversations pc WHERE (pc.user_a_id = $1 AND pc.user_b_id = $2) OR (pc.user_a_id = $2 AND pc.user_b_id = $1)) AS peer,
      EXISTS(SELECT 1 FROM user_blocks ub WHERE (ub.blocker_id = $1 AND ub.blocked_id = $2) OR (ub.blocker_id = $2 AND ub.blocked_id = $1)) AS blocked
    FROM target LEFT JOIN me ON true`, [requesterId, targetId]);
  const row = result.rows[0];
  if (!row) return { exists: false, visible: false, automaticProfiling: false };
  const settings = parsePrivacySettings(row.profile_data);
  const related = row.approved_contact || row.peer;
  return {
    exists: true,
    visible: requesterId === targetId || (!row.blocked && (settings.discoverable || related)),
    automaticProfiling: settings.automaticProfiling,
  };
}

export async function canViewProfile(pg: PgService, requesterId: string, targetId: string): Promise<boolean> {
  try { return (await readProfileAccess(pg, requesterId, targetId)).visible; } catch { return false; }
}

export async function canUseProfileForRequester(pg: PgService, requesterId: string, targetId: string): Promise<boolean> {
  try {
    const access = await readProfileAccess(pg, requesterId, targetId);
    return access.visible && (requesterId === targetId || access.automaticProfiling);
  } catch { return false; }
}

async function searchAccessRows(pg: PgService, requesterId: string, candidateIds: string[] | null) {
  return pg.query(`
    WITH me AS (SELECT id, user_id FROM ai_profiles_consolidated WHERE user_id = $1)
    SELECT p.user_id, p.profile_data,
      EXISTS(SELECT 1 FROM contact_requests cr JOIN me ON true
        WHERE cr.status = 'approved' AND ((cr.requester_id = me.id AND cr.target_id = p.id) OR (cr.requester_id = p.id AND cr.target_id = me.id))) AS approved_contact,
      EXISTS(SELECT 1 FROM peer_conversations pc WHERE (pc.user_a_id = $1 AND pc.user_b_id = p.user_id) OR (pc.user_a_id = p.user_id AND pc.user_b_id = $1)) AS peer,
      EXISTS(SELECT 1 FROM user_blocks ub WHERE (ub.blocker_id = $1 AND ub.blocked_id = p.user_id) OR (ub.blocker_id = p.user_id AND ub.blocked_id = $1)) AS blocked
    FROM ai_profiles_consolidated p LEFT JOIN me ON true
    WHERE p.user_id <> $1 AND ($2::text[] IS NULL OR p.user_id = ANY($2::text[]))`, [requesterId, candidateIds]);
}

function searchableRows(rows: any[]): Set<string> {
  const allowed = new Set<string>();
  for (const row of rows) {
    try {
      const settings = parsePrivacySettings(row.profile_data);
      if (!row.blocked && (settings.discoverable || row.approved_contact || row.peer) && settings.automaticProfiling) allowed.add(row.user_id);
    } catch { /* invalid candidate privacy is excluded */ }
  }
  return allowed;
}

export async function listSearchCandidateIds(pg: PgService, requesterId: string): Promise<Set<string>> {
  return searchableRows((await searchAccessRows(pg, requesterId, null)).rows);
}

export async function filterSearchCandidateIds(pg: PgService, requesterId: string, candidateIds: string[]): Promise<Set<string>> {
  if (!candidateIds.length) return new Set<string>();
  return searchableRows((await searchAccessRows(pg, requesterId, candidateIds)).rows);
}
```

- [ ] **Step 4: Закоммитить и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/privacy && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(privacy): добавить связи и фильтры кандидатов" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL='postgres:///pl_test?host=/var/run/postgresql' npx jest --runInBand --runTestsByPath src/privacy/profile-privacy.spec.ts src/privacy/profile-privacy.pg.spec.ts src/privacy/profile-access.pg.spec.ts && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: defaults, updates и relationship matrix PASS.

---

### Task 3: Neo4j collection, embedding и prompt gates

**Files:**
- Modify: `src/neo4j/neo4j.service.ts`
- Modify: `src/neo4j/neo4j-extraction-wiring.spec.ts`
- Create: `src/neo4j/neo4j.privacy.spec.ts`

- [ ] **Step 1: Написать failing tests**

```ts
import { Neo4jService } from './neo4j.service';
import { automaticProfilingAllowed } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({ automaticProfilingAllowed: jest.fn() }));
const allowed = jest.mocked(automaticProfilingAllowed);

function make(answer = '{}') {
  const pg = { query: jest.fn(async () => ({ rows: [{ content: 'PREV' }] })) };
  const cli = { text: jest.fn(async () => answer) };
  const session = { run: jest.fn(async () => ({ records: [] })), close: jest.fn(async () => undefined) };
  const svc = new Neo4jService(pg as any, cli as any);
  (svc as any).driver = {};
  (svc as any).getSession = jest.fn(() => session);
  return { svc, pg, cli, session };
}

beforeEach(() => { allowed.mockReset(); });

it('disabled collection does not read history, call LLM or open a graph session', async () => {
  allowed.mockResolvedValue(false);
  const { svc, pg, cli, session } = make();
  await svc.consolidateFromChat('u', 'a', 'USER', 'ANSWER');
  expect(pg.query).not.toHaveBeenCalled();
  expect(cli.text).not.toHaveBeenCalled();
  expect(session.run).not.toHaveBeenCalled();
});

it('a late extraction result is discarded after revocation', async () => {
  allowed.mockResolvedValueOnce(true).mockResolvedValue(false);
  const { svc, session } = make('{"values":["kindness"]}');
  await svc.consolidateFromChat('u', 'a', 'USER', 'ANSWER');
  expect(session.run).not.toHaveBeenCalled();
});

it('disabled prompt profile returns an empty string before opening Neo4j', async () => {
  allowed.mockResolvedValue(false);
  const { svc } = make();
  await expect(svc.getProfileDescription('u')).resolves.toBe('');
  expect((svc as any).getSession).not.toHaveBeenCalled();
});
```

В существующий `neo4j-extraction-wiring.spec.ts` добавить:

```ts
import { automaticProfilingAllowed } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({ automaticProfilingAllowed: jest.fn() }));
const allowed = jest.mocked(automaticProfilingAllowed);

beforeEach(() => { allowed.mockResolvedValue(true); });
```

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/neo4j && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(neo4j): зафиксировать privacy gates" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/neo4j/neo4j.privacy.spec.ts src/neo4j/neo4j-extraction-wiring.spec.ts"
```

Expected: FAIL — history/LLM вызываются при запрете.

- [ ] **Step 3: Вставить нижнеуровневые checks**

Импорт:

```ts
import { automaticProfilingAllowed } from '../privacy/profile-privacy';
```

В начало `consolidateFromChat`, после parse перед первой записью и перед каждой следующей write-группой:

```ts
if (!this.pg || !(await automaticProfilingAllowed(this.pg, userId))) return;
```

В `updateProfileEmbedding` — тем же check на входе и после OpenAI response до `session.run`.

В начало `getProfileDescription`:

```ts
if (!this.pg || !(await automaticProfilingAllowed(this.pg, userId))) return '';
```

После последнего awaited graph read и до формирования строки результата:

```ts
if (!this.pg || !(await automaticProfilingAllowed(this.pg, userId))) return '';
```

Не добавлять gate в `getProfileEntities` и `replaceEntities`: self GET и ручное редактирование должны продолжать работать.

- [ ] **Step 4: Закоммитить и подтвердить GREEN + regression**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/neo4j && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(neo4j): остановить профайлинг по настройке" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/neo4j/neo4j.privacy.spec.ts src/neo4j/neo4j-extraction-wiring.spec.ts src/neo4j/profile-extraction-prompt.spec.ts && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: privacy и прежние extraction tests PASS.

---

### Task 4: Business extraction/render; tasks не отключаются

**Files:**
- Modify: `src/business-profile/business-profile.service.ts`
- Create: `src/business-profile/business-profile.privacy.spec.ts`
- Modify: `src/business-profile/extract-from-turn.spec.ts`
- Modify: `src/business-profile/render-for-prompt.spec.ts`

- [ ] **Step 1: Написать failing tests**

```ts
import { BusinessProfileService } from './business-profile.service';
import { automaticProfilingAllowed } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({ automaticProfilingAllowed: jest.fn() }));
const allowed = jest.mocked(automaticProfilingAllowed);

function make(reply = '{"fields":{"legal_form":"ip"}}') {
  const pg = { query: jest.fn(async (sql: string) => /FROM agents/i.test(sql)
    ? { rows: [{ category: 'business' }] }
    : { rows: [{ profile_data: { business: {} } }] }) };
  const cli = { text: jest.fn(async () => reply) };
  return { svc: new BusinessProfileService(pg as any, cli as any), pg, cli };
}

beforeEach(() => { allowed.mockReset(); });

it('does not read business data or call LLM when disabled', async () => {
  allowed.mockResolvedValue(false);
  const { svc, pg, cli } = make();
  await svc.extractFromTurn('u', '10', 'у меня ИП на УСН', 'Понял');
  expect(cli.text).not.toHaveBeenCalled();
  expect(pg.query).not.toHaveBeenCalled();
});

it('discards a late business extraction', async () => {
  allowed.mockResolvedValueOnce(true).mockResolvedValue(false);
  const { svc, pg } = make();
  await svc.extractFromTurn('u', '10', 'у меня ИП на УСН', 'Понял');
  expect(pg.query.mock.calls.filter(([sql]) => /UPDATE ai_profiles_consolidated/i.test(sql))).toHaveLength(0);
});

it('renderForPrompt is empty when disabled', async () => {
  allowed.mockResolvedValue(false);
  const { svc } = make();
  await expect(svc.renderForPrompt('u', 'business')).resolves.toBe('');
});
```

В прежние business specs добавить тот же mock и `beforeEach(() => allowed.mockResolvedValue(true));`. Ручной `merge` проверить отдельным тестом:

```ts
it('manual user merge does not consult the automatic-profiling policy', async () => {
  const { svc } = make();
  await svc.merge('u', { legal_form: 'ip' }, 'user');
  expect(allowed).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/business-profile && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(business): зафиксировать privacy gates" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/business-profile/business-profile.privacy.spec.ts src/business-profile/extract-from-turn.spec.ts src/business-profile/render-for-prompt.spec.ts"
```

Expected: FAIL при отключении и в race.

- [ ] **Step 3: Вставить checks**

Импорт `automaticProfilingAllowed`.

В `extractFromTurn` сразу после dependency guard:

```ts
if (!this.pg || !(await automaticProfilingAllowed(this.pg, userId))) return;
```

После parse и перед `merge(..., 'assistant')`:

```ts
if (!this.pg || !(await automaticProfilingAllowed(this.pg, userId))) return;
```

В `renderForPrompt` до `read(userId)` и после него:

```ts
if (!this.pg || !(await automaticProfilingAllowed(this.pg, userId))) return '';
```

Общий `merge` не менять. `TasksService.extractFromTurn` и `TasksService.buildContextForPrompt` не менять.

- [ ] **Step 4: Закоммитить и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/business-profile && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(business): применить настройку профайлинга" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/business-profile && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: все business-profile suites PASS.

---

### Task 5: Scheduler и voice profileTurns

**Files:**
- Modify: `src/scheduler/profile-compaction.service.ts`
- Create: `src/scheduler/profile-compaction.privacy.spec.ts`
- Modify: `src/voice-call/voice-call.service.ts`
- Create: `src/voice-call/profile-turns-privacy.spec.ts`
- Modify: `src/voice-call/profile-turns-cursor.spec.ts`

- [ ] **Step 1: Написать failing tests**

`src/scheduler/profile-compaction.privacy.spec.ts`:

```ts
import { ProfileCompactionService } from './profile-compaction.service';
import { automaticProfilingAllowed } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({ automaticProfilingAllowed: jest.fn() }));
const allowed = jest.mocked(automaticProfilingAllowed);

beforeEach(() => { allowed.mockReset(); });

it('compactUser does not read entities or history when disabled', async () => {
  allowed.mockResolvedValue(false);
  const pg = { query: jest.fn() };
  const neo4j = { listEntitiesForCompaction: jest.fn() };
  const svc = new ProfileCompactionService(pg as any, neo4j as any);
  await expect(svc.compactUser('u')).resolves.toMatchObject({ skipped: 'privacy' });
  expect(neo4j.listEntitiesForCompaction).not.toHaveBeenCalled();
  expect(pg.query).not.toHaveBeenCalled();
});

it('does not drop a relation if privacy is revoked before the write', async () => {
  allowed.mockResolvedValueOnce(true).mockResolvedValue(false);
  const pg = { query: jest.fn(async () => ({ rows: [] })) };
  const neo4j = {
    listEntitiesForCompaction: jest.fn(async () => [{ support: 0, name: 'value', aliases: [], canonicalKey: 'value' }]),
    dropEntityRelation: jest.fn(),
  };
  const svc = new ProfileCompactionService(pg as any, neo4j as any);
  await svc.compactUser('u');
  expect(neo4j.dropEntityRelation).not.toHaveBeenCalled();
});
```

`src/voice-call/profile-turns-privacy.spec.ts`:

```ts
import { VoiceCallService } from './voice-call.service';
import { automaticProfilingAllowed } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({ automaticProfilingAllowed: jest.fn() }));
const allowed = jest.mocked(automaticProfilingAllowed);

beforeEach(() => { allowed.mockReset(); });

it('returns no turns and keeps the input cursor when disabled', async () => {
  allowed.mockResolvedValue(false);
  const pg = { query: jest.fn() };
  const svc = new VoiceCallService(pg as any, ...([] as any[]));
  await expect(svc.profileTurns('u', 123)).resolves.toEqual({ turns: [], cursor: 123 });
  expect(pg.query).not.toHaveBeenCalled();
});

it('discards transcript turns when privacy is revoked after the query', async () => {
  allowed.mockResolvedValueOnce(true).mockResolvedValue(false);
  const pg = { query: jest.fn(async () => ({ rows: [{ id: 'call', transcript: [{ role: 'user', text: 'private', ts: 124 }] }] })) };
  const svc = new VoiceCallService(pg as any, ...([] as any[]));
  await expect(svc.profileTurns('u', 123)).resolves.toEqual({ turns: [], cursor: 123 });
});
```

В `profile-turns-cursor.spec.ts` добавить тот же policy mock и `beforeEach(() => allowed.mockResolvedValue(true));`.

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/scheduler src/voice-call && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(privacy): закрыть scheduler и voice feed" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/scheduler/profile-compaction.privacy.spec.ts src/voice-call/profile-turns-privacy.spec.ts src/voice-call/profile-turns-cursor.spec.ts"
```

Expected: FAIL — данные читаются при запрете.

- [ ] **Step 3: Вставить scheduler и voice checks**

Nightly SQL заменить на:

```sql
SELECT DISTINCT split_part(h.session_id, '_', 1) AS user_id
FROM custom_chat_history h
JOIN ai_profiles_consolidated p ON p.user_id = split_part(h.session_id, '_', 1)
WHERE h.sender_type = 'human'
  AND h.created_at > now() - interval '7 days'
  AND coalesce(p.profile_data->>'automaticProfiling', 'true') = 'true'
```

В `compactUser` после `if (!this.neo4j)`:

```ts
if (!(await automaticProfilingAllowed(this.pg, userId))) return { skipped: 'privacy' };
```

Перед каждым `dropEntityRelation`, перед stale-write loop и перед `mergeEntitiesInProfile` использовать:

```ts
if (!(await automaticProfilingAllowed(this.pg, userId))) return { ...stats, skipped: 'privacy' };
```

В `profileTurns` до transcript query:

```ts
if (!(await automaticProfilingAllowed(this.pg, userId))) return { turns: [], cursor: sinceTs };
```

После transcript query и до формирования `turns`:

```ts
if (!(await automaticProfilingAllowed(this.pg, userId))) return { turns: [], cursor: sinceTs };
```

- [ ] **Step 4: Закоммитить и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/scheduler src/voice-call && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(privacy): остановить compaction и voice profiling" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/scheduler src/voice-call/profile-turns-cursor.spec.ts src/voice-call/profile-turns-privacy.spec.ts src/voice-call/voice-call.service.spec.ts && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: scheduler/voice PASS; voice transcript и summary не затронуты.

---

### Task 6: Финальные chat prompt insertions и независимость tasks

**Files:**
- Modify: `src/chat/chat.service.ts`
- Create: `src/chat/chat.privacy.spec.ts`
- Modify: `src/chat/chat.service.agent-version-test.spec.ts`
- Modify: `src/chat/business-profile-injection.spec.ts`

- [ ] **Step 1: Написать failing tests**

```ts
import { ChatService } from './chat.service';
import { automaticProfilingAllowed } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({ automaticProfilingAllowed: jest.fn() }));
const allowed = jest.mocked(automaticProfilingAllowed);

it('profileTextForPrompt hides pre-materialized text after revocation', async () => {
  allowed.mockResolvedValue(false);
  const svc = Object.create(ChatService.prototype) as any;
  svc.pg = { query: jest.fn() };
  await expect(svc.profileTextForPrompt('u', 'VALUES')).resolves.toBe('');
});

it('public post-turn wrapper still calls tasks when profiling is disabled', async () => {
  const svc = Object.create(ChatService.prototype) as any;
  svc.pg = { query: jest.fn() };
  svc.logger = { warn: jest.fn() };
  svc.neo4j = { consolidateFromChat: jest.fn() };
  svc.businessProfile = { extractFromTurn: jest.fn() };
  svc.tasksService = { extractFromTurn: jest.fn(async () => undefined) };
  await svc.consolidateAfterChatPublic('u', 'a', 'message', 'answer');
  expect(svc.tasksService.extractFromTurn).toHaveBeenCalledWith('u', 'a', 'message', 'answer');
});

it('all three final prompt paths call the helper immediately before insertion', () => {
  const source = require('fs').readFileSync(`${__dirname}/chat.service.ts`, 'utf8') as string;
  expect(source.match(/profileTextForPrompt\(userId, (?:opts\.)?profileText\)/g)).toHaveLength(3);
  expect(source).toContain('const allowedProfileText = await this.profileTextForPrompt(userId, opts.profileText);');
  expect(source.match(/const allowedProfileText = await this.profileTextForPrompt\(userId, profileText\);/g)).toHaveLength(2);
});

it('all channel entry points still route through the gated methods', () => {
  const read = (path: string) => require('fs').readFileSync(`${__dirname}/${path}`, 'utf8') as string;
  expect(read('chat.controller.ts')).toContain('consolidateAfterChatPublic');
  expect(read('chat.service.ts').match(/consolidateFromChat\(userId, agentId/g)?.length).toBeGreaterThanOrEqual(2);
  expect(read('../tg-bot/tg-router.service.ts')).toContain('consolidateFromChat');
  expect(read('../voice-call/voice-call.service.ts')).toContain('consolidateAfterChatPublic');
  expect(read('../context/context.service.ts')).toContain('getProfileDescription');
  expect(read('../context/context.service.ts')).toContain('renderForPrompt');
});
```

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/chat && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(chat): закрыть финальные prompt insertions" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/chat/chat.privacy.spec.ts src/chat/chat.service.agent-version-test.spec.ts src/chat/business-profile-injection.spec.ts"
```

Expected: FAIL — pre-materialized profile попадает в prompt.

- [ ] **Step 3: Добавить helper и применить в трёх местах**

Импорт `automaticProfilingAllowed`, затем:

```ts
private async profileTextForPrompt(userId: string, text: string | null | undefined): Promise<string> {
  if (!text || !text.trim()) return '';
  return (await automaticProfilingAllowed(this.pg, userId)) ? text : '';
}
```

Universal relay:

```ts
const allowedProfileText = await this.profileTextForPrompt(userId, opts.profileText);
if (allowedProfileText) stablePrefix += `User profile:\n${allowedProfileText}\n\n`;
if ((await automaticProfilingAllowed(this.pg, userId)) && this.businessProfile) {
  const biz = await this.businessProfile.renderForPrompt(userId, opts.agentCategory);
  if (biz) stablePrefix += biz + '\n\n';
}
```

Masha:

```ts
const allowedProfileText = await this.profileTextForPrompt(userId, profileText);
let volatileSystemPrompt = allowedProfileText ? `\n\n--- Профиль пользователя ---\n${allowedProfileText}` : '';
if ((await automaticProfilingAllowed(this.pg, userId)) && this.businessProfile) {
  const biz = await this.businessProfile.renderForPrompt(userId, agent.category);
  if (biz) volatileSystemPrompt += `\n\n${biz}`;
}
```

Agent reply:

```ts
const allowedProfileText = await this.profileTextForPrompt(userId, profileText);
if (allowedProfileText) stablePrefix += `User profile:\n${allowedProfileText}\n\n`;
if (opts.includeUserContext !== false && (await automaticProfilingAllowed(this.pg, userId)) && this.businessProfile) {
  const biz = await this.businessProfile.renderForPrompt(userId, agent.category);
  if (biz) stablePrefix += biz + '\n\n';
}
```

Существующие try/catch вокруг business сохранить. Tasks-блоки не оборачивать privacy check.

- [ ] **Step 4: Закоммитить и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/chat && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(chat): перепроверять профиль перед prompt" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/chat/chat.privacy.spec.ts src/chat/chat.service.agent-version-test.spec.ts src/chat/business-profile-injection.spec.ts src/chat/llm-provider-di.spec.ts && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: prompt privacy PASS; tasks и существующие call-count contracts PASS.

---

### Task 7: Other-user serializers без Neo4j/Postgres fallback утечки

**Files:**
- Create: `src/profile/profile-public.ts`
- Create: `src/profile/profile-public.spec.ts`
- Modify: `src/profile/profile.controller.ts`
- Modify: `src/profile/profile.service.ts`
- Modify: `src/profile/profile-allowlist.spec.ts`
- Modify: `src/contacts/contacts.service.ts`
- Modify: `src/contacts/contacts.controller.ts`
- Create: `src/contacts/contacts.privacy.spec.ts`

- [ ] **Step 1: Написать failing serializer и endpoint tests**

```ts
import { buildOtherUserProfile } from './profile-public';

const row = { user_id: 'target', email: 'private@example.test', profile_data: {
  name: 'PG Name', family_name: 'PG Family', avatar_url: 'avatar', values: ['STALE'], business: { secret: true },
} };

it('uses only explicit public PG fields when profiling is disabled', () => {
  const result = buildOtherUserProfile(row, { name: 'Neo Name', values: ['NEO'] }, false);
  expect(result.name).toBe('PG Name');
  expect(result.values).toEqual([]);
  expect(result.profile_data.values).toEqual([]);
  expect(result.profile_data.business).toBeUndefined();
});

it('keeps the old merged shape only when profiling is allowed', () => {
  const result = buildOtherUserProfile(row, { name: 'Neo Name', values: ['NEO'] }, true);
  expect(result.name).toBe('Neo Name');
  expect(result.values).toEqual(['NEO']);
});
```

В `profile-allowlist.spec.ts` добавить policy mocks для прежнего public contract и новые запрещённые keys:

```ts
import { canUseProfileForRequester, canViewProfile } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({
  canUseProfileForRequester: jest.fn(),
  canViewProfile: jest.fn(),
}));

beforeEach(() => {
  jest.mocked(canViewProfile).mockResolvedValue(true);
  jest.mocked(canUseProfileForRequester).mockResolvedValue(true);
});
```

В `it.each` отбрасываемых `sanitizeProfilePatch` ключей добавить `'automaticProfiling'` и `'discoverable'`. Вызов в public contract заменить на:

```ts
const r: any = await new ProfileService(pg as any).getUserProfile('viewer', 'u-2');
```

`src/contacts/contacts.privacy.spec.ts`:

```ts
import { ContactsService } from './contacts.service';
import { canReceiveNewProposal, canUseProfileForRequester, canViewProfile } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({
  canUseProfileForRequester: jest.fn(),
  canViewProfile: jest.fn(),
  canReceiveNewProposal: jest.fn(),
}));
const view = jest.mocked(canViewProfile);
const useProfile = jest.mocked(canUseProfileForRequester);
const proposals = jest.mocked(canReceiveNewProposal);

function make() {
  const pg = { query: jest.fn(async (sql: string) => {
    if (/SELECT email, profile_data/i.test(sql)) return { rows: [{ email: 'private@example.test', profile_data: { name: 'PG Name', family_name: 'PG Family', avatar_url: 'avatar' } }] };
    if (/contactVisible/i.test(sql)) return { rows: [{ v: 'matchOnly' }] };
    if (/SELECT user_id FROM ai_profiles_consolidated WHERE id = \$1/i.test(sql)) return { rows: [{ user_id: 'target' }] };
    if (/SELECT id FROM ai_profiles_consolidated WHERE user_id = \$1/i.test(sql)) return { rows: [{ id: 1 }] };
    return { rows: [], rowCount: 0 };
  }) };
  const neo4j = { getProfileEntities: jest.fn(async () => ({ name: 'Neo Name', values: ['NEO'], valuesRich: [{ name: 'NEO' }] })) };
  return { svc: new ContactsService(pg as any, neo4j as any), pg, neo4j };
}

beforeEach(() => { view.mockReset(); useProfile.mockReset(); });

it('returns null for a hidden stranger before reading entities', async () => {
  view.mockResolvedValue(false);
  const { svc, neo4j } = make();
  await expect(svc.getPublicProfile('requester', 2)).resolves.toBeNull();
  expect(neo4j.getProfileEntities).not.toHaveBeenCalled();
});

it('uses PG public fields and empty flat/rich entities when paused', async () => {
  view.mockResolvedValue(true); useProfile.mockResolvedValue(false);
  const { svc, neo4j } = make();
  const result = await svc.getPublicProfile('requester', 2);
  expect(neo4j.getProfileEntities).not.toHaveBeenCalled();
  expect(result).toMatchObject({ name: 'PG Name', family_name: 'PG Family', avatar_url: 'avatar', values: [], valuesRich: [] });
});

it('preserves self entities even when profiling is paused', async () => {
  view.mockResolvedValue(true); useProfile.mockResolvedValue(true);
  const { svc } = make();
  const result = await svc.getPublicProfile('target', 2);
  expect(result).toMatchObject({ name: 'Neo Name', values: ['NEO'] });
});

it('rechecks visibility immediately before serialization', async () => {
  view.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  useProfile.mockResolvedValue(true);
  const { svc } = make();
  await expect(svc.getPublicProfile('requester', 2)).resolves.toBeNull();
});
```

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/profile src/contacts && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(privacy): закрыть публичные сериализации" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/profile/profile-public.spec.ts src/profile/profile-allowlist.spec.ts src/contacts/contacts.privacy.spec.ts"
```

Expected: FAIL — stale entities возвращаются.

- [ ] **Step 3: Реализовать serializer и применить access checks**

`src/profile/profile-public.ts`:

```ts
import { PUBLIC_PROFILE_KEYS } from './profile-patch';

const ENTITY_KEYS = ['values', 'beliefs', 'desires', 'intents', 'interests', 'skills'] as const;

export function buildOtherUserProfile(row: any, neo: any, includeProfile: boolean) {
  const pd = row.profile_data || {};
  const publicPd = Object.fromEntries(PUBLIC_PROFILE_KEYS.filter((key) => pd[key] !== undefined).map((key) => [key, pd[key]]));
  const merged: Record<string, any> = {
    name: includeProfile ? neo?.name || pd.name : pd.name,
    family_name: includeProfile ? neo?.family_name || pd.family_name : pd.family_name,
  };
  for (const key of ENTITY_KEYS) {
    merged[key] = includeProfile ? (neo?.[key]?.length ? neo[key] : pd[key]) || [] : [];
  }
  return { user_id: row.user_id, profile_data: { ...publicPd, ...merged }, ...merged };
}
```

`ProfileController.getUserProfile` получает `@CurrentUser() user: any`, вызывает `profileService.getUserProfile(user.userId, userId)` и при `null` возвращает `404 { code: 'PROFILE_NOT_AVAILABLE' }`.

В `ProfileService.getUserProfile(requesterId, targetId)`:

```ts
if (!(await canViewProfile(this.pg, requesterId, targetId))) return null;
```

После чтения row:

```ts
let includeProfile = await canUseProfileForRequester(this.pg, requesterId, targetId);
const neo = includeProfile && this.neo4j ? await this.neo4j.getProfileEntities(targetId).catch(() => null) : null;
```

Перед ответом повторно проверить:

```ts
if (!(await canViewProfile(this.pg, requesterId, targetId))) return null;
includeProfile = await canUseProfileForRequester(this.pg, requesterId, targetId);
return buildOtherUserProfile(row, includeProfile ? neo : null, includeProfile);
```

В `ContactsService.getPublicProfile` после `targetPhone` добавить:

```ts
if (!(await canViewProfile(this.pg, requesterPhone, targetPhone))) return null;
let includeProfile = await canUseProfileForRequester(this.pg, requesterPhone, targetPhone);
```

Существующие phone/email disclosure queries сохранить. Блок чтения entities/meta и return заменить:

```ts
const entities = includeProfile && this.neo4j
  ? await this.neo4j.getProfileEntities(targetPhone).catch(() => null)
  : null;
const meta = await this.pg.query(
  `SELECT email, profile_data FROM ai_profiles_consolidated WHERE id = $1`,
  [targetId],
);

if (!(await canViewProfile(this.pg, requesterPhone, targetPhone))) return null;
includeProfile = await canUseProfileForRequester(this.pg, requesterPhone, targetPhone);
const visibleEntities = includeProfile ? entities : null;
const pd = meta.rows[0]?.profile_data || {};

return {
  userId: targetId,
  name: visibleEntities?.name ?? pd.name ?? null,
  family_name: visibleEntities?.family_name ?? pd.family_name ?? null,
  avatar_url: pd.avatar_url ?? null,
  email: phoneDisclosed ? meta.rows[0]?.email ?? null : null,
  phone: phoneDisclosed ? targetPhone : null,
  contactVisible: visibility,
  phoneDisclosed,
  values: visibleEntities?.values ?? [],
  beliefs: visibleEntities?.beliefs ?? [],
  desires: visibleEntities?.desires ?? [],
  intents: visibleEntities?.intents ?? [],
  interests: visibleEntities?.interests ?? [],
  skills: visibleEntities?.skills ?? [],
  valuesRich: visibleEntities?.valuesRich ?? [],
  beliefsRich: visibleEntities?.beliefsRich ?? [],
  desiresRich: visibleEntities?.desiresRich ?? [],
  intentsRich: visibleEntities?.intentsRich ?? [],
  interestsRich: visibleEntities?.interestsRich ?? [],
  skillsRich: visibleEntities?.skillsRich ?? [],
};
```

В `ProfileController` добавить `import { CurrentUser } from '../common/decorators/user.decorator';`. В `ProfileService` и `ContactsService` импортировать `canUseProfileForRequester, canViewProfile` из `../privacy/profile-privacy`.

В `ContactsController.publicProfile` и `publicProfileByPhone` оба существующих 404 ответа привести к одному виду:

```ts
return res.status(404).json({ code: 'PROFILE_NOT_AVAILABLE' });
```

- [ ] **Step 4: Закоммитить и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/profile src/contacts && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(privacy): защитить публичные профили" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/profile src/contacts && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: allowlist, self-edit и public privacy PASS.

---

### Task 8: Contact/peer proposals и requester identity

**Files:**
- Modify: `src/contacts/contacts.service.ts`
- Modify: `src/contacts/contacts.controller.ts`
- Modify: `src/contacts/contacts.privacy.spec.ts`
- Modify: `src/peer/peer.service.ts`
- Modify: `src/peer/peer.controller.ts`
- Create: `src/peer/peer.privacy.spec.ts`

- [ ] **Step 1: Написать failing tests**

```ts
import { PeerService } from './peer.service';
import { canReceiveNewProposal } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({ canReceiveNewProposal: jest.fn() }));
const allowed = jest.mocked(canReceiveNewProposal);

it('returns the same 404 for hidden and missing targets before target lookup', async () => {
  allowed.mockResolvedValue(false);
  const pg = { query: jest.fn() };
  const svc = new PeerService(pg as any);
  for (const target of ['hidden', 'missing']) {
    await expect(svc.sendRequest('requester', { toUserId: target, introMessage: 'hello' }))
      .rejects.toMatchObject({ status: 404, response: { code: 'PROFILE_NOT_AVAILABLE' } });
  }
  expect(pg.query).not.toHaveBeenCalled();
});
```

В `contacts.privacy.spec.ts` добавить:

```ts
it('rejects a contact request with 404 before contactVisible or INSERT', async () => {
  proposals.mockResolvedValue(false);
  const { svc, pg } = make();
  await expect(svc.createRequest('requester', 2, null)).rejects.toMatchObject({ status: 404, response: { code: 'PROFILE_NOT_AVAILABLE' } });
  expect(pg.query.mock.calls.filter(([sql]) => /INSERT INTO contact_requests/i.test(sql) || /contactVisible/i.test(sql))).toHaveLength(0);
});

it('controller preserves HttpException and peer controller uses userId', () => {
  const contactsSource = require('fs').readFileSync(`${__dirname}/contacts.controller.ts`, 'utf8') as string;
  const peerSource = require('fs').readFileSync(`${__dirname}/../peer/peer.controller.ts`, 'utf8') as string;
  expect(contactsSource).toContain('if (error instanceof HttpException) throw error;');
  expect(peerSource).not.toContain('u.phone');
  expect(peerSource).toContain('u.userId');
});
```

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/contacts src/peer && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(privacy): закрыть новые предложения" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/contacts/contacts.privacy.spec.ts src/peer/peer.privacy.spec.ts"
```

Expected: FAIL — target existence/rate rules выполняются раньше policy.

- [ ] **Step 3: Вставить proposal checks и единый 404**

В `ContactsService` добавить `NotFoundException` к импорту из `@nestjs/common`, а в `ContactsController` — `HttpException`. В `createRequest` после target resolution:

```ts
if (!(await canReceiveNewProposal(this.pg, targetPhone))) {
  throw new NotFoundException({ code: 'PROFILE_NOT_AVAILABLE' });
}
```

В `ContactsController.createRequest` catch:

```ts
catch (error) {
  if (error instanceof HttpException) throw error;
  return res.status(400).json({ error: error instanceof Error ? error.message : 'Bad request' });
}
```

В начало `PeerService.sendRequest`, после DTO/self validation и до target existence:

```ts
if (!(await canReceiveNewProposal(this.pg, dto.toUserId))) {
  throw new NotFoundException({ code: 'PROFILE_NOT_AVAILABLE' });
}
```

В `PeerController` заменить все `u.phone` на `u.userId`: JWT guard создаёт именно это поле; без исправления requester policy и существующие peer-правила получают неверный идентификатор.

- [ ] **Step 4: Закоммитить и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/contacts src/peer && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(privacy): ограничить новые предложения" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/contacts src/peer && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: hidden/missing 404 совпадают; block/conversation/pending/rate tests PASS.

---

### Task 9: Eligible-only semantic search и перепроверки карточек

**Files:**
- Modify: `src/misc/misc.service.ts`
- Modify: `src/misc/misc.search-mate.spec.ts`
- Create: `src/misc/misc.search-privacy.spec.ts`

- [ ] **Step 1: Написать failing tests**

```ts
import * as fs from 'fs';

it('computes cosine only for eligible candidates in every category', () => {
  const source = fs.readFileSync(`${__dirname}/misc.service.ts`, 'utf8');
  const body = source.slice(source.indexOf('private async searchProfiles'), source.indexOf('private async *llmText'));
  expect(body).not.toContain('db.index.vector.queryNodes');
  expect(body.match(/p\.phone IN \$candidatePhones/g)).toHaveLength(6);
  expect(body).toContain('listSearchCandidateIds(this.pg, excludePhone)');
  expect(body).toContain('candidatePhones: Array.from(candidatePhones)');
});

it('rechecks before selection, prose and final cards', () => {
  const source = fs.readFileSync(`${__dirname}/misc.service.ts`, 'utf8');
  const body = source.slice(source.indexOf('async searchMate'), source.indexOf('private async writePaced'));
  const selection = body.indexOf('buildSelectionPrompt(allowedMatches');
  const prose = body.indexOf('buildProsePrompt(selected');
  const cards = body.indexOf('const cards = selected.map');
  expect(body.indexOf('const beforeSelection =')).toBeLessThan(selection);
  expect(body.indexOf('const beforeProse =')).toBeGreaterThan(selection);
  expect(body.indexOf('const beforeProse =')).toBeLessThan(prose);
  expect(body.indexOf('const beforeCards =')).toBeGreaterThan(prose);
  expect(body.indexOf('const beforeCards =')).toBeLessThan(cards);
});
```

В `misc.search-mate.spec.ts` добавить:

```ts
import { filterSearchCandidateIds } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({
  filterSearchCandidateIds: jest.fn(),
  listSearchCandidateIds: jest.fn(),
  readProfileAccess: jest.fn(),
  automaticProfilingAllowed: jest.fn(),
}));

beforeEach(() => {
  jest.mocked(filterSearchCandidateIds).mockImplementation(async (_pg, _requester, ids) => new Set(ids));
});
```

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/misc && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(search): зафиксировать privacy кандидатов" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/misc/misc.search-privacy.spec.ts src/misc/misc.search-mate.spec.ts"
```

Expected: FAIL — глобальный vector index и отсутствие rechecks.

- [ ] **Step 3: Ограничить кандидатов до cosine и добавить rechecks**

В начале `searchProfiles`, до OpenAI embedding:

```ts
const candidatePhones = await listSearchCandidateIds(this.pg, excludePhone);
if (!candidatePhones.size) return [];
```

Шесть веток внутри текущего `CALL { ... }` заменить полностью:

```cypher
WITH emb
MATCH (p:Profile)-[:HAS_VALUE]->(node:Value)
WHERE p.phone IN $candidatePhones AND node.embedding IS NOT NULL
WITH p, node, vector.similarity.cosine(node.embedding, emb) AS score
ORDER BY score DESC
LIMIT 20
RETURN p, node, score, 'Value' AS category, 3.0 AS weight
UNION
WITH emb
MATCH (p:Profile)-[:HAS_DESIRE]->(node:Desire)
WHERE p.phone IN $candidatePhones AND node.embedding IS NOT NULL
WITH p, node, vector.similarity.cosine(node.embedding, emb) AS score
ORDER BY score DESC
LIMIT 20
RETURN p, node, score, 'Desire' AS category, 2.5 AS weight
UNION
WITH emb
MATCH (p:Profile)-[:HAS_INTEREST]->(node:Interest)
WHERE p.phone IN $candidatePhones AND node.embedding IS NOT NULL
WITH p, node, vector.similarity.cosine(node.embedding, emb) AS score
ORDER BY score DESC
LIMIT 20
RETURN p, node, score, 'Interest' AS category, 2.0 AS weight
UNION
WITH emb
MATCH (p:Profile)-[:HAS_INTENT]->(node:Intent)
WHERE p.phone IN $candidatePhones AND node.embedding IS NOT NULL
WITH p, node, vector.similarity.cosine(node.embedding, emb) AS score
ORDER BY score DESC
LIMIT 20
RETURN p, node, score, 'Intent' AS category, 2.0 AS weight
UNION
WITH emb
MATCH (p:Profile)-[:HAS_BELIEF]->(node:Belief)
WHERE p.phone IN $candidatePhones AND node.embedding IS NOT NULL
WITH p, node, vector.similarity.cosine(node.embedding, emb) AS score
ORDER BY score DESC
LIMIT 20
RETURN p, node, score, 'Belief' AS category, 1.2 AS weight
UNION
WITH emb
MATCH (p:Profile)-[:HAS_SKILL]->(node:Skill)
WHERE p.phone IN $candidatePhones AND node.embedding IS NOT NULL
WITH p, node, vector.similarity.cosine(node.embedding, emb) AS score
ORDER BY score DESC
LIMIT 20
RETURN p, node, score, 'Skill' AS category, 1.0 AS weight
```

`session.run`:

```ts
const result = await session.run(cypher, {
  embedding: queryEmbedding,
  candidatePhones: Array.from(candidatePhones),
});
```

После surrogate-ID enrichment:

```ts
const beforeSelection = await filterSearchCandidateIds(this.pg, userId, phones);
const allowedMatches = matches.filter((match) => beforeSelection.has(match.phone));
if (!allowedMatches.length) return noResults();
```

`buildSelectionPrompt` и `selectSearchProfiles` получают только `allowedMatches`:

```ts
const answer = await this.completeLLM(buildSelectionPrompt(allowedMatches, userLanguage), userMessage);
const selection = parseSearchSelection(answer);
if (!selection) throw new Error(`selection is not a JSON array (${answer.length} chars)`);
selected = selectSearchProfiles(allowedMatches, selection);
```

После selection:

```ts
const beforeProse = await filterSearchCandidateIds(this.pg, userId, selected.map((item) => item.found.phone));
selected = selected.filter((item) => beforeProse.has(item.found.phone));
if (!selected.length) return noResults();
```

После prose и до `cards`:

```ts
const beforeCards = await filterSearchCandidateIds(this.pg, userId, selected.map((item) => item.found.phone));
selected = selected.filter((item) => beforeCards.has(item.found.phone));
if (!selected.length) return noResults();
```

- [ ] **Step 4: Закоммитить и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/misc && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(search): ограничить кандидатов до сопоставления" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/misc/misc.search-privacy.spec.ts src/misc/misc.search-mate.spec.ts src/misc/misc.service.deduct.spec.ts && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: six eligible-only branches PASS; prompts/cards не содержат скрытых кандидатов.

---

### Task 10: Compatibility preflight 404/422 и mid-flight revoke

**Files:**
- Modify: `src/misc/misc.service.ts`
- Create: `src/misc/misc.compatibility-privacy.spec.ts`

- [ ] **Step 1: Написать failing tests**

`src/misc/misc.compatibility-privacy.spec.ts` целиком:

```ts
import { MiscService } from './misc.service';
import { automaticProfilingAllowed, readProfileAccess } from '../privacy/profile-privacy';

jest.mock('../privacy/profile-privacy', () => ({
  automaticProfilingAllowed: jest.fn(),
  readProfileAccess: jest.fn(),
  filterSearchCandidateIds: jest.fn(),
  listSearchCandidateIds: jest.fn(),
}));
const accessMock = jest.mocked(readProfileAccess);
const profilingMock = jest.mocked(automaticProfilingAllowed);
const pairFixture = { overallScore: 1, perCategory: {} };

function response() {
  return {
    statusCode: 200, body: null as any, writes: [] as string[],
    status(code: number) { this.statusCode = code; return this; },
    setHeader() { return this; },
    json(body: any) { this.body = body; return this; },
    write(chunk: string) { this.writes.push(chunk); return true; },
    end() { return this; },
  } as any;
}

let service: any;
let comparePairByEmbeddings: jest.Mock;
let streamLLM: jest.Mock;
let pg: { query: jest.Mock };

beforeEach(() => {
  accessMock.mockReset(); profilingMock.mockReset(); profilingMock.mockResolvedValue(true);
  pg = { query: jest.fn(async () => ({ rows: [] })) };
  service = new MiscService({} as any, pg as any, {} as any, { resolveUserLanguage: jest.fn(async () => 'ru') } as any);
  comparePairByEmbeddings = jest.fn();
  streamLLM = jest.fn();
  service.comparePairByEmbeddings = comparePairByEmbeddings;
  service.streamLLM = streamLLM;
});

it('returns 404 for missing and hidden targets before streaming or graph reads', async () => {
  for (const access of [{ exists: false, visible: false, automaticProfiling: true }, { exists: true, visible: false, automaticProfiling: true }]) {
    accessMock.mockResolvedValue(access);
    const res = response();
    await service.analyzeCompatibility('requester', ['target'], res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('PROFILE_NOT_AVAILABLE');
  }
  expect(comparePairByEmbeddings).not.toHaveBeenCalled();
  expect(streamLLM).not.toHaveBeenCalled();
});

it('returns 422 if target disabled profiling', async () => {
  accessMock.mockResolvedValue({ exists: true, visible: true, automaticProfiling: false });
  const res = response();
  await service.analyzeCompatibility('requester', ['target'], res);
  expect(res.statusCode).toBe(422);
  expect(res.body.code).toBe('PROFILE_DATA_UNAVAILABLE');
  expect(comparePairByEmbeddings).not.toHaveBeenCalled();
});

it('returns 422 if requester disabled profiling', async () => {
  accessMock.mockResolvedValue({ exists: true, visible: true, automaticProfiling: true });
  profilingMock.mockResolvedValue(false);
  const res = response();
  await service.analyzeCompatibility('requester', ['target'], res);
  expect(res.statusCode).toBe(422);
  expect(comparePairByEmbeddings).not.toHaveBeenCalled();
});

it('does not call LLM if access is revoked during graph comparison', async () => {
  accessMock
    .mockResolvedValueOnce({ exists: true, visible: true, automaticProfiling: true })
    .mockResolvedValueOnce({ exists: true, visible: false, automaticProfiling: true });
  comparePairByEmbeddings.mockResolvedValue(pairFixture);
  const res = response();
  await service.analyzeCompatibility('requester', ['target'], res);
  expect(streamLLM).not.toHaveBeenCalled();
  expect(res.writes.join('')).not.toContain('PRIVATE');
});

it('maps an unresolved surrogate ID to the same 404', async () => {
  const res = response();
  await service.analyzeCompatibility('requester', ['7'], res);
  expect(res.statusCode).toBe(404);
  expect(res.body.code).toBe('PROFILE_NOT_AVAILABLE');
  expect(comparePairByEmbeddings).not.toHaveBeenCalled();
});

it('keeps the existing stream path for an allowed profile', async () => {
  accessMock.mockResolvedValue({ exists: true, visible: true, automaticProfiling: true });
  comparePairByEmbeddings.mockResolvedValue(pairFixture);
  const res = response();
  await service.analyzeCompatibility('requester', ['target'], res);
  expect(comparePairByEmbeddings).toHaveBeenCalledWith('requester', 'target');
  expect(streamLLM).toHaveBeenCalled();
});
```

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/misc && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(compatibility): зафиксировать privacy preflight" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/misc/misc.compatibility-privacy.spec.ts"
```

Expected: FAIL — graph читается до policy, ответ 200 stream.

- [ ] **Step 3: Вынести resolution/preflight до headers**

Новый helper (в `misc.service.ts` также импортировать `automaticProfilingAllowed` и `readProfileAccess` из `../privacy/profile-privacy`):

```ts
private async resolveCompatibilityPhones(targetUsers: string[]): Promise<string[]> {
  const phones: string[] = [];
  for (const target of targetUsers) {
    const raw = String(target).trim();
    if (/^\d+$/.test(raw) && raw.length < 10) {
      const result = await this.pg.query('SELECT user_id FROM ai_profiles_consolidated WHERE id = $1', [Number(raw)]);
      if (!result.rows[0]?.user_id) throw new CompatibilityUnavailableError('PROFILE_NOT_AVAILABLE');
      phones.push(result.rows[0].user_id);
    } else {
      phones.push(raw);
    }
  }
  return phones;
}
```

Добавить:

```ts
class CompatibilityUnavailableError extends Error {
  constructor(readonly code: 'PROFILE_NOT_AVAILABLE' | 'PROFILE_DATA_UNAVAILABLE') { super(code); }
}

private async assertCompatibilityAllowed(userId: string, phones: string[]): Promise<void> {
  for (const targetPhone of phones) {
    if (targetPhone === userId) continue;
    const access = await readProfileAccess(this.pg, userId, targetPhone);
    if (!access.exists || !access.visible) throw new CompatibilityUnavailableError('PROFILE_NOT_AVAILABLE');
    if (!access.automaticProfiling || !(await automaticProfilingAllowed(this.pg, userId))) {
      throw new CompatibilityUnavailableError('PROFILE_DATA_UNAVAILABLE');
    }
  }
}
```

В начале `analyzeCompatibility` до `res.status(200)`:

```ts
let resolvedPhones: string[];
try {
  resolvedPhones = await this.resolveCompatibilityPhones(targetUsers);
  await this.assertCompatibilityAllowed(userId, resolvedPhones);
} catch (error) {
  const code = error instanceof CompatibilityUnavailableError ? error.code : 'PROFILE_NOT_AVAILABLE';
  const status = code === 'PROFILE_DATA_UNAVAILABLE' ? 422 : 404;
  res.status(status).json({ code });
  return;
}
```

Пустой `targetUsers` обрабатывать существующим `noTargets`, но headers устанавливать после preflight.

После сравнений и до `streamLLM` вставить:

```ts
try {
  await this.assertCompatibilityAllowed(userId, resolvedPhones);
} catch {
  res.write(JSON.stringify({ type: 'item', content: searchMsg(userLanguage).noData }) + '\n');
  res.end();
  return;
}
```

- [ ] **Step 4: Закоммитить и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/misc && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "feat(compatibility): проверять доступ до сравнения" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/misc && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: compatibility 404/422/mid-flight tests и все misc suites PASS.

---

### Task 11: Frontend PrivacySettings

**Files:**
- Create: `src/components/settings/PrivacySettings.tsx`
- Create: `src/components/settings/PrivacySettings.test.tsx`
- Modify: `src/i18n/locales/ru.json`

- [ ] **Step 1: Написать failing isolated jsdom tests**

`src/components/settings/PrivacySettings.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { actAsync, click, clickAsync, flush, mount, tRu, visibleText, type Mounted } from '../../test/dom';
import PrivacySettings from './PrivacySettings';
import { apiClient } from '../../services/apiClient';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('../../services/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
const api = vi.mocked(apiClient);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as any;
const settle = async () => { await flush(); await flush(); };
let view: Mounted | null = null;

const open = async () => {
  view = mount(<PrivacySettings />);
  await settle();
  return view.container;
};

const privacySwitch = (container: HTMLElement, name: 'automatic_profiling' | 'discoverable') => {
  const label = tRu(`settings.privacy_controls.${name}`);
  const element = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="switch"]'))
    .find((candidate) => candidate.getAttribute('aria-label') === label);
  if (!element) throw new Error(`switch not found: ${label}`);
  return element;
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(ok({ automaticProfiling: true, discoverable: true }));
});
afterEach(() => { view?.unmount(); view = null; });

it('optimistically saves only its own field and ignores the other field in the response', async () => {
  let resolvePost: (value: any) => void = () => {};
  api.post.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
  const container = await open();
  const automatic = privacySwitch(container, 'automatic_profiling');
  const discoverable = privacySwitch(container, 'discoverable');
  click(automatic);
  expect(automatic.getAttribute('aria-checked')).toBe('false');
  expect(automatic.disabled).toBe(true);
  expect(discoverable.disabled).toBe(false);
  expect(api.post).toHaveBeenCalledWith('/webhook/privacy-settings', { automaticProfiling: false });
  await actAsync(() => resolvePost(ok({ automaticProfiling: false, discoverable: false })));
  expect(discoverable.getAttribute('aria-checked')).toBe('true');
  expect(automatic.disabled).toBe(false);
});

it.each([
  ['HTTP 503', () => api.post.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as any)],
  ['network error', () => api.post.mockRejectedValue(new Error('network'))],
])('%s rolls back and shows an error', async (_name, fail) => {
  fail();
  const container = await open();
  const automatic = privacySwitch(container, 'automatic_profiling');
  await clickAsync(automatic);
  await settle();
  expect(automatic.getAttribute('aria-checked')).toBe('true');
  expect(automatic.disabled).toBe(false);
  expect(visibleText(container)).toContain(tRu('settings.privacy_controls.save_error'));
});

it('shows a load error without fake defaults and retries GET', async () => {
  api.get.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as any);
  const container = await open();
  expect(container.querySelectorAll('[role="switch"]')).toHaveLength(0);
  expect(visibleText(container)).toContain(tRu('settings.privacy_controls.load_error'));
  api.get.mockResolvedValueOnce(ok({ automaticProfiling: false, discoverable: true }));
  const retry = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === tRu('settings.privacy_controls.retry'))!;
  await clickAsync(retry);
  await settle();
  expect(privacySwitch(container, 'automatic_profiling').getAttribute('aria-checked')).toBe('false');
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('does not start a duplicate POST for a saving field', async () => {
  api.post.mockReturnValue(new Promise(() => {}));
  const container = await open();
  const automatic = privacySwitch(container, 'automatic_profiling');
  click(automatic); click(automatic);
  expect(api.post).toHaveBeenCalledTimes(1);
});

it('applies two responses only to their own fields in reverse completion order', async () => {
  const pending: Array<{ body: any; resolve: (value: any) => void }> = [];
  api.post.mockImplementation(async (_url, body) => new Promise((resolve) => { pending.push({ body, resolve }); }) as any);
  const container = await open();
  click(privacySwitch(container, 'automatic_profiling'));
  click(privacySwitch(container, 'discoverable'));
  expect(pending.map((item) => item.body)).toEqual([{ automaticProfiling: false }, { discoverable: false }]);
  await actAsync(() => pending[1].resolve(ok({ automaticProfiling: true, discoverable: false })));
  expect(privacySwitch(container, 'automatic_profiling').getAttribute('aria-checked')).toBe('false');
  await actAsync(() => pending[0].resolve(ok({ automaticProfiling: false, discoverable: true })));
  expect(privacySwitch(container, 'discoverable').getAttribute('aria-checked')).toBe('false');
});
```

- [ ] **Step 2: Запустить RED локально**

```bash
cd /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design && pnpm exec vitest run src/components/settings/PrivacySettings.test.tsx
```

Expected: FAIL — компонент отсутствует.

- [ ] **Step 3: Реализовать компонент**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

interface PrivacySettings { automaticProfiling: boolean; discoverable: boolean }
type PrivacyKey = keyof PrivacySettings;

export default function PrivacySettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState<PrivacyKey | null>(null);
  const [saving, setSaving] = useState<Record<PrivacyKey, boolean>>({ automaticProfiling: false, discoverable: false });
  const inFlight = useRef(new Set<PrivacyKey>());
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const response = await apiClient.get('/webhook/privacy-settings');
      if (!response.ok) throw new Error(String(response.status));
      const value = await response.json() as PrivacySettings;
      if (mounted.current) setSettings(value);
    } catch { if (mounted.current) { setSettings(null); setLoadFailed(true); } }
    finally { if (mounted.current) setLoading(false); }
  }, []);

  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

  const change = async (key: PrivacyKey, next: boolean) => {
    if (!settings || inFlight.current.has(key)) return;
    const previous = settings[key];
    inFlight.current.add(key);
    setSaving((current) => ({ ...current, [key]: true }));
    setSaveFailed(null);
    setSettings((current) => current ? { ...current, [key]: next } : current);
    try {
      const response = await apiClient.post('/webhook/privacy-settings', { [key]: next });
      if (!response.ok) throw new Error(String(response.status));
      const saved = await response.json() as PrivacySettings;
      if (mounted.current) setSettings((current) => current ? { ...current, [key]: saved[key] } : current);
    } catch {
      if (mounted.current) {
        setSettings((current) => current ? { ...current, [key]: previous } : current);
        setSaveFailed(key);
      }
    } finally {
      inFlight.current.delete(key);
      if (mounted.current) setSaving((current) => ({ ...current, [key]: false }));
    }
  };

  const control = (key: PrivacyKey, label: string, description: string) => (
    <div className="py-3 border-t border-gray-100">
      <div className="flex items-start justify-between gap-4">
        <div><div className="text-sm font-medium text-gray-900">{label}</div><p className="text-xs text-gray-500 mt-1">{description}</p></div>
        <button type="button" role="switch" aria-checked={settings?.[key] ?? false} aria-label={label}
          disabled={loading || saving[key]} onClick={() => void change(key, !(settings?.[key] ?? false))}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${settings?.[key] ? 'bg-forest-600' : 'bg-gray-300'}`}>
          <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white transition-transform ${settings?.[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {saveFailed === key && <p className="text-xs text-red-600 mt-2">{t('settings.privacy_controls.save_error')}</p>}
    </div>
  );

  return <section className="bg-white border border-gray-200 rounded-xl p-4">
    <h2 className="text-lg font-semibold text-gray-900 flex items-center"><Shield className="w-5 h-5 mr-2 text-forest-600" />{t('settings.privacy_controls.title')}</h2>
    <p className="text-sm text-gray-500 mt-1">{t('settings.privacy_controls.subtitle')}</p>
    {loading && <p className="text-sm text-gray-500 mt-4">{t('settings.privacy_controls.loading')}</p>}
    {loadFailed && <div className="mt-4"><p className="text-sm text-red-600">{t('settings.privacy_controls.load_error')}</p><button type="button" className="mt-2 text-sm text-forest-700" onClick={() => void load()}>{t('settings.privacy_controls.retry')}</button></div>}
    {settings && <div className="mt-2">
      {control('automaticProfiling', t('settings.privacy_controls.automatic_profiling'), t('settings.privacy_controls.automatic_profiling_description'))}
      {control('discoverable', t('settings.privacy_controls.discoverable'), t('settings.privacy_controls.discoverable_description'))}
    </div>}
  </section>;
}
```

В `ru.json` внутрь существующего `settings` добавить объект `privacy_controls`:

```json
{
  "title": "Приватность",
  "subtitle": "Управляйте автоматическим профилем и видимостью в поиске.",
  "automatic_profiling": "Автоматически пополнять мой профиль",
  "automatic_profiling_description": "Если выключить, новые личные и деловые сведения не собираются, а сохранённые не используются ассистентами и не видны другим. Задачи и встречи продолжают запоминаться.",
  "discoverable": "Меня можно найти в поиске",
  "discoverable_description": "Если выключить, новые люди не найдут профиль и не смогут отправить предложение. Существующие контакты и переписки сохранятся.",
  "loading": "Загрузка настроек приватности…",
  "load_error": "Не удалось загрузить настройки приватности.",
  "retry": "Повторить",
  "save_error": "Не удалось сохранить настройку. Попробуйте ещё раз."
}
```

- [ ] **Step 4: Запустить GREEN локально и закоммитить/проверить на ноде**

```bash
cd /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design && pnpm exec vitest run src/components/settings/PrivacySettings.test.tsx
git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design add src/components/settings/PrivacySettings.tsx src/components/settings/PrivacySettings.test.tsx src/i18n/locales/ru.json && git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design commit -m "feat(profile): добавить переключатели приватности" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design push -u origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-front fetch -q origin && git -C ~/ci/wt/profile-privacy-front checkout -q $SHA && cd ~/ci/wt/profile-privacy-front && source ~/.nvm/nvm.sh && pnpm install && pnpm exec vitest run src/components/settings/PrivacySettings.test.tsx && pnpm typecheck"
```

Expected: local и CI tests PASS.

---

### Task 12: Settings integration, семь локалей и compatibility errors

**Files:**
- Modify: `src/components/settings/SettingsView.tsx`
- Modify: `src/i18n/locales/{ru,en,es,de,fr,pt,zh}.json`
- Create: `src/components/search/compatibilityError.ts`
- Create: `src/components/search/compatibilityError.test.ts`
- Create: `src/i18n/privacyLocales.test.ts`
- Modify: `src/components/search/CompatibilityInterface.tsx`

- [ ] **Step 1: Написать failing tests ключей и error mapping**

```ts
import { compatibilityErrorKey } from './compatibilityError';

it('maps privacy errors without treating them as stream failures', () => {
  expect(compatibilityErrorKey(404, 'PROFILE_NOT_AVAILABLE')).toBe('compatibility.error_profile_not_available');
  expect(compatibilityErrorKey(422, 'PROFILE_DATA_UNAVAILABLE')).toBe('compatibility.error_profile_data_unavailable');
  expect(compatibilityErrorKey(500, null)).toBe('compatibility.error_analysis');
});
```

`src/i18n/privacyLocales.test.ts`:

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const languages = ['ru', 'en', 'es', 'de', 'fr', 'pt', 'zh'];
const privacyKeys = ['title', 'subtitle', 'automatic_profiling', 'automatic_profiling_description', 'discoverable', 'discoverable_description', 'loading', 'load_error', 'retry', 'save_error'];

describe('privacy locale coverage', () => {
  it.each(languages)('%s has every new string', (language) => {
    const locale = JSON.parse(fs.readFileSync(new URL(`./locales/${language}.json`, import.meta.url), 'utf8'));
    for (const key of privacyKeys) expect(locale.settings.privacy_controls[key]).toBeTruthy();
    expect(locale.compatibility.error_profile_not_available).toBeTruthy();
    expect(locale.compatibility.error_profile_data_unavailable).toBeTruthy();
  });
});

it('replaces all three local-only controls', () => {
  const source = fs.readFileSync(new URL('../components/settings/SettingsView.tsx', import.meta.url), 'utf8');
  expect(source).toContain('<PrivacySettings />');
  for (const key of ['profileVisibility', 'valuesVisibility', 'allowChats']) expect(source).not.toContain(key);
});
```

- [ ] **Step 2: Запустить RED**

```bash
cd /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design && pnpm exec vitest run src/components/search/compatibilityError.test.ts && pnpm check-locales
```

Expected: FAIL — helper и новые ключи отсутствуют.

- [ ] **Step 3: Заменить старый блок и добавить helper**

В `SettingsView.tsx`: импортировать `PrivacySettings`, удалить `Shield`, три поля из state и старую privacy-карточку, вставить `<PrivacySettings />`. Язык, notifications и `handleSettingChange` сохранить.

`compatibilityError.ts`:

```ts
export function compatibilityErrorKey(status: number, code: string | null): string {
  if (status === 404 && code === 'PROFILE_NOT_AVAILABLE') return 'compatibility.error_profile_not_available';
  if (status === 422 && code === 'PROFILE_DATA_UNAVAILABLE') return 'compatibility.error_profile_data_unavailable';
  return 'compatibility.error_analysis';
}
```

В `CompatibilityInterface` при `!response.ok`:

```ts
const body = await response.json().catch(() => null) as { code?: string } | null;
setAnalysisResult(t(compatibilityErrorKey(response.status, body?.code ?? null)));
return;
```

RU `settings.privacy_controls` уже создан в Task 11; здесь не дублировать ключ, а только проверить его наличие.

RU compatibility:

```json
{
  "error_profile_not_available": "Этот профиль недоступен.",
  "error_profile_data_unavailable": "Анализ совместимости недоступен: у одного из профилей отключено автоматическое пополнение."
}
```

EN:

```json
{
  "privacy_controls": {
    "title": "Privacy",
    "subtitle": "Control automatic profiling and your visibility in search.",
    "automatic_profiling": "Automatically build my profile",
    "automatic_profiling_description": "When off, new personal and business details are not collected, and saved details are not used by assistants or shown to others. Tasks and meetings are still remembered.",
    "discoverable": "People can find me in search",
    "discoverable_description": "When off, new people cannot find your profile or send proposals. Existing contacts and conversations remain.",
    "loading": "Loading privacy settings…",
    "load_error": "Could not load privacy settings.",
    "retry": "Try again",
    "save_error": "Could not save the setting. Please try again."
  },
  "error_profile_not_available": "This profile is unavailable.",
  "error_profile_data_unavailable": "Compatibility analysis is unavailable because automatic profiling is off for one of the profiles."
}
```

ES:

```json
{
  "privacy_controls": {
    "title": "Privacidad",
    "subtitle": "Controla el perfil automático y tu visibilidad en la búsqueda.",
    "automatic_profiling": "Completar automáticamente mi perfil",
    "automatic_profiling_description": "Al desactivarlo, no se recopilan nuevos datos personales ni empresariales, y los datos guardados no se usan por asistentes ni se muestran a otras personas. Las tareas y reuniones se siguen recordando.",
    "discoverable": "Pueden encontrarme en la búsqueda",
    "discoverable_description": "Al desactivarlo, personas nuevas no podrán encontrar tu perfil ni enviarte propuestas. Los contactos y las conversaciones existentes se conservan.",
    "loading": "Cargando configuración de privacidad…",
    "load_error": "No se pudo cargar la configuración de privacidad.",
    "retry": "Reintentar",
    "save_error": "No se pudo guardar la configuración. Inténtalo de nuevo."
  },
  "error_profile_not_available": "Este perfil no está disponible.",
  "error_profile_data_unavailable": "El análisis de compatibilidad no está disponible porque el perfil automático está desactivado en uno de los perfiles."
}
```

DE:

```json
{
  "privacy_controls": {
    "title": "Privatsphäre",
    "subtitle": "Steuere die automatische Profilerstellung und deine Sichtbarkeit in der Suche.",
    "automatic_profiling": "Mein Profil automatisch ergänzen",
    "automatic_profiling_description": "Wenn deaktiviert, werden keine neuen persönlichen oder geschäftlichen Angaben gesammelt. Gespeicherte Angaben werden nicht von Assistenten verwendet und anderen nicht gezeigt. Aufgaben und Termine werden weiterhin gespeichert.",
    "discoverable": "Man kann mich in der Suche finden",
    "discoverable_description": "Wenn deaktiviert, können neue Menschen dein Profil nicht finden und dir keine Angebote senden. Bestehende Kontakte und Unterhaltungen bleiben erhalten.",
    "loading": "Datenschutzeinstellungen werden geladen…",
    "load_error": "Datenschutzeinstellungen konnten nicht geladen werden.",
    "retry": "Erneut versuchen",
    "save_error": "Die Einstellung konnte nicht gespeichert werden. Versuche es erneut."
  },
  "error_profile_not_available": "Dieses Profil ist nicht verfügbar.",
  "error_profile_data_unavailable": "Die Kompatibilitätsanalyse ist nicht verfügbar, da die automatische Profilerstellung bei einem Profil deaktiviert ist."
}
```

FR:

```json
{
  "privacy_controls": {
    "title": "Confidentialité",
    "subtitle": "Contrôlez le profilage automatique et votre visibilité dans la recherche.",
    "automatic_profiling": "Compléter automatiquement mon profil",
    "automatic_profiling_description": "Si désactivé, les nouvelles informations personnelles et professionnelles ne sont pas collectées, et les informations enregistrées ne sont ni utilisées par les assistants ni montrées aux autres. Les tâches et les rendez-vous continuent d’être mémorisés.",
    "discoverable": "On peut me trouver dans la recherche",
    "discoverable_description": "Si désactivé, de nouvelles personnes ne pourront pas trouver votre profil ni vous envoyer de propositions. Les contacts et les conversations existants sont conservés.",
    "loading": "Chargement des paramètres de confidentialité…",
    "load_error": "Impossible de charger les paramètres de confidentialité.",
    "retry": "Réessayer",
    "save_error": "Impossible d’enregistrer le paramètre. Veuillez réessayer."
  },
  "error_profile_not_available": "Ce profil est indisponible.",
  "error_profile_data_unavailable": "L’analyse de compatibilité est indisponible car le profilage automatique est désactivé pour l’un des profils."
}
```

PT:

```json
{
  "privacy_controls": {
    "title": "Privacidade",
    "subtitle": "Controle o perfil automático e a sua visibilidade na pesquisa.",
    "automatic_profiling": "Completar automaticamente o meu perfil",
    "automatic_profiling_description": "Se desativar, não são recolhidos novos dados pessoais ou empresariais, e os dados guardados não são usados pelos assistentes nem mostrados a outras pessoas. As tarefas e as reuniões continuam a ser memorizadas.",
    "discoverable": "Podem encontrar-me na pesquisa",
    "discoverable_description": "Se desativar, pessoas novas não poderão encontrar o seu perfil nem enviar-lhe propostas. Os contactos e as conversas existentes são mantidos.",
    "loading": "A carregar as definições de privacidade…",
    "load_error": "Não foi possível carregar as definições de privacidade.",
    "retry": "Tentar novamente",
    "save_error": "Não foi possível guardar a definição. Tente novamente."
  },
  "error_profile_not_available": "Este perfil não está disponível.",
  "error_profile_data_unavailable": "A análise de compatibilidade não está disponível porque o perfil automático está desativado num dos perfis."
}
```

ZH:

```json
{
  "privacy_controls": {
    "title": "隐私",
    "subtitle": "管理自动画像和您在搜索中的可见性。",
    "automatic_profiling": "自动完善我的个人资料",
    "automatic_profiling_description": "关闭后，不会收集新的个人和商务信息，已保存的信息不会用于助手，也不会向他人显示。任务和会议仍会被记住。",
    "discoverable": "允许他人在搜索中找到我",
    "discoverable_description": "关闭后，新用户无法找到您的资料，也无法向您发送邀请。现有联系人和对话会保留。",
    "loading": "正在加载隐私设置…",
    "load_error": "无法加载隐私设置。",
    "retry": "重试",
    "save_error": "无法保存设置，请重试。"
  },
  "error_profile_not_available": "此个人资料不可用。",
  "error_profile_data_unavailable": "由于其中一方关闭了自动画像，无法进行兼容性分析。"
}
```

Объекты вставить в существующие `settings` и `compatibility`, не заменяя соседние ключи.

- [ ] **Step 4: Запустить GREEN и закоммитить/проверить на ноде**

```bash
cd /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design && pnpm exec vitest run src/components/search/compatibilityError.test.ts src/i18n/privacyLocales.test.ts src/components/settings/PrivacySettings.test.tsx && pnpm check-keys && pnpm check-locales && pnpm check-hardcoded && pnpm check-locale-format
git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design add src/components/settings/SettingsView.tsx src/components/search src/i18n && git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design commit -m "feat(profile): подключить приватность и переводы" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-front fetch -q origin && git -C ~/ci/wt/profile-privacy-front checkout -q $SHA && cd ~/ci/wt/profile-privacy-front && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/search/compatibilityError.test.ts src/i18n/privacyLocales.test.ts src/components/settings/PrivacySettings.test.tsx && pnpm check-keys && pnpm check-locales && pnpm check-hardcoded && pnpm check-locale-format && pnpm typecheck"
```

Expected: все locale checks PASS, compatibility errors локализованы.

---

### Task 13: Удалить чужие карточки из localStorage

**Files:**
- Modify: `src/components/search/SearchInterface.tsx`
- Create: `src/components/search/SearchInterface.storage.test.tsx`

- [ ] **Step 1: Написать failing storage tests**

`src/components/search/SearchInterface.storage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clickAsync, flush, mount, type, visibleText, type Mounted } from '../../test/dom';
import SearchInterface from './SearchInterface';
import { apiClient } from '../../services/apiClient';

vi.mock('react-i18next', async () => {
  const { tRu } = await import('../../test/dom');
  return { useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => key === 'search.intent_placeholders' ? ['партнёра'] : tRu(key, options) }) };
});
vi.mock('../../services/apiClient', () => ({ apiClient: { post: vi.fn() } }));
const api = vi.mocked(apiClient);
let view: Mounted | null = null;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
});
afterEach(() => { view?.unmount(); view = null; });

it('removes legacy other-user cards but preserves my query', async () => {
  localStorage.setItem('search_query', 'мой запрос');
  localStorage.setItem('search_results', JSON.stringify([{ id: '7', name: 'Чужой профиль', values: [], intents: [], corellation: 1 }]));
  localStorage.setItem('search_comment', 'чужие данные');
  localStorage.setItem('has_searched', 'true');
  view = mount(<SearchInterface />);
  await flush(); await flush();
  expect(visibleText(view.container)).not.toContain('Чужой профиль');
  expect(localStorage.getItem('search_query')).toBe('мой запрос');
  for (const key of ['search_results', 'search_comment', 'has_searched']) expect(localStorage.getItem(key)).toBeNull();
});

it('does not recreate result keys after search and React effects', async () => {
  api.post.mockReturnValue(new Promise(() => {}));
  view = mount(<SearchInterface />);
  await flush();
  type(view.container.querySelector('[data-testid="search-input"]')!, 'новый запрос');
  await clickAsync(view.container.querySelector('[data-testid="search-submit-btn"]')!);
  await flush();
  expect(api.post).toHaveBeenCalledWith('/webhook/search-mate', { query: 'новый запрос' });
  for (const key of ['search_results', 'search_comment', 'has_searched']) expect(localStorage.getItem(key)).toBeNull();
});
```

- [ ] **Step 2: Запустить RED локально**

```bash
cd /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design && pnpm exec vitest run src/components/search/SearchInterface.storage.test.tsx
```

Expected: FAIL — карточка восстанавливается, effects пересоздают ключи.

- [ ] **Step 3: Оставить только собственный query**

В `SearchInterface.tsx` заменить initializers на:

```ts
const [results, setResults] = useState<UserMatch[]>([]);
const [searchComment, setSearchComment] = useState('');
const [hasSearched, setHasSearched] = useState(false);
```

В mount effect один раз выполнить:

```ts
for (const key of ['search_results', 'search_comment', 'has_searched']) {
  localStorage.removeItem(key);
}
```

- Удалить persistence effects для этих трёх значений и их старые `removeItem` в `handleSearch`.
- Сохранение `search_query` оставить.
- Реестры legacy keys в `persistentStorage.ts` и `clearAppStorage.ts` оставить для cleanup.

- [ ] **Step 4: Запустить GREEN и закоммитить/проверить на ноде**

```bash
cd /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design && pnpm exec vitest run src/components/search/SearchInterface.storage.test.tsx src/components/search/searchStream.test.ts
git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design add src/components/search/SearchInterface.tsx src/components/search/SearchInterface.storage.test.tsx && git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design commit -m "fix(search): не хранить чужие карточки локально" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-front fetch -q origin && git -C ~/ci/wt/profile-privacy-front checkout -q $SHA && cd ~/ci/wt/profile-privacy-front && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/search/SearchInterface.storage.test.tsx src/components/search/searchStream.test.ts && pnpm typecheck"
```

Expected: legacy удалён, новые result keys не создаются.

---

### Task 14: Справка и синхронизация подписей

**Files:**
- Modify: `src/platform-kb/articles/profile.ts`
- Modify: `src/platform-kb/articles/networking.ts`
- Modify: `src/platform-kb/articles/how-it-works.ts`
- Modify: `src/platform-kb/label-keys.json`
- Modify generated: `src/platform-kb/labels.generated.ts`
- Create: `src/platform-kb/privacy.spec.ts`

- [ ] **Step 1: Написать failing KB regression**

```ts
import { profile } from './articles/profile';
import { networking } from './articles/networking';
import { howItWorks } from './articles/how-it-works';
import { renderArticle } from './render';

it('explains both real controls and preserves existing contacts', () => {
  const profileText = renderArticle(profile, 'ru', 'web');
  const networkingText = renderArticle(networking, 'ru', 'web');
  expect(profileText).toContain('Автоматически пополнять мой профиль');
  expect(networkingText).toContain('Меня можно найти в поиске');
  expect(networkingText).toContain('существующие контакты и переписки');
  expect(networkingText).not.toContain('Скрыться из поиска.');
  expect(profileText).not.toContain('Скрыть профиль из поиска людей.');
});

it('does not promise deletion or full anonymity', () => {
  const text = renderArticle(howItWorks, 'ru', 'web');
  expect(text).toContain('новые люди');
  expect(text).not.toContain('полная анонимность');
});
```

- [ ] **Step 2: Закоммитить и подтвердить RED**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/platform-kb/privacy.spec.ts && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(help): зафиксировать описание приватности" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/platform-kb/privacy.spec.ts"
```

Expected: FAIL — справка утверждает, что скрыться нельзя.

- [ ] **Step 3: Обновить статьи и labels**

В `label-keys.json` добавить:

```json
"automaticProfiling": "settings.privacy_controls.automatic_profiling",
"discoverable": "settings.privacy_controls.discoverable"
```

В `profile.ts` в «Как» добавить:

```text
- В настройках приватности ${q('automaticProfiling')} отключает автосбор и использование личного/делового профиля; сохранённое остаётся видимым владельцу. Задачи и встречи продолжают запоминаться.
```

Строку про видимость заменить:

```text
- Когда автосбор включён, профиль видят ассистенты; он работает в поиске и совместимости. При выключении сохранённое не уходит ассистентам и другим людям, но остаётся владельцу.
```

Из «Чего нельзя» убрать «Скрыть профиль…», добавить:

```text
- Удалить сохранённый профиль одним переключателем.
```

В `networking.ts` в «Как» добавить:

```text
- ${q('discoverable')} в настройках профиля: выкл — новые люди не находят профиль и не отправляют предложения; существующие контакты и переписки продолжают работать.
```

Из «Чего нельзя» убрать «Скрыться…», добавить:

```text
- Совместимость, если у одного из двоих выключен автоматический профиль.
```

В `how-it-works.ts` строку «Другие пользователи…» заменить:

```text
- Другие пользователи видят личный профиль, если это разрешено настройками. При выключенном автосборе видны только явно указанные анкетные данные; при выключенном поиске новые люди профиль не находят, а существующие контакты и переписки сохраняются. Телефон и почта раскрываются по ${q('contactVisibility')} или принятому запросу.
```

Запустить генератор:

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy && node scripts/sync-kb-labels.mjs /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design
```

- [ ] **Step 4: Закоммитить и подтвердить GREEN**

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add src/platform-kb && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "docs(help): описать настройки приватности" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npx jest --runInBand --runTestsByPath src/platform-kb && npx tsc --noEmit --incremental false -p tsconfig.build.json"
```

Expected: privacy, labels, KB variants (7 языков × 4 клиента) и 5 KiB limit PASS.

---

### Task 15: E2E, полные гейты, review и подготовка выката

**Files:**
- Create: `tests/playwright/privacy.spec.js`
- Modify only if required by test results: файлы предыдущих задач.

- [ ] **Step 1: Написать live API/UI smoke с cleanup**

`tests/playwright/privacy.spec.js`:

```js
// @ts-check
const { test, expect } = require('@playwright/test');
const axios = require('axios');
const { debugHeaders } = require('../debug-secret');

const BASE = process.env.BASE_URL || 'https://my.linkeon.io';
const TARGET_PHONE = process.env.TEST_PHONE || '70000000000';
const STRANGER_PHONE = process.env.ADMIN_PHONE || '79030169187';
const SMS_WH = '898c938d-f094-455c-86af-969617e62f7a';
const CHECK_WH = 'a376a8ed-3bf7-4f23-aaa5-236eea72871b';

async function login(phone) {
  await axios.get(`${BASE}/webhook/${SMS_WH}/sms/${phone}`);
  const code = await axios.get(`${BASE}/webhook/debug/sms-code/${phone}`, { headers: debugHeaders() });
  const auth = await axios.get(`${BASE}/webhook/${CHECK_WH}/check-code/${phone}/${code.data.code}`);
  return auth.data['access-token'];
}

async function request(method, path, token, body) {
  return axios({
    method, url: `${BASE}${path}`,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    data: body,
    validateStatus: () => true,
  });
}

async function settings(token) {
  const response = await request('GET', '/webhook/privacy-settings', token);
  expect(response.status).toBe(200);
  return response.data;
}

async function update(token, patch) {
  return request('POST', '/webhook/privacy-settings', token, patch);
}

async function applyBasicAuth(page) {
  const auth = process.env.BASIC_AUTH;
  if (!auth) return;
  const [user, ...rest] = auth.split(':');
  const encoded = Buffer.from(`${user}:${rest.join(':')}`).toString('base64');
  await page.route('**/*', async (route) => {
    const headers = route.request().headers();
    if (!headers.authorization) await route.continue({ headers: { ...headers, authorization: `Basic ${encoded}` } });
    else await route.continue();
  });
}

async function seedPage(page, token, phone) {
  await applyBasicAuth(page);
  await page.addInitScript(({ access, userPhone }) => {
    localStorage.setItem('i18nextLng', 'ru');
    localStorage.setItem('jwt_access_token', access);
    localStorage.setItem('jwt_refresh_token', access);
    localStorage.setItem('authToken', access);
    localStorage.setItem('userData', JSON.stringify({ phone: userPhone }));
  }, { access: token, userPhone: phone });
}

test.describe('profile privacy smoke', () => {
  test('hidden target is unavailable to a stranger and settings restore', async () => {
    const target = await login(TARGET_PHONE);
    const stranger = await login(STRANGER_PHONE);
    const original = await settings(target);
    try {
      expect((await update(target, { discoverable: false })).status).toBe(200);
      expect((await settings(target)).discoverable).toBe(false);
      expect((await request('GET', `/webhook/user-public-by-phone/${TARGET_PHONE}`, stranger)).status).toBe(404);
      expect((await request('POST', '/webhook/analyze-compatibility', stranger, { users: [TARGET_PHONE] })).status).toBe(404);
      expect((await request('POST', '/webhook/peer/request', stranger, { toUserId: TARGET_PHONE, introMessage: 'privacy test' })).status).toBe(404);
    } finally {
      await update(target, original);
    }
  });

  test('paused profiling stays visible to owner and hidden from a stranger', async () => {
    const target = await login(TARGET_PHONE);
    const stranger = await login(STRANGER_PHONE);
    const original = await settings(target);
    try {
      await update(target, { automaticProfiling: false, discoverable: true });
      expect((await request('GET', '/webhook/profile', target)).status).toBe(200);
      const other = await request('GET', `/webhook/user-public-by-phone/${TARGET_PHONE}`, stranger);
      expect(other.status).toBe(200);
      for (const key of ['values', 'beliefs', 'desires', 'intents', 'interests', 'skills', 'valuesRich', 'beliefsRich', 'desiresRich', 'intentsRich', 'interestsRich', 'skillsRich']) {
        expect(other.data[key]).toEqual([]);
      }
      expect((await request('POST', '/webhook/analyze-compatibility', stranger, { users: [TARGET_PHONE] })).status).toBe(422);
    } finally {
      await update(target, original);
    }
  });

  test('deployed UI saves a real switch and restores it', async ({ page }) => {
    const target = await login(TARGET_PHONE);
    const original = await settings(target);
    const next = !original.automaticProfiling;
    try {
      await seedPage(page, target, TARGET_PHONE);
      await page.goto('/profile?settings=1', { waitUntil: 'domcontentloaded' });
      const control = page.getByRole('switch', { name: 'Автоматически пополнять мой профиль' });
      await expect(control).toBeVisible();
      const saved = page.waitForResponse((response) => response.url().includes('/webhook/privacy-settings') && response.request().method() === 'POST');
      await control.click();
      expect((await saved).status()).toBe(200);
      expect((await settings(target)).automaticProfiling).toBe(next);
    } finally {
      await update(target, original);
    }
  });
});
```

Файл подхватывается существующим `tests/playwright/playwright.config.js` (`testMatch: /.*\.spec\.js$/`) и поэтому автоматически выполняется в `tests/smoke/run.sh` на test до prod и повторно на prod. Не добавлять его в frontend Playwright и не запускать как отдельный gate после prod.

- [ ] **Step 2: Закоммитить smoke-сценарий без самостоятельного запуска**

```bash
node -c /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy/tests/playwright/privacy.spec.js
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy add tests/playwright/privacy.spec.js && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy commit -m "test(e2e): добавить smoke приватности" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
```

Expected: файл есть в `tests/playwright`, `node -c tests/playwright/privacy.spec.js` PASS. Живой запуск выполняется только штатным smoke внутри `deploy.sh` после отдельного OK владельца.

- [ ] **Step 3: Полные backend гейты на ноде**

```bash
SHA=$(git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-back fetch -q origin && git -C ~/ci/wt/profile-privacy-back checkout -q $SHA && cd ~/ci/wt/profile-privacy-back && source ~/.nvm/nvm.sh && npm ci && npx jest --runInBand --testPathPattern='src/.*\\.spec\\.ts$' && npx tsc --noEmit --incremental false -p tsconfig.build.json && npm run build && npx jest --runInBand --testPathPattern='tests/unit/.*\\.test\\.js$'"
```

Expected: src suites, tsc, build и dist unit PASS. Если baseline `origin/main` имеет известные красные suites, прогнать ту же команду на `origin/main` и приложить машинный список failed suites; новых failures быть не должно.

- [ ] **Step 4: Полные frontend гейты на ноде**

```bash
SHA=$(git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design rev-parse HEAD) && ssh dv@85.192.61.231 "git -C ~/ci/wt/profile-privacy-front fetch -q origin && git -C ~/ci/wt/profile-privacy-front checkout -q $SHA && cd ~/ci/wt/profile-privacy-front && source ~/.nvm/nvm.sh && pnpm install && pnpm test && pnpm typecheck && pnpm check-keys && pnpm check-locales && pnpm check-hardcoded && pnpm check-locale-format && pnpm build"
```

Expected: PASS. `pnpm lint` запустить отдельно и приложить результат; известное падение i18next plugin не выдавать за новую регрессию и не объявлять lint зелёным без фактического PASS.

- [ ] **Step 5: Двухэтапное ревью и ручная приёмка**

1. Dispatch spec-review: каждая строка разделов 3–13 спеки сопоставлена с кодом и тестом; особое внимание pre-vector filtering, self/manual edit, tasks, PG fallback, existing relationships.
2. Dispatch code-quality review: гонки, fail-closed, ошибки сериализации, новые SQL, accessibility, cache, секреты/номера в diff.
3. Получить APPROVED без Critical/Important; исправления выполнять RED→GREEN новыми коммитами.
4. Подготовить два test accounts для живой приёмки stranger/approved contact/existing peer/blocked peer, re-enable и продолжения tasks. Автоматический smoke из `privacy.spec.js` обязан пройти на test до prod; дополнительные relationship-проверки выполнить на test и prod после соответствующих фаз, не создавая реальные персональные данные.
5. Проверить `git status --short`, `git log origin/main..HEAD`, отсутствие `.env`, секретов и чужих изменений в diff.

- [ ] **Step 6: Запросить отдельный OK владельца на merge и выкат**

Не выполнять merge или deploy в рамках этой задачи без явного ответа владельца. После OK создать release-воркдеревья от свежего `origin/main`, влить именно reviewed feature SHA и обновить `main`:

```bash
git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy fetch origin && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy push origin feat/profile-privacy
git -C /Users/dmitry/Downloads/spirits_back worktree add -b feat/profile-privacy-release /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy-release origin/main && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy-release merge --no-ff origin/feat/profile-privacy -m "Merge feat/profile-privacy: приватность профиля и поиска" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_back/.worktrees/profile-privacy-release push origin HEAD:main

git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design fetch origin && git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-design push origin feat/profile-privacy
git -C /Users/dmitry/Downloads/spirits_front worktree add -b feat/profile-privacy-release /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-release origin/main && git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-release merge --no-ff origin/feat/profile-privacy -m "Merge feat/profile-privacy: приватность профиля и поиска" -m "Co-Authored-By: Kimi <noreply@anthropic.com>" && git -C /Users/dmitry/Downloads/spirits_front/.claude/worktrees/profile-privacy-release push origin HEAD:main
```

Затем запустить выкат из новых клонов `main`, не из feature и не из общего рабочего чекаута:

```bash
DEPLOY_ROOT=$(mktemp -d /tmp/profile-privacy-deploy.XXXXXX) && git clone --branch main --single-branch git@github.com:dvvolkovv/spirits_back.git "$DEPLOY_ROOT/spirits_back" && git clone --branch main --single-branch git@github.com:dvvolkovv/spirits.git "$DEPLOY_ROOT/spirits_front" && bash "$DEPLOY_ROOT/spirits_back/scripts/deploy.sh"
```

Expected: test → smoke → prod → smoke GREEN; никаких `rsync`, ручных правок сервера, `PROD_ONLY` или пропуска test. `privacy.spec.js` выполняется в browser-smoke на test до prod и повторно на prod, восстанавливая исходные настройки. После выката сверить production SHA и privacy endpoint; semantic search дополнительно проверить на среде с рабочими индексами только на test accounts.
