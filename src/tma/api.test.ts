import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getJson, postJson, putForm, getBlob } from './api';
import { apiClient } from '../services/apiClient';

function resp(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => vi.restoreAllMocks());

describe('getJson', () => {
  it('разбирает тело успешного ответа', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(resp(200, { tokens: 42 }));
    expect(await getJson('/webhook/user/tokens/')).toEqual({ tokens: 42 });
  });

  it('бросает на неуспешном статусе', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(resp(500, {}));
    await expect(getJson('/x')).rejects.toThrow('HTTP 500');
  });

  it('бросает, если тело не JSON', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new Error('bad json'); },
    } as any);
    await expect(getJson('/x')).rejects.toThrow();
  });
});

describe('postJson', () => {
  it('передаёт тело и разбирает ответ', async () => {
    const spy = vi.spyOn(apiClient, 'post').mockResolvedValue(resp(200, { ok: true }));
    expect(await postJson('/webhook/change-agent', { agent_id: 'a' })).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('/webhook/change-agent', { agent_id: 'a' });
  });
});

describe('putForm', () => {
  it('шлёт FormData через request, а не через put', async () => {
    // apiClient.put жёстко ставит Content-Type: application/json и делает
    // JSON.stringify — FormData через него не проходит.
    const spy = vi.spyOn(apiClient, 'request').mockResolvedValue(resp(200, { ok: true }));
    const fd = new FormData();
    await putForm('/webhook/avatar', fd);
    expect(spy).toHaveBeenCalledWith('/webhook/avatar', { method: 'PUT', body: fd });
  });
});

describe('getBlob', () => {
  // /webhook/avatar отдаёт либо байты картинки, либо 204 без тела — не JSON.
  it('возвращает blob на успешном ответе', async () => {
    const blob = new Blob(['x']);
    vi.spyOn(apiClient, 'get').mockResolvedValue({ ok: true, status: 200, blob: async () => blob } as any);
    expect(await getBlob('/webhook/avatar')).toBe(blob);
  });

  it('возвращает null на 204 (аватар не выставлен)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ ok: true, status: 204, blob: async () => { throw new Error('no body'); } } as any);
    expect(await getBlob('/webhook/avatar')).toBeNull();
  });

  it('возвращает null на неуспешном статусе, не бросает', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ ok: false, status: 500, blob: async () => { throw new Error('x'); } } as any);
    expect(await getBlob('/webhook/avatar')).toBeNull();
  });
});
