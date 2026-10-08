# Медиа и файлы, часть C: ассистент ищет файлы сам — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ассистент по просьбе пользователя находит файлы, которые ассистенты уже создавали ему раньше, во всех его переписках, и отдаёт их ссылками. Пример: «найди договор, который ты делала в сентябре».

**Architecture:**
- **Инструмент.** `find_files` — второй инструмент на защищённой точке `/webhook/mcp/products`. Владелец берётся из подписанного токена `product-tool`, аргумента `userId` нет.
- **Поиск.** Те же данные, что у панели (план B): `ChatFilesService.searchForUser` читает все ответы ассистентов пользователя, разбирает их `extractChatFiles` и ранжирует по словам запроса (`chat-files/find-files.ts`).
- **Каналы.** Веб-ассистенты получают инструмент через релей (правка `PRODUCTS_TOOLS` и `PRODUCTS_PROMPT` в `server.mjs`), Маша — через локальный CLI. TG-бот не получает: точка не показывает инструмент токену канала `telegram`.

**Tech Stack:** NestJS 10 + pg + jest, `@modelcontextprotocol/sdk` (бэк); релей — node `server.mjs` под pm2; фронт — только подпись шага (TypeScript + vitest + i18next).

**Спека:** `docs/superpowers/specs/2026-10-08-chat-media-files-design.md`, часть 4.

**Зависимость:** нужен план B в `main`: `extract.ts` и `ChatFilesService` с `collectFiles` и `resolve`. Ветку бэка заводить после слияния плана B.

---

## Где работать

- **Бэк:** ворктри `~/Downloads/spirits_back/.worktrees/find-files-tool`, ветка `feat/find-files-tool` от `origin/main` (с планами A и B). Ниже — `$BACK`.
- **Фронт:** ворктри `~/Downloads/spirits_front/.worktrees/find-files-tool`, ветка `feat/find-files-tool`. Ниже — `$FRONT`. `node_modules` — симлинк: `ln -s ~/Downloads/spirits_front/node_modules $FRONT/node_modules`.
- **«Прогон тестов бэка с путём `<путь>`»:**

  ```bash
  BACK=~/Downloads/spirits_back/.worktrees/find-files-tool
  git -C $BACK push -q origin feat/find-files-tool
  SHA=$(git -C $BACK rev-parse HEAD)
  ssh dv@85.192.61.231 "git -C ~/ci/spirits_back fetch -q origin && (test -d ~/ci/wt/find-files-tool || git -C ~/ci/spirits_back worktree add -q --detach ~/ci/wt/find-files-tool $SHA) && git -C ~/ci/wt/find-files-tool checkout -q --detach $SHA && cd ~/ci/wt/find-files-tool && git log -1 --format='нода: %h %s' && source ~/.nvm/nvm.sh && (test -d node_modules || npm ci --no-audit --no-fund >/dev/null) && npx jest <путь> --maxWorkers=2 2>&1 | tail -60"
  ```

- **«tsc-гейт бэка»:**

  ```bash
  ssh dv@85.192.61.231 "cd ~/ci/wt/find-files-tool && source ~/.nvm/nvm.sh && npx tsc --noEmit -p tsconfig.build.json 2>&1 | tail -30"
  ```

  Вывод должен быть пустым. В бэке `strictNullChecks: false`: сужать союзы через `x.ok === false`.

- **«Точечный тест фронта `<файл>`»:**

  ```bash
  cd ~/Downloads/spirits_front/.worktrees/find-files-tool && PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run <файл>
  ```

- **Коммиты.** Сначала красный тест `test(...): … (красный)`, потом правка. Файлы — поимённо. В исходниках не писать `\uXXXX`: инструмент записи файлов превращает их в невидимые символы. Подпись коммита — та, которую предписывает твоя среда.
- **Релей и выкат** (задачи 10–12) — только после явного OK владельца.

## Файлы

| Файл | Что |
|---|---|
| `$BACK/src/chat/chat-files/find-files.ts` (новый) | `FindFilesInput`, `parseFindFilesInput`, `normalizeForSearch`, `queryWords`, `scoreFile`, `plainNote`, `assistantPart` |
| `$BACK/src/chat/chat-files/find-files.spec.ts` (новый) | их тесты |
| `$BACK/src/chat/chat-files/find-files.tool.ts` (новый) | `FIND_FILES_TOOL_NAME`, `FIND_FILES_TOOL` (описание и схема для модели) |
| `$BACK/src/chat/chat-files/find-files.tool.spec.ts` (новый) | контракт схемы |
| `$BACK/src/chat/chat-files/chat-files.service.ts` | `sessionId` в `FoundFile`, `USER_FILES_SQL`, `assistantNames`, `searchForUser` |
| `$BACK/src/chat/chat-files/chat-files.search.spec.ts` (новый) | тесты поиска |
| `$BACK/src/chat/chat.module.ts` | `exports` += `ChatFilesService` |
| `$BACK/src/mcp/products-mcp.controller.ts` | инструменты по каналу, вызов `find_files` |
| `$BACK/src/mcp/products-mcp.controller.spec.ts` | новые случаи; прежнее «ровно один инструмент» → по каналу |
| `$BACK/src/products/products-cli-tool.ts` | `FIND_FILES_CLI_TOOL_NAME`, `FIND_FILES_CLI_PROMPT` |
| `$BACK/src/chat/chat.service.ts` | Маша: `allowedTools`, блок промпта, флаг «звали инструмент» |
| `$BACK/src/chat/chat.service.masha-products.spec.ts` | ожидание `allowedTools`, блок промпта |
| `$BACK/src/chat/activity-map.ts` | `ActivityKind` += `find_files`, `BY_NAME` |
| `$BACK/src/chat/activity-map.spec.ts` | строка таблицы |
| `$BACK/relay-agent/server.mjs` | копия правки релея |
| `$FRONT/src/components/chat/turnActivity.ts` | `ACTIVITY_KINDS` += `find_files` |
| `$FRONT/src/components/chat/turnActivity.test.ts` | новый вид известен |
| `$FRONT/src/i18n/locales/{ru,en,de,es,fr,pt,zh}.json` | `chat.activity.kind.find_files` |
| живой `~/file-agent/server.mjs` на релее | `PRODUCTS_TOOLS`, `PRODUCTS_PROMPT` |

---

### Task 1: Разбор запроса и ранжирование — `find-files.ts`

**Files:**
- Create: `$BACK/src/chat/chat-files/find-files.ts`
- Test: `$BACK/src/chat/chat-files/find-files.spec.ts`

- [ ] **Step 0: Ворктри**

```bash
git -C ~/Downloads/spirits_back fetch -q origin
git -C ~/Downloads/spirits_back worktree add -b feat/find-files-tool .worktrees/find-files-tool origin/main
git -C ~/Downloads/spirits_back/.worktrees/find-files-tool push -q -u origin feat/find-files-tool
ls ~/Downloads/spirits_back/.worktrees/find-files-tool/src/chat/chat-files/chat-files.service.ts
```

Ожидание: файл есть. Если нет — план B ещё не влит, остановиться.

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/find-files.spec.ts
import {
  FIND_FILES_DEFAULT_LIMIT, assistantPart, normalizeForSearch, parseFindFilesInput, plainNote, queryWords, scoreFile,
} from './find-files';

describe('parseFindFilesInput', () => {
  it('пустой вход — без слов, любой вид, без фильтров, лимит по умолчанию', () => {
    expect(parseFindFilesInput(undefined)).toEqual({ query: '', kind: 'any', assistant: '', days: null, limit: FIND_FILES_DEFAULT_LIMIT });
  });
  it('приводит типы и зажимает числа в рамки', () => {
    expect(parseFindFilesInput({ query: '  договор ', kind: 'DOCUMENT', assistant: ' Ирина ', days: '30', limit: 500 }))
      .toEqual({ query: 'договор', kind: 'document', assistant: 'Ирина', days: 30, limit: 30 });
    expect(parseFindFilesInput({ kind: 'spreadsheet', days: 0, limit: -3 })).toMatchObject({ kind: 'any', days: null, limit: FIND_FILES_DEFAULT_LIMIT });
    expect(parseFindFilesInput({ days: 99999 }).days).toBe(3650);
  });
  it('длинные строки обрезаются', () => {
    expect(parseFindFilesInput({ query: 'а'.repeat(500) }).query).toHaveLength(200);
  });
});

describe('слова и очки', () => {
  it('ё и регистр не мешают', () => {
    expect(normalizeForSearch('Отчёт ПО Ёлкам')).toBe('отчет по елкам');
  });
  it('слова запроса — от двух знаков, без повторов', () => {
    expect(queryWords('Договор аренды, договор! и 2026')).toEqual(['договор', 'аренды', '2026']);
  });
  it('слово в имени весит больше, чем в тексте', () => {
    expect(scoreFile(['договор'], 'dogovor.docx', 'Подготовила договор аренды')).toBe(1);
    expect(scoreFile(['договор'], 'Договор.docx', 'без слова')).toBe(3);
    expect(scoreFile(['договор', 'аренды'], 'Договор.docx', 'договор аренды')).toBe(5);
    expect(scoreFile(['отчет'], 'report.pdf', 'про погоду')).toBe(0);
  });
});

describe('plainNote', () => {
  it('без разметки, адресов и маркеров, не длиннее предела', () => {
    const text = '## Итог\n\nСделала **договор аренды** — [Скачать d.docx](https://pub/x/d.docx)\n\n![](https://pub/i.png) [VIDEO_JOB:11111111-2222-4333-8444-555555555555]';
    expect(plainNote(text)).toBe('Итог Сделала договор аренды — Скачать d.docx');
    expect(Array.from(plainNote('я'.repeat(500), 50))).toHaveLength(50);
  });
});

describe('assistantPart', () => {
  it('число, кастомный ассистент, «Чистый лист» срезается', () => {
    expect(assistantPart('u1_12', 'u1')).toBe('12');
    expect(assistantPart('u1_custom:0f8e6a1c-1111-4222-8333-444455556666', 'u1')).toBe('custom:0f8e6a1c-1111-4222-8333-444455556666');
    expect(assistantPart('u1_12_fresh_1728000000000', 'u1')).toBe('12');
    expect(assistantPart('u2_12', 'u1')).toBe('');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/find-files.spec.ts
git -C $BACK commit -q -m "test(chat-files): разбор запроса и ранжирование поиска файлов (красный)"
```

«Прогон тестов бэка с путём `src/chat/chat-files/find-files.spec.ts`». Ожидание: `Cannot find module './find-files'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/find-files.ts
import { ChatFileKind } from './extract';

/**
 * Поиск файлов для инструмента find_files: разбор того, что прислала модель,
 * и ранжирование. Чистые функции — всё под тестами (find-files.spec.ts).
 */

export interface FindFilesInput {
  /** Пустая строка — без слов: просто последние файлы. */
  query: string;
  kind: ChatFileKind | 'any';
  /** Пустая строка — у любого ассистента. */
  assistant: string;
  days: number | null;
  limit: number;
}

export const FIND_FILES_DEFAULT_LIMIT = 10;
export const FIND_FILES_MAX_LIMIT = 30;
const KINDS = new Set(['image', 'video', 'document', 'audio', 'any']);

/** Вход от модели: типы приводятся, лишнее отбрасывается, числа зажимаются в рамки. */
export function parseFindFilesInput(raw: any): FindFilesInput {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const num = (v: unknown) => Math.floor(typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN);
  const kind = str(raw?.kind, 20).toLowerCase();
  const days = num(raw?.days);
  const limit = num(raw?.limit);
  return {
    query: str(raw?.query, 200),
    kind: (KINDS.has(kind) ? kind : 'any') as FindFilesInput['kind'],
    assistant: str(raw?.assistant, 60),
    days: Number.isFinite(days) && days >= 1 ? Math.min(days, 3650) : null,
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(limit, FIND_FILES_MAX_LIMIT) : FIND_FILES_DEFAULT_LIMIT,
  };
}

/** Для сравнения: регистр, «ё» и составные символы не мешают найти. */
export function normalizeForSearch(s: string): string {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е');
}

/** Слова запроса — куски из букв и цифр от двух знаков, без повторов. */
export function queryWords(query: string): string[] {
  return [...new Set(normalizeForSearch(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2))];
}

/** Очки файла: 3 за слово в имени, 1 — за слово в тексте ответа, где файл появился. */
export function scoreFile(words: string[], name: string, text: string): number {
  const n = normalizeForSearch(name);
  const t = normalizeForSearch(text);
  let score = 0;
  for (const w of words) {
    if (n.includes(w)) score += 3;
    if (t.includes(w)) score += 1;
  }
  return score;
}

/** Текст ответа без разметки, адресов и маркеров — короткая подпись к найденному файлу. */
export function plainNote(text: string, max = 200): string {
  const s = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[(?:VIDEO_JOB|CALENDAR_PROPOSAL):[^\]]*\]|\{\{[^}]*\}\}/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_>`~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : s;
}

/** Ассистент переписки из session_id: число или `custom:<uuid>`; хвост «Чистого листа» срезается. */
export function assistantPart(sessionId: string, userId: string): string {
  if (!sessionId.startsWith(`${userId}_`)) return '';
  return sessionId.slice(userId.length + 1).replace(/_fresh_\d+$/, '');
}
```

- [ ] **Step 4: Прогнать тест** — тот же путь, все passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/find-files.ts
git -C $BACK commit -q -m "feat(chat-files): разбор запроса и ранжирование поиска файлов"
```

---

### Task 2: Описание инструмента для модели — `find-files.tool.ts`

**Files:**
- Create: `$BACK/src/chat/chat-files/find-files.tool.ts`
- Test: `$BACK/src/chat/chat-files/find-files.tool.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/find-files.tool.spec.ts
import { FIND_FILES_TOOL, FIND_FILES_TOOL_NAME } from './find-files.tool';

describe('контракт find_files', () => {
  it('имя совпадает с тем, что разрешено релею и Маше (mcp__products__find_files)', () => {
    expect(FIND_FILES_TOOL_NAME).toBe('find_files');
    expect(FIND_FILES_TOOL.name).toBe(FIND_FILES_TOOL_NAME);
  });

  it('аргумента userId нет: владелец — из подписи токена', () => {
    const props = Object.keys(FIND_FILES_TOOL.input_schema.properties);
    expect(props.sort()).toEqual(['assistant', 'days', 'kind', 'limit', 'query']);
    expect(FIND_FILES_TOOL.input_schema.additionalProperties).toBe(false);
  });

  it('описание учит отдавать ссылки и честно говорить о пропавших', () => {
    expect(FIND_FILES_TOOL.description).toContain('[name](url)');
    expect(FIND_FILES_TOOL.description).toContain('stored=false');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/find-files.tool.spec.ts
git -C $BACK commit -q -m "test(chat-files): контракт инструмента find_files (красный)"
```

«Прогон тестов бэка с путём `src/chat/chat-files/find-files.tool.spec.ts`» — `Cannot find module`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/find-files.tool.ts
/**
 * Инструмент find_files — для модели. Живёт на защищённой точке
 * /webhook/mcp/products (products-mcp.controller.ts): владелец берётся из
 * подписи токена сессии, поэтому аргумента userId здесь нет и быть не должно.
 * На общую точку /mcp этот инструмент не добавляется.
 *
 * Полное имя у модели — mcp__products__find_files: ключ сервера `products`
 * общий с manage_product (relay-agent/server.mjs: PRODUCTS_TOOLS;
 * products-cli-tool.ts: FIND_FILES_CLI_TOOL_NAME).
 */
export const FIND_FILES_TOOL_NAME = 'find_files';

export const FIND_FILES_TOOL = {
  name: FIND_FILES_TOOL_NAME,
  description:
    'Найти файлы, которые ассистенты Linkeon уже создавали этому пользователю: документы, картинки, видео, озвучку — ' +
    'во всех его разговорах с ассистентами, включая «Чистый лист». Ты видишь только файлы этого пользователя.\n' +
    'Зови, когда пользователь ищет или просит снова прислать файл из прошлого разговора («найди договор», ' +
    '«пришли ту презентацию», «где картинка, что делал Роман»).\n' +
    '• query — слова для поиска в имени файла и в тексте ответа, где он появился. Пустой query — просто последние файлы.\n' +
    '• kind — image | video | document | audio | any.\n' +
    '• assistant — имя ассистента, в переписке с которым искать.\n' +
    '• days — только за последние N дней. • limit — сколько вернуть: по умолчанию 10, не больше 30.\n' +
    'Ответ: files[] с полями name, kind, date, assistant, url, stored, note (строка из того ответа).\n' +
    'Отдавай найденное пользователю markdown-ссылкой [name](url) — адрес как есть. Если stored=false, url нет: ' +
    'честно скажи, что этот файл не сохранился. Если ничего не нашлось — попробуй синонимы, транслит или ' +
    'английский вариант слова, либо kind и days без слов. По url файл можно скачать и работать с ним дальше.\n' +
    'userId и телефон не передавай: сервер уже знает, чей это разговор.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Слова для поиска в имени файла и в тексте ответа. Пусто — последние файлы.' },
      kind: { type: 'string', enum: ['image', 'video', 'document', 'audio', 'any'], description: 'Вид файла.' },
      assistant: { type: 'string', description: 'Имя ассистента, в переписке с которым искать.' },
      days: { type: 'integer', minimum: 1, maximum: 3650, description: 'Только за последние N дней.' },
      limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Сколько вернуть; по умолчанию 10.' },
    },
    additionalProperties: false,
  },
};
```

- [ ] **Step 4: Прогнать тест** — 3 passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/find-files.tool.ts
git -C $BACK commit -q -m "feat(chat-files): описание инструмента find_files для модели"
```

---

### Task 3: Поиск по всем перепискам — `ChatFilesService.searchForUser`

**Files:**
- Modify: `$BACK/src/chat/chat-files/chat-files.service.ts`
- Test: `$BACK/src/chat/chat-files/chat-files.search.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/chat-files.search.spec.ts
import { ChatFilesService, USER_FILES_SQL } from './chat-files.service';
import { parseFindFilesInput } from './find-files';

const MINIO = 'https://my.linkeon.io/smm-media';
const RELAY = 'https://r.linkeon.io/files/u1_12_ru';
const CUSTOM = '0f8e6a1c-1111-4222-8333-444455556666';

/** Строки истории от новых к старым — как их отдаёт USER_FILES_SQL. */
const ROWS = [
  { id: 5, session_id: 'u1_12', content: `Готово, [Скачать dogovor.docx](${MINIO}/linkeon-chat-files/a/dogovor.docx) — договор аренды квартиры`, created_at: '2026-10-05T10:00:00Z' },
  { id: 4, session_id: `u1_custom:${CUSTOM}`, content: `![](${MINIO}/linkeon-assets/images/logo.png) логотип для кофейни`, created_at: '2026-10-03T10:00:00Z' },
  { id: 3, session_id: 'u1_7_fresh_1728000000000', content: `[Скачать Отчёт.pdf](${MINIO}/linkeon-chat-files/b/Отчёт.pdf) отчёт за квартал`, created_at: '2026-09-25T10:00:00Z' },
  { id: 2, session_id: 'u1_12', content: `[Скачать Договор поставки.docx](${RELAY}/Договор поставки.docx)`, created_at: '2026-09-10T10:00:00Z' },
];

function makePg() {
  const calls: { sql: string; params: any[] }[] = [];
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql === USER_FILES_SQL) return { rows: ROWS };
    if (/FROM agents a/.test(sql)) {
      return {
        rows: [
          { id: 12, display: 'Ирина', name: 'irina', aliases: ['Irina'] },
          { id: 7, display: 'Роман', name: 'roman', aliases: ['Roman'] },
        ].filter((r) => params[0].includes(r.id)),
      };
    }
    if (/FROM custom_agents/.test(sql)) {
      return { rows: params[1] === 'u1' && params[0].includes(CUSTOM) ? [{ id: CUSTOM, name: 'Мой бариста' }] : [] };
    }
    return { rows: [] };
  });
  return { query, calls };
}

beforeEach(() => {
  process.env.MINIO_PUBLIC_URL = MINIO;
  delete process.env.AGENT_URL;
});

const search = async (raw: any) => {
  const pg = makePg();
  const r = await new ChatFilesService(pg as any).searchForUser('u1', parseFindFilesInput(raw));
  return { r, pg };
};

describe('ChatFilesService.searchForUser', () => {
  it('читает все переписки пользователя: LIKE с экранированным «_» и фильтр дней параметром', async () => {
    const { pg } = await search({ days: 30 });
    expect(pg.calls[0].sql).toBe(USER_FILES_SQL);
    expect(pg.calls[0].params).toEqual(['u1', 30]);
    expect(USER_FILES_SQL).toContain(`session_id LIKE $1 || '\\_%' ESCAPE '\\'`);
    expect(USER_FILES_SQL).toMatch(/sender_type = 'ai'/);
    expect(USER_FILES_SQL).toMatch(/\$2::int IS NULL OR created_at >= now\(\) - make_interval\(days => \$2::int\)/);
  });

  it('без слов — последние файлы с ассистентом, датой и подписью', async () => {
    const { r } = await search({});
    expect(r.ok).toBe(true);
    expect(r.total).toBe(4);
    expect(r.files[0]).toEqual({
      name: 'dogovor.docx', kind: 'document', date: '2026-10-05', assistant: 'Ирина',
      url: `${MINIO}/linkeon-chat-files/a/dogovor.docx`, stored: true,
      note: 'Готово, Скачать dogovor.docx — договор аренды квартиры',
    });
    expect(r.files.map((f) => f.assistant)).toEqual(['Ирина', 'Мой бариста', 'Роман', 'Ирина']);
  });

  it('слово ищется и в тексте ответа: «договор» находит dogovor.docx по описанию', async () => {
    const { r } = await search({ query: 'договор' });
    expect(r.files.map((f) => f.name)).toEqual(['Договор поставки.docx', 'dogovor.docx']);
  });

  it('у не сохранившегося файла нет адреса', async () => {
    const { r } = await search({ query: 'поставки' });
    expect(r.files[0]).toMatchObject({ name: 'Договор поставки.docx', stored: false });
    expect(r.files[0].url).toBeUndefined();
  });

  it('фильтр по виду и по ассистенту (любое его имя, без учёта регистра)', async () => {
    expect((await search({ kind: 'image' })).r.files.map((f) => f.name)).toEqual(['logo.png']);
    expect((await search({ assistant: 'roman' })).r.files.map((f) => f.name)).toEqual(['Отчёт.pdf']);
    expect((await search({ assistant: 'бариста' })).r.files.map((f) => f.name)).toEqual(['logo.png']);
  });

  it('кастомные ассистенты — только свои', async () => {
    const { pg } = await search({});
    const q = pg.calls.find((c) => /FROM custom_agents/.test(c.sql))!;
    expect(q.sql).toMatch(/owner_user_id = \$2/);
    expect(q.params).toEqual([[CUSTOM], 'u1']);
  });

  it('ничего не нашлось — пустой список, total 0', async () => {
    const { r } = await search({ query: 'квантовый' });
    expect(r).toEqual({ ok: true, total: 0, files: [] });
  });

  it('limit режет выдачу, total — сколько нашлось всего', async () => {
    const { r } = await search({ limit: 2 });
    expect(r.total).toBe(4);
    expect(r.files).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/chat-files.search.spec.ts
git -C $BACK commit -q -m "test(chat-files): поиск файлов по всем перепискам пользователя (красный)"
```

«Прогон тестов бэка с путём `src/chat/chat-files/chat-files.search.spec.ts`» — `USER_FILES_SQL` не экспортирован, `searchForUser` не функция.

- [ ] **Step 3: Реализация в `chat-files.service.ts`**

**(а)** В интерфейс `FoundFile` добавить поле:

```ts
  /** session_id строки истории — по нему поиск узнаёт ассистента. */
  sessionId?: string;
```

**(б)** В `collectFiles` строку `out.push({ file, createdAt, messageId: Number(r.id), text });` заменить на:

```ts
      out.push({
        file,
        createdAt,
        messageId: Number(r.id),
        text,
        ...(r.session_id ? { sessionId: String(r.session_id) } : {}),
      });
```

**(в)** К импортам добавить:

```ts
import { FindFilesInput, assistantPart, normalizeForSearch, plainNote, queryWords, scoreFile } from './find-files';
```

**(г)** После `SESSION_FILES_SQL` добавить:

```ts
/** Сколько ответов читает один поиск по всем перепискам пользователя. */
export const SEARCH_ROWS_LIMIT = 5000;

/**
 * Все переписки пользователя, включая «Чистый лист». `_` в LIKE экранирован:
 * без этого `7903016918_%` захватил бы и переписку номера 79030169187.
 */
export const USER_FILES_SQL = `SELECT id, session_id, content, created_at FROM custom_chat_history
 WHERE session_id LIKE $1 || '\\_%' ESCAPE '\\' AND sender_type = 'ai'
   AND content ~ '(https?://|\\[VIDEO_JOB:|\\{\\{audio:id=)'
   AND ($2::int IS NULL OR created_at >= now() - make_interval(days => $2::int))
 ORDER BY created_at DESC
 LIMIT ${SEARCH_ROWS_LIMIT}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Что отдаёт find_files модели. Адреса у stored=false нет. */
export interface FoundForTool {
  name: string;
  kind: ChatFileKind;
  date: string;
  assistant: string;
  url?: string;
  stored: boolean;
  note: string;
}
```

**(д)** В класс `ChatFilesService` добавить методы:

```ts
  /**
   * Имена ассистентов по частям session_id. Для сравнения с запросом модели
   * берутся все имена: служебное, отображаемое и переводы. Кастомные — только свои.
   */
  async assistantNames(userId: string, parts: string[]): Promise<Map<string, { display: string; aliases: string[] }>> {
    const out = new Map<string, { display: string; aliases: string[] }>();
    const ids = [...new Set(parts.filter((p) => /^\d+$/.test(p)).map(Number))];
    const customs = [...new Set(parts.filter((p) => p.startsWith('custom:') && UUID_RE.test(p.slice(7))).map((p) => p.slice(7)))];
    if (ids.length > 0) {
      const { rows } = await this.pg.query(
        `SELECT a.id, COALESCE(a.display_name, a.name) AS display, a.name,
                ARRAY(SELECT t.display_name FROM agent_translations t
                       WHERE t.entity_type = 'agent' AND t.entity_id = a.id::text AND t.display_name IS NOT NULL) AS aliases
           FROM agents a WHERE a.id = ANY($1::int[])`,
        [ids],
      );
      for (const r of rows) {
        out.set(String(r.id), { display: String(r.display), aliases: [r.name, ...(r.aliases || [])].filter(Boolean).map(String) });
      }
    }
    if (customs.length > 0) {
      const { rows } = await this.pg.query(
        `SELECT id, name FROM custom_agents WHERE id = ANY($1::uuid[]) AND owner_user_id = $2`,
        [customs, userId],
      );
      for (const r of rows) out.set(`custom:${r.id}`, { display: String(r.name), aliases: [] });
    }
    return out;
  }

  /**
   * Инструмент find_files: файлы всех переписок пользователя с ассистентами.
   * Сначала фильтры (вид, ассистент), потом очки по словам запроса; при равных
   * очках — свежие выше (сортировка устойчива, строки уже от новых к старым).
   */
  async searchForUser(
    userId: string,
    input: FindFilesInput,
  ): Promise<{ ok: true; total: number; files: FoundForTool[] }> {
    const { rows } = await this.pg.query(USER_FILES_SQL, [userId, input.days]);
    const found = collectFiles(rows, extractEnv());
    const partOf = (f: FoundFile) => assistantPart(f.sessionId ?? '', userId);
    const names = await this.assistantNames(userId, found.map(partOf));

    const want = normalizeForSearch(input.assistant);
    const words = queryWords(input.query);
    const candidates = found
      .filter((f) => input.kind === 'any' || f.file.kind === input.kind)
      .filter((f) => {
        if (!want) return true;
        const n = names.get(partOf(f));
        return !!n && [n.display, ...n.aliases].some((a) => normalizeForSearch(a).includes(want));
      })
      .map((f) => ({ f, score: words.length > 0 ? scoreFile(words, f.file.name, f.text) : 0 }))
      .filter((x) => words.length === 0 || x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.f);

    const resolved = await this.resolve(userId, candidates);
    return {
      ok: true,
      total: resolved.length,
      files: resolved.slice(0, input.limit).map(({ item, found: f }) => ({
        name: item.name,
        kind: item.kind,
        date: item.createdAt.slice(0, 10),
        assistant: names.get(partOf(f))?.display ?? '',
        ...(item.url ? { url: item.url } : {}),
        stored: item.stored,
        note: plainNote(f.text),
      })),
    };
  }
```

- [ ] **Step 4: Прогнать тесты**

«Прогон тестов бэка с путём `src/chat/chat-files`» — все passed, включая прежние `chat-files.service.spec.ts`. «tsc-гейт бэка» — пусто.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/chat-files.service.ts
git -C $BACK commit -q -m "feat(chat-files): поиск файлов по всем перепискам пользователя"
```

---

### Task 4: `find_files` на защищённой точке

**Files:**
- Modify: `$BACK/src/mcp/products-mcp.controller.ts`
- Modify: `$BACK/src/chat/chat.module.ts`
- Test: `$BACK/src/mcp/products-mcp.controller.spec.ts`

- [ ] **Step 1: Тесты**

В `src/mcp/products-mcp.controller.spec.ts`:

**(а)** В фабрике `make` создать поддельный сервис файлов и передать его в контроллер:

```ts
  const make = () => {
    const calls: any[] = [];
    const tool = {
      execute: jest.fn(async (userId: string, input: any, channel?: string) => {
        calls.push({ userId, input, channel });
        return { ok: true };
      }),
    };
    const files = { searchForUser: jest.fn(async () => ({ ok: true, total: 0, files: [] })) };
    return { ctrl: new ProductsMcpController(tool as any, files as any), calls, tool, files };
  };
```

**(б)** Тест `'список инструментов отдаётся без аргумента userId'` заменить на:

```ts
  it('веб: продукты и поиск файлов, у обоих нет аргумента userId', () => {
    const { ctrl } = make();
    const tools = ctrl.listTools('web');
    expect(tools.map((t: any) => t.name)).toEqual(['manage_product', 'find_files']);
    for (const t of tools as any[]) expect(Object.keys(t.inputSchema.properties)).not.toContain('userId');
  });

  it('Telegram: только продукты — поиск файлов в боте не включён', () => {
    const { ctrl } = make();
    expect(ctrl.listTools('telegram').map((t: any) => t.name)).toEqual(['manage_product']);
  });

  it('find_files: владелец из токена, userId из запроса выбрасывается', async () => {
    const { ctrl, files, tool } = make();
    await ctrl.callTool(`Bearer ${signProductToolToken('79030169187')}`, { query: 'договор', userId: '70000000000' }, 'find_files');
    expect(files.searchForUser).toHaveBeenCalledWith('79030169187', expect.objectContaining({ query: 'договор' }));
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('find_files с токеном Telegram — отказ, поиск не зовётся', async () => {
    const { ctrl, files, tool } = make();
    const r: any = await ctrl.callTool(`Bearer ${signProductToolToken('79030169187', 'telegram')}`, { query: 'x' }, 'find_files');
    expect(r.ok).toBe(false);
    expect(files.searchForUser).not.toHaveBeenCalled();
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('незнакомое имя — отказ, ничего не зовётся', async () => {
    const { ctrl, files, tool } = make();
    const r: any = await ctrl.callTool(`Bearer ${signProductToolToken('79030169187')}`, {}, 'rm_rf');
    expect(r.ok).toBe(false);
    expect(files.searchForUser).not.toHaveBeenCalled();
    expect(tool.execute).not.toHaveBeenCalled();
  });
```

Прежние тесты, которые зовут `ctrl.callTool(auth, args)` без имени, менять не нужно: по умолчанию это `manage_product`.

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/mcp/products-mcp.controller.spec.ts
git -C $BACK commit -q -m "test(mcp): find_files на точке продуктов, только веб (красный)"
```

«Прогон тестов бэка с путём `src/mcp/products-mcp.controller.spec.ts`». Ожидание: новые 5 падают, прежние зелёные.

- [ ] **Step 3: Реализация**

В `src/mcp/products-mcp.controller.ts`:

**(а)** Импорты: `ProductToolChannel` добавить к импорту из `'../products/product-tool.token'`, затем:

```ts
import { ChatFilesService } from '../chat/chat-files/chat-files.service';
import { FIND_FILES_TOOL, FIND_FILES_TOOL_NAME } from '../chat/chat-files/find-files.tool';
import { parseFindFilesInput } from '../chat/chat-files/find-files';
```

**(б)** Конструктор:

```ts
  constructor(
    private readonly tool: ProductToolService,
    private readonly files: ChatFilesService,
  ) {}
```

**(в)** Заменить `listTools()` и `callTool(...)` на:

```ts
  /** Инструменты по каналу токена: поиск файлов — только в вебе (TG-бот в эту фичу не входит). */
  private toolsFor(channel: ProductToolChannel) {
    return channel === 'telegram' ? PRODUCT_TOOLS : [...PRODUCT_TOOLS, FIND_FILES_TOOL];
  }

  /** Вынесено из makeServer ради проверяемости: контракт схемы — часть защиты. */
  listTools(channel: ProductToolChannel = 'web') {
    return this.toolsFor(channel).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema,
    }));
  }

  /** Вынесено из makeServer по той же причине: здесь живёт разбор владельца. */
  async callTool(authHeader: string | undefined, args: any, name: string = PRODUCT_TOOLS[0].name) {
    const { userId, channel } = this.owner(authHeader);
    // userId из запроса выбрасывается ЯВНО, а не игнорируется по невнимательности:
    // поле могло бы приехать и перекрыть владельца при любой будущей правке
    // execute(), которая начнёт заглядывать в input. channel — туда же: канал
    // хода (web/telegram) несёт подпись токена, а не поле, которое пишет модель.
    const { userId: _drop, channel: _dropChannel, ...input } = args ?? {};
    if (!this.toolsFor(channel).some((t) => t.name === name)) {
      return { ok: false, error: `Неизвестный инструмент: ${name}` };
    }
    if (name === FIND_FILES_TOOL_NAME) return this.files.searchForUser(userId, parseFindFilesInput(input));
    return this.tool.execute(userId, input, channel);
  }
```

**(г)** В `makeServer` первой строкой взять канал, а обработчики заменить:

```ts
  private makeServer(authHeader?: string): Server {
    const { channel } = this.owner(authHeader);
    const server = new Server(
      { name: 'linkeon-products', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.listTools(channel) }));
    server.setRequestHandler(CallToolRequestSchema, async (req: any) => {
      const { name, arguments: args } = req.params ?? {};
      const result: any = await this.callTool(authHeader, args, name);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok };
    });
    return server;
  }
```

В `src/chat/chat.module.ts` экспортировать сервис: точку держит `McpModule`, а он импортирует `ChatModule`.

```ts
  exports: [ChatToolsService, ChatService, ChatFilesService],
```

- [ ] **Step 4: Прогнать тесты** — «Прогон тестов бэка с путём `src/mcp`»: все passed. «tsc-гейт бэка» — пусто.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/mcp/products-mcp.controller.ts src/chat/chat.module.ts
git -C $BACK commit -q -m "feat(mcp): find_files на точке продуктов — владелец из подписи, только веб"
```

---

### Task 5: Маша получает `find_files`

**Files:**
- Modify: `$BACK/src/products/products-cli-tool.ts`
- Modify: `$BACK/src/chat/chat.service.ts` (вызов CLI Маши)
- Test: `$BACK/src/chat/chat.service.masha-products.spec.ts`

- [ ] **Step 1: Тесты**

В `src/chat/chat.service.masha-products.spec.ts`:

- в импорт из `'../products/products-cli-tool'` добавить `FIND_FILES_CLI_PROMPT`;
- в тесте `'автоодобрен ровно инструмент продуктов, встроенные тулы не включаются'` ожидание заменить на `expect(opts.allowedTools).toBe('mcp__products__manage_product,mcp__products__find_files');`, а название теста — на `'автоодобрены ровно продукты и поиск файлов, встроенные тулы не включаются'`;
- в тест `'блок про продукты — в системном промпте…'` после `expect(system).toContain(PRODUCTS_CLI_PROMPT);` добавить `expect(system).toContain(FIND_FILES_CLI_PROMPT);`.

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat.service.masha-products.spec.ts
git -C $BACK commit -q -m "test(chat): у Маши есть find_files (красный)"
```

«Прогон тестов бэка с путём `src/chat/chat.service.masha-products.spec.ts`» — 2 failed.

- [ ] **Step 3: Реализация**

В `src/products/products-cli-tool.ts` после `PRODUCTS_CLI_TOOL_NAME` добавить:

```ts
/** Поиск файлов прошлых разговоров — тот же сервер `products` (find-files.tool.ts). Только Маше: у TG-бота его нет. */
export const FIND_FILES_CLI_TOOL_NAME = `mcp__${SERVER_KEY}__find_files`;

/** Блок системного промпта Маши про поиск файлов. */
export const FIND_FILES_CLI_PROMPT = `ФАЙЛЫ ИЗ ПРОШЛЫХ РАЗГОВОРОВ.
Тебе доступен инструмент ${FIND_FILES_CLI_TOOL_NAME}: он находит файлы, которые ассистенты уже создавали этому пользователю (документы, картинки, видео, озвучку), во всех его разговорах.
Зови его, когда пользователь ищет или просит снова прислать такой файл. Найденное отдавай markdown-ссылкой [имя](url).
Если у файла stored=false — честно скажи, что он не сохранился. НЕ передавай в инструмент userId/телефон.`;
```

В `src/chat/chat.service.ts`:

**(а)** импорт `import { productsCliMcp } from '../products/products-cli-tool';` заменить на:

```ts
import { FIND_FILES_CLI_PROMPT, FIND_FILES_CLI_TOOL_NAME, productsCliMcp } from '../products/products-cli-tool';
```

**(б)** в вызове CLI Маши строку

```ts
          system: stableSystemPrompt + `\n\n${products.promptBlock}` +
```

заменить на

```ts
          system: stableSystemPrompt + `\n\n${products.promptBlock}\n\n${FIND_FILES_CLI_PROMPT}` +
```

**(в)** строку `allowedTools: products.toolName,` заменить на:

```ts
          // + поиск файлов прошлых разговоров (find-files.tool.ts). У TG-бота
          // его нет: там allowedTools собирается из одного products.toolName.
          allowedTools: `${products.toolName},${FIND_FILES_CLI_TOOL_NAME}`,
```

**(г)** строку

```ts
            if (ev.kind === 'tool_use' && ev.name === products.toolName) usedProductsTool = true;
```

заменить на

```ts
            // Карта не подмешивается и к ходу с поиском файлов: «карточка», «картинка»
            // в разговоре о найденных файлах — не повод вешать метафорическую карту.
            if (ev.kind === 'tool_use' && (ev.name === products.toolName || ev.name === FIND_FILES_CLI_TOOL_NAME)) usedProductsTool = true;
```

- [ ] **Step 4: Прогнать тесты** — «Прогон тестов бэка с путём `src/chat/chat.service.masha src/tg-bot`»: всё passed. У TG `allowedTools` не изменился. «tsc-гейт бэка» — пусто.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/products/products-cli-tool.ts src/chat/chat.service.ts
git -C $BACK commit -q -m "feat(chat): Маша ищет файлы прошлых разговоров"
```

---

### Task 6: Шаг работы «Ищу файлы» — бэк

**Files:**
- Modify: `$BACK/src/chat/activity-map.ts`
- Test: `$BACK/src/chat/activity-map.spec.ts`

- [ ] **Step 1: Тест** — в таблицу `it.each` после строки `['mcp__products__manage_product', 'product'],` добавить `['mcp__products__find_files', 'find_files'],`.

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/activity-map.spec.ts
git -C $BACK commit -q -m "test(chat): шаг работы для find_files (красный)"
```

«Прогон тестов бэка с путём `src/chat/activity-map.spec.ts`». Ожидание: падает строка `find_files`, получено `other`.

- [ ] **Step 3: Реализация** — в `src/chat/activity-map.ts`:
  - в тип `ActivityKind` после `'product'` добавить `| 'find_files'` (строка `| 'mail_read' | 'mail_send' | 'product' | 'other';` становится `| 'mail_read' | 'mail_send' | 'product' | 'find_files' | 'other';`);
  - в `BY_NAME` после `mcp__products__manage_product: 'product',` добавить `mcp__products__find_files: 'find_files',`.

- [ ] **Step 4: Прогнать тест** — passed. «tsc-гейт бэка» — пусто.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/activity-map.ts
git -C $BACK commit -q -m "feat(chat): шаг работы «Ищу файлы» для find_files"
```

---

### Task 7: SQL поиска на настоящем Postgres

**Files:** нет (одноразовая проверка на ноде).

- [ ] **Step 1: Прогнать проверку**

```bash
git -C $BACK push -q origin feat/find-files-tool
SHA=$(git -C $BACK rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/find-files-tool && git fetch -q origin && git checkout -q --detach $SHA && source ~/.nvm/nvm.sh && (dropdb -h /var/run/postgresql --if-exists find_probe; createdb -h /var/run/postgresql find_probe) && cat > ./find-probe.ts <<'EOF'
import { Client } from 'pg';
import { ChatFilesService } from './src/chat/chat-files/chat-files.service';
import { parseFindFilesInput } from './src/chat/chat-files/find-files';
(async () => {
  process.env.MINIO_PUBLIC_URL = 'https://my.linkeon.io/smm-media';
  const c = new Client({ database: 'find_probe', host: '/var/run/postgresql' });
  await c.connect();
  await c.query(\`CREATE TABLE custom_chat_history (id serial PRIMARY KEY, session_id text, sender_type text, content text, created_at timestamptz DEFAULT now())\`);
  await c.query(\`CREATE TABLE agents (id int PRIMARY KEY, name text, display_name text)\`);
  await c.query(\`CREATE TABLE agent_translations (entity_type text, entity_id text, locale text, display_name text)\`);
  await c.query(\`CREATE TABLE custom_agents (id uuid PRIMARY KEY, owner_user_id text, name text)\`);
  await c.query(\`CREATE TABLE video_jobs (id uuid PRIMARY KEY, user_id text, status text, video_url text, thumbnail_url text)\`);
  await c.query(\`CREATE TABLE speech_clips (id uuid PRIMARY KEY, user_id text, url text)\`);
  await c.query(\`INSERT INTO agents VALUES (12, 'irina', 'Ирина')\`);
  await c.query(\`INSERT INTO agent_translations VALUES ('agent', '12', 'en', 'Irina')\`);
  const P = 'https://my.linkeon.io/smm-media/linkeon-chat-files/x';
  await c.query(\`INSERT INTO custom_chat_history (session_id, sender_type, content, created_at) VALUES
    ('7903016918_12','ai','[Скачать a.pdf](\${P}/a.pdf) договор', now()),
    ('79030169187_12','ai','[Скачать b.pdf](\${P}/b.pdf) договор', now()),
    ('7903016918_12_fresh_1728000000000','ai','[Скачать c.pdf](\${P}/c.pdf) договор', now() - interval '40 days'),
    ('7903016918_12','human','[Скачать d.pdf](\${P}/d.pdf) договор', now())\`);
  const svc = new ChatFilesService({ query: (sql: string, params?: any[]) => c.query(sql, params) } as any);
  console.log('all', JSON.stringify(await svc.searchForUser('7903016918', parseFindFilesInput({ query: 'договор' }))));
  console.log('30d', JSON.stringify(await svc.searchForUser('7903016918', parseFindFilesInput({ query: 'договор', days: 30 }))));
  console.log('en-alias', JSON.stringify((await svc.searchForUser('7903016918', parseFindFilesInput({ assistant: 'irina' }))).total));
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
EOF
npx ts-node ./find-probe.ts; rm -f ./find-probe.ts; dropdb -h /var/run/postgresql find_probe"
```

Ожидание:
- `all` — ровно `a.pdf` и `c.pdf` с ассистентом `Ирина`. `b.pdf` (номер на цифру длиннее) и `d.pdf` (строка пользователя) не попали.
- `30d` — только `a.pdf`.
- `en-alias` — `2`.
- Ошибок SQL нет.

- [ ] **Step 2: Отчитаться выводом.** Коммита нет.

---

### Task 8: Подпись шага на фронте

**Files:**
- Modify: `$FRONT/src/components/chat/turnActivity.ts`
- Modify: `$FRONT/src/i18n/locales/{ru,en,de,es,fr,pt,zh}.json`
- Test: `$FRONT/src/components/chat/turnActivity.test.ts`

- [ ] **Step 0: Ворктри фронта**

```bash
git -C ~/Downloads/spirits_front fetch -q origin
git -C ~/Downloads/spirits_front worktree add -b feat/find-files-tool .worktrees/find-files-tool origin/main
git -C ~/Downloads/spirits_front/.worktrees/find-files-tool push -q -u origin feat/find-files-tool
ln -s ~/Downloads/spirits_front/node_modules ~/Downloads/spirits_front/.worktrees/find-files-tool/node_modules
```

- [ ] **Step 1: Тест** — в `src/components/chat/turnActivity.test.ts` добавить в конец верхнего `describe`:

```ts
  it('поиск файлов прошлых разговоров — известный вид шага', () => {
    expect(addStep(startActivity(0), 'find_files').steps[0].kind).toBe('find_files');
  });
```

`addStep` и `startActivity` в файле уже импортированы, проверить импорт.

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $FRONT add src/components/chat/turnActivity.test.ts
git -C $FRONT commit -q -m "test(chat): шаг «Ищу файлы» известен фронту (красный)"
```

«Точечный тест фронта `src/components/chat/turnActivity.test.ts`». Ожидание: получено `other`.

- [ ] **Step 3: Реализация**

В `src/components/chat/turnActivity.ts` в `ACTIVITY_KINDS` строку `'mail_read', 'mail_send', 'product', 'other',` заменить на `'mail_read', 'mail_send', 'product', 'find_files', 'other',`.

Подписи — скриптом: локали переписываются через `JSON.stringify` байт в байт.

```bash
cd ~/Downloads/spirits_front/.worktrees/find-files-tool && node - <<'EOF'
const fs = require('fs');
const L = {
  ru: 'Ищу файлы из наших разговоров',
  en: 'Looking for files from our conversations',
  de: 'Suche Dateien aus unseren Gesprächen',
  es: 'Busco archivos de nuestras conversaciones',
  fr: 'Je cherche des fichiers de nos conversations',
  // pt.json — европейский португальский («ficheiro», «A carregar»), не бразильский.
  pt: 'A procurar ficheiros das nossas conversas',
  zh: '正在查找我们对话中的文件',
};
for (const [lang, label] of Object.entries(L)) {
  const p = `src/i18n/locales/${lang}.json`;
  const o = JSON.parse(fs.readFileSync(p, 'utf8'));
  const kinds = o.chat.activity.kind;
  if (kinds.find_files !== undefined) throw new Error(`${lang}: уже есть`);
  // Перед 'other', как в ACTIVITY_KINDS: пересобираем объект по порядку.
  const next = {};
  for (const [k, v] of Object.entries(kinds)) {
    if (k === 'other') next.find_files = label;
    next[k] = v;
  }
  if (next.find_files === undefined) next.find_files = label;
  o.chat.activity.kind = next;
  fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
}
console.log('ok');
EOF
git -C ~/Downloads/spirits_front/.worktrees/find-files-tool diff --stat
```

Ожидание: `ok`, по одной строке в каждом из 7 файлов.

- [ ] **Step 4: Прогнать тесты и проверку локалей**

«Точечный тест фронта `src/components/chat/turnActivity.test.ts`» — passed, включая прежний тест «у каждого вида шага есть подпись в ru.json». Затем `node scripts/check-locales.mjs && echo ok` в `$FRONT`.

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/turnActivity.ts src/i18n/locales/ru.json src/i18n/locales/en.json src/i18n/locales/de.json src/i18n/locales/es.json src/i18n/locales/fr.json src/i18n/locales/pt.json src/i18n/locales/zh.json
git -C $FRONT commit -q -m "feat(chat): подпись шага «Ищу файлы из наших разговоров» на 7 языках"
```

---

### Task 9: Финальные проверки и ревью

- [ ] **Step 1: Бэк** — «Прогон тестов бэка с путём `src/`» (сравнить с базой `main`), затем «tsc-гейт бэка».
- [ ] **Step 2: Фронт на ноде** — `pnpm test`, `npx tsc --noEmit -p tsconfig.app.json` (дельта к `main`), `pnpm build`. Команда-обёртка — как в плане B, с ворктри `~/ci/wt/find-files-tool-front`.
- [ ] **Step 3: Нарочно сломать сторожа.**
  - В `products-mcp.controller.ts` временно убрать проверку `toolsFor(channel).some(...)`: тест «find_files с токеном Telegram» обязан покраснеть.
  - В `USER_FILES_SQL` временно заменить `'\\_%' ESCAPE '\\'` на `'_%'`: проверка задачи 7 обязана показать `b.pdf`.

  После каждой мутации откатить её через `git checkout <файл>`.
- [ ] **Step 4: Ревью** — `superpowers:requesting-code-review` по `origin/main..feat/find-files-tool` в обоих репо.

---

### Task 10: Влить и выкатить бэк и фронт — ТОЛЬКО С OK ВЛАДЕЛЬЦА

- [ ] **Step 1: Спросить владельца**, затем влить обе ветки через detached `origin/main`, как в задаче 12 плана B, с веткой `feat/find-files-tool`.
- [ ] **Step 2: Выкат** — `deploy.sh` с ноды из чистых клонов, как в задаче 13 плана B: каталог `~/deploy-clones/find-files`, лог `~/deploy-logs/find-files.log`.
- [ ] **Step 3: Проверка на test.**
  - Маша: «найди мой последний pdf» — в ответе рабочая ссылка, в шагах работы «Ищу файлы из наших разговоров».
  - Ассистенты релея инструмента пока не видят: релей ещё не разрешил имя. Это ожидаемо до задачи 11.

---

### Task 11: Релей — ТОЛЬКО С OK ВЛАДЕЛЬЦА

Релей выкатывается вручную, `deploy.sh` его не трогает. Рестарт сбрасывает `--resume` у всех сессий, поэтому рестартовать только в момент без живых ходов. Node и pm2 там системные, nvm нет.

- [ ] **Step 1: Спросить владельца** — «Разрешаю `find_files` на релее и рестартую file-agent в тихий момент?»

- [ ] **Step 2: Зафиксировать текущее состояние и внести правку**

```bash
ssh dv@5.101.115.184 'cd ~/file-agent && (git diff --quiet || git commit -qam "chore(relay): состояние перед find_files") && node - <<'"'"'EOF'"'"'
const fs = require("fs");
const p = process.env.HOME + "/file-agent/server.mjs";
let s = fs.readFileSync(p, "utf8");
const oldTools = "const PRODUCTS_TOOLS = \"mcp__products__manage_product\";";
if (!s.includes(oldTools)) throw new Error("PRODUCTS_TOOLS не найден");
s = s.replace(oldTools, "const PRODUCTS_TOOLS = \"mcp__products__manage_product,mcp__products__find_files\";");
const anchor = "Если вернулось reason=\"ambiguous\" — СПРОСИ, какой продукт править, и вызови снова. Не выбирай сам.\n`;";
if (!s.includes(anchor)) throw new Error("конец PRODUCTS_PROMPT не найден");
s = s.replace(anchor, [
  "Если вернулось reason=\"ambiguous\" — СПРОСИ, какой продукт править, и вызови снова. Не выбирай сам.",
  "",
  "ФАЙЛЫ ИЗ ПРОШЛЫХ РАЗГОВОРОВ. Тебе доступен инструмент mcp__products__find_files — тоже ЯВНОЕ исключение к правилу «только mcp__linkeon__*».",
  "Зови его, когда пользователь ищет или просит снова прислать файл, созданный раньше: документ, картинку, видео, озвучку — в этом разговоре или у другого ассистента.",
  "Ссылки из его ответа отдавай пользователю как есть, markdown-ссылкой [имя](url). Запрет печатать адреса — про файлы, которые ты создаёшь сейчас; к найденным он не относится.",
  "Если у файла stored=false — честно скажи, что он не сохранился. НЕ передавай в инструмент userId/телефон.",
  "`;",
].join("\n"));
fs.writeFileSync(p, s);
console.log("ok");
EOF
node --check server.mjs && echo check-ok && git commit -qam "feat(relay): find_files — поиск файлов прошлых разговоров" && git log --oneline -1'
```

Ожидание: `ok`, `check-ok` и новый коммит в git релея. Если якорь не найден, файл не тронут: сверить фактический текст и не подгонять правку вслепую.

- [ ] **Step 3: Рестарт в тихий момент**

```bash
ssh dv@5.101.115.184 'n=$(ps -eo args | grep -F "claude --print" | grep -v grep | grep -v "bash -c" | wc -l); echo "живых ходов: $n"'
```

Повторять, пока не станет `0`. `pgrep -c` не годится: он считает собственную ssh-обёртку. Затем:

```bash
ssh dv@5.101.115.184 'pm2 restart file-agent >/dev/null && sleep 3 && pm2 describe file-agent | grep -E "status|restarts" | head -3' && curl -s https://r.linkeon.io/health
```

Ожидание: `online`, `/health` отвечает `{"status":"ok",…}`.

- [ ] **Step 4: Копия в репо** — та же правка в `$BACK/relay-agent/server.mjs`: тот же node-скрипт, путь `relay-agent/server.mjs`, запуск из `$BACK`.
  - Якорей нет (копия отстала) — не перезаписывать её живым файлом, а сообщить владельцу.
  - Якоря есть — коммит `chore(relay): копия правки find_files`, затем влить по задаче 10.

- [ ] **Step 5: Живая проверка.** На test.linkeon.io попросить Романа: «найди тот pdf, что ты делал». Ожидание: шаг «Ищу файлы из наших разговоров» и рабочая ссылка в ответе. Затем то же на проде в своей переписке.
