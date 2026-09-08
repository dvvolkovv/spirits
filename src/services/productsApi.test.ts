import { describe, it, expect, vi, beforeEach } from 'vitest';
import { productsApi } from './productsApi';
import { apiClient } from './apiClient';

vi.mock('./apiClient', () => ({
  apiClient: {
    get: vi.fn(async () => ({ ok: true, json: async () => [] })),
    post: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    fetchStream: vi.fn(async () => null),
  },
}));

describe('productsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('список продуктов', async () => {
    await productsApi.list();

    expect(apiClient.get).toHaveBeenCalledWith('/webhook/products');
  });

  it('пустой ответ не роняет список', async () => {
    // Бэкенд может ответить не-2xx: сеть, протухший токен, деплой.
    // Кабинет должен показать пустой список, а не упасть.
    vi.mocked(apiClient.get).mockResolvedValueOnce({ ok: false } as any);

    await expect(productsApi.list()).resolves.toEqual([]);
  });

  it('история ходов запрашивается у своего продукта', async () => {
    await productsApi.turns('p-1');

    expect(apiClient.get).toHaveBeenCalledWith('/webhook/products/p-1/turns');
  });

  it('идентификатор продукта экранируется и в истории', async () => {
    // turns() экранирует id отдельным вызовом enc() — предыдущий кейс с
    // 'p-1' не ловит мутацию «убрать enc», потому что дефис не меняется
    // при encodeURIComponent. Слэш меняется.
    await productsApi.turns('p/1');

    expect(apiClient.get).toHaveBeenCalledWith('/webhook/products/p%2F1/turns');
  });

  it('откат идёт POST-ом на конкретный ход', async () => {
    await productsApi.revert('p-1', 't-1');

    expect(apiClient.post).toHaveBeenCalledWith('/webhook/products/p-1/turns/t-1/revert');
  });

  it('чат открывает поток, а не обычный запрос', async () => {
    // Ход агента идёт минутами и течёт событиями. Обычный post отдал бы
    // клиенту всё разом в конце либо оборвался по таймауту прокси.
    await productsApi.chatStream('p-1', 'поправь футер');

    expect(apiClient.fetchStream).toHaveBeenCalledWith(
      '/webhook/products/p-1/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('промпт уходит в теле, а не в адресе', async () => {
    await productsApi.chatStream('p-1', 'поправь футер');

    const init = vi.mocked(apiClient.fetchStream).mock.calls[0][1] as any;
    expect(JSON.parse(init.body)).toEqual({ prompt: 'поправь футер' });
  });

  it('идентификаторы экранируются', async () => {
    // Слэш в id незаметно увёл бы запрос на чужой маршрут. Значения приходят
    // от бэкенда, но экранировать дешевле, чем доказывать, что туда ничего
    // не попадёт.
    await productsApi.revert('p/1', 't/1');

    expect(apiClient.post).toHaveBeenCalledWith('/webhook/products/p%2F1/turns/t%2F1/revert');
  });
});
