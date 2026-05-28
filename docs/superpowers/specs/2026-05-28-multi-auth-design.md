# Design: Multi-method auth (Email + Google + Yandex + Phone)

**Дата:** 2026-05-28
**Статус:** approved (brainstorming-этап завершён, ждём план реализации)
**Контекст:** SMS на админский номер `+79030169187` периодически не доходят — мобильный оператор фильтрует, хотя SMS Aero подтверждает delivery (см. memory `project_admin_sms_carrier_block`). Альтернативные способы входа решают проблему доставки SMS И снижают барьер для новых юзеров.

## Цель

Дать пользователю выбор из четырёх равноправных методов входа: SMS на телефон (как сейчас), magic-link на email, OAuth через Google или Yandex. Сохранить anti-sybil-защиту через подтверждение email + блокировку временных доменов. Развязать `user_id` от phone, чтобы новые юзеры могли регистрироваться без телефона вовсе.

## Решения, зафиксированные в брейнштурме

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | Scope | Всё разом — 4 метода в одном релизе |
| 2 | Email-механизм | Magic-link primary + опциональный пароль (после первого входа можно задать) |
| 3 | `internal_id` для новых | UUID. Существующие юзеры со старым phone-as-internal_id не трогаются |
| 4 | Welcome bonus | 25k единовременно за подтверждённую identity (любую) + блок tempmail-доменов |
| 5 | Account merging | Auto-merge по `email_verified=true` от провайдера |
| 6 | Login UI | Tabs (4 равноправных метода) |
| 7 | Linking в Settings | Полное управление — добавлять/удалять способы входа |
| 8 | Backend rename | Полный rename `req.user.phone` → `req.user.userId`, codemod через grep+sed |

## Архитектура

### Новые модули

- `src/identity/identity.service.ts` — единая точка управления identity, merge-логикой, welcome bonus.
- `src/identity/identity.module.ts` — Nest module, экспортирует `IdentityService`.
- `src/auth/email.service.ts` — magic-link generation, password hashing/verification.
- `src/auth/oauth-google.service.ts` — обмен Google OAuth-code на email.
- `src/auth/oauth-yandex.service.ts` — то же для Yandex.

### Изменения существующих

- `src/auth/auth.service.ts` — `requestSmsCode`/`checkCode` вместо прямых INSERT'ов в БД зовут `IdentityService.resolveOrCreate('phone', {phone})`.
- `src/auth/auth.controller.ts` — новые routes для email/Google/Yandex.
- `src/common/guards/jwt.guard.ts` — JWT-claim `phone` → `userId`, `req.user.phone` → `req.user.userId`.
- Все endpoints, использующие `req.user.phone` (~50 файлов): codemod.

### JWT payload

```ts
// до:  { phone, sub, type, iat, exp }
// после: { userId, sub, type, iat, exp }
```

Без полей `email`/`phone` в payload — если нужен phone/email, читаем из `user_identities` (с кэшированием).

### Frontend модули

- `src/components/onboarding/LoginTabs.tsx` — UI с табами (SMS/Email/Google/Yandex).
- `src/components/onboarding/EmailInput.tsx` — email-форма + magic-link flow.
- `src/components/onboarding/OAuthButton.tsx` — переиспользуемая кнопка для Google/Yandex.
- `src/pages/AuthEmailConfirmPage.tsx` — landing для magic-link `/auth/email/confirm?token=...`.
- `src/pages/AuthOAuthCallbackPage.tsx` — общий для Google/Yandex, маршрут `/auth/:provider/callback`.
- `src/components/settings/LinkedAccountsView.tsx` — управление привязками.
- `src/services/authService.ts` — новые методы: `requestMagicLink`, `confirmMagicLink`, `loginWithOAuth`, `linkMethod`, `unlinkMethod`.

## Data model

### Новая таблица `user_identities`

```sql
CREATE TABLE user_identities (
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
CREATE INDEX idx_user_identities_user ON user_identities(user_id);
CREATE INDEX idx_user_identities_email_verified ON user_identities(email) WHERE email_verified;
```

`provider_sub` (нормализация — обязательно на входе в `IdentityService`, перед любым lookup/insert):
- **phone**: только цифры, без `+`, страна впереди. Convention соответствует существующим юзерам (например, `79030169187`). Нормализатор: `phone.replace(/\D/g, '')`.
- **email**: `email.trim().toLowerCase()`.
- **google**: `sub` от Google as-is (он opaque).
- **yandex**: `id` от Yandex as-is.

### Изменения в `user_id`

```sql
ALTER TABLE user_id ADD COLUMN password_hash text;
ALTER TABLE user_id ADD COLUMN signup_method text;
ALTER TABLE user_id ADD COLUMN welcome_bonus_at timestamptz;
UPDATE user_id SET welcome_bonus_at = create_date WHERE welcome_bonus_at IS NULL; -- backfill
```

`internal_id` для новых юзеров — `gen_random_uuid()::text`. Существующих не трогаем.

### Redis-ключи (новые)

- `ml-{token}` → `{email, ttl 600s}` — magic-link токены.
- `ml-rate-{email}` TTL 60s — rate-limit на email.
- `ml-rate-ip-{ip}` TTL 600s, counter — rate-limit per-IP (max 10/10min).
- `oauth-state-{state}` → `{provider, redirectUri, ttl 300s}` — CSRF state.
- `pw-reset-{token}` → `{userId, ttl 1800s}` — восстановление пароля.

### Backfill для существующих юзеров

Для каждой строки в `user_id` с непустым `internal_id`:
1. INSERT в `user_identities` строку `(provider='phone', provider_sub=internal_id, email_verified=false)`.
2. Если в `ai_profiles_consolidated.email` есть email — **НЕ** вставляем email-identity. Старый email не подтверждён в нашей системе, оставляем как декларативный атрибут.

### Tempmail-блок

Файл `src/identity/tempmail-domains.json` — список доменов из npm-пакета `disposable-email-domains`. Проверка домена перед генерацией magic-link.

## `IdentityService` API

### Типы

```ts
type Provider = 'phone' | 'email' | 'google' | 'yandex';

interface ProviderData {
  phone:  { phone: string };
  email:  { email: string };
  google: { sub: string; email: string; emailVerified: boolean };
  yandex: { sub: string; email: string; emailVerified: boolean };
}

interface Identity {
  id: string;
  provider: Provider;
  providerSub: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}
```

### Публичные методы

```ts
async resolveOrCreate<P extends Provider>(
  provider: P,
  data: ProviderData[P],
): Promise<{ userId: string; isNew: boolean; mergedExisting: boolean }>
```

Логика:
1. Lookup `(provider, provider_sub)` в `user_identities`. Если есть — UPDATE `last_used_at`, return `{userId, isNew: false, mergedExisting: false}`.
2. Если `provider ∈ {google, yandex, email}` и `emailVerified=true` — поиск другого identity с тем же email и `email_verified=true`. Если найден — INSERT новой identity к тому же userId, return `{userId, isNew: false, mergedExisting: true}`.
3. Иначе — генерируем UUID, INSERT `user_id` row (со `signup_method`), INSERT `ai_profiles_consolidated` (tokens=0, isadmin=false), INSERT `user_identities` row, `issueWelcomeBonus` (uplift tokens до 25000), return `{userId, isNew: true, mergedExisting: false}`.

Все три INSERT'а + UPDATE bonus — в одной транзакции `BEGIN ... COMMIT`, чтобы не получить полу-созданного юзера при сбое.

```ts
async linkMethod(userId: string, provider: Provider, data: ProviderData[Provider]):
  Promise<{ ok: true } | { ok: false; reason: 'conflict' | 'invalid' }>
```

Вызывается из Settings. Проверка: `(provider, provider_sub)` не занят другим userId. Если занят — `conflict` (саппорт-only).

```ts
async unlinkMethod(userId: string, identityId: string):
  Promise<{ ok: true } | { ok: false; reason: 'last_method' }>
```

Отказ если это последний identity (`SELECT count FROM user_identities WHERE user_id=$1 = 1`).

```ts
async listIdentities(userId: string): Promise<Identity[]>
```

Для Settings UI.

### Внутренние методы

```ts
private async issueWelcomeBonus(userId: string): Promise<void>
```

Идемпотентно: `UPDATE user_id SET welcome_bonus_at=now() WHERE internal_id=$1 AND welcome_bonus_at IS NULL RETURNING id`. Если RETURNING пуст — бонус уже выдан, делаем noop. Если есть — `UPDATE ai_profiles_consolidated SET tokens = tokens + 25000 WHERE user_id=$1`.

```ts
private async tryMergeByVerifiedEmail(email: string): Promise<string | null>
```

`SELECT user_id FROM user_identities WHERE email=$1 AND email_verified=true LIMIT 1`. Возвращает userId или null.

## Auth flows

### Phone (refactored)

`GET /webhook/{uuid}/sms/:phone` → SMS Aero + Redis `sc-{phone}` (как сейчас).
`GET /webhook/{uuid}/check-code/:phone/:code` → проверка кода → `IdentityService.resolveOrCreate('phone', {phone})` → JWT.

INSERT'ы в `user_id` и `ai_profiles_consolidated` удаляются из `AuthService` — теперь зона ответственности `IdentityService`.

### Email magic-link

```
POST /webhook/auth/email/request   body: { email }
  → нормализация email (toLowerCase, trim)
  → проверка tempmail-блока
  → rate-limit ml-rate-{email} / ml-rate-ip-{ip}
  → ml-{token} в Redis (token = 32 байта random, base64url)
  → отправка письма со ссылкой https://my.linkeon.io/auth/email/confirm?token=XXX
  → 200 { sent: true }

GET /webhook/auth/email/confirm?token=XXX
  → Redis get → если нет/протух → 400
  → Redis DELETE ml-{token} (одноразовый)
  → IdentityService.resolveOrCreate('email', {email})
  → 200 text/html с inline-скриптом, который кладёт JWT в localStorage и делает location.replace('/chat')
     ИЛИ возврат JSON {access-token, refresh-token} если Accept: application/json
```

JWT в URL **не** передаём — это утечка через referer/history. Бэк отдаёт HTML страничку с inline-скриптом, который пишет в localStorage и редиректит. Это эквивалент Set-Cookie+redirect, но совместимо с текущей localStorage-based авторизацией фронта.

### Email + пароль

После первого magic-link logged-in юзер видит в Settings/Profile предложение «Задать пароль для быстрого входа». bcrypt-hash в `user_id.password_hash`.

```
POST /webhook/auth/email/login   body: { email, password }
  → SELECT user_id FROM user_identities WHERE provider='email' AND provider_sub=$1 AND email_verified=true
  → bcrypt.compare с user_id.password_hash
  → resolveOrCreate('email', {email}) (через existing identity — пароль НЕ создаёт нового юзера)
  → JWT
```

Кнопка «Войти по ссылке» в той же форме → magic-link flow.

### Google OAuth

**State генерируется только на бэке** (серверный CSRF, frontend в принципе не знает state). Фронт делает init-вызов, получает готовый authorize URL и редиректит на него.

```
POST /webhook/auth/oauth/init   body: { provider, intent: 'login' | 'link' }
  → genState → Redis SET oauth-state-{state} = {provider, intent, userId?, ttl 300s}
       intent='link': userId берётся из JWT (require auth), сохраняется в state — callback поймёт что это link operation
       intent='login': userId не сохраняется
  → возвращает { authorizeUrl }

POST /webhook/auth/oauth/google   body: { code, state }
  → Redis GET oauth-state-{state}, провер: provider === 'google'
  → Redis DELETE
  → POST https://oauth2.googleapis.com/token (form: code, client_id, client_secret, redirect_uri, grant_type=authorization_code)
  → GET https://www.googleapis.com/oauth2/v3/userinfo (Bearer access_token) → {sub, email, email_verified}
  → если intent='link' (есть userId в state) → IdentityService.linkMethod(userId, 'google', {sub, email, emailVerified}); ответ { linked: true | { conflict: true } }
  → если intent='login' → IdentityService.resolveOrCreate('google', {sub, email, emailVerified}) → JWT
```

### Yandex OAuth

Зеркало Google:
- Authorize: `https://oauth.yandex.ru/authorize?response_type=code&client_id=...`
- Token: `https://oauth.yandex.ru/token` (POST application/x-www-form-urlencoded)
- Userinfo: `https://login.yandex.ru/info?format=json` (header `Authorization: OAuth <token>`) → `{id, default_email}`

Yandex считаем `emailVerified=true` для `default_email`.

## Frontend UI

### Onboarding — 4 таба

`src/components/onboarding/LoginTabs.tsx`:

| Таб | Содержимое |
|-----|------------|
| SMS | Текущий phone-flow (PhoneInput → OTPInput), без изменений |
| Email | Поле email → «Получить ссылку» → «Проверь почту». Если `hasPassword=true` (бэк отдаёт при `/email/request`) — сначала поле пароля + ссылка «Войти по ссылке» |
| Google | Кнопка с логотипом → `/oauth/init` → редирект |
| Yandex | Кнопка с логотипом → `/oauth/init` → редирект |

Дефолтный таб — SMS. `localStorage.lastLoginTab` запоминает последний выбранный.

### Callback pages

- `AuthEmailConfirmPage.tsx` — `/auth/email/confirm?token=XXX`. Дёргает `GET /webhook/auth/email/confirm`. На успех — JWT в localStorage, `/chat`. На ошибку — «Ссылка устарела» + кнопка «Получить новую».
- `AuthOAuthCallbackPage.tsx` — общий маршрут `/auth/:provider/callback`. Парсит code+state, шлёт `POST /webhook/auth/oauth/:provider`, кладёт JWT, редиректит.

### Settings — «Способы входа»

`LinkedAccountsView.tsx`, встраивается в `SettingsView`:

```
Способы входа
├─ Телефон    +79030169187    [Отвязать]
├─ Email      foo@gmail.com    [Отвязать]
├─ Google     foo@gmail.com    [Отвязать]
└─ Yandex     —                [Привязать]
```

«Отвязать» disabled с tooltip если метод единственный. «Привязать» — inline-flow того же метода:
- **Phone / Email**: открывается модал с тем же flow что в onboarding, но в `link`-режиме (бэк-эндпоинт `/auth/.../link` вызывает `linkMethod`, не `resolveOrCreate`).
- **Google / Yandex**: `POST /auth/oauth/init` с `intent='link'` → редирект на провайдера → callback на `/auth/:provider/callback` → детектит intent → `linkMethod` → редирект обратно на Settings с toast «Привязан».

## Backend rename

### JWT issuance

```ts
private issueTokens(userId: string) {
  return {
    'access-token':  this.jwt.signAccess({ userId, sub: userId, type: 'access' }),
    'refresh-token': this.jwt.signRefresh({ userId, sub: userId, type: 'refresh' }),
  };
}
```

### JwtGuard

```ts
request.user = { userId, sub: payload.sub, isAdmin };
```

### Codemod

```bash
grep -rn "req\.user\.phone\|request\.user\.phone\|user\.phone" src/ --include="*.ts" | wc -l
find src/ -name "*.ts" -exec sed -i.bak 's/req\.user\.phone/req.user.userId/g; s/request\.user\.phone/request.user.userId/g' {} \;
find src/ -name "*.ts.bak" -delete
```

Затем `pnpm build` — TS поймает все оставшиеся места (где локальная `phone` бралась из `req.user.phone` и шла дальше).

**Не переименовываем:** legacy URL `:phone` в admin endpoints, колонку `ai_profiles_consolidated.user_id` (она уже корректно), SQL-параметры в `WHERE user_id=$1`.

### Frontend

Не зависит от названия JWT-поля. Никаких изменений во фронте от rename'а.

## Ошибки

| Сценарий | Поведение |
|----------|-----------|
| Tempmail домен | 400 «Используйте постоянную почту» |
| Magic-link токен протух/использован | 400 «Ссылка устарела» + кнопка «Получить новую» |
| OAuth state не совпадает | 400 «Сессия истекла, попробуй снова» |
| OAuth не отдал email | 400 «Для входа нужен доступ к email» |
| OAuth `email_verified=false` | Создаём юзера БЕЗ merge'а. Welcome bonus выдаём |
| `linkMethod` conflict | 409 «Этот метод привязан к другому аккаунту. Для объединения напишите в саппорт» |
| `unlinkMethod` на последнем identity | 400 «Это твой единственный способ входа, нельзя отвязать» |
| Rate-limit на email | 429 «Слишком частые запросы, подожди минуту» |
| Refresh token | Работает как сейчас, `userId` из refresh-payload |

## Edge cases

- **Legacy email vs OAuth email.** Существующий phone-юзер имеет declarative email в profile (без верификации). Новый юзер логинится через Google с тем же email → НЕ merge'им, создаётся отдельный аккаунт. Старый юзер может попытаться через Settings → linkMethod, получит 409, в саппорт.
- **Юзер кликнул magic-link дважды.** Второй клик 400 (токен потреблён первым).
- **Юзер залогинился через два таба.** Каждый получает свой JWT.
- **Юзер удалил identities кроме phone, потом потерял phone.** Тот же риск что сейчас при phone-only — `unlinkMethod` не даёт удалить последний.

## Debug-эндпоинт

`GET /webhook/debug/email-token/:email` — возвращает активный magic-link токен. Гейт: `DEBUG_SMS_CODES=true` (тот же флаг, что для SMS).

## Тестирование

**Unit (Jest, `tests/unit/`):**
- `identity-resolveOrCreate.test.js` — три пути: lookup-existing, merge-by-verified-email, create-new.
- `identity-link-unlink.test.js` — link OK, link conflict, unlink last-method refused.
- `identity-welcome-bonus.test.js` — идемпотентность.
- `email-tempmail.test.js` — blocklist отсекает.

**Integration (`tests/api.test.js`):**
- Новые routes `/webhook/auth/*` — паттерн 401 без токена / 400 на битом теле.

**E2E (`tests/e2e.test.js`):**
- `loginWithMagicLink(email)` — `POST /auth/email/request` → `GET /debug/email-token/:email` → `GET /auth/email/confirm` → проверка JWT.
- OAuth flows в e2e: моки не пишем (реальные сервисы), проверяем только что `/auth/oauth/*` валидирует state/code.

**Smoke (Playwright):**
- Onboarding с табами: переключение работает.
- Existing SMS login — регрессия должна жить.

## Что НЕ делаем в MVP

- Apple Sign In, VK ID, Telegram Login — отдельные провайдеры, в этой версии не добавляем.
- Полный wizard merge-конфликтов — пока ручной саппорт.
- 2FA — отдельная фича.
- Биометрия / WebAuthn — отдельная фича.
- Sliding session / device list — отдельная фича.
- Уведомления о новом входе («залогинился из новой локации») — отдельная фича.

## Open questions

1. **Email-провайдер для magic-link.** Resend / SendPulse / Yandex.Sender / Mail.ru / SES. Решить до плана реализации — влияет на ENV-vars и зависимости. Предложение: **Resend** (простой API, ~$0.001/email, дешевле SMS Aero) для MVP. Если Resend будет фейлить с российскими доменами — переключиться на Yandex.Sender.
2. **OAuth client credentials.** Нужно зарегать Google OAuth client и Yandex OAuth app, получить `client_id` + `client_secret`, добавить в `.env` на проде. Это manual setup владельца.
3. **List `disposable-email-domains` версия.** Фиксируем версию пакета в `package.json` (например, `^1.0.0`) — список обновляется. Перепроверять раз в квартал.
