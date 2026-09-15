// @vitest-environment jsdom
//
// ВРЕМЕННЫЙ ФАЙЛ РЕВЬЮ. Каждый тест здесь КРАСНЕЕТ на 9b6d648 и показывает
// дефект. Удалить после починки (или превратить в постоянные тесты).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, click, clickAsync, actAsync, flush, visibleText, byButton, tRu } from '../../test/dom';
import { ProductsListView } from './ProductsListView';
import { productsApi } from '../../services/productsApi';
import type { Product } from '../../services/productsApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

vi.mock('../../services/productsApi', () => ({
  productsApi: {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ ok: true, id: 'new-1' })),
    retry: vi.fn(async () => ({ ok: true })),
  },
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

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue([]);
  api.create.mockResolvedValue({ ok: true, id: 'new-1' });
  api.retry.mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe('ДЕФЕКТ 1 — замок повтора один на весь список', () => {
  it('повтор второго сорванного продукта, пока идёт первый, молчит совсем', async () => {
    // Два продукта падают вместе — это норма, а не крайний случай: они падают
    // от одной причины на одной машине. Замок retryBusy один на компонент,
    // а disabled вешается только на кнопку того продукта, что в полёте.
    // Кнопка второго активна, нажатие уходит в `return` — ни запроса, ни
    // сообщения. Это тот самый тихий отказ, ради которого переписан черновик.
    let release!: () => void;
    api.retry.mockImplementation(
      () =>
        new Promise((res) => {
          release = () => res({ ok: true });
        }),
    );
    api.list.mockResolvedValue([
      product({ id: 'p-1', status: 'failed', provision_error: 'порт занят' }),
      product({ id: 'p-2', name: 'Второй', status: 'failed', provision_error: 'порт занят' }),
    ]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    const buttons = Array.from(container.querySelectorAll('button')).filter((b) =>
      new RegExp(tRu('products.retry')).test(b.textContent ?? ''),
    );
    expect(buttons).toHaveLength(2);

    click(buttons[0]);
    // Кнопка второго продукта на экране активна — значит она обещает работу.
    const second = Array.from(container.querySelectorAll('button')).filter((b) =>
      new RegExp(tRu('products.retry')).test(b.textContent ?? ''),
    )[0];
    expect(second.disabled).toBe(false);

    await clickAsync(second);

    // Обещание не выполнено: запроса нет.
    expect(api.retry).toHaveBeenCalledTimes(2);
    await actAsync(() => release());
  });
});

describe('ДЕФЕКТ 2 — одна неудачная перечитка стирает список и глушит опрос', () => {
  it('срыв опроса не должен показывать «продуктов нет» и не должен убивать опрос', async () => {
    // productsApi.list() отдаёт [] на любой не-2xx: рестарт API при выкате,
    // 502 от nginx, протухший токен. Пока продукт заводится, опрос идёт раз
    // в 5 секунд — попасть в такой ответ почти неизбежно. После него:
    // products = [] → пустой экран «У вас пока нет продуктов»;
    // anyProvisioning = false → интервал снят навсегда.
    // Заведение на чужой машине продолжается, а вкладка врёт до перезагрузки.
    vi.useFakeTimers();
    api.list
      .mockResolvedValueOnce([product({ status: 'provisioning' })])
      .mockResolvedValueOnce([]) // мигнул 502
      .mockResolvedValue([product({ status: 'running' })]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.status.provisioning'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    // Первое: экран не должен объявлять, что продуктов нет.
    expect(visibleText(container)).not.toContain(tRu('products.empty'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    // Второе: опрос обязан был дожить до ответа «работает».
    expect(visibleText(container)).toContain(tRu('products.status.running'));
  });
});

describe('ДЕФЕКТ 3 — пятисотка показывается по-английски', () => {
  it('500 от сервера объясняется по-русски, а не строкой Nest', async () => {
    // Глобального фильтра исключений на бэке нет: неперехваченная ошибка даёт
    // {"statusCode":500,"message":"Internal server error"}. explain() берёт
    // p.message как есть — и русскоязычный владелец читает английскую строку
    // фреймворка. Наш текст products.new.errors.rejected при этом лежит рядом
    // неиспользованным.
    api.create.mockResolvedValue({ ok: false, status: 500, message: 'Internal server error' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    click(byButton(container, new RegExp(tRu('products.new.button')))!);
    const inputs = Array.from(container.querySelectorAll('input'));
    const setVal = (el: HTMLInputElement, v: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await actAsync(() => {
      setVal(inputs[0], 'Магазин');
      setVal(inputs[1], 'my-shop');
    });
    await clickAsync(byButton(container, new RegExp(tRu('products.new.submit')))!);

    expect(visibleText(container)).not.toContain('Internal server error');
  });
});

describe('ДЕФЕКТ 4 — 409 у бота советует поправить то, чего нет', () => {
  it('занятый слаг бота не должен требовать «выберите другой адрес»', async () => {
    // Слаг бота выводится автоматически, поля адреса у бота на форме нет.
    // Совет «выберите другой» предлагает действие, недоступное на экране;
    // правильное действие — просто нажать «Создать» ещё раз (хвост слага
    // перегенерируется).
    api.create.mockResolvedValue({ ok: false, status: 409, message: 'слаг уже занят' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    click(byButton(container, new RegExp(tRu('products.new.button')))!);
    click(byButton(container, new RegExp(tRu('products.new.kind.bot')))!);
    const inputs = Array.from(container.querySelectorAll('input'));
    const setVal = (el: HTMLInputElement, v: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    await actAsync(() => {
      setVal(inputs[0], 'Магазин цветов');
      setVal(inputs[1], '123:AAA');
    });
    await clickAsync(byButton(container, new RegExp(tRu('products.new.submit')))!);

    expect(visibleText(container)).not.toContain(tRu('products.new.errors.slugTaken'));
  });
});
