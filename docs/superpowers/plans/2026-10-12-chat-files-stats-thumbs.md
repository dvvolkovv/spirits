# «Медиа и файлы»: статистика и миниатюры — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** цифры использования панели «Медиа и файлы» и инструмента `find_files` в админке и лёгкие миниатюры картинок в панели вместо оригиналов по ~800 КБ.

**Architecture:**
- **Статистика.** События пишутся в общую таблицу `events`. Фронт шлёт их через `trackAuthed`, бэк — через `EventsService.track`. `ContentService` собирает из них блок `files`, а `MonitoringContentView` его рисует.
- **Миниатюры.** Бэк делает их по запросу (`GET /webhook/chat/thumb`) библиотекой `sharp` и кладёт в `linkeon-assets/thumbs/`. Повторные запросы получают редирект на готовую. При любом сбое ручка редиректит на оригинал.

**Tech Stack:** NestJS 10 + jest (spirits_back), React 18 + vitest (spirits_front), MinIO (S3 SDK), `sharp` 0.35.

Спека: `docs/superpowers/specs/2026-10-12-chat-files-stats-thumbs-design.md`.

---

## Как работать

**Ворктри (задача 0)** — на маке, от свежего `origin/main`:
- бэк: `~/Downloads/spirits_back/.worktrees/stats-thumbs`, ветка `feat/chat-files-stats-thumbs`;
- фронт: `~/Downloads/spirits_front/.worktrees/stats-thumbs-front`, ветка `feat/chat-files-stats-thumbs`.

**Сборки и тесты — только на тестовой ноде** (`dv@85.192.61.231`), в своих CI-ворктри. Мак тяжёлые прогоны не тянет (CLAUDE.md).

Запуск тестов бэка — закоммитить, запушить и прогнать на ноде:

```bash
B=~/Downloads/spirits_back/.worktrees/stats-thumbs
git -C $B push -q -u origin HEAD
SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "source ~/.nvm/nvm.sh >/dev/null; git -C ~/ci/spirits_back fetch -q origin && cd ~/ci/wt/stats-back && git checkout -q --detach $SHA && npx jest <ФАЙЛЫ>"
```

Запуск тестов фронта:

```bash
F=~/Downloads/spirits_front/.worktrees/stats-thumbs-front
git -C $F push -q -u origin HEAD
SHA=$(git -C $F rev-parse HEAD)
ssh dv@85.192.61.231 "source ~/.nvm/nvm.sh >/dev/null; git -C ~/ci/spirits_front fetch -q origin && cd ~/ci/wt/stats-front && git checkout -q --detach $SHA && pnpm install --frozen-lockfile >/dev/null 2>&1; npx vitest run <ФАЙЛЫ>"
```

SSH к ноде иногда рвётся на подключении (`Connection closed … port 22`). Тогда повторить через 20 секунд.

**Красный тест — это тест, упавший по делу.** Перед коммитом исправления убедиться, что тест падает на старом коде на нужной проверке, а не на импорте. Проверки вида `toThrow()` без сообщения или `indexOf(...) < X` проходят впустую, если проверяемого нет: сужать их до конкретного сообщения или требовать `> -1`.

**Не писать в исходниках escape-последовательности `\u` с кодом**: инструмент Write превращает их в невидимые символы. Управляющие символы проверять через `charCodeAt`.

---

## Карта файлов

Бэк (`spirits_back`):

| Файл | Что |
|---|---|
| `src/common/services/storage.service.ts` | + `head()`, `bucketStats()` |
| `src/chat/chat-files/thumbnails.ts` (новый) | проверка `src`, ключ миниатюры, путь для панели, `renderThumb` |
| `src/chat/chat-files/thumbnail.service.ts` (новый) | `ThumbnailService.resolve`: кеш, очередь, склейка одинаковых |
| `src/chat/chat-files/chat-thumb.controller.ts` (новый) | `GET /webhook/chat/thumb` |
| `src/chat/chat.module.ts` | регистрация контроллера и сервиса |
| `src/chat/chat-files/chat-files.service.ts` | `thumbPath` у картинок панели |
| `src/chat/chat-files/chat-file-store.ts` | события `chat_file_stored` / `chat_file_copy_failed`, `copyFailReason` |
| `src/chat/chat-files/relay-links.ts`, `src/chat/chat.service.ts`, `src/chat/chat.controller.ts` | `userId` до `persist` |
| `src/mcp/products-mcp.controller.ts` | событие `find_files_call` |
| `src/monitoring/product/chat-files-stats.ts` (новый) | `loadChatFilesStats` |
| `src/monitoring/product/content.service.ts` | блок `files` в обзоре |
| `package.json`, `package-lock.json` | `sharp` |

Фронт (`spirits_front`):

| Файл | Что |
|---|---|
| `src/components/chat/files/chatFiles.ts` | `thumbPath` в типе, `thumbUrlFor` |
| `src/components/chat/files/ChatFilesPanel.tsx` | плитка с миниатюрой, `onDownload` |
| `src/components/chat/files/MediaViewer.tsx` | `onDownload` |
| `src/components/chat/ChatInterface.tsx` | события открытия и скачивания |
| `src/components/admin/monitoring/Stat.tsx` (новый) | карточка цифры (вынесена из MonitoringContentView) |
| `src/components/admin/monitoring/MonitoringChatFilesSection.tsx` (новый) | секция «Медиа и файлы» |
| `src/components/admin/monitoring/MonitoringContentView.tsx` | тип `files`, секция |

---

### Task 0: Ворктри

- [ ] **Step 1: Ворктри на маке**

```bash
git -C ~/Downloads/spirits_back fetch -q origin
git -C ~/Downloads/spirits_back worktree add -q -b feat/chat-files-stats-thumbs ~/Downloads/spirits_back/.worktrees/stats-thumbs origin/main
git -C ~/Downloads/spirits_front fetch -q origin
git -C ~/Downloads/spirits_front worktree add -q -b feat/chat-files-stats-thumbs ~/Downloads/spirits_front/.worktrees/stats-thumbs-front origin/main
```

- [ ] **Step 2: CI-ворктри на ноде**

```bash
ssh dv@85.192.61.231 'git -C ~/ci/spirits_back fetch -q origin && git -C ~/ci/spirits_back worktree add -q --detach ~/ci/wt/stats-back origin/main && git -C ~/ci/spirits_front fetch -q origin && git -C ~/ci/spirits_front worktree add -q --detach ~/ci/wt/stats-front origin/main && echo ok'
ssh dv@85.192.61.231 'source ~/.nvm/nvm.sh >/dev/null; cd ~/ci/wt/stats-back && npm ci --no-audit --no-fund >/dev/null 2>&1 && echo back-deps; cd ~/ci/wt/stats-front && pnpm install --frozen-lockfile >/dev/null 2>&1 && echo front-deps'
```

Expected: `ok`, `back-deps`, `front-deps`.

---

### Task 1: `StorageService.head` и `bucketStats`

**Files:**
- Modify: `src/common/services/storage.service.ts`
- Test: `src/common/services/storage-head-stats.spec.ts` (новый)

- [ ] **Step 1: Тест**

```ts
// src/common/services/storage-head-stats.spec.ts
import { StorageService } from './storage.service';

const svcWith = (send: jest.Mock) => {
  const s = new StorageService();
  (s as any).s3 = { send };
  return s;
};

describe('StorageService.head', () => {
  it('отдаёт размер и тип', async () => {
    const s = svcWith(jest.fn().mockResolvedValue({ ContentLength: 1234, ContentType: 'image/png' }));
    expect(await s.head('b', 'k')).toEqual({ size: 1234, contentType: 'image/png' });
  });

  it('объекта нет — null', async () => {
    const err = Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
    expect(await svcWith(jest.fn().mockRejectedValue(err)).head('b', 'k')).toBeNull();
  });

  it('другая ошибка — бросает', async () => {
    const err = Object.assign(new Error('Access Denied.'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
    await expect(svcWith(jest.fn().mockRejectedValue(err)).head('b', 'k')).rejects.toThrow('Access Denied.');
  });
});

describe('StorageService.bucketStats', () => {
  it('суммирует все страницы списка', async () => {
    const send = jest.fn()
      .mockResolvedValueOnce({ Contents: [{ Size: 10 }, { Size: 20 }], IsTruncated: true, NextContinuationToken: 't2' })
      .mockResolvedValueOnce({ Contents: [{ Size: 5 }], IsTruncated: false });
    expect(await svcWith(send).bucketStats('b')).toEqual({ objects: 3, bytes: 35 });
    expect(send.mock.calls[1][0].input.ContinuationToken).toBe('t2');
  });

  it('пустой бакет — нули', async () => {
    expect(await svcWith(jest.fn().mockResolvedValue({ IsTruncated: false })).bucketStats('b')).toEqual({ objects: 0, bytes: 0 });
  });
});
```

- [ ] **Step 2: Прогнать — FAIL** (`s.head is not a function`). Команда — «Запуск тестов бэка», `<ФАЙЛЫ>` = `src/common/services/storage-head-stats.spec.ts`.

- [ ] **Step 3: Реализация** — в `storage.service.ts`:

В импорт из `@aws-sdk/client-s3` добавить `HeadObjectCommand`:

```ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
```

Перед `publicUrl(...)` добавить:

```ts
  /** Размер и тип объекта; null — объекта нет. Прочие ошибки MinIO бросает. */
  async head(bucket: string, key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const res = await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType };
    } catch (e: any) {
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  /** Сколько объектов и байт в бакете — постранично, весь бакет. */
  async bucketStats(bucket: string): Promise<{ objects: number; bytes: number }> {
    let objects = 0;
    let bytes = 0;
    let token: string | undefined;
    do {
      const res: any = await this.s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
      for (const o of res.Contents ?? []) {
        objects += 1;
        bytes += Number(o.Size ?? 0);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return { objects, bytes };
  }
```

- [ ] **Step 4: Прогнать — PASS** (5 тестов).

- [ ] **Step 5: Коммит**

```bash
git -C $B add src/common/services/storage.service.ts src/common/services/storage-head-stats.spec.ts
git -C $B commit -m "feat(storage): head и bucketStats"
```

---

### Task 2: `sharp` и чистые функции миниатюр

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/chat/chat-files/thumbnails.ts`
- Test: `src/chat/chat-files/thumbnails.spec.ts`

- [ ] **Step 1: Зависимость** — на маке обновить только lockfile (лёгкая операция), установка — на ноде:

```bash
cd ~/Downloads/spirits_back/.worktrees/stats-thumbs && npm install --package-lock-only --save sharp@^0.35.5 && git diff --stat package.json package-lock.json
```

Expected: в `package.json` в `dependencies` появилась `"sharp": "^0.35.5"`, lockfile изменён. Бэк ставится `npm ci`, а не pnpm (память: `project_back_npm_not_pnpm_stale_lockfile`).

- [ ] **Step 2: Тест**

```ts
// src/chat/chat-files/thumbnails.spec.ts
import sharp = require('sharp');
import { THUMB_SIZE, encodeKeyPath, parseThumbSrc, renderThumb, thumbKeyFor, thumbPathFor } from './thumbnails';

describe('parseThumbSrc', () => {
  it.each([
    ['linkeon-assets/images/1791472069716-j83id2.jpg', { bucket: 'linkeon-assets', key: 'images/1791472069716-j83id2.jpg' }],
    ['linkeon-chat-files/6eb9089f/кот на окне.PNG', { bucket: 'linkeon-chat-files', key: '6eb9089f/кот на окне.PNG' }],
  ])('пропускает %s', (src, want) => {
    expect(parseThumbSrc(src)).toEqual(want);
  });

  it.each([
    ['чужой бакет', 'linkeon-smm-videos/a.jpg'],
    ['аватары, а не сгенерированные', 'linkeon-assets/avatars/users/u.jpg'],
    ['сами миниатюры', 'linkeon-chat-files/thumbs/x.webp'],
    ['выход из папки', 'linkeon-chat-files/../linkeon-assets/images/a.jpg'],
    ['точка-сегмент', 'linkeon-assets/images/./a.jpg'],
    ['пустой сегмент', 'linkeon-assets/images//a.jpg'],
    ['ведущий слэш', '/linkeon-assets/images/a.jpg'],
    ['обратный слэш', 'linkeon-assets/images\\a.jpg'],
    ['не картинка', 'linkeon-chat-files/u/report.pdf'],
    ['svg', 'linkeon-chat-files/u/pic.svg'],
    ['управляющий символ', `linkeon-assets/images/a${String.fromCharCode(10)}.jpg`],
    ['без ключа', 'linkeon-assets'],
    ['слишком длинный', `linkeon-chat-files/${'a'.repeat(300)}.jpg`],
  ])('отклоняет: %s', (_n, src) => {
    expect(parseThumbSrc(src)).toBeNull();
  });

  it('не строка — null', () => {
    expect(parseThumbSrc(undefined)).toBeNull();
    expect(parseThumbSrc(['linkeon-assets/images/a.jpg'])).toBeNull();
  });
});

describe('thumbKeyFor', () => {
  it('один исходник — один ключ, без имени файла', () => {
    const s = { bucket: 'linkeon-chat-files', key: 'u/секретное имя.png' };
    expect(thumbKeyFor(s)).toBe(thumbKeyFor({ ...s }));
    expect(thumbKeyFor(s)).toMatch(/^thumbs\/[0-9a-f]{40}\.webp$/);
    expect(thumbKeyFor(s)).not.toBe(thumbKeyFor({ ...s, key: 'u/другое.png' }));
  });
});

describe('encodeKeyPath', () => {
  it('кодирует каждый сегмент, слэши оставляет', () => {
    expect(encodeKeyPath('u/кот (1).png')).toBe('u/%D0%BA%D0%BE%D1%82%20%281%29.png');
  });
});

describe('thumbPathFor', () => {
  const BASE = 'https://my.linkeon.io/smm-media';

  it('картинка из наших бакетов — путь ручки с раскодированным ключом', () => {
    expect(thumbPathFor(`${BASE}/linkeon-chat-files/u/%D0%BA%D0%BE%D1%82.png`, BASE))
      .toBe(`/webhook/chat/thumb?src=${encodeURIComponent('linkeon-chat-files/u/кот.png')}`);
  });

  it.each([
    ['чужой хост', 'https://evil.example/linkeon-assets/images/a.jpg'],
    ['наш хост, чужой бакет', `${BASE}/linkeon-smm-videos/a.jpg`],
    ['не картинка', `${BASE}/linkeon-chat-files/u/a.pdf`],
    ['нет адреса', undefined],
  ])('%s — без миниатюры', (_n, url) => {
    expect(thumbPathFor(url, BASE)).toBeUndefined();
  });
});

describe('renderThumb', () => {
  it('делает WebP 384×384 из большой картинки', async () => {
    const big = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#ff6600' } }).png().toBuffer();
    const thumb = await renderThumb(big);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([THUMB_SIZE, THUMB_SIZE]);
  });

  it('битые байты — ошибка', async () => {
    await expect(renderThumb(Buffer.from('не картинка'))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Коммит lockfile и теста, прогон с `npm ci` — FAIL** (`Cannot find module './thumbnails'`):

```bash
git -C $B add package.json package-lock.json src/chat/chat-files/thumbnails.spec.ts
git -C $B commit -m "test(thumbs): проверка src, ключ и путь миниатюры, renderThumb"
git -C $B push -q -u origin HEAD; SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "source ~/.nvm/nvm.sh >/dev/null; git -C ~/ci/spirits_back fetch -q origin && cd ~/ci/wt/stats-back && git checkout -q --detach $SHA && npm ci --no-audit --no-fund >/dev/null 2>&1 && node -e 'require(\"sharp\"); console.log(\"sharp ok\")' && npx jest src/chat/chat-files/thumbnails.spec.ts"
```

Expected: `sharp ok`, затем FAIL на импорте `./thumbnails`. Если `sharp` не загрузился — остановиться и разобраться с бинарём до дальнейших шагов.

- [ ] **Step 4: Реализация**

```ts
// src/chat/chat-files/thumbnails.ts
import { createHash } from 'crypto';
// export = sharp: без esModuleInterop только так (default-импорт дал бы undefined).
import sharp = require('sharp');
import { chatFilesBucket } from './chat-file-store';
import { encodeStrict, safeDecode } from './file-meta';

/**
 * Миниатюры картинок для панели «Медиа и файлы»
 * (docs/superpowers/specs/2026-10-12-chat-files-stats-thumbs-design.md, spirits_front).
 */

/** Сторона миниатюры, px: плитка панели ~130 px, экран ×3. */
export const THUMB_SIZE = 384;
/** Публичный бакет с анонимным GetObject и раздачей через /smm-media/ (CSP sandbox). */
export const THUMB_BUCKET = 'linkeon-assets';
export const THUMB_PREFIX = 'thumbs/';
/** Исходник больше — миниатюру не делаем, панель покажет оригинал. */
export const THUMB_MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Не больше стольких уменьшений одновременно на процесс. */
export const THUMB_CONCURRENCY = 2;
/** Дольше ждать очереди не стоит: отдаём оригинал. */
export const THUMB_QUEUE_WAIT_MS = 10_000;

const MAX_SRC_LENGTH = 300;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;

export interface ThumbSource {
  bucket: string;
  key: string;
}

const hasControlChars = (s: string) => [...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);

/**
 * Разбор `src` вида `<бакет>/<ключ>`. Разрешены только картинки наших бакетов:
 * сгенерированные (`linkeon-assets/images/…`) и файлы переписки
 * (`linkeon-chat-files/…`, кроме самих миниатюр). Адрес исходника бэк строит
 * сам из бакета и ключа, поэтому через ручку нельзя сходить на чужой хост или
 * во внутреннюю сеть.
 */
export function parseThumbSrc(src: unknown): ThumbSource | null {
  if (typeof src !== 'string' || src.length === 0 || src.length > MAX_SRC_LENGTH) return null;
  if (hasControlChars(src) || src.startsWith('/') || src.includes('\\')) return null;
  const slash = src.indexOf('/');
  if (slash <= 0) return null;
  const bucket = src.slice(0, slash);
  const key = src.slice(slash + 1);
  if (key.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return null;
  if (!IMAGE_EXT_RE.test(key)) return null;
  if (bucket === THUMB_BUCKET) {
    if (!key.startsWith('images/')) return null;
  } else if (bucket === chatFilesBucket()) {
    if (key.startsWith(THUMB_PREFIX)) return null;
  } else {
    return null;
  }
  return { bucket, key };
}

/** Ключ миниатюры: хеш исходника, без имени файла в адресе. */
export function thumbKeyFor(s: ThumbSource): string {
  return `${THUMB_PREFIX}${createHash('sha1').update(`${s.bucket}/${s.key}`).digest('hex')}.webp`;
}

/** Ключ для публичного адреса: каждый сегмент закодирован (в именах бывают пробелы, скобки, кириллица). */
export function encodeKeyPath(key: string): string {
  return key.split('/').map(encodeStrict).join('/');
}

/**
 * Путь ручки миниатюры для картинки панели, если картинка лежит в наших
 * разрешённых бакетах; иначе undefined — панель покажет оригинал.
 */
export function thumbPathFor(url: string | undefined, publicBaseUrl: string): string | undefined {
  if (!url || !publicBaseUrl || !url.startsWith(`${publicBaseUrl}/`)) return undefined;
  const rest = url.slice(publicBaseUrl.length + 1).split(/[?#]/)[0];
  const src = rest.split('/').map(safeDecode).join('/');
  return parseThumbSrc(src) ? `/webhook/chat/thumb?src=${encodeURIComponent(src)}` : undefined;
}

/** WebP 384×384 с обрезкой по центру; поворот по EXIF; у анимированного GIF — первый кадр. */
export async function renderThumb(source: Buffer): Promise<Buffer> {
  return sharp(source, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
    .webp({ quality: 70 })
    .toBuffer();
}
```

- [ ] **Step 5: Прогнать — PASS.** Затем `npx tsc --noEmit -p tsconfig.build.json` на ноде — без ошибок.

- [ ] **Step 6: Коммит**

```bash
git -C $B add src/chat/chat-files/thumbnails.ts
git -C $B commit -m "feat(thumbs): проверка src, ключ миниатюры и путь для панели, renderThumb на sharp"
```

---

### Task 3: `ThumbnailService`

**Files:**
- Create: `src/chat/chat-files/thumbnail.service.ts`
- Test: `src/chat/chat-files/thumbnail.service.spec.ts`

- [ ] **Step 1: Тест**

```ts
// src/chat/chat-files/thumbnail.service.spec.ts
import sharp = require('sharp');
import { ThumbnailService } from './thumbnail.service';
import { THUMB_BUCKET, thumbKeyFor } from './thumbnails';

const SRC = { bucket: 'linkeon-chat-files', key: 'u/a.png' };
let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#3366ff' } }).png().toBuffer();
});

function fakeStorage(opts: { thumbExists?: boolean; sourceSize?: number; sourceMissing?: boolean; downloadDelayMs?: number } = {}) {
  const uploads: any[] = [];
  let downloading = 0;
  let maxDownloading = 0;
  const storage = {
    publicUrl: (b: string, k: string) => `https://pub/${b}/${k}`,
    head: jest.fn(async (b: string, k: string) => {
      if (b === THUMB_BUCKET && k.startsWith('thumbs/')) return opts.thumbExists ? { size: 10 } : null;
      return opts.sourceMissing ? null : { size: opts.sourceSize ?? PNG.length };
    }),
    download: jest.fn(async () => {
      downloading++;
      maxDownloading = Math.max(maxDownloading, downloading);
      if (opts.downloadDelayMs) await new Promise((r) => setTimeout(r, opts.downloadDelayMs));
      downloading--;
      return PNG;
    }),
    upload: jest.fn(async (u: any) => {
      uploads.push(u);
      return `https://pub/${u.bucket}/${u.key}`;
    }),
  };
  return { storage, uploads, maxDownloading: () => maxDownloading };
}

const thumbUrl = (s = SRC) => `https://pub/${THUMB_BUCKET}/${thumbKeyFor(s)}`;

describe('ThumbnailService.resolve', () => {
  it('миниатюра уже есть — адрес без скачивания исходника', async () => {
    const { storage } = fakeStorage({ thumbExists: true });
    expect(await new ThumbnailService(storage as any).resolve(SRC)).toBe(thumbUrl());
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('миниатюры нет — делает WebP и кладёт в бакет', async () => {
    const { storage, uploads } = fakeStorage();
    expect(await new ThumbnailService(storage as any).resolve(SRC)).toBe(thumbUrl());
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({ bucket: THUMB_BUCKET, key: thumbKeyFor(SRC), contentType: 'image/webp' });
    expect((await sharp(uploads[0].body).metadata()).format).toBe('webp');
  });

  it('второй запрос — из памяти, без похода в MinIO', async () => {
    const { storage } = fakeStorage();
    const svc = new ThumbnailService(storage as any);
    await svc.resolve(SRC);
    storage.head.mockClear();
    await svc.resolve(SRC);
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('исходник больше 25 МБ — отказ без скачивания', async () => {
    const { storage } = fakeStorage({ sourceSize: 26 * 1024 * 1024 });
    await expect(new ThumbnailService(storage as any).resolve(SRC)).rejects.toThrow(/больше/);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('исходника нет — отказ', async () => {
    const { storage } = fakeStorage({ sourceMissing: true });
    await expect(new ThumbnailService(storage as any).resolve(SRC)).rejects.toThrow('исходника нет');
  });

  it('одинаковые запросы в полёте — одна работа', async () => {
    const { storage } = fakeStorage({ downloadDelayMs: 30 });
    const svc = new ThumbnailService(storage as any);
    await Promise.all([svc.resolve(SRC), svc.resolve(SRC), svc.resolve(SRC)]);
    expect(storage.download).toHaveBeenCalledTimes(1);
  });

  it('не больше двух уменьшений разом', async () => {
    const f = fakeStorage({ downloadDelayMs: 30 });
    const svc = new ThumbnailService(f.storage as any);
    await Promise.all([1, 2, 3, 4, 5].map((i) => svc.resolve({ bucket: 'linkeon-chat-files', key: `u/${i}.png` })));
    expect(f.storage.download).toHaveBeenCalledTimes(5);
    expect(f.maxDownloading()).toBe(2);
  });

  it('очередь дольше срока — отказ, а не вечное ожидание', async () => {
    const f = fakeStorage({ downloadDelayMs: 200 });
    const svc = new ThumbnailService(f.storage as any);
    const runs = [1, 2, 3].map((i) => svc.resolve({ bucket: 'linkeon-chat-files', key: `u/${i}.png` }, 50));
    const results = await Promise.allSettled(runs);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Прогнать — FAIL** (`Cannot find module './thumbnail.service'`).

- [ ] **Step 3: Реализация**

```ts
// src/chat/chat-files/thumbnail.service.ts
import { Injectable } from '@nestjs/common';
import { StorageService } from '../../common/services/storage.service';
import {
  THUMB_BUCKET,
  THUMB_CONCURRENCY,
  THUMB_MAX_SOURCE_BYTES,
  THUMB_QUEUE_WAIT_MS,
  ThumbSource,
  renderThumb,
  thumbKeyFor,
} from './thumbnails';

/** Сколько ключей «миниатюра уже есть» помнить; дальше память начинается заново. */
const KNOWN_LIMIT = 5000;

/** Места под уменьшение: в очереди не дольше waitMs, потом отказ. */
class Slots {
  private busy = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  acquire(waitMs: number): Promise<() => void> {
    if (this.busy < this.limit) {
      this.busy++;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer);
        resolve(this.releaser());
      };
      const timer = setTimeout(() => {
        const i = this.waiting.indexOf(grant);
        if (i >= 0) this.waiting.splice(i, 1);
        reject(new Error(`очередь на миниатюру дольше ${waitMs} мс`));
      }, waitMs);
      this.waiting.push(grant);
    });
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      // Место переходит следующему как есть: busy не меняется.
      const next = this.waiting.shift();
      if (next) next();
      else this.busy--;
    };
  }
}

/**
 * Миниатюры по запросу: первая — уменьшение и загрузка в бакет, дальше —
 * готовый адрес. Бросает при любой неудаче; ручка тогда отдаёт оригинал.
 */
@Injectable()
export class ThumbnailService {
  private readonly slots = new Slots(THUMB_CONCURRENCY);
  private readonly known = new Set<string>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(private readonly storage: StorageService) {}

  async resolve(src: ThumbSource, waitMs: number = THUMB_QUEUE_WAIT_MS): Promise<string> {
    const key = thumbKeyFor(src);
    const url = this.storage.publicUrl(THUMB_BUCKET, key);
    if (this.known.has(key)) return url;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const work = this.make(src, key, url, waitMs).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  private async make(src: ThumbSource, key: string, url: string, waitMs: number): Promise<string> {
    if (await this.storage.head(THUMB_BUCKET, key)) {
      this.remember(key);
      return url;
    }
    const release = await this.slots.acquire(waitMs);
    try {
      const meta = await this.storage.head(src.bucket, src.key);
      if (!meta) throw new Error('исходника нет');
      if (meta.size > THUMB_MAX_SOURCE_BYTES) throw new Error(`исходник больше ${THUMB_MAX_SOURCE_BYTES} байт`);
      const body = await this.storage.download({ bucket: src.bucket, key: src.key });
      const thumb = await renderThumb(body);
      await this.storage.upload({
        bucket: THUMB_BUCKET,
        key,
        body: thumb,
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      });
      this.remember(key);
      return url;
    } finally {
      release();
    }
  }

  private remember(key: string): void {
    if (this.known.size >= KNOWN_LIMIT) this.known.clear();
    this.known.add(key);
  }
}
```

- [ ] **Step 4: Прогнать — PASS** (8 тестов).

- [ ] **Step 5: Коммит**

```bash
git -C $B add src/chat/chat-files/thumbnail.service.ts src/chat/chat-files/thumbnail.service.spec.ts
git -C $B commit -m "feat(thumbs): ThumbnailService — кеш, очередь на два места, склейка одинаковых"
```

---

### Task 4: Ручка `GET /webhook/chat/thumb`

**Files:**
- Create: `src/chat/chat-files/chat-thumb.controller.ts`
- Modify: `src/chat/chat.module.ts`
- Test: `src/chat/chat-files/chat-thumb.controller.spec.ts`

- [ ] **Step 1: Тест**

```ts
// src/chat/chat-files/chat-thumb.controller.spec.ts
import * as fs from 'fs';
import * as path from 'path';
import { ChatThumbController } from './chat-thumb.controller';

function mockRes() {
  const res: any = { headers: {} as Record<string, string> };
  res.status = jest.fn((c: number) => { res._status = c; return res; });
  res.json = jest.fn((b: any) => { res._body = b; return res; });
  res.setHeader = jest.fn((k: string, v: string) => { res.headers[k] = v; });
  res.redirect = jest.fn((c: number, u: string) => { res._status = c; res._location = u; return res; });
  return res;
}
const storage = { publicUrl: (b: string, k: string) => `https://pub/${b}/${k}` };

describe('GET /webhook/chat/thumb', () => {
  it('неправильный src — 400, миниатюру не делает', async () => {
    const thumbs = { resolve: jest.fn() };
    const res = mockRes();
    await new ChatThumbController(thumbs as any, storage as any).thumb('linkeon-smm-videos/a.jpg', res);
    expect(res._status).toBe(400);
    expect(thumbs.resolve).not.toHaveBeenCalled();
  });

  it('миниатюра готова — 302 на неё, кеш на сутки', async () => {
    const thumbs = { resolve: jest.fn(async () => 'https://pub/linkeon-assets/thumbs/x.webp') };
    const res = mockRes();
    await new ChatThumbController(thumbs as any, storage as any).thumb('linkeon-assets/images/a.jpg', res);
    expect(res._status).toBe(302);
    expect(res._location).toBe('https://pub/linkeon-assets/thumbs/x.webp');
    expect(res.headers['Cache-Control']).toBe('public, max-age=86400');
  });

  it('сбой — 302 на оригинал с закодированным ключом и без кеша', async () => {
    const thumbs = { resolve: jest.fn(async () => { throw new Error('исходника нет'); }) };
    const res = mockRes();
    await new ChatThumbController(thumbs as any, storage as any).thumb('linkeon-chat-files/u/кот (1).png', res);
    expect(res._status).toBe(302);
    expect(res._location).toBe('https://pub/linkeon-chat-files/u/%D0%BA%D0%BE%D1%82%20%281%29.png');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('ручка открыта без входа: на ней нет JwtGuard', () => {
    const src = fs.readFileSync(path.join(__dirname, 'chat-thumb.controller.ts'), 'utf8');
    expect(src).not.toContain('UseGuards');
  });

  it('контроллер и сервис зарегистрированы в ChatModule', () => {
    const mod = fs.readFileSync(path.join(__dirname, '..', 'chat.module.ts'), 'utf8');
    expect(mod).toMatch(/controllers: \[[^\]]*ChatThumbController/);
    expect(mod).toMatch(/providers: \[[^\]]*ThumbnailService/);
  });
});
```

- [ ] **Step 2: Прогнать — FAIL** (`Cannot find module './chat-thumb.controller'`).

- [ ] **Step 3: Контроллер**

```ts
// src/chat/chat-files/chat-thumb.controller.ts
import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../../common/services/storage.service';
import { ThumbnailService } from './thumbnail.service';
import { encodeKeyPath, parseThumbSrc } from './thumbnails';

/**
 * Миниатюра картинки для панели «Медиа и файлы». Без входа: `<img>` не умеет
 * слать токен, а исходники и так открыты по точной ссылке. При любом сбое —
 * редирект на оригинал: плитка покажет картинку как раньше, только тяжелее.
 */
@Controller('chat/thumb')
export class ChatThumbController {
  private readonly logger = new Logger(ChatThumbController.name);

  constructor(
    private readonly thumbs: ThumbnailService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async thumb(@Query('src') raw: string | undefined, @Res() res: Response) {
    const src = parseThumbSrc(raw);
    if (!src) return res.status(400).json({ error: 'bad src' });
    try {
      const location = await this.thumbs.resolve(src);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.redirect(302, location);
    } catch (e: any) {
      this.logger.warn(`thumb: отдаю оригинал ${src.bucket}/${src.key}: ${e?.message || e}`);
      // Без кеша: следующий показ попробует миниатюру снова.
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, this.storage.publicUrl(src.bucket, encodeKeyPath(src.key)));
    }
  }
}
```

- [ ] **Step 4: Регистрация** — в `src/chat/chat.module.ts` добавить импорты и вписать в списки:

```ts
import { ChatThumbController } from './chat-files/chat-thumb.controller';
import { ThumbnailService } from './chat-files/thumbnail.service';
```

```ts
  controllers: [ChatController, ChatFilesController, ChatThumbController],
  providers: [ChatService, ChatToolsService, ChatFileStore, ChatFilesService, ThumbnailService],
```

- [ ] **Step 5: Прогнать — PASS** (5 тестов) и `npx tsc --noEmit -p tsconfig.build.json` — без ошибок.

- [ ] **Step 6: Коммит**

```bash
git -C $B add src/chat/chat-files/chat-thumb.controller.ts src/chat/chat-files/chat-thumb.controller.spec.ts src/chat/chat.module.ts
git -C $B commit -m "feat(thumbs): GET /webhook/chat/thumb — редирект на миниатюру, при сбое на оригинал"
```

---

### Task 5: `thumbPath` у картинок панели

**Files:**
- Modify: `src/chat/chat-files/chat-files.service.ts`
- Test: `src/chat/chat-files/chat-files-thumbs.spec.ts` (новый)

- [ ] **Step 1: Тест**

```ts
// src/chat/chat-files/chat-files-thumbs.spec.ts
import { ChatFilesService } from './chat-files.service';

const BASE = 'https://my.linkeon.io/smm-media';
const saved = process.env.MINIO_PUBLIC_URL;
beforeAll(() => { process.env.MINIO_PUBLIC_URL = BASE; });
afterAll(() => { process.env.MINIO_PUBLIC_URL = saved; });

describe('GET /webhook/chat/files: миниатюры', () => {
  it('картинке из нашего бакета — thumbPath, документу и чужой картинке — нет', async () => {
    const content = [
      `![кот](${BASE}/linkeon-assets/images/1791472069716-j83id2.jpg)`,
      `[Скачать отчёт.pdf](${BASE}/linkeon-chat-files/u/report.pdf)`,
      '![чужая](https://evil.example/x.jpg)',
    ].join('\n');
    const pg = { query: jest.fn(async () => ({ rows: [{ id: 1, content, created_at: '2026-10-10T10:00:00Z' }] })) };
    const items = await new ChatFilesService(pg as any).listForSession('u-1', 'u-1_12');

    const image = items.find((i) => i.url?.endsWith('/images/1791472069716-j83id2.jpg'));
    expect(image?.thumbPath).toBe(`/webhook/chat/thumb?src=${encodeURIComponent('linkeon-assets/images/1791472069716-j83id2.jpg')}`);
    expect(items.find((i) => i.url?.endsWith('/report.pdf'))?.thumbPath).toBeUndefined();
    expect(items.find((i) => i.url?.includes('evil.example'))?.thumbPath).toBeUndefined();
  });
});
```

- [ ] **Step 2: Прогнать — FAIL** (у картинки `thumbPath` undefined).

- [ ] **Step 3: Реализация** — в `chat-files.service.ts`:

Импорт:

```ts
import { thumbPathFor } from './thumbnails';
```

В `interface ChatFileItem` после `thumbUrl?: string;`:

```ts
  /** Только у картинок из наших бакетов: путь ручки миниатюры (thumbnails.ts), фронт достраивает его от своего бэкенда. */
  thumbPath?: string;
```

Перед `@Injectable() export class ChatFilesService`:

```ts
/** Миниатюра — только картинкам из наших разрешённых бакетов. */
function withThumb(item: ChatFileItem, publicBaseUrl: string): ChatFileItem {
  if (item.kind !== 'image') return item;
  const thumbPath = thumbPathFor(item.url, publicBaseUrl);
  return thumbPath ? { ...item, thumbPath } : item;
}
```

`listForSession` целиком:

```ts
  /** Файлы одной переписки, от новых к старым. */
  async listForSession(userId: string, sessionId: string): Promise<ChatFileItem[]> {
    const env = extractEnv();
    const { rows } = await this.pg.query(SESSION_FILES_SQL, [sessionId]);
    const items = await this.resolve(userId, collectFiles(rows, env));
    return items.map(({ item }) => withThumb(item, env.publicBaseUrl));
  }
```

- [ ] **Step 4: Прогнать — PASS**, вместе со старыми тестами папки: `<ФАЙЛЫ>` = `src/chat/chat-files`.

- [ ] **Step 5: Коммит**

```bash
git -C $B add src/chat/chat-files/chat-files.service.ts src/chat/chat-files/chat-files-thumbs.spec.ts
git -C $B commit -m "feat(chat-files): thumbPath у картинок панели из наших бакетов"
```

---

### Task 6: События копирования файлов хода

**Files:**
- Modify: `src/chat/chat-files/chat-file-store.ts`, `src/chat/chat-files/relay-links.ts`, `src/chat/chat.service.ts`, `src/chat/chat.controller.ts`
- Test: `src/chat/chat-files/chat-file-store-events.spec.ts` (новый)

- [ ] **Step 1: Тест**

```ts
// src/chat/chat-files/chat-file-store-events.spec.ts
import * as fs from 'fs';
import * as path from 'path';
import { ChatFileStore, copyFailReason } from './chat-file-store';
import { storeRelayLinks } from './relay-links';

describe('copyFailReason', () => {
  it.each([
    ['Access Denied.', 'access_denied'],
    ['ответ больше допустимого (104857600 байт)', 'too_large'],
    ['сервер ответил кодом 404', 'not_found'],
    ['превышено время ожидания (30 с)', 'timeout'],
    ['бюджет хода исчерпан', 'timeout'],
    ['копия не уложилась в свои сроки — место отдано другим', 'timeout'],
    ['соединение оборвалось', 'other'],
  ])('%s → %s', (msg, want) => {
    expect(copyFailReason(new Error(msg))).toBe(want);
  });
});

describe('ChatFileStore.persist: события для статистики', () => {
  const make = () => {
    const events = { track: jest.fn() };
    const store = new ChatFileStore({} as any, events as any);
    jest.spyOn(store, 'persistOne')
      .mockResolvedValueOnce('https://pub/linkeon-chat-files/x/a.pdf')
      .mockRejectedValueOnce(new Error('сервер ответил кодом 404'));
    return { store, events };
  };
  const URLS = ['https://r.linkeon.io/files/k/a.pdf', 'https://r.linkeon.io/files/k/b.pdf'];

  it('с владельцем хода — chat_file_stored и chat_file_copy_failed с причиной', async () => {
    const { store, events } = make();
    await store.persist(URLS, { userId: 'u-1' });
    expect(events.track).toHaveBeenCalledWith('chat_file_stored', { userId: 'u-1' });
    expect(events.track).toHaveBeenCalledWith('chat_file_copy_failed', { userId: 'u-1', props: { reason: 'not_found' } });
  });

  it('без владельца (перенос старых файлов) — событий нет', async () => {
    const { store, events } = make();
    await store.persist(URLS);
    expect(events.track).not.toHaveBeenCalled();
  });
});

describe('владелец хода доходит до persist', () => {
  it('storeRelayLinks передаёт userId вместе с бюджетом', async () => {
    const store = { persist: jest.fn(async () => new Map<string, string>()) };
    await storeRelayLinks(['[Скачать a.pdf](https://r.linkeon.io/files/k/a.pdf)'], 'https://r.linkeon.io', store, () => {}, { budgetMs: 5000, userId: 'u-1' });
    expect(store.persist).toHaveBeenCalledWith(['https://r.linkeon.io/files/k/a.pdf'], { budgetMs: 5000, userId: 'u-1' });
  });

  it('chat.service и ручка загрузки передают userId', () => {
    const svc = fs.readFileSync(path.join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'chat.controller.ts'), 'utf8');
    expect(svc.match(/this\.storeRelayLinks\([\s\S]{0,160}?userId \}/g) ?? []).toHaveLength(2);
    expect(ctrl).toMatch(/this\.chatService\.storeRelayLinks\([^;]*\{ userId \}\)/);
  });
});
```

- [ ] **Step 2: Прогнать — FAIL** (`copyFailReason is not a function`, событий нет).

- [ ] **Step 3: `chat-file-store.ts`**

Импорты: `Injectable, Logger` → `Injectable, Logger, Optional`; добавить:

```ts
import { EventsService } from '../../events/events.service';
```

В `interface PersistOptions` добавить поле:

```ts
  /**
   * Владелец хода. С ним пишутся события chat_file_stored / chat_file_copy_failed
   * (статистика админки). Перенос старых файлов его не передаёт и цифры не трогает.
   */
  userId?: string;
```

После `export function chatFilesBucket()` добавить:

```ts
export type CopyFailReason = 'timeout' | 'access_denied' | 'too_large' | 'not_found' | 'other';

/** Причина сбоя копии для статистики — по тексту ошибки (safe-fetch, MinIO, наши сроки). */
export function copyFailReason(e: unknown): CopyFailReason {
  const msg = String((e as any)?.message ?? e ?? '');
  if (/Access Denied/i.test(msg)) return 'access_denied';
  if (/ответ больше допустимого/.test(msg)) return 'too_large';
  if (/кодом 404/.test(msg)) return 'not_found';
  if (/превышено время|бюджет хода|не уложилась в свои сроки|aborted|timeout/i.test(msg)) return 'timeout';
  return 'other';
}
```

Конструктор:

```ts
  constructor(
    private readonly storage: StorageService,
    @Optional() private readonly events?: EventsService,
  ) {}
```

В `persist`, в `worker`, заменить блок `try { … } catch (e: any) { … }`:

```ts
        try {
          const stored = await this.persistOne(url, { fileTimeoutMs, deadline, signal: turn.signal });
          if (!turn.signal.aborted) {
            out.set(url, stored);
            if (opts.userId) this.events?.track('chat_file_stored', { userId: opts.userId });
          }
        } catch (e: any) {
          this.logger.warn(`chat-files: не скопирован ${url}: ${e?.message || e}`);
          if (opts.userId) {
            this.events?.track('chat_file_copy_failed', { userId: opts.userId, props: { reason: copyFailReason(e) } });
          }
        }
```

- [ ] **Step 4: `relay-links.ts`** — тип `opts` в `storeRelayLinks`:

```ts
  opts?: { budgetMs?: number; userId?: string },
```

(в комментарий над параметром дописать: «userId — владелец хода, для статистики сохранения файлов».)

- [ ] **Step 5: `chat.service.ts`**

Сигнатура обёртки (строка `storeRelayLinks(lines: string[], agentUrl: string, opts?: …)`):

```ts
  storeRelayLinks(lines: string[], agentUrl: string, opts?: { budgetMs?: number; userId?: string }): Promise<string[]> {
```

Два вызова в `streamUniversalAgent` (где `userId` — параметр метода):

```ts
      const lines = await this.storeRelayLinks(
        outputFileLines(pendingFiles, AGENT_URL),
        AGENT_URL,
        { budgetMs: budgetForFilesCall(), userId },
      );
```

```ts
            const tail = '\n\n' + (await this.storeRelayLinks(
              resolved, AGENT_URL, { budgetMs: budgetForFilesCall(), userId },
            )).join('\n');
```

- [ ] **Step 6: `chat.controller.ts`** — в `uploadAndChat` (`userId` уже есть в области видимости, `string`):

```ts
          const lines = await this.chatService.storeRelayLinks(outputFileLines(pendingFiles, AGENT_URL), AGENT_URL, { userId });
```

- [ ] **Step 7: Прогнать — PASS**, затем вся папка `src/chat` и `npx tsc --noEmit -p tsconfig.build.json`.

- [ ] **Step 8: Коммит**

```bash
git -C $B add src/chat/chat-files/chat-file-store.ts src/chat/chat-files/relay-links.ts src/chat/chat.service.ts src/chat/chat.controller.ts src/chat/chat-files/chat-file-store-events.spec.ts
git -C $B commit -m "feat(chat-files): события сохранения файлов хода для статистики"
```

---

### Task 7: Событие `find_files_call`

**Files:**
- Modify: `src/mcp/products-mcp.controller.ts`
- Test: `src/mcp/find-files-event.spec.ts` (новый)

- [ ] **Step 1: Тест**

```ts
// src/mcp/find-files-event.spec.ts
import { ProductsMcpController } from './products-mcp.controller';
import { signProductToolToken } from '../products/product-tool.token';

process.env.JWT_SECRET = 'find-files-event-spec';

describe('find_files: событие для статистики', () => {
  it('владелец и канал — из токена, а не из аргументов модели; найдено и можно скачать', async () => {
    const files = {
      searchForUser: jest.fn(async () => ({ ok: true, total: 3, files: [{ stored: true }, { stored: false }, { stored: true }] })),
    };
    const events = { track: jest.fn() };
    const ctrl = new ProductsMcpController({} as any, files as any, events as any);
    await ctrl.callTool(`Bearer ${signProductToolToken('u-1')}`, { query: 'кот', userId: 'чужой' }, 'find_files');
    expect(events.track).toHaveBeenCalledWith('find_files_call', {
      userId: 'u-1',
      props: { channel: 'web', found: 3, stored: 2 },
    });
  });

  it('другие инструменты события не пишут', async () => {
    const tool = { execute: jest.fn(async () => ({ ok: true })) };
    const events = { track: jest.fn() };
    const ctrl = new ProductsMcpController(tool as any, {} as any, events as any);
    await ctrl.callTool(`Bearer ${signProductToolToken('u-1')}`, { action: 'list' }, 'manage_product');
    expect(events.track).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Прогнать — FAIL** (`events.track` не вызван).

- [ ] **Step 3: Реализация** — в `products-mcp.controller.ts`:

В импорт из `@nestjs/common` добавить `Optional`; добавить:

```ts
import { EventsService } from '../events/events.service';
```

Конструктор:

```ts
  constructor(
    private readonly tool: ProductToolService,
    private readonly files: ChatFilesService,
    @Optional() private readonly events?: EventsService,
  ) {}
```

В `callTool` заменить строку с `FIND_FILES_TOOL_NAME`:

```ts
    if (name === FIND_FILES_TOOL_NAME) {
      const result = await this.files.searchForUser(userId, parseFindFilesInput(input));
      // Статистика админки: сколько отдали модели и сколько из этого можно скачать.
      this.events?.track('find_files_call', {
        userId,
        props: { channel, found: result.files.length, stored: result.files.filter((f) => f.stored).length },
      });
      return result;
    }
```

- [ ] **Step 4: Прогнать — PASS**, вместе со старым `src/mcp/products-mcp.controller.spec.ts`.

- [ ] **Step 5: Коммит**

```bash
git -C $B add src/mcp/products-mcp.controller.ts src/mcp/find-files-event.spec.ts
git -C $B commit -m "feat(find-files): событие find_files_call для статистики"
```

---

### Task 8: Блок `files` в обзоре контента

**Files:**
- Create: `src/monitoring/product/chat-files-stats.ts`
- Modify: `src/monitoring/product/content.service.ts`
- Test: `src/monitoring/product/chat-files-stats.spec.ts`

- [ ] **Step 1: Тест**

```ts
// src/monitoring/product/chat-files-stats.spec.ts
import { __resetBucketCacheForTests, loadChatFilesStats } from './chat-files-stats';
import { excludedUsers, TEST_USER_PATTERN } from '../../common/test-users';

const ROW = {
  opens: 5, users: 3, downloads: 4, dl_image: 2, dl_document: 1, dl_video: 0, dl_audio: 1,
  ff_calls: 6, ff_found: 4, ff_stored: 3, stored: 10, failed: 2,
};

function pgWith(rows: any[][]) {
  const calls: { sql: string; params: any[] }[] = [];
  let i = 0;
  return {
    calls,
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: rows[i++] ?? [] };
    }),
  };
}

beforeEach(() => __resetBucketCacheForTests());

describe('loadChatFilesStats', () => {
  it('собирает блок из событий и объёма бакета', async () => {
    const pg = pgWith([[ROW], [{ reason: 'timeout', n: 2 }]]);
    const storage = { bucketStats: jest.fn(async () => ({ objects: 601, bytes: 324009984 })) };
    expect(await loadChatFilesStats(pg as any, storage as any, '30d', '30 days')).toEqual({
      panel: { opens: 5, users: 3 },
      downloads: { total: 4, byKind: { image: 2, document: 1, video: 0, audio: 1 } },
      findFiles: { calls: 6, withResults: 4, withStored: 3 },
      storage: { stored: 10, failed: 2, topFailReason: 'timeout', bucketObjects: 601, bucketBytes: 324009984 },
    });
  });

  it('тестовые аккаунты и окно — в параметрах запроса', async () => {
    const pg = pgWith([[ROW], []]);
    await loadChatFilesStats(pg as any, undefined, '7d', '7 days');
    const { sql, params } = pg.calls[0];
    expect(sql).toContain('<> ALL($3::text[])');
    expect(sql).toContain('!~ $4');
    expect(params.slice(0, 4)).toEqual(['7d', '7 days', excludedUsers(), TEST_USER_PATTERN]);
  });

  it('MinIO не ответил — объём null, остальное на месте', async () => {
    const pg = pgWith([[ROW], []]);
    const storage = { bucketStats: jest.fn(async () => { throw new Error('Access Denied.'); }) };
    const s = await loadChatFilesStats(pg as any, storage as any, '30d', '30 days');
    expect(s?.storage).toMatchObject({ bucketObjects: null, bucketBytes: null, stored: 10, topFailReason: null });
  });

  it('объём бакета кешируется на 5 минут', async () => {
    const storage = { bucketStats: jest.fn(async () => ({ objects: 1, bytes: 2 })) };
    await loadChatFilesStats(pgWith([[ROW], []]) as any, storage as any, '30d', '30 days');
    await loadChatFilesStats(pgWith([[ROW], []]) as any, storage as any, '7d', '7 days');
    expect(storage.bucketStats).toHaveBeenCalledTimes(1);
  });

  it('база не ответила — null, а не ошибка обзора', async () => {
    const pg = { query: jest.fn(async () => { throw new Error('ECONNREFUSED'); }) };
    expect(await loadChatFilesStats(pg as any, undefined, '30d', '30 days')).toBeNull();
  });

  it('мусор в props (ручка событий анонимная) не роняет подсчёт', async () => {
    const pg = pgWith([[ROW], []]);
    await loadChatFilesStats(pg as any, undefined, '30d', '30 days');
    // Сравнение текстом, без ::int: props->>'found' = 'abc' не должен ломать запрос.
    expect(pg.calls[0].sql).not.toMatch(/props->>'(found|stored)'\)::int/);
  });
});
```

- [ ] **Step 2: Прогнать — FAIL** (`Cannot find module './chat-files-stats'`).

- [ ] **Step 3: Реализация**

```ts
// src/monitoring/product/chat-files-stats.ts
import { PgService } from '../../common/services/pg.service';
import { StorageService } from '../../common/services/storage.service';
import { excludedUsers, TEST_USER_PATTERN } from '../../common/test-users';
import { chatFilesBucket } from '../../chat/chat-files/chat-file-store';

/**
 * «Медиа и файлы» в блоке «Контент» админки: панель, поиск файлов,
 * хранилище. Только агрегаты, без ленты по людям.
 */
export interface ChatFilesStats {
  panel: { opens: number; users: number };
  downloads: { total: number; byKind: Record<'image' | 'document' | 'video' | 'audio', number> };
  findFiles: { calls: number; withResults: number; withStored: number };
  storage: {
    stored: number;
    failed: number;
    topFailReason: string | null;
    /** null — MinIO не ответил. */
    bucketObjects: number | null;
    bucketBytes: number | null;
  };
}

export const CHAT_FILES_EVENTS = [
  'chat_files_panel_open', 'chat_files_download', 'find_files_call', 'chat_file_stored', 'chat_file_copy_failed',
];

const BUCKET_TTL_MS = 5 * 60_000;
let bucketCache: { at: number; value: { objects: number; bytes: number } | null } | null = null;

/** Только для тестов. */
export function __resetBucketCacheForTests(): void {
  bucketCache = null;
}

async function cachedBucketStats(storage?: Pick<StorageService, 'bucketStats'>) {
  if (!storage) return null;
  if (bucketCache && Date.now() - bucketCache.at < BUCKET_TTL_MS) return bucketCache.value;
  let value: { objects: number; bytes: number } | null = null;
  try {
    value = await storage.bucketStats(chatFilesBucket());
  } catch {
    value = null;
  }
  bucketCache = { at: Date.now(), value };
  return value;
}

/**
 * Ручка events/track анонимная, поэтому в props может прийти что угодно:
 * «больше нуля» проверяется регуляркой, а не приведением к int, которое
 * уронило бы весь запрос на мусоре.
 */
const POSITIVE = `'^[1-9][0-9]*$'`;

export async function loadChatFilesStats(
  pg: Pick<PgService, 'query'>,
  storage: Pick<StorageService, 'bucketStats'> | undefined,
  window: string,
  interval: string,
): Promise<ChatFilesStats | null> {
  const params = [window, interval, excludedUsers(), TEST_USER_PATTERN, CHAT_FILES_EVENTS];
  const where = `name = ANY($5::text[])
       AND ($1 = 'all' OR ts >= now() - $2::interval)
       AND COALESCE(user_id, '') <> ALL($3::text[])
       AND COALESCE(user_id, '') !~ $4`;
  let c: any;
  let topFailReason: string | null = null;
  try {
    c = (await pg.query(
      `SELECT
         COUNT(*) FILTER (WHERE name = 'chat_files_panel_open')::int                          AS opens,
         COUNT(DISTINCT user_id) FILTER (WHERE name = 'chat_files_panel_open')::int           AS users,
         COUNT(*) FILTER (WHERE name = 'chat_files_download')::int                            AS downloads,
         COUNT(*) FILTER (WHERE name = 'chat_files_download' AND props->>'kind' = 'image')::int    AS dl_image,
         COUNT(*) FILTER (WHERE name = 'chat_files_download' AND props->>'kind' = 'document')::int AS dl_document,
         COUNT(*) FILTER (WHERE name = 'chat_files_download' AND props->>'kind' = 'video')::int    AS dl_video,
         COUNT(*) FILTER (WHERE name = 'chat_files_download' AND props->>'kind' = 'audio')::int    AS dl_audio,
         COUNT(*) FILTER (WHERE name = 'find_files_call')::int                                AS ff_calls,
         COUNT(*) FILTER (WHERE name = 'find_files_call' AND props->>'found' ~ ${POSITIVE})::int   AS ff_found,
         COUNT(*) FILTER (WHERE name = 'find_files_call' AND props->>'stored' ~ ${POSITIVE})::int  AS ff_stored,
         COUNT(*) FILTER (WHERE name = 'chat_file_stored')::int                               AS stored,
         COUNT(*) FILTER (WHERE name = 'chat_file_copy_failed')::int                          AS failed
       FROM events
       WHERE ${where}`,
      params,
    )).rows[0] ?? {};
    const top = (await pg.query(
      `SELECT props->>'reason' AS reason, COUNT(*)::int AS n
         FROM events
        WHERE ${where} AND name = 'chat_file_copy_failed'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
      params,
    )).rows[0];
    topFailReason = top?.reason ?? null;
  } catch {
    return null;
  }
  const bucket = await cachedBucketStats(storage);
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return {
    panel: { opens: n(c.opens), users: n(c.users) },
    downloads: {
      total: n(c.downloads),
      byKind: { image: n(c.dl_image), document: n(c.dl_document), video: n(c.dl_video), audio: n(c.dl_audio) },
    },
    findFiles: { calls: n(c.ff_calls), withResults: n(c.ff_found), withStored: n(c.ff_stored) },
    storage: {
      stored: n(c.stored),
      failed: n(c.failed),
      topFailReason,
      bucketObjects: bucket?.objects ?? null,
      bucketBytes: bucket?.bytes ?? null,
    },
  };
}
```

- [ ] **Step 4: Подключить в `content.service.ts`**

Импорты: `Injectable, Logger` → `Injectable, Logger, Optional`; добавить:

```ts
import { StorageService } from '../../common/services/storage.service';
import { ChatFilesStats, loadChatFilesStats } from './chat-files-stats';
```

В `interface ContentOverview` после блока `dozvon`:

```ts
  /** «Медиа и файлы»; null — события не прочитались. */
  files: ChatFilesStats | null;
```

Конструктор:

```ts
  constructor(
    private readonly pg: PgService,
    @Optional() private readonly storage?: StorageService,
  ) {}
```

В `getOverview` перед `return {` добавить:

```ts
    const files = await loadChatFilesStats(this.pg, this.storage, window, interval);
```

и в возвращаемый объект после `dozvon: { … },` добавить `files,`.

- [ ] **Step 5: Прогнать — PASS** (6 тестов) и `npx tsc --noEmit -p tsconfig.build.json`.

- [ ] **Step 6: SQL на настоящем Postgres** — та же форма условий на базе test, только чтение. Скрипт передаётся через `bash -s`, чтобы не воевать с кавычками:

```bash
cat > /tmp/stats-sql.sh <<'EOF'
cd ~/spirits_back && set -a && . ./.env >/dev/null 2>&1; set +a
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At <<'SQL'
SELECT COUNT(*) FILTER (WHERE name = 'find_files_call' AND props->>'found' ~ '^[1-9][0-9]*$')::int AS ff_found,
       COUNT(*) FILTER (WHERE name = 'chat_files_panel_open')::int AS opens
  FROM events
 WHERE name = ANY(ARRAY['find_files_call', 'chat_files_panel_open'])
   AND ('30d' = 'all' OR ts >= now() - '30 days'::interval)
   AND COALESCE(user_id, '') <> ALL(ARRAY['x']::text[])
   AND COALESCE(user_id, '') !~ '^790300[0-9]{5}$';
SQL
EOF
ssh dv@85.192.61.231 'bash -s' < /tmp/stats-sql.sh; rm -f /tmp/stats-sql.sh
```

Expected: строка вида `0|0` без ошибки синтаксиса.

- [ ] **Step 7: Коммит**

```bash
git -C $B add src/monitoring/product/chat-files-stats.ts src/monitoring/product/chat-files-stats.spec.ts src/monitoring/product/content.service.ts
git -C $B commit -m "feat(monitoring): «Медиа и файлы» в обзоре контента"
```

---

### Task 9: Бэк целиком

- [ ] **Step 1: Весь набор и гейт типов на ноде**

```bash
git -C $B push -q; SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "source ~/.nvm/nvm.sh >/dev/null; git -C ~/ci/spirits_back fetch -q origin && cd ~/ci/wt/stats-back && git checkout -q --detach $SHA && npx tsc --noEmit -p tsconfig.build.json && echo 'tsc ok' && npx jest src --silent 2>&1 | grep -E '^Tests:|^Test Suites:|FAIL'"
```

Expected: `tsc ok`, `FAIL` нет, наборов не меньше, чем на `origin/main` плюс новые.

---

### Task 10: Фронт — тип и адрес миниатюры

**Files:**
- Modify: `src/components/chat/files/chatFiles.ts`
- Test: `src/components/chat/files/chatFiles.test.ts`

- [ ] **Step 1: Тест** — дописать в `chatFiles.test.ts` (в импорт из `./chatFiles` добавить `thumbUrlFor`; из `vitest` — `vi`, если его нет):

```ts
describe('thumbUrlFor', () => {
  it('достраивает путь ручки от адреса бэкенда', () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://my.linkeon.io');
    expect(thumbUrlFor('/webhook/chat/thumb?src=a%2Fb.jpg')).toBe('https://my.linkeon.io/webhook/chat/thumb?src=a%2Fb.jpg');
    vi.unstubAllEnvs();
  });

  it('без адреса бэкенда — относительный путь', () => {
    vi.stubEnv('VITE_BACKEND_URL', '');
    expect(thumbUrlFor('/webhook/chat/thumb?src=a%2Fb.jpg')).toBe('/webhook/chat/thumb?src=a%2Fb.jpg');
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Прогнать — FAIL** (`thumbUrlFor is not a function`). Команда — «Запуск тестов фронта», `<ФАЙЛЫ>` = `src/components/chat/files/chatFiles.test.ts`.

- [ ] **Step 3: Реализация** — в `chatFiles.ts`, в `interface ChatFileItem` после `thumbUrl?: string;`:

```ts
  /** Только у картинок из наших бакетов: путь ручки миниатюры на бэке (chat-thumb.controller.ts). */
  thumbPath?: string;
```

После `fetchChatFiles`:

```ts
/**
 * Адрес миниатюры: путь ручки достраивается от нашего бэкенда, поэтому test,
 * прод и приложение на Capacitor берут миниатюры каждый со своего.
 */
export function thumbUrlFor(thumbPath: string): string {
  return `${import.meta.env.VITE_BACKEND_URL || ''}${thumbPath}`;
}
```

- [ ] **Step 4: Прогнать — PASS.**

- [ ] **Step 5: Коммит**

```bash
git -C $F add src/components/chat/files/chatFiles.ts src/components/chat/files/chatFiles.test.ts
git -C $F commit -m "feat(chat-files): thumbPath и адрес миниатюры от бэкенда"
```

---

### Task 11: Фронт — плитка с миниатюрой

**Files:**
- Modify: `src/components/chat/files/ChatFilesPanel.tsx`
- Test: `src/components/chat/files/ChatFilesPanel.test.tsx`

- [ ] **Step 1: Тест** — дописать в `describe('ChatFilesPanel', …)`:

```tsx
  it('плитка берёт миниатюру, при ошибке — оригинал, потом значок', async () => {
    api.get.mockResolvedValue(ok([f({ key: 'i1', name: 'i1.png', url: 'https://pub/i1.png', thumbPath: '/webhook/chat/thumb?src=x%2Fi1.png' })]));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    const img = () => container.querySelector('[role="tabpanel"] img') as HTMLImageElement | null;
    expect(img()!.getAttribute('src')).toBe('/webhook/chat/thumb?src=x%2Fi1.png');
    act(() => { img()!.dispatchEvent(new Event('error')); });
    expect(img()!.getAttribute('src')).toBe('https://pub/i1.png');
    act(() => { img()!.dispatchEvent(new Event('error')); });
    expect(img()).toBeNull();
    expect(container.querySelector('[data-testid="chat-files-broken-thumb"]')).not.toBeNull();
  });

  it('картинка без thumbPath — сразу оригинал', async () => {
    api.get.mockResolvedValue(ok([f({ key: 'i1', name: 'i1.png', url: 'https://pub/i1.png' })]));
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} />);
    await settle();
    expect(container.querySelector('[role="tabpanel"] img')!.getAttribute('src')).toBe('https://pub/i1.png');
  });
```

- [ ] **Step 2: Прогнать — FAIL** (`src` — оригинал вместо миниатюры).

- [ ] **Step 3: Реализация** — в `ChatFilesPanel.tsx`:

В импорт из `./chatFiles` добавить `thumbUrlFor`. Сразу под `const [brokenKeys, setBrokenKeys] = useState<ReadonlySet<string>>(new Set());` добавить:

```tsx
  // Миниатюра не загрузилась — плитка пробует оригинал, и только потом значок.
  const [thumbFailedKeys, setThumbFailedKeys] = useState<ReadonlySet<string>>(new Set());
```

В `load()` сразу под `setBrokenKeys(new Set());` добавить `setThumbFailedKeys(new Set());` — та же причина, что и у `brokenKeys`: при «Повторить» миниатюра могла уже появиться.

Тег `<img …/>` в плитке медиа (ветка `current === 'media'`, внутри `brokenKeys.has(it.key) ? … : (`) заменить:

```tsx
                            (() => {
                              const useThumb = it.kind === 'image' && !!it.thumbPath && !thumbFailedKeys.has(it.key);
                              return (
                                <img
                                  src={it.kind === 'video' ? it.thumbUrl : useThumb ? thumbUrlFor(it.thumbPath as string) : it.url}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover"
                                  onError={() =>
                                    useThumb
                                      ? setThumbFailedKeys((prev) => new Set(prev).add(it.key))
                                      : setBrokenKeys((prev) => new Set(prev).add(it.key))
                                  }
                                />
                              );
                            })()
```

- [ ] **Step 4: Прогнать — PASS** весь `ChatFilesPanel.test.tsx` (старые тесты тоже).

- [ ] **Step 5: Коммит**

```bash
git -C $F add src/components/chat/files/ChatFilesPanel.tsx src/components/chat/files/ChatFilesPanel.test.tsx
git -C $F commit -m "feat(chat-files): плитка панели — миниатюра, при ошибке оригинал"
```

---

### Task 12: Фронт — `onDownload` в панели и просмотре

**Files:**
- Modify: `src/components/chat/files/ChatFilesPanel.tsx`, `src/components/chat/files/MediaViewer.tsx`
- Test: `src/components/chat/files/ChatFilesPanel.test.tsx`, `src/components/chat/files/MediaViewer.test.tsx`

- [ ] **Step 1: Тесты**

В `ChatFilesPanel.test.tsx`:

```tsx
  it('скачивание из списка файлов сообщает вид файла', async () => {
    api.get.mockResolvedValue(ok(ITEMS));
    const onDownload = vi.fn();
    const { container } = mount(<ChatFilesPanel assistantId={12} onClose={vi.fn()} onDownload={onDownload} />);
    await settle();
    click(tab(container, 'chat.files.tab_files'));
    click(container.querySelector('[role="tabpanel"] a[href="https://pub/report.pdf"]')!);
    expect(onDownload).toHaveBeenCalledWith('document', 'list');
  });
```

В `MediaViewer.test.tsx` (внутри существующего `describe`):

```tsx
  it('«Скачать» сообщает вид файла', () => {
    const onDownload = vi.fn();
    const { container } = mount(<MediaViewer items={[img(0)]} index={0} onIndexChange={vi.fn()} onClose={vi.fn()} onDownload={onDownload} />);
    click(container.querySelector('a[download]')!);
    expect(onDownload).toHaveBeenCalledWith('image');
  });
```

- [ ] **Step 2: Прогнать — FAIL** (`onDownload` не вызван).

- [ ] **Step 3: `MediaViewer.tsx`**

В импорт типов из `./chatFiles` добавить `ChatFileKind`. В `interface Props`:

```tsx
  /** Нажали «Скачать» — для статистики (ChatInterface шлёт событие). */
  onDownload?: (kind: ChatFileKind) => void;
```

Деструктуризация пропсов: `({ items, index, onIndexChange, onClose, onDownload })`. У ссылки «Скачать» (`<a href={item.url} download={item.name} …>`) добавить:

```tsx
          onClick={() => onDownload?.(item.kind)}
```

- [ ] **Step 4: `ChatFilesPanel.tsx`**

В импорт типов из `./chatFiles` добавить `ChatFileKind`. В `interface Props`:

```tsx
  /** Скачали файл из списка или из просмотра — для статистики. */
  onDownload?: (kind: ChatFileKind, from: 'list' | 'viewer') => void;
```

Деструктуризация: `({ assistantId, freshTs, onClose, onDownload })`. У ссылки файла в списке (`<a href={it.url} download={it.name} …>`) добавить:

```tsx
                              onClick={() => onDownload?.(it.kind, 'list')}
```

`<MediaViewer …>` получает:

```tsx
          onDownload={(kind) => onDownload?.(kind, 'viewer')}
```

- [ ] **Step 5: Прогнать — PASS** оба файла целиком.

- [ ] **Step 6: Коммит**

```bash
git -C $F add src/components/chat/files/ChatFilesPanel.tsx src/components/chat/files/MediaViewer.tsx src/components/chat/files/ChatFilesPanel.test.tsx src/components/chat/files/MediaViewer.test.tsx
git -C $F commit -m "feat(chat-files): onDownload из списка и просмотра"
```

---

### Task 13: Фронт — события в `ChatInterface`

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx`
- Test: `src/components/chat/filesEventsWiring.test.ts` (новый)

- [ ] **Step 1: Тест проводки**

```ts
// src/components/chat/filesEventsWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Статистика «Медиа и файлы» в админке (spirits_back: chat-files-stats.ts)
 * держится на событиях отсюда: открытие панели и скачивание из неё.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const body = (marker: string): string => {
  const start = SRC.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const from = start + marker.length;
  let depth = 1;
  let i = from;
  while (depth > 0) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') depth--;
    i++;
  }
  return SRC.slice(from, i - 1);
};

describe('события панели «Медиа и файлы»', () => {
  it('кнопка в шапке и пункт меню открывают панель через openFilesPanel', () => {
    const toggle = SRC.slice(SRC.indexOf('data-testid="chat-files-toggle"'), SRC.indexOf('data-testid="chat-files-toggle"') + 200);
    const menu = SRC.slice(SRC.indexOf('data-testid="chat-files-menuitem"'), SRC.indexOf('data-testid="chat-files-menuitem"') + 200);
    expect(toggle).toContain("openFilesPanel('header')");
    expect(menu).toContain("openFilesPanel('menu')");
  });

  it('openFilesPanel открывает панель и шлёт chat_files_panel_open', () => {
    const b = body("const openFilesPanel = (entry: 'header' | 'menu') => {");
    expect(b).toContain('setShowFilesPanel(true)');
    expect(b).toMatch(/trackAuthed\('chat_files_panel_open', user\.phone, \{ assistantId: selectedAssistant\.id, fresh: !!freshTs, entry \}\)/);
  });

  it('скачивание из панели шлёт chat_files_download', () => {
    const b = body("const trackFilesDownload = (kind: ChatFileKind, from: 'list' | 'viewer') => {");
    expect(b).toContain("trackAuthed('chat_files_download', user.phone, { kind, from })");
    expect(SRC).toContain('onDownload={trackFilesDownload}');
  });
});
```

- [ ] **Step 2: Прогнать — FAIL.**

- [ ] **Step 3: Реализация** — в `ChatInterface.tsx`:

Импорт рядом с `import ChatFilesPanel from './files/ChatFilesPanel';`:

```tsx
import type { ChatFileKind } from './files/chatFiles';
```

Сразу после эффекта «Панель показывает переписку открытого ассистента — при смене ассистента закрываем» (`useEffect(() => { setShowFilesPanel(false); }, [selectedAssistant?.id]);`):

```tsx
  // Открытие панели и скачивание из неё — в статистику админки (spirits_back:
  // monitoring/product/chat-files-stats.ts). Шлём так же, как file_pick.
  const openFilesPanel = (entry: 'header' | 'menu') => {
    setShowFilesPanel(true);
    if (user?.phone && selectedAssistant) {
      trackAuthed('chat_files_panel_open', user.phone, { assistantId: selectedAssistant.id, fresh: !!freshTs, entry });
    }
  };
  const trackFilesDownload = (kind: ChatFileKind, from: 'list' | 'viewer') => {
    if (user?.phone) trackAuthed('chat_files_download', user.phone, { kind, from });
  };
```

(`freshTs` объявлен выше, около «Чистого листа»; если эффект панели стоит раньше `freshTs` — вставить блок сразу после объявления `freshTs`/`toggleFreshMode`.)

Кнопка в шапке (`data-testid="chat-files-toggle"`): `onClick={() => setShowFilesPanel(true)}` → `onClick={() => openFilesPanel('header')}`.

Пункт меню (`data-testid="chat-files-menuitem"`): `onClick={() => { setShowChatActions(false); setShowFilesPanel(true); }}` → `onClick={() => { setShowChatActions(false); openFilesPanel('menu'); }}`.

`<ChatFilesPanel …>` получает проп:

```tsx
          onDownload={trackFilesDownload}
```

- [ ] **Step 4: Прогнать — PASS**, вместе с `src/components/chat/filesWiring.test.ts` и `src/components/chat/files`.

- [ ] **Step 5: Коммит**

```bash
git -C $F add src/components/chat/ChatInterface.tsx src/components/chat/filesEventsWiring.test.ts
git -C $F commit -m "feat(chat-files): события открытия панели и скачивания"
```

---

### Task 14: Фронт — секция «Медиа и файлы» в админке

**Files:**
- Create: `src/components/admin/monitoring/Stat.tsx`, `src/components/admin/monitoring/MonitoringChatFilesSection.tsx`
- Modify: `src/components/admin/monitoring/MonitoringContentView.tsx`
- Test: `src/components/admin/monitoring/MonitoringChatFilesSection.test.tsx`, `src/components/admin/monitoring/MonitoringContentView.test.tsx`

- [ ] **Step 1: Тесты**

```tsx
// src/components/admin/monitoring/MonitoringChatFilesSection.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, visibleText } from '../../../test/dom';
import MonitoringChatFilesSection, { type ChatFilesStats } from './MonitoringChatFilesSection';

const STATS: ChatFilesStats = {
  panel: { opens: 5, users: 3 },
  downloads: { total: 4, byKind: { image: 2, document: 1, video: 0, audio: 1 } },
  findFiles: { calls: 6, withResults: 4, withStored: 3 },
  storage: { stored: 10, failed: 2, topFailReason: 'timeout', bucketObjects: 601, bucketBytes: 324009984 },
};

describe('MonitoringChatFilesSection', () => {
  it('рисует цифры панели, поиска и хранилища', () => {
    const text = visibleText(mount(<MonitoringChatFilesSection files={STATS} />).container);
    expect(text).toContain('Медиа и файлы');
    expect(text).toContain('людей 3');
    expect(text).toContain('картинки 2 · документы 1 · видео 0 · озвучка 1');
    expect(text).toContain('66.7%');
    expect(text).toContain('50.0%');
    expect(text).toContain('не удалось 2 · чаще всего: таймаут');
    expect(text).toContain('309 МБ');
    expect(text).toContain('601 файл');
  });

  it('MinIO не ответил — так и пишет', () => {
    const files = { ...STATS, storage: { ...STATS.storage, bucketObjects: null, bucketBytes: null } };
    expect(visibleText(mount(<MonitoringChatFilesSection files={files} />).container)).toContain('MinIO не ответил');
  });

  it('вызовов не было — проценты прочерком', () => {
    const files = { ...STATS, findFiles: { calls: 0, withResults: 0, withStored: 0 } };
    expect(visibleText(mount(<MonitoringChatFilesSection files={files} />).container)).toContain('—');
  });
});
```

И тест вида целиком — `src/components/admin/monitoring/MonitoringContentView.test.tsx` (новый):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { flush, mount, visibleText } from '../../../test/dom';
import MonitoringContentView from './MonitoringContentView';
import { apiClient } from '../../../services/apiClient';

vi.mock('../../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
const api = vi.mocked(apiClient);

const overview = (files: unknown) => ({
  window: '30d', generatedAt: '2026-10-12T10:00:00.000Z', excludedUsers: [],
  images: { total: 0, uniqueUsers: 0, avgTokens: null },
  videos: { total: 0, completed: 0, failed: 0, inFlight: 0, successRatePct: null, avgWaitSeconds: null, avgTokens: null },
  dozvon: { total: 0, completed: 0, completionRatePct: null, avgDurationSec: null },
  files,
});

describe('MonitoringContentView: «Медиа и файлы»', () => {
  it('files: null — «нет данных», а не пустая секция', async () => {
    api.get.mockResolvedValue({ ok: true, json: async () => overview(null) } as any);
    const { container } = mount(<MonitoringContentView />);
    await flush(); await flush();
    expect(visibleText(container)).toContain('Нет данных: события не прочитались.');
  });

  it('старый бэк без files — секции нет', async () => {
    api.get.mockResolvedValue({ ok: true, json: async () => overview(undefined) } as any);
    const { container } = mount(<MonitoringContentView />);
    await flush(); await flush();
    expect(visibleText(container)).not.toContain('Медиа и файлы');
  });
});
```

- [ ] **Step 2: Прогнать — FAIL** (`Cannot find module './MonitoringChatFilesSection'`).

- [ ] **Step 3: `Stat.tsx`** — вынести карточку из `MonitoringContentView.tsx` без изменений:

```tsx
// src/components/admin/monitoring/Stat.tsx
import React from 'react';
import { clsx } from 'clsx';

/** Карточка одной цифры в разделах мониторинга. */
const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }> =
({ icon, label, value, sub, valueClass }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{icon}{label}</div>
    <div className={clsx('text-lg font-semibold text-gray-900', valueClass)}>{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

export default Stat;
```

В `MonitoringContentView.tsx` удалить локальное определение `const Stat …` и добавить `import Stat from './Stat';`.

- [ ] **Step 4: `MonitoringChatFilesSection.tsx`**

```tsx
// src/components/admin/monitoring/MonitoringChatFilesSection.tsx
import React from 'react';
import { Download, FolderOpen, HardDrive, Search } from 'lucide-react';
import Stat from './Stat';

/** Блок files из GET /webhook/admin/monitoring/product/content (spirits_back: chat-files-stats.ts). */
export interface ChatFilesStats {
  panel: { opens: number; users: number };
  downloads: { total: number; byKind: Record<'image' | 'document' | 'video' | 'audio', number> };
  findFiles: { calls: number; withResults: number; withStored: number };
  storage: {
    stored: number;
    failed: number;
    topFailReason: string | null;
    bucketObjects: number | null;
    bucketBytes: number | null;
  };
}

const REASON_LABEL: Record<string, string> = {
  timeout: 'таймаут',
  access_denied: 'нет прав в MinIO',
  too_large: 'слишком большой',
  not_found: 'файла нет на релее',
  other: 'прочее',
};

const fmtNum = (n: number) => n.toLocaleString('ru-RU');
const pctOf = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');
const fmtBytes = (b: number | null) => {
  if (b === null) return '—';
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} ГБ`;
  return `${Math.round(b / 1024 ** 2)} МБ`;
};

const MonitoringChatFilesSection: React.FC<{ files: ChatFilesStats }> = ({ files }) => {
  const { panel, downloads, findFiles, storage } = files;
  const k = downloads.byKind;
  const top = storage.topFailReason ? ` · чаще всего: ${REASON_LABEL[storage.topFailReason] ?? storage.topFailReason}` : '';
  return (
    <section>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Медиа и файлы</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<FolderOpen className="w-3.5 h-3.5" />} label="Открытий панели" value={fmtNum(panel.opens)} sub={`людей ${panel.users}`} />
        <Stat icon={<Download className="w-3.5 h-3.5" />} label="Скачиваний" value={fmtNum(downloads.total)}
          sub={`картинки ${k.image} · документы ${k.document} · видео ${k.video} · озвучка ${k.audio}`} />
        <Stat icon={<Search className="w-3.5 h-3.5" />} label="Поиск файлов ассистентом" value={fmtNum(findFiles.calls)}
          sub={`нашлось что-то: ${pctOf(findFiles.withResults, findFiles.calls)} · можно скачать: ${pctOf(findFiles.withStored, findFiles.calls)}`} />
        <Stat icon={<HardDrive className="w-3.5 h-3.5" />} label="Сохранено файлов" value={fmtNum(storage.stored)}
          sub={`не удалось ${storage.failed}${top}`} />
        <Stat icon={<HardDrive className="w-3.5 h-3.5" />} label="Бакет linkeon-chat-files" value={fmtBytes(storage.bucketBytes)}
          sub={storage.bucketObjects === null ? 'MinIO не ответил' : `${fmtNum(storage.bucketObjects)} файл(ов)`} />
      </div>
    </section>
  );
};

export default MonitoringChatFilesSection;
```

Тест ждёт `'66.7%'` (4 из 6) и `'50.0%'` (3 из 6) — оба в подписи поиска; `'601 файл'` — начало строки `601 файл(ов)`.

- [ ] **Step 5: `MonitoringContentView.tsx`**

Импорт:

```tsx
import MonitoringChatFilesSection, { type ChatFilesStats } from './MonitoringChatFilesSection';
```

В `interface ContentOverview` после `dozvon`:

```tsx
  /** Нет у старого бэка; null — события не прочитались. */
  files?: ChatFilesStats | null;
```

После секции «Дозвон» (перед подписью «Обновлено: …»):

```tsx
          {data.files && <MonitoringChatFilesSection files={data.files} />}
          {data.files === null && (
            <section>
              <h3 className="text-sm font-medium text-gray-700 mb-1">Медиа и файлы</h3>
              <div className="text-xs text-gray-400">Нет данных: события не прочитались.</div>
            </section>
          )}
```

- [ ] **Step 6: Прогнать — PASS**, вместе со всем `src/components/admin`.

- [ ] **Step 7: Коммит**

```bash
git -C $F add src/components/admin/monitoring
git -C $F commit -m "feat(admin): секция «Медиа и файлы» в мониторинге контента"
```

---

### Task 15: Фронт целиком

- [ ] **Step 1: Все тесты, типы, сборка**

```bash
git -C $F push -q; SHA=$(git -C $F rev-parse HEAD)
ssh dv@85.192.61.231 "source ~/.nvm/nvm.sh >/dev/null; git -C ~/ci/spirits_front fetch -q origin && cd ~/ci/wt/stats-front && git checkout -q --detach $SHA && pnpm install --frozen-lockfile >/dev/null 2>&1; pnpm test 2>&1 | grep -E 'Test Files|Tests  |FAIL'; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c 'error TS'; git checkout -q --detach origin/main && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c 'error TS'; git checkout -q --detach $SHA; pnpm build 2>&1 | tail -1"
```

Expected:
- тесты зелёные;
- число ошибок `tsc` на ветке **не больше**, чем на `origin/main` (на main их 45 — память `project_front_tsc_checks_nothing`);
- `✓ built`.

`pnpm lint` на main сломан (нет `eslint-plugin-i18next`, память `project_front_lint_broken_i18next_plugin`), его падение не от этой ветки.

---

### Task 16: Выкат на test и живая проверка — ТОЛЬКО С OK ВЛАДЕЛЬЦА

- [ ] **Step 1: Спросить владельца** — «Вливаю ветки в main и катаю `TEST_ONLY=1` (бэк и фронт)?»

- [ ] **Step 2: Влить обе ветки через detached `origin/main`**

```bash
for R in ~/Downloads/spirits_back/.worktrees/stats-thumbs ~/Downloads/spirits_front/.worktrees/stats-thumbs-front; do
  git -C $R fetch -q origin && git -C $R checkout -q --detach origin/main && \
  git -C $R merge --no-ff -q feat/chat-files-stats-thumbs -m "Merge feat/chat-files-stats-thumbs: статистика «Медиа и файлы» и миниатюры" && \
  git -C $R push -q origin HEAD:main && git -C $R log --oneline -1
done
```

- [ ] **Step 3: Проверить, что уедет только своё** — для каждого репо `git log --oneline --first-parent <коммит на проде>..origin/main`:
  - коммит бэка на проде: `ssh dvolkov@212.113.106.202 'git -C ~/spirits_back rev-parse --short HEAD'`;
  - коммит фронта — по последнему журналу выката в `~/deploy-logs/` на ноде (`HEAD is now at …`).
  
  Чужие невыкаченные коммиты — спросить владельца.

- [ ] **Step 4: `TEST_ONLY=1` с ноды, из чистых клонов, отвязанно** (до запуска — `ps -eo args | grep -E '^bash scripts/deploy\.sh'` пусто):

```bash
ssh dv@85.192.61.231 'set -e; D=~/deploy-clones/stats-thumbs; rm -rf $D; mkdir -p $D ~/deploy-logs; cd $D; git clone -q --branch main git@github.com:dvvolkovv/spirits_back.git; git clone -q --branch main git@github.com:dvvolkovv/spirits.git spirits_front; install -m 600 ~/dev/spirits_back/scripts/test-server.env.local $D/spirits_back/scripts/; cd $D/spirits_back/tests && source ~/.nvm/nvm.sh >/dev/null && npm ci --no-audit --no-fund >/dev/null; cd $D/spirits_back && TEST_ONLY=1 LOCAL_BACK_DIR=$D/spirits_back LOCAL_FRONT_DIR=$D/spirits_front setsid -f bash -c "echo \$\$ > ~/deploy-logs/stats-thumbs-test.pid; exec bash scripts/deploy.sh" > ~/deploy-logs/stats-thumbs-test.log 2>&1 < /dev/null; echo запущен'
```

Ждать `ALL PHASES GREEN` в `~/deploy-logs/stats-thumbs-test.log`.

- [ ] **Step 5: Живая проверка на test** (тестовый аккаунт, вход через debug-OTP на ноде, `http://localhost:3001`):
  - **Миниатюра.** `GET /webhook/chat/thumb?src=<картинка из linkeon-chat-files тестового аккаунта>`:
    - первый раз — 302 на `…/linkeon-assets/thumbs/<sha1>.webp`;
    - по адресу — `image/webp` меньше 50 КБ;
    - второй запрос — 302 сразу, без строки генерации в `pm2 logs`.
  - **Чужой бакет.** `src=linkeon-smm-videos/a.jpg` — 400.
  - **Панель.** `GET /webhook/chat/files?assistantId=12&freshTs=<сессия с картинкой>` — у картинки есть `thumbPath`.
  - **Скриншот.** Playwright на ноде (как в живой проверке плана B): у плитки `src` ведёт на `/webhook/chat/thumb`, картинка видна.
  - **События.** Открыть панель, скачать файл, вызвать `find_files` (попросить Машу найти файл). Потом `SELECT name, count(*) FROM events WHERE ts > now() - interval '15 minutes' AND name = ANY(...) GROUP BY 1` на базе test — все три события есть.
  - **Админка.** `GET /webhook/admin/monitoring/product/content?window=24h` админом test — есть блок `files`. Тестовые аккаунты отсечены, поэтому цифры могут быть нулями — это ожидаемо.

---

### Task 17: Прод — ТОЛЬКО С OK ВЛАДЕЛЬЦА

- [ ] **Step 1: Спросить владельца** — «На test всё работает, катаю test → прод?»
- [ ] **Step 2: Обычный выкат** — тот же запуск, что в задаче 16 Step 4, без `TEST_ONLY=1`, лог `~/deploy-logs/stats-thumbs.log`.
- [ ] **Step 3: Живая проверка на проде** — миниатюра одной картинки тестового аккаунта (302 → `image/webp`), блок `files` в админке. На проде проверять с ноды: с мака my.linkeon.io сейчас недоступен (память `project_selectel_blocks_185_4_75_22`).
- [ ] **Step 4: Уборка** — ворктри на маке и на ноде, `~/deploy-clones/stats-thumbs`. Память: записать, где живут миниатюры и что `linkeon-assets/thumbs/` можно чистить без потерь.
