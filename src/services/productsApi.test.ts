import { describe, it, expect, vi, beforeEach } from 'vitest';
import { productsApi } from './productsApi';
import { apiClient } from './apiClient';

vi.mock('./apiClient', () => ({
  apiClient: {
    get: vi.fn(async () => ({ ok: true, json: async () => [] })),
    post: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    fetchStream: vi.fn(async () => null),
    // Поток хода открывается через request, а не через fetchStream: тот отдаёт
    // null на любом не-2xx и теряет вместе с ним и код, и причину отказа.
    request: vi.fn(async () => ({ ok: true, body: { getReader: () => READER } })),
  },
}));

/** Читатель потока — подменять его настоящим незачем, важна лишь его выдача. */
const READER = { read: async () => ({ done: true, value: undefined }) };

/**
 * Минимальный ответ вместо настоящего Response: заглушка типизирована
 * сигнатурой apiClient, а собирать полноценный Response ради двух полей
 * незачем.
 */
function res(init: {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  headers?: Headers;
}): Response {
  return init as unknown as Response;
}

/** Ответ со списком и вердиктом про сервер продуктов в заголовке. */
const listRes = (rows: unknown[], hostAgent?: string) =>
  res({
    ok: true,
    json: async () => rows,
    headers: hostAgent === undefined ? undefined : new Headers({ 'X-Host-Agent': hostAgent }),
  });

describe('productsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('список продуктов', async () => {
    await productsApi.list();

    expect(apiClient.get).toHaveBeenCalledWith('/webhook/products');
  });

  it('отказ списка отличим от пустого списка', async () => {
    // Бэкенд может ответить не-2xx: сеть, протухший токен, рестарт при
    // выкате. Прежде это отдавало [] наравне с настоящим пустым списком, и
    // кабинет объявлял «продуктов нет» посреди идущего заведения.
    vi.mocked(apiClient.get).mockResolvedValueOnce(res({ ok: false, status: 502 }));

    await expect(productsApi.list()).resolves.toBeNull();
  });

  it('настоящий пустой список остаётся пустым списком', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(listRes([], 'live'));

    await expect(productsApi.list()).resolves.toEqual({ rows: [], hostAgent: 'live' });
  });

  it('молчащий сервер продуктов доезжает до кабинета', async () => {
    // Без этого владелец узнаёт о мёртвом сервере только через десять минут и
    // с неверной причиной — «срок заведения истёк».
    vi.mocked(apiClient.get).mockResolvedValueOnce(listRes([{ id: 'p-1' }], 'silent'));

    await expect(productsApi.list()).resolves.toEqual({
      rows: [{ id: 'p-1' }],
      hostAgent: 'silent',
    });
  });

  it('ответ без вердикта — это «неизвестно», а не тревога', async () => {
    // Так отвечает бэкенд, выкаченный до этой доработки, и так выглядит
    // ответ, из которого прокси срезал незнакомый заголовок.
    vi.mocked(apiClient.get).mockResolvedValueOnce(listRes([{ id: 'p-1' }]));

    await expect(productsApi.list()).resolves.toEqual({
      rows: [{ id: 'p-1' }],
      hostAgent: null,
    });
  });

  it('незнакомое слово в заголовке в состояние кабинета не подставляется', async () => {
    // Заголовок приходит по сети. `as HostAgentState` пустил бы в состояние
    // компонента что угодно, и сравнение `=== 'silent'` начало бы зависеть от
    // опечатки на сервере.
    vi.mocked(apiClient.get).mockResolvedValueOnce(listRes([], 'LIVE'));

    await expect(productsApi.list()).resolves.toEqual({ rows: [], hostAgent: null });
  });

  it('ответ без заголовков список не стирает', async () => {
    // Вердикт — приписка к ответу, а не сам ответ. Чтение заголовка у ответа
    // без заголовков бросает TypeError, его глотает общий catch — и список
    // продуктов пропадает с экрана из-за пометки о чужой машине.
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      res({ ok: true, json: async () => [{ id: 'p-1' }] }),
    );

    await expect(productsApi.list()).resolves.toEqual({
      rows: [{ id: 'p-1' }],
      hostAgent: null,
    });
  });

  it('200 с HTML (SPA-фолбэк) не роняет список и не выдаёт себя за пустой', async () => {
    // На этом хостинге любой путь отдаёт 200 с index.html. res.json() на
    // такой странице бросает — без перехвата отказ улетал бы необработанным
    // промисом прямо из обработчика кнопки.
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      res({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );

    await expect(productsApi.list()).resolves.toBeNull();
  });

  it('не-массив в теле успешного ответа тоже отказ, а не пустой список', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      res({ ok: true, json: async () => ({ statusCode: 200 }) }),
    );

    await expect(productsApi.list()).resolves.toBeNull();
  });

  it('обрыв связи при чтении списка не выбрасывается наружу', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(productsApi.list()).resolves.toBeNull();
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
    const started = await productsApi.chatStream('p-1', 'поправь футер');

    expect(apiClient.request).toHaveBeenCalledWith(
      '/webhook/products/p-1/chat',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(started).toEqual({ ok: true, reader: READER });
  });

  it('промпт уходит в теле, а не в адресе', async () => {
    await productsApi.chatStream('p-1', 'поправь футер');

    const init = vi.mocked(apiClient.request).mock.calls[0][1] as any;
    expect(JSON.parse(init.body)).toEqual({ prompt: 'поправь футер' });
  });

  it('отказ спящему продукту доезжает кодом и текстом, а не пустотой', async () => {
    // Главный дефект этой ветки: fetchStream отдавал null на любом не-2xx, и
    // компоненту оставалось подставить одну формулировку на все случаи — он
    // подставлял «агент занят». Владелец спящего продукта видел враньё.
    vi.mocked(apiClient.request).mockResolvedValueOnce(
      res({
        ok: false,
        status: 402,
        json: async () => ({
          message: 'Продукт спит: не хватило токенов на аренду. Пополните баланс — продукт проснётся сам.',
        }),
      }) as any,
    );

    await expect(productsApi.chatStream('p-1', 'поправь футер')).resolves.toEqual({
      ok: false,
      status: 402,
      message: 'Продукт спит: не хватило токенов на аренду. Пополните баланс — продукт проснётся сам.',
    });
  });

  it('не-JSON тело отказа хода не роняет разбор', async () => {
    // 502 от nginx приходит HTML-страницей: код настоящий, причина пустая.
    vi.mocked(apiClient.request).mockResolvedValueOnce(
      res({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Unexpected token <');
        },
      }) as any,
    );

    await expect(productsApi.chatStream('p-1', 'правка')).resolves.toEqual({
      ok: false,
      status: 502,
      message: '',
    });
  });

  it('обрыв связи при ходе становится отказом со статусом 0, а не исключением', async () => {
    // apiClient пробрасывает обрыв и неудачный refresh наружу; без перехвата
    // отказ вылетел бы из обработчика кнопки необработанным промисом.
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(productsApi.chatStream('p-1', 'правка')).resolves.toEqual({
      ok: false,
      status: 0,
      message: '',
    });
  });

  it('успешный ответ без тела не выдаёт себя за поток', async () => {
    // Так выглядит ответ прокси, срезавшего поток: 2xx, читать нечего.
    vi.mocked(apiClient.request).mockResolvedValueOnce(res({ ok: true, status: 200 }) as any);

    await expect(productsApi.chatStream('p-1', 'правка')).resolves.toEqual({
      ok: false,
      status: 200,
      message: '',
    });
  });

  it('идентификаторы экранируются', async () => {
    // Слэш в id незаметно увёл бы запрос на чужой маршрут. Значения приходят
    // от бэкенда, но экранировать дешевле, чем доказывать, что туда ничего
    // не попадёт.
    await productsApi.revert('p/1', 't/1');

    expect(apiClient.post).toHaveBeenCalledWith('/webhook/products/p%2F1/turns/t%2F1/revert');
  });
});
