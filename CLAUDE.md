# My.Linkeon (Kindred Spirits) — CLAUDE.md

## Проект

**my.linkeon.io** — веб-приложение для общения с AI-ассистентами (психолог, коуч, юрист и др.) с системой токенов и совместимости пользователей.

- **Prod:** https://my.linkeon.io
- **Repo:** git@github.com:dvvolkovv/spirits.git
- **Frontend (этот репо):** `~/Downloads/spirits_front/`
- **Backend (NestJS):** `~/Downloads/spirits_back/` → деплоится на `ssh -p 60322 dvolkov@82.202.197.230:~/spirits_back/`
- **Сервер (единый для API + статики фронта):** `ssh -p 60322 dvolkov@82.202.197.230`, PM2 процесс `linkeon-api` на порту 3001, статика фронта в `/var/www/spirits/dist/` через Nginx

## Стек

- **React 18** + **TypeScript 5** + **Vite 5**
- **React Router v6** — роутинг
- **Tailwind CSS 3** — стили (утилитарный подход)
- **i18next** — i18n (RU по умолчанию, EN)
- **React Hook Form** — формы
- **Lucide React** — иконки
- Бэкенд — NestJS 10 (`spirits_back`), эндпоинты под префиксом `/webhook/*` (исторически из-за миграции с n8n, формат URL сохранён). JWT HS256, SMS через SMS Aero, PostgreSQL + Redis + Neo4j.

## Команды

```bash
pnpm dev        # dev-сервер (Vite HMR)
pnpm build      # production сборка → /dist
pnpm preview    # предпросмотр production-сборки
pnpm lint       # ESLint
```

Пакетный менеджер: **pnpm** (использовать только его, не npm/yarn).

## Переменные окружения

```env
VITE_BACKEND_URL=https://my.linkeon.io    # единственная среда (staging упразднён)
VITE_MAINTENANCE_MODE=false               # переключает на MaintenancePage
```

## Деплой фронта

```bash
cd ~/Downloads/spirits_front
echo "VITE_BACKEND_URL=https://my.linkeon.io" > .env
pnpm build
rsync -az --delete -e "ssh -p 60322" dist/ dvolkov@82.202.197.230:/var/www/spirits/dist/
```

## Архитектура

### Структура `/src`

```
src/
├── App.tsx                    # Корень: роутинг + AuthProvider
├── main.tsx                   # Точка входа
├── contexts/
│   └── AuthContext.tsx         # Глобальный auth-стейт (useAuth hook)
├── services/
│   ├── apiClient.ts            # HTTP-клиент с автообновлением токенов
│   ├── authService.ts          # SMS/OTP/refresh логика
│   └── avatarService.ts        # Кеширование аватаров
├── utils/
│   ├── tokenManager.ts         # JWT в localStorage (jwt_access_token, jwt_refresh_token)
│   ├── customMarkdown.tsx      # Парсинг кастомных кнопок {{button:...}} и ссылок
│   ├── avatarCache.ts          # Кеш аватаров
│   ├── clearAppStorage.ts      # Очистка localStorage
│   └── timeUtils.ts            # Форматирование времени
├── pages/                     # Тонкие page-обёртки
├── components/                # UI-компоненты по фичам
│   ├── admin/                  # AdminAssistantsView, AdminCouponsView
│   ├── chat/                   # ChatInterface (главный), AssistantSelection
│   ├── chats/                  # ChatsListView, ChatConversationView, ChatView
│   ├── layout/                 # Navigation
│   ├── onboarding/             # PhoneInput, OTPInput, LegalModal, PaymentInfoModal
│   ├── profile/                # ProfileView
│   ├── search/                 # SearchInterface, CompatibilityInterface, UserProfileModal
│   ├── settings/               # SettingsView
│   └── tokens/                 # TokenPackages, CouponInput
├── types/
│   └── auth.ts                 # AuthResponse, RefreshResponse, SMSResponse
├── i18n/
│   ├── index.ts                # i18next конфиг
│   └── locales/{ru,en}.json    # Переводы
└── index.css                   # Глобальные стили
```

### Роутинг (App.tsx)

```
/              → redirect /chat
/chat          → ChatPage (ChatInterface + AssistantSelection)
/profile       → ProfileView
/search        → SearchInterface
/compatibility → CompatibilityPage
/admin         → AdminPage (только для isAdmin=true)
/payment/success → PaymentSuccessPage
/tokens        → TokenPurchasePage (публичный, без auth)
```

Если `!isAuthenticated` → показывает `OnboardingPage` (вместо роутов).
Если `VITE_MAINTENANCE_MODE=true` → показывает `MaintenancePage`.

### Аутентификация

Телефон + SMS OTP, JWT (access + refresh токены).

**Публичные эндпоинты (без Bearer):**
- `GET /webhook/898c938d-f094-455c-86af-969617e62f7a/sms/{phone}` — отправка SMS
- `GET /webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/{phone}/{code}` — верификация OTP

**Защищённые эндпоинты (Bearer access-token):**
- `POST /webhook/auth/refresh` — обновление токенов (тело: refresh-token в Authorization)
- `GET /webhook/profile` — профиль + isAdmin
- `PUT /webhook/profile-update` — обновление профиля
- `DELETE /webhook/profile` — удаление аккаунта
- `GET /webhook/user/tokens/` — баланс токенов
- `GET /webhook/avatar` — получение аватара
- `PUT /webhook/avatar` — загрузка аватара

**localStorage ключи:**
- `authToken` — legacy-совместимость (устаревший)
- `jwt_access_token` — текущий access JWT
- `jwt_refresh_token` — текущий refresh JWT
- `userData` — сериализованный объект User

**Автообновление токена:** `apiClient` при получении 401 вызывает `/webhook/auth/refresh` и повторяет запрос. Очередь ожидающих запросов предотвращает дублирование refresh.

### Система токенов (in-app валюта)

- Новым пользователям: 50 000 токенов
- Баланс обновляется каждые **5 секунд** через `AuthContext` (polling)
- Пакеты: Basic (50K), Extended (200K), Professional (1M) — покупка через YooKassa
- При балансе < 1000 — предупреждение с кнопкой пополнения
- URL-параметр `?view=tokens` на `/chat` открывает модал покупки

**Эндпоинты токенов/оплаты:**
- `POST /webhook/yookassa/create-payment` — создание платежа
- `GET /webhook/payment-status?user_id=...&payment_id=...` — статус платежа

### Кастомный markdown (CustomMarkdown)

В ответах ассистентов поддерживаются кастомные теги:

```
{{button: Текст | action: действие | variant: primary|secondary|success|danger | icon: IconName}}
{{link: Текст | url: /путь}}
```

### Чат с ассистентами

- `ChatInterface.tsx` — главный компонент (streaming через `apiClient.fetchStream()`)
- Поддержка PDF-документов (сканирование через `/webhook/...`)
- Web Speech API для голосового ввода
- Сессии чата хранятся в `localStorage` по ключу `assistant_{id}_messages`
- Синхронизация смены ассистента между вкладками через `localStorage` (polling 10s)

## Бэкенд (NestJS)

> n8n больше не используется — вся логика переехала в NestJS-сервис `spirits_back` на одном сервере `82.202.197.230:60322`. Пути URL (`/webhook/...`) сохранены для обратной совместимости с фронтом.

Модули бэка (см. `~/Downloads/spirits_back/src/`):
`admin`, `agents`, `auth`, `avatar`, `chat`, `dozvon`, `misc`, `neo4j`, `payments`, `profile`, `referral`, `scheduler`, `tokens`.

Ключевые эндпоинты (полный список — в `~/Downloads/spirits_back/CLAUDE.md`):
- Auth: `GET /webhook/{uuid}/sms/:phone`, `GET /webhook/{uuid}/check-code/:phone/:code`, `POST /webhook/auth/refresh`
- Debug OTP: `GET /webhook/debug/sms-code/:phone` (активно при `DEBUG_SMS_CODES=true`)
- Profile: `GET/POST /webhook/profile`, `POST /webhook/profile-update`, `GET /webhook/user-profile?userId=`
- Agents: `GET /webhook/agents`, `POST /webhook/change-agent`
- Chat (streaming NDJSON): `POST /webhook/soulmate/chat`, `GET /webhook/chat/history`
- Tokens/Payments: `GET /webhook/user/tokens/`, `POST /webhook/yookassa/create-payment`, `POST /webhook/coupon/redeem`
- Search/Compat: `POST /webhook/search-mate`, `POST /webhook/analyze-compatibility`
- Referral: `POST /webhook/referral/register`, `GET /webhook/referral/stats`
- Admin: `POST /webhook/admin/coupons`, `POST /webhook/admin/referral`, `GET /webhook/admin/referral/stats`

## Тестовые аккаунты

| Роль | Телефон |
|------|---------|
| Admin (isadmin=true, реферальный лидер) | `79030169187` |
| Test user | `70000000000` |

OTP-код для этих номеров — через `GET /webhook/debug/sms-code/:phone` (работает при `DEBUG_SMS_CODES=true` на бэке).

## Автотесты

Все существующие авто-тесты живут в `~/Downloads/spirits_back/tests/` (см. `~/Downloads/spirits_back/CLAUDE.md`):
- `node runner.js --suite api` — 32 API-теста
- `node runner.js --suite e2e` — 18 E2E с реальной авторизацией
- `bash referral.e2e.sh` — 20 сценариев реферальной системы (запуск на сервере)

## Паттерны кода

### Компоненты
- Page-компоненты в `/pages/` — тонкие обёртки, только роутинг и передача URL-параметров
- Бизнес-логика в компонентах `/components/`
- Хук `useAuth()` — единственный способ доступа к auth-стейту

### API-вызовы
```typescript
// Всегда через apiClient, не через fetch напрямую
const response = await apiClient.get('/webhook/profile');
const response = await apiClient.post('/webhook/...', { data });

// Streaming для чата
const reader = await apiClient.fetchStream('/webhook/chat', { method: 'POST', body: ... });
```

### Переводы
```typescript
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
// Использовать t('key') для всех UI-строк
```

### Стили
- Только Tailwind CSS утилиты
- Тёмная тема не реализована
- Mobile-first: `md:` префикс для десктопа
- На мобиле навигация снизу, на десктопе — боковая панель

## Деплой

Проект деплоится как статический SPA. Сборка: `pnpm build` → `/dist`.
Сервер должен отдавать `index.html` для всех маршрутов (SPA-режим).
