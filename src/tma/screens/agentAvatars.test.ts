import { describe, it, expect, vi } from 'vitest';
import { loadAgentAvatars, AVATAR_CONCURRENCY } from './agentAvatars';

/**
 * URL.createObjectURL в node-окружении нет — подменяем: проверяем очередь
 * загрузки, а не работу браузерного API.
 */
const withObjectUrl = () => {
  let n = 0;
  (globalThis as any).URL.createObjectURL = () => `blob:${++n}`;
};

describe('loadAgentAvatars', () => {
  it('грузит не больше AVATAR_CONCURRENCY одновременно', async () => {
    withObjectUrl();
    let сейчас = 0;
    let пик = 0;
    const getBlob = vi.fn(async () => {
      сейчас++;
      пик = Math.max(пик, сейчас);
      await new Promise((r) => setTimeout(r, 5));
      сейчас--;
      return new Blob(['x']);
    });

    await loadAgentAvatars([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { getBlob });

    expect(getBlob).toHaveBeenCalledTimes(10);
    // Ради этого всё и делается: на телефоне 18 параллельных запросов
    // насыщали сеть, и верхние карточки ждали нижних.
    expect(пик).toBeLessThanOrEqual(AVATAR_CONCURRENCY);
  });

  it('идёт по порядку списка: верхние карточки получают фото первыми', async () => {
    withObjectUrl();
    const порядок: number[] = [];
    const getBlob = vi.fn(async (url: string) => {
      порядок.push(Number(url.split('/').pop()));
      return new Blob(['x']);
    });

    await loadAgentAvatars([5, 6, 7, 8], { getBlob });

    expect(порядок.slice(0, AVATAR_CONCURRENCY)).toEqual([5, 6, 7, 8].slice(0, AVATAR_CONCURRENCY));
  });

  it('падение одного фото не отменяет остальные', async () => {
    withObjectUrl();
    const getBlob = vi.fn(async (url: string) => {
      if (url.endsWith('/2')) throw new Error('сеть');
      return new Blob(['x']);
    });

    const r = await loadAgentAvatars([1, 2, 3], { getBlob });

    expect(Object.keys(r).sort()).toEqual(['1', '3']);
  });

  it('пустой ответ (204) — просто нет фото, а не ошибка', async () => {
    withObjectUrl();
    const getBlob = vi.fn(async () => null);
    expect(await loadAgentAvatars([1, 2], { getBlob })).toEqual({});
  });
});
