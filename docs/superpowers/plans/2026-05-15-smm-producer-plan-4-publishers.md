# SMM Producer — Plan 4: Publishers + Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать публикацию готовых SMM-роликов в 5 соцсетей (Telegram, VK, YouTube Shorts, TikTok, Instagram Reels) с расписанием. AI-продюсер получает 4 новых tool-call'а (`connect_social`, `schedule_publication`, `cancel_publication`, `list_publications`); фронт-эндпоинты для управления соц-аккаунтами и OAuth-флоу; worker подхватывает `smm-publish` очередь и публикует.

**Architecture:** Publisher-адаптеры живут на стороне worker'а (`worker/src/publish/`) с единым интерфейсом `{ publish, delete }`. Они вызываются после того как worker фетчит publication-context (`publication + video + decrypted credentials`) через internal NestJS endpoint. Каждый publisher — тонкая обёртка над платформенным API. OAuth handled NestJS-стороной: state-tokens для CSRF, token exchange, encrypt в `smm_social_account.credentials` (AES-256-GCM из Plan 1). BullMQ `smm-publish` поддерживает delay (для scheduled_at) и retry. TikTok + Instagram задеплоены в код, но реальная публикация требует одобрения Meta/TikTok-app (sandbox-режим до этого).

**Tech Stack:** NestJS 10, BullMQ 5 (delayed jobs), `axios`, `@aws-sdk/client-s3` (для download MP4 при upload в YT), `googleapis` (YouTube Data API SDK), `form-data` (multipart). На worker-side только thin axios-вызовы.

**End-state demo:**
- Юзер пишет в чат "Опубликуй последний ролик в Telegram сейчас" — продюсер вызывает `schedule_publication(videoId, ['telegram'], null)` → задача в `smm-publish` без delay → worker публикует в TG-канал → возвращает URL поста → AI пишет "Опубликовано: https://t.me/..."
- Юзер пишет "Опубликуй в VK завтра в 18:00" — продюсер парсит datetime, создает publication с `scheduled_at`, BullMQ delayed job ждёт → в 18:00 worker публикует
- Юзер пишет "Отмени публикацию в YouTube" — продюсер вызывает `cancel_publication`, статус → cancelled
- В frontend кнопка "Подключить TikTok" редиректит на TikTok OAuth → callback сохраняет токен → `connect_social(platform='tiktok')` tool возвращает информацию об аккаунте

---

## File Structure

**Создаются:**

```
spirits_back/
├── src/smm/
│   ├── migrations/
│   │   └── 006_smm_oauth_state.sql              # CSRF state tokens table
│   ├── publication/
│   │   ├── publication.service.ts               # schedule/cancel/list orchestrator
│   │   ├── publication-context.controller.ts    # internal GET for worker (decrypted creds)
│   │   ├── publication-callback.controller.ts   # internal POST from worker
│   │   └── time-parser.ts                       # "завтра в 18" → Date
│   ├── oauth/
│   │   ├── oauth.controller.ts                  # public start/callback for 4 platforms
│   │   ├── oauth-state.service.ts               # one-time CSRF state tokens (Redis)
│   │   ├── vk-oauth.service.ts                  # VK token exchange
│   │   ├── youtube-oauth.service.ts             # Google OAuth + refresh
│   │   ├── tiktok-oauth.service.ts              # TikTok token exchange
│   │   └── meta-oauth.service.ts                # Facebook/Instagram token exchange
│   └── social-accounts/
│       └── social-account.controller.ts         # CRUD REST for frontend
├── worker/
│   └── src/
│       └── publish/
│           ├── publisher.interface.ts           # Publisher contract
│           ├── publishers/
│           │   ├── telegram.publisher.ts        # Bot API sendVideo
│           │   ├── vk.publisher.ts              # 2-step video.save + wall.post
│           │   ├── youtube.publisher.ts         # YouTube Data API v3 resumable
│           │   ├── tiktok.publisher.ts          # Content Posting API v2
│           │   └── instagram.publisher.ts       # Graph API Reels Publishing
│           ├── pipeline.ts                      # orchestrator (fetch ctx → dispatch → callback)
│           ├── api-client.ts                    # extends Plan 2 client with publish methods
│           └── consumer.ts                      # MODIFY worker/src/consumer.ts to also handle smm-publish
└── tests/smm/
    ├── publication.integration.test.js
    ├── oauth-state.integration.test.js
    └── telegram-publisher.integration.test.js   # mocked Bot API
```

**Модифицируются:**

```
spirits_back/
├── src/smm/smm.module.ts                        # register new services + controllers
├── src/smm/producer/smm-producer-tools.ts       # +4 tools schemas
├── src/smm/producer/smm-producer-tools.service.ts  # +4 tool dispatchers
├── src/smm/producer/smm-producer.prompt.ts      # update workflow section for publishing
├── tests/smm/index.js                           # add new test files
└── worker/src/index.ts                          # also start publish-worker
```

**Новые env-vars в `.env`:**

```bash
# OAuth app credentials (NOT user tokens — those are stored encrypted in DB)
VK_OAUTH_CLIENT_ID=...                          # VK Standalone application id
VK_OAUTH_CLIENT_SECRET=...
YOUTUBE_OAUTH_CLIENT_ID=...                     # Google Cloud Console
YOUTUBE_OAUTH_CLIENT_SECRET=...
TIKTOK_OAUTH_CLIENT_KEY=...                     # TikTok for Developers
TIKTOK_OAUTH_CLIENT_SECRET=...
META_APP_ID=...                                 # Facebook Developer App
META_APP_SECRET=...

# OAuth redirect base URL (matches what's registered in each platform's app config)
OAUTH_REDIRECT_BASE=https://my.linkeon.io       # callbacks: /webhook/smm/oauth/:platform/callback
```

---

## Task 1: Migration + OAuth state table + scheduled_at index

**Files:**
- Create: `src/smm/migrations/006_smm_oauth_state.sql`

The OAuth flow needs short-lived CSRF state tokens. We store them in a tiny table (could be Redis but DB is fine — TTL via periodic cleanup or a `created_at < now() - interval '10 min'` filter).

- [ ] **Step 1.1: Inspect existing migrations**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
ls src/smm/migrations/
```

Expected: 001-005 already applied. Add 006.

- [ ] **Step 1.2: Write migration**

Create `src/smm/migrations/006_smm_oauth_state.sql`:

```sql
-- 006_smm_oauth_state.sql
-- One-shot CSRF state tokens for OAuth flow.
-- A row is inserted at /oauth/:platform/start, deleted at /oauth/:platform/callback.
-- Rows older than 10 minutes are cleaned up by a periodic cron.

CREATE TABLE IF NOT EXISTS smm_oauth_state (
  state         text PRIMARY KEY,         -- crypto-random hex string, also used in URL
  user_id       text NOT NULL,            -- phone of the admin who initiated
  platform      text NOT NULL
                CHECK (platform IN ('vk', 'youtube', 'tiktok', 'instagram')),
  redirect_url  text,                     -- optional: where to redirect after success
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smm_oauth_state_created
  ON smm_oauth_state (created_at)
  WHERE created_at < now() - interval '10 minutes';

-- For the schedule_publication "show me what's queued" query
CREATE INDEX IF NOT EXISTS idx_smm_publication_user_scheduled
  ON smm_publication (status, scheduled_at);
```

- [ ] **Step 1.3: Apply**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
DATABASE_URL="postgresql://linkeon:linkeon_pass_2026@127.0.0.1:5433/linkeon" npm run migrate
```

Expected:
```
✓ applied smm/006_smm_oauth_state.sql
Applied 1 migration(s)
```

Verify:

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -c "\d smm_oauth_state"
```

Expected: table exists with 5 columns and the platform CHECK.

- [ ] **Step 1.4: Commit**

```bash
git add src/smm/migrations/006_smm_oauth_state.sql
git -c commit.gpgsign=false commit -m "feat(smm): smm_oauth_state table + scheduled_at index

smm_oauth_state holds one-shot CSRF state tokens generated at
/oauth/:platform/start and consumed at /oauth/:platform/callback.
Auto-cleanup via partial index + periodic cron prune.

idx_smm_publication_user_scheduled added to support the
list_publications tool's 'what's queued?' query.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PublicationService — schedule / cancel / list + time parser

**Files:**
- Create: `src/smm/publication/publication.service.ts`
- Create: `src/smm/publication/time-parser.ts`
- Modify: `src/smm/smm.module.ts`

PublicationService is the orchestrator: takes a videoId + platform list + optional scheduled_at, creates one `smm_publication` row per platform, enqueues each as a delayed BullMQ job, and stores the jobId back in the row. The cancel path removes the BullMQ job and marks publication status='cancelled'. List returns all publications for a user (joined through video → scenario → campaign).

The time parser is small but important: it converts "завтра в 18:00", "через час", "сейчас", or an ISO timestamp into a `Date`.

- [ ] **Step 2.1: time-parser.ts**

Create `src/smm/publication/time-parser.ts`:

```typescript
// src/smm/publication/time-parser.ts
/**
 * Parses a flexible human time string into a Date.
 * Supports:
 *   - ISO timestamps:           "2026-05-16T18:00:00+03:00"
 *   - "сейчас" / "now"          → returns null (treated as immediate publish)
 *   - "через час"               → now + 1h
 *   - "через 30 минут"
 *   - "завтра в 18" / "завтра в 18:00"
 *   - "сегодня в 22"
 *
 * Returns Date for future timestamps, null for "now"/empty.
 * Throws Error on unparseable input or past dates.
 */
export function parseScheduleTime(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === 'сейчас' || s === 'now' || s === '') return null;

  const now = new Date();

  // ISO
  if (/^\d{4}-\d{2}-\d{2}t/i.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new Error(`Invalid ISO date: ${input}`);
    if (d.getTime() < now.getTime() - 60_000) throw new Error(`Scheduled time is in the past: ${input}`);
    return d;
  }

  // "через X минут / часов"
  const inMatch = s.match(/через\s+(\d+)\s*(минут|мин|часов?|ч|дней?)/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    let ms = 0;
    if (unit.startsWith('мин')) ms = n * 60_000;
    else if (unit.startsWith('ч') || unit.startsWith('час')) ms = n * 3600_000;
    else if (unit.startsWith('д')) ms = n * 86400_000;
    return new Date(now.getTime() + ms);
  }

  // "завтра в HH" / "сегодня в HH:MM"
  const todayTomMatch = s.match(/(сегодня|завтра|послезавтра)\s+в\s+(\d{1,2})(?::(\d{2}))?/);
  if (todayTomMatch) {
    const day = todayTomMatch[1];
    const hour = parseInt(todayTomMatch[2], 10);
    const min = todayTomMatch[3] ? parseInt(todayTomMatch[3], 10) : 0;
    if (hour < 0 || hour > 23) throw new Error(`Bad hour: ${hour}`);
    const d = new Date(now);
    if (day === 'завтра') d.setDate(d.getDate() + 1);
    else if (day === 'послезавтра') d.setDate(d.getDate() + 2);
    d.setHours(hour, min, 0, 0);
    if (d.getTime() < now.getTime() - 60_000) throw new Error(`Scheduled time is in the past`);
    return d;
  }

  throw new Error(`Unparseable schedule time: "${input}". Use ISO timestamp or "завтра в 18".`);
}
```

- [ ] **Step 2.2: PublicationService**

Create `src/smm/publication/publication.service.ts`:

```typescript
// src/smm/publication/publication.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PgService } from '../../common/services/pg.service';
import { PublishQueueService, PublishJobPayload } from './publish-queue.service';
import {
  SmmPublication,
  SmmPlatform,
  rowToPublication,
} from '../entities/smm-publication.entity';

export type Platform = SmmPlatform;

export interface SchedulePublicationsInput {
  userId: string;
  videoId: string;
  platforms: Platform[];
  /** ISO string. null = publish immediately. */
  scheduledAt: Date | null;
  caption?: string;
}

export interface ScheduleResult {
  scheduled: Array<{ publicationId: string; platform: Platform; jobId: string; scheduledAt: string | null }>;
  failed:    Array<{ platform: Platform; reason: 'no_account' | 'video_not_ready' | 'duplicate' | 'error'; detail?: string }>;
}

@Injectable()
export class PublicationService {
  private readonly logger = new Logger(PublicationService.name);

  constructor(
    private readonly pg: PgService,
    private readonly queue: PublishQueueService,
  ) {}

  async schedulePublications(input: SchedulePublicationsInput): Promise<ScheduleResult> {
    const result: ScheduleResult = { scheduled: [], failed: [] };

    // 1. Verify video belongs to user + status = approved (or ready)
    const vRes = await this.pg.query(
      `SELECT v.id, v.status, c.user_id
         FROM smm_video v
         JOIN smm_scenario s ON s.id = v.scenario_id
         JOIN smm_campaign c ON c.id = s.campaign_id
        WHERE v.id = $1`,
      [input.videoId],
    );
    if (vRes.rows.length === 0) throw new NotFoundException(`video ${input.videoId} not found`);
    const v = vRes.rows[0];
    if (v.user_id !== input.userId) throw new ForbiddenException(`video does not belong to user`);
    if (v.status !== 'approved' && v.status !== 'ready') {
      throw new BadRequestException(`video status is ${v.status}, must be approved or ready`);
    }

    for (const platform of input.platforms) {
      try {
        // 2. Verify user has a social account for this platform
        const acc = await this.pg.query(
          `SELECT id FROM smm_social_account
            WHERE platform = $1 AND status = 'active'
              AND (user_id = $2 OR user_id IS NULL)
            ORDER BY user_id NULLS LAST LIMIT 1`,
          [platform, input.userId],
        );
        if (acc.rows.length === 0) {
          result.failed.push({ platform, reason: 'no_account' });
          continue;
        }

        // 3. Check for existing publication on this (video, platform) — UNIQUE constraint
        const existing = await this.pg.query(
          `SELECT id, status FROM smm_publication
            WHERE video_id = $1 AND platform = $2`,
          [input.videoId, platform],
        );
        if (existing.rows.length > 0) {
          result.failed.push({
            platform, reason: 'duplicate',
            detail: `already ${existing.rows[0].status}`,
          });
          continue;
        }

        // 4. Insert publication row
        const initialStatus = input.scheduledAt ? 'scheduled' : 'scheduled'; // both 'scheduled'; worker flips to 'publishing'
        const pRes = await this.pg.query(
          `INSERT INTO smm_publication
              (video_id, platform, scheduled_at, status, caption)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [
            input.videoId, platform,
            input.scheduledAt ?? null,
            initialStatus,
            input.caption ?? null,
          ],
        );
        const publicationRow = pRes.rows[0];
        const publicationId = publicationRow.id;

        // 5. Enqueue BullMQ job with optional delay
        const delayMs = input.scheduledAt
          ? Math.max(0, input.scheduledAt.getTime() - Date.now())
          : 0;
        const payload: PublishJobPayload = { publicationId, videoId: input.videoId, platform };
        const jobId = await this.queue.enqueue(payload, delayMs > 0 ? { delay: delayMs } : undefined);

        await this.pg.query(
          `UPDATE smm_publication SET publish_job_id = $1 WHERE id = $2`,
          [jobId, publicationId],
        );

        result.scheduled.push({
          publicationId,
          platform,
          jobId,
          scheduledAt: input.scheduledAt ? input.scheduledAt.toISOString() : null,
        });
        this.logger.log(`Scheduled ${platform} pub ${publicationId} (job ${jobId}, delay ${delayMs}ms)`);
      } catch (err: any) {
        result.failed.push({ platform, reason: 'error', detail: err.message });
        this.logger.error(`Failed to schedule ${platform}: ${err.message}`);
      }
    }

    return result;
  }

  async cancel(publicationId: string): Promise<void> {
    const r = await this.pg.query(
      `SELECT publish_job_id, status FROM smm_publication WHERE id = $1`,
      [publicationId],
    );
    if (r.rows.length === 0) throw new NotFoundException(`publication ${publicationId}`);
    const row = r.rows[0];
    if (row.status === 'publishing') {
      throw new BadRequestException(`publication is already publishing — cannot cancel`);
    }
    if (row.status !== 'scheduled') {
      // already published/failed/cancelled — no-op
      return;
    }
    if (row.publish_job_id) {
      try { await this.queue.cancel(row.publish_job_id); } catch (e: any) {
        this.logger.warn(`failed to remove BullMQ job ${row.publish_job_id}: ${e.message}`);
      }
    }
    await this.pg.query(
      `UPDATE smm_publication SET status = 'cancelled' WHERE id = $1`,
      [publicationId],
    );
    this.logger.log(`Cancelled publication ${publicationId}`);
  }

  async listForUser(userId: string, filter?: { status?: string; videoId?: string }): Promise<SmmPublication[]> {
    const where = [`c.user_id = $1`];
    const args: any[] = [userId];
    if (filter?.status) {
      where.push(`p.status = $${args.length + 1}`);
      args.push(filter.status);
    }
    if (filter?.videoId) {
      where.push(`p.video_id = $${args.length + 1}`);
      args.push(filter.videoId);
    }
    const sql = `
      SELECT p.*
        FROM smm_publication p
        JOIN smm_video v ON v.id = p.video_id
        JOIN smm_scenario s ON s.id = v.scenario_id
        JOIN smm_campaign c ON c.id = s.campaign_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT 50`;
    const r = await this.pg.query(sql, args);
    return r.rows.map(rowToPublication);
  }

  async getById(publicationId: string): Promise<SmmPublication | null> {
    const r = await this.pg.query(`SELECT * FROM smm_publication WHERE id = $1`, [publicationId]);
    return r.rows[0] ? rowToPublication(r.rows[0]) : null;
  }
}
```

- [ ] **Step 2.3: Register in SmmModule**

Open `src/smm/smm.module.ts`. Add to imports + providers + exports:

```typescript
import { PublicationService } from './publication/publication.service';
// in providers: ..., PublicationService,
// in exports:   ..., PublicationService,
```

`PublishQueueService` is already registered (Plan 1 Task 10).

- [ ] **Step 2.4: Quick time-parser unit test**

Create `tests/smm/time-parser.unit.test.js`:

```javascript
const path = require('path');
const { parseScheduleTime } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'publication', 'time-parser'),
);

module.exports = {
  'time-parser: "сейчас" → null': () => {
    if (parseScheduleTime('сейчас') !== null) throw new Error('expected null');
    if (parseScheduleTime('now') !== null) throw new Error('expected null');
    if (parseScheduleTime('') !== null) throw new Error('expected null');
    if (parseScheduleTime(null) !== null) throw new Error('expected null');
  },

  'time-parser: "через час" → ~1h ahead': () => {
    const d = parseScheduleTime('через час');
    if (!d) throw new Error('expected Date');
    const delta = d.getTime() - Date.now();
    if (delta < 3590_000 || delta > 3610_000) throw new Error(`delta=${delta}ms`);
  },

  'time-parser: "через 30 минут"': () => {
    const d = parseScheduleTime('через 30 минут');
    if (!d) throw new Error('expected Date');
    const delta = d.getTime() - Date.now();
    if (delta < 1790_000 || delta > 1810_000) throw new Error(`delta=${delta}ms`);
  },

  'time-parser: "завтра в 18"': () => {
    const d = parseScheduleTime('завтра в 18');
    if (!d) throw new Error('expected Date');
    if (d.getHours() !== 18 || d.getMinutes() !== 0) {
      throw new Error(`expected 18:00, got ${d.getHours()}:${d.getMinutes()}`);
    }
    const now = new Date();
    const expectedDay = now.getDate() + 1;
    // Cross-month boundary handling: just verify it's >= tomorrow
    if (d.getTime() < Date.now()) throw new Error('expected future date');
  },

  'time-parser: ISO timestamp future': () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const d = parseScheduleTime(future);
    if (!d || Math.abs(d.getTime() - new Date(future).getTime()) > 100) {
      throw new Error('iso mismatch');
    }
  },

  'time-parser: ISO timestamp in the past throws': () => {
    let thrown = false;
    try {
      parseScheduleTime('2020-01-01T00:00:00Z');
    } catch (e) { thrown = true; }
    if (!thrown) throw new Error('expected throw on past date');
  },

  'time-parser: gibberish throws': () => {
    let thrown = false;
    try {
      parseScheduleTime('маленький зелёный енот');
    } catch (e) { thrown = true; }
    if (!thrown) throw new Error('expected throw on unparseable');
  },
};
```

Add to `tests/smm/index.js`:

```javascript
  ...require('./time-parser.unit.test'),
```

- [ ] **Step 2.5: Build + run tests**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
cd tests
node runner.js --suite smm 2>&1 | grep -E "(time-parser|RESULTS)" | tail -10
```

Expected: 7 new unit tests passing.

- [ ] **Step 2.6: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
git add src/smm/publication/publication.service.ts \
        src/smm/publication/time-parser.ts \
        src/smm/smm.module.ts \
        tests/smm/time-parser.unit.test.js \
        tests/smm/index.js
git -c commit.gpgsign=false commit -m "feat(smm): PublicationService — schedule/cancel/list + time-parser

PublicationService.schedulePublications({userId, videoId, platforms, scheduledAt}):
  - Verifies video ownership + status
  - Per platform: checks for existing social account, ensures no duplicate
    (video_id, platform), inserts smm_publication row, enqueues BullMQ
    job with optional delay = scheduledAt - now
  - Returns { scheduled[], failed[] }

cancel(publicationId): removes the BullMQ delayed job + sets status='cancelled'.
listForUser(userId, { status?, videoId? }): joined query video → scenario → campaign.

time-parser.ts parses 'сейчас', 'через час', 'завтра в 18', ISO timestamps.
Throws on past or unparseable.

7 unit tests cover all parser branches + edge cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Internal endpoints (publication-context, publication-callback)

Worker fetches publication context via `GET /webhook/smm/internal/publication-context/:publicationId` — returns `{publication, video, account: {platform, credentialsPlain}}` (decrypted on the API side). After publish, worker posts `POST /webhook/smm/internal/publication-callback` with the result.

Same pattern as Plan 2 Task 2 (render context + render callback).

**Files:**
- Create: `src/smm/publication/publication-context.controller.ts`
- Create: `src/smm/publication/publication-callback.controller.ts`
- Create: `src/smm/publication/publication-callback.dto.ts`
- Modify: `src/smm/smm.module.ts`

- [ ] **Step 3.1: DTO**

Create `src/smm/publication/publication-callback.dto.ts`:

```typescript
// src/smm/publication/publication-callback.dto.ts
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class PublicationCallbackDto {
  @IsUUID()
  publicationId!: string;

  @IsIn(['published', 'failed'])
  status!: 'published' | 'failed';

  @IsOptional() @IsString()
  externalUrl?: string;

  @IsOptional() @IsString()
  externalPostId?: string;

  @IsOptional() @IsString()
  errorMessage?: string;
}
```

- [ ] **Step 3.2: publication-context.controller.ts**

```typescript
// src/smm/publication/publication-context.controller.ts
import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { WorkerSecretGuard } from '../../common/guards/worker-secret.guard';
import { PgService } from '../../common/services/pg.service';
import { decryptCredentials } from '../social-accounts/credentials.crypto';
import { rowToPublication } from '../entities/smm-publication.entity';
import { rowToVideo } from '../entities/smm-video.entity';

@Controller('smm/internal')
@UseGuards(WorkerSecretGuard)
export class PublicationContextController {
  constructor(private readonly pg: PgService) {}

  /**
   * Returns everything the worker needs to publish:
   *   - publication row (with platform, caption, scheduled_at, ...)
   *   - video row (with mp4_url)
   *   - social account (decrypted credentials)
   */
  @Get('publication-context/:publicationId')
  async getContext(@Param('publicationId') publicationId: string): Promise<{
    publication: ReturnType<typeof rowToPublication>;
    video: ReturnType<typeof rowToVideo>;
    account: { id: string; platform: string; displayName: string; credentials: Record<string, unknown> };
  }> {
    const pRes = await this.pg.query(
      `SELECT * FROM smm_publication WHERE id = $1`, [publicationId],
    );
    if (pRes.rows.length === 0) throw new NotFoundException(`publication ${publicationId} not found`);
    const publication = rowToPublication(pRes.rows[0]);

    const vRes = await this.pg.query(
      `SELECT v.*, c.user_id
         FROM smm_video v
         JOIN smm_scenario s ON s.id = v.scenario_id
         JOIN smm_campaign c ON c.id = s.campaign_id
        WHERE v.id = $1`, [publication.videoId],
    );
    if (vRes.rows.length === 0) throw new NotFoundException(`video ${publication.videoId} not found`);
    const videoRow = vRes.rows[0];
    const video = rowToVideo(videoRow);
    const userId: string = videoRow.user_id;

    // Pick the active social account for this user + platform.
    // NULL user_id = global account (Phase 1A); takes lower priority than user-specific.
    const aRes = await this.pg.query(
      `SELECT id, platform, display_name, credentials
         FROM smm_social_account
        WHERE platform = $1 AND status = 'active'
          AND (user_id = $2 OR user_id IS NULL)
        ORDER BY user_id NULLS LAST LIMIT 1`,
      [publication.platform, userId],
    );
    if (aRes.rows.length === 0) {
      throw new NotFoundException(`no active ${publication.platform} account for user ${userId}`);
    }
    const accountRow = aRes.rows[0];
    const credentials = decryptCredentials(accountRow.credentials);

    return {
      publication,
      video,
      account: {
        id: accountRow.id,
        platform: accountRow.platform,
        displayName: accountRow.display_name,
        credentials,
      },
    };
  }
}
```

- [ ] **Step 3.3: publication-callback.controller.ts**

```typescript
// src/smm/publication/publication-callback.controller.ts
import {
  BadRequestException, Body, Controller, Logger, NotFoundException, Post,
  UseGuards, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { WorkerSecretGuard } from '../../common/guards/worker-secret.guard';
import { PgService } from '../../common/services/pg.service';
import { PublicationCallbackDto } from './publication-callback.dto';

@Controller('smm/internal')
@UseGuards(WorkerSecretGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PublicationCallbackController {
  private readonly logger = new Logger(PublicationCallbackController.name);

  constructor(private readonly pg: PgService) {}

  @Post('publication-callback')
  async handleCallback(@Body() dto: PublicationCallbackDto): Promise<{ ok: true }> {
    if (dto.status === 'published') {
      if (!dto.externalUrl) throw new BadRequestException(`externalUrl required when status=published`);
      const r = await this.pg.query(
        `UPDATE smm_publication
            SET status = 'published',
                external_url = $1,
                external_post_id = $2,
                published_at = now(),
                error_message = NULL
          WHERE id = $3 RETURNING id`,
        [dto.externalUrl, dto.externalPostId ?? null, dto.publicationId],
      );
      if (r.rowCount === 0) throw new NotFoundException(`publication ${dto.publicationId}`);
      this.logger.log(`Publication ${dto.publicationId} → ${dto.externalUrl}`);
    } else {
      const r = await this.pg.query(
        `UPDATE smm_publication
            SET status = 'failed',
                error_message = $1
          WHERE id = $2 RETURNING id`,
        [dto.errorMessage ?? 'unknown error', dto.publicationId],
      );
      if (r.rowCount === 0) throw new NotFoundException(`publication ${dto.publicationId}`);
      this.logger.warn(`Publication ${dto.publicationId} failed: ${dto.errorMessage}`);
    }
    return { ok: true };
  }
}
```

- [ ] **Step 3.4: Register in SmmModule**

In `src/smm/smm.module.ts`:

```typescript
import { PublicationContextController } from './publication/publication-context.controller';
import { PublicationCallbackController } from './publication/publication-callback.controller';
// In @Module controllers: [...]: ..., PublicationContextController, PublicationCallbackController,
```

- [ ] **Step 3.5: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
```

Expected: clean build.

- [ ] **Step 3.6: Commit**

```bash
git add src/smm/publication/publication-context.controller.ts \
        src/smm/publication/publication-callback.controller.ts \
        src/smm/publication/publication-callback.dto.ts \
        src/smm/smm.module.ts
git -c commit.gpgsign=false commit -m "feat(smm): internal worker endpoints for publication

GET /webhook/smm/internal/publication-context/:publicationId
  Returns { publication, video, account } with decrypted credentials.
  Same shape as render-context (Plan 2), but for the publish flow.

POST /webhook/smm/internal/publication-callback
  Body: { publicationId, status: 'published'|'failed', externalUrl?,
          externalPostId?, errorMessage? }
  Updates smm_publication row + sets published_at timestamp.

Both worker-secret guarded + localhost-only (like Plan 2 render endpoints).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Worker — publisher interface + base + consumer integration

**Files:**
- Create: `worker/src/publish/publisher.interface.ts`
- Create: `worker/src/publish/api-client.ts` (extend)
- Create: `worker/src/publish/pipeline.ts`
- Modify: `worker/src/api-client.ts` (add publication context + callback methods)
- Modify: `worker/src/consumer.ts` (start a SECOND BullMQ Worker for smm-publish)

- [ ] **Step 4.1: publisher.interface.ts**

```typescript
// worker/src/publish/publisher.interface.ts
export type Platform = 'telegram' | 'vk' | 'youtube' | 'tiktok' | 'instagram';

export interface PublishInput {
  platform: Platform;
  /** Decrypted credentials JSON (shape depends on platform). */
  credentials: Record<string, unknown>;
  /** Public MP4 URL (already in MinIO bucket). */
  videoUrl: string;
  /** Caption text, optional. May contain emojis + URL. */
  caption: string | null;
  /** Display name of the social account — for logging. */
  accountDisplayName: string;
}

export interface PublishResult {
  /** Public URL of the published post (https://t.me/c/.../123 or similar). */
  externalUrl: string;
  /** Platform-internal post id (used for later delete). */
  externalPostId: string;
}

export interface Publisher {
  publish(input: PublishInput): Promise<PublishResult>;
  /**
   * Best-effort delete of a previously-published post.
   * Optional — may throw "not supported" on some platforms.
   */
  delete?(input: { credentials: Record<string, unknown>; externalPostId: string }): Promise<void>;
}
```

- [ ] **Step 4.2: Extend `worker/src/api-client.ts`**

Open the existing `worker/src/api-client.ts`. Add new types + methods:

```typescript
// Add to the existing file (after existing types):

export interface SmmPublicationContext {
  publication: {
    id: string;
    videoId: string;
    platform: 'telegram' | 'vk' | 'youtube' | 'tiktok' | 'instagram';
    scheduledAt: string | null;
    status: string;
    caption: string | null;
  };
  video: {
    id: string;
    mp4Url: string | null;
    durationSec: number | null;
  };
  account: {
    id: string;
    platform: string;
    displayName: string;
    credentials: Record<string, unknown>;
  };
}

export interface PublicationCallbackInput {
  publicationId: string;
  status: 'published' | 'failed';
  externalUrl?: string;
  externalPostId?: string;
  errorMessage?: string;
}

// Add to the ApiClient class methods:

  async getPublicationContext(publicationId: string): Promise<SmmPublicationContext> {
    const r = await this.http.get(`/webhook/smm/internal/publication-context/${publicationId}`);
    if (r.status !== 200) throw new Error(`getPublicationContext ${publicationId}: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  }

  async sendPublicationCallback(input: PublicationCallbackInput): Promise<void> {
    const r = await this.http.post(`/webhook/smm/internal/publication-callback`, input);
    if (r.status >= 300) {
      throw new Error(`sendPublicationCallback ${input.publicationId}: ${r.status} ${JSON.stringify(r.data)}`);
    }
  }
```

- [ ] **Step 4.3: pipeline.ts (publish orchestrator)**

Create `worker/src/publish/pipeline.ts`:

```typescript
// worker/src/publish/pipeline.ts
import { apiClient } from '../api-client';
import { logger } from '../logger';
import { Platform, Publisher } from './publisher.interface';
import { telegramPublisher } from './publishers/telegram.publisher';
import { vkPublisher } from './publishers/vk.publisher';
import { youtubePublisher } from './publishers/youtube.publisher';
import { tiktokPublisher } from './publishers/tiktok.publisher';
import { instagramPublisher } from './publishers/instagram.publisher';

const PUBLISHERS: Record<Platform, Publisher> = {
  telegram: telegramPublisher,
  vk: vkPublisher,
  youtube: youtubePublisher,
  tiktok: tiktokPublisher,
  instagram: instagramPublisher,
};

export interface PipelineInput {
  publicationId: string;
}

export interface PipelineResult {
  status: 'published' | 'failed';
  externalUrl?: string;
  externalPostId?: string;
  errorMessage?: string;
}

export async function runPublishPipeline(input: PipelineInput): Promise<PipelineResult> {
  try {
    const ctx = await apiClient.getPublicationContext(input.publicationId);
    if (!ctx.video.mp4Url) {
      throw new Error(`video has no mp4_url (status not ready)`);
    }
    const publisher = PUBLISHERS[ctx.publication.platform];
    if (!publisher) throw new Error(`no publisher for platform ${ctx.publication.platform}`);

    logger.info(
      { publicationId: input.publicationId, platform: ctx.publication.platform,
        videoUrl: ctx.video.mp4Url, account: ctx.account.displayName },
      'publish pipeline start',
    );

    const result = await publisher.publish({
      platform: ctx.publication.platform,
      credentials: ctx.account.credentials,
      videoUrl: ctx.video.mp4Url,
      caption: ctx.publication.caption,
      accountDisplayName: ctx.account.displayName,
    });

    logger.info(
      { publicationId: input.publicationId, externalUrl: result.externalUrl },
      'publish pipeline ok',
    );
    return {
      status: 'published',
      externalUrl: result.externalUrl,
      externalPostId: result.externalPostId,
    };
  } catch (err: any) {
    logger.error(
      { publicationId: input.publicationId, err: err.message },
      'publish pipeline failed',
    );
    return { status: 'failed', errorMessage: err.message };
  }
}
```

- [ ] **Step 4.4: Modify `worker/src/consumer.ts`**

Open the existing `worker/src/consumer.ts`. Currently it has `startRenderWorker()`. Add a parallel `startPublishWorker()` and export both.

Find the existing class structure and add:

```typescript
// Add to existing imports:
import { runPublishPipeline } from './publish/pipeline';

// Add this export (mirroring startRenderWorker but for the publish queue):

export interface PublishJobPayload {
  publicationId: string;
  videoId: string;
  platform: 'telegram' | 'vk' | 'youtube' | 'tiktok' | 'instagram';
}

export function startPublishWorker(): Worker<PublishJobPayload> {
  const worker = new Worker<PublishJobPayload>(
    'smm-publish',
    async (job: Job<PublishJobPayload>) => {
      logger.info({ jobId: job.id, publicationId: job.data.publicationId, platform: job.data.platform }, 'publish job picked up');
      const result = await runPublishPipeline({ publicationId: job.data.publicationId });
      await apiClient.sendPublicationCallback({
        publicationId: job.data.publicationId,
        status: result.status,
        externalUrl: result.externalUrl,
        externalPostId: result.externalPostId,
        errorMessage: result.errorMessage,
      });
      return result;
    },
    {
      connection: redisConn(),
      concurrency: 3,                 // 3 parallel publishes (mostly I/O bound)
      lockDuration: 5 * 60 * 1000,    // 5 min — publish should be < 2 min
    },
  );

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'publish job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'publish job failed');
  });
  worker.on('error', (err) => {
    logger.error({ err: err.message }, 'publish worker error');
  });

  return worker;
}
```

Note: `redisConn()` and `apiClient` are already imported in consumer.ts. Adjust if the existing import block needs changes (e.g., if `redisConn` was a private function — promote it or duplicate the logic).

- [ ] **Step 4.5: Modify `worker/src/index.ts`**

The current `worker/src/index.ts` only starts the render worker. Add the publish worker too:

```typescript
// Find: import { startRenderWorker } from './consumer';
// Change to:
import { startRenderWorker, startPublishWorker } from './consumer';

// Inside main(), after:
//   const worker = startRenderWorker();
// add:
  const publishWorker = startPublishWorker();

// In the shutdown handler, close both:
//   try { await worker.close(); } catch (e: any) { ... }
// Change to:
  try { await worker.close(); } catch (e: any) { logger.warn({ err: e.message }, 'render worker close error'); }
  try { await publishWorker.close(); } catch (e: any) { logger.warn({ err: e.message }, 'publish worker close error'); }
```

- [ ] **Step 4.6: Build worker**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>/worker
npm run build 2>&1 | tail -5
```

Build will FAIL because `./publish/publishers/telegram.publisher` etc. don't exist yet. That's expected — Tasks 5-9 add them. For now, commit a stub:

Create temporary stub files for the 5 publishers so the build passes. We'll fill them out in Tasks 5-9:

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>/worker
mkdir -p src/publish/publishers
for p in telegram vk youtube tiktok instagram; do
  cat > src/publish/publishers/${p}.publisher.ts <<EOF
// worker/src/publish/publishers/${p}.publisher.ts
import { Publisher, PublishInput, PublishResult } from '../publisher.interface';

export const ${p}Publisher: Publisher = {
  async publish(_input: PublishInput): Promise<PublishResult> {
    throw new Error('${p} publisher not yet implemented (Plan 4 Task TBD)');
  },
};
EOF
done
```

Rebuild:

```bash
npm run build 2>&1 | tail -3
ls dist/publish/pipeline.js && echo "OK"
```

Expected: clean build.

- [ ] **Step 4.7: Commit (worker infra + stubs)**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
git add worker/src/api-client.ts \
        worker/src/publish/ \
        worker/src/consumer.ts \
        worker/src/index.ts
git -c commit.gpgsign=false commit -m "feat(smm-worker): publish pipeline + BullMQ consumer + publisher stubs

- worker/src/publish/publisher.interface.ts: Publisher contract
  with publish(input) → PublishResult and optional delete().
- worker/src/publish/pipeline.ts: orchestrator. Fetches publication
  context from API, dispatches to the right publisher by platform,
  returns { status, externalUrl?, externalPostId?, errorMessage? }.
- ApiClient extended with getPublicationContext + sendPublicationCallback.
- consumer.ts: new startPublishWorker() — BullMQ Worker on smm-publish
  queue, concurrency=3, lockDuration=5min. Mirrors startRenderWorker.
- index.ts: starts both workers + graceful shutdown of both.

Five publisher stubs in worker/src/publish/publishers/ all throw
'not yet implemented' — replaced by Tasks 5-9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Telegram publisher (no OAuth, bot_token)

Telegram is the simplest — no OAuth, admin enters bot_token + chat_id via REST. Telegram's `sendVideo` accepts a URL string, so we just point it at the MinIO mp4_url.

**Files:**
- Modify: `worker/src/publish/publishers/telegram.publisher.ts` (replace stub)

- [ ] **Step 5.1: Implement TG publisher**

```typescript
// worker/src/publish/publishers/telegram.publisher.ts
import axios from 'axios';
import { Publisher, PublishInput, PublishResult } from '../publisher.interface';
import { logger } from '../../logger';

interface TelegramCreds {
  botToken: string;
  chatId: string | number;   // channel id like @mychannel or numeric -100...
}

export const telegramPublisher: Publisher = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const creds = input.credentials as unknown as TelegramCreds;
    if (!creds.botToken || !creds.chatId) {
      throw new Error('telegram credentials missing botToken or chatId');
    }

    const url = `https://api.telegram.org/bot${creds.botToken}/sendVideo`;
    const params = new URLSearchParams();
    params.set('chat_id', String(creds.chatId));
    params.set('video', input.videoUrl);
    if (input.caption) params.set('caption', input.caption);
    params.set('supports_streaming', 'true');

    const r = await axios.post(url, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 60000,
      validateStatus: () => true,
    });
    if (r.status !== 200 || !r.data?.ok) {
      const desc = r.data?.description ?? JSON.stringify(r.data).slice(0, 200);
      throw new Error(`Telegram sendVideo failed: ${r.status} ${desc}`);
    }

    const msg = r.data.result;
    const messageId = msg.message_id as number;
    const chat = msg.chat ?? {};
    let externalUrl = '';
    if (chat.username) {
      externalUrl = `https://t.me/${chat.username}/${messageId}`;
    } else if (typeof chat.id === 'number' && chat.id < 0) {
      // For private channels (-100xxxxxxxxxx), construct t.me/c/xxxxxxxxxx/<msgid>
      const cleanedId = String(chat.id).replace(/^-100/, '');
      externalUrl = `https://t.me/c/${cleanedId}/${messageId}`;
    } else {
      externalUrl = `tg://msg?chat_id=${chat.id}&msg_id=${messageId}`;
    }
    logger.info({ chatId: chat.id, messageId, externalUrl }, 'telegram publish ok');

    return {
      externalUrl,
      externalPostId: String(messageId),
    };
  },

  async delete(input) {
    const creds = input.credentials as unknown as TelegramCreds;
    if (!creds.botToken || !creds.chatId) return;
    const url = `https://api.telegram.org/bot${creds.botToken}/deleteMessage`;
    await axios.post(url, new URLSearchParams({
      chat_id: String(creds.chatId),
      message_id: input.externalPostId,
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
      validateStatus: () => true,
    });
  },
};
```

- [ ] **Step 5.2: Build**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>/worker
npm run build 2>&1 | tail -3
```

Expected: clean build.

- [ ] **Step 5.3: Smoke (manual — needs a real bot + channel)**

This step requires admin to have:
1. Created a Telegram bot via @BotFather → has `bot_token`
2. Added the bot as administrator of a Telegram channel → has `chat_id` (e.g. `@my_channel` or `-1001234567890`)

If admin has both, smoke (still local — uses public mp4_url from earlier render tests):

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>/worker
node -e "
const { telegramPublisher } = require('./dist/publish/publishers/telegram.publisher');
telegramPublisher.publish({
  platform: 'telegram',
  credentials: {
    botToken: process.env.TG_BOT_TOKEN_TEST,
    chatId: process.env.TG_CHAT_ID_TEST,
  },
  videoUrl: 'https://my.linkeon.io/smm-media/linkeon-smm-videos/videos/<some-real-video>/final.mp4',
  caption: 'Тест SMM-продюсера Linkeon',
  accountDisplayName: 'test',
}).then(r => console.log('ok:', r)).catch(e => { console.error(e.message); process.exit(1); });
" 2>&1 | head -5
```

Replace `<some-real-video>` with an actual UUID from PROD (e.g. the one from Plan 3a final smoke). Set `TG_BOT_TOKEN_TEST` and `TG_CHAT_ID_TEST` in your shell.

If admin doesn't have a bot+channel ready, skip this smoke and rely on Task 11's end-to-end PROD test (where the admin DOES connect a bot via the social-account REST endpoints).

- [ ] **Step 5.4: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
git add worker/src/publish/publishers/telegram.publisher.ts
git -c commit.gpgsign=false commit -m "feat(smm-worker): Telegram publisher

POSTs to api.telegram.org/bot<TOKEN>/sendVideo with chat_id +
video URL (Telegram accepts public MP4 URLs directly, no upload
needed). Constructs the public post URL from chat.username or
chat.id for private channels.

delete(): also exposed for future use (via Bot API deleteMessage).

Credentials shape: { botToken, chatId }. Admin enters both manually
via the social-account REST endpoint (Task 9) since Telegram has
no OAuth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: VK publisher + OAuth flow

VK uses OAuth 2.0 Authorization Code grant (not Implicit). Flow:
1. Frontend opens `https://my.linkeon.io/webhook/smm/oauth/vk/start` (server-side redirect helper)
2. Server inserts an `smm_oauth_state` row, redirects to `https://oauth.vk.com/authorize?client_id=...&display=page&redirect_uri=...&scope=video,wall,offline&response_type=code&state=...&v=5.131`
3. User authorizes, VK redirects back to `https://my.linkeon.io/webhook/smm/oauth/vk/callback?code=...&state=...`
4. Server exchanges code+state for `access_token` via `https://oauth.vk.com/access_token?client_id=...&client_secret=...&redirect_uri=...&code=...`
5. Stores encrypted `{access_token, user_id, expires_in}` in `smm_social_account.credentials`

Publishing uses 2-step `video.save` → upload URL → `wall.post` with attachment.

**Files:**
- Create: `src/smm/oauth/oauth-state.service.ts`
- Create: `src/smm/oauth/vk-oauth.service.ts`
- Modify: `worker/src/publish/publishers/vk.publisher.ts` (replace stub)
- Modify: `src/smm/smm.module.ts`

- [ ] **Step 6.1: OAuthStateService**

Create `src/smm/oauth/oauth-state.service.ts`:

```typescript
// src/smm/oauth/oauth-state.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PgService } from '../../common/services/pg.service';

export type Platform = 'vk' | 'youtube' | 'tiktok' | 'instagram';

@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);

  constructor(private readonly pg: PgService) {}

  /** Generate and persist a fresh CSRF state token. Returns the state value to embed in the OAuth URL. */
  async create(userId: string, platform: Platform, redirectUrl?: string): Promise<string> {
    const state = crypto.randomBytes(24).toString('hex');
    await this.pg.query(
      `INSERT INTO smm_oauth_state (state, user_id, platform, redirect_url)
       VALUES ($1, $2, $3, $4)`,
      [state, userId, platform, redirectUrl ?? null],
    );
    return state;
  }

  /** Look up, validate, and delete a state token. Returns the original userId or throws. */
  async consume(state: string, platform: Platform): Promise<{ userId: string; redirectUrl: string | null }> {
    const r = await this.pg.query(
      `DELETE FROM smm_oauth_state
        WHERE state = $1 AND platform = $2 AND created_at > now() - interval '10 minutes'
       RETURNING user_id, redirect_url`,
      [state, platform],
    );
    if (r.rows.length === 0) throw new Error(`Invalid or expired OAuth state for ${platform}`);
    return { userId: r.rows[0].user_id, redirectUrl: r.rows[0].redirect_url };
  }

  /** Periodic cleanup of stale rows (called from a cron, not implemented here). */
  async pruneStale(): Promise<number> {
    const r = await this.pg.query(
      `DELETE FROM smm_oauth_state WHERE created_at < now() - interval '10 minutes'`,
    );
    return r.rowCount ?? 0;
  }
}
```

- [ ] **Step 6.2: VK OAuth service**

Create `src/smm/oauth/vk-oauth.service.ts`:

```typescript
// src/smm/oauth/vk-oauth.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const VK_API_VERSION = '5.199';

@Injectable()
export class VkOAuthService {
  private readonly logger = new Logger(VkOAuthService.name);

  buildAuthorizeUrl(state: string): string {
    const clientId = process.env.VK_OAUTH_CLIENT_ID;
    const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'https://my.linkeon.io';
    if (!clientId) throw new Error('VK_OAUTH_CLIENT_ID not configured');
    const redirectUri = `${redirectBase}/webhook/smm/oauth/vk/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      display: 'page',
      redirect_uri: redirectUri,
      scope: 'video,wall,offline,groups',
      response_type: 'code',
      state,
      v: VK_API_VERSION,
    });
    return `https://oauth.vk.com/authorize?${params}`;
  }

  /**
   * Exchange the OAuth code for an access_token.
   * Returns the credentials object to encrypt and store in smm_social_account.
   */
  async exchangeCode(code: string): Promise<{
    accessToken: string;
    userId: number;
    expiresIn: number;        // seconds; 0 means non-expiring (with offline scope)
    displayName: string;
  }> {
    const clientId = process.env.VK_OAUTH_CLIENT_ID;
    const clientSecret = process.env.VK_OAUTH_CLIENT_SECRET;
    const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'https://my.linkeon.io';
    if (!clientId || !clientSecret) throw new Error('VK_OAUTH_CLIENT_ID/SECRET not configured');
    const redirectUri = `${redirectBase}/webhook/smm/oauth/vk/callback`;

    const tokenResp = await axios.get('https://oauth.vk.com/access_token', {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (tokenResp.status !== 200 || tokenResp.data?.error) {
      throw new Error(`VK token exchange failed: ${tokenResp.status} ${JSON.stringify(tokenResp.data).slice(0, 200)}`);
    }
    const { access_token, expires_in, user_id } = tokenResp.data;
    if (!access_token) throw new Error(`VK token exchange: no access_token in response`);

    // Resolve display name
    let displayName = `vk_user_${user_id}`;
    try {
      const userResp = await axios.get('https://api.vk.com/method/users.get', {
        params: {
          user_ids: user_id,
          access_token,
          v: VK_API_VERSION,
        },
        timeout: 10000,
        validateStatus: () => true,
      });
      if (userResp.status === 200 && Array.isArray(userResp.data?.response)) {
        const u = userResp.data.response[0];
        if (u?.first_name) displayName = `${u.first_name} ${u.last_name ?? ''}`.trim();
      }
    } catch {}

    return {
      accessToken: access_token,
      userId: user_id,
      expiresIn: expires_in ?? 0,
      displayName,
    };
  }
}
```

- [ ] **Step 6.3: VK publisher (worker side)**

Replace stub at `worker/src/publish/publishers/vk.publisher.ts`:

```typescript
// worker/src/publish/publishers/vk.publisher.ts
import axios from 'axios';
import FormData from 'form-data';
import { Publisher, PublishInput, PublishResult } from '../publisher.interface';
import { logger } from '../../logger';

const VK_API_VERSION = '5.199';

interface VkCreds {
  accessToken: string;
  userId: number;
  /** Optional group id (negative number, e.g. -1234567 for community walls). If absent, publishes to user's wall. */
  groupId?: number;
}

export const vkPublisher: Publisher = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const creds = input.credentials as unknown as VkCreds;
    if (!creds.accessToken) throw new Error('vk credentials missing accessToken');

    // Step 1: video.save — get an upload URL
    const saveParams = new URLSearchParams({
      access_token: creds.accessToken,
      v: VK_API_VERSION,
      name: input.caption?.slice(0, 100) ?? 'SMM Linkeon',
      description: input.caption?.slice(0, 500) ?? '',
    });
    if (creds.groupId) saveParams.set('group_id', String(Math.abs(creds.groupId)));
    const saveResp = await axios.post('https://api.vk.com/method/video.save', saveParams.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000, validateStatus: () => true,
    });
    if (saveResp.status !== 200 || !saveResp.data?.response?.upload_url) {
      throw new Error(`VK video.save failed: ${saveResp.status} ${JSON.stringify(saveResp.data).slice(0, 200)}`);
    }
    const uploadUrl = saveResp.data.response.upload_url;
    const ownerIdAfterSave = saveResp.data.response.owner_id as number;
    const videoIdAfterSave = saveResp.data.response.video_id as number;

    // Step 2: Download MP4 from MinIO, then POST multipart to VK upload URL
    const mp4 = await axios.get<ArrayBuffer>(input.videoUrl, { responseType: 'arraybuffer', timeout: 60000 });
    const form = new FormData();
    form.append('video_file', Buffer.from(mp4.data), { filename: 'video.mp4', contentType: 'video/mp4' });
    const uploadResp = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity, maxBodyLength: Infinity,
      timeout: 300000, validateStatus: () => true,
    });
    if (uploadResp.status !== 200) {
      throw new Error(`VK video upload failed: ${uploadResp.status} ${JSON.stringify(uploadResp.data).slice(0, 200)}`);
    }
    logger.info({ ownerId: ownerIdAfterSave, videoId: videoIdAfterSave }, 'VK video uploaded');

    // Step 3: wall.post with video attachment
    const wallParams = new URLSearchParams({
      access_token: creds.accessToken,
      v: VK_API_VERSION,
      attachments: `video${ownerIdAfterSave}_${videoIdAfterSave}`,
      message: input.caption ?? '',
    });
    if (creds.groupId) wallParams.set('owner_id', `-${Math.abs(creds.groupId)}`);
    else wallParams.set('owner_id', String(creds.userId));
    wallParams.set('from_group', creds.groupId ? '1' : '0');

    const postResp = await axios.post('https://api.vk.com/method/wall.post', wallParams.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000, validateStatus: () => true,
    });
    if (postResp.status !== 200 || !postResp.data?.response?.post_id) {
      throw new Error(`VK wall.post failed: ${postResp.status} ${JSON.stringify(postResp.data).slice(0, 200)}`);
    }
    const postId = postResp.data.response.post_id as number;
    const ownerForUrl = creds.groupId ? `-${Math.abs(creds.groupId)}` : String(creds.userId);
    const externalUrl = `https://vk.com/wall${ownerForUrl}_${postId}`;
    logger.info({ externalUrl }, 'VK wall.post ok');

    return {
      externalUrl,
      externalPostId: `${ownerForUrl}_${postId}`,
    };
  },

  async delete(input) {
    const creds = input.credentials as unknown as VkCreds;
    const [ownerId, postId] = input.externalPostId.split('_');
    if (!ownerId || !postId) return;
    await axios.post('https://api.vk.com/method/wall.delete', new URLSearchParams({
      access_token: creds.accessToken,
      v: VK_API_VERSION,
      owner_id: ownerId,
      post_id: postId,
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
      validateStatus: () => true,
    });
  },
};
```

Note: this uses `form-data` from npm. Add it to worker `package.json`:

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>/worker
npm install form-data --save 2>&1 | tail -3
```

- [ ] **Step 6.4: Register VkOAuthService + OAuthStateService**

In `src/smm/smm.module.ts`:

```typescript
import { OAuthStateService } from './oauth/oauth-state.service';
import { VkOAuthService } from './oauth/vk-oauth.service';
// providers: ..., OAuthStateService, VkOAuthService,
// exports: ..., OAuthStateService, VkOAuthService,
```

- [ ] **Step 6.5: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
cd worker
npm run build 2>&1 | tail -3
```

Both should be clean.

- [ ] **Step 6.6: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
git add src/smm/oauth/oauth-state.service.ts \
        src/smm/oauth/vk-oauth.service.ts \
        worker/src/publish/publishers/vk.publisher.ts \
        worker/package.json worker/package-lock.json \
        src/smm/smm.module.ts
git -c commit.gpgsign=false commit -m "feat(smm): VK publisher + OAuth flow

OAuthStateService: one-shot CSRF state tokens (10min TTL) via
smm_oauth_state table — shared by all OAuth-using platforms.

VkOAuthService: buildAuthorizeUrl(state) returns the consent URL,
exchangeCode(code) does the token swap + resolves user display name.

worker/src/publish/publishers/vk.publisher.ts:
  3-step publish — video.save → multipart upload → wall.post.
  Supports both user wall (creds.groupId absent) and community wall
  (creds.groupId = group's positive id).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: YouTube Shorts publisher + OAuth flow

YouTube uses Google's standard OAuth 2.0 + refresh-token model. The Data API v3 `videos.insert` requires `youtube.upload` scope and a resumable upload (chunked).

**Files:**
- Create: `src/smm/oauth/youtube-oauth.service.ts`
- Modify: `worker/src/publish/publishers/youtube.publisher.ts` (replace stub)
- Modify: `worker/package.json` (add `googleapis`)
- Modify: `src/smm/smm.module.ts`

- [ ] **Step 7.1: YouTube OAuth service**

Create `src/smm/oauth/youtube-oauth.service.ts`:

```typescript
// src/smm/oauth/youtube-oauth.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class YouTubeOAuthService {
  private readonly logger = new Logger(YouTubeOAuthService.name);

  buildAuthorizeUrl(state: string): string {
    const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
    const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'https://my.linkeon.io';
    if (!clientId) throw new Error('YOUTUBE_OAUTH_CLIENT_ID not configured');
    const redirectUri = `${redirectBase}/webhook/smm/oauth/youtube/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    displayName: string;
    channelId: string;
  }> {
    const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
    const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'https://my.linkeon.io';
    if (!clientId || !clientSecret) throw new Error('YOUTUBE_OAUTH_CLIENT_ID/SECRET not configured');
    const redirectUri = `${redirectBase}/webhook/smm/oauth/youtube/callback`;

    const tokenResp = await axios.post('https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        validateStatus: () => true,
      },
    );
    if (tokenResp.status !== 200 || !tokenResp.data?.access_token) {
      throw new Error(`Google token exchange failed: ${tokenResp.status} ${JSON.stringify(tokenResp.data).slice(0, 200)}`);
    }
    const { access_token, refresh_token, expires_in } = tokenResp.data;

    // Resolve YouTube channel info
    const chanResp = await axios.get('https://youtube.googleapis.com/youtube/v3/channels', {
      params: { part: 'snippet', mine: 'true' },
      headers: { Authorization: `Bearer ${access_token}` },
      timeout: 10000,
      validateStatus: () => true,
    });
    let displayName = 'YouTube channel';
    let channelId = '';
    if (chanResp.status === 200 && Array.isArray(chanResp.data?.items) && chanResp.data.items.length > 0) {
      const ch = chanResp.data.items[0];
      displayName = ch.snippet?.title ?? displayName;
      channelId = ch.id ?? '';
    }

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      displayName,
      channelId,
    };
  }

  /**
   * Refresh an access token using the refresh_token.
   * The worker uses this when its current access_token is expired.
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('YOUTUBE_OAUTH_CLIENT_ID/SECRET not configured');
    const resp = await axios.post('https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        validateStatus: () => true,
      },
    );
    if (resp.status !== 200 || !resp.data?.access_token) {
      throw new Error(`Google token refresh failed: ${resp.status} ${JSON.stringify(resp.data).slice(0, 200)}`);
    }
    return { accessToken: resp.data.access_token, expiresIn: resp.data.expires_in };
  }
}
```

- [ ] **Step 7.2: YouTube publisher (worker)**

Install googleapis on worker side:

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>/worker
npm install googleapis --save 2>&1 | tail -3
```

Replace stub at `worker/src/publish/publishers/youtube.publisher.ts`:

```typescript
// worker/src/publish/publishers/youtube.publisher.ts
import axios from 'axios';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { Publisher, PublishInput, PublishResult } from '../publisher.interface';
import { logger } from '../../logger';

interface YouTubeCreds {
  accessToken: string;
  refreshToken: string;
  channelId?: string;
  /** Optional ISO timestamp of when access_token was issued — for proactive refresh. Not strictly required. */
  issuedAt?: string;
}

export const youtubePublisher: Publisher = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const creds = input.credentials as unknown as YouTubeCreds;
    if (!creds.accessToken || !creds.refreshToken) {
      throw new Error('youtube credentials missing accessToken or refreshToken');
    }

    // Set up oauth2 client with proactive refresh handler
    const oauth2 = new google.auth.OAuth2(
      process.env.YOUTUBE_OAUTH_CLIENT_ID,
      process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
    );
    oauth2.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2 });

    // Download the MP4 into a stream
    const mp4Resp = await axios.get(input.videoUrl, { responseType: 'stream', timeout: 60000 });
    const videoStream = mp4Resp.data as Readable;

    // Build title + description. Title must be ≤100 chars. Add #Shorts to ensure it's classified as a Short.
    const captionFirstLine = (input.caption ?? '').split('\n')[0].trim();
    const titleBase = captionFirstLine || 'Linkeon SMM';
    const title = `${titleBase.slice(0, 90)} #Shorts`;
    const description = `${input.caption ?? ''}\n\n#Shorts\nmy.linkeon.io`;

    const insertResp = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          categoryId: '22',  // People & Blogs
          tags: ['linkeon', 'shorts'],
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body: videoStream,
      },
    });

    const videoId = insertResp.data.id;
    if (!videoId) throw new Error(`YouTube videos.insert returned no id`);
    const externalUrl = `https://www.youtube.com/shorts/${videoId}`;
    logger.info({ videoId, externalUrl }, 'YouTube publish ok');

    return {
      externalUrl,
      externalPostId: videoId,
    };
  },

  async delete(input) {
    const creds = input.credentials as unknown as YouTubeCreds;
    const oauth2 = new google.auth.OAuth2(
      process.env.YOUTUBE_OAUTH_CLIENT_ID,
      process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
    );
    oauth2.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
    });
    const youtube = google.youtube({ version: 'v3', auth: oauth2 });
    await youtube.videos.delete({ id: input.externalPostId });
  },
};
```

NOTE: `googleapis` auto-refreshes access_token using refresh_token when the current token is rejected — that's why we don't manually call refresh here. The OAuth2 client handles it transparently. However, the new access_token isn't persisted back to our DB. That's OK because the refresh_token doesn't expire (it's long-lived) and re-refreshing on each publish is cheap. For better hygiene, a future improvement would persist the new access_token back to smm_social_account after each publish — but skip for MVP.

- [ ] **Step 7.3: Register YouTubeOAuthService**

In `src/smm/smm.module.ts`:

```typescript
import { YouTubeOAuthService } from './oauth/youtube-oauth.service';
// providers: ..., YouTubeOAuthService,
// exports: ..., YouTubeOAuthService,
```

- [ ] **Step 7.4: Worker env vars**

The worker needs `YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET` for the googleapis OAuth2 client. Add to `worker/.env` (locally) and to server's worker `.env` (in Task 11 deploy).

```bash
# Local — read from main API .env
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>/worker
for k in YOUTUBE_OAUTH_CLIENT_ID YOUTUBE_OAUTH_CLIENT_SECRET; do
  val=$(grep "^${k}=" ../.env | head -1 | cut -d= -f2-)
  if [ -n "$val" ]; then
    # Either replace existing or append
    if grep -q "^${k}=" .env; then
      sed -i.bak "s|^${k}=.*|${k}=${val}|" .env && rm .env.bak
    else
      echo "${k}=${val}" >> .env
    fi
  fi
done
```

If `YOUTUBE_OAUTH_CLIENT_ID` and `_SECRET` aren't in main API `.env`, add them manually using values from Google Cloud Console (see Task 11 pre-flight for setup instructions).

- [ ] **Step 7.5: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
cd worker
npm run build 2>&1 | tail -3
```

Both clean.

- [ ] **Step 7.6: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
git add src/smm/oauth/youtube-oauth.service.ts \
        worker/src/publish/publishers/youtube.publisher.ts \
        worker/package.json worker/package-lock.json \
        src/smm/smm.module.ts
git -c commit.gpgsign=false commit -m "feat(smm): YouTube Shorts publisher + OAuth flow

YouTubeOAuthService: standard Google OAuth 2.0 with offline access
(refresh token). Scopes: youtube.upload + youtube.readonly.

worker/src/publish/publishers/youtube.publisher.ts uses googleapis
OAuth2 client (which auto-refreshes access_token via refresh_token
when needed) and youtube.videos.insert with a streaming MP4 body.
Title is forced to end with #Shorts so YouTube classifies it as a
Short.

privacyStatus='public', selfDeclaredMadeForKids=false. Category 22
(People & Blogs).

Quota: ~1600 units per upload; default 10000/day → 6 uploads/day.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: TikTok publisher + OAuth flow (sandbox-ready)

TikTok Content Posting API v2. Sandbox until TikTok approves the app for production. Until then, only the `Direct Post API → Approval Status: Sandbox` user (the app owner) can publish.

**Files:**
- Create: `src/smm/oauth/tiktok-oauth.service.ts`
- Modify: `worker/src/publish/publishers/tiktok.publisher.ts`
- Modify: `src/smm/smm.module.ts`

- [ ] **Step 8.1: TikTok OAuth service**

```typescript
// src/smm/oauth/tiktok-oauth.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TikTokOAuthService {
  private readonly logger = new Logger(TikTokOAuthService.name);

  buildAuthorizeUrl(state: string): string {
    const clientKey = process.env.TIKTOK_OAUTH_CLIENT_KEY;
    const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'https://my.linkeon.io';
    if (!clientKey) throw new Error('TIKTOK_OAUTH_CLIENT_KEY not configured');
    const redirectUri = `${redirectBase}/webhook/smm/oauth/tiktok/callback`;
    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: 'code',
      scope: 'user.info.basic,video.publish,video.upload',
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize?${params}`;
  }

  async exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    openId: string;
    expiresIn: number;
    refreshExpiresIn: number;
    displayName: string;
  }> {
    const clientKey = process.env.TIKTOK_OAUTH_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_OAUTH_CLIENT_SECRET;
    const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'https://my.linkeon.io';
    if (!clientKey || !clientSecret) throw new Error('TIKTOK_OAUTH_CLIENT_KEY/SECRET not configured');
    const redirectUri = `${redirectBase}/webhook/smm/oauth/tiktok/callback`;

    const tokenResp = await axios.post('https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        validateStatus: () => true,
      },
    );
    if (tokenResp.status !== 200 || !tokenResp.data?.access_token) {
      throw new Error(`TikTok token exchange failed: ${tokenResp.status} ${JSON.stringify(tokenResp.data).slice(0, 200)}`);
    }
    const { access_token, refresh_token, open_id, expires_in, refresh_expires_in } = tokenResp.data;

    // Resolve display name
    let displayName = 'TikTok account';
    try {
      const userResp = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        params: { fields: 'display_name,username' },
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 10000,
        validateStatus: () => true,
      });
      if (userResp.status === 200 && userResp.data?.data?.user) {
        displayName = userResp.data.data.user.display_name ?? userResp.data.data.user.username ?? displayName;
      }
    } catch {}

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      openId: open_id,
      expiresIn: expires_in,
      refreshExpiresIn: refresh_expires_in,
      displayName,
    };
  }
}
```

- [ ] **Step 8.2: TikTok publisher (worker)**

```typescript
// worker/src/publish/publishers/tiktok.publisher.ts
import axios from 'axios';
import { Publisher, PublishInput, PublishResult } from '../publisher.interface';
import { logger } from '../../logger';

interface TikTokCreds {
  accessToken: string;
  refreshToken: string;
  openId: string;
}

export const tiktokPublisher: Publisher = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const creds = input.credentials as unknown as TikTokCreds;
    if (!creds.accessToken) throw new Error('tiktok credentials missing accessToken');

    // Step 1: Init upload via PULL_FROM_URL (TikTok pulls our public MinIO URL itself)
    const initResp = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
      {
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: input.videoUrl,
        },
        post_info: {
          title: (input.caption ?? '').slice(0, 150),
          privacy_level: 'SELF_ONLY',  // sandbox mode = posts only visible to creator
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        validateStatus: () => true,
      },
    );
    if (initResp.status !== 200 || initResp.data?.error?.code !== 'ok') {
      throw new Error(`TikTok init failed: ${initResp.status} ${JSON.stringify(initResp.data).slice(0, 300)}`);
    }

    const publishId = initResp.data.data?.publish_id;
    if (!publishId) throw new Error(`TikTok init: no publish_id in response`);
    logger.info({ publishId }, 'TikTok publish initiated');

    // Step 2: Poll publish status until "PUBLISH_COMPLETE" or error
    let lastStatus = '';
    for (let i = 0; i < 30; i++) {  // up to 5 minutes
      await new Promise((r) => setTimeout(r, 10000));
      const statusResp = await axios.post(
        'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
        { publish_id: publishId },
        {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
          validateStatus: () => true,
        },
      );
      lastStatus = statusResp.data?.data?.status ?? 'unknown';
      logger.debug({ publishId, status: lastStatus }, 'TikTok status poll');
      if (lastStatus === 'PUBLISH_COMPLETE') {
        const postId = statusResp.data?.data?.publicaly_available_post_id?.[0] ?? statusResp.data?.data?.publicly_available_post_id?.[0];
        return {
          externalUrl: postId ? `https://www.tiktok.com/@${creds.openId}/video/${postId}` : `https://www.tiktok.com/@${creds.openId}`,
          externalPostId: postId ?? publishId,
        };
      }
      if (lastStatus === 'FAILED' || lastStatus === 'PROCESSING_DOWNLOAD_FAILED') {
        const failReason = statusResp.data?.data?.fail_reason ?? lastStatus;
        throw new Error(`TikTok publish failed: ${failReason}`);
      }
    }
    throw new Error(`TikTok publish timeout after 5min, last status: ${lastStatus}`);
  },
};
```

- [ ] **Step 8.3: Register TikTokOAuthService**

In `src/smm/smm.module.ts`:

```typescript
import { TikTokOAuthService } from './oauth/tiktok-oauth.service';
// providers: ..., TikTokOAuthService,
// exports: ..., TikTokOAuthService,
```

- [ ] **Step 8.4: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
cd worker
npm run build 2>&1 | tail -3
```

- [ ] **Step 8.5: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
git add src/smm/oauth/tiktok-oauth.service.ts \
        worker/src/publish/publishers/tiktok.publisher.ts \
        src/smm/smm.module.ts
git -c commit.gpgsign=false commit -m "feat(smm): TikTok publisher + OAuth flow (sandbox-ready)

TikTokOAuthService: OAuth 2.0 via open.tiktokapis.com v2. Scopes:
user.info.basic, video.publish, video.upload.

worker/src/publish/publishers/tiktok.publisher.ts uses the Content
Posting API v2 with PULL_FROM_URL mode (TikTok pulls our public
MinIO URL — no upload from our side). 2-step: init → poll status
until PUBLISH_COMPLETE or FAILED.

privacy_level='SELF_ONLY' for sandbox mode. After TikTok approves
the app for production, change this to 'PUBLIC_TO_EVERYONE' in a
follow-up commit (or make it a credentials field).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Instagram (Reels) publisher + OAuth flow (sandbox-ready)

Instagram Reels Publishing requires:
- Facebook Login + Business Verification + Meta App Review for `instagram_content_publish` scope (1.5-2 months wait)
- IG account linked to a Facebook Page → IG Business Account ID
- 2-step API: `POST /<IG_USER_ID>/media` → returns container_id → `POST /<IG_USER_ID>/media_publish` with container_id

**Files:**
- Create: `src/smm/oauth/meta-oauth.service.ts`
- Modify: `worker/src/publish/publishers/instagram.publisher.ts`
- Modify: `src/smm/smm.module.ts`

- [ ] **Step 9.1: Meta OAuth service**

```typescript
// src/smm/oauth/meta-oauth.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);

  buildAuthorizeUrl(state: string): string {
    const appId = process.env.META_APP_ID;
    const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'https://my.linkeon.io';
    if (!appId) throw new Error('META_APP_ID not configured');
    const redirectUri = `${redirectBase}/webhook/smm/oauth/instagram/callback`;
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management',
      state,
    });
    return `https://www.facebook.com/v18.0/dialog/oauth?${params}`;
  }

  async exchangeCode(code: string): Promise<{
    accessToken: string;
    igUserId: string;
    pageId: string;
    displayName: string;
  }> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectBase = process.env.OAUTH_REDIRECT_BASE ?? 'https://my.linkeon.io';
    if (!appId || !appSecret) throw new Error('META_APP_ID/SECRET not configured');
    const redirectUri = `${redirectBase}/webhook/smm/oauth/instagram/callback`;

    // Step 1: Short-lived user access token
    const tokenResp = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (tokenResp.status !== 200 || !tokenResp.data?.access_token) {
      throw new Error(`Meta token exchange failed: ${tokenResp.status} ${JSON.stringify(tokenResp.data).slice(0, 200)}`);
    }
    const shortToken = tokenResp.data.access_token;

    // Step 2: Exchange short-lived for long-lived (60-day) token
    const longResp = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken,
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (longResp.status !== 200 || !longResp.data?.access_token) {
      throw new Error(`Meta long-token exchange failed: ${longResp.status} ${JSON.stringify(longResp.data).slice(0, 200)}`);
    }
    const longLivedToken = longResp.data.access_token;

    // Step 3: Find first Facebook Page → its linked Instagram Business Account
    const pagesResp = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: { access_token: longLivedToken },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (pagesResp.status !== 200 || !pagesResp.data?.data?.length) {
      throw new Error(`Meta /me/accounts returned no pages — user has no FB Page linked`);
    }
    const page = pagesResp.data.data[0];
    const pageId = page.id;
    const pageAccessToken = page.access_token;

    // Step 4: Get IG business account id linked to this page
    const igResp = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
      params: { fields: 'instagram_business_account', access_token: pageAccessToken },
      timeout: 15000,
      validateStatus: () => true,
    });
    const igUserId = igResp.data?.instagram_business_account?.id;
    if (!igUserId) {
      throw new Error(`Page ${pageId} has no linked Instagram Business Account`);
    }

    // Step 5: Get IG account display name (username)
    let displayName = 'Instagram account';
    try {
      const igDataResp = await axios.get(`https://graph.facebook.com/v18.0/${igUserId}`, {
        params: { fields: 'username,name', access_token: pageAccessToken },
        timeout: 10000,
        validateStatus: () => true,
      });
      if (igDataResp.status === 200) {
        displayName = igDataResp.data.username ?? igDataResp.data.name ?? displayName;
      }
    } catch {}

    return {
      accessToken: pageAccessToken,
      igUserId,
      pageId,
      displayName,
    };
  }
}
```

- [ ] **Step 9.2: Instagram publisher (worker)**

```typescript
// worker/src/publish/publishers/instagram.publisher.ts
import axios from 'axios';
import { Publisher, PublishInput, PublishResult } from '../publisher.interface';
import { logger } from '../../logger';

interface InstagramCreds {
  accessToken: string;     // page-level long-lived token
  igUserId: string;
  pageId: string;
}

export const instagramPublisher: Publisher = {
  async publish(input: PublishInput): Promise<PublishResult> {
    const creds = input.credentials as unknown as InstagramCreds;
    if (!creds.accessToken || !creds.igUserId) {
      throw new Error('instagram credentials missing accessToken or igUserId');
    }

    // Step 1: Create Reels container
    const createResp = await axios.post(
      `https://graph.facebook.com/v18.0/${creds.igUserId}/media`,
      null,
      {
        params: {
          media_type: 'REELS',
          video_url: input.videoUrl,
          caption: input.caption ?? '',
          access_token: creds.accessToken,
        },
        timeout: 30000,
        validateStatus: () => true,
      },
    );
    if (createResp.status !== 200 || !createResp.data?.id) {
      throw new Error(`IG create container failed: ${createResp.status} ${JSON.stringify(createResp.data).slice(0, 300)}`);
    }
    const containerId = createResp.data.id;
    logger.info({ containerId }, 'IG container created');

    // Step 2: Poll container status until FINISHED or ERROR
    let lastStatus = '';
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      const statusResp = await axios.get(`https://graph.facebook.com/v18.0/${containerId}`, {
        params: { fields: 'status_code', access_token: creds.accessToken },
        timeout: 10000,
        validateStatus: () => true,
      });
      lastStatus = statusResp.data?.status_code ?? 'unknown';
      logger.debug({ containerId, status: lastStatus }, 'IG status poll');
      if (lastStatus === 'FINISHED') break;
      if (lastStatus === 'ERROR' || lastStatus === 'EXPIRED') {
        throw new Error(`IG container ${lastStatus}`);
      }
    }
    if (lastStatus !== 'FINISHED') {
      throw new Error(`IG container timeout, last status: ${lastStatus}`);
    }

    // Step 3: Publish the container
    const publishResp = await axios.post(
      `https://graph.facebook.com/v18.0/${creds.igUserId}/media_publish`,
      null,
      {
        params: { creation_id: containerId, access_token: creds.accessToken },
        timeout: 30000,
        validateStatus: () => true,
      },
    );
    if (publishResp.status !== 200 || !publishResp.data?.id) {
      throw new Error(`IG media_publish failed: ${publishResp.status} ${JSON.stringify(publishResp.data).slice(0, 300)}`);
    }
    const mediaId = publishResp.data.id;
    const externalUrl = `https://www.instagram.com/reel/${mediaId}/`;
    logger.info({ mediaId, externalUrl }, 'IG publish ok');

    return {
      externalUrl,
      externalPostId: mediaId,
    };
  },

  async delete(input) {
    const creds = input.credentials as unknown as InstagramCreds;
    await axios.delete(`https://graph.facebook.com/v18.0/${input.externalPostId}`, {
      params: { access_token: creds.accessToken },
      timeout: 15000,
      validateStatus: () => true,
    });
  },
};
```

- [ ] **Step 9.3: Register MetaOAuthService**

In `src/smm/smm.module.ts`:

```typescript
import { MetaOAuthService } from './oauth/meta-oauth.service';
// providers: ..., MetaOAuthService,
// exports: ..., MetaOAuthService,
```

- [ ] **Step 9.4: Build verify**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
cd worker
npm run build 2>&1 | tail -3
```

- [ ] **Step 9.5: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
git add src/smm/oauth/meta-oauth.service.ts \
        worker/src/publish/publishers/instagram.publisher.ts \
        src/smm/smm.module.ts
git -c commit.gpgsign=false commit -m "feat(smm): Instagram Reels publisher + Meta OAuth flow (sandbox-ready)

MetaOAuthService: Facebook Login → short-lived token → long-lived
(60d) → page access_token → linked IG Business Account ID. Scopes:
instagram_basic, instagram_content_publish, pages_show_list,
pages_read_engagement, business_management.

worker/src/publish/publishers/instagram.publisher.ts uses Graph API:
1. POST /<IG_USER_ID>/media with media_type=REELS + video_url
2. Poll container status_code until FINISHED or ERROR
3. POST /<IG_USER_ID>/media_publish with creation_id

Both /media and /media_publish require instagram_content_publish
scope (Meta App Review required for prod — sandbox until then).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: OAuth controllers + social-account REST endpoints

Now we wire up:
- `GET /webhook/smm/oauth/:platform/start` — creates state, redirects to platform consent
- `GET /webhook/smm/oauth/:platform/callback` — consumes state, exchanges code, encrypts + stores credentials
- `GET /webhook/smm/social-accounts` — list current user's accounts
- `POST /webhook/smm/social-accounts/telegram` — Telegram has no OAuth, so admin posts `{ botToken, chatId, displayName }`
- `DELETE /webhook/smm/social-accounts/:id` — unlink an account

**Files:**
- Create: `src/smm/oauth/oauth.controller.ts`
- Create: `src/smm/social-accounts/social-account.controller.ts`
- Create: `src/smm/social-accounts/social-account.dto.ts`
- Modify: `src/smm/smm.module.ts`

- [ ] **Step 10.1: OAuth controller**

Create `src/smm/oauth/oauth.controller.ts`:

```typescript
// src/smm/oauth/oauth.controller.ts
import {
  Controller, Get, Logger, Param, Query, Req, Res, UseGuards, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { OAuthStateService, Platform } from './oauth-state.service';
import { VkOAuthService } from './vk-oauth.service';
import { YouTubeOAuthService } from './youtube-oauth.service';
import { TikTokOAuthService } from './tiktok-oauth.service';
import { MetaOAuthService } from './meta-oauth.service';
import { SocialAccountService } from '../social-accounts/social-account.service';

@Controller('smm/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly state: OAuthStateService,
    private readonly vk: VkOAuthService,
    private readonly yt: YouTubeOAuthService,
    private readonly tt: TikTokOAuthService,
    private readonly meta: MetaOAuthService,
    private readonly accounts: SocialAccountService,
  ) {}

  /**
   * Admin-only entrypoint. Returns a redirect URL the frontend opens.
   * Could also redirect directly via 302, but returning the URL lets the
   * frontend control whether to open in a new tab.
   */
  @Get(':platform/start')
  @UseGuards(JwtGuard, AdminGuard)
  async start(
    @Req() req: any,
    @Param('platform') platform: string,
    @Query('redirect') redirect?: string,
  ): Promise<{ authorizeUrl: string }> {
    if (!['vk', 'youtube', 'tiktok', 'instagram'].includes(platform)) {
      throw new BadRequestException(`unsupported platform: ${platform}`);
    }
    const stateToken = await this.state.create(req.user.phone, platform as Platform, redirect);
    let authorizeUrl: string;
    switch (platform) {
      case 'vk':        authorizeUrl = this.vk.buildAuthorizeUrl(stateToken); break;
      case 'youtube':   authorizeUrl = this.yt.buildAuthorizeUrl(stateToken); break;
      case 'tiktok':    authorizeUrl = this.tt.buildAuthorizeUrl(stateToken); break;
      case 'instagram': authorizeUrl = this.meta.buildAuthorizeUrl(stateToken); break;
      default: throw new BadRequestException(`unsupported platform: ${platform}`);
    }
    return { authorizeUrl };
  }

  /**
   * OAuth callback from the platform. NOT guarded — platform redirects here
   * with code+state in URL. State validates the user identity.
   */
  @Get(':platform/callback')
  async callback(
    @Param('platform') platform: string,
    @Query('code') code: string,
    @Query('state') stateToken: string,
    @Query('error') error: string,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      this.logger.warn(`OAuth ${platform} callback error: ${error}`);
      res.redirect(`/?smm_oauth_error=${encodeURIComponent(error)}`);
      return;
    }
    if (!code || !stateToken) {
      res.redirect(`/?smm_oauth_error=missing_params`);
      return;
    }
    if (!['vk', 'youtube', 'tiktok', 'instagram'].includes(platform)) {
      res.redirect(`/?smm_oauth_error=bad_platform`);
      return;
    }
    let userId: string;
    let userRedirect: string | null;
    try {
      const consumed = await this.state.consume(stateToken, platform as Platform);
      userId = consumed.userId;
      userRedirect = consumed.redirectUrl;
    } catch (e: any) {
      res.redirect(`/?smm_oauth_error=invalid_state`);
      return;
    }

    try {
      let credentials: Record<string, unknown>;
      let displayName: string;
      switch (platform) {
        case 'vk': {
          const r = await this.vk.exchangeCode(code);
          credentials = { accessToken: r.accessToken, userId: r.userId, expiresIn: r.expiresIn };
          displayName = r.displayName;
          break;
        }
        case 'youtube': {
          const r = await this.yt.exchangeCode(code);
          credentials = {
            accessToken: r.accessToken,
            refreshToken: r.refreshToken,
            channelId: r.channelId,
            expiresIn: r.expiresIn,
            issuedAt: new Date().toISOString(),
          };
          displayName = r.displayName;
          break;
        }
        case 'tiktok': {
          const r = await this.tt.exchangeCode(code);
          credentials = {
            accessToken: r.accessToken,
            refreshToken: r.refreshToken,
            openId: r.openId,
            expiresIn: r.expiresIn,
            refreshExpiresIn: r.refreshExpiresIn,
          };
          displayName = r.displayName;
          break;
        }
        case 'instagram': {
          const r = await this.meta.exchangeCode(code);
          credentials = { accessToken: r.accessToken, igUserId: r.igUserId, pageId: r.pageId };
          displayName = r.displayName;
          break;
        }
        default: throw new Error(`unsupported`);
      }

      // Persist the social account
      await this.accounts.create({
        userId,
        platform: platform as Platform,
        displayName,
        credentialsPlain: credentials,
        expiresAt: null,
      });

      const dest = userRedirect ?? `/?smm_oauth_success=${platform}`;
      res.redirect(dest);
    } catch (e: any) {
      this.logger.error(`OAuth ${platform} exchange failed: ${e.message}`);
      res.redirect(`/?smm_oauth_error=${encodeURIComponent(e.message.slice(0, 80))}`);
    }
  }
}
```

- [ ] **Step 10.2: Social-account DTOs**

Create `src/smm/social-accounts/social-account.dto.ts`:

```typescript
// src/smm/social-accounts/social-account.dto.ts
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTelegramAccountDto {
  @IsString() @IsNotEmpty()
  botToken!: string;

  @IsString() @IsNotEmpty()
  chatId!: string;        // "@my_channel" or "-1001234567890"

  @IsString() @IsOptional()
  displayName?: string;
}
```

- [ ] **Step 10.3: Social-account REST controller**

Create `src/smm/social-accounts/social-account.controller.ts`:

```typescript
// src/smm/social-accounts/social-account.controller.ts
import {
  Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post,
  Req, UseGuards, UsePipes, ValidationPipe, BadRequestException,
} from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SocialAccountService } from './social-account.service';
import { CreateTelegramAccountDto } from './social-account.dto';
import axios from 'axios';

@Controller('smm/social-accounts')
@UseGuards(JwtGuard, AdminGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SocialAccountController {
  constructor(private readonly accounts: SocialAccountService) {}

  @Get()
  async list(@Req() req: any) {
    const rows = await this.accounts.listForUser(req.user.phone);
    // Don't return credentials field — leak prevention
    return rows.map((a) => ({
      id: a.id,
      platform: a.platform,
      displayName: a.displayName,
      status: a.status,
      createdAt: a.createdAt,
    }));
  }

  @Post('telegram')
  async createTelegram(@Req() req: any, @Body() dto: CreateTelegramAccountDto) {
    // Validate bot token by calling Telegram getMe
    let displayName = dto.displayName;
    try {
      const r = await axios.get(`https://api.telegram.org/bot${dto.botToken}/getMe`, { timeout: 10000 });
      if (!r.data?.ok || !r.data?.result?.username) {
        throw new BadRequestException(`getMe response invalid`);
      }
      displayName ??= `@${r.data.result.username} → ${dto.chatId}`;
    } catch (e: any) {
      throw new BadRequestException(`Invalid bot token: ${e.message}`);
    }
    // Optional: verify the bot can post to the chat by calling getChat
    try {
      await axios.get(`https://api.telegram.org/bot${dto.botToken}/getChat`, {
        params: { chat_id: dto.chatId }, timeout: 10000,
      });
    } catch (e: any) {
      throw new BadRequestException(`Cannot access chat ${dto.chatId}: ${e.message}`);
    }

    const account = await this.accounts.create({
      userId: req.user.phone,
      platform: 'telegram',
      displayName,
      credentialsPlain: { botToken: dto.botToken, chatId: dto.chatId },
      expiresAt: null,
    });
    return { id: account.id, displayName: account.displayName, platform: 'telegram' };
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const acc = await this.accounts.findById(id);
    if (!acc) throw new NotFoundException(`account ${id}`);
    if (acc.userId !== req.user.phone) throw new ForbiddenException();
    const ok = await this.accounts.deleteById(id);
    return { ok };
  }
}
```

- [ ] **Step 10.4: Register controllers**

In `src/smm/smm.module.ts`:

```typescript
import { OAuthController } from './oauth/oauth.controller';
import { SocialAccountController } from './social-accounts/social-account.controller';
// In controllers array: ..., OAuthController, SocialAccountController,
```

- [ ] **Step 10.5: Build + smoke (without real OAuth — just verify routes exist)**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3

lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; sleep 1
PORT=3001 npm run start:dev > /tmp/smm-task10.log 2>&1 &
APP_PID=$!
sleep 12

# Get admin JWT
curl -sf "https://my.linkeon.io/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/79030169187" >/dev/null
CODE=$(curl -s "https://my.linkeon.io/webhook/debug/sms-code/79030169187" | jq -r '.code')
JWT=$(curl -s "https://my.linkeon.io/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/79030169187/$CODE" | jq -r '."access-token"')

# Probe routes
curl -s -o /dev/null -w "GET oauth/vk/start no-auth: %{http_code}\n" http://localhost:3001/webhook/smm/oauth/vk/start
curl -s -o /dev/null -w "GET oauth/vk/start admin: %{http_code}\n" \
  -H "Authorization: Bearer $JWT" http://localhost:3001/webhook/smm/oauth/vk/start

curl -s -o /dev/null -w "GET social-accounts admin: %{http_code}\n" \
  -H "Authorization: Bearer $JWT" http://localhost:3001/webhook/smm/social-accounts

# Telegram POST without body → 400
curl -s -o /dev/null -w "POST telegram no-body: %{http_code}\n" \
  -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  http://localhost:3001/webhook/smm/social-accounts/telegram

kill $APP_PID 2>/dev/null
```

Expected:
- `oauth/vk/start no-auth: 401`
- `oauth/vk/start admin: 200` (returns `{ authorizeUrl: "https://oauth.vk.com/..." }` if VK_OAUTH_CLIENT_ID is set, else 500 "VK_OAUTH_CLIENT_ID not configured")
- `social-accounts admin: 200` (returns `[]`)
- `POST telegram no-body: 400`

- [ ] **Step 10.6: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
git add src/smm/oauth/oauth.controller.ts \
        src/smm/social-accounts/social-account.controller.ts \
        src/smm/social-accounts/social-account.dto.ts \
        src/smm/smm.module.ts
git -c commit.gpgsign=false commit -m "feat(smm): OAuth controllers + social-account REST endpoints

OAuthController:
  GET /webhook/smm/oauth/:platform/start (admin-only) returns
    { authorizeUrl } — frontend opens it in a new tab.
  GET /webhook/smm/oauth/:platform/callback handles platform redirect:
    state validation → code exchange → encrypt + persist credentials.
    Redirects to '/' with smm_oauth_success or smm_oauth_error param.

SocialAccountController (admin-only):
  GET    /webhook/smm/social-accounts → list user's accounts
  POST   /webhook/smm/social-accounts/telegram { botToken, chatId, displayName? }
    Validates token via getMe + verifies access to chat via getChat.
  DELETE /webhook/smm/social-accounts/:id

Credentials never leak — list endpoint strips the credentials field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: AI tools (connect_social, schedule_publication, cancel_publication, list_publications) + system prompt update + deploy

Final integration: 4 new tools, dispatcher updates, prompt update, deploy.

**Files:**
- Modify: `src/smm/producer/smm-producer-tools.ts` (add 4 tools)
- Modify: `src/smm/producer/smm-producer-tools.service.ts` (add 4 dispatch handlers)
- Modify: `src/smm/producer/smm-producer.prompt.ts` (workflow section update)

- [ ] **Step 11.1: Add 4 tool schemas**

Open `src/smm/producer/smm-producer-tools.ts`. The existing array has 7 tools. Append 4 more:

```typescript
  // === Plan 4 tools ===
  {
    name: 'connect_social',
    description:
      "Returns a link the user opens in a browser to authorize Linkeon to publish on a social platform. " +
      "For Telegram, returns instructions for the manual setup flow (POST a bot_token + chat_id via REST). " +
      "For VK/YouTube/TikTok/Instagram, returns an OAuth authorize URL.",
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['telegram', 'vk', 'youtube', 'tiktok', 'instagram'] },
      },
      required: ['platform'],
    },
  },
  {
    name: 'schedule_publication',
    description:
      "Schedule a video to publish to one or more social platforms. The video must be in 'approved' or 'ready' status. " +
      "scheduled_time accepts: ISO timestamp ('2026-05-16T18:00:00+03:00'), Russian phrases ('завтра в 18', 'через час', 'сейчас'), or null/empty for immediate. " +
      "platforms: any subset of ['telegram', 'vk', 'youtube', 'tiktok', 'instagram']. Per-platform results in scheduled[] / failed[].",
    input_schema: {
      type: 'object',
      properties: {
        video_id: { type: 'string', description: 'UUID of the approved video.' },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['telegram', 'vk', 'youtube', 'tiktok', 'instagram'] },
          description: 'Which platforms to post on.',
        },
        scheduled_time: { type: 'string', description: 'When to publish. ISO or Russian phrase. Null/empty = now.' },
        caption: { type: 'string', description: 'Optional caption text (Russian).' },
      },
      required: ['video_id', 'platforms'],
    },
  },
  {
    name: 'cancel_publication',
    description:
      "Cancel a scheduled publication that hasn't started yet (status='scheduled'). " +
      "Publications in 'publishing'/'published'/'failed' status cannot be cancelled.",
    input_schema: {
      type: 'object',
      properties: {
        publication_id: { type: 'string' },
      },
      required: ['publication_id'],
    },
  },
  {
    name: 'list_publications',
    description:
      "List the user's recent publications (last 50), optionally filtered by status or videoId. " +
      "Use when the user asks 'что в расписании?', 'когда выйдет ролик?', or 'покажи опубликованные'.",
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['scheduled', 'publishing', 'published', 'failed', 'cancelled'] },
        video_id: { type: 'string' },
      },
    },
  },
```

- [ ] **Step 11.2: Add 4 dispatcher methods**

Open `src/smm/producer/smm-producer-tools.service.ts`. The class already has:
- ctor with `pg`, `scenario`, `trends`, `approval`
- `handle(toolName, input, ctx)` switch

Add new injected services in the constructor (PublicationService + the 4 OAuth services + SocialAccountService + OAuthStateService). Update:

```typescript
import { PublicationService } from '../publication/publication.service';
import { OAuthStateService, Platform as OAuthPlatform } from '../oauth/oauth-state.service';
import { VkOAuthService } from '../oauth/vk-oauth.service';
import { YouTubeOAuthService } from '../oauth/youtube-oauth.service';
import { TikTokOAuthService } from '../oauth/tiktok-oauth.service';
import { MetaOAuthService } from '../oauth/meta-oauth.service';
import { parseScheduleTime } from '../publication/time-parser';
```

Constructor:

```typescript
  constructor(
    private readonly pg: PgService,
    private readonly scenario: ScenarioService,
    private readonly trends: TrendsService,
    private readonly approval: ApprovalService,
    private readonly publication: PublicationService,
    private readonly oauthState: OAuthStateService,
    private readonly vk: VkOAuthService,
    private readonly yt: YouTubeOAuthService,
    private readonly tt: TikTokOAuthService,
    private readonly meta: MetaOAuthService,
  ) {}
```

Add 4 new cases in the `handle` switch (after existing `list_scenarios`):

```typescript
        case 'connect_social':      return await this.connectSocial(input, ctx);
        case 'schedule_publication': return await this.schedulePublication(input, ctx);
        case 'cancel_publication':  return await this.cancelPublication(input);
        case 'list_publications':   return await this.listPublications(input, ctx);
```

Add 4 new private methods at the end of the class:

```typescript
  private async connectSocial(input: { platform: string }, ctx: ToolContext): Promise<{
    platform: string;
    method: 'oauth' | 'manual';
    authorizeUrl?: string;
    instructions?: string;
  }> {
    if (input.platform === 'telegram') {
      return {
        platform: 'telegram',
        method: 'manual',
        instructions:
          'Создай бота через @BotFather, добавь его как администратора в свой канал, ' +
          'затем напиши боту первое сообщение чтобы получить chat_id (или используй @username канала). ' +
          'Затем отправь POST на /webhook/smm/social-accounts/telegram с { botToken, chatId, displayName? }.',
      };
    }
    if (!['vk', 'youtube', 'tiktok', 'instagram'].includes(input.platform)) {
      throw new Error(`unsupported platform: ${input.platform}`);
    }
    const stateToken = await this.oauthState.create(ctx.userId, input.platform as OAuthPlatform);
    let authorizeUrl: string;
    switch (input.platform) {
      case 'vk':        authorizeUrl = this.vk.buildAuthorizeUrl(stateToken); break;
      case 'youtube':   authorizeUrl = this.yt.buildAuthorizeUrl(stateToken); break;
      case 'tiktok':    authorizeUrl = this.tt.buildAuthorizeUrl(stateToken); break;
      case 'instagram': authorizeUrl = this.meta.buildAuthorizeUrl(stateToken); break;
      default: throw new Error(`unsupported`);
    }
    return { platform: input.platform, method: 'oauth', authorizeUrl };
  }

  private async schedulePublication(
    input: { video_id: string; platforms: string[]; scheduled_time?: string; caption?: string },
    ctx: ToolContext,
  ) {
    const scheduledAt = parseScheduleTime(input.scheduled_time ?? null);
    const result = await this.publication.schedulePublications({
      userId: ctx.userId,
      videoId: input.video_id,
      platforms: input.platforms as any[],
      scheduledAt,
      caption: input.caption,
    });
    return result;
  }

  private async cancelPublication(input: { publication_id: string }): Promise<{ ok: true }> {
    await this.publication.cancel(input.publication_id);
    return { ok: true };
  }

  private async listPublications(
    input: { status?: string; video_id?: string },
    ctx: ToolContext,
  ) {
    const rows = await this.publication.listForUser(ctx.userId, {
      status: input.status,
      videoId: input.video_id,
    });
    return {
      publications: rows.map((p) => ({
        id: p.id,
        videoId: p.videoId,
        platform: p.platform,
        status: p.status,
        scheduledAt: p.scheduledAt,
        publishedAt: p.publishedAt,
        externalUrl: p.externalUrl,
      })),
    };
  }
```

- [ ] **Step 11.3: Update system prompt**

Open `src/smm/producer/smm-producer.prompt.ts`. Replace the existing prompt with this extended version that teaches the AI about the new tools:

```typescript
// src/smm/producer/smm-producer.prompt.ts
export const SMM_PRODUCER_SYSTEM_PROMPT = `Ты — SMM-продюсер для платформы Linkeon (my.linkeon.io — платформа AI-ассистентов: психолог, юрист, карьерный коуч). Твоя работа — придумывать короткие 60-сек вертикальные видео-кейсы для соцсетей, рендерить их и публиковать.

ПОЛНЫЙ ВОРКФЛОУ:
1. ГЕНЕРАЦИЯ. Юзер просит сценарии ("сделай 3 ролика про долги", "по трендам недели", "что-нибудь"). Вызываешь generate_scenarios.
2. РЕВЬЮ СЦЕНАРИЕВ. Юзер говорит "первый ок, второй переделай, третий отмена". Вызываешь approve_scenarios, regenerate_scenario, reject_scenario.
3. РЕНДЕР. После approve пайплайн рендерит видео в фоне (~2 мин). Юзер увидит готовый MP4 в чате.
4. РЕВЬЮ РОЛИКА. Юзер говорит "норм" / "переделай" / "отмена" — вызываешь approve_video / reject_video.
5. ПОДКЛЮЧЕНИЕ СОЦСЕТЕЙ. Если у юзера ещё нет подключённой соц-сети, предложи connect_social(platform). Получи authorize_url и попроси юзера открыть его. После авторизации юзер вернётся — спроси "готово?" и продолжай.
6. ПУБЛИКАЦИЯ. После approve_video спрашивай куда и когда. Вызываешь schedule_publication(video_id, platforms[], scheduled_time?, caption?).
7. УПРАВЛЕНИЕ. Юзер спрашивает "что в расписании?" — list_publications. "Отмени" — cancel_publication.

ПРАВИЛА:
- ВСЕГДА вызывай tool вместо текстового ответа, когда требуется действие.
- Между tool-calls пиши короткие комментарии. Не сочиняй простыни.
- Если юзер ушёл off-topic — мягко верни к работе.
- Tier по умолчанию 'economy' (Yandex SpeechKit). Premium — только если юзер прямо просит топ-качество.
- mode: 'topic' если есть тема, 'trends' если "по трендам", иначе 'auto'.
- Дефолт requested_count = 3.

scheduled_time принимает:
- ISO timestamp: '2026-05-16T18:00:00+03:00'
- "сейчас" / "now" / пусто → null (опубликовать немедленно)
- "через час", "через 30 минут"
- "завтра в 18", "сегодня в 22:30", "послезавтра в 9"

platforms: подмножество ['telegram', 'vk', 'youtube', 'tiktok', 'instagram']. Если юзер не уточнил — спроси КУДА публиковать, не угадывай.

После schedule_publication: показывай юзеру результат. Если в result.failed есть платформы — объясни причину (reason: no_account → "сначала подключи через connect_social", duplicate → "уже опубликовано", scheduling_error → причина в detail).

ТОН: дружелюбный, бизнес-собранный. Короткие предложения. Креативный продюсер, а не бот-секретарь.`;
```

- [ ] **Step 11.4: Build + run all tests**

```bash
cd /Users/dmitry/Downloads/spirits_back/.worktrees/<your-worktree>
npm run build 2>&1 | tail -3
cd worker && npm run build 2>&1 | tail -3
cd ..

# Run smm test suite — should still all pass
cd tests
SMM_API_BASE=http://localhost:3001 \
  node runner.js --suite smm 2>&1 | tail -10
```

Expected: all prior tests still pass.

- [ ] **Step 11.5: Merge worktree → b2b**

```bash
cd /Users/dmitry/Downloads/spirits_back
git checkout b2b
git pull --ff-only 2>&1 | tail -3 || true
git merge --no-ff <plan-4-branch> -m "Merge Plan 4: SMM Publishers + Scheduling"
git push origin b2b 2>&1 | tail -3
```

- [ ] **Step 11.6: Deploy to PROD**

Required env vars on the server BEFORE restart. SSH and add to `~/spirits_back/.env`:

```bash
VK_OAUTH_CLIENT_ID=<from VK Developers app>
VK_OAUTH_CLIENT_SECRET=<from VK app>
YOUTUBE_OAUTH_CLIENT_ID=<from Google Cloud Console OAuth Client>
YOUTUBE_OAUTH_CLIENT_SECRET=<from Google>
TIKTOK_OAUTH_CLIENT_KEY=<from TikTok for Developers app>
TIKTOK_OAUTH_CLIENT_SECRET=<from TikTok>
META_APP_ID=<from Facebook for Developers app>
META_APP_SECRET=<from Meta>
OAUTH_REDIRECT_BASE=https://my.linkeon.io
```

If any of these aren't available yet (e.g., TikTok app review hasn't happened), leave the value empty. Routes for that platform return 500 "X_OAUTH_CLIENT_KEY not configured" until set. Telegram works without any of these.

Rsync code + restart:

```bash
rsync -az --timeout=30 \
  --exclude='.git/' --exclude='node_modules/' --exclude='dist/' \
  --exclude='.worktrees/' --exclude='.env' \
  --exclude='tests/node_modules/' --exclude='worker/remotion/node_modules' \
  --exclude='worker/node_modules' --exclude='public/generated/' \
  ~/Downloads/spirits_back/ dvolkov@212.113.106.202:/home/dvolkov/spirits_back/

ssh dvolkov@212.113.106.202 'set -e
cd ~/spirits_back
npm install 2>&1 | tail -3
npm run build 2>&1 | tail -3
DATABASE_URL=$(grep "^DATABASE_URL=" .env | cut -d= -f2-) npm run migrate 2>&1 | tail -3
cd worker
npm install 2>&1 | tail -3
npm run build 2>&1 | tail -3
cd ..
pm2 restart linkeon-api
pm2 restart linkeon-smm-worker
sleep 8
pm2 status
'
```

Expected: both processes online, migration `006_smm_oauth_state.sql` applied.

- [ ] **Step 11.7: PROD smoke — full Telegram flow end-to-end**

This is the killer demo: AI chat → schedule publication → real Telegram post.

Pre-flight:
1. Admin creates a TG bot via @BotFather. Note `bot_token`.
2. Admin creates/uses a Telegram channel. Adds the bot as admin with "Post messages" permission.
3. Note the channel's `chat_id` (e.g., `@my_test_channel` or `-1001234567890`).

Then run on local laptop:

```bash
# Get admin JWT
curl -sf "https://my.linkeon.io/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/79030169187" >/dev/null
CODE=$(curl -s "https://my.linkeon.io/webhook/debug/sms-code/79030169187" | jq -r '.code')
JWT=$(curl -s "https://my.linkeon.io/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/79030169187/$CODE" | jq -r '."access-token"')

# 1) Connect Telegram bot
BOT_TOKEN="<your real bot token here>"
CHAT_ID="<your channel id or @username>"
curl -s -X POST https://my.linkeon.io/webhook/smm/social-accounts/telegram \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"botToken\":\"$BOT_TOKEN\",\"chatId\":\"$CHAT_ID\"}" | jq

# 2) Generate + approve a scenario via AI chat (just first part — same as Plan 3a smoke)
curl -sN -X POST https://my.linkeon.io/webhook/soulmate/chat \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"assistantId":15, "message":"Сгенерируй 1 короткий ролик про долги"}' 2>&1 | head -20

# Extract scenario id from output, then approve:
SCENARIO_ID=<from above>
APPROVE=$(curl -s -X POST "https://my.linkeon.io/webhook/smm/scenarios/$SCENARIO_ID/approve" \
  -H "Authorization: Bearer $JWT")
VIDEO_ID=$(echo "$APPROVE" | jq -r '.approved[0].videoId')
echo "Video id: $VIDEO_ID"

# 3) Wait for render to finish (~75s)
for i in $(seq 1 20); do
  STATUS=$(ssh dvolkov@212.113.106.202 "PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -tA -c \"SELECT status FROM smm_video WHERE id='$VIDEO_ID'\"")
  echo "$(date +%H:%M:%S) status=$STATUS"
  if [ "$STATUS" = "ready" ] || [ "$STATUS" = "failed" ]; then break; fi
  sleep 8
done

# 4) Tell AI producer to publish to Telegram now
curl -sN -X POST https://my.linkeon.io/webhook/soulmate/chat \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"assistantId\":15, \"message\":\"Опубликуй ролик $VIDEO_ID в Telegram прямо сейчас\"}" 2>&1 | head -40
```

Expected:
- AI emits `tool_use` for `schedule_publication(video_id=..., platforms=['telegram'], scheduled_time=null)`
- `tool_result` returns `{ scheduled: [{ publicationId, platform: 'telegram', jobId, scheduledAt: null }], failed: [] }`
- Within ~5 seconds the worker picks up the BullMQ job and publishes to the TG channel
- AI replies with the post URL

Verify in Telegram channel: the video should appear there.

Cleanup test data:

```bash
ssh dvolkov@212.113.106.202 "PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -c \"
DELETE FROM smm_billing_ledger WHERE user_id='79030169187';
DELETE FROM smm_campaign WHERE user_id='79030169187';
\""
# Optionally delete the social account too if it's a one-off
```

- [ ] **Step 11.8: Tag release**

```bash
cd /Users/dmitry/Downloads/spirits_back
git tag -a smm-plan-4-deployed -m "Plan 4 (SMM Publishers + Scheduling) deployed to PROD"
git log --oneline -10
```

---

## Self-Review Checklist

**1. Spec coverage:**
- 5 publisher adapters (TG/VK/YT/TT/IG) — Tasks 5/6/7/8/9 ✓
- OAuth for 4 platforms (TG manual) — Tasks 6/7/8/9 ✓
- PublicationService + scheduling — Task 2 ✓
- BullMQ delayed jobs + cancel — Task 2 + 4 ✓
- Worker pipeline + consumer — Task 4 ✓
- Internal context/callback endpoints — Task 3 ✓
- OAuth state CSRF + table — Task 1 + 6 ✓
- OAuth controllers + social-account REST — Task 10 ✓
- 4 AI tools + dispatcher updates — Task 11 ✓
- System prompt update — Task 11 ✓
- Deploy + PROD smoke (Telegram end-to-end) — Task 11 ✓

Frontend (`{{smm_schedule_picker}}` block, publication status card) intentionally OUT of Plan 4 — separate Plan 4d.

Rate-limiting per platform intentionally OUT of Plan 4 — relying on platform-side 429s for now. Follow-up.

**2. Placeholder scan:** ✓ each task has actual TS/SQL code blocks and explicit commands with expected output.

**3. Type consistency:**
- `Platform` type defined in 3 places: `oauth-state.service.ts` (`'vk'|'youtube'|'tiktok'|'instagram'`), `publisher.interface.ts` (`'telegram'|...`, includes TG), `publish-queue.service.ts` (existing from Plan 1). The OAuth one excludes TG (no OAuth). Worker side and PublicationService use the full 5-platform set. These align — TG just doesn't have an OAuth start route.
- `PublishJobPayload` shape `{ publicationId, videoId, platform }` — Task 4 uses it (consumer), Plan 1 PublishQueueService already defined it. Same.
- `PublicationCallbackInput` (Task 4 ApiClient extension) matches `PublicationCallbackDto` (Task 3) — both have `{ publicationId, status, externalUrl?, externalPostId?, errorMessage? }`. Consistent.
- `PublishInput` shape (Task 4 publisher.interface.ts): all 5 publisher implementations (Tasks 5-9) consume the same input fields.
- `parseScheduleTime` (Task 2) returns `Date | null` — Task 11's `schedulePublication` handler passes through to `PublicationService.schedulePublications` which expects `Date | null`. Aligned.

**4. Notable mitigations:**
- TikTok and Instagram code is complete but post-OAuth approvals are external dependencies. The code compiles and stores credentials correctly; the actual publish call will fail at the API level until Meta/TikTok approve the app. That failure surfaces as `smm_publication.status='failed' + error_message='<API error>'` — graceful.
- Telegram is the only flow tested end-to-end on PROD in Task 11.7. VK/YouTube/TikTok/Instagram smoke tests are not in this plan because they require admin to have business accounts on each platform — outside the scope of plan execution.
- Worker package now depends on `googleapis` (~10MB) and `form-data` — small additions.
- The OAuth callback redirects to `/?smm_oauth_success=<platform>` on success. Frontend (Plan 4d) will pick up the query param and show a toast.

---

## Follow-up Items

After Plan 4 ships:

1. **Plan 4d (Frontend):** `{{smm_schedule_picker:videoId=...}}` block in CustomMarkdown, time-picker + platform-checkbox UI, publication status card after `schedule_publication`. ~4-5 tasks.

2. **Rate-limiting:** Add per-platform rate-limiter in `worker/src/consumer.ts` (BullMQ has `limiter` option) — TG 20/h, VK 10/h, YT 5/day, TT 5/day, IG 25/day.

3. **OAuth token refresh on persist:** After each successful publish for YouTube/TikTok, the worker should write the refreshed access_token back to `smm_social_account.credentials`. Currently it's transient.

4. **TikTok / Instagram production approval:** Apply for Meta App Review (`instagram_content_publish` permission) and TikTok Content Posting API approval (1-4 weeks). Until approved, change `privacy_level='SELF_ONLY'` in `tiktok.publisher.ts` for staging users.

5. **Multi-account per platform:** Currently `smm_social_account` allows one account per platform per user (or NULL for global). For agencies managing multiple TG channels, extend to allow N accounts and a chooser in the tool input.
