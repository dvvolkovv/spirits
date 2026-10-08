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
