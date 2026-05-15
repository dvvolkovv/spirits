# SMM Producer — Plan 3a: AI Producer Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать AI-ассистента «SMM-продюсер» в Linkeon: новый агент в `agents` таблице со своим системным промптом, генерация сценариев через Claude API, тренд-предложения через Perplexity, аппрув-флоу с автоматическим списанием токенов и enqueue в `smm-render` (Plan 2). Producer работает через существующий `chat.service.ts` streaming с собственным набором tool-calls.

**Architecture:** Расширение существующего chat-пайплайна (Anthropic SDK + tool_use) тем же паттерном что Маша (id=3) — отдельная route в `streamChat` для роли `smm_producer`. Новые сервисы `ScenarioService`/`TrendsService`/`ApprovalService` в `src/smm/producer/`. Tool handlers вызывают существующие службы Plan 1+2 (`SmmBillingService.charge`, `RenderQueueService.enqueue`). Frontend (Plan 3b) — отдельно; этот план заканчивается на работающем API + curl-тестировании.

**Tech Stack:** NestJS 10, `@anthropic-ai/sdk` (уже установлен), Perplexity API (`sonar` модель), Anthropic Claude (через существующий `ANTHROPIC_API_KEY` / OpenRouter fallback), raw `pg`.

**End-state demo:**
- В БД появилась запись `agents` с `name='smm_producer'`, `category='smm'`
- Curl-POST на `/webhook/chat` с `agentId=<smm_producer_id>` и сообщением "Сделай 2 ролика про долги" → стриминговый ответ с tool_use блоком `generate_scenarios` → 2 scenario row'ы в `smm_scenario` со статусом `pending_review`
- Curl-POST на `/webhook/smm/scenarios/:id/approve` → списание 15K токенов + render job в Redis → Plan 2 worker рендерит MP4
- Все новые internal endpoints для frontend готовы (`GET /smm/scenarios/:id`, `GET /smm/videos/:id`, etc.) — Plan 3b их использует

---

## File Structure

**Создаются:**

```
spirits_back/
├── src/smm/
│   ├── migrations/
│   │   └── 005_smm_producer_agent.sql              # INSERT into agents table
│   └── producer/
│       ├── scenario.service.ts                      # Claude → JSON scenarios
│       ├── trends.service.ts                        # Perplexity → topic ideas
│       ├── approval.service.ts                      # charge + enqueue render
│       ├── smm-producer-tools.service.ts            # tool dispatcher
│       ├── smm-producer-tools.ts                    # SMM_PRODUCER_TOOLS array (Anthropic schema)
│       ├── smm-producer.prompt.ts                   # system prompt constant
│       └── smm-producer.dto.ts                      # tool input DTOs
│   ├── scenarios/
│   │   └── scenarios.controller.ts                  # REST endpoints for frontend
│   └── videos/
│       └── videos.controller.ts                     # REST endpoints for frontend
└── tests/smm/
    ├── scenario-generation.integration.test.js
    ├── approval.integration.test.js
    └── producer-tools.integration.test.js
```

**Модифицируются:**

```
spirits_back/
├── src/smm/smm.module.ts                            # register new services + controllers
├── src/chat/chat.service.ts                         # add smm_producer routing
├── src/chat/chat-tools.ts                           # NO CHANGE — SMM tools live in separate file
├── tests/smm/index.js                               # add new test files
└── .env                                             # +PERPLEXITY_API_KEY (optional)
```

**Новые env-vars в `.env`:**

```bash
PERPLEXITY_API_KEY=...     # required for trends mode; falls back gracefully if missing
```

---

## Task 1: Add smm_producer agent to DB (migration)

**Files:**
- Create: `src/smm/migrations/005_smm_producer_agent.sql`

- [ ] **Step 1.1: Inspect existing agents schema**

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c "\d agents"
```

Expected: shows columns `id`, `name`, `description`, `system_prompt`, `category`, etc.

- [ ] **Step 1.2: Write migration**

Create `src/smm/migrations/005_smm_producer_agent.sql`:

```sql
-- 005_smm_producer_agent.sql
-- Adds the SMM-Producer agent to the agents table.
-- Chat module routes agentId == smm_producer to the SMM tool-calling path.

INSERT INTO agents (name, description, category, system_prompt)
VALUES (
  'smm_producer',
  'SMM-продюсер: придумывает сценарии для коротких роликов про Linkeon, сам генерит, отправляет на рендер, готовит к публикации.',
  'smm',
  -- The real system prompt lives in src/smm/producer/smm-producer.prompt.ts
  -- and is loaded at chat-stream time. This DB column holds a short fallback
  -- only used if the prompt file is unreachable for some reason.
  $$Ты SMM-продюсер для платформы Linkeon (my.linkeon.io). Твоя работа — придумывать короткие (60-сек вертикальные) видео-кейсы для соцсетей: ситуация-проблема → один из ассистентов Linkeon (психолог, юрист, коуч) решает её на глазах зрителя. Используй tool_use для всех действий: generate_scenarios, regenerate_scenario, approve_scenarios, approve_video. Не отвечай простым текстом, когда требуется действие — всегда вызывай tool.$$
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      category = EXCLUDED.category,
      system_prompt = EXCLUDED.system_prompt;
```

NOTE: if the `agents` table doesn't have a UNIQUE constraint on `name`, the ON CONFLICT will fail. Inspect the schema and adjust — either change to `ON CONFLICT (id) DO UPDATE` if id is provided, or use a `WHERE NOT EXISTS` pattern. Step 1.3 verifies.

- [ ] **Step 1.3: Apply migration via the existing runner**

```bash
cd /Users/dmitry/Downloads/spirits_back
DATABASE_URL="postgresql://linkeon:linkeon_pass_2026@212.113.106.202:5433/linkeon" \
  npm run migrate:dry
```

Expected: 1 pending — `smm/005_smm_producer_agent.sql`.

```bash
DATABASE_URL="postgresql://linkeon:linkeon_pass_2026@212.113.106.202:5433/linkeon" \
  npm run migrate
```

Expected: `✓ applied smm/005_smm_producer_agent.sql`.

If it fails with "no unique constraint matches ON CONFLICT", inspect the agents table:

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c "
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'agents'::regclass;
"
```

Adjust migration accordingly (e.g., use `INSERT ... WHERE NOT EXISTS` instead of `ON CONFLICT`).

- [ ] **Step 1.4: Verify the row exists**

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c \
  "SELECT id, name, category FROM agents WHERE name='smm_producer';"
```

Expected: 1 row, category='smm'. Note the `id` — you'll reference it in tests.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/smm/migrations/005_smm_producer_agent.sql
git -c commit.gpgsign=false commit -m "feat(smm): add smm_producer agent row to agents table

Adds a new agent 'smm_producer' (category 'smm') referenced by the
SMM-Producer chat routing path (Task 6).

The DB system_prompt is a fallback; the canonical full prompt lives
in src/smm/producer/smm-producer.prompt.ts (added in Task 5) and is
loaded at chat-stream time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: ScenarioService — Claude API → N scenarios JSON

**Files:**
- Create: `src/smm/producer/scenario.service.ts`
- Create: `tests/smm/scenario-generation.integration.test.js`

- [ ] **Step 2.1: Write the failing test**

Create `tests/smm/scenario-generation.integration.test.js`:

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');
const { ScenarioService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'producer', 'scenario.service'),
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pg = { query: (text, params) => pool.query(text, params) };

async function makeCampaign(userId, mode = 'topic', count = 2, topic = null) {
  const r = await pool.query(
    `INSERT INTO smm_campaign (user_id, source_mode, requested_count, topic)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, mode, count, topic],
  );
  return r.rows[0].id;
}

async function cleanup(userId) {
  await pool.query(`DELETE FROM smm_campaign WHERE user_id = $1`, [userId]);
}

module.exports = {
  'scenarios: generate 2 from topic — returns 2 rows in smm_scenario': async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('  (skip: ANTHROPIC_API_KEY not set)');
      return;
    }
    const TEST_USER = '70000099999';
    const campaignId = await makeCampaign(TEST_USER, 'topic', 2, 'тревога перед сном');
    try {
      const svc = new ScenarioService(pg);
      const ids = await svc.generate({
        campaignId,
        mode: 'topic',
        count: 2,
        topic: 'тревога перед сном',
      });
      if (ids.length !== 2) throw new Error(`Expected 2 ids, got ${ids.length}`);

      const rows = await pool.query(
        `SELECT id, title, assistant_role, dialog, mood, broll_prompts, tts_tier, status
           FROM smm_scenario WHERE campaign_id = $1`,
        [campaignId],
      );
      if (rows.rows.length !== 2) throw new Error(`Expected 2 DB rows, got ${rows.rows.length}`);
      for (const row of rows.rows) {
        if (!row.title || row.title.length < 5) throw new Error(`bad title: ${row.title}`);
        if (!['psy', 'lawyer', 'coach'].includes(row.assistant_role)) {
          throw new Error(`bad assistant_role: ${row.assistant_role}`);
        }
        if (!Array.isArray(row.dialog) || row.dialog.length < 2) {
          throw new Error(`bad dialog: ${JSON.stringify(row.dialog).slice(0, 80)}`);
        }
        for (const turn of row.dialog) {
          if (!['hero', 'assistant'].includes(turn.speaker)) throw new Error(`bad speaker`);
          if (!turn.text || typeof turn.tStart !== 'number' || typeof turn.tEnd !== 'number') {
            throw new Error(`bad turn: ${JSON.stringify(turn)}`);
          }
        }
        if (!['dramatic', 'inspiring', 'calm', 'uplifting', 'tense', 'neutral'].includes(row.mood)) {
          throw new Error(`bad mood: ${row.mood}`);
        }
        if (row.status !== 'pending_review') throw new Error(`bad status: ${row.status}`);
        if (!['economy', 'premium'].includes(row.tts_tier)) throw new Error(`bad tier`);
      }
    } finally {
      await cleanup(TEST_USER);
    }
  },

  'scenarios: regenerate one scenario produces a different dialog': async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('  (skip)');
      return;
    }
    const TEST_USER = '70000099999';
    const campaignId = await makeCampaign(TEST_USER, 'topic', 1, 'долги');
    try {
      const svc = new ScenarioService(pg);
      const [id] = await svc.generate({ campaignId, mode: 'topic', count: 1, topic: 'долги' });
      const before = await pool.query(`SELECT dialog FROM smm_scenario WHERE id = $1`, [id]);
      const oldDialog = JSON.stringify(before.rows[0].dialog);

      await svc.regenerate(id, 'сделай эмоциональнее, начни с боли');

      const after = await pool.query(`SELECT dialog, status FROM smm_scenario WHERE id = $1`, [id]);
      const newDialog = JSON.stringify(after.rows[0].dialog);
      if (newDialog === oldDialog) throw new Error('dialog unchanged after regenerate');
      if (after.rows[0].status !== 'pending_review') {
        throw new Error(`status after regen = ${after.rows[0].status}`);
      }
    } finally {
      await cleanup(TEST_USER);
    }
  },
};
```

Add to `tests/smm/index.js`:

```javascript
  ...require('./scenario-generation.integration.test'),
```

Run to confirm fail:

```bash
cd /Users/dmitry/Downloads/spirits_back/tests
node runner.js --suite smm 2>&1 | grep -E "(scenarios|Cannot find)" | head -5
```

Expected: "Cannot find module .../dist/smm/producer/scenario.service".

- [ ] **Step 2.2: Implement ScenarioService**

Create `src/smm/producer/scenario.service.ts`:

```typescript
// src/smm/producer/scenario.service.ts
import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PgService } from '../../common/services/pg.service';
import {
  SmmScenario,
  rowToScenario,
  SmmDialogTurn,
  SmmBrollPrompt,
  SmmMood,
  SmmTtsTier,
} from '../entities/smm-scenario.entity';

export type SourceMode = 'auto' | 'topic' | 'trends';

export interface GenerateInput {
  campaignId: string;
  mode: SourceMode;
  count: number;
  topic?: string | null;
  trendsContext?: string;
}

interface ClaudeScenarioJson {
  title: string;
  assistant_role: 'psy' | 'lawyer' | 'coach';
  mood: SmmMood;
  dialog: Array<{ speaker: 'hero' | 'assistant'; text: string; t_start: number; t_end: number }>;
  broll_prompts: Array<{ at_sec: number; type: 'ai_image' | 'stock_video'; prompt: string }>;
}

const SYSTEM_PROMPT = `Ты — креативный сценарист коротких видео для Linkeon (платформа AI-ассистентов: психолог, юрист, карьерный коуч).

ЗАДАЧА: сгенерируй сценарии 60-секундных вертикальных видео в формате "герой пишет в чат → ассистент отвечает → проблема решена → CTA".

ПРАВИЛА:
1. Каждый сценарий — это реальная жизненная ситуация из жанра "узнаваемая боль", решение через 1-2 совета от ассистента.
2. dialog: 2-4 реплики, каждая 5-15 секунд. t_start/t_end в секундах с начала ролика (0-55 — последние 5 сек уйдут на CTA).
3. assistant_role:
   - psy — тревога, отношения, выгорание, сон, селф-вэлью
   - lawyer — права на работе, договоры, долги, налоги, развод
   - coach — карьера, мотивация, режим дня, прокрастинация
4. mood — одно из: dramatic | inspiring | calm | uplifting | tense | neutral
5. broll_prompts — 1-2 кадра-вставки. type='ai_image' для скриншотов/абстрактных сцен, type='stock_video' для людей/живых сцен.
   - at_sec — в какой момент ролика появляется (0..50)
   - prompt — короткий промпт на английском для Imagen/Pexels
6. Реплики на русском, живой разговорный язык. БЕЗ канцелярита.

ФОРМАТ ОТВЕТА: чистый JSON-массив. Никаких пояснений до или после. Пример одного элемента:
{
  "title": "Тревога перед сном — за 30 секунд",
  "assistant_role": "psy",
  "mood": "calm",
  "dialog": [
    { "speaker": "hero", "text": "Не могу уснуть, мысли крутятся.", "t_start": 3, "t_end": 8 },
    { "speaker": "assistant", "text": "Попробуй технику 4-7-8: вдох на 4 счёта, задержка 7, выдох 8. Через минуту мозг переключится.", "t_start": 9, "t_end": 22 }
  ],
  "broll_prompts": [
    { "at_sec": 0, "type": "ai_image", "prompt": "Person lying in bed in dark room, anxious expression, vertical 9:16" },
    { "at_sec": 25, "type": "stock_video", "prompt": "woman breathing exercise relaxation" }
  ]
}`;

@Injectable()
export class ScenarioService {
  private readonly logger = new Logger(ScenarioService.name);
  private anthropic: Anthropic | null = null;

  constructor(private readonly pg: PgService) {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  async generate(input: GenerateInput): Promise<string[]> {
    if (!this.anthropic) throw new Error('ANTHROPIC_API_KEY not configured');

    const userMsg = this.buildUserMsg(input);
    this.logger.log(`Generating ${input.count} scenarios, mode=${input.mode}, topic="${input.topic ?? ''}"`);

    const resp = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });

    const textBlock = (resp.content as any[]).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Claude returned no text block');
    const text = (textBlock.text as string).trim();
    const json = this.extractJson(text);
    const arr: ClaudeScenarioJson[] = JSON.parse(json);
    if (!Array.isArray(arr)) throw new Error('Claude returned non-array JSON');
    if (arr.length === 0) throw new Error('Claude returned empty array');

    const ttsTier: SmmTtsTier = 'economy';
    const ids: string[] = [];
    for (const s of arr.slice(0, input.count)) {
      const dialog: SmmDialogTurn[] = s.dialog.map((t) => ({
        speaker: t.speaker,
        text: t.text,
        tStart: t.t_start,
        tEnd: t.t_end,
      }));
      const brollPrompts: SmmBrollPrompt[] = (s.broll_prompts ?? []).map((b) => ({
        atSec: b.at_sec,
        type: b.type,
        prompt: b.prompt,
      }));

      const r = await this.pg.query(
        `INSERT INTO smm_scenario
           (campaign_id, title, assistant_role, dialog, mood, broll_prompts, tts_tier, status)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, 'pending_review')
         RETURNING id`,
        [
          input.campaignId, s.title, s.assistant_role,
          JSON.stringify(dialog), s.mood,
          JSON.stringify(brollPrompts), ttsTier,
        ],
      );
      ids.push(r.rows[0].id);
    }
    this.logger.log(`Generated scenario ids: ${ids.join(', ')}`);
    return ids;
  }

  async regenerate(scenarioId: string, feedback: string): Promise<void> {
    if (!this.anthropic) throw new Error('ANTHROPIC_API_KEY not configured');
    const existing = await this.pg.query(
      `SELECT s.*, c.topic, c.source_mode FROM smm_scenario s
        JOIN smm_campaign c ON c.id = s.campaign_id
       WHERE s.id = $1`,
      [scenarioId],
    );
    if (existing.rows.length === 0) throw new Error(`scenario ${scenarioId} not found`);
    const row = existing.rows[0];

    const userMsg = `Перегенерируй сценарий по этому фидбеку: "${feedback}"

Текущий сценарий:
${JSON.stringify({
  title: row.title, assistant_role: row.assistant_role, mood: row.mood,
  dialog: row.dialog, broll_prompts: row.broll_prompts,
}, null, 2)}

Сохрани общую тематику (${row.topic ?? 'auto'}), но переработай согласно фидбеку. Верни ОДИН JSON-объект (не массив) в том же формате.`;

    const resp = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });
    const textBlock = (resp.content as any[]).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Claude returned no text block on regen');
    const json = this.extractJson((textBlock.text as string).trim());
    const s: ClaudeScenarioJson = JSON.parse(json);

    const dialog: SmmDialogTurn[] = s.dialog.map((t) => ({
      speaker: t.speaker, text: t.text, tStart: t.t_start, tEnd: t.t_end,
    }));
    const brollPrompts: SmmBrollPrompt[] = (s.broll_prompts ?? []).map((b) => ({
      atSec: b.at_sec, type: b.type, prompt: b.prompt,
    }));

    await this.pg.query(
      `UPDATE smm_scenario
          SET title = $1, assistant_role = $2, dialog = $3::jsonb,
              mood = $4, broll_prompts = $5::jsonb, status = 'pending_review'
        WHERE id = $6`,
      [
        s.title, s.assistant_role, JSON.stringify(dialog),
        s.mood, JSON.stringify(brollPrompts), scenarioId,
      ],
    );
    this.logger.log(`Regenerated scenario ${scenarioId}`);
  }

  async getById(scenarioId: string): Promise<SmmScenario | null> {
    const r = await this.pg.query(`SELECT * FROM smm_scenario WHERE id = $1`, [scenarioId]);
    return r.rows[0] ? rowToScenario(r.rows[0]) : null;
  }

  async listByCampaign(campaignId: string): Promise<SmmScenario[]> {
    const r = await this.pg.query(
      `SELECT * FROM smm_scenario WHERE campaign_id = $1 ORDER BY created_at`,
      [campaignId],
    );
    return r.rows.map(rowToScenario);
  }

  private buildUserMsg(input: GenerateInput): string {
    const parts: string[] = [];
    parts.push(`Сгенерируй ${input.count} разных сценариев.`);
    if (input.mode === 'topic' && input.topic) {
      parts.push(`Тематика: "${input.topic}". Все сценарии — об этом, но с разных углов.`);
    } else if (input.mode === 'trends' && input.trendsContext) {
      parts.push(`Сейчас в русскоязычных соцсетях обсуждают:\n${input.trendsContext}\n\nВыбери ${input.count} самых "цепких" сюжетов и сделай по ним кейсы.`);
    } else {
      parts.push(`Тематика свободная — выбери из разных областей (отношения, работа, юр.вопросы, мотивация). Сценарии должны различаться по тематике и assistant_role.`);
    }
    parts.push(`Верни JSON-массив длиной ${input.count}. ТОЛЬКО JSON, никаких пояснений.`);
    return parts.join('\n\n');
  }

  private extractJson(text: string): string {
    // Strip code fence if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    return text;
  }
}
```

- [ ] **Step 2.3: Wire ScenarioService into SmmModule**

In `src/smm/smm.module.ts` add import + provider + export:

```typescript
import { ScenarioService } from './producer/scenario.service';
// ... in providers and exports arrays, add: ScenarioService
```

- [ ] **Step 2.4: Build + run test**

```bash
cd /Users/dmitry/Downloads/spirits_back
npm run build 2>&1 | tail -3
cd tests
node runner.js --suite smm 2>&1 | grep -E "(scenarios|RESULTS)" | tail -5
```

Expected: 2 new tests passing. Each takes ~10-20s (Claude API latency).

- [ ] **Step 2.5: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/smm/producer/scenario.service.ts \
        src/smm/smm.module.ts \
        tests/smm/scenario-generation.integration.test.js \
        tests/smm/index.js
git -c commit.gpgsign=false commit -m "feat(smm): ScenarioService — Claude → N scenarios as smm_scenario rows

generate({ campaignId, mode, count, topic? }) calls Claude Haiku 4.5
with a tight system prompt enforcing JSON output. Inserts each
scenario as a smm_scenario row with status='pending_review'.

regenerate(scenarioId, feedback) re-prompts Claude with the current
scenario + feedback, replaces dialog/title/mood in-place.

2 integration tests cover happy-path generation (2 scenarios from
topic) and regen-with-feedback (dialog changes).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: TrendsService — Perplexity → topic ideas

**Files:**
- Create: `src/smm/producer/trends.service.ts`

- [ ] **Step 3.1: Implement TrendsService**

Create `src/smm/producer/trends.service.ts`:

```typescript
// src/smm/producer/trends.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { RedisService } from '../../common/services/redis.service';

const CACHE_KEY = 'smm:trends:cache';
const CACHE_TTL_SEC = 6 * 3600; // 6 hours

@Injectable()
export class TrendsService {
  private readonly logger = new Logger(TrendsService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Returns a multi-line string with ~10 short trend topic ideas suitable
   * for SMM video cases. Cached in Redis for 6h to avoid hammering Perplexity.
   * On error or missing API key — returns null (caller falls back to 'auto' mode).
   */
  async fetchTrendingTopics(): Promise<string | null> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      this.logger.warn('PERPLEXITY_API_KEY not set, trends unavailable');
      return null;
    }

    // Cache hit?
    try {
      const cached = await this.redis.get(CACHE_KEY);
      if (cached) {
        this.logger.debug('trends cache hit');
        return cached;
      }
    } catch (e: any) {
      this.logger.warn(`redis get failed: ${e.message}`);
    }

    const prompt = `Какие сейчас обсуждаемые в русскоязычных соцсетях (Telegram, VK, TikTok) темы из жанра "узнаваемая боль" — где люди делятся проблемами из жизни и просят совета?

Темы должны подходить для коротких видео-кейсов, где AI-психолог/юрист/коуч даёт быстрый совет. Дай 10 коротких заголовков-кейсов, каждый в одну строку, без нумерации, разделённые \\n. Например:
"Тревога перед увольнением, мысли крутятся ночами"
"Развод и раздел квартиры, как защитить детей"

Только список из 10 строк, без вступлений.`;

    try {
      const r = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 800,
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 30000,
          validateStatus: () => true,
        },
      );
      if (r.status !== 200) {
        this.logger.warn(`Perplexity ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
        return null;
      }
      const text: string = r.data?.choices?.[0]?.message?.content ?? '';
      if (!text) return null;
      // Cache for 6 hours
      try {
        await this.redis.setex(CACHE_KEY, CACHE_TTL_SEC, text);
      } catch (e: any) {
        this.logger.warn(`redis setex failed: ${e.message}`);
      }
      return text.trim();
    } catch (e: any) {
      this.logger.warn(`Perplexity call failed: ${e.message}`);
      return null;
    }
  }
}
```

- [ ] **Step 3.2: Check RedisService has `get`/`setex`**

```bash
grep -E "(async get\(|async setex\()" ~/Downloads/spirits_back/src/common/services/redis.service.ts | head -5
```

If `setex` doesn't exist, look at what's exported and adjust the TrendsService call. Common alternatives: `set(key, val, 'EX', ttl)` or `setEx(key, ttl, val)`. Inspect and use the right shape.

- [ ] **Step 3.3: Register in SmmModule**

Add `TrendsService` to providers + exports in `src/smm/smm.module.ts`.

- [ ] **Step 3.4: Build**

```bash
cd /Users/dmitry/Downloads/spirits_back
npm run build 2>&1 | tail -3
```

Expected: clean build.

- [ ] **Step 3.5: Smoke (skip if no PERPLEXITY_API_KEY)**

```bash
node -e "
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { TrendsService } = require('./dist/smm/producer/trends.service');
const { RedisService } = require('./dist/common/services/redis.service');
const redis = new RedisService();
redis.onModuleInit?.();
const svc = new TrendsService(redis);
svc.fetchTrendingTopics().then(t => {
  console.log('Result:', t ? t.slice(0, 200) + '...' : '(null — key missing or API error)');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
" 2>&1 | tail -10
```

Expected: either ~10 lines of trending topics, or 'null' if no API key.

- [ ] **Step 3.6: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/smm/producer/trends.service.ts src/smm/smm.module.ts
git -c commit.gpgsign=false commit -m "feat(smm): TrendsService — Perplexity sonar → topic ideas

fetchTrendingTopics() asks Perplexity 'sonar' for ~10 short
SMB-video-friendly topic headlines, cached 6h in Redis. Returns null
gracefully if PERPLEXITY_API_KEY is unset or upstream errors.

Consumed by ScenarioService.generate({ mode: 'trends', trendsContext }).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: ApprovalService — charge tokens + enqueue render

**Files:**
- Create: `src/smm/producer/approval.service.ts`
- Create: `tests/smm/approval.integration.test.js`

- [ ] **Step 4.1: Write failing test**

Create `tests/smm/approval.integration.test.js`:

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');
const { ApprovalService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'producer', 'approval.service'),
);
const { SmmBillingService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'billing', 'smm-billing.service'),
);
const { SmmPricingService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'billing', 'smm-pricing.service'),
);
const { RenderQueueService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'render', 'render-queue.service'),
);
const { InsufficientTokensError } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'billing', 'insufficient-tokens.error'),
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pg = { query: (text, params) => pool.query(text, params), getClient: () => pool.connect() };
const TEST_USER = '70000099999';

async function setupCampaignWithScenarios(n = 2, tier = 'economy') {
  await pool.query(
    `INSERT INTO ai_profiles_consolidated (user_id, isadmin, tokens, updated_at)
     VALUES ($1, true, 1000000, now())
     ON CONFLICT (user_id) DO UPDATE SET tokens = 1000000`, [TEST_USER]);
  const c = await pool.query(
    `INSERT INTO smm_campaign (user_id, source_mode, requested_count) VALUES ($1, 'topic', $2) RETURNING id`,
    [TEST_USER, n]);
  const ids = [];
  for (let i = 0; i < n; i++) {
    const s = await pool.query(
      `INSERT INTO smm_scenario (campaign_id, title, assistant_role, dialog, mood, tts_tier, status)
       VALUES ($1, $2, 'psy', '[]'::jsonb, 'neutral', $3, 'pending_review') RETURNING id`,
      [c.rows[0].id, `S${i}`, tier]);
    ids.push(s.rows[0].id);
  }
  return { campaignId: c.rows[0].id, scenarioIds: ids };
}

async function cleanup() {
  await pool.query(`DELETE FROM smm_billing_ledger WHERE user_id = $1`, [TEST_USER]);
  await pool.query(`DELETE FROM smm_campaign WHERE user_id = $1`, [TEST_USER]);
  await pool.query(`UPDATE ai_profiles_consolidated SET tokens = 1000000 WHERE user_id = $1`, [TEST_USER]);
}

async function buildServices() {
  const pricing = new SmmPricingService(pg);
  await pricing.onModuleInit();
  const billing = new SmmBillingService(pg, pricing);
  const queue = new RenderQueueService();
  queue.onModuleInit();
  return { billing, queue, pricing };
}

module.exports = {
  'approval: approve N scenarios → N charges + N enqueued render jobs': async () => {
    const { campaignId, scenarioIds } = await setupCampaignWithScenarios(2, 'economy');
    let queue;
    try {
      const services = await buildServices();
      queue = services.queue;
      const approval = new ApprovalService(pg, services.billing, services.queue);
      const balanceBefore = (await pool.query(
        `SELECT tokens::int as t FROM ai_profiles_consolidated WHERE user_id = $1`, [TEST_USER])).rows[0].t;

      const result = await approval.approveScenarios({ userId: TEST_USER, scenarioIds });
      if (result.approved.length !== 2) throw new Error(`Expected 2 approved, got ${result.approved.length}`);
      if (result.failed.length !== 0) throw new Error(`Unexpected failures: ${JSON.stringify(result.failed)}`);

      // Each approved entry has videoId and jobId
      for (const a of result.approved) {
        if (!a.videoId || !a.jobId) throw new Error(`bad approved entry: ${JSON.stringify(a)}`);
      }

      // Check scenarios are now status=approved
      const statuses = await pool.query(
        `SELECT status FROM smm_scenario WHERE id = ANY($1::uuid[])`, [scenarioIds]);
      for (const r of statuses.rows) {
        if (r.status !== 'approved') throw new Error(`status not approved: ${r.status}`);
      }

      // Balance decreased by 2 * 15000
      const balanceAfter = (await pool.query(
        `SELECT tokens::int as t FROM ai_profiles_consolidated WHERE user_id = $1`, [TEST_USER])).rows[0].t;
      if (balanceAfter !== balanceBefore - 2 * 15000) {
        throw new Error(`Expected ${balanceBefore - 30000}, got ${balanceAfter}`);
      }

      // 2 charge ledger rows
      const ledger = await pool.query(
        `SELECT count(*)::int as n FROM smm_billing_ledger WHERE user_id = $1 AND op = 'charge'`, [TEST_USER]);
      if (ledger.rows[0].n !== 2) throw new Error(`Expected 2 charge rows`);
    } finally {
      if (queue) await queue.onModuleDestroy?.();
      await cleanup();
    }
  },

  'approval: insufficient tokens for second scenario → first approved + second in failed list': async () => {
    const { scenarioIds } = await setupCampaignWithScenarios(2, 'economy');
    let queue;
    try {
      // Set balance to only 15000 (enough for 1 of 2)
      await pool.query(`UPDATE ai_profiles_consolidated SET tokens = 15000 WHERE user_id = $1`, [TEST_USER]);
      const services = await buildServices();
      queue = services.queue;
      const approval = new ApprovalService(pg, services.billing, services.queue);

      const result = await approval.approveScenarios({ userId: TEST_USER, scenarioIds });
      if (result.approved.length !== 1) throw new Error(`Expected 1 approved, got ${result.approved.length}`);
      if (result.failed.length !== 1) throw new Error(`Expected 1 failed, got ${result.failed.length}`);
      if (result.failed[0].reason !== 'insufficient_tokens') throw new Error(`Expected insufficient_tokens, got ${result.failed[0].reason}`);
    } finally {
      if (queue) await queue.onModuleDestroy?.();
      await cleanup();
    }
  },
};
```

Add to `tests/smm/index.js`:

```javascript
  ...require('./approval.integration.test'),
```

- [ ] **Step 4.2: Implement ApprovalService**

Create `src/smm/producer/approval.service.ts`:

```typescript
// src/smm/producer/approval.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PgService } from '../../common/services/pg.service';
import { SmmBillingService } from '../billing/smm-billing.service';
import { InsufficientTokensError } from '../billing/insufficient-tokens.error';
import { RenderQueueService } from '../render/render-queue.service';

export interface ApproveScenariosInput {
  userId: string;
  scenarioIds: string[];
}

export interface ApproveResult {
  approved: Array<{ scenarioId: string; videoId: string; jobId: string }>;
  failed: Array<{ scenarioId: string; reason: 'insufficient_tokens' | 'not_found' | 'wrong_status' | 'error'; detail?: string }>;
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly pg: PgService,
    private readonly billing: SmmBillingService,
    private readonly queue: RenderQueueService,
  ) {}

  /**
   * For each scenarioId:
   *   1. Load scenario, ensure status='pending_review' or 'regenerating'
   *   2. Create smm_video row (status='queued')
   *   3. SmmBillingService.charge → deducts tokens, inserts ledger
   *   4. Enqueue render job
   *   5. Mark scenario status='approved', video.render_job_id = jobId
   * If charge fails with InsufficientTokensError, video row is deleted (no orphan).
   */
  async approveScenarios(input: ApproveScenariosInput): Promise<ApproveResult> {
    const result: ApproveResult = { approved: [], failed: [] };

    for (const scenarioId of input.scenarioIds) {
      try {
        const scRes = await this.pg.query(
          `SELECT id, tts_tier, status FROM smm_scenario WHERE id = $1`, [scenarioId]);
        if (scRes.rows.length === 0) {
          result.failed.push({ scenarioId, reason: 'not_found' });
          continue;
        }
        const row = scRes.rows[0];
        if (!['pending_review', 'regenerating'].includes(row.status)) {
          result.failed.push({ scenarioId, reason: 'wrong_status', detail: row.status });
          continue;
        }

        // Create video row in pre-charge state. We use a temp status 'queued'
        // and set tokens_charged=0; billing will overwrite to charged amount.
        const vRes = await this.pg.query(
          `INSERT INTO smm_video (scenario_id, status, tokens_charged)
           VALUES ($1, 'queued', 0) RETURNING id`,
          [scenarioId],
        );
        const videoId = vRes.rows[0].id;

        try {
          await this.billing.charge({
            userId: input.userId,
            videoId,
            tier: row.tts_tier,
          });
        } catch (err: any) {
          // Roll back the video row so we don't orphan one
          await this.pg.query(`DELETE FROM smm_video WHERE id = $1`, [videoId]);
          if (err instanceof InsufficientTokensError) {
            result.failed.push({ scenarioId, reason: 'insufficient_tokens' });
            continue;
          }
          throw err;
        }

        const jobId = await this.queue.enqueue({ videoId, scenarioId });

        await this.pg.query(
          `UPDATE smm_scenario SET status = 'approved' WHERE id = $1`,
          [scenarioId]);
        await this.pg.query(
          `UPDATE smm_video SET render_job_id = $1 WHERE id = $2`,
          [jobId, videoId]);

        result.approved.push({ scenarioId, videoId, jobId });
        this.logger.log(`Approved scenario ${scenarioId} → video ${videoId} → job ${jobId}`);
      } catch (err: any) {
        result.failed.push({ scenarioId, reason: 'error', detail: err.message });
        this.logger.error(`Failed to approve scenario ${scenarioId}: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * Mark scenario as 'rejected' (without billing impact — nothing was charged).
   */
  async rejectScenario(scenarioId: string): Promise<void> {
    const r = await this.pg.query(
      `UPDATE smm_scenario SET status = 'rejected' WHERE id = $1 AND status = 'pending_review' RETURNING id`,
      [scenarioId]);
    if (r.rowCount === 0) {
      const check = await this.pg.query(`SELECT status FROM smm_scenario WHERE id = $1`, [scenarioId]);
      if (check.rows.length === 0) throw new NotFoundException(`scenario ${scenarioId}`);
      // Otherwise it was already approved/rejected — no-op
    }
  }

  /**
   * Mark a video as 'approved' (admin liked the rendered MP4).
   */
  async approveVideo(videoId: string): Promise<void> {
    const r = await this.pg.query(
      `UPDATE smm_video SET status = 'approved' WHERE id = $1 AND status = 'ready' RETURNING id`,
      [videoId]);
    if (r.rowCount === 0) {
      const check = await this.pg.query(`SELECT status FROM smm_video WHERE id = $1`, [videoId]);
      if (check.rows.length === 0) throw new NotFoundException(`video ${videoId}`);
      throw new Error(`video ${videoId} is in status ${check.rows[0].status}, not 'ready'`);
    }
  }

  /**
   * Mark a video as 'rejected'. No billing impact.
   */
  async rejectVideo(videoId: string, reason?: string): Promise<void> {
    const r = await this.pg.query(
      `UPDATE smm_video SET status = 'rejected', error_message = $1 WHERE id = $2 RETURNING id`,
      [reason ?? null, videoId]);
    if (r.rowCount === 0) throw new NotFoundException(`video ${videoId}`);
  }
}
```

- [ ] **Step 4.3: Register in SmmModule**

Add `ApprovalService` to providers + exports in `src/smm/smm.module.ts`.

- [ ] **Step 4.4: Build + run tests**

```bash
cd /Users/dmitry/Downloads/spirits_back
npm run build 2>&1 | tail -3
cd tests
node runner.js --suite smm 2>&1 | grep -E "(approval|RESULTS)" | tail -5
```

Expected: 2 new approval tests passing.

- [ ] **Step 4.5: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/smm/producer/approval.service.ts \
        src/smm/smm.module.ts \
        tests/smm/approval.integration.test.js \
        tests/smm/index.js
git -c commit.gpgsign=false commit -m "feat(smm): ApprovalService — charge tokens + enqueue render per scenario

approveScenarios({ userId, scenarioIds }): for each id, creates a
smm_video row, charges via SmmBillingService (Plan 1), enqueues a
render job via RenderQueueService (Plan 1), updates statuses.

On InsufficientTokensError: deletes the video row to avoid orphans
and adds the scenario to failed[] with reason='insufficient_tokens'.
Other charges in the same batch still process — partial approval is
returned (approved[], failed[]).

Also: rejectScenario(), approveVideo(), rejectVideo() for the
post-render admin review path.

2 integration tests: full happy path (2 approvals), partial fail
(balance for only 1 of 2 → first approved, second listed as failed).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: System prompt + tool schemas

**Files:**
- Create: `src/smm/producer/smm-producer.prompt.ts`
- Create: `src/smm/producer/smm-producer-tools.ts`

- [ ] **Step 5.1: System prompt**

Create `src/smm/producer/smm-producer.prompt.ts`:

```typescript
// src/smm/producer/smm-producer.prompt.ts
export const SMM_PRODUCER_SYSTEM_PROMPT = `Ты — SMM-продюсер для платформы Linkeon (my.linkeon.io — платформа AI-ассистентов: психолог, юрист, карьерный коуч). Твоя работа — придумывать короткие 60-сек вертикальные видео-кейсы для соцсетей: проблема героя → один из ассистентов Linkeon решает её на глазах зрителя → CTA.

ВОРКФЛОУ:
1. Юзер просит сценарии ("сделай 3 ролика про долги", "по трендам недели", "что-нибудь"). Ты вызываешь generate_scenarios.
2. Юзер смотрит карточки сценариев и говорит "первый ок, второй переделай", "третий отмена" и т.д. Ты вызываешь approve_scenarios(approve_ids), regenerate_scenario(reject_id, feedback), reject_scenario(reject_id) соответственно.
3. После approve пайплайн рендерит видео в фоне (~2 мин). Юзер увидит готовый MP4 в чате. Дальше approve_video или reject_video. После approve_video публикация — в Phase 2 (пока скажи "опубликую в Phase 2").

ПРАВИЛА:
- ВСЕГДА вызывай tool вместо текстового ответа, когда требуется действие.
- В тексте между tool-calls — короткие комментарии ("Принял, сейчас сгенерирую 3 кейса"). Не пиши длинные сочинения.
- Если юзер задаёт что-то off-topic (не про SMM-продюсирование) — мягко верни к работе ("я твой SMM-продюсер, давай продолжим с роликами").
- Tier по умолчанию 'economy' (Yandex SpeechKit). Если юзер просит "премиум" / "лучшее качество" / "топ голоса" — переключай на 'premium' (ElevenLabs).
- При выборе mode: если в сообщении явное упоминание темы → 'topic'; если "по трендам", "что сейчас обсуждают" → 'trends'; иначе 'auto'.
- requested_count: если юзер не указал — 3 по умолчанию.

ТОН: дружелюбный, бизнес-собранный, без излишеств. Используй короткие предложения. Ты — креативный продюсер, а не бот-секретарь.`;
```

- [ ] **Step 5.2: Tool schemas**

Create `src/smm/producer/smm-producer-tools.ts`:

```typescript
// src/smm/producer/smm-producer-tools.ts
export const SMM_PRODUCER_TOOLS = [
  {
    name: 'generate_scenarios',
    description:
      'Generate N scenarios for short SMM videos. The mode controls the source: ' +
      "'topic' — user gave an explicit theme (passed in `topic` arg); " +
      "'trends' — fetch what's hot in Russian social media and pick from there; " +
      "'auto' — let Claude pick freely from psy/lawyer/coach domains. " +
      'Creates a campaign + N pending_review scenarios in DB. Returns the campaignId and an array of scenario IDs and titles.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['auto', 'topic', 'trends'] },
        count: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
        topic: { type: 'string', description: 'Only for mode=topic. The user-specified theme in Russian.' },
      },
      required: ['mode', 'count'],
    },
  },
  {
    name: 'regenerate_scenario',
    description:
      'Re-prompt Claude to rewrite a single scenario based on user feedback. ' +
      "Use when the user says 'переделай первый', 'второй слишком длинный', etc. " +
      'Replaces dialog, title, mood in the existing smm_scenario row (keeps the same id). Returns the updated scenario id.',
    input_schema: {
      type: 'object',
      properties: {
        scenario_id: { type: 'string', description: 'UUID of the scenario to regenerate.' },
        feedback: { type: 'string', description: "User's feedback in Russian, e.g. 'короче, эмоциональнее'." },
      },
      required: ['scenario_id', 'feedback'],
    },
  },
  {
    name: 'approve_scenarios',
    description:
      "Approve one or more pending_review scenarios. For each: charges tokens (15000 economy / 50000 premium) and enqueues a render job. " +
      'If the user has insufficient tokens for some, those are returned in failed[] with reason="insufficient_tokens"; ' +
      'approved scenarios still start rendering. Returns { approved: [{ scenarioId, videoId, jobId }], failed: [{ scenarioId, reason }] }.',
    input_schema: {
      type: 'object',
      properties: {
        scenario_ids: { type: 'array', items: { type: 'string' }, description: 'UUIDs of scenarios to approve.' },
      },
      required: ['scenario_ids'],
    },
  },
  {
    name: 'reject_scenario',
    description:
      "Mark a single pending_review scenario as rejected. No billing impact (nothing was charged yet). Returns ok=true.",
    input_schema: {
      type: 'object',
      properties: {
        scenario_id: { type: 'string' },
      },
      required: ['scenario_id'],
    },
  },
  {
    name: 'approve_video',
    description:
      "Mark a rendered video (status='ready') as approved by the admin. " +
      'Returns ok=true. The next step is publication (Phase 2 — not yet wired into tools).',
    input_schema: {
      type: 'object',
      properties: {
        video_id: { type: 'string' },
      },
      required: ['video_id'],
    },
  },
  {
    name: 'reject_video',
    description:
      "Mark a rendered video as rejected. Optional reason. No automatic refund — the admin already saw the result.",
    input_schema: {
      type: 'object',
      properties: {
        video_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['video_id'],
    },
  },
  {
    name: 'list_scenarios',
    description:
      "Show the latest scenarios for a campaign (or all latest if no campaign id) with their statuses. " +
      'Used when the user asks "что там с моим заказом?" or "покажи мои сценарии".',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Optional. Filter by campaign.' },
      },
    },
  },
];
```

- [ ] **Step 5.3: Commit (no test yet — these are just constants)**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/smm/producer/smm-producer.prompt.ts \
        src/smm/producer/smm-producer-tools.ts
git -c commit.gpgsign=false commit -m "feat(smm): system prompt + tool schemas for SMM-Producer agent

smm-producer.prompt.ts: full Russian system prompt describing the
producer's role, workflow (generate → review → approve → render →
review → approve), defaults (tier=economy, count=3), and tone.

smm-producer-tools.ts: SMM_PRODUCER_TOOLS array in Anthropic format
with 7 tools: generate_scenarios, regenerate_scenario, approve_scenarios,
reject_scenario, approve_video, reject_video, list_scenarios.

Tool dispatcher (Task 6) wires these to the services from Tasks 2-4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: SmmProducerToolsService — tool dispatcher

**Files:**
- Create: `src/smm/producer/smm-producer-tools.service.ts`
- Create: `tests/smm/producer-tools.integration.test.js`

- [ ] **Step 6.1: Write failing test**

Create `tests/smm/producer-tools.integration.test.js`:

```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = require('pg');
const { SmmProducerToolsService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'producer', 'smm-producer-tools.service'),
);
const { ScenarioService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'producer', 'scenario.service'),
);
const { TrendsService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'producer', 'trends.service'),
);
const { ApprovalService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'producer', 'approval.service'),
);
const { SmmBillingService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'billing', 'smm-billing.service'),
);
const { SmmPricingService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'billing', 'smm-pricing.service'),
);
const { RenderQueueService } = require(
  path.join(__dirname, '..', '..', 'dist', 'smm', 'render', 'render-queue.service'),
);
const { RedisService } = require(
  path.join(__dirname, '..', '..', 'dist', 'common', 'services', 'redis.service'),
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pg = { query: (text, params) => pool.query(text, params), getClient: () => pool.connect() };
const TEST_USER = '70000099999';

async function buildSvc() {
  const pricing = new SmmPricingService(pg);
  await pricing.onModuleInit();
  const billing = new SmmBillingService(pg, pricing);
  const queue = new RenderQueueService();
  queue.onModuleInit();
  const redis = new RedisService();
  redis.onModuleInit?.();
  const scenario = new ScenarioService(pg);
  const trends = new TrendsService(redis);
  const approval = new ApprovalService(pg, billing, queue);
  return { svc: new SmmProducerToolsService(pg, scenario, trends, approval), queue };
}

async function cleanup() {
  await pool.query(`DELETE FROM smm_billing_ledger WHERE user_id = $1`, [TEST_USER]);
  await pool.query(`DELETE FROM smm_campaign WHERE user_id = $1`, [TEST_USER]);
  await pool.query(`UPDATE ai_profiles_consolidated SET tokens = 1000000 WHERE user_id = $1`, [TEST_USER]);
}

module.exports = {
  'producer-tools: list_scenarios with no campaign — returns empty list (no error)': async () => {
    const { svc, queue } = await buildSvc();
    try {
      const out = await svc.handle('list_scenarios', {}, { userId: TEST_USER });
      if (!Array.isArray(out.scenarios)) throw new Error('expected scenarios array');
    } finally {
      await queue.onModuleDestroy?.();
      await cleanup();
    }
  },

  'producer-tools: reject_scenario on pending → status becomes rejected': async () => {
    const { svc, queue } = await buildSvc();
    try {
      await pool.query(
        `INSERT INTO ai_profiles_consolidated (user_id, isadmin, tokens, updated_at)
         VALUES ($1, true, 1000000, now()) ON CONFLICT (user_id) DO UPDATE SET tokens = 1000000`, [TEST_USER]);
      const c = await pool.query(
        `INSERT INTO smm_campaign (user_id, source_mode, requested_count) VALUES ($1, 'topic', 1) RETURNING id`, [TEST_USER]);
      const s = await pool.query(
        `INSERT INTO smm_scenario (campaign_id, title, assistant_role, dialog, mood, tts_tier)
         VALUES ($1, 't', 'psy', '[]'::jsonb, 'neutral', 'economy') RETURNING id`, [c.rows[0].id]);

      const out = await svc.handle('reject_scenario', { scenario_id: s.rows[0].id }, { userId: TEST_USER });
      if (out.ok !== true) throw new Error(`expected ok=true, got ${JSON.stringify(out)}`);

      const r = await pool.query(`SELECT status FROM smm_scenario WHERE id = $1`, [s.rows[0].id]);
      if (r.rows[0].status !== 'rejected') throw new Error(`expected rejected, got ${r.rows[0].status}`);
    } finally {
      await queue.onModuleDestroy?.();
      await cleanup();
    }
  },

  'producer-tools: unknown tool name → error response': async () => {
    const { svc, queue } = await buildSvc();
    try {
      const out = await svc.handle('foo', {}, { userId: TEST_USER });
      if (!out.error) throw new Error('expected error response');
      if (!out.error.includes('unknown tool')) throw new Error(`bad error: ${out.error}`);
    } finally {
      await queue.onModuleDestroy?.();
      await cleanup();
    }
  },
};
```

Add to `tests/smm/index.js`:

```javascript
  ...require('./producer-tools.integration.test'),
```

- [ ] **Step 6.2: Implement SmmProducerToolsService**

Create `src/smm/producer/smm-producer-tools.service.ts`:

```typescript
// src/smm/producer/smm-producer-tools.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../../common/services/pg.service';
import { ScenarioService, SourceMode } from './scenario.service';
import { TrendsService } from './trends.service';
import { ApprovalService } from './approval.service';
import { rowToCampaign } from '../entities/smm-campaign.entity';

export interface ToolContext {
  userId: string;
  /** Most recent campaign id this user opened in the current chat session (optional). */
  recentCampaignId?: string;
}

@Injectable()
export class SmmProducerToolsService {
  private readonly logger = new Logger(SmmProducerToolsService.name);

  constructor(
    private readonly pg: PgService,
    private readonly scenario: ScenarioService,
    private readonly trends: TrendsService,
    private readonly approval: ApprovalService,
  ) {}

  async handle(toolName: string, input: any, ctx: ToolContext): Promise<any> {
    try {
      switch (toolName) {
        case 'generate_scenarios': return await this.generateScenarios(input, ctx);
        case 'regenerate_scenario': return await this.regenerateScenario(input);
        case 'approve_scenarios':   return await this.approveScenarios(input, ctx);
        case 'reject_scenario':     return await this.rejectScenario(input);
        case 'approve_video':       return await this.approveVideo(input);
        case 'reject_video':        return await this.rejectVideo(input);
        case 'list_scenarios':      return await this.listScenarios(input, ctx);
        default:
          return { error: `unknown tool: ${toolName}` };
      }
    } catch (err: any) {
      this.logger.error(`tool ${toolName} failed: ${err.message}`);
      return { error: err.message };
    }
  }

  private async generateScenarios(
    input: { mode: SourceMode; count: number; topic?: string },
    ctx: ToolContext,
  ): Promise<{ campaignId: string; scenarios: Array<{ id: string; title: string }> }> {
    // 1. Create campaign
    const cRes = await this.pg.query(
      `INSERT INTO smm_campaign (user_id, source_mode, requested_count, topic, status)
       VALUES ($1, $2, $3, $4, 'drafting') RETURNING id`,
      [ctx.userId, input.mode, input.count, input.topic ?? null],
    );
    const campaignId = cRes.rows[0].id;

    // 2. For trends mode — fetch trends context
    let trendsContext: string | undefined;
    if (input.mode === 'trends') {
      const trends = await this.trends.fetchTrendingTopics();
      if (trends) trendsContext = trends;
      else this.logger.warn('trends unavailable, falling back to auto-mode generation');
    }

    // 3. Generate
    const ids = await this.scenario.generate({
      campaignId,
      mode: input.mode,
      count: input.count,
      topic: input.topic ?? null,
      trendsContext,
    });

    // 4. Return id+title for each
    const rows = await this.pg.query(
      `SELECT id, title FROM smm_scenario WHERE id = ANY($1::uuid[])`, [ids]);
    return {
      campaignId,
      scenarios: rows.rows.map((r: any) => ({ id: r.id, title: r.title })),
    };
  }

  private async regenerateScenario(input: { scenario_id: string; feedback: string }): Promise<{ scenarioId: string; title: string }> {
    await this.scenario.regenerate(input.scenario_id, input.feedback);
    const s = await this.scenario.getById(input.scenario_id);
    if (!s) throw new Error(`scenario ${input.scenario_id} not found after regen`);
    return { scenarioId: s.id, title: s.title };
  }

  private async approveScenarios(input: { scenario_ids: string[] }, ctx: ToolContext) {
    const r = await this.approval.approveScenarios({
      userId: ctx.userId,
      scenarioIds: input.scenario_ids,
    });
    return r;
  }

  private async rejectScenario(input: { scenario_id: string }): Promise<{ ok: true }> {
    await this.approval.rejectScenario(input.scenario_id);
    return { ok: true };
  }

  private async approveVideo(input: { video_id: string }): Promise<{ ok: true }> {
    await this.approval.approveVideo(input.video_id);
    return { ok: true };
  }

  private async rejectVideo(input: { video_id: string; reason?: string }): Promise<{ ok: true }> {
    await this.approval.rejectVideo(input.video_id, input.reason);
    return { ok: true };
  }

  private async listScenarios(input: { campaign_id?: string }, ctx: ToolContext): Promise<{ scenarios: Array<{ id: string; title: string; status: string }> }> {
    const query = input.campaign_id
      ? `SELECT id, title, status FROM smm_scenario WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 20`
      : `SELECT s.id, s.title, s.status FROM smm_scenario s
         JOIN smm_campaign c ON c.id = s.campaign_id
         WHERE c.user_id = $1 ORDER BY s.created_at DESC LIMIT 20`;
    const r = await this.pg.query(query, [input.campaign_id ?? ctx.userId]);
    return { scenarios: r.rows };
  }
}
```

- [ ] **Step 6.3: Register + build + test**

Add `SmmProducerToolsService` to `src/smm/smm.module.ts` providers + exports.

```bash
cd /Users/dmitry/Downloads/spirits_back
npm run build 2>&1 | tail -3
cd tests
node runner.js --suite smm 2>&1 | grep -E "(producer-tools|RESULTS)" | tail -5
```

Expected: 3 new tests passing.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/smm/producer/smm-producer-tools.service.ts \
        src/smm/smm.module.ts \
        tests/smm/producer-tools.integration.test.js \
        tests/smm/index.js
git -c commit.gpgsign=false commit -m "feat(smm): SmmProducerToolsService — tool dispatcher

Single handle(toolName, input, ctx) entry point. Switches on toolName
and delegates to ScenarioService / TrendsService / ApprovalService.
Catches errors and returns them as { error: msg } so the agent can
gracefully report them to the user.

For generate_scenarios: creates campaign + delegates to ScenarioService
with optional trends context (skipped if Perplexity unavailable).

3 integration tests cover list_scenarios (empty), reject_scenario
(status transition), and unknown tool name (error response).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wire SMM-Producer agent route into chat.service.ts

This is the integration point. The chat module's `streamChat` already routes one agent (Маша, id=3) through a direct-Anthropic + CHAT_TOOLS path. We add a parallel branch: if the agent name === `smm_producer`, run a similar tool-calling loop but with `SMM_PRODUCER_TOOLS` and `SMM_PRODUCER_SYSTEM_PROMPT`, dispatching tool calls via `SmmProducerToolsService.handle`.

**Files:**
- Modify: `src/chat/chat.service.ts` (add new branch)
- Modify: `src/chat/chat.module.ts` (import SmmModule so SmmProducerToolsService is injectable)

- [ ] **Step 7.1: Inspect current Маша branch**

```bash
cd /Users/dmitry/Downloads/spirits_back
sed -n '80,260p' src/chat/chat.service.ts | head -100
```

Read carefully. Note the variables used: `agent.name`, `agent.id`, `llmMessages`, `req.user`, `res` (response stream), the Anthropic stream loop with `tool_use`.

- [ ] **Step 7.2: Modify chat.service.ts**

Find the existing routing block (around line 80-100 based on the grep). It checks `agent.id === 3` (Маша) and routes to the CHAT_TOOLS path. Add a parallel check BEFORE Маша:

```typescript
// Route SMM-Producer agent to its dedicated tool path
if (agent?.name === 'smm_producer') {
  return this.streamSmmProducer(req.user.phone, agent, llmMessages, res);
}
```

Then add a NEW METHOD at the bottom of the class:

```typescript
// src/chat/chat.service.ts — append at the end of ChatService class
private async streamSmmProducer(
  userId: string,
  agent: any,
  llmMessages: any[],
  res: any,
): Promise<void> {
  const { SMM_PRODUCER_SYSTEM_PROMPT } = require('../smm/producer/smm-producer.prompt');
  const { SMM_PRODUCER_TOOLS } = require('../smm/producer/smm-producer-tools');

  if (!this.anthropic) {
    res.write(JSON.stringify({ type: 'error', message: 'Anthropic not configured' }) + '\n');
    res.end();
    return;
  }

  const messages: any[] = [...llmMessages];
  const ctx = { userId };
  let safetyTurns = 6;

  while (safetyTurns-- > 0) {
    let assistantText = '';
    let stopReason: string | null = null;
    let finalMessage: any = null;

    try {
      const stream = this.anthropic.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: SMM_PRODUCER_SYSTEM_PROMPT,
        tools: SMM_PRODUCER_TOOLS as any,
        messages,
      });
      stream.on('text', (chunk: string) => {
        assistantText += chunk;
        res.write(JSON.stringify({ type: 'item', content: chunk }) + '\n');
      });
      finalMessage = await stream.finalMessage();
      stopReason = finalMessage.stop_reason;
    } catch (e: any) {
      this.logger.error(`SMM-Producer stream error: ${e.message}`);
      res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
      res.end();
      return;
    }

    if (stopReason !== 'tool_use') {
      // Final text response
      break;
    }

    // Process tool_use blocks
    const toolUseBlocks = (finalMessage.content as any[]).filter((b) => b?.type === 'tool_use');
    messages.push({ role: 'assistant', content: finalMessage.content });

    const toolResults: any[] = [];
    for (const block of toolUseBlocks) {
      const toolName = block.name;
      const toolInput = block.input;
      this.logger.log(`SMM-Producer tool call: ${toolName} ${JSON.stringify(toolInput).slice(0, 100)}`);
      const result = await this.smmProducerTools.handle(toolName, toolInput, ctx);

      // Emit a structured event for the frontend (Plan 3b will parse this)
      res.write(JSON.stringify({
        type: 'tool_result',
        tool: toolName,
        result,
      }) + '\n');

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  res.end();
}
```

- [ ] **Step 7.3: Inject SmmProducerToolsService**

Add to the constructor signature in `chat.service.ts`:

```typescript
constructor(
  // ... existing deps ...
  private readonly smmProducerTools: SmmProducerToolsService,
) {}
```

Add import at the top:

```typescript
import { SmmProducerToolsService } from '../smm/producer/smm-producer-tools.service';
```

- [ ] **Step 7.4: Import SmmModule into ChatModule**

In `src/chat/chat.module.ts`:

```typescript
import { SmmModule } from '../smm/smm.module';
// ... in @Module imports array: SmmModule
```

This makes `SmmProducerToolsService` injectable into `ChatService`.

- [ ] **Step 7.5: Build**

```bash
cd /Users/dmitry/Downloads/spirits_back
npm run build 2>&1 | tail -10
```

Expected: clean build. If circular dep error (SmmModule ← ChatModule ← SmmModule) — wrap import with `forwardRef(() => SmmModule)`.

- [ ] **Step 7.6: Smoke — direct API curl through chat with smm_producer agent**

This requires a fresh admin JWT. Get one via OTP flow:

```bash
curl -sf "https://my.linkeon.io/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/79030169187" >/dev/null
CODE=$(curl -s "https://my.linkeon.io/webhook/debug/sms-code/79030169187" | jq -r '.code')
ADMIN_JWT=$(curl -s "https://my.linkeon.io/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/79030169187/$CODE" | jq -r '."access-token"')
```

Get smm_producer agent id from DB:

```bash
SMM_AGENT_ID=$(PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -tA -c "SELECT id FROM agents WHERE name='smm_producer'")
echo "agent id: $SMM_AGENT_ID"
```

Start API locally:

```bash
cd /Users/dmitry/Downloads/spirits_back
lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; sleep 1
PORT=3001 npm run start:dev > /tmp/smm-chat-test.log 2>&1 &
APP_PID=$!
sleep 12
```

Call the chat endpoint (the exact path depends on the chat module — `grep '@Post' src/chat/chat.controller.ts` to find it). Likely something like:

```bash
curl -N -X POST http://localhost:3001/webhook/soulmate/chat \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":$SMM_AGENT_ID, \"message\":\"Сделай 2 ролика про долги\"}" 2>&1 | head -40
```

Expected: streaming NDJSON response. First text-only chunks ("Принял, сейчас сгенерирую..."), then a `tool_result` event with `tool=generate_scenarios` and `result={ campaignId, scenarios: [{ id, title }, ...] }`.

If the chat endpoint path differs, adjust. Note: this smoke takes 30-60 sec because Claude does scenario generation through the tool call.

- [ ] **Step 7.7: Cleanup**

```bash
kill $APP_PID 2>/dev/null || true
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c \
  "DELETE FROM smm_campaign WHERE user_id='79030169187';"
```

- [ ] **Step 7.8: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/chat/chat.service.ts src/chat/chat.module.ts
git -c commit.gpgsign=false commit -m "feat(smm): chat route for smm_producer agent with tool-calling loop

Adds streamSmmProducer() to ChatService: a tool-aware Anthropic
streaming loop using SMM_PRODUCER_SYSTEM_PROMPT + SMM_PRODUCER_TOOLS.
Routes agent.name === 'smm_producer' to this method.

Each tool_use block is dispatched through SmmProducerToolsService.handle()
and the result is both streamed back to the frontend (as a structured
{type:'tool_result', tool, result} event) and fed back into the
conversation as a tool_result message for the next turn.

Safety: max 6 tool-turns per user message to prevent infinite loops.

ChatModule now imports SmmModule so SmmProducerToolsService is injectable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: REST endpoints for frontend (used by Plan 3b)

The chat UI needs to fetch scenario + video details for the inline cards. Add three GET endpoints + three POST endpoints (the buttons on the cards):

**Files:**
- Create: `src/smm/scenarios/scenarios.controller.ts`
- Create: `src/smm/videos/videos.controller.ts`
- Modify: `src/smm/smm.module.ts`

- [ ] **Step 8.1: ScenariosController**

```typescript
// src/smm/scenarios/scenarios.controller.ts
import {
  Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ScenarioService } from '../producer/scenario.service';
import { ApprovalService } from '../producer/approval.service';

@Controller('webhook/smm/scenarios')
@UseGuards(JwtGuard, AdminGuard)
export class ScenariosController {
  constructor(
    private readonly scenarios: ScenarioService,
    private readonly approval: ApprovalService,
  ) {}

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const s = await this.scenarios.getById(id);
    if (!s) throw new NotFoundException(`scenario ${id} not found`);
    return s;
  }

  @Post(':id/approve')
  async approveOne(@Req() req: any, @Param('id') id: string) {
    return this.approval.approveScenarios({ userId: req.user.phone, scenarioIds: [id] });
  }

  @Post(':id/regenerate')
  async regen(@Param('id') id: string, @Body() body: { feedback: string }) {
    await this.scenarios.regenerate(id, body.feedback || '');
    return { ok: true };
  }

  @Delete(':id')
  async reject(@Param('id') id: string) {
    await this.approval.rejectScenario(id);
    return { ok: true };
  }
}
```

- [ ] **Step 8.2: VideosController**

```typescript
// src/smm/videos/videos.controller.ts
import { Controller, Get, NotFoundException, Param, Post, Body, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PgService } from '../../common/services/pg.service';
import { rowToVideo } from '../entities/smm-video.entity';
import { ApprovalService } from '../producer/approval.service';

@Controller('webhook/smm/videos')
@UseGuards(JwtGuard, AdminGuard)
export class VideosController {
  constructor(
    private readonly pg: PgService,
    private readonly approval: ApprovalService,
  ) {}

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const r = await this.pg.query(`SELECT * FROM smm_video WHERE id = $1`, [id]);
    if (r.rows.length === 0) throw new NotFoundException(`video ${id} not found`);
    return rowToVideo(r.rows[0]);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string) {
    await this.approval.approveVideo(id);
    return { ok: true };
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    await this.approval.rejectVideo(id, body?.reason);
    return { ok: true };
  }
}
```

- [ ] **Step 8.3: Register both in SmmModule**

In `src/smm/smm.module.ts`, add both controllers to the `controllers` array.

- [ ] **Step 8.4: Build + smoke**

```bash
cd /Users/dmitry/Downloads/spirits_back
npm run build 2>&1 | tail -3
# Quick smoke: GET on existing scenario id (use one from Task 2 test, or create one)
```

- [ ] **Step 8.5: Commit**

```bash
cd /Users/dmitry/Downloads/spirits_back
git add src/smm/scenarios/scenarios.controller.ts \
        src/smm/videos/videos.controller.ts \
        src/smm/smm.module.ts
git -c commit.gpgsign=false commit -m "feat(smm): REST endpoints for frontend scenario+video cards

GET    /webhook/smm/scenarios/:id          — fetch scenario detail
POST   /webhook/smm/scenarios/:id/approve  — approve one (frontend button)
POST   /webhook/smm/scenarios/:id/regenerate — regen with feedback
DELETE /webhook/smm/scenarios/:id          — reject

GET    /webhook/smm/videos/:id             — fetch video detail
POST   /webhook/smm/videos/:id/approve     — approve rendered MP4
POST   /webhook/smm/videos/:id/reject      — reject rendered MP4

All admin-only (JwtGuard + AdminGuard). Reuse ApprovalService from Task 4.

Plan 3b (frontend) consumes these from the {{smm_scenario}} and
{{smm_video}} CustomMarkdown blocks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Deploy to PROD + verify

- [ ] **Step 9.1: Merge worktree → b2b**

```bash
cd /Users/dmitry/Downloads/spirits_back
git checkout b2b
git merge --no-ff <plan-3a-branch> -m "Merge Plan 3a: AI Producer backend"
git push origin b2b
```

- [ ] **Step 9.2: Add PERPLEXITY_API_KEY to server .env (optional but recommended)**

```bash
ssh dvolkov@212.113.106.202 'grep -q "^PERPLEXITY_API_KEY=" ~/spirits_back/.env || \
  echo "PERPLEXITY_API_KEY=<your-key-here>" >> ~/spirits_back/.env'
```

If you don't have a Perplexity key, the trends mode will gracefully fall back to auto-mode (Task 3 handles this).

- [ ] **Step 9.3: Rsync + build + migrate + restart**

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
pm2 restart linkeon-api
sleep 6
pm2 status linkeon-api | head -8
'
```

Expected: migration `005_smm_producer_agent.sql` applied, linkeon-api restarted, status `online`.

- [ ] **Step 9.4: PROD smoke — chat as admin with smm_producer agent**

Get fresh JWT (admin = 79030169187), find agent id, send a message:

```bash
ADMIN_JWT=...   # via OTP flow as in Plan 1 Task 9
SMM_AGENT_ID=$(PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -tA -c "SELECT id FROM agents WHERE name='smm_producer'")
echo "agent id: $SMM_AGENT_ID"

curl -N -X POST https://my.linkeon.io/webhook/soulmate/chat \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":$SMM_AGENT_ID,\"message\":\"Сделай 2 коротких ролика про долги по кредитке\"}" 2>&1 | head -40
```

Expected: streaming response with `{"type":"item","content":"..."}` chunks then `{"type":"tool_result","tool":"generate_scenarios","result":{"campaignId":"<uuid>","scenarios":[{"id":"<uuid>","title":"..."},{"id":"<uuid>","title":"..."}]}}`.

Verify in DB:

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c "
SELECT s.title, s.status, s.assistant_role, s.mood
FROM smm_scenario s JOIN smm_campaign c ON c.id = s.campaign_id
WHERE c.user_id = '79030169187' ORDER BY s.created_at DESC LIMIT 5;
"
```

Should show 2 fresh scenarios with status=pending_review.

Cleanup:

```bash
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c \
  "DELETE FROM smm_campaign WHERE user_id='79030169187'"
```

- [ ] **Step 9.5: PROD end-to-end smoke — approve a scenario, watch render**

```bash
# Same as Step 9.4 but capture the first scenario id, then call /approve
SCENARIO_ID=...    # extract from previous response
curl -X POST https://my.linkeon.io/webhook/smm/scenarios/$SCENARIO_ID/approve \
  -H "Authorization: Bearer $ADMIN_JWT"
# → { approved: [{ scenarioId, videoId, jobId }], failed: [] }

# Watch the video status
VIDEO_ID=...   # from response
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  STATUS=$(PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -tA -c "SELECT status||'|'||COALESCE(mp4_url,'') FROM smm_video WHERE id='$VIDEO_ID'")
  echo "$(date +%H:%M:%S) $STATUS"
  if echo "$STATUS" | grep -qE '^ready\||^failed\|'; then break; fi
  sleep 10
done

# Cleanup
PGPASSWORD=linkeon_pass_2026 psql -h 212.113.106.202 -p 5433 -U linkeon -d linkeon -c \
  "DELETE FROM smm_campaign WHERE user_id='79030169187'; DELETE FROM smm_billing_ledger WHERE user_id='79030169187';"
```

Expected: status `queued → rendering → ready` within ~75-90s. mp4_url populated.

- [ ] **Step 9.6: Tag the release**

```bash
cd ~/Downloads/spirits_back
git tag -a smm-plan-3a-deployed -m "Plan 3a (AI Producer backend) deployed to PROD"
git log --oneline -10
echo "Plan 3a complete: $(git rev-parse HEAD)"
```

---

## Self-Review Checklist

**1. Spec coverage (vs Plan 1+2 designs):**
- AI scenario generation → Task 2 ✓
- Trends via Perplexity → Task 3 ✓
- Approval flow with billing + enqueue → Task 4 ✓
- SMM_PRODUCER_TOOLS in Anthropic format → Task 5 ✓
- System prompt → Task 5 ✓
- Tool dispatcher → Task 6 ✓
- Chat-stream integration (route smm_producer agent → tool loop) → Task 7 ✓
- REST endpoints for frontend → Task 8 ✓
- Production deployment → Task 9 ✓

Scheduling/publishing tools (`schedule_publication`, `cancel_publication`, `list_publications`, `connect_social`) are intentionally OUT of Plan 3a — they go into Plan 4 (Publishers).

**2. Placeholder scan:** ✓ each Task has actual SQL/TS code blocks and explicit commands with expected output.

**3. Type consistency:**
- `SourceMode = 'auto' | 'topic' | 'trends'` — defined in Task 2 (ScenarioService), reused as the schema enum in Task 5 (tool input) and as the `mode` field in Task 6 (dispatcher).
- `ApproveResult.approved` items have `{ scenarioId, videoId, jobId }` — Task 4 returns this shape, Task 5 tool description references it, Task 6 dispatcher passes through unchanged.
- `SMM_PRODUCER_TOOLS` array name is consistent (Task 5 defines, Task 7 imports).
- `SMM_PRODUCER_SYSTEM_PROMPT` constant name consistent (Task 5 → Task 7).

**4. Notable mitigations:**
- ChatModule importing SmmModule may produce a circular dep if SmmModule ever imports ChatModule. Currently it doesn't, so a regular import works. If a future task adds that direction, swap to `forwardRef`.
- The chat stream loop has a safety limit `safetyTurns = 6` — prevents runaway tool-call loops.
- Trends mode degrades gracefully if `PERPLEXITY_API_KEY` is missing (TrendsService returns null, ScenarioService falls back to auto mode for that call).
- Each tool call returns either `{ ...result }` or `{ error: msg }` — never throws into the stream loop. Caller can decide what to render.

---

## Open Items Carried to Plan 3b

- New CustomMarkdown blocks `{{smm_scenario:id=...}}`, `{{smm_video:id=...}}`, `{{smm_schedule_picker:videoId=...}}` in `spirits_front`.
- Inline scenario card React component (fetches from `GET /webhook/smm/scenarios/:id`, shows dialog preview + Accept/Regen/Reject buttons that call the controllers from Task 8).
- Inline MP4 video player React component (fetches from `GET /webhook/smm/videos/:id`, shows mp4_url + Accept/Reject buttons).
- Schedule picker widget (stub — actual scheduling is Plan 4).
- Stream event handler: the new `{type:'tool_result', tool, result}` events emitted from Task 7 need to be picked up by `ChatInterface.tsx` and converted into inline cards.

---

## Open Items Carried to Plan 4

- `connect_social(platform)` tool (returns OAuth start URL link).
- `schedule_publication(videoId, platforms[], scheduledAt)` tool (creates `smm_publication` rows + delayed BullMQ jobs).
- `cancel_publication(publicationId)` tool.
- `list_publications(status?)` tool.
- Publisher adapters (TG/VK/YT/TT/IG) + OAuth flows.
