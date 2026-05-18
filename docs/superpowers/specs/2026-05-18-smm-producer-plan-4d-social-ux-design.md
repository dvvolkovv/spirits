# SMM Producer Plan 4d — Social Accounts UX Design

## Goal

Закрыть фронт-сторону Plan 4: дать каждому авторизованному клиенту my.linkeon.io возможность подключать свои соцсети (Telegram, VK, YouTube Shorts, TikTok, Instagram Reels), управлять подключёнными аккаунтами и продолжать диалог с AI-продюсером после OAuth-флоу. Бэкенд (Plan 4) уже готов; здесь — фронт + два минорных бэк-фикса (снять AdminGuard, поменять redirect destination, добавить rate-limit).

## Architecture

Две поверхности UI:
- **Inline в чате** — когда AI-продюсер вызывает tool `connect_social(platform)`, фронт рендерит интерактивный блок (кнопка/форма) прямо в потоке сообщений через CustomMarkdown.
- **`/settings/social`** — отдельный route в SPA для управления списком аккаунтов и подключения вне чата.

Оба переиспользуют два React-компонента: `SocialConnectButton` (OAuth-флоу через redirect) и `TelegramConnectForm` (manual form для TG).

Backend перестаёт быть admin-only — `JwtGuard` + per-user rate-limit. OAuth callback редиректит на `/chat?smm_oauth_success=<platform>` (или на `redirect`-параметр из state, если он был передан — для возврата на `/settings/social`).

## Backend changes (small)

### 1. Снять AdminGuard
- `OAuthController.start` — оставить только `@UseGuards(JwtGuard)`
- `SocialAccountController` (class-level guard) — то же
- Авторизация и так уже per-user через `req.user.phone` и ownership-checks на DELETE

### 2. Rate-limit (per-user)
- На `GET /webhook/smm/oauth/:platform/start` — 5 запросов/час/юзер (`ip-rate-limit.ts` уже есть в codebase, расширить под userId-ключ)
- На `POST /webhook/smm/social-accounts/telegram` — 10 запросов/час/юзер
- Все остальные методы (`GET /social-accounts`, `DELETE`) — без отдельного лимита (idempotent, не вызывают внешних API)

### 3. OAuth callback redirect
- Текущее поведение: `res.redirect('/?smm_oauth_success=vk')`
- Новое: `res.redirect((userRedirect ?? '/chat') + '?smm_oauth_success=vk')`
- Если в `state` был передан `redirect=/settings/social` (приходит с `/settings/social` страницы), возвращаемся туда; иначе по умолчанию в `/chat`
- Ошибка: то же самое с `?smm_oauth_error=...`

### 4. (опционально) Расширить `connect_social` instructions для Telegram
- Текущий текст: "Создай бота через @BotFather..."
- Дополнить: краткая подсказка как взять chat_id (через @userinfobot или просто `@username_канала`)

## Frontend changes

### 1. Types + API client
Создать `src/types/smm.ts` (если нет) или расширить:
```typescript
export type SmmPlatform = 'telegram' | 'vk' | 'youtube' | 'tiktok' | 'instagram';
export interface SocialAccount {
  id: string;
  platform: SmmPlatform;
  displayName: string;
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
}
```

Создать `src/services/socialAccountApi.ts`:
- `listSocialAccounts(): Promise<SocialAccount[]>`
- `createTelegramAccount(body: { botToken, chatId, displayName? }): Promise<{id, displayName, platform}>`
- `deleteSocialAccount(id: string): Promise<{ok: boolean}>`
- `getOAuthStartUrl(platform: 'vk'|'youtube'|'tiktok'|'instagram', redirect?: string): Promise<{authorizeUrl: string}>`

Все через существующий `apiClient` с авто-refresh.

### 2. CustomMarkdown blocks
Расширить `src/utils/customMarkdown.tsx` парсером для двух новых блоков:
- `{{smm_social_connect_button:platform=vk,authorize_url=https://...}}` → `<SocialConnectButton ...>`
- `{{smm_social_connect_telegram:instructions=...}}` → `<TelegramConnectForm instructions={...}>`

**Откуда они берутся:** в `ChatInterface.tsx` (по аналогии с `tool_result` обработкой для scenarios/videos из Plan 3b) — когда в NDJSON-стриме прилетает `tool_result` с `tool_name=connect_social`, фронт инжектит в чат AI-message с соответствующим markdown-тегом, который CustomMarkdown рендерит.

### 3. React-компоненты

`src/components/chat/SocialConnectButton.tsx`:
- Props: `platform`, `authorizeUrl`
- Кнопка с иконкой платформы + текстом "Подключить VK" (локализация по platform)
- onClick → `window.location.href = authorizeUrl`

`src/components/chat/TelegramConnectForm.tsx`:
- Props: `instructions?` (optional override)
- Состояние: `botToken`, `chatId`, `displayName`, `loading`, `error`, `success`
- 3 input'а + кнопка "Подключить"
- onSubmit → `createTelegramAccount(body)`:
  - Успех: показать "Telegram подключён ✓ ${displayName}", дёрнуть колбэк `onConnected?(account)` — родитель (ChatInterface) шлёт в чат "Telegram подключил, продолжай"
  - Ошибка: показать `e.message` под формой
- Линк "Как получить chat_id?" — раскрывает короткую инструкцию

### 4. OAuth callback handler в ChatPage
В `src/pages/ChatPage.tsx` (или `ChatInterface.tsx`) добавить `useEffect`:
```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const success = params.get('smm_oauth_success');
  const error = params.get('smm_oauth_error');
  if (success) {
    toast.success(`${platformLabel(success)} подключён`);
    history.replaceState({}, '', '/chat');
    sendMessageToAssistant(`Соцсеть ${success} подключил, продолжай.`);
  } else if (error) {
    toast.error(`Не удалось подключить: ${decodeURIComponent(error)}`);
    history.replaceState({}, '', '/chat');
  }
}, []);
```

Нужен toast-провайдер. Если в проекте уже есть (проверить — выглядит как нет, скорее всего нужен `react-hot-toast` или простой свой). Самое лёгкое — добавить `react-hot-toast`.

### 5. Route `/settings/social`
Создать `src/pages/SettingsSocialPage.tsx`:
- Auth-guard (если `!isAuthenticated` → redirect `/`)
- Render `<SettingsSocialView>`

Создать `src/components/settings/SettingsSocialView.tsx`:
- На mount: `listSocialAccounts()` → state
- Top: 5 кнопок-карточек по платформам с надписью "Подключить TG/VK/YT/TT/IG"
  - TG → открывает модал с `<TelegramConnectForm>` (переиспользуем)
  - Остальные 4 → `getOAuthStartUrl(platform, '/settings/social')` → `window.location.href = authorizeUrl`
- Bottom: список подключённых аккаунтов (таблица):
  - platform icon | displayName | status | createdAt | [×]
  - При клике × → confirm dialog → `deleteSocialAccount(id)` → обновить список
- Тот же `useEffect` для callback-handler что в ChatPage

Добавить route в `App.tsx`:
```typescript
<Route path="/settings/social" element={<SettingsSocialPage />} />
```

### 6. Navigation link
В `src/components/layout/Navigation.tsx` добавить пункт "Соцсети" в боковую/нижнюю навигацию для авторизованных юзеров. Иконка: `Share2` из `lucide-react`.

## Что НЕ делаем (out of scope для 4d)

- Бэкенд-фиксы из ревью Plan 4 (admin gate на агента, IG shortcode URL, TikTok username, YT refresh persistence) — отдельный план, не блокирует UX.
- Множественные аккаунты на одну платформу — `smm_social_account` пока 1 на (user, platform). UI рендерит как есть.
- Onboarding-tutorial первого подключения — простой flow + tooltips, без отдельной разводки.
- E2E тесты OAuth-флоу — требуют реальных платформенных credentials. Smoke только для Telegram (доступен сразу).

## Open items (резолвить во время имплементации)

- **Toast-библиотека:** если в проекте нет, добавить `react-hot-toast` (~5KB gzipped) и `<Toaster />` в App.tsx
- **Платформенные иконки:** lucide-react не имеет TikTok/VK/Instagram отдельных иконок; брать `Share2` для всех или вставлять SVG inline
- **chat_id хелпер:** одна короткая инструкция (3-4 строки) на русском в expandable-блоке формы

## Acceptance criteria

1. Клиент логинится в my.linkeon.io → пишет в чат "хочу постить в Telegram" → AI предлагает подключить → форма появляется inline → клиент вводит `botToken` + `chatId` → форма валидирует через backend → "Подключён" → AI продолжает с публикацией.
2. Клиент с другой соцсетью (VK) → кликает "Подключить VK" → новая вкладка с vk.com consent → авторизуется → редирект на `/chat?smm_oauth_success=vk` → toast зелёный, query чистится, AI продолжает.
3. Клиент идёт в `/settings/social` → видит список подключённых аккаунтов с display_name и датой → может удалить аккаунт через × с confirm.
4. Если клиент кликает "Подключить TikTok" в настройках до того как админ положил `TIKTOK_OAUTH_CLIENT_KEY` в `.env` → бэк возвращает 500 "TIKTOK_OAUTH_CLIENT_KEY not configured" → фронт показывает toast "TikTok пока недоступен".
