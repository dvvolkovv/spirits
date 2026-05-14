# SMM Producer — Plan 2: Render Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать отдельный PM2-воркер `linkeon-smm-worker`, который подписывается на BullMQ-очередь `smm-render` (создана в Plan 1), для каждого job-а генерирует TTS-озвучку, AI-картинки (Nano Banana) и сток-видео (Pexels), композирует и рендерит ролик через Remotion, постпроцессит ffmpeg-ом и заливает финальный MP4 в MinIO. Сценарий пока подаётся ручным JSON через БД — AI-генерация в Plan 3.

**Architecture:** Отдельный Node-пакет `worker/` рядом с NestJS API в том же репозитории. Worker не имеет прямого доступа к PostgreSQL — все операции с БД (fetch сценария, update `render_state`, финальный callback) идут через internal HTTP API защищённый `X-Smm-Worker-Secret`. Идемпотентность через `smm_video.render_state` JSONB checkpoint'ы — после перезапуска worker пропускает уже выполненные шаги.

**Tech Stack:** Node 20, BullMQ 5, Remotion 4 (React-based programmatic video), Puppeteer/Chromium (для Remotion), ffmpeg-static (для постпроцессинга), AWS SDK v3 (MinIO), Axios (HTTP клиент).

**End-state demo:**
- PM2 процесс `linkeon-smm-worker` стабильно работает рядом с `linkeon-api`
- Ручная вставка сценария в БД + enqueue в `smm-render` → через 1-3 минуты в MinIO появляется MP4 1080×1920, 60 сек, H.264 с озвучкой + B-roll + субтитрами + фоновой музыкой
- `smm_video.status = 'ready'`, `mp4_url` указывает на публичный `https://my.linkeon.io/smm-media/linkeon-smm-videos/...`
- При повторном запуске того же job-а после краша worker пропускает уже выполненные шаги (TTS, картинки) и докатывается до конца
- Если рендер падает — billing возвращает токены (Plan 1's `SmmBillingService.refund`)

---

## File Structure

**Создаются:**

```
spirits_back/
├── worker/                                                # отдельный npm пакет
│   ├── package.json
│   ├── tsconfig.json
│   ├── ecosystem.config.js                                # PM2 config
│   ├── .env.example
│   ├── src/
│   │   ├── index.ts                                       # entry point
│   │   ├── config.ts                                      # env loader + validation
│   │   ├── logger.ts                                      # pino logger
│   │   ├── api-client.ts                                  # HTTP client для internal API
│   │   ├── render/
│   │   │   ├── pipeline.ts                                # main orchestrator
│   │   │   ├── render-state.ts                            # checkpoint helpers
│   │   │   └── temp-dir.ts                                # /tmp/job-{id}/ management
│   │   ├── tts/
│   │   │   ├── index.ts                                   # dispatcher by tier
│   │   │   ├── yandex.ts
│   │   │   ├── elevenlabs.ts
│   │   │   ├── voices.ts                                  # voice id mapping per role
│   │   │   └── subtitle-chunker.ts                        # split text → timed chunks
│   │   ├── media/
│   │   │   ├── image-gen.ts                               # Nano Banana / Gemini Image
│   │   │   └── stock-video.ts                             # Pexels
│   │   ├── music/
│   │   │   └── library.ts                                 # pick track by mood
│   │   ├── postprocess/
│   │   │   └── ffmpeg.ts                                  # platform-specific encode
│   │   ├── storage/
│   │   │   └── minio.ts                                   # thin upload wrapper
│   │   └── consumer.ts                                    # BullMQ Worker glue
│   └── remotion/                                          # nested npm project
│       ├── package.json
│       ├── remotion.config.ts
│       └── src/
│           ├── Root.tsx                                   # registerRoot
│           ├── compositions/
│           │   └── ChatCase.tsx                           # main composition
│           ├── components/
│           │   ├── ChatBubble.tsx
│           │   ├── BRollImage.tsx
│           │   ├── BRollVideo.tsx
│           │   ├── Subtitle.tsx
│           │   ├── CTA.tsx
│           │   └── BackgroundMusic.tsx
│           └── types.ts                                   # CaseVideoProps shape
├── src/smm/
│   ├── render/
│   │   ├── render-callback.controller.ts                  # internal callbacks (NEW)
│   │   ├── scenario-fetch.controller.ts                   # internal GET scenario (NEW)
│   │   └── render-callback.dto.ts
│   └── music/
│       └── music.service.ts                               # CRUD smm_music_track
├── src/common/guards/
│   └── worker-secret.guard.ts                             # X-Smm-Worker-Secret guard
├── scripts/
│   └── seed-music.ts                                      # populate smm_music_track
└── tests/smm/
    ├── render-callback.integration.test.js
    ├── scenario-fetch.integration.test.js
    └── render-e2e.integration.test.js                     # full pipeline smoke
```

**Модифицируются:**

```
spirits_back/
├── src/smm/smm.module.ts                                  # register new controllers + MusicService
├── tests/smm/index.js                                     # add new test files
└── .env                                                   # +YANDEX_TTS_*, +ELEVENLABS_*,
                                                          #  +PEXELS_API_KEY, +SMM_API_URL
```

**Новые env-vars в `.env`:**

```bash
# TTS
YANDEX_TTS_API_KEY=...
YANDEX_TTS_FOLDER_ID=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_HERO_M=...                                # default male hero voice id
ELEVENLABS_VOICE_HERO_F=...                                # default female hero voice id
ELEVENLABS_VOICE_PSY=...                                   # psy assistant voice id
ELEVENLABS_VOICE_LAWYER=...                                # lawyer assistant voice id
ELEVENLABS_VOICE_COACH=...                                 # coach assistant voice id

# Stock & images (image-gen reuses GOOGLE_AI_API_KEY from existing misc module)
PEXELS_API_KEY=...

# Worker internal calls
SMM_API_URL=http://127.0.0.1:3001                          # worker → API
SMM_WORKER_SECRET=...                                      # already set in Plan 1
```

---

## Task 1: Worker package skeleton

**Files:**
- Create: `spirits_back/worker/package.json`
- Create: `spirits_back/worker/tsconfig.json`
- Create: `spirits_back/worker/.env.example`
- Create: `spirits_back/worker/src/index.ts`
- Create: `spirits_back/worker/src/config.ts`
- Create: `spirits_back/worker/src/logger.ts`
- Create: `spirits_back/worker/ecosystem.config.js`

- [ ] **Step 1.1: Создать `worker/package.json`**

```json
{
  "name": "linkeon-smm-worker",
  "version": "0.1.0",
  "description": "BullMQ consumer + Remotion render pipeline for SMM Producer",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "start:dev": "ts-node src/index.ts",
    "render:smoke": "ts-node scripts/render-smoke.ts"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1025.0",
    "@aws-sdk/lib-storage": "^3.400.0",
    "axios": "^1.6.0",
    "bullmq": "^5.0.0",
    "dotenv": "^16.6.1",
    "ffmpeg-static": "^5.2.0",
    "ioredis": "^5.3.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.1",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 1.2: Создать `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "remotion"]
}
```

- [ ] **Step 1.3: Создать `worker/.env.example`**

```bash
# Required env vars for linkeon-smm-worker

REDIS_URL=redis://127.0.0.1:6379
SMM_API_URL=http://127.0.0.1:3001
SMM_WORKER_SECRET=<64 hex chars matching API .env>

# MinIO (same as Plan 1 — read from API server's .env)
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=<scoped user>
MINIO_SECRET_KEY=<scoped secret>
MINIO_BUCKET_VIDEOS=linkeon-smm-videos
MINIO_BUCKET_MUSIC=linkeon-smm-music
MINIO_PUBLIC_URL=https://my.linkeon.io/smm-media

# TTS
YANDEX_TTS_API_KEY=
YANDEX_TTS_FOLDER_ID=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_HERO_M=
ELEVENLABS_VOICE_HERO_F=
ELEVENLABS_VOICE_PSY=
ELEVENLABS_VOICE_LAWYER=
ELEVENLABS_VOICE_COACH=

# Media
GOOGLE_AI_API_KEY=
PEXELS_API_KEY=

# Logging
LOG_LEVEL=info
```

- [ ] **Step 1.4: Создать `worker/src/logger.ts`**

```typescript
// worker/src/logger.ts
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
});

export type Logger = typeof logger;
```

- [ ] **Step 1.5: Создать `worker/src/config.ts`**

```typescript
// worker/src/config.ts
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from worker dir
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Required env var ${name} is not set`);
  return v;
}

export const config = {
  redisUrl: required('REDIS_URL'),
  apiUrl: required('SMM_API_URL'),
  workerSecret: required('SMM_WORKER_SECRET'),

  minio: {
    endpoint: required('MINIO_ENDPOINT'),
    accessKey: required('MINIO_ACCESS_KEY'),
    secretKey: required('MINIO_SECRET_KEY'),
    bucketVideos: required('MINIO_BUCKET_VIDEOS'),
    bucketMusic: required('MINIO_BUCKET_MUSIC'),
    publicUrl: required('MINIO_PUBLIC_URL'),
  },

  tts: {
    yandexApiKey: process.env.YANDEX_TTS_API_KEY || '',
    yandexFolderId: process.env.YANDEX_TTS_FOLDER_ID || '',
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    elevenlabsVoices: {
      heroMale: process.env.ELEVENLABS_VOICE_HERO_M || '',
      heroFemale: process.env.ELEVENLABS_VOICE_HERO_F || '',
      psy: process.env.ELEVENLABS_VOICE_PSY || '',
      lawyer: process.env.ELEVENLABS_VOICE_LAWYER || '',
      coach: process.env.ELEVENLABS_VOICE_COACH || '',
    },
  },

  media: {
    googleAiApiKey: process.env.GOOGLE_AI_API_KEY || '',
    pexelsApiKey: process.env.PEXELS_API_KEY || '',
  },
};
```

- [ ] **Step 1.6: Создать `worker/src/index.ts`**

```typescript
// worker/src/index.ts
import { config } from './config';
import { logger } from './logger';

async function main(): Promise<void> {
  logger.info({ apiUrl: config.apiUrl, redisUrl: config.redisUrl }, 'linkeon-smm-worker starting');
  // Consumer registration is added in Task 13. For now just verify config loads.
  logger.info('Worker ready (consumer not yet attached — see Task 13)');
}

main().catch((err) => {
  logger.fatal({ err: err.message }, 'fatal worker startup error');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});
```

- [ ] **Step 1.7: Создать `worker/ecosystem.config.js`**

```javascript
// worker/ecosystem.config.js — PM2 config for linkeon-smm-worker
module.exports = {
  apps: [{
    name: 'linkeon-smm-worker',
    script: 'dist/index.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '30s',
    watch: false,
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
    },
    error_file: '~/.pm2/logs/linkeon-smm-worker-error.log',
    out_file: '~/.pm2/logs/linkeon-smm-worker-out.log',
    merge_logs: true,
  }],
};
```

- [ ] **Step 1.8: Install + build + smoke-run**

```bash
cd /Users/dmitry/Downloads/spirits_back/worker
npm install 2>&1 | tail -5
npm run build 2>&1 | tail -3
ls dist/index.js && echo "build OK"
```

Expected: `dist/index.js` exists.

- [ ] **Step 1.9: Smoke-run locally**

Скопировать секреты из API .env:

```bash
cd /Users/dmitry/Downloads/spirits_back/worker
cp .env.example .env

# Copy values from API .env (these are already populated from Plan 1)
for key in REDIS_URL SMM_WORKER_SECRET MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY \
           MINIO_BUCKET_VIDEOS MINIO_BUCKET_MUSIC MINIO_PUBLIC_URL GOOGLE_AI_API_KEY; do
  val=$(grep "^${key}=" ../.env | head -1 | cut -d= -f2-)
  if [ -n "$val" ]; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" .env && rm .env.bak
  fi
done
# Set SMM_API_URL for local testing
sed -i.bak "s|^SMM_API_URL=.*|SMM_API_URL=http://127.0.0.1:3001|" .env && rm .env.bak

# Ensure Redis tunnel for local testing
curl -sf http://127.0.0.1:6379 -m 1 >/dev/null 2>&1 || \
  ssh -fN -L 6379:127.0.0.1:6379 dvolkov@212.113.106.202

# Run
npm run start:dev 2>&1 | head -10
```

Expected output: pino-pretty logs showing "linkeon-smm-worker starting" and "Worker ready". Ctrl-C to stop.

- [ ] **Step 1.10: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add worker/package.json worker/package-lock.json worker/tsconfig.json \
        worker/.env.example worker/src/ worker/ecosystem.config.js
git -c commit.gpgsign=false commit -m "feat(smm-worker): bootstrap worker package skeleton

Separate Node package at worker/ with own package.json, tsconfig.
Entry point loads config from .env, validates required keys, prints
ready log. PM2 ecosystem config defines linkeon-smm-worker process
(fork mode, auto-restart, dedicated log files).

Consumer/pipeline attached in later tasks — this lays the runtime
foundation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: API internal endpoints (worker-secret guard + scenario fetch + render callback)

Worker не имеет прямого доступа к PostgreSQL. Всё идёт через два internal endpoint'а в NestJS, защищённые `X-Smm-Worker-Secret`.

**Files:**
- Create: `spirits_back/src/common/guards/worker-secret.guard.ts`
- Create: `spirits_back/src/smm/render/render-callback.dto.ts`
- Create: `spirits_back/src/smm/render/render-callback.controller.ts`
- Create: `spirits_back/src/smm/render/scenario-fetch.controller.ts`
- Modify: `spirits_back/src/smm/smm.module.ts`
- Create: `spirits_back/tests/smm/render-callback.integration.test.js`
- Create: `spirits_back/tests/smm/scenario-fetch.integration.test.js`
- Modify: `spirits_back/tests/smm/index.js`

- [ ] **Step 2.1: WorkerSecretGuard**

Создать `src/common/guards/worker-secret.guard.ts`:

```typescript
// src/common/guards/worker-secret.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Guards internal endpoints called by linkeon-smm-worker.
 * Accepts only requests with X-Smm-Worker-Secret header matching env
 * SMM_WORKER_SECRET, AND coming from localhost (proxy bypass protection).
 */
@Injectable()
export class WorkerSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const secret = req.headers['x-smm-worker-secret'];
    const expected = process.env.SMM_WORKER_SECRET;

    if (!expected) {
      throw new Error('SMM_WORKER_SECRET is not configured on the server');
    }
    if (!secret || secret !== expected) {
      throw new UnauthorizedException('Missing or invalid worker secret');
    }

    // Source IP check — must be localhost (worker runs on the same host)
    const remote = req.ip || req.connection?.remoteAddress || '';
    const allowed = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    if (!allowed.includes(remote)) {
      throw new ForbiddenException(`Worker endpoints only accessible from localhost, got: ${remote}`);
    }
    return true;
  }
}
```

- [ ] **Step 2.2: Render callback DTO**

Создать `src/smm/render/render-callback.dto.ts`:

```typescript
// src/smm/render/render-callback.dto.ts
import { IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RenderCallbackDto {
  @IsUUID()
  videoId!: string;

  @IsIn(['ready', 'failed'])
  status!: 'ready' | 'failed';

  @IsOptional() @IsString()
  mp4Url?: string;

  @IsOptional() @IsInt() @Min(1)
  durationSec?: number;

  @IsOptional() @IsInt() @Min(1)
  sizeBytes?: number;

  @IsOptional() @IsString()
  errorMessage?: string;
}

export class RenderStateUpdateDto {
  @IsUUID()
  videoId!: string;

  @IsObject()
  renderState!: Record<string, unknown>;
}
```

- [ ] **Step 2.3: RenderCallbackController**

Создать `src/smm/render/render-callback.controller.ts`:

```typescript
// src/smm/render/render-callback.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  NotFoundException,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { WorkerSecretGuard } from '../../common/guards/worker-secret.guard';
import { PgService } from '../../common/services/pg.service';
import { SmmBillingService } from '../billing/smm-billing.service';
import { RenderCallbackDto, RenderStateUpdateDto } from './render-callback.dto';

@Controller('smm/internal')
@UseGuards(WorkerSecretGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RenderCallbackController {
  private readonly logger = new Logger(RenderCallbackController.name);

  constructor(
    private readonly pg: PgService,
    private readonly billing: SmmBillingService,
  ) {}

  /**
   * Worker checkpoint: persist intermediate render_state after each pipeline step.
   * Used for idempotent retry after worker crashes.
   */
  @Post('render-state')
  async updateRenderState(@Body() dto: RenderStateUpdateDto): Promise<{ ok: true }> {
    const res = await this.pg.query(
      `UPDATE smm_video SET render_state = $1::jsonb, status = 'rendering'
       WHERE id = $2 RETURNING id`,
      [JSON.stringify(dto.renderState), dto.videoId],
    );
    if (res.rowCount === 0) throw new NotFoundException(`video ${dto.videoId} not found`);
    return { ok: true };
  }

  /**
   * Worker terminal callback: status=ready with mp4_url, or status=failed with error.
   * On 'failed', triggers automatic refund via SmmBillingService.
   */
  @Post('render-callback')
  async handleCallback(@Body() dto: RenderCallbackDto): Promise<{ ok: true }> {
    if (dto.status === 'ready') {
      if (!dto.mp4Url) throw new BadRequestException('mp4Url required when status=ready');
      const res = await this.pg.query(
        `UPDATE smm_video
            SET status = 'ready', mp4_url = $1, duration_sec = $2,
                size_bytes = $3, error_message = NULL
          WHERE id = $4 RETURNING id`,
        [dto.mp4Url, dto.durationSec ?? null, dto.sizeBytes ?? null, dto.videoId],
      );
      if (res.rowCount === 0) throw new NotFoundException(`video ${dto.videoId} not found`);
      this.logger.log(`Video ${dto.videoId} marked ready: ${dto.mp4Url}`);
    } else {
      const res = await this.pg.query(
        `UPDATE smm_video SET status = 'failed', error_message = $1
          WHERE id = $2 RETURNING id`,
        [dto.errorMessage ?? 'unknown render error', dto.videoId],
      );
      if (res.rowCount === 0) throw new NotFoundException(`video ${dto.videoId} not found`);
      await this.billing.refund({ videoId: dto.videoId, reason: 'render_failed' });
      this.logger.warn(`Video ${dto.videoId} marked failed, tokens refunded`);
    }
    return { ok: true };
  }
}
```

- [ ] **Step 2.4: ScenarioFetchController**

Создать `src/smm/render/scenario-fetch.controller.ts`:

```typescript
// src/smm/render/scenario-fetch.controller.ts
import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { WorkerSecretGuard } from '../../common/guards/worker-secret.guard';
import { PgService } from '../../common/services/pg.service';
import { rowToScenario, SmmScenario } from '../entities/smm-scenario.entity';
import { rowToVideo, SmmVideo } from '../entities/smm-video.entity';

export interface RenderJobContext {
  video: SmmVideo;
  scenario: SmmScenario;
}

@Controller('smm/internal')
@UseGuards(WorkerSecretGuard)
export class ScenarioFetchController {
  private readonly logger = new Logger(ScenarioFetchController.name);

  constructor(private readonly pg: PgService) {}

  /**
   * Worker fetches the full context for a render job:
   * the video row (with current render_state) + the parent scenario.
   */
  @Get('render-context/:videoId')
  async getContext(@Param('videoId') videoId: string): Promise<RenderJobContext> {
    const vRes = await this.pg.query(`SELECT * FROM smm_video WHERE id = $1`, [videoId]);
    if (vRes.rows.length === 0) throw new NotFoundException(`video ${videoId} not found`);
    const video = rowToVideo(vRes.rows[0]);

    const sRes = await this.pg.query(
      `SELECT * FROM smm_scenario WHERE id = $1`,
      [video.scenarioId],
    );
    if (sRes.rows.length === 0) throw new NotFoundException(`scenario ${video.scenarioId} not found`);
    const scenario = rowToScenario(sRes.rows[0]);

    return { video, scenario };
  }
}
```

- [ ] **Step 2.5: Register controllers in SmmModule**

Открыть `src/smm/smm.module.ts`. Добавить импорты и в `controllers`:

```typescript
import { RenderCallbackController } from './render/render-callback.controller';
import { ScenarioFetchController } from './render/scenario-fetch.controller';
```

В `@Module({ controllers: [...] })` добавить оба после `SmmController`:

```typescript
controllers: [SmmController, RenderCallbackController, ScenarioFetchController],
```

- [ ] **Step 2.6: Integration tests for the new endpoints**

Создать `tests/smm/render-callback.integration.test.js`:

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const axios = require('axios');
const { Pool } = require('pg');
const config = require('../config');

const BASE_URL = process.env.SMM_API_BASE || config.BASE_URL;
const WORKER_SECRET = process.env.SMM_WORKER_SECRET || '';

const http = axios.create({
  baseURL: BASE_URL,
  httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
  timeout: 15000,
  validateStatus: () => true,
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TEST_USER = '70000099999';

function workerHeaders() {
  return { 'X-Smm-Worker-Secret': WORKER_SECRET };
}

async function createVideoFixture() {
  // ensure user
  await pool.query(
    `INSERT INTO ai_profiles_consolidated (user_id, isadmin, tokens, updated_at)
     VALUES ($1, true, 1000000, now())
     ON CONFLICT (user_id) DO UPDATE SET tokens = 1000000`,
    [TEST_USER],
  );
  const c = await pool.query(
    `INSERT INTO smm_campaign (user_id, source_mode, requested_count)
     VALUES ($1, 'topic', 1) RETURNING id`, [TEST_USER]);
  const s = await pool.query(
    `INSERT INTO smm_scenario (campaign_id, title, assistant_role, dialog, mood, tts_tier)
     VALUES ($1, 't', 'psy', '[]'::jsonb, 'neutral', 'economy') RETURNING id`,
    [c.rows[0].id]);
  // charge + create video row
  const v = await pool.query(
    `INSERT INTO smm_video (scenario_id, status, tokens_charged)
     VALUES ($1, 'rendering', 15000) RETURNING id`, [s.rows[0].id]);
  await pool.query(
    `INSERT INTO smm_billing_ledger (user_id, video_id, amount, op, reason)
     VALUES ($1, $2, 15000, 'charge', 'queued')`,
    [TEST_USER, v.rows[0].id],
  );
  await pool.query(
    `UPDATE ai_profiles_consolidated SET tokens = tokens - 15000 WHERE user_id = $1`,
    [TEST_USER],
  );
  return { campaignId: c.rows[0].id, videoId: v.rows[0].id };
}

async function cleanup(campaignId) {
  await pool.query(`DELETE FROM smm_billing_ledger WHERE user_id = $1`, [TEST_USER]);
  await pool.query(`DELETE FROM smm_campaign WHERE id = $1`, [campaignId]);
  await pool.query(`UPDATE ai_profiles_consolidated SET tokens = 1000000 WHERE user_id = $1`, [TEST_USER]);
}

module.exports = {
  'render-callback: without secret → 401': async () => {
    const resp = await http.post('/webhook/smm/internal/render-callback', {
      videoId: '00000000-0000-0000-0000-000000000000', status: 'ready', mp4Url: 'x',
    });
    if (resp.status !== 401) throw new Error(`Expected 401, got ${resp.status}`);
  },

  'render-callback: with wrong secret → 401': async () => {
    if (!WORKER_SECRET) { console.log('  (skip: SMM_WORKER_SECRET not set)'); return; }
    const resp = await http.post(
      '/webhook/smm/internal/render-callback',
      { videoId: '00000000-0000-0000-0000-000000000000', status: 'ready', mp4Url: 'x' },
      { headers: { 'X-Smm-Worker-Secret': 'wrong' } });
    if (resp.status !== 401) throw new Error(`Expected 401, got ${resp.status}`);
  },

  'render-callback: ready → updates video, no refund': async () => {
    if (!WORKER_SECRET) { console.log('  (skip)'); return; }
    const { campaignId, videoId } = await createVideoFixture();
    try {
      const resp = await http.post(
        '/webhook/smm/internal/render-callback',
        { videoId, status: 'ready', mp4Url: 'https://example/v.mp4', durationSec: 60, sizeBytes: 5000000 },
        { headers: workerHeaders() });
      if (resp.status !== 201 && resp.status !== 200) {
        throw new Error(`Expected 200/201, got ${resp.status}: ${JSON.stringify(resp.data)}`);
      }
      const v = await pool.query(`SELECT status, mp4_url, duration_sec FROM smm_video WHERE id = $1`, [videoId]);
      if (v.rows[0].status !== 'ready') throw new Error(`Expected status=ready, got ${v.rows[0].status}`);
      if (v.rows[0].mp4_url !== 'https://example/v.mp4') throw new Error('mp4_url mismatch');
      if (v.rows[0].duration_sec !== 60) throw new Error('duration_sec mismatch');
      // no refund row should be added
      const refunds = await pool.query(
        `SELECT count(*)::int as n FROM smm_billing_ledger WHERE video_id = $1 AND op = 'refund'`, [videoId]);
      if (refunds.rows[0].n !== 0) throw new Error('Expected no refund row');
    } finally { await cleanup(campaignId); }
  },

  'render-callback: failed → updates video + refund': async () => {
    if (!WORKER_SECRET) { console.log('  (skip)'); return; }
    const { campaignId, videoId } = await createVideoFixture();
    try {
      const resp = await http.post(
        '/webhook/smm/internal/render-callback',
        { videoId, status: 'failed', errorMessage: 'TTS API 503' },
        { headers: workerHeaders() });
      if (resp.status !== 201 && resp.status !== 200) {
        throw new Error(`Expected 200/201, got ${resp.status}`);
      }
      const v = await pool.query(`SELECT status, error_message FROM smm_video WHERE id = $1`, [videoId]);
      if (v.rows[0].status !== 'failed') throw new Error('expected failed');
      if (!v.rows[0].error_message.includes('TTS')) throw new Error('error message missing');
      const refunds = await pool.query(
        `SELECT amount FROM smm_billing_ledger WHERE video_id = $1 AND op = 'refund'`, [videoId]);
      if (refunds.rows.length !== 1) throw new Error('Expected 1 refund row');
      if (refunds.rows[0].amount !== -15000) throw new Error(`Expected -15000, got ${refunds.rows[0].amount}`);
    } finally { await cleanup(campaignId); }
  },

  'render-state: updates render_state jsonb': async () => {
    if (!WORKER_SECRET) { console.log('  (skip)'); return; }
    const { campaignId, videoId } = await createVideoFixture();
    try {
      const newState = { scenarioLoaded: true, voicesSynthesized: ['voice-0.mp3'] };
      const resp = await http.post(
        '/webhook/smm/internal/render-state',
        { videoId, renderState: newState },
        { headers: workerHeaders() });
      if (resp.status !== 201 && resp.status !== 200) {
        throw new Error(`Expected 200/201, got ${resp.status}`);
      }
      const v = await pool.query(`SELECT render_state, status FROM smm_video WHERE id = $1`, [videoId]);
      if (v.rows[0].status !== 'rendering') throw new Error(`status not flipped to rendering`);
      if (!v.rows[0].render_state.scenarioLoaded) throw new Error('render_state not persisted');
    } finally { await cleanup(campaignId); }
  },
};
```

- [ ] **Step 2.7: Test for ScenarioFetchController**

Создать `tests/smm/scenario-fetch.integration.test.js`:

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const axios = require('axios');
const { Pool } = require('pg');
const config = require('../config');

const BASE_URL = process.env.SMM_API_BASE || config.BASE_URL;
const WORKER_SECRET = process.env.SMM_WORKER_SECRET || '';

const http = axios.create({
  baseURL: BASE_URL,
  httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
  timeout: 15000,
  validateStatus: () => true,
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TEST_USER = '70000099999';

async function createFixture() {
  await pool.query(
    `INSERT INTO ai_profiles_consolidated (user_id, isadmin, tokens, updated_at)
     VALUES ($1, true, 1000000, now())
     ON CONFLICT (user_id) DO UPDATE SET tokens = 1000000`, [TEST_USER]);
  const c = await pool.query(
    `INSERT INTO smm_campaign (user_id, source_mode, requested_count)
     VALUES ($1, 'topic', 1) RETURNING id`, [TEST_USER]);
  const dialog = [{ speaker: 'hero', text: 'Помоги!', tStart: 0, tEnd: 2 }];
  const s = await pool.query(
    `INSERT INTO smm_scenario
       (campaign_id, title, assistant_role, dialog, mood, tts_tier)
     VALUES ($1, 'Стресс', 'psy', $2::jsonb, 'calm', 'economy') RETURNING id`,
    [c.rows[0].id, JSON.stringify(dialog)]);
  const v = await pool.query(
    `INSERT INTO smm_video (scenario_id) VALUES ($1) RETURNING id`, [s.rows[0].id]);
  return { campaignId: c.rows[0].id, videoId: v.rows[0].id, scenarioId: s.rows[0].id };
}

async function cleanup(campaignId) {
  await pool.query(`DELETE FROM smm_campaign WHERE id = $1`, [campaignId]);
}

module.exports = {
  'render-context: without secret → 401': async () => {
    const resp = await http.get('/webhook/smm/internal/render-context/00000000-0000-0000-0000-000000000000');
    if (resp.status !== 401) throw new Error(`Expected 401, got ${resp.status}`);
  },

  'render-context: unknown videoId → 404': async () => {
    if (!WORKER_SECRET) { console.log('  (skip)'); return; }
    const resp = await http.get(
      '/webhook/smm/internal/render-context/00000000-0000-0000-0000-000000000000',
      { headers: { 'X-Smm-Worker-Secret': WORKER_SECRET } });
    if (resp.status !== 404) throw new Error(`Expected 404, got ${resp.status}`);
  },

  'render-context: returns video + scenario': async () => {
    if (!WORKER_SECRET) { console.log('  (skip)'); return; }
    const { campaignId, videoId, scenarioId } = await createFixture();
    try {
      const resp = await http.get(
        `/webhook/smm/internal/render-context/${videoId}`,
        { headers: { 'X-Smm-Worker-Secret': WORKER_SECRET } });
      if (resp.status !== 200) throw new Error(`Expected 200, got ${resp.status}: ${JSON.stringify(resp.data)}`);
      if (resp.data.video.id !== videoId) throw new Error('video.id mismatch');
      if (resp.data.scenario.id !== scenarioId) throw new Error('scenario.id mismatch');
      if (resp.data.scenario.dialog[0].text !== 'Помоги!') throw new Error('dialog not returned');
      if (resp.data.scenario.mood !== 'calm') throw new Error('mood mismatch');
    } finally { await cleanup(campaignId); }
  },
};
```

- [ ] **Step 2.8: Register in tests/smm/index.js**

```javascript
// tests/smm/index.js
module.exports = {
  ...require('./crypto.unit.test'),
  ...require('./storage.integration.test'),
  ...require('./pricing.integration.test'),
  ...require('./billing.integration.test'),
  ...require('./campaigns.integration.test'),
  ...require('./queues.integration.test'),
  ...require('./render-callback.integration.test'),
  ...require('./scenario-fetch.integration.test'),
};
```

- [ ] **Step 2.9: Build, restart local server, run tests**

```bash
cd /Users/dmitry/Downloads/spirits_back
npm run build 2>&1 | tail -3

# Kill existing dev server
lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; sleep 1
curl -sf -m 2 http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1 || \
  ssh -fN -L 9000:127.0.0.1:9000 dvolkov@212.113.106.202

PORT=3001 npm run start:dev > /tmp/smm-test-server.log 2>&1 &
APP_PID=$!
sleep 12

cd tests
SMM_API_BASE=http://localhost:3001 \
SMM_ADMIN_JWT='<fresh admin jwt>' \
SMM_NON_ADMIN_JWT='<fresh non-admin jwt>' \
SMM_WORKER_SECRET=$(grep '^SMM_WORKER_SECRET=' ../.env | cut -d= -f2-) \
node runner.js --suite smm 2>&1 | tail -15

kill $APP_PID 2>/dev/null || true
```

Expected: 26 prior + 7 new = **33 tests passing** (4 render-callback + 3 scenario-fetch).

- [ ] **Step 2.10: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/common/guards/worker-secret.guard.ts \
        src/smm/render/render-callback.dto.ts \
        src/smm/render/render-callback.controller.ts \
        src/smm/render/scenario-fetch.controller.ts \
        src/smm/smm.module.ts \
        tests/smm/render-callback.integration.test.js \
        tests/smm/scenario-fetch.integration.test.js \
        tests/smm/index.js
git -c commit.gpgsign=false commit -m "feat(smm): internal worker endpoints (callback + scenario fetch)

Adds WorkerSecretGuard (X-Smm-Worker-Secret header + localhost-only)
to gate two new internal endpoints used by linkeon-smm-worker:

- GET  /webhook/smm/internal/render-context/:videoId
       returns { video, scenario } so the worker can fetch the full
       job payload without direct PG access.

- POST /webhook/smm/internal/render-state
       persists intermediate render_state JSONB checkpoint after
       each pipeline step (for idempotent retry).

- POST /webhook/smm/internal/render-callback
       terminal status. On 'ready' updates mp4_url+duration+size.
       On 'failed' updates error_message and triggers automatic
       refund via SmmBillingService.

7 integration tests covering auth, validation, and the happy paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Worker → API HTTP client

**Files:**
- Create: `spirits_back/worker/src/api-client.ts`

- [ ] **Step 3.1: Создать api-client.ts**

```typescript
// worker/src/api-client.ts
import axios, { AxiosInstance } from 'axios';
import { config } from './config';
import { logger } from './logger';

export interface SmmDialogTurn {
  speaker: 'hero' | 'assistant';
  text: string;
  tStart: number;
  tEnd: number;
}

export interface SmmBrollPrompt {
  atSec: number;
  type: 'ai_image' | 'stock_video';
  prompt: string;
}

export interface SmmRenderContext {
  video: {
    id: string;
    scenarioId: string;
    status: string;
    renderState: Record<string, unknown>;
    tokensCharged: number;
  };
  scenario: {
    id: string;
    campaignId: string;
    title: string;
    assistantRole: string;
    dialog: SmmDialogTurn[];
    mood: 'dramatic' | 'inspiring' | 'calm' | 'uplifting' | 'tense' | 'neutral';
    brollPrompts: SmmBrollPrompt[];
    musicTrackId: string | null;
    ttsTier: 'economy' | 'premium';
  };
}

export interface RenderCallbackInput {
  videoId: string;
  status: 'ready' | 'failed';
  mp4Url?: string;
  durationSec?: number;
  sizeBytes?: number;
  errorMessage?: string;
}

export class ApiClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.apiUrl,
      headers: { 'X-Smm-Worker-Secret': config.workerSecret },
      timeout: 20000,
      validateStatus: () => true,
    });
  }

  async getRenderContext(videoId: string): Promise<SmmRenderContext> {
    const r = await this.http.get(`/webhook/smm/internal/render-context/${videoId}`);
    if (r.status !== 200) {
      throw new Error(`getRenderContext ${videoId}: ${r.status} ${JSON.stringify(r.data)}`);
    }
    return r.data;
  }

  async updateRenderState(videoId: string, renderState: Record<string, unknown>): Promise<void> {
    const r = await this.http.post('/webhook/smm/internal/render-state', { videoId, renderState });
    if (r.status >= 300) {
      throw new Error(`updateRenderState ${videoId}: ${r.status} ${JSON.stringify(r.data)}`);
    }
    logger.debug({ videoId, renderState }, 'render-state persisted');
  }

  async sendCallback(input: RenderCallbackInput): Promise<void> {
    const r = await this.http.post('/webhook/smm/internal/render-callback', input);
    if (r.status >= 300) {
      throw new Error(`sendCallback ${input.videoId}: ${r.status} ${JSON.stringify(r.data)}`);
    }
    logger.info({ videoId: input.videoId, status: input.status }, 'callback delivered');
  }
}

export const apiClient = new ApiClient();
```

- [ ] **Step 3.2: Smoke from worker REPL**

Создать `worker/scripts/smoke-api-client.ts`:

```typescript
// worker/scripts/smoke-api-client.ts
import { apiClient } from '../src/api-client';

async function main() {
  // Replace with a real videoId from your DB for smoke
  const videoId = process.argv[2];
  if (!videoId) {
    console.error('usage: ts-node scripts/smoke-api-client.ts <videoId>');
    process.exit(1);
  }
  const ctx = await apiClient.getRenderContext(videoId);
  console.log('Got context:', JSON.stringify(ctx, null, 2).slice(0, 500));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Smoke (locally with dev server running):

```bash
# create a test video row in DB first
VIDEO_ID=$(PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -At -c "
WITH c AS (
  INSERT INTO smm_campaign (user_id, source_mode, requested_count)
  VALUES ('70000099999', 'topic', 1) RETURNING id
), s AS (
  INSERT INTO smm_scenario (campaign_id, title, assistant_role, dialog, mood)
  SELECT id, 'smoke', 'psy', '[]'::jsonb, 'neutral' FROM c RETURNING id
)
INSERT INTO smm_video (scenario_id) SELECT id FROM s RETURNING id;
")
echo "VIDEO_ID=$VIDEO_ID"

cd /Users/dmitry/Downloads/spirits_back/worker
npx ts-node scripts/smoke-api-client.ts "$VIDEO_ID"

# cleanup
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c "
DELETE FROM smm_campaign WHERE user_id='70000099999' AND topic IS NULL;
"
```

Expected: prints JSON snippet with `video` and `scenario` keys.

- [ ] **Step 3.3: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add worker/src/api-client.ts worker/scripts/smoke-api-client.ts
git -c commit.gpgsign=false commit -m "feat(smm-worker): API client for internal endpoints

Axios-based ApiClient wrapping the three worker→API endpoints:
- getRenderContext(videoId) → { video, scenario }
- updateRenderState(videoId, state)
- sendCallback({ videoId, status, mp4Url?, errorMessage? })

All requests carry X-Smm-Worker-Secret header. validateStatus disabled
so the client can produce meaningful error messages with response body.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: TTS clients (Yandex + ElevenLabs + dispatcher)

**Files:**
- Create: `spirits_back/worker/src/tts/voices.ts`
- Create: `spirits_back/worker/src/tts/yandex.ts`
- Create: `spirits_back/worker/src/tts/elevenlabs.ts`
- Create: `spirits_back/worker/src/tts/index.ts`

- [ ] **Step 4.1: voices.ts — voice id mapping**

```typescript
// worker/src/tts/voices.ts
import { config } from '../config';

export type Speaker = 'hero' | 'assistant';
export type AssistantRole = 'psy' | 'lawyer' | 'coach' | (string & {});
export type HeroGender = 'm' | 'f';

export interface YandexVoiceSelection {
  voice: string;        // e.g. 'oksana', 'zahar'
  emotion?: 'good' | 'neutral' | 'evil';
}

export interface ElevenlabsVoiceSelection {
  voiceId: string;
}

const YANDEX_MAP: Record<string, YandexVoiceSelection> = {
  hero_m: { voice: 'zahar', emotion: 'neutral' },
  hero_f: { voice: 'oksana', emotion: 'neutral' },
  assistant_psy: { voice: 'ermil', emotion: 'good' },
  assistant_lawyer: { voice: 'madirus', emotion: 'neutral' },
  assistant_coach: { voice: 'jane', emotion: 'good' },
  assistant_default: { voice: 'jane', emotion: 'neutral' },
};

export function pickYandexVoice(
  speaker: Speaker,
  role: AssistantRole,
  heroGender: HeroGender = 'm',
): YandexVoiceSelection {
  if (speaker === 'hero') return YANDEX_MAP[`hero_${heroGender}`];
  const key = `assistant_${role}`;
  return YANDEX_MAP[key] || YANDEX_MAP.assistant_default;
}

export function pickElevenlabsVoice(
  speaker: Speaker,
  role: AssistantRole,
  heroGender: HeroGender = 'm',
): ElevenlabsVoiceSelection {
  const v = config.tts.elevenlabsVoices;
  if (speaker === 'hero') {
    const id = heroGender === 'f' ? v.heroFemale : v.heroMale;
    if (!id) throw new Error(`ElevenLabs hero_${heroGender} voice id not configured`);
    return { voiceId: id };
  }
  const id = (v as Record<string, string>)[role] || v.psy;
  if (!id) throw new Error(`ElevenLabs voice for role=${role} not configured`);
  return { voiceId: id };
}
```

- [ ] **Step 4.2: yandex.ts — SpeechKit client (returns LPCM 48kHz)**

```typescript
// worker/src/tts/yandex.ts
import axios from 'axios';
import { config } from '../config';
import { logger } from '../logger';
import { YandexVoiceSelection } from './voices';

export interface YandexSynthInput {
  text: string;
  voice: YandexVoiceSelection;
}

export async function synthesizeYandex(input: YandexSynthInput): Promise<Buffer> {
  const apiKey = config.tts.yandexApiKey;
  const folderId = config.tts.yandexFolderId;
  if (!apiKey || !folderId) {
    throw new Error('YANDEX_TTS_API_KEY or YANDEX_TTS_FOLDER_ID not configured');
  }

  const params = new URLSearchParams();
  params.set('text', input.text);
  params.set('lang', 'ru-RU');
  params.set('voice', input.voice.voice);
  if (input.voice.emotion) params.set('emotion', input.voice.emotion);
  params.set('format', 'lpcm');
  params.set('sampleRateHertz', '48000');
  params.set('folderId', folderId);

  const r = await axios.post(
    'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize',
    params.toString(),
    {
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      responseType: 'arraybuffer',
      timeout: 30000,
      validateStatus: () => true,
    },
  );
  if (r.status !== 200) {
    const errBody = Buffer.from(r.data).toString('utf8').slice(0, 200);
    throw new Error(`Yandex TTS ${r.status}: ${errBody}`);
  }
  const buf = Buffer.from(r.data);
  logger.debug({ voice: input.voice.voice, bytes: buf.length }, 'yandex synth ok');
  return buf;
}
```

- [ ] **Step 4.3: elevenlabs.ts — Turbo v2.5 (returns MP3)**

```typescript
// worker/src/tts/elevenlabs.ts
import axios from 'axios';
import { config } from '../config';
import { logger } from '../logger';
import { ElevenlabsVoiceSelection } from './voices';

export interface ElevenlabsSynthInput {
  text: string;
  voice: ElevenlabsVoiceSelection;
}

export async function synthesizeElevenlabs(input: ElevenlabsSynthInput): Promise<Buffer> {
  const apiKey = config.tts.elevenlabsApiKey;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  const r = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${input.voice.voiceId}`,
    {
      text: input.text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.4,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true,
    },
  );
  if (r.status !== 200) {
    const errBody = Buffer.from(r.data).toString('utf8').slice(0, 200);
    throw new Error(`ElevenLabs TTS ${r.status}: ${errBody}`);
  }
  const buf = Buffer.from(r.data);
  logger.debug({ voiceId: input.voice.voiceId, bytes: buf.length }, 'elevenlabs synth ok');
  return buf;
}
```

- [ ] **Step 4.4: index.ts — dispatcher by tier**

```typescript
// worker/src/tts/index.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { synthesizeYandex } from './yandex';
import { synthesizeElevenlabs } from './elevenlabs';
import {
  pickYandexVoice,
  pickElevenlabsVoice,
  Speaker,
  AssistantRole,
  HeroGender,
} from './voices';

export type TtsTier = 'economy' | 'premium';

export interface SynthRequest {
  tier: TtsTier;
  speaker: Speaker;
  role: AssistantRole;
  heroGender?: HeroGender;
  text: string;
}

export interface SynthResult {
  format: 'lpcm' | 'mp3';
  bytes: Buffer;
}

export async function synthesize(req: SynthRequest): Promise<SynthResult> {
  if (req.tier === 'economy') {
    const voice = pickYandexVoice(req.speaker, req.role, req.heroGender);
    const bytes = await synthesizeYandex({ text: req.text, voice });
    return { format: 'lpcm', bytes };
  }
  const voice = pickElevenlabsVoice(req.speaker, req.role, req.heroGender);
  const bytes = await synthesizeElevenlabs({ text: req.text, voice });
  return { format: 'mp3', bytes };
}

export async function writeSynthResultToFile(
  result: SynthResult,
  outDir: string,
  basename: string,
): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });
  const ext = result.format === 'lpcm' ? 'pcm' : 'mp3';
  const filename = path.join(outDir, `${basename}.${ext}`);
  await fs.writeFile(filename, result.bytes);
  return filename;
}
```

- [ ] **Step 4.5: Smoke + commit**

Create `worker/scripts/smoke-tts.ts`:

```typescript
// worker/scripts/smoke-tts.ts
import { synthesize, writeSynthResultToFile } from '../src/tts';
import * as os from 'os';
import * as path from 'path';

async function main() {
  const tier = (process.argv[2] || 'economy') as 'economy' | 'premium';
  const text = process.argv.slice(3).join(' ') ||
    'Привет, я твой ИИ-психолог. Расскажи, что тебя беспокоит.';
  const outDir = path.join(os.tmpdir(), `smm-tts-smoke-${Date.now()}`);
  const res = await synthesize({ tier, speaker: 'assistant', role: 'psy', text });
  const out = await writeSynthResultToFile(res, outDir, 'sample');
  console.log(`Saved ${res.bytes.length} bytes (${res.format}) to: ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Populate TTS env from API .env, then smoke:

```bash
cd /Users/dmitry/Downloads/spirits_back/worker
for key in YANDEX_TTS_API_KEY YANDEX_TTS_FOLDER_ID ELEVENLABS_API_KEY \
           ELEVENLABS_VOICE_HERO_M ELEVENLABS_VOICE_HERO_F ELEVENLABS_VOICE_PSY \
           ELEVENLABS_VOICE_LAWYER ELEVENLABS_VOICE_COACH; do
  val=$(grep "^${key}=" ../.env | head -1 | cut -d= -f2-)
  [ -n "$val" ] && sed -i.bak "s|^${key}=.*|${key}=${val}|" .env && rm .env.bak
done
npx ts-node scripts/smoke-tts.ts economy "Привет, тест озвучки."
# Expected: "Saved N bytes (lpcm) to: /tmp/smm-tts-smoke-.../sample.pcm"
npm run build 2>&1 | tail -3

cd ..
git add worker/src/tts/ worker/scripts/smoke-tts.ts
git -c commit.gpgsign=false commit -m "feat(smm-worker): TTS clients (Yandex SpeechKit + ElevenLabs Turbo v2.5)

voices.ts maps speaker+role+gender to provider voice ids.
yandex.ts returns LPCM 48kHz; elevenlabs.ts returns MP3.
index.ts dispatcher by tier (economy → Yandex, premium → EL).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Image gen (Nano Banana / Imagen) + Pexels stock-video + smoke

**Files:**
- Create: `spirits_back/worker/src/media/image-gen.ts`
- Create: `spirits_back/worker/src/media/stock-video.ts`
- Create: `spirits_back/worker/scripts/smoke-image-gen.ts`
- Create: `spirits_back/worker/scripts/smoke-stock-video.ts`

- [ ] **Step 5.1: image-gen.ts**

```typescript
// worker/src/media/image-gen.ts
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config';
import { logger } from '../logger';

export interface ImageGenInput {
  prompt: string;
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
}

export async function generateImage(input: ImageGenInput): Promise<Buffer> {
  const apiKey = config.media.googleAiApiKey;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured');
  const aspect = input.aspectRatio || '9:16';

  // Try Imagen 4.0 Ultra (higher quality, slower)
  try {
    const r = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:predict?key=${apiKey}`,
      {
        instances: [{ prompt: input.prompt }],
        parameters: { sampleCount: 1, aspectRatio: aspect, personGeneration: 'allow_adult' },
      },
      { timeout: 60000, validateStatus: () => true },
    );
    if (r.status === 200) {
      const pred = (r.data?.predictions || [])[0];
      const b64 = pred?.bytesBase64Encoded || pred?.image?.bytesBase64Encoded;
      if (b64) {
        const buf = Buffer.from(b64, 'base64');
        logger.debug({ model: 'imagen-4.0-ultra', bytes: buf.length }, 'image gen ok');
        return buf;
      }
    }
    logger.warn({ status: r.status }, 'Imagen failed, falling back to Gemini Flash');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Imagen errored, falling back');
  }

  // Fallback: Gemini 2.5 Flash Image (Nano Banana 2)
  const r = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: `${input.prompt}. Vertical 9:16 portrait composition.` }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    },
    { timeout: 60000, validateStatus: () => true },
  );
  if (r.status !== 200) {
    throw new Error(`Gemini Flash Image ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  }
  const parts = r.data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const buf = Buffer.from(part.inlineData.data, 'base64');
      logger.debug({ model: 'gemini-2.5-flash-image', bytes: buf.length }, 'image gen ok');
      return buf;
    }
  }
  throw new Error('Gemini Flash returned no image data');
}

export async function writeImageToFile(bytes: Buffer, outDir: string, basename: string): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });
  const filename = path.join(outDir, `${basename}.png`);
  await fs.writeFile(filename, bytes);
  return filename;
}
```

- [ ] **Step 5.2: stock-video.ts**

```typescript
// worker/src/media/stock-video.ts
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config';
import { logger } from '../logger';

export interface StockSearchInput {
  query: string;
  maxDurationSec?: number;
  minHeight?: number;
}

export interface StockVideoMatch {
  id: number;
  url: string;
  durationSec: number;
  width: number;
  height: number;
  downloadUrl: string;
}

export async function searchStockVideo(input: StockSearchInput): Promise<StockVideoMatch | null> {
  const apiKey = config.media.pexelsApiKey;
  if (!apiKey) throw new Error('PEXELS_API_KEY not configured');

  const r = await axios.get('https://api.pexels.com/videos/search', {
    headers: { Authorization: apiKey },
    params: { query: input.query, orientation: 'portrait', size: 'medium', per_page: 10 },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (r.status !== 200) {
    throw new Error(`Pexels ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  }
  const maxDur = input.maxDurationSec ?? 10;
  const minH = input.minHeight ?? 1080;

  for (const v of (r.data.videos || [])) {
    if (v.duration > maxDur) continue;
    const portrait = (v.video_files || []).filter((f: any) =>
      f.width && f.height && f.height >= minH && f.height >= f.width
    );
    if (portrait.length === 0) continue;
    portrait.sort((a: any, b: any) => a.height - b.height);
    const file = portrait[0];
    return {
      id: v.id,
      url: v.url,
      durationSec: v.duration,
      width: file.width,
      height: file.height,
      downloadUrl: file.link,
    };
  }
  return null;
}

export async function downloadStockVideo(url: string, outDir: string, basename: string): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });
  const filename = path.join(outDir, `${basename}.mp4`);
  const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  await fs.writeFile(filename, Buffer.from(r.data));
  logger.debug({ filename, bytes: r.data.byteLength }, 'stock video downloaded');
  return filename;
}
```

- [ ] **Step 5.3: Smoke + commit**

```bash
# Pexels API key (free — register at pexels.com/api, then add to API .env):
# PEXELS_API_KEY=...
# Then sync to worker .env:
cd /Users/dmitry/Downloads/spirits_back/worker
val=$(grep '^PEXELS_API_KEY=' ../.env | head -1 | cut -d= -f2-)
if [ -n "$val" ]; then sed -i.bak "s|^PEXELS_API_KEY=.*|PEXELS_API_KEY=${val}|" .env && rm .env.bak; fi

# Smoke image gen
cat > scripts/smoke-image-gen.ts <<'EOF'
import { generateImage, writeImageToFile } from '../src/media/image-gen';
import * as os from 'os';
import * as path from 'path';
async function main() {
  const prompt = process.argv.slice(2).join(' ') ||
    'Молодая женщина читает книгу на диване, уютная атмосфера, кинематографичный кадр';
  const outDir = path.join(os.tmpdir(), `smm-img-smoke-${Date.now()}`);
  const bytes = await generateImage({ prompt, aspectRatio: '9:16' });
  const out = await writeImageToFile(bytes, outDir, 'sample');
  console.log(`Saved ${bytes.length} bytes to: ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
EOF

cat > scripts/smoke-stock-video.ts <<'EOF'
import { searchStockVideo, downloadStockVideo } from '../src/media/stock-video';
import * as os from 'os';
import * as path from 'path';
async function main() {
  const query = process.argv.slice(2).join(' ') || 'sunset ocean';
  const match = await searchStockVideo({ query });
  if (!match) { console.error('No match'); process.exit(2); }
  console.log(`Match: ${match.url} (${match.durationSec}s ${match.width}x${match.height})`);
  const outDir = path.join(os.tmpdir(), `smm-stock-smoke-${Date.now()}`);
  const file = await downloadStockVideo(match.downloadUrl, outDir, 'sample');
  console.log(`Saved to: ${file}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
EOF

npx ts-node scripts/smoke-image-gen.ts "Кот на подоконнике на закате"
# Expected: PNG ~200KB-2MB at /tmp/smm-img-smoke-*/sample.png

# Skip stock smoke if PEXELS_API_KEY missing
if grep -q '^PEXELS_API_KEY=...$' .env || ! grep -q '^PEXELS_API_KEY=.\+' .env; then
  echo "skip: PEXELS_API_KEY not set"
else
  npx ts-node scripts/smoke-stock-video.ts "woman thinking"
fi
npm run build 2>&1 | tail -3

cd ..
git add worker/src/media/ worker/scripts/smoke-image-gen.ts worker/scripts/smoke-stock-video.ts
git -c commit.gpgsign=false commit -m "feat(smm-worker): image gen (Imagen+Gemini fallback) + Pexels stock-video

image-gen.ts: tries Imagen 4.0 Ultra, falls back to Gemini 2.5 Flash
Image on error. Default aspect 9:16. Reuses GOOGLE_AI_API_KEY.

stock-video.ts: Pexels portrait-orientation search, picks smallest
clip with height >= minHeight (default 1080) and duration <= max
(default 10s). PEXELS_API_KEY required (free key).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Music library — service + seed

**Files:**
- Create: `spirits_back/src/smm/music/music.service.ts`
- Create: `spirits_back/scripts/seed-music.ts`
- Modify: `spirits_back/src/smm/smm.module.ts`
- Create: `spirits_back/worker/src/music/library.ts`

- [ ] **Step 6.1: MusicService (NestJS-side CRUD)**

Создать `src/smm/music/music.service.ts`:

```typescript
// src/smm/music/music.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../../common/services/pg.service';
import { SmmMusicTrack, rowToMusicTrack } from '../entities/smm-music-track.entity';
import { SmmMood } from '../entities/smm-scenario.entity';

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  constructor(private readonly pg: PgService) {}

  async upsert(track: Omit<SmmMusicTrack, 'createdAt'>): Promise<void> {
    await this.pg.query(
      `INSERT INTO smm_music_track (id, title, mood, duration_sec, storage_key, license)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             mood = EXCLUDED.mood,
             duration_sec = EXCLUDED.duration_sec,
             storage_key = EXCLUDED.storage_key,
             license = EXCLUDED.license`,
      [track.id, track.title, track.mood, track.durationSec, track.storageKey, track.license ?? null],
    );
    this.logger.log(`upsert music track ${track.id} mood=${track.mood}`);
  }

  async listByMood(mood: SmmMood, minDurationSec = 60): Promise<SmmMusicTrack[]> {
    const r = await this.pg.query(
      `SELECT * FROM smm_music_track WHERE mood = $1 AND duration_sec >= $2`,
      [mood, minDurationSec],
    );
    return r.rows.map(rowToMusicTrack);
  }

  async findById(id: string): Promise<SmmMusicTrack | null> {
    const r = await this.pg.query(`SELECT * FROM smm_music_track WHERE id = $1`, [id]);
    return r.rows[0] ? rowToMusicTrack(r.rows[0]) : null;
  }
}
```

Register in `src/smm/smm.module.ts` — add to `providers` and `exports`:

```typescript
import { MusicService } from './music/music.service';
// ...
providers: [...prevProviders, MusicService],
exports: [...prevExports, MusicService],
```

- [ ] **Step 6.2: Worker-side library picker**

Создать `worker/src/music/library.ts`:

```typescript
// worker/src/music/library.ts
import { apiClient } from '../api-client';
import { logger } from '../logger';

export type Mood = 'dramatic' | 'inspiring' | 'calm' | 'uplifting' | 'tense' | 'neutral';

export interface PickedTrack {
  id: string;
  title: string;
  mood: Mood;
  durationSec: number;
  /** Direct public URL via MinIO nginx proxy */
  publicUrl: string;
}

/**
 * Worker asks the API for the list of available tracks by mood,
 * picks one (rotating by job id for variety), returns metadata + public URL.
 *
 * For Plan 2 MVP, picking is just "first match". Variety can come later.
 */
export async function pickTrackByMood(mood: Mood, durationSec = 60): Promise<PickedTrack | null> {
  // The API doesn't yet expose a music-list endpoint. For Plan 2 we accept that the
  // worker will use a hardcoded mapping written by the seed script (Step 6.3) and
  // the public URL is composed from MINIO_PUBLIC_URL + bucketMusic + storage_key.
  // Fetching the metadata via an internal endpoint is straightforward but trivial;
  // we hold it in worker memory after first fetch.
  if (!_cachedTracks) {
    _cachedTracks = await fetchTracks();
  }
  const matches = _cachedTracks.filter((t) => t.mood === mood && t.durationSec >= durationSec);
  if (matches.length === 0) {
    logger.warn({ mood }, 'no music track available for mood');
    return matches[0] ?? _cachedTracks.find((t) => t.mood === 'neutral') ?? null;
  }
  return matches[0];
}

let _cachedTracks: PickedTrack[] | null = null;

async function fetchTracks(): Promise<PickedTrack[]> {
  // Worker reaches into the API via a small internal endpoint (Step 6.4 adds it).
  const tracks = await apiClient.listMusicTracks();
  return tracks;
}
```

- [ ] **Step 6.3: Add `listMusicTracks` to API client + internal endpoint**

In `worker/src/api-client.ts`, ADD this method to the `ApiClient` class:

```typescript
  async listMusicTracks(): Promise<Array<{
    id: string; title: string; mood: 'dramatic'|'inspiring'|'calm'|'uplifting'|'tense'|'neutral';
    durationSec: number; publicUrl: string;
  }>> {
    const r = await this.http.get('/webhook/smm/internal/music-tracks');
    if (r.status !== 200) throw new Error(`listMusicTracks: ${r.status}`);
    return r.data;
  }
```

In `src/smm/render/scenario-fetch.controller.ts`, ADD this method to the class:

```typescript
  @Get('music-tracks')
  async listMusicTracks(): Promise<Array<{
    id: string; title: string; mood: string; durationSec: number; publicUrl: string;
  }>> {
    const r = await this.pg.query(`SELECT * FROM smm_music_track ORDER BY mood, id`);
    const base = (process.env.MINIO_PUBLIC_URL || '').replace(/\/$/, '');
    const bucket = process.env.MINIO_BUCKET_MUSIC || 'linkeon-smm-music';
    return r.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      mood: row.mood,
      durationSec: row.duration_sec,
      publicUrl: `${base}/${bucket}/${row.storage_key}`,
    }));
  }
```

- [ ] **Step 6.4: Seed script — download 6 mood tracks from Pixabay Music**

Создать `scripts/seed-music.ts`:

```typescript
#!/usr/bin/env ts-node
/**
 * Seed smm_music_track with 6 placeholder tracks (one per mood).
 *
 * The actual MP3 files need to be downloaded manually from Pixabay Music
 * (https://pixabay.com/music/) and uploaded to MinIO under bucket
 * linkeon-smm-music with the storage_key matching what's listed below.
 *
 * Usage:
 *   1. Download 6 tracks (you pick), place locally as:
 *      /tmp/seed-music/dramatic.mp3, inspiring.mp3, calm.mp3,
 *      uplifting.mp3, tense.mp3, neutral.mp3
 *   2. mc cp /tmp/seed-music/*.mp3 local/linkeon-smm-music/
 *   3. npm run seed-music
 *
 * Each track must be >= 60 seconds. duration_sec below is a default;
 * if you change track files, update durations here too.
 */
import { Pool } from 'pg';

const TRACKS = [
  { id: 'dramatic_01',  mood: 'dramatic',  title: 'Dramatic Cinematic 1', durationSec: 120, storageKey: 'dramatic.mp3',  license: 'Pixabay Music CC0' },
  { id: 'inspiring_01', mood: 'inspiring', title: 'Uplifting Piano',      durationSec: 95,  storageKey: 'inspiring.mp3', license: 'Pixabay Music CC0' },
  { id: 'calm_01',      mood: 'calm',      title: 'Soft Ambient',         durationSec: 130, storageKey: 'calm.mp3',      license: 'Pixabay Music CC0' },
  { id: 'uplifting_01', mood: 'uplifting', title: 'Happy Acoustic',       durationSec: 100, storageKey: 'uplifting.mp3', license: 'Pixabay Music CC0' },
  { id: 'tense_01',     mood: 'tense',     title: 'Suspense Pulse',       durationSec: 110, storageKey: 'tense.mp3',     license: 'Pixabay Music CC0' },
  { id: 'neutral_01',   mood: 'neutral',   title: 'Background Bed',       durationSec: 140, storageKey: 'neutral.mp3',   license: 'Pixabay Music CC0' },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  for (const t of TRACKS) {
    await pool.query(
      `INSERT INTO smm_music_track (id, title, mood, duration_sec, storage_key, license)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title, mood = EXCLUDED.mood,
             duration_sec = EXCLUDED.duration_sec, storage_key = EXCLUDED.storage_key,
             license = EXCLUDED.license`,
      [t.id, t.title, t.mood, t.durationSec, t.storageKey, t.license],
    );
    console.log(`✓ upserted ${t.id}`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Add to `package.json` scripts:

```json
"seed-music": "ts-node scripts/seed-music.ts"
```

- [ ] **Step 6.5: Download tracks manually from Pixabay Music**

This is a one-time content task. From a browser:

1. Open https://pixabay.com/music/search/cinematic/ — download one ~2-min track, save as `dramatic.mp3`
2. https://pixabay.com/music/search/uplifting/ — `inspiring.mp3`, `uplifting.mp3` (two different)
3. https://pixabay.com/music/search/ambient/ — `calm.mp3`
4. https://pixabay.com/music/search/suspense/ — `tense.mp3`
5. https://pixabay.com/music/search/background/ — `neutral.mp3`

Place all six in `/tmp/seed-music/`. Each must be ≥60s and the filename must match exactly.

Upload to MinIO (via SSH tunnel from earlier):

```bash
# From local laptop, files must be on the server first
scp /tmp/seed-music/*.mp3 dvolkov@212.113.106.202:/tmp/seed-music/
ssh dvolkov@212.113.106.202 '
  mkdir -p /tmp/seed-music
  for f in /tmp/seed-music/*.mp3; do
    base=$(basename $f)
    mc cp "$f" local/linkeon-smm-music/"$base"
  done
  mc ls local/linkeon-smm-music/
'
```

Then run seed:

```bash
cd /Users/dmitry/Downloads/spirits_back
DATABASE_URL="postgresql://linkeon:linkeon_pass_2026@212.113.106.202:5433/linkeon" npm run seed-music
```

Verify:

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c \
  "SELECT id, mood, duration_sec FROM smm_music_track ORDER BY mood;"
```

Expected: 6 rows.

Verify public URLs work:

```bash
curl -sI https://my.linkeon.io/smm-media/linkeon-smm-music/calm.mp3 | head -5
```

Expected: `HTTP/2 200`.

- [ ] **Step 6.6: Build + commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
npm run build 2>&1 | tail -3
cd worker && npm run build 2>&1 | tail -3
cd ..
git add src/smm/music/ src/smm/smm.module.ts \
        src/smm/render/scenario-fetch.controller.ts \
        scripts/seed-music.ts package.json \
        worker/src/api-client.ts worker/src/music/library.ts
git -c commit.gpgsign=false commit -m "feat(smm): music library — MusicService + seed + worker picker

NestJS:
- MusicService (upsert, listByMood, findById)
- /webhook/smm/internal/music-tracks GET (worker-secret guarded)
- scripts/seed-music.ts: 6 placeholder rows (one per mood),
  storage_keys point to files in MinIO bucket linkeon-smm-music
- npm run seed-music applies the seed

Worker:
- pickTrackByMood(mood, durationSec) — cached after first API call,
  picks first match per mood (rotation in later phase)
- apiClient.listMusicTracks() added

Pixabay Music tracks downloaded and uploaded to MinIO manually.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Subtitle chunker (pure utility)

**Files:**
- Create: `spirits_back/worker/src/tts/subtitle-chunker.ts`
- Create: `spirits_back/tests/smm/subtitle-chunker.unit.test.js`

Чистая функция, лучше всего тестируется юнит-тестами. Принимает `text` и `durationSec` → возвращает массив `{ text, tStart, tEnd }` с равномерно распределёнными чанками по 3-5 слов.

- [ ] **Step 7.1: Test first (TDD)**

Создать `tests/smm/subtitle-chunker.unit.test.js`:

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { chunkSubtitles } = require(
  path.join(__dirname, '..', '..', 'worker', 'dist', 'tts', 'subtitle-chunker'),
);

module.exports = {
  'chunker: single short phrase → 1 chunk': () => {
    const out = chunkSubtitles('Привет, как дела?', 0, 2);
    if (out.length !== 1) throw new Error(`Expected 1 chunk, got ${out.length}`);
    if (out[0].text !== 'Привет, как дела?') throw new Error(`text mismatch: ${out[0].text}`);
    if (out[0].tStart !== 0) throw new Error(`tStart=${out[0].tStart}`);
    if (out[0].tEnd !== 2) throw new Error(`tEnd=${out[0].tEnd}`);
  },

  'chunker: long phrase splits on punctuation': () => {
    const out = chunkSubtitles(
      'Я хорошо понимаю твою тревогу. Это сейчас типичная история. Попробуй три простых шага.',
      0, 9,
    );
    if (out.length < 3) throw new Error(`Expected >=3 chunks, got ${out.length}`);
    // Each chunk timing must be monotonically increasing
    for (let i = 1; i < out.length; i++) {
      if (out[i].tStart < out[i-1].tEnd - 0.01) {
        throw new Error(`overlap at ${i}: ${out[i-1].tEnd} → ${out[i].tStart}`);
      }
    }
    // First chunk starts at 0, last ends at duration
    if (Math.abs(out[0].tStart - 0) > 0.01) throw new Error('first tStart not 0');
    if (Math.abs(out[out.length-1].tEnd - 9) > 0.01) throw new Error('last tEnd not 9');
  },

  'chunker: long phrase without punctuation chunks by word count': () => {
    const out = chunkSubtitles(
      'один два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать',
      0, 6,
    );
    if (out.length < 2) throw new Error(`Expected >=2 chunks, got ${out.length}`);
    for (const c of out) {
      const words = c.text.split(/\s+/);
      if (words.length > 5) throw new Error(`chunk too long (${words.length} words): "${c.text}"`);
    }
  },

  'chunker: distributes duration proportionally to chunk length': () => {
    const out = chunkSubtitles('Раз. И ещё много слов в этом длинном предложении.', 0, 10);
    if (out.length < 2) throw new Error(`Expected >=2 chunks`);
    const shortDur = out[0].tEnd - out[0].tStart;
    const longDur = out[out.length-1].tEnd - out[out.length-1].tStart;
    if (shortDur >= longDur) throw new Error(`expected short < long: ${shortDur} vs ${longDur}`);
  },

  'chunker: empty string → 0 chunks': () => {
    const out = chunkSubtitles('', 0, 2);
    if (out.length !== 0) throw new Error(`Expected 0 chunks, got ${out.length}`);
  },
};
```

Add to `tests/smm/index.js`:

```javascript
  ...require('./subtitle-chunker.unit.test'),
```

Run to confirm failure (module not built yet):

```bash
cd /Users/dmitry/Downloads/spirits_back/tests
node runner.js --suite smm 2>&1 | tail -5
```

Expected: error "Cannot find module .../worker/dist/tts/subtitle-chunker"

- [ ] **Step 7.2: Implementation**

Создать `worker/src/tts/subtitle-chunker.ts`:

```typescript
// worker/src/tts/subtitle-chunker.ts
export interface SubtitleChunk {
  text: string;
  tStart: number;
  tEnd: number;
}

const MAX_WORDS_PER_CHUNK = 5;
const MIN_WORDS_PER_CHUNK = 2;
const SENTENCE_TERMINATORS = /([.!?…]+["»)]?)\s+/g;

/**
 * Split `text` into subtitle chunks of ~3-5 words each, distributing the
 * total `tEnd - tStart` duration proportionally to chunk character length.
 *
 * Strategy:
 *   1. Split on sentence terminators (. ! ? …) keeping the terminator.
 *   2. For each sentence: if <= MAX_WORDS, keep whole; else greedy-split
 *      on word boundaries respecting MAX/MIN.
 *   3. Allocate time per chunk proportionally to character count.
 *
 * Pure function, no side effects.
 */
export function chunkSubtitles(text: string, tStart: number, tEnd: number): SubtitleChunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Split into sentences preserving terminators
  const sentences: string[] = [];
  let lastIdx = 0;
  const re = new RegExp(SENTENCE_TERMINATORS.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    const end = m.index + m[1].length;
    sentences.push(trimmed.slice(lastIdx, end).trim());
    lastIdx = end;
  }
  if (lastIdx < trimmed.length) sentences.push(trimmed.slice(lastIdx).trim());

  // Break each sentence into word-chunks of MAX_WORDS, with the final tail
  // merged if it would be < MIN_WORDS
  const rawChunks: string[] = [];
  for (const s of sentences) {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let i = 0;
    while (i < words.length) {
      let end = Math.min(i + MAX_WORDS_PER_CHUNK, words.length);
      // If the tail after this chunk would have < MIN_WORDS, absorb it
      if (end < words.length && words.length - end < MIN_WORDS_PER_CHUNK) {
        end = words.length;
      }
      rawChunks.push(words.slice(i, end).join(' '));
      i = end;
    }
  }
  if (rawChunks.length === 0) return [];

  // Distribute duration proportionally to character length
  const totalDur = tEnd - tStart;
  const totalChars = rawChunks.reduce((acc, c) => acc + c.length, 0);
  let cursor = tStart;
  const result: SubtitleChunk[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const c = rawChunks[i];
    const dur = (c.length / totalChars) * totalDur;
    const cStart = cursor;
    const cEnd = i === rawChunks.length - 1 ? tEnd : cursor + dur;
    result.push({ text: c, tStart: round(cStart), tEnd: round(cEnd) });
    cursor = cEnd;
  }
  return result;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
```

Build worker:

```bash
cd /Users/dmitry/Downloads/spirits_back/worker
npm run build 2>&1 | tail -3
```

Run tests:

```bash
cd /Users/dmitry/Downloads/spirits_back/tests
node runner.js --suite smm 2>&1 | grep -E "(chunker|RESULTS)"
```

Expected: 5 chunker tests passing.

- [ ] **Step 7.3: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add worker/src/tts/subtitle-chunker.ts \
        tests/smm/subtitle-chunker.unit.test.js \
        tests/smm/index.js
git -c commit.gpgsign=false commit -m "feat(smm-worker): subtitle chunker — text → timed 3-5 word chunks

Pure function chunkSubtitles(text, tStart, tEnd) → SubtitleChunk[].
Splits on sentence terminators first, then greedily on word boundaries
respecting MAX_WORDS_PER_CHUNK=5 and absorbing tails < MIN_WORDS=2.
Allocates duration proportionally to character length.

5 unit tests covering single phrase, multi-sentence, no-punctuation,
proportional distribution, empty input.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Remotion package — composition + types + Root

Remotion живёт во вложенном npm-пакете `worker/remotion/` с собственными зависимостями (Remotion + React). Это изолирует тяжёлые deps от main worker package.

**Files:**
- Create: `spirits_back/worker/remotion/package.json`
- Create: `spirits_back/worker/remotion/tsconfig.json`
- Create: `spirits_back/worker/remotion/remotion.config.ts`
- Create: `spirits_back/worker/remotion/src/Root.tsx`
- Create: `spirits_back/worker/remotion/src/types.ts`
- Create: `spirits_back/worker/remotion/src/compositions/ChatCase.tsx`

- [ ] **Step 8.1: `worker/remotion/package.json`**

```json
{
  "name": "linkeon-smm-remotion",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "preview": "remotion studio src/Root.tsx",
    "render": "remotion render src/Root.tsx ChatCase out.mp4"
  },
  "dependencies": {
    "@remotion/bundler": "4.0.220",
    "@remotion/cli": "4.0.220",
    "@remotion/renderer": "4.0.220",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "remotion": "4.0.220"
  },
  "devDependencies": {
    "@types/react": "18.3.0",
    "@types/react-dom": "18.3.0",
    "typescript": "5.4.5"
  }
}
```

- [ ] **Step 8.2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["DOM", "ES2022"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 8.3: remotion.config.ts**

```typescript
// worker/remotion/remotion.config.ts
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setConcurrency(1);
Config.setChromiumOpenGlRenderer('angle');
```

- [ ] **Step 8.4: types.ts — shape of props passed by the orchestrator**

```typescript
// worker/remotion/src/types.ts
export type Speaker = 'hero' | 'assistant';
export type AssistantRole = 'psy' | 'lawyer' | 'coach' | string;
export type Mood = 'dramatic' | 'inspiring' | 'calm' | 'uplifting' | 'tense' | 'neutral';

export interface DialogTurnProps {
  speaker: Speaker;
  text: string;
  tStart: number;
  tEnd: number;
  /** Public URL to the synthesized voice file (MP3 served from MinIO) */
  voiceUrl: string;
}

export interface BrollProps {
  atSec: number;
  durationSec: number;
  /** Either a still image URL or a video clip URL */
  mediaUrl: string;
  type: 'image' | 'video';
}

export interface SubtitleChunkProps {
  text: string;
  tStart: number;
  tEnd: number;
}

export interface CaseVideoProps {
  title: string;
  assistantRole: AssistantRole;
  mood: Mood;
  dialog: DialogTurnProps[];
  broll: BrollProps[];
  subtitles: SubtitleChunkProps[];
  /** Public URL of the background music MP3 */
  musicUrl: string | null;
  /** Total duration in seconds. Composition always 60s for MVP. */
  totalDurationSec: number;
}
```

- [ ] **Step 8.5: Root.tsx**

```typescript
// worker/remotion/src/Root.tsx
import { Composition, registerRoot } from 'remotion';
import { ChatCase, defaultProps } from './compositions/ChatCase';
import { CaseVideoProps } from './types';

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

const Root: React.FC = () => {
  return (
    <Composition
      id="ChatCase"
      component={ChatCase}
      durationInFrames={defaultProps.totalDurationSec * FPS}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={defaultProps}
      calculateMetadata={async ({ props }) => {
        const p = props as CaseVideoProps;
        return { durationInFrames: Math.round(p.totalDurationSec * FPS) };
      }}
    />
  );
};

registerRoot(Root);
```

- [ ] **Step 8.6: ChatCase composition skeleton (components added in next task)**

Создать `worker/remotion/src/compositions/ChatCase.tsx`:

```typescript
// worker/remotion/src/compositions/ChatCase.tsx
import { AbsoluteFill } from 'remotion';
import { CaseVideoProps } from '../types';

export const defaultProps: CaseVideoProps = {
  title: 'Sample',
  assistantRole: 'psy',
  mood: 'neutral',
  dialog: [],
  broll: [],
  subtitles: [],
  musicUrl: null,
  totalDurationSec: 60,
};

export const ChatCase: React.FC<CaseVideoProps> = (props) => {
  // Components ChatBubble / BRollImage / BRollVideo / Subtitle / CTA / BackgroundMusic
  // are added in Task 9. For now render a placeholder gradient so the composition
  // can be smoke-rendered end-to-end.
  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f3460 50%, #16213e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ color: 'white', fontSize: 60, fontWeight: 700 }}>
        {props.title}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 8.7: Install + smoke-render**

```bash
cd /Users/dmitry/Downloads/spirits_back/worker/remotion
npm install 2>&1 | tail -5

# Quick smoke: render the placeholder composition to MP4
npx remotion render src/Root.tsx ChatCase /tmp/smm-remotion-smoke.mp4 \
  --concurrency=1 2>&1 | tail -10

# Verify output exists and is a valid MP4
ls -la /tmp/smm-remotion-smoke.mp4
file /tmp/smm-remotion-smoke.mp4
```

Expected:
- File ~2-5 MB
- `file` reports it as "ISO Media, MP4 v2" or similar

**First-run note:** Remotion will download Chromium (~200MB) on first invocation. Allow 2-3 minutes for this on a fresh install.

- [ ] **Step 8.8: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add worker/remotion/package.json worker/remotion/package-lock.json \
        worker/remotion/tsconfig.json worker/remotion/remotion.config.ts \
        worker/remotion/src/Root.tsx worker/remotion/src/types.ts \
        worker/remotion/src/compositions/ChatCase.tsx
git -c commit.gpgsign=false commit -m "feat(smm-worker): Remotion package + ChatCase composition skeleton

Nested npm project at worker/remotion/ with own deps (Remotion 4.0.220 +
React 18 + TS). H.264 yuv420p output via Chromium ANGLE renderer.

Composition 'ChatCase' is 1080x1920 @ 30fps, default 60s duration.
Skeleton renders a gradient placeholder; ChatBubble/BRoll/Subtitle/CTA
components added in next task.

types.ts defines CaseVideoProps — the JSON shape the render orchestrator
will pass to remotion CLI via --props.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Remotion components — ChatBubble, BRollImage, BRollVideo, Subtitle, CTA, BackgroundMusic

**Files:**
- Create: `spirits_back/worker/remotion/src/components/ChatBubble.tsx`
- Create: `spirits_back/worker/remotion/src/components/BRollImage.tsx`
- Create: `spirits_back/worker/remotion/src/components/BRollVideo.tsx`
- Create: `spirits_back/worker/remotion/src/components/Subtitle.tsx`
- Create: `spirits_back/worker/remotion/src/components/CTA.tsx`
- Create: `spirits_back/worker/remotion/src/components/BackgroundMusic.tsx`
- Modify: `spirits_back/worker/remotion/src/compositions/ChatCase.tsx`

- [ ] **Step 9.1: ChatBubble.tsx**

```typescript
// worker/remotion/src/components/ChatBubble.tsx
import { Audio, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { DialogTurnProps } from '../types';

interface Props extends DialogTurnProps {}

export const ChatBubble: React.FC<Props> = (props) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const startFrame = Math.round(props.tStart * fps);
  const durFrames = Math.round((props.tEnd - props.tStart) * fps);
  const localFrame = frame - startFrame;

  const isHero = props.speaker === 'hero';

  // Fade-in 0.2s
  const opacity = interpolate(localFrame, [0, 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Slide-in 8px
  const offsetY = interpolate(localFrame, [0, 6], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <Sequence from={startFrame} durationInFrames={durFrames}>
      <Audio src={props.voiceUrl} volume={1.0} />
      <div
        style={{
          position: 'absolute',
          top: 200,
          left: isHero ? 80 : 'auto',
          right: isHero ? 'auto' : 80,
          maxWidth: 800,
          padding: '32px 40px',
          borderRadius: 36,
          background: isHero ? '#3b82f6' : '#ffffff',
          color: isHero ? '#ffffff' : '#0f172a',
          fontSize: 44,
          fontWeight: 500,
          lineHeight: 1.3,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          opacity,
          transform: `translateY(${offsetY}px)`,
          fontFamily: 'sans-serif',
        }}
      >
        {props.text}
      </div>
    </Sequence>
  );
};
```

- [ ] **Step 9.2: BRollImage.tsx**

```typescript
// worker/remotion/src/components/BRollImage.tsx
import { AbsoluteFill, Img, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrollProps } from '../types';

export const BRollImage: React.FC<BrollProps> = (props) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const startFrame = Math.round(props.atSec * fps);
  const durFrames = Math.round(props.durationSec * fps);
  const localFrame = frame - startFrame;

  const fadeIn = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(localFrame, [durFrames - 8, durFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = Math.min(fadeIn, fadeOut);

  // Ken-burns zoom 1.0 → 1.08
  const scale = interpolate(localFrame, [0, durFrames], [1.0, 1.08], { extrapolateRight: 'clamp' });

  return (
    <Sequence from={startFrame} durationInFrames={durFrames}>
      <AbsoluteFill style={{ overflow: 'hidden', opacity }}>
        <Img
          src={props.mediaUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }}
        />
      </AbsoluteFill>
    </Sequence>
  );
};
```

- [ ] **Step 9.3: BRollVideo.tsx**

```typescript
// worker/remotion/src/components/BRollVideo.tsx
import { AbsoluteFill, OffthreadVideo, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrollProps } from '../types';

export const BRollVideo: React.FC<BrollProps> = (props) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const startFrame = Math.round(props.atSec * fps);
  const durFrames = Math.round(props.durationSec * fps);
  const localFrame = frame - startFrame;

  const fadeIn = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(localFrame, [durFrames - 8, durFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <Sequence from={startFrame} durationInFrames={durFrames}>
      <AbsoluteFill style={{ overflow: 'hidden', opacity }}>
        <OffthreadVideo
          src={props.mediaUrl}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
    </Sequence>
  );
};
```

- [ ] **Step 9.4: Subtitle.tsx**

```typescript
// worker/remotion/src/components/Subtitle.tsx
import { Sequence, useVideoConfig } from 'remotion';
import { SubtitleChunkProps } from '../types';

export const Subtitle: React.FC<SubtitleChunkProps> = (props) => {
  const { fps } = useVideoConfig();
  const startFrame = Math.round(props.tStart * fps);
  const durFrames = Math.max(1, Math.round((props.tEnd - props.tStart) * fps));

  return (
    <Sequence from={startFrame} durationInFrames={durFrames}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 280,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: 'rgba(0,0,0,0.85)',
            color: '#ffffff',
            padding: '20px 36px',
            borderRadius: 20,
            fontSize: 56,
            fontWeight: 700,
            maxWidth: 900,
            textAlign: 'center',
            lineHeight: 1.2,
            fontFamily: 'sans-serif',
            textShadow: '0 2px 6px rgba(0,0,0,0.6)',
          }}
        >
          {props.text}
        </div>
      </div>
    </Sequence>
  );
};
```

- [ ] **Step 9.5: CTA.tsx**

```typescript
// worker/remotion/src/components/CTA.tsx
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';

interface Props {
  atSec: number;
  durationSec: number;
}

export const CTA: React.FC<Props> = ({ atSec, durationSec }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const startFrame = Math.round(atSec * fps);
  const durFrames = Math.round(durationSec * fps);
  const localFrame = frame - startFrame;

  const scale = interpolate(localFrame, [0, 10], [0.8, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = interpolate(localFrame, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <Sequence from={startFrame} durationInFrames={durFrames}>
      <AbsoluteFill
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 40,
          opacity,
        }}
      >
        <div style={{ transform: `scale(${scale})` }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#fbbf24',
              fontFamily: 'sans-serif',
              textAlign: 'center',
            }}
          >
            ИИ-психолог
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: '#ffffff',
              marginTop: 24,
              textAlign: 'center',
            }}
          >
            всегда на связи
          </div>
          <div
            style={{
              marginTop: 60,
              padding: '24px 48px',
              background: '#fbbf24',
              color: '#0f172a',
              fontSize: 52,
              fontWeight: 800,
              borderRadius: 16,
              fontFamily: 'sans-serif',
            }}
          >
            my.linkeon.io
          </div>
        </div>
      </AbsoluteFill>
    </Sequence>
  );
};
```

- [ ] **Step 9.6: BackgroundMusic.tsx**

```typescript
// worker/remotion/src/components/BackgroundMusic.tsx
import { Audio } from 'remotion';

interface Props {
  src: string;
  volume?: number;
}

export const BackgroundMusic: React.FC<Props> = ({ src, volume = 0.15 }) => {
  return <Audio src={src} volume={volume} loop />;
};
```

- [ ] **Step 9.7: Wire components into ChatCase**

Replace `worker/remotion/src/compositions/ChatCase.tsx`:

```typescript
// worker/remotion/src/compositions/ChatCase.tsx
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { CaseVideoProps } from '../types';
import { ChatBubble } from '../components/ChatBubble';
import { BRollImage } from '../components/BRollImage';
import { BRollVideo } from '../components/BRollVideo';
import { Subtitle } from '../components/Subtitle';
import { CTA } from '../components/CTA';
import { BackgroundMusic } from '../components/BackgroundMusic';

export const defaultProps: CaseVideoProps = {
  title: 'Sample',
  assistantRole: 'psy',
  mood: 'neutral',
  dialog: [],
  broll: [],
  subtitles: [],
  musicUrl: null,
  totalDurationSec: 60,
};

export const ChatCase: React.FC<CaseVideoProps> = (props) => {
  // CTA always covers the last 5 seconds
  const ctaAt = Math.max(0, props.totalDurationSec - 5);

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #0f3460 50%, #16213e 100%)' }}>
      {/* Layer 1: B-roll (background) */}
      {props.broll.map((b, i) =>
        b.type === 'image' ? (
          <BRollImage key={`b-${i}`} {...b} />
        ) : (
          <BRollVideo key={`b-${i}`} {...b} />
        ),
      )}

      {/* Layer 2: Chat dialog bubbles */}
      {props.dialog.map((d, i) => (
        <ChatBubble key={`d-${i}`} {...d} />
      ))}

      {/* Layer 3: Subtitles */}
      {props.subtitles.map((s, i) => (
        <Subtitle key={`s-${i}`} {...s} />
      ))}

      {/* Layer 4: CTA overlay last 5s */}
      <CTA atSec={ctaAt} durationSec={5} />

      {/* Layer 5: Background music */}
      {props.musicUrl ? <BackgroundMusic src={props.musicUrl} volume={0.15} /> : null}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 9.8: Smoke-render with fixture props**

Создать `worker/remotion/scripts/smoke-render.ts`:

```typescript
#!/usr/bin/env ts-node
// worker/remotion/scripts/smoke-render.ts
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import * as path from 'path';
import { CaseVideoProps } from '../src/types';

async function main() {
  const out = process.argv[2] || '/tmp/smm-smoke-render.mp4';

  const props: CaseVideoProps = {
    title: 'Кейс: тревога перед сном',
    assistantRole: 'psy',
    mood: 'calm',
    dialog: [
      {
        speaker: 'hero',
        text: 'Не могу уснуть, мысли крутятся.',
        tStart: 3,
        tEnd: 8,
        voiceUrl: 'https://my.linkeon.io/smm-media/linkeon-smm-music/calm.mp3',
      },
      {
        speaker: 'assistant',
        text: 'Давай попробуем технику 4-7-8 — дыхание поможет успокоиться.',
        tStart: 9,
        tEnd: 20,
        voiceUrl: 'https://my.linkeon.io/smm-media/linkeon-smm-music/calm.mp3',
      },
    ],
    broll: [
      {
        atSec: 0,
        durationSec: 3,
        mediaUrl: 'https://images.unsplash.com/photo-1455642305367-68834a9c8db0?w=1080',
        type: 'image',
      },
    ],
    subtitles: [
      { text: 'Не могу уснуть', tStart: 3, tEnd: 5.5 },
      { text: 'мысли крутятся', tStart: 5.5, tEnd: 8 },
      { text: 'Техника 4-7-8', tStart: 9, tEnd: 14 },
      { text: 'дыхание успокоит', tStart: 14, tEnd: 20 },
    ],
    musicUrl: 'https://my.linkeon.io/smm-media/linkeon-smm-music/calm.mp3',
    totalDurationSec: 30,
  };

  console.log('Bundling...');
  const bundled = await bundle({ entryPoint: path.join(__dirname, '..', 'src', 'Root.tsx') });
  console.log('Selecting composition...');
  const composition = await selectComposition({ serveUrl: bundled, id: 'ChatCase', inputProps: props });
  console.log(`Rendering ${composition.durationInFrames} frames @ ${composition.fps}fps...`);
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: out,
    inputProps: props,
    onProgress: ({ progress }) => {
      if (Math.round(progress * 100) % 10 === 0) {
        process.stdout.write(`  ${Math.round(progress * 100)}%\r`);
      }
    },
  });
  console.log(`\nDone: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Add to `worker/remotion/package.json` scripts:

```json
"smoke-render": "ts-node scripts/smoke-render.ts"
```

Install ts-node in this nested package:

```bash
cd /Users/dmitry/Downloads/spirits_back/worker/remotion
npm install ts-node --save-dev
```

Smoke render:

```bash
npx ts-node scripts/smoke-render.ts /tmp/smm-smoke-component-render.mp4
ls -la /tmp/smm-smoke-component-render.mp4
file /tmp/smm-smoke-component-render.mp4
# Optional: open in QuickTime to visually inspect components
open /tmp/smm-smoke-component-render.mp4 2>/dev/null || true
```

Expected: MP4 ~5-10 MB, 30s duration, visible chat bubbles + B-roll + subtitles + CTA at end. Audio will play the `calm.mp3` music — voice URLs in the fixture point to the same file as a placeholder, so don't expect real dialog audio yet.

- [ ] **Step 9.9: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add worker/remotion/src/components/ \
        worker/remotion/src/compositions/ChatCase.tsx \
        worker/remotion/scripts/smoke-render.ts \
        worker/remotion/package.json \
        worker/remotion/package-lock.json
git -c commit.gpgsign=false commit -m "feat(smm-worker): Remotion components — ChatBubble, BRoll, Subtitle, CTA, Music

Six components wired into ChatCase composition:
- ChatBubble: hero (right-aligned, blue) / assistant (left-aligned, white),
  fade-in + slide-up entrance, plays voiceUrl audio in sequence.
- BRollImage: full-frame image with ken-burns zoom + fade in/out.
- BRollVideo: OffthreadVideo for stock-video clips, muted, full-frame.
- Subtitle: bottom-center white-on-black plate, large bold.
- CTA: last 5s overlay with brand + my.linkeon.io URL.
- BackgroundMusic: looped Audio at volume 0.15.

Smoke-render script bundles + renders a fixture 30s MP4 — manual
visual check that all layers compose correctly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Render orchestrator — pipeline.ts with idempotent checkpoints

**Files:**
- Create: `spirits_back/worker/src/render/render-state.ts`
- Create: `spirits_back/worker/src/render/temp-dir.ts`
- Create: `spirits_back/worker/src/render/pipeline.ts`

- [ ] **Step 10.1: render-state.ts — checkpoint type + helpers**

```typescript
// worker/src/render/render-state.ts
import { apiClient } from '../api-client';

export interface RenderState {
  scenarioLoaded?: boolean;
  voicesSynthesized?: string[];        // public URLs in MinIO
  imagesGenerated?: string[];           // public URLs
  stockVideosDownloaded?: string[];     // public URLs
  remotionRendered?: boolean;
  postprocessed?: boolean;
  uploadedToMinio?: string;             // final MP4 public URL
}

export async function persist(videoId: string, state: RenderState): Promise<void> {
  await apiClient.updateRenderState(videoId, state);
}
```

- [ ] **Step 10.2: temp-dir.ts — manages /tmp/job-{id}/**

```typescript
// worker/src/render/temp-dir.ts
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export class TempDir {
  constructor(readonly root: string) {}

  static async create(jobId: string): Promise<TempDir> {
    const root = path.join(os.tmpdir(), `smm-job-${jobId}`);
    await fs.mkdir(root, { recursive: true });
    return new TempDir(root);
  }

  file(name: string): string {
    return path.join(this.root, name);
  }

  async cleanup(): Promise<void> {
    await fs.rm(this.root, { recursive: true, force: true });
  }
}
```

- [ ] **Step 10.3: pipeline.ts — full render orchestrator**

```typescript
// worker/src/render/pipeline.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { apiClient, SmmRenderContext } from '../api-client';
import { logger } from '../logger';
import { synthesize, writeSynthResultToFile } from '../tts';
import { chunkSubtitles } from '../tts/subtitle-chunker';
import { generateImage, writeImageToFile } from '../media/image-gen';
import { searchStockVideo, downloadStockVideo } from '../media/stock-video';
import { pickTrackByMood, Mood } from '../music/library';
import { uploadAudioToMinio, uploadImageToMinio, uploadVideoToMinio, uploadFinalMp4 } from '../storage/minio';
import { postprocessMp4 } from '../postprocess/ffmpeg';
import { RenderState, persist } from './render-state';
import { TempDir } from './temp-dir';

export interface PipelineInput {
  videoId: string;
}

export interface PipelineResult {
  status: 'ready' | 'failed';
  mp4Url?: string;
  durationSec?: number;
  sizeBytes?: number;
  errorMessage?: string;
}

export async function runRenderPipeline(input: PipelineInput): Promise<PipelineResult> {
  const t0 = Date.now();
  let tmp: TempDir | null = null;
  try {
    // STEP 0: Load context
    const ctx = await apiClient.getRenderContext(input.videoId);
    const state: RenderState = { ...(ctx.video.renderState as RenderState), scenarioLoaded: true };
    await persist(input.videoId, state);
    tmp = await TempDir.create(input.videoId);

    // STEP 1: Synthesize voices for each dialog turn
    if (!state.voicesSynthesized || state.voicesSynthesized.length !== ctx.scenario.dialog.length) {
      const urls: string[] = [];
      for (let i = 0; i < ctx.scenario.dialog.length; i++) {
        const turn = ctx.scenario.dialog[i];
        const res = await synthesize({
          tier: ctx.scenario.ttsTier,
          speaker: turn.speaker,
          role: ctx.scenario.assistantRole,
          text: turn.text,
        });
        const localPath = await writeSynthResultToFile(res, tmp.root, `voice-${i}`);
        const url = await uploadAudioToMinio(localPath, `videos/${input.videoId}/voice-${i}`);
        urls.push(url);
        logger.info({ videoId: input.videoId, i, url }, 'voice synthesized');
      }
      state.voicesSynthesized = urls;
      await persist(input.videoId, state);
    } else {
      logger.info({ videoId: input.videoId }, 'voices already synthesized — skipping');
    }

    // STEP 2: B-roll — images via Nano Banana, videos via Pexels
    const aiImageUrls: string[] = state.imagesGenerated ?? [];
    const stockVideoUrls: string[] = state.stockVideosDownloaded ?? [];
    const aiImagePrompts = ctx.scenario.brollPrompts.filter((b) => b.type === 'ai_image');
    const stockPrompts = ctx.scenario.brollPrompts.filter((b) => b.type === 'stock_video');

    if (aiImageUrls.length !== aiImagePrompts.length) {
      const fresh: string[] = [];
      for (let i = 0; i < aiImagePrompts.length; i++) {
        const bytes = await generateImage({ prompt: aiImagePrompts[i].prompt, aspectRatio: '9:16' });
        const localPath = await writeImageToFile(bytes, tmp.root, `img-${i}`);
        const url = await uploadImageToMinio(localPath, `videos/${input.videoId}/img-${i}`);
        fresh.push(url);
      }
      state.imagesGenerated = fresh;
      await persist(input.videoId, state);
    }

    if (stockVideoUrls.length !== stockPrompts.length) {
      const fresh: string[] = [];
      for (let i = 0; i < stockPrompts.length; i++) {
        const match = await searchStockVideo({ query: stockPrompts[i].prompt });
        if (!match) {
          logger.warn({ prompt: stockPrompts[i].prompt }, 'no stock-video match, skipping');
          fresh.push('');
          continue;
        }
        const localPath = await downloadStockVideo(match.downloadUrl, tmp.root, `stock-${i}`);
        const url = await uploadVideoToMinio(localPath, `videos/${input.videoId}/stock-${i}`);
        fresh.push(url);
      }
      state.stockVideosDownloaded = fresh;
      await persist(input.videoId, state);
    }

    // STEP 3: Music
    const track = ctx.scenario.musicTrackId
      ? null  // explicit track id reserved for future; for MVP we always pick by mood
      : await pickTrackByMood(ctx.scenario.mood as Mood, 60);
    const musicUrl = track ? track.publicUrl : null;

    // STEP 4: Build Remotion props
    const dialog = ctx.scenario.dialog.map((t, i) => ({
      speaker: t.speaker,
      text: t.text,
      tStart: t.tStart,
      tEnd: t.tEnd,
      voiceUrl: state.voicesSynthesized![i],
    }));

    const broll = ctx.scenario.brollPrompts.map((b, i) => {
      const isAi = b.type === 'ai_image';
      const mediaUrl = isAi
        ? state.imagesGenerated![aiImagePrompts.findIndex((x) => x === b)]
        : state.stockVideosDownloaded![stockPrompts.findIndex((x) => x === b)];
      return {
        atSec: b.atSec,
        durationSec: 3,
        mediaUrl: mediaUrl || '',
        type: (isAi ? 'image' : 'video') as 'image' | 'video',
      };
    }).filter((b) => b.mediaUrl);

    // Subtitles: chunk each dialog turn's text across its time slot
    const subtitles = dialog.flatMap((d) => chunkSubtitles(d.text, d.tStart, d.tEnd));

    const totalDurationSec = 60;
    const remotionProps = {
      title: ctx.scenario.title,
      assistantRole: ctx.scenario.assistantRole,
      mood: ctx.scenario.mood,
      dialog,
      broll,
      subtitles,
      musicUrl,
      totalDurationSec,
    };

    // STEP 5: Remotion render
    const rawMp4 = tmp.file('render-raw.mp4');
    if (!state.remotionRendered) {
      logger.info({ videoId: input.videoId }, 'remotion render start');
      const remotionRoot = path.join(__dirname, '..', '..', 'remotion', 'src', 'Root.tsx');
      const bundled = await bundle({ entryPoint: remotionRoot });
      const composition = await selectComposition({ serveUrl: bundled, id: 'ChatCase', inputProps: remotionProps });
      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: rawMp4,
        inputProps: remotionProps,
      });
      state.remotionRendered = true;
      await persist(input.videoId, state);
    }

    // STEP 6: ffmpeg post-process (platform-friendly encode)
    const finalMp4 = tmp.file('final.mp4');
    if (!state.postprocessed) {
      await postprocessMp4(rawMp4, finalMp4);
      state.postprocessed = true;
      await persist(input.videoId, state);
    }

    // STEP 7: Upload to MinIO
    let mp4Url = state.uploadedToMinio;
    if (!mp4Url) {
      mp4Url = await uploadFinalMp4(finalMp4, `videos/${input.videoId}/final.mp4`);
      state.uploadedToMinio = mp4Url;
      await persist(input.videoId, state);
    }
    const stat = await fs.stat(finalMp4);

    const elapsedSec = Math.round((Date.now() - t0) / 1000);
    logger.info({ videoId: input.videoId, mp4Url, elapsedSec, sizeBytes: stat.size }, 'render pipeline complete');

    return {
      status: 'ready',
      mp4Url,
      durationSec: totalDurationSec,
      sizeBytes: stat.size,
    };
  } catch (err: any) {
    logger.error({ videoId: input.videoId, err: err.message }, 'render pipeline failed');
    return { status: 'failed', errorMessage: err.message };
  } finally {
    // Only cleanup on success (per spec §9.3 — keep /tmp/job-* for 7 days on failure)
    // Cron job in worker (Step 10.4) handles aged failed dirs.
  }
}
```

- [ ] **Step 10.4: Aging cleanup cron (separate file, plug into entry point in Task 13)**

```typescript
// worker/src/render/cleanup-cron.ts
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { logger } from '../logger';

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export async function cleanupOldTempDirs(): Promise<void> {
  const tmpRoot = os.tmpdir();
  const entries = await fs.readdir(tmpRoot);
  const now = Date.now();
  for (const name of entries) {
    if (!name.startsWith('smm-job-')) continue;
    const full = path.join(tmpRoot, name);
    try {
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs > SEVEN_DAYS_MS) {
        await fs.rm(full, { recursive: true, force: true });
        logger.info({ path: full }, 'cleaned up aged job dir');
      }
    } catch { /* ignore */ }
  }
}

export function startCleanupCron(): NodeJS.Timeout {
  // Run once at startup, then every 12 hours
  cleanupOldTempDirs().catch((e) => logger.warn({ err: e.message }, 'cleanup error'));
  return setInterval(() => {
    cleanupOldTempDirs().catch((e) => logger.warn({ err: e.message }, 'cleanup error'));
  }, 12 * 3600 * 1000);
}
```

- [ ] **Step 10.5: Build verification (skip smoke for now — needs Task 11 + 12 + 13)**

```bash
cd /Users/dmitry/Downloads/spirits_back/worker
npm run build 2>&1 | tail -10
```

Expected: clean build. (Will report missing imports for `storage/minio` and `postprocess/ffmpeg` — those are Task 11 and 12. **DO NOT commit until they exist.** Mark Task 10 commit as "needs Task 11 + 12 to build" — but write the code now to keep the design coherent.)

If you want a clean intermediate commit: temporarily comment out the `uploadAudioToMinio`, `uploadImageToMinio`, `uploadVideoToMinio`, `uploadFinalMp4`, and `postprocessMp4` imports + their call sites, throw `not yet implemented` from them, commit, then revert in Task 13. Otherwise: combine commits of Tasks 10+11+12 in one.

**Recommended:** stash this commit until Tasks 11 and 12 are done. The subagent should remember to write all three before running build/commit.

---

## Task 11: MinIO upload wrappers + ffmpeg post-process

Two small files that the pipeline (Task 10) imports. Doing both in one task because each is small and they're independent.

**Files:**
- Create: `spirits_back/worker/src/storage/minio.ts`
- Create: `spirits_back/worker/src/postprocess/ffmpeg.ts`

- [ ] **Step 11.1: storage/minio.ts**

```typescript
// worker/src/storage/minio.ts
import * as fs from 'fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { config } from '../config';
import { logger } from '../logger';

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (_s3) return _s3;
  _s3 = new S3Client({
    endpoint: config.minio.endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: config.minio.accessKey, secretAccessKey: config.minio.secretKey },
    forcePathStyle: true,
  });
  return _s3;
}

function publicUrl(bucket: string, key: string): string {
  const base = config.minio.publicUrl.replace(/\/$/, '');
  return `${base}/${bucket}/${key}`;
}

async function uploadFile(localPath: string, bucket: string, key: string, contentType: string): Promise<string> {
  const body = await fs.readFile(localPath);
  await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  const url = publicUrl(bucket, key);
  logger.debug({ url, bytes: body.length }, 'minio upload ok');
  return url;
}

async function uploadFileStreaming(localPath: string, bucket: string, key: string, contentType: string): Promise<string> {
  const fileStream = (await import('fs')).createReadStream(localPath);
  const upload = new Upload({
    client: s3(),
    params: { Bucket: bucket, Key: key, Body: fileStream, ContentType: contentType },
  });
  await upload.done();
  return publicUrl(bucket, key);
}

export async function uploadAudioToMinio(localPath: string, keyPrefix: string): Promise<string> {
  const ext = localPath.endsWith('.mp3') ? 'mp3' : 'pcm';
  return uploadFile(localPath, config.minio.bucketVideos, `${keyPrefix}.${ext}`,
    ext === 'mp3' ? 'audio/mpeg' : 'audio/L16');
}

export async function uploadImageToMinio(localPath: string, keyPrefix: string): Promise<string> {
  return uploadFile(localPath, config.minio.bucketVideos, `${keyPrefix}.png`, 'image/png');
}

export async function uploadVideoToMinio(localPath: string, keyPrefix: string): Promise<string> {
  return uploadFileStreaming(localPath, config.minio.bucketVideos, `${keyPrefix}.mp4`, 'video/mp4');
}

export async function uploadFinalMp4(localPath: string, keyPrefix: string): Promise<string> {
  return uploadFileStreaming(localPath, config.minio.bucketVideos, `${keyPrefix}`, 'video/mp4');
}
```

- [ ] **Step 11.2: postprocess/ffmpeg.ts**

```typescript
// worker/src/postprocess/ffmpeg.ts
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { logger } from '../logger';

const FFMPEG_BIN = (ffmpegStatic as unknown as string) || 'ffmpeg';

/**
 * Re-encode the raw Remotion output into a TikTok/Reels-friendly MP4:
 *   - H.264 baseline (max compatibility)
 *   - yuv420p pixel format
 *   - 1080x1920 (already that size, but enforce)
 *   - 30fps cap
 *   - AAC audio 128kbps stereo
 *   - +faststart for streaming playback
 */
export async function postprocessMp4(inputPath: string, outputPath: string): Promise<void> {
  const args = [
    '-y',                                 // overwrite
    '-i', inputPath,
    '-c:v', 'libx264',
    '-profile:v', 'main',                 // 'main' is good balance of compat and quality
    '-preset', 'medium',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=1080:1920,fps=30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-movflags', '+faststart',
    outputPath,
  ];

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`ffmpeg spawn error: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) {
        logger.info({ inputPath, outputPath }, 'ffmpeg postprocess ok');
        resolve();
      } else {
        reject(new Error(`ffmpeg exited code=${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}
```

- [ ] **Step 11.3: Build + smoke ffmpeg**

```bash
cd /Users/dmitry/Downloads/spirits_back/worker
npm run build 2>&1 | tail -3

# Smoke: postprocess the Task 9 smoke render
node -e "
const {postprocessMp4} = require('./dist/postprocess/ffmpeg');
postprocessMp4('/tmp/smm-smoke-component-render.mp4', '/tmp/smm-smoke-post.mp4')
  .then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1); });
"
ls -la /tmp/smm-smoke-post.mp4
ffprobe /tmp/smm-smoke-post.mp4 2>&1 | tail -15
```

Expected: ffprobe shows H.264 main profile, yuv420p, 30fps, 1080x1920, AAC audio.

- [ ] **Step 11.4: Commit (Tasks 10 + 11 together)**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add worker/src/render/ worker/src/storage/ worker/src/postprocess/
git -c commit.gpgsign=false commit -m "feat(smm-worker): render pipeline + MinIO upload + ffmpeg postprocess

worker/src/render/:
- pipeline.ts: 7-step orchestrator (load → tts → b-roll → music → remotion
  → ffmpeg → upload) with checkpoint persistence via render_state JSONB
  after each step for idempotent retry.
- render-state.ts: type + persist() helper.
- temp-dir.ts: /tmp/smm-job-{id}/ lifecycle.
- cleanup-cron.ts: removes job dirs older than 7 days (every 12h).

worker/src/storage/minio.ts: uploadAudio/Image/Video/FinalMp4 helpers.
worker/src/postprocess/ffmpeg.ts: H.264 main profile + yuv420p + 1080x1920
  + AAC 128k + faststart for TikTok/Reels compatibility, via
  ffmpeg-static binary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: BullMQ consumer + worker entry

**Files:**
- Create: `spirits_back/worker/src/consumer.ts`
- Modify: `spirits_back/worker/src/index.ts`

- [ ] **Step 12.1: consumer.ts**

```typescript
// worker/src/consumer.ts
import { Worker, Job } from 'bullmq';
import { config } from './config';
import { logger } from './logger';
import { apiClient } from './api-client';
import { runRenderPipeline } from './render/pipeline';

export interface RenderJobPayload {
  videoId: string;
  scenarioId: string;
}

function redisConn() {
  const u = new URL(config.redisUrl);
  return {
    host: u.hostname,
    port: parseInt(u.port || '6379', 10),
    password: u.password || undefined,
    db: u.pathname && u.pathname !== '/' ? parseInt(u.pathname.slice(1), 10) : 0,
  };
}

export function startRenderWorker(): Worker<RenderJobPayload> {
  const worker = new Worker<RenderJobPayload>(
    'smm-render',
    async (job: Job<RenderJobPayload>) => {
      logger.info({ jobId: job.id, videoId: job.data.videoId }, 'render job picked up');
      const result = await runRenderPipeline({ videoId: job.data.videoId });
      await apiClient.sendCallback({
        videoId: job.data.videoId,
        status: result.status,
        mp4Url: result.mp4Url,
        durationSec: result.durationSec,
        sizeBytes: result.sizeBytes,
        errorMessage: result.errorMessage,
      });
      return result;
    },
    {
      connection: redisConn(),
      concurrency: 2,                // 2 parallel renders (Chromium-bound)
      lockDuration: 10 * 60 * 1000,  // 10 min — Remotion can be slow
    },
  );

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'render job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'render job failed');
  });
  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'render worker error');
  });

  return worker;
}
```

- [ ] **Step 12.2: Wire into index.ts**

Replace `worker/src/index.ts`:

```typescript
// worker/src/index.ts
import { config } from './config';
import { logger } from './logger';
import { startRenderWorker } from './consumer';
import { startCleanupCron } from './render/cleanup-cron';

async function main(): Promise<void> {
  logger.info({ apiUrl: config.apiUrl, redisUrl: config.redisUrl }, 'linkeon-smm-worker starting');
  const worker = startRenderWorker();
  const cleanupTimer = startCleanupCron();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutdown signal received');
    clearInterval(cleanupTimer);
    try {
      await worker.close();
    } catch (e: any) {
      logger.warn({ err: e.message }, 'worker close error');
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('linkeon-smm-worker ready, consuming smm-render queue');
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'fatal worker startup error');
  process.exit(1);
});
```

- [ ] **Step 12.3: Smoke — worker picks up a job from the queue**

```bash
# Start worker locally
cd /Users/dmitry/Downloads/spirits_back/worker
npm run build 2>&1 | tail -3
node dist/index.js &
WORKER_PID=$!
sleep 3
echo "Worker PID: $WORKER_PID"

# Enqueue a fake job manually via Redis CLI (or bullmq direct)
node -e "
const {Queue} = require('bullmq');
const u = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const q = new Queue('smm-render', { connection: {
  host: u.hostname, port: +u.port || 6379, password: u.password || undefined,
}});
q.add('test', { videoId: '00000000-0000-0000-0000-000000000000', scenarioId: '00000000-0000-0000-0000-000000000000' })
  .then(j => { console.log('enqueued', j.id); return q.close(); });
"

# Watch worker log
sleep 5

# The job will FAIL (video doesn't exist in DB → 404 from API).
# That's OK — we're checking the worker actually pulls jobs from the queue.

kill $WORKER_PID 2>/dev/null || true
```

Expected: in worker stdout, you should see `render job picked up` followed by `render pipeline failed` (because the fake videoId doesn't exist). Worker is wired up correctly.

- [ ] **Step 12.4: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add worker/src/consumer.ts worker/src/index.ts
git -c commit.gpgsign=false commit -m "feat(smm-worker): BullMQ consumer for smm-render queue

consumer.ts: BullMQ Worker with concurrency=2, lockDuration=10min,
listens on smm-render queue, delegates to runRenderPipeline(), posts
terminal callback to API (sendCallback).

index.ts wires the worker + cleanup cron + graceful SIGTERM/SIGINT.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: End-to-end render test

Тестируем полный pipeline: создаём ручной сценарий в БД, enqueue, ждём callback, проверяем что MP4 живёт в MinIO.

**Files:**
- Create: `spirits_back/tests/smm/render-e2e.integration.test.js`
- Modify: `spirits_back/tests/smm/index.js`

- [ ] **Step 13.1: e2e test**

```javascript
// tests/smm/render-e2e.integration.test.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');
const axios = require('axios');
const config = require('../config');

const BASE_URL = process.env.SMM_API_BASE || config.BASE_URL;
const ADMIN_JWT = process.env.SMM_ADMIN_JWT || '';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const http = axios.create({
  baseURL: BASE_URL,
  httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
  timeout: 30000,
  validateStatus: () => true,
});

const TEST_USER = '70000099999';

async function setupFixture() {
  await pool.query(
    `INSERT INTO ai_profiles_consolidated (user_id, isadmin, tokens, updated_at)
     VALUES ($1, true, 1000000, now())
     ON CONFLICT (user_id) DO UPDATE SET tokens = 1000000`, [TEST_USER]);

  const c = await pool.query(
    `INSERT INTO smm_campaign (user_id, source_mode, requested_count, status)
     VALUES ($1, 'topic', 1, 'approved') RETURNING id`, [TEST_USER]);

  // Minimal but valid scenario with one short dialog turn + one B-roll
  const dialog = [
    { speaker: 'hero',      text: 'Не могу уснуть.',           tStart: 3,  tEnd: 7 },
    { speaker: 'assistant', text: 'Попробуй технику 4-7-8.', tStart: 8, tEnd: 18 },
  ];
  const broll = [{ atSec: 0, type: 'ai_image', prompt: 'Спокойная спальня ночью' }];

  const s = await pool.query(
    `INSERT INTO smm_scenario
       (campaign_id, title, assistant_role, dialog, mood, broll_prompts, tts_tier, status)
     VALUES ($1, 'E2E test', 'psy', $2::jsonb, 'calm', $3::jsonb, 'economy', 'approved')
     RETURNING id`,
    [c.rows[0].id, JSON.stringify(dialog), JSON.stringify(broll)]);

  // Create video row and charge tokens
  const v = await pool.query(
    `INSERT INTO smm_video (scenario_id, status, tokens_charged)
     VALUES ($1, 'queued', 15000) RETURNING id`, [s.rows[0].id]);
  await pool.query(
    `INSERT INTO smm_billing_ledger (user_id, video_id, amount, op, reason)
     VALUES ($1, $2, 15000, 'charge', 'queued')`, [TEST_USER, v.rows[0].id]);

  return { campaignId: c.rows[0].id, videoId: v.rows[0].id };
}

async function waitForReadyOrFail(videoId, maxSec = 240) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxSec) {
    const r = await pool.query(
      `SELECT status, mp4_url, error_message FROM smm_video WHERE id = $1`, [videoId]);
    const row = r.rows[0];
    if (row.status === 'ready' || row.status === 'failed') return row;
    await new Promise((res) => setTimeout(res, 3000));
  }
  return { status: 'timeout' };
}

async function cleanup(campaignId) {
  await pool.query(`DELETE FROM smm_billing_ledger WHERE user_id = $1`, [TEST_USER]);
  await pool.query(`DELETE FROM smm_campaign WHERE id = $1`, [campaignId]);
}

module.exports = {
  'render-e2e: enqueue → worker renders → MP4 in MinIO → callback updates DB': async () => {
    if (process.env.SKIP_RENDER_E2E === '1') { console.log('  (skip: SKIP_RENDER_E2E=1)'); return; }
    const { campaignId, videoId } = await setupFixture();
    try {
      // Enqueue via BullMQ directly (not through approval flow, which is Plan 3)
      const { Queue } = require('bullmq');
      const u = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
      const q = new Queue('smm-render', { connection: {
        host: u.hostname, port: +u.port || 6379, password: u.password || undefined,
      }});
      const job = await q.add('e2e', { videoId, scenarioId: videoId });
      await q.close();
      console.log(`    enqueued job ${job.id} for video ${videoId}`);

      const result = await waitForReadyOrFail(videoId, 240);
      if (result.status === 'timeout') throw new Error('Render timed out after 240s');
      if (result.status !== 'ready') {
        throw new Error(`Expected ready, got ${result.status}: ${result.error_message}`);
      }
      if (!result.mp4_url || !result.mp4_url.includes('/smm-media/')) {
        throw new Error(`Bad mp4_url: ${result.mp4_url}`);
      }
      // Verify MP4 is downloadable
      const r = await http.head(result.mp4_url);
      if (r.status !== 200) throw new Error(`MP4 HEAD ${r.status}`);
    } finally {
      await cleanup(campaignId);
    }
  },
};
```

Add to `tests/smm/index.js`:

```javascript
  ...require('./render-e2e.integration.test'),
```

- [ ] **Step 13.2: Local E2E run**

Critical pre-requisites:
1. NestJS API running on `http://localhost:3001` with all SMM endpoints
2. Worker running locally (`node dist/index.js` from worker dir)
3. Redis tunnel up (`ssh -fN -L 6379:127.0.0.1:6379 dvolkov@212.113.106.202`)
4. MinIO tunnel up
5. All TTS/PEXELS/GOOGLE_AI keys populated in both `.env` files

```bash
# Terminal 1: API
cd /Users/dmitry/Downloads/spirits_back
lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; sleep 1
curl -sf -m 2 http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1 || \
  ssh -fN -L 9000:127.0.0.1:9000 dvolkov@212.113.106.202
node -e "const R=require('ioredis');const r=new R({host:'127.0.0.1',port:6379,lazyConnect:true,maxRetriesPerRequest:1});r.connect().then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>&1 || \
  ssh -fN -L 6379:127.0.0.1:6379 dvolkov@212.113.106.202
PORT=3001 npm run start:dev > /tmp/smm-api.log 2>&1 &
sleep 12

# Terminal 2: Worker
cd /Users/dmitry/Downloads/spirits_back/worker
npm run build 2>&1 | tail -3
node dist/index.js > /tmp/smm-worker.log 2>&1 &
WORKER_PID=$!
sleep 3
echo "API and worker started"

# Terminal 3: Tests
cd /Users/dmitry/Downloads/spirits_back/tests
SMM_API_BASE=http://localhost:3001 \
SMM_ADMIN_JWT='<fresh admin jwt>' \
SMM_WORKER_SECRET=$(grep '^SMM_WORKER_SECRET=' ../.env | cut -d= -f2-) \
node runner.js --suite smm 2>&1 | tail -20

# Cleanup
kill $WORKER_PID 2>/dev/null || true
lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
```

Expected: e2e test passes (~2-3 minutes wall time).

If first run fails because Chromium isn't downloaded yet, give it 5 minutes on first try.

- [ ] **Step 13.3: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add tests/smm/render-e2e.integration.test.js tests/smm/index.js
git -c commit.gpgsign=false commit -m "test(smm): end-to-end render integration test

Inserts a manual scenario+video, enqueues to smm-render via BullMQ
directly (bypassing the approval flow which Plan 3 adds), polls
smm_video.status for up to 240s. Verifies mp4_url is a valid
/smm-media/... URL and returns 200 on HEAD.

Gated by env SKIP_RENDER_E2E=1 to keep cheap CI runs fast.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Server deploy — install worker as a PM2 process

**Files:** none (deployment task only)

- [ ] **Step 14.1: Rsync worker code to server**

From local laptop:

```bash
# Same exclusions as the API deploy in Plan 1
rsync -az --timeout=30 \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' \
  --exclude='.env' --exclude='remotion/node_modules/' \
  ~/Downloads/spirits_back/ dvolkov@212.113.106.202:/home/dvolkov/spirits_back/ 2>&1 | tail -3
```

- [ ] **Step 14.2: Install worker deps on server**

```bash
ssh dvolkov@212.113.106.202 'set -e
cd ~/spirits_back/worker
npm install 2>&1 | tail -5
cd remotion && npm install 2>&1 | tail -5
cd ..
npm run build 2>&1 | tail -3
ls dist/index.js
'
```

Expected: clean build with `dist/index.js`. First install downloads Chromium (~200MB).

- [ ] **Step 14.3: Create worker .env on server**

```bash
ssh dvolkov@212.113.106.202 'set -e
cd ~/spirits_back/worker
cp .env.example .env

# Copy values from API .env (already populated from Plan 1 + Plan 2 Tasks 4-6)
for key in REDIS_URL SMM_WORKER_SECRET MINIO_ENDPOINT MINIO_ACCESS_KEY MINIO_SECRET_KEY \
           MINIO_BUCKET_VIDEOS MINIO_BUCKET_MUSIC MINIO_PUBLIC_URL GOOGLE_AI_API_KEY \
           YANDEX_TTS_API_KEY YANDEX_TTS_FOLDER_ID ELEVENLABS_API_KEY \
           ELEVENLABS_VOICE_HERO_M ELEVENLABS_VOICE_HERO_F ELEVENLABS_VOICE_PSY \
           ELEVENLABS_VOICE_LAWYER ELEVENLABS_VOICE_COACH PEXELS_API_KEY; do
  val=$(grep "^${key}=" ../.env | head -1 | cut -d= -f2-)
  if [ -n "$val" ]; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" .env && rm .env.bak
  fi
done

# On server, API URL is localhost
sed -i.bak "s|^SMM_API_URL=.*|SMM_API_URL=http://127.0.0.1:3001|" .env && rm .env.bak

echo "Worker .env populated. Keys present:"
grep -cE "^(REDIS_URL|SMM_|MINIO_|YANDEX_|ELEVENLABS_|PEXELS_|GOOGLE_AI_)" .env
'
```

Expected: count >= 18.

- [ ] **Step 14.4: Start worker via PM2**

```bash
ssh dvolkov@212.113.106.202 'cd ~/spirits_back/worker && pm2 start ecosystem.config.js && sleep 5 && pm2 status linkeon-smm-worker'
```

Expected: status `online`, uptime growing, no restart cycling.

```bash
ssh dvolkov@212.113.106.202 'pm2 logs linkeon-smm-worker --lines 20 --nostream' 2>&1 | tail -25
```

Expected: `linkeon-smm-worker starting`, `linkeon-smm-worker ready, consuming smm-render queue`. No errors.

- [ ] **Step 14.5: Save PM2 config + smoke**

```bash
ssh dvolkov@212.113.106.202 'pm2 save && pm2 status'
```

Both `linkeon-api` and `linkeon-smm-worker` should be `online`.

- [ ] **Step 14.6: PROD smoke render**

Create a minimal scenario via psql + enqueue and watch for the MP4:

```bash
ssh dvolkov@212.113.106.202 '
PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -At <<SQL
INSERT INTO ai_profiles_consolidated (user_id, isadmin, tokens, updated_at)
  VALUES (\$\$70000099999\$\$, true, 1000000, now())
  ON CONFLICT (user_id) DO UPDATE SET tokens = 1000000;
WITH c AS (
  INSERT INTO smm_campaign (user_id, source_mode, requested_count, status)
  VALUES (\$\$70000099999\$\$, \$\$topic\$\$, 1, \$\$approved\$\$) RETURNING id
), s AS (
  INSERT INTO smm_scenario (campaign_id, title, assistant_role, dialog, mood, broll_prompts, tts_tier, status)
  SELECT id, \$\$Smoke prod\$\$, \$\$psy\$\$,
    \$\$[{\"speaker\":\"hero\",\"text\":\"Тревога\",\"tStart\":3,\"tEnd\":7},{\"speaker\":\"assistant\",\"text\":\"Дыши глубоко\",\"tStart\":8,\"tEnd\":18}]\$\$::jsonb,
    \$\$calm\$\$,
    \$\$[]\$\$::jsonb,
    \$\$economy\$\$, \$\$approved\$\$
  FROM c RETURNING id
), v AS (
  INSERT INTO smm_video (scenario_id, status, tokens_charged)
  SELECT id, \$\$queued\$\$, 15000 FROM s RETURNING id
)
SELECT id FROM v;
SQL
' | tail -1
```

Save the returned video UUID, then enqueue:

```bash
VIDEO_ID=<from above>
ssh dvolkov@212.113.106.202 "cd ~/spirits_back && node -e \"
const {Queue} = require('bullmq');
const q = new Queue('smm-render', { connection: { host: '127.0.0.1', port: 6379 }});
q.add('smoke', { videoId: '$VIDEO_ID', scenarioId: '00000000-0000-0000-0000-000000000000' })
  .then(j => { console.log('enqueued', j.id); return q.close(); });
\""

# Poll status
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24; do
  S=$(ssh dvolkov@212.113.106.202 "PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -At -c \"SELECT status, mp4_url, error_message FROM smm_video WHERE id='$VIDEO_ID'\"")
  echo "$(date +%H:%M:%S) $S"
  if echo "$S" | grep -qE '^ready\|'; then break; fi
  if echo "$S" | grep -qE '^failed\|'; then break; fi
  sleep 10
done

# Cleanup
ssh dvolkov@212.113.106.202 "PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -c \"DELETE FROM smm_campaign WHERE user_id='70000099999'\""
```

Expected: status flips to `ready` within ~3 minutes, mp4_url points to MinIO public URL. Open it in a browser to visually verify.

- [ ] **Step 14.7: Commit deploy notes**

No code changes here — just an informational tag:

```bash
cd /Users/dmitry/Downloads/spirits_back
git tag -a smm-plan-2-deployed -m "Plan 2 (Render Pipeline) deployed to PROD" 2>/dev/null || true
git log --oneline -10
echo "Plan 2 (Render Pipeline) complete: $(git rev-parse HEAD)"
```

---

## Task 15: Final integration check

- [ ] **Step 15.1: Full test suite — local**

```bash
cd /Users/dmitry/Downloads/spirits_back
# Make sure all tunnels up
curl -sf -m 2 http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1 || \
  ssh -fN -L 9000:127.0.0.1:9000 dvolkov@212.113.106.202
node -e "require('ioredis');const r=new(require('ioredis'))({host:'127.0.0.1',port:6379,lazyConnect:true,maxRetriesPerRequest:1});r.connect().then(()=>r.ping().then(()=>process.exit(0))).catch(()=>process.exit(1))" 2>&1 || \
  ssh -fN -L 6379:127.0.0.1:6379 dvolkov@212.113.106.202

lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; sleep 1
PORT=3001 npm run start:dev > /tmp/smm-api.log 2>&1 &
APP_PID=$!
sleep 12

cd worker
node dist/index.js > /tmp/smm-worker.log 2>&1 &
WORKER_PID=$!
sleep 3

cd ../tests
SKIP_RENDER_E2E=0 \
SMM_API_BASE=http://localhost:3001 \
SMM_ADMIN_JWT='<fresh>' \
SMM_NON_ADMIN_JWT='<fresh>' \
SMM_WORKER_SECRET=$(grep '^SMM_WORKER_SECRET=' ../.env | cut -d= -f2-) \
node runner.js --suite smm 2>&1 | tail -20

kill $APP_PID $WORKER_PID 2>/dev/null || true
```

Expected: **40 tests passing** (26 from Plan 1 + 14 new from Plan 2: 5 chunker + 4 render-callback + 3 scenario-fetch + 1 e2e + 1 misc).

- [ ] **Step 15.2: Cleanup orphaned files (optional)**

If any `/tmp/smm-*` test artifacts accumulated:

```bash
rm -rf /tmp/smm-tts-smoke-* /tmp/smm-img-smoke-* /tmp/smm-stock-smoke-* /tmp/smm-remotion-smoke-* 2>/dev/null
```

- [ ] **Step 15.3: Document open items for Plan 3**

Plan 2 covers worker + render pipeline + manual scenarios. Plan 3 adds:
- AI scenario generation (Claude/GPT)
- Trends via Perplexity API
- AI-producer chat agent with tool-calls
- New CustomMarkdown blocks `{{smm_scenario}}`, `{{smm_video}}`, `{{smm_schedule_picker}}` in `spirits_front`
- Approval workflow (scenario → render → final approval → publish)

The render-pipeline side is now fully unblocked.

---

## Self-Review Checklist

**1. Spec coverage** — все шаги pipeline из spec §3.1 покрыты:
- TTS → Task 4 ✓
- Image gen → Task 5 ✓
- Stock video → Task 5 ✓
- Music → Task 6 ✓
- Remotion props → Task 10 (pipeline.ts builds props) ✓
- Remotion render → Task 8 + 9 + 10 ✓
- ffmpeg postprocess → Task 11 ✓
- Upload to MinIO → Task 11 ✓
- API callback → Task 2 + 10 + 12 ✓
- Cleanup → Task 10 (cleanup-cron.ts) ✓
- Idempotency via render_state → Task 10 (each step checks state before doing work) ✓

**2. Placeholder scan** — нет TBD/TODO/abstract handlers. Все шаги имеют верифицируемые команды и ожидаемый output.

**3. Type consistency** —
- `RenderJobPayload = { videoId, scenarioId }` — Task 12 совпадает с Plan 1's `RenderJobPayload`
- `SmmRenderContext` — Task 3 matches API return shape from Task 2
- `RenderState` keys — Task 10 keys (`scenarioLoaded`, `voicesSynthesized`, ...) совпадают с `smm_video.render_state` JSONB shape из Plan 1 spec
- `CaseVideoProps` — Task 8 types match what pipeline.ts builds in Task 10
- `SynthRequest` / `SynthResult` — Task 4 consistent across yandex.ts, elevenlabs.ts, index.ts

**4. Notable mitigations from Plan 1 lessons:**
- Worker is a separate package with own `dist/` — `dist/main.js` layout issue from Plan 1 won't recur because worker doesn't add files outside `src/`
- All worker .env values mirror from API .env via shell loop — no manual copy errors
- Port conflicts: tests + smoke explicitly kill anything on :3001 before starting dev server
- JWT_SECRET handling: tests use worker-secret instead of JWT for internal endpoints, so no JWT issuer mismatch
- Server has no `.git` — rsync deploy used (matching Plan 1's deploy.sh pattern)


