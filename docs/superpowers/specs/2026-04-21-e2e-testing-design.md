# E2E-тестирование my.linkeon.io — дизайн

**Дата:** 2026-04-21
**Автор:** Dmitry + Claude
**Статус:** Approved (brainstorm), готов к writing-plans

## 1. Цель

Покрыть пользовательские потоки my.linkeon.io автоматическими тестами двух уровней:

- **API smoke + backend E2E** — уже существуют в `spirits_back/tests/` (32 API + 18 E2E + 20 referral). Оставляем как есть, не трогаем.
- **Frontend E2E через Playwright** — **новый слой**, покрывает 10 критических UI-потоков в реальном браузере на живой prod-среде.

## 2. Среда

- Единая prod-среда: `https://my.linkeon.io`.
- Staging (`b.linkeon.io`) упразднён.
- Backend: NestJS `spirits_back`, сервер `82.202.197.230:60322`.
- Тесты работают только под выделенными тестовыми номерами и только с моками для необратимых операций (YooKassa).

## 3. Принципы

1. **Safe-on-prod:** тесты выполняются на живой среде, поэтому:
   - Используем только тестовые номера `70000000000` и `79030169187`.
   - В helper-ах явный guard: при попытке использовать произвольный номер — падаем до выполнения.
   - YooKassa-платежи всегда моккаются на уровне browser route; реальных списаний нет.
   - После каждого теста — автоматический cleanup (сброс изменений профиля, очистка истории чата, возврат токенов).
2. **Не дублируем backend-тесты.** Если путь уже покрыт в `spirits_back/tests/api.test.js` или `e2e.test.js`, на фронте проверяем только UI-поведение, не повторяя ассерты бизнес-логики.
3. **Изоляция тестов.** Каждый `.spec.ts` в `flows/` независим: может запускаться в изоляции, имеет собственный setup/teardown, не полагается на порядок выполнения.
4. **Стабильные селекторы.** Для ключевых элементов добавляем `data-testid`; role/text — fallback.
5. **Ручной запуск.** CI/auto-trigger в этой итерации НЕ делаем. Только `pnpm test:e2e` руками перед деплоем.

## 4. Архитектура

```
spirits_front/
├── playwright.config.ts                 ← конфиг Playwright (root-level)
├── tests/
│   └── e2e/
│       ├── fixtures/
│       │   ├── auth.fixture.ts           ← расширение test.extend с автологином
│       │   └── cleanup.fixture.ts        ← регистрация teardown-хуков
│       ├── helpers/
│       │   ├── otp.ts                    ← fetchOtp(phone): GET /webhook/debug/sms-code/:phone
│       │   ├── login.ts                  ← loginViaApi(phone) → { accessToken, refreshToken, user }
│       │   ├── mockYookassa.ts           ← page.route() для /yookassa/create-payment
│       │   ├── cleanup.ts                ← resetProfile, clearChatHistory, resetTokens
│       │   ├── testData.ts               ← TEST_PHONES, TEST_ACCOUNTS, TEST_ASSISTANT_IDS
│       │   └── guards.ts                 ← assertIsTestPhone(phone) throws иначе
│       ├── flows/
│       │   ├── 01-onboarding.spec.ts
│       │   ├── 02-chat.spec.ts
│       │   ├── 03-assistant-switch.spec.ts
│       │   ├── 04-profile.spec.ts
│       │   ├── 05-tokens-purchase.spec.ts
│       │   ├── 06-coupon.spec.ts
│       │   ├── 07-search-compatibility.spec.ts
│       │   ├── 08-admin.spec.ts
│       │   ├── 09-referral.spec.ts
│       │   └── 10-mobile-layout.spec.ts
│       ├── .auth/                        ← gitignored, хранит storageState
│       │   ├── test-user.json
│       │   └── test-admin.json
│       └── README.md
└── package.json                          ← +scripts: test:e2e, test:e2e:ui, test:e2e:debug
```

Backend-тесты и referral E2E остаются в `spirits_back/tests/` без изменений.

## 5. Потоки (flows)

Каждый flow — один `.spec.ts` файл. Каждый — идемпотентный (перед запуском cleanup приводит данные тестового аккаунта к известному состоянию).

### 5.1. `01-onboarding.spec.ts`

**Аккаунт:** `70000000000` (предварительно logout).
**Шаги:**
1. Открыть `https://my.linkeon.io/`.
2. Увидеть `OnboardingPage` (`data-testid="onboarding-root"`).
3. Ввести телефон `70000000000` → Next.
4. На `OTPInput` — дождаться, пока фронт отправил запрос на SMS (перехват через `waitForResponse`), затем получить код через `fetchOtp("70000000000")`.
5. Ввести код → submit.
6. Принять legal modal, если показан.
7. Убедиться, что произошёл redirect на `/chat`.
8. Увидеть `AssistantSelection` и первое приветственное сообщение.

### 5.2. `02-chat.spec.ts`

**Аккаунт:** test-user (через storageState).
**Шаги:**
1. Открыть `/chat`, выбрать первого ассистента в списке.
2. Получить текущий баланс токенов (через UI-элемент `data-testid="token-balance"`).
3. Отправить сообщение "Привет, ты работаешь?".
4. Дождаться стриминга: ответ появляется постепенно в `data-testid="assistant-message"`. Таймаут 60 с.
5. Проверить, что финальный ответ непустой.
6. Дождаться обновления баланса (polling 5 с на фронте). Новый баланс должен быть строго меньше старого.
**Cleanup:** `DELETE /webhook/chat/history?assistantId=...` через `apiCleanup.clearChatHistory()`.

### 5.3. `03-assistant-switch.spec.ts`

**Аккаунт:** test-user.
**Шаги:**
1. Открыть `/chat`, выбрать ассистента A, отправить сообщение "Сообщение A".
2. Переключить ассистента на B (клик по аватару в `AssistantSelection`).
3. История B должна быть пустой (или своей, не от A).
4. Отправить "Сообщение B", получить ответ.
5. Переключить обратно на A → "Сообщение A" должно остаться в истории.
**Cleanup:** очистка истории обоих ассистентов.

### 5.4. `04-profile.spec.ts`

**Аккаунт:** test-user.
**Шаги:**
1. Открыть `/profile`.
2. Проверить отображение values/beliefs/desires/intents/interests/skills (Neo4j). Допустимо пусто, но секции должны рендериться.
3. Кликнуть "Редактировать" → изменить поле `firstName` на уникальное значение (например, `E2E-Test-{timestamp}`).
4. Сохранить.
5. Перезагрузить страницу → убедиться, что новое значение подгрузилось с бэка.
**Cleanup:** восстановить исходное значение `firstName` (запомнить до изменения, вернуть в `afterEach`).

### 5.5. `05-tokens-purchase.spec.ts`

**Аккаунт:** test-user.
**Моки:**
- `page.route('**/yookassa/create-payment', …)` → `{ confirmation_url: '/payment/success?fake=1&payment_id=test-pw-001' }`.
- После "успеха" вызываем новый debug-эндпоинт `POST /webhook/debug/add-tokens/70000000000/50000` (см. § 8).
**Шаги:**
1. Открыть `/tokens`.
2. Зафиксировать текущий баланс.
3. Клик на пакет Basic (50k).
4. Фронт делает запрос на create-payment → мок возвращает success-URL.
5. Редирект на `/payment/success`.
6. Дёрнуть debug-эндпоинт `add-tokens` (имитация колбэка YooKassa).
7. Вернуться на `/chat` → через ≤ 10 с баланс должен увеличиться на 50k.
**Cleanup:** откат через `POST /webhook/debug/add-tokens/70000000000/-50000`.

### 5.6. `06-coupon.spec.ts`

**Аккаунт:** test-user.
**Prep:** создать тестовый купон через admin API (`POST /webhook/admin/coupons {action: "create"}`) с кодом `E2E-PW-{timestamp}` и значением 1000 токенов.
**Шаги:**
1. Открыть `/tokens`.
2. Ввести код купона в `CouponInput`.
3. Submit.
4. Увидеть success-сообщение.
5. Баланс увеличился на 1000.
**Cleanup:** удалить купон через admin API + откатить токены.

### 5.7. `07-search-compatibility.spec.ts`

**Аккаунт:** test-user.
**Шаги:**
1. Открыть `/search`.
2. Ввести запрос (например, "единомышленник").
3. Дождаться стриминга результатов (NDJSON с `search_result`).
4. Кликнуть первого пользователя → `UserProfileModal`.
5. Нажать "Проверить совместимость" → переход на `/compatibility` с param `userId`.
6. Дождаться стриминга markdown-анализа.
7. Проверить непустой результат.
**Cleanup:** нет side effects.

### 5.8. `08-admin.spec.ts`

**Аккаунт:** admin `79030169187`.
**Шаги:**
1. Открыть `/admin`.
2. Проверить вкладку Ассистенты — список непустой.
3. Проверить вкладку Купоны — CRUD (создать тестовый, удалить).
4. Проверить вкладку Рефералы — отображение summary + лидеры.
**Cleanup:** удалить созданный купон.

### 5.9. `09-referral.spec.ts`

**Аккаунт:** отдельный референс-юзер (создаётся и удаляется в рамках теста через SSH + SQL, аналогично `referral.e2e.sh`).
**Шаги:**
1. Получить slug test-leader `79030169187` через `GET /webhook/referral/stats`.
2. Открыть `https://my.linkeon.io/?ref={slug}` в чистом контексте (без storageState).
3. Пройти onboarding новым фейковым номером (формат `790300XXXXX`, генерится перед тестом).
4. После регистрации — SQL-проверка через SSH: связь `referrer → referee` создана в `referral_registrations`.
**Cleanup:** `DELETE FROM users WHERE phone='...'` + каскад по FK через SSH.

> Альтернатива для упрощения: использовать существующий `referral.e2e.sh` для этого потока и не делать UI-тест. **Решение:** оставить Playwright-версию как дополнение, чтобы проверить именно UI-поведение (`?ref=...` парсится, передаётся в onboarding). Backend-логику referral.e2e.sh уже покрывает — дублировать не нужно.

### 5.10. `10-mobile-layout.spec.ts`

**Аккаунт:** test-user.
**Viewport:** 375×812 (iPhone 13).
**Шаги:**
1. Открыть `/chat` — увидеть bottom nav (`data-testid="mobile-bottom-nav"`).
2. Навигация: clicks по иконкам Chat / Profile / Search / Settings.
3. На каждой вкладке — smoke-проверка, что контент отрисовался (не пустой экран).
4. Мобильный keyboard-поток в onboarding не тестируем (уже покрыто в 01 на desktop).

## 6. Инфраструктурные компоненты

### 6.1. Helpers

**`helpers/otp.ts`:**
```ts
export async function fetchOtp(phone: string): Promise<string> {
  assertIsTestPhone(phone);
  const res = await fetch(`${BASE_URL}/webhook/debug/sms-code/${phone}`);
  if (!res.ok) throw new Error(`OTP fetch failed: ${res.status}`);
  const { code } = await res.json();
  return code;
}
```

**`helpers/login.ts`:**
Используется в `globalSetup`: пробегает API-потоком (`/sms/:phone` → `/check-code/:phone/:code`), сохраняет `jwt_access_token`, `jwt_refresh_token`, `userData` в `localStorage` через `page.context().addInitScript` или `storageState`.

**`helpers/mockYookassa.ts`:**
```ts
export async function mockYookassaCheckout(page: Page, amountTokens: number) {
  await page.route('**/yookassa/create-payment', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        payment_id: `test-pw-${Date.now()}`,
        confirmation_url: `/payment/success?fake=1&amount=${amountTokens}`,
        status: 'pending',
      }),
    });
  });
}
```

**`helpers/cleanup.ts`:**
- `clearChatHistory(assistantId)` → `DELETE /webhook/chat/history`.
- `resetProfile(originalData)` → `POST /webhook/profile-update`.
- `resetTokens(phone, delta)` → `POST /webhook/debug/add-tokens/:phone/:delta` (см. § 8).
- `deleteCoupon(code)` → admin API.

**`helpers/guards.ts`:**
```ts
const TEST_PHONES = ['70000000000', '79030169187'] as const;
// Диапазон для временных referral-аккаунтов (flow 09). Бэкенд-guard на
// /webhook/debug/sms-code/:phone и /webhook/debug/add-tokens дублирует
// ту же проверку.
const TEST_PHONE_PATTERN = /^790300\d{5}$/;

export function assertIsTestPhone(phone: string): void {
  if (TEST_PHONES.includes(phone as any)) return;
  if (TEST_PHONE_PATTERN.test(phone)) return;
  throw new Error(`SAFETY: only test phones allowed, got: ${phone}`);
}
```

Соответственно, backend debug-эндпоинты (§ 8) валидируют телефон по тому же правилу: фиксированный whitelist + регекс `^790300\d{5}$`.

### 6.2. Fixtures

**`fixtures/auth.fixture.ts`:**
Расширение Playwright `test` с двумя projects:
```ts
export const test = baseTest.extend<{ authAs: 'user' | 'admin' }>({
  authAs: ['user', { option: true }],
});
```
Playwright config задаёт два project-а:
- `auth-user` → storageState = `.auth/test-user.json`.
- `auth-admin` → storageState = `.auth/test-admin.json`.

**`fixtures/cleanup.fixture.ts`:**
Регистрация teardown-функций через `test.afterEach(async ({}, testInfo) => {...})`, которые читают cleanup-очередь из test-контекста и исполняют её.

### 6.3. playwright.config.ts

- `baseURL: 'https://my.linkeon.io'`
- `globalSetup: './tests/e2e/global-setup.ts'` — выполняет `login` под оба аккаунта один раз, пишет `.auth/*.json`.
- Browsers: chromium + webkit (safari-desktop-пути). Firefox опционально (можно отложить).
- `workers: 1` в первой итерации — последовательно, чтобы не ловить race-condition по общим тестовым аккаунтам. Позже можно параллелить с уникальными аккаунтами на каждый worker.
- `reporter: [['list'], ['html', { open: 'never' }]]`.
- Таймауты: `timeout: 60_000` (для стрим-тестов), `actionTimeout: 15_000`.
- Retries: `2` локально, чтобы сгладить flakey-стрим.

### 6.4. package.json scripts

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "PWDEBUG=1 playwright test",
    "test:e2e:headed": "playwright test --headed"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0"
  }
}
```

## 7. Data-testid — список

Изменения в `src/components/*`: точечное добавление `data-testid` в ~30 мест. Полный список в плане имплементации, здесь — ключевые:

- `onboarding-root`, `phone-input`, `phone-submit-btn`, `otp-input-0..5`, `legal-accept-btn`
- `chat-root`, `assistant-selection`, `assistant-item-{id}`, `chat-input`, `send-message-btn`, `assistant-message`, `user-message`, `token-balance`
- `profile-root`, `profile-field-firstName`, `profile-edit-btn`, `profile-save-btn`
- `tokens-root`, `token-package-basic`, `token-package-extended`, `token-package-pro`, `coupon-input`, `coupon-submit-btn`
- `search-root`, `search-input`, `search-result-{index}`, `user-profile-modal`, `check-compatibility-btn`
- `admin-root`, `admin-tab-assistants`, `admin-tab-coupons`, `admin-tab-referral`
- `mobile-bottom-nav`, `nav-chat`, `nav-profile`, `nav-search`, `nav-settings`

Существующие id в HTML/CSS классы не трогаем; `data-testid` — параллельный атрибут.

## 8. Новый backend-эндпоинт

**`POST /webhook/debug/add-tokens/:phone/:amount`**

- Гейтится флагом `DEBUG_SMS_CODES=true` (переиспользуем существующий env-флаг).
- Валидация: `phone` должен соответствовать whitelist `['70000000000', '79030169187']` ИЛИ регексу `^790300\d{5}$` (временные referral-аккаунты). Та же проверка добавляется в существующий `GET /webhook/debug/sms-code/:phone`.
- `amount` может быть отрицательным (для cleanup).
- Выполняет `UPDATE users SET tokens = tokens + $amount WHERE phone = $phone` + запись в audit-лог.
- Возвращает `{ phone, balance_before, balance_after }`.

Это небольшое изменение в `spirits_back` (модуль `tokens/` или новый `debug/`). План имплементации бэкенда — отдельной секцией в implementation plan.

## 9. Что НЕ входит в эту итерацию (YAGNI)

- Параллельный запуск (несколько workers) — позже, когда стабилизируем.
- CI/GitHub Actions — позже.
- Cross-browser matrix (Firefox, мобильный Safari на симуляторе) — сначала chromium + desktop webkit.
- Визуальная регрессия (screenshots diff) — не сейчас.
- Тесты под реальными пользовательскими аккаунтами — запрещено.
- Реальная интеграция с YooKassa — только моки.

## 10. Критерии готовности

- [ ] `pnpm test:e2e` проходит все 10 flows на чистом запуске.
- [ ] Повторный запуск без cleanup между — тоже проходит (идемпотентность).
- [ ] Добавленные `data-testid` не ломают существующий UI/стили.
- [ ] `spirits_back` содержит работающий `/webhook/debug/add-tokens/:phone/:amount`, гейт по env.
- [ ] Существующие `spirits_back/tests/` (50 тестов) продолжают проходить.
- [ ] В `README.md` внутри `tests/e2e/` есть инструкция запуска и описание каждого flow.
- [ ] CLAUDE.md фронта обновлён: добавлена секция Playwright-тестов и команда запуска.

## 11. Следующий шаг

После утверждения спеки — генерируется implementation plan (через skill `writing-plans`) с разбивкой на задачи:
1. Установка и конфиг Playwright.
2. Backend: добавление `/webhook/debug/add-tokens`.
3. Helpers + fixtures + globalSetup.
4. Добавление `data-testid` в компоненты.
5. Реализация flows по одному, с проверкой идемпотентности.
6. README + обновление CLAUDE.md.
