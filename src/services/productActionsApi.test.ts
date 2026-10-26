import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
import { apiClient } from './apiClient';
import { productActionsApi, isProblem } from './productActionsApi';

const api = vi.mocked(apiClient);
const json = (status: number, body: any) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() }) as any;
const VIEW = { id: 'a1', kind: 'delete', status: 'pending', productId: 'p1', productName: 'М', keyNames: [], expiresAt: null, restoreUntil: null, result: null };

describe('ручки карточки', () => {
  beforeEach(() => vi.clearAllMocks());

  it('get — вид', async () => {
    api.get.mockResolvedValue(json(200, VIEW));
    expect(await productActionsApi.get('a1')).toEqual(VIEW);
    expect(api.get).toHaveBeenCalledWith('/webhook/product-actions/a1');
  });

  it('submit удаления — confirm и источник', async () => {
    api.post.mockResolvedValue(json(200, { ...VIEW, status: 'done' }));
    await productActionsApi.submit('a1', { confirm: true, via: 'chat' });
    expect(api.post).toHaveBeenCalledWith('/webhook/product-actions/a1', { confirm: true, via: 'chat' });
  });

  it('ошибка сервера — Problem, сеть — status 0', async () => {
    api.get.mockResolvedValue(json(404, { message: 'Action not found' }));
    const r = await productActionsApi.get('a1');
    expect(isProblem(r) && r.status).toBe(404);
    api.get.mockRejectedValue(new Error('offline'));
    const n = await productActionsApi.get('a1');
    expect(isProblem(n) && n.status).toBe(0);
  });

  it('pending — массив, при сбое пустой', async () => {
    api.get.mockResolvedValue(json(200, [VIEW]));
    expect(await productActionsApi.pending()).toEqual([VIEW]);
    api.get.mockRejectedValue(new Error('x'));
    expect(await productActionsApi.pending()).toEqual([]);
  });

  it('pending — не-массив в теле тоже даёт пустой список', async () => {
    api.get.mockResolvedValue(json(200, { not: 'an array' }));
    expect(await productActionsApi.pending()).toEqual([]);
  });

  it('pending — !ok в ответе даёт пустой список', async () => {
    api.get.mockResolvedValue(json(404, { message: 'not found' }));
    expect(await productActionsApi.pending()).toEqual([]);
  });

  it('cancel — свой URL', async () => {
    api.post.mockResolvedValue(json(200, { ...VIEW, status: 'cancelled' }));
    await productActionsApi.cancel('a1');
    expect(api.post).toHaveBeenCalledWith('/webhook/product-actions/a1/cancel');
  });

  it('id кодируется в адресе ("a/b" → %2F, не отдельный сегмент пути)', async () => {
    api.get.mockResolvedValue(json(200, { ...VIEW, id: 'a/b' }));
    await productActionsApi.get('a/b');
    expect(api.get).toHaveBeenCalledWith('/webhook/product-actions/a%2Fb');
  });

  // 200 без годного JSON-тела (SPA-фолбэк этого хостинга отдаёт 200 с HTML на
  // любой путь) не должен бросить необработанным исключением из res.json() —
  // карточка обязана получить Problem, а не зависнуть в вечной загрузке.
  it('200 с телом не-JSON — Problem, а не брошенное исключение', async () => {
    const res = { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); }, text: async () => '<html></html>', headers: new Headers() } as any;
    api.get.mockResolvedValue(res);
    const r = await productActionsApi.get('a1');
    expect(isProblem(r) && r.status).toBe(200);
  });

  it('200 с телом, в котором нет годного id ("{}"), — Problem', async () => {
    api.get.mockResolvedValue(json(200, {}));
    const r = await productActionsApi.get('a1');
    expect(isProblem(r) && r.status).toBe(200);
  });
});
