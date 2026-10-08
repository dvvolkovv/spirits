# Медиа и файлы, часть A: постоянное хранение файлов ассистентов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Файлы, которые ассистент создаёт на релее, в момент ответа копируются в наш MinIO (бакет `linkeon-chat-files`). Ссылка в чате и в истории сразу ведёт к нам, а ещё живые файлы со старых ссылок разово переносятся туда же до 16.10.2026.

**Architecture:**
- Чистые функции имени, типа и заголовков — `chat-files/file-meta.ts`.
- Копировщик `ChatFileStore` скачивает файлы с релея axios-ом и кладёт их через `StorageService`.
- Функция `storeRelayLinks` подменяет адреса в строках `[Скачать …](…)`. Её используют оба пути хода: `streamUniversalAgent` и `upload-and-chat`.
- Ссылки уходят клиенту после окончания потока, одной строкой и в поток, и в историю.
- Разовый перенос — `chat-files/backfill.ts` и CLI-обёртка `scripts/backfill-chat-files.ts`.

**Tech Stack:** NestJS 10, pg, axios, `@aws-sdk/client-s3` (через `StorageService`), jest + ts-jest.

**Спека:** `docs/superpowers/specs/2026-10-08-chat-media-files-design.md`, часть 1. Части 2–4 — в планах B (панель) и C (`find_files`).

**Срок:** задачи 13–16 (бакет, выкат, перенос) — до 16.10.2026. После этой даты файлы на релее начнут удаляться.

---

## Где работать

- Бэк: ворктри `~/Downloads/spirits_back/.worktrees/chat-files-storage`, ветка `feat/chat-files-storage` от `origin/main`. Ниже он обозначен `$BACK`. В общий чекаут `~/Downloads/spirits_back` не коммитить: там работают параллельные сессии.
- **Тесты бэка — только на тест-ноде.** Так решил владелец (мак не тянет), к тому же jest игнорирует пути с `/.worktrees/`. Свой ворктри на ноде — `~/ci/wt/chat-files-storage`. Живой чекаут `~/spirits_back` на ноде не трогать.

  **«Прогон тестов бэка с путём `<путь>`»** — это ровно эта команда с подставленным путём:

  ```bash
  BACK=~/Downloads/spirits_back/.worktrees/chat-files-storage
  git -C $BACK push -q origin feat/chat-files-storage
  SHA=$(git -C $BACK rev-parse HEAD)
  ssh dv@85.192.61.231 "git -C ~/ci/spirits_back fetch -q origin && (test -d ~/ci/wt/chat-files-storage || git -C ~/ci/spirits_back worktree add -q --detach ~/ci/wt/chat-files-storage $SHA) && git -C ~/ci/wt/chat-files-storage checkout -q --detach $SHA && cd ~/ci/wt/chat-files-storage && git log -1 --format='нода: %h %s' && source ~/.nvm/nvm.sh && (test -d node_modules || npm ci --no-audit --no-fund >/dev/null) && npx jest <путь> --maxWorkers=2 2>&1 | tail -60"
  ```

  Сверять строку `нода: <sha>` с `git -C $BACK log -1 --format=%h`. Если в сводке `0 matches` или `No tests found`, прогон пустой и ничего не доказывает.

- **Проверка типов бэка** (jest типы не проверяет, `isolatedModules`) — **«tsc-гейт»:**

  ```bash
  ssh dv@85.192.61.231 "cd ~/ci/wt/chat-files-storage && source ~/.nvm/nvm.sh && npx tsc --noEmit -p tsconfig.build.json 2>&1 | tail -30; echo exit=\$?"
  ```

  Выход должен совпасть с базой из задачи 0. Ловушка: в бэке `strictNullChecks: false`, поэтому `if (!r.ok)` не сужает союз. Сужать через `r.ok === false`.

- **Коммиты.** Как принято в репо: сначала красный тест отдельным коммитом `test(...): … (красный)`, потом правка `feat(...)` или `fix(...)`. Файлы добавлять поимённо, `git add -A` не делать. Каждое сообщение коммита заканчивается строкой:

  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```

- **Выкат и действия на серверах** (задачи 12–17) — **только после явного OK владельца**. Каждый раз спрашивать отдельно.

## Файлы

| Файл | Что |
|---|---|
| `$BACK/src/common/services/storage.service.ts` | `UploadInput.contentDisposition`, проброс в `PutObjectCommand` |
| `$BACK/src/common/services/storage.service.spec.ts` (новый) | тест проброса |
| `$BACK/src/chat/chat-files/file-meta.ts` (новый) | `fileExt`, `safeDecode`, `lastPathSegment`, `safeFileName`, `contentTypeFor`, `contentDispositionFor`, `relayRequestUrl` |
| `$BACK/src/chat/chat-files/file-meta.spec.ts` (новый) | их тесты |
| `$BACK/src/chat/chat-files/chat-file-store.ts` (новый) | `ChatFileStore.persist/persistOne`, `chatFilesBucket`, константы |
| `$BACK/src/chat/chat-files/chat-file-store.spec.ts` (новый) | тесты копировщика |
| `$BACK/src/chat/chat-files/relay-links.ts` (новый) | `RelayOutputFile`, `collectOutputFiles`, `outputFileLines`, `storeRelayLinks`, `collectRelayUrls`, `replaceUrls`, `escapeRe` |
| `$BACK/src/chat/chat-files/relay-links.spec.ts` (новый) | их тесты |
| `$BACK/src/chat/chat.module.ts` | `ChatFileStore` в providers |
| `$BACK/src/chat/chat.module.chat-files.spec.ts` (новый) | сторож регистрации |
| `$BACK/src/chat/chat.service.ts` | последний `@Optional()` параметр `chatFiles`, метод `storeRelayLinks`, перенос ссылок в `streamUniversalAgent` |
| `$BACK/src/chat/chat.service.chat-files.spec.ts` (новый) | сквозные тесты текстового хода |
| `$BACK/src/chat/chat.controller.ts` | перенос ссылок в `uploadAndChat` |
| `$BACK/src/chat/chat.upload-chat-files.spec.ts` (новый) | сквозные тесты хода с вложениями |
| `$BACK/src/chat/chat-files/backfill.ts` (новый) | `runBackfill`, `revertBackfill`, `SELECT_BACKFILL_ROWS_SQL` |
| `$BACK/src/chat/chat-files/backfill.spec.ts` (новый) | их тесты |
| `$BACK/scripts/backfill-chat-files.ts` (новый) | CLI: сухой прогон, `--apply`, `--revert` |
| `$BACK/scripts/provision-test.sh` | бакет `linkeon-chat-files` с политикой `s3:GetObject` |
| `$BACK/docs/dr-runbook.md` | бакеты зеркала и политика после восстановления |

---

### Task 0: Ворктри и база

**Files:** нет.

- [ ] **Step 1: Создать ворктри на маке**

```bash
git -C ~/Downloads/spirits_back fetch -q origin
git -C ~/Downloads/spirits_back worktree add -b feat/chat-files-storage .worktrees/chat-files-storage origin/main
git -C ~/Downloads/spirits_back/.worktrees/chat-files-storage log -1 --oneline
```

Ожидание: последний коммит `origin/main`.

- [ ] **Step 2: Поднять ворктри на ноде и снять базу**

Выполнить «Прогон тестов бэка с путём `src/chat`». Записать в отчёт задачи число `Tests:` (passed/failed) — это база: красные тесты в ней не наши.

Затем «tsc-гейт» и записать вывод. На 24.09.2026 он был пустым.

---

### Task 1: `StorageService` умеет `Content-Disposition`

**Files:**
- Modify: `$BACK/src/common/services/storage.service.ts`
- Test: `$BACK/src/common/services/storage.service.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/common/services/storage.service.spec.ts
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

describe('StorageService.upload', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000';
    process.env.MINIO_ACCESS_KEY = 'k';
    process.env.MINIO_SECRET_KEY = 's';
    process.env.MINIO_PUBLIC_URL = 'https://pub/';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  function make() {
    const svc = new StorageService();
    svc.onModuleInit();
    const send = jest.fn(async (_cmd: any) => ({}));
    (svc as any).s3 = { send };
    return { svc, send };
  }

  it('передаёт Content-Disposition в PutObject', async () => {
    const { svc, send } = make();
    await svc.upload({
      bucket: 'b',
      key: 'id/a.pdf',
      body: Buffer.from('x'),
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="a.pdf"',
    });
    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input.ContentDisposition).toBe('attachment; filename="a.pdf"');
    expect(cmd.input.ContentType).toBe('application/pdf');
  });

  it('без contentDisposition поле не задаётся — прежние загрузки не меняются', async () => {
    const { svc, send } = make();
    await svc.upload({ bucket: 'b', key: 'k', body: Buffer.from('x') });
    expect((send.mock.calls[0][0] as PutObjectCommand).input.ContentDisposition).toBeUndefined();
  });

  it('publicUrl склеивает базу без двойного слэша', () => {
    const { svc } = make();
    expect(svc.publicUrl('b', 'id/a%20b.pdf')).toBe('https://pub/b/id/a%20b.pdf');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/common/services/storage.service.spec.ts
git -C $BACK commit -q -m "test(storage): Content-Disposition при загрузке (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/common/services/storage.service.spec.ts`». Ожидание: падает первый тест, `ContentDisposition` равен `undefined`. Остальные два зелёные.

- [ ] **Step 3: Реализация**

В `src/common/services/storage.service.ts` дописать поле в интерфейс:

```ts
export interface UploadInput {
  bucket: string;
  key: string;
  body: Buffer | Readable;
  contentType?: string;
  cacheControl?: string;
  /**
   * `attachment; filename=…` — файл по прямому переходу скачивается, а не
   * открывается страницей на нашем домене (файлы переписки, chat-files).
   */
  contentDisposition?: string;
}
```

и в `upload()` передать его в команду:

```ts
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
        ContentDisposition: input.contentDisposition,
      }),
```

- [ ] **Step 4: Прогнать тест**

«Прогон тестов бэка с путём `src/common/services/storage.service.spec.ts`». Ожидание: 3 passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/common/services/storage.service.ts
git -C $BACK commit -q -m "feat(storage): contentDisposition в upload

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Имя, тип и заголовки файла — `file-meta.ts`

**Files:**
- Create: `$BACK/src/chat/chat-files/file-meta.ts`
- Test: `$BACK/src/chat/chat-files/file-meta.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/file-meta.spec.ts
import {
  MAX_NAME_CHARS,
  contentDispositionFor,
  contentTypeFor,
  fileExt,
  lastPathSegment,
  relayRequestUrl,
  safeFileName,
} from './file-meta';

describe('fileExt', () => {
  it.each([
    ['report.pdf', 'pdf'],
    ['Отчёт.DOCX', 'docx'],
    ['archive.tar.gz', 'gz'],
    ['README', ''],
    ['.env', ''],
    ['name.', ''],
    ['weird.ext!', ''],
  ])('%s → «%s»', (name, ext) => expect(fileExt(name)).toBe(ext));
});

describe('lastPathSegment', () => {
  it('последний сегмент без query и якоря', () => {
    expect(lastPathSegment('https://r.linkeon.io/files/u_12_ru/sub/report.pdf?x=1#y')).toBe('report.pdf');
  });
  it('раскодирует %XX и не падает на одиноком %', () => {
    expect(lastPathSegment('https://h/files/k/%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80.docx')).toBe('Договор.docx');
    expect(lastPathSegment('https://h/files/k/100%.txt')).toBe('100%.txt');
  });
});

describe('safeFileName', () => {
  it('разделители пути — в подчёркивания, управляющие символы — прочь', () => {
    expect(safeFileName('a/b\\c.pdf')).toBe('a_b_c.pdf');
    const nul = String.fromCharCode(0);
    const lf = String.fromCharCode(10);
    expect(safeFileName(`re${nul}port${lf}.pdf`)).toBe('report.pdf');
  });
  it('пустое и точки → file', () => {
    expect(safeFileName('')).toBe('file');
    expect(safeFileName('   ')).toBe('file');
    expect(safeFileName('..')).toBe('file');
  });
  it('кириллица и пробелы сохраняются', () => {
    expect(safeFileName('Договор аренды.docx')).toBe('Договор аренды.docx');
  });
  it('длинное имя режется до MAX_NAME_CHARS, расширение остаётся', () => {
    const out = safeFileName('а'.repeat(400) + '.docx');
    expect(Array.from(out)).toHaveLength(MAX_NAME_CHARS);
    expect(out.endsWith('.docx')).toBe(true);
  });
});

describe('contentTypeFor', () => {
  it.each([
    ['a.pdf', 'application/pdf'],
    ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['a.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['a.PNG', 'image/png'],
    ['a.svg', 'image/svg+xml'],
    ['a.mp4', 'video/mp4'],
    ['a.mp3', 'audio/mpeg'],
    ['a.zip', 'application/zip'],
    ['a.unknown', 'application/octet-stream'],
    ['noext', 'application/octet-stream'],
  ])('%s → %s', (name, type) => expect(contentTypeFor(name)).toBe(type));

  it.each(['a.html', 'a.HTM', 'a.xhtml', 'a.xml', 'a.js', 'a.mjs'])(
    '%s браузер исполнил бы — отдаём октет-потоком',
    (name) => expect(contentTypeFor(name)).toBe('application/octet-stream'),
  );
});

describe('contentDispositionFor', () => {
  it('ASCII-имя как есть', () => {
    expect(contentDispositionFor('report.pdf')).toBe(`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`);
  });
  it('кириллица: ASCII-замена и закодированное имя', () => {
    expect(contentDispositionFor('Договор 1.docx')).toBe(
      `attachment; filename="_______ 1.docx"; filename*=UTF-8''%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80%201.docx`,
    );
  });
  it('кавычка не ломает заголовок, скобки и апостроф кодируются в filename*', () => {
    expect(contentDispositionFor(`a"b'(c).txt`)).toBe(
      `attachment; filename="a_b'(c).txt"; filename*=UTF-8''a%22b%27%28c%29.txt`,
    );
  });
});

describe('relayRequestUrl', () => {
  it('кодирует сырой адрес релея', () => {
    expect(relayRequestUrl('https://r.linkeon.io/files/u_12_ru/Договор аренды.docx')).toBe(
      'https://r.linkeon.io/files/u_12_ru/%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80%20%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D1%8B.docx',
    );
  });
  it('уже закодированный второй раз не кодирует', () => {
    expect(relayRequestUrl('https://r.linkeon.io/files/k/a%20b.pdf')).toBe('https://r.linkeon.io/files/k/a%20b.pdf');
  });
  it('одинокий % кодирует как символ', () => {
    expect(relayRequestUrl('https://r.linkeon.io/files/k/100%.txt')).toBe('https://r.linkeon.io/files/k/100%25.txt');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/file-meta.spec.ts
git -C $BACK commit -q -m "test(chat-files): имя, тип и заголовки файла переписки (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat-files/file-meta.spec.ts`». Ожидание: `Cannot find module './file-meta'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/file-meta.ts
/**
 * Имя, тип и заголовки файла переписки (chat-files).
 *
 * Чистые функции, и все под тестами (file-meta.spec.ts). От них зависит, как
 * файл назовётся у пользователя при скачивании и откроется ли он страницей на
 * нашем домене. Последнее — вопрос безопасности, а не вкуса: у my.linkeon.io в
 * localStorage лежат токены входа, а ассистенты делают и .html, и .svg.
 */

/** Сколько символов имени оставляем; расширение при обрезке сохраняется. */
export const MAX_NAME_CHARS = 150;

/** Расширение в нижнем регистре без точки; пустая строка — если его нет. */
export function fileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

/** decodeURIComponent, который не бросает на одиноком «%». */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Последний сегмент пути адреса — без query и якоря, раскодированный. */
export function lastPathSegment(url: string): string {
  const path = url.split(/[?#]/)[0];
  const seg = path.split('/').filter(Boolean).pop() || '';
  return safeDecode(seg);
}

/**
 * Имя для ключа в бакете и для Content-Disposition: без разделителей пути и
 * управляющих символов, не длиннее MAX_NAME_CHARS. Пустое — `file`.
 */
export function safeFileName(raw: string): string {
  const cleaned = Array.from(String(raw ?? '').normalize('NFC'))
    .map((ch) => (ch === '/' || ch === '\\' ? '_' : ch))
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c >= 32 && !(c >= 127 && c < 160);
    })
    .join('')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'file';
  const chars = Array.from(cleaned);
  if (chars.length <= MAX_NAME_CHARS) return cleaned;
  const tail = fileExt(cleaned) ? cleaned.slice(cleaned.lastIndexOf('.')) : '';
  return chars.slice(0, MAX_NAME_CHARS - Array.from(tail).length).join('') + tail;
}

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  stl: 'model/stl',
};

/**
 * Типы, которые браузер исполнил бы как страницу или скрипт. Content-Disposition:
 * attachment и так не даёт открыть файл переходом; октет-поток — вторая линия на
 * случай, если заголовок где-то по дороге потеряется. SVG сюда не входит: превью
 * в панели рисуется через <img>, а там его скрипты не выполняются.
 */
const ACTIVE = new Set(['html', 'htm', 'xhtml', 'xml', 'js', 'mjs']);

export function contentTypeFor(name: string): string {
  const ext = fileExt(name);
  if (ACTIVE.has(ext)) return 'application/octet-stream';
  return TYPES[ext] || 'application/octet-stream';
}

/** RFC 5987: encodeURIComponent плюс символы, которые он оставляет как есть. */
function encodeRfc5987(s: string): string {
  return encodeURIComponent(s).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * `attachment` у всех файлов переписки: по прямому переходу файл скачивается, а
 * не открывается на нашем домене. ASCII-замена — для клиентов, которые не
 * читают filename*.
 */
export function contentDispositionFor(name: string): string {
  const ascii = Array.from(name)
    .map((ch) => (ch >= ' ' && ch <= '~' && ch !== '"' && ch !== '\\' ? ch : '_'))
    .join('');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

/**
 * Адрес для запроса к релею. Релей отдаёт ссылки сырыми (`/files/<ключ>/<имя>`,
 * имя без кодирования), а в тексте ответа они бывают и уже закодированными.
 * Поэтому сначала раскодируем, потом кодируем, и `%20` не станет `%2520`.
 */
export function relayRequestUrl(url: string): string {
  let decoded = url;
  try {
    decoded = decodeURI(url);
  } catch {
    // Одинокий «%»: адрес сырой, кодируем как есть.
  }
  return encodeURI(decoded);
}
```

- [ ] **Step 4: Прогнать тест**

«Прогон тестов бэка с путём `src/chat/chat-files/file-meta.spec.ts`». Ожидание: все passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/file-meta.ts
git -C $BACK commit -q -m "feat(chat-files): имя, тип и заголовки файла переписки

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Копировщик `ChatFileStore`

**Files:**
- Create: `$BACK/src/chat/chat-files/chat-file-store.ts`
- Test: `$BACK/src/chat/chat-files/chat-file-store.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/chat-file-store.spec.ts
import axios from 'axios';
import { ChatFileStore, PERSIST_FILE_TIMEOUT_MS, PERSIST_MAX_FILE_BYTES } from './chat-file-store';

jest.mock('axios');
const get = axios.get as jest.Mock;

const RELAY = 'https://r.linkeon.io/files/u1_12_ru';

function makeStore(upload?: (input: any) => Promise<string>) {
  const uploads: any[] = [];
  const storage = {
    upload: jest.fn(async (input: any) => {
      uploads.push(input);
      return upload ? upload(input) : 'ignored';
    }),
    publicUrl: jest.fn((bucket: string, key: string) => `https://pub/${bucket}/${key}`),
  };
  return { store: new ChatFileStore(storage as any), uploads };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.MINIO_BUCKET_CHAT_FILES;
});

describe('ChatFileStore.persist', () => {
  it('копирует файл релея в бакет и отдаёт наш адрес', async () => {
    get.mockResolvedValue({ data: Buffer.from('%PDF') });
    const { store, uploads } = makeStore();

    const map = await store.persist([`${RELAY}/report.pdf`]);

    expect(uploads).toHaveLength(1);
    const u = uploads[0];
    expect(u.bucket).toBe('linkeon-chat-files');
    // В ключе нет ни телефона, ни userId — только случайный uuid и имя.
    expect(u.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/report\.pdf$/);
    expect(Buffer.from(u.body).toString()).toBe('%PDF');
    expect(u.contentType).toBe('application/pdf');
    expect(u.contentDisposition).toBe(`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`);
    expect(u.cacheControl).toBe('public, max-age=31536000, immutable');

    const id = u.key.split('/')[0];
    expect(map.get(`${RELAY}/report.pdf`)).toBe(`https://pub/linkeon-chat-files/${id}/report.pdf`);
    expect(get).toHaveBeenCalledWith(
      `${RELAY}/report.pdf`,
      expect.objectContaining({
        responseType: 'arraybuffer',
        timeout: PERSIST_FILE_TIMEOUT_MS,
        maxContentLength: PERSIST_MAX_FILE_BYTES,
      }),
    );
  });

  it('кириллица с пробелом: ключ сырой, адрес и запрос к релею закодированы', async () => {
    get.mockResolvedValue({ data: Buffer.from('x') });
    const { store, uploads } = makeStore();
    const relayUrl = `${RELAY}/Договор аренды.docx`;

    const map = await store.persist([relayUrl]);

    expect(uploads[0].key.endsWith('/Договор аренды.docx')).toBe(true);
    expect(map.get(relayUrl)).toMatch(
      /\/%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80%20%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D1%8B\.docx$/,
    );
    expect(get.mock.calls[0][0]).toBe(
      `${RELAY}/%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80%20%D0%B0%D1%80%D0%B5%D0%BD%D0%B4%D1%8B.docx`,
    );
  });

  it('html уходит октет-потоком, svg — картинкой', async () => {
    get.mockResolvedValue({ data: Buffer.from('x') });
    const { store, uploads } = makeStore();

    await store.persist([`${RELAY}/page.html`, `${RELAY}/logo.svg`]);

    const byName = (n: string) => uploads.find((u) => u.key.endsWith(`/${n}`));
    expect(byName('page.html').contentType).toBe('application/octet-stream');
    expect(byName('logo.svg').contentType).toBe('image/svg+xml');
    expect(byName('page.html').contentDisposition.startsWith('attachment;')).toBe(true);
  });

  it('404 и сетевой сбой — файла нет в карте, остальные скопированы', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.endsWith('/gone.pdf')) throw Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });
      if (url.endsWith('/net.pdf')) throw new Error('socket hang up');
      return { data: Buffer.from('ok') };
    });
    const { store } = makeStore();

    const map = await store.persist([`${RELAY}/gone.pdf`, `${RELAY}/net.pdf`, `${RELAY}/ok.pdf`]);

    expect([...map.keys()]).toEqual([`${RELAY}/ok.pdf`]);
  });

  it('сбой MinIO — файла нет в карте', async () => {
    get.mockResolvedValue({ data: Buffer.from('x') });
    const { store } = makeStore(async () => {
      throw new Error('S3 down');
    });

    const map = await store.persist([`${RELAY}/a.pdf`]);

    expect(map.size).toBe(0);
  });

  it('один адрес дважды — одна загрузка', async () => {
    get.mockResolvedValue({ data: Buffer.from('x') });
    const { store, uploads } = makeStore();

    const map = await store.persist([`${RELAY}/a.pdf`, `${RELAY}/a.pdf`]);

    expect(uploads).toHaveLength(1);
    expect(map.size).toBe(1);
  });

  it('не больше трёх скачиваний одновременно', async () => {
    let inFlight = 0;
    let peak = 0;
    get.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight--;
      return { data: Buffer.from('x') };
    });
    const { store } = makeStore();

    const map = await store.persist(Array.from({ length: 8 }, (_, i) => `${RELAY}/f${i}.txt`));

    expect(map.size).toBe(8);
    expect(peak).toBe(3);
  });

  it('бюджет вышел — новые скачивания не начинаются', async () => {
    get.mockResolvedValue({ data: Buffer.from('x') });
    const { store } = makeStore();

    const map = await store.persist([`${RELAY}/a.txt`], { budgetMs: 0 });

    expect(map.size).toBe(0);
    expect(get).not.toHaveBeenCalled();
  });

  it('бакет берётся из MINIO_BUCKET_CHAT_FILES', async () => {
    process.env.MINIO_BUCKET_CHAT_FILES = 'other-bucket';
    get.mockResolvedValue({ data: Buffer.from('x') });
    const { store, uploads } = makeStore();

    await store.persist([`${RELAY}/a.txt`]);

    expect(uploads[0].bucket).toBe('other-bucket');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/chat-file-store.spec.ts
git -C $BACK commit -q -m "test(chat-files): копия файла релея в MinIO (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat-files/chat-file-store.spec.ts`». Ожидание: `Cannot find module './chat-file-store'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/chat-file-store.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { StorageService } from '../../common/services/storage.service';
import { contentDispositionFor, contentTypeFor, lastPathSegment, relayRequestUrl, safeFileName } from './file-meta';

/** Не больше стольких скачиваний с релея одновременно. */
export const PERSIST_CONCURRENCY = 3;
/** Таймаут на один файл. */
export const PERSIST_FILE_TIMEOUT_MS = 30_000;
/** Больше — не копируем, ссылка остаётся на релей. Тот же потолок, что у загрузок (chat.controller.ts). */
export const PERSIST_MAX_FILE_BYTES = 100 * 1024 * 1024;
/** Бюджет на все файлы одного хода: после него новые скачивания не начинаются. */
export const PERSIST_TURN_BUDGET_MS = 60_000;

export function chatFilesBucket(): string {
  return process.env.MINIO_BUCKET_CHAT_FILES || 'linkeon-chat-files';
}

/**
 * Копирует файлы, которые ассистент создал на релее, в наш MinIO.
 *
 * Зачем. Релей держит их в /tmp/agent-output, а /tmp там чистится при
 * перезагрузке и через 30 дней без обращений. 16.09.2026 релей перезагрузился,
 * и к 08.10 89% ссылок «Скачать» в истории вели в пустоту.
 *
 * Ключ — `<uuid>/<имя>`: угадать нельзя, телефона в адресе нет. Анонимно
 * бакет отдаёт только s3:GetObject, перечня ключей нет.
 *
 * Не бросает. Файл, который не удалось скопировать (404, таймаут, больше
 * PERSIST_MAX_FILE_BYTES, сбой MinIO), просто не попадает в карту, и
 * вызывающий оставит ссылку на релей — ровно как было до этой фичи.
 */
@Injectable()
export class ChatFileStore {
  private readonly logger = new Logger(ChatFileStore.name);

  constructor(private readonly storage: StorageService) {}

  /** Адрес релея → наш адрес. Повторы склеиваются. */
  async persist(relayUrls: string[], opts: { budgetMs?: number } = {}): Promise<Map<string, string>> {
    const unique = [...new Set(relayUrls.filter(Boolean))];
    const out = new Map<string, string>();
    const deadline = Date.now() + (opts.budgetMs ?? PERSIST_TURN_BUDGET_MS);
    let next = 0;
    const worker = async () => {
      while (next < unique.length) {
        if (Date.now() >= deadline) return;
        const url = unique[next++];
        try {
          out.set(url, await this.persistOne(url));
        } catch (e: any) {
          this.logger.warn(`chat-files: не скопирован ${url}: ${e?.message || e}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PERSIST_CONCURRENCY, unique.length) }, () => worker()));
    return out;
  }

  /** Один файл: скачать с релея и положить в бакет. Бросает при любой неудаче. */
  async persistOne(relayUrl: string): Promise<string> {
    const name = safeFileName(lastPathSegment(relayUrl));
    const res = await axios.get(relayRequestUrl(relayUrl), {
      responseType: 'arraybuffer',
      timeout: PERSIST_FILE_TIMEOUT_MS,
      maxContentLength: PERSIST_MAX_FILE_BYTES,
      maxBodyLength: PERSIST_MAX_FILE_BYTES,
      validateStatus: (s: number) => s === 200,
    });
    const bucket = chatFilesBucket();
    const id = randomUUID();
    await this.storage.upload({
      bucket,
      key: `${id}/${name}`,
      body: Buffer.from(res.data),
      contentType: contentTypeFor(name),
      contentDisposition: contentDispositionFor(name),
      cacheControl: 'public, max-age=31536000, immutable',
    });
    // Ключ в MinIO — сырое имя в UTF-8, а в адресе имя закодировано: пробел или
    // скобка в имени иначе сломали бы markdown-ссылку `[Скачать …](…)`.
    return this.storage.publicUrl(bucket, `${id}/${encodeURIComponent(name)}`);
  }
}
```

- [ ] **Step 4: Прогнать тест**

«Прогон тестов бэка с путём `src/chat/chat-files/chat-file-store.spec.ts`». Ожидание: 9 passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/chat-file-store.ts
git -C $BACK commit -q -m "feat(chat-files): ChatFileStore — копия файлов релея в MinIO

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ссылки на файлы хода — `relay-links.ts`

**Files:**
- Create: `$BACK/src/chat/chat-files/relay-links.ts`
- Test: `$BACK/src/chat/chat-files/relay-links.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/relay-links.spec.ts
import {
  RelayOutputFile,
  collectOutputFiles,
  collectRelayUrls,
  outputFileLines,
  replaceUrls,
  storeRelayLinks,
} from './relay-links';

const AGENT = 'https://r.linkeon.io';
const R = `${AGENT}/files/u1_12_ru`;

describe('collectOutputFiles / outputFileLines', () => {
  it('собирает файлы из done.outputFiles без повторов и строит строки ссылок', () => {
    const into: RelayOutputFile[] = [];
    collectOutputFiles(into, [{ name: 'a.pdf', url: '/files/u1_12_ru/a.pdf', size: 1 }, { name: 'a.pdf', url: '/files/u1_12_ru/a.pdf' }]);
    collectOutputFiles(into, [{ name: 'b.png', url: '/files/u1_12_ru/b.png' }, null, { name: 'x' }]);
    collectOutputFiles(into, undefined);

    expect(into).toEqual([
      { name: 'a.pdf', url: '/files/u1_12_ru/a.pdf' },
      { name: 'b.png', url: '/files/u1_12_ru/b.png' },
    ]);
    expect(outputFileLines(into, AGENT)).toEqual([`[Скачать a.pdf](${R}/a.pdf)`, `[Скачать b.png](${R}/b.png)`]);
  });
});

describe('storeRelayLinks', () => {
  const okStore = (to = (u: string) => u.replace(`${AGENT}/files/u1_12_ru`, 'https://pub/linkeon-chat-files/id')) => ({
    persist: jest.fn(async (urls: string[]) => new Map(urls.map((u) => [u, to(u)]))),
  });

  it('подменяет адрес релея нашим, текст ссылки не трогает', async () => {
    const store = okStore();
    const out = await storeRelayLinks([`[Скачать a b.pdf](${R}/a b.pdf)`], AGENT, store);
    expect(store.persist).toHaveBeenCalledWith([`${R}/a b.pdf`]);
    expect(out).toEqual(['[Скачать a b.pdf](https://pub/linkeon-chat-files/id/a b.pdf)']);
  });

  it('файл, который не скопировался, остаётся ссылкой на релей', async () => {
    const store = { persist: jest.fn(async () => new Map<string, string>()) };
    const lines = [`[Скачать a.pdf](${R}/a.pdf)`];
    expect(await storeRelayLinks(lines, AGENT, store)).toEqual(lines);
  });

  it('без хранилища — строки как были и предупреждение в лог', async () => {
    const warn = jest.fn();
    const lines = [`[Скачать a.pdf](${R}/a.pdf)`];
    expect(await storeRelayLinks(lines, AGENT, undefined, warn)).toEqual(lines);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('хранилище не подключено'));
  });

  it('хранилище бросило — строки как были', async () => {
    const warn = jest.fn();
    const store = { persist: jest.fn(async () => { throw new Error('boom'); }) };
    const lines = [`[Скачать a.pdf](${R}/a.pdf)`];
    expect(await storeRelayLinks(lines, AGENT, store, warn)).toEqual(lines);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('строки без адреса релея не трогает и хранилище не зовёт', async () => {
    const store = okStore();
    const lines = ['[Скачать x.pdf](https://example.com/x.pdf)', 'просто текст'];
    expect(await storeRelayLinks(lines, AGENT, store)).toEqual(lines);
    expect(store.persist).not.toHaveBeenCalled();
  });
});

describe('collectRelayUrls', () => {
  it('цели ссылок, в том числе с пробелом в имени, и голые адреса', () => {
    const text = [
      `[Скачать a b.pdf](${R}/a b.pdf)`,
      `Вот: ${R}/c.docx и ещё \`${R}/d.txt\``,
      `[чужой](https://example.com/files/x.pdf)`,
      `[Скачать a b.pdf](${R}/a b.pdf)`,
    ].join('\n');
    expect(collectRelayUrls(text, AGENT).sort()).toEqual([`${R}/a b.pdf`, `${R}/c.docx`, `${R}/d.txt`].sort());
  });
});

describe('replaceUrls', () => {
  it('меняет точные вхождения, не задевая более длинный адрес', () => {
    const text = `[1](${R}/a.pdf) и [2](${R}/a.pdf.zip) и ${R}/a.pdf`;
    const out = replaceUrls(text, new Map([[`${R}/a.pdf`, 'https://pub/x/a.pdf']]));
    expect(out).toBe(`[1](https://pub/x/a.pdf) и [2](${R}/a.pdf.zip) и https://pub/x/a.pdf`);
  });

  it('знак $ в новом адресе не портит подстановку', () => {
    expect(replaceUrls(`(${R}/a.pdf)`, new Map([[`${R}/a.pdf`, 'https://pub/$1/a.pdf']]))).toBe('(https://pub/$1/a.pdf)');
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/relay-links.spec.ts
git -C $BACK commit -q -m "test(chat-files): ссылки на файлы хода через наше хранилище (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat-files/relay-links.spec.ts`». Ожидание: `Cannot find module './relay-links'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/relay-links.ts
import { ChatFileStore } from './chat-file-store';

/** Файл хода из события релея `done.outputFiles`: `url` — относительный, `/files/<ключ>/<имя>`. */
export interface RelayOutputFile {
  name: string;
  url: string;
}

/** Строка ссылки, которую дописывает бэк. Только наш собственный формат. */
const LINK_LINE_RE = /^\[Скачать (.+)\]\((\S.*)\)$/;

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Копит файлы хода из `done.outputFiles`, без повторов. Обработчик `done`
 * синхронный, копировать оттуда нельзя, поэтому файлы откладываются до конца потока.
 */
export function collectOutputFiles(into: RelayOutputFile[], list: unknown): void {
  if (!Array.isArray(list)) return;
  for (const f of list as any[]) {
    if (!f || typeof f.url !== 'string' || !f.url) continue;
    if (into.some((p) => p.url === f.url)) continue;
    into.push({ name: String(f.name ?? ''), url: f.url });
  }
}

/** Прежний формат ссылок на файлы хода — тот же, что бэк писал до переноса в MinIO. */
export function outputFileLines(files: RelayOutputFile[], agentUrl: string): string[] {
  return files.map((f) => `[Скачать ${f.name}](${agentUrl}${f.url})`);
}

/**
 * Ссылки `[Скачать имя](адрес релея)` → на наше хранилище.
 *
 * Принимает ТОЛЬКО собственные строки бэка (outputFiles и resolveEmptyFileLinks),
 * а не текст модели. Вызывается до отправки клиенту: тот же текст уходит и в
 * поток, и в историю. Фронт сверяет ленту с историей посимвольно
 * (historyMerge.ts), и разные адреса в двух местах задвоили бы ответ.
 *
 * Никогда не бросает: без хранилища или при его сбое строки возвращаются как были.
 */
export async function storeRelayLinks(
  lines: string[],
  agentUrl: string,
  store: Pick<ChatFileStore, 'persist'> | undefined,
  warn: (msg: string) => void = () => {},
): Promise<string[]> {
  const prefix = `${agentUrl.replace(/\/$/, '')}/files/`;
  const parsed = lines.map((line) => {
    const m = line.match(LINK_LINE_RE);
    return m && m[2].startsWith(prefix) ? { name: m[1], url: m[2] } : null;
  });
  const urls = parsed.filter((p): p is { name: string; url: string } => p !== null).map((p) => p.url);
  if (urls.length === 0) return lines;
  if (!store) {
    warn('chat-files: хранилище не подключено — ссылки остаются на релее');
    return lines;
  }
  let stored: Map<string, string>;
  try {
    stored = await store.persist(urls);
  } catch (e: any) {
    warn(`chat-files: копия не удалась — ссылки остаются на релее: ${e?.message || e}`);
    return lines;
  }
  return lines.map((line, i) => {
    const p = parsed[i];
    const to = p ? stored.get(p.url) : undefined;
    return p && to ? `[Скачать ${p.name}](${to})` : line;
  });
}

/**
 * Все адреса файлов релея в тексте ответа: цели markdown-ссылок (там бывают
 * пробелы — релей имена не кодирует) и голые адреса.
 */
export function collectRelayUrls(content: string, agentUrl: string): string[] {
  const prefix = escapeRe(`${agentUrl.replace(/\/$/, '')}/files/`);
  const found = new Set<string>();
  for (const m of content.matchAll(new RegExp(`\\]\\((${prefix}[^)\\n]+)\\)`, 'g'))) {
    found.add(m[1].trim());
  }
  for (const m of content.matchAll(new RegExp(`${prefix}[^\\s\`'"<>)\\]]+`, 'g'))) {
    const url = m[0];
    // Начало цели ссылки с пробелом в имени — она уже учтена целиком.
    if (![...found].some((f) => f !== url && f.startsWith(url))) found.add(url);
  }
  return [...found];
}

/**
 * Точная подстановка адресов. Вхождение считается, только если за ним идёт
 * конец адреса: иначе замена `…/a.pdf` задела бы `…/a.pdf.zip`.
 */
export function replaceUrls(content: string, map: Map<string, string>): string {
  let out = content;
  for (const [from, to] of [...map.entries()].sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`${escapeRe(from)}(?=[\\s)\\]'"<>\`]|$)`, 'g'), () => to);
  }
  return out;
}
```

- [ ] **Step 4: Прогнать тест**

«Прогон тестов бэка с путём `src/chat/chat-files/relay-links.spec.ts`». Ожидание: все passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/relay-links.ts
git -C $BACK commit -q -m "feat(chat-files): ссылки на файлы хода через наше хранилище

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Подключить `ChatFileStore` к модулю и сервису

**Files:**
- Modify: `$BACK/src/chat/chat.module.ts`
- Modify: `$BACK/src/chat/chat.service.ts` (импорты, конструктор, новый метод)
- Test: `$BACK/src/chat/chat.module.chat-files.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat.module.chat-files.spec.ts
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ChatModule } from './chat.module';
import { ChatFileStore } from './chat-files/chat-file-store';

/**
 * В ChatService копировщик подключён как @Optional() — так требуют спеки,
 * собирающие сервис позиционно. Обратная сторона: забытый провайдер не роняет
 * старт, а молча оставляет ссылки на релее. Этот тест — сторож регистрации.
 */
it('ChatFileStore зарегистрирован в ChatModule', () => {
  expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ChatModule)).toContain(ChatFileStore);
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat.module.chat-files.spec.ts
git -C $BACK commit -q -m "test(chat-files): копировщик зарегистрирован в ChatModule (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat.module.chat-files.spec.ts`». Ожидание: падает, в providers только `ChatService` и `ChatToolsService`.

- [ ] **Step 3: Реализация**

В `src/chat/chat.module.ts` импортировать копировщик и добавить его в providers:

```ts
import { ChatFileStore } from './chat-files/chat-file-store';
```

```ts
  providers: [ChatService, ChatToolsService, ChatFileStore],
```

В `src/chat/chat.service.ts` после строки `import { productsCliMcp } from '../products/products-cli-tool';` добавить:

```ts
import { ChatFileStore } from './chat-files/chat-file-store';
import { RelayOutputFile, collectOutputFiles, outputFileLines, storeRelayLinks } from './chat-files/relay-links';
```

В конструкторе после `@Optional() private readonly integrations?: IntegrationFlagsService,` добавить последним параметром:

```ts
    // Копия файлов ассистента в MinIO (chat-files). Последним и @Optional:
    // спеки собирают ChatService позиционно. Без него ссылки остаются на
    // релее, как до фичи, и в лог уходит предупреждение. Что он реально
    // подключён, сторожит chat.module.chat-files.spec.ts.
    @Optional() private readonly chatFiles?: ChatFileStore,
```

Сразу после закрывающей `) {}` конструктора добавить метод:

```ts
  /**
   * Ссылки `[Скачать имя](адрес релея)` → на наше хранилище (chat-files/relay-links.ts).
   * Публичный: им же пользуется ход с вложениями в ChatController.
   */
  storeRelayLinks(lines: string[], agentUrl: string): Promise<string[]> {
    return storeRelayLinks(lines, agentUrl, this.chatFiles, (m) => this.logger.warn(m));
  }
```

Импорт `RelayOutputFile`, `collectOutputFiles` и `outputFileLines` используется в задаче 6. Если линтер редактора ругается на неиспользованный импорт, это ожидаемо до следующей задачи.

- [ ] **Step 4: Прогнать тесты**

«Прогон тестов бэка с путём `src/chat/chat.module.chat-files.spec.ts`». Ожидание: passed.

Затем «Прогон тестов бэка с путём `src/chat`». Ожидание: число падений не больше базы из задачи 0. Позиционные спеки не сломались: новый параметр последний.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat.module.ts src/chat/chat.service.ts
git -C $BACK commit -q -m "feat(chat-files): ChatFileStore в ChatModule и ChatService.storeRelayLinks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Текстовый ход — ссылки уходят уже на наше хранилище

**Files:**
- Modify: `$BACK/src/chat/chat.service.ts` (`streamUniversalAgent`)
- Test: `$BACK/src/chat/chat.service.chat-files.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat.service.chat-files.spec.ts
import { Readable } from 'stream';
import axios from 'axios';
import { ChatService } from './chat.service';

jest.mock('axios');

/**
 * Файлы, которые ассистент создал на релее, должны уходить пользователю
 * ссылкой на наш MinIO — и в потоке, и в истории ОДНОЙ И ТОЙ ЖЕ строкой:
 * фронт сверяет ленту с историей посимвольно (historyMerge.ts).
 *
 * Гоняется НАСТОЯЩИЙ streamUniversalAgent с замоканными axios/pg/res, как в
 * chat.service.speech-marker.spec.ts.
 */

const RELAY_FILE = 'https://r.linkeon.io/files/u1_7_ru/report.pdf';
const STORED = 'https://pub/linkeon-chat-files/11111111-2222-4333-8444-555555555555/report.pdf';
const OUTPUT = [{ name: 'report.pdf', url: '/files/u1_7_ru/report.pdf', size: 10 }];

function sseStream(events: any[]): Readable {
  const s = new Readable({ read() {} });
  process.nextTick(() => {
    for (const ev of events) s.push(`data: ${JSON.stringify(ev)}\n`);
    s.push(null);
  });
  return s;
}

function makeHarness(opts: { deltas: string[]; outputFiles?: any[]; store?: any }) {
  const written: any[] = [];
  const pgCalls: { sql: string; params: any[] }[] = [];
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      pgCalls.push({ sql, params });
      if (/AS spent/.test(sql)) return { rows: [{ spent: 0 }] };
      return { rows: [] };
    }),
  };
  const language = { resolveUserLanguage: jest.fn(async () => 'ru') };
  const svc = new ChatService(
    pg as any, null as any, null as any, null as any, null as any, language as any,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    opts.store,
  );
  const post = axios.post as jest.Mock;
  post.mockImplementation(async () => ({
    data: sseStream([
      ...opts.deltas.map((text) => ({ type: 'delta', text })),
      { type: 'done', outputFiles: opts.outputFiles ?? [] },
    ]),
  }));
  const res: any = {
    status: jest.fn(),
    setHeader: jest.fn(),
    write: jest.fn((line: string) => { written.push(JSON.parse(line)); return true; }),
    end: jest.fn(),
  };
  const run = async () => {
    await (svc as any).streamUniversalAgent(
      'u1', 'сделай отчёт', '7', '7', [], '', res, 'Роман', '', '', undefined, false, undefined,
    );
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  };
  return { written, pgCalls, run, post };
}

const items = (written: any[]) => written.filter((w) => w.type === 'item').map((w) => w.content as string);
const persistedAiText = (pgCalls: { sql: string; params: any[] }[]) =>
  pgCalls.find((c) => /INSERT INTO custom_chat_history/.test(c.sql) && /'ai'/.test(c.sql))?.params[2] as string | undefined;
const storeOk = () => ({ persist: jest.fn(async (urls: string[]) => new Map(urls.map((u) => [u, STORED]))) });

describe('streamUniversalAgent — файлы хода в нашем хранилище', () => {
  // persistResponse ставит 14-секундный таймер очистки dedup-карты; unref, чтобы jest вышел.
  const realSetTimeout = global.setTimeout;
  beforeAll(() => {
    (global as any).setTimeout = (fn: any, ms?: number, ...a: any[]) => {
      const t: any = (realSetTimeout as any)(fn, ms, ...a);
      if (t && typeof t.unref === 'function') t.unref();
      return t;
    };
  });
  afterAll(() => { (global as any).setTimeout = realSetTimeout; });
  beforeEach(() => { jest.clearAllMocks(); delete process.env.AGENT_URL; });

  it('ссылка уходит клиенту и в историю одной строкой — уже с нашим адресом', async () => {
    const store = storeOk();
    const h = makeHarness({ deltas: ['Готово, отчёт приложил.'], outputFiles: OUTPUT, store });
    await h.run();

    expect(store.persist).toHaveBeenCalledWith([RELAY_FILE]);
    const link = items(h.written).find((c) => c.includes('Скачать report.pdf'));
    expect(link).toBe(`\n\n[Скачать report.pdf](${STORED})`);
    const saved = persistedAiText(h.pgCalls);
    expect(saved).toContain(link);
    expect(saved).not.toContain('r.linkeon.io');
  });

  it('ссылка идёт после текста ответа', async () => {
    const h = makeHarness({ deltas: ['Часть 1. ', 'Часть 2.'], outputFiles: OUTPUT, store: storeOk() });
    await h.run();

    const all = items(h.written);
    expect(all.findIndex((c) => c.includes('Скачать'))).toBeGreaterThan(all.indexOf('Часть 2.'));
  });

  it('файл не скопировался — ссылка остаётся на релей, как раньше', async () => {
    const store = { persist: jest.fn(async () => new Map<string, string>()) };
    const h = makeHarness({ deltas: ['Готово.'], outputFiles: OUTPUT, store });
    await h.run();

    expect(items(h.written)).toContain(`\n\n[Скачать report.pdf](${RELAY_FILE})`);
  });

  it('без хранилища — ссылка на релей, как раньше', async () => {
    const h = makeHarness({ deltas: ['Готово.'], outputFiles: OUTPUT, store: undefined });
    await h.run();

    expect(items(h.written)).toContain(`\n\n[Скачать report.pdf](${RELAY_FILE})`);
  });

  it('ход из одних файлов не считается пустым и релей не гоняется второй раз', async () => {
    const h = makeHarness({ deltas: [], outputFiles: OUTPUT, store: storeOk() });
    await h.run();

    expect(h.post).toHaveBeenCalledTimes(1);
    expect(items(h.written)).toContain(`\n\n[Скачать report.pdf](${STORED})`);
  });

  it('адрес релея, набранный моделью, дописывается ссылкой уже на наше хранилище', async () => {
    const h = makeHarness({ deltas: [`Файл тут: \`${RELAY_FILE}\``], store: storeOk() });
    await h.run();

    expect(items(h.written)).toContain(`\n\n[Скачать report.pdf](${STORED})`);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat.service.chat-files.spec.ts
git -C $BACK commit -q -m "test(chat): файлы текстового хода — ссылкой на наше хранилище (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat.service.chat-files.spec.ts`». Ожидание:
- падают «одной строкой», «ход из одних файлов» и «набранный моделью»: везде в потоке адрес релея, а не наш;
- «после текста», «не скопировался» и «без хранилища» уже зелёные — это поведение должно сохраниться.

Проверка повтора пустого потока в тесте «ход из одних файлов» начинает работать после шага 3. На старом коде повтора и так нет: ссылки сразу попадают в `chunks`. Что тест ловит именно повтор, доказывает мутация в задаче 11.

- [ ] **Step 3: Реализация в `streamUniversalAgent`**

**(а)** Перед строкой `const relaySid = relaySessionKey(userId, assistantId, userLanguage, fresh ? freshSessionId : undefined);` добавить:

```ts
      // Файлы хода из done.outputFiles. Обработчик done синхронный, а файлы
      // сначала надо скопировать в наше хранилище (chat-files), поэтому ссылки
      // уходят после потока. Список общий для обоих прогонов, включая повтор
      // при пустом потоке.
      const pendingFiles: RelayOutputFile[] = [];
```

**(б)** В обработчике `done` заменить блок

```ts
                    // Collect output files info if any
                    if (ev.outputFiles && ev.outputFiles.length > 0) {
                      const fileLinks = ev.outputFiles
                        .map((f: any) => `[Скачать ${f.name}](${AGENT_URL}${f.url})`)
                        .join('\n');
                      if (fileLinks && !chunks.join('').includes(AGENT_URL)) {
                        chunks.push('\n\n' + fileLinks);
                        safeWrite({ type: 'item', content: '\n\n' + fileLinks });
                      }
                    }
```

на

```ts
                    // Файлы хода — не отсюда: их сначала надо скопировать к
                    // нам, а этот обработчик синхронный. Ссылки уходят после потока.
                    collectOutputFiles(pendingFiles, ev.outputFiles);
```

**(в)** Условие повтора пустого потока

```ts
      if (chunks.length === 0 && !clientDisconnected) {
```

заменить на

```ts
      // Ход из одних файлов — не пустой: раньше их ссылки уже лежали в chunks к
      // этому месту, и повтора не было. Без этой проверки релей гонялся бы
      // второй раз — двойная оплата и дубли файлов.
      if (chunks.length === 0 && pendingFiles.length === 0 && !clientDisconnected) {
```

**(г)** Сразу после закрывающей скобки блока повтора, перед комментарием `// Ссылки на файлы, которые ассистент оформить не смог — см.`, вставить:

```ts
      // Ссылки на файлы хода — уже на наше хранилище. Один и тот же текст уходит
      // и клиенту, и в историю: фронт сверяет ленту с историей посимвольно
      // (historyMerge.ts), и разные адреса в двух местах задвоили бы ответ.
      // Условие «в ответе ещё нет адреса релея» — прежнее, из обработчика done.
      if (pendingFiles.length > 0 && !chunks.join('').includes(AGENT_URL)) {
        const lines = await this.storeRelayLinks(outputFileLines(pendingFiles, AGENT_URL), AGENT_URL);
        const tail = '\n\n' + lines.join('\n');
        chunks.push(tail);
        safeWrite({ type: 'item', content: tail });
      }
```

**(д)** В блоке `resolveEmptyFileLinks` заменить

```ts
          if (resolved.length > 0) {
            const tail = '\n\n' + resolved.join('\n');
```

на

```ts
          if (resolved.length > 0) {
            const tail = '\n\n' + (await this.storeRelayLinks(resolved, AGENT_URL)).join('\n');
```

- [ ] **Step 4: Прогнать тесты**

«Прогон тестов бэка с путём `src/chat/chat.service.chat-files.spec.ts`». Ожидание: 6 passed.

Затем «Прогон тестов бэка с путём `src/chat`». Ожидание: падений не больше базы.

Затем «tsc-гейт»: вывод совпадает с базой.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat.service.ts
git -C $BACK commit -q -m "feat(chat): файлы текстового хода уходят ссылкой на наше хранилище

Ссылки на файлы релея копируются в MinIO после окончания потока и уходят
клиенту и в историю одной строкой. Ход из одних файлов больше не считается
пустым — иначе отложенные ссылки запускали бы повтор хода.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Ход с вложениями — то же самое

**Files:**
- Modify: `$BACK/src/chat/chat.controller.ts` (`uploadAndChat`)
- Test: `$BACK/src/chat/chat.upload-chat-files.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat.upload-chat-files.spec.ts
import { Readable } from 'stream';
import axios from 'axios';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

jest.mock('axios');
jest.mock('../common/telegram-alert', () => ({ sendTelegramAlert: jest.fn(async () => {}) }));

/**
 * Ход с вложениями (`POST /webhook/agent/upload-and-chat`) — вторая,
 * самостоятельная реализация стрима. Файлы релея там должны уходить ссылкой на
 * наше хранилище так же, как в текстовом ходе.
 */

const RELAY_FILE = 'https://r.linkeon.io/files/u1_12_ru/scan.docx';
const STORED = 'https://pub/linkeon-chat-files/11111111-2222-4333-8444-555555555555/scan.docx';

function sseStream(events: any[]): Readable {
  const s = new Readable({ read() {} });
  process.nextTick(() => {
    for (const ev of events) s.push(`data: ${JSON.stringify(ev)}\n`);
    s.push(null);
  });
  return s;
}

function makePg() {
  const calls: { sql: string; params: any[] }[] = [];
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (/SELECT tokens FROM ai_profiles_consolidated/.test(sql)) return { rows: [{ tokens: 1_000_000 }] };
    return { rows: [] };
  });
  return { query, calls };
}

function makeRes() {
  const written: any[] = [];
  return {
    written,
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    write: jest.fn((s: string) => { try { written.push(JSON.parse(s)); } catch {} return true; }),
    end: jest.fn(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as any;
}

async function run(store: any) {
  const pg = makePg();
  const language = { resolveUserLanguage: jest.fn(async () => 'ru') };
  const svc = new ChatService(
    pg as any, null as any, null as any, null as any, null as any, language as any,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    store,
  );
  const jwtSvc = { verify: jest.fn(() => ({ type: 'access', userId: 'u1' })) };
  const ctrl = new ChatController(svc, jwtSvc as any, null as any, undefined);
  const post = jest.fn(async () => ({
    data: sseStream([
      { type: 'delta', text: 'Перевёл.' },
      { type: 'done', outputFiles: [{ name: 'scan.docx', url: '/files/u1_12_ru/scan.docx' }] },
    ]),
  }));
  (axios as any).default = { post };
  (axios as any).post = post;
  const req = {
    headers: { authorization: 'Bearer token' },
    files: [{ originalname: 'scan.jpg', buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1 }],
    body: { message: 'переведи', assistantId: '12' },
  } as any;
  const res = makeRes();
  await ctrl.uploadAndChat(req, res);
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  const saved = pg.calls.find((c) => /INSERT INTO custom_chat_history/.test(c.sql) && /'ai'/.test(c.sql))?.params[2];
  return { res, saved: saved as string | undefined };
}

describe('uploadAndChat — файлы хода в нашем хранилище', () => {
  beforeEach(() => { jest.clearAllMocks(); delete process.env.AGENT_URL; });

  it('ссылка уходит в поток, в end и в историю уже с нашим адресом', async () => {
    const store = { persist: jest.fn(async (urls: string[]) => new Map(urls.map((u) => [u, STORED]))) };
    const { res, saved } = await run(store);

    expect(store.persist).toHaveBeenCalledWith([RELAY_FILE]);
    const items = res.written.filter((w: any) => w.type === 'item').map((w: any) => w.content);
    expect(items).toContain(`\n\n[Скачать scan.docx](${STORED})`);
    expect(res.written.find((w: any) => w.type === 'end').content).toContain(STORED);
    expect(saved).toContain(`[Скачать scan.docx](${STORED})`);
    expect(saved).not.toContain('r.linkeon.io');
  });

  it('копия не удалась — ссылка на релей, как раньше', async () => {
    const store = { persist: jest.fn(async () => new Map<string, string>()) };
    const { res, saved } = await run(store);

    const items = res.written.filter((w: any) => w.type === 'item').map((w: any) => w.content);
    expect(items).toContain(`\n\n[Скачать scan.docx](${RELAY_FILE})`);
    expect(saved).toContain(RELAY_FILE);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat.upload-chat-files.spec.ts
git -C $BACK commit -q -m "test(chat): файлы хода с вложениями — ссылкой на наше хранилище (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat.upload-chat-files.spec.ts`». Ожидание: первый тест падает (в потоке адрес релея), второй зелёный.

- [ ] **Step 3: Реализация в `uploadAndChat`**

**(а)** В импортах `src/chat/chat.controller.ts` после `import { toActivity } from './activity-map';` добавить:

```ts
import { RelayOutputFile, collectOutputFiles, outputFileLines } from './chat-files/relay-links';
```

**(б)** После строки `const chunks: string[] = [];` в `uploadAndChat` добавить:

```ts
    // Файлы хода — копируются к нам после потока (chat-files), см. finally.
    const pendingFiles: RelayOutputFile[] = [];
```

**(в)** В обработчике `done` заменить блок

```ts
                if (ev.outputFiles?.length > 0) {
                  const fileLinks = ev.outputFiles
                    .map((f: any) => `[Скачать ${f.name}](${AGENT_URL}${f.url})`)
                    .join('\n');
                  if (fileLinks) {
                    chunks.push('\n\n' + fileLinks);
                    safeWrite({ type: 'item', content: '\n\n' + fileLinks });
                  }
                }
```

на

```ts
                collectOutputFiles(pendingFiles, ev.outputFiles);
```

**(г)** В `finally` первой строкой, перед `const fullText = chunks.join('');`, вставить:

```ts
      // Ссылки на файлы хода — уже на наше хранилище, до `end` и до истории:
      // одна строка в обоих местах (historyMerge.ts сверяет посимвольно).
      // Здесь, в отличие от текстового хода, они дописываются всегда — так было
      // и до переноса. storeRelayLinks не бросает.
      if (pendingFiles.length > 0) {
        const lines = await this.chatService.storeRelayLinks(outputFileLines(pendingFiles, AGENT_URL), AGENT_URL);
        const tail = '\n\n' + lines.join('\n');
        chunks.push(tail);
        safeWrite({ type: 'item', content: tail });
      }
```

- [ ] **Step 4: Прогнать тесты**

«Прогон тестов бэка с путём `src/chat/chat.upload`». Ожидание: новые 2 и прежние `chat.upload-billing.spec.ts` / `chat.upload-session.spec.ts` — passed.

«tsc-гейт» — как база.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat.controller.ts
git -C $BACK commit -q -m "feat(chat): файлы хода с вложениями уходят ссылкой на наше хранилище

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Разовый перенос — логика `backfill.ts`

**Files:**
- Create: `$BACK/src/chat/chat-files/backfill.ts`
- Test: `$BACK/src/chat/chat-files/backfill.spec.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/chat/chat-files/backfill.spec.ts
import { JournalEntry, SELECT_BACKFILL_ROWS_SQL, revertBackfill, runBackfill } from './backfill';

const AGENT = 'https://r.linkeon.io';
const R = `${AGENT}/files/u1_12_ru`;

/** Таблица в памяти: SELECT по шаблону, UPDATE с проверкой прежнего текста. */
function makePg(rows: { id: number; content: string }[]) {
  const table = new Map(rows.map((r) => [r.id, r.content]));
  const calls: { sql: string; params: any[] }[] = [];
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql === SELECT_BACKFILL_ROWS_SQL) {
      const like = String(params[0]).replace(/%/g, '');
      return { rows: [...table].filter(([, c]) => c.includes(like)).map(([id, content]) => ({ id, content })) };
    }
    if (/^UPDATE custom_chat_history/.test(sql)) {
      const [next, id, prev] = params;
      if (table.get(id) !== prev) return { rows: [], rowCount: 0 };
      table.set(id, next);
      return { rows: [], rowCount: 1 };
    }
    if (/^SELECT content FROM custom_chat_history/.test(sql)) {
      const c = table.get(params[0]);
      return { rows: c === undefined ? [] : [{ content: c }] };
    }
    return { rows: [] };
  });
  return { query, calls, table };
}

const stored = (u: string) => u.replace(R, 'https://pub/linkeon-chat-files/id');

describe('runBackfill', () => {
  it('выборка: только ответы ассистента старше часа', () => {
    expect(SELECT_BACKFILL_ROWS_SQL).toMatch(/sender_type = 'ai'/);
    expect(SELECT_BACKFILL_ROWS_SQL).toMatch(/created_at < now\(\) - interval '1 hour'/);
  });

  it('сухой прогон ничего не пишет и считает живые по probe', async () => {
    const pg = makePg([{ id: 1, content: `[Скачать a.pdf](${R}/a.pdf)\n[Скачать b.pdf](${R}/b.pdf)` }]);
    const store = { persist: jest.fn() };
    const r = await runBackfill({
      pg, store, agentUrl: AGENT, apply: false,
      probe: async (u) => u.endsWith('a.pdf'), journal: jest.fn(), log: jest.fn(),
    });

    expect(r).toMatchObject({ rows: 1, urls: 2, alive: 1, missing: 1, updatedRows: 0, missingUrls: [`${R}/b.pdf`] });
    expect(store.persist).not.toHaveBeenCalled();
    expect(pg.calls.some((c) => /^UPDATE/.test(c.sql))).toBe(false);
  });

  it('--apply меняет только скопированные адреса и пишет журнал', async () => {
    const pg = makePg([{ id: 1, content: `[Скачать a.pdf](${R}/a.pdf) и [Скачать gone.pdf](${R}/gone.pdf)` }]);
    const store = { persist: jest.fn(async (urls: string[]) => new Map(urls.filter((u) => !u.endsWith('gone.pdf')).map((u) => [u, stored(u)]))) };
    const journal: JournalEntry[] = [];

    const r = await runBackfill({ pg, store, agentUrl: AGENT, apply: true, probe: jest.fn(), journal: (e) => journal.push(e), log: jest.fn() });

    expect(store.persist).toHaveBeenCalledWith([`${R}/a.pdf`, `${R}/gone.pdf`], { budgetMs: Infinity });
    expect(pg.table.get(1)).toBe(`[Скачать a.pdf](https://pub/linkeon-chat-files/id/a.pdf) и [Скачать gone.pdf](${R}/gone.pdf)`);
    expect(journal).toEqual([{ rowId: 1, relayUrl: `${R}/a.pdf`, storedUrl: 'https://pub/linkeon-chat-files/id/a.pdf' }]);
    expect(r).toMatchObject({ updatedRows: 1, skippedRows: 0, alive: 1, missing: 1, missingUrls: [`${R}/gone.pdf`] });
  });

  it('строку изменили во время переноса — она пропускается, журнала нет', async () => {
    const pg = makePg([{ id: 1, content: `[Скачать a.pdf](${R}/a.pdf)` }]);
    const store = {
      persist: jest.fn(async (urls: string[]) => {
        pg.table.set(1, 'переписано пользователем');
        return new Map(urls.map((u) => [u, stored(u)]));
      }),
    };
    const journal = jest.fn();

    const r = await runBackfill({ pg, store, agentUrl: AGENT, apply: true, probe: jest.fn(), journal, log: jest.fn() });

    expect(r).toMatchObject({ updatedRows: 0, skippedRows: 1 });
    expect(journal).not.toHaveBeenCalled();
    expect(pg.table.get(1)).toBe('переписано пользователем');
  });

  it('повторный запуск — ноль замен', async () => {
    const pg = makePg([{ id: 1, content: `[Скачать a.pdf](${R}/a.pdf)` }]);
    const store = { persist: jest.fn(async (urls: string[]) => new Map(urls.map((u) => [u, stored(u)]))) };
    const args = { pg, store, agentUrl: AGENT, apply: true, probe: jest.fn(), journal: jest.fn(), log: jest.fn() };

    await runBackfill(args);
    const second = await runBackfill(args);

    expect(second).toMatchObject({ rows: 0, urls: 0, updatedRows: 0 });
  });
});

describe('revertBackfill', () => {
  it('возвращает адреса релея по журналу', async () => {
    const pg = makePg([{ id: 1, content: '[Скачать a.pdf](https://pub/linkeon-chat-files/id/a.pdf)' }]);
    const r = await revertBackfill({
      pg,
      entries: [{ rowId: 1, relayUrl: `${R}/a.pdf`, storedUrl: 'https://pub/linkeon-chat-files/id/a.pdf' }],
      log: jest.fn(),
    });

    expect(r).toEqual({ reverted: 1, skipped: 0 });
    expect(pg.table.get(1)).toBe(`[Скачать a.pdf](${R}/a.pdf)`);
  });
});
```

- [ ] **Step 2: Закоммитить красный тест и убедиться, что он падает**

```bash
git -C $BACK add src/chat/chat-files/backfill.spec.ts
git -C $BACK commit -q -m "test(chat-files): разовый перенос файлов релея (красный)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

«Прогон тестов бэка с путём `src/chat/chat-files/backfill.spec.ts`». Ожидание: `Cannot find module './backfill'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/backfill.ts
import { collectRelayUrls, replaceUrls } from './relay-links';

/**
 * Разовый перенос ещё живых файлов релея в наше хранилище (chat-files).
 *
 * В истории до этой фичи ссылки «Скачать» вели на релей, где файлы лежат в /tmp
 * и пропадают. Здесь для каждой такой ссылки файл пробуется скачать; что
 * скопировалось — в тексте сообщения меняется ТОЛЬКО адрес.
 *
 * Сообщения моложе часа не трогаются: их может держать открытыми живая вкладка,
 * а фронт сверяет ленту с историей посимвольно (historyMerge.ts). UPDATE идёт с
 * проверкой прежнего текста: если строку за это время изменили, она пропускается.
 */

export interface BackfillPg {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}
export interface BackfillStore {
  persist: (urls: string[], opts?: { budgetMs?: number }) => Promise<Map<string, string>>;
}
export interface JournalEntry {
  rowId: number;
  relayUrl: string;
  storedUrl: string;
}

export const SELECT_BACKFILL_ROWS_SQL = `SELECT id, content FROM custom_chat_history
 WHERE sender_type = 'ai' AND content LIKE $1 AND created_at < now() - interval '1 hour'
 ORDER BY id`;

const UPDATE_SQL = `UPDATE custom_chat_history SET content = $1 WHERE id = $2 AND content = $3`;

/** Адреса, которые не отвечают, — не больше `limit` проверок одновременно. Порядок — как во входе. */
async function deadUrls(urls: string[], probe: (u: string) => Promise<boolean>, limit = 5): Promise<string[]> {
  const alive = new Set<string>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, urls.length) }, async () => {
      while (next < urls.length) {
        const u = urls[next++];
        try {
          if (await probe(u)) alive.add(u);
        } catch {
          // недоступен — значит не жив
        }
      }
    }),
  );
  return urls.filter((u) => !alive.has(u));
}

export async function runBackfill(p: {
  pg: BackfillPg;
  store: BackfillStore;
  agentUrl: string;
  apply: boolean;
  probe: (url: string) => Promise<boolean>;
  journal: (e: JournalEntry) => void;
  log: (m: string) => void;
}): Promise<{
  rows: number;
  urls: number;
  alive: number;
  missing: number;
  updatedRows: number;
  skippedRows: number;
  /** Что не нашлось на релее: видно глазами, нет ли ложных пропаж (например, обрезанных адресов). */
  missingUrls: string[];
}> {
  const agentUrl = p.agentUrl.replace(/\/$/, '');
  const { rows } = await p.pg.query(SELECT_BACKFILL_ROWS_SQL, [`%${agentUrl}/files/%`]);
  const perRow = rows.map((r: any) => ({
    id: Number(r.id),
    content: String(r.content),
    urls: collectRelayUrls(String(r.content), agentUrl),
  }));
  const unique = [...new Set(perRow.flatMap((r) => r.urls))];
  p.log(`строк со ссылками на релей: ${perRow.length}, уникальных адресов: ${unique.length}`);

  if (!p.apply) {
    const missingUrls = await deadUrls(unique, p.probe);
    return {
      rows: perRow.length,
      urls: unique.length,
      alive: unique.length - missingUrls.length,
      missing: missingUrls.length,
      updatedRows: 0,
      skippedRows: 0,
      missingUrls,
    };
  }

  const stored = await p.store.persist(unique, { budgetMs: Infinity });
  p.log(`скопировано файлов: ${stored.size} из ${unique.length}`);
  let updatedRows = 0;
  let skippedRows = 0;
  for (const r of perRow) {
    const map = new Map<string, string>();
    for (const u of r.urls) {
      const to = stored.get(u);
      if (to) map.set(u, to);
    }
    if (map.size === 0) continue;
    const next = replaceUrls(r.content, map);
    if (next === r.content) continue;
    const res = await p.pg.query(UPDATE_SQL, [next, r.id, r.content]);
    if ((res.rowCount ?? 0) === 1) {
      updatedRows++;
      for (const [relayUrl, storedUrl] of map) p.journal({ rowId: r.id, relayUrl, storedUrl });
    } else {
      skippedRows++;
      p.log(`строка ${r.id} изменилась во время переноса — пропущена`);
    }
  }
  const missingUrls = unique.filter((u) => !stored.has(u));
  return {
    rows: perRow.length,
    urls: unique.length,
    alive: stored.size,
    missing: missingUrls.length,
    updatedRows,
    skippedRows,
    missingUrls,
  };
}

/** Откат по журналу: наш адрес → адрес релея, с той же проверкой прежнего текста. */
export async function revertBackfill(p: {
  pg: BackfillPg;
  entries: JournalEntry[];
  log: (m: string) => void;
}): Promise<{ reverted: number; skipped: number }> {
  const byRow = new Map<number, Map<string, string>>();
  for (const e of p.entries) {
    if (!byRow.has(e.rowId)) byRow.set(e.rowId, new Map());
    byRow.get(e.rowId)!.set(e.storedUrl, e.relayUrl);
  }
  let reverted = 0;
  let skipped = 0;
  for (const [id, map] of byRow) {
    const { rows } = await p.pg.query(`SELECT content FROM custom_chat_history WHERE id = $1`, [id]);
    if (!rows[0]) {
      skipped++;
      continue;
    }
    const cur = String(rows[0].content);
    const next = replaceUrls(cur, map);
    if (next === cur) {
      skipped++;
      continue;
    }
    const res = await p.pg.query(UPDATE_SQL, [next, id, cur]);
    if ((res.rowCount ?? 0) === 1) reverted++;
    else {
      skipped++;
      p.log(`строка ${id} изменилась — откат пропущен`);
    }
  }
  return { reverted, skipped };
}
```

- [ ] **Step 4: Прогнать тест**

«Прогон тестов бэка с путём `src/chat/chat-files/backfill.spec.ts`». Ожидание: все passed.

- [ ] **Step 5: Коммит**

```bash
git -C $BACK add src/chat/chat-files/backfill.ts
git -C $BACK commit -q -m "feat(chat-files): логика разового переноса файлов релея

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: CLI переноса и проверка SQL на настоящем Postgres

**Files:**
- Create: `$BACK/scripts/backfill-chat-files.ts`

- [ ] **Step 1: Написать скрипт**

```ts
#!/usr/bin/env ts-node
/**
 * Разовый перенос ещё живых файлов релея в MinIO (chat-files).
 *
 * Запуск — на сервере, из ~/spirits_back:
 *   npx ts-node scripts/backfill-chat-files.ts              # сухой прогон: только счётчики
 *   npx ts-node scripts/backfill-chat-files.ts --apply      # копирует и меняет адреса в истории
 *   npx ts-node scripts/backfill-chat-files.ts --revert <журнал.jsonl>
 *
 * Требует в окружении (берутся из .env, как у приложения): DATABASE_URL,
 * MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_PUBLIC_URL,
 * необязательно AGENT_URL и MINIO_BUCKET_CHAT_FILES.
 *
 * Журнал --apply пишется в домашний каталог, а не в рабочее дерево репо:
 * ~/backfill-chat-files-<метка>.jsonl, по строке на заменённый адрес. Он же —
 * вход для --revert. Каталог можно сменить через BACKFILL_JOURNAL_DIR.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import { Client } from 'pg';
import { StorageService } from '../src/common/services/storage.service';
import { ChatFileStore } from '../src/chat/chat-files/chat-file-store';
import { relayRequestUrl } from '../src/chat/chat-files/file-meta';
import { JournalEntry, revertBackfill, runBackfill } from '../src/chat/chat-files/backfill';

async function main() {
  const args = process.argv.slice(2);
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  try {
    const revertAt = args.indexOf('--revert');
    if (revertAt >= 0) {
      const file = args[revertAt + 1];
      if (!file) throw new Error('--revert требует путь к журналу');
      const entries: JournalEntry[] = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      const r = await revertBackfill({ pg, entries, log: (m) => console.log(m) });
      console.log(`откат: возвращено строк ${r.reverted}, пропущено ${r.skipped}`);
      return;
    }

    const apply = args.includes('--apply');
    // StorageService — обычный Nest-провайдер; без DI-контейнера ему нужен
    // ручной onModuleInit (так же в generate-voice-samples.ts).
    const storage = new StorageService();
    storage.onModuleInit();
    const store = new ChatFileStore(storage);
    const journalPath = path.join(
      process.env.BACKFILL_JOURNAL_DIR || os.homedir(),
      `backfill-chat-files-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`,
    );

    const r = await runBackfill({
      pg,
      store,
      agentUrl: process.env.AGENT_URL || 'https://r.linkeon.io',
      apply,
      probe: async (u) =>
        (await axios.head(relayRequestUrl(u), { timeout: 15_000, validateStatus: () => true })).status === 200,
      journal: (e) => fs.appendFileSync(journalPath, JSON.stringify(e) + '\n'),
      log: (m) => console.log(m),
    });
    // Список пропавших — в файл, а не в консоль: там могут быть тысячи адресов.
    const { missingUrls, ...summary } = r;
    console.log(JSON.stringify(summary));
    const missingPath = journalPath.replace(/\.jsonl$/, '.missing.txt');
    fs.writeFileSync(missingPath, missingUrls.length > 0 ? missingUrls.join('\n') + '\n' : '');
    console.log(`не нашлось на релее: ${missingUrls.length}, список: ${missingPath}`);
    if (apply) console.log(`журнал: ${journalPath}`);
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Проверить SQL на настоящем Postgres ноды**

Юнит-тесты подменяют `pg`, и SQL в них не выполняется. Сначала запушить ветку («Прогон тестов бэка» делает push сам; можно просто `git -C $BACK push -q origin feat/chat-files-storage`). Затем на ноде создать одноразовую базу и прогнать `runBackfill` с настоящим `pg.Client` и поддельным хранилищем. Временный скрипт кладётся в корень ворктри (из `/tmp` ts-node модули проекта не резолвит) и сразу удаляется:

```bash
SHA=$(git -C $BACK rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/chat-files-storage && git fetch -q origin && git checkout -q --detach $SHA && source ~/.nvm/nvm.sh && createdb -h /var/run/postgresql backfill_probe && cat > ./backfill-probe.ts <<'EOF'
import { Client } from 'pg';
import { runBackfill } from './src/chat/chat-files/backfill';
(async () => {
  const pg = new Client({ database: 'backfill_probe', host: '/var/run/postgresql' });
  await pg.connect();
  await pg.query(\`CREATE TABLE custom_chat_history (id serial PRIMARY KEY, session_id text, sender_type text, content text, created_at timestamptz DEFAULT now())\`);
  const R = 'https://r.linkeon.io/files/u1_12_ru';
  await pg.query(\`INSERT INTO custom_chat_history (session_id, sender_type, content, created_at) VALUES
    ('u1_12','ai','[Скачать a.pdf](\${R}/a.pdf)', now() - interval '2 hours'),
    ('u1_12','human','[Скачать a.pdf](\${R}/a.pdf)', now() - interval '2 hours'),
    ('u1_12','ai','[Скачать b.pdf](\${R}/b.pdf)', now()),
    ('u1_12','ai','без ссылок', now() - interval '2 hours')\`);
  const store = { persist: async (urls: string[]) => new Map(urls.map((u) => [u, u.replace(R, 'https://pub/x')])) };
  const r = await runBackfill({ pg, store, agentUrl: 'https://r.linkeon.io', apply: true, probe: async () => true, journal: (e) => console.log('journal', JSON.stringify(e)), log: console.log });
  console.log(JSON.stringify(r));
  console.log((await pg.query('SELECT id, sender_type, content FROM custom_chat_history ORDER BY id')).rows);
  await pg.end();
})().catch((e) => { console.error(e); process.exit(1); });
EOF
npx ts-node ./backfill-probe.ts; rm -f ./backfill-probe.ts; dropdb -h /var/run/postgresql backfill_probe"
```

Ожидание:
- `rows: 1` — взята только строка `ai` старше часа;
- `updatedRows: 1`;
- в выборке строка 1 стала `[Скачать a.pdf](https://pub/x/a.pdf)`, а строки 2 (`human`) и 3 (свежая) не тронуты;
- одна строка `journal`.

Если `createdb` ответит, что база уже есть (остаток прошлого прогона), сначала выполнить `dropdb -h /var/run/postgresql backfill_probe`.

- [ ] **Step 3: tsc-гейт и коммит**

«tsc-гейт» совпадает с базой. Скрипты в `tsconfig.build.json` не входят, поэтому дополнительно проверить, что скрипт хотя бы разбирается:

```bash
ssh dv@85.192.61.231 "cd ~/ci/wt/chat-files-storage && source ~/.nvm/nvm.sh && npx tsc --noEmit --esModuleInterop --skipLibCheck --experimentalDecorators --emitDecoratorMetadata --target es2020 --module commonjs scripts/backfill-chat-files.ts; echo exit=\$?"
```

Ожидание: `exit=0`. Коммит:

```bash
git -C $BACK add scripts/backfill-chat-files.ts
git -C $BACK commit -q -m "feat(chat-files): CLI разового переноса файлов релея

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Бакет в настройке test-стенда и ранбук DR

**Files:**
- Modify: `$BACK/scripts/provision-test.sh` (рядом с созданием `linkeon-assets`)
- Modify: `$BACK/docs/dr-runbook.md` (строка таблицы MinIO и раздел «3. MinIO»)

- [ ] **Step 1: `provision-test.sh`**

Сразу после строки `ssh_test 'mc mb local/linkeon-assets …'`, которая заканчивается на `rm -f "$p"'`, добавить:

```bash

  # Файлы переписки (chat-files): то же — только s3:GetObject, без перечня ключей.
  ssh_test 'mc mb --ignore-existing local/linkeon-chat-files 2>&1 | tail -1; p=$(mktemp); printf "%s" "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":[\"*\"]},\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::linkeon-chat-files/*\"]}]}" > "$p"; mc anonymous set-json "$p" local/linkeon-chat-files 2>&1 | tail -1; rm -f "$p"'
```

Проверка синтаксиса: `bash -n $BACK/scripts/provision-test.sh && echo ok`.

- [ ] **Step 2: `docs/dr-runbook.md`**

Строку таблицы

```
| MinIO (SMM media) | hourly `mc mirror` (`minio-mirror.sh`, cron `20 * * * *`) | ≤1h | `/admin/monitoring/tech/minio-dr` | hourly TG if stale / bucket behind / mc errors |
```

заменить на

```
| MinIO (SMM media, assets, chat files) | hourly `mc mirror` (`minio-mirror.sh`, cron `20 * * * *`) | ≤1h | `/admin/monitoring/tech/minio-dr` | hourly TG if stale / bucket behind / mc errors |
```

Заголовок `## 3. MinIO (SMM media) — restore objects from node-3` заменить на `## 3. MinIO — restore objects from node-3`.

Строку

```
holding buckets `linkeon-smm-videos` + `linkeon-smm-music`. The mirror is
```

заменить на

```
holding buckets `linkeon-smm-videos`, `linkeon-smm-music`, `linkeon-assets`
(images, speech, call documents, avatars) and `linkeon-chat-files` (files the
assistants created in chats; added 2026-10). The mirror is
```

В блоке команд после `mc mirror --overwrite node3minio/linkeon-smm-music  newprod/linkeon-smm-music` добавить:

```bash
mc mirror --overwrite node3minio/linkeon-assets     newprod/linkeon-assets
mc mirror --overwrite node3minio/linkeon-chat-files newprod/linkeon-chat-files
# Anonymous access: GetObject ONLY. Never `mc anonymous set download` —
# that canned policy also allows anonymous s3:ListBucket (full key listing).
for b in linkeon-smm-videos linkeon-smm-music linkeon-assets linkeon-chat-files; do
  printf '%s' "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":[\"*\"]},\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::$b/*\"]}]}" > /tmp/p.json
  mc anonymous set-json /tmp/p.json newprod/$b
done
```

- [ ] **Step 3: Коммит**

```bash
git -C $BACK add scripts/provision-test.sh docs/dr-runbook.md
git -C $BACK commit -q -m "chore(chat-files): бакет linkeon-chat-files в настройке test и ранбуке DR

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Финальная проверка ветки и ревью

**Files:** нет.

- [ ] **Step 1: Обе половины jest и tsc**

Сначала «Прогон тестов бэка с путём `src/`» — сравнить с базой. Должны добавиться только новые зелёные тесты.

Затем половина `tests/unit`: она грузит `dist/`, поэтому сначала собрать:

```bash
SHA=$(git -C $BACK rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/chat-files-storage && git checkout -q --detach $SHA && source ~/.nvm/nvm.sh && npm run build >/dev/null 2>&1; echo build=\$?; cd tests && (test -d node_modules || npm ci --no-audit --no-fund >/dev/null) && npx jest unit/ --silent --maxWorkers=2 2>&1 | tail -15"
```

Ожидание: `build=0` и та же сводка, что у `origin/main`. Если сомневаешься, прогнать то же на `origin/main` для сравнения.

После этого «tsc-гейт».

- [ ] **Step 2: Нарочно сломать сторожа**

Тест не должен быть зелёным по построению. Временно вернуть в `streamUniversalAgent` условие повтора `if (chunks.length === 0 && !clientDisconnected) {` и прогнать `src/chat/chat.service.chat-files.spec.ts`: тест «ход из одних файлов» обязан покраснеть. Затем откатить правку через `git -C $BACK checkout src/chat/chat.service.ts` и убедиться, что он снова зелёный.

- [ ] **Step 3: Ревью кода**

Запросить ревью скиллом `superpowers:requesting-code-review` по диапазону `origin/main..feat/chat-files-storage`. Замечания разобрать по `superpowers:receiving-code-review`.

---

### Task 12: Влить в `main` — ТОЛЬКО С OK ВЛАДЕЛЬЦА

**Files:** нет.

- [ ] **Step 1: Спросить владельца**

Спросить: «Ветка `feat/chat-files-storage` готова (тесты и ревью — в отчёте). Вливаю в main?» Без ответа «да» дальше не идти.

- [ ] **Step 2: Влить через отдельное дерево**

Общий чекаут не трогать: там могут быть чужие коммиты.

```bash
git -C $BACK fetch -q origin
git -C $BACK checkout -q --detach origin/main
git -C $BACK merge --no-ff -q feat/chat-files-storage -m "Merge feat/chat-files-storage: файлы ассистентов — в наш MinIO

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C $BACK push -q origin HEAD:main
git -C $BACK log -1 --oneline
```

Если push отклонён как non-fast-forward (кто-то запушил в main), повторить шаг с `fetch`.

---

### Task 13: Бакет на test и проде — ТОЛЬКО С OK ВЛАДЕЛЬЦА

**Files:** нет (действия на серверах).

- [ ] **Step 0: Убедиться, что подмена типа закрыта.** Без этого HTML-файлы ассистентов откроются страницей на нашем домене рядом с токенами входа. Ожидание для обоих запросов: исходный тип файла и `Content-Security-Policy: sandbox`.

```bash
curl -sI 'https://my.linkeon.io/smm-media/linkeon-assets/avatars/agents/1.jpg?response-content-type=text/html' | grep -iE '^(content-type|content-security-policy):'
curl -sI 'https://test.linkeon.io/minio/linkeon-assets/speech-samples/alena.mp3?response-content-type=text/html' | grep -iE '^(content-type|content-security-policy):'
```

Если пришло `text/html` или нет CSP, бакет не создавать: сначала вернуть правку nginx (см. `docs/dr-runbook.md`, раздел MinIO).

- [ ] **Step 1: Спросить владельца** — «Создаю бакет `linkeon-chat-files` с политикой "только скачивание" на test и проде?»

- [ ] **Step 2: Test**

```bash
ssh dv@85.192.61.231 'mc mb --ignore-existing local/linkeon-chat-files && p=$(mktemp) && printf "%s" "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":[\"*\"]},\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::linkeon-chat-files/*\"]}]}" > "$p" && mc anonymous set-json "$p" local/linkeon-chat-files && rm -f "$p" && mc anonymous get-json local/linkeon-chat-files'
curl -s -o /dev/null -w 'test listing: HTTP %{http_code}\n' "https://test.linkeon.io/minio/linkeon-chat-files?list-type=2&max-keys=0"
```

Ожидание: политика с одним `s3:GetObject`, перечень — `HTTP 403`.

- [ ] **Step 3: Прод**

```bash
ssh dvolkov@212.113.106.202 'mc mb --ignore-existing local/linkeon-chat-files && p=$(mktemp) && printf "%s" "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":[\"*\"]},\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::linkeon-chat-files/*\"]}]}" > "$p" && mc anonymous set-json "$p" local/linkeon-chat-files && rm -f "$p" && mc anonymous get-json local/linkeon-chat-files'
curl -s -o /dev/null -w 'prod listing: HTTP %{http_code}\n' "https://my.linkeon.io/smm-media/linkeon-chat-files?list-type=2&max-keys=0"
```

Ожидание: то же, перечень — `HTTP 403`.

---

### Task 14: Выкат бэка — ТОЛЬКО С OK ВЛАДЕЛЬЦА

**Files:** нет.

- [ ] **Step 1: Спросить владельца** — «Катим бэк (`BACK_ONLY=1`, test → smoke → прод → smoke)?»

- [ ] **Step 2: Убедиться, что чужого выката нет**

```bash
ssh dv@85.192.61.231 "pgrep -af '^bash scripts/deploy.sh' || echo 'нет выката'"
```

Чужой процесс есть — ждать, не запускать второй.

- [ ] **Step 3: Запустить с ноды из чистых клонов, отвязанно**

```bash
ssh dv@85.192.61.231 'set -e; D=~/deploy-clones/chat-files-a; rm -rf $D; mkdir -p $D ~/deploy-logs; cd $D; git clone -q --branch main git@github.com:dvvolkovv/spirits_back.git; git clone -q --branch main git@github.com:dvvolkovv/spirits.git spirits_front; install -m 600 ~/dev/spirits_back/scripts/test-server.env.local $D/spirits_back/scripts/; cd $D/spirits_back/tests && source ~/.nvm/nvm.sh && npm ci --no-audit --no-fund >/dev/null; cd $D/spirits_back && BACK_ONLY=1 LOCAL_BACK_DIR=$D/spirits_back LOCAL_FRONT_DIR=$D/spirits_front setsid -f bash -c "echo \$\$ > ~/deploy-logs/chat-files-a.pid; exec bash scripts/deploy.sh" > ~/deploy-logs/chat-files-a.log 2>&1 < /dev/null; echo запущен'
```

Следить по логу: `ssh dv@85.192.61.231 'tail -5 ~/deploy-logs/chat-files-a.log'`, раз в несколько минут. Не через `| tail` в фоне. Конец — строка об успехе прод-smoke. Если test красный, прод не тронут. Разбирать по логу, а не перезапускать вслепую: красный smoke бывает и от сети ноды.

- [ ] **Step 4: Проверить, что доехал свой код**

```bash
ssh dvolkov@212.113.106.202 'cd ~/spirits_back && git log -1 --oneline && grep -c "chat-files" dist/chat/chat.module.js'
```

Ожидание: merge-коммит из задачи 12, счётчик больше 0.

---

### Task 15: Живая проверка на test

**Files:** нет.

- [ ] **Step 1: Ход с созданием файла**

Войти на https://test.linkeon.io под тестовым аккаунтом. Логин Basic Auth — в `scripts/test-server.env.local`, вход в приложение — по процедуре из `spirits_back/CLAUDE.md`. Попросить Романа: «Сделай короткий PDF с тремя пунктами и пришли файл».

Ожидание: ссылка «Скачать …pdf» ведёт на `https://test.linkeon.io/minio/linkeon-chat-files/<uuid>/<имя>.pdf`.

- [ ] **Step 2: Заголовки**

```bash
curl -sI "<адрес из ссылки>" | grep -iE '^(HTTP|content-type|content-disposition|x-content-type-options):'
```

Ожидание: `200`, `application/pdf`, `attachment; filename=…`, `nosniff`, `Content-Security-Policy: sandbox`.

Подмена типа параметрами ссылки не должна работать (nginx срезает строку запроса, закрыто 08.10.2026):

```bash
curl -sI "<адрес из ссылки>?response-content-type=text/html&response-content-disposition=inline" | grep -iE '^(content-type|content-disposition|content-security-policy):'
```

Ожидание: тот же `application/pdf`, `attachment`, `sandbox`. Если пришло `text/html`, выкат остановить: значит, правка nginx потеряна.

Попросить ассистента сделать `.html`-файл. Ожидание: `Content-Type: application/octet-stream`, в браузере по клику файл скачивается, а не открывается.

- [ ] **Step 3: История**

Перезагрузить страницу: ссылка та же, второго ответа-дубля в ленте нет.

---

### Task 16: Разовый перенос — test, потом прод, ДО 16.10.2026 — ТОЛЬКО С OK ВЛАДЕЛЬЦА

**Files:** нет.

- [ ] **Step 1: Проверить, что файлы на релее живы**

```bash
ssh dv@5.101.115.184 'echo "boot: $(uptime -s)"; find /tmp/agent-output -type f | wc -l'
```

Если загрузка позже 2026-10-08 или файлов почти нет, сначала вернуть снапшот:

```bash
ssh dv@5.101.115.184 'cp -a /home/dv/agent-output-snapshot-2026-10-08/. /tmp/agent-output/ && find /tmp/agent-output -type f | wc -l'
```

- [ ] **Step 2: Test — сухой прогон, затем `--apply`**

```bash
ssh dv@85.192.61.231 'cd ~/spirits_back && source ~/.nvm/nvm.sh && npx ts-node scripts/backfill-chat-files.ts'
```

Сверить список пропавших со снапшотом. Ни один пропавший файл не должен в нём находиться, иначе адрес разобран неверно (например, обрезан на скобке) и файл будет потерян:

```bash
scp dv@85.192.61.231:'~/backfill-chat-files-*.missing.txt' /tmp/missing-test.txt 2>/dev/null; ls -la /tmp/missing-test.txt
ssh dv@5.101.115.184 'cd /home/dv/agent-output-snapshot-2026-10-08 && find . -type f | sed "s#^\./##"' > /tmp/snapshot-files.txt
sed 's#^https://r.linkeon.io/files/##' /tmp/missing-test.txt | while read -r p; do grep -qxF "$p" /tmp/snapshot-files.txt && echo "ЛОЖНАЯ ПРОПАЖА: $p"; done; echo сверка-закончена
```

Если файлов списка несколько (запусков было больше одного), сверять последний. Показать владельцу счётчики `rows/urls/alive/missing` и итог сверки, спросить OK на `--apply`. После OK:

```bash
ssh dv@85.192.61.231 'cd ~/spirits_back && source ~/.nvm/nvm.sh && npx ts-node scripts/backfill-chat-files.ts --apply'
```

Здесь `~/spirits_back` на ноде — сервер test. Скрипт только читает код, ветку не переключает, а журнал пишет в `~/backfill-chat-files-<метка>.jsonl`, вне рабочего дерева. Проверить одну перенесённую ссылку в истории test: она открывается, а `curl -sI` даёт `attachment`.

- [ ] **Step 3: Прод — сухой прогон, затем `--apply`**

```bash
ssh dvolkov@212.113.106.202 'cd ~/spirits_back && npx ts-node scripts/backfill-chat-files.ts'
```

Сверить список пропавших со снапшотом, как на test: файл `~/backfill-chat-files-*.missing.txt` на проде, команды те же, но `scp` с `dvolkov@212.113.106.202`. Ложных пропаж быть не должно. Показать счётчики и итог сверки владельцу, спросить OK на `--apply`. После OK:

```bash
ssh dvolkov@212.113.106.202 'cd ~/spirits_back && npx ts-node scripts/backfill-chat-files.ts --apply'
```

Записать путь к журналу из вывода. Откат: `npx ts-node scripts/backfill-chat-files.ts --revert <журнал>`.

- [ ] **Step 4: Проверка на проде**

Агрегатом по истории, без чтения текстов:

```bash
ssh dvolkov@212.113.106.202 'psql "$(sed -n "s/^DATABASE_URL=//p" ~/spirits_back/.env | tail -n 1)" -X -A -c "SELECT count(*) FILTER (WHERE content ~ '"'"'linkeon-chat-files/'"'"') AS stored_msgs, count(*) FILTER (WHERE content ~ '"'"'r\\.linkeon\\.io/files/'"'"') AS relay_msgs FROM custom_chat_history WHERE sender_type = '"'"'ai'"'"'"'
```

Ожидание: `stored_msgs` около числа `updatedRows`, `relay_msgs` уменьшилось на столько же.

---

### Task 17: Зеркало на node-3 — ТОЛЬКО С OK ВЛАДЕЛЬЦА

**Files:** нет (прод-скрипт `~/backups/linkeon/minio-mirror.sh`, вне git).

Канал до node-3 — около 0,5 МБ/с, поэтому первая заливка `linkeon-assets` (1,5 ГиБ) идёт около часа. Если сразу вписать бакет в часовой список, cron запустит второй `mc mirror` поверх первого, а мониторинг час будет слать «бакет отстаёт». Поэтому сначала заливка вручную, потом список.

- [ ] **Step 1: Спросить владельца** — «Заливаю `linkeon-assets` и `linkeon-chat-files` на node-3 и добавляю их в часовое зеркало?»

- [ ] **Step 2: Первая заливка в фоне**

```bash
ssh dvolkov@212.113.106.202 'cd ~/backups/linkeon && nohup bash -c "mc mb --ignore-existing node3minio/linkeon-assets; mc mb --ignore-existing node3minio/linkeon-chat-files; mc mirror --overwrite --quiet prodminio/linkeon-assets node3minio/linkeon-assets; mc mirror --overwrite --quiet prodminio/linkeon-chat-files node3minio/linkeon-chat-files; echo seed-done" > seed-chat-files.log 2>&1 < /dev/null & echo started'
```

Готовность: `ssh dvolkov@212.113.106.202 'tail -2 ~/backups/linkeon/seed-chat-files.log; mc du node3minio/linkeon-assets; mc du prodminio/linkeon-assets'` — до `seed-done`, объекты сравнялись.

- [ ] **Step 3: Вписать бакеты в список — атомарно и не во время прогона**

Cron запускает зеркало в `:20` каждого часа. Править между `:30` и `:15`, предварительно убедившись, что прогон не идёт: `pgrep -f minio-mirror.sh || echo idle`. Править копией с заменой через `mv`, потому что bash дочитывает файл с диска.

```bash
ssh dvolkov@212.113.106.202 'cd ~/backups/linkeon && pgrep -f minio-mirror.sh && { echo "идёт прогон — позже"; exit 1; }; cp minio-mirror.sh minio-mirror.sh.bak-20261008 && sed "s/^BUCKETS=(linkeon-smm-videos linkeon-smm-music)$/BUCKETS=(linkeon-smm-videos linkeon-smm-music linkeon-assets linkeon-chat-files)/" minio-mirror.sh > minio-mirror.sh.new && grep -n "^BUCKETS=" minio-mirror.sh.new && bash -n minio-mirror.sh.new && chmod --reference=minio-mirror.sh minio-mirror.sh.new && mv minio-mirror.sh.new minio-mirror.sh'
```

Ожидание: строка `BUCKETS=(linkeon-smm-videos linkeon-smm-music linkeon-assets linkeon-chat-files)`.

- [ ] **Step 4: Проверить после ближайшего прогона**

После `:20` следующего часа:

```bash
ssh dvolkov@212.113.106.202 'cat ~/backups/linkeon/minio-mirror-status.json'
```

Ожидание: все четыре бакета с `"inSync":true`, `errors` пуст. В админке «Инфра» — зелёный MinIO DR.

---

### Task 18: Уборка

**Files:** нет.

- [ ] **Step 1: Удалить снапшот на релее** — только после задачи 16 на проде, сверившись с её отчётом и с OK владельца:

```bash
ssh dv@5.101.115.184 'rm -rf /home/dv/agent-output-snapshot-2026-10-08 && echo removed'
```

- [ ] **Step 2: Снять ворктри**

```bash
git -C ~/Downloads/spirits_back worktree remove .worktrees/chat-files-storage
ssh dv@85.192.61.231 'git -C ~/ci/spirits_back worktree remove --force ~/ci/wt/chat-files-storage'
```

- [ ] **Step 3: Обновить память**

В `project_relay_output_files_ephemeral.md` записать: снапшот удалён, перенос выполнен (`updatedRows`, путь журнала), новые файлы ходов живут в `linkeon-chat-files`.
