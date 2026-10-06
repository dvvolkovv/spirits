# Кнопка «Прослушать» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Под каждым завершённым ответом ассистента рядом с «Копировать» стоит кнопка «Прослушать». Она читает ответ голосом ассистента из настроек и списывает токены по тарифу озвучки; повтор бесплатен.

**Architecture:** На бэке новая ручка `POST /webhook/speech/listen` поверх `SpeechService`. Текст режется на куски под лимит провайдера (`split.ts`) и синтезируется не больше чем по три куска одновременно. Списание одно на весь текст, кэш в своей таблице `speech_listens`: чат её не читает. На фронте `toSpeechText` готовит текст для чтения, `useListenPlayer` держит один общий `<audio>` и играет куски подряд, а `ListenButton` встаёт в строку под ответом в `ChatInterface`.

**Tech Stack:** NestJS 10 + pg + jest (бэк); React 18 + TypeScript + vitest + i18next + react-hot-toast + lucide-react (фронт).

**Спека:** `docs/superpowers/specs/2026-10-06-listen-to-answer-design.md`.

---

## Где работать

- Бэк: ворктри `~/Downloads/spirits_back/.worktrees/listen-answer`, ветка `feat/listen-answer` от `origin/main`. Ниже он обозначен `$BACK`.
- Фронт: ворктри `~/Downloads/spirits_front/.worktrees/listen-answer`, та же ветка. Ниже — `$FRONT`. `node_modules` — симлинк на основной чекаут (зависимости те же).
- **Тесты бэка — только на тест-ноде** (решение владельца: мак не тянет; к тому же jest игнорирует пути с `/.worktrees/`). Свой ворктри на ноде: `~/ci/wt/listen-back`. Прогон:

  ```bash
  git -C $BACK push -q origin feat/listen-answer
  SHA=$(git -C $BACK rev-parse HEAD)
  ssh dv@85.192.61.231 "git -C ~/ci/spirits_back fetch -q origin && (test -d ~/ci/wt/listen-back || git -C ~/ci/spirits_back worktree add -q --detach ~/ci/wt/listen-back $SHA) && git -C ~/ci/wt/listen-back checkout -q --detach $SHA && cd ~/ci/wt/listen-back && source ~/.nvm/nvm.sh && (test -d node_modules || npm ci --no-audit --no-fund >/dev/null) && npx jest src/speech 2>&1 | tail -40"
  ```

- **Фронт:** точечные тесты локально под Node 22: `PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run <файл>`. На системном Node 26 jsdom ломается. Полный `pnpm test` и `pnpm build` — на ноде в `~/ci/wt/listen-front`.

## Файлы

| Файл | Что |
|---|---|
| `$BACK/src/speech/split.ts` (новый) | `splitForSpeech(text, maxChars)` — куски по абзацам, предложениям, пробелам |
| `$BACK/src/speech/split.spec.ts` (новый) | его тесты |
| `$BACK/src/speech/migrations/002_speech_listens.sql` (новый) | таблица кэша прослушиваний |
| `$BACK/src/speech/speech.service.ts` | `onModuleInit` (накат миграций модуля); хелперы `hitRateLimit`, `voiceFor`, `debit`, вынесенные из `synthesize`; `mapLimit`; `listen()`; `LISTEN_MAX_CHARS` |
| `$BACK/src/speech/speech.listen.spec.ts` (новый) | тесты `listen`, `mapLimit`, `onModuleInit` |
| `$BACK/src/speech/speech.controller.ts` | `POST listen` и `listenStatus()` |
| `$BACK/src/speech/speech.controller.spec.ts` (новый) | статусы ответа |
| `$FRONT/src/components/chat/listen/speechText.ts` (новый) | `toSpeechText`, `LISTEN_MAX_CHARS`, `listenPrice` |
| `$FRONT/src/components/chat/listen/speechText.test.ts` (новый) | его тесты |
| `$FRONT/src/components/chat/listen/useListenPlayer.ts` (новый) | общий плеер ленты |
| `$FRONT/src/components/chat/listen/ListenButton.tsx` (новый) | кнопка |
| `$FRONT/src/components/chat/listen/ListenButton.test.tsx` (новый) | кнопка + плеер на стенде `src/test/dom.tsx` |
| `$FRONT/src/components/chat/listenWiring.test.ts` (новый) | сторож связки в `ChatInterface` |
| `$FRONT/src/components/chat/ChatInterface.tsx` | плеер, остановка при смене ассистента, кнопка в строке под ответом, `flex-wrap` |
| `$FRONT/src/i18n/locales/{ru,en,de,es,fr,pt,zh}.json` | 9 ключей `chat.listen*` |

---

### Task 1: `splitForSpeech`

**Files:**
- Create: `$BACK/src/speech/split.ts`
- Test: `$BACK/src/speech/split.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/speech/split.spec.ts
import { splitForSpeech } from './split';

/** Все непробельные символы по порядку — по ним сверяем, что текст не потерян. */
const squash = (s: string) => s.replace(/\s+/g, '');

describe('splitForSpeech', () => {
  it('короткий текст — один кусок как есть', () => {
    expect(splitForSpeech('Привет. Как дела?', 2000)).toEqual(['Привет. Как дела?']);
  });

  it('пустой и пробельный текст — ни одного куска', () => {
    expect(splitForSpeech('', 2000)).toEqual([]);
    expect(splitForSpeech('  \n ', 2000)).toEqual([]);
  });

  it('каждый кусок не длиннее лимита, и склейка сохраняет весь текст', () => {
    const text = 'Это предложение для проверки разбиения. '.repeat(200);
    const chunks = splitForSpeech(text, 2000);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2000);
    expect(squash(chunks.join(' '))).toBe(squash(text));
  });

  it('режет по концу предложения, а не посреди слова', () => {
    const chunks = splitForSpeech('Первое предложение. '.repeat(150), 2000);
    expect(chunks[0].endsWith('.')).toBe(true);
    expect(chunks[1].startsWith('Первое')).toBe(true);
  });

  it('предпочитает границу абзаца', () => {
    const p1 = 'а'.repeat(1200) + '.';
    const p2 = 'Второй абзац. '.repeat(100);
    expect(splitForSpeech(`${p1}\n\n${p2}`, 2000)[0]).toBe(p1);
  });

  it('абзац в самом начале не дробит текст на лишний крошечный кусок', () => {
    const text = 'Заголовок\n' + 'слово '.repeat(400);
    const chunks = splitForSpeech(text, 2000);
    expect(chunks[0].startsWith('Заголовок')).toBe(true);
    expect(chunks[0].length).toBeGreaterThan(1000);
  });

  it('конец предложения с закрывающей кавычкой — граница после кавычки', () => {
    const text = ('Он сказал: «Готово.» ').repeat(120);
    const chunks = splitForSpeech(text, 2000);
    expect(chunks[0].endsWith('»')).toBe(true);
  });

  it('предложение длиннее лимита режется по пробелу', () => {
    const text = 'слово '.repeat(500).trim();
    const chunks = splitForSpeech(text, 2000);
    expect(chunks).toHaveLength(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(2000);
      expect(c.startsWith('слово')).toBe(true);
      expect(c.endsWith('слово')).toBe(true);
    }
  });

  it('слово длиннее лимита режется жёстко', () => {
    expect(splitForSpeech('я'.repeat(4500), 2000).map((c) => c.length)).toEqual([2000, 2000, 500]);
  });

  it('лимит меньше единицы — ошибка, а не вечный цикл', () => {
    expect(() => splitForSpeech('текст', 0)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Прогнать на ноде — красный**

Команда — из раздела «Где работать», с `npx jest src/speech/split.spec.ts`. Ожидается: `Cannot find module './split'`.

- [ ] **Step 3: Реализация**

```ts
// src/speech/split.ts

/**
 * Режет текст на куски не длиннее maxChars — для синтеза ответа по частям.
 *
 * Кнопка «Прослушать» отдаёт целый ответ ассистента, а у провайдера потолок
 * на один запрос (maxCharsFor: 2000 у Yandex, 4000 у OpenAI). Граница ищется
 * от самой естественной к самой грубой: конец абзаца → конец предложения →
 * пробел; слово длиннее лимита режется посередине. Абзац и предложение берём,
 * только если кусок выходит хотя бы в половину лимита, — иначе текст
 * раздробился бы на лишние запросы к провайдеру.
 *
 * Инварианты (их сторожат тесты): кусков без текста нет, каждый не длиннее
 * maxChars, склейка сохраняет все непробельные символы в исходном порядке.
 */
export function splitForSpeech(text: string, maxChars: number): string[] {
  if (!(maxChars >= 1)) throw new RangeError(`maxChars must be >= 1, got ${maxChars}`);
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > maxChars) {
    const cut = findCut(rest, maxChars);
    const head = rest.slice(0, cut).trim();
    if (head) chunks.push(head);
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function findCut(text: string, maxChars: number): number {
  // +1: перевод строки или пробел ровно на границе тоже годится — он уйдёт
  // при trim, и кусок выйдет ровно в maxChars.
  const window = text.slice(0, maxChars + 1);
  const minUseful = Math.ceil(maxChars / 2);

  const para = window.lastIndexOf('\n');
  if (para >= minUseful) return para + 1;

  // Конец предложения: знаки препинания, за ними могут стоять закрывающие
  // кавычки и скобки, дальше обязателен пробельный символ.
  const sentenceEnd = /[.!?…]+["»”’')\]]*(?=\s)/g;
  let sentence = -1;
  let m: RegExpExecArray | null;
  while ((m = sentenceEnd.exec(window)) !== null) {
    const end = m.index + m[0].length;
    if (end <= maxChars) sentence = end;
  }
  if (sentence >= minUseful) return sentence;

  const space = window.lastIndexOf(' ');
  if (space > 0) return space + 1;

  return maxChars;
}
```

- [ ] **Step 4: Прогнать на ноде — зелёный**

`npx jest src/speech/split.spec.ts`. Ожидается: 10 passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/speech/split.ts src/speech/split.spec.ts
git -C $BACK commit -m "feat(speech): splitForSpeech — куски ответа под лимит провайдера"
```

### Task 2: таблица `speech_listens` и накат миграций модуля при старте

**Files:**
- Create: `$BACK/src/speech/migrations/002_speech_listens.sql`
- Modify: `$BACK/src/speech/speech.service.ts` (импорты, `implements OnModuleInit`, метод `onModuleInit`)
- Test: `$BACK/src/speech/speech.listen.spec.ts` (новый, первый `describe`)

- [ ] **Step 1: Падающий тест**

```ts
// src/speech/speech.listen.spec.ts
import * as fs from 'fs';
import * as path from 'path';
import { SpeechService } from './speech.service';

/**
 * Таблицы модуля создаются при старте API: `npm run migrate` на проде
 * застревает на base/001 и до speech/ не доходит.
 */
describe('SpeechService.onModuleInit — таблицы модуля при старте', () => {
  const firstLine = (sql: string) => sql.trim().split('\n')[0];

  function makeInit(failOn?: RegExp) {
    const calls: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        calls.push(firstLine(sql));
        if (failOn && failOn.test(sql)) throw new Error('lock timeout');
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    const pg: any = { query: jest.fn(), getClient: jest.fn(async () => client) };
    const svc = new SpeechService(pg, {} as any, {} as any, {} as any);
    return { svc, calls, client, pg };
  }

  it('применяет миграции модуля по порядку, каждую своей транзакцией с lock_timeout', async () => {
    const { svc, calls, client } = makeInit();
    await svc.onModuleInit();
    expect(calls).toEqual([
      'BEGIN', "SET LOCAL lock_timeout = '3s'", '-- 001_speech_clips.sql', 'COMMIT',
      'BEGIN', "SET LOCAL lock_timeout = '3s'", '-- 002_speech_listens.sql', 'COMMIT',
    ]);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it('сбой одной миграции не роняет старт и не мешает следующей', async () => {
    const { svc, calls, client } = makeInit(/ALTER TABLE speech_clips/);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
    expect(calls).toContain('ROLLBACK');
    expect(calls).toContain('-- 002_speech_listens.sql');
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it('нет соединения с базой — старт не падает', async () => {
    const pg: any = { query: jest.fn(), getClient: jest.fn(async () => { throw new Error('ECONNREFUSED'); }) };
    const svc = new SpeechService(pg, {} as any, {} as any, {} as any);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('002 создаёт speech_listens: user_id text, parts jsonb, уникальный ключ кэша', () => {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '002_speech_listens.sql'), 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS speech_listens/);
    expect(sql).toMatch(/user_id\s+text NOT NULL/);
    expect(sql).toMatch(/parts\s+jsonb NOT NULL/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS speech_listens_user_key\s+ON speech_listens \(user_id, cache_key\)/);
  });
});
```

- [ ] **Step 2: Прогнать на ноде — красный**

`npx jest src/speech/speech.listen.spec.ts`. Ожидается: `svc.onModuleInit is not a function` и ENOENT на `002_speech_listens.sql`.

- [ ] **Step 3: Миграция**

```sql
-- 002_speech_listens.sql
-- Прослушивания ответов кнопкой «Прослушать» (POST /webhook/speech/listen).
--
-- Отдельно от speech_clips НАМЕРЕННО: chat.service.ts в конце стрима
-- подхватывает строки speech_clips за время ответа — вставляет маркер плеера
-- {{audio:id=…}} и прибавляет их tokens_spent к счётчику «X токенов». Нажми
-- пользователь «Прослушать» на старом ответе, пока ассистент пишет новый, —
-- новый получил бы чужой плеер и чужую цену.
--
-- cache_key = sha256(text voice lang), как у speech_clips: тот же ответ другим
-- голосом — другая запись. parts — публичные URL кусков в порядке чтения:
-- длинный ответ синтезируется по частям (split.ts).
-- user_id = text: у email/OAuth-пользователей это uuid на 36 символов.
CREATE TABLE IF NOT EXISTS speech_listens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL,
  assistant    text,
  cache_key    text NOT NULL,
  parts        jsonb NOT NULL,
  chars        int NOT NULL,
  provider     text NOT NULL,
  voice        text NOT NULL,
  lang         text NOT NULL,
  tokens_spent int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS speech_listens_user_key
  ON speech_listens (user_id, cache_key);
```

- [ ] **Step 4: `onModuleInit` в `SpeechService`**

Импорты в начале `speech.service.ts` заменить на:

```ts
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
```

Объявление класса — `export class SpeechService implements OnModuleInit {`. Сразу после конструктора добавить:

```ts
  /**
   * Таблицы модуля создаются при старте API, как в routine-push: `npm run
   * migrate` на проде застревает на base/001 и до speech/ не доходит. Все
   * файлы идемпотентны (IF NOT EXISTS). Каждый — своей транзакцией на
   * выделенном соединении с lock_timeout: ALTER из 001 берёт эксклюзивную
   * блокировку speech_clips даже вхолостую, и чужой долгий запрос не должен
   * подвесить старт. Ошибка пишется в лог и старт API не роняет.
   *
   * В dist .sql не копируются (nest-cli без assets), поэтому второй путь —
   * исходники рядом со сборкой.
   */
  async onModuleInit(): Promise<void> {
    const dir = [
      path.join(__dirname, 'migrations'),
      path.join(__dirname, '..', '..', 'src', 'speech', 'migrations'),
    ].find((d) => fs.existsSync(d));
    if (!dir) {
      this.logger.warn('speech migrations dir not found');
      return;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      let client: any = null;
      try {
        client = await this.pg.getClient();
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '3s'");
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('COMMIT');
        this.logger.log(`speech migration applied: ${f}`);
      } catch (e: any) {
        if (client) {
          try { await client.query('ROLLBACK'); } catch { /* соединение уже мёртвое */ }
        }
        this.logger.error(`speech migration failed (${f}): ${e?.message}`);
      } finally {
        client?.release();
      }
    }
  }
```

- [ ] **Step 5: Прогнать на ноде — зелёный**

`npx jest src/speech`. Ожидается: новые 4 теста и все старые `speech.service.spec.ts` зелёные.

- [ ] **Step 6: Коммит**

```bash
git -C $BACK add src/speech/migrations/002_speech_listens.sql src/speech/speech.service.ts src/speech/speech.listen.spec.ts
git -C $BACK commit -m "feat(speech): таблица speech_listens и накат миграций модуля при старте"
```

### Task 3: вынести общие части `synthesize` в хелперы (без изменения поведения)

**Files:**
- Modify: `$BACK/src/speech/speech.service.ts`

Страховка — существующий `speech.service.spec.ts`: он сверяет SQL регулярками и считает списания. Текст SQL не меняется.

- [ ] **Step 1: Добавить в класс три приватных метода** (после `onModuleInit`)

```ts
  /**
   * Лимит частоты: один бюджет на инструмент generate_speech и кнопку
   * «Прослушать». expire ставим только на первом попадании в окно, иначе TTL
   * продлевается каждым вызовом и окно никогда не закрывается.
   */
  private async hitRateLimit(userId: string): Promise<boolean> {
    const rlKey = `speech:rl:${userId}`;
    const hits = await this.redis.incr(rlKey);
    if (hits === 1) await this.redis.expire(rlKey, 60);
    if (hits > RATE_LIMIT_PER_MIN) {
      this.logger.warn(`rate limited: user=${userId} hits=${hits}`);
      return true;
    }
    return false;
  }

  /**
   * Голос: выбор в настройках (profile_data.assistant_voices) → дефолт
   * ассистента → дефолт по полу. Ассистент — переданный явно (кнопка
   * «Прослушать» знает, чья лента), иначе preferred_agent из БД, иначе Роман.
   */
  private async voiceFor(
    userId: string,
    lang: string,
    opts: { assistant?: string; requested?: string } = {},
  ): Promise<{ assistantName: string; resolved: ResolvedVoice }> {
    const profRes = await this.pg.query(
      'SELECT preferred_agent, profile_data FROM ai_profiles_consolidated WHERE user_id = $1',
      [userId],
    );
    const assistantName: string = opts.assistant || profRes.rows[0]?.preferred_agent || DEFAULT_ASSISTANT;
    const userChoice: string | undefined =
      profRes.rows[0]?.profile_data?.assistant_voices?.[assistantName];

    const resolved = resolveVoice({ lang, assistantName, userChoice, requested: opts.requested });
    for (const r of resolved.rejected) {
      this.logger.warn(`voice rejected: source=${r.source} voice=${r.voice} lang=${lang}`);
    }
    return { assistantName, resolved };
  }

  /**
   * Списание со строкой в реестре. Остаток после списания или null, если
   * денег не хватило.
   *
   * УСЛОВНЫЙ UPDATE, а не общий MiscService.deductTokens. deductTokens делает
   * безусловный `tokens = tokens - $1`, а проверка баланса у вызывающих —
   * отдельный запрос. Описание инструмента прямо поощряет пачку вызовов подряд
   * («сценка по ролям»), и параллельные вызовы все читают один и тот же
   * достаточный баланс, после чего каждый списывает: баланс 1000 и пять
   * параллельных синтезов дают −4000. Условие `tokens >= $1` делает проверку
   * и списание одной атомарной операцией. Общий deductTokens намеренно НЕ
   * трогаем: им пользуются другие фичи.
   *
   * Строку в token_transactions пишем сами и в одной транзакции со списанием:
   * consume_user_tokens при нехватке забирает остаток, а здесь нужен отказ
   * целиком. Без этой записи расход на синтез не виден в общей истории —
   * ровно та дыра, которую 20.08.2026 нашла сверка баланса с реестром.
   */
  private async debit(
    userId: string,
    amount: number,
    description: string,
    metadata: Record<string, unknown>,
  ): Promise<number | null> {
    const payClient = await this.pg.getClient();
    let paid: { rows: any[] };
    try {
      await payClient.query('BEGIN');
      paid = await payClient.query(
        'UPDATE ai_profiles_consolidated SET tokens = tokens - $1, updated_at = now() WHERE user_id = $2 AND tokens >= $1 RETURNING tokens',
        [amount, userId],
      );
      if (paid.rows.length > 0) {
        await payClient.query(
          `INSERT INTO token_transactions (user_id, transaction_type, amount, balance_after, description, metadata)
           VALUES ($1, 'consumed', $2, $3, $4, $5::jsonb)`,
          [userId, -amount, Number(paid.rows[0].tokens), description, JSON.stringify(metadata)],
        );
      }
      await payClient.query('COMMIT');
    } catch (e: any) {
      try { await payClient.query('ROLLBACK'); } catch {}
      this.logger.error(`speech deduct failed: ${e.message}`);
      throw e;
    } finally {
      payClient.release();
    }
    return paid.rows.length > 0 ? Number(paid.rows[0].tokens) : null;
  }
```

Импорт голосов: `import { resolveVoice, ResolvedVoice, TtsProvider } from './voices';`.

- [ ] **Step 2: Перевести `synthesize` на хелперы**

Блок от комментария «Потолок 20/мин…» до цикла `for (const r of resolved.rejected) {…}` включительно заменить на:

```ts
    // Потолок 20/мин, а не 10: сценка по ролям — это десяток синтезов подряд
    // в одном ответе ассистента, она не должна упираться в лимит.
    if (await this.hitRateLimit(userId)) {
      return { ok: false, error: 'rate_limited', retryAfterSec: 60 };
    }

    const lang = await this.language.resolveUserLanguage(userId);

    // Ассистент берётся из БД, а не из аргументов инструмента: по MCP модель
    // сама подставляет аргументы и может назвать чужого ассистента.
    const { assistantName, resolved } = await this.voiceFor(userId, lang, { requested: input.voice });
```

Блок от комментария «Списываем только после успешного синтеза и заливки…» до `if (paid.rows.length === 0) {` заменить на:

```ts
    // Списываем только после успешного синтеза и заливки (debit — условным
    // UPDATE со строкой в реестре).
    //
    // null = денег не хватило. Синтез к этому моменту уже выполнен и файл
    // залит — это осознанная плата за то, что списание идёт последним: лучше
    // один раз впустую сходить к провайдеру, чем увести баланс в минус.
    //
    // А строку в speech_clips в этом случае надо убрать компенсацией: пара
    // (user_id, cache_key) — это и есть кэш, и неоплаченный клип достался бы
    // пользователю бесплатно при первом же повторе того же текста. Удаляем
    // адресно по id только что вставленной строки, чтобы не задеть клип
    // параллельного вызова (тот случай уже отработан веткой ON CONFLICT выше).
    //
    // Объект в MinIO остаётся сиротой — он недостижим без строки (getClip ходит
    // по id + user_id), а ключ детерминирован (audio/<cache_key>.mp3), так что
    // оплаченный повтор просто перезапишет его тем же содержимым.
    const clipId = String(ins.rows[0].id);
    const paid = await this.debit(userId, required, 'Синтез речи', {
      clip_id: clipId, chars: text.length, voice: resolved.voice, provider: resolved.provider,
    });

    if (paid === null) {
```

Остальное тело ветки (DELETE компенсации, перечитка баланса, `return insufficient_tokens`) и финальный `return` не меняются.

- [ ] **Step 3: Прогнать на ноде весь `src/speech` и tsc**

Добавить к команде прогона `&& npx tsc -p tsconfig.build.json --noEmit`. Ожидается: все тесты `speech.service.spec.ts` (включая гонку баланса, реестр, кэш-хит, ретраи) зелёные, tsc без ошибок.

- [ ] **Step 4: Коммит**

```bash
git -C $BACK add src/speech/speech.service.ts
git -C $BACK commit -m "refactor(speech): лимит частоты, выбор голоса и списание — общими хелперами"
```

### Task 4: `mapLimit` и `SpeechService.listen`

**Files:**
- Modify: `$BACK/src/speech/speech.service.ts`
- Test: `$BACK/src/speech/speech.listen.spec.ts` (дописать)

- [ ] **Step 1: Падающие тесты** — дописать в `speech.listen.spec.ts` (импорт сверху расширить до `import { SpeechService, LISTEN_MAX_CHARS, mapLimit } from './speech.service';`)

```ts
/**
 * Заглушки без сети и БД. Баланс — настоящее изменяемое состояние, UPDATE
 * ведёт себя как Postgres: условие `AND tokens >= $1` берётся ИЗ ТЕКСТА
 * запроса. INSERT уважает уникальность (user_id, cache_key) — как ON CONFLICT
 * DO NOTHING на боевом индексе.
 */
function makeService(overrides: any = {}) {
  const state = {
    balance: overrides.balance ?? 100000,
    profile: overrides.profile ?? { preferred_agent: 'Роман', profile_data: {} },
  };
  const rows: { listens: any[] } = { listens: [] };
  const deduct = jest.fn();
  const deleted = jest.fn();
  const touched = jest.fn();
  const ledger: any[] = [];
  const sqlLog: string[] = [];
  let seq = 0;

  const pg: any = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      sqlLog.push(sql);
      if (/UPDATE speech_listens SET last_used_at/.test(sql)) {
        touched(params[0]);
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE ai_profiles_consolidated SET tokens = tokens - \$1/.test(sql)) {
        const [amount, uid] = params;
        if (/tokens >= \$1/.test(sql) && state.balance < amount) return { rows: [] };
        state.balance -= amount;
        deduct(uid, amount);
        return { rows: [{ tokens: state.balance }] };
      }
      if (/DELETE FROM speech_listens/.test(sql)) {
        const [id, uid] = params;
        rows.listens = rows.listens.filter((r) => !(r.id === id && r.user_id === uid));
        deleted(id, uid);
        return { rows: [] };
      }
      if (/INSERT INTO speech_listens/.test(sql)) {
        // Колонки — ИЗ ТЕКСТА запроса: заглушка не знает схему заранее и
        // уронит тест, если сервис перестанет что-то писать.
        const cols = String(sql.match(/INSERT INTO speech_listens \(([^)]*)\)/)?.[1] ?? '')
          .split(',').map((c) => c.trim());
        const row: any = {};
        cols.forEach((c, i) => { row[c] = params[i]; });
        if (rows.listens.some((r) => r.user_id === row.user_id && r.cache_key === row.cache_key)) {
          return { rows: [] };
        }
        row.id = `listen-${++seq}`;
        row.parts = JSON.parse(row.parts); // jsonb pg отдаёт уже разобранным
        rows.listens.push(row);
        return { rows: [{ id: row.id }] };
      }
      if (/FROM speech_listens/.test(sql)) {
        const hit = rows.listens.find((r) => r.user_id === params[0] && r.cache_key === params[1]);
        return { rows: hit ? [hit] : [] };
      }
      if (/preferred_agent/.test(sql)) return { rows: [state.profile] };
      if (/SELECT tokens/.test(sql)) return { rows: [{ tokens: state.balance }] };
      return { rows: [] };
    }),
    async getClient() {
      return {
        query: async (sql: string, params: any[] = []) => {
          if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
          if (/INSERT INTO token_transactions/i.test(sql)) {
            ledger.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
            return { rows: [] };
          }
          return pg.query(sql, params);
        },
        release: () => {},
      };
    },
  };

  const storage = { upload: jest.fn(async (input: any) => `https://minio.test/${input.bucket}/${input.key}`) };
  const language = { resolveUserLanguage: jest.fn(async () => overrides.lang ?? 'ru') };
  const redis = { incr: jest.fn(async () => 1), expire: jest.fn(async () => undefined) };
  const svc = new SpeechService(pg, storage as any, language as any, redis as any);
  // Сеть подменяем: тестируем оркестрацию. Байты куска = его текст — так видно,
  // какой кусок в какой файл ушёл.
  const synth = jest.fn(async (_provider: string, chunk: string, _voice: string) => Buffer.from(chunk));
  (svc as any).synthesizeWith = synth;
  return { svc, pg, storage, synth, deduct, deleted, touched, ledger, rows, state, redis, sqlLog };
}

const squash = (s: string) => s.replace(/\s+/g, '');

describe('SpeechService.listen — свежий синтез', () => {
  it('короткий ответ: один кусок голосом ассистента, списание по тарифу', async () => {
    const { svc, synth, deduct, storage } = makeService();
    const r: any = await svc.listen('u1', { text: 'Привет! Это ответ ассистента.', assistant: 'Роман' });
    expect(r).toMatchObject({ ok: true, voice: 'zahar', provider: 'yandex', tokensSpent: 1000, cached: false, chars: 29 });
    expect(r.parts).toHaveLength(1);
    expect(synth).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(deduct).toHaveBeenCalledWith('u1', 1000);
  });

  it('длинный русский ответ режется по 2000, а списание одно — за всю длину', async () => {
    const { svc, synth, deduct, ledger, state } = makeService({ balance: 10000 });
    const text = 'Это предложение для проверки. '.repeat(150).trim(); // 4499 знаков
    const r: any = await svc.listen('u1', { text });
    expect(r.ok).toBe(true);
    expect(synth.mock.calls.length).toBe(3);
    for (const [, chunk] of synth.mock.calls) expect(chunk.length).toBeLessThanOrEqual(2000);
    expect(r.parts).toHaveLength(3);
    expect(deduct).toHaveBeenCalledTimes(1);
    expect(deduct).toHaveBeenCalledWith('u1', 5000);
    expect(ledger).toHaveLength(1);
    expect(state.balance).toBe(5000);
  });

  it('куски лежат в хранилище по порядку чтения, даже если синтез завершился вразнобой', async () => {
    const { svc, synth, storage } = makeService();
    synth.mockImplementation(async (_p: string, chunk: string) => {
      // Первые куски отвечают дольше последних.
      await new Promise((res) => setTimeout(res, chunk.startsWith('Раз') ? 15 : 1));
      return Buffer.from(chunk);
    });
    const text = ['Раз. '.repeat(390), 'Два. '.repeat(390), 'Три. '.repeat(390)].join('\n').trim();
    const r: any = await svc.listen('u1', { text });
    const bodies = storage.upload.mock.calls.map((c: any[]) => String(c[0].body));
    expect(squash(bodies.join(' '))).toBe(squash(text));
    const keys = storage.upload.mock.calls.map((c: any[]) => c[0].key);
    keys.forEach((k: string, i: number) => expect(k).toMatch(new RegExp(`^audio/listen/[0-9a-f]{64}-${i}\\.mp3$`)));
    expect(r.parts).toEqual(keys.map((k: string) => `https://minio.test/linkeon-assets/${k}`));
  });

  it('не больше трёх запросов к провайдеру одновременно', async () => {
    const { svc, synth } = makeService();
    let inFlight = 0;
    let peak = 0;
    synth.mockImplementation(async (_p: string, chunk: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((res) => setTimeout(res, 5));
      inFlight--;
      return Buffer.from(chunk);
    });
    await svc.listen('u1', { text: 'Предложение номер один. '.repeat(400).trim() }); // 9599 знаков
    expect(synth.mock.calls.length).toBe(5);
    expect(peak).toBe(3);
  });

  it('пишет в реестр «Озвучка ответа» с остатком и подробностями', async () => {
    const { svc, ledger } = makeService({ balance: 5000 });
    await svc.listen('u1', { text: 'Привет' });
    expect(ledger).toHaveLength(1);
    const [userId, amount, balanceAfter, description, metadata] = ledger[0].params;
    expect(ledger[0].sql).toMatch(/'consumed'/);
    expect(userId).toBe('u1');
    expect(amount).toBe(-1000);
    expect(balanceAfter).toBe(4000);
    expect(description).toBe('Озвучка ответа');
    expect(JSON.parse(metadata)).toMatchObject({ chars: 6, parts: 1, voice: 'zahar', provider: 'yandex' });
  });

  it('в speech_clips не пишет и не читает — чат не подхватит прослушивание', async () => {
    const { svc, sqlLog } = makeService();
    await svc.listen('u1', { text: 'Привет' });
    await svc.listen('u1', { text: 'Привет' });
    expect(sqlLog.some((s) => /speech_clips/.test(s))).toBe(false);
  });
});

describe('SpeechService.listen — кэш', () => {
  it('повтор того же текста бесплатен и не зовёт провайдера', async () => {
    const { svc, synth, deduct, touched } = makeService();
    const first: any = await svc.listen('u1', { text: 'Привет' });
    const second: any = await svc.listen('u1', { text: 'Привет' });
    expect(second).toMatchObject({ ok: true, cached: true, tokensSpent: 0 });
    expect(second.parts).toEqual(first.parts);
    expect(synth).toHaveBeenCalledTimes(1);
    expect(deduct).toHaveBeenCalledTimes(1);
    expect(touched).toHaveBeenCalledTimes(1);
  });

  it('оплаченное прослушивание отдаётся и при нулевом балансе', async () => {
    const { svc, state } = makeService({ balance: 1000 });
    await svc.listen('u1', { text: 'Привет' });
    expect(state.balance).toBe(0);
    const again: any = await svc.listen('u1', { text: 'Привет' });
    expect(again).toMatchObject({ ok: true, cached: true, tokensSpent: 0 });
  });

  it('другой ассистент — другой голос — новый синтез', async () => {
    const { svc, synth } = makeService();
    await svc.listen('u1', { text: 'Привет', assistant: 'Роман' });
    const r: any = await svc.listen('u1', { text: 'Привет', assistant: 'Маша' });
    expect(r).toMatchObject({ ok: true, voice: 'jane', cached: false });
    expect(synth).toHaveBeenCalledTimes(2);
  });

  it('кэш у каждого пользователя свой', async () => {
    const { svc, deduct } = makeService();
    await svc.listen('u1', { text: 'Привет' });
    const r: any = await svc.listen('u2', { text: 'Привет' });
    expect(r.cached).toBe(false);
    expect(deduct).toHaveBeenCalledTimes(2);
  });

  it('гонку вставки выиграл параллельный запрос — второй не платит', async () => {
    const { svc, deduct } = makeService();
    const [a, b]: any[] = await Promise.all([
      svc.listen('u1', { text: 'Привет' }),
      svc.listen('u1', { text: 'Привет' }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(deduct).toHaveBeenCalledTimes(1);
    expect([a.tokensSpent, b.tokensSpent].sort((x: number, y: number) => x - y)).toEqual([0, 1000]);
  });
});

describe('SpeechService.listen — голос', () => {
  it('без assistant берётся preferred_agent', async () => {
    const { svc } = makeService({ profile: { preferred_agent: 'Маша', profile_data: {} } });
    const r: any = await svc.listen('u1', { text: 'Привет' });
    expect(r.voice).toBe('jane');
  });

  it('выбор пользователя в настройках побеждает дефолт ассистента', async () => {
    const { svc } = makeService({
      profile: { preferred_agent: 'Роман', profile_data: { assistant_voices: { 'Маша': 'marina' } } },
    });
    const r: any = await svc.listen('u1', { text: 'Привет', assistant: 'Маша' });
    expect(r.voice).toBe('marina');
  });

  it('английский — OpenAI-голос ассистента и куски до 4000', async () => {
    const { svc, synth } = makeService({ lang: 'en' });
    const r: any = await svc.listen('u1', { text: 'This is a sentence for the test. '.repeat(150).trim(), assistant: 'Маша' });
    expect(r).toMatchObject({ ok: true, provider: 'openai', voice: 'shimmer' });
    expect(synth.mock.calls.length).toBe(2);
    for (const [, chunk] of synth.mock.calls) expect(chunk.length).toBeLessThanOrEqual(4000);
  });
});

describe('SpeechService.listen — отказы', () => {
  it('пустой текст', async () => {
    const { svc, synth } = makeService();
    const r: any = await svc.listen('u1', { text: '  \n ' });
    expect(r).toEqual({ ok: false, error: 'empty_text' });
    expect(synth).not.toHaveBeenCalled();
  });

  it('длиннее потолка — отказ без синтеза и без списания', async () => {
    const { svc, synth, deduct } = makeService();
    const r: any = await svc.listen('u1', { text: 'я'.repeat(LISTEN_MAX_CHARS + 1) });
    expect(r).toEqual({ ok: false, error: 'text_too_long', maxChars: 10000 });
    expect(synth).not.toHaveBeenCalled();
    expect(deduct).not.toHaveBeenCalled();
  });

  it('ровно потолок проходит', async () => {
    const { svc } = makeService();
    const r: any = await svc.listen('u1', { text: 'я'.repeat(LISTEN_MAX_CHARS) });
    expect(r).toMatchObject({ ok: true, tokensSpent: 10000 });
  });

  it('нехватка баланса — отказ до провайдера', async () => {
    const { svc, synth, deduct } = makeService({ balance: 1500 });
    const r: any = await svc.listen('u1', { text: 'я'.repeat(1500) });
    expect(r).toEqual({ ok: false, error: 'insufficient_tokens', balance: 1500, required: 2000 });
    expect(synth).not.toHaveBeenCalled();
    expect(deduct).not.toHaveBeenCalled();
  });

  it('отказ провайдера на любом куске — ничего не залито, не сохранено и не списано', async () => {
    const { svc, synth, deduct, rows, storage } = makeService();
    synth.mockImplementation(async (_p: string, chunk: string) => {
      if (synth.mock.calls.length === 2) throw new Error('Yandex TTS 503');
      return Buffer.from(chunk);
    });
    const r: any = await svc.listen('u1', { text: 'Предложение номер один. '.repeat(200).trim() });
    expect(r).toEqual({ ok: false, error: 'tts_failed' });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(rows.listens).toHaveLength(0);
    expect(deduct).not.toHaveBeenCalled();
  });

  it('сбой заливки в хранилище — отказ без списания', async () => {
    const { svc, storage, deduct, rows } = makeService();
    storage.upload.mockRejectedValueOnce(new Error('MinIO 503'));
    const r: any = await svc.listen('u1', { text: 'Привет' });
    expect(r).toEqual({ ok: false, error: 'tts_failed' });
    expect(rows.listens).toHaveLength(0);
    expect(deduct).not.toHaveBeenCalled();
  });

  it('лимит частоты общий с инструментом', async () => {
    const { svc, redis, synth } = makeService();
    redis.incr.mockResolvedValue(21);
    const r: any = await svc.listen('u1', { text: 'Привет' });
    expect(r).toEqual({ ok: false, error: 'rate_limited', retryAfterSec: 60 });
    expect(redis.incr).toHaveBeenCalledWith('speech:rl:u1');
    expect(synth).not.toHaveBeenCalled();
  });

  it('баланс ушёл за время синтеза — строка снята, денег не взято, повтор не бесплатен', async () => {
    const { svc, state, synth, deduct, deleted, rows } = makeService({ balance: 1000 });
    synth.mockImplementation(async (_p: string, chunk: string) => {
      state.balance = 0; // параллельная трата, пока шёл синтез
      return Buffer.from(chunk);
    });
    const r: any = await svc.listen('u1', { text: 'Привет' });
    expect(r).toEqual({ ok: false, error: 'insufficient_tokens', balance: 0, required: 1000 });
    expect(deduct).not.toHaveBeenCalled();
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(rows.listens).toHaveLength(0);

    const retry: any = await svc.listen('u1', { text: 'Привет' });
    expect(retry.ok).toBe(false);
  });
});

describe('mapLimit', () => {
  it('порядок результатов — порядок входа, а не завершения', async () => {
    const out = await mapLimit([30, 10, 20, 0], 2, async (ms, i) => {
      await new Promise((res) => setTimeout(res, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it('после первой ошибки новые вызовы не начинаются', async () => {
    const started: number[] = [];
    await expect(mapLimit([0, 1, 2, 3, 4], 1, async (x) => {
      started.push(x);
      if (x === 1) throw new Error('boom');
      return x;
    })).rejects.toThrow('boom');
    expect(started).toEqual([0, 1]);
  });

  it('пустой вход — пустой результат', async () => {
    await expect(mapLimit([], 3, async (x) => x)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Прогнать на ноде — красный**

`npx jest src/speech/speech.listen.spec.ts`. Ожидается: `svc.listen is not a function`; импорт `mapLimit` и `LISTEN_MAX_CHARS` — `undefined`.

- [ ] **Step 3: Реализация** — в `speech.service.ts`

Импорт: `import { splitForSpeech } from './split';`.

После `estimateDurationSec` добавить:

```ts
/**
 * Потолок длины ответа для кнопки «Прослушать»: около 11 минут речи и пять
 * запросов к Yandex. Зеркало на фронте — LISTEN_MAX_CHARS в
 * spirits_front/src/components/chat/listen/speechText.ts (там им гасят
 * кнопку до нажатия; источник истины — здесь).
 */
export const LISTEN_MAX_CHARS = 10_000;

/** Сколько кусков одного ответа синтезируются одновременно. */
const LISTEN_CONCURRENCY = 3;

/**
 * Promise.all с потолком одновременных вызовов. Порядок результатов — порядок
 * входа, а не порядок завершения. После первой ошибки новые вызовы не
 * начинаются: у провайдера платим за каждый.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}
```

К комментарию `tokenCostFor` дописать строку: `Фронт показывает цену кнопки «Прослушать» по той же формуле — listenPrice в spirits_front/src/components/chat/listen/speechText.ts.`

После `SynthesizeResult` добавить типы:

```ts
export interface ListenInput {
  text: string;
  /** Внутреннее имя ассистента ленты (agents.name). Выбирает только голос. */
  assistant?: string;
}

export type ListenResult =
  | {
      ok: true; parts: string[]; chars: number; tokensSpent: number;
      cached: boolean; voice: string; provider: TtsProvider;
    }
  | { ok: false; error: 'empty_text' }
  | { ok: false; error: 'text_too_long'; maxChars: number }
  | { ok: false; error: 'insufficient_tokens'; balance: number; required: number }
  | { ok: false; error: 'rate_limited'; retryAfterSec: number }
  | { ok: false; error: 'tts_failed' };
```

В класс после `synthesize` добавить:

```ts
  /**
   * Кнопка «Прослушать» под ответом ассистента: весь ответ голосом ассистента
   * ленты. Длинный текст синтезируется кусками под лимит провайдера, а платит
   * пользователь один раз за всю длину по тарифу озвучки — округление вверх на
   * каждом куске переплачивало бы до 1000 токенов за кусок.
   *
   * Кэш — своя таблица speech_listens, не speech_clips (почему — в шапке
   * migrations/002_speech_listens.sql). Порядок тот же, что у synthesize:
   * синтез и заливка, потом вставка строки, потом условное списание; не хватило
   * денег — строка снимается компенсацией, и повтор не достаётся бесплатно.
   */
  async listen(userId: string, input: ListenInput): Promise<ListenResult> {
    const text = String(input?.text ?? '').trim();
    if (!text) return { ok: false, error: 'empty_text' };
    if (text.length > LISTEN_MAX_CHARS) {
      return { ok: false, error: 'text_too_long', maxChars: LISTEN_MAX_CHARS };
    }

    if (await this.hitRateLimit(userId)) {
      return { ok: false, error: 'rate_limited', retryAfterSec: 60 };
    }

    const lang = await this.language.resolveUserLanguage(userId);
    // Имя ассистента приходит с фронта, но подделка ничего не даёт: оно
    // выбирает голос только из собственной карты пользователя и дефолтов.
    const assistant = typeof input?.assistant === 'string' ? input.assistant.trim().slice(0, 64) : '';
    const { assistantName, resolved } = await this.voiceFor(userId, lang, { assistant: assistant || undefined });
    const { voice, provider } = resolved;
    const cacheKey = cacheKeyFor(text, voice, lang);

    const hit = await this.findListen(userId, cacheKey);
    if (hit) {
      try {
        await this.pg.query('UPDATE speech_listens SET last_used_at = now() WHERE id = $1', [hit.id]);
      } catch (e: any) {
        this.logger.warn(`failed to bump last_used_at for listen ${hit.id}: ${e.message}`);
      }
      return { ok: true, parts: hit.parts, chars: text.length, tokensSpent: 0, cached: true, voice, provider };
    }

    const required = tokenCostFor(text.length);
    const balRes = await this.pg.query(
      'SELECT tokens FROM ai_profiles_consolidated WHERE user_id = $1',
      [userId],
    );
    const balance = Number(balRes.rows[0]?.tokens ?? 0);
    if (balance < required) return { ok: false, error: 'insufficient_tokens', balance, required };

    const chunks = splitForSpeech(text, maxCharsFor(provider));
    let audio: Buffer[];
    try {
      audio = await mapLimit(chunks, LISTEN_CONCURRENCY, (chunk) => this.synthesizeWith(provider, chunk, voice));
    } catch (e: any) {
      this.logger.warn(`listen synthesize failed (${provider}/${voice}): ${e.message}`);
      return { ok: false, error: 'tts_failed' };
    }

    let parts: string[];
    try {
      parts = await Promise.all(audio.map((body, i) => this.storage.upload({
        bucket: SPEECH_BUCKET, key: `audio/listen/${cacheKey}-${i}.mp3`, body,
        contentType: 'audio/mpeg', cacheControl: 'public, max-age=31536000, immutable',
      })));
    } catch (e: any) {
      this.logger.warn(`listen upload failed: ${e.message}`);
      return { ok: false, error: 'tts_failed' };
    }

    const ins = await this.pg.query(
      `INSERT INTO speech_listens (user_id, assistant, cache_key, parts, chars, provider, voice, lang, tokens_spent)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, cache_key) DO NOTHING
       RETURNING id`,
      [userId, assistantName, cacheKey, JSON.stringify(parts), text.length, provider, voice, lang, required],
    );
    if (ins.rows.length === 0) {
      // Гонку выиграл параллельный запрос того же ответа — он и платит.
      const winner = await this.findListen(userId, cacheKey);
      if (winner) {
        return { ok: true, parts: winner.parts, chars: text.length, tokensSpent: 0, cached: true, voice, provider };
      }
      // Победитель успел проиграть списание и снять строку — честный отказ.
      return { ok: false, error: 'tts_failed' };
    }

    const listenId = String(ins.rows[0].id);
    const paid = await this.debit(userId, required, 'Озвучка ответа', {
      listen_id: listenId, chars: text.length, parts: parts.length, voice, provider,
    });
    if (paid === null) {
      try {
        await this.pg.query('DELETE FROM speech_listens WHERE id = $1 AND user_id = $2', [listenId, userId]);
      } catch (e: any) {
        this.logger.error(`failed to roll back unpaid listen ${listenId}: ${e.message}`);
      }
      const cur = await this.pg.query(
        'SELECT tokens FROM ai_profiles_consolidated WHERE user_id = $1',
        [userId],
      );
      return { ok: false, error: 'insufficient_tokens', balance: Number(cur.rows[0]?.tokens ?? 0), required };
    }

    return { ok: true, parts, chars: text.length, tokensSpent: required, cached: false, voice, provider };
  }

  private async findListen(userId: string, cacheKey: string): Promise<{ id: string; parts: string[] } | null> {
    const r = await this.pg.query(
      'SELECT id, parts FROM speech_listens WHERE user_id = $1 AND cache_key = $2',
      [userId, cacheKey],
    );
    const row = r.rows[0];
    if (!row) return null;
    return { id: String(row.id), parts: Array.isArray(row.parts) ? row.parts.map(String) : [] };
  }
```

- [ ] **Step 4: Прогнать на ноде — зелёный, плюс tsc**

`npx jest src/speech && npx tsc -p tsconfig.build.json --noEmit`. Ожидается: все зелёные, tsc без ошибок.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/speech/speech.service.ts src/speech/speech.listen.spec.ts
git -C $BACK commit -m "feat(speech): listen — озвучка ответа кусками с одним списанием и своим кэшем"
```

### Task 5: ручка `POST /webhook/speech/listen`

**Files:**
- Modify: `$BACK/src/speech/speech.controller.ts`
- Test: `$BACK/src/speech/speech.controller.spec.ts` (новый)

- [ ] **Step 1: Падающий тест**

```ts
// src/speech/speech.controller.spec.ts
import { SpeechController } from './speech.controller';

const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const make = (result: any) => {
  const speech = { listen: jest.fn(async () => result) };
  const ctl = new SpeechController(speech as any, {} as any, {} as any);
  return { ctl, speech };
};

describe('POST /webhook/speech/listen', () => {
  it.each([
    [{ ok: true, parts: ['u'], chars: 1, tokensSpent: 1000, cached: false, voice: 'zahar', provider: 'yandex' }, 200],
    [{ ok: false, error: 'empty_text' }, 400],
    [{ ok: false, error: 'text_too_long', maxChars: 10000 }, 400],
    [{ ok: false, error: 'insufficient_tokens', balance: 0, required: 1000 }, 402],
    [{ ok: false, error: 'rate_limited', retryAfterSec: 60 }, 429],
    [{ ok: false, error: 'tts_failed' }, 502],
  ])('%j → %i', async (result, status) => {
    const { ctl } = make(result);
    const r = res();
    await ctl.listen({ userId: 'u1' }, { text: 'Привет' }, r);
    expect(r.status).toHaveBeenCalledWith(status);
    expect(r.json).toHaveBeenCalledWith(result);
  });

  it('текст и ассистент — из тела, пользователь — только из токена', async () => {
    const { ctl, speech } = make({ ok: false, error: 'empty_text' });
    await ctl.listen({ userId: 'u1' }, { text: 'Привет', assistant: 'Маша', userId: 'чужой' }, res());
    expect(speech.listen).toHaveBeenCalledWith('u1', { text: 'Привет', assistant: 'Маша' });
  });

  it('не-строки из тела до сервиса не доходят', async () => {
    const { ctl, speech } = make({ ok: false, error: 'empty_text' });
    await ctl.listen({ userId: 'u1' }, { text: { evil: 1 }, assistant: 42 }, res());
    expect(speech.listen).toHaveBeenCalledWith('u1', { text: '', assistant: undefined });
  });
});
```

- [ ] **Step 2: Прогнать на ноде — красный**

`npx jest src/speech/speech.controller.spec.ts`. Ожидается: `ctl.listen is not a function`.

- [ ] **Step 3: Реализация** — `speech.controller.ts`

Импорты:

```ts
import { Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { StorageService } from '../common/services/storage.service';
import { LanguageService } from '../common/services/language.service';
import { ListenResult, SpeechService } from './speech.service';
import { VOICE_CATALOG, providerForLang } from './voices';
```

Перед `@Controller('speech')`:

```ts
/** Код ответа кнопки «Прослушать»: фронт различает нехватку денег, частоту и сбой. */
export function listenStatus(r: ListenResult): number {
  if (r.ok) return 200;
  // strictNullChecks выключен: сужение по ok не убирает ok:true из union.
  switch ((r as { error?: string }).error) {
    case 'empty_text':
    case 'text_too_long':
      return 400;
    case 'insufficient_tokens':
      return 402;
    case 'rate_limited':
      return 429;
    default:
      return 502;
  }
}
```

В класс, между `voices` и `clip` (до `':id'`):

```ts
  /**
   * Кнопка «Прослушать» под ответом ассистента. Текст фронт готовит сам
   * (без разметки и служебных тегов) — цена считается по длине именно его.
   */
  @Post('listen')
  @UseGuards(JwtGuard)
  async listen(@CurrentUser() user: any, @Body() body: any, @Res() res: Response) {
    const r = await this.speech.listen(user.userId, {
      text: typeof body?.text === 'string' ? body.text : '',
      assistant: typeof body?.assistant === 'string' ? body.assistant : undefined,
    });
    return res.status(listenStatus(r)).json(r);
  }
```

- [ ] **Step 4: Прогнать на ноде — зелёный, плюс tsc**

`npx jest src/speech && npx tsc -p tsconfig.build.json --noEmit`. Ожидается: всё зелёное.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/speech/speech.controller.ts src/speech/speech.controller.spec.ts
git -C $BACK commit -m "feat(speech): POST /webhook/speech/listen — статусы 400/402/429/502"
```

### Task 6: проверка SQL на живом Postgres ноды

- [ ] **Step 1: Накатить 001+002 в одноразовую базу дважды** (вторая прокатка доказывает идемпотентность), вставить строку, проверить уникальность, снести базу

```bash
ssh dv@85.192.61.231 'set -e; cd ~/ci/wt/listen-back; DB=listen_check_$$; createdb -h /var/run/postgresql $DB; for i in 1 2; do psql -h /var/run/postgresql -d $DB -v ON_ERROR_STOP=1 -q -f src/speech/migrations/001_speech_clips.sql -f src/speech/migrations/002_speech_listens.sql; done; psql -h /var/run/postgresql -d $DB -v ON_ERROR_STOP=1 -qAt -c "INSERT INTO speech_listens (user_id, cache_key, parts, chars, provider, voice, lang) VALUES ($$u$$, $$k$$, $$[\"a\",\"b\"]$$::jsonb, 6, $$yandex$$, $$zahar$$, $$ru$$); INSERT INTO speech_listens (user_id, cache_key, parts, chars, provider, voice, lang) VALUES ($$u$$, $$k$$, $$[]$$::jsonb, 1, $$yandex$$, $$zahar$$, $$ru$$) ON CONFLICT (user_id, cache_key) DO NOTHING RETURNING id; SELECT jsonb_array_length(parts), count(*) OVER () FROM speech_listens;"; dropdb -h /var/run/postgresql $DB'
```

Ожидается: без ошибок, последняя строка `2|1` (одна строка, массив из двух кусков; второй INSERT ничего не вернул).

### Task 7: `toSpeechText`

**Files:**
- Create: `$FRONT/src/components/chat/listen/speechText.ts`
- Test: `$FRONT/src/components/chat/listen/speechText.test.ts`

- [ ] **Step 1: Падающий тест**

```ts
// src/components/chat/listen/speechText.test.ts
import { describe, it, expect } from 'vitest';
import { LISTEN_MAX_CHARS, listenPrice, toSpeechText } from './speechText';

const UUID = '0b3c2a9e-1111-4222-8333-944455556666';

describe('toSpeechText — что синтезатор прочтёт вслух', () => {
  it('простой текст остаётся как есть', () => {
    expect(toSpeechText('Привет! Как дела?')).toBe('Привет! Как дела?');
  });

  it('снимает выделение и решётки заголовков; строка без знака конца получает точку', () => {
    expect(toSpeechText('## Итоги\n\n**Главное** — это *сон* и __отдых__.')).toBe('Итоги.\nГлавное — это сон и отдых.');
  });

  it('маркеры списка уходят, нумерация остаётся', () => {
    expect(toSpeechText('Вот план:\n- купить хлеб\n* позвонить маме\n1. Первый шаг')).toBe(
      'Вот план:\nкупить хлеб.\nпозвонить маме.\n1. Первый шаг.',
    );
  });

  it('ссылка читается текстом; голый адрес и картинка — нет', () => {
    expect(toSpeechText('Подробнее на [нашем сайте](https://linkeon.io). Пример: https://example.com/x\n![схема](https://a.b/c.png)')).toBe(
      'Подробнее на нашем сайте. Пример:',
    );
  });

  it('блок кода не читается, инлайн-код читается содержимым', () => {
    expect(toSpeechText('Выполните `npm test`:\n```bash\nrm -rf /\n```\nГотово')).toBe('Выполните npm test:\nГотово.');
  });

  it('служебные теги: ссылка-тег читается текстом, кнопки и плееры — нет', () => {
    const src = [
      'Пополните баланс.',
      '{{button: Купить токены | action: buy-tokens | variant: primary}}',
      '{{link: Тарифы | url: /tokens}}',
      `{{audio:id=${UUID}}}`,
    ].join('\n');
    expect(toSpeechText(src)).toBe('Пополните баланс.\nТарифы.');
  });

  it('маркеры видео и календаря вырезаются', () => {
    expect(toSpeechText(`Ролик готов [VIDEO_JOB:${UUID}] и встреча [CALENDAR_PROPOSAL:${UUID}] тоже`)).toBe(
      'Ролик готов и встреча тоже.',
    );
  });

  it('эмодзи не читаются, пробел перед знаком не остаётся', () => {
    expect(toSpeechText('Отлично 👍🏽 получилось 🎉! Флаг 🇷🇺 и 1️⃣')).toBe('Отлично получилось! Флаг и 1.');
  });

  it('таблица читается строками через запятую', () => {
    expect(toSpeechText('| Тариф | Цена |\n|---|:---:|\n| Базовый | 490 ₽ |')).toBe('Тариф, Цена.\nБазовый, 490 ₽.');
  });

  it('цитата и горизонтальная линия', () => {
    expect(toSpeechText('> Цитата мудреца\n\n---\n\nКонец')).toBe('Цитата мудреца.\nКонец.');
  });

  it('HTML-теги снимаются', () => {
    expect(toSpeechText('Строка<br>вторая <b>жирная</b>')).toBe('Строка вторая жирная.');
  });

  it('snake_case не трогается, а _курсив_ снимается', () => {
    expect(toSpeechText('Поле user_id и _важное_ слово')).toBe('Поле user_id и важное слово.');
  });

  it('карточка вопроса читается вопросом и вариантами', () => {
    const src = 'Уточню:\n```ask\n{"questions":[{"question":"Какой формат?","multi":false,"options":["Текст","Видео"]}]}\n```';
    expect(toSpeechText(src)).toBe('Уточню:\nКакой формат?\nТекст.\nВидео.');
  });

  it('ответ из одних картинок и плееров — читать нечего', () => {
    expect(toSpeechText(`![](https://a.b/c.png)\n{{audio:id=${UUID}}}`)).toBe('');
  });
});

describe('listenPrice — зеркало tokenCostFor на бэке', () => {
  it('1000 токенов за каждую начатую 1000 знаков', () => {
    expect(listenPrice(1)).toBe(1000);
    expect(listenPrice(1000)).toBe(1000);
    expect(listenPrice(1001)).toBe(2000);
    expect(listenPrice(LISTEN_MAX_CHARS)).toBe(10000);
  });
});
```

- [ ] **Step 2: Прогнать локально — красный**

```bash
cd $FRONT && PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run src/components/chat/listen/speechText.test.ts
```

Ожидается: `Failed to resolve import "./speechText"`.

- [ ] **Step 3: Реализация**

```ts
// src/components/chat/listen/speechText.ts
import { askBlocksToPlainText } from '../../../utils/askBlock';

/**
 * Зеркала констант бэка — LISTEN_MAX_CHARS и tokenCostFor в
 * spirits_back/src/speech/speech.service.ts. Здесь они нужны только для
 * подсказки у кнопки до нажатия. Источник истины — бэк: при расхождении он
 * откажет (400) или спишет по своей формуле.
 */
export const LISTEN_MAX_CHARS = 10_000;

/** 1000 токенов за каждую начатую 1000 знаков. */
export const listenPrice = (chars: number): number => Math.ceil(chars / 1000) * 1000;

// Маркеры, которые бэк вклеивает в текст ради карточек видео и календаря.
const SERVICE_MARKER_RE = /\[(?:VIDEO_JOB|CALENDAR_PROPOSAL):[0-9a-f-]{36}\]/gi;
const CODE_FENCE_RE = /```[\s\S]*?```/g;
const LINK_TAG_RE = /\{\{\s*link:\s*([^|}]+?)\s*\|[^}]*\}\}/g;
const ANY_TAG_RE = /\{\{[^}]*\}\}/g;
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
const URL_RE = /\bhttps?:\/\/\S+/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
// Пиктограммы, флаги, тона кожи и склейки составных эмодзи.
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu;

const TABLE_DIVIDER_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;
const RULE_RE = /^([-*_]\s*){3,}$/;
const HEADING_RE = /^#{1,6}\s+/;
const QUOTE_RE = /^(>\s*)+/;
const BULLET_RE = /^[-*+•]\s+/;
const ITALIC_UNDERSCORE_RE = /(^|[^\p{L}\p{N}])_([^_]+)_(?=[^\p{L}\p{N}]|$)/gu;
const SENTENCE_END_RE = /[.!?…:;,]["»”’')\]]*$/;

/**
 * Текст, который синтезатор прочтёт вслух: без разметки, служебных тегов,
 * адресов и эмодзи. Строка без знака конца предложения получает точку —
 * иначе пункты списка и заголовки слились бы в одну фразу без пауз. Абзацы
 * остаются переводами строки: по ним бэк режет длинный ответ на куски.
 *
 * Пустая строка — читать нечего (в ответе только картинка или плеер).
 */
export function toSpeechText(content: string): string {
  // Карточки вопросов — до вырезания блоков кода: они сами блок ```ask.
  const flat = askBlocksToPlainText(content)
    .replace(/\r\n?/g, '\n')
    .replace(SERVICE_MARKER_RE, ' ')
    .replace(CODE_FENCE_RE, '\n')
    .replace(LINK_TAG_RE, '$1')
    .replace(ANY_TAG_RE, ' ')
    .replace(HTML_TAG_RE, ' ')
    .replace(IMAGE_RE, ' ')
    .replace(LINK_RE, '$1')
    .replace(URL_RE, ' ')
    .replace(INLINE_CODE_RE, '$1')
    .replace(EMOJI_RE, '');

  const lines: string[] = [];
  for (const raw of flat.split('\n')) {
    let line = raw.trim();
    if (!line || TABLE_DIVIDER_RE.test(line) || RULE_RE.test(line)) continue;
    line = line.replace(HEADING_RE, '').replace(QUOTE_RE, '').replace(BULLET_RE, '');
    if (line.startsWith('|') || line.endsWith('|')) {
      line = line.split('|').map((cell) => cell.trim()).filter(Boolean).join(', ');
    }
    line = line
      .replace(/\*\*|__|~~/g, '')
      .replace(/\*/g, '')
      .replace(ITALIC_UNDERSCORE_RE, '$1$2')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ([.,!?;:…])/g, '$1')
      .trim();
    if (!line) continue;
    lines.push(SENTENCE_END_RE.test(line) ? line : `${line}.`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Прогнать локально — зелёный**

Та же команда. Ожидается: 15 passed. Если какое-то ожидание не сходится из-за порядка замен, чинить реализацию, а не ослаблять тест. Исключение — тест, ожидание которого противоречит спеке.

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/listen/speechText.ts src/components/chat/listen/speechText.test.ts
git -C $FRONT commit -m "feat(chat): toSpeechText — текст ответа для чтения вслух"
```

### Task 8: локали ×7

**Files:**
- Modify: `$FRONT/src/i18n/locales/{ru,en,de,es,fr,pt,zh}.json` — в объект `chat` сразу после `copy_message`

- [ ] **Step 1: Вставить ключи скриптом** (форматирование файлов совпадает с `JSON.stringify(…, null, 2)` — проверено пересохранением)

```bash
cd $FRONT && node - <<'EOF'
const fs = require('fs');
const KEYS = {
  ru: {
    listen: 'Прослушать',
    listen_loading: 'Озвучиваю…',
    listen_stop: 'Остановить',
    listen_title: 'Прослушать ответ голосом ассистента: {{tokens}} {{unit}}, повторно — бесплатно',
    listen_too_long: 'Ответ слишком длинный для озвучки — больше {{max}} знаков',
    listen_no_tokens: 'Не хватает токенов на озвучку: нужно {{required}}',
    listen_rate_limited: 'Слишком много озвучек подряд — попробуйте через минуту',
    listen_failed: 'Не удалось озвучить ответ, попробуйте ещё раз',
    listen_tap_again: 'Озвучка готова — нажмите «Прослушать» ещё раз',
  },
  en: {
    listen: 'Listen',
    listen_loading: 'Voicing…',
    listen_stop: 'Stop',
    listen_title: "Listen to this reply in the assistant's voice: {{tokens}} {{unit}}, replays are free",
    listen_too_long: 'This reply is too long to voice — over {{max}} characters',
    listen_no_tokens: 'Not enough tokens to voice this reply: {{required}} needed',
    listen_rate_limited: 'Too many voicings in a row — try again in a minute',
    listen_failed: "Couldn't voice the reply, please try again",
    listen_tap_again: 'The audio is ready — tap “Listen” again',
  },
  de: {
    listen: 'Anhören',
    listen_loading: 'Wird vertont…',
    listen_stop: 'Stopp',
    listen_title: 'Antwort mit der Stimme des Assistenten anhören: {{tokens}} {{unit}}, erneutes Anhören kostenlos',
    listen_too_long: 'Die Antwort ist zu lang zum Vertonen – mehr als {{max}} Zeichen',
    listen_no_tokens: 'Nicht genug Tokens für die Vertonung: {{required}} nötig',
    listen_rate_limited: 'Zu viele Vertonungen hintereinander – bitte in einer Minute erneut versuchen',
    listen_failed: 'Die Antwort konnte nicht vertont werden – bitte erneut versuchen',
    listen_tap_again: 'Die Audiodatei ist bereit – noch einmal auf „Anhören“ tippen',
  },
  es: {
    listen: 'Escuchar',
    listen_loading: 'Generando audio…',
    listen_stop: 'Detener',
    listen_title: 'Escuchar la respuesta con la voz del asistente: {{tokens}} {{unit}}, volver a escucharla es gratis',
    listen_too_long: 'La respuesta es demasiado larga para convertirla en audio: más de {{max}} caracteres',
    listen_no_tokens: 'No hay suficientes tokens para el audio: se necesitan {{required}}',
    listen_rate_limited: 'Demasiados audios seguidos: inténtalo de nuevo en un minuto',
    listen_failed: 'No se pudo generar el audio de la respuesta, inténtalo de nuevo',
    listen_tap_again: 'El audio está listo: pulsa «Escuchar» otra vez',
  },
  fr: {
    listen: 'Écouter',
    listen_loading: 'Synthèse vocale…',
    listen_stop: 'Arrêter',
    listen_title: 'Écouter la réponse avec la voix de l’assistant : {{tokens}} {{unit}}, réécoute gratuite',
    listen_too_long: 'La réponse est trop longue pour être lue à voix haute — plus de {{max}} caractères',
    listen_no_tokens: 'Pas assez de jetons pour la lecture vocale : {{required}} nécessaires',
    listen_rate_limited: 'Trop de lectures vocales d’affilée — réessayez dans une minute',
    listen_failed: 'Impossible de lire la réponse à voix haute, réessayez',
    listen_tap_again: 'L’audio est prêt — appuyez de nouveau sur « Écouter »',
  },
  pt: {
    listen: 'Ouvir',
    listen_loading: 'Gerando áudio…',
    listen_stop: 'Parar',
    listen_title: 'Ouvir a resposta na voz do assistente: {{tokens}} {{unit}}, ouvir de novo é grátis',
    listen_too_long: 'A resposta é longa demais para virar áudio — mais de {{max}} caracteres',
    listen_no_tokens: 'Tokens insuficientes para o áudio: são necessários {{required}}',
    listen_rate_limited: 'Muitos áudios seguidos — tente novamente em um minuto',
    listen_failed: 'Não foi possível gerar o áudio da resposta, tente novamente',
    listen_tap_again: 'O áudio está pronto — toque em “Ouvir” novamente',
  },
  zh: {
    listen: '收听',
    listen_loading: '正在生成语音…',
    listen_stop: '停止',
    listen_title: '用助手的声音收听回复：{{tokens}} {{unit}}，重复收听免费',
    listen_too_long: '回复太长，无法生成语音（超过 {{max}} 个字符）',
    listen_no_tokens: '代币不足，无法生成语音：需要 {{required}}',
    listen_rate_limited: '语音生成过于频繁，请一分钟后再试',
    listen_failed: '无法生成回复语音，请重试',
    listen_tap_again: '语音已就绪，请再次点击“收听”',
  },
};
for (const [lang, add] of Object.entries(KEYS)) {
  const p = `src/i18n/locales/${lang}.json`;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const chat = {};
  for (const [k, v] of Object.entries(j.chat)) {
    chat[k] = v;
    if (k === 'copy_message') Object.assign(chat, add);
  }
  if (!('listen' in chat)) throw new Error(`${lang}: нет chat.copy_message`);
  j.chat = chat;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
EOF
```

- [ ] **Step 2: Сторожа локалей**

```bash
cd $FRONT && node scripts/check-locales.mjs && node scripts/check-keys-exist.mjs && git diff --stat
```

Ожидается: оба сторожа зелёные, в диффе 7 файлов по +9 строк.

- [ ] **Step 3: Коммит**

```bash
git -C $FRONT add src/i18n/locales
git -C $FRONT commit -m "i18n(chat): кнопка «Прослушать» — 9 ключей на семи языках"
```

### Task 9: плеер `useListenPlayer` и `ListenButton`

**Files:**
- Create: `$FRONT/src/components/chat/listen/useListenPlayer.ts`
- Create: `$FRONT/src/components/chat/listen/ListenButton.tsx`
- Test: `$FRONT/src/components/chat/listen/ListenButton.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
// @vitest-environment jsdom
//
// Кнопка «Прослушать» вместе с общим плеером ленты. Утверждения — про надпись
// на кнопке (что видит человек) и про то, что реально ушло в динамик: src
// элемента в момент play(), без беззвучной разблокировки.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { actAsync, clickAsync, flush, mount, tRu } from '../../../test/dom';
import ListenButton from './ListenButton';
import { useListenPlayer } from './useListenPlayer';
import { apiClient } from '../../../services/apiClient';
import toast from 'react-hot-toast';
import { formatNumber } from '../../../utils/formatters';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../../../services/apiClient', () => ({ apiClient: { post: vi.fn() } }));

const post = vi.mocked(apiClient.post);
const toastError = vi.mocked(toast.error);

let played: string[] = [];
let audioEl: HTMLMediaElement | null = null;
let playImpl: () => Promise<void> = async () => {};

beforeEach(() => {
  played = [];
  audioEl = null;
  playImpl = async () => {};
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    audioEl = this;
    if (this.src.startsWith('data:')) return Promise.resolve();
    played.push(this.src);
    return playImpl();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  post.mockReset();
  toastError.mockReset();
  document.body.innerHTML = '';
});

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const OK = (parts: string[]) =>
  reply(200, { ok: true, parts, chars: 10, tokensSpent: 1000, cached: false, voice: 'zahar', provider: 'yandex' });

/** Промис, который тест разрешает сам, — чтобы увидеть промежуточную фазу. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

function Feed({ items }: { items: Array<{ id: string; content: string }> }) {
  const listen = useListenPlayer();
  return (
    <div>
      {items.map((m) => (
        <div key={m.id} data-id={m.id}>
          <ListenButton
            messageId={m.id}
            content={m.content}
            assistant="Роман"
            phase={listen.phaseOf(m.id)}
            onToggle={listen.toggle}
          />
        </div>
      ))}
    </div>
  );
}

const btn = (c: HTMLElement, id: string) => c.querySelector(`[data-id="${id}"] button`) as HTMLButtonElement | null;
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const fire = async (type: 'ended' | 'error') => {
  await actAsync(() => { audioEl!.dispatchEvent(new Event(type)); });
  await settle();
};

describe('ListenButton — вид', () => {
  it('в покое «Прослушать», цена — в подсказке', () => {
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет! Это ответ ассистента.' }]} />);
    const b = btn(container, 'm1')!;
    expect(b.textContent).toBe(tRu('chat.listen'));
    expect(b.title).toBe(tRu('chat.listen_title', { tokens: formatNumber(1000), unit: tRu('chat.tokens_suffix') }));
  });

  it('ответ без текста для чтения — кнопки нет', () => {
    const { container } = mount(<Feed items={[{ id: 'm1', content: '![](https://a.b/c.png)' }]} />);
    expect(btn(container, 'm1')).toBeNull();
  });

  it('слишком длинный ответ — кнопка погашена и объясняет почему', () => {
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'я'.repeat(10_001) }]} />);
    const b = btn(container, 'm1')!;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe(tRu('chat.listen_too_long', { max: formatNumber(10_000) }));
  });
});

describe('плеер ответа', () => {
  it('«Озвучиваю…» → «Остановить» → куски по порядку → снова «Прослушать»', async () => {
    const d = deferred<Response>();
    post.mockImplementation(() => d.promise);
    const { container } = mount(<Feed items={[{ id: 'm1', content: '**Привет!** Это ответ.' }]} />);

    await clickAsync(btn(container, 'm1')!);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_loading'));
    expect(post).toHaveBeenCalledWith(
      '/webhook/speech/listen',
      { text: 'Привет! Это ответ.', assistant: 'Роман' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await actAsync(() => d.resolve(OK(['https://m.test/a-0.mp3', 'https://m.test/a-1.mp3'])));
    await settle();
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
    expect(played).toEqual(['https://m.test/a-0.mp3']);

    await fire('ended');
    expect(played).toEqual(['https://m.test/a-0.mp3', 'https://m.test/a-1.mp3']);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));

    await fire('ended');
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
  });

  it('повторное нажатие на звучащий ответ останавливает его', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));

    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();

    // Поздний 'ended' остановленного куска ничего не включает.
    audioEl!.dispatchEvent(new Event('ended'));
    expect(played).toEqual(['https://m.test/a-0.mp3']);
  });

  it('второй ответ глушит первый', async () => {
    post.mockImplementation(async (_url: string, body: any) => OK([`https://m.test/${body.text.length}.mp3`]));
    const { container } = mount(
      <Feed items={[{ id: 'm1', content: 'Первый.' }, { id: 'm2', content: 'Второй, подлиннее.' }]} />,
    );
    await clickAsync(btn(container, 'm1')!);
    await settle();
    await clickAsync(btn(container, 'm2')!);
    await settle();
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
    expect(btn(container, 'm2')!.textContent).toBe(tRu('chat.listen_stop'));
    expect(played).toEqual(['https://m.test/7.mp3', 'https://m.test/18.mp3']);
  });

  it('повтор в той же сессии не ходит на бэк', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    await fire('ended');
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    expect(played).toEqual(['https://m.test/a-0.mp3', 'https://m.test/a-0.mp3']);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
  });

  it('402 — тост с ценой, кнопка снова «Прослушать», звука нет', async () => {
    post.mockResolvedValue(reply(402, { ok: false, error: 'insufficient_tokens', balance: 0, required: 2000 }));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_no_tokens', { required: formatNumber(2000) }));
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
    expect(played).toEqual([]);
  });

  it('429 — тост «слишком часто»', async () => {
    post.mockResolvedValue(reply(429, { ok: false, error: 'rate_limited', retryAfterSec: 60 }));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_rate_limited'));
  });

  it('сбой сети — общий тост', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_failed'));
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
  });

  it('браузер не дал играть — просим нажать ещё раз; второе нажатие без запроса', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    playImpl = async () => { throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' }); };
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_tap_again'));
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));

    playImpl = async () => {};
    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen_stop'));
  });

  it('кусок не загрузился — общий тост, и следующий раз куски берутся заново', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const { container } = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(container, 'm1')!);
    await settle();
    await fire('error');
    expect(toastError).toHaveBeenCalledWith(tRu('chat.listen_failed'));
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));

    await clickAsync(btn(container, 'm1')!);
    await settle();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('поздний ответ бэка по брошенному ответу не включает его звук', async () => {
    const d1 = deferred<Response>();
    const d2 = deferred<Response>();
    post.mockImplementationOnce(() => d1.promise).mockImplementationOnce(() => d2.promise);
    const { container } = mount(
      <Feed items={[{ id: 'm1', content: 'Первый.' }, { id: 'm2', content: 'Второй.' }]} />,
    );
    await clickAsync(btn(container, 'm1')!);
    await clickAsync(btn(container, 'm2')!);
    await actAsync(() => d1.resolve(OK(['https://m.test/first.mp3'])));
    await settle();
    expect(played).toEqual([]);
    expect(btn(container, 'm1')!.textContent).toBe(tRu('chat.listen'));
    expect(btn(container, 'm2')!.textContent).toBe(tRu('chat.listen_loading'));

    await actAsync(() => d2.resolve(OK(['https://m.test/second.mp3'])));
    await settle();
    expect(played).toEqual(['https://m.test/second.mp3']);
  });

  it('размонтирование ленты глушит звук', async () => {
    post.mockResolvedValue(OK(['https://m.test/a-0.mp3']));
    const m = mount(<Feed items={[{ id: 'm1', content: 'Привет!' }]} />);
    await clickAsync(btn(m.container, 'm1')!);
    await settle();
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const before = pause.mock.calls.length;
    m.unmount();
    expect(pause.mock.calls.length).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 2: Прогнать локально — красный**

`./node_modules/.bin/vitest run src/components/chat/listen/ListenButton.test.tsx` (под Node 22). Ожидается: не находится `./ListenButton`.

- [ ] **Step 3: `useListenPlayer.ts`**

```ts
// src/components/chat/listen/useListenPlayer.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { apiClient } from '../../../services/apiClient';
import { formatNumber } from '../../../utils/formatters';
import { LISTEN_MAX_CHARS } from './speechText';

export type ListenPhase = 'idle' | 'loading' | 'playing';

export interface ListenPlayer {
  /** Фаза кнопки конкретного ответа: звучит не больше одного. */
  phaseOf: (id: string) => ListenPhase;
  /** Нажатие на кнопку ответа: запустить, а на звучащем — остановить. */
  toggle: (id: string, text: string, assistant?: string) => void;
  stop: () => void;
}

/**
 * 50 мс тишины (WAV, 8 кГц, 8 бит). Проигрывается синхронно в обработчике
 * нажатия: iOS Safari и WKWebView дают звук элементу, который уже играл по
 * жесту пользователя, а настоящие куски приходят через секунды синтеза, когда
 * жест давно истёк. CSP на my.linkeon.io нет — data: URI проходит.
 */
const SILENT_WAV =
  'data:audio/wav;base64,' +
  'UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICA';

interface State { id: string | null; phase: ListenPhase }
const IDLE: State = { id: null, phase: 'idle' };

/** Заглушить элемент и отвязать его обработчики от прошлого прогона. */
function silence(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.onended = null;
  el.onerror = null;
  try {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } catch { /* элемент уже отпущен */ }
}

/**
 * Общий плеер ленты: один <audio> на весь чат, звучит не больше одного
 * ответа. Каждый старт и стоп увеличивают номер прогона — отставший ответ бэка
 * или событие плеера от прошлого прогона ничего не трогают.
 */
export function useListenPlayer(): ListenPlayer {
  const { t } = useTranslation();
  const [state, setState] = useState<State>(IDLE);
  const stateRef = useRef<State>(IDLE);
  stateRef.current = state;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Куски по (id, текст): повтор в той же сессии не ходит на бэк вовсе.
  const partsRef = useRef(new Map<string, string[]>());

  const element = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = document.createElement('audio');
    return audioRef.current;
  }, []);

  const stop = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    silence(audioRef.current);
    setState((s) => (s.id === null ? s : IDLE));
  }, []);

  const fail = useCallback((run: number, message: string) => {
    if (run !== runRef.current) return;
    toast.error(message);
    silence(audioRef.current);
    setState(IDLE);
  }, []);

  const errorMessage = useCallback((status: number, body: any): string => {
    if (status === 402) {
      return t('chat.listen_no_tokens', { required: formatNumber(Number(body?.required) || 0) });
    }
    if (status === 429) return t('chat.listen_rate_limited');
    if (status === 400 && body?.error === 'text_too_long') {
      return t('chat.listen_too_long', { max: formatNumber(Number(body?.maxChars) || LISTEN_MAX_CHARS) });
    }
    return t('chat.listen_failed');
  }, [t]);

  const play = useCallback((run: number, id: string, key: string, parts: string[]) => {
    const el = element();
    let index = 0;
    const start = () => {
      el.src = parts[index];
      Promise.resolve(el.play()).then(
        () => {
          if (run === runRef.current) setState({ id, phase: 'playing' });
        },
        (err: unknown) => {
          if (run !== runRef.current) return;
          // Браузер не дал звук без свежего жеста — куски уже есть, второе
          // нажатие сыграет их сразу. Иначе файл битый: куски забываем.
          const blocked = (err as { name?: string } | null)?.name === 'NotAllowedError';
          if (!blocked) partsRef.current.delete(key);
          fail(run, blocked ? t('chat.listen_tap_again') : t('chat.listen_failed'));
        },
      );
    };
    el.onended = () => {
      if (run !== runRef.current) return;
      index += 1;
      if (index < parts.length) {
        start();
        return;
      }
      el.onended = null;
      el.onerror = null;
      setState(IDLE);
    };
    el.onerror = () => {
      if (run !== runRef.current) return;
      partsRef.current.delete(key);
      fail(run, t('chat.listen_failed'));
    };
    start();
  }, [element, fail, t]);

  const toggle = useCallback((id: string, text: string, assistant?: string) => {
    const cur = stateRef.current;
    if (cur.id === id && cur.phase !== 'idle') {
      stop();
      return;
    }
    stop();
    const run = runRef.current;

    // Разблокировка звука — строго синхронно, пока жест пользователя «жив».
    const el = element();
    try {
      el.src = SILENT_WAV;
      Promise.resolve(el.play()).catch(() => { /* прервётся настоящим куском */ });
    } catch { /* движок без промиса у play() */ }
    setState({ id, phase: 'loading' });

    const key = `${id}\u0000${text}`;
    const known = partsRef.current.get(key);
    if (known) {
      play(run, id, key, known);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    void (async () => {
      let res: Response;
      let body: any = null;
      try {
        res = await apiClient.post('/webhook/speech/listen', { text, assistant }, { signal: ctrl.signal });
        body = await res.json().catch(() => null);
      } catch {
        fail(run, t('chat.listen_failed'));
        return;
      }
      if (run !== runRef.current) return;
      if (abortRef.current === ctrl) abortRef.current = null;
      if (res.ok && body?.ok && Array.isArray(body.parts) && body.parts.length > 0) {
        partsRef.current.set(key, body.parts);
        play(run, id, key, body.parts);
        return;
      }
      fail(run, errorMessage(res.status, body));
    })();
  }, [element, errorMessage, fail, play, stop, t]);

  // Уход из чата не оставляет играющий звук и висящий запрос.
  useEffect(() => () => {
    runRef.current += 1;
    abortRef.current?.abort();
    silence(audioRef.current);
  }, []);

  const phaseOf = useCallback(
    (id: string): ListenPhase => (state.id === id ? state.phase : 'idle'),
    [state],
  );

  return { phaseOf, toggle, stop };
}
```

Строка `SILENT_WAV` — 44 байта заголовка WAV и 400 сэмплов 0x80 (тишина в 8-битном PCM). Проверено `afinfo`: 1 канал, 8000 Гц, 8 бит, 0,05 с.

- [ ] **Step 4: `ListenButton.tsx`**

```tsx
// src/components/chat/listen/ListenButton.tsx
import React, { memo, useMemo } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../../utils/formatters';
import { LISTEN_MAX_CHARS, listenPrice, toSpeechText } from './speechText';
import type { ListenPhase } from './useListenPlayer';

interface ListenButtonProps {
  messageId: string;
  /** Сырой текст ответа — разметку и служебные теги срезает toSpeechText. */
  content: string;
  /** Внутреннее имя ассистента ленты: по нему бэк выбирает голос. */
  assistant?: string;
  phase: ListenPhase;
  onToggle: (id: string, text: string, assistant?: string) => void;
}

/**
 * «Прослушать» в строке под ответом, рядом с «Копировать» и тем же видом.
 * memo + useMemo: лента перерисовывается на каждый кусок стрима, а текст для
 * чтения считается регулярками — только когда меняется сам ответ.
 */
const ListenButton: React.FC<ListenButtonProps> = ({ messageId, content, assistant, phase, onToggle }) => {
  const { t } = useTranslation();
  const text = useMemo(() => toSpeechText(content), [content]);
  if (!text) return null;

  const tooLong = text.length > LISTEN_MAX_CHARS;
  const label =
    phase === 'loading' ? t('chat.listen_loading')
      : phase === 'playing' ? t('chat.listen_stop')
        : t('chat.listen');
  // Цена кратна 1000, поэтому форма множественного числа у суффикса одна.
  const hint = tooLong
    ? t('chat.listen_too_long', { max: formatNumber(LISTEN_MAX_CHARS) })
    : phase === 'idle'
      ? t('chat.listen_title', { tokens: formatNumber(listenPrice(text.length)), unit: t('chat.tokens_suffix') })
      : label;
  const Icon = phase === 'loading' ? Loader2 : phase === 'playing' ? Square : Volume2;

  return (
    <button
      type="button"
      onClick={() => onToggle(messageId, text, assistant)}
      disabled={tooLong}
      title={hint}
      aria-label={hint}
      className="inline-flex items-center gap-1 text-gray-400 hover:text-forest-600 transition-colors disabled:opacity-40 disabled:hover:text-gray-400"
    >
      <Icon className={phase === 'loading' ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
      {label}
    </button>
  );
};

export default memo(ListenButton);
```

- [ ] **Step 5: Прогнать локально — зелёный**

Та же команда. Ожидается: 14 passed.

- [ ] **Step 6: Коммит**

```bash
git -C $FRONT add src/components/chat/listen/useListenPlayer.ts src/components/chat/listen/ListenButton.tsx src/components/chat/listen/ListenButton.test.tsx
git -C $FRONT commit -m "feat(chat): ListenButton и общий плеер ленты — куски подряд, один звук за раз"
```

### Task 10: связка в `ChatInterface`

**Files:**
- Modify: `$FRONT/src/components/chat/ChatInterface.tsx`
- Test: `$FRONT/src/components/chat/listenWiring.test.ts`

- [ ] **Step 1: Падающий сторож**

```ts
// src/components/chat/listenWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож связки кнопки «Прослушать»: speechText, плеер и кнопка покрыты
 * своими тестами, а вот что ChatInterface их вообще зовёт — видно только
 * здесь. Убрать кнопку из строки под ответом — и всё остальное останется
 * зелёным.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const listenTag = (): string => {
  const a = SRC.indexOf('<ListenButton');
  expect(a).toBeGreaterThan(-1);
  return SRC.slice(a, SRC.indexOf('/>', a));
};

describe('связка кнопки «Прослушать»', () => {
  it('один плеер на ленту', () => {
    expect(SRC.match(/useListenPlayer\(\)/g)?.length).toBe(1);
  });

  it('кнопка стоит в строке под ответом сразу после «Копировать»', () => {
    const copy = SRC.indexOf("t('chat.copy', 'Копировать')");
    expect(copy).toBeGreaterThan(-1);
    const listen = SRC.indexOf('<ListenButton', copy);
    expect(listen).toBeGreaterThan(copy);
    expect(SRC.slice(copy, listen)).not.toContain('</div>');
  });

  it('только у завершённых ответов ассистента', () => {
    const at = SRC.indexOf('<ListenButton');
    expect(SRC.slice(at - 160, at)).toContain("message.type === 'assistant' && !message.isStreaming && message.content");
  });

  it('кнопке передан ассистент ленты и общий плеер', () => {
    const tag = listenTag();
    expect(tag).toContain('content={message.content}');
    expect(tag).toContain('assistant={selectedAssistant?.name}');
    expect(tag).toContain('phase={listen.phaseOf(message.id)}');
    expect(tag).toContain('onToggle={listen.toggle}');
  });

  it('смена ассистента глушит озвучку', () => {
    expect(SRC).toMatch(/useEffect\(\(\) => \{\s*stopListening\(\);\s*\}, \[selectedAssistant\?\.id, stopListening\]\)/);
  });

  it('строка под ответом переносится, а не вылезает за пузырь', () => {
    expect(SRC).toContain("'flex flex-wrap items-center gap-2 text-xs mt-1'");
  });
});
```

- [ ] **Step 2: Прогнать локально — красный**

`./node_modules/.bin/vitest run src/components/chat/listenWiring.test.ts`. Ожидается: 6 failed.

- [ ] **Step 3: Правки `ChatInterface.tsx`**

Импорты — после `import AudioClip from './AudioClip';`:

```ts
import ListenButton from './listen/ListenButton';
import { useListenPlayer } from './listen/useListenPlayer';
```

После `const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);`:

```ts
  // Один плеер на ленту: «Прослушать» у второго ответа глушит первый.
  const listen = useListenPlayer();
  const stopListening = listen.stop;
```

После эффекта `useEffect(() => { if (initialShowTokens) { setShowTokenPackages(true); } }, [initialShowTokens]);`:

```ts
  // Озвучка ответа прошлого ассистента не должна звучать поверх ленты нового.
  useEffect(() => {
    stopListening();
  }, [selectedAssistant?.id, stopListening]);
```

Строка под ответом: `'flex items-center gap-2 text-xs mt-1',` → `'flex flex-wrap items-center gap-2 text-xs mt-1',`.

Сразу после закрывающего `)}` блока кнопки «Копировать» (внутри того же `<div>`):

```tsx
                {message.type === 'assistant' && !message.isStreaming && message.content && (
                  <ListenButton
                    messageId={message.id}
                    content={message.content}
                    assistant={selectedAssistant?.name}
                    phase={listen.phaseOf(message.id)}
                    onToggle={listen.toggle}
                  />
                )}
```

- [ ] **Step 4: Прогнать локально — зелёный, плюс соседние сторожа чата**

```bash
./node_modules/.bin/vitest run src/components/chat/listenWiring.test.ts src/components/chat/interactivityWiring.test.ts src/components/chat/listen
```

Ожидается: всё зелёное.

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/ChatInterface.tsx src/components/chat/listenWiring.test.ts
git -C $FRONT commit -m "feat(chat): кнопка «Прослушать» в строке под ответом ассистента"
```

### Task 11: полные проверки фронта на ноде

- [ ] **Step 1: Запушить ветку и прогнать на ноде всё**

```bash
git -C $FRONT push -q -u origin feat/listen-answer
SHA=$(git -C $FRONT rev-parse HEAD)
ssh dv@85.192.61.231 "git -C ~/ci/spirits_front fetch -q origin && (test -d ~/ci/wt/listen-front || git -C ~/ci/spirits_front worktree add -q --detach ~/ci/wt/listen-front $SHA) && git -C ~/ci/wt/listen-front checkout -q --detach $SHA && cd ~/ci/wt/listen-front && source ~/.nvm/nvm.sh && pnpm install --frozen-lockfile >/dev/null && pnpm test 2>&1 | tail -15 && pnpm build 2>&1 | tail -5 && pnpm check-locales && pnpm check-hardcoded && pnpm check-locale-format && pnpm check-keys"
```

Ожидается: vitest зелёный (сравнить число падений с `origin/main`, если там есть давние красные), сборка прошла, все четыре сторожа зелёные.

- [ ] **Step 2: tsc фронта — дельтой к main** (на main ~45 давних ошибок: сравниваем число, а не ноль)

```bash
ssh dv@85.192.61.231 "cd ~/ci/wt/listen-front && source ~/.nvm/nvm.sh && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c 'error TS'; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep 'listen' || echo 'нет ошибок в listen*'"
```

Ожидается: в файлах `listen*` и в новых строках `ChatInterface.tsx` ошибок нет.

- [ ] **Step 3: lint локально**

```bash
cd $FRONT && ./node_modules/.bin/eslint src/components/chat/listen src/components/chat/listenWiring.test.ts
```

### Task 12: слияние и выкат — только с «ок» владельца

- [ ] **Step 1:** Запушить ветку бэка (`git -C $BACK push -u origin feat/listen-answer`) и показать владельцу итог: что сделано, как проверено, что увидит пользователь.
- [ ] **Step 2:** После «ок» — слить ветки в `main` обоих репозиториев поверх свежего `origin/main` (`git merge --no-ff feat/listen-answer`, затем `git push origin HEAD:main`). Общий чекаут на маке не трогать.
- [ ] **Step 3:** Перед выкатом прочитать шапку `deploy.sh` и правило «фронт — с чистого клона». Запустить `deploy.sh` отвязанно, без `| tail`.
- [ ] **Step 4:** Проверить руками на test.linkeon.io и проде:
  - русский ответ звучит голосом из настроек;
  - в «Истории» есть «Озвучка ответа»;
  - повтор бесплатен;
  - ответ длиннее 2000 знаков играет без пауз между кусками;
  - «Остановить» и переключение между ответами работают;
  - строка под ответом на 375 px не ломается;
  - в логах API есть `speech migration applied: 002_speech_listens.sql`.
