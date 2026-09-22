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
  byLink,
  visibleText,
  tRu,
} from '../../test/dom';
import { ProductsListView } from './ProductsListView';
import { productsApi } from '../../services/productsApi';
import type { HostAgentState, Product } from '../../services/productsApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

// Баланс приезжает из общего auth-стейта (его опрашивает AuthContext раз в
// пять секунд). Через vi.hoisted, потому что фабрика vi.mock поднимается
// наверх файла и до обычного let не дотянулась бы.
const auth = vi.hoisted(() => ({ tokens: undefined as number | undefined }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { tokens: auth.tokens } }),
}));

vi.mock('../../services/productsApi', () => ({
  productsApi: {
    // Форма ответа — та же, что у настоящего list(): строки плюс вердикт про
    // сервер продуктов. Литерал, а не хелпер `listing` ниже: фабрика vi.mock
    // поднимается наверх файла и до объявления хелпера не дотянется.
    list: vi.fn(async () => ({ rows: [], hostAgent: 'live' })),
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

/**
 * Ответ сервера на запрос списка.
 *
 * Вердикт про сервер продуктов по умолчанию «живой»: иначе баннер тревоги
 * подмешивался бы в каждый сценарий про карточки и отказы, и проверки по
 * видимому тексту начали бы ловить его вместо того, что проверяют.
 */
const listing = (rows: Product[], hostAgent: HostAgentState = 'live') => ({ rows, hostAgent });

/**
 * Месячная аренда так, как её печатает компонент.
 *
 * Именно Intl, а не литерал «50 000»: в русском формате разряды разделяет
 * неразрывный пробел, и утверждение с обычным пробелом краснело бы на
 * совпадающем с виду тексте.
 */
const RENT_AMOUNT = new Intl.NumberFormat('ru').format(50_000);

/** Начало строки про срок — по нему видно, что строка вообще напечатана. */
const PAID_UNTIL_PREFIX = tRu('products.rent.paidUntil', { date: '' }).trim();

/**
 * Причина сна, пришедшая с сервера.
 *
 * Нарочно НЕ совпадает со своей строкой `products.rent.sleepingWhy`: пока
 * фикстура повторяла её слово в слово, тест зеленел и с выброшенным полем
 * `sleep_reason` — проверено мутацией. Настоящий бэкенд сегодня шлёт ровно
 * свою формулировку, но проверяем мы здесь не её текст, а то, что текст
 * сервера доезжает до экрана.
 */
const SERVER_SLEEP_REASON = 'Не хватило токенов на аренду с 16 сентября';

/**
 * За что погашен — текст, пришедший с сервера.
 *
 * Как и причина сна выше, нарочно НЕ совпадает ни с одной своей строкой: пока
 * фикстура повторяла запасную формулировку слово в слово, тест зеленел и с
 * выброшенным полем. Настоящие причины пишет администратор руками, то есть
 * предсказуемого текста у них нет вовсе.
 */
const SERVER_BLOCK_REASON = 'Жалоба на содержимое: продажа рецептурных лекарств';

/** Длинная техническая причина — ровно то, что приходит с машины продуктов. */
const LONG_REASON =
  'Command failed: docker build -t my-shop /srv/products/my-shop\n' +
  'ERROR: failed to solve: process "/bin/sh -c npm ci" did not complete successfully: exit code: 1\n' +
  'npm ERR! code ERESOLVE'.repeat(3);

/**
 * Кнопка ВНУТРИ пустого состояния, а не та, что в шапке.
 *
 * Ищется по блоку с объяснением, а не «вторая кнопка с такой надписью»: счёт
 * кнопок на экране — свойство вёрстки шапки, а не пустого состояния, и тест на
 * него краснел бы от правки, к делу не относящейся.
 */
function emptyStateCta(container: HTMLElement): HTMLButtonElement | null {
  const block = Array.from(container.querySelectorAll('div')).filter((d) =>
    (d.textContent ?? '').includes(tRu('products.emptyWhat')),
  ).pop();
  return block ? byButton(block, new RegExp(tRu('products.new.button'))) : null;
}

/** Открыть форму, заполнить поля сайта и нажать «Создать». */
async function fillSite(container: HTMLElement, name: string, slug: string) {
  click(byButton(container, new RegExp(tRu('products.new.button')))!);
  type(byLabel(container, /Название/)!, name);
  type(byLabel(container, /Адрес/)!, slug);
  await clickAsync(byButton(container, new RegExp(tRu('products.new.submit')))!);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue(listing([]));
  api.create.mockResolvedValue({ ok: true, id: 'new-1' });
  api.retry.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductsListView — карточка отказа', () => {
  it('«заводится…» видно, пока продукт разворачивается', async () => {
    api.list.mockResolvedValue(listing([product({ status: 'provisioning' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.status.provisioning'));
  });

  it('причина отказа видна целиком, даже длинная и техническая', async () => {
    // Причина приходит с чужой машины и потолка длины у неё нет по замыслу.
    // Обрезанный stderr бесполезен — именно последние строки объясняют отказ.
    api.list.mockResolvedValue(listing([
      product({ status: 'failed', provision_error: LONG_REASON }),
    ]));
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
    api.list.mockResolvedValue(listing([product({ status: 'failed' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.failUnknown'));
  });

  it('кнопка «повторить» есть только у сорванного заведения', async () => {
    api.list.mockResolvedValue(listing([
      product({ id: 'p-1', status: 'running' }),
      product({ id: 'p-2', status: 'provisioning' }),
      product({ id: 'p-3', status: 'failed', provision_error: 'порт занят' }),
    ]));
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
    api.list.mockResolvedValue(listing([product({ id: 'p-7', status: 'failed', provision_error: 'порт занят' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);

    // id, а не имя или слаг: заводить продукт заново не нужно, нужно
    // перезапустить заведение той же строки.
    expect(api.retry).toHaveBeenCalledWith('p-7');
  });

  it('после повтора карточка показывает «заводится…», а не прежний отказ', async () => {
    api.list
      .mockResolvedValueOnce(listing([product({ status: 'failed', provision_error: 'порт занят' })]))
      .mockResolvedValueOnce(listing([product({ status: 'provisioning' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);

    expect(visibleText(container)).toContain(tRu('products.status.provisioning'));
    expect(visibleText(container)).not.toContain('порт занят');
  });

  it('повтор второго сорванного продукта не ждёт первого', async () => {
    // Продукты падают пачками: они падают от одной причины на одной машине.
    // Один замок на весь список означал, что кнопка второго активна, а
    // нажатие уходит в return — ни запроса, ни сообщения. Тот же тихий
    // отказ, ради которого переписана форма, только в соседнем месте.
    let release!: () => void;
    api.retry.mockImplementation(
      () =>
        new Promise((res) => {
          release = () => res({ ok: true });
        }),
    );
    api.list.mockResolvedValue(listing([
      product({ id: 'p-1', status: 'failed', provision_error: 'порт занят' }),
      product({ id: 'p-2', name: 'Второй', status: 'failed', provision_error: 'порт занят' }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    const retries = () =>
      Array.from(container.querySelectorAll('button')).filter((b) =>
        new RegExp(tRu('products.retry')).test(b.textContent ?? ''),
      );
    expect(retries()).toHaveLength(2);

    click(retries()[0]);
    // Кнопка второго обещает работу — значит обязана её делать.
    const second = retries()[0];
    expect(second.disabled).toBe(false);
    await clickAsync(second);

    expect(api.retry).toHaveBeenCalledTimes(2);
    await actAsync(() => release());
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
    api.list.mockResolvedValue(listing([product({ status: 'failed', provision_error: 'порт занят' })]));
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
    api.list.mockResolvedValue(listing([product({ status: 'failed', provision_error: 'порт занят' })]));
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
    api.list.mockResolvedValue(listing([product({ status: 'failed', provision_error: 'порт занят' })]));
    api.retry.mockResolvedValue({ ok: false, status: 409, message: 'заведение этого продукта уже идёт' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);

    expect(visibleText(container)).toContain(tRu('products.retryErrors.busy'));
    expect(byButton(container, new RegExp(tRu('products.retry')))!.disabled).toBe(false);
  });

  it('обрыв связи при повторе объясняется связью, а не отказом сервера', async () => {
    api.list.mockResolvedValue(listing([product({ status: 'failed', provision_error: 'порт занят' })]));
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
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(listing([product({ name: 'Магазин цветов', status: 'provisioning' })]));
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

describe('ProductsListView — неудачная перечитка', () => {
  it('срыв перечитки не стирает список и не глушит опрос', async () => {
    // list() отдаёт null на любой не-2xx: рестарт API при выкате, 502,
    // протухший токен. Опрос раз в пять секунд все десять минут срока
    // попадает в такой ответ почти неизбежно. Прежде после него: пустой
    // список → экран «продуктов нет» → заводящихся нет → интервал снят
    // навсегда. Заведение шло, вкладка врала.
    vi.useFakeTimers();
    api.list
      .mockResolvedValueOnce(listing([product({ status: 'provisioning' })]))
      .mockResolvedValueOnce(null)
      .mockResolvedValue(listing([product({ status: 'running' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.status.provisioning'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(visibleText(container)).not.toContain(tRu('products.empty'));
    expect(visibleText(container)).toContain(tRu('products.status.provisioning'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(visibleText(container)).toContain(tRu('products.status.running'));
  });

  it('о неудачной перечитке говорят прямо, а не молча показывают старое', async () => {
    api.list.mockResolvedValue(null);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.loadFailed'));
    // И не объявляют заодно, что продуктов нет: этого никто не проверял.
    expect(visibleText(container)).not.toContain(tRu('products.empty'));
  });

  it('кнопка «обновить» перечитывает список', async () => {
    api.list.mockResolvedValueOnce(null).mockResolvedValue(listing([product({ name: 'Магазин цветов' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.reload')))!);

    expect(visibleText(container)).toContain('Магазин цветов');
    expect(visibleText(container)).not.toContain(tRu('products.loadFailed'));
  });

  it('настоящий пустой ответ по-прежнему показывает «продуктов нет»', async () => {
    // Иначе починка предыдущего дефекта скрыла бы законное пустое состояние.
    api.list.mockResolvedValue(listing([]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.empty'));
    expect(visibleText(container)).not.toContain(tRu('products.loadFailed'));
  });
});

describe('ProductsListView — отказы объясняются по-русски', () => {
  it('пятисотка не показывает английскую строку Nest', async () => {
    // Глобального фильтра исключений на бэке нет: неперехваченная ошибка
    // приходит как {"message":"Internal server error"}.
    api.create.mockResolvedValue({ ok: false, status: 500, message: 'Internal server error' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await fillSite(container, 'Магазин', 'my-shop');

    expect(visibleText(container)).not.toContain('Internal server error');
    expect(visibleText(container)).toContain(tRu('products.new.errors.rejected'));
  });

  it('пятисотка при повторе тоже объясняется по-русски', async () => {
    api.list.mockResolvedValue(listing([product({ status: 'failed', provision_error: 'порт занят' })]));
    api.retry.mockResolvedValue({ ok: false, status: 500, message: 'Internal server error' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);

    expect(visibleText(container)).not.toContain('Internal server error');
    expect(visibleText(container)).toContain(tRu('products.retryErrors.failed'));
  });

  it('обрыв связи при заведении объясняется связью, а не отказом сервера', async () => {
    // Ветка нулевого статуса у заведения не была покрыта ничем: мутация
    // «обрыв объявляется отказом сервера» пережила первую батарею.
    api.create.mockResolvedValue({ ok: false, status: 0, message: '' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await fillSite(container, 'Магазин', 'my-shop');

    expect(visibleText(container)).toContain(tRu('products.new.errors.network'));
    expect(visibleText(container)).not.toContain(tRu('products.new.errors.rejected'));
  });

  it('занятое имя бота не советует править адрес, которого нет', async () => {
    // Слаг бота выводится автоматически, поля адреса на форме нет. Совет
    // «выберите другой» предлагал бы действие, недоступное на экране.
    api.create.mockResolvedValue({ ok: false, status: 409, message: 'слаг уже занят' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    click(byButton(container, new RegExp(tRu('products.new.button')))!);
    click(byButton(container, new RegExp(tRu('products.new.kind.bot')))!);
    type(byLabel(container, /Название/)!, 'Магазин цветов');
    type(byLabel(container, /Токен бота/)!, '123:AAA');
    await clickAsync(byButton(container, new RegExp(tRu('products.new.submit')))!);

    expect(visibleText(container)).not.toContain(tRu('products.new.errors.slugTaken'));
    expect(visibleText(container)).toContain(tRu('products.new.errors.slugTakenBot'));
  });
});

describe('ProductsListView — карточка продукта', () => {
  it('отказ покрашен в красное, а не в общий серый', async () => {
    // Единственный статус, требующий действия. Тем же серым он читался бы
    // как ещё одно спокойное состояние.
    api.list.mockResolvedValue(listing([product({ status: 'failed', provision_error: 'порт занят' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    const badge = Array.from(container.querySelectorAll('span')).find((el) =>
      new RegExp(tRu('products.status.failed')).test(el.textContent ?? ''),
    )!;
    expect(badge.className).toContain('text-red-600');
  });

  it('клик по продукту открывает его', async () => {
    const opened: string[] = [];
    api.list.mockResolvedValue(listing([product({ id: 'p-5', name: 'Магазин цветов' })]));
    const { container } = mount(<ProductsListView onOpen={(p) => opened.push(p.id)} />);
    await flush();

    click(byButton(container, /Магазин цветов/)!);

    expect(opened).toEqual(['p-5']);
  });

  it('прошлая ошибка повтора гаснет на новом нажатии', async () => {
    api.list.mockResolvedValue(listing([product({ status: 'failed', provision_error: 'порт занят' })]));
    api.retry.mockResolvedValueOnce({ ok: false, status: 409, message: '' });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);
    expect(visibleText(container)).toContain(tRu('products.retryErrors.busy'));

    api.retry.mockResolvedValue({ ok: true });
    await clickAsync(byButton(container, new RegExp(tRu('products.retry')))!);

    expect(visibleText(container)).not.toContain(tRu('products.retryErrors.busy'));
  });
});

describe('ProductsListView — список сам догоняет состояние', () => {
  it('пока продукт заводится, список перечитывается без действий пользователя', async () => {
    // Заведение идёт на другой машине, сообщить о себе в открытую вкладку
    // некому: без опроса «Заводится…» висит все десять минут срока и
    // неотличимо от зависания.
    vi.useFakeTimers();
    api.list
      .mockResolvedValueOnce(listing([product({ status: 'provisioning' })]))
      .mockResolvedValue(listing([product({ status: 'running' })]));
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
    api.list.mockResolvedValue(listing([product({ status: 'running' })]));
    mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(api.list).toHaveBeenCalledTimes(1);

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(api.list).toHaveBeenCalledTimes(1);
  });
});

describe('ProductsListView — сервер продуктов молчит', () => {
  it('о молчащем сервере говорят сразу, а не через десять минут', async () => {
    // Сегодняшний путь без предупреждения: карточка встаёт в «Заводится…», и
    // через десять минут владелец читает «срок заведения истёк» — причина
    // неверная, забирать задание было некому.
    api.list.mockResolvedValue(listing([product({ status: 'provisioning' })], 'silent'));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.hostAgentSilent'));
  });

  it('живой сервер о себе не напоминает', async () => {
    api.list.mockResolvedValue(listing([product({ status: 'provisioning' })], 'live'));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).not.toContain(tRu('products.hostAgentSilent'));
  });

  it('молчание сервера о вердикте тревогой не считается', async () => {
    // Так отвечает бэкенд, выкаченный до этой доработки, и так выглядит ответ,
    // из которого прокси срезал незнакомый заголовок. Кабинет обязан молчать
    // там, где сам ничего не знает.
    api.list.mockResolvedValue(listing([product({ status: 'provisioning' })], null));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).not.toContain(tRu('products.hostAgentSilent'));
  });

  it('предупреждение видно ДО нажатия «Создать», без единого продукта', async () => {
    // Пустой список — это первое нажатие кнопки, то есть ровно тот момент,
    // ради которого предупреждение написано. Вердикт, приклеенный к строке
    // продукта, здесь не показался бы вовсе: строк нет.
    api.list.mockResolvedValue(listing([], 'silent'));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.hostAgentSilent'));
    // И законное пустое состояние при этом не пропадает.
    expect(visibleText(container)).toContain(tRu('products.empty'));
  });

  it('кнопка заведения остаётся рабочей: это предупреждение, а не запрет', async () => {
    // Вердикт — состояние чужой машины с точностью до двух минут; сервер мог
    // перезапускаться ровно в эту секунду, а задание живёт в очереди и
    // достаётся ему сразу после возвращения. Цена ложного запрета —
    // введённая заново форма вместе с токеном бота, который в ней не хранится.
    api.list.mockResolvedValue(listing([], 'silent'));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await fillSite(container, 'Магазин', 'my-shop');

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Магазин', slug: 'my-shop' }),
    );
  });

  it('предупреждение гаснет само, когда сервер возвращается', async () => {
    // Тревога, которую нечем погасить, залипает: сервер возвращается через
    // полминуты, а на экране висит прежний текст до перезагрузки вкладки.
    // Поэтому опрос идёт и при молчащем сервере, а не только при заводящемся
    // продукте.
    vi.useFakeTimers();
    api.list
      .mockResolvedValueOnce(listing([product({ status: 'running' })], 'silent'))
      .mockResolvedValue(listing([product({ status: 'running' })], 'live'));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.hostAgentSilent'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(visibleText(container)).not.toContain(tRu('products.hostAgentSilent'));
  });

  it('обрыв связи не гасит и не выдумывает тревогу', async () => {
    // Неудачный запрос — это отсутствие ответа, а не ответ «сервер молчит».
    // Погашенная своим же обрывом тревога — то же враньё, что и выдуманная.
    vi.useFakeTimers();
    api.list
      .mockResolvedValueOnce(listing([product({ status: 'provisioning' })], 'silent'))
      .mockResolvedValue(null);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(visibleText(container)).toContain(tRu('products.hostAgentSilent'));
    expect(visibleText(container)).toContain(tRu('products.loadFailed'));
  });
});

/**
 * Аренда в карточке. Всё здесь — про видимое: дата на экране, объяснение сна,
 * тревога ровно тогда, когда для неё есть обе причины.
 */
describe('ProductsListView — аренда', () => {
  it('срок оплаты показан датой, а не «осталось N дней»', async () => {
    // Вкладка кабинета висит открытой сутками: «осталось 2 дня» протухает
    // молча и начинает врать, дата — нет.
    api.list.mockResolvedValue(listing([product({ paid_until: '2026-10-05T10:00:00Z' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.rent.paidUntil', { date: '05.10.2026' }));
    expect(visibleText(container)).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  it('срока нет — карточка молчит, а не показывает «Invalid Date»', async () => {
    // Пустой срок бывает у бэкенда, выкаченного до аренды. Выдумывать дату
    // нельзя: это единственное место, где владелец её узнаёт.
    api.list.mockResolvedValue(listing([product({ paid_until: null })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).not.toContain(PAID_UNTIL_PREFIX);
    expect(visibleText(container)).not.toContain('Invalid Date');
    expect(visibleText(container)).toContain('Магазин цветов');
  });

  it('нечитаемый срок тоже молчит, а не течёт на экран', async () => {
    // SPA-фолбэк этого хостинга умеет отдать 200 с чем угодно.
    //
    // Проверяется отсутствие ВСЕЙ строки, а не слова «Invalid Date»: со снятым
    // разбором нечитаемой даты на экран выезжает «Оплачено до NaN.NaN.NaN», и
    // тест про «Invalid Date» остался бы зелёным (проверено мутацией).
    api.list.mockResolvedValue(listing([product({ paid_until: 'позавчера' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).not.toContain(PAID_UNTIL_PREFIX);
    expect(visibleText(container)).not.toContain('NaN');
    expect(visibleText(container)).not.toContain('Invalid Date');
    expect(visibleText(container)).not.toContain('позавчера');
  });

  it('спящий продукт объясняет причину с сервера и зовёт пополнить', async () => {
    auth.tokens = 0;
    api.list.mockResolvedValue(listing([
      product({ status: 'sleeping', sleep_reason: SERVER_SLEEP_REASON }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.status.sleeping'));
    expect(visibleText(container)).toContain(SERVER_SLEEP_REASON);
    const topUp = byLink(container, new RegExp(tRu('products.rent.topUp')))!;
    expect(topUp).toBeTruthy();
    expect(topUp.getAttribute('href')).toBe('/chat?view=tokens');
  });

  it('спящий без причины не остаётся без объяснения', async () => {
    // sleep_reason пустой у старого бэкенда и у продукта, усыплённого без
    // записи причины: «Спит» в одиночку не объясняет ничего.
    auth.tokens = 0;
    api.list.mockResolvedValue(listing([product({ status: 'sleeping', sleep_reason: null })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.rent.sleepingWhy'));
    expect(visibleText(container)).toContain(
      tRu('products.rent.wakeHint', { amount: RENT_AMOUNT }),
    );
  });

  it('сон покрашен не тем же серым, что «остановлен»', async () => {
    // Сон не кончится сам: без действия владельца он навсегда. Общим серым он
    // читался бы как ещё одно спокойное состояние.
    auth.tokens = 0;
    api.list.mockResolvedValue(listing([product({ status: 'sleeping' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    const badge = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent === tRu('products.status.sleeping'),
    )!;
    expect(badge.className).toContain('text-amber-600');
  });

  it('пополненный баланс обещает пробуждение, а не просит пополнить ещё раз', async () => {
    // Сервер подметает спящих раз в минуту и будит сам. Просить деньги второй
    // раз — прямая неправда, молчать — оставить владельца гадать.
    auth.tokens = 50_000;
    api.list.mockResolvedValue(listing([product({ status: 'sleeping', sleep_reason: SERVER_SLEEP_REASON })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.rent.waking'));
    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))).toBeNull();
    expect(visibleText(container)).not.toContain(tRu('products.rent.wakeHint', { amount: RENT_AMOUNT }));
  });

  it('денег ровно на месяц уже хватает — это пробуждение, а не отказ', async () => {
    // Граница взята у бэкенда: wakeAffordable считает места как
    // баланс / RENT_TOKENS, то есть ровно 50 000 — это одно место.
    auth.tokens = 50_000 - 1;
    api.list.mockResolvedValue(listing([product({ status: 'sleeping' })]));
    const { container, rerender } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(visibleText(container)).not.toContain(tRu('products.rent.waking'));

    auth.tokens = 50_000;
    rerender(<ProductsListView onOpen={() => {}} />);

    expect(visibleText(container)).toContain(tRu('products.rent.waking'));
  });

  it('предупреждение молчит, когда срок близко, но денег хватает', async () => {
    auth.tokens = 200_000;
    api.list.mockResolvedValue(listing([
      product({ paid_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('предупреждение молчит, когда денег мало, но списание нескоро', async () => {
    // Тревога без причины приучает её не замечать: до списания месяц, за него
    // баланс пополнится десять раз.
    auth.tokens = 0;
    api.list.mockResolvedValue(listing([
      product({ paid_until: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('предупреждение появляется, когда сошлись оба условия', async () => {
    auth.tokens = 0;
    const soon = new Date(Date.now() + 24 * 3600 * 1000);
    api.list.mockResolvedValue(listing([product({ paid_until: soon.toISOString() })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    const date = new Intl.DateTimeFormat('ru', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(soon);
    expect(visibleText(container)).toContain(tRu('products.rent.soonWarning', { date }));
    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))!.getAttribute('href')).toBe(
      '/chat?view=tokens',
    );
  });

  it('неизвестный баланс не тревожит', async () => {
    // Профиль ещё не доехал. Кабинет уже однажды учился не пугать там, где сам
    // ничего не знает, — на вердикте про сервер продуктов.
    auth.tokens = undefined;
    api.list.mockResolvedValue(listing([
      product({ paid_until: new Date(Date.now() + 3600 * 1000).toISOString() }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('просроченный срок предупреждает, а не молчит', async () => {
    // Сборщик аренды ходит раз в сутки: между `paid_until` и его оборотом
    // продукт ещё работает, и это последний момент, когда сон можно
    // предотвратить.
    auth.tokens = 0;
    api.list.mockResolvedValue(listing([
      product({ paid_until: new Date(Date.now() - 3600 * 1000).toISOString() }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('карточка сорванного заведения сроком не отвлекает', async () => {
    // Там важны причина и кнопка повтора; аренда к незаведённому продукту ещё
    // не относится — платят только running и degraded.
    auth.tokens = 0;
    api.list.mockResolvedValue(listing([
      product({ status: 'failed', provision_error: 'порт занят', paid_until: '2026-10-05T10:00:00Z' }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).not.toContain(tRu('products.rent.paidUntil', { date: '05.10.2026' }));
    expect(visibleText(container)).toContain('порт занят');
  });

  it('спящий продукт с деньгами догоняет пробуждение сам, без перезагрузки', async () => {
    // Пробуждение идёт на другой машине и сообщить о себе в открытую вкладку
    // некому — ровно та же история, что с «Заводится…».
    auth.tokens = 50_000;
    vi.useFakeTimers();
    api.list
      .mockResolvedValueOnce(listing([product({ status: 'sleeping' })]))
      .mockResolvedValue(listing([product({ status: 'running' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.status.sleeping'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(visibleText(container)).toContain(tRu('products.status.running'));
  });

  it('блокированный продукт не показывает срок аренды', async () => {
    // Аренду с него не берут вовсе: chargeRent отбирает
    // `status IN ('running','degraded')`. «Оплачено до 05.10.2026» в карточке
    // погашенного продукта — срок, по которому ничего не случится.
    auth.tokens = 0;
    api.list.mockResolvedValue(listing([
      product({ status: 'blocked', block_reason: SERVER_BLOCK_REASON, paid_until: '2026-10-05T10:00:00Z' }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).not.toContain(PAID_UNTIL_PREFIX);
  });

  it('спящий без денег опрос не крутит: ждать нечего', async () => {
    // Пока баланс не пополнен, состояние не изменится — продукт мог бы
    // пролежать так месяц. Перечитку включит сам баланс: его AuthContext
    // тянет раз в пять секунд, и своего опроса за ним здесь не заведено.
    auth.tokens = 0;
    vi.useFakeTimers();
    api.list.mockResolvedValue(listing([product({ status: 'sleeping' })]));
    mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    expect(api.list).toHaveBeenCalledTimes(1);

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(api.list).toHaveBeenCalledTimes(1);
  });
});

/**
 * Продукт погашен администратором.
 *
 * Здесь владелец узнаёт единственное, что ему вообще доступно узнать: общего
 * списка продуктов у администратора нет, уведомлений кусок 4б не делает.
 * Карточка — единственный источник правды, и главное в ней — чего в ней НЕТ.
 */
describe('ProductsListView — продукт погашен администратором', () => {
  it('статус назван, а причина показана текстом сервера', async () => {
    api.list.mockResolvedValue(listing([
      product({ status: 'blocked', block_reason: SERVER_BLOCK_REASON }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.status.blocked'));
    expect(visibleText(container)).toContain(SERVER_BLOCK_REASON);
  });

  it('причина не доехала — владелец всё равно не остаётся ни с чем', async () => {
    // Сервер без непустой причины гасить отказывается (400), но поля может не
    // быть у бэкенда, выкаченного до 007, и у ответа, из которого колонку
    // срезали. «Остановлен администратором» в одиночку не объясняет ничего и
    // отправляет владельца искать поломку у себя.
    api.list.mockResolvedValue(listing([product({ status: 'blocked', block_reason: null })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.blocked.unknownReason'));
  });

  it('кнопки пополнения у блокированного нет — ни одной', async () => {
    // ГЛАВНЫЙ СЦЕНАРИЙ ЭТОГО ФАЙЛА. Условия подобраны так, чтобы ссылка на
    // пополнение полезла сама: денег нет И срок списания завтра — ровно то
    // сочетание, при котором карточка работающего продукта зажигает тревогу
    // с кнопкой. Пополнение блокированного НЕ будит (wakeAffordable отбирает
    // строго 'sleeping'), то есть кнопка собрала бы деньги ни за что.
    auth.tokens = 0;
    api.list.mockResolvedValue(listing([
      product({
        status: 'blocked',
        block_reason: SERVER_BLOCK_REASON,
        paid_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    // И ссылкой, и кнопкой: сегодня пополнение — это <a href>, но проверка
    // только по ссылке пережила бы превращение её в <button onClick>.
    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))).toBeNull();
    expect(byButton(container, new RegExp(tRu('products.rent.topUp')))).toBeNull();
    expect(visibleText(container)).not.toContain(tRu('products.rent.wakeHint', { amount: RENT_AMOUNT }));
    expect(visibleText(container)).toContain(tRu('products.blocked.noTopUp'));
  });

  it('единственное доступное действие названо и ведёт в поддержку', async () => {
    // Снять блокировку владелец не может ничем. «Напишите нам» без места, куда
    // нажать, — совет сделать недоступное; /support это живой раздел заявок.
    api.list.mockResolvedValue(listing([
      product({ status: 'blocked', block_reason: SERVER_BLOCK_REASON }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    const link = byLink(container, new RegExp(tRu('products.blocked.contact')))!;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/support');
  });

  it('блокировка покрашена не общим серым', async () => {
    // Серым покрашен 'stopped' — «остановлен», то есть решение самого
    // владельца. Гашение администратором тем же цветом читалось бы как его
    // собственное действие, которого он не совершал.
    api.list.mockResolvedValue(listing([product({ status: 'blocked', block_reason: 'проба' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    const badge = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent === tRu('products.status.blocked'),
    )!;
    expect(badge.className).toContain('text-red-600');
    expect(badge.className).not.toContain('text-gray-400');
  });

  it('соседний спящий продукт пополнить по-прежнему зовут', async () => {
    // Сторож от починки «в одну сторону»: убрать пополнение у всех подряд —
    // это тоже «у блокированного кнопки нет».
    auth.tokens = 0;
    api.list.mockResolvedValue(listing([
      product({ id: 'p-1', status: 'blocked', block_reason: SERVER_BLOCK_REASON }),
      product({ id: 'p-2', name: 'Второй', status: 'sleeping', sleep_reason: SERVER_SLEEP_REASON }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(byLink(container, new RegExp(tRu('products.rent.topUp')))).toBeTruthy();
    expect(visibleText(container)).toContain(SERVER_BLOCK_REASON);
    expect(visibleText(container)).toContain(SERVER_SLEEP_REASON);
  });
});

/**
 * ПУСТОЙ КАБИНЕТ.
 *
 * С этого куска вкладка открыта всем, и первым этот экран увидит человек без
 * продуктов, без токенов и без единого платежа. На нём он решает, платить или
 * уйти, — значит экран обязан ответить, что это, сколько стоит и что нажать.
 */
describe('ProductsListView — пустой кабинет', () => {
  it('объясняет, что такое продукт', async () => {
    api.list.mockResolvedValue(listing([]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.empty'));
    expect(visibleText(container)).toContain(tRu('products.emptyWhat'));
  });

  it('называет цену до того, как человек вложил работу', async () => {
    // Иначе цену он узнает через месяц — когда продукт уснёт за неуплату.
    api.list.mockResolvedValue(listing([]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).toContain(tRu('products.emptyPrice', { amount: RENT_AMOUNT }));
    // Ровно то же число, что в подсказке спящему продукту: два разных на одном
    // экране разъехались бы молча.
    expect(visibleText(container)).toContain(RENT_AMOUNT);
  });

  it('заводит продукт прямо из пустого состояния', async () => {
    // Кнопка шапки на десктопе уезжает в правый угол, то есть в сторону от
    // текста, который человек только что прочитал.
    api.list.mockResolvedValue(listing([]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    const cta = emptyStateCta(container)!;
    expect(cta).toBeTruthy();
    click(cta);

    expect(byLabel(container, /Название/)).not.toBeNull();
  });

  it('витрина не подменяет собой отказ загрузки', async () => {
    // Объявлять «продуктов нет» и тут же рассказывать, почём они, человеку, у
    // которого продукты есть, а список не доехал, — худшее из двух враний.
    api.list.mockResolvedValue(null);
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).not.toContain(tRu('products.emptyWhat'));
    expect(visibleText(container)).toContain(tRu('products.loadFailed'));
  });

  it('у владельца продуктов витрины нет', async () => {
    // Объяснение «что это такое» и цена нужны ровно один раз. Над списком
    // заведённых продуктов это шум.
    api.list.mockResolvedValue(listing([product({ name: 'Магазин цветов' })]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    expect(visibleText(container)).not.toContain(tRu('products.emptyWhat'));
    expect(visibleText(container)).not.toContain(tRu('products.emptyPrice', { amount: RENT_AMOUNT }));
  });
});

/**
 * ПРЕДЕЛ ЧИСЛА ПРОДУКТОВ НА АККАУНТ.
 *
 * Вкладка открыта всем, а машина под клиентские продукты рассчитана на два
 * десятка — поэтому у аккаунта появился предел. Сервер отдаёт его 422-м, и код
 * выбран НЕ ПО ВКУСУ, а по тому, как разбирает коды этот самый файл: 409 здесь
 * означает «адрес занят» и текст сервера игнорирует, всё `>= 500` глушится
 * своей формулировкой. 422 — единственный код, попадающий в ветку с
 * сообщением сервера, и этот сценарий её удерживает.
 */
describe('ProductsListView — предел аккаунта', () => {
  it('отказ по пределу показывается текстом сервера, а не своей заглушкой', async () => {
    const REFUSAL =
      'Предел — 2 продукта на один аккаунт, и он уже занят. ' +
      'Напишите нам, если нужно больше: поднимем предел вашему аккаунту.';
    api.create.mockResolvedValue({ ok: false, status: 422, message: REFUSAL });
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();

    await fillSite(container, 'Третий', 'ss-c');

    expect(visibleText(container)).toContain(REFUSAL);
    // Ни «Этот адрес уже занят» (там лечение — сменить адрес), ни «Сервер не
    // принял продукт» (там лечения нет вовсе).
    expect(visibleText(container)).not.toContain(tRu('products.new.errors.slugTaken'));
    expect(visibleText(container)).not.toContain(tRu('products.new.errors.rejected'));
  });
});
