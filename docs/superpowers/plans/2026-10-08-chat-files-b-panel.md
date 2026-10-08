# Медиа и файлы, часть B: панель «Медиа и файлы» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В чате с ассистентом появляется панель «Медиа и файлы», как раздел медиа в Telegram. Две вкладки, внутри группы по месяцам, просмотр картинок и видео, скачивание одним нажатием. Не сохранившиеся файлы собраны в свёрнутую группу.

**Architecture:**
- **Бэк.** Чистый разборщик `extractChatFiles` (`chat-files/extract.ts`) находит в тексте ответа ассистента всё, что чат показывает картинкой, плеером или ссылкой на скачивание. `ChatFilesService` прогоняет через него историю одной переписки и подтягивает адреса видео и озвучки, только свои. `GET /webhook/chat/files` отдаёт список.
- **Фронт.** `chatFiles.ts` — загрузка, вкладки, месяцы, значки. `ChatFilesPanel` — панель, `MediaViewer` — просмотр на весь экран. Вход: пункт меню «⋯» на мобиле и кнопка в шапке на десктопе (`ChatInterface.tsx`).

**Tech Stack:** NestJS 10 + pg + jest (бэк); React 18 + TypeScript + Tailwind + i18next + lucide-react + vitest + jsdom (фронт).

**Спека:** `docs/superpowers/specs/2026-10-08-chat-media-files-design.md`, части 2 и 3.

**Зависимость:** бэк-часть (задачи 1–5) опирается на `src/chat/chat-files/file-meta.ts` из плана A. Начинать её после того, как план A влит в `main`. Фронт-часть (задачи 6–10) от плана A не зависит, её можно делать сразу.

---

## Где работать

- **Бэк:** ворктри `~/Downloads/spirits_back/.worktrees/chat-files-panel`, ветка `feat/chat-files-panel` от `origin/main`, когда в нём уже есть план A. Ниже — `$BACK`.
- **Фронт:** ворктри `~/Downloads/spirits_front/.worktrees/chat-files-panel`, ветка `feat/chat-files-panel` от `origin/main`. Ниже — `$FRONT`. `node_modules` — симлинк на основной чекаут (зависимости те же, новых нет): `ln -s ~/Downloads/spirits_front/node_modules $FRONT/node_modules`.
- **В общие чекауты** `~/Downloads/spirits_back` и `~/Downloads/spirits_front` не коммитить: там работают параллельные сессии.
- **Тесты бэка — только на тест-ноде.** Свой ворктри — `~/ci/wt/chat-files-panel`. «Прогон тестов бэка с путём `<путь>`»:

  ```bash
  BACK=~/Downloads/spirits_back/.worktrees/chat-files-panel
  git -C $BACK push -q origin feat/chat-files-panel
  SHA=$(git -C $BACK rev-parse HEAD)
  ssh dv@85.192.61.231 "git -C ~/ci/spirits_back fetch -q origin && (test -d ~/ci/wt/chat-files-panel || git -C ~/ci/spirits_back worktree add -q --detach ~/ci/wt/chat-files-panel $SHA) && git -C ~/ci/wt/chat-files-panel checkout -q --detach $SHA && cd ~/ci/wt/chat-files-panel && git log -1 --format='нода: %h %s' && source ~/.nvm/nvm.sh && (test -d node_modules || npm ci --no-audit --no-fund >/dev/null) && npx jest <путь> --maxWorkers=2 2>&1 | tail -60"
  ```

  «tsc-гейт бэка»:

  ```bash
  ssh dv@85.192.61.231 "cd ~/ci/wt/chat-files-panel && source ~/.nvm/nvm.sh && npx tsc --noEmit -p tsconfig.build.json 2>&1 | tail -30"
  ```

  Вывод должен быть пустым, как на `main`. В бэке `strictNullChecks: false`: сужать союзы через `x.ok === false`, а не `!x.ok`.

- **Точечные тесты фронта — локально под Node 22.** На системном Node 26 jsdom ломает `localStorage`. «Точечный тест фронта `<файл>`»:

  ```bash
  cd ~/Downloads/spirits_front/.worktrees/chat-files-panel && PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run <файл>
  ```

- **Полный прогон фронта, типы и сборка — на ноде**, в ворктри `~/ci/wt/chat-files-panel-front`. «Команда фронта на ноде `<команда>`»:

  ```bash
  FRONT=~/Downloads/spirits_front/.worktrees/chat-files-panel
  git -C $FRONT push -q origin feat/chat-files-panel
  SHA=$(git -C $FRONT rev-parse HEAD)
  ssh dv@85.192.61.231 "git -C ~/ci/spirits_front fetch -q origin && (test -d ~/ci/wt/chat-files-panel-front || git -C ~/ci/spirits_front worktree add -q --detach ~/ci/wt/chat-files-panel-front $SHA) && git -C ~/ci/wt/chat-files-panel-front checkout -q --detach $SHA && cd ~/ci/wt/chat-files-panel-front && git log -1 --format='нода: %h %s' && source ~/.nvm/nvm.sh && (test -d node_modules || pnpm install --frozen-lockfile >/dev/null) && <команда>"
  ```

  `tsc` фронта — только `npx tsc --noEmit -p tsconfig.app.json`: голый `tsc` проверяет ноль файлов. На `main` есть давние ошибки, мерить дельтой: число не растёт, в своих файлах ноль.

- **Коммиты.** Сначала красный тест отдельным коммитом `test(...): … (красный)`, потом `feat(...)`. Файлы — поимённо, `pnpm-workspace.yaml` не коммитить. Каждое сообщение заканчивается строкой:

  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```

  Если среда исполнителя предписывает свою подпись (свою модель), ставить её вместо этой. Тесты гоняются на ноде по запушенному sha, поэтому правку коммитить до зелёного прогона.

- **Тексты интерфейса — только через `t(...)`.** Слово — «ассистент», не «агент». В исходниках не писать escape-последовательности `\uXXXX`: инструмент записи файлов превращает их в невидимые символы.
- **Выкат** (задачи 12–14) — только после явного OK владельца.

## Файлы

| Файл | Что |
|---|---|
| `$BACK/src/chat/chat-files/session-id.ts` (новый) | `chatSessionId(userId, assistantId, freshTs)` — ключ переписки, как у истории |
| `$BACK/src/chat/chat-files/session-id.spec.ts` (новый) | его тесты |
| `$BACK/src/chat/chat-files/extract.ts` (новый) | `extractChatFiles`, `kindByExt`, типы `ChatFileKind`, `ExtractedFile`, `ExtractEnv` |
| `$BACK/src/chat/chat-files/extract.spec.ts` (новый) | таблица случаев |
| `$BACK/src/chat/chat-files/chat-files.service.ts` (новый) | `ChatFilesService.listForSession/resolve`, `collectFiles`, `extractEnv`, `SESSION_FILES_SQL`, `ChatFileItem` |
| `$BACK/src/chat/chat-files/chat-files.service.spec.ts` (новый) | тесты сервиса |
| `$BACK/src/chat/chat-files/chat-files.controller.ts` (новый) | `GET chat/files` под `JwtGuard` |
| `$BACK/src/chat/chat-files/chat-files.controller.spec.ts` (новый) | маршрут, guard, переписка из JWT |
| `$BACK/src/chat/chat.module.ts` | контроллер и сервис |
| `$BACK/src/chat/chat.module.chat-files.spec.ts` | сторож регистрации (файл из плана A, дописать) |
| `$FRONT/src/i18n/locales/{ru,en,de,es,fr,pt,zh}.json` | `chat.files.*` — 17 ключей |
| `$FRONT/src/components/chat/files/filesLocales.test.ts` (новый) | ключи во всех 7 локалях |
| `$FRONT/src/components/chat/files/chatFiles.ts` (новый) | `fetchChatFiles`, `splitTab`, `startTab`, `groupByMonth`, `fileIconKind`, типы |
| `$FRONT/src/components/chat/files/chatFiles.test.ts` (новый) | их тесты |
| `$FRONT/src/components/chat/files/MediaViewer.tsx` (новый) | просмотр на весь экран |
| `$FRONT/src/components/chat/files/MediaViewer.test.tsx` (новый) | его тесты |
| `$FRONT/src/components/chat/files/ChatFilesPanel.tsx` (новый) | панель |
| `$FRONT/src/components/chat/files/ChatFilesPanel.test.tsx` (новый) | её тесты |
| `$FRONT/src/components/chat/filesWiring.test.ts` (новый) | сторож связки в `ChatInterface` |
| `$FRONT/src/components/chat/ChatInterface.tsx` | импорт, состояние, закрытие при смене ассистента, пункт меню, кнопка, рендер панели |

---

### Task 1: Ключ переписки — `session-id.ts`

**Files:**
- Create: `$BACK/src/chat/chat-files/session-id.ts`
- Test: `$BACK/src/chat/chat-files/session-id.spec.ts`

- [ ] **Step 0: Ворктри**

```bash
git -C ~/Downloads/spirits_back fetch -q origin
git -C ~/Downloads/spirits_back worktree add -b feat/chat-files-panel .worktrees/chat-files-panel origin/main
git -C ~/Downloads/spirits_back/.worktrees/chat-files-panel push -q -u origin feat/chat-files-panel
ls ~/Downloads/spirits_back/.worktrees/chat-files-panel/src/chat/chat-files/file-meta.ts
```

Ожидание: файл `file-meta.ts` есть. Если его нет, план A ещё не влит — остановиться и сообщить.

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/session-id.spec.ts
import { chatSessionId } from './session-id';

describe('chatSessionId', () => {
  it('обычная переписка — <userId>_<assistantId>', () => {
    expect(chatSessionId('79990000000', '12')).toBe('79990000000_12');
    expect(chatSessionId('u1', 'custom:abc')).toBe('u1_custom:abc');
  });
  it('«Чистый лист» — отдельная сессия', () => {
    expect(chatSessionId('u1', '12', '1728000000000')).toBe('u1_12_fresh_1728000000000');
  });
  it('мусор вместо метки «Чистого листа» — обычная переписка', () => {
    expect(chatSessionId('u1', '12', 'abc')).toBe('u1_12');
    expect(chatSessionId('u1', '12', '12345')).toBe('u1_12');
    expect(chatSessionId('u1', '12', null)).toBe('u1_12');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/session-id.spec.ts
git -C $BACK commit -q -m "test(chat-files): ключ переписки для панели (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat-files/session-id.spec.ts`». Ожидание: `Cannot find module './session-id'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/session-id.ts
/**
 * Ключ переписки в custom_chat_history — ровно как у истории
 * (ChatController.getHistory): «Чистый лист» живёт отдельной сессией.
 * userId всегда из JWT, никогда из запроса.
 */
export function chatSessionId(userId: string, assistantId: string, freshTs?: string | null): string {
  return freshTs && /^\d{6,}$/.test(freshTs)
    ? `${userId}_${assistantId}_fresh_${freshTs}`
    : `${userId}_${assistantId}`;
}
```

- [ ] **Step 4: Прогнать тест** — тот же путь, 3 passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/session-id.ts
git -C $BACK commit -q -m "feat(chat-files): ключ переписки для панели

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Разборщик — `extract.ts`

**Files:**
- Create: `$BACK/src/chat/chat-files/extract.ts`
- Test: `$BACK/src/chat/chat-files/extract.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/extract.spec.ts
import { ExtractedFile, extractChatFiles, kindByExt } from './extract';

const ENV = {
  publicBaseUrl: 'https://my.linkeon.io/smm-media',
  agentUrl: 'https://r.linkeon.io',
  backendUrl: 'https://my.linkeon.io',
};
const MINIO = 'https://my.linkeon.io/smm-media';
const RELAY = 'https://r.linkeon.io/files/u1_12_ru';
const VID = '11111111-2222-4333-8444-555555555555';
const AUD = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CHAT_FILE = `${MINIO}/linkeon-chat-files/0f8e6a1c-1111-4222-8333-444455556666/report.pdf`;

const x = (content: string) => extractChatFiles(content, ENV);
const pick = (f: ExtractedFile) => ({ kind: f.kind, name: f.name, stored: f.stored, url: f.url, refId: f.refId });

describe('extractChatFiles — что считается файлом', () => {
  it('картинка markdown-ом из нашего MinIO', () => {
    const url = `${MINIO}/linkeon-assets/images/1700000000000-abc123.png`;
    expect(x(`Готово:\n\n![](${url})`).map(pick)).toEqual([
      { kind: 'image', name: '1700000000000-abc123.png', stored: true, url, refId: undefined },
    ]);
  });

  it('голый адрес картинки — как его рисует чат', () => {
    const url = `${MINIO}/linkeon-assets/images/1.webp`;
    expect(x(`Вот:\n\n${url}\n\n`).map((f) => f.kind)).toEqual(['image']);
  });

  it('метафорическая карта с чужого хоста — тоже картинка', () => {
    expect(x('![Метафорическая карта](https://images.linkeon.io/cards/card-3.jpg)').map(pick)).toEqual([
      { kind: 'image', name: 'card-3.jpg', stored: true, url: 'https://images.linkeon.io/cards/card-3.jpg', refId: undefined },
    ]);
  });

  it('ссылка на релей — документ, не сохранился; пробел в имени не мешает', () => {
    expect(x(`[Скачать Договор аренды.docx](${RELAY}/Договор аренды.docx)`).map(pick)).toEqual([
      { kind: 'document', name: 'Договор аренды.docx', stored: false, url: `${RELAY}/Договор аренды.docx`, refId: undefined },
    ]);
  });

  it('ссылка на сохранённый файл переписки', () => {
    expect(x(`[Скачать report.pdf](${CHAT_FILE})`).map(pick)).toEqual([
      { kind: 'document', name: 'report.pdf', stored: true, url: CHAT_FILE, refId: undefined },
    ]);
  });

  it('документ звонка называется по заголовку ответа', () => {
    const url = `${MINIO}/linkeon-assets/documents/u1/d1.md`;
    const text = `## План на неделю\n\nКоротко о главном.\n\n[Открыть документ полностью](${url})`;
    expect(x(text).map((f) => f.name)).toEqual(['План на неделю.md']);
    expect(x(`[Открыть документ полностью](${url})`).map((f) => f.name)).toEqual(['d1.md']);
  });

  it('маркеры видео и озвучки', () => {
    expect(x(`Ролик готов.\n\n[VIDEO_JOB:${VID}]\n\n{{audio:id=${AUD}}}`).map(pick)).toEqual([
      { kind: 'video', name: 'video-11111111.mp4', stored: true, url: undefined, refId: VID },
      { kind: 'audio', name: 'linkeon-speech-aaaaaaaa.mp3', stored: true, url: undefined, refId: AUD },
    ]);
  });

  it('голый адрес ролика', () => {
    expect(x('https://my.linkeon.io/static/videos/abc.mp4').map((f) => f.kind)).toEqual(['video']);
  });

  it('голая картинка на релее — картинка, не сохранилась', () => {
    expect(x(`${RELAY}/chart.png`).map(pick)).toEqual([
      { kind: 'image', name: 'chart.png', stored: false, url: `${RELAY}/chart.png`, refId: undefined },
    ]);
  });

  it('старая картинка из /static/', () => {
    expect(x('https://my.linkeon.io/static/generated/x.png').map((f) => [f.kind, f.stored])).toEqual([['image', true]]);
  });
});

describe('extractChatFiles — что файлом не считается', () => {
  it('код — это текст, а не ссылки', () => {
    expect(x('```\n![x](https://a.example/b.png)\n```\nи `https://a.example/c.png`')).toEqual([]);
  });

  it('ссылки на сайты и чужие файлы', () => {
    expect(x('[Википедия](https://ru.wikipedia.org/wiki/Тест) и [PDF](https://example.com/a.pdf)')).toEqual([]);
  });

  it('ссылки на наши страницы без расширения', () => {
    expect(x('[Пополнить баланс](/chat?view=tokens) и [Профиль](https://my.linkeon.io/profile)')).toEqual([]);
  });

  it('карточки встреч и календаря', () => {
    expect(x(`{{meeting_join: code=ABC234 title=Встреча}}\n[CALENDAR_PROPOSAL:${VID}]`)).toEqual([]);
  });
});

describe('extractChatFiles — порядок и повторы', () => {
  it('один адрес дважды — один файл', () => {
    const url = `${MINIO}/linkeon-assets/images/1.png`;
    expect(x(`![](${url})\n\n${url}`)).toHaveLength(1);
  });

  it('в порядке появления в ответе, соседние ссылки не теряются', () => {
    const a = `${MINIO}/x/a.pdf`;
    const b = `${MINIO}/x/b.pdf`;
    expect(x(`[a](${a})[b](${b}) ![](${MINIO}/x/c.png)`).map((f) => f.name)).toEqual(['a.pdf', 'b.pdf', 'c.png']);
  });
});

describe('kindByExt', () => {
  it.each([
    ['png', 'image'], ['svg', 'image'], ['mp4', 'video'], ['mov', 'video'],
    ['mp3', 'audio'], ['m4a', 'audio'], ['pdf', 'document'], ['zip', 'document'], ['', 'document'],
  ])('%s → %s', (ext, kind) => expect(kindByExt(ext)).toBe(kind));
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/extract.spec.ts
git -C $BACK commit -q -m "test(chat-files): разбор файлов из текста ответа (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat-files/extract.spec.ts`». Ожидание: `Cannot find module './extract'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/extract.ts
import { fileExt, lastPathSegment, safeFileName } from './file-meta';

/**
 * Что из текста ответа ассистента — файл. Нужно панели «Медиа и файлы» и
 * инструменту find_files.
 *
 * Правила повторяют то, что чат и так показывает картинкой, плеером или
 * ссылкой на скачивание (spirits_front: src/utils/customMarkdown.tsx): панель
 * обязана совпадать с лентой. Ссылки на чужие сайты — не файлы, даже с
 * расширением в адресе: их создавал не ассистент.
 */

export type ChatFileKind = 'image' | 'video' | 'document' | 'audio';

export interface ExtractedFile {
  kind: ChatFileKind;
  source: 'url' | 'video_job' | 'audio_clip';
  /** Есть у source 'url'. */
  url?: string;
  /** Есть у video_job и audio_clip: uuid из маркера. */
  refId?: string;
  name: string;
  ext: string;
  /** false — файл лежит на релее и пропадает: скачивать его панель не предлагает. */
  stored: boolean;
}

export interface ExtractEnv {
  /** MINIO_PUBLIC_URL без хвостового слэша. */
  publicBaseUrl: string;
  /** AGENT_URL без хвостового слэша. */
  agentUrl: string;
  /** BACKEND_URL без хвостового слэша — для /static/. */
  backendUrl: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const VIDEO_JOB_RE = new RegExp(`\\[VIDEO_JOB:(${UUID})\\]`, 'gi');
const AUDIO_RE = new RegExp(`\\{\\{audio:id=(${UUID})\\}\\}`, 'gi');
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
// (?<!!) — не картинка; просмотр назад, а не захват символа: иначе соседние
// ссылки `[a](x)[b](y)` теряли бы вторую.
const MD_LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)\n]+)\)/g;
// Те же, что IMAGE_URL_REGEX и VIDEO_URL_REGEX во фронте (customMarkdown.tsx).
const BARE_IMAGE_RE = /(?<!\()https?:\/\/\S+?\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/gi;
const BARE_VIDEO_RE = /(?<!\()https?:\/\/\S+?\.(?:mp4|webm)(?:\?\S*)?/gi;

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a']);

export function kindByExt(ext: string): ChatFileKind {
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return 'document';
}

/** Код в ответе — текст, а не ссылки: в чате там ничего не кликается. */
function stripCode(content: string): string {
  return content.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
}

/** Цель ссылки без заголовка: `url "title"` → `url`. */
function linkTarget(raw: string): string {
  const t = raw.trim();
  const q = t.search(/\s+"/);
  return (q > 0 ? t.slice(0, q) : t).trim();
}

/** Ближайший слева заголовок `## …` — так бэк подписывает документ звонка. */
function headingBefore(content: string, index: number): string | null {
  const all = [...content.slice(0, index).matchAll(/^##\s+(.+)$/gm)];
  return all.length > 0 ? all[all.length - 1][1].trim() : null;
}

export function extractChatFiles(content: string, env: ExtractEnv): ExtractedFile[] {
  const text = stripCode(String(content ?? ''));
  const relayPrefix = `${env.agentUrl}/files/`;
  const ours = (url: string) =>
    (env.publicBaseUrl !== '' && url.startsWith(`${env.publicBaseUrl}/`)) ||
    url.startsWith(`${env.backendUrl}/static/`) ||
    url.startsWith(relayPrefix);

  const fromUrl = (url: string, index: number, kind?: ChatFileKind): ExtractedFile | null => {
    const seg = lastPathSegment(url);
    const ext = fileExt(seg);
    if (!kind && !ext) return null;
    let name = safeFileName(seg);
    if (/\/documents\/[^/]+\/[^/]+\.md$/i.test(url.split(/[?#]/)[0])) {
      const heading = headingBefore(text, index);
      if (heading) name = safeFileName(`${heading}.md`);
    }
    return { kind: kind ?? kindByExt(ext), source: 'url', url, name, ext, stored: !url.startsWith(relayPrefix) };
  };

  const found: { index: number; file: ExtractedFile }[] = [];
  for (const m of text.matchAll(VIDEO_JOB_RE)) {
    const id = m[1].toLowerCase();
    found.push({
      index: m.index ?? 0,
      file: { kind: 'video', source: 'video_job', refId: id, name: `video-${id.slice(0, 8)}.mp4`, ext: 'mp4', stored: true },
    });
  }
  for (const m of text.matchAll(AUDIO_RE)) {
    const id = m[1].toLowerCase();
    found.push({
      index: m.index ?? 0,
      file: { kind: 'audio', source: 'audio_clip', refId: id, name: `linkeon-speech-${id.slice(0, 8)}.mp3`, ext: 'mp3', stored: true },
    });
  }
  for (const m of text.matchAll(MD_IMAGE_RE)) {
    const url = linkTarget(m[2]);
    if (!/^https?:\/\//i.test(url)) continue;
    const f = fromUrl(url, m.index ?? 0, 'image');
    if (f) found.push({ index: m.index ?? 0, file: f });
  }
  for (const m of text.matchAll(MD_LINK_RE)) {
    const url = linkTarget(m[2]);
    if (!ours(url)) continue;
    const f = fromUrl(url, m.index ?? 0);
    if (f) found.push({ index: m.index ?? 0, file: f });
  }
  for (const [re, kind] of [[BARE_IMAGE_RE, 'image'], [BARE_VIDEO_RE, 'video']] as const) {
    for (const m of text.matchAll(re)) {
      const f = fromUrl(m[0], m.index ?? 0, kind);
      if (f) found.push({ index: m.index ?? 0, file: f });
    }
  }

  found.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const out: ExtractedFile[] = [];
  for (const { file } of found) {
    const key = file.url ?? `${file.source}:${file.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}
```

- [ ] **Step 4: Прогнать тест** — тот же путь, все passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/extract.ts
git -C $BACK commit -q -m "feat(chat-files): разбор файлов из текста ответа

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `ChatFilesService` — файлы одной переписки

**Files:**
- Create: `$BACK/src/chat/chat-files/chat-files.service.ts`
- Test: `$BACK/src/chat/chat-files/chat-files.service.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/chat-files.service.spec.ts
import { ChatFilesService, SESSION_FILES_SQL } from './chat-files.service';

const MINIO = 'https://my.linkeon.io/smm-media';
const RELAY = 'https://r.linkeon.io/files/u1_12_ru';
const VID_OK = '11111111-2222-4333-8444-555555555555';
const VID_FAILED = '22222222-2222-4333-8444-555555555555';
const VID_ALIEN = '33333333-2222-4333-8444-555555555555';
const AUD = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makePg(rows: any[], videos: any[] = [], clips: any[] = []) {
  const calls: { sql: string; params: any[] }[] = [];
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql === SESSION_FILES_SQL) return { rows };
    if (/FROM video_jobs/.test(sql)) return { rows: videos.filter((v) => params[0].includes(v.id) && v.user_id === params[1]) };
    if (/FROM speech_clips/.test(sql)) return { rows: clips.filter((c) => params[0].includes(c.id) && c.user_id === params[1]) };
    return { rows: [] };
  });
  return { query, calls };
}

beforeEach(() => {
  process.env.MINIO_PUBLIC_URL = `${MINIO}/`;
  delete process.env.AGENT_URL;
  delete process.env.BACKEND_URL;
});

describe('ChatFilesService.listForSession', () => {
  it('читает только ответы ассистента этой переписки, с фильтром по признакам вложений', async () => {
    const pg = makePg([]);
    await new ChatFilesService(pg as any).listForSession('u1', 'u1_12');
    expect(pg.calls[0].sql).toBe(SESSION_FILES_SQL);
    expect(pg.calls[0].params).toEqual(['u1_12']);
    expect(SESSION_FILES_SQL).toMatch(/session_id = \$1 AND sender_type = 'ai'/);
    expect(SESSION_FILES_SQL).toMatch(/ORDER BY created_at DESC/);
    expect(pg.calls).toHaveLength(1);
  });

  it('повтор адреса — одна запись, из самого свежего ответа', async () => {
    const url = `${MINIO}/linkeon-assets/images/1.png`;
    const pg = makePg([
      { id: 20, content: `опять ![](${url})`, created_at: '2026-10-05T10:00:00Z' },
      { id: 10, content: `![](${url})`, created_at: '2026-09-20T10:00:00Z' },
    ]);
    const items = await new ChatFilesService(pg as any).listForSession('u1', 'u1_12');
    expect(items).toEqual([
      { key: url, kind: 'image', url, name: '1.png', ext: 'png', createdAt: '2026-10-05T10:00:00.000Z', messageId: 20, stored: true },
    ]);
  });

  it('у не сохранившегося файла нет адреса', async () => {
    const pg = makePg([{ id: 1, content: `[Скачать a.pdf](${RELAY}/a.pdf)`, created_at: '2026-09-01T00:00:00Z' }]);
    const [item] = await new ChatFilesService(pg as any).listForSession('u1', 'u1_12');
    expect(item).toMatchObject({ key: `${RELAY}/a.pdf`, stored: false, name: 'a.pdf' });
    expect(item.url).toBeUndefined();
  });

  it('видео: готовое — с адресом и превью, неудачное и чужое — выпадают', async () => {
    const pg = makePg(
      [{ id: 1, content: `[VIDEO_JOB:${VID_OK}] [VIDEO_JOB:${VID_FAILED}] [VIDEO_JOB:${VID_ALIEN}]`, created_at: '2026-10-01T00:00:00Z' }],
      [
        { id: VID_OK, user_id: 'u1', status: 'ready', video_url: 'https://v/ok.mp4', thumbnail_url: 'https://v/ok.jpg' },
        { id: VID_FAILED, user_id: 'u1', status: 'failed', video_url: null, thumbnail_url: null },
        { id: VID_ALIEN, user_id: 'u2', status: 'ready', video_url: 'https://v/alien.mp4', thumbnail_url: null },
      ],
    );
    const items = await new ChatFilesService(pg as any).listForSession('u1', 'u1_12');
    expect(items.map((i) => [i.key, i.url, i.thumbUrl])).toEqual([[`video_job:${VID_OK}`, 'https://v/ok.mp4', 'https://v/ok.jpg']]);
    const q = pg.calls.find((c) => /FROM video_jobs/.test(c.sql))!;
    expect(q.sql).toMatch(/id = ANY\(\$1::uuid\[\]\) AND user_id = \$2/);
    expect(q.params).toEqual([[VID_OK, VID_FAILED, VID_ALIEN], 'u1']);
  });

  it('озвучка — адрес из speech_clips, только своя', async () => {
    const pg = makePg(
      [{ id: 1, content: `{{audio:id=${AUD}}}`, created_at: '2026-10-01T00:00:00Z' }],
      [],
      [{ id: AUD, user_id: 'u1', url: 'https://a/clip.mp3' }],
    );
    const items = await new ChatFilesService(pg as any).listForSession('u1', 'u1_12');
    expect(items).toEqual([
      expect.objectContaining({ key: `audio_clip:${AUD}`, kind: 'audio', url: 'https://a/clip.mp3', stored: true }),
    ]);
    expect(pg.calls.find((c) => /FROM speech_clips/.test(c.sql))!.params).toEqual([[AUD], 'u1']);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/chat-files.service.spec.ts
git -C $BACK commit -q -m "test(chat-files): файлы одной переписки (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat-files/chat-files.service.spec.ts`». Ожидание: `Cannot find module './chat-files.service'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/chat-files.service.ts
import { Injectable } from '@nestjs/common';
import { PgService } from '../../common/services/pg.service';
import { ChatFileKind, ExtractEnv, ExtractedFile, extractChatFiles } from './extract';

/**
 * Что отдаёт эндпоинт панели (GET /webhook/chat/files). У stored=false адреса
 * нет: файл пропал вместе с /tmp релея, и скачивать его панель не предлагает.
 */
export interface ChatFileItem {
  key: string;
  kind: ChatFileKind;
  url?: string;
  thumbUrl?: string;
  name: string;
  ext: string;
  createdAt: string;
  messageId: number;
  stored: boolean;
}

/** Файл из истории до подстановки адресов видео и озвучки. */
export interface FoundFile {
  file: ExtractedFile;
  createdAt: string;
  messageId: number;
  /** Текст ответа целиком — по нему ищет инструмент find_files. */
  text: string;
}

/**
 * Сколько ответов читаем на одно открытие панели. С запасом: самая длинная
 * переписка на проде — 7534 строки всего, из них с вложениями — доли.
 */
export const PANEL_ROWS_LIMIT = 2000;

export const SESSION_FILES_SQL = `SELECT id, content, created_at FROM custom_chat_history
 WHERE session_id = $1 AND sender_type = 'ai'
   AND content ~ '(https?://|\\[VIDEO_JOB:|\\{\\{audio:id=)'
 ORDER BY created_at DESC
 LIMIT ${PANEL_ROWS_LIMIT}`;

export function extractEnv(): ExtractEnv {
  const trim = (s: string) => s.replace(/\/$/, '');
  return {
    publicBaseUrl: trim(process.env.MINIO_PUBLIC_URL || ''),
    agentUrl: trim(process.env.AGENT_URL || 'https://r.linkeon.io'),
    backendUrl: trim(process.env.BACKEND_URL || 'https://my.linkeon.io'),
  };
}

/** Разбор строк, идущих от новых к старым. Повтор адреса — остаётся самое свежее упоминание. */
export function collectFiles(rows: any[], env: ExtractEnv): FoundFile[] {
  const seen = new Set<string>();
  const out: FoundFile[] = [];
  for (const r of rows) {
    const text = String(r.content ?? '');
    const createdAt = new Date(r.created_at).toISOString();
    for (const file of extractChatFiles(text, env)) {
      const key = file.url ?? `${file.source}:${file.refId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ file, createdAt, messageId: Number(r.id), text });
    }
  }
  return out;
}

@Injectable()
export class ChatFilesService {
  constructor(private readonly pg: PgService) {}

  /** Файлы одной переписки, от новых к старым. */
  async listForSession(userId: string, sessionId: string): Promise<ChatFileItem[]> {
    const { rows } = await this.pg.query(SESSION_FILES_SQL, [sessionId]);
    const items = await this.resolve(userId, collectFiles(rows, extractEnv()));
    return items.map(({ item }) => item);
  }

  /**
   * Подставляет адреса видео и озвучки по маркерам. Только свои (user_id):
   * маркер в тексте могла выдумать модель. Неготовые и не найденные видео выпадают.
   */
  async resolve(userId: string, found: FoundFile[]): Promise<{ item: ChatFileItem; found: FoundFile }[]> {
    const ids = (source: ExtractedFile['source']) =>
      found.filter((f) => f.file.source === source).map((f) => f.file.refId as string);
    const videoIds = ids('video_job');
    const audioIds = ids('audio_clip');

    const videos = new Map<string, { url: string; thumb?: string }>();
    if (videoIds.length > 0) {
      const { rows } = await this.pg.query(
        `SELECT id, status, video_url, thumbnail_url FROM video_jobs WHERE id = ANY($1::uuid[]) AND user_id = $2`,
        [videoIds, userId],
      );
      for (const r of rows) {
        if (r.status === 'ready' && r.video_url) {
          videos.set(String(r.id), { url: r.video_url, thumb: r.thumbnail_url || undefined });
        }
      }
    }
    const clips = new Map<string, string>();
    if (audioIds.length > 0) {
      const { rows } = await this.pg.query(
        `SELECT id, url FROM speech_clips WHERE id = ANY($1::uuid[]) AND user_id = $2`,
        [audioIds, userId],
      );
      for (const r of rows) if (r.url) clips.set(String(r.id), r.url);
    }

    const out: { item: ChatFileItem; found: FoundFile }[] = [];
    for (const f of found) {
      const base = { kind: f.file.kind, name: f.file.name, ext: f.file.ext, createdAt: f.createdAt, messageId: f.messageId };
      if (f.file.source === 'video_job') {
        const v = videos.get(f.file.refId as string);
        if (v) out.push({ found: f, item: { ...base, key: `video_job:${f.file.refId}`, url: v.url, thumbUrl: v.thumb, stored: true } });
      } else if (f.file.source === 'audio_clip') {
        const url = clips.get(f.file.refId as string);
        if (url) out.push({ found: f, item: { ...base, key: `audio_clip:${f.file.refId}`, url, stored: true } });
      } else {
        out.push({
          found: f,
          item: { ...base, key: f.file.url as string, url: f.file.stored ? f.file.url : undefined, stored: f.file.stored },
        });
      }
    }
    return out;
  }
}
```

`resolve` возвращает пары `{ item, found }`: инструменту поиска из плана C нужен текст ответа рядом с готовой записью. Панель берёт только `item`.

- [ ] **Step 4: Прогнать тест** — тот же путь, 5 passed. Затем «tsc-гейт бэка» — пусто.

В тесте «повтор адреса» ожидается объект без поля `thumbUrl`. Если `toEqual` споткнётся о `thumbUrl: undefined`, это не повод менять тест: `toEqual` поля со значением `undefined` пропускает.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/chat-files.service.ts
git -C $BACK commit -q -m "feat(chat-files): файлы одной переписки для панели

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Эндпоинт `GET /webhook/chat/files`

**Files:**
- Create: `$BACK/src/chat/chat-files/chat-files.controller.ts`
- Modify: `$BACK/src/chat/chat.module.ts`
- Test: `$BACK/src/chat/chat-files/chat-files.controller.spec.ts`, `$BACK/src/chat/chat.module.chat-files.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/chat-files.controller.spec.ts
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ChatFilesController } from './chat-files.controller';
import { JwtGuard } from '../../common/guards/jwt.guard';

describe('ChatFilesController', () => {
  it('GET chat/files под JwtGuard', () => {
    const h = ChatFilesController.prototype.list;
    expect(Reflect.getMetadata(PATH_METADATA, ChatFilesController)).toBe('chat/files');
    expect(Reflect.getMetadata(METHOD_METADATA, h)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, h)).toContain(JwtGuard);
  });

  it('переписка — из JWT, «Чистый лист» — по метке', async () => {
    const files = { listForSession: jest.fn(async () => []) };
    const ctrl = new ChatFilesController(files as any);

    await expect(ctrl.list({ userId: 'u1' }, '12')).resolves.toEqual({ items: [] });
    expect(files.listForSession).toHaveBeenLastCalledWith('u1', 'u1_12');

    await ctrl.list({ userId: 'u1' }, '12', '1728000000000');
    expect(files.listForSession).toHaveBeenLastCalledWith('u1', 'u1_12_fresh_1728000000000');
  });

  it('без assistantId — 400', async () => {
    const ctrl = new ChatFilesController({ listForSession: jest.fn() } as any);
    await expect(ctrl.list({ userId: 'u1' }, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

В конец `src/chat/chat.module.chat-files.spec.ts` (файл из плана A) дописать:

```ts
import { ChatFilesController } from './chat-files/chat-files.controller';
import { ChatFilesService } from './chat-files/chat-files.service';

it('панель «Медиа и файлы» зарегистрирована в ChatModule', () => {
  expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ChatModule)).toContain(ChatFilesController);
  expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ChatModule)).toContain(ChatFilesService);
});
```

Импорты поставить к остальным импортам вверху файла.

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/chat-files.controller.spec.ts src/chat/chat.module.chat-files.spec.ts
git -C $BACK commit -q -m "test(chat-files): эндпоинт панели «Медиа и файлы» (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat-files/chat-files.controller.spec.ts src/chat/chat.module.chat-files.spec.ts`». Ожидание: падает, `Cannot find module './chat-files.controller'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/chat-files.controller.ts
import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { ChatFilesService } from './chat-files.service';
import { chatSessionId } from './session-id';

/**
 * Панель «Медиа и файлы» в чате с ассистентом. Переписка — только своя:
 * userId из JWT, а не из запроса.
 */
@Controller('chat/files')
export class ChatFilesController {
  constructor(private readonly files: ChatFilesService) {}

  @Get()
  @UseGuards(JwtGuard)
  async list(
    @CurrentUser() user: any,
    @Query('assistantId') assistantId?: string,
    @Query('freshTs') freshTs?: string,
  ) {
    if (!assistantId) throw new BadRequestException('assistantId обязателен');
    const sessionId = chatSessionId(user.userId, String(assistantId), freshTs);
    return { items: await this.files.listForSession(user.userId, sessionId) };
  }
}
```

В `src/chat/chat.module.ts` добавить импорты

```ts
import { ChatFilesController } from './chat-files/chat-files.controller';
import { ChatFilesService } from './chat-files/chat-files.service';
```

и строки модуля:

```ts
  controllers: [ChatController, ChatFilesController],
  providers: [ChatService, ChatToolsService, ChatFileStore, ChatFilesService],
```

`ChatFileStore` в providers уже есть из плана A.

- [ ] **Step 4: Прогнать тесты**

Тот же путь — все passed. Затем «Прогон тестов бэка с путём `src/chat`» — падений нет. «tsc-гейт бэка» — пусто.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/chat-files.controller.ts src/chat/chat.module.ts
git -C $BACK commit -q -m "feat(chat-files): GET /webhook/chat/files — панель «Медиа и файлы»

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: SQL панели на настоящем Postgres

**Files:** нет (одноразовая проверка на ноде).

Юнит-тесты подменяют `pg`, поэтому регулярное выражение в `SESSION_FILES_SQL` и `ANY($1::uuid[])` в них не исполняются. Проверка — одноразовая база на ноде.

- [ ] **Step 1: Прогнать проверку**

Сначала `git -C $BACK push -q origin feat/chat-files-panel`. Затем:

```bash
SHA=$(git -C $BACK rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/chat-files-panel && git fetch -q origin && git checkout -q --detach $SHA && source ~/.nvm/nvm.sh && (dropdb -h /var/run/postgresql --if-exists files_probe; createdb -h /var/run/postgresql files_probe) && cat > ./files-probe.ts <<'EOF'
import { Client } from 'pg';
import { ChatFilesService } from './src/chat/chat-files/chat-files.service';
(async () => {
  process.env.MINIO_PUBLIC_URL = 'https://my.linkeon.io/smm-media';
  const c = new Client({ database: 'files_probe', host: '/var/run/postgresql' });
  await c.connect();
  await c.query(\`CREATE TABLE custom_chat_history (id serial PRIMARY KEY, session_id text, sender_type text, content text, created_at timestamptz DEFAULT now())\`);
  await c.query(\`CREATE TABLE video_jobs (id uuid PRIMARY KEY, user_id text, status text, video_url text, thumbnail_url text)\`);
  await c.query(\`CREATE TABLE speech_clips (id uuid PRIMARY KEY, user_id text, url text)\`);
  const V = '11111111-2222-4333-8444-555555555555';
  const A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  await c.query(\`INSERT INTO video_jobs VALUES (\$1, 'u1', 'ready', 'https://v/ok.mp4', 'https://v/ok.jpg')\`, [V]);
  await c.query(\`INSERT INTO speech_clips VALUES (\$1, 'u2', 'https://a/alien.mp3')\`, [A]);
  await c.query(\`INSERT INTO custom_chat_history (session_id, sender_type, content) VALUES
    ('u1_12','ai','![](https://my.linkeon.io/smm-media/linkeon-assets/images/1.png)'),
    ('u1_12','ai','просто текст без вложений'),
    ('u1_12','ai','[VIDEO_JOB:\${V}] {{audio:id=\${A}}}'),
    ('u1_12','human','![](https://my.linkeon.io/smm-media/linkeon-assets/images/human.png)'),
    ('u1_13','ai','![](https://my.linkeon.io/smm-media/linkeon-assets/images/other-chat.png)')\`);
  const svc = new ChatFilesService({ query: (sql: string, params?: any[]) => c.query(sql, params) } as any);
  console.log(JSON.stringify(await svc.listForSession('u1', 'u1_12'), null, 1));
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
EOF
npx ts-node ./files-probe.ts; rm -f ./files-probe.ts; dropdb -h /var/run/postgresql files_probe"
```

Ожидание — ровно два элемента:
- видео `video_job:1111…` с `https://v/ok.mp4`;
- картинка `…/images/1.png`.

Чужой клип (`u2`), строка без вложений, строка пользователя и другая переписка в выдачу не попали. Ошибок SQL нет.

Если в выдаче нет картинки, значит, регулярное выражение в SQL сломано экранированием: проверить, что в итоговой строке стоит `\[VIDEO_JOB:` с одним обратным слэшем.

- [ ] **Step 2: Отчитаться** выводом проверки. Коммита нет: проверка временная, файл удалён.

---

### Task 6: Тексты панели во всех семи локалях

**Files:**
- Modify: `$FRONT/src/i18n/locales/{ru,en,de,es,fr,pt,zh}.json`
- Test: `$FRONT/src/components/chat/files/filesLocales.test.ts`

- [ ] **Step 0: Ворктри фронта**

```bash
git -C ~/Downloads/spirits_front fetch -q origin
git -C ~/Downloads/spirits_front worktree add -b feat/chat-files-panel .worktrees/chat-files-panel origin/main
git -C ~/Downloads/spirits_front/.worktrees/chat-files-panel push -q -u origin feat/chat-files-panel
ln -s ~/Downloads/spirits_front/node_modules ~/Downloads/spirits_front/.worktrees/chat-files-panel/node_modules
```

- [ ] **Step 1: Написать падающий тест**

```ts
// src/components/chat/files/filesLocales.test.ts
import { describe, it, expect } from 'vitest';
import ru from '../../../i18n/locales/ru.json';
import en from '../../../i18n/locales/en.json';
import de from '../../../i18n/locales/de.json';
import es from '../../../i18n/locales/es.json';
import fr from '../../../i18n/locales/fr.json';
import pt from '../../../i18n/locales/pt.json';
import zh from '../../../i18n/locales/zh.json';

/** Ключи панели «Медиа и файлы». check-locales требует их везде, тест — ещё и без кириллицы вне ru. */
const KEYS = [
  'open', 'title', 'tab_media', 'tab_files', 'empty_media', 'empty_files', 'load_error', 'retry',
  'download', 'close', 'back', 'prev', 'next', 'unsaved', 'unsaved_hint', 'video', 'image',
];
const LOCALES: Record<string, any> = { ru, en, de, es, fr, pt, zh };

describe('тексты панели «Медиа и файлы»', () => {
  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name}: все ключи на месте`, () => {
      for (const k of KEYS) {
        const v = loc.chat?.files?.[k];
        expect(typeof v, `${name}: chat.files.${k}`).toBe('string');
        expect(v, `${name}: chat.files.${k}`).toBeTruthy();
        if (name !== 'ru') expect(v, `${name}: chat.files.${k}`).not.toMatch(/[Ѐ-ӿ]/);
      }
      expect(loc.chat.files.unsaved).toContain('{{n}}');
    });
  }
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $FRONT add src/components/chat/files/filesLocales.test.ts
git -C $FRONT commit -q -m "test(chat): тексты панели «Медиа и файлы» во всех локалях (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Точечный тест фронта `src/components/chat/files/filesLocales.test.ts`». Ожидание: 7 failed.

- [ ] **Step 3: Вписать ключи скриптом**

Локали переписываются через `JSON.stringify(…, null, 2)` байт в байт (проверено), поэтому ключи вставляются node-скриптом, а не правкой огромных JSON. Литеральные символы, без `\uXXXX`.

```bash
cd ~/Downloads/spirits_front/.worktrees/chat-files-panel && node - <<'EOF'
const fs = require('fs');
const T = {
  ru: { open: 'Медиа и файлы', title: 'Медиа и файлы', tab_media: 'Медиа', tab_files: 'Файлы',
    empty_media: 'Здесь появятся картинки и видео из этого разговора',
    empty_files: 'Здесь появятся файлы, которые создаст ассистент',
    load_error: 'Не удалось загрузить', retry: 'Повторить', download: 'Скачать', close: 'Закрыть',
    back: 'Назад', prev: 'Предыдущее', next: 'Следующее', unsaved: 'Не сохранились: {{n}}',
    unsaved_hint: 'Файл хранился на временном сервере и был удалён', video: 'Видео', image: 'Картинка' },
  en: { open: 'Media and files', title: 'Media and files', tab_media: 'Media', tab_files: 'Files',
    empty_media: 'Images and videos from this conversation will appear here',
    empty_files: 'Files the assistant creates will appear here',
    load_error: "Couldn't load", retry: 'Try again', download: 'Download', close: 'Close',
    back: 'Back', prev: 'Previous', next: 'Next', unsaved: 'Not saved: {{n}}',
    unsaved_hint: 'The file was kept on a temporary server and has been deleted', video: 'Video', image: 'Image' },
  de: { open: 'Medien und Dateien', title: 'Medien und Dateien', tab_media: 'Medien', tab_files: 'Dateien',
    empty_media: 'Hier erscheinen Bilder und Videos aus diesem Gespräch',
    empty_files: 'Hier erscheinen Dateien, die der Assistent erstellt',
    load_error: 'Laden fehlgeschlagen', retry: 'Erneut versuchen', download: 'Herunterladen', close: 'Schließen',
    back: 'Zurück', prev: 'Vorheriges', next: 'Nächstes', unsaved: 'Nicht gespeichert: {{n}}',
    unsaved_hint: 'Die Datei lag auf einem temporären Server und wurde gelöscht', video: 'Video', image: 'Bild' },
  es: { open: 'Multimedia y archivos', title: 'Multimedia y archivos', tab_media: 'Multimedia', tab_files: 'Archivos',
    empty_media: 'Aquí aparecerán las imágenes y los vídeos de esta conversación',
    empty_files: 'Aquí aparecerán los archivos que cree el asistente',
    load_error: 'No se pudo cargar', retry: 'Reintentar', download: 'Descargar', close: 'Cerrar',
    back: 'Atrás', prev: 'Anterior', next: 'Siguiente', unsaved: 'No guardados: {{n}}',
    unsaved_hint: 'El archivo estaba en un servidor temporal y se eliminó', video: 'Vídeo', image: 'Imagen' },
  fr: { open: 'Médias et fichiers', title: 'Médias et fichiers', tab_media: 'Médias', tab_files: 'Fichiers',
    empty_media: 'Les images et vidéos de cette conversation apparaîtront ici',
    empty_files: "Les fichiers créés par l'assistant apparaîtront ici",
    load_error: 'Échec du chargement', retry: 'Réessayer', download: 'Télécharger', close: 'Fermer',
    back: 'Retour', prev: 'Précédent', next: 'Suivant', unsaved: 'Non enregistrés : {{n}}',
    unsaved_hint: 'Le fichier était sur un serveur temporaire et a été supprimé', video: 'Vidéo', image: 'Image' },
  pt: { open: 'Mídia e arquivos', title: 'Mídia e arquivos', tab_media: 'Mídia', tab_files: 'Arquivos',
    empty_media: 'As imagens e os vídeos desta conversa aparecerão aqui',
    empty_files: 'Os arquivos criados pelo assistente aparecerão aqui',
    load_error: 'Não foi possível carregar', retry: 'Tentar novamente', download: 'Baixar', close: 'Fechar',
    back: 'Voltar', prev: 'Anterior', next: 'Próximo', unsaved: 'Não salvos: {{n}}',
    unsaved_hint: 'O arquivo estava em um servidor temporário e foi excluído', video: 'Vídeo', image: 'Imagem' },
  zh: { open: '媒体和文件', title: '媒体和文件', tab_media: '媒体', tab_files: '文件',
    empty_media: '此对话中的图片和视频将显示在这里',
    empty_files: '助手创建的文件将显示在这里',
    load_error: '加载失败', retry: '重试', download: '下载', close: '关闭',
    back: '返回', prev: '上一个', next: '下一个', unsaved: '未保存：{{n}}',
    unsaved_hint: '该文件存放在临时服务器上，已被删除', video: '视频', image: '图片' },
};
for (const [lang, files] of Object.entries(T)) {
  const p = `src/i18n/locales/${lang}.json`;
  const o = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (o.chat.files !== undefined) throw new Error(`${lang}: chat.files уже есть`);
  o.chat.files = files;
  fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
}
console.log('ok');
EOF
git -C ~/Downloads/spirits_front/.worktrees/chat-files-panel diff --stat
```

Ожидание: `ok` и по ~19 добавленных строк в каждом из 7 файлов, без других изменений.

- [ ] **Step 4: Прогнать тест и проверки локалей**

«Точечный тест фронта `src/components/chat/files/filesLocales.test.ts`» — 7 passed. Затем:

```bash
cd ~/Downloads/spirits_front/.worktrees/chat-files-panel && node scripts/check-locales.mjs && echo locales-ok
```

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/i18n/locales/ru.json src/i18n/locales/en.json src/i18n/locales/de.json src/i18n/locales/es.json src/i18n/locales/fr.json src/i18n/locales/pt.json src/i18n/locales/zh.json
git -C $FRONT commit -q -m "feat(chat): тексты панели «Медиа и файлы» на 7 языках

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Загрузка, вкладки, месяцы, значки — `chatFiles.ts`

**Files:**
- Create: `$FRONT/src/components/chat/files/chatFiles.ts`
- Test: `$FRONT/src/components/chat/files/chatFiles.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/components/chat/files/chatFiles.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '../../../services/apiClient';
import { ChatFileItem, fetchChatFiles, fileIconKind, groupByMonth, splitTab, startTab } from './chatFiles';

vi.mock('../../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
const api = vi.mocked(apiClient);

const item = (p: Partial<ChatFileItem>): ChatFileItem => ({
  key: p.url ?? p.name ?? 'k', kind: 'image', url: 'https://pub/a.png', name: 'a.png', ext: 'png',
  createdAt: '2026-10-05T10:00:00.000Z', messageId: 1, stored: true, ...p,
});

describe('fetchChatFiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('просит файлы переписки с ассистентом и «Чистым листом»', async () => {
    api.get.mockResolvedValue({ ok: true, json: async () => ({ items: [item({})] }) } as any);
    const out = await fetchChatFiles('custom:abc', '1728000000000');
    expect(api.get).toHaveBeenCalledWith('/webhook/chat/files?assistantId=custom%3Aabc&freshTs=1728000000000');
    expect(out).toHaveLength(1);
  });

  it('без «Чистого листа» метку не шлёт', async () => {
    api.get.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) } as any);
    await fetchChatFiles(12, null);
    expect(api.get).toHaveBeenCalledWith('/webhook/chat/files?assistantId=12');
  });

  it('ошибка сервера — исключение, а не пустой список', async () => {
    api.get.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as any);
    await expect(fetchChatFiles(12)).rejects.toThrow();
  });

  it('ответ без items — пустой список', async () => {
    api.get.mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    await expect(fetchChatFiles(12)).resolves.toEqual([]);
  });
});

describe('splitTab / startTab', () => {
  const list = [
    item({ key: '1', kind: 'image' }),
    item({ key: '2', kind: 'video' }),
    item({ key: '3', kind: 'document', ext: 'pdf', name: 'a.pdf' }),
    item({ key: '4', kind: 'audio', ext: 'mp3', name: 'a.mp3' }),
    item({ key: '5', kind: 'image', stored: false, url: undefined }),
    item({ key: '6', kind: 'document', stored: false, url: undefined }),
  ];

  it('медиа — картинки и видео, файлы — документы и озвучка; не сохранившиеся отдельно', () => {
    expect(splitTab(list, 'media').stored.map((f) => f.key)).toEqual(['1', '2']);
    expect(splitTab(list, 'media').unsaved.map((f) => f.key)).toEqual(['5']);
    expect(splitTab(list, 'files').stored.map((f) => f.key)).toEqual(['3', '4']);
    expect(splitTab(list, 'files').unsaved.map((f) => f.key)).toEqual(['6']);
  });

  it('стартовая вкладка — «Медиа», если там есть что открыть, иначе «Файлы»', () => {
    expect(startTab(list)).toBe('media');
    expect(startTab([item({ kind: 'image', stored: false, url: undefined }), item({ kind: 'document' })])).toBe('files');
    expect(startTab([])).toBe('files');
  });
});

describe('groupByMonth', () => {
  it('месяцы по порядку прихода, подпись с заглавной', () => {
    const groups = groupByMonth(
      [
        item({ key: 'a', createdAt: '2026-10-05T10:00:00.000Z' }),
        item({ key: 'b', createdAt: '2026-10-01T10:00:00.000Z' }),
        item({ key: 'c', createdAt: '2026-09-20T10:00:00.000Z' }),
      ],
      'ru',
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.key)])).toEqual([
      ['Октябрь 2026 г.', ['a', 'b']],
      ['Сентябрь 2026 г.', ['c']],
    ]);
    expect(groupByMonth([item({ createdAt: '2026-10-05T10:00:00.000Z' })], 'en')[0].label).toBe('October 2026');
  });
});

describe('fileIconKind', () => {
  it.each([
    ['pdf', 'document', 'pdf'], ['docx', 'document', 'word'], ['xlsx', 'document', 'excel'],
    ['pptx', 'document', 'powerpoint'], ['zip', 'document', 'archive'], ['py', 'document', 'code'],
    ['mp3', 'audio', 'audio'], ['stl', 'document', 'other'],
  ] as const)('%s (%s) → %s', (ext, kind, icon) => {
    expect(fileIconKind({ ext, kind })).toBe(icon);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $FRONT add src/components/chat/files/chatFiles.test.ts
git -C $FRONT commit -q -m "test(chat): загрузка и раскладка файлов панели (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Точечный тест фронта `src/components/chat/files/chatFiles.test.ts`». Ожидание: не находится `./chatFiles`.

- [ ] **Step 3: Реализация**

```ts
// src/components/chat/files/chatFiles.ts
import { apiClient } from '../../../services/apiClient';

export type ChatFileKind = 'image' | 'video' | 'document' | 'audio';

/** Запись GET /webhook/chat/files — spirits_back: chat-files.service.ts, ChatFileItem. */
export interface ChatFileItem {
  key: string;
  kind: ChatFileKind;
  /** Нет у stored=false: файл пропал, скачивать нечего. */
  url?: string;
  thumbUrl?: string;
  name: string;
  ext: string;
  createdAt: string;
  messageId: number;
  stored: boolean;
}

export type FilesTab = 'media' | 'files';

export async function fetchChatFiles(assistantId: string | number, freshTs?: string | null): Promise<ChatFileItem[]> {
  const fresh = freshTs ? `&freshTs=${encodeURIComponent(freshTs)}` : '';
  const res = await apiClient.get(`/webhook/chat/files?assistantId=${encodeURIComponent(String(assistantId))}${fresh}`);
  if (!res.ok) throw new Error(`chat files: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

const isMedia = (f: ChatFileItem) => f.kind === 'image' || f.kind === 'video';

/** Файлы вкладки: те, что можно открыть, и не сохранившиеся. */
export function splitTab(items: ChatFileItem[], tab: FilesTab): { stored: ChatFileItem[]; unsaved: ChatFileItem[] } {
  const inTab = items.filter((f) => (tab === 'media' ? isMedia(f) : !isMedia(f)));
  return {
    stored: inTab.filter((f) => f.stored && !!f.url),
    unsaved: inTab.filter((f) => !f.stored || !f.url),
  };
}

/** «Медиа», если в ней есть что открыть, иначе «Файлы». */
export function startTab(items: ChatFileItem[]): FilesTab {
  return splitTab(items, 'media').stored.length > 0 ? 'media' : 'files';
}

export interface MonthGroup {
  key: string;
  label: string;
  items: ChatFileItem[];
}

/** Группы по месяцам в порядке прихода: сервер отдаёт файлы от новых к старым. */
export function groupByMonth(items: ChatFileItem[], lang: string): MonthGroup[] {
  const fmt = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' });
  const groups: MonthGroup[] = [];
  for (const it of items) {
    const d = new Date(it.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const label = fmt.format(d);
      g = { key, label: label.charAt(0).toLocaleUpperCase(lang) + label.slice(1), items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

export type FileIconKind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'archive' | 'code' | 'audio' | 'other';

const WORD = new Set(['doc', 'docx', 'odt', 'rtf', 'txt', 'md']);
const EXCEL = new Set(['xls', 'xlsx', 'ods', 'csv']);
const POWERPOINT = new Set(['ppt', 'pptx', 'odp']);
const ARCHIVE = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
const CODE = new Set(['py', 'js', 'ts', 'json', 'html', 'htm', 'css', 'sh', 'sql', 'xml', 'yaml', 'yml']);

export function fileIconKind(f: Pick<ChatFileItem, 'ext' | 'kind'>): FileIconKind {
  if (f.kind === 'audio') return 'audio';
  if (f.ext === 'pdf') return 'pdf';
  if (WORD.has(f.ext)) return 'word';
  if (EXCEL.has(f.ext)) return 'excel';
  if (POWERPOINT.has(f.ext)) return 'powerpoint';
  if (ARCHIVE.has(f.ext)) return 'archive';
  if (CODE.has(f.ext)) return 'code';
  return 'other';
}
```

- [ ] **Step 4: Прогнать тест** — тот же файл, все passed.

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/files/chatFiles.ts
git -C $FRONT commit -q -m "feat(chat): загрузка и раскладка файлов панели

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Просмотр на весь экран — `MediaViewer`

**Files:**
- Create: `$FRONT/src/components/chat/files/MediaViewer.tsx`
- Test: `$FRONT/src/components/chat/files/MediaViewer.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```tsx
// src/components/chat/files/MediaViewer.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { mount, click, byLink, tRu } from '../../../test/dom';
import MediaViewer from './MediaViewer';
import type { ChatFileItem } from './chatFiles';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});

const img = (n: number): ChatFileItem => ({
  key: `k${n}`, kind: 'image', url: `https://pub/${n}.png`, name: `${n}.png`, ext: 'png',
  createdAt: '2026-10-05T10:00:00.000Z', messageId: n, stored: true,
});
const video: ChatFileItem = { ...img(9), key: 'v', kind: 'video', url: 'https://pub/v.mp4', name: 'v.mp4', ext: 'mp4' };
const key = (k: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); });
const byAria = (c: HTMLElement, label: string) => c.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

describe('MediaViewer', () => {
  it('показывает картинку и даёт её скачать под своим именем', () => {
    const { container } = mount(<MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://pub/1.png');
    const a = byLink(container, new RegExp(tRu('chat.files.download')))!;
    expect(a.getAttribute('href')).toBe('https://pub/1.png');
    expect(a.getAttribute('download')).toBe('1.png');
  });

  it('стрелки: у первой нет «назад», у последней нет «вперёд»', () => {
    const onIndex = vi.fn();
    const first = mount(<MediaViewer items={[img(1), img(2)]} index={0} onIndexChange={onIndex} onClose={vi.fn()} />);
    expect(byAria(first.container, tRu('chat.files.prev'))).toBeNull();
    click(byAria(first.container, tRu('chat.files.next'))!);
    expect(onIndex).toHaveBeenCalledWith(1);
    first.unmount();

    const last = mount(<MediaViewer items={[img(1), img(2)]} index={1} onIndexChange={onIndex} onClose={vi.fn()} />);
    expect(byAria(last.container, tRu('chat.files.next'))).toBeNull();
    last.unmount();
  });

  it('клавиатура: ← → листают, Esc закрывает', () => {
    const onIndex = vi.fn();
    const onClose = vi.fn();
    const m = mount(<MediaViewer items={[img(1), img(2), img(3)]} index={1} onIndexChange={onIndex} onClose={onClose} />);
    key('ArrowRight');
    expect(onIndex).toHaveBeenLastCalledWith(2);
    key('ArrowLeft');
    expect(onIndex).toHaveBeenLastCalledWith(0);
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });

  it('видео — плеер', () => {
    const { container } = mount(<MediaViewer items={[video]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://pub/v.mp4');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $FRONT add src/components/chat/files/MediaViewer.test.tsx
git -C $FRONT commit -q -m "test(chat): просмотр медиа на весь экран (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Точечный тест фронта `src/components/chat/files/MediaViewer.test.tsx`» — не находится `./MediaViewer`.

- [ ] **Step 3: Реализация**

```tsx
// src/components/chat/files/MediaViewer.tsx
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import type { ChatFileItem } from './chatFiles';

interface Props {
  /** Только сохранённые медиа: у них есть адрес. */
  items: ChatFileItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** Картинка или видео на весь экран: «Скачать», «Закрыть», стрелки и клавиатура. */
const MediaViewer: React.FC<Props> = ({ items, index, onIndexChange, onClose }) => {
  const { t } = useTranslation();
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onClose, onIndexChange]);

  if (!item?.url) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" role="dialog" aria-modal="true" data-testid="media-viewer">
      <div className="flex items-center justify-end gap-2 p-3">
        <a
          href={item.url}
          download={item.name}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
        >
          <Download className="h-4 w-4" />
          {t('chat.files.download')}
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('chat.files.close')}
          title={t('chat.files.close')}
          className="rounded-lg p-2 text-white hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-6">
        {item.kind === 'video' ? (
          <video key={item.key} src={item.url} controls autoPlay className="max-h-full max-w-full" />
        ) : (
          <img src={item.url} alt={item.name} className="max-h-full max-w-full object-contain" />
        )}
        {hasPrev && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            aria-label={t('chat.files.prev')}
            title={t('chat.files.prev')}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            aria-label={t('chat.files.next')}
            title={t('chat.files.next')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default MediaViewer;
```

- [ ] **Step 4: Прогнать тест** — тот же файл, 4 passed.

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/files/MediaViewer.tsx
git -C $FRONT commit -q -m "feat(chat): просмотр медиа на весь экран

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Панель — `ChatFilesPanel`

**Files:**
- Create: `$FRONT/src/components/chat/files/ChatFilesPanel.tsx`
- Test: `$FRONT/src/components/chat/files/ChatFilesPanel.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```tsx
// src/components/chat/files/ChatFilesPanel.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { mount, flush, click, clickAsync, byButton, byLink, visibleText, tRu } from '../../../test/dom';
import ChatFilesPanel from './ChatFilesPanel';
import { apiClient } from '../../../services/apiClient';
import type { ChatFileItem } from './chatFiles';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
const api = vi.mocked(apiClient);

const ok = (items: ChatFileItem[]) => ({ ok: true, json: async () => ({ items }) }) as any;
const settle = async () => { await flush(); await flush(); };
const f = (p: Partial<ChatFileItem>): ChatFileItem => ({
  key: p.key ?? p.name ?? 'k', kind: 'image', url: 'https://pub/a.png', name: 'a.png', ext: 'png',
  createdAt: '2026-10-05T10:00:00.000Z', messageId: 1, stored: true, ...p,
});
const ITEMS: ChatFileItem[] = [
  f({ key: 'i1', name: 'i1.png', url: 'https://pub/i1.png', createdAt: '2026-10-05T10:00:00.000Z' }),
  f({ key: 'i2', name: 'i2.png', url: 'https://pub/i2.png', createdAt: '2026-10-02T10:00:00.000Z' }),
  f({ key: 'pdf', kind: 'document', ext: 'pdf', name: 'report.pdf', url: 'https://pub/report.pdf', createdAt: '2026-10-01T10:00:00.000Z' }),
  f({ key: 'v1', kind: 'video', ext: 'mp4', name: 'v1.mp4', url: 'https://pub/v1.mp4', thumbUrl: 'https://pub/v1.jpg', createdAt: '2026-09-20T10:00:00.000Z' }),
  f({ key: 'gone-img', name: 'chart.png', stored: false, url: undefined, createdAt: '2026-08-01T10:00:00.000Z' }),
  f({ key: 'gone-doc', kind: 'document', ext: 'docx', name: 'old.docx', stored: false, url: undefined, createdAt: '2026-08-01T10:00:00.000Z' }),
];
const tab = (c: HTMLElement, key: string) =>
  Array.from(c.querySelectorAll('[role="tab"]')).find((b) => (b.textContent ?? '').startsWith(tRu(key))) as HTMLButtonElement;
const press = (k: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); });

describe('ChatFilesPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('просит файлы именно этой переписки', async () => {
    api.get.mockResolvedValue(ok([]));
    mount(<ChatFilesPanel assistantId={12} freshTs="1728000000000" onClose={vi.fn()} />);
    await settle();
    expect(api.get).toHaveBeenCalledWith('/webhook/chat/files?assistantId=12&freshTs=1728000000000');
  });

  it('вкладки со счётчиками сохранённых, «Медиа» открыта первой, группы по месяцам', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(tab(container, 'chat.files.tab_media').textContent).toBe(`${tRu('chat.files.tab_media')} · 3`);
    expect(tab(container, 'chat.files.tab_files').textContent).toBe(`${tRu('chat.files.tab_files')} · 1`);
    expect(tab(container, 'chat.files.tab_media').getAttribute('aria-selected')).toBe('true');
    const text = visibleText(container);
    expect(text).toContain('Октябрь 2026 г.');
    expect(text).toContain('Сентябрь 2026 г.');
  });

  it('файл скачивается по ссылке под своим именем', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    click(tab(container, 'chat.files.tab_files'));
    const a = byLink(container, /report\.pdf/)!;
    expect(a.getAttribute('href')).toBe('https://pub/report.pdf');
    expect(a.getAttribute('download')).toBe('report.pdf');
  });

  it('не сохранившиеся — свёрнутой строкой внизу, без ссылок', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    click(tab(container, 'chat.files.tab_files'));
    expect(visibleText(container)).toContain(tRu('chat.files.unsaved', { n: 1 }));
    expect(visibleText(container)).not.toContain('old.docx');

    click(byButton(container, new RegExp(tRu('chat.files.unsaved', { n: 1 })))!);
    expect(visibleText(container)).toContain('old.docx');
    expect(visibleText(container)).toContain(tRu('chat.files.unsaved_hint'));
    expect(byLink(container, /old\.docx/)).toBeNull();
  });

  it('пусто — подсказка во вкладке; при пустом списке открыты «Файлы»', async () => {
    api.get.mockResolvedValue(ok([]));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(visibleText(container)).toContain(tRu('chat.files.empty_files'));
    click(tab(container, 'chat.files.tab_media'));
    expect(visibleText(container)).toContain(tRu('chat.files.empty_media'));
  });

  it('ошибка — «Не удалось загрузить» и «Повторить», повтор загружает заново', async () => {
    api.get.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as any);
    api.get.mockResolvedValueOnce(ok(ITEMS));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(visibleText(container)).toContain(tRu('chat.files.load_error'));
    await clickAsync(byButton(container, new RegExp(tRu('chat.files.retry')))!);
    await settle();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(visibleText(container)).toContain('Октябрь 2026 г.');
  });

  it('нажатие на превью открывает просмотр; Esc закрывает сначала просмотр, потом панель', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const onClose = vi.fn();
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={onClose} />);
    await settle();
    const tiles = container.querySelectorAll(`button[aria-label="${tRu('chat.files.image')}"]`);
    click(tiles[1]);
    const viewer = container.querySelector('[data-testid="media-viewer"]')!;
    expect(viewer).not.toBeNull();
    expect(byLink(viewer as HTMLElement, new RegExp(tRu('chat.files.download')))!.getAttribute('href')).toBe('https://pub/i2.png');

    press('Escape');
    expect(container.querySelector('[data-testid="media-viewer"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('«Назад» и крестик закрывают панель', async () => {
    api.get.mockResolvedValue(ok([]));
    const onClose = vi.fn();
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={onClose} />);
    await settle();
    click(container.querySelector(`button[aria-label="${tRu('chat.files.back')}"]`)!);
    click(container.querySelector(`button[aria-label="${tRu('chat.files.close')}"]`)!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $FRONT add src/components/chat/files/ChatFilesPanel.test.tsx
git -C $FRONT commit -q -m "test(chat): панель «Медиа и файлы» (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Точечный тест фронта `src/components/chat/files/ChatFilesPanel.test.tsx`» — не находится `./ChatFilesPanel`.

- [ ] **Step 3: Реализация**

```tsx
// src/components/chat/files/ChatFilesPanel.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  ArrowLeft, Download, File, FileArchive, FileAudio, FileCode, FileSpreadsheet, FileText, Play, Presentation, X,
} from 'lucide-react';
import MediaViewer from './MediaViewer';
import {
  ChatFileItem, FileIconKind, FilesTab, fetchChatFiles, fileIconKind, groupByMonth, splitTab, startTab,
} from './chatFiles';

interface Props {
  assistantId: string | number;
  /** Метка «Чистого листа»: панель показывает ту переписку, что на экране. */
  freshTs?: string | null;
  onClose: () => void;
}

const ICONS: Record<FileIconKind, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
  archive: FileArchive,
  code: FileCode,
  audio: FileAudio,
  other: File,
};

/**
 * «Медиа и файлы» переписки с ассистентом — как раздел медиа в Telegram.
 * Список строит бэк из текста истории (GET /webhook/chat/files), поэтому в
 * панели ровно то, что есть в ленте, включая старую историю.
 */
const ChatFilesPanel: React.FC<Props> = ({ assistantId, freshTs, onClose }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n?.language || 'ru';
  const [items, setItems] = useState<ChatFileItem[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<FilesTab | null>(null);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Esc при открытом просмотре закрывает просмотр (MediaViewer), а не панель.
  // Ref, а не состояние: оба обработчика срабатывают на одно и то же нажатие,
  // и к моменту проверки здесь просмотр ещё не успел закрыться.
  const viewerOpen = useRef(false);
  viewerOpen.current = viewerIndex !== null;

  const load = useCallback(async () => {
    setError(false);
    setItems(null);
    try {
      const list = await fetchChatFiles(assistantId, freshTs);
      setItems(list);
      setTab((cur) => cur ?? startTab(list));
    } catch {
      setError(true);
    }
  }, [assistantId, freshTs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !viewerOpen.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current: FilesTab = tab ?? 'media';
  const media = splitTab(items ?? [], 'media');
  const files = splitTab(items ?? [], 'files');
  const view = current === 'media' ? media : files;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.files.title')}
      data-testid="chat-files-panel"
    >
      <div className="absolute inset-0 hidden bg-black/30 sm:block" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-white sm:w-[420px] sm:shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.files.back')}
            title={t('chat.files.back')}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 sm:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="flex-1 text-base font-semibold text-gray-900">{t('chat.files.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.files.close')}
            title={t('chat.files.close')}
            className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 sm:block"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-gray-200" role="tablist">
          {(['media', 'files'] as FilesTab[]).map((name) => {
            const count = (name === 'media' ? media : files).stored.length;
            return (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={current === name}
                onClick={() => {
                  setTab(name);
                  setShowUnsaved(false);
                }}
                className={clsx(
                  'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                  current === name ? 'border-b-2 border-forest-600 text-forest-700' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {t(name === 'media' ? 'chat.files.tab_media' : 'chat.files.tab_files')}
                {items && count > 0 ? ` · ${count}` : ''}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="text-sm text-gray-500">{t('chat.files.load_error')}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t('chat.files.retry')}
              </button>
            </div>
          ) : items === null ? (
            <div className="grid grid-cols-3 gap-1 p-1" aria-hidden="true" data-testid="chat-files-skeleton">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="aspect-square animate-pulse bg-gray-100" />
              ))}
            </div>
          ) : view.stored.length === 0 && view.unsaved.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-gray-400">
              {t(current === 'media' ? 'chat.files.empty_media' : 'chat.files.empty_files')}
            </p>
          ) : (
            <>
              {groupByMonth(view.stored, lang).map((g) => (
                <section key={g.key}>
                  <h3 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.label}</h3>
                  {current === 'media' ? (
                    <div className="grid grid-cols-3 gap-1 px-1">
                      {g.items.map((it) => (
                        <button
                          key={it.key}
                          type="button"
                          onClick={() => setViewerIndex(media.stored.indexOf(it))}
                          aria-label={t(it.kind === 'video' ? 'chat.files.video' : 'chat.files.image')}
                          className="relative aspect-square overflow-hidden bg-gray-100"
                        >
                          {it.kind === 'video' && !it.thumbUrl ? (
                            <div className="h-full w-full bg-gray-800" />
                          ) : (
                            <img
                              src={it.kind === 'video' ? it.thumbUrl : it.url}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          )}
                          {it.kind === 'video' && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Play className="h-8 w-8 text-white drop-shadow" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <ul>
                      {g.items.map((it) => {
                        const Icon = ICONS[fileIconKind(it)];
                        return (
                          <li key={it.key}>
                            <a
                              href={it.url}
                              download={it.name}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
                            >
                              <Icon className="h-8 w-8 flex-shrink-0 text-forest-600" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-gray-900">{it.name}</span>
                                <span className="block text-xs text-gray-500">
                                  {new Date(it.createdAt).toLocaleDateString(lang)}
                                </span>
                              </span>
                              <Download className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))}

              {view.unsaved.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setShowUnsaved((v) => !v)}
                    aria-expanded={showUnsaved}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    {t('chat.files.unsaved', { n: view.unsaved.length })}
                  </button>
                  {showUnsaved && (
                    <div className="mt-2">
                      <p className="mb-2 text-xs text-gray-400">{t('chat.files.unsaved_hint')}</p>
                      <ul className="space-y-1">
                        {view.unsaved.map((it) => (
                          <li key={it.key} className="truncate text-sm text-gray-400">
                            {it.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {viewerIndex !== null && (
        <MediaViewer
          items={media.stored}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
};

export default ChatFilesPanel;
```

- [ ] **Step 4: Прогнать тест** — тот же файл, 8 passed. Если не сходится выбор превью `tiles[1]`: превью идут в порядке месяцев (`i1`, `i2` в октябре, затем `v1` в сентябре), и `tiles` собирает только картинки (`aria-label` «Картинка»), поэтому `tiles[1]` — это `i2`.

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/files/ChatFilesPanel.tsx
git -C $FRONT commit -q -m "feat(chat): панель «Медиа и файлы»

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Вход в панель из `ChatInterface`

**Files:**
- Modify: `$FRONT/src/components/chat/ChatInterface.tsx`
- Test: `$FRONT/src/components/chat/filesWiring.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/components/chat/filesWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож связки панели «Медиа и файлы». Панель и её части покрыты своими
 * тестами, а вот что ChatInterface её вообще открывает — видно только здесь.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

describe('связка панели «Медиа и файлы»', () => {
  it('панель получает открытого ассистента и метку «Чистого листа»', () => {
    expect(SRC).toContain("import ChatFilesPanel from './files/ChatFilesPanel';");
    const at = SRC.indexOf('<ChatFilesPanel');
    expect(at).toBeGreaterThan(-1);
    const tag = SRC.slice(at, SRC.indexOf('/>', at));
    expect(tag).toContain('assistantId={selectedAssistant.id}');
    expect(tag).toContain('freshTs={freshTs}');
    expect(tag).toContain('onClose={() => setShowFilesPanel(false)}');
    expect(SRC.slice(at - 120, at)).toContain('showFilesPanel && selectedAssistant && (');
  });

  it('на мобиле — первый пункт меню «⋯»', () => {
    const menu = SRC.indexOf('role="menu"');
    const item = SRC.indexOf('data-testid="chat-files-menuitem"', menu);
    const fresh = SRC.indexOf('toggleFreshMode(); }}', menu);
    expect(item).toBeGreaterThan(menu);
    expect(item).toBeLessThan(fresh);
    expect(SRC.slice(item, item + 400)).toContain('setShowChatActions(false); setShowFilesPanel(true);');
  });

  it('на десктопе — кнопка в ряду перед «Перегенерировать»', () => {
    const btn = SRC.indexOf('data-testid="chat-files-toggle"');
    const regen = SRC.indexOf('onClick={handleRegenerateResponse}', btn);
    expect(btn).toBeGreaterThan(-1);
    expect(regen).toBeGreaterThan(btn);
    expect(SRC.slice(btn, regen)).toContain('hidden sm:block');
    expect(SRC.slice(btn, regen)).toContain('onClick={() => setShowFilesPanel(true)}');
  });

  it('смена ассистента закрывает панель', () => {
    expect(SRC).toMatch(/useEffect\(\(\) => \{\s*setShowFilesPanel\(false\);\s*\}, \[selectedAssistant\?\.id\]\)/);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $FRONT add src/components/chat/filesWiring.test.ts
git -C $FRONT commit -q -m "test(chat): вход в панель «Медиа и файлы» (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Точечный тест фронта `src/components/chat/filesWiring.test.ts`» — 4 failed.

- [ ] **Step 3: Правки `ChatInterface.tsx`**

**(а)** В импорт lucide (строка `import { Send, Paperclip, … MoreHorizontal } from 'lucide-react';`) добавить `Images` в конец списка: `…, Phone, MoreHorizontal, Images } from 'lucide-react';`.

**(б)** После строки `import AudioClip from './AudioClip';` добавить:

```ts
import ChatFilesPanel from './files/ChatFilesPanel';
```

**(в)** После строки `const chatActionsRef = useRef<HTMLDivElement>(null);` добавить:

```ts
  // Панель «Медиа и файлы» (files/ChatFilesPanel.tsx).
  const [showFilesPanel, setShowFilesPanel] = useState(false);
```

**(г)** Сразу после эффекта

```ts
  useEffect(() => {
    stopListening();
  }, [selectedAssistant?.id, stopListening]);
```

добавить:

```ts

  // Панель показывает переписку открытого ассистента — при смене ассистента закрываем.
  useEffect(() => {
    setShowFilesPanel(false);
  }, [selectedAssistant?.id]);
```

**(д)** Сразу после блока

```tsx
      {showTokenPackages && (
        <TokenPackages onClose={() => setShowTokenPackages(false)} />
      )}
```

добавить:

```tsx

      {showFilesPanel && selectedAssistant && (
        <ChatFilesPanel
          assistantId={selectedAssistant.id}
          freshTs={freshTs}
          onClose={() => setShowFilesPanel(false)}
        />
      )}
```

**(е)** Комментарий `{/* Десктоп: обе кнопки в ряд. */}` заменить на комментарий и кнопку:

```tsx
                {/* Десктоп: кнопки в ряд. «Медиа и файлы» — как раздел медиа в
                    Telegram; на мобиле тот же пункт первым в «⋯». */}
                <button
                  data-testid="chat-files-toggle"
                  onClick={() => setShowFilesPanel(true)}
                  className="hidden sm:block p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title={t('chat.files.open')}
                  aria-label={t('chat.files.open')}
                >
                  <Images className="w-4 h-4" />
                </button>
```

**(ж)** Перед комментарием `{/* «Чистый лист» тоже сюда: с ним в шапке имени` (внутри `role="menu"`) вставить первым пунктом:

```tsx
                      <button
                        role="menuitem"
                        data-testid="chat-files-menuitem"
                        onClick={() => { setShowChatActions(false); setShowFilesPanel(true); }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Images className="w-4 h-4" />
                        {t('chat.files.open')}
                      </button>
```

- [ ] **Step 4: Прогнать тесты**

«Точечный тест фронта `src/components/chat/filesWiring.test.ts`» — 4 passed. Затем остальные сторожа `ChatInterface`:

```bash
cd ~/Downloads/spirits_front/.worktrees/chat-files-panel && PATH=$HOME/.nvm/versions/node/v22.19.0/bin:$PATH ./node_modules/.bin/vitest run src/components/chat
```

Ожидание: всё зелёное.

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/ChatInterface.tsx
git -C $FRONT commit -q -m "feat(chat): «Медиа и файлы» — пункт в «⋯» на мобиле и кнопка в шапке на десктопе

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Финальные проверки обеих веток

**Files:** нет.

- [ ] **Step 1: Фронт на ноде — тесты, типы, сборка, линт**

База типов — до правок. Выполнить «Команда фронта на ноде» с командой `git checkout -q --detach origin/main && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c 'error TS'`. Записать число. Следующий вызов обёртки сам вернёт ворктри на свой sha.

Затем «Команда фронта на ноде» с командой:

```bash
pnpm test 2>&1 | tail -8; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c 'error TS'; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep 'components/chat/files\|ChatInterface' | head; pnpm lint 2>&1 | tail -5; pnpm build 2>&1 | tail -3
```

Ожидание:
- `pnpm test` зелёный;
- число ошибок tsc не больше базы;
- строк про `components/chat/files` нет; про `ChatInterface` — только те, что были в базе;
- линт без новых ошибок;
- сборка прошла.

- [ ] **Step 2: Проверки локалей и вшитых строк** — локально:

```bash
cd ~/Downloads/spirits_front/.worktrees/chat-files-panel && node scripts/check-locales.mjs && node scripts/check-no-hardcoded-locale.mjs && echo ok
```

- [ ] **Step 3: Бэк на ноде** — «Прогон тестов бэка с путём `src/`», затем «tsc-гейт бэка». Сравнить с базой `main`: прибавились только новые зелёные.

- [ ] **Step 4: Нарочно сломать сторож.** В `extract.ts` временно убрать `(?<!!)` из `MD_LINK_RE`: тест «картинка markdown-ом» обязан покраснеть, так как картинка посчитается дважды. В `ChatFilesPanel.tsx` временно убрать `&& !viewerOpen.current`: тест про Esc обязан покраснеть. После каждой мутации откатить её `git checkout <файл>`.

- [ ] **Step 5: Ревью** — скилл `superpowers:requesting-code-review` по диапазонам `origin/main..feat/chat-files-panel` в обоих репо. Замечания — по `superpowers:receiving-code-review`.

---

### Task 12: Влить обе ветки в `main` — ТОЛЬКО С OK ВЛАДЕЛЬЦА

- [ ] **Step 1: Спросить владельца.** «Ветки `feat/chat-files-panel` (бэк и фронт) готовы, вливаю в main?»

- [ ] **Step 2: Бэк, затем фронт.** Каждый — из своего ворктри, через detached `origin/main`:

```bash
for R in ~/Downloads/spirits_back/.worktrees/chat-files-panel ~/Downloads/spirits_front/.worktrees/chat-files-panel; do
  git -C $R fetch -q origin && git -C $R checkout -q --detach origin/main && \
  git -C $R merge --no-ff -q feat/chat-files-panel -m "Merge feat/chat-files-panel: панель «Медиа и файлы»

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" && \
  git -C $R push -q origin HEAD:main && git -C $R log -1 --oneline
done
```

Конфликт в `chat.module.ts` (план A и B оба правят providers): оставить оба набора — `ChatFileStore` и `ChatFilesService`.

---

### Task 13: Выкат — ТОЛЬКО С OK ВЛАДЕЛЬЦА

- [ ] **Step 1: Спросить владельца.** «Катим бэк и фронт (test → smoke → прод → smoke)?»

- [ ] **Step 2: Проверить, что чужого выката нет, и запустить с ноды из чистых клонов, отвязанно**

```bash
ssh dv@85.192.61.231 "pgrep -af '^bash scripts/deploy.sh' || echo 'нет выката'"
ssh dv@85.192.61.231 'set -e; D=~/deploy-clones/chat-files-b; rm -rf $D; mkdir -p $D ~/deploy-logs; cd $D; git clone -q --branch main git@github.com:dvvolkovv/spirits_back.git; git clone -q --branch main git@github.com:dvvolkovv/spirits.git spirits_front; install -m 600 ~/dev/spirits_back/scripts/test-server.env.local $D/spirits_back/scripts/; cd $D/spirits_back/tests && source ~/.nvm/nvm.sh && npm ci --no-audit --no-fund >/dev/null; cd $D/spirits_back && LOCAL_BACK_DIR=$D/spirits_back LOCAL_FRONT_DIR=$D/spirits_front setsid -f bash -c "echo \$\$ > ~/deploy-logs/chat-files-b.pid; exec bash scripts/deploy.sh" > ~/deploy-logs/chat-files-b.log 2>&1 < /dev/null; echo запущен'
```

Следить: `ssh dv@85.192.61.231 'tail -5 ~/deploy-logs/chat-files-b.log'`. Красный test — прод не тронут, разбирать по логу.

---

### Task 14: Живая проверка

- [ ] **Step 1: test.linkeon.io, десктоп.** Чат с Романом, где есть картинка и документ, затем «Медиа и файлы» в шапке.
  - Вкладки со счётчиками, месяцы.
  - Картинка открывается на весь экран, ← → листают, «Скачать» скачивает.
  - Документ скачивается с правильным именем.
  - Esc закрывает сначала просмотр, потом панель.
- [ ] **Step 2: Ширина 390 px.** «⋯» → «Медиа и файлы» первым пунктом, панель на весь экран, «←» закрывает.
- [ ] **Step 3: «Чистый лист».** Включить, попросить картинку: в панели только она. Выключить: снова прежняя переписка.
- [ ] **Step 4: Прод после выката.** То же на https://my.linkeon.io в своей переписке, без чужих аккаунтов.
- [ ] **Step 5: Приложение на Capacitor.** Спросить владельца, проверять ли в эмуляторе Android: приложение получает этот фронт через OTA. Если да — открыть панель и скачать файл, скачивание должно уйти в системный браузер.
