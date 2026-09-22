// @vitest-environment jsdom
//
// Чат правок — то место, где отказ сервера либо доезжает до владельца, либо
// подменяется выдумкой. До этой батареи он подменялся ВСЕГДА: apiClient
// .fetchStream отдавал null на любом не-2xx, теряя и код, и тело, а компонент
// подставлял «агент уже работает над предыдущим запросом». Поэтому тесты здесь
// смотрят на текст на экране и на доступность поля ввода.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, type, clickAsync, byButton, byLink, visibleText, tRu } from '../../test/dom';
import { ProductChat } from './ProductChat';
import { productsApi } from '../../services/productsApi';
import type { Product } from '../../services/productsApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const auth = vi.hoisted(() => ({ tokens: undefined as number | undefined }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { tokens: auth.tokens } }),
}));

vi.mock('../../services/productsApi', () => ({
  productsApi: { chatStream: vi.fn() },
}));

const api = vi.mocked(productsApi);

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    name: 'Магазин цветов',
    slug: 'my-shop',
    status: 'running',
    domain: null,
    runner_seen_at: null,
    created_at: '2026-09-15T10:00:00Z',
    ...over,
  };
}

/** Поток NDJSON, нарезанный ровно так, как его отдаёт сеть. */
function reader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    read: async () =>
      i < chunks.length
        ? { done: false, value: encoder.encode(chunks[i++]) }
        : { done: true, value: undefined },
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

/** Ввести правку и нажать «Отправить». */
async function send(container: HTMLElement, text = 'поправь заголовок') {
  type(container.querySelector('input')!, text);
  await clickAsync(byButton(container, new RegExp(tRu('products.chat.send')))!);
}

/** Текст отказа спящему продукту — слово в слово из turns.service.ts. */
const SLEEPING_REFUSAL =
  'Продукт спит: не хватило токенов на аренду. Пополните баланс — продукт проснётся сам.';

/**
 * Причина сна с сервера. Нарочно не совпадает со своей строкой
 * `products.rent.sleepingWhy`: иначе тест зеленеет и с выброшенным полем
 * `sleep_reason` — ровно это и случилось в соседней батарее.
 */
const SERVER_SLEEP_REASON = 'Не хватило токенов на аренду с 16 сентября';

beforeEach(() => {
  vi.clearAllMocks();
  auth.tokens = undefined;
});

describe('ProductChat — отказ доезжает до экрана', () => {
  it('спящему продукту сервер объясняет причину, а не «агент занят»', async () => {
    api.chatStream.mockResolvedValue({ ok: false, status: 402, message: SLEEPING_REFUSAL });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    expect(visibleText(container)).toContain(SLEEPING_REFUSAL);
    expect(visibleText(container)).not.toContain(tRu('products.chat.busy'));
  });

  it('отказ про деньги показан вместе со ссылкой на пополнение', async () => {
    // Текста «пополните баланс» без места, куда нажать, владельцу
    // недостаточно: пополнение живёт на другом экране.
    api.chatStream.mockResolvedValue({ ok: false, status: 402, message: SLEEPING_REFUSAL });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    const topUp = byLink(container, new RegExp(tRu('products.rent.topUp')))!;
    expect(topUp).toBeTruthy();
    expect(topUp.getAttribute('href')).toBe('/chat?view=tokens');
  });

  it('пустой баланс объясняется деньгами — это отказ, который врал уже сегодня', async () => {
    // 402 «Недостаточно токенов» существует в проде давно и всё это время
    // показывался как «агент уже работает над предыдущим запросом».
    api.chatStream.mockResolvedValue({ ok: false, status: 402, message: 'Недостаточно токенов' });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    expect(visibleText(container)).toContain('Недостаточно токенов');
    expect(visibleText(container)).not.toContain(tRu('products.chat.busy'));
  });

  it('402 без тела объясняется деньгами, а не занятым агентом', async () => {
    // 502 от nginx приходит HTML-страницей, и причина остаётся пустой —
    // код при этом настоящий.
    api.chatStream.mockResolvedValue({ ok: false, status: 402, message: '' });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    expect(visibleText(container)).toContain(tRu('products.chat.sleeping'));
    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))).toBeTruthy();
  });

  it('занятый агент остаётся занятым агентом', async () => {
    // 409 — замок product_turns_one_active, и теперь это ОДИН случай, а не
    // свалка из всех отказов сразу.
    api.chatStream.mockResolvedValue({ ok: false, status: 409, message: '' });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    expect(visibleText(container)).toContain(tRu('products.chat.busy'));
    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))).toBeNull();
  });

  it('обрыв связи объясняется связью, а не отказом сервера', async () => {
    api.chatStream.mockResolvedValue({ ok: false, status: 0, message: '' });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    expect(visibleText(container)).toContain(tRu('products.new.errors.network'));
  });

  it('пятисотка не показывает английскую строку Nest', async () => {
    // Глобального фильтра исключений на бэке нет: неперехваченная ошибка
    // приходит как {"message":"Internal server error"}.
    api.chatStream.mockResolvedValue({
      ok: false,
      status: 500,
      message: 'Internal server error',
    });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    expect(visibleText(container)).toContain(tRu('products.chat.failed'));
    expect(visibleText(container)).not.toContain('Internal server error');
  });

  it('после отказа можно попробовать снова: поле не заперто', async () => {
    api.chatStream.mockResolvedValue({ ok: false, status: 402, message: SLEEPING_REFUSAL });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    expect(container.querySelector('input')!.disabled).toBe(false);
    type(container.querySelector('input')!, 'ещё раз');
    expect(byButton(container, new RegExp(tRu('products.chat.send')))!.disabled).toBe(false);
  });

  it('новая отправка гасит прежний отказ', async () => {
    api.chatStream.mockResolvedValueOnce({ ok: false, status: 402, message: SLEEPING_REFUSAL });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);
    await send(container);
    expect(visibleText(container)).toContain(SLEEPING_REFUSAL);

    api.chatStream.mockResolvedValue({
      ok: true,
      reader: reader(['{"type":"item","content":"готово"}\n']),
    });
    await send(container, 'ещё раз');

    expect(visibleText(container)).not.toContain(SLEEPING_REFUSAL);
    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))).toBeNull();
  });
});

describe('ProductChat — поток не сломан', () => {
  it('ответ агента доезжает на экран по мере хода', async () => {
    // Сторож главного: разбор отказов не должен трогать сам поток. NDJSON
    // режется границами чанков ровно так же, как в сети.
    api.chatStream.mockResolvedValue({
      ok: true,
      reader: reader([
        '{"type":"begin"}\n{"type":"item","content":"Заголовок ',
        'поправил"}\n{"type":"end"}',
      ]),
    });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    expect(visibleText(container)).toContain('Заголовок поправил');
  });

  it('ошибка внутри потока видна владельцу', async () => {
    api.chatStream.mockResolvedValue({
      ok: true,
      reader: reader(['{"type":"error","message":"агент не смог собрать проект"}\n']),
    });
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    await send(container);

    expect(visibleText(container)).toContain('агент не смог собрать проект');
  });
});

describe('ProductChat — спящий продукт', () => {
  it('объясняет сон и зовёт пополнить ДО отправки', async () => {
    auth.tokens = 0;
    const { container } = mount(
      <ProductChat
        product={product({ status: 'sleeping', sleep_reason: SERVER_SLEEP_REASON })}
        onTurnFinished={() => {}}
      />,
    );

    expect(visibleText(container)).toContain(tRu('products.status.sleeping'));
    expect(visibleText(container)).toContain(SERVER_SLEEP_REASON);
    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))!.getAttribute('href')).toBe(
      '/chat?view=tokens',
    );
  });

  it('правку всё равно можно отправить: это объяснение, а не замок', async () => {
    // Статус здесь — снимок, сделанный в момент открытия продукта: ProductsSection
    // его не перечитывает. Погашенная кнопка заперла бы продукт, разбуженный
    // пять минут назад, и владелец не отличил бы это от поломки.
    auth.tokens = 0;
    api.chatStream.mockResolvedValue({
      ok: true,
      reader: reader(['{"type":"item","content":"уже не сплю"}\n']),
    });
    const { container } = mount(
      <ProductChat product={product({ status: 'sleeping' })} onTurnFinished={() => {}} />,
    );
    expect(container.querySelector('input')!.disabled).toBe(false);

    await send(container);

    expect(visibleText(container)).toContain('уже не сплю');
  });

  it('с пополненным балансом обещает пробуждение, а не просит денег', async () => {
    auth.tokens = 50_000;
    const { container } = mount(
      <ProductChat
        product={product({ status: 'sleeping', sleep_reason: SERVER_SLEEP_REASON })}
        onTurnFinished={() => {}}
      />,
    );

    expect(visibleText(container)).toContain(tRu('products.rent.waking'));
    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))).toBeNull();
  });

  it('работающий продукт про сон не поминает', async () => {
    auth.tokens = 0;
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    expect(visibleText(container)).not.toContain(tRu('products.status.sleeping'));
    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))).toBeNull();
  });
});

/**
 * Погашенный администратором продукт.
 *
 * В чат правок владелец попадает из списка, где причина уже объяснена, — но
 * попадает он туда именно затем, чтобы поправить продукт. Экран обязан
 * сказать, что правки не примут, ДО отправки: иначе правда приходит 409-м уже
 * после того, как владелец сформулировал задачу.
 */
describe('ProductChat — продукт погашен администратором', () => {
  const SERVER_BLOCK_REASON = 'Жалоба на содержимое: продажа рецептурных лекарств';

  it('объясняет блокировку причиной сервера ДО отправки', async () => {
    auth.tokens = 0;
    const { container } = mount(
      <ProductChat
        product={product({ status: 'blocked', block_reason: SERVER_BLOCK_REASON })}
        onTurnFinished={() => {}}
      />,
    );

    expect(visibleText(container)).toContain(tRu('products.status.blocked'));
    expect(visibleText(container)).toContain(SERVER_BLOCK_REASON);
  });

  it('пополнить не предлагает — деньги его не будят', async () => {
    // Баланс пустой, то есть соблазн показать «Пополнить» максимальный. Ровно
    // поэтому бэкенд отбивает правку блокированного 409-м, а не 402-м: 402
    // зажигает эту кнопку ниже, в разборе отказа.
    auth.tokens = 0;
    const { container } = mount(
      <ProductChat
        product={product({ status: 'blocked', block_reason: SERVER_BLOCK_REASON })}
        onTurnFinished={() => {}}
      />,
    );

    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))).toBeNull();
    expect(visibleText(container)).toContain(tRu('products.blocked.noTopUp'));
    expect(byLink(container, new RegExp(tRu('products.blocked.contact')))!.getAttribute('href')).toBe(
      '/support',
    );
  });

  it('причина не доехала — объяснение всё равно есть', async () => {
    auth.tokens = 0;
    const { container } = mount(
      <ProductChat
        product={product({ status: 'blocked', block_reason: null })}
        onTurnFinished={() => {}}
      />,
    );

    expect(visibleText(container)).toContain(tRu('products.blocked.unknownReason'));
  });

  it('работающий продукт про блокировку не поминает', async () => {
    auth.tokens = 0;
    const { container } = mount(<ProductChat product={product()} onTurnFinished={() => {}} />);

    expect(visibleText(container)).not.toContain(tRu('products.status.blocked'));
    expect(visibleText(container)).not.toContain(tRu('products.blocked.noTopUp'));
  });
});
