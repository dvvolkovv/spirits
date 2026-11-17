import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '../../../services/apiClient';
import {
  BROWSER_IMAGE_EXTS, ChatFileItem, TILE_ORIGINAL_MAX_BYTES, deleteChatUpload, fetchChatFiles, fileIconKind, groupByMonth,
  isUploadItem, splitTab, startTab, thumbUrlFor, uploadTilePath, uploadViewerPath,
} from './chatFiles';

vi.mock('../../../services/apiClient', () => ({ apiClient: { get: vi.fn(), delete: vi.fn() } }));
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

  it('загрузки пользователя раскладываются по тем же правилам: фото и видео — в «Медиа», PDF — в «Файлы»', () => {
    // Так их отдаёт бэк (chat-files.service.ts, uploadPanelItem): адрес —
    // приватная ручка, messageId нет, есть origin/source/note/uploadId.
    const uploads = [
      item({
        key: 'upload:p', kind: 'image', url: '/webhook/chat-uploads/p', thumbUrl: '/webhook/chat-uploads/p/thumb',
        messageId: undefined, origin: 'upload', source: 'web', note: 'Гостиная до ремонта', uploadId: 'p',
      }),
      item({
        key: 'upload:v', kind: 'video', ext: 'mp4', name: 'прогулка.mp4', url: '/webhook/chat-uploads/v',
        messageId: undefined, origin: 'upload', source: 'telegram', note: null, uploadId: 'v',
      }),
      item({
        key: 'upload:d', kind: 'document', ext: 'pdf', name: 'Договор.pdf', url: '/webhook/chat-uploads/d',
        messageId: undefined, origin: 'upload', source: 'scan', note: null, uploadId: 'd',
      }),
    ];
    expect(splitTab(uploads, 'media').stored.map((f) => f.key)).toEqual(['upload:p', 'upload:v']);
    expect(splitTab(uploads, 'files').stored.map((f) => f.key)).toEqual(['upload:d']);
    expect(splitTab(uploads, 'media').unsaved).toEqual([]);
    expect(startTab(uploads)).toBe('media');
  });
});

describe('groupByMonth', () => {
  it('месяцы по порядку прихода, подпись с заглавной', () => {
    const groups = groupByMonth(
      [
        item({ key: 'a', createdAt: '2026-10-05T10:00:00.000Z' }),
        // Середина месяца, не 10-01: у края месяца локальная дата (new Date
        // + getMonth() — локальное время) может оказаться в соседнем месяце
        // на машине с достаточно отрицательным смещением от UTC.
        item({ key: 'b', createdAt: '2026-10-03T12:00:00.000Z' }),
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

describe('deleteChatUpload', () => {
  const UPLOAD_ID = 'c1c1c1c1-1111-4111-8111-111111111111';

  beforeEach(() => vi.clearAllMocks());

  it('DELETE своей загрузки через apiClient — JWT добавляет он', async () => {
    api.delete.mockResolvedValue({ ok: true, status: 204 } as any);
    await expect(deleteChatUpload(UPLOAD_ID)).resolves.toBeUndefined();
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith(`/webhook/chat-uploads/${UPLOAD_ID}`);
  });

  it('404 — файла уже нет (удалён в другой вкладке): для панели это тот же итог', async () => {
    api.delete.mockResolvedValue({ ok: false, status: 404 } as any);
    await expect(deleteChatUpload(UPLOAD_ID)).resolves.toBeUndefined();
  });

  it('502 — хранилище не ответило, файл цел: исключение, плитка остаётся', async () => {
    api.delete.mockResolvedValue({ ok: false, status: 502 } as any);
    await expect(deleteChatUpload(UPLOAD_ID)).rejects.toThrow('HTTP 502');
  });

  it('сетевой сбой пробрасывается как есть', async () => {
    api.delete.mockRejectedValue(new Error('network down'));
    await expect(deleteChatUpload(UPLOAD_ID)).rejects.toThrow('network down');
  });

  it('пустой id — исключение без запроса: DELETE на голый префикс дал бы 404 и ложный успех', async () => {
    await expect(deleteChatUpload('')).rejects.toThrow();
    expect(api.delete).not.toHaveBeenCalled();
  });
});

// Защита: приватный адрес без origin (бэк без поля, старый ответ) всё равно
// не должен попасть в <img src> или ссылку с href — браузер не пошлёт JWT.
describe('isUploadItem', () => {
  it('origin upload — загрузка', () => {
    expect(isUploadItem(item({ origin: 'upload', url: '/webhook/chat-uploads/u1' }))).toBe(true);
  });

  it('без origin, но с приватным адресом загрузки — тоже загрузка', () => {
    expect(isUploadItem(item({ url: '/webhook/chat-uploads/u1' }))).toBe(true);
  });

  it('файл ассистента на публичном адресе и без адреса — не загрузка', () => {
    expect(isUploadItem(item({ url: 'https://pub/a.png' }))).toBe(false);
    expect(isUploadItem(item({ origin: 'assistant', url: 'https://pub/a.png' }))).toBe(false);
    expect(isUploadItem(item({ url: undefined, stored: false }))).toBe(false);
  });
});

describe('превью загрузки: uploadTilePath / uploadViewerPath', () => {
  const up = (p: Partial<ChatFileItem>): ChatFileItem =>
    item({ key: 'upload:u1', url: '/webhook/chat-uploads/u1', origin: 'upload', uploadId: 'u1', ...p });
  const THUMB = '/webhook/chat-uploads/u1/thumb';

  it('браузерные форматы картинок — те, что рисует <img>', () => {
    expect([...BROWSER_IMAGE_EXTS].sort()).toEqual(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
  });

  it('плитка: миниатюра, если есть, — у картинки и у видео', () => {
    expect(uploadTilePath(up({ ext: 'jpg', thumbUrl: THUMB }))).toBe(THUMB);
    expect(uploadTilePath(up({ kind: 'video', ext: 'mp4', thumbUrl: THUMB }))).toBe(THUMB);
  });

  it('плитка без миниатюры: HEIC и прочее, что браузер не покажет, — без превью; видео — без превью', () => {
    expect(uploadTilePath(up({ ext: 'heic' }))).toBeUndefined();
    expect(uploadTilePath(up({ ext: '' }))).toBeUndefined();
    expect(uploadTilePath(up({ kind: 'video', ext: 'mp4' }))).toBeUndefined();
  });

  it('просмотр: оригинал браузерного формата (регистр расширения не важен), а не миниатюра', () => {
    expect(uploadViewerPath(up({ ext: 'jpg', thumbUrl: THUMB }))).toBe('/webhook/chat-uploads/u1');
    expect(uploadViewerPath(up({ ext: 'PNG' }))).toBe('/webhook/chat-uploads/u1');
  });

  it('просмотр: формат не браузерный — миниатюра (TIFF), а без неё ничего (HEIC)', () => {
    expect(uploadViewerPath(up({ ext: 'tiff', thumbUrl: THUMB }))).toBe(THUMB);
    expect(uploadViewerPath(up({ ext: 'heic' }))).toBeUndefined();
  });

  // Плитка ~120 px: тянуть ради неё 30-мегабайтный оригинал нельзя (миниатюра
  // не получилась — битый файл, сбой генерации). Размер шлёт бэк (sizeBytes).
  it('плитка без миниатюры: оригинал только до 5 МБ; размер неизвестен — без превью', () => {
    expect(TILE_ORIGINAL_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(uploadTilePath(up({ ext: 'jpg', sizeBytes: 3 * 1024 * 1024 }))).toBe('/webhook/chat-uploads/u1');
    expect(uploadTilePath(up({ ext: 'jpg', sizeBytes: TILE_ORIGINAL_MAX_BYTES }))).toBe('/webhook/chat-uploads/u1');
    expect(uploadTilePath(up({ ext: 'jpg', sizeBytes: TILE_ORIGINAL_MAX_BYTES + 1 }))).toBeUndefined();
    expect(uploadTilePath(up({ ext: 'jpg', sizeBytes: 30 * 1024 * 1024 }))).toBeUndefined();
    expect(uploadTilePath(up({ ext: 'jpg' }))).toBeUndefined();
    // Миниатюра есть — размер оригинала не важен.
    expect(uploadTilePath(up({ ext: 'jpg', sizeBytes: 30 * 1024 * 1024, thumbUrl: THUMB }))).toBe(THUMB);
  });

  it('просмотр открывают нарочно — оригинал грузится при любом размере', () => {
    expect(uploadViewerPath(up({ ext: 'jpg', sizeBytes: 30 * 1024 * 1024 }))).toBe('/webhook/chat-uploads/u1');
    expect(uploadViewerPath(up({ ext: 'jpg' }))).toBe('/webhook/chat-uploads/u1');
  });
});
