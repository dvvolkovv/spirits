// @vitest-environment jsdom
//
// Список продуктов — то место, где отказ заведения либо виден человеку, либо
// не виден вовсе. Поэтому тесты здесь смотрят на текст на экране и на
// состояние кнопок, а не на то, какие функции вызвались.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mount,
  click,
  clickAsync,
  doubleClick,
  actAsync,
  flush,
  type,
  byLabel,
  byButton,
  visibleText,
  tRu,
} from '../../test/dom';
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

/** Длинная техническая причина — ровно то, что приходит с машины продуктов. */
const LONG_REASON =
  'Command failed: docker build -t my-shop /srv/products/my-shop\n' +
  'ERROR: failed to solve: process "/bin/sh -c npm ci" did not complete successfully: exit code: 1\n' +
  'npm ERR! code ERESOLVE'.repeat(3);

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue([]);
  api.create.mockResolvedValue({ ok: true, id: 'new-1' });
  api.retry.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductsListView — карточка отказа', () => {
  it('«заводится…» видно, пока продукт разворачивается', async () => {
    api.list.mockResolvedValue([product({ status: 'provisioning' })]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.status.provisioning'));
  });

  it('причина отказа видна целиком, даже длинная и техническая', async () => {
    // Причина приходит с чужой машины и потолка длины у неё нет по замыслу.
    // Обрезанный stderr бесполезен — именно последние строки объясняют отказ.
    api.list.mockResolvedValue([
      product({ status: 'failed', provision_error: LONG_REASON }),
    ]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain('docker build');
    expect(visibleText(container)).toContain('npm ERR! code ERESOLVE');
    expect(visibleText(container)).toContain(tRu('products.failReason'));
  });

  it('отказ без причины не выглядит отказом без объяснения', async () => {
    // Сегодня это норма, а не крайний случай: ProductsService.list() на бэке
    // перечисляет колонки явно и provision_error в перечислении нет, то есть
    // поле не приезжает вовсе. Пустое место на экране читалось бы как
    // «ничего не сломалось».
    api.list.mockResolvedValue([product({ status: 'failed' })]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.failUnknown'));
  });

  it('кнопка «повторить» есть только у сорванного заведения', async () => {
    api.list.mockResolvedValue([
      product({ id: 'p-1', status: 'running' }),
      product({ id: 'p-2', status: 'provisioning' }),
      product({ id: 'p-3', status: 'failed', provision_error: 'порт занят' }),
    ]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    // Ровно одна на три продукта: бэкенд принимает повтор только из failed
    // и на остальных ответил бы 404 «не в состоянии отказа».
    const retries = Array.from(container.querySelectorAll('button')).filter((b) =>
      new RegExp(tRu('products.retry')).test(b.textContent ?? ''),
    );
    expect(retries).toHaveLength(1);
  });
});

describe('ProductsListView — повтор', () => {
  it('повтор переиспользует ту же строку продукта', async () => {
    api.list.mockResolvedValue([product({ id: 'p-7', status: 'failed', provision_error: 'порт занят' })]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);

    // id, а не имя или слаг: заводить продукт заново не нужно, нужно
    // перезапустить заведение той же строки.
    expect(api.retry).toHaveBeenCalledWith('p-7');
  });

  it('после повтора карточка показывает «заводится…», а не прежний отказ', async () => {
    api.list
      .mockResolvedValueOnce([product({ status: 'failed', provision_error: 'порт занят' })])
      .mockResolvedValueOnce([product({ status: 'provisioning' })]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);

    expect(visibleText(container)).toContain(tRu('products.status.provisioning'));
    expect(visibleText(container)).not.toContain('порт занят');
  });

  it('двойное нажатие ставит один повтор, а не два', async () => {
    // Второе задание бэкенд отбил бы по индексу one_active — и пользователь
    // увидел бы «заведение уже идёт» в ответ на собственное первое нажатие.
    let release!: () => void;
    api.retry.mockReturnValue(
      new Promise((res) => {
        release = () => res({ ok: true });
      }),
    );
    api.list.mockResolvedValue([product({ status: 'failed', provision_error: 'порт занят' })]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    // doubleClick, а не два click(): см. комментарий к хелперу — с двумя
    // отдельными act() тест переживал снятие замка (мутация M27).
    doubleClick(byButton(container, new RegExp(tRu('products.retry')))!);

    expect(api.retry).toHaveBeenCalledTimes(1);
    await actAsync(() => release());
  });

  it('пока повтор в полёте, кнопка заблокирована и это видно', async () => {
    let release!: () => void;
    api.retry.mockReturnValue(
      new Promise((res) => {
        release = () => res({ ok: true });
      }),
    );
    api.list.mockResolvedValue([product({ status: 'failed', provision_error: 'порт занят' })]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    click(byButton(container, new RegExp(tRu('products.retry')))!);

    const pending = byButton(container, new RegExp(tRu('products.retrying')))!;
    expect(pending).not.toBeNull();
    expect(pending.disabled).toBe(true);
    await actAsync(() => release());
  });

  it('отказ повтора виден и кнопка снова активна', async () => {
    // Иначе карточка замирает: ни объяснения, ни способа попробовать ещё раз.
    api.list.mockResolvedValue([product({ status: 'failed', provision_error: 'порт занят' })]);
    api.retry.mockResolvedValue({ ok: false, status: 409, message: 'заведение этого продукта уже идёт' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);

    expect(visibleText(container)).toContain(tRu('products.retryErrors.busy'));
    expect(byButton(container, new RegExp(tRu('products.retry')))!.disabled).toBe(false);
  });

  it('обрыв связи при повторе объясняется связью, а не отказом сервера', async () => {
    api.list.mockResolvedValue([product({ status: 'failed', provision_error: 'порт занят' })]);
    api.retry.mockResolvedValue({ ok: false, status: 0, message: '' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);

    expect(visibleText(container)).toContain(tRu('products.new.errors.network'));
  });
});

describe('ProductsListView — заведение', () => {
  it('кнопка «Новый продукт» открывает форму', async () => {
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(byLabel(container, /Название/)).toBeNull();

    click(byButton(container, new RegExp(tRu('products.new.button')))!);

    expect(byLabel(container, /Название/)).not.toBeNull();
  });

  it('заведённый продукт появляется в списке сразу, без перезагрузки страницы', async () => {
    api.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([product({ name: 'Магазин цветов', status: 'provisioning' })]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    click(byButton(container, new RegExp(tRu('products.new.button')))!);
    type(byLabel(container, /Название/)!, 'Магазин цветов');
    type(byLabel(container, /Адрес/)!, 'my-shop');
    await clickAsync(byButton(container, new RegExp(tRu('products.new.submit')))!);

    expect(api.create).toHaveBeenCalledWith({
      name: 'Магазин цветов',
      slug: 'my-shop',
      kind: 'site',
      secrets: {},
    });
    expect(visibleText(container)).toContain('Магазин цветов');
    expect(visibleText(container)).toContain(tRu('products.status.provisioning'));
    // Форма закрылась: поля исчезли, значит второй продукт случайно не завести.
    expect(byLabel(container, /Адрес/)).toBeNull();
  });

  it('занятый адрес объясняется, а форма остаётся с введённым', async () => {
    api.create.mockResolvedValue({ ok: false, status: 409, message: 'слаг уже занят' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    click(byButton(container, new RegExp(tRu('products.new.button')))!);
    type(byLabel(container, /Название/)!, 'Магазин цветов');
    type(byLabel(container, /Адрес/)!, 'my-shop');
    await clickAsync(byButton(container, new RegExp(tRu('products.new.submit')))!);

    expect(visibleText(container)).toContain(tRu('products.new.errors.slugTaken'));
    // Введённое на месте: адрес меняется одним словом, а закрытая форма
    // означала бы ввод заново.
    expect(byLabel(container, /Адрес/)!.value).toBe('my-shop');
  });

  it('текст отказа 400 с сервера доходит до экрана как есть', async () => {
    // Это единственный случай, где серверная формулировка полезнее нашей:
    // она про конкретное поле («имя секрета … не переменная окружения»).
    api.create.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'секрет BOT_TOKEN: значение должно быть непустой строкой',
    });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    click(byButton(container, new RegExp(tRu('products.new.button')))!);
    type(byLabel(container, /Название/)!, 'Магазин');
    type(byLabel(container, /Адрес/)!, 'my-shop');
    await clickAsync(byButton(container, new RegExp(tRu('products.new.submit')))!);

    expect(visibleText(container)).toContain('секрет BOT_TOKEN');
  });

  it('переключение на бота убирает адрес и спрашивает токен', async () => {
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    click(byButton(container, new RegExp(tRu('products.new.button')))!);
    click(byButton(container, new RegExp(tRu('products.new.kind.bot')))!);

    expect(byLabel(container, /Адрес/)).toBeNull();
    expect(byLabel(container, /Токен бота/)).not.toBeNull();
  });

  it('введённый токен не переживает переключение формы продукта', async () => {
    // Секрет не должен оставаться в состоянии вкладки после того, как
    // человек передумал заводить бота.
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    click(byButton(container, new RegExp(tRu('products.new.button')))!);
    click(byButton(container, new RegExp(tRu('products.new.kind.bot')))!);
    type(byLabel(container, /Токен бота/)!, '123:AAA');
    click(byButton(container, new RegExp(tRu('products.new.kind.site')))!);
    click(byButton(container, new RegExp(tRu('products.new.kind.bot')))!);

    expect(byLabel(container, /Токен бота/)!.value).toBe('');
  });
});

describe('ProductsListView — список сам догоняет состояние', () => {
  it('пока продукт заводится, список перечитывается без действий пользователя', async () => {
    // Заведение идёт на другой машине, сообщить о себе в открытую вкладку
    // некому: без опроса «Заводится…» висит все десять минут срока и
    // неотличимо от зависания.
    vi.useFakeTimers();
    api.list
      .mockResolvedValueOnce([product({ status: 'provisioning' })])
      .mockResolvedValue([product({ status: 'running' })]);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.status.provisioning'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(visibleText(container)).toContain(tRu('products.status.running'));
  });

  it('у готового продукта опрос не крутится вхолостую', async () => {
    vi.useFakeTimers();
    api.list.mockResolvedValue([product({ status: 'running' })]);
    mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(api.list).toHaveBeenCalledTimes(1);

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(api.list).toHaveBeenCalledTimes(1);
  });
});
