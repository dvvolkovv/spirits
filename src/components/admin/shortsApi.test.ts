import { describe, it, expect, vi, beforeEach } from 'vitest';

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { post, get } }));

import { ShortsApiError, callShorts, loadAgents } from './shortsApi';

const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('callShorts', () => {
  it('шлёт действие в admin/shorts и отдаёт тело', async () => {
    post.mockResolvedValue(res(200, [{ id: 's1' }]));
    expect(await callShorts({ action: 'list' })).toEqual([{ id: 's1' }]);
    expect(post).toHaveBeenCalledWith('/webhook/admin/shorts', { action: 'list' });
  });

  it('отказ — текст сервера, код ответа и машинный код', async () => {
    post.mockResolvedValue(res(409, {
      statusCode: 409, error: 'version_conflict', message: 'Ролик изменился, пока был открыт: на экране устаревшая версия',
    }));
    const e = await callShorts({ action: 'approve' }).catch((x) => x);
    expect(e).toBeInstanceOf(ShortsApiError);
    expect(e).toMatchObject({ status: 409, code: 'version_conflict', message: 'Ролик изменился, пока был открыт: на экране устаревшая версия' });
  });

  it('тело не json — «сервер ответил N»', async () => {
    post.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError('html'); } });
    await expect(callShorts({ action: 'list' })).rejects.toMatchObject({ status: 502, message: 'сервер ответил 502' });
  });
});

describe('loadAgents', () => {
  it('активные ассистенты на русском; кривые строки и сбой — мимо', async () => {
    get.mockResolvedValue(res(200, [{ id: 10, name: 'Алексей', displayName: 'Алексей — юрист' }, { id: 'x' }]));
    expect(await loadAgents()).toEqual([{ id: 10, name: 'Алексей', displayName: 'Алексей — юрист' }]);
    expect(get).toHaveBeenCalledWith('/webhook/agents?lang=ru');
    get.mockRejectedValue(new Error('offline'));
    expect(await loadAgents()).toEqual([]);
  });
});
