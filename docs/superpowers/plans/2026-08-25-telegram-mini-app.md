# Telegram Mini App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram Mini App для Linkeon — четыре экрана (День, Ассистенты, Кошелёк, Профиль) рядом с существующим ботом, вход по подписанному `initData`.

**Architecture:** Telegram заводится седьмым провайдером в существующей системе идентичностей `spirits_back/src/identity/`. Новая ручка `POST /webhook/tma/auth` проверяет HMAC-подпись `initData` и выдаёт обычную пару JWT — после этого все прикладные ручки работают без правок. Фронт — второй entry point в `spirits_front` (Vite multi-page), переиспользующий `apiClient`, `tokenManager` и локали.

**Tech Stack:** NestJS 10 + Postgres (бэк), React 18 + Vite 5 + Tailwind + i18next (фронт), vitest (фронт-тесты), jest (бэк-тесты), Telegram WebApp API.

**Spec:** [docs/superpowers/specs/2026-08-25-telegram-mini-app-design.md](../specs/2026-08-25-telegram-mini-app-design.md)

---

## Как гонять тесты

**Мак не тянет сборки.** Всё тяжёлое — на тест-ноде, в CI-клонах:

```bash
git push -u origin feat/tg-mini-app
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && git fetch -q origin && git checkout -q <sha>'
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm install && pnpm test && pnpm build'
```

`source ~/.nvm/nvm.sh` обязателен в каждой ssh-команде. Для бэка тот же порядок в `~/ci/spirits_back`.

Локально допустимы `pnpm lint` и точечный `pnpm exec vitest run <файл>`.

**Бэк:** `npm test` в `spirits_back` красный by design (jest скребёт `.worktrees/`, 2 теста падают на `main`). Мерить свою работу дельтой, запуская точечно: `npx jest src/tma --runInBand`.

---

## Структура файлов

**Бэк (`~/Downloads/spirits_back`):**

| Файл | Ответственность |
|---|---|
| `src/tma/init-data.ts` | Чистая функция проверки подписи `initData`. Без зависимостей от Nest и БД. |
| `src/tma/init-data.spec.ts` | Тесты подписи — сначала негативные. |
| `src/tma/tma.controller.ts` | `POST /webhook/tma/auth` |
| `src/tma/tma.module.ts` | Проводка модуля |
| `src/tma/tma-auth.spec.ts` | Интеграционные тесты входа |
| `src/identity/identity.types.ts` | +`'telegram'` в `Provider`, `TelegramData` |
| `src/identity/identity.service.ts` | +ветки в `normalize`/`extractEmail` |
| `src/identity/migrations/003_telegram_provider.sql` | CHECK-констрейнт на семь провайдеров |
| `src/auth/auth.controller.ts` | +`POST /webhook/auth/identities/link/telegram` |
| `src/app.module.ts` | +`TmaModule` |

**Фронт (`~/Downloads/spirits_front`):**

| Файл | Ответственность |
|---|---|
| `tma.html` | Entry point Mini App |
| `vite.config.ts` | Два входа в `build.rollupOptions.input` |
| `src/tma/main.tsx` | Бутстрап: тема, авторизация, роутер |
| `src/tma/telegram.ts` | Тонкая обёртка над `window.Telegram.WebApp` |
| `src/tma/telegram.test.ts` | Тесты обёртки |
| `src/tma/tmaAuth.ts` | `initData` → JWT, переавторизация |
| `src/tma/tmaAuth.test.ts` | Тесты авторизации |
| `src/tma/api.ts` | JSON-обёртка над `apiClient` (тот отдаёт `Response`) |
| `src/tma/api.test.ts` | Тесты обёртки |
| `src/tma/App.tsx` | Оболочка: нижняя навигация, роутинг между четырьмя экранами |
| `src/tma/screens/ChoiceScreen.tsx` | «Начать» / «У меня уже есть аккаунт» |
| `src/tma/screens/DayScreen.tsx` | Фокус + календарь + задачи |
| `src/tma/screens/AssistantsScreen.tsx` | Витрина ассистентов |
| `src/tma/screens/WalletScreen.tsx` | Баланс + история |
| `src/tma/screens/ProfileScreen.tsx` | Профиль и настройки |
| `src/services/apiClient.ts` | Две правки общего кода: колбэк переавторизации и редирект при 403, учитывающий entry point |
| `src/i18n/locales/*.json` | Ключи `tma.*` в семи локалях |

---

## Task 1: Проверка подписи initData

Самая опасная часть системы: сломанная проверка = вход в любой чужой аккаунт по подставленному `tg_user_id`. Тесты пишутся сначала негативные — каждый обязан упасть, если проверку закомментировать.

**Files:**
- Create: `spirits_back/src/tma/init-data.ts`
- Test: `spirits_back/src/tma/init-data.spec.ts`

- [ ] **Step 1: Написать падающие тесты**

Создать `spirits_back/src/tma/init-data.spec.ts`:

```typescript
import * as crypto from 'crypto';
import { verifyInitData } from './init-data';

const BOT_TOKEN = '123456:TEST-TOKEN-AAAA';
const OTHER_BOT_TOKEN = '999999:OTHER-TOKEN-BBBB';

/** Собирает валидно подписанную строку initData — как её отдаёт Telegram. */
function signInitData(
  fields: Record<string, string>,
  botToken = BOT_TOKEN,
): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

const nowSec = () => Math.floor(Date.now() / 1000);

const validFields = (overrides: Record<string, string> = {}) => ({
  auth_date: String(nowSec()),
  query_id: 'AAEtest',
  user: JSON.stringify({ id: 42, first_name: 'Дмитрий', username: 'dv' }),
  ...overrides,
});

describe('verifyInitData — негативные случаи', () => {
  it('отвергает подменённый hash', () => {
    const raw = signInitData(validFields());
    const tampered = raw.replace(/hash=[0-9a-f]+/, 'hash=' + 'd'.repeat(64));
    expect(verifyInitData(tampered, BOT_TOKEN)).toBeNull();
  });

  it('отвергает подменённое поле user при исходном hash', () => {
    const raw = signInitData(validFields());
    const params = new URLSearchParams(raw);
    params.set('user', JSON.stringify({ id: 999, first_name: 'Чужой' }));
    expect(verifyInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });

  it('отвергает просроченный auth_date', () => {
    const old = String(nowSec() - 25 * 60 * 60);
    const raw = signInitData(validFields({ auth_date: old }));
    expect(verifyInitData(raw, BOT_TOKEN)).toBeNull();
  });

  it('отвергает пустую строку', () => {
    expect(verifyInitData('', BOT_TOKEN)).toBeNull();
  });

  it('отвергает строку без hash', () => {
    const params = new URLSearchParams(validFields());
    expect(verifyInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });

  it('отвергает подпись другого бота', () => {
    const raw = signInitData(validFields(), OTHER_BOT_TOKEN);
    expect(verifyInitData(raw, BOT_TOKEN)).toBeNull();
  });

  it('отвергает initData без поля user', () => {
    const fields = validFields();
    delete (fields as any).user;
    const raw = signInitData(fields);
    expect(verifyInitData(raw, BOT_TOKEN)).toBeNull();
  });

  // Length-guard существует, чтобы timingSafeEqual не бросал на разной длине.
  // Без этого теста ветка не покрыта: единственная подмена hash выше берёт те
  // же 64 символа. not.toThrow() здесь и есть смысл теста — контроллеры задач
  // 3 и 4 рассчитывают на null, а не на исключение.
  it('отвергает hash неверной длины, а не падает', () => {
    const raw = signInitData(validFields());
    const short = raw.replace(/hash=[0-9a-f]+/, 'hash=abcd');
    expect(() => verifyInitData(short, BOT_TOKEN)).not.toThrow();
    expect(verifyInitData(short, BOT_TOKEN)).toBeNull();
  });

  it.each([
    ['строку',              JSON.stringify({ id: 'abc', first_name: 'X' })],
    ['дробное число',       JSON.stringify({ id: 42.5, first_name: 'X' })],
    ['отрицательное',       JSON.stringify({ id: -42, first_name: 'X' })],
    ['ноль',                JSON.stringify({ id: 0, first_name: 'X' })],
    ['небезопасное целое',  JSON.stringify({ id: 9007199254740993, first_name: 'X' })],
  ])('отвергает user с id: %s', (_label, user) => {
    expect(verifyInitData(signInitData(validFields({ user })), BOT_TOKEN)).toBeNull();
  });
});

describe('verifyInitData — валидный случай', () => {
  it('принимает свежую корректную подпись и возвращает пользователя', () => {
    const raw = signInitData(validFields());
    expect(verifyInitData(raw, BOT_TOKEN)).toEqual({
      tgUserId: 42,
      tgUsername: 'dv',
      tgFirstName: 'Дмитрий',
    });
  });

  it('отдаёт null в username, когда его нет', () => {
    const raw = signInitData(validFields({ user: JSON.stringify({ id: 7, first_name: 'A' }) }));
    expect(verifyInitData(raw, BOT_TOKEN)).toEqual({
      tgUserId: 7,
      tgUsername: null,
      tgFirstName: 'A',
    });
  });
});
```

- [ ] **Step 2: Прогнать тесты — убедиться, что падают**

```bash
cd ~/Downloads/spirits_back && npx jest src/tma/init-data.spec.ts --runInBand
```

Ожидается: FAIL, `Cannot find module './init-data'`.

- [ ] **Step 3: Реализовать проверку**

Создать `spirits_back/src/tma/init-data.ts`:

```typescript
import * as crypto from 'crypto';

export interface TgInitDataUser {
  tgUserId: number;
  tgUsername: string | null;
  tgFirstName: string | null;
}

/**
 * Окно свежести initData.
 *
 * 24 часа, а не минуты: Telegram переиспользует одну и ту же строку initData
 * в течение сессии Mini App. Короткое окно ломало бы вход при возврате в
 * свёрнутое приложение — человек видел бы «откройте через Telegram», уже
 * находясь в Telegram.
 */
const MAX_AGE_SEC = 24 * 60 * 60;

/**
 * Проверяет подпись initData и возвращает пользователя, либо null.
 *
 * Возврат null — единственный способ сообщить о неудаче: вызывающий код не
 * должен различать «подделали hash» и «протух auth_date», иначе ответ ручки
 * превращается в оракул для подбора.
 */
export function verifyInitData(raw: string, botToken: string): TgInitDataUser | null {
  if (!raw || !botToken) return null;

  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // timingSafeEqual бросает на разной длине — сравниваем длину заранее.
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) return null;
  if (Math.floor(Date.now() / 1000) - authDate > MAX_AGE_SEC) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  let user: any;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }
  // Telegram id — положительное целое. Number.isFinite пропускал бы 42.5 и
  // отрицательные, а за пределами MAX_SAFE_INTEGER два разных id склеились бы
  // в одно значение ещё на JSON.parse. Для поля, по которому потом ищут
  // аккаунт, этого достаточно, чтобы завести чужой.
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) return null;

  return {
    tgUserId: user.id,
    tgUsername: user.username ?? null,
    tgFirstName: user.first_name ?? null,
  };
}
```

- [ ] **Step 4: Прогнать тесты — убедиться, что проходят**

```bash
cd ~/Downloads/spirits_back && npx jest src/tma/init-data.spec.ts --runInBand
```

Ожидается: PASS, 15 тестов (`it.each` разворачивается в пять отдельных).

- [ ] **Step 5: Сломать проверку нарочно и убедиться, что тесты краснеют**

Временно заменить в `init-data.ts` строку сравнения на `if (false) return null;`, прогнать тесты снова.

Ожидается: FAIL ровно в 4 тестах — подменённый hash, подменённый user при
валидном hash, подпись другого бота и hash неверной длины.

Именно четыре, а не больше. «Пустая строка», «строка без hash», «без поля user»
и невалидные `id` отсекаются более ранними самостоятельными проверками и до
сравнения подписи не доходят; просроченный `auth_date` ловится отдельной
проверкой ниже. Если упало меньше четырёх — тесты не проверяют подпись.

У теста про длину падает половина: `not.toThrow()` проходит и со снятой
проверкой (строка не бросает, а просто пропускает), а `toBeNull()` ловит
пролезшую подделку. Так и задумано — эти две половины сторожат разное.

Вернуть строку обратно, прогнать ещё раз — PASS.

Зелёный прогон без этого шага ничего не доказывает: тесты проходят и при `return true`.

- [ ] **Step 6: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/tma/init-data.ts src/tma/init-data.spec.ts
git commit -m "feat(tma): проверка подписи initData"
```

---

## Task 2: Telegram как провайдер идентичности

**Files:**
- Modify: `spirits_back/src/identity/identity.types.ts`
- Modify: `spirits_back/src/identity/identity.service.ts:48-64`
- Create: `spirits_back/src/identity/migrations/003_telegram_provider.sql`
- Test: `spirits_back/src/identity/identity.telegram.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `spirits_back/src/identity/identity.telegram.spec.ts`:

```typescript
import { IdentityService } from './identity.service';

describe('IdentityService — провайдер telegram', () => {
  const svc = new IdentityService() as any;

  it('normalize отдаёт tg_user_id строкой', () => {
    expect(svc.normalize('telegram', { sub: '42' })).toBe('42');
  });

  it('extractEmail не выдумывает почту', () => {
    expect(svc.extractEmail('telegram', { sub: '42' })).toEqual({
      email: null,
      verified: false,
    });
  });

  it('normalize по-прежнему знает остальные провайдеры', () => {
    expect(svc.normalize('phone', { phone: '+7 (903) 016-91-87' })).toBe('79030169187');
    expect(svc.normalize('google', { sub: 'g-1' })).toBe('g-1');
  });
});
```

`extractEmail` без почты обязателен: он отключает слияние по подтверждённому email в `resolveOrCreate` (`identity.service.ts:88`). Telegram почты не даёт — сливать не по чему, и попытка слить привела бы к чужому аккаунту.

- [ ] **Step 2: Прогнать — убедиться, что падает**

```bash
cd ~/Downloads/spirits_back && npx jest src/identity/identity.telegram.spec.ts --runInBand
```

Ожидается: FAIL, `unknown provider: telegram`.

- [ ] **Step 3: Добавить тип провайдера**

В `spirits_back/src/identity/identity.types.ts` заменить строку типа `Provider` и добавить данные:

```typescript
export type Provider = 'phone' | 'email' | 'google' | 'yandex' | 'talerid' | 'apple' | 'telegram';
```

Добавить рядом с `AppleData`:

```typescript
// Telegram отдаёт только числовой id внутри подписанного initData —
// ни почты, ни подтверждённого адреса. Поэтому слияние по email для него
// отключено в extractEmail.
export interface TelegramData { sub: string }
```

И в `ProviderData` перед `: never`:

```typescript
  P extends 'apple'    ? AppleData :
  P extends 'telegram' ? TelegramData : never;
```

- [ ] **Step 4: Добавить ветки в сервис**

В `spirits_back/src/identity/identity.service.ts` в методе `normalize` перед `throw`:

```typescript
    if (provider === 'telegram') return String(data.sub);
```

В методе `extractEmail` ничего менять не нужно — последняя строка уже возвращает `{ email: null, verified: false }` для всех неперечисленных провайдеров.

- [ ] **Step 5: Прогнать — убедиться, что проходит**

```bash
cd ~/Downloads/spirits_back && npx jest src/identity/identity.telegram.spec.ts --runInBand
```

Ожидается: PASS, 3 теста.

- [ ] **Step 6: Написать миграцию**

Создать `spirits_back/src/identity/migrations/003_telegram_provider.sql`:

```sql
-- 003_telegram_provider.sql
--
-- Добавляет провайдера 'telegram' для входа из Mini App.
--
-- ВАЖНО: констрейнт перечисляется ЦЕЛИКОМ, все семь провайдеров.
-- 002_talerid_provider.sql перезаписал констрейнт без 'apple', хотя 001 его
-- перечислял, — вход через Apple ломался бы на вставке. Эта миграция чинит
-- заодно и его. Любая следующая миграция обязана поступать так же:
-- перечислять всех, а не дописывать одного.

ALTER TABLE user_identities DROP CONSTRAINT IF EXISTS user_identities_provider_check;
ALTER TABLE user_identities ADD CONSTRAINT user_identities_provider_check
  CHECK (provider IN ('phone','email','google','yandex','talerid','apple','telegram'));
```

- [ ] **Step 7: Подключить миграцию к загрузчику**

В `spirits_back/src/identity/identity.service.ts` метод `onModuleInit` читает ровно один файл — `001_identity_init.sql` — и выходит по `return`. Заменить тело метода так, чтобы он катал все миграции по порядку:

```typescript
  async onModuleInit() {
    if (!this.pg) return;
    const files = ['001_identity_init.sql', '002_talerid_provider.sql', '003_telegram_provider.sql'];
    for (const file of files) {
      const candidates = [
        path.join(__dirname, 'migrations', file),
        path.join(__dirname, '..', '..', 'src', 'identity', 'migrations', file),
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      if (!found) {
        this.logger.warn(`identity migration ${file} not found, skipping`);
        continue;
      }
      const sql = fs.readFileSync(found, 'utf8');
      // Retry up to 5× with 1s backoff — PG pool connections are lazy and
      // occasionally the first query races against pool warm-up on startup.
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await this.pg.query(sql);
          this.logger.log(`identity migration applied: ${file}`);
          break;
        } catch (e: any) {
          if (attempt < 5) {
            this.logger.warn(`identity migration ${file} attempt ${attempt} failed: ${e.message} — retrying in 1s`);
            await new Promise((r) => setTimeout(r, 1000));
          } else {
            this.logger.error(`identity migration ${file} failed after ${attempt} attempts: ${e.message}`);
          }
        }
      }
    }
  }
```

Порядок в массиве важен: `003` обязана идти после `002`, иначе `002` снова снесёт `apple` и `telegram`.

- [ ] **Step 8: Проверить миграцию на живой базе тест-ноды**

```bash
ssh dv@85.192.61.231 "psql -U linkeon -d linkeon -c \"SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'user_identities_provider_check';\""
```

Ожидается после рестарта API: в выводе присутствуют все семь провайдеров, включая `apple` и `telegram`.

- [ ] **Step 9: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/identity/
git commit -m "feat(identity): провайдер telegram + починка констрейнта, потерявшего apple"
```

---

## Task 3: Ручка входа POST /webhook/tma/auth

**Files:**
- Create: `spirits_back/src/tma/tma.controller.ts`
- Create: `spirits_back/src/tma/tma.module.ts`
- Modify: `spirits_back/src/app.module.ts`
- Test: `spirits_back/src/tma/tma-auth.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `spirits_back/src/tma/tma-auth.spec.ts`:

```typescript
import * as crypto from 'crypto';
import { TmaController } from './tma.controller';

const BOT_TOKEN = '123456:TEST-TOKEN-AAAA';

function signInitData(fields: Record<string, string>): string {
  const dataCheckString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const freshInitData = (tgId = 42) =>
  signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: tgId, first_name: 'Дмитрий', username: 'dv' }),
  });

function mockRes() {
  const res: any = {};
  res.set = jest.fn(() => res);
  res.status = jest.fn((code: number) => { res._status = code; return res; });
  res.json = jest.fn((body: any) => { res._body = body; return res; });
  return res;
}

describe('POST /webhook/tma/auth', () => {
  let pg: any, identity: any, jwt: any, ctrl: TmaController;

  beforeEach(() => {
    process.env.TG_BOT_TOKEN = BOT_TOKEN;
    pg = { query: jest.fn().mockResolvedValue({ rows: [] }), getClient: jest.fn() };
    identity = { resolveOrCreate: jest.fn() };
    jwt = { signAccess: jest.fn(() => 'ACC'), signRefresh: jest.fn(() => 'REF') };
    ctrl = new TmaController(pg, identity, jwt);
  });

  it('отвергает битую подпись с 401', async () => {
    const res = mockRes();
    await ctrl.auth({ initData: 'user=%7B%22id%22%3A1%7D&hash=deadbeef' }, res);
    expect(res._status).toBe(401);
    expect(identity.resolveOrCreate).not.toHaveBeenCalled();
  });

  it('незнакомому tg_user_id без intent отдаёт 404 needsChoice', async () => {
    const res = mockRes();
    await ctrl.auth({ initData: freshInitData() }, res);
    expect(res._status).toBe(404);
    expect(res._body).toEqual({ needsChoice: true });
    expect(identity.resolveOrCreate).not.toHaveBeenCalled();
  });

  it('с intent=signup заводит аккаунт и отдаёт пару токенов', async () => {
    identity.resolveOrCreate.mockResolvedValue({ userId: 'u-new', isNew: true, mergedExisting: false });
    const res = mockRes();
    await ctrl.auth({ initData: freshInitData(), intent: 'signup' }, res);
    expect(identity.resolveOrCreate).toHaveBeenCalledWith('telegram', { sub: '42' });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ 'access-token': 'ACC', 'refresh-token': 'REF' });
  });

  it('находит пользователя по user_identities и не заводит нового', async () => {
    pg.query.mockResolvedValueOnce({ rows: [{ user_id: 'u-known' }] });
    const res = mockRes();
    await ctrl.auth({ initData: freshInitData() }, res);
    expect(identity.resolveOrCreate).not.toHaveBeenCalled();
    expect(jwt.signAccess).toHaveBeenCalledWith('u-known');
    expect(res._status).toBe(200);
  });

  it('находит старожила бота по tg_user_identities и дописывает строку в user_identities', async () => {
    pg.query
      .mockResolvedValueOnce({ rows: [] })                              // user_identities — пусто
      .mockResolvedValueOnce({ rows: [{ linkeon_user_id: 'u-bot' }] })  // tg_user_identities — есть
      .mockResolvedValueOnce({ rows: [] });                             // бэкфилл INSERT
    const res = mockRes();
    await ctrl.auth({ initData: freshInitData() }, res);
    expect(res._status).toBe(200);
    expect(jwt.signAccess).toHaveBeenCalledWith('u-bot');
    const backfill = pg.query.mock.calls[2][0];
    expect(backfill).toContain('INSERT INTO user_identities');
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

```bash
cd ~/Downloads/spirits_back && npx jest src/tma/tma-auth.spec.ts --runInBand
```

Ожидается: FAIL, `Cannot find module './tma.controller'`.

- [ ] **Step 3: Реализовать контроллер**

Создать `spirits_back/src/tma/tma.controller.ts`:

```typescript
import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { PgService } from '../common/services/pg.service';
import { IdentityService } from '../identity/identity.service';
import { JwtService } from '../common/services/jwt.service';
import { verifyInitData } from './init-data';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
};

@Controller('tma')
export class TmaController {
  private readonly logger = new Logger(TmaController.name);

  constructor(
    private readonly pg: PgService,
    private readonly identity: IdentityService,
    private readonly jwt: JwtService,
  ) {}

  @Post('auth')
  async auth(
    @Body() body: { initData?: string; intent?: 'signup' },
    @Res() res: Response,
  ) {
    const verified = verifyInitData(body?.initData || '', process.env.TG_BOT_TOKEN || '');
    if (!verified) {
      return res.set(CORS).status(401).json({ error: 'invalid initData' });
    }
    const sub = String(verified.tgUserId);

    // 1) Основная система идентичностей
    const known = await this.pg.query(
      `SELECT user_id FROM user_identities WHERE provider = 'telegram' AND provider_sub = $1 LIMIT 1`,
      [sub],
    );
    if (known.rows.length) {
      return this.issue(res, known.rows[0].user_id);
    }

    // 2) Старожилы бота: связка живёт только в tg_user_identities.
    // Без этой ветки они получили бы экран регистрации и завели бы двойников.
    const fromBot = await this.pg.query(
      `SELECT linkeon_user_id FROM tg_user_identities WHERE tg_user_id = $1 LIMIT 1`,
      [verified.tgUserId],
    );
    if (fromBot.rows.length) {
      const userId = fromBot.rows[0].linkeon_user_id;
      await this.pg.query(
        `INSERT INTO user_identities (user_id, provider, provider_sub, email_verified, last_used_at)
         VALUES ($1, 'telegram', $2, false, now())
         ON CONFLICT (provider, provider_sub) DO NOTHING`,
        [userId, sub],
      );
      return this.issue(res, userId);
    }

    // 3) Незнакомый Telegram. Аккаунт заводим ТОЛЬКО по явному выбору:
    // авторегистрация на каждом открытии наплодила бы пустых аккаунтов у всех,
    // кто просто заглянул.
    if (body?.intent !== 'signup') {
      return res.set(CORS).status(404).json({ needsChoice: true });
    }

    const { userId } = await this.identity.resolveOrCreate('telegram', { sub });
    await this.pg.query(
      `INSERT INTO tg_user_identities (linkeon_user_id, tg_user_id, tg_username, tg_first_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (linkeon_user_id) DO UPDATE SET
         tg_user_id = EXCLUDED.tg_user_id,
         tg_username = EXCLUDED.tg_username,
         tg_first_name = EXCLUDED.tg_first_name`,
      [userId, verified.tgUserId, verified.tgUsername, verified.tgFirstName],
    );
    return this.issue(res, userId);
  }

  private issue(res: Response, userId: string) {
    return res.set(CORS).status(200).json({
      'access-token': this.jwt.signAccess(userId),
      'refresh-token': this.jwt.signRefresh(userId),
    });
  }
}
```

- [ ] **Step 4: Проводка модуля**

Создать `spirits_back/src/tma/tma.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TmaController } from './tma.controller';
import { CommonModule } from '../common/common.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [CommonModule, IdentityModule],
  controllers: [TmaController],
})
export class TmaModule {}
```

В `spirits_back/src/app.module.ts` добавить импорт рядом с остальными:

```typescript
import { TmaModule } from './tma/tma.module';
```

и `TmaModule,` в массив `imports`.

- [ ] **Step 5: Прогнать — убедиться, что проходит**

```bash
cd ~/Downloads/spirits_back && npx jest src/tma --runInBand
```

Ожидается: PASS, 20 тестов (15 из Task 1 + 5 новых).

- [ ] **Step 6: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/tma/ src/app.module.ts
git commit -m "feat(tma): вход по initData — та же пара JWT, что у веба"
```

---

## Task 4: Привязка Telegram к существующему аккаунту

Человек с аккаунтом по телефону: входит по SMS, затем привязывает Telegram. Слияния нет — аккаунт сохраняет баланс, историю и задачи.

**Files:**
- Modify: `spirits_back/src/auth/auth.controller.ts` (после `linkPhone`, строка 532)
- Test: `spirits_back/src/auth/link-telegram.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `spirits_back/src/auth/link-telegram.spec.ts`:

```typescript
import * as crypto from 'crypto';
import { AuthController } from './auth.controller';

const BOT_TOKEN = '123456:TEST-TOKEN-AAAA';

function freshInitData(tgId = 42): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: tgId, first_name: 'Дмитрий', username: 'dv' }),
  };
  const dataCheckString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function mockRes() {
  const res: any = {};
  res.set = jest.fn(() => res);
  res.status = jest.fn((code: number) => { res._status = code; return res; });
  res.json = jest.fn((body: any) => { res._body = body; return res; });
  return res;
}

describe('POST /webhook/auth/identities/link/telegram', () => {
  let ctrl: any, identity: any, pg: any;

  beforeEach(() => {
    process.env.TG_BOT_TOKEN = BOT_TOKEN;
    identity = { linkMethod: jest.fn().mockResolvedValue({ ok: true }) };
    pg = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    // Прочие зависимости контроллера в этом сценарии не задействованы.
    ctrl = new AuthController(
      {} as any, {} as any, identity, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any,
    );
    (ctrl as any).pg = pg;
  });

  it('без JWT отвечает 401', async () => {
    const res = mockRes();
    await ctrl.linkTelegram({ initData: freshInitData() }, { user: undefined }, res);
    expect(res._status).toBe(401);
    expect(identity.linkMethod).not.toHaveBeenCalled();
  });

  it('битую подпись отвергает с 400 и не трогает базу', async () => {
    const res = mockRes();
    await ctrl.linkTelegram({ initData: 'hash=deadbeef' }, { user: { userId: 'u-1' } }, res);
    expect(res._status).toBe(400);
    expect(identity.linkMethod).not.toHaveBeenCalled();
    expect(pg.query).not.toHaveBeenCalled();
  });

  it('привязывает Telegram к аккаунту и пишет строку в tg_user_identities', async () => {
    const res = mockRes();
    await ctrl.linkTelegram({ initData: freshInitData() }, { user: { userId: 'u-1' } }, res);
    expect(identity.linkMethod).toHaveBeenCalledWith('u-1', 'telegram', { sub: '42' });
    expect(pg.query.mock.calls[0][0]).toContain('INSERT INTO tg_user_identities');
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  it('чужой Telegram отдаёт 409 и не пишет в tg_user_identities', async () => {
    identity.linkMethod.mockResolvedValue({ ok: false, reason: 'conflict', conflictUserId: 'u-2' });
    const res = mockRes();
    await ctrl.linkTelegram({ initData: freshInitData() }, { user: { userId: 'u-1' } }, res);
    expect(res._status).toBe(409);
    expect(pg.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

```bash
cd ~/Downloads/spirits_back && npx jest src/auth/link-telegram.spec.ts --runInBand
```

Ожидается: FAIL, `ctrl.linkTelegram is not a function`.

- [ ] **Step 3: Реализовать ручку**

В `spirits_back/src/auth/auth.controller.ts` добавить импорты к существующим:

```typescript
import { PgService } from '../common/services/pg.service';
import { verifyInitData } from '../tma/init-data';
```

Добавить `PgService` в конструктор последним параметром:

```typescript
    private readonly devices: DevicesService,
    private readonly pg: PgService,
  ) {}
```

Добавить метод сразу после `linkPhone` (после строки 532):

```typescript
  /**
   * Привязка Telegram к уже авторизованному аккаунту.
   *
   * Зеркало linkPhone. Направление именно такое — привязка, а не слияние:
   * mergeAccounts переносит только строки user_identities, а токены, историю
   * и задачи оставляет на аккаунте, который помечает удалённым. Слить
   * телефонный аккаунт с балансом в свежий telegram-аккаунт означало бы
   * стереть баланс.
   */
  @UseGuards(JwtGuard)
  @Post('auth/identities/link/telegram')
  async linkTelegram(@Body() body: { initData?: string }, @Req() req: any, @Res() res: Response) {
    const userId = req.user?.userId;
    if (!userId) return res.set(CORS).status(401).json({ error: 'unauthorized' });

    const verified = verifyInitData(body?.initData || '', process.env.TG_BOT_TOKEN || '');
    if (!verified) return res.set(CORS).status(400).json({ error: 'invalid initData' });

    const r = await this.identity.linkMethod(userId, 'telegram', { sub: String(verified.tgUserId) });
    if (!r.ok) return res.set(CORS).status(409).json({ error: (r as any).reason });

    await this.pg.query(
      `INSERT INTO tg_user_identities (linkeon_user_id, tg_user_id, tg_username, tg_first_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (linkeon_user_id) DO UPDATE SET
         tg_user_id = EXCLUDED.tg_user_id,
         tg_username = EXCLUDED.tg_username,
         tg_first_name = EXCLUDED.tg_first_name`,
      [userId, verified.tgUserId, verified.tgUsername, verified.tgFirstName],
    );

    return res.set(CORS).status(200).json({ ok: true });
  }
```

- [ ] **Step 4: Прогнать — убедиться, что проходит**

```bash
cd ~/Downloads/spirits_back && npx jest src/auth/link-telegram.spec.ts --runInBand
```

Ожидается: PASS, 4 теста.

- [ ] **Step 5: Проверить, что старые тесты auth не сломались**

```bash
cd ~/Downloads/spirits_back && npx jest src/auth --runInBand
```

Ожидается: столько же падений, сколько было до задачи. Зафиксировать число до правки и сравнить — полный прогон в этом репозитории красный by design.

- [ ] **Step 6: Коммит**

```bash
cd ~/Downloads/spirits_back
git add src/auth/
git commit -m "feat(auth): привязка Telegram к аккаунту — без слияния, баланс цел"
```

---

## Task 5: Второй entry point во фронте

**Files:**
- Create: `spirits_front/tma.html`
- Create: `spirits_front/src/tma/main.tsx`
- Modify: `spirits_front/vite.config.ts`

- [ ] **Step 1: Создать точку входа**

Создать `spirits_front/tma.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />
    <title>Linkeon</title>
    <!-- Скрипт Telegram грузится синхронно: window.Telegram.WebApp должен
         существовать до первого рендера, иначе тема применится с миганием. -->
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/tma/main.tsx"></script>
  </body>
</html>
```

Метрики, Open Graph и PWA-манифест сюда сознательно не переносятся: Mini App не индексируется и не устанавливается на домашний экран.

- [ ] **Step 2: Создать заглушку главного модуля**

Создать `spirits_front/src/tma/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="p-4">tma boot</div>
  </StrictMode>,
);
```

- [ ] **Step 3: Прописать два входа в Vite**

Заменить `spirits_front/vite.config.ts` целиком:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      // Два независимых входа: веб-SPA и Telegram Mini App. Общий код
      // (apiClient, tokenManager, локали) Rollup вынесет в общий чанк сам —
      // тяжёлый роутер и компоненты веба в tma-бандл не попадут.
      input: {
        main: resolve(__dirname, 'index.html'),
        tma: resolve(__dirname, 'tma.html'),
      },
    },
  },
});
```

- [ ] **Step 4: Собрать на тест-ноде и проверить, что бандлов два**

```bash
cd ~/Downloads/spirits_front && git push -u origin feat/tg-mini-app
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && git fetch -q origin && git checkout -q origin/feat/tg-mini-app'
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm install && pnpm build && ls dist/ && grep -o "assets/[a-zA-Z0-9._-]*\.js" dist/tma.html'
```

Ожидается: в `dist/` есть и `index.html`, и `tma.html`; `grep` печатает путь к js-бандлу, и он **не** совпадает с бандлом из `dist/index.html`.

- [ ] **Step 5: Коммит**

```bash
cd ~/Downloads/spirits_front
git add tma.html src/tma/main.tsx vite.config.ts
git commit -m "feat(tma): второй entry point — отдельный бандл для Telegram"
```

---

## Task 6: Обёртка над Telegram WebApp

**Files:**
- Create: `spirits_front/src/tma/telegram.ts`
- Test: `spirits_front/src/tma/telegram.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `spirits_front/src/tma/telegram.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getInitData, isInsideTelegram, applyTelegramTheme, closeApp } from './telegram';

function mockWebApp(overrides: Record<string, unknown> = {}) {
  const webApp = {
    initData: 'auth_date=1&hash=abc',
    themeParams: { bg_color: '#112233', text_color: '#ffffff' },
    colorScheme: 'dark',
    ready: vi.fn(),
    expand: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
  (globalThis as any).window.Telegram = { WebApp: webApp };
  return webApp;
}

describe('telegram wrapper', () => {
  beforeEach(() => {
    delete (globalThis as any).window.Telegram;
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
  });

  it('isInsideTelegram false без объекта Telegram', () => {
    expect(isInsideTelegram()).toBe(false);
  });

  it('isInsideTelegram false при пустом initData — так выглядит открытие в браузере', () => {
    mockWebApp({ initData: '' });
    expect(isInsideTelegram()).toBe(false);
  });

  it('isInsideTelegram true при непустом initData', () => {
    mockWebApp();
    expect(isInsideTelegram()).toBe(true);
  });

  it('getInitData отдаёт пустую строку вне Telegram', () => {
    expect(getInitData()).toBe('');
  });

  it('applyTelegramTheme кладёт цвета в CSS-переменные и ставит data-theme', () => {
    mockWebApp();
    applyTelegramTheme();
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--tg-bg-color')).toBe('#112233');
    expect(root.style.getPropertyValue('--tg-text-color')).toBe('#ffffff');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('closeApp зовёт WebApp.close', () => {
    const webApp = mockWebApp();
    closeApp();
    expect(webApp.close).toHaveBeenCalled();
  });

  it('closeApp не падает вне Telegram', () => {
    expect(() => closeApp()).not.toThrow();
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

```bash
cd ~/Downloads/spirits_front && pnpm exec vitest run src/tma/telegram.test.ts
```

Ожидается: FAIL, `Failed to resolve import './telegram'`.

- [ ] **Step 3: Реализовать обёртку**

Создать `spirits_front/src/tma/telegram.ts`:

```typescript
/**
 * Тонкая обёртка над window.Telegram.WebApp.
 *
 * Существует ради одного: весь остальной код Mini App не должен трогать
 * глобальный объект напрямую. Вне Telegram (дев-сервер, случайный заход
 * браузером) каждая функция обязана деградировать молча, а не падать —
 * иначе разработка превращается в отладку белого экрана.
 */

interface TelegramWebApp {
  initData: string;
  themeParams: Record<string, string>;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  close(): void;
}

function webApp(): TelegramWebApp | null {
  return (window as any)?.Telegram?.WebApp ?? null;
}

export function getInitData(): string {
  return webApp()?.initData ?? '';
}

/**
 * Пустой initData означает открытие вне Telegram: сам объект WebApp
 * существует и в обычном браузере, если подключён их скрипт.
 */
export function isInsideTelegram(): boolean {
  return getInitData().length > 0;
}

export function applyTelegramTheme(): void {
  const app = webApp();
  if (!app) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(app.themeParams || {})) {
    root.style.setProperty(`--tg-${key.replace(/_/g, '-')}`, value);
  }
  root.setAttribute('data-theme', app.colorScheme || 'light');
}

export function readyAndExpand(): void {
  const app = webApp();
  if (!app) return;
  app.ready();
  app.expand();
}

export function closeApp(): void {
  webApp()?.close();
}
```

- [ ] **Step 4: Прогнать — убедиться, что проходит**

```bash
cd ~/Downloads/spirits_front && pnpm exec vitest run src/tma/telegram.test.ts
```

Ожидается: PASS, 7 тестов.

- [ ] **Step 5: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/tma/telegram.ts src/tma/telegram.test.ts
git commit -m "feat(tma): обёртка над Telegram WebApp"
```

---

## Task 7: Авторизация и переавторизация во фронте

**Files:**
- Create: `spirits_front/src/tma/tmaAuth.ts`
- Test: `spirits_front/src/tma/tmaAuth.test.ts`
- Modify: `spirits_front/src/services/apiClient.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `spirits_front/src/tma/tmaAuth.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tmaLogin, tmaLinkExisting } from './tmaAuth';
import { tokenManager } from '../utils/tokenManager';

beforeEach(() => {
  tokenManager.clearTokens();
  (globalThis as any).window.Telegram = { WebApp: { initData: 'auth_date=1&hash=abc' } };
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('tmaLogin', () => {
  it('сохраняет пару токенов при успехе', async () => {
    globalThis.fetch = mockFetch(200, { 'access-token': 'ACC', 'refresh-token': 'REF' }) as any;
    const r = await tmaLogin();
    expect(r).toEqual({ status: 'authenticated' });
    expect(tokenManager.getAccessToken()).toBe('ACC');
    expect(tokenManager.getRefreshToken()).toBe('REF');
  });

  it('на 404 возвращает needsChoice и токены не трогает', async () => {
    globalThis.fetch = mockFetch(404, { needsChoice: true }) as any;
    const r = await tmaLogin();
    expect(r).toEqual({ status: 'needsChoice' });
    expect(tokenManager.hasTokens()).toBe(false);
  });

  it('на 401 возвращает notInTelegram', async () => {
    globalThis.fetch = mockFetch(401, { error: 'invalid initData' }) as any;
    expect(await tmaLogin()).toEqual({ status: 'notInTelegram' });
  });

  it('с intent=signup передаёт его в теле запроса', async () => {
    const f = mockFetch(200, { 'access-token': 'A', 'refresh-token': 'R' });
    globalThis.fetch = f as any;
    await tmaLogin({ intent: 'signup' });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.intent).toBe('signup');
    expect(body.initData).toBe('auth_date=1&hash=abc');
  });

  it('без initData не ходит в сеть', async () => {
    (globalThis as any).window.Telegram = { WebApp: { initData: '' } };
    const f = mockFetch(200, {});
    globalThis.fetch = f as any;
    expect(await tmaLogin()).toEqual({ status: 'notInTelegram' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('tmaLinkExisting', () => {
  it('на 200 возвращает ok', async () => {
    globalThis.fetch = mockFetch(200, { ok: true }) as any;
    expect(await tmaLinkExisting()).toEqual({ status: 'ok' });
  });

  it('на 409 возвращает conflict', async () => {
    globalThis.fetch = mockFetch(409, { error: 'conflict' }) as any;
    expect(await tmaLinkExisting()).toEqual({ status: 'conflict' });
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

```bash
cd ~/Downloads/spirits_front && pnpm exec vitest run src/tma/tmaAuth.test.ts
```

Ожидается: FAIL, `Failed to resolve import './tmaAuth'`.

- [ ] **Step 3: Реализовать авторизацию**

Создать `spirits_front/src/tma/tmaAuth.ts`:

```typescript
import { tokenManager } from '../utils/tokenManager';
import { getInitData } from './telegram';

const BASE = import.meta.env.VITE_BACKEND_URL || '';

export type TmaLoginResult =
  | { status: 'authenticated' }
  | { status: 'needsChoice' }
  | { status: 'notInTelegram' };

/**
 * Вход по подписанному initData.
 *
 * Без intent ручка на незнакомый Telegram отвечает 404 needsChoice — аккаунт
 * заводится только после явного выбора человека, иначе каждый заглянувший
 * получал бы пустой аккаунт.
 */
export async function tmaLogin(opts: { intent?: 'signup' } = {}): Promise<TmaLoginResult> {
  const initData = getInitData();
  if (!initData) return { status: 'notInTelegram' };

  const res = await fetch(`${BASE}/webhook/tma/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, intent: opts.intent }),
  });

  if (res.status === 404) return { status: 'needsChoice' };
  if (!res.ok) return { status: 'notInTelegram' };

  const data = await res.json();
  const access = data['access-token'];
  const refresh = data['refresh-token'];
  if (!access || !refresh) return { status: 'notInTelegram' };

  tokenManager.saveTokens(access, refresh);
  return { status: 'authenticated' };
}

export type TmaLinkResult = { status: 'ok' } | { status: 'conflict' } | { status: 'failed' };

/**
 * Привязывает Telegram к аккаунту, в который уже вошли по SMS.
 * Требует действующего access-токена: ручка под JwtGuard.
 */
export async function tmaLinkExisting(): Promise<TmaLinkResult> {
  const initData = getInitData();
  if (!initData) return { status: 'failed' };

  const res = await fetch(`${BASE}/webhook/auth/identities/link/telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenManager.getAccessToken() ?? ''}`,
    },
    body: JSON.stringify({ initData }),
  });

  if (res.status === 409) return { status: 'conflict' };
  return res.ok ? { status: 'ok' } : { status: 'failed' };
}
```

- [ ] **Step 4: Прогнать — убедиться, что проходит**

```bash
cd ~/Downloads/spirits_front && pnpm exec vitest run src/tma/tmaAuth.test.ts
```

Ожидается: PASS, 7 тестов.

- [ ] **Step 5: Добавить колбэк переавторизации в apiClient**

В `spirits_front/src/services/apiClient.ts` добавить поле в класс рядом с `pendingRequests`:

```typescript
  private reauthHandler: (() => Promise<boolean>) | null = null;
```

Добавить метод в класс:

```typescript
  /**
   * Запасной способ восстановить сессию, когда refresh-токен не сработал.
   *
   * Нужен Mini App: там initData доступен всегда, поэтому протухшая сессия
   * лечится молча, без экрана входа. Веб этот колбэк не ставит и ведёт себя
   * по-прежнему — выкидывает на онбординг.
   */
  setReauthHandler(handler: (() => Promise<boolean>) | null): void {
    this.reauthHandler = handler;
  }
```

В методе `handleTokenRefresh` найти ветку, где `refreshToken` отсутствует или обновление не удалось, и перед возвратом `false` вставить попытку переавторизации:

```typescript
      if (this.reauthHandler) {
        const restored = await this.reauthHandler();
        if (restored) {
          this.resolvePendingRequests();
          return true;
        }
      }
```

- [ ] **Step 6: Починить жёсткий редирект на веб**

В `spirits_front/src/services/apiClient.ts:112` при 403 без Bearer выполняется
`window.location.href = '/'`. Из Mini App это выбрасывает человека из `/tma/`
в обычный веб-SPA прямо внутри Telegram — белый экран с онбордингом по SMS.

Заменить строку на возврат к точке входа, из которой пришли:

```typescript
              // Возвращаемся в СВОЙ entry point. Жёсткий '/' выбрасывал
              // Mini App в веб-SPA прямо внутри Telegram.
              window.location.href = window.location.pathname.startsWith('/tma') ? '/tma/' : '/';
```

- [ ] **Step 7: Написать падающий тест хелпера запросов**

Экраны работают с JSON, а `apiClient.get()`/`post()` возвращают `Response`, а не
разобранное тело. Чтобы четыре экрана не повторяли `await res.json()` с разной
обработкой ошибок, заводим один тонкий хелпер.

Создать `spirits_front/src/tma/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getJson, postJson, putForm } from './api';
import { apiClient } from '../services/apiClient';

function resp(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => vi.restoreAllMocks());

describe('getJson', () => {
  it('разбирает тело успешного ответа', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(resp(200, { tokens: 42 }));
    expect(await getJson('/webhook/user/tokens/')).toEqual({ tokens: 42 });
  });

  it('бросает на неуспешном статусе', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(resp(500, {}));
    await expect(getJson('/x')).rejects.toThrow('HTTP 500');
  });

  it('бросает, если тело не JSON', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new Error('bad json'); },
    } as any);
    await expect(getJson('/x')).rejects.toThrow();
  });
});

describe('postJson', () => {
  it('передаёт тело и разбирает ответ', async () => {
    const spy = vi.spyOn(apiClient, 'post').mockResolvedValue(resp(200, { ok: true }));
    expect(await postJson('/webhook/change-agent', { agent_id: 'a' })).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('/webhook/change-agent', { agent_id: 'a' });
  });
});

describe('putForm', () => {
  it('шлёт FormData через request, а не через put', async () => {
    // apiClient.put жёстко ставит Content-Type: application/json и делает
    // JSON.stringify — FormData через него не проходит.
    const spy = vi.spyOn(apiClient, 'request').mockResolvedValue(resp(200, { ok: true }));
    const fd = new FormData();
    await putForm('/webhook/avatar', fd);
    expect(spy).toHaveBeenCalledWith('/webhook/avatar', { method: 'PUT', body: fd });
  });
});
```

- [ ] **Step 8: Прогнать — убедиться, что падает**

```bash
cd ~/Downloads/spirits_front && pnpm exec vitest run src/tma/api.test.ts
```

Ожидается: FAIL, `Failed to resolve import './api'`.

- [ ] **Step 9: Реализовать хелпер**

Создать `spirits_front/src/tma/api.ts`:

```typescript
import { apiClient } from '../services/apiClient';

/**
 * Тонкий слой над apiClient: экраны Mini App работают с JSON, а apiClient
 * отдаёт Response. Без этого хелпера каждый экран повторял бы разбор тела и
 * проверку статуса по-своему — и расходился бы в обработке ошибок.
 *
 * Неуспешный статус — исключение: экраны ловят его и показывают своё
 * состояние ошибки, а не молча рисуют пустоту.
 */
async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getJson<T = any>(url: string): Promise<T> {
  return parse<T>(await apiClient.get(url));
}

export async function postJson<T = any>(url: string, data?: unknown): Promise<T> {
  return parse<T>(await apiClient.post(url, data));
}

/** apiClient.put не умеет FormData — он всегда делает JSON.stringify. */
export async function putForm<T = any>(url: string, body: FormData): Promise<T> {
  return parse<T>(await apiClient.request(url, { method: 'PUT', body }));
}
```

- [ ] **Step 10: Прогнать — убедиться, что проходит**

```bash
cd ~/Downloads/spirits_front && pnpm exec vitest run src/tma/api.test.ts
```

Ожидается: PASS, 5 тестов.

- [ ] **Step 11: Прогнать весь фронтовый набор тестов**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && git fetch -q origin && git checkout -q origin/feat/tg-mini-app && pnpm install && pnpm test'
```

Ожидается: PASS. Правки `apiClient` не должны ломать существующие тесты — колбэк по умолчанию `null`, а редирект для не-`/tma` путей остался прежним.

- [ ] **Step 12: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/tma/tmaAuth.ts src/tma/tmaAuth.test.ts src/tma/api.ts src/tma/api.test.ts src/services/apiClient.ts
git commit -m "feat(tma): вход по initData, переавторизация и JSON-хелпер"
```

---

## Task 8: Экран выбора при первом входе

**Files:**
- Create: `spirits_front/src/tma/screens/ChoiceScreen.tsx`
- Modify: `spirits_front/src/i18n/locales/ru.json`, `en.json`

- [ ] **Step 1: Добавить ключи в ru.json**

В `spirits_front/src/i18n/locales/ru.json` добавить блок верхнего уровня:

```json
  "tma": {
    "choice": {
      "title": "Добро пожаловать в Linkeon",
      "subtitle": "Ассистенты, которые помнят ваш контекст и работают вместе с вами.",
      "start": "Начать",
      "haveAccount": "У меня уже есть аккаунт",
      "phoneLabel": "Номер телефона",
      "codeLabel": "Код из SMS",
      "sendCode": "Получить код",
      "confirm": "Подтвердить",
      "back": "Назад",
      "conflict": "Этот Telegram уже привязан к другому аккаунту Linkeon.",
      "failed": "Не получилось. Попробуйте ещё раз."
    },
    "outside": {
      "title": "Откройте приложение через Telegram",
      "body": "Эта страница работает только внутри Telegram."
    }
  },
```

- [ ] **Step 2: Продублировать ключи в en.json**

```json
  "tma": {
    "choice": {
      "title": "Welcome to Linkeon",
      "subtitle": "Assistants that remember your context and work alongside you.",
      "start": "Get started",
      "haveAccount": "I already have an account",
      "phoneLabel": "Phone number",
      "codeLabel": "SMS code",
      "sendCode": "Send code",
      "confirm": "Confirm",
      "back": "Back",
      "conflict": "This Telegram is already linked to another Linkeon account.",
      "failed": "That didn't work. Please try again."
    },
    "outside": {
      "title": "Open this app from Telegram",
      "body": "This page only works inside Telegram."
    }
  },
```

- [ ] **Step 3: Написать экран**

Создать `spirits_front/src/tma/screens/ChoiceScreen.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tmaLogin, tmaLinkExisting } from '../tmaAuth';
import { authService } from '../../services/authService';
import { tokenManager } from '../../utils/tokenManager';

interface Props {
  onAuthenticated: () => void;
}

type Stage = 'choice' | 'phone' | 'code';

export function ChoiceScreen({ onAuthenticated }: Props) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>('choice');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    const r = await tmaLogin({ intent: 'signup' });
    setBusy(false);
    if (r.status === 'authenticated') onAuthenticated();
    else setError(t('tma.choice.failed'));
  };

  const handleSendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await authService.sendSMS(phone);
      setStage('code');
    } catch {
      setError(t('tma.choice.failed'));
    }
    setBusy(false);
  };

  // Порядок важен: сначала вход в существующий аккаунт по SMS, только потом
  // привязка Telegram к нему. Обратный порядок (завести telegram-аккаунт и
  // слить) уничтожил бы баланс — mergeAccounts переносит лишь идентичности.
  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const auth = await authService.verifyCode(phone, code);
      tokenManager.saveTokens(auth['access-token'], auth['refresh-token']);
      const linked = await tmaLinkExisting();
      if (linked.status === 'ok') {
        onAuthenticated();
      } else {
        tokenManager.clearTokens();
        setError(t(linked.status === 'conflict' ? 'tma.choice.conflict' : 'tma.choice.failed'));
      }
    } catch {
      setError(t('tma.choice.failed'));
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('tma.choice.title')}</h1>
        <p className="mt-2 opacity-70">{t('tma.choice.subtitle')}</p>
      </div>

      {error && <p className="text-red-500">{error}</p>}

      {stage === 'choice' && (
        <div className="flex flex-col gap-3">
          <button
            className="rounded-xl bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
            onClick={handleStart}
            disabled={busy}
          >
            {t('tma.choice.start')}
          </button>
          <button
            className="rounded-xl border px-4 py-3 font-medium disabled:opacity-50"
            onClick={() => setStage('phone')}
            disabled={busy}
          >
            {t('tma.choice.haveAccount')}
          </button>
        </div>
      )}

      {stage === 'phone' && (
        <div className="flex flex-col gap-3">
          <label className="text-sm opacity-70">{t('tma.choice.phoneLabel')}</label>
          <input
            className="rounded-xl border px-4 py-3"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            className="rounded-xl bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
            onClick={handleSendCode}
            disabled={busy || phone.length < 10}
          >
            {t('tma.choice.sendCode')}
          </button>
          <button className="px-4 py-2 opacity-70" onClick={() => setStage('choice')}>
            {t('tma.choice.back')}
          </button>
        </div>
      )}

      {stage === 'code' && (
        <div className="flex flex-col gap-3">
          <label className="text-sm opacity-70">{t('tma.choice.codeLabel')}</label>
          <input
            className="rounded-xl border px-4 py-3 tracking-[0.5em]"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            className="rounded-xl bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
            onClick={handleConfirm}
            disabled={busy || code.length < 4}
          >
            {t('tma.choice.confirm')}
          </button>
          <button className="px-4 py-2 opacity-70" onClick={() => setStage('phone')}>
            {t('tma.choice.back')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Сверить имена методов authService**

```bash
cd ~/Downloads/spirits_front && grep -n "async \|export" src/services/authService.ts | head -20
```

Если методы называются иначе, чем `sendSMS`/`verifyCode`, — поправить вызовы в `ChoiceScreen.tsx` под фактические имена, а не наоборот.

- [ ] **Step 5: Проверить типы**

```bash
cd ~/Downloads/spirits_front && pnpm typecheck
```

Ожидается: без ошибок.

- [ ] **Step 6: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/tma/screens/ChoiceScreen.tsx src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "feat(tma): экран выбора — начать заново или привязать аккаунт"
```

---

## Task 9: Оболочка приложения и навигация

**Files:**
- Create: `spirits_front/src/tma/App.tsx`
- Modify: `spirits_front/src/tma/main.tsx`
- Modify: `spirits_front/src/i18n/locales/ru.json`, `en.json`

- [ ] **Step 1: Добавить ключи навигации в ru.json (внутрь блока `tma`)**

```json
    "nav": {
      "day": "День",
      "assistants": "Ассистенты",
      "wallet": "Кошелёк",
      "profile": "Профиль"
    },
```

- [ ] **Step 2: То же в en.json**

```json
    "nav": {
      "day": "Today",
      "assistants": "Assistants",
      "wallet": "Wallet",
      "profile": "Profile"
    },
```

- [ ] **Step 3: Написать оболочку**

Создать `spirits_front/src/tma/App.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Users, Wallet, User } from 'lucide-react';
import { DayScreen } from './screens/DayScreen';
import { AssistantsScreen } from './screens/AssistantsScreen';
import { WalletScreen } from './screens/WalletScreen';
import { ProfileScreen } from './screens/ProfileScreen';

type Tab = 'day' | 'assistants' | 'wallet' | 'profile';

const TABS: Array<{ id: Tab; icon: typeof CalendarDays }> = [
  { id: 'day', icon: CalendarDays },
  { id: 'assistants', icon: Users },
  { id: 'wallet', icon: Wallet },
  { id: 'profile', icon: User },
];

export function App() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('day');

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-y-auto pb-20">
        {tab === 'day' && <DayScreen />}
        {tab === 'assistants' && <AssistantsScreen />}
        {tab === 'wallet' && <WalletScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex border-t bg-[var(--tg-bg-color,#fff)] pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
              tab === id ? 'text-green-600' : 'opacity-60'
            }`}
            onClick={() => setTab(id)}
          >
            <Icon size={20} />
            {t(`tma.nav.${id}`)}
          </button>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Собрать бутстрап**

Заменить `spirits_front/src/tma/main.tsx` целиком:

```tsx
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import '../index.css';
import '../i18n';
import { App } from './App';
import { ChoiceScreen } from './screens/ChoiceScreen';
import { tmaLogin } from './tmaAuth';
import { applyTelegramTheme, readyAndExpand, isInsideTelegram } from './telegram';
import { apiClient } from '../services/apiClient';

type State = 'loading' | 'authenticated' | 'needsChoice' | 'outside';

function Root() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    applyTelegramTheme();
    readyAndExpand();

    if (!isInsideTelegram()) {
      setState('outside');
      return;
    }

    // Протухший refresh в Mini App лечится молча: initData доступен всегда,
    // поэтому экран входа после первого раза не показывается никогда.
    apiClient.setReauthHandler(async () => {
      const r = await tmaLogin();
      return r.status === 'authenticated';
    });

    tmaLogin().then((r) => {
      if (r.status === 'authenticated') setState('authenticated');
      else if (r.status === 'needsChoice') setState('needsChoice');
      else setState('outside');
    });
  }, []);

  if (state === 'loading') return <div className="p-6 opacity-60">…</div>;
  if (state === 'needsChoice') return <ChoiceScreen onAuthenticated={() => setState('authenticated')} />;
  if (state === 'outside') {
    return (
      <div className="flex min-h-screen flex-col justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">{t('tma.outside.title')}</h1>
        <p className="opacity-70">{t('tma.outside.body')}</p>
      </div>
    );
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
```

- [ ] **Step 5: Проверить имя экспорта apiClient**

```bash
cd ~/Downloads/spirits_front && grep -n "^export" src/services/apiClient.ts
```

Если экспорт по умолчанию, а не именованный `apiClient`, — поправить импорт в `main.tsx`.

- [ ] **Step 6: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/tma/App.tsx src/tma/main.tsx src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "feat(tma): оболочка с нижней навигацией и бутстрап авторизации"
```

Экраны на этом шаге ещё не существуют — сборка будет красной до Task 10–13. Это ожидаемо: коммит фиксирует оболочку, следующая задача её закрывает.

---

## Task 10: Экран «Ассистенты»

**Files:**
- Create: `spirits_front/src/tma/screens/AssistantsScreen.tsx`
- Modify: `spirits_front/src/i18n/locales/ru.json`, `en.json`

- [ ] **Step 1: Ключи в ru.json (внутрь блока `tma`)**

```json
    "assistants": {
      "title": "Ассистенты",
      "hint": "Выберите — и продолжайте разговор в чате бота.",
      "current": "Текущий",
      "empty": "Список пуст.",
      "failed": "Не удалось загрузить."
    },
```

- [ ] **Step 2: Ключи в en.json**

```json
    "assistants": {
      "title": "Assistants",
      "hint": "Pick one and continue the conversation in the bot chat.",
      "current": "Current",
      "empty": "Nothing here yet.",
      "failed": "Failed to load."
    },
```

- [ ] **Step 3: Написать экран**

Создать `spirits_front/src/tma/screens/AssistantsScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson, postJson } from '../api';
import { closeApp } from '../telegram';

interface Agent {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  is_current?: boolean;
}

export function AssistantsScreen() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getJson('/webhook/agents')
      .then((r: any) => setAgents(Array.isArray(r) ? r : r?.agents ?? []))
      .catch(() => setFailed(true));
  }, []);

  // Смена ассистента и выход: разговор живёт в боте, держать человека
  // в Mini App после выбора незачем.
  const choose = async (id: string) => {
    await postJson('/webhook/change-agent', { agent_id: id });
    closeApp();
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{t('tma.assistants.title')}</h1>
      <p className="mt-1 text-sm opacity-70">{t('tma.assistants.hint')}</p>

      {failed && <p className="mt-4 text-red-500">{t('tma.assistants.failed')}</p>}
      {!failed && agents === null && <p className="mt-4 opacity-60">…</p>}
      {agents?.length === 0 && <p className="mt-4 opacity-60">{t('tma.assistants.empty')}</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {agents?.map((a) => (
          <li key={a.id}>
            <button
              className="flex w-full items-center gap-3 rounded-xl border p-3 text-left"
              onClick={() => choose(a.id)}
            >
              {a.avatar_url && (
                <img src={a.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
              )}
              <span className="flex-1">
                <span className="font-medium">{a.name}</span>
                {a.description && <span className="block text-sm opacity-70">{a.description}</span>}
              </span>
              {a.is_current && (
                <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs text-white">
                  {t('tma.assistants.current')}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Сверить форму ответа /webhook/agents**

```bash
cd ~/Downloads/spirits_back && sed -n '21,40p' src/agents/agents.controller.ts
```

Привести интерфейс `Agent` и поле `agent_id` в `change-agent` к фактическим именам полей. Не подгонять бэк под фронт.

- [ ] **Step 5: Типы**

```bash
cd ~/Downloads/spirits_front && pnpm typecheck
```

- [ ] **Step 6: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/tma/screens/AssistantsScreen.tsx src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "feat(tma): экран выбора ассистента"
```

---

## Task 11: Экран «Кошелёк»

Покупки в v1 нет. Ни кнопки, ни ссылки наружу, ни цен — внутри Telegram цифровые товары продаются только за Stars, а внешний чекаут это риск блокировки Mini App.

**Files:**
- Create: `spirits_front/src/tma/screens/WalletScreen.tsx`
- Modify: `spirits_front/src/i18n/locales/ru.json`, `en.json`

- [ ] **Step 1: Ключи в ru.json (внутрь блока `tma`)**

```json
    "wallet": {
      "title": "Кошелёк",
      "balance": "Баланс",
      "tokens_one": "{{count}} токен",
      "tokens_few": "{{count}} токена",
      "tokens_many": "{{count}} токенов",
      "tokens_other": "{{count}} токена",
      "history": "Куда ушло",
      "empty": "Пока ничего не списывалось.",
      "failed": "Не удалось загрузить."
    },
```

- [ ] **Step 2: Ключи в en.json**

Категории множественного числа у английского другие — `_few`/`_many` из русского не переносятся:

```json
    "wallet": {
      "title": "Wallet",
      "balance": "Balance",
      "tokens_one": "{{count}} token",
      "tokens_other": "{{count}} tokens",
      "history": "Where it went",
      "empty": "Nothing spent yet.",
      "failed": "Failed to load."
    },
```

- [ ] **Step 3: Написать экран**

Создать `spirits_front/src/tma/screens/WalletScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson } from '../api';

interface HistoryRow {
  id?: string;
  created_at?: string;
  amount?: number;
  agent_name?: string;
  reason?: string;
}

export function WalletScreen() {
  const { t, i18n } = useTranslation();
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Опрос по открытию и возврату фокуса, без таймера: сессии Mini App
  // короткие, а фон Telegram замораживает вкладку — пятисекундный поллинг
  // из веба здесь только жёг бы батарею.
  useEffect(() => {
    const load = () => {
      getJson('/webhook/user/tokens/')
        .then((r: any) => setBalance(Number(r?.tokens ?? r?.balance ?? 0)))
        .catch(() => setFailed(true));
      getJson('/webhook/tokens/history')
        .then((r: any) => setHistory(Array.isArray(r) ? r : r?.items ?? []))
        .catch(() => setFailed(true));
    };
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{t('tma.wallet.title')}</h1>

      <div className="mt-4 rounded-2xl border p-4">
        <div className="text-sm opacity-70">{t('tma.wallet.balance')}</div>
        <div className="mt-1 text-3xl font-semibold">
          {balance === null ? '…' : t('tma.wallet.tokens', { count: balance })}
        </div>
      </div>

      <h2 className="mt-6 font-medium">{t('tma.wallet.history')}</h2>
      {failed && <p className="mt-2 text-red-500">{t('tma.wallet.failed')}</p>}
      {history?.length === 0 && <p className="mt-2 opacity-60">{t('tma.wallet.empty')}</p>}

      <ul className="mt-2 flex flex-col gap-2">
        {history?.map((row, i) => (
          <li key={row.id ?? i} className="flex items-baseline justify-between rounded-xl border p-3">
            <span>
              <span className="font-medium">{row.agent_name ?? row.reason ?? '—'}</span>
              {row.created_at && (
                <span className="block text-xs opacity-60">
                  {new Date(row.created_at).toLocaleString(i18n.language)}
                </span>
              )}
            </span>
            <span className="tabular-nums">{row.amount ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Сверить форму ответов**

```bash
cd ~/Downloads/spirits_back && sed -n '1,30p' src/tokens/tokens.controller.ts && sed -n '18,40p' src/payments/history.controller.ts
```

Привести поля `tokens`/`amount`/`created_at` к фактическим.

- [ ] **Step 5: Проверить, что нет упоминаний покупки**

```bash
cd ~/Downloads/spirits_front && grep -rniE "купить|buy|цена|price|₽|stars|тариф|пакет" src/tma/
```

Ожидается: пусто. Любое совпадение — нарушение требования спеки.

- [ ] **Step 6: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/tma/screens/WalletScreen.tsx src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "feat(tma): кошелёк — баланс и история без витрины покупки"
```

---

## Task 12: Экран «Профиль»

**Files:**
- Create: `spirits_front/src/tma/screens/ProfileScreen.tsx`
- Modify: `spirits_front/src/i18n/locales/ru.json`, `en.json`

- [ ] **Step 1: Ключи в ru.json (внутрь блока `tma`)**

```json
    "profile": {
      "title": "Профиль",
      "name": "Имя",
      "birthday": "Дата рождения",
      "language": "Язык",
      "avatar": "Фото",
      "avatarChange": "Изменить фото",
      "save": "Сохранить",
      "saved": "Сохранено",
      "failed": "Не удалось сохранить."
    },
```

- [ ] **Step 2: Ключи в en.json**

```json
    "profile": {
      "title": "Profile",
      "name": "Name",
      "birthday": "Date of birth",
      "language": "Language",
      "avatar": "Photo",
      "avatarChange": "Change photo",
      "save": "Save",
      "saved": "Saved",
      "failed": "Couldn't save."
    },
```

- [ ] **Step 3: Написать экран**

Создать `spirits_front/src/tma/screens/ProfileScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson, postJson, putForm } from '../api';
import { SUPPORTED_LANGUAGES } from '../../i18n/languages';

export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [language, setLanguage] = useState(i18n.language);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  useEffect(() => {
    getJson('/webhook/profile').then((r: any) => {
      const data = r?.profile_data ?? r ?? {};
      setName(data.name ?? '');
      setBirthday(data.birthday ?? '');
      if (data.language) setLanguage(data.language);
    }).catch(() => {});

    getJson('/webhook/avatar')
      .then((r: any) => setAvatar(r?.avatar_url ?? r?.url ?? null))
      .catch(() => setAvatar(null));
  }, []);

  const uploadAvatar = async (file: File) => {
    setStatus('saving');
    try {
      const body = new FormData();
      body.append('file', file);
      await putForm('/webhook/avatar', body);
      const r: any = await getJson('/webhook/avatar');
      setAvatar(r?.avatar_url ?? r?.url ?? null);
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  };

  // Язык пишется в profile_data.language — то же поле читают ассистенты,
  // поэтому смена языка здесь меняет и язык ответов в чате бота.
  const save = async () => {
    setStatus('saving');
    try {
      await postJson('/webhook/profile-update', { name, birthday, language });
      await i18n.changeLanguage(language);
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{t('tma.profile.title')}</h1>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {avatar ? (
            <img src={avatar} alt={t('tma.profile.avatar')} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-full border" />
          )}
          <label className="cursor-pointer text-green-600">
            {t('tma.profile.avatarChange')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAvatar(file);
              }}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">{t('tma.profile.name')}</span>
          <input className="rounded-xl border px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">{t('tma.profile.birthday')}</span>
          <input type="date" className="rounded-xl border px-4 py-3" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">{t('tma.profile.language')}</span>
          <select className="rounded-xl border px-4 py-3" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {SUPPORTED_LANGUAGES.map((l: any) => (
              <option key={l.code} value={l.code}>{l.nativeName ?? l.code}</option>
            ))}
          </select>
        </label>

        <button
          className="rounded-xl bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
          onClick={save}
          disabled={status === 'saving'}
        >
          {t('tma.profile.save')}
        </button>

        {status === 'saved' && <p className="text-green-600">{t('tma.profile.saved')}</p>}
        {status === 'failed' && <p className="text-red-500">{t('tma.profile.failed')}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Сверить экспорт реестра языков**

```bash
cd ~/Downloads/spirits_front && grep -n "export" src/i18n/languages.ts | head
```

Привести имя импорта и поля (`code`, `nativeName`) к фактическим.

- [ ] **Step 5: Типы**

```bash
cd ~/Downloads/spirits_front && pnpm typecheck
```

- [ ] **Step 6: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/tma/screens/ProfileScreen.tsx src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "feat(tma): профиль и выбор языка"
```

---

## Task 13: Экран «День»

Три независимых блока. Общего спиннера нет: у каждого источника своё состояние, и падение одного не гасит остальные.

**Files:**
- Create: `spirits_front/src/tma/screens/DayScreen.tsx`
- Modify: `spirits_front/src/i18n/locales/ru.json`, `en.json`

- [ ] **Step 1: Ключи в ru.json (внутрь блока `tma`)**

```json
    "day": {
      "title": "Сегодня",
      "focus": "Фокус дня",
      "events": "Ближайшее",
      "tasks": "Задачи",
      "calendarOff": "Календарь не подключён",
      "calendarConnect": "Подключить в веб-версии",
      "noEvents": "Событий нет.",
      "noTasks": "Активных задач нет."
    },
```

- [ ] **Step 2: Ключи в en.json**

```json
    "day": {
      "title": "Today",
      "focus": "Focus of the day",
      "events": "Coming up",
      "tasks": "Tasks",
      "calendarOff": "Calendar not connected",
      "calendarConnect": "Connect it in the web app",
      "noEvents": "No events.",
      "noTasks": "No active tasks."
    },
```

- [ ] **Step 3: Написать экран**

Создать `spirits_front/src/tma/screens/DayScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson, postJson } from '../api';

interface EventRow { id?: string; title?: string; start?: string }
interface TaskRow { id?: string; taskId?: string; title?: string; status?: string }

/** null — ещё грузится, 'off' — источник недоступен или выключен. */
type Block<T> = T | null | 'off';

export function DayScreen() {
  const { t, i18n } = useTranslation();
  const [focus, setFocus] = useState<Block<string>>(null);
  const [events, setEvents] = useState<Block<EventRow[]>>(null);
  const [tasks, setTasks] = useState<Block<TaskRow[]>>(null);

  useEffect(() => {
    getJson('/webhook/app-widget/content')
      .then((r: any) => setFocus(r?.focus ?? r?.text ?? 'off'))
      .catch(() => setFocus('off'));

    // Календарь у большинства не подключён — это нормальное состояние,
    // а не ошибка: показываем приглашение, а не вечный скелетон.
    getJson('/webhook/calendar/status')
      .then(async (s: any) => {
        if (!s?.connected) return setEvents('off');
        const r: any = await postJson('/webhook/calendar/events', {});
        setEvents(Array.isArray(r) ? r : r?.events ?? []);
      })
      .catch(() => setEvents('off'));

    getJson('/webhook/user/tasks')
      .then((r: any) => setTasks(Array.isArray(r) ? r : r?.tasks ?? []))
      .catch(() => setTasks('off'));
  }, []);

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">{t('tma.day.title')}</h1>

      {focus !== 'off' && (
        <section>
          <h2 className="text-sm font-medium opacity-70">{t('tma.day.focus')}</h2>
          <p className="mt-1 text-lg">{focus === null ? '…' : focus}</p>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium opacity-70">{t('tma.day.events')}</h2>
        {events === null && <p className="mt-1 opacity-60">…</p>}
        {events === 'off' && (
          <div className="mt-1 rounded-xl border p-3">
            <p>{t('tma.day.calendarOff')}</p>
            <p className="text-sm opacity-60">{t('tma.day.calendarConnect')}</p>
          </div>
        )}
        {Array.isArray(events) && events.length === 0 && (
          <p className="mt-1 opacity-60">{t('tma.day.noEvents')}</p>
        )}
        <ul className="mt-1 flex flex-col gap-2">
          {Array.isArray(events) &&
            events.map((e, i) => (
              <li key={e.id ?? i} className="rounded-xl border p-3">
                <span className="font-medium">{e.title ?? '—'}</span>
                {e.start && (
                  <span className="block text-sm opacity-60">
                    {new Date(e.start).toLocaleString(i18n.language)}
                  </span>
                )}
              </li>
            ))}
        </ul>
      </section>

      {tasks !== 'off' && (
        <section>
          <h2 className="text-sm font-medium opacity-70">{t('tma.day.tasks')}</h2>
          {tasks === null && <p className="mt-1 opacity-60">…</p>}
          {Array.isArray(tasks) && tasks.length === 0 && (
            <p className="mt-1 opacity-60">{t('tma.day.noTasks')}</p>
          )}
          <ul className="mt-1 flex flex-col gap-2">
            {Array.isArray(tasks) &&
              tasks.map((task, i) => (
                <li key={task.id ?? task.taskId ?? i} className="rounded-xl border p-3">
                  {task.title ?? '—'}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Сверить формы ответов**

```bash
cd ~/Downloads/spirits_back && sed -n '11,35p' src/calendar/calendar.controller.ts && sed -n '40,50p' src/tasks/tasks.controller.ts && sed -n '38,50p' src/app-widget/app-widget.controller.ts
```

Привести поля к фактическим.

- [ ] **Step 5: Собрать и прогнать всё на тест-ноде**

```bash
cd ~/Downloads/spirits_front && git push
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && git fetch -q origin && git checkout -q origin/feat/tg-mini-app && pnpm install && pnpm test && pnpm build'
```

Ожидается: тесты зелёные, сборка проходит, оба бандла на месте.

- [ ] **Step 6: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/tma/screens/DayScreen.tsx src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "feat(tma): экран дня — фокус, календарь, задачи"
```

---

## Task 14: Локали для остальных пяти языков

`scripts/check-locales.mjs` падает, если ключ из `ru.json` отсутствует в любой из семи локалей. `translate-locales` без `ANTHROPIC_API_KEY` не работает и переписывает локаль целиком, поэтому ключи добавляются руками.

**Files:**
- Modify: `spirits_front/src/i18n/locales/es.json`, `de.json`, `fr.json`, `zh.json`, `pt.json`

- [ ] **Step 1: Проверить, что проверка локалей сейчас красная**

```bash
cd ~/Downloads/spirits_front && pnpm check-locales
```

Ожидается: FAIL со списком отсутствующих ключей `tma.*` в пяти локалях.

- [ ] **Step 2: Добавить блок в es.json**

```json
  "tma": {
    "choice": { "title": "Bienvenido a Linkeon", "subtitle": "Asistentes que recuerdan tu contexto y trabajan contigo.", "start": "Empezar", "haveAccount": "Ya tengo una cuenta", "phoneLabel": "Número de teléfono", "codeLabel": "Código SMS", "sendCode": "Enviar código", "confirm": "Confirmar", "back": "Atrás", "conflict": "Este Telegram ya está vinculado a otra cuenta de Linkeon.", "failed": "No ha funcionado. Inténtalo de nuevo." },
    "outside": { "title": "Abre la aplicación desde Telegram", "body": "Esta página solo funciona dentro de Telegram." },
    "nav": { "day": "Hoy", "assistants": "Asistentes", "wallet": "Cartera", "profile": "Perfil" },
    "assistants": { "title": "Asistentes", "hint": "Elige uno y continúa la conversación en el chat del bot.", "current": "Actual", "empty": "Aún no hay nada.", "failed": "No se pudo cargar." },
    "wallet": { "title": "Cartera", "balance": "Saldo", "tokens_one": "{{count}} token", "tokens_many": "{{count}} tokens", "tokens_other": "{{count}} tokens", "history": "En qué se gastó", "empty": "Aún no se ha gastado nada.", "failed": "No se pudo cargar." },
    "profile": { "title": "Perfil", "name": "Nombre", "birthday": "Fecha de nacimiento", "language": "Idioma", "save": "Guardar", "saved": "Guardado", "failed": "No se pudo guardar." },
    "day": { "title": "Hoy", "focus": "Foco del día", "events": "Próximamente", "tasks": "Tareas", "calendarOff": "Calendario no conectado", "calendarConnect": "Conéctalo en la versión web", "noEvents": "Sin eventos.", "noTasks": "Sin tareas activas." }
  },
```

- [ ] **Step 3: Добавить блок в de.json**

```json
  "tma": {
    "choice": { "title": "Willkommen bei Linkeon", "subtitle": "Assistenten, die deinen Kontext kennen und mit dir arbeiten.", "start": "Loslegen", "haveAccount": "Ich habe bereits ein Konto", "phoneLabel": "Telefonnummer", "codeLabel": "SMS-Code", "sendCode": "Code senden", "confirm": "Bestätigen", "back": "Zurück", "conflict": "Dieses Telegram ist bereits mit einem anderen Linkeon-Konto verknüpft.", "failed": "Das hat nicht geklappt. Bitte versuche es erneut." },
    "outside": { "title": "Öffne die App über Telegram", "body": "Diese Seite funktioniert nur innerhalb von Telegram." },
    "nav": { "day": "Heute", "assistants": "Assistenten", "wallet": "Guthaben", "profile": "Profil" },
    "assistants": { "title": "Assistenten", "hint": "Wähle einen aus und führe das Gespräch im Bot-Chat fort.", "current": "Aktuell", "empty": "Noch nichts vorhanden.", "failed": "Laden fehlgeschlagen." },
    "wallet": { "title": "Guthaben", "balance": "Kontostand", "tokens_one": "{{count}} Token", "tokens_other": "{{count}} Token", "history": "Wofür ausgegeben", "empty": "Noch nichts ausgegeben.", "failed": "Laden fehlgeschlagen." },
    "profile": { "title": "Profil", "name": "Name", "birthday": "Geburtsdatum", "language": "Sprache", "save": "Speichern", "saved": "Gespeichert", "failed": "Speichern fehlgeschlagen." },
    "day": { "title": "Heute", "focus": "Fokus des Tages", "events": "Demnächst", "tasks": "Aufgaben", "calendarOff": "Kalender nicht verbunden", "calendarConnect": "In der Web-Version verbinden", "noEvents": "Keine Termine.", "noTasks": "Keine aktiven Aufgaben." }
  },
```

- [ ] **Step 4: Добавить блок в fr.json**

```json
  "tma": {
    "choice": { "title": "Bienvenue sur Linkeon", "subtitle": "Des assistants qui retiennent votre contexte et travaillent avec vous.", "start": "Commencer", "haveAccount": "J'ai déjà un compte", "phoneLabel": "Numéro de téléphone", "codeLabel": "Code SMS", "sendCode": "Envoyer le code", "confirm": "Confirmer", "back": "Retour", "conflict": "Ce Telegram est déjà lié à un autre compte Linkeon.", "failed": "Cela n'a pas fonctionné. Réessayez." },
    "outside": { "title": "Ouvrez l'application depuis Telegram", "body": "Cette page ne fonctionne qu'à l'intérieur de Telegram." },
    "nav": { "day": "Aujourd'hui", "assistants": "Assistants", "wallet": "Portefeuille", "profile": "Profil" },
    "assistants": { "title": "Assistants", "hint": "Choisissez-en un et poursuivez la conversation dans le chat du bot.", "current": "Actuel", "empty": "Rien pour l'instant.", "failed": "Échec du chargement." },
    "wallet": { "title": "Portefeuille", "balance": "Solde", "tokens_one": "{{count}} jeton", "tokens_many": "{{count}} jetons", "tokens_other": "{{count}} jetons", "history": "Où c'est parti", "empty": "Rien de dépensé pour l'instant.", "failed": "Échec du chargement." },
    "profile": { "title": "Profil", "name": "Nom", "birthday": "Date de naissance", "language": "Langue", "save": "Enregistrer", "saved": "Enregistré", "failed": "Échec de l'enregistrement." },
    "day": { "title": "Aujourd'hui", "focus": "Focus du jour", "events": "À venir", "tasks": "Tâches", "calendarOff": "Calendrier non connecté", "calendarConnect": "Connectez-le dans la version web", "noEvents": "Aucun événement.", "noTasks": "Aucune tâche active." }
  },
```

- [ ] **Step 5: Добавить блок в zh.json**

У китайского только категория `other` — `_one`/`_few`/`_many` там не существуют:

```json
  "tma": {
    "choice": { "title": "欢迎使用 Linkeon", "subtitle": "记得你的上下文、与你一同工作的助手。", "start": "开始", "haveAccount": "我已有账号", "phoneLabel": "手机号", "codeLabel": "短信验证码", "sendCode": "发送验证码", "confirm": "确认", "back": "返回", "conflict": "该 Telegram 已绑定到另一个 Linkeon 账号。", "failed": "没有成功，请重试。" },
    "outside": { "title": "请通过 Telegram 打开应用", "body": "此页面仅在 Telegram 内可用。" },
    "nav": { "day": "今天", "assistants": "助手", "wallet": "钱包", "profile": "个人资料" },
    "assistants": { "title": "助手", "hint": "选择一位，然后在机器人聊天中继续对话。", "current": "当前", "empty": "暂无内容。", "failed": "加载失败。" },
    "wallet": { "title": "钱包", "balance": "余额", "tokens_other": "{{count}} 个代币", "history": "消费去向", "empty": "尚无消费记录。", "failed": "加载失败。" },
    "profile": { "title": "个人资料", "name": "姓名", "birthday": "出生日期", "language": "语言", "save": "保存", "saved": "已保存", "failed": "保存失败。" },
    "day": { "title": "今天", "focus": "今日重点", "events": "即将开始", "tasks": "任务", "calendarOff": "尚未连接日历", "calendarConnect": "请在网页版中连接", "noEvents": "没有日程。", "noTasks": "没有进行中的任务。" }
  },
```

- [ ] **Step 6: Добавить блок в pt.json**

```json
  "tma": {
    "choice": { "title": "Bem-vindo ao Linkeon", "subtitle": "Assistentes que lembram o seu contexto e trabalham com você.", "start": "Começar", "haveAccount": "Já tenho uma conta", "phoneLabel": "Número de telefone", "codeLabel": "Código SMS", "sendCode": "Enviar código", "confirm": "Confirmar", "back": "Voltar", "conflict": "Este Telegram já está vinculado a outra conta Linkeon.", "failed": "Não funcionou. Tente novamente." },
    "outside": { "title": "Abra o aplicativo pelo Telegram", "body": "Esta página só funciona dentro do Telegram." },
    "nav": { "day": "Hoje", "assistants": "Assistentes", "wallet": "Carteira", "profile": "Perfil" },
    "assistants": { "title": "Assistentes", "hint": "Escolha um e continue a conversa no chat do bot.", "current": "Atual", "empty": "Nada por aqui ainda.", "failed": "Falha ao carregar." },
    "wallet": { "title": "Carteira", "balance": "Saldo", "tokens_one": "{{count}} token", "tokens_many": "{{count}} tokens", "tokens_other": "{{count}} tokens", "history": "Para onde foi", "empty": "Nada gasto ainda.", "failed": "Falha ao carregar." },
    "profile": { "title": "Perfil", "name": "Nome", "birthday": "Data de nascimento", "language": "Idioma", "save": "Salvar", "saved": "Salvo", "failed": "Não foi possível salvar." },
    "day": { "title": "Hoje", "focus": "Foco do dia", "events": "Em breve", "tasks": "Tarefas", "calendarOff": "Calendário não conectado", "calendarConnect": "Conecte na versão web", "noEvents": "Sem eventos.", "noTasks": "Sem tarefas ativas." }
  },
```

- [ ] **Step 7: Проверить, что проверка локалей зелёная**

```bash
cd ~/Downloads/spirits_front && pnpm check-locales && pnpm check-keys && pnpm check-hardcoded
```

Ожидается: все три проходят.

Категории множественного числа в каждом языке взяты из `Intl.PluralRules`, а не скопированы из русского: у английского и немецкого только `one`/`other`, у китайского — только `other`, у испанского, французского и португальского — `one`/`many`/`other`.

- [ ] **Step 8: Коммит**

```bash
cd ~/Downloads/spirits_front
git add src/i18n/locales/
git commit -m "feat(tma): локали для es, de, fr, zh, pt"
```

---

## Task 15: Раздача Mini App и смоук

**Files:**
- Modify: nginx-конфиг `spirits` на тестовом сервере и проде
- Modify: `spirits_back/scripts/deploy.sh` (смоук)

- [ ] **Step 1: Посмотреть текущий конфиг**

```bash
ssh dv@85.192.61.231 'sudo cat /etc/nginx/sites-enabled/spirits'
```

Конфиг единственный. Класть рядом бэкап нельзя: `nginx -t` упадёт на duplicate default server.

- [ ] **Step 2: Добавить location**

Перед общим SPA-фолбэком `location /` добавить:

```nginx
    # Telegram Mini App — отдельный entry point. Обязан идти ДО location /,
    # иначе SPA-фолбэк отдаст обычный веб с кодом 200, и Mini App будет
    # выглядеть работающим, будучи мёртвым.
    location = /tma {
        return 301 /tma/;
    }
    location /tma/ {
        alias /home/dvolkov/spirits_front/dist/;
        try_files /tma.html =404;
    }
```

- [ ] **Step 3: Проверить конфиг и перезагрузить**

```bash
ssh dv@85.192.61.231 'sudo nginx -t && sudo systemctl reload nginx'
```

Ожидается: `syntax is ok`, `test is successful`.

- [ ] **Step 4: Проверить руками, что отдаётся именно Mini App**

```bash
ssh dv@85.192.61.231 'curl -s -u <логин>:<пароль> https://test.linkeon.io/tma/ | grep -o "assets/[a-zA-Z0-9._-]*\.js"'
ssh dv@85.192.61.231 'curl -s -u <логин>:<пароль> https://test.linkeon.io/    | grep -o "assets/[a-zA-Z0-9._-]*\.js"'
```

Логин и пароль Basic Auth — в `~/Downloads/spirits_back/scripts/test-server.env.local`.

Ожидается: **разные** имена бандлов. Одинаковые означают, что `/tma/` перехватил SPA-фолбэк.

- [ ] **Step 5: Добавить смоук-проверку в deploy.sh**

Найти в `~/Downloads/spirits_back/scripts/deploy.sh` блок смоука фронта и добавить рядом:

```bash
# Mini App: проверяем СОДЕРЖИМОЕ, а не код ответа. Nginx отдаёт index.html
# с кодом 200 на любой путь, поэтому «200 OK» тут ничего не значит — без
# location /tma/ смоук был бы зелёным при полностью мёртвом Mini App.
TMA_BUNDLE=$(curl -sf "$BASE_URL/tma/" | grep -o 'src="/assets/[a-zA-Z0-9._-]*\.js"' | head -1)
WEB_BUNDLE=$(curl -sf "$BASE_URL/"     | grep -o 'src="/assets/[a-zA-Z0-9._-]*\.js"' | head -1)
if [ -z "$TMA_BUNDLE" ]; then
  echo "SMOKE FAIL: /tma/ не отдал бандл"
  exit 1
fi
if [ "$TMA_BUNDLE" = "$WEB_BUNDLE" ]; then
  echo "SMOKE FAIL: /tma/ отдаёт веб-бандл — сработал SPA-фолбэк, location /tma/ не применился"
  exit 1
fi
echo "SMOKE OK: Mini App отдаётся своим бандлом"
```

Имена переменных (`BASE_URL` и способ передачи Basic Auth) взять из соседних проверок в том же файле, а не вводить свои.

- [ ] **Step 6: Проверить, что смоук ловит поломку**

Временно закомментировать `location /tma/` в конфиге тест-сервера, перезагрузить nginx, прогнать смоук.

Ожидается: `SMOKE FAIL: /tma/ отдаёт веб-бандл`.

Вернуть конфиг, прогнать снова — `SMOKE OK`. Без этого шага неизвестно, ловит ли проверка хоть что-нибудь.

- [ ] **Step 7: Коммит**

```bash
cd ~/Downloads/spirits_back
git add scripts/deploy.sh
git commit -m "feat(deploy): смоук Mini App по содержимому, а не по коду ответа"
```

---

## Task 16: Регистрация Mini App у BotFather и проверка на живом Telegram

Зелёные тесты и живой API ничего не доказывают про мобильное приложение — нужен реальный запуск.

- [ ] **Step 1: Привязать URL Mini App к боту**

У @BotFather для тестового бота: `/mybots` → бот → Bot Settings → Menu Button → указать `https://test.linkeon.io/tma/`.

Токены ботов на тесте и проде **разные** — подпись `initData` от тестового бота на проде не пройдёт и наоборот. Это ожидаемо и защищает прод.

- [ ] **Step 2: Проверить Basic Auth**

`test.linkeon.io` закрыт Basic Auth на уровне Nginx, и Telegram-клиент диалог логина не покажет — Mini App просто не откроется.

Для проверки на тесте временно разрешить `/tma/` без пароля, добавив в блок `location /tma/`:

```nginx
        auth_basic off;
```

После проверки — вернуть обратно. На проде этого нет: там Basic Auth отсутствует.

- [ ] **Step 3: Пройти сценарий новичка**

С Telegram-аккаунта, ни разу не открывавшего бота: открыть Mini App → ожидается экран выбора → «Начать» → попасть на «День», в «Кошельке» увидеть 25 000 токенов.

- [ ] **Step 4: Пройти сценарий старожила бота**

С аккаунта, уже привязанного к боту через claim-токен: открыть Mini App → ожидается **сразу** «День» без экрана выбора, баланс совпадает с тем, что показывает команда `/balance` в боте.

- [ ] **Step 5: Пройти сценарий владельца веб-аккаунта**

С третьего Telegram-аккаунта: экран выбора → «У меня уже есть аккаунт» → SMS на номер существующего аккаунта → код через `GET /webhook/debug/sms-code/:phone` (тестовые номера в whitelist, реальная SMS не уходит) → после привязки баланс и история **совпадают с веб-версией**.

Это ключевая проверка: она сторожит границу с дефектом `mergeAccounts`. Обнулившийся баланс означает, что где-то по пути включилось слияние.

- [ ] **Step 6: Проверить смену ассистента**

Во вкладке «Ассистенты» выбрать другого → Mini App закрывается → написать боту → отвечает выбранный ассистент.

- [ ] **Step 7: Проверить тёмную тему**

Переключить тему Telegram на тёмную, открыть Mini App заново: фон и текст читаемы, светлых прямоугольников на тёмном нет.

- [ ] **Step 8: Зафиксировать результат**

Записать в описание PR, какие сценарии пройдены и на каких аккаунтах. Непройденный сценарий отмечать явно, а не умалчивать.

---

## Task 17: Выкат

- [ ] **Step 1: Влить ветку в main**

Прод и test катаются только из `main`.

```bash
cd ~/Downloads/spirits_front && git checkout main && git merge --no-ff feat/tg-mini-app && git push origin main
cd ~/Downloads/spirits_back  && git checkout main && git merge --no-ff feat/tg-mini-app && git push origin main
```

- [ ] **Step 2: Спросить разрешение на деплой**

`deploy.sh` катает на прод. Запускать только после явного «да» от владельца — раскатку может вести параллельная сессия.

- [ ] **Step 3: Проверить, что нет живых стримов**

Деплой посреди хода убивает ответ молча: ни ошибки, ни ретрая, ни строки в истории.

```bash
ssh dvolkov@212.113.106.202 'pm2 logs linkeon-api --lines 50 --nostream'
```

- [ ] **Step 4: Выкатить**

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```

Без флагов: test → smoke → prod → smoke. Если test красный — прод не трогается.

- [ ] **Step 5: Прописать прод-URL у боевого бота**

У @BotFather для боевого бота указать Menu Button → `https://my.linkeon.io/tma/`.

- [ ] **Step 6: Проверить прод**

Повторить сценарии из Task 16 на боевом боте, минимум сценарий новичка и сценарий старожила.

---

## Порядок и зависимости

```
Task 1 (подпись) ─┬─→ Task 3 (вход)   ─┐
Task 2 (провайдер)┘                    ├─→ Task 7 (фронт-авторизация) ─→ Task 8 (выбор)
Task 1 ───────────→ Task 4 (привязка) ─┘                                     │
                                                                              ↓
Task 5 (entry point) ─→ Task 6 (обёртка) ─────────────────────────→ Task 9 (оболочка)
                                                                              ↓
                                        Task 10, 11, 12, 13 (четыре экрана, независимы)
                                                                              ↓
                                                    Task 14 (локали) → Task 15 (nginx+смоук)
                                                                              ↓
                                                        Task 16 (живая проверка) → Task 17 (выкат)
```

Задачи 10–13 независимы друг от друга и могут идти в любом порядке или параллельно.
