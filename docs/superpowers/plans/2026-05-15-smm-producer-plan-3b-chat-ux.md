# SMM Producer — Plan 3b: Chat UX (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать chat-UX для AI-продюсера (Plan 3a) на фронте `spirits_front`: разбирать `tool_result` события из streaming-чата → подставлять inline-карточки сценариев и MP4-плеер в ленте сообщений → кнопки на карточках вызывают REST-эндпоинты Plan 3a. После Plan 3b админ может полностью провести SMM-флоу через UI без psql/curl.

**Architecture:** Расширяем существующий `parseCustomMarkdown` двумя новыми блоками `{{smm_scenario:id=...}}` и `{{smm_video:id=...}}`. В `ChatInterface.tsx` добавляем обработчики `tool_result` событий для SMM-tools (Plan 3a), которые append'ят соответствующий markdown-блок в текущий стримящийся текст. React-компоненты `ScenarioCard` и `SmmVideoPlayer` лениво подтягивают данные через `apiClient`, рендерят preview + кнопки. Кнопки дёргают REST-эндпоинты Plan 3a Task 8.

**Tech Stack:** React 18, TypeScript, Tailwind, `lucide-react` (icons), `apiClient` (uses `VITE_BACKEND_URL` = `https://my.linkeon.io`).

**End-state demo:**
- В `/chat` админ выбирает «SMM-продюсер» (новый ассистент id=15)
- Пишет «Сгенерируй 2 ролика про долги»
- AI стримит "Принял, сейчас сгенерирую…" — текст появляется как обычно
- Когда AI вызывает `generate_scenarios`, в чате inline появляются 2 карточки сценариев: заголовок, ассистент (psy/lawyer/coach), превью первой реплики, кнопки `Утвердить` `Перегенерировать` `Отклонить`
- Юзер жмёт `Утвердить` на первой → списываются токены, в чате появляется placeholder «🎬 Рендерим…» (видео-плеер ждёт `status=ready`)
- Через ~1 минуту placeholder превращается в inline `<video controls>` + кнопки `Утвердить ролик` `Отклонить`
- Юзер жмёт `Утвердить ролик` → `smm_video.status='approved'` (публикация — Plan 4)

---

## File Structure

**Создаются:**

```
spirits_front/src/
├── components/chat/smm/
│   ├── ScenarioCard.tsx                # inline-карточка сценария
│   ├── SmmVideoPlayer.tsx              # inline-плеер MP4 + approve/reject + polling
│   └── smm-api.ts                      # типизированные wrappers вокруг apiClient
```

**Модифицируются:**

```
spirits_front/src/
├── utils/customMarkdown.tsx            # +SMM_SCENARIO_REGEX, +SMM_VIDEO_REGEX, +Maps
└── components/chat/ChatInterface.tsx   # +обработка tool_result для SMM-tools
```

**Без изменений (используется как есть):**
- `src/services/apiClient.ts` — singleton с auto-refresh JWT
- `src/contexts/AuthContext.tsx` — `useAuth()` для `isAdmin` check (SMM-продюсер только для админов)

---

## Task 1: SMM CustomMarkdown blocks + helpers

**Files:**
- Modify: `src/utils/customMarkdown.tsx`

- [ ] **Step 1.1: Inspect current shape**

```bash
cd /Users/dmitry/Downloads/spirits_front
grep -nE "(BUTTON_REGEX|LINK_REGEX|VIDEO_URL_REGEX|export const parseCustomMarkdown)" src/utils/customMarkdown.tsx | head -10
```

Note the regex constants are defined near the top, the parser uses `replace` to extract them into Maps with placeholder tokens `__BUTTON_xxx__` etc. We extend the same pattern.

- [ ] **Step 1.2: Add new regex constants**

Open `src/utils/customMarkdown.tsx`. Find the existing `const BUTTON_REGEX = ...` and `const VIDEO_URL_REGEX = ...` definitions. Add right after them:

```typescript
// SMM Producer inline blocks (Plan 3b)
const SMM_SCENARIO_REGEX = /\{\{smm_scenario:id=([a-f0-9-]{36})\}\}/g;
const SMM_VIDEO_REGEX = /\{\{smm_video:id=([a-f0-9-]{36})\}\}/g;
```

- [ ] **Step 1.3: Update parseCustomMarkdown return type**

The current return is `{ content, buttons, links, videos }`. Add two new Maps. Find the `export const parseCustomMarkdown` declaration and replace the return type and Maps initialization:

```typescript
export const parseCustomMarkdown = (content: string): {
  content: string;
  buttons: Map<string, ButtonConfig>;
  links: Map<string, LinkConfig>;
  videos: Map<string, string>;
  smmScenarios: Map<string, string>;   // key → scenarioId
  smmVideos: Map<string, string>;      // key → videoId
} => {
  const buttons = new Map<string, ButtonConfig>();
  const links = new Map<string, LinkConfig>();
  const videos = new Map<string, string>();
  const smmScenarios = new Map<string, string>();
  const smmVideos = new Map<string, string>();
```

- [ ] **Step 1.4: Add replace blocks**

In the same `parseCustomMarkdown` function, find the existing `parsedContent.replace(VIDEO_URL_REGEX, ...)` block. After it, add the two new replace blocks (BEFORE the function's `return` statement):

```typescript
  parsedContent = parsedContent.replace(SMM_SCENARIO_REGEX, (_match, scenarioId) => {
    const key = `smm_scenario_${scenarioId}`;
    smmScenarios.set(key, scenarioId);
    return `__SMM_SCENARIO_${key}__`;
  });

  parsedContent = parsedContent.replace(SMM_VIDEO_REGEX, (_match, videoId) => {
    const key = `smm_video_${videoId}`;
    smmVideos.set(key, videoId);
    return `__SMM_VIDEO_${key}__`;
  });
```

- [ ] **Step 1.5: Update return**

Change the final `return` to include the new Maps:

```typescript
  return { content: parsedContent, buttons, links, videos, smmScenarios, smmVideos };
```

- [ ] **Step 1.6: TypeScript check**

```bash
cd /Users/dmitry/Downloads/spirits_front
npx tsc --noEmit 2>&1 | head -10
```

Expected: there will be TS errors at `ChatInterface.tsx:1563` because it destructures the return of `parseCustomMarkdown` and now there are 2 new fields. The errors will be like "Property 'smmScenarios' does not exist" if you wrongly destructure too few — but since the existing destructure is `{ content: parsedContent, buttons, links, videos }`, NEW fields are ignored without error. So `tsc --noEmit` should be CLEAN.

If there are errors, paste them and stop.

- [ ] **Step 1.7: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_front
git add src/utils/customMarkdown.tsx
git commit -m "feat(smm): add {{smm_scenario}} and {{smm_video}} CustomMarkdown blocks

parseCustomMarkdown now extracts {{smm_scenario:id=<uuid>}} and
{{smm_video:id=<uuid>}} into smmScenarios/smmVideos Maps, replacing
them with __SMM_SCENARIO_<key>__ / __SMM_VIDEO_<key>__ placeholders.

ChatInterface will (in Task 5) substitute these placeholders with
inline <ScenarioCard /> and <SmmVideoPlayer /> React components."
```

---

## Task 2: smm-api.ts — typed REST wrappers

**Files:**
- Create: `src/components/chat/smm/smm-api.ts`

- [ ] **Step 2.1: Inspect apiClient interface**

```bash
cd /Users/dmitry/Downloads/spirits_front
grep -nE "(async (get|post|delete|patch|put)\(|fetchStream)" src/services/apiClient.ts | head -10
```

Note the method signatures. Common shape: `apiClient.get(url)` returns `Response`-like (parsed JSON likely).

- [ ] **Step 2.2: Create the helper file**

Create `src/components/chat/smm/smm-api.ts`:

```typescript
// src/components/chat/smm/smm-api.ts
import { apiClient } from '../../../services/apiClient';

export interface DialogTurn {
  speaker: 'hero' | 'assistant';
  text: string;
  tStart: number;
  tEnd: number;
}

export interface ScenarioDetail {
  id: string;
  campaignId: string;
  title: string;
  assistantRole: string;
  dialog: DialogTurn[];
  mood: 'dramatic' | 'inspiring' | 'calm' | 'uplifting' | 'tense' | 'neutral';
  ttsTier: 'economy' | 'premium';
  status: 'pending_review' | 'approved' | 'rejected' | 'regenerating';
  createdAt: string;
}

export interface VideoDetail {
  id: string;
  scenarioId: string;
  status: 'queued' | 'rendering' | 'ready' | 'failed' | 'approved' | 'rejected';
  mp4Url: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  errorMessage: string | null;
  tokensCharged: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApproveScenariosResult {
  approved: Array<{ scenarioId: string; videoId: string; jobId: string }>;
  failed: Array<{ scenarioId: string; reason: string; detail?: string }>;
}

export async function getScenario(id: string): Promise<ScenarioDetail> {
  const r = await apiClient.get(`/webhook/smm/scenarios/${id}`);
  if (!r.ok) throw new Error(`getScenario ${id}: ${r.status}`);
  return await r.json();
}

export async function approveScenario(id: string): Promise<ApproveScenariosResult> {
  const r = await apiClient.post(`/webhook/smm/scenarios/${id}/approve`, undefined);
  if (!r.ok) throw new Error(`approveScenario ${id}: ${r.status}`);
  return await r.json();
}

export async function regenerateScenario(id: string, feedback: string): Promise<{ ok: true }> {
  const r = await apiClient.post(`/webhook/smm/scenarios/${id}/regenerate`, { feedback });
  if (!r.ok) throw new Error(`regenerateScenario ${id}: ${r.status}`);
  return await r.json();
}

export async function rejectScenario(id: string): Promise<{ ok: true }> {
  const r = await apiClient.delete(`/webhook/smm/scenarios/${id}`);
  if (!r.ok) throw new Error(`rejectScenario ${id}: ${r.status}`);
  return await r.json();
}

export async function getVideo(id: string): Promise<VideoDetail> {
  const r = await apiClient.get(`/webhook/smm/videos/${id}`);
  if (!r.ok) throw new Error(`getVideo ${id}: ${r.status}`);
  return await r.json();
}

export async function approveVideo(id: string): Promise<{ ok: true }> {
  const r = await apiClient.post(`/webhook/smm/videos/${id}/approve`, undefined);
  if (!r.ok) throw new Error(`approveVideo ${id}: ${r.status}`);
  return await r.json();
}

export async function rejectVideo(id: string, reason?: string): Promise<{ ok: true }> {
  const r = await apiClient.post(`/webhook/smm/videos/${id}/reject`, { reason });
  if (!r.ok) throw new Error(`rejectVideo ${id}: ${r.status}`);
  return await r.json();
}
```

NOTE: the actual `apiClient` return-type signature (whether it returns a `Response` with `.ok` and `.json()`, or a parsed object) depends on its implementation. If `apiClient.get` returns parsed JSON directly (not a `Response`), adjust each wrapper to remove `.json()` and check `r.ok` differently. Inspect `apiClient.ts` lines for `async get` / `async post` to know the exact shape and adapt.

- [ ] **Step 2.3: Verify TS compile**

```bash
cd /Users/dmitry/Downloads/spirits_front
npx tsc --noEmit 2>&1 | grep -E "smm-api" | head -10
```

Expected: no errors specific to `smm-api.ts`.

- [ ] **Step 2.4: Commit**

```bash
git add src/components/chat/smm/smm-api.ts
git commit -m "feat(smm): typed REST wrappers for scenario+video endpoints

smm-api.ts wraps the 7 endpoints from Plan 3a Task 8:
- getScenario, approveScenario, regenerateScenario, rejectScenario
- getVideo, approveVideo, rejectVideo

Exports DialogTurn, ScenarioDetail, VideoDetail types matching the
backend response shapes."
```

---

## Task 3: ScenarioCard component

**Files:**
- Create: `src/components/chat/smm/ScenarioCard.tsx`

A self-contained card that fetches `getScenario(id)` on mount, shows title + role + first reply preview + 3 action buttons. Disables buttons during in-flight requests and reflects the latest status from the backend.

- [ ] **Step 3.1: Create the component**

Create `src/components/chat/smm/ScenarioCard.tsx`:

```typescript
// src/components/chat/smm/ScenarioCard.tsx
import React, { useEffect, useState } from 'react';
import { Check, RotateCcw, X, Loader2, AlertCircle } from 'lucide-react';
import {
  getScenario,
  approveScenario,
  regenerateScenario,
  rejectScenario,
  ScenarioDetail,
} from './smm-api';

interface Props {
  scenarioId: string;
}

const ROLE_LABEL: Record<string, string> = {
  psy: 'Психолог',
  lawyer: 'Юрист',
  coach: 'Коуч',
};

const MOOD_EMOJI: Record<string, string> = {
  dramatic: '🎭',
  inspiring: '✨',
  calm: '🧘',
  uplifting: '🌟',
  tense: '⚡',
  neutral: '◽',
};

export const ScenarioCard: React.FC<Props> = ({ scenarioId }) => {
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInflight, setActionInflight] = useState<'approve' | 'regenerate' | 'reject' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getScenario(scenarioId)
      .then((s) => { if (alive) { setScenario(s); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [scenarioId]);

  const handleApprove = async () => {
    if (!scenario) return;
    setActionInflight('approve');
    setActionMessage(null);
    try {
      const r = await approveScenario(scenarioId);
      if (r.failed.length > 0) {
        setActionMessage(`Не хватило токенов: ${r.failed[0].reason}`);
      } else {
        setActionMessage(`Утверждено, рендерится. Видео id: ${r.approved[0].videoId.slice(0, 8)}…`);
        // refresh scenario status from server (it should now be 'approved')
        const updated = await getScenario(scenarioId);
        setScenario(updated);
      }
    } catch (e: any) {
      setActionMessage(`Ошибка: ${e.message}`);
    } finally {
      setActionInflight(null);
    }
  };

  const handleRegenerate = async () => {
    if (!scenario) return;
    const feedback = window.prompt('Что переделать в сценарии?', '');
    if (!feedback) return;
    setActionInflight('regenerate');
    setActionMessage(null);
    try {
      await regenerateScenario(scenarioId, feedback);
      const updated = await getScenario(scenarioId);
      setScenario(updated);
      setActionMessage('Перегенерировано');
    } catch (e: any) {
      setActionMessage(`Ошибка: ${e.message}`);
    } finally {
      setActionInflight(null);
    }
  };

  const handleReject = async () => {
    if (!scenario) return;
    if (!window.confirm('Точно отклонить этот сценарий?')) return;
    setActionInflight('reject');
    setActionMessage(null);
    try {
      await rejectScenario(scenarioId);
      const updated = await getScenario(scenarioId);
      setScenario(updated);
      setActionMessage('Отклонено');
    } catch (e: any) {
      setActionMessage(`Ошибка: ${e.message}`);
    } finally {
      setActionInflight(null);
    }
  };

  if (loading) {
    return (
      <div className="my-3 inline-flex items-center space-x-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Загружаю сценарий…</span>
      </div>
    );
  }

  if (error || !scenario) {
    return (
      <div className="my-3 inline-flex items-center space-x-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4" />
        <span>Не удалось загрузить сценарий ({error ?? 'unknown'}).</span>
      </div>
    );
  }

  const firstReply = scenario.dialog[0]?.text ?? '';
  const isActionable = scenario.status === 'pending_review' || scenario.status === 'regenerating';

  return (
    <div className="my-3 max-w-2xl rounded-xl border border-forest-200 bg-white shadow-sm">
      <div className="border-b border-forest-100 px-4 py-3">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h4 className="text-base font-semibold text-forest-900">{scenario.title}</h4>
          <StatusBadge status={scenario.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{MOOD_EMOJI[scenario.mood] ?? '◽'} {scenario.mood}</span>
          <span>·</span>
          <span>{ROLE_LABEL[scenario.assistantRole] ?? scenario.assistantRole}</span>
          <span>·</span>
          <span>{scenario.ttsTier === 'premium' ? 'Премиум' : 'Эконом'}</span>
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm italic text-gray-700">«{firstReply.slice(0, 200)}{firstReply.length > 200 ? '…' : ''}»</p>
        {scenario.dialog.length > 1 && (
          <p className="mt-1 text-xs text-gray-400">+ ещё {scenario.dialog.length - 1} реплик</p>
        )}
      </div>
      {isActionable && (
        <div className="flex items-center gap-2 border-t border-forest-100 bg-forest-50 px-4 py-2">
          <button
            onClick={handleApprove}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {actionInflight === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Утвердить
          </button>
          <button
            onClick={handleRegenerate}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-forest-300 bg-white px-3 py-1.5 text-sm font-medium text-forest-700 hover:bg-forest-50 disabled:opacity-50"
          >
            {actionInflight === 'regenerate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Перегенерировать
          </button>
          <button
            onClick={handleReject}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {actionInflight === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Отклонить
          </button>
        </div>
      )}
      {actionMessage && (
        <div className="border-t border-forest-100 bg-forest-50 px-4 py-2 text-xs text-forest-700">
          {actionMessage}
        </div>
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ status: ScenarioDetail['status'] }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending_review: { label: 'На ревью', cls: 'bg-yellow-100 text-yellow-800' },
    approved: { label: 'Утверждено', cls: 'bg-forest-100 text-forest-800' },
    rejected: { label: 'Отклонено', cls: 'bg-gray-200 text-gray-700' },
    regenerating: { label: 'Перегенерация', cls: 'bg-blue-100 text-blue-800' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
};
```

- [ ] **Step 3.2: TS compile**

```bash
cd /Users/dmitry/Downloads/spirits_front
npx tsc --noEmit 2>&1 | grep -E "ScenarioCard" | head -10
```

Expected: no errors specific to `ScenarioCard.tsx`. If a Tailwind class like `forest-600` doesn't exist in the project's Tailwind config, that's not a TS error — it just won't have effect at runtime. To verify, check `tailwind.config.js`:

```bash
grep -E "(forest|primary)" tailwind.config.js 2>/dev/null | head -5
```

If `forest` is not defined, swap `forest-` with `primary-` or whichever color exists in the config. Apply that replacement throughout the file.

- [ ] **Step 3.3: Commit**

```bash
git add src/components/chat/smm/ScenarioCard.tsx
git commit -m "feat(smm): inline ScenarioCard React component

Fetches scenario by id on mount, shows title + role + mood + dialog
preview. Three action buttons (Approve / Regenerate / Reject) call
the REST endpoints from Plan 3a Task 8 and re-fetch to reflect the
new status.

Disabled state during in-flight requests. StatusBadge component
shows current scenario status with color-coded pill."
```

---

## Task 4: SmmVideoPlayer component

**Files:**
- Create: `src/components/chat/smm/SmmVideoPlayer.tsx`

Similar shape to ScenarioCard but for `smm_video`. Initially the video has `status='queued'` or `'rendering'` (no mp4_url), so the component polls every 5s. When status reaches `'ready'`, it stops polling and renders the `<video>` element + Approve/Reject buttons. On `'failed'` it shows the error.

- [ ] **Step 4.1: Create the component**

Create `src/components/chat/smm/SmmVideoPlayer.tsx`:

```typescript
// src/components/chat/smm/SmmVideoPlayer.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Check, X, Loader2, AlertCircle, Film } from 'lucide-react';
import {
  getVideo,
  approveVideo,
  rejectVideo,
  VideoDetail,
} from './smm-api';

interface Props {
  videoId: string;
}

const POLL_INTERVAL_MS = 5000;

export const SmmVideoPlayer: React.FC<Props> = ({ videoId }) => {
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionInflight, setActionInflight] = useState<'approve' | 'reject' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polling loop until status reaches a terminal state.
  useEffect(() => {
    let alive = true;
    const fetchOnce = async () => {
      try {
        const v = await getVideo(videoId);
        if (!alive) return;
        setVideo(v);
        setError(null);
        // Stop polling on terminal states
        if (v.status === 'ready' || v.status === 'failed' || v.status === 'approved' || v.status === 'rejected') {
          return;
        }
        pollTimerRef.current = setTimeout(fetchOnce, POLL_INTERVAL_MS);
      } catch (e: any) {
        if (!alive) return;
        setError(e.message);
        // retry after the same interval
        pollTimerRef.current = setTimeout(fetchOnce, POLL_INTERVAL_MS);
      }
    };
    fetchOnce();
    return () => {
      alive = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [videoId]);

  const handleApprove = async () => {
    if (!video) return;
    setActionInflight('approve');
    setActionMessage(null);
    try {
      await approveVideo(videoId);
      const updated = await getVideo(videoId);
      setVideo(updated);
      setActionMessage('Утверждён');
    } catch (e: any) {
      setActionMessage(`Ошибка: ${e.message}`);
    } finally {
      setActionInflight(null);
    }
  };

  const handleReject = async () => {
    if (!video) return;
    if (!window.confirm('Точно отклонить ролик?')) return;
    setActionInflight('reject');
    setActionMessage(null);
    try {
      await rejectVideo(videoId);
      const updated = await getVideo(videoId);
      setVideo(updated);
      setActionMessage('Отклонён');
    } catch (e: any) {
      setActionMessage(`Ошибка: ${e.message}`);
    } finally {
      setActionInflight(null);
    }
  };

  if (!video && !error) {
    return (
      <div className="my-3 inline-flex items-center space-x-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Загружаю видео…</span>
      </div>
    );
  }

  if (error && !video) {
    return (
      <div className="my-3 inline-flex items-center space-x-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4" />
        <span>Не удалось загрузить ролик ({error}).</span>
      </div>
    );
  }

  if (!video) return null;

  const isRendering = video.status === 'queued' || video.status === 'rendering';
  const isReady = video.status === 'ready';
  const isFailed = video.status === 'failed';
  const isTerminal = video.status === 'approved' || video.status === 'rejected';

  return (
    <div className="my-3 max-w-md rounded-xl border border-forest-200 bg-white shadow-sm">
      <div className="border-b border-forest-100 px-4 py-2 flex items-center gap-2">
        <Film className="h-4 w-4 text-forest-600" />
        <span className="text-sm font-medium text-forest-900">Ролик</span>
        <StatusBadge status={video.status} />
      </div>

      {isRendering && (
        <div className="px-4 py-6 text-center text-sm text-gray-500">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-forest-500" />
          <p>Рендерим… (~1 минута)</p>
        </div>
      )}

      {isFailed && (
        <div className="px-4 py-4 text-sm text-red-700">
          <p className="flex items-center gap-1.5 font-medium"><AlertCircle className="h-4 w-4" />Не получилось отрендерить.</p>
          {video.errorMessage && <p className="mt-1 text-xs text-red-600">{video.errorMessage}</p>}
          <p className="mt-2 text-xs text-gray-500">Токены возвращены на баланс.</p>
        </div>
      )}

      {(isReady || isTerminal) && video.mp4Url && (
        <>
          <video
            src={video.mp4Url}
            controls
            playsInline
            className="w-full rounded-b-none"
            style={{ maxHeight: 600 }}
          />
          {video.durationSec && (
            <div className="px-4 py-1 text-xs text-gray-400">
              {video.durationSec}с · {video.sizeBytes ? `${(video.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
            </div>
          )}
        </>
      )}

      {isReady && (
        <div className="flex items-center gap-2 border-t border-forest-100 bg-forest-50 px-4 py-2">
          <button
            onClick={handleApprove}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {actionInflight === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Утвердить ролик
          </button>
          <button
            onClick={handleReject}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {actionInflight === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Отклонить
          </button>
        </div>
      )}

      {actionMessage && (
        <div className="border-t border-forest-100 bg-forest-50 px-4 py-2 text-xs text-forest-700">
          {actionMessage}
        </div>
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ status: VideoDetail['status'] }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: 'В очереди', cls: 'bg-yellow-100 text-yellow-800' },
    rendering: { label: 'Рендерим', cls: 'bg-blue-100 text-blue-800' },
    ready: { label: 'Готов', cls: 'bg-forest-100 text-forest-800' },
    failed: { label: 'Ошибка', cls: 'bg-red-100 text-red-700' },
    approved: { label: 'Утверждён', cls: 'bg-green-100 text-green-800' },
    rejected: { label: 'Отклонён', cls: 'bg-gray-200 text-gray-700' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
};
```

- [ ] **Step 4.2: TS compile**

```bash
cd /Users/dmitry/Downloads/spirits_front
npx tsc --noEmit 2>&1 | grep -E "SmmVideoPlayer" | head -10
```

Expected: no errors specific to this file.

- [ ] **Step 4.3: Commit**

```bash
git add src/components/chat/smm/SmmVideoPlayer.tsx
git commit -m "feat(smm): inline SmmVideoPlayer with status polling

Polls /webhook/smm/videos/:id every 5s until status reaches a
terminal state (ready/failed/approved/rejected). On 'ready' shows
the <video> element with mp4Url + Approve/Reject buttons. On
'failed' shows the error and notes that tokens were refunded
(handled by Plan 1 billing service automatically)."
```

---

## Task 5: Wire stream events in ChatInterface + manual e2e + deploy

This is the integration glue. ChatInterface already handles `tool_result` events for `generate_video` (line ~905). We add a parallel block for SMM tools: when AI calls `generate_scenarios`, append `{{smm_scenario:id=<uuid>}}` markers to the accumulated content for each scenario. When AI calls `approve_scenarios` with results containing `videoId`, append `{{smm_video:id=<uuid>}}` markers. When the message renders through `parseCustomMarkdown`, the new Maps from Task 1 catch these and the rendering code substitutes them with `<ScenarioCard />` / `<SmmVideoPlayer />`.

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx`

- [ ] **Step 5.1: Add imports**

Find the existing import block at the top of `src/components/chat/ChatInterface.tsx`. Add:

```typescript
import { ScenarioCard } from './smm/ScenarioCard';
import { SmmVideoPlayer } from './smm/SmmVideoPlayer';
```

- [ ] **Step 5.2: Handle SMM tool_result events in the stream loop**

Find the existing `if (data.type === 'tool_result' && data.tool === 'generate_video')` block (around line 905). Right AFTER its closing brace, add the SMM handlers (still inside the per-event loop):

```typescript
            if (data.type === 'tool_result' && data.tool === 'generate_scenarios') {
              const scenarios = data.result?.scenarios as Array<{ id: string; title: string }> | undefined;
              if (Array.isArray(scenarios)) {
                for (const sc of scenarios) {
                  accumulatedContent += `\n\n{{smm_scenario:id=${sc.id}}}`;
                }
              } else if (data.result?.error) {
                accumulatedContent += `\n\n*Ошибка генерации сценариев: ${data.result.error}*`;
              }
            }
            if (data.type === 'tool_result' && data.tool === 'approve_scenarios') {
              const approved = data.result?.approved as Array<{ scenarioId: string; videoId: string }> | undefined;
              const failed = data.result?.failed as Array<{ scenarioId: string; reason: string }> | undefined;
              if (Array.isArray(approved)) {
                for (const a of approved) {
                  accumulatedContent += `\n\n{{smm_video:id=${a.videoId}}}`;
                }
              }
              if (Array.isArray(failed) && failed.length > 0) {
                for (const f of failed) {
                  accumulatedContent += `\n\n*Не утверждено (${f.reason}): ${f.scenarioId.slice(0, 8)}…*`;
                }
              }
            }
            if (data.type === 'tool_result' && data.tool === 'regenerate_scenario') {
              const sid = data.result?.scenarioId;
              if (sid) {
                accumulatedContent += `\n\n{{smm_scenario:id=${sid}}}`;
              }
            }
```

- [ ] **Step 5.3: Substitute placeholders during render**

Find the existing message-render block that uses `parseCustomMarkdown` (around line 1563). Look for the destructure pattern `const { content: parsedContent, buttons, links, videos } = parseCustomMarkdown(contentForRender);`. Replace with:

```typescript
                    const { content: parsedContent, buttons, links, videos, smmScenarios, smmVideos } = parseCustomMarkdown(contentForRender);
```

Then find the code that iterates over the parsed content and substitutes placeholders (look for `__BUTTON_`, `__LINK_`, or `__VIDEO_` references). The render typically splits the string by these placeholders and maps them to React nodes. Add parallel handling for `__SMM_SCENARIO_` and `__SMM_VIDEO_`.

Without seeing the exact render code, the conceptual change is: in the same split/map loop, add cases like:

```typescript
                      if (segment.startsWith('__SMM_SCENARIO_')) {
                        const key = segment.replace(/^__SMM_SCENARIO_|__$/g, '');
                        const sid = smmScenarios.get(key);
                        if (sid) return <ScenarioCard key={segment} scenarioId={sid} />;
                      }
                      if (segment.startsWith('__SMM_VIDEO_')) {
                        const key = segment.replace(/^__SMM_VIDEO_|__$/g, '');
                        const vid = smmVideos.get(key);
                        if (vid) return <SmmVideoPlayer key={segment} videoId={vid} />;
                      }
```

To find the exact place: `grep -n "__BUTTON_\|__VIDEO_" src/components/chat/ChatInterface.tsx`. The same loop must be extended.

- [ ] **Step 5.4: Build + run dev**

```bash
cd /Users/dmitry/Downloads/spirits_front
pnpm dev > /tmp/spirits-front-dev.log 2>&1 &
DEV_PID=$!
sleep 6
grep -E "Local:|http" /tmp/spirits-front-dev.log | head -3
```

Expected: Vite running at `http://localhost:5173` (or similar).

- [ ] **Step 5.5: Manual e2e test**

Open `http://localhost:5173/` in a browser.

1. Login as admin (`79030169187` via OTP)
2. Open `/chat` (or whichever page has the assistant chat)
3. Select the new ассистент `smm_producer` (should appear in the list since you're admin)
4. Type "Сгенерируй 1 короткий ролик про долги"
5. Wait for the AI response. You should see:
   - Streaming text "Принял, сейчас сгенерирую…"
   - A `ScenarioCard` appearing inline below the text with the generated scenario
   - Three buttons: Утвердить / Перегенерировать / Отклонить
6. Click `Утвердить`
7. A `SmmVideoPlayer` should appear inline below, showing "Рендерим…" with a spinner
8. Within ~1 minute, the video swap to a playable `<video>` element with `Утвердить ролик` / `Отклонить` buttons
9. Click `Утвердить ролик` — status badge changes to "Утверждён"

If anything breaks visually (broken Tailwind classes, missing colors), tweak the CSS — `forest-` may need to be `primary-` etc depending on the actual theme.

Cleanup test data after manual QA:

```bash
ssh dvolkov@212.113.106.202 "PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -c \"
DELETE FROM smm_billing_ledger WHERE user_id='79030169187';
DELETE FROM smm_campaign WHERE user_id='79030169187';
\""
```

Kill dev server:

```bash
kill $DEV_PID 2>/dev/null
```

- [ ] **Step 5.6: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_front
git add src/components/chat/ChatInterface.tsx
git commit -m "feat(smm): wire SMM tool_result events into ChatInterface stream

Three new handlers in the NDJSON stream loop:
- generate_scenarios → appends {{smm_scenario:id=<uuid>}} per scenario
- approve_scenarios → appends {{smm_video:id=<uuid>}} per approved
- regenerate_scenario → appends {{smm_scenario:id=<uuid>}} for the
  regenerated one (re-renders the same id with new content)

Placeholder substitution in the render pass now also handles
__SMM_SCENARIO_<key>__ → <ScenarioCard /> and __SMM_VIDEO_<key>__
→ <SmmVideoPlayer />.

Manual e2e verified: admin → chat with smm_producer → \"сгенерируй 1
ролик\" → ScenarioCard inline → Утвердить → SmmVideoPlayer polls
status, swaps to <video> on ready → Утвердить ролик."
```

- [ ] **Step 5.7: Build + deploy to PROD**

```bash
cd /Users/dmitry/Downloads/spirits_front
echo "VITE_BACKEND_URL=https://my.linkeon.io" > .env
pnpm build 2>&1 | tail -10
ls dist/index.html && echo "build OK"

# Push code to origin (frontend repo is separate from spirits_back)
git push origin b2b 2>&1 | tail -3

# Rsync dist to server
rsync -az --delete dist/ dvolkov@212.113.106.202:/home/dvolkov/spirits_front/ 2>&1 | tail -3
```

- [ ] **Step 5.8: PROD smoke**

In a browser, navigate to `https://my.linkeon.io/chat`, login as admin, repeat the manual e2e flow. Expected: same behavior as local — scenarios card → approve → video player.

Cleanup test data:

```bash
ssh dvolkov@212.113.106.202 "PGPASSWORD=linkeon_pass_2026 psql -h 127.0.0.1 -p 5433 -U linkeon -d linkeon -c \"
DELETE FROM smm_billing_ledger WHERE user_id='79030169187';
DELETE FROM smm_campaign WHERE user_id='79030169187';
\""
```

- [ ] **Step 5.9: Tag the release**

```bash
cd /Users/dmitry/Downloads/spirits_front
git tag -a smm-plan-3b-deployed -m "Plan 3b (SMM chat UX) deployed to PROD"
git log --oneline -8
echo "Plan 3b complete: $(git rev-parse HEAD)"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- `{{smm_scenario}}` / `{{smm_video}}` CustomMarkdown blocks → Task 1 ✓
- API wrappers for 7 endpoints from Plan 3a → Task 2 ✓
- ScenarioCard React component → Task 3 ✓
- SmmVideoPlayer React component with status polling → Task 4 ✓
- Stream event handler in ChatInterface.tsx → Task 5 ✓
- Render-time placeholder → React component substitution → Task 5 ✓
- Manual e2e verification → Task 5 ✓
- PROD deploy → Task 5 ✓

`{{smm_schedule_picker}}` block intentionally NOT in Plan 3b — scheduling is part of Plan 4 (Publishers), so the picker UI lives there.

**2. Placeholder scan:** ✓ each task has actual TS/React code blocks and explicit commands with expected output.

**3. Type consistency:**
- `ScenarioDetail` and `VideoDetail` (Task 2) match the backend `SmmScenario`/`SmmVideo` shape from Plan 1 entity files (camelCase fields).
- `ApproveScenariosResult` (Task 2) matches the backend `ApproveResult` from Plan 3a Task 4.
- `parseCustomMarkdown` return adds `smmScenarios` and `smmVideos` Maps (Task 1) — destructure in Task 5 uses the same names.
- Stream event names `generate_scenarios`, `approve_scenarios`, `regenerate_scenario` match exactly the tool names registered in `SMM_PRODUCER_TOOLS` (Plan 3a Task 5).

**4. Mitigations:**
- ScenarioCard re-fetches scenario after each action to reflect the new server status — no stale state.
- SmmVideoPlayer polls every 5s with terminal-state guard — won't spam after `ready`/`failed`.
- `apiClient` already handles JWT refresh automatically — no auth handling needed in components.
- If Tailwind theme doesn't have `forest-*` colors, instructions in Task 3 note the global replacement to whatever theme color exists.
- Components use `window.prompt` and `window.confirm` for feedback/reject confirmation — minimal MVP, can be replaced with proper modal in a future polish task.

---

## Open Items Carried to Plan 4

- `{{smm_schedule_picker:videoId=...}}` block: render a time-picker + platform checkboxes after a video is approved. Plan 4 will add it together with the publisher backend.
- `connect_social` tool emits an OAuth-start URL; the chat UI needs a special render path that opens that URL in a new tab (button-link from `{{link:...}}` block already covers this, but we may want a richer card).
- Publication status display: after a publication is scheduled, the chat should show a card with platform + scheduled time + cancel button.
- Producer system prompt may need to teach the AI to emit `{{button:Утвердить | action: approve_video | videoId: ...}}` for explicit one-click approval flows. Currently approve is via the card buttons.
