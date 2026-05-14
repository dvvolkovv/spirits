# SMM Producer — AI-ассистент для генерации и автопостинга роликов

**Дата:** 2026-05-14
**Автор:** Дмитрий Волков + Claude
**Статус:** утверждён пользователем, готов к написанию имплементационного плана

---

## 1. Цель и обзор

Внутри Linkeon создаётся новый AI-ассистент `smm_producer` («SMM-продюсер») — рядом с psy/lawyer/coach. Через привычный чат-интерфейс пользователь:

1. Заказывает пачку рекламных роликов («3 ролика по трендам недели», «5 кейсов про конфликты в семье», «давай свободно»).
2. Получает черновые сценарии (диалог героя с одним из существующих ассистентов Linkeon), правит/утверждает.
3. Получает превью готового MP4 (60 сек, вертикаль 9:16), утверждает/отклоняет/перерендеривает.
4. Запускает автоматическую публикацию в подключённые соцсети сейчас или по расписанию.

**Двойное назначение:**
- **Фаза 1** (этот spec) — для админов Linkeon (`isAdmin=true`), используется для самопродвижения my.linkeon.io.
- **Фаза 2** (отдельный spec) — открывается всем подписавшимся на продюсера юзерам как платная услуга. Архитектурно фаза 2 — это снятие `isAdmin`-guard'а и UX для подключения собственных соц-аккаунтов; ядро остаётся то же.

**Формат ролика:**
- Вертикаль 1080×1920, 60 сек, H.264/MP4.
- Структура: хук (0-3с) → диалог героя ↔ ассистента в чат-UI с TTS-голосами (3-45с) → развязка (45-55с) → CTA «my.linkeon.io» (55-60с).
- Поверх: фоновая музыка (~50 кураторских треков), B-roll-вставки (AI-картинки + сток-видео), субтитры (большой текст внизу кадра, обязательны).

**Целевые соцсети:**
- **Фаза 1A:** Telegram (бот в канал), VK (видео в группу), YouTube Shorts (Data API v3).
- **Фаза 1B:** TikTok Content Posting API, Instagram Reels Graph API — добавляются по мере одобрения Meta/TikTok review (1.5-2 месяца ожидания согласований). Код адаптеров пишется сразу — отличие только в готовности боевых аккаунтов.

**Out of scope (этот spec):**
- Длинные форматы (YouTube long-form, Дзен).
- Английский язык (только русский в MVP).
- Кросс-постинг с разной адаптацией под каждую соцсеть (одинаковый MP4 везде).
- Аналитика просмотров/CTR из соцсетей — фаза 2.
- Промокоды/скидки на ролики — фаза 2.
- Миграция существующих `public/generated/` картинок на MinIO — отдельный follow-up.

---

## 2. Технический контекст

- **Бэкенд:** NestJS 10 (`~/Downloads/spirits_back/`), PM2 процесс `linkeon-api`, порт 3001 на сервере `212.113.106.202`.
- **Фронт:** React 18 + Vite + Tailwind (`~/Downloads/spirits_front/`), статика раздаётся Nginx с того же сервера.
- **БД:** PostgreSQL 16 (Docker контейнер, порт 5433).
- **Redis:** уже работает (Docker, порт 6380) — используется для сессий, добавим BullMQ-очереди.
- **Neo4j:** работает (порт 7687), не используется в SMM.
- **Существующие модули `spirits_back/src/`**, на которых будем строиться или с которыми граничим:
  - `agents` — добавим `smm_producer` запись (роль ассистента).
  - `chat` — текущий стриминг чата (`apiClient.fetchStream` + NDJSON) переиспользуем, добавляем новые типы payload.
  - `tokens` — переиспользуем механизм списания/начисления (см. `computeTokenCost` в `video/video.dto.ts`).
  - `misc` — содержит существующий image-gen через Imagen 4.0 + Gemini fallback (`GOOGLE_AI_API_KEY`), переиспользуем для B-roll картинок.
  - `dozvon` — содержит интеграцию с ElevenLabs (через Python livekit-agent), переиспользуем `ELEVENLABS_API_KEY` и `voice_id`.
  - `video` — Kling-based видео-генерация на существующих токенах. Не пересекается с SMM напрямую, но даёт паттерн биллинга (`InsufficientTokensError`).
- **Существующее хранилище:** локальный диск `~/spirits_back/public/generated/` (178 МБ сейчас, диск 221 ГБ свободно). Yandex Object Storage S3-клиент объявлен в коде, но не используется. **MinIO на сервере отсутствует — поднимаем как часть spec'а.**

---

## 3. Архитектура

### 3.1 Общая схема

```
                        [my.linkeon.io / /chat]
                                  │ NDJSON streaming чата
                                  ▼
        ┌────── spirits_back (NestJS, PM2: linkeon-api) ─────────┐
        │                                                         │
        │  SmmProducerAgentService ─── tool routing               │
        │       ├─ ScenarioService    (Claude → JSON-сценарий)    │
        │       ├─ TrendsService      (Perplexity)                │
        │       ├─ MusicLibraryService                            │
        │       ├─ SmmBillingService  (списание/возврат токенов)  │
        │       ├─ SmmJobQueueService (BullMQ producer)           │
        │       ├─ SocialAccountService (OAuth + AES-шифрование)  │
        │       └─ PublicationService (schedule/cancel)           │
        │                       │                                 │
        └───────────────────────┼─────────────────────────────────┘
                                │ Redis (BullMQ)
                                ▼
        ┌────── linkeon-smm-worker (Node, PM2 отдельный) ────────┐
        │                                                         │
        │  RenderWorker:                                          │
        │   1. TTS → mp3-треки в /tmp/job-{id}/                   │
        │   2. Nano Banana/Imagen + Pexels → png/mp4              │
        │   3. Remotion props (JSON: реплики, тайминги, медиа)    │
        │   4. headless Chromium + Remotion → MP4                 │
        │   5. ffmpeg post-process (per-platform encode)          │
        │   6. upload → MinIO bucket linkeon-smm-videos           │
        │   7. callback в API: { videoId, mp4Url, status }        │
        │   8. cleanup /tmp/job-{id}/                             │
        │                                                         │
        │  PublishWorker:                                         │
        │   - забирает SmmPublishJob (incl. delayed)              │
        │   - Publisher.publish() в нужную соцсеть                │
        │   - callback с external_url, external_post_id           │
        └─────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
          MinIO            TG/VK/YT/TT/IG    PostgreSQL
       (docker на           (адаптеры через    (smm_* таблицы)
        212.113.106.202)    официальные API)
```

### 3.2 Pipeline ролика — поток состояний

```
1. CHAT          юзер: "сделай 3 ролика про конфликты в семье"
2. SCENARIO      AI-продюсер: tool generate_scenarios → 3×smm_scenario(status=pending_review)
3. APPROVAL #1   юзер в чате: approve/reject/regenerate по карточкам
4. CHARGE        SmmBillingService: списание токенов под approved
5. ENQUEUE       N×SmmRenderJob в Redis BullMQ
6. RENDER        worker: TTS + картинки + Remotion + ffmpeg → MP4 в MinIO
                 callback → smm_video.status=ready
7. APPROVAL #2   юзер получает в чат preview-плеер, нажимает approve/reject
8. SCHEDULE      tool schedule_publication → M×smm_publication, M×SmmPublishJob
9. PUBLISH       worker: Publisher.publish() per-platform, callback с external_url
10. CHAT REPLY   AI-продюсер постит ссылки на опубликованное в чат
```

### 3.3 Concurrency и rate-limits

- **Render-worker:** 2 параллельных рендера (CPU-bound, Chromium прожорлив).
- **Publish-worker:** 5 параллельных публикаций (I/O-bound).
- **Rate-limiter на соцсети** (BullMQ rate-limit):
  - Telegram — 20 постов/час/канал
  - VK — 10 постов/час/группу
  - YouTube — 5 загрузок/день/канал (квота API)
  - TikTok — 5 постов/день/аккаунт
  - Instagram — 25 постов/сутки/аккаунт

### 3.4 Изоляция

- API НЕ рендерит видео — только оркестрация, БД, чат, очередь. Не падает при крашах worker'а.
- Worker НЕ обслуживает HTTP-юзеров — только потребитель очереди + callbacks в API.
- Все внешние API изолированы в адаптерах с единым интерфейсом → легко мокать в тестах, заменять провайдеров.
- Remotion-композиции живут отдельным npm-проектом внутри `worker/remotion/` — свой `package.json`, чтобы тяжёлые deps (puppeteer, chromium) не утяжеляли API.

---

## 4. Модель данных

Все таблицы в существующей PostgreSQL `linkeon-api`, миграции через тот же механизм что уже используется в `spirits_back` (определяется в фазе имплементации — TypeORM/raw SQL). Префикс `smm_`.

### 4.1 Схема

```
smm_campaign
  id            uuid PK
  user_id       uuid FK → user.id
  conversation_id uuid FK → conversation.id
  topic         text        ("конфликты в семье" / null)
  source_mode   enum        ('auto' | 'topic' | 'trends')
  requested_count int
  status        enum        ('drafting','approved','done','cancelled')
  created_at, updated_at

smm_scenario
  id              uuid PK
  campaign_id     uuid FK → smm_campaign
  title           text
  assistant_role  text        (psy/lawyer/coach/...)
  dialog          jsonb       ([{speaker, text, t_start, t_end}, ...])
  mood            text        (dramatic/inspiring/calm/uplifting/tense/neutral)
  broll_prompts   jsonb       ([{at_sec, type: 'ai_image'|'stock_video', prompt}, ...])
  music_track_id  text        FK → smm_music_track.id
  tts_tier        enum        ('economy' | 'premium')
  status          enum        ('pending_review','approved','rejected','regenerating')
  created_at, updated_at

smm_video
  id              uuid PK
  scenario_id     uuid FK → smm_scenario  (UNIQUE)
  status          enum        ('queued','rendering','ready','failed','approved','rejected')
  render_job_id   text        (BullMQ job id)
  render_state    jsonb       (для idempotent retry — см. §8.2)
  mp4_url         text        (MinIO public URL)
  duration_sec    int
  size_bytes      bigint
  error_message   text
  tokens_charged  int
  created_at, updated_at

smm_publication
  id              uuid PK
  video_id        uuid FK → smm_video
  platform        enum        ('telegram','vk','youtube','tiktok','instagram')
  scheduled_at    timestamptz (null = сразу)
  status          enum        ('scheduled','publishing','published','failed','cancelled')
  publish_job_id  text
  external_url    text
  external_post_id text
  caption         text
  error_message   text
  published_at    timestamptz
  created_at, updated_at
  UNIQUE (video_id, platform)

smm_social_account
  id              uuid PK
  user_id         uuid FK → user.id  (NULL = глобальный, фаза 1A — твой аккаунт)
  platform        enum
  display_name    text
  credentials     jsonb       (AES-256-GCM encrypted, key=SMM_CREDS_SECRET)
  status          enum        ('active','expired','revoked')
  expires_at      timestamptz
  created_at, updated_at

smm_music_track
  id              text PK     ('dramatic_01')
  title           text
  mood            text
  duration_sec    int
  storage_key     text        (MinIO key в linkeon-smm-music/)
  license         text        (Pixabay/source URL)
  created_at

smm_pricing
  id              text PK     ('economy', 'premium')
  tokens_cost     int
  display_name    text
  description     text
  active          boolean
  updated_at

smm_billing_ledger
  id              uuid PK
  user_id         uuid FK
  video_id        uuid FK → smm_video
  amount          int         (положит. — списание, отриц. — возврат)
  op              enum        ('charge', 'refund')
  reason          text        ('queued', 'render_failed', 'user_cancelled', ...)
  created_at      timestamptz

smm_event_log
  id              uuid PK
  event_type      text
  video_id        uuid FK     (nullable)
  publication_id  uuid FK     (nullable)
  payload         jsonb
  created_at      timestamptz
```

### 4.2 Ключевые решения

- **Иерархия `campaign → scenario → video → publication`** — четырёхуровневая, позволяет восстановить историю на любом уровне.
- **Аппрув-гейты как `status`-поля** — никаких отдельных таблиц одобрений.
- **`smm_social_account.user_id IS NULL`** только в начале фазы 1A; в идеале даже админ привязывает аккаунты через OAuth UI и получает `user_id = admin.user_id`. NULL — поддерживается для бэкап-сценария «глобальный TG-канал».
- **`credentials` зашифровано симметрично** (AES-256-GCM) ключом `SMM_CREDS_SECRET` (64 hex символа в .env).
- **Идемпотентность публикации** — UNIQUE-индекс `(video_id, platform)`.
- **`render_state` JSONB** на `smm_video` — для idempotent retry рендера после перезапуска worker'а (см. §8.2).

---

## 5. AI-продюсер: UX и tool-calling

### 5.1 Что это

Новый ассистент с `role = smm_producer`, доступный только пользователям с `isAdmin=true` в фазе 1. Системный промпт — мастер-плейбук SMM-продюсера на русском, плюс инструкция «работай через tool-calls для всех действий».

### 5.2 Tool-calls

| Tool | Назначение |
|---|---|
| `generate_scenarios(mode, count, topic?)` | Создаёт N сценариев. `mode` ∈ `auto`/`topic`/`trends`. Возвращает campaign_id + список scenario_id со статусом `pending_review`. |
| `regenerate_scenario(scenario_id, feedback)` | Перегенерирует один сценарий по фидбеку. |
| `update_scenario(scenario_id, patch)` | Точечная правка (реплика/B-roll/настроение). |
| `approve_scenarios(scenario_ids[])` | Аппрув + списание токенов + enqueue render-jobs. |
| `list_scenarios(campaign_id?)` | Возвращает текущие статусы. |
| `approve_video(video_id)` | Аппрувит готовый MP4. |
| `reject_video(video_id, reason?)` | Отклоняет видео (без возврата токенов). |
| `connect_social(platform)` | Возвращает в чат ссылку на OAuth start. |
| `schedule_publication(video_id, platforms[], scheduled_at?)` | Создаёт smm_publication записи. Парсит человеческий тайминг. |
| `cancel_publication(publication_id)` | Снимает запланированную публикацию. |
| `list_publications(status?)` | Что в очереди, что опубликовано. |

### 5.3 Чат-UI: новые типы блоков в CustomMarkdown

Добавляем поверх существующих `{{button}}` / `{{link}}`:

```
{{smm_scenario:id=...}}              → карточка сценария с диалогом и кнопками Approve/Edit/Regen
{{smm_video:id=...}}                 → inline-плеер MP4 с кнопками Approve/Reject/Republish
{{smm_schedule_picker:videoId=...}}  → виджет выбора времени + чекбоксы платформ
```

Эти блоки фронт получает в стрим-ответе продюсера и подтягивает данные через `GET /webhook/smm/scenarios/:id` и `GET /webhook/smm/videos/:id`.

### 5.4 Пример диалога

```
admin:    Запусти 3 ролика по трендам этой недели
producer: 🎬 Принял. Смотрю тренды через Perplexity... 30 сек.
          [tool_call: generate_scenarios(mode=trends, count=3)]
          {{smm_scenario:id=s1}}  — "Тревога перед увольнением"
          {{smm_scenario:id=s2}}  — "Развод и раздел квартиры"
          {{smm_scenario:id=s3}}  — "Конфликт с подростком"
          Утверди, что нравится, или скажи что поправить.

admin:    Первые два ок, третий перепиши, концовка пресная
producer: [tool_call: approve_scenarios([s1, s2])]
          [tool_call: regenerate_scenario(s3, "концовка пресная")]
          Принял. s1, s2 ушли в рендер (~2 мин), s3 перегенерирую.
          {{smm_scenario:id=s3}}  (обновлённый)

          ... (через 2 минуты)

producer: ✅ Первый ролик готов:
          {{smm_video:id=v1}}

admin:    Да, ставь во все, завтра в 12
producer: [tool_call: schedule_publication(v1, ALL, "2026-05-15T12:00:00+03:00")]
          Запланировал на завтра 12:00 МСК во все 5 соцсетей.
          {{smm_schedule_picker:videoId=v1}}
```

---

## 6. Backend модули и REST API

### 6.1 Структура `spirits_back/src/smm/`

```
src/smm/
├── smm.module.ts
├── smm.controller.ts                  # REST endpoints
├── agents/
│   ├── smm-producer-agent.service.ts  # системный промпт + tool routing
│   └── smm-producer.prompt.ts         # промпт продюсера
├── scenarios/
│   ├── scenario.service.ts
│   └── scenario.dto.ts
├── trends/
│   └── trends.service.ts              # Perplexity
├── render/
│   ├── render-queue.service.ts        # BullMQ producer
│   └── render-callback.controller.ts  # POST /smm/internal/render-callback
├── publication/
│   ├── publication.service.ts
│   └── publish-queue.service.ts
├── publishers/
│   ├── publisher.interface.ts
│   ├── telegram.publisher.ts
│   ├── vk.publisher.ts
│   ├── youtube.publisher.ts
│   ├── tiktok.publisher.ts
│   └── instagram.publisher.ts
├── social-accounts/
│   ├── social-account.service.ts      # CRUD + OAuth callbacks
│   └── credentials.crypto.ts
├── music/
│   └── music-library.service.ts
├── tts/
│   ├── tts.interface.ts
│   ├── yandex-tts.service.ts
│   └── elevenlabs-tts.service.ts
├── media/
│   ├── image-gen.service.ts           # Nano Banana / Imagen для B-roll
│   └── stock-video.service.ts         # Pexels
├── storage/                           # абстракция над MinIO
│   └── minio.service.ts
├── billing/
│   └── smm-billing.service.ts
└── entities/                          # ORM-сущности (8 шт)
```

И новый общий сервис в `src/common/services/`:

```
storage.service.ts                     # единый S3-клиент с двумя backend'ами
                                       # (legacy yandex + new minio), per-config
```

### 6.2 Worker пакет `linkeon-smm-worker`

Расположение — `~/Downloads/spirits_back/worker/` (тот же репозиторий, отдельный PM2 entry):

```
worker/
├── package.json                       # отдельные deps: remotion, puppeteer, ffmpeg-static
├── ecosystem.config.js                # PM2: name=linkeon-smm-worker
├── src/
│   ├── index.ts                       # запуск BullMQ consumer'ов
│   ├── render/
│   │   ├── render-worker.ts
│   │   ├── pipeline.ts                # шаги render-pipeline (см. §3.1)
│   │   └── api-client.ts
│   ├── publish/
│   │   ├── publish-worker.ts
│   │   └── api-client.ts
│   └── remotion/
│       ├── package.json               # nested: Remotion-only deps
│       ├── src/
│       │   ├── Root.tsx
│       │   ├── compositions/
│       │   │   └── ChatCase.tsx       # главная композиция
│       │   ├── components/
│       │   │   ├── ChatBubble.tsx
│       │   │   ├── BRollImage.tsx
│       │   │   ├── BRollVideo.tsx
│       │   │   ├── Subtitle.tsx
│       │   │   └── CTA.tsx
│       │   └── types.ts
│       └── remotion.config.ts
└── .env                               # MINIO_URL, REDIS_URL, API_URL, SMM_WORKER_SECRET
```

### 6.3 REST API (префикс `/webhook/`, JWT)

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/webhook/smm/campaigns` | создать кампанию |
| GET | `/webhook/smm/campaigns/:id` | детали + сценарии |
| GET | `/webhook/smm/scenarios/:id` | один сценарий (для `{{smm_scenario}}`) |
| POST | `/webhook/smm/scenarios/:id/approve` | аппрув + enqueue render |
| POST | `/webhook/smm/scenarios/:id/regenerate` | перегенерация по фидбеку |
| PATCH | `/webhook/smm/scenarios/:id` | точечная правка |
| DELETE | `/webhook/smm/scenarios/:id` | отклонить |
| GET | `/webhook/smm/videos/:id` | детали ролика + mp4Url |
| POST | `/webhook/smm/videos/:id/approve` | аппрув готового ролика |
| POST | `/webhook/smm/videos/:id/reject` | reject без возврата |
| POST | `/webhook/smm/publications` | создать публикации `{videoId, platforms[], scheduledAt?}` |
| GET | `/webhook/smm/publications?status=...` | список расписания |
| DELETE | `/webhook/smm/publications/:id` | отмена |
| GET/POST/DELETE | `/webhook/smm/social-accounts/...` | CRUD соц-аккаунтов |
| GET | `/webhook/smm/oauth/:platform/start` | начало OAuth |
| GET | `/webhook/smm/oauth/:platform/callback` | OAuth callback → сохранение токенов |
| GET | `/webhook/smm/billing/history` | леджер юзера |
| GET | `/webhook/smm/admin/health` | очередь, fail rate, disk free |
| POST | `/webhook/smm/internal/render-callback` | **internal** (X-Smm-Worker-Secret) |
| POST | `/webhook/smm/internal/publish-callback` | **internal** |

**Tool-calls продюсера** дёргают сервисы Nest'а инпроцесс, не через REST. REST нужен только для фронта и worker callbacks.

### 6.4 Новые env-vars

```
# Storage
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET_VIDEOS=linkeon-smm-videos
MINIO_BUCKET_MUSIC=linkeon-smm-music
MINIO_PUBLIC_URL=https://my.linkeon.io/smm-media

# TTS (переиспользуем существующие ключи)
ELEVENLABS_API_KEY=...                     # уже есть
ELEVENLABS_VOICE_PSY=...                   # voiceId под каждого ассистента
ELEVENLABS_VOICE_LAWYER=...
ELEVENLABS_VOICE_COACH=...
ELEVENLABS_VOICE_HERO_M=...
ELEVENLABS_VOICE_HERO_F=...
YANDEX_TTS_API_KEY=...                     # уже есть
YANDEX_TTS_FOLDER_ID=...

# Media
GOOGLE_AI_API_KEY=...                      # уже есть (для Nano Banana / Imagen)
PEXELS_API_KEY=...                         # новый
PERPLEXITY_API_KEY=...                     # новый

# Social — OAuth client_id/secret приложений (НЕ user-tokens)
TG_BOT_USERNAME=linkeon_smm_bot            # юзер вводит bot_token руками
VK_OAUTH_CLIENT_ID=...
VK_OAUTH_CLIENT_SECRET=...
YOUTUBE_OAUTH_CLIENT_ID=...
YOUTUBE_OAUTH_CLIENT_SECRET=...
TIKTOK_OAUTH_CLIENT_KEY=...
TIKTOK_OAUTH_CLIENT_SECRET=...
META_APP_ID=...
META_APP_SECRET=...

# Worker
SMM_WORKER_SECRET=...                      # internal callbacks
SMM_CREDS_SECRET=...                       # AES-256-GCM ключ для credentials
SMM_API_URL=http://127.0.0.1:3001

# Alerts (опционально)
SMM_ALERT_TG_BOT_TOKEN=...
SMM_ALERT_TG_CHAT_ID=...
```

### 6.5 Nginx-добавки

- `location /smm-media/` → проксирует MinIO (read-only публичный)
- WebSocket-проксирование чата уже есть, не меняем

---

## 7. Внешние интеграции

### 7.1 TTS

**ElevenLabs (премиум):**
- `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`, модель `eleven_turbo_v2_5`
- Voice IDs — env-vars `ELEVENLABS_VOICE_PSY/LAWYER/COACH/HERO_M/HERO_F`
- Сохраняем MP3 в `/tmp/job-{id}/voice-{n}.mp3`

**Yandex SpeechKit (эконом):**
- `POST https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize`
- Голоса: `oksana`/`jane`/`omazh`/`zahar`/`ermil`/`madirus`
- Эмоции (`good`/`neutral`/`evil`) и эмфазис через SSML
- OGG/MP3 → нормализуем в MP3 через ffmpeg

**Интерфейс:** `TtsService.synthesize(text, voiceConfig): Buffer`. Выбор провайдера на этапе сценария — поле `tts_tier`.

**Стоимость 60-сек ролика (~700 знаков × 2 голоса):**
- ElevenLabs Turbo v2.5: ~$0.35
- Yandex: ~$0.015

### 7.2 Изображения и сток-видео

**Nano Banana / Imagen 4.0** (B-roll картинки):
- Переиспользуем `GOOGLE_AI_API_KEY` из `misc.service.ts`
- Тонкая обёртка `src/smm/media/image-gen.service.ts` (не лезем в `misc.service` с SMM-промптами)
- Размер 1024×1792 (9:16)
- Сохраняем сразу в MinIO + локальный кеш `/tmp/job-{id}/img-{n}.png`

**Pexels (стоковое видео):**
- `GET https://api.pexels.com/videos/search?query=...&orientation=portrait`
- Кеш по тегам в Redis на 24 часа

**Стратегия микса:** AI-продюсер на этапе сценария решает per-кадр (`type: 'ai_image'` или `'stock_video'`). Жёсткое правило: лицо человека → стоковое видео; скриншот интерфейса/абстрактная сцена → AI.

### 7.3 Музыка

- Источник: Pixabay Music (CC0) и YouTube Audio Library
- ~50 треков заранее скачаны в MinIO `linkeon-smm-music/`
- Запись в `smm_music_track` с `mood` (dramatic/inspiring/calm/uplifting/tense/neutral)
- Seed-скрипт: `worker/scripts/seed-music.ts`
- Накладывается в Remotion как Audio layer с `volume={0.15}`

### 7.4 Тренды (Perplexity)

- `POST https://api.perplexity.ai/chat/completions`, модель `sonar`
- Промпт: «Какие сейчас обсуждаемые в русскоязычных соцсетях темы, связанные с {category}? Дай 10 коротких заголовков-кейсов»
- Кеш в Redis на 6 часов

### 7.5 Соц-сети — Publisher интерфейс

```typescript
interface Publisher {
  publish(input: {
    account: SmmSocialAccount,
    videoUrl: string,
    caption: string,
  }): Promise<{ externalUrl: string, externalPostId: string }>;

  delete(input: {
    account: SmmSocialAccount,
    externalPostId: string,
  }): Promise<void>;
}
```

| Платформа | Endpoint | Auth | Особенности |
|---|---|---|---|
| Telegram | Bot API `sendVideo` | bot_token (ручной ввод) | Без OAuth |
| VK | `video.save` + `wall.post` | OAuth 2.0 Implicit | 2 шага загрузки, 50 видео/сутки/группа |
| YouTube | YouTube Data API v3 `videos.insert` | OAuth 2.0, scope `youtube.upload` | `#Shorts` в title для пометки; квота 10000 unit/день → ~6 загрузок |
| TikTok | Content Posting API v2 | OAuth 2.0, scope `video.upload` | **Требует TikTok review для PROD**; sandbox до одобрения |
| Instagram | Graph API Reels Publishing | OAuth через Facebook Login + Business | FB Page → IG Business Account, **Meta App Review для `instagram_content_publish`** |

**OAuth-флоу одинаковый для всех (кроме TG):**
1. Юзер: «подключи мой VK»
2. Tool `connect_social(platform=vk)` → возвращает `{{link: Подключить VK | url: /webhook/smm/oauth/vk/start}}`
3. Юзер кликает → consent → callback `/webhook/smm/oauth/vk/callback?code=...` → exchange кода на токены → запись в `smm_social_account` → redirect на `/chat?smm_connected=vk`

**Расписание** — BullMQ `delayed: true` job с computed `delay`. Cron каждый час ищет просроченные scheduled-publications (> now() - 5min) и помечает failed.

### 7.6 Субтитры

Генерируются прямо в Remotion-композиции, без отдельного STT:
- На этапе TTS уже знаем длительность каждой реплики
- Текст реплики разбиваем на смысловые куски ~3-5 слов (по punctuation), равномерно распределяем по таймингу
- Компонент `<Subtitle>` — крупный жирный белый текст с полупрозрачной плашкой внизу, fade-in/fade-out 200мс

Whisper/Deepgram word-level — overkill для MVP, фаза 2 если синхронизация плохая.

---

## 8. Биллинг и токеномика

### 8.1 Тарифы (`smm_pricing`)

| Тариф | Цена | TTS |
|---|---|---|
| Эконом | 15 000 токенов | Yandex SpeechKit |
| Премиум | 50 000 токенов | ElevenLabs Turbo v2.5 |

Себестоимость при ~$0.01/1000 токенов: эконом ~$0.15 (фактически $0.10) / премиум ~$0.50 (фактически $0.42). Запас на колебания заложен. Точный курс токен/$ — сверяем в имплементации.

Публикация во все соцсети входит в цену ролика — отдельно не списываем.

### 8.2 Когда списываем

**На этапе approve_scenarios**, не на генерации. Генерация сценариев почти бесплатная (~$0.02 на Claude/GPT), не платим за отклонённые.

```
1. user → approve_scenarios([s1, s2, s3])
2. SmmBillingService.charge(userId, scenarioId, tier) для каждого:
   - читает баланс из ai_profiles_consolidated.tokens
   - проверяет >= цена тарифа
   - в транзакции: UPDATE tokens; INSERT smm_video (tokens_charged); INSERT smm_billing_ledger
3. Если на часть хватает — спрашиваем у юзера явно
4. Все ok → enqueue N×SmmRenderJob
```

### 8.3 Транзакционность

```typescript
await this.pg.transaction(async (tx) => {
  const balance = await tx.query(
    'SELECT tokens FROM ai_profiles_consolidated WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  if (balance < cost) throw new InsufficientTokensError(balance, cost);
  await tx.query(
    'UPDATE ai_profiles_consolidated SET tokens = tokens - $1, updated_at = now() WHERE user_id = $2',
    [cost, userId]
  );
  await tx.query(
    `UPDATE smm_video SET tokens_charged = $1, status = 'queued' WHERE id = $2`,
    [cost, videoId]
  );
  await tx.query(
    `INSERT INTO smm_billing_ledger (user_id, video_id, amount, op, reason)
     VALUES ($1, $2, $3, 'charge', 'queued')`,
    [userId, videoId, cost]
  );
});
```

### 8.4 Возврат

| Событие | Возврат | Сумма |
|---|---|---|
| Сценарий отклонён до аппрува | Нет (не списывалось) | — |
| Юзер отклонил готовый ролик | Нет | — |
| Рендер упал технически | **Да** | 100% |
| Публикация в одну соцсеть упала | Нет | — (ролик готов, можно повторить) |
| Юзер отменил кампанию до старта рендера | **Да** | 100% за не-стартовавшие |

---

## 9. Обработка ошибок

### 9.1 Категории сбоев

| Категория | Реакция | Видимо юзеру |
|---|---|---|
| Сетевой/транзиентный | Retry × 3, exp backoff 1с/5с/15с | Только при всех 3 неудачных |
| Лимит провайдера (квота YT, monthly cap EL) | Не retry. В чат: «Не можем загрузить, квота, через час» / «Эконом недоступен, переключись на премиум» | Да |
| Невалидные данные (пустой TTS, нет картинки) | Не retry. Лог как баг, fail | Общим «техническая ошибка» |
| Контент-модерация (TT/IG/YT) | Не retry. Сохраняем причину дословно | Да |
| OAuth протух | Pause кампании, в чат ссылка на reconnect | Да |
| Insufficient tokens | Останов enqueue, диалог в чате «пополнить/эконом/отмена» | Да |
| Worker недоступен | BullMQ auto-retry, idempotent restart через render_state | Только при полном отказе |

### 9.2 Идемпотентность pipeline'а

Каждый шаг render-pipeline'а пишет в `smm_video.render_state` (JSONB):

```json
{
  "scenario_loaded": true,
  "voices_synthesized": ["voice-0.mp3", "voice-1.mp3"],
  "images_generated": ["img-0.png", "img-1.png"],
  "stock_videos_downloaded": ["stock-0.mp4"],
  "remotion_rendered": false,
  "postprocessed": false,
  "uploaded_to_minio": false
}
```

При повторном запуске worker сначала читает `render_state` — если шаг `true`, пропускает. Защищает от лишних трат на TTS/Imagen и позволяет рестартовать ровно с упавшего шага.

Publish-jobs идемпотентны через `external_post_id`: перед публикацией проверяем не пустой ли — фаст-выход.

### 9.3 Деградация

| Провайдер недоступен | Действие |
|---|---|
| ElevenLabs | Предлагаем эконом-тариф через AI-продюсера |
| Yandex SpeechKit | Зеркально — предлагаем премиум |
| Nano Banana | Падаем на стоковое видео для всех B-roll, в чате warning |
| Pexels | Падаем на «чистый чат» (без B-roll, только анимированный диалог) |
| Perplexity | Тренд-режим временно недоступен, просим тематику руками |

### 9.4 Перезапуск worker'а

PM2 `restart`:
1. SIGTERM → перестаём брать новые job'ы
2. 30 сек на graceful через abort signal в Remotion/ffmpeg
3. SIGKILL. BullMQ переставит unfinished job (по `lockDuration`)
4. На повторном запуске — pickup с `render_state` checkpoint'а

### 9.5 Локальный кеш `/tmp/job-{id}/`

- Создаётся в начале, удаляется при успехе
- При fail — остаётся для отладки, автоудаление через 7 дней (cron)
- При диске > 80% занято worker отказывается стартовать новые job'ы + алерт в TG

### 9.6 Безопасность

- AES-256-GCM на `smm_social_account.credentials` с ключом `SMM_CREDS_SECRET`
- MinIO bucket'ы публичные read-only, `s3:ListBucket` denied (UUID в именах файлов — не подобрать)
- Internal callbacks worker → API защищены `X-Smm-Worker-Secret` header + source IP whitelist 127.0.0.1
- Prompt injection в сценариях → OpenAI Moderation API после генерации, перед показом юзеру
- В системном промпте продюсера явный запрет на упоминание реальных людей по имени, конкретных компаний с негативом

### 9.7 Мониторинг

- Все события (start, fail, success render/publish) → `smm_event_log`
- `GET /webhook/smm/admin/health` — queue depth, jobs stuck > 10 мин, fail rate за 24ч, disk free
- Fail rate > 30%/час → авто-алерт в Telegram через env `SMM_ALERT_TG_*`

---

## 10. Тестирование

### 10.1 Unit-тесты (Jest, в `spirits_back/src/smm/**.spec.ts`)

- `SmmBillingService` — списание/возврат/недостаточно средств, leger inserts
- `MusicLibraryService.pickTrack(mood, duration)`
- `SmmProducerAgentService` — парсинг tool-calls, валидация
- Парсер human-time («завтра в полдень», «через час» → ISO)
- `credentials.crypto` — round-trip
- `Publisher`-адаптеры с мок-HTTP

Цель: ≥80% покрытие `smm/` модуля.

### 10.2 Интеграционные тесты (`tests/runner.js --suite api`)

Новый файл `tests/smm/api.test.js` — 16 сценариев:

1. POST `/smm/campaigns` от не-админа → 403
2. POST `/smm/campaigns` от админа → 200 + БД
3. `generate_scenarios` tool → записи со status=pending_review
4. approve при достаточном балансе → списание + render job в очереди
5. approve при недостаточном → 402, leger пуст
6. regenerate с feedback → status=regenerating
7. PATCH правка реплики
8. internal endpoint без секрета → 401
9. internal callback ready → mp4_url в БД
10. internal callback failed → refund в leger, баланс восстановлен
11. approve_video + schedule → publications + delayed jobs
12. DELETE scheduled → cancelled
13. DELETE publishing → 409
14. Двойной approve_scenarios → не дублирует списание
15. OAuth telegram start → форма ввода bot_token
16. Шифрование credentials round-trip

Моки внешних API — `nock`-стабы с фикстурами.

### 10.3 E2E (`tests/runner.js --suite e2e`)

Новый `tests/smm/e2e.test.js` — 5 сценариев с реальным worker'ом и реальными API:

| # | Сценарий | Время |
|---|---|---|
| 1 | Полный pipeline эконом-тариф → MP4 в MinIO, доступен по URL | ~3 мин |
| 2 | Полный pipeline премиум-тариф | ~3 мин |
| 3 | Fail на TTS (env-flag → 503) → refund в leger | ~30 сек |
| 4 | Полный pipeline + публикация в тестовый TG-канал | ~3 мин |
| 5 | Шедулинг scheduled_at = now()+30s → пост опубликован | ~1 мин |

Фикстура: тестовый юзер с 200К токенов + truncate `smm_*` таблиц перед прогоном.

### 10.4 Worker unit-тесты

- `RenderPipeline` шаги с замоканными deps, idempotency через `render_state`
- Парсер Remotion props
- Subtitle chunking

### 10.5 Smoke Remotion-композиции (CI)

`npx remotion render` с зафиксированным JSON-фикстурой → MP4 правильного размера, длительности, разрешения 1080×1920, кодек h264.

### 10.6 Не тестируем автоматически

- Качество AI-сценария — ручное ревью на каждом релизе (чек-лист из 10 пунктов)
- Реальные публикации в TT/IG — sandbox-режим, manual smoke перед прод-релизом
- Качество TTS — фикс-набор замеров длительности, флаг для ручной проверки при отклонении > 20%

### 10.7 CI-интеграция

- pre-commit: unit-тесты на изменённых файлах
- pre-push: unit + быстрая часть api-suite
- Перед merge в main: api-suite полностью + smoke Remotion
- Перед деплоем: E2E suite (~10 мин)
- После деплоя: smoke в prod (1 ролик в тестовый TG-канал)

---

## 11. Зависимости и предварительные условия

Перед стартом имплементации нужно (или закладываем в первые шаги плана):

1. **MinIO в Docker** на `212.113.106.202` (порты 9000/9001 локально, public read через Nginx). На момент написания spec'а контейнер отсутствует — первый шаг плана; если к старту имплементации уже поднят, шаг скипается.
2. **Pexels API key** — регистрация на pexels.com/api
3. **Perplexity API key** — pplx.api платный план
4. **VK app** — создание Standalone application для OAuth
5. **YouTube OAuth** — Google Cloud Console + OAuth consent + verification (1-2 недели на верификацию)
6. **TikTok Developer** — создание приложения + запрос на Content Posting API (1-4 недели review)
7. **Meta App** — FB Developer + Business Verification + IG Reels permission review (~2-4 недели)
8. **ElevenLabs voice IDs** — выбрать 5 голосов из библиотеки или клонировать кастомные (~$22/мес Creator plan)
9. **Yandex Cloud folder** для SpeechKit — уже есть, нужно подтвердить лимиты
10. **MinIO ключи** — генерация на старте
11. **Симметричные секреты** — `SMM_WORKER_SECRET`, `SMM_CREDS_SECRET` (64 hex chars)
12. **Музыкальная библиотека** — скачать ~50 треков с Pixabay Music под 6 mood'ов, залить в MinIO

Пункты 5-7 — самые долгие. Их **стартуем параллельно с разработкой** (заявка/верификация идёт в фоне), к моменту Phase 1B готовности кода они должны быть одобрены.

---

## 12. Future work (после этого spec)

- **Фаза 2 spec:** открытие фичи всем юзерам, OAuth-UI для собственных соц-аккаунтов, кросс-постинг с per-platform адаптацией текста, аналитика просмотров.
- **Whisper word-level субтитры** — если автогенерируемые субтитры будут плохо синхронизироваться.
- **Параллельные рендеры > 2** — после оценки CPU-нагрузки на проде.
- **Английский язык** — добавление промптов + EN-голосов в TTS + EN-тренды.
- **Длинные форматы** — отдельный pipeline для YouTube long-form (3-10 мин).
- **Промокоды/скидки** — расширение `smm_billing_ledger`.
- **Миграция `public/generated/` на MinIO** — отдельный follow-up project, не блокирует SMM.
- **Кросс-репост из чужих соцсетей** (например, найти трендовое видео в TikTok → пересоздать с нашим CTA) — фаза 3.

---

## 13. Открытые вопросы для имплементации

1. **Курс токен/$** — сейчас оценка ~$0.01 за 1000 токенов. Сверить с реальной экономикой (что юзер платит за пакет 50K/200K/1M токенов) и поправить константы в `smm_pricing`.
2. **ORM** — `spirits_back` использует Prisma или TypeORM или raw `pg`? Уточнить при первом коммите миграций (видел использование `PgService` с raw queries — возможно raw).
3. **Чат-стейт для tool-calls** — как именно в текущем `chat`-модуле передаются tool results обратно в LLM-контекст? Изучить `chat-tools.ts` при имплементации `SmmProducerAgentService`.
4. **Точные voice_id'ы ElevenLabs** под каждого ассистента — подбираются на этапе работ (вручную через ElevenLabs Voice Library).
5. **Список из ~50 музыкальных треков** — собирается отдельно как контент-таск, не код.
