# Kling Video Generation — Design

**Date:** 2026-04-21
**Status:** Draft (pending user review)
**Scope:** Add Kling-powered video generation to my.linkeon.io as a new `/video` section and as an LLM tool available to all assistants.

## Goals

- Add full Kling video generation: `text2video`, `image2video`, `video-extend`, `lip-sync`, + camera control and all Kling parameters.
- Support Kling v1.6 (standard) and Kling v2.0-master (premium).
- New `/video` page with creation form and "My videos" gallery.
- Make video generation available as an LLM tool to every assistant (by refactoring chat tool-calling to a proper Anthropic tool loop).
- Refactor existing image generation from a regex-based bypass in `chat.service.ts` to the same tool-loop mechanism — single unified path.

## Non-Goals

- Mobile push / email notifications on video ready (polling only on first release).
- Per-user video editor beyond what Kling parameters already provide.
- Separate admin dashboard for video jobs (basic SQL visibility is enough for v1).
- Automated Frontend tests (manual smoke on first release).

## User Decisions (captured during brainstorming)

| Topic | Decision |
|---|---|
| UI placement | `/video` tab **and** assistant tool in chat |
| Kling features | All four modes + full parameter set |
| Release | Single release (all in one) |
| Storage | Rehost to AWS S3 (`linkeon.io` bucket) |
| Progress UX | Async job with frontend polling |
| Gallery | Yes, "My videos" list |
| Kling model versions | v1.6 (standard) + v2.0-master (premium), selectable |
| Chat integration | Anthropic tool-calling loop, replacing existing regex bypass |
| Refund on Kling failure | Yes — auto-refund tokens when job fails |

## Token Pricing

| Operation | Tokens |
|---|---|
| text→video 5s std | 25 000 |
| text→video 10s std | 50 000 |
| text→video 5s pro | 50 000 |
| text→video 10s pro | 100 000 |
| image→video (std/pro × 5s/10s) | same as text→video |
| video-extend (+5s) | 25 000 std / 50 000 pro |
| lip-sync | 15 000 |
| camera-control | +0 (parameter, not a separate tariff) |
| kling v2.0-master 5s | 150 000 |
| kling v2.0-master 10s | 300 000 |

Free starter bonus (25k tokens) buys the user one std text→video. Tokens are deducted at job creation (transactional) and refunded if the Kling job fails.

## Architecture

### Backend (NestJS)

New module `src/video/`:

```
src/video/
├── video.module.ts
├── video.controller.ts    — REST endpoints
├── video.service.ts       — business logic + background poller
└── video.dto.ts           — request/response DTOs
```

Extended module `src/misc/kling.service.ts`:

```ts
// Existing (kept):
async generateImage(prompt, aspectRatio): Promise<{url}>

// New (thin wrappers over Kling API):
async createText2VideoTask(params): Promise<{taskId}>
async createImage2VideoTask(params): Promise<{taskId}>
async createVideoExtendTask(videoId, prompt): Promise<{taskId}>
async createLipSyncTask(videoId, audioUrl | text): Promise<{taskId}>
async getVideoTaskStatus(taskId, mode): Promise<{status, videoUrl?, error?}>
```

Each method is a short axios POST/GET that returns Kling's `taskId` — no polling inside.

### Background worker

A single `setInterval` inside `video.service.ts` (tick = 5 s). On each tick:

1. `SELECT * FROM video_jobs WHERE status='processing' LIMIT 20`
2. For each job: call `kling.getVideoTaskStatus(job.kling_task_id, job.mode)`.
3. On `succeed`: rehost the mp4 to S3, extract thumbnail via ffmpeg, update `status='ready'`.
4. On `failed`: refund tokens in a transaction, set `status='failed'` with `error_message`.
5. Timeout watchdog (also per tick):

   ```sql
   UPDATE video_jobs SET status='failed', error_message='timeout'
   WHERE status='processing' AND created_at < now() - interval '15 minutes'
   ```
   Refund tokens for these rows.

A dedicated worker process is not needed — the expected concurrency (≤ ~10 parallel jobs) fits comfortably inside the main NestJS instance.

### Frontend (React)

```
src/components/video/
├── VideoInterface.tsx     — root, tabs "Создать" / "Мои видео"
├── VideoCreateForm.tsx    — adaptive form (fields by mode)
├── VideoJobCard.tsx       — thumbnail + status + actions
├── VideoGallery.tsx       — grid of VideoJobCard, polling
└── useVideoJobs.ts        — hook: list + create + polling
```

Routing (in `src/App.tsx`): `/video → VideoPage`. Navigation entry added to `src/components/layout/Navigation.tsx` with the `Film` icon from lucide-react. All strings via `i18next` under a new `video` key in `src/i18n/locales/{ru,en}.json`.

## Data Model

Single PostgreSQL table — active, ready, and failed jobs all live here:

```sql
CREATE TABLE video_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  mode             text NOT NULL,              -- 'text2video'|'image2video'|'extend'|'lipsync'
  model            text NOT NULL,              -- 'kling-v1-6'|'kling-v2-master'
  quality          text NOT NULL,              -- 'std'|'pro'
  duration_sec     int NOT NULL,               -- 5 | 10
  prompt           text,
  negative_prompt  text,
  cfg_scale        numeric(3,1),               -- 0.0 — 1.0
  source_image_url text,                       -- image2video input
  source_video_id  uuid REFERENCES video_jobs(id),  -- extend / lipsync input
  camera_type      text,                       -- Kling control type: 'simple'|'down_back'|'forward_up'|'right_turn_forward'|'left_turn_forward'|null
  camera_config    jsonb,                      -- for 'simple' type: { horizontal?, vertical?, pan?, tilt?, roll?, zoom? } with numeric values -10..10
  audio_url        text,                       -- lipsync input
  tokens_spent     bigint NOT NULL,
  kling_task_id    text,
  status           text NOT NULL DEFAULT 'pending',  -- pending|processing|ready|failed
  video_url        text,                       -- final S3 URL
  thumbnail_url    text,                       -- first-frame preview (S3 URL)
  error_message    text,
  created_at       timestamp with time zone DEFAULT now(),
  updated_at       timestamp with time zone DEFAULT now()
);
CREATE INDEX ON video_jobs (user_id, created_at DESC);
CREATE INDEX ON video_jobs (status) WHERE status IN ('pending','processing');
```

Gallery query: `SELECT … WHERE user_id=$1 AND status='ready' ORDER BY created_at DESC LIMIT 50`.
Worker query: `SELECT … WHERE status IN ('pending','processing')`.

No secondary `generated_videos` table — it would duplicate `WHERE status='ready'`.

## Backend Service Internals

```ts
// video.service.ts — public methods:

createJob(userId, params) → { jobId, status, tokensSpent }
  // 1. validate params by mode
  // 2. compute tokenCost from pricing table
  // 3. transaction:
  //      INSERT video_jobs (..., status='pending', tokens_spent=cost)
  //      UPDATE ai_profiles_consolidated SET tokens = tokens - cost WHERE user_id=$
  //      (guard: tokens >= cost; otherwise rollback and throw 402)
  // 4. call appropriate kling.createXxxTask()
  // 5. UPDATE video_jobs SET kling_task_id=$, status='processing'
  // 6. return jobId to client (no wait)

getJob(userId, jobId) → full row (ownership check)
listJobs(userId, {status?, limit?}) → rows
deleteJob(userId, jobId) → deletes row + S3 objects (best-effort)
```

### S3 rehost

```
fetch(klingUrl) → stream →
s3.putObject(Bucket='linkeon.io', Key='videos/<jobId>.mp4', Body=stream, ACL='public-read')
→ videoUrl = https://linkeon.io.s3.amazonaws.com/videos/<jobId>.mp4
```

Thumbnail: `ffmpeg -i <url> -ss 0 -vframes 1 -q:v 2 <tmp.jpg>` → upload to `videos/<jobId>.jpg`.

### Cleanup cron

Daily cron:

```sql
DELETE FROM video_jobs WHERE status='failed' AND created_at < now() - interval '30 days';
```

Removes failed noise without touching successful user content.

## API

All endpoints protected by `JwtAuthGuard`, prefixed with `/webhook/video`.

| Method | Path | Body / Query | Response |
|---|---|---|---|
| `POST` | `/webhook/video/jobs` | `{ mode, model, quality, duration, prompt, sourceImageUrl?, sourceVideoId?, audioUrl?, cameraType?, cameraConfig?, negativePrompt?, cfgScale? }` | `{ jobId, status, tokensSpent }` |
| `GET` | `/webhook/video/jobs/:id` | — | full `video_jobs` row |
| `GET` | `/webhook/video/jobs` | `?status=ready&limit=50` | `{ jobs: [...] }` |
| `DELETE` | `/webhook/video/jobs/:id` | — | `{ ok: true }` |
| `POST` | `/webhook/video/upload-image` | multipart | `{ url }` (S3) |
| `POST` | `/webhook/video/upload-audio` | multipart | `{ url }` (S3) |

Upload size limits: image 10 MB (`image/*`), audio 20 MB (`audio/*`). Rate limits:

- Per-user: ≤ 3 concurrent `processing` jobs (4th → 429).
- Per-IP: 20 job-creation requests per minute (Redis counter).

## Chat Integration — Anthropic Tool Loop

Replace the regex-based image bypass in `src/chat/chat.service.ts` (lines ~150–183) with a proper Anthropic tool-calling loop. Two tools are registered and available to every assistant:

```ts
const TOOLS = [
  {
    name: 'generate_image',
    description: 'Generate an image from a text prompt using nano-banana.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        quality: { type: 'string', enum: ['std', 'hd'], default: 'std' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'generate_video',
    description: 'Generate a short video (5-10s) using Kling. Supports text-to-video, image-to-video, video extension, and lip-sync.',
    input_schema: {
      type: 'object',
      properties: {
        mode:            { type: 'string', enum: ['text2video','image2video','extend','lipsync'] },
        prompt:          { type: 'string' },
        model:           { type: 'string', enum: ['kling-v1-6','kling-v2-master'], default: 'kling-v1-6' },
        quality:         { type: 'string', enum: ['std','pro'], default: 'std' },
        duration:        { type: 'number', enum: [5, 10], default: 5 },
        sourceImageUrl:  { type: 'string' },
        sourceVideoId:   { type: 'string' },
        cameraType:      { type: 'string', enum: ['simple','down_back','forward_up','right_turn_forward','left_turn_forward'], description: 'Kling camera preset; use "simple" with cameraConfig for fine-grained control' },
        cameraConfig:    { type: 'object', description: 'Only with cameraType="simple". One axis at a time, value in [-10, 10]. Keys: horizontal, vertical, pan, tilt, roll, zoom' },
        negativePrompt:  { type: 'string' }
      },
      required: ['mode']
    }
  }
];
```

Loop shape (standard Anthropic pattern):

```ts
let messages = [...history, { role: 'user', content: userMessage }];
for (let i = 0; i < 5; i++) {                         // hard safety cap
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    system: systemPrompt,
    tools: TOOLS,
    messages,
    max_tokens: 4096
  });

  if (res.stop_reason === 'end_turn') {
    streamAssistantTextToClient(res.content);
    break;
  }

  if (res.stop_reason === 'tool_use') {
    const toolUse = res.content.find(b => b.type === 'tool_use');
    // Stream a tool_start event to client — frontend renders inline job card:
    streamToClient({ type: 'tool_start', tool: toolUse.name, input: toolUse.input });

    const toolResult = await this.executeTool(userId, toolUse.name, toolUse.input);
    // toolResult examples:
    //   generate_image: { image_url, tokens_spent }
    //   generate_video: { job_id, status: 'processing', tokens_spent }
    //   error: { error: 'insufficient_tokens' | 'invalid_params', ... }

    messages.push({ role: 'assistant', content: res.content });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(toolResult) }] });
    continue;
  }
  break;
}
```

The assistant is expected to acknowledge the tool result in its next turn ("generating a video now, takes 2–5 minutes…"). If it returns invalid tool params, backend validation rejects them with a structured error in `tool_result`, and the LLM is expected to self-correct in the next iteration.

### Frontend chat rendering

When the stream emits `{ type: 'tool_start', tool: 'generate_video', jobId }`, `ChatInterface` injects an inline `<VideoJobCard jobId={...} />` at the current position. The `useVideoJobs` hook polls every 5 s — when `status='ready'`, the card swaps its spinner for a `<video>` player.

The finalized chat message is persisted as markdown `![video](<s3_url>)` in `chat_history`. On chat reload, `customMarkdown.tsx` is extended to render video URLs as inline players (detect by extension: `.mp4`, `.webm`).

### Obsolete code removed

- Regex `imageKeywords` and `drawKeywords` in `chat.service.ts:154–156`.
- The direct `generateImageForChat` call at line ~159; image gen now goes through `executeTool('generate_image', …)`.

This unifies image and video paths and removes the dual-pathway that currently exists.

## Error Handling

| Scenario | Behaviour |
|---|---|
| Kling `createTask` non-2xx / `code != 0` | No job created, 502 to client, transaction rolled back, no tokens spent |
| Kling `pollTask` returns `failed` | `status='failed'`, refund tokens transactionally, `error_message` stored |
| Job stuck in `processing` > 15 min | Watchdog sets `status='failed'`, refunds tokens |
| `image2video` missing `sourceImageUrl` | 400 from validator, no job created |
| `extend` with `sourceVideoId` owned by another user or not `ready` | 403 / 409 from validator |
| `lipsync` with `model='kling-v2-master'` | 400 — lipsync only supported on v1.6 |
| `duration=10` with `mode='extend'` | 400 — extend is fixed 5 s |
| S3 upload fails during rehost | job stays `processing`; tick retries next cycle; watchdog catches after 15 min |
| S3 delete fails during `DELETE /jobs/:id` | log and continue; DB row removed; orphan cleaned up by separate cleanup job |
| LLM returns garbage tool params | Validator → `tool_result: { error }` → LLM self-corrects in next loop iteration |
| Tool loop > 5 iterations | Force-break, return text "не получилось выполнить запрос" |
| User has 3 concurrent processing jobs | 429 with explanatory message |
| Insufficient tokens | 402 with `{ balance, required }` |

## Testing

### Unit / integration (Jest)

`src/video/video.service.spec.ts`:

- `createJob` — happy path: deducts tokens, creates Kling task, status → `processing`.
- `createJob` — rolls back transaction when Kling API throws.
- `createJob` — 429 when user has 3 concurrent `processing` jobs.
- `createJob` — rejects foreign or non-`ready` `sourceVideoId`.
- `createJob` — rejects when token balance < cost.
- `pollJob` — `succeed` path: S3 rehost + thumbnail + status `ready`.
- `pollJob` — `failed` path: refund + `error_message`.
- Timeout watchdog: > 15 min → `failed` + refund.
- `deleteJob` — removes DB row + S3 objects.

Mocks: Kling API (axios mock), AWS S3 (`aws-sdk-mock`), ffmpeg (`child_process` mock).

### Backend E2E (`~/Downloads/spirits_back/tests/`)

New `tests/video.e2e.sh`, added to runner as `--suite video`:

1. Login test user.
2. `POST /webhook/video/jobs { mode:'text2video', prompt:'ocean sunset', duration:5, quality:'std' }` → assert `{ jobId, status: 'pending'|'processing' }`.
3. Poll `GET /webhook/video/jobs/:id` every 10 s up to 6 min → assert `status='ready'` and `video_url` starts with `https://linkeon.io.s3`.
4. `HEAD video_url` → 200 + `content-type: video/mp4`.
5. `GET /webhook/video/jobs` → list includes the jobId.
6. `DELETE /webhook/video/jobs/:id` → 200.
7. `GET /webhook/video/jobs` → jobId absent.

### Chat-tools E2E

`tests/chat-tools.e2e.sh`:

1. `POST /webhook/chat/stream { message: "нарисуй закат над океаном" }` → stream contains `tool_start(generate_image)`, final message has `image_url`.
2. `POST /webhook/chat/stream { message: "сделай 5-секундное видео: закат, медленный зум" }` → stream contains `tool_start(generate_video)` with `{ mode:'text2video', cameraType:'zoom_in' }`, a `jobId` is returned, tokens are deducted.

### Frontend manual smoke

- `/video` renders, form shows/hides fields correctly per `mode`.
- Creating a job → spinner card appears in "Мои видео".
- After ~2–5 min, card turns into a video player.
- In chat with "психолог" → message "сгенерируй видео с морем" → inline card rendered in chat stream → resolves to a playable video inside the message.
- Lip-sync from gallery: create text2video → click "Lip-sync" on a `ready` card → fill audio field → new job created.

### Regression

After the chat.service.ts refactor, run all existing tests:

```
cd ~/Downloads/spirits_back/tests && node runner.js --suite api    # 32 tests
cd ~/Downloads/spirits_back/tests && node runner.js --suite e2e    # 18 tests
```

All must remain green. Plain text chat with each assistant must behave as before, and `"нарисуй X"` must continue producing an image (but now through the tool loop, not the regex bypass).

## Acceptance Criteria

- All unit and E2E tests green (`video`, `chat-tools`, existing `api`, existing `e2e`).
- Manual smoke passes on dev (all four modes produce playable videos from S3).
- Deployed to dev backend (`82.202.197.230`) and dev frontend.
- One `ready` job of each mode exists in prod DB after a verification pass: `text2video`, `image2video`, `extend`, `lipsync`.
- Navigation shows "Видео" entry, both in RU and EN locales.
