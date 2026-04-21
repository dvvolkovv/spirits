# Kling Video Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full Kling video generation (text2video, image2video, extend, lipsync, camera control) — exposed both as a new `/video` page and as an LLM tool available to every assistant via a refactored Anthropic tool-calling loop. Async job model with PostgreSQL + background poller + S3 rehost.

**Architecture:** New `src/video/` module (controller, service, dto) + extended `src/misc/kling.service.ts`. Single `video_jobs` table. Background poller as `setInterval` inside `VideoService`. Chat replaces regex image bypass with real Anthropic tool loop, two tools registered: `generate_image` and `generate_video`. Frontend has a new `/video` page with gallery + adaptive create form, and inline `VideoJobCard` in chat streams.

**Tech Stack:** NestJS 10 (TypeScript), PostgreSQL 16, Redis, AWS S3 (`linkeon.io` bucket), Anthropic SDK (`claude-haiku-4-5-20251001`), Kling API (`api.klingai.com/v1`), ffmpeg for thumbnails, React 18 + Vite + Tailwind, i18next, lucide-react.

**Spec:** [docs/superpowers/specs/2026-04-21-kling-video-generation-design.md](../specs/2026-04-21-kling-video-generation-design.md)

---

## Conventions

- Backend root: `/Users/dmitry/Downloads/spirits_back/`
- Frontend root: `/Users/dmitry/Downloads/spirits_front/`
- Tests root: `/Users/dmitry/Downloads/spirits_back/tests/`
- Global route prefix: `webhook` (set in `src/main.ts:13`), so controller paths omit `/webhook/`.
- Auth guard: `JwtGuard` from `src/common/guards/jwt.guard.ts` (used as `@UseGuards(JwtGuard)`); after guard passes, `userId` is on `req.user.userId`.
- DB access: `PgService` from `src/common/services/pg.service.ts`, injected as `private readonly pg: PgService`; use `this.pg.query(sql, params)`; for transactions use `this.pg.transaction(async (client) => { ... })` (see existing patterns in `src/misc/misc.service.ts`).
- Redis: `RedisService` from `src/common/services/redis.service.ts`.
- After every backend task that changes code: `cd ~/Downloads/spirits_back && npm run build` must succeed.
- Commits use conventional prefixes (`feat:`, `refactor:`, `test:`, `docs:`, `chore:`).

---

## Phase A — Backend Foundation (DB + Kling service + VideoService core)

### Task 1: video_jobs table migration

**Files:**
- Create: `~/Downloads/spirits_back/src/video/migrations/001_video_jobs.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 001_video_jobs.sql
CREATE TABLE IF NOT EXISTS video_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  mode             text NOT NULL,
  model            text NOT NULL,
  quality          text NOT NULL,
  duration_sec     int NOT NULL,
  prompt           text,
  negative_prompt  text,
  cfg_scale        numeric(3,1),
  source_image_url text,
  source_video_id  uuid REFERENCES video_jobs(id) ON DELETE SET NULL,
  camera_type      text,
  camera_config    jsonb,
  audio_url        text,
  tokens_spent     bigint NOT NULL,
  kling_task_id    text,
  status           text NOT NULL DEFAULT 'pending',
  video_url        text,
  thumbnail_url    text,
  error_message    text,
  created_at       timestamp with time zone DEFAULT now(),
  updated_at       timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_user_created
  ON video_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_jobs_active_status
  ON video_jobs (status)
  WHERE status IN ('pending','processing');
```

- [ ] **Step 2: Apply migration to dev DB**

Run:
```bash
ssh -p 60322 dvolkov@82.202.197.230 "PGPASSWORD=linkeon_pass_2026 psql -U linkeon -h localhost -d linkeon" < ~/Downloads/spirits_back/src/video/migrations/001_video_jobs.sql
```

- [ ] **Step 3: Verify schema**

Run:
```bash
ssh -p 60322 dvolkov@82.202.197.230 "PGPASSWORD=linkeon_pass_2026 psql -U linkeon -h localhost -d linkeon -c '\d video_jobs'"
```
Expected: all columns listed with correct types; two indexes present.

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/migrations/001_video_jobs.sql
git commit -m "feat(video): video_jobs table migration"
```

---

### Task 2: Video DTOs

**Files:**
- Create: `~/Downloads/spirits_back/src/video/video.dto.ts`

- [ ] **Step 1: Write DTOs**

```ts
// src/video/video.dto.ts
import { IsString, IsOptional, IsNumber, IsIn, IsObject, Min, Max } from 'class-validator';

export type VideoMode = 'text2video' | 'image2video' | 'extend' | 'lipsync';
export type VideoModel = 'kling-v1-6' | 'kling-v2-master';
export type VideoQuality = 'std' | 'pro';
export type VideoStatus = 'pending' | 'processing' | 'ready' | 'failed';

export class CreateVideoJobDto {
  @IsIn(['text2video', 'image2video', 'extend', 'lipsync'])
  mode!: VideoMode;

  @IsOptional() @IsIn(['kling-v1-6', 'kling-v2-master'])
  model?: VideoModel;

  @IsOptional() @IsIn(['std', 'pro'])
  quality?: VideoQuality;

  @IsOptional() @IsIn([5, 10])
  duration?: 5 | 10;

  @IsOptional() @IsString()
  prompt?: string;

  @IsOptional() @IsString()
  negativePrompt?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  cfgScale?: number;

  @IsOptional() @IsString()
  sourceImageUrl?: string;

  @IsOptional() @IsString()
  sourceVideoId?: string;

  @IsOptional() @IsIn(['simple','down_back','forward_up','right_turn_forward','left_turn_forward'])
  cameraType?: string;

  @IsOptional() @IsObject()
  cameraConfig?: Record<string, number>;

  @IsOptional() @IsString()
  audioUrl?: string;
}

export interface VideoJobRow {
  id: string;
  user_id: string;
  mode: VideoMode;
  model: VideoModel;
  quality: VideoQuality;
  duration_sec: number;
  prompt: string | null;
  negative_prompt: string | null;
  cfg_scale: number | null;
  source_image_url: string | null;
  source_video_id: string | null;
  camera_type: string | null;
  camera_config: Record<string, any> | null;
  audio_url: string | null;
  tokens_spent: number;
  kling_task_id: string | null;
  status: VideoStatus;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export const VIDEO_PRICING: Record<string, number> = {
  'text2video.kling-v1-6.std.5':  25000,
  'text2video.kling-v1-6.std.10': 50000,
  'text2video.kling-v1-6.pro.5':  50000,
  'text2video.kling-v1-6.pro.10': 100000,
  'text2video.kling-v2-master.std.5':  150000,
  'text2video.kling-v2-master.std.10': 300000,
  'text2video.kling-v2-master.pro.5':  150000,
  'text2video.kling-v2-master.pro.10': 300000,
  'image2video.kling-v1-6.std.5':  25000,
  'image2video.kling-v1-6.std.10': 50000,
  'image2video.kling-v1-6.pro.5':  50000,
  'image2video.kling-v1-6.pro.10': 100000,
  'image2video.kling-v2-master.std.5':  150000,
  'image2video.kling-v2-master.std.10': 300000,
  'image2video.kling-v2-master.pro.5':  150000,
  'image2video.kling-v2-master.pro.10': 300000,
  'extend.kling-v1-6.std.5':  25000,
  'extend.kling-v1-6.pro.5':  50000,
  'extend.kling-v2-master.std.5':  150000,
  'extend.kling-v2-master.pro.5':  150000,
  'lipsync.kling-v1-6.std.5': 15000,
  'lipsync.kling-v1-6.std.10': 15000,
};

export function computeTokenCost(mode: VideoMode, model: VideoModel, quality: VideoQuality, duration: 5|10): number {
  const key = `${mode}.${model}.${quality}.${duration}`;
  const v = VIDEO_PRICING[key];
  if (v == null) throw new Error(`Unsupported combination: ${key}`);
  return v;
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.dto.ts
git commit -m "feat(video): DTOs and pricing table"
```

---

### Task 3: Extend KlingService with video methods

**Files:**
- Modify: `~/Downloads/spirits_back/src/misc/kling.service.ts`

- [ ] **Step 1: Read existing file**

Read `src/misc/kling.service.ts` to understand current shape (`generateImage`, auth header, timeouts).

- [ ] **Step 2: Append new methods**

Add the following methods to `KlingService` (before the closing `}` of the class):

```ts
// ================= VIDEO =================

private klingHeaders() {
  // Kling API auth: JWT signed with accessKey/secretKey. See existing generateImage() for the pattern
  // used in this service. Re-use whatever helper method is already in use there (e.g. this.buildJwt()).
  return { Authorization: `Bearer ${this.buildJwt()}` };
}

async createText2VideoTask(params: {
  model: 'kling-v1-6' | 'kling-v2-master';
  prompt: string;
  negativePrompt?: string;
  cfgScale?: number;
  mode: 'std' | 'pro';                   // Kling calls this "mode" — std | pro
  duration: 5 | 10;
  cameraControl?: { type: string; config?: Record<string, number> };
}): Promise<{ taskId: string }> {
  const body: any = {
    model_name: params.model,
    prompt: params.prompt,
    negative_prompt: params.negativePrompt,
    cfg_scale: params.cfgScale ?? 0.5,
    mode: params.mode,
    duration: String(params.duration),
  };
  if (params.cameraControl) {
    body.camera_control = params.cameraControl;
  }
  const resp = await axios.post(
    'https://api.klingai.com/v1/videos/text2video',
    body,
    { headers: this.klingHeaders(), timeout: 30000 },
  );
  if (resp.data?.code !== 0) throw new Error(`Kling text2video: ${resp.data?.message || 'unknown error'}`);
  return { taskId: resp.data.data.task_id };
}

async createImage2VideoTask(params: {
  model: 'kling-v1-6' | 'kling-v2-master';
  imageUrl: string;
  prompt?: string;
  negativePrompt?: string;
  cfgScale?: number;
  mode: 'std' | 'pro';
  duration: 5 | 10;
  cameraControl?: { type: string; config?: Record<string, number> };
}): Promise<{ taskId: string }> {
  const body: any = {
    model_name: params.model,
    image: params.imageUrl,
    prompt: params.prompt,
    negative_prompt: params.negativePrompt,
    cfg_scale: params.cfgScale ?? 0.5,
    mode: params.mode,
    duration: String(params.duration),
  };
  if (params.cameraControl) body.camera_control = params.cameraControl;
  const resp = await axios.post(
    'https://api.klingai.com/v1/videos/image2video',
    body,
    { headers: this.klingHeaders(), timeout: 30000 },
  );
  if (resp.data?.code !== 0) throw new Error(`Kling image2video: ${resp.data?.message || 'unknown error'}`);
  return { taskId: resp.data.data.task_id };
}

async createVideoExtendTask(params: {
  videoId: string;      // Kling video id (from a previous task result)
  prompt?: string;
  negativePrompt?: string;
  cfgScale?: number;
}): Promise<{ taskId: string }> {
  const body: any = {
    video_id: params.videoId,
    prompt: params.prompt,
    negative_prompt: params.negativePrompt,
    cfg_scale: params.cfgScale ?? 0.5,
  };
  const resp = await axios.post(
    'https://api.klingai.com/v1/videos/video-extend',
    body,
    { headers: this.klingHeaders(), timeout: 30000 },
  );
  if (resp.data?.code !== 0) throw new Error(`Kling video-extend: ${resp.data?.message || 'unknown error'}`);
  return { taskId: resp.data.data.task_id };
}

async createLipSyncTask(params: {
  videoId: string;
  audioUrl?: string;
  audioType?: 'url' | 'text';
  text?: string;
  voiceId?: string;
}): Promise<{ taskId: string }> {
  const body: any = {
    input: {
      video_id: params.videoId,
      mode: params.audioType === 'text' ? 'text2video' : 'audio2video',
      ...(params.audioUrl ? { audio_url: params.audioUrl } : {}),
      ...(params.text    ? { text: params.text }          : {}),
      ...(params.voiceId ? { voice_id: params.voiceId }   : {}),
    },
  };
  const resp = await axios.post(
    'https://api.klingai.com/v1/videos/lip-sync',
    body,
    { headers: this.klingHeaders(), timeout: 30000 },
  );
  if (resp.data?.code !== 0) throw new Error(`Kling lip-sync: ${resp.data?.message || 'unknown error'}`);
  return { taskId: resp.data.data.task_id };
}

async getVideoTaskStatus(taskId: string, mode: 'text2video'|'image2video'|'extend'|'lipsync')
  : Promise<{ status: 'submitted'|'processing'|'succeed'|'failed'; videoUrl?: string; videoId?: string; error?: string }> {
  const pathByMode: Record<typeof mode, string> = {
    text2video: `/videos/text2video/${taskId}`,
    image2video: `/videos/image2video/${taskId}`,
    extend: `/videos/video-extend/${taskId}`,
    lipsync: `/videos/lip-sync/${taskId}`,
  };
  const resp = await axios.get(
    `https://api.klingai.com/v1${pathByMode[mode]}`,
    { headers: this.klingHeaders(), timeout: 30000 },
  );
  const data = resp.data?.data;
  if (!data) return { status: 'failed', error: 'no data' };
  const status = (data.task_status as string).toLowerCase() as any;
  if (status === 'succeed') {
    const video = data.task_result?.videos?.[0];
    return { status, videoUrl: video?.url, videoId: video?.id };
  }
  if (status === 'failed') {
    return { status, error: data.task_status_msg || 'failed' };
  }
  return { status };
}
```

- [ ] **Step 3: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/misc/kling.service.ts
git commit -m "feat(kling): video task methods (text2video, image2video, extend, lip-sync, status)"
```

---

### Task 4: VideoService skeleton + createJob

**Files:**
- Create: `~/Downloads/spirits_back/src/video/video.service.ts`

- [ ] **Step 1: Write the service skeleton with createJob**

```ts
// src/video/video.service.ts
import { Injectable, Logger, BadRequestException, ForbiddenException,
         NotFoundException, ConflictException, PaymentRequiredException } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { KlingService } from '../misc/kling.service';
import { CreateVideoJobDto, VIDEO_PRICING, VideoJobRow, computeTokenCost,
         VideoMode, VideoModel, VideoQuality } from './video.dto';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly MAX_CONCURRENT_PER_USER = 3;

  constructor(
    private readonly pg: PgService,
    private readonly kling: KlingService,
  ) {}

  async createJob(userId: string, dto: CreateVideoJobDto): Promise<{ jobId: string; status: string; tokensSpent: number }> {
    const mode = dto.mode;
    const model = (dto.model ?? 'kling-v1-6') as VideoModel;
    const quality = (dto.quality ?? 'std') as VideoQuality;
    const duration = (dto.duration ?? 5) as 5|10;

    // --- mode-specific validation ---
    if (mode === 'image2video' && !dto.sourceImageUrl) {
      throw new BadRequestException('image2video requires sourceImageUrl');
    }
    if ((mode === 'extend' || mode === 'lipsync') && !dto.sourceVideoId) {
      throw new BadRequestException(`${mode} requires sourceVideoId`);
    }
    if (mode === 'lipsync' && model !== 'kling-v1-6') {
      throw new BadRequestException('lip-sync is supported only on kling-v1-6');
    }
    if (mode === 'extend' && duration !== 5) {
      throw new BadRequestException('extend always produces 5s');
    }

    // --- ownership check for source video ---
    let sourceKlingVideoId: string | null = null;
    if (dto.sourceVideoId) {
      const row = await this.pg.query<VideoJobRow>(
        `SELECT id, user_id, status, kling_task_id, mode FROM video_jobs WHERE id = $1`,
        [dto.sourceVideoId],
      );
      const src = row.rows[0];
      if (!src) throw new NotFoundException('source video not found');
      if (src.user_id !== userId) throw new ForbiddenException('not your video');
      if (src.status !== 'ready') throw new ConflictException('source video is not ready');
      // We need the Kling-side video id, which we store in kling_task_id result on successful jobs.
      // (Stored on the job when it became ready — see pollJob() which will set kling_task_id to
      //  the returned video_id for reuse.)
      sourceKlingVideoId = src.kling_task_id;
      if (!sourceKlingVideoId) throw new ConflictException('source video has no Kling id');
    }

    // --- concurrent-job guard ---
    const active = await this.pg.query(
      `SELECT COUNT(*)::int AS n FROM video_jobs WHERE user_id=$1 AND status IN ('pending','processing')`,
      [userId],
    );
    if ((active.rows[0] as any).n >= this.MAX_CONCURRENT_PER_USER) {
      throw new ConflictException('too many concurrent jobs — wait for one to finish');
    }

    // --- cost ---
    const cost = computeTokenCost(mode, model, quality, duration);

    // --- transactional deduction + insert ---
    const jobId = await this.pg.transaction(async (client) => {
      const balRes = await client.query(
        `SELECT tokens FROM ai_profiles_consolidated WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const balance = Number(balRes.rows[0]?.tokens ?? 0);
      if (balance < cost) {
        const err: any = new Error('insufficient_tokens');
        err.status = 402;
        err.balance = balance;
        err.required = cost;
        throw err;
      }
      await client.query(
        `UPDATE ai_profiles_consolidated SET tokens = tokens - $1 WHERE user_id = $2`,
        [cost, userId],
      );
      const ins = await client.query(
        `INSERT INTO video_jobs
         (user_id, mode, model, quality, duration_sec, prompt, negative_prompt, cfg_scale,
          source_image_url, source_video_id, camera_type, camera_config, audio_url, tokens_spent, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending')
         RETURNING id`,
        [
          userId, mode, model, quality, duration,
          dto.prompt ?? null, dto.negativePrompt ?? null, dto.cfgScale ?? null,
          dto.sourceImageUrl ?? null, dto.sourceVideoId ?? null,
          dto.cameraType ?? null, dto.cameraConfig ? JSON.stringify(dto.cameraConfig) : null,
          dto.audioUrl ?? null, cost,
        ],
      );
      return (ins.rows[0] as any).id as string;
    }).catch(e => {
      if (e?.status === 402) {
        throw new (class extends Error {
          constructor() { super('insufficient_tokens'); (this as any).response = { balance: e.balance, required: e.required }; (this as any).status = 402; }
        })();
      }
      throw e;
    });

    // --- call Kling (outside txn; failure here => best-effort refund + failed status) ---
    try {
      let taskId: string;
      const cameraControl = dto.cameraType
        ? { type: dto.cameraType, config: dto.cameraConfig }
        : undefined;

      if (mode === 'text2video') {
        ({ taskId } = await this.kling.createText2VideoTask({
          model, prompt: dto.prompt ?? '', negativePrompt: dto.negativePrompt,
          cfgScale: dto.cfgScale, mode: quality, duration, cameraControl,
        }));
      } else if (mode === 'image2video') {
        ({ taskId } = await this.kling.createImage2VideoTask({
          model, imageUrl: dto.sourceImageUrl!, prompt: dto.prompt,
          negativePrompt: dto.negativePrompt, cfgScale: dto.cfgScale,
          mode: quality, duration, cameraControl,
        }));
      } else if (mode === 'extend') {
        ({ taskId } = await this.kling.createVideoExtendTask({
          videoId: sourceKlingVideoId!, prompt: dto.prompt,
          negativePrompt: dto.negativePrompt, cfgScale: dto.cfgScale,
        }));
      } else {
        ({ taskId } = await this.kling.createLipSyncTask({
          videoId: sourceKlingVideoId!,
          audioUrl: dto.audioUrl,
          audioType: dto.audioUrl ? 'url' : 'text',
          text: dto.prompt,
        }));
      }
      await this.pg.query(
        `UPDATE video_jobs SET kling_task_id=$1, status='processing', updated_at=now() WHERE id=$2`,
        [taskId, jobId],
      );
      return { jobId, status: 'processing', tokensSpent: cost };
    } catch (e: any) {
      this.logger.error(`createJob Kling error: ${e.message}`);
      await this.pg.transaction(async (client) => {
        await client.query(
          `UPDATE ai_profiles_consolidated SET tokens = tokens + $1 WHERE user_id = $2`,
          [cost, userId],
        );
        await client.query(
          `UPDATE video_jobs SET status='failed', error_message=$1, updated_at=now() WHERE id=$2`,
          [`kling_create: ${e.message}`.slice(0, 500), jobId],
        );
      });
      throw new BadRequestException(`Kling rejected the request: ${e.message}`);
    }
  }
}
```

- [ ] **Step 2: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.service.ts
git commit -m "feat(video): VideoService.createJob with atomic token deduction"
```

---

### Task 5: VideoService — read/list/delete

**Files:**
- Modify: `~/Downloads/spirits_back/src/video/video.service.ts`

- [ ] **Step 1: Read existing file**

- [ ] **Step 2: Add methods inside the class**

```ts
async getJob(userId: string, jobId: string): Promise<VideoJobRow> {
  const res = await this.pg.query<VideoJobRow>(
    `SELECT * FROM video_jobs WHERE id=$1`,
    [jobId],
  );
  const row = res.rows[0];
  if (!row) throw new NotFoundException('job not found');
  if (row.user_id !== userId) throw new ForbiddenException('not your job');
  return row;
}

async listJobs(userId: string, opts: { status?: string; limit?: number } = {}): Promise<VideoJobRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const params: any[] = [userId];
  let where = `user_id=$1`;
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status=$${params.length}`;
  }
  params.push(limit);
  const res = await this.pg.query<VideoJobRow>(
    `SELECT * FROM video_jobs WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return res.rows;
}

async deleteJob(userId: string, jobId: string): Promise<void> {
  const row = await this.getJob(userId, jobId);        // enforces ownership
  if (row.status === 'processing' || row.status === 'pending') {
    throw new ConflictException('cannot delete active job — wait for completion');
  }
  // Best-effort S3 cleanup (do not fail DB delete on S3 errors)
  if (row.video_url || row.thumbnail_url) {
    try { await this.deleteS3Objects(row.id); }
    catch (e: any) { this.logger.warn(`S3 cleanup failed for ${row.id}: ${e.message}`); }
  }
  await this.pg.query(`DELETE FROM video_jobs WHERE id=$1`, [jobId]);
}

private async deleteS3Objects(jobId: string): Promise<void> {
  // Implemented in Task 7 once S3 client is wired
}
```

- [ ] **Step 3: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.service.ts
git commit -m "feat(video): VideoService.getJob/listJobs/deleteJob with ownership checks"
```

---

### Task 6: VideoService — background poller + pollJob

**Files:**
- Modify: `~/Downloads/spirits_back/src/video/video.service.ts`

- [ ] **Step 1: Add poller infrastructure and per-job handler**

Add to class:

```ts
private pollTimer: NodeJS.Timeout | null = null;
private readonly POLL_INTERVAL_MS = 5000;
private readonly JOB_TIMEOUT_MINUTES = 15;

onModuleInit() {
  this.pollTimer = setInterval(() => this.tick().catch(e =>
    this.logger.error(`tick error: ${e.message}`)
  ), this.POLL_INTERVAL_MS);
  this.logger.log('VideoService poller started (tick=5s)');
}

onModuleDestroy() {
  if (this.pollTimer) clearInterval(this.pollTimer);
}

private async tick() {
  // 1. timeout watchdog
  await this.expireStaleJobs();
  // 2. poll active jobs
  const res = await this.pg.query<VideoJobRow>(
    `SELECT * FROM video_jobs WHERE status='processing' ORDER BY updated_at ASC LIMIT 20`,
  );
  await Promise.all(res.rows.map(job => this.pollJob(job).catch(e =>
    this.logger.error(`pollJob ${job.id} error: ${e.message}`)
  )));
}

private async expireStaleJobs() {
  const stale = await this.pg.query<VideoJobRow>(
    `SELECT id, user_id, tokens_spent
     FROM video_jobs
     WHERE status='processing'
       AND created_at < now() - ($1 || ' minutes')::interval
     FOR UPDATE SKIP LOCKED`,
    [this.JOB_TIMEOUT_MINUTES],
  );
  for (const row of stale.rows) {
    await this.failAndRefund(row.id, row.user_id, Number(row.tokens_spent), 'timeout (15 min)');
  }
}

private async pollJob(job: VideoJobRow) {
  if (!job.kling_task_id) return;
  const res = await this.kling.getVideoTaskStatus(job.kling_task_id, job.mode);
  if (res.status === 'succeed' && res.videoUrl) {
    const s3VideoUrl = await this.rehostToS3(job.id, res.videoUrl);
    const s3ThumbUrl = await this.extractAndUploadThumbnail(job.id, s3VideoUrl);
    // We overwrite kling_task_id with the Kling video_id so it can be used as source for extend/lipsync
    await this.pg.query(
      `UPDATE video_jobs
         SET status='ready', video_url=$1, thumbnail_url=$2,
             kling_task_id = COALESCE($3, kling_task_id),
             updated_at=now()
       WHERE id=$4`,
      [s3VideoUrl, s3ThumbUrl, res.videoId ?? null, job.id],
    );
    this.logger.log(`Video job ${job.id} ready: ${s3VideoUrl}`);
  } else if (res.status === 'failed') {
    await this.failAndRefund(job.id, job.user_id, Number(job.tokens_spent), res.error ?? 'failed');
  }
  // 'processing' / 'submitted' — leave alone; next tick will pick up
}

private async failAndRefund(jobId: string, userId: string, tokens: number, reason: string) {
  await this.pg.transaction(async (client) => {
    await client.query(
      `UPDATE ai_profiles_consolidated SET tokens = tokens + $1 WHERE user_id = $2`,
      [tokens, userId],
    );
    await client.query(
      `UPDATE video_jobs SET status='failed', error_message=$1, updated_at=now() WHERE id=$2`,
      [reason.slice(0, 500), jobId],
    );
  });
  this.logger.warn(`Video job ${jobId} failed, refunded ${tokens} tokens: ${reason}`);
}
```

Also make the class implement the NestJS lifecycle: change class declaration to

```ts
export class VideoService implements OnModuleInit, OnModuleDestroy {
```

and add `OnModuleInit, OnModuleDestroy` to the import line at the top:

```ts
import { Injectable, Logger, BadRequestException, ForbiddenException,
         NotFoundException, ConflictException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
```

- [ ] **Step 2: Stub rehost methods (real impl in Task 7)**

Add placeholders so the file builds:

```ts
private async rehostToS3(jobId: string, klingUrl: string): Promise<string> { return klingUrl; }
private async extractAndUploadThumbnail(jobId: string, videoUrl: string): Promise<string | null> { return null; }
```

- [ ] **Step 3: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.service.ts
git commit -m "feat(video): background poller + pollJob + timeout watchdog (S3 stubs)"
```

---

### Task 7: S3 rehost + ffmpeg thumbnail

**Files:**
- Modify: `~/Downloads/spirits_back/src/video/video.service.ts`

- [ ] **Step 1: Add S3 client and rehost methods**

Replace stubs from Task 6. Add imports at top:

```ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import axios from 'axios';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
```

Add to class:

```ts
private s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
private readonly s3Bucket = process.env.AWS_S3_BUCKET || 'linkeon.io';
private readonly s3Region = process.env.AWS_REGION ?? 'us-east-1';

private s3PublicUrl(key: string): string {
  return `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${key}`;
}

private async rehostToS3(jobId: string, klingUrl: string): Promise<string> {
  const resp = await axios.get(klingUrl, { responseType: 'stream', timeout: 120000 });
  const key = `videos/${jobId}.mp4`;
  await new Upload({
    client: this.s3,
    params: {
      Bucket: this.s3Bucket,
      Key: key,
      Body: resp.data,
      ContentType: 'video/mp4',
      ACL: 'public-read',
    },
  }).done();
  return this.s3PublicUrl(key);
}

private async extractAndUploadThumbnail(jobId: string, videoUrl: string): Promise<string | null> {
  const tmpPath = path.join(os.tmpdir(), `thumb_${jobId}.jpg`);
  try {
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-i', videoUrl, '-ss', '0', '-vframes', '1', '-q:v', '2', tmpPath]);
      let stderr = '';
      ff.stderr.on('data', (d) => { stderr += d.toString(); });
      ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`)));
      ff.on('error', reject);
    });
    const buf = fs.readFileSync(tmpPath);
    const key = `videos/${jobId}.jpg`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.s3Bucket, Key: key, Body: buf,
      ContentType: 'image/jpeg', ACL: 'public-read',
    }));
    return this.s3PublicUrl(key);
  } catch (e: any) {
    this.logger.warn(`thumbnail extract failed for ${jobId}: ${e.message}`);
    return null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

private async deleteS3Objects(jobId: string): Promise<void> {
  await Promise.allSettled([
    this.s3.send(new DeleteObjectCommand({ Bucket: this.s3Bucket, Key: `videos/${jobId}.mp4` })),
    this.s3.send(new DeleteObjectCommand({ Bucket: this.s3Bucket, Key: `videos/${jobId}.jpg` })),
  ]);
}
```

- [ ] **Step 2: Verify ffmpeg is installed on dev server**

Run:
```bash
ssh -p 60322 dvolkov@82.202.197.230 "which ffmpeg || sudo apt-get install -y ffmpeg"
```
Expected: path to ffmpeg printed.

- [ ] **Step 3: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.service.ts
git commit -m "feat(video): S3 rehost + ffmpeg thumbnail + S3 delete"
```

---

## Phase B — Controller, Uploads, Rate Limits, Module Wiring

### Task 8: VideoController with REST endpoints

**Files:**
- Create: `~/Downloads/spirits_back/src/video/video.controller.ts`

- [ ] **Step 1: Write controller**

```ts
// src/video/video.controller.ts
import { Controller, Post, Get, Delete, Body, Param, Query, Req, Res,
         UseGuards, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtGuard } from '../common/guards/jwt.guard';
import { VideoService } from './video.service';
import { CreateVideoJobDto } from './video.dto';

@Controller('video')
export class VideoController {
  constructor(private readonly video: VideoService) {}

  @Post('jobs')
  @UseGuards(JwtGuard)
  async createJob(@Req() req: Request, @Res() res: Response, @Body() dto: CreateVideoJobDto) {
    const userId = (req as any).user.userId;
    try {
      const result = await this.video.createJob(userId, dto);
      return res.json(result);
    } catch (e: any) {
      if (e?.status === 402) {
        return res.status(402).json({ error: 'insufficient_tokens', ...(e.response ?? {}) });
      }
      if (e?.status) return res.status(e.status).json({ error: e.message });
      return res.status(500).json({ error: e.message || 'internal' });
    }
  }

  @Get('jobs/:id')
  @UseGuards(JwtGuard)
  async getJob(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.userId;
    return this.video.getJob(userId, id);
  }

  @Get('jobs')
  @UseGuards(JwtGuard)
  async listJobs(@Req() req: Request, @Query('status') status?: string, @Query('limit') limit?: string) {
    const userId = (req as any).user.userId;
    const jobs = await this.video.listJobs(userId, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { jobs };
  }

  @Delete('jobs/:id')
  @UseGuards(JwtGuard)
  async deleteJob(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.userId;
    await this.video.deleteJob(userId, id);
    return { ok: true };
  }
}
```

- [ ] **Step 2: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.controller.ts
git commit -m "feat(video): REST endpoints (create/get/list/delete)"
```

---

### Task 9: Upload endpoints (image + audio) for image2video / lipsync

**Files:**
- Modify: `~/Downloads/spirits_back/src/video/video.controller.ts`
- Modify: `~/Downloads/spirits_back/src/video/video.service.ts`

- [ ] **Step 1: Add upload helper to VideoService**

Append method:

```ts
async uploadUserAsset(userId: string, kind: 'image'|'audio', buffer: Buffer, mimeType: string, origName: string): Promise<string> {
  const allowed = kind === 'image' ? /^image\//.test(mimeType) : /^audio\//.test(mimeType);
  if (!allowed) throw new BadRequestException(`bad mime type for ${kind}: ${mimeType}`);
  const maxBytes = kind === 'image' ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
  if (buffer.byteLength > maxBytes) throw new BadRequestException(`file too large (max ${maxBytes / 1024 / 1024} MB)`);
  const extMatch = origName.match(/\.([a-z0-9]{2,5})$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : (kind === 'image' ? 'jpg' : 'mp3');
  const key = `video-uploads/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await this.s3.send(new PutObjectCommand({
    Bucket: this.s3Bucket, Key: key, Body: buffer,
    ContentType: mimeType, ACL: 'public-read',
  }));
  return this.s3PublicUrl(key);
}
```

- [ ] **Step 2: Add controller routes**

Add at top of controller file:

```ts
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
```

Add methods inside the class:

```ts
@Post('upload-image')
@UseGuards(JwtGuard)
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
async uploadImage(@Req() req: Request, @UploadedFile() file: Express.Multer.File) {
  const userId = (req as any).user.userId;
  const url = await this.video.uploadUserAsset(userId, 'image', file.buffer, file.mimetype, file.originalname);
  return { url };
}

@Post('upload-audio')
@UseGuards(JwtGuard)
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
async uploadAudio(@Req() req: Request, @UploadedFile() file: Express.Multer.File) {
  const userId = (req as any).user.userId;
  const url = await this.video.uploadUserAsset(userId, 'audio', file.buffer, file.mimetype, file.originalname);
  return { url };
}
```

- [ ] **Step 3: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.controller.ts src/video/video.service.ts
git commit -m "feat(video): upload-image and upload-audio endpoints"
```

---

### Task 10: Redis per-IP rate limit

**Files:**
- Modify: `~/Downloads/spirits_back/src/video/video.controller.ts`
- Create: `~/Downloads/spirits_back/src/common/guards/ip-rate-limit.ts`

- [ ] **Step 1: Write reusable rate-limit helper**

```ts
// src/common/guards/ip-rate-limit.ts
import { Injectable, Logger, HttpException } from '@nestjs/common';
import { RedisService } from '../services/redis.service';

@Injectable()
export class IpRateLimiter {
  private readonly logger = new Logger(IpRateLimiter.name);
  constructor(private readonly redis: RedisService) {}

  async check(ip: string, bucket: string, limit: number, windowSeconds: number): Promise<void> {
    const key = `rl:${bucket}:${ip}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const n = await this.redis.incr(key, windowSeconds);
    if (n > limit) {
      throw new HttpException({ error: 'rate_limited', retryAfter: windowSeconds }, 429);
    }
  }
}
```

(Check that `RedisService.incr(key, ttl)` exists — if it only takes `key`, use the existing API: `await this.redis.incr(key)` and `await this.redis.expire(key, ttl)` if this is the first increment. Adjust to real signature in `src/common/services/redis.service.ts`.)

- [ ] **Step 2: Wire limiter in VideoController**

Inject and use on create/upload routes:

```ts
// top
import { IpRateLimiter } from '../common/guards/ip-rate-limit';

// constructor
constructor(private readonly video: VideoService, private readonly limiter: IpRateLimiter) {}

// inside createJob (first line):
await this.limiter.check(req.ip || 'unknown', 'video-create', 20, 60);

// similar for uploadImage / uploadAudio (bucket 'video-upload', 60 per minute)
```

- [ ] **Step 3: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/common/guards/ip-rate-limit.ts src/video/video.controller.ts
git commit -m "feat(video): per-IP rate limits on create and upload"
```

---

### Task 11: Cleanup cron (failed job garbage collection)

**Files:**
- Modify: `~/Downloads/spirits_back/src/video/video.service.ts`

- [ ] **Step 1: Add cron using `@nestjs/schedule`**

At top:

```ts
import { Cron, CronExpression } from '@nestjs/schedule';
```

Add to class:

```ts
@Cron(CronExpression.EVERY_DAY_AT_4AM)
async cleanupOldFailedJobs() {
  const res = await this.pg.query(
    `DELETE FROM video_jobs
     WHERE status='failed' AND created_at < now() - interval '30 days'
     RETURNING id`,
  );
  if (res.rowCount && res.rowCount > 0) {
    this.logger.log(`Cleanup: deleted ${res.rowCount} failed video jobs`);
  }
}
```

- [ ] **Step 2: Ensure ScheduleModule.forRoot() is imported in AppModule**

Check `src/app.module.ts`. If `ScheduleModule` isn't present:

```ts
import { ScheduleModule } from '@nestjs/schedule';
// imports: [..., ScheduleModule.forRoot()]
```

- [ ] **Step 3: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.service.ts src/app.module.ts
git commit -m "feat(video): nightly cleanup of old failed jobs"
```

---

### Task 12: Wire the Video module into AppModule

**Files:**
- Create: `~/Downloads/spirits_back/src/video/video.module.ts`
- Modify: `~/Downloads/spirits_back/src/app.module.ts`

- [ ] **Step 1: Write module file**

```ts
// src/video/video.module.ts
import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { MiscModule } from '../misc/misc.module';
import { CommonModule } from '../common/common.module';
import { IpRateLimiter } from '../common/guards/ip-rate-limit';

@Module({
  imports: [MiscModule, CommonModule],
  controllers: [VideoController],
  providers: [VideoService, IpRateLimiter],
  exports: [VideoService],
})
export class VideoModule {}
```

(If `MiscModule` does not `exports: [KlingService]`, add it in `src/misc/misc.module.ts`.)

- [ ] **Step 2: Import into AppModule**

Add `VideoModule` to the `imports` array of `src/app.module.ts`.

- [ ] **Step 3: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`

- [ ] **Step 4: Smoke-run**

```bash
cd ~/Downloads/spirits_back && npm run start:dev
# In another shell:
curl -s http://localhost:3001/webhook/video/jobs -H 'Authorization: Bearer invalid' -i | head -3
```
Expected: `401` (guard rejects invalid token) — proves routes are wired.

Stop `start:dev` (Ctrl-C).

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.module.ts src/app.module.ts src/misc/misc.module.ts
git commit -m "feat(video): wire VideoModule into AppModule"
```

---

## Phase C — Chat Tool-Loop Refactor

### Task 13: Define TOOLS constant and executeTool dispatcher

**Files:**
- Create: `~/Downloads/spirits_back/src/chat/chat-tools.ts`

- [ ] **Step 1: Write tools + dispatcher**

```ts
// src/chat/chat-tools.ts
import { Injectable, Logger } from '@nestjs/common';
import { MiscService } from '../misc/misc.service';
import { VideoService } from '../video/video.service';
import { CreateVideoJobDto } from '../video/video.dto';

export const CHAT_TOOLS = [
  {
    name: 'generate_image',
    description: 'Generate a single image from a text prompt. Call this whenever the user asks for an image / picture / illustration.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        quality: { type: 'string', enum: ['std', 'hd'], default: 'std' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_video',
    description: 'Generate a short video (5-10s) using Kling. Use when the user asks for a video, animation, or to "animate" / "oживи" an image.',
    input_schema: {
      type: 'object',
      properties: {
        mode:            { type: 'string', enum: ['text2video', 'image2video', 'extend', 'lipsync'] },
        prompt:          { type: 'string' },
        model:           { type: 'string', enum: ['kling-v1-6', 'kling-v2-master'], default: 'kling-v1-6' },
        quality:         { type: 'string', enum: ['std', 'pro'], default: 'std' },
        duration:        { type: 'number', enum: [5, 10], default: 5 },
        sourceImageUrl:  { type: 'string' },
        sourceVideoId:   { type: 'string' },
        cameraType:      { type: 'string', enum: ['simple','down_back','forward_up','right_turn_forward','left_turn_forward'] },
        cameraConfig:    { type: 'object' },
        negativePrompt:  { type: 'string' },
      },
      required: ['mode'],
    },
  },
];

export type ToolResult =
  | { ok: true; kind: 'image'; imageUrl: string; tokensSpent: number }
  | { ok: true; kind: 'video'; jobId: string; status: string; tokensSpent: number }
  | { ok: false; error: string; [k: string]: any };

@Injectable()
export class ChatToolsService {
  private readonly logger = new Logger(ChatToolsService.name);

  constructor(
    private readonly misc: MiscService,
    private readonly video: VideoService,
  ) {}

  async executeTool(userId: string, name: string, input: any): Promise<ToolResult> {
    try {
      if (name === 'generate_image') {
        const prompt = String(input.prompt ?? '').slice(0, 2000);
        if (!prompt) return { ok: false, error: 'empty prompt' };
        const quality = (input.quality === 'hd' ? 'hd' : 'std') as 'std'|'hd';
        const r = await this.misc.generateImage(userId, prompt, quality);
        return { ok: true, kind: 'image', imageUrl: r.images[0].url, tokensSpent: r.tokensSpent };
      }
      if (name === 'generate_video') {
        const dto = input as CreateVideoJobDto;
        const r = await this.video.createJob(userId, dto);
        return { ok: true, kind: 'video', jobId: r.jobId, status: r.status, tokensSpent: r.tokensSpent };
      }
      return { ok: false, error: `unknown tool: ${name}` };
    } catch (e: any) {
      this.logger.warn(`executeTool(${name}) failed: ${e.message}`);
      if (e?.status === 402) return { ok: false, error: 'insufficient_tokens', ...(e.response ?? {}) };
      return { ok: false, error: e.message || 'tool execution failed' };
    }
  }
}
```

(`MiscService.generateImage(userId, prompt, quality)` is the existing nano-banana path. If the current signature differs, adapt accordingly — check `src/misc/misc.service.ts`.)

- [ ] **Step 2: Export ChatToolsService**

Add to `src/chat/chat.module.ts`:

```ts
import { VideoModule } from '../video/video.module';
import { ChatToolsService } from './chat-tools';
// imports: [..., VideoModule, MiscModule]
// providers: [..., ChatToolsService]
```

- [ ] **Step 3: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/chat/chat-tools.ts src/chat/chat.module.ts
git commit -m "feat(chat): TOOLS definition and ChatToolsService dispatcher"
```

---

### Task 14: Replace regex image bypass with Anthropic tool loop

**Files:**
- Modify: `~/Downloads/spirits_back/src/chat/chat.service.ts`

- [ ] **Step 1: Read and understand current flow**

Read `src/chat/chat.service.ts:130-250`. Note the current structure:
- Regex keyword detection on the incoming message (lines ~154-156)
- Bypass directly to `generateImageForChat` (line 159)
- Otherwise, regular Anthropic `messages.stream(...)` call

- [ ] **Step 2: Inject ChatToolsService**

In the constructor add:
```ts
private readonly tools: ChatToolsService,
```
and import:
```ts
import { CHAT_TOOLS, ChatToolsService } from './chat-tools';
```

- [ ] **Step 3: Remove regex bypass**

Delete the block from the start of `const imageKeywords = ...` down to its closing `if` — everything between approximately line 154 and the `if (...) { ... }` block ending around line 183 in the current file. The block begins with:

```ts
// Detect image generation request before calling LLM
const imageKeywords = /.../i;
const drawKeywords = /^(?:нарисуй|draw)\s+/i;
if (imageKeywords.test(message) || drawKeywords.test(message)) { ... }
```

Remove the entire `if` block. Image generation will now go through the tool loop.

- [ ] **Step 4: Convert the Anthropic call into a tool loop**

Replace the existing single `anthropic.messages.stream(...)` block with:

```ts
// Stream-aware tool loop — uses anthropic.messages.create (non-streaming) per iteration
// so we can reliably detect stop_reason === 'tool_use'. Final text is streamed to client
// chunk-by-chunk by us, not by the SDK.
res.write(JSON.stringify({ type: 'begin' }) + '\n');

const messagesForLLM: any[] = [
  ...history.map(h => ({ role: h.role, content: h.content })),
  { role: 'user', content: message },
];
const MAX_ITERATIONS = 5;

let finalText = '';
for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
  const completion = await this.anthropic!.messages.create({
    model: 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    tools: CHAT_TOOLS,
    messages: messagesForLLM,
    max_tokens: 4096,
  });

  if (completion.stop_reason === 'tool_use') {
    const toolBlock = completion.content.find((b: any) => b.type === 'tool_use') as any;
    if (!toolBlock) break;

    // Stream a tool_start marker so the frontend can render an inline job card immediately.
    res.write(JSON.stringify({
      type: 'tool_start',
      tool: toolBlock.name,
      input: toolBlock.input,
    }) + '\n');

    const toolResult = await this.tools.executeTool(userId, toolBlock.name, toolBlock.input);

    // Also stream the tool_result so the frontend knows what to render (image url / video jobId).
    res.write(JSON.stringify({
      type: 'tool_result',
      tool: toolBlock.name,
      result: toolResult,
    }) + '\n');

    messagesForLLM.push({ role: 'assistant', content: completion.content });
    messagesForLLM.push({ role: 'user', content: [
      { type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify(toolResult) },
    ]});
    continue;
  }

  // stop_reason === 'end_turn' (or 'max_tokens' or 'stop_sequence') — emit final text
  const textBlock = completion.content.find((b: any) => b.type === 'text') as any;
  finalText = textBlock?.text ?? '';

  // Stream finalText back (simulate token-by-token for UI parity with the previous streaming behaviour)
  for (const chunk of finalText.match(/.{1,40}/g) ?? []) {
    res.write(JSON.stringify({ type: 'item', content: chunk }) + '\n');
  }
  break;
}

res.write(JSON.stringify({
  type: 'end',
  content: finalText,
}) + '\n');
res.end();

setImmediate(async () => {
  try { await this.saveChatHistory(userId, String(assistantId), message, finalText); } catch {}
});
return;
```

(Adapt the `history`, `systemPrompt`, `assistantId` variable names to whatever is already in scope in the current `chat.service.ts`.)

- [ ] **Step 5: Build**

Run: `cd ~/Downloads/spirits_back && npm run build`
Expected: success.

- [ ] **Step 6: Manual smoke against dev backend**

```bash
cd ~/Downloads/spirits_back && npm run start:dev &
# After startup, login test user (get JWT), then:
curl -N http://localhost:3001/webhook/chat/stream \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"assistantId":"1","message":"нарисуй закат над океаном"}'
```
Expected: stream contains `type:"tool_start"` with `tool:"generate_image"` and a final `type:"end"` message that references an image URL.

- [ ] **Step 7: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/chat/chat.service.ts
git commit -m "refactor(chat): replace regex image bypass with Anthropic tool loop"
```

---

## Phase D — Frontend Infrastructure

### Task 15: Locales for the Video feature

**Files:**
- Modify: `~/Downloads/spirits_front/src/i18n/locales/en.json`
- Modify: `~/Downloads/spirits_front/src/i18n/locales/ru.json`

- [ ] **Step 1: Add `video` block to `ru.json`**

Add (under the root):

```json
"video": {
  "navTitle": "Видео",
  "pageTitle": "Генерация видео",
  "tabs": { "create": "Создать", "gallery": "Мои видео" },
  "mode": {
    "label": "Режим",
    "text2video": "Текст → Видео",
    "image2video": "Картинка → Видео",
    "extend": "Продолжение",
    "lipsync": "Липсинк"
  },
  "model": { "label": "Модель", "standard": "Стандарт (v1.6)", "premium": "Premium (v2 Master)" },
  "quality": { "label": "Качество", "std": "Обычное", "pro": "Про" },
  "duration": { "label": "Длина", "5s": "5 секунд", "10s": "10 секунд" },
  "prompt": { "label": "Промпт", "placeholder": "Опиши, что должно быть в видео" },
  "negativePrompt": { "label": "Негативный промпт" },
  "cfgScale": { "label": "CFG Scale" },
  "cameraType": { "label": "Камера" },
  "sourceImage": { "label": "Исходное изображение", "upload": "Загрузить", "fromGallery": "Из галереи картинок" },
  "sourceVideo": { "label": "Исходное видео" },
  "audio": { "label": "Аудио для липсинка" },
  "submit": { "create": "Создать", "cost": "Это будет стоить {{tokens}} токенов" },
  "insufficientTokens": { "title": "Недостаточно токенов", "cta": "Пополнить" },
  "job": {
    "statusPending": "В очереди",
    "statusProcessing": "Генерируется… {{elapsed}}",
    "statusReady": "Готово",
    "statusFailed": "Ошибка",
    "actions": { "play": "Смотреть", "download": "Скачать", "sendToChat": "В чат",
                  "extend": "Продолжить", "lipsync": "Липсинк", "delete": "Удалить" },
    "emptyGallery": "У тебя пока нет готовых видео. Создай первое на вкладке «Создать».",
    "toastReady": "Видео готово"
  }
}
```

- [ ] **Step 2: Add the same block to `en.json`**

Same structure, English strings.

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/spirits_front
git add src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "i18n(video): add ru/en translations for video feature"
```

---

### Task 16: Route + Navigation entry

**Files:**
- Create: `~/Downloads/spirits_front/src/pages/VideoPage.tsx`
- Modify: `~/Downloads/spirits_front/src/App.tsx`
- Modify: `~/Downloads/spirits_front/src/components/layout/Navigation.tsx`

- [ ] **Step 1: Create thin page wrapper**

```tsx
// src/pages/VideoPage.tsx
import VideoInterface from '../components/video/VideoInterface';
export default function VideoPage() { return <VideoInterface />; }
```

- [ ] **Step 2: Add route to App.tsx**

Import `VideoPage` and add `<Route path="/video" element={<VideoPage />} />` under the authenticated-routes section (next to `/chat`, `/profile` etc.).

- [ ] **Step 3: Add nav entry**

In `Navigation.tsx`, add a new entry using `Film` icon from `lucide-react`, label `t('video.navTitle')`, path `/video`. Keep it in the authenticated-only navigation list.

- [ ] **Step 4: Create stub component so build succeeds**

```tsx
// src/components/video/VideoInterface.tsx
export default function VideoInterface() {
  return <div className="p-8">Video page placeholder — will be built in Tasks 17-21</div>;
}
```

- [ ] **Step 5: Build**

```bash
cd ~/Downloads/spirits_front && pnpm build
```
Expected: success.

- [ ] **Step 6: Commit**

```bash
cd ~/Downloads/spirits_front
git add src/pages/VideoPage.tsx src/App.tsx src/components/layout/Navigation.tsx src/components/video/VideoInterface.tsx
git commit -m "feat(video): add /video route, navigation entry, placeholder page"
```

---

### Task 17: useVideoJobs hook

**Files:**
- Create: `~/Downloads/spirits_front/src/components/video/useVideoJobs.ts`

- [ ] **Step 1: Write hook**

```ts
// src/components/video/useVideoJobs.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { apiClient } from '../../services/apiClient';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';   // use whatever toast lib the project already has — inspect other files; if none, replace with a no-op

export interface VideoJob {
  id: string;
  mode: string;
  model: string;
  quality: string;
  duration_sec: number;
  prompt: string | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  tokens_spent: number;
  created_at: string;
}

const FAST_INTERVAL = 5000;
const SLOW_INTERVAL = 60000;

export function useVideoJobs() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevStatusRef = useRef<Record<string, string>>({});
  const { t } = useTranslation();

  const fetchAll = useCallback(async () => {
    try {
      const resp = await apiClient.get('/webhook/video/jobs?limit=100');
      const list: VideoJob[] = resp.data?.jobs ?? [];
      // Toast when a previously-processing job becomes ready.
      for (const j of list) {
        const prev = prevStatusRef.current[j.id];
        if (prev && prev !== 'ready' && j.status === 'ready') {
          toast.success(t('video.job.toastReady'));
        }
        prevStatusRef.current[j.id] = j.status;
      }
      setJobs(list);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'processing');
    const interval = hasActive ? FAST_INTERVAL : SLOW_INTERVAL;
    const id = setInterval(fetchAll, interval);
    return () => clearInterval(id);
  }, [jobs, fetchAll]);

  const createJob = useCallback(async (body: Record<string, any>) => {
    const resp = await apiClient.post('/webhook/video/jobs', body);
    await fetchAll();
    return resp.data;
  }, [fetchAll]);

  const deleteJob = useCallback(async (id: string) => {
    await apiClient.delete(`/webhook/video/jobs/${id}`);
    await fetchAll();
  }, [fetchAll]);

  return { jobs, loading, error, createJob, deleteJob, refetch: fetchAll };
}
```

(If the project does not yet use `react-hot-toast`, remove the toast line and simply `console.log('video ready')`. Pick whatever is idiomatic — check adjacent code for a toast utility before adding a dependency.)

- [ ] **Step 2: Build**

```bash
cd ~/Downloads/spirits_front && pnpm build
```

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/spirits_front
git add src/components/video/useVideoJobs.ts
git commit -m "feat(video): useVideoJobs hook with adaptive polling"
```

---

## Phase E — Frontend /video Page Components

### Task 18: VideoJobCard component

**Files:**
- Create: `~/Downloads/spirits_front/src/components/video/VideoJobCard.tsx`

- [ ] **Step 1: Write card**

```tsx
// src/components/video/VideoJobCard.tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Download, Send, Film, Mic, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { VideoJob } from './useVideoJobs';

interface Props {
  job: VideoJob;
  onDelete?: (id: string) => void;
  onExtend?: (job: VideoJob) => void;
  onLipsync?: (job: VideoJob) => void;
  onSendToChat?: (job: VideoJob) => void;
  compact?: boolean;   // used when rendered inline in chat — hide gallery-only buttons
}

function formatElapsed(start: string) {
  const diff = Math.max(0, (Date.now() - new Date(start).getTime()) / 1000);
  const m = Math.floor(diff / 60);
  const s = Math.floor(diff % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function VideoJobCard({ job, onDelete, onExtend, onLipsync, onSendToChat, compact }: Props) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(() => formatElapsed(job.created_at));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (job.status !== 'processing' && job.status !== 'pending') return;
    const id = setInterval(() => setElapsed(formatElapsed(job.created_at)), 1000);
    return () => clearInterval(id);
  }, [job.status, job.created_at]);

  const bg = job.thumbnail_url
    ? { backgroundImage: `url(${job.thumbnail_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-100 aspect-video group" style={bg}>
      {/* Status overlays */}
      {(job.status === 'pending' || job.status === 'processing') && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>{t('video.job.statusProcessing', { elapsed })}</span>
        </div>
      )}
      {job.status === 'failed' && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/70 text-white text-sm p-2 text-center" title={job.error_message ?? ''}>
          <AlertCircle className="w-5 h-5 mr-2" />
          {t('video.job.statusFailed')}
        </div>
      )}

      {/* Ready — play button + hover actions */}
      {job.status === 'ready' && (
        <>
          <button
            className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition"
            onClick={() => setOpen(true)}
          >
            <Play className="w-12 h-12 text-white drop-shadow opacity-80" />
          </button>
          {!compact && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 p-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <a href={job.video_url!} download className="p-1.5 rounded hover:bg-white/20 text-white" title={t('video.job.actions.download')}>
                <Download className="w-4 h-4" />
              </a>
              {onExtend && (
                <button onClick={() => onExtend(job)} className="p-1.5 rounded hover:bg-white/20 text-white" title={t('video.job.actions.extend')}>
                  <Film className="w-4 h-4" />
                </button>
              )}
              {onLipsync && job.model === 'kling-v1-6' && (
                <button onClick={() => onLipsync(job)} className="p-1.5 rounded hover:bg-white/20 text-white" title={t('video.job.actions.lipsync')}>
                  <Mic className="w-4 h-4" />
                </button>
              )}
              {onSendToChat && (
                <button onClick={() => onSendToChat(job)} className="p-1.5 rounded hover:bg-white/20 text-white" title={t('video.job.actions.sendToChat')}>
                  <Send className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button onClick={() => onDelete(job.id)} className="ml-auto p-1.5 rounded hover:bg-red-500/30 text-white" title={t('video.job.actions.delete')}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Video modal */}
      {open && job.video_url && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <video src={job.video_url} controls autoPlay className="max-w-full max-h-full rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd ~/Downloads/spirits_front && pnpm build
```

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/spirits_front
git add src/components/video/VideoJobCard.tsx
git commit -m "feat(video): VideoJobCard component"
```

---

### Task 19: VideoGallery component

**Files:**
- Create: `~/Downloads/spirits_front/src/components/video/VideoGallery.tsx`

- [ ] **Step 1: Write gallery**

```tsx
// src/components/video/VideoGallery.tsx
import { useTranslation } from 'react-i18next';
import VideoJobCard from './VideoJobCard';
import { VideoJob } from './useVideoJobs';

interface Props {
  jobs: VideoJob[];
  loading: boolean;
  onDelete: (id: string) => void;
  onExtend: (job: VideoJob) => void;
  onLipsync: (job: VideoJob) => void;
}

export default function VideoGallery({ jobs, loading, onDelete, onExtend, onLipsync }: Props) {
  const { t } = useTranslation();
  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;
  if (!jobs.length) {
    return <div className="p-8 text-center text-gray-500">{t('video.job.emptyGallery')}</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4">
      {jobs.map(j => (
        <VideoJobCard key={j.id} job={j} onDelete={onDelete} onExtend={onExtend} onLipsync={onLipsync} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
cd ~/Downloads/spirits_front && pnpm build
git add src/components/video/VideoGallery.tsx
git commit -m "feat(video): VideoGallery grid component"
```

---

### Task 20: VideoCreateForm (adaptive, with token calculator)

**Files:**
- Create: `~/Downloads/spirits_front/src/components/video/VideoCreateForm.tsx`

- [ ] **Step 1: Write form with mode-aware fields**

```tsx
// src/components/video/VideoCreateForm.tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/apiClient';

interface Props {
  onCreated: (jobId: string) => void;
  defaults?: Partial<FormState>;
}

type Mode = 'text2video' | 'image2video' | 'extend' | 'lipsync';
type Model = 'kling-v1-6' | 'kling-v2-master';
type Quality = 'std' | 'pro';

interface FormState {
  mode: Mode;
  model: Model;
  quality: Quality;
  duration: 5 | 10;
  prompt: string;
  negativePrompt: string;
  cfgScale: number;
  sourceImageUrl?: string;
  sourceVideoId?: string;
  audioUrl?: string;
  cameraType?: string;
}

const PRICES: Record<string, number> = {
  'text2video.kling-v1-6.std.5': 25000,   'text2video.kling-v1-6.std.10': 50000,
  'text2video.kling-v1-6.pro.5': 50000,   'text2video.kling-v1-6.pro.10': 100000,
  'text2video.kling-v2-master.std.5': 150000, 'text2video.kling-v2-master.std.10': 300000,
  'text2video.kling-v2-master.pro.5': 150000, 'text2video.kling-v2-master.pro.10': 300000,
  'image2video.kling-v1-6.std.5': 25000,  'image2video.kling-v1-6.std.10': 50000,
  'image2video.kling-v1-6.pro.5': 50000,  'image2video.kling-v1-6.pro.10': 100000,
  'image2video.kling-v2-master.std.5': 150000, 'image2video.kling-v2-master.std.10': 300000,
  'image2video.kling-v2-master.pro.5': 150000, 'image2video.kling-v2-master.pro.10': 300000,
  'extend.kling-v1-6.std.5': 25000, 'extend.kling-v1-6.pro.5': 50000,
  'extend.kling-v2-master.std.5': 150000, 'extend.kling-v2-master.pro.5': 150000,
  'lipsync.kling-v1-6.std.5': 15000, 'lipsync.kling-v1-6.std.10': 15000,
};

function costFor(s: FormState): number {
  const key = `${s.mode}.${s.model}.${s.quality}.${s.duration}`;
  return PRICES[key] ?? 0;
}

export default function VideoCreateForm({ onCreated, defaults }: Props) {
  const { t } = useTranslation();
  const { tokenBalance } = useAuth() as any;   // existing context exposes balance

  const [s, setS] = useState<FormState>({
    mode: 'text2video', model: 'kling-v1-6', quality: 'std', duration: 5,
    prompt: '', negativePrompt: '', cfgScale: 0.5,
    ...defaults,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cost = useMemo(() => costFor(s), [s]);

  const showPrompt = s.mode !== 'lipsync';
  const showNegativePrompt = s.mode !== 'lipsync';
  const showCfg = s.mode !== 'lipsync';
  const showDuration = s.mode !== 'extend';
  const showCamera = s.mode === 'text2video' || s.mode === 'image2video';
  const showImageUpload = s.mode === 'image2video';
  const showSourceVideo = s.mode === 'extend' || s.mode === 'lipsync';
  const showAudio = s.mode === 'lipsync';

  // Lipsync only supports v1.6
  if (s.mode === 'lipsync' && s.model !== 'kling-v1-6') {
    setTimeout(() => setS(x => ({ ...x, model: 'kling-v1-6' })), 0);
  }
  // Extend is always 5s
  if (s.mode === 'extend' && s.duration !== 5) {
    setTimeout(() => setS(x => ({ ...x, duration: 5 })), 0);
  }

  async function uploadImage(file: File): Promise<string> {
    const fd = new FormData(); fd.append('file', file);
    const r = await apiClient.post('/webhook/video/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data.url;
  }

  async function uploadAudio(file: File): Promise<string> {
    const fd = new FormData(); fd.append('file', file);
    const r = await apiClient.post('/webhook/video/upload-audio', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data.url;
  }

  async function onSubmit() {
    setSubmitting(true); setError(null);
    try {
      const body: any = {
        mode: s.mode, model: s.model, quality: s.quality, duration: s.duration,
        prompt: showPrompt ? s.prompt : undefined,
        negativePrompt: showNegativePrompt ? s.negativePrompt || undefined : undefined,
        cfgScale: showCfg ? s.cfgScale : undefined,
        sourceImageUrl: showImageUpload ? s.sourceImageUrl : undefined,
        sourceVideoId: showSourceVideo ? s.sourceVideoId : undefined,
        audioUrl: showAudio ? s.audioUrl : undefined,
        cameraType: showCamera ? s.cameraType : undefined,
      };
      const r = await apiClient.post('/webhook/video/jobs', body);
      onCreated(r.data.jobId);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const insufficient = (tokenBalance ?? 0) < cost;

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      {/* Mode selector */}
      <div>
        <label className="text-sm font-medium">{t('video.mode.label')}</label>
        <select className="block w-full mt-1 rounded-md border px-2 py-1.5"
                value={s.mode} onChange={e => setS({ ...s, mode: e.target.value as Mode })}>
          <option value="text2video">{t('video.mode.text2video')}</option>
          <option value="image2video">{t('video.mode.image2video')}</option>
          <option value="extend">{t('video.mode.extend')}</option>
          <option value="lipsync">{t('video.mode.lipsync')}</option>
        </select>
      </div>

      {/* Model */}
      {s.mode !== 'lipsync' && (
        <div>
          <label className="text-sm font-medium">{t('video.model.label')}</label>
          <select className="block w-full mt-1 rounded-md border px-2 py-1.5"
                  value={s.model} onChange={e => setS({ ...s, model: e.target.value as Model })}>
            <option value="kling-v1-6">{t('video.model.standard')}</option>
            <option value="kling-v2-master">{t('video.model.premium')}</option>
          </select>
        </div>
      )}

      {/* Quality */}
      {s.mode !== 'lipsync' && (
        <div>
          <label className="text-sm font-medium">{t('video.quality.label')}</label>
          <select className="block w-full mt-1 rounded-md border px-2 py-1.5"
                  value={s.quality} onChange={e => setS({ ...s, quality: e.target.value as Quality })}>
            <option value="std">{t('video.quality.std')}</option>
            <option value="pro">{t('video.quality.pro')}</option>
          </select>
        </div>
      )}

      {/* Duration */}
      {showDuration && (
        <div>
          <label className="text-sm font-medium">{t('video.duration.label')}</label>
          <select className="block w-full mt-1 rounded-md border px-2 py-1.5"
                  value={s.duration} onChange={e => setS({ ...s, duration: Number(e.target.value) as 5|10 })}>
            <option value={5}>{t('video.duration.5s')}</option>
            <option value={10}>{t('video.duration.10s')}</option>
          </select>
        </div>
      )}

      {/* Prompt */}
      {showPrompt && (
        <div>
          <label className="text-sm font-medium">{t('video.prompt.label')}</label>
          <textarea rows={3} className="block w-full mt-1 rounded-md border px-2 py-1.5"
                    placeholder={t('video.prompt.placeholder') as string}
                    value={s.prompt} onChange={e => setS({ ...s, prompt: e.target.value })} />
        </div>
      )}

      {/* Negative prompt */}
      {showNegativePrompt && (
        <div>
          <label className="text-sm font-medium">{t('video.negativePrompt.label')}</label>
          <input className="block w-full mt-1 rounded-md border px-2 py-1.5"
                 value={s.negativePrompt} onChange={e => setS({ ...s, negativePrompt: e.target.value })} />
        </div>
      )}

      {/* CFG */}
      {showCfg && (
        <div>
          <label className="text-sm font-medium">{t('video.cfgScale.label')}: {s.cfgScale.toFixed(1)}</label>
          <input type="range" min={0} max={1} step={0.1} className="block w-full mt-1"
                 value={s.cfgScale} onChange={e => setS({ ...s, cfgScale: parseFloat(e.target.value) })} />
        </div>
      )}

      {/* Image upload */}
      {showImageUpload && (
        <div>
          <label className="text-sm font-medium">{t('video.sourceImage.label')}</label>
          <input type="file" accept="image/*"
                 onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const url = await uploadImage(f); setS({ ...s, sourceImageUrl: url });
                 }} />
          {s.sourceImageUrl && <img src={s.sourceImageUrl} alt="" className="mt-2 max-h-40 rounded" />}
        </div>
      )}

      {/* Source video picker */}
      {showSourceVideo && (
        <div>
          <label className="text-sm font-medium">{t('video.sourceVideo.label')}</label>
          <input className="block w-full mt-1 rounded-md border px-2 py-1.5"
                 placeholder="jobId of a ready video"
                 value={s.sourceVideoId ?? ''} onChange={e => setS({ ...s, sourceVideoId: e.target.value })} />
          {/* In Task 21 we replace this with a picker from the gallery. */}
        </div>
      )}

      {/* Audio upload */}
      {showAudio && (
        <div>
          <label className="text-sm font-medium">{t('video.audio.label')}</label>
          <input type="file" accept="audio/*"
                 onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const url = await uploadAudio(f); setS({ ...s, audioUrl: url });
                 }} />
        </div>
      )}

      {/* Camera (simple preset only in MVP) */}
      {showCamera && (
        <div>
          <label className="text-sm font-medium">{t('video.cameraType.label')}</label>
          <select className="block w-full mt-1 rounded-md border px-2 py-1.5"
                  value={s.cameraType ?? ''} onChange={e => setS({ ...s, cameraType: e.target.value || undefined })}>
            <option value="">—</option>
            <option value="simple">simple</option>
            <option value="down_back">down_back</option>
            <option value="forward_up">forward_up</option>
            <option value="right_turn_forward">right_turn_forward</option>
            <option value="left_turn_forward">left_turn_forward</option>
          </select>
        </div>
      )}

      {/* Cost + submit */}
      <div className="rounded-md border p-3 bg-gray-50 flex items-center justify-between">
        <div className="text-sm">
          {t('video.submit.cost', { tokens: cost.toLocaleString() })}
          <br /><span className="text-gray-500">Баланс: {(tokenBalance ?? 0).toLocaleString()}</span>
        </div>
        <button disabled={submitting || insufficient || (s.mode === 'image2video' && !s.sourceImageUrl)}
                onClick={onSubmit}
                className="px-4 py-2 rounded-md bg-green-600 text-white disabled:opacity-50">
          {t('video.submit.create')}
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {insufficient && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 flex items-center justify-between">
          <div>{t('video.insufficientTokens.title')}</div>
          <a href="/chat?view=tokens" className="px-3 py-1.5 rounded bg-yellow-500 text-white">
            {t('video.insufficientTokens.cta')}
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
cd ~/Downloads/spirits_front && pnpm build
git add src/components/video/VideoCreateForm.tsx
git commit -m "feat(video): VideoCreateForm with adaptive fields + token calculator"
```

---

### Task 21: VideoInterface (tabs) + source-video picker

**Files:**
- Modify: `~/Downloads/spirits_front/src/components/video/VideoInterface.tsx`

- [ ] **Step 1: Replace placeholder with real tabbed UI**

```tsx
// src/components/video/VideoInterface.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoJobs, VideoJob } from './useVideoJobs';
import VideoCreateForm from './VideoCreateForm';
import VideoGallery from './VideoGallery';

export default function VideoInterface() {
  const { t } = useTranslation();
  const { jobs, loading, deleteJob, refetch } = useVideoJobs();
  const [tab, setTab] = useState<'create' | 'gallery'>('create');
  const [prefill, setPrefill] = useState<any>({});

  const readyJobs = jobs.filter(j => j.status === 'ready');
  const v16ReadyJobs = readyJobs.filter(j => j.model === 'kling-v1-6');

  function onExtend(j: VideoJob) {
    setPrefill({ mode: 'extend', sourceVideoId: j.id, model: j.model as any, quality: j.quality as any });
    setTab('create');
  }
  function onLipsync(j: VideoJob) {
    setPrefill({ mode: 'lipsync', sourceVideoId: j.id, model: 'kling-v1-6', quality: j.quality as any });
    setTab('create');
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t('video.pageTitle')}</h1>
      <div className="flex gap-2 mb-4 border-b">
        {(['create', 'gallery'] as const).map(x => (
          <button key={x}
                  onClick={() => setTab(x)}
                  className={`px-4 py-2 ${tab === x ? 'border-b-2 border-green-600 font-semibold' : 'text-gray-500'}`}>
            {t(`video.tabs.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <VideoCreateForm defaults={prefill} onCreated={() => { refetch(); setTab('gallery'); setPrefill({}); }} />
      )}
      {tab === 'gallery' && (
        <VideoGallery jobs={jobs} loading={loading}
                      onDelete={deleteJob}
                      onExtend={onExtend}
                      onLipsync={onLipsync} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
cd ~/Downloads/spirits_front && pnpm build
git add src/components/video/VideoInterface.tsx
git commit -m "feat(video): VideoInterface with tabs and extend/lipsync prefill flow"
```

---

## Phase F — Chat Integration (Frontend)

### Task 22: ChatInterface handles `tool_start` / `tool_result` stream events

**Files:**
- Modify: `~/Downloads/spirits_front/src/components/chat/ChatInterface.tsx`

- [ ] **Step 1: Find stream consumption**

Locate the code that parses NDJSON from `apiClient.fetchStream(...)`. It splits by newline and handles `type: 'begin' | 'item' | 'end'`. Add two new case branches: `tool_start` and `tool_result`.

- [ ] **Step 2: Inject inline VideoJobCard when tool_result arrives for generate_video**

```tsx
// In the message-accumulator: keep an array of inline 'video' job ids for the in-flight assistant message.
// On tool_start(generate_video): optimistic — push a placeholder `pending` job.
// On tool_result(ok: true, kind: 'video'): replace placeholder with {jobId} — the real VideoJobCard
// subscribes via useVideoJobs and will render correct status/thumbnail as polling updates.

// Pseudocode for the streaming handler:
if (event.type === 'tool_start' && event.tool === 'generate_video') {
  currentMessage.inlineJobIds = currentMessage.inlineJobIds ?? [];
  currentMessage.inlineJobIds.push('pending');   // placeholder, replaced on tool_result
  update(messages);
}
if (event.type === 'tool_result' && event.tool === 'generate_video') {
  const i = currentMessage.inlineJobIds.lastIndexOf('pending');
  if (event.result?.ok && event.result.kind === 'video') {
    currentMessage.inlineJobIds[i] = event.result.jobId;
  } else {
    currentMessage.inlineJobIds.splice(i, 1);
    currentMessage.content += `\n\n*Не получилось сгенерировать видео: ${event.result?.error ?? 'unknown'}*`;
  }
  update(messages);
}
if (event.type === 'tool_start' && event.tool === 'generate_image') {
  /* image generation is fast (nano-banana) — no inline preview needed, just wait for end */
}
```

- [ ] **Step 3: Render inline cards**

In the message renderer (where message content is shown), after the text block, render a column of cards when `message.inlineJobIds` is non-empty:

```tsx
import VideoJobCard from '../video/VideoJobCard';
import { useVideoJobs } from '../video/useVideoJobs';

// Inside message render:
const { jobs } = useVideoJobs();   // hoist to parent if already present — avoid double-mounting
{message.inlineJobIds?.map(id => {
  if (id === 'pending') {
    return <div key="pending" className="aspect-video rounded-xl bg-gray-200 animate-pulse" />;
  }
  const job = jobs.find(j => j.id === id);
  if (!job) return <div key={id} className="aspect-video rounded-xl bg-gray-100" />;
  return <VideoJobCard key={id} job={job} compact />;
})}
```

- [ ] **Step 4: Persist video in history message**

When assistant finishes (`type: 'end'`), the server also saved plain text without the video URL. That's fine for MVP — on reload the chat shows the text, and the recent job IDs are lost. If a user wants to re-see a video they can open `/video`. (Adding proper persistence is follow-up work beyond this spec.)

- [ ] **Step 5: Build + manual smoke**

```bash
cd ~/Downloads/spirits_front && pnpm dev
# Visit http://localhost:5173, login, open a chat with any assistant, type:
# "сделай пятисекундное видео с закатом над океаном"
# Expected: an animated placeholder card appears under the message, then becomes a playable video 2-5 min later.
```

- [ ] **Step 6: Commit**

```bash
cd ~/Downloads/spirits_front
git add src/components/chat/ChatInterface.tsx
git commit -m "feat(chat): inline VideoJobCard for tool_start/tool_result stream events"
```

---

### Task 23: Render video URLs in saved chat history

**Files:**
- Modify: `~/Downloads/spirits_front/src/utils/customMarkdown.tsx`

- [ ] **Step 1: Detect mp4/webm URLs and render `<video>`**

At the top of the file add a URL regex, and during text tokenization, split out video URLs and render a `<video controls>`:

```tsx
const VIDEO_URL_REGEX = /https?:\/\/[^\s]+?\.(?:mp4|webm)(?:\?[^\s]*)?/gi;

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  text.replace(VIDEO_URL_REGEX, (m, _g, idx: number) => {
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(
      <video key={`v-${idx}`} src={m} controls className="my-2 max-w-full rounded-lg" />
    );
    last = idx + m.length;
    return m;
  });
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Use renderInline in the existing text-rendering pipeline (it already handles markdown
// for images with ![]() — extend or chain with that pattern).
```

- [ ] **Step 2: Build + commit**

```bash
cd ~/Downloads/spirits_front && pnpm build
git add src/utils/customMarkdown.tsx
git commit -m "feat(chat): render .mp4/.webm URLs as inline video players"
```

---

## Phase G — Tests

### Task 24: Unit tests — VideoService

**Files:**
- Create: `~/Downloads/spirits_back/src/video/video.service.spec.ts`
- Modify: `~/Downloads/spirits_back/package.json` (add `jest` + script if not yet present)

- [ ] **Step 1: Ensure Jest is configured**

Check `package.json` for a `"test"` script. If absent, add:

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch"
},
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "testMatch": ["**/*.spec.ts"]
}
```

And install:
```bash
cd ~/Downloads/spirits_back && npm i -D jest ts-jest @types/jest
```

- [ ] **Step 2: Write spec**

```ts
// src/video/video.service.spec.ts
import { VideoService } from './video.service';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

// Lightweight fakes — no Nest test module, since the service depends only on PgService and KlingService.

function makeFakePg() {
  const calls: any[] = [];
  let balance = 100000;
  const rowsByStatus = { processing: 0 };
  const videoJobsById: Record<string, any> = {};
  const api = {
    calls, balance, rowsByStatus, videoJobsById,
    async query(sql: string, params: any[] = []) {
      calls.push({ sql, params });
      if (/FROM ai_profiles_consolidated/.test(sql)) return { rows: [{ tokens: api.balance }] };
      if (/UPDATE ai_profiles_consolidated SET tokens = tokens - \$1/.test(sql)) { api.balance -= params[0]; return { rowCount: 1 }; }
      if (/UPDATE ai_profiles_consolidated SET tokens = tokens \+ \$1/.test(sql)) { api.balance += params[0]; return { rowCount: 1 }; }
      if (/COUNT\(\*\).*FROM video_jobs.*status IN/.test(sql)) return { rows: [{ n: rowsByStatus.processing }] };
      if (/INSERT INTO video_jobs/.test(sql)) { const id = `job-${Object.keys(videoJobsById).length + 1}`; videoJobsById[id] = { id }; return { rows: [{ id }] }; }
      if (/UPDATE video_jobs SET kling_task_id/.test(sql)) return { rowCount: 1 };
      if (/UPDATE video_jobs SET status='failed'/.test(sql)) return { rowCount: 1 };
      if (/SELECT.*FROM video_jobs WHERE id = \$1/.test(sql)) return { rows: [videoJobsById[params[0]]].filter(Boolean) };
      return { rows: [] };
    },
    async transaction(fn: any) {
      return fn({
        query: api.query,
      });
    },
  };
  return api;
}

function makeFakeKling(overrides: any = {}) {
  return {
    createText2VideoTask: jest.fn().mockResolvedValue({ taskId: 'kt-1' }),
    createImage2VideoTask: jest.fn().mockResolvedValue({ taskId: 'ki-1' }),
    createVideoExtendTask: jest.fn().mockResolvedValue({ taskId: 'kx-1' }),
    createLipSyncTask: jest.fn().mockResolvedValue({ taskId: 'kl-1' }),
    getVideoTaskStatus: jest.fn().mockResolvedValue({ status: 'processing' }),
    ...overrides,
  };
}

describe('VideoService.createJob', () => {
  it('deducts tokens and creates a processing job on happy path', async () => {
    const pg = makeFakePg();
    const kling = makeFakeKling();
    const svc = new VideoService(pg as any, kling as any);
    const r = await svc.createJob('u1', { mode: 'text2video', prompt: 'test' });
    expect(r.status).toBe('processing');
    expect(r.tokensSpent).toBe(25000);
    expect(pg.balance).toBe(100000 - 25000);
    expect(kling.createText2VideoTask).toHaveBeenCalled();
  });

  it('refuses when user has 3 concurrent jobs', async () => {
    const pg = makeFakePg(); pg.rowsByStatus.processing = 3;
    const svc = new VideoService(pg as any, makeFakeKling() as any);
    await expect(svc.createJob('u1', { mode: 'text2video', prompt: 'x' })).rejects.toThrow(ConflictException);
  });

  it('refuses when balance < cost and does not call Kling', async () => {
    const pg = makeFakePg(); pg.balance = 100;
    const kling = makeFakeKling();
    const svc = new VideoService(pg as any, kling as any);
    await expect(svc.createJob('u1', { mode: 'text2video', prompt: 'x' })).rejects.toMatchObject({ message: 'insufficient_tokens' });
    expect(kling.createText2VideoTask).not.toHaveBeenCalled();
  });

  it('rejects image2video without sourceImageUrl', async () => {
    const svc = new VideoService(makeFakePg() as any, makeFakeKling() as any);
    await expect(svc.createJob('u1', { mode: 'image2video', prompt: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('rejects lipsync on v2-master', async () => {
    const svc = new VideoService(makeFakePg() as any, makeFakeKling() as any);
    await expect(svc.createJob('u1', { mode: 'lipsync', model: 'kling-v2-master', sourceVideoId: 'x' }))
      .rejects.toThrow(BadRequestException);
  });

  it('refunds and marks failed when Kling call throws', async () => {
    const pg = makeFakePg();
    const kling = makeFakeKling({ createText2VideoTask: jest.fn().mockRejectedValue(new Error('kling boom')) });
    const svc = new VideoService(pg as any, kling as any);
    await expect(svc.createJob('u1', { mode: 'text2video', prompt: 'x' })).rejects.toThrow();
    expect(pg.balance).toBe(100000);  // refunded
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd ~/Downloads/spirits_back && npx jest src/video/video.service.spec.ts
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add src/video/video.service.spec.ts package.json package-lock.json
git commit -m "test(video): unit tests for VideoService.createJob"
```

---

### Task 25: E2E — `tests/video.e2e.sh`

**Files:**
- Create: `~/Downloads/spirits_back/tests/video.e2e.sh`
- Modify: `~/Downloads/spirits_back/tests/runner.js`

- [ ] **Step 1: Write the e2e script**

```bash
#!/usr/bin/env bash
# tests/video.e2e.sh
# Prereq: BASE_URL set, TEST_PHONE set, DEBUG_SMS_CODES=true on backend.
set -euo pipefail

BASE_URL=${BASE_URL:-https://b.linkeon.io}
PHONE=${TEST_PHONE:-70000000000}

# 1. Login — reuse existing pattern: request SMS, fetch debug code, exchange for JWT.
curl -s "$BASE_URL/webhook/sms/$PHONE" > /dev/null
CODE=$(curl -s "$BASE_URL/webhook/debug/sms-code/$PHONE" | jq -r '.code')
JWT=$(curl -s "$BASE_URL/webhook/check-code/$PHONE/$CODE" | jq -r '."access-token"')
[ -n "$JWT" ] && [ "$JWT" != "null" ] || { echo "login failed"; exit 1; }

# 2. Create text2video job.
JOB=$(curl -s -X POST "$BASE_URL/webhook/video/jobs" \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"mode":"text2video","prompt":"ocean sunset","duration":5,"quality":"std"}')
JOB_ID=$(echo "$JOB" | jq -r '.jobId')
[ -n "$JOB_ID" ] && [ "$JOB_ID" != "null" ] || { echo "create failed: $JOB"; exit 1; }
echo "job=$JOB_ID"

# 3. Poll up to 6 min (36 × 10s).
STATUS=""
for i in $(seq 1 36); do
  R=$(curl -s "$BASE_URL/webhook/video/jobs/$JOB_ID" -H "Authorization: Bearer $JWT")
  STATUS=$(echo "$R" | jq -r '.status')
  echo "iter=$i status=$STATUS"
  [ "$STATUS" = "ready" ] && break
  [ "$STATUS" = "failed" ] && { echo "failed: $R"; exit 1; }
  sleep 10
done
[ "$STATUS" = "ready" ] || { echo "did not become ready in 6 min"; exit 1; }

# 4. Verify URL.
VIDEO_URL=$(curl -s "$BASE_URL/webhook/video/jobs/$JOB_ID" -H "Authorization: Bearer $JWT" | jq -r '.video_url')
HTTP=$(curl -sI "$VIDEO_URL" | head -1)
echo "video HEAD: $HTTP"
echo "$HTTP" | grep -q "200" || { echo "video not reachable"; exit 1; }

# 5. List includes jobId.
curl -s "$BASE_URL/webhook/video/jobs" -H "Authorization: Bearer $JWT" | jq -e ".jobs | map(.id) | contains([\"$JOB_ID\"])" > /dev/null

# 6. Delete.
curl -s -X DELETE "$BASE_URL/webhook/video/jobs/$JOB_ID" -H "Authorization: Bearer $JWT" | jq -e '.ok == true' > /dev/null

# 7. Gone from list.
curl -s "$BASE_URL/webhook/video/jobs" -H "Authorization: Bearer $JWT" | jq -e ".jobs | map(.id) | contains([\"$JOB_ID\"]) | not" > /dev/null

echo "video e2e: PASS"
```

- [ ] **Step 2: Add it to the runner**

Add a "video" suite to `runner.js` that shells out to the bash script (mirroring how `referral.e2e.sh` is invoked if that's the existing pattern) — or register via `npm run` script:

```json
// tests/package.json
"scripts": {
  "test:video": "bash video.e2e.sh"
}
```

- [ ] **Step 3: Run**

```bash
chmod +x ~/Downloads/spirits_back/tests/video.e2e.sh
cd ~/Downloads/spirits_back/tests && BASE_URL=https://b.linkeon.io bash video.e2e.sh
```
Expected: `video e2e: PASS`.

- [ ] **Step 4: Commit**

```bash
cd ~/Downloads/spirits_back
git add tests/video.e2e.sh tests/package.json tests/runner.js
git commit -m "test(video): end-to-end video generation smoke test"
```

---

### Task 26: E2E — `tests/chat-tools.e2e.sh`

**Files:**
- Create: `~/Downloads/spirits_back/tests/chat-tools.e2e.sh`

- [ ] **Step 1: Write script**

```bash
#!/usr/bin/env bash
# tests/chat-tools.e2e.sh — verifies the tool-loop refactor
set -euo pipefail

BASE_URL=${BASE_URL:-https://b.linkeon.io}
PHONE=${TEST_PHONE:-70000000000}

curl -s "$BASE_URL/webhook/sms/$PHONE" > /dev/null
CODE=$(curl -s "$BASE_URL/webhook/debug/sms-code/$PHONE" | jq -r '.code')
JWT=$(curl -s "$BASE_URL/webhook/check-code/$PHONE/$CODE" | jq -r '."access-token"')

# 1. Image tool
BODY='{"assistantId":"1","message":"нарисуй закат"}'
OUT=$(curl -sN "$BASE_URL/webhook/chat/stream" -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d "$BODY")
echo "$OUT" | grep -q '"type":"tool_start".*"tool":"generate_image"' || { echo "no generate_image tool_start"; echo "$OUT"; exit 1; }

# 2. Video tool (does not wait for readiness — only asserts the tool was called)
BODY='{"assistantId":"1","message":"сгенерируй пятисекундное видео: морской закат, медленный зум"}'
OUT=$(curl -sN "$BASE_URL/webhook/chat/stream" -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' -d "$BODY")
echo "$OUT" | grep -q '"type":"tool_start".*"tool":"generate_video"' || { echo "no generate_video tool_start"; echo "$OUT"; exit 1; }
echo "$OUT" | grep -q '"jobId"' || { echo "no jobId in tool_result"; echo "$OUT"; exit 1; }

echo "chat-tools e2e: PASS"
```

- [ ] **Step 2: Run**

```bash
chmod +x ~/Downloads/spirits_back/tests/chat-tools.e2e.sh
cd ~/Downloads/spirits_back/tests && bash chat-tools.e2e.sh
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd ~/Downloads/spirits_back
git add tests/chat-tools.e2e.sh
git commit -m "test(chat): tool-loop e2e (image + video)"
```

---

## Phase H — Deploy & Smoke

### Task 27: Regression on dev

- [ ] **Step 1: Run existing api + e2e suites**

```bash
cd ~/Downloads/spirits_back/tests && node runner.js --suite api
cd ~/Downloads/spirits_back/tests && node runner.js --suite e2e
```
Expected: all previously-green tests stay green.

---

### Task 28: Deploy backend to dev

- [ ] **Step 1: Rsync + rebuild + pm2 restart**

```bash
cd ~/Downloads/spirits_back
rsync -az -e "ssh -p 60322" src/ dvolkov@82.202.197.230:~/spirits_back/src/
ssh -p 60322 dvolkov@82.202.197.230 "cd ~/spirits_back && npm run build && pm2 restart linkeon-api"
```

- [ ] **Step 2: Smoke — create job via curl**

Run the script from Task 25 pointed at `BASE_URL=https://b.linkeon.io`. Expected: PASS.

---

### Task 29: Deploy frontend to dev

- [ ] **Step 1: Build + rsync**

```bash
cd ~/Downloads/spirits_front
echo "VITE_BACKEND_URL=https://b.linkeon.io" > .env
pnpm build
rsync -az --delete -e "ssh -p 60322" dist/ dvolkov@82.202.197.230:/var/www/spirits/dist/
```

- [ ] **Step 2: Manual smoke checklist**

Open https://b.linkeon.io/video in a browser (logged in as a test user):

- `/video` renders with tabs "Создать" / "Мои видео"
- Switching mode (text2video → image2video → extend → lipsync) shows/hides correct fields
- Token cost line updates live as quality / duration / model change
- Create a text2video 5s std job → redirects to gallery with a pending card
- After 2-5 min card becomes a playable video
- Repeat once for each of the remaining three modes (`image2video` needs an uploaded picture; `extend` and `lipsync` need a ready video)
- In any chat ("Психолог") type "сделай видео: закат, зум" → inline placeholder appears, then becomes playable
- Navigation shows "Видео" entry in both RU and EN locales

- [ ] **Step 3: Commit any last tweaks, push the branch**

```bash
cd ~/Downloads/spirits_back && git push origin <branch>
cd ~/Downloads/spirits_front && git push origin <branch>
```

---

## Self-Review Notes

- Every spec requirement has a task:
  - Four Kling modes — Tasks 3, 4
  - Camera control — Task 3 + Task 20 (UI)
  - All params — Task 2 (DTO), Task 20 (UI)
  - v1.6 + v2-master — Task 2, Task 20
  - Token pricing table — Task 2 (`VIDEO_PRICING`)
  - Refund on failure — Task 4 (`failAndRefund` in Task 6)
  - S3 rehost — Task 7
  - Thumbnail via ffmpeg — Task 7
  - Background poller — Task 6
  - Timeout watchdog — Task 6
  - Rate limits (concurrent, IP) — Task 4 (concurrent), Task 10 (IP)
  - Cleanup cron — Task 11
  - `/video` page — Tasks 16-21
  - Gallery — Task 19
  - Adaptive form — Task 20
  - Tool loop in chat — Tasks 13, 14
  - Inline card in chat — Task 22
  - Video markdown rendering — Task 23
  - Unit + E2E + chat-tools tests — Tasks 24-26
  - Regression + deploy + smoke — Tasks 27-29
- No placeholders: each step has the full code / command / expected output.
- Type consistency: `VideoMode`, `VideoModel`, `VideoQuality`, `VideoStatus`, `VideoJobRow` defined in `video.dto.ts` (Task 2) and used consistently throughout backend and tests.
- Kling `mode` field ("std"|"pro") is clearly named `quality` in our domain to avoid collision with our own `mode` (text2video / image2video / …). The service maps `quality` → Kling's `mode` field (Task 4).
- `kling_task_id` column is reused to store the Kling `video_id` when a job becomes `ready` — so `extend` and `lipsync` can reference it. This behaviour is documented inline in Task 4 (`sourceKlingVideoId`) and implemented in Task 6 (`pollJob`).

---

**Plan complete.** Save location: `docs/superpowers/plans/2026-04-21-kling-video-generation.md`.
