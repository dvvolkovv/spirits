import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAgentAvatars, releaseAvatars } from './agentAvatars';
import * as api from '../api';

beforeEach(() => {
  vi.restoreAllMocks();
  let n = 0;
  vi.stubGlobal('URL', {
    createObjectURL: () => `blob:${++n}`,
    revokeObjectURL: vi.fn(),
  });
});

describe('loadAgentAvatars', () => {
  it('возвращает URL только для загруженных', async () => {
    // У части ассистентов фото нет вовсе — это нормальное состояние, карточка
    // покажет инициалы.
    vi.spyOn(api, 'getBlob').mockImplementation(async (url: string) =>
      url.endsWith('/12') ? (new Blob(['x']) as Blob) : null,
    );
    expect(await loadAgentAvatars([12, 13])).toEqual({ 12: 'blob:1' });
  });

  it('ошибка по одному не отменяет остальных', async () => {
    vi.spyOn(api, 'getBlob').mockImplementation(async (url: string) => {
      if (url.endsWith('/13')) throw new Error('сеть');
      return new Blob(['x']) as Blob;
    });
    const got = await loadAgentAvatars([12, 13, 14]);
    expect(Object.keys(got).sort()).toEqual(['12', '14']);
  });

  it('запрашивает по идентификатору ассистента', async () => {
    const spy = vi.spyOn(api, 'getBlob').mockResolvedValue(null);
    await loadAgentAvatars([7]);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('/agent/avatar/7'));
  });
});

describe('releaseAvatars', () => {
  it('отзывает все URL — иначе блобы копятся до перезагрузки', () => {
    releaseAvatars({ 12: 'blob:1', 13: 'blob:2' });
    expect((URL.revokeObjectURL as any).mock.calls.map((c: any[]) => c[0])).toEqual([
      'blob:1', 'blob:2',
    ]);
  });
});
