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

/**
 * Минимальный ответ вместо настоящего Response: заглушка типизирована
 * сигнатурой apiClient, а собирать полноценный Response ради двух полей
 * незачем.
 */
function res(init: {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}): Response {
  return init as unknown as Response;
}

describe('productsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('список продуктов', async () => {
    await productsApi.list();

    expect(apiClient.get).toHaveBeenCalledWith('/webhook/products');
  });

  it('пустой ответ не роняет список', async () => {
    // Бэкенд может ответить не-2xx: сеть, протухший токен, деплой.
    // Кабинет должен показать пустой список, а не упасть.
    vi.mocked(apiClient.get).mockResolvedValueOnce(res({ ok: false }));

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

  it('заведение продукта уходит POST-ом со всем телом', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(res({
      ok: true,
      json: async () => ({ id: 'p-9' }),
    }));

    const r = await productsApi.create({
      name: 'Магазин цветов',
      slug: 'my-shop',
      kind: 'site',
      secrets: {},
    });

    expect(apiClient.post).toHaveBeenCalledWith('/webhook/products', {
      name: 'Магазин цветов',
      slug: 'my-shop',
      kind: 'site',
      secrets: {},
    });
    expect(r).toEqual({ ok: true, id: 'p-9' });
  });

  it('секрет бота уезжает телом, а не в адресе', async () => {
    // Адрес попадает в лог nginx, в историю браузера и в Referer. Тело —
    // никуда, кроме сервера.
    vi.mocked(apiClient.post).mockResolvedValueOnce(res({
      ok: true,
      json: async () => ({ id: 'p-9' }),
    }));

    await productsApi.create({
      name: 'Бот',
      slug: 'bot-ab12cd',
      kind: 'bot',
      secrets: { BOT_TOKEN: '123:SECRET' },
    });

    const [url, body] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).not.toContain('123:SECRET');
    expect((body as { secrets: Record<string, string> }).secrets).toEqual({
      BOT_TOKEN: '123:SECRET',
    });
  });

  it('занятый слаг возвращается кодом и текстом, а не исключением', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(res({
      ok: false,
      status: 409,
      json: async () => ({ statusCode: 409, message: 'слаг уже занят' }),
    }));

    await expect(
      productsApi.create({ name: 'Магазин', slug: 'my-shop', kind: 'site', secrets: {} }),
    ).resolves.toEqual({ ok: false, status: 409, message: 'слаг уже занят' });
  });

  it('список нарушений от ValidationPipe склеивается в одну строку', async () => {
    // ValidationPipe отдаёт message МАССИВОМ. String(массив) дал бы 'a,b'
    // без пробела, а объект — '[object Object]' на экране пользователя.
    vi.mocked(apiClient.post).mockResolvedValueOnce(res({
      ok: false,
      status: 400,
      json: async () => ({ message: ['slug must match /…/', 'name should not be empty'] }),
    }));

    const r = await productsApi.create({ name: '', slug: '!', kind: 'site', secrets: {} });

    expect(r).toMatchObject({
      ok: false,
      status: 400,
      message: 'slug must match /…/; name should not be empty',
    });
  });

  it('не-JSON тело отказа не роняет разбор', async () => {
    // 502 от nginx приходит HTML-страницей: res.json() на ней бросает.
    // Код при этом настоящий, и потерять его нельзя — по нему решают, что
    // показать человеку.
    vi.mocked(apiClient.post).mockResolvedValueOnce(res({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }));

    await expect(
      productsApi.create({ name: 'Магазин', slug: 'my-shop', kind: 'site', secrets: {} }),
    ).resolves.toEqual({ ok: false, status: 502, message: '' });
  });

  it('обрыв связи становится отказом со статусом 0, а не исключением', async () => {
    // apiClient пробрасывает обрыв наружу. Необработанный промис в
    // обработчике кнопки — это форма, замершая без объяснения.
    vi.mocked(apiClient.post).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(
      productsApi.create({ name: 'Магазин', slug: 'my-shop', kind: 'site', secrets: {} }),
    ).resolves.toEqual({ ok: false, status: 0, message: '' });
  });

  it('повтор бьёт в свой маршрут и экранирует id', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(res({ ok: true, json: async () => ({}) }));

    await expect(productsApi.retry('p/1')).resolves.toEqual({ ok: true });
    expect(apiClient.post).toHaveBeenCalledWith('/webhook/products/p%2F1/retry');
  });

  it('отказ повтора возвращается кодом, а не бросается', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(res({
      ok: false,
      status: 409,
      json: async () => ({ message: 'заведение этого продукта уже идёт' }),
    }));

    await expect(productsApi.retry('p-1')).resolves.toEqual({
      ok: false,
      status: 409,
      message: 'заведение этого продукта уже идёт',
    });
  });

  it('обрыв связи при повторе тоже не исключение', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(productsApi.retry('p-1')).resolves.toEqual({
      ok: false,
      status: 0,
      message: '',
    });
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
