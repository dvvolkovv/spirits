# Telegram-боты на базе Linkeon — дизайн

**Статус:** Design draft
**Дата:** 2026-06-08
**Авторы:** Дмитрий (постановка), Claude (дизайн)

## 1. Цели и не-цели

### Цели

Linkeon-пользователь создаёт в своём кабинете «бота для Telegram-группы» — выбирает роль (пресет или свою кастомную), режим реагирования, имя, голосовое поведение — и добавляет существующего общего бота `@LinkeonAgentBot` к нужной группе через нативный Telegram-флоу. В группе бот понимает текст и голос (Whisper STT), отвечает по правилам, может отвечать голосом (OpenAI TTS), списывает Linkeon-токены с владельца.

Параллельно вводится единая личная библиотека кастомных агентов — общая с веб-чатом `/chat`.

### Не-цели (MVP)

- Отдельные `@username` для каждого клиента (multi-bot model)
- Каналы Telegram (только группы и супергруппы)
- Передача владения группой между Linkeon-пользователями
- 1-on-1 полноценный чат с ботом в DM (DM = только onboarding + системные уведомления)
- ElevenLabs / премиум-голоса
- Расширенный дашборд по ботам в админке (минимальные счётчики — да, дашборд — позже)
- TTS на других провайдерах кроме OpenAI

## 2. Идентичность бота и onboarding-флоу

### Один общий бот

`@LinkeonAgentBot` (имя финальное согласуем перед регистрацией). Регистрируется один раз в BotFather от нашего рабочего аккаунта. Настройки:

- `/setprivacy → Disable` (бот видит все сообщения в группе, нужно для режимов B/C и для триггера по display_name в любом сообщении)
- `/setjoingroups → Enable`
- `/setcommands` — заполняется списком из секции 5
- `setWebhook` — вызывается через API при деплое (idempotent, в `tg-bot.module.ts → onModuleInit`)

Webhook: `POST https://my.linkeon.io/webhook/telegram/<URL_SECRET>` + header `X-Telegram-Bot-Api-Secret-Token: <HEADER_SECRET>`. Двойная защита: URL-секрет от случайного бот-скана + header-секрет от подделки источника.

### Двухшаговый onboarding (обязательный, единожды per пользователь)

**Шаг 1 — Identity binding (в DM с ботом)**

```
UI Linkeon: «Подключить Telegram»
  → backend генерирует AUTH_TOKEN (UUIDv4, TTL 15 мин)
  → фронт даёт deep link: t.me/LinkeonAgentBot?start=AUTH_TOKEN
  → пользователь жмёт → Telegram открывает DM → автоматически шлёт `/start AUTH_TOKEN`
  → бэк по AUTH_TOKEN линкует tg_user_id ↔ linkeon_user_id
    (одноразово per пользователь, токен → consumed)
  → бот отвечает в DM: «Привет, <first_name>. Telegram привязан»
```

**Шаг 2 — Group claim (для каждого создаваемого бота)**

```
UI Linkeon: «Создать бота» → форма (роль / режим / имя / voice_mode)
  → backend создаёт `tg_bot_configs` со status='pending' + CLAIM_TOKEN (UUIDv4, TTL 15 мин)
  → фронт даёт deep link: t.me/LinkeonAgentBot?startgroup=CLAIM_TOKEN
  → пользователь жмёт → Telegram открывает picker «выбери группу»
  → пользователь выбирает группу → Telegram добавляет бота → автоматически шлёт `/start CLAIM_TOKEN` в выбранную группу
  → бэк по CLAIM_TOKEN привязывает pending-config к tg_chat_id, ставит status='active'
  → бот пишет в группе приветствие: «Я <display_name>, <role.description>.
     Зови меня @LinkeonAgentBot или ответом на это сообщение»
```

### Безопасность токенов

- `AUTH_TOKEN` и `CLAIM_TOKEN` — UUIDv4, одноразовые, TTL 15 минут
- Инвалидируются после успешной привязки (`consumed_at` ставится)
- При повторном использовании — отказ (silent в группе, DM претенденту с описанием)
- При попытке привязать конфиг к уже занятой группе — отказ + DM претенденту «эта группа уже используется другим Linkeon-аккаунтом»

## 3. Библиотека агентов (роли)

### Источники ролей в форме создания бота

- **Пресеты Linkeon** — текущий каталог из бэкового модуля `agents` (психолог/коуч/юрист/финансист/универсал и т.д.), без копий. Бот использует тот же `system_prompt`, что и веб-чат — изменения в пресете автоматически прилетают всем активным ботам с этой ролью
- **Кастомные роли пользователя** — личная библиотека (`custom_agents`), CRUD-управление в новом разделе UI «Мои агенты». Видна и в селекторе ассистента на `/chat` (отдельная секция «Мои» с бейджем), и в форме создания бота

### Создание кастомной роли — гибрид-флоу

```
1. Пользователь пишет одну строку: «Хочу саркастичного кинокритика, любит Тарантино»
2. Backend вызывает Claude (Haiku 4.5) — генерирует draft system_prompt по шаблону
   (стоимость генерации — за наш счёт, копейки, одноразово на агента)
3. Превью на фронте: имя (редактируемое), сгенерированный system_prompt (редактируемая textarea)
4. Кнопка «Сохранить» → запись в custom_agents
5. Сразу доступна в /chat и в форме «создать бота»
```

### Жизненный цикл кастомного агента

- Удаление Linkeon-аккаунта → каскадное удаление кастомных агентов (FK ON DELETE CASCADE)
- Удаление кастомной роли при наличии активного бота с ней → блок через FK (`tg_bot_configs.custom_agent_id` REFERENCES без CASCADE), фронт показывает: «эта роль используется в N ботах: <список>. Отвяжи или удали их сначала»
- Изменение `system_prompt` кастомного агента — мгновенно применяется ко всем активным ботам (читается по `custom_agent_id` в момент обработки)

## 4. Режимы реагирования и голос

### Три режима реагирования

| Режим | Триггер ответа | Что списываем с владельца |
|---|---|---|
| **A — Strict** (default) | `@LinkeonAgentBot` упомянут / реплай на сообщение бота / в тексте встречается `display_name` конфига (case-insensitive substring) / `/команда` боту | Только реальный ответ (claude + опц. TTS) |
| **B — Always** | Каждое не-сервисное сообщение в группе | Каждый ответ (claude + опц. TTS). Жёсткий rate-limit 3 сек между ответами |
| **C — Smart** | Гейт через Haiku 4.5 решает per-message «стоит ли вмешаться» (yes/no). Если yes → полный ответ от агента | Только реальные ответы. За гейт-вызовы — не списываем (на нас). Rate-limit 60 сек между ответами |

### Общие правила (захардкожены, не настраиваются)

- Игнорируем сообщения от других ботов (`message.from.is_bot === true`) — анти-петля
- Игнорируем service-сообщения (`new_chat_members`, `left_chat_member`, `pinned_message`, `migrate_*` и т.д.)
- Если `status='silent'` (от команды `/silent`) — не отвечаем вообще
- При `balance ≤ 0` — не отвечаем (см. секцию 5)

### Display name для триггера в режиме A

- Поле `display_name` в конфиге, свободный текст, default = имя выбранной роли
- Простой case-insensitive substring-match по тексту сообщения и по транскриптам voice
- Подсветка в UI при создании: «бот будет реагировать, если в сообщении встретится "<display_name>"»

### Голосовой pipeline

**Voice in (всегда транскрибируем, за наш счёт):**

```
Telegram voice/audio_note → скачиваем .oga через getFile + downloadFile
  → Whisper API (model=whisper-1, $0.006/мин — за наш счёт)
  → текст транскрипта → дальше как обычное текстовое сообщение
  Транскрипт сохраняется в tg_bot_messages.content с content_type='voice_transcript'
```

**Voice out (только если правило `voice_reply_mode` срабатывает):**

```
LLM-ответ (текст) → OpenAI TTS (model=tts-1, $0.015/1000 символов)
  → .ogg/opus файл → Telegram sendVoice → реплай (reply_to_message_id) в группе
  Стоимость TTS включается в формулу tokens_charged (см. секцию 5)
```

**Поле `voice_reply_mode` в конфиге (3 значения):**

- `never` — всегда текстом, независимо от входа (default)
- `mirror` — голос на голос, текст на текст
- `always` — всегда голосом, независимо от входа

## 5. Биллинг, баланс, команды, lifecycle

### Формула списания токенов (общая с `/chat`)

```
tokens_charged = ceil( (claude_input_output_usd + openai_tts_usd) × 100_000 )
```

| Что | Кто платит |
|---|---|
| LLM-ответ ассистента (Claude) | Пользователь (входные + выходные токены реальной модели → USD → формула) |
| TTS-озвучка (OpenAI TTS) | Пользователь (по символам ответа) |
| STT-транскрипция (Whisper) | Linkeon (на нас) |
| Гейт-вызов в режиме C (Haiku) | Linkeon (на нас) |
| Генерация system_prompt при создании кастомной роли | Linkeon (на нас) |

Списание выполняется в той же транзакции, что вставка сообщения бота в БД (`tg_bot_messages.tokens_charged`) и обновление `tokens_ledger` (используем существующий `TokensService.deduct`).

В чате — тихо, без меток стоимости в сообщениях.

### Алерты и пороги баланса

- `balance < 1000` (порог = `LOW_BALANCE_THRESHOLD`, env) → бот шлёт DM владельцу: «Баланс <1000 токенов на боте `<display_name>`, пополни» + inline-кнопка с deep link на `/tokens`. Кулдаун — 1 раз/сутки на конфиг (`last_low_balance_dm_at`)
- `balance ≤ 0` → бот один раз пишет в группу: «У владельца закончились токены, [пополнить]» с inline-кнопкой на `/tokens`. Зафиксирован `last_zero_balance_msg_at`, дальнейшие сообщения игнорируются до пополнения
- Re-check баланса — реактивно, на событие изменения `tokens_ledger` (через Redis pub/sub либо периодический cron каждые 5 мин — выбор за phase планирования)

### Команды бота

| Команда | Где работает | Кто может | Что делает |
|---|---|---|---|
| `/start [TOKEN]` | DM или группа | Все | В DM с AUTH_TOKEN — identity binding; в группе с CLAIM_TOKEN — claim; без TOKEN — приветствие |
| `/help` | Группа | Все | Показывает: `display_name`, имя роли, текущий режим, список команд |
| `/balance` | Группа | Только владелец | Реплай с балансом + кнопка «пополнить». Чужим: «Эта команда доступна только владельцу бота» |
| `/silent` | Группа | Только владелец | `status='silent'`, бот замолкает до `/resume`. Подтверждение в реплае |
| `/resume` | Группа | Только владелец | `status='active'`, бот снова реагирует |

Определение «владелец» в группе — по `from.id === tg_user_id` из `tg_user_identities` владельца конфига.

### Lifecycle конфига

| Событие | Действие |
|---|---|
| Бот кикнут из группы (`my_chat_member` с new_status=`left`/`kicked`) | `status='archived'`, DM владельцу «бот удалён из <chat_title>» |
| Владелец удаляет в UI (`DELETE /webhook/tg-bot/configs/:id`) | `leaveChat()` через grammy, `status='archived'`, тихо (без прощального сообщения в группе) |
| Конфликт claim (группа уже привязана) | Отказ в группе тихо, DM претенденту |
| Чат — канал (`chat.type === 'channel'`) при `/start CLAIM_TOKEN` | Отказ, `leaveChat()` сразу, DM претенденту: «бот работает только в группах» |
| Удаление Linkeon-аккаунта | Каскад: `leaveChat()` во всех `status='active'` → всем `status='deleted'`. История анонимизируется (`owner_user_id = NULL` в `tg_bot_messages`), purge через 90 дней |
| Истёкший `tg_claim_tokens.expires_at` | Запись + связанный pending-config удаляются крон-задачей ежечасно |

### Контекст для LLM

- Последние **20 сообщений группы** (`tg_bot_messages` где `config_id` совпадает), отсортированные по `created_at`, преобразуются в массив для Claude:
  ```
  [<from.first_name>]: <content>      (для user/system)
  [Bot]: <content>                     (для assistant)
  ```
- В system prompt добавляется блок:
  ```
  Ты в Telegram-группе. Владелец платит за твою работу: <owner.first_name>.
  Активные участники последних сообщений: <уникальные first_name из контекста>.
  Текущая дата/время: <now()>.
  ```
- Voice-сообщения участвуют в контексте как обычные текстовые (по `tg_bot_messages.content` с `content_type='voice_transcript'`)
- History retention: 90 дней, потом auto-purge крон-задачей

### Анти-спам / safety

- Игнорим `from.is_bot === true` всегда
- Игнорим service-сообщения всегда
- Rate-limit per chat: режим B — 3 сек, режим C — 60 сек, режим A — не нужен (триггеры явные). Реализуется через поле `last_reply_at` в `tg_bot_configs` с проверкой перед отправкой

## 6. Архитектура: данные, модули, инфра

### Схема Postgres

```sql
-- Привязка Telegram-аккаунта к Linkeon-пользователю (1:1)
CREATE TABLE tg_user_identities (
  linkeon_user_id  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tg_user_id       BIGINT UNIQUE NOT NULL,
  tg_username      TEXT,
  tg_first_name    TEXT,
  bound_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Личная библиотека кастомных агентов (общая с /chat)
CREATE TABLE custom_agents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  system_prompt    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON custom_agents(owner_user_id);

-- Конфигурация бота для группы (1 group ↔ 1 active config)
CREATE TABLE tg_bot_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     UUID NOT NULL REFERENCES users(id),
  tg_chat_id        BIGINT,  -- NULL пока pending
  tg_chat_title     TEXT,    -- для отображения в UI
  display_name      TEXT NOT NULL,
  preset_agent_id   TEXT,    -- ID из модуля agents (если пресет)
  custom_agent_id   UUID REFERENCES custom_agents(id), -- если кастом
  addressing_mode   TEXT NOT NULL CHECK (addressing_mode IN ('strict','always','smart')),
  voice_reply_mode  TEXT NOT NULL CHECK (voice_reply_mode IN ('never','mirror','always')),
  status            TEXT NOT NULL CHECK (status IN ('pending','active','silent','archived','deleted')),
  last_low_balance_dm_at TIMESTAMPTZ,
  last_zero_balance_msg_at TIMESTAMPTZ,
  last_reply_at     TIMESTAMPTZ,  -- для rate-limit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at       TIMESTAMPTZ,
  CHECK (preset_agent_id IS NOT NULL OR custom_agent_id IS NOT NULL)
);
CREATE UNIQUE INDEX ON tg_bot_configs(tg_chat_id) WHERE status IN ('active','silent');
CREATE INDEX ON tg_bot_configs(owner_user_id, status);

-- Одноразовые токены onboarding-флоу
CREATE TABLE tg_claim_tokens (
  token            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind IN ('auth','claim')),
  owner_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  config_id        UUID REFERENCES tg_bot_configs(id) ON DELETE CASCADE, -- для kind='claim'
  expires_at       TIMESTAMPTZ NOT NULL,
  consumed_at      TIMESTAMPTZ
);
CREATE INDEX ON tg_claim_tokens(expires_at) WHERE consumed_at IS NULL;

-- История сообщений в группах ботов
CREATE TABLE tg_bot_messages (
  id               BIGSERIAL PRIMARY KEY,
  config_id        UUID NOT NULL REFERENCES tg_bot_configs(id) ON DELETE CASCADE,
  tg_chat_id       BIGINT NOT NULL,
  tg_message_id    BIGINT,
  tg_user_id       BIGINT,
  tg_user_name     TEXT,
  role             TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content          TEXT NOT NULL,
  content_type     TEXT NOT NULL CHECK (content_type IN ('text','voice_transcript','voice_reply')),
  tokens_charged   INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON tg_bot_messages(config_id, created_at DESC);
```

### Новый NestJS-модуль `tg-bot/` в `spirits_back`

```
src/tg-bot/
├── tg-bot.module.ts             — модуль, регистрация webhook при onModuleInit
├── tg-bot.controller.ts         — POST /webhook/telegram/:secret (приём апдейтов)
├── tg-bot.service.ts            — оркестратор: маршрутизация update → обработка
├── tg-identity.service.ts       — AUTH_TOKEN, DM-bind
├── tg-claim.service.ts          — CLAIM_TOKEN, активация группы
├── tg-config.service.ts         — CRUD конфигов (вызывается из /webhook/tg-bot/*)
├── tg-router.service.ts         — режимы A/B/C, триггеры, smart-gate (Haiku)
├── tg-voice.service.ts          — Whisper STT + OpenAI TTS
├── tg-billing.service.ts        — формула + интеграция с TokensService
├── tg-grammy.client.ts          — обёртка над grammy (sendMessage, sendVoice, leaveChat, setWebhook, getFile)
└── tg-commands.service.ts       — /start /help /balance /silent /resume

src/custom-agents/
├── custom-agents.module.ts
├── custom-agents.controller.ts  — /webhook/custom-agents/*
├── custom-agents.service.ts     — CRUD + генерация system_prompt через Claude Haiku
```

### Зависимости от существующих модулей

- `agents` — чтение списка пресетов
- `tokens` — баланс, списание, ledger
- `chat/claude-agent.service` — переиспользуем формулу пересчёта `Math.ceil(usd × 100_000)`; рассматриваем выделение её в `common/billing.util.ts` как полезное улучшение по ходу работы (но только если это не разбухает в отдельный рефактор)
- `auth` — JwtGuard для всех `/webhook/tg-bot/*` и `/webhook/custom-agents/*`

### HTTP-эндпоинты на бэке

Под префиксом `/webhook/...` (для консистентности с остальным API):

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/webhook/telegram/:secret` | Telegram webhook (без JwtGuard, проверка `URL_SECRET` + header `HEADER_SECRET`) |
| `GET` | `/webhook/tg-bot/identity-status` | Привязан ли уже Telegram у текущего пользователя |
| `POST` | `/webhook/tg-bot/identity-link` | Сгенерировать AUTH_TOKEN, ответ deep link |
| `GET` | `/webhook/tg-bot/configs` | Список конфигов пользователя |
| `POST` | `/webhook/tg-bot/configs` | Создать pending_config + CLAIM_TOKEN, ответ deep link `startgroup=` |
| `GET` | `/webhook/tg-bot/configs/:id` | Детали конфига |
| `PATCH` | `/webhook/tg-bot/configs/:id` | Изменить (роль/режим/имя/voice_mode) |
| `DELETE` | `/webhook/tg-bot/configs/:id` | Удалить (`leaveChat` + archive) |
| `GET` | `/webhook/tg-bot/configs/:id/messages` | История сообщений (paginated) |
| `GET` | `/webhook/custom-agents` | Список своих |
| `POST` | `/webhook/custom-agents` | Создать (с генерацией промпта или с готовым) |
| `POST` | `/webhook/custom-agents/draft` | Сгенерировать draft system_prompt по описанию (для превью) |
| `PATCH` | `/webhook/custom-agents/:id` | Редактировать |
| `DELETE` | `/webhook/custom-agents/:id` | Удалить (FK-блок если используется в активных конфигах → 409) |

### Инфра

- Хост: тот же сервер `212.113.106.202`, тот же PM2 процесс `linkeon-api`
- Nginx уже проксирует `/webhook/*` на порт 3001 — новые роуты заработают без изменений
- BotFather — единоразовая ручная настройка: `/setprivacy → Disable`, `/setjoingroups → Enable`, `/setcommands`. Регистрация webhook через `setWebhook` API — в `tg-bot.module.ts → onModuleInit` (idempotent)
- Секреты и настройки в `.env`: `TG_BOT_TOKEN`, `TG_WEBHOOK_URL_SECRET`, `TG_WEBHOOK_HEADER_SECRET`, `OPENAI_API_KEY` (используется и для Whisper STT, и для OpenAI TTS), `TG_BOT_LOW_BALANCE_THRESHOLD` (default 1000)
- Библиотека: `grammy` (TypeScript-native, активная поддержка)
- Лимит Telegram: ~30 update/sec для одного бота; для старта достаточно. При росте Telegram даёт повысить лимит по запросу

### Конкурентность

Все апдейты от Telegram идут параллельно. Для одного `tg_chat_id` — последовательная обработка через advisory-lock в Postgres:

```sql
SELECT pg_try_advisory_lock(hashtext('tg-chat:' || $1))
```

Если lock не взят — апдейт ставится в очередь (in-memory с timeout 30 сек). Это защищает от гонок «два voice в одну секунду → два ответа невпопад» и от двойных списаний.

## 7. Frontend: новые поверхности UI

### Новые страницы и компоненты

```
src/pages/
├── TelegramBotsPage.tsx          — /telegram-bots — список ботов пользователя
└── MyAgentsPage.tsx              — /my-agents — личная библиотека кастомных ролей

src/components/tg-bot/
├── TgBotsListView.tsx            — каталог карточек ботов (active/archived табы)
├── TgBotCard.tsx                 — карточка: имя, группа, роль, режим, статус, действия
├── TgBotCreateWizard.tsx         — 3-шаговый мастер создания:
│   ├── Шаг 1 (условный): identity binding — если Telegram ещё не привязан
│   ├── Шаг 2: конфигурация (роль / режим / имя / voice_mode)
│   └── Шаг 3: «Добавить в группу» с deep link и инструкцией
├── TgBotEditModal.tsx            — редактирование конфига (те же поля, кроме identity)
├── TgBotMessagesView.tsx         — история сообщений (для отладки/просмотра)
└── TgIdentityBindCallout.tsx     — баннер «привяжи Telegram», переиспользуемый

src/components/custom-agents/
├── CustomAgentsListView.tsx      — карточки кастомных агентов
├── CustomAgentCard.tsx           — имя, описание, действия (edit / use / delete)
├── CustomAgentCreateModal.tsx    — гибрид-генерация:
│   ├── Шаг 1: «опиши роль одной строкой»
│   ├── Шаг 2: превью сгенерированного промпта + редактирование
│   └── Шаг 3: сохранение
└── CustomAgentEditModal.tsx      — правка имени / описания / промпта
```

### Изменения в существующих местах

- `Navigation.tsx` — добавить пункты «Мои боты» и «Мои агенты»
- `AssistantSelection.tsx` — секция «Мои» в селекторе, тянет из `custom_agents`. При выборе кастомного — веб-чат использует его `system_prompt` так же, как пресет
- `ProfileView.tsx` — блок «Telegram» с привязанным `@username` или кнопкой «Привязать»
- `AdminUsageView.tsx` — добавить колонки по TG-ботам (активные / токены пользователей / наши расходы на STT+Gate)

### Новый сервис на фронте

```
src/services/tgBotApi.ts          — CRUD конфигов, identity-link, list, messages
src/services/customAgentsApi.ts   — CRUD кастомных агентов
```

### Роутинг (`App.tsx`)

```
/telegram-bots                    → TelegramBotsPage (требует auth)
/telegram-bots/new                → TgBotCreateWizard
/telegram-bots/:id                → TgBotEditModal + TgBotMessagesView
/my-agents                        → MyAgentsPage (требует auth)
```

### i18n

Все новые строки в `src/i18n/locales/{ru,en}.json` под ключами `tgBot.*` и `customAgents.*`. RU — основной.

## 8. Тестирование

### Backend (юнит + интеграция)

- `tg-identity.service` — генерация/валидация AUTH_TOKEN, истечение, повторное использование
- `tg-claim.service` — генерация/валидация CLAIM_TOKEN, конфликт групп, отказ в каналах
- `tg-router.service` — все три режима, триггеры в strict (mention / reply / display_name / command), smart-gate stub, rate-limit
- `tg-voice.service` — Whisper-вызов с mock-файлом, OpenAI TTS-вызов
- `tg-billing.service` — формула на тестовых USD-значениях, корректное добавление TTS-стоимости, не-списание STT/Gate
- `tg-commands.service` — `/balance` владельцу vs не-владельцу, `/silent` + `/resume`
- `custom-agents.service` — CRUD, FK-блок при удалении используемой роли, генерация черновика промпта

### Backend (e2e через `tests/runner.js`)

- Полный onboarding: identity link → claim group (мокаем Telegram через webhook-имитацию) → проверяем активный конфиг
- Получение текстового сообщения в группе → ответ бота → списание токенов
- Получение voice → Whisper-stub → ответ + TTS-stub → списание (Claude + TTS)
- Out-of-balance → DM-уведомление при <1000 → silent при 0 → восстановление после пополнения
- Кик бота из группы → archived статус, DM владельцу

### Frontend (smoke-сценарии deploy.sh)

- Страница `/telegram-bots` рендерится, список конфигов отображается
- Wizard создания бота — все шаги, генерация deep link, копирование в буфер
- Страница `/my-agents` — CRUD кастомного агента, отображение в `/chat` после создания
- Баннер identity-bind показывается при отсутствии привязки Telegram

## 9. Открытые вопросы для phase планирования

Эти вопросы не блокируют дизайн, но решаются на этапе implementation plan:

- Re-check баланса при достижении нуля — реактивно через Redis pub/sub или периодический cron? (склоняемся к pub/sub, если он уже используется)
- Стоит ли выделить формулу `Math.ceil(usd × 100_000)` в общий `common/billing.util.ts` сейчас или оставить продублированную строчку в `tg-billing.service` (yagni-ритм)
- Финальное имя бота `@LinkeonAgentBot` — нужно проверить доступность в BotFather
- Перенос/деактивация существующего `TelegramConnectForm` (он остаётся для SMM-публикаций — другая фича, не пересекается, оставляем)

## 10. Out of scope (на будущее)

- Передача владения группой между Linkeon-пользователями
- ElevenLabs / премиум-голоса как опция в конфиге
- Каналы Telegram
- Несколько ботов в одной группе (потребует возврата к Option C из ранних развилок)
- Бот как полноценный 1-on-1 чат в DM
- Детальная аналитика и дашборд по ботам в админке
- Перенос конфига бота между группами
