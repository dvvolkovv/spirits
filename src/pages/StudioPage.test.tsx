// @vitest-environment jsdom
/**
 * Вкладка «Продукты» в Студии ОТКРЫТА ВСЕМ.
 *
 * Этот файл — перевёрнутый сторож, а не новый. Вчера он держал ровно обратное:
 * вкладка скрыта от всех, кроме владельца сервиса, в двух местах сразу —
 * и в списке вкладок, и в разборе параметра адреса. Кусок 4б это правило
 * СНИМАЕТ, но удалять сторожа нельзя: снятое правило некому будет заметить,
 * если завтра гейт вернут (например, вместе с откатом соседней правки), —
 * вкладка снова пропадёт у всех, и ни один тест не покраснеет.
 *
 * Мест по-прежнему ДВА, и каждое проверяется отдельно. Половина снятого гейта
 * хуже целого: вкладка в списке при непринимающем разборе даёт кнопку, которая
 * возвращает на ассистентов, — это выглядит поломкой, а не запретом.
 *
 * Проверяется видимое на экране, а не внутреннее состояние: «есть ли слово
 * «Продукты» среди вкладок» и «что нарисовано под ними».
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, click, byButton, tRu } from '../test/dom';
import StudioPage from './StudioPage';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../test/dom');
  return { useTranslation: () => ({ t }) };
});

// Вкладки-соседи заглушены: они тянут свои API и к этой проверке отношения не
// имеют. Заглушки печатают своё имя — по нему видно, что показано на экране.
vi.mock('../components/custom-agents/CustomAgentsListView', () => ({
  CustomAgentsListView: () => <div>СПИСОК-АССИСТЕНТОВ</div>,
}));
vi.mock('../components/tg-bot/TgBotsListView', () => ({
  // Кнопка повторяет указатель из карточки «что это за бот»: по ней видно,
  // какой переход Студия отдала вкладке ботов.
  TgBotsListView: ({ onOpenProducts }: { onOpenProducts?: () => void }) => (
    <div>
      СПИСОК-БОТОВ
      <button onClick={onOpenProducts}>В-ПРОДУКТЫ</button>
    </div>
  ),
}));
vi.mock('../components/products/ProductsSection', () => ({
  ProductsSection: () => <div>РАЗДЕЛ-ПРОДУКТОВ</div>,
}));
// Как и ProductsSection выше: без заглушки реальный компонент тянет
// productActionsApi → apiClient → authService → настоящий i18n/index.ts,
// а там .use(initReactI18next) падает на обрезанном моке react-i18next
// (в нём нет этого экспорта, только useTranslation). К проверкам этого
// файла (кто видит вкладку и что под ней нарисовано) карточки ожидания
// отношения не имеют.
vi.mock('../components/products/PendingProductActions', () => ({
  PendingProductActions: () => <div>ОЖИДАЮЩИЕ-ПОДТВЕРЖДЕНИЯ</div>,
}));

/**
 * Права ОСТАЮТСЯ в заглушке, хотя страница их больше не спрашивает.
 *
 * Это не мусор: сценарии ниже гоняют один и тот же экран и под обычным
 * пользователем, и под администратором. Выкинуть заглушку — значит потерять
 * способ заметить, что гейт вернулся В ЛЮБУЮ сторону (в том числе вывернутым
 * наизнанку: «видно только НЕ администратору»).
 */
let isAdmin = false;
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { isAdmin } }),
}));

let search = '';
const setParams = vi.fn();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(search), setParams],
}));

const tabsLabel = tRu('studio.tabs.products');

afterEach(() => {
  isAdmin = false;
  search = '';
  setParams.mockReset();
});

describe('вкладка «Продукты» в Студии', () => {
  it('вкладка видна обычному пользователю', () => {
    const { container } = mount(<StudioPage />);

    expect(container.textContent).toContain(tabsLabel);
    expect(container.textContent).toContain('СПИСОК-АССИСТЕНТОВ');
  });

  it('?tab=products открывает раздел обычному пользователю', () => {
    // Второе из двух мест. Пока разбор параметра не принимал 'products',
    // видимая вкладка всё равно возвращала бы на ассистентов — сегодня это
    // главный способ сломать открытие наполовину.
    search = 'tab=products';

    const { container } = mount(<StudioPage />);

    expect(container.textContent).toContain('РАЗДЕЛ-ПРОДУКТОВ');
    expect(container.textContent).not.toContain('СПИСОК-АССИСТЕНТОВ');
  });

  it('у администратора ровно то же самое, а не что-то своё', () => {
    // Обратная сторона: правило «видно всем» проверяется с обеих сторон
    // признака. Гейт, вывернутый наизнанку, прошёл бы два сценария выше.
    isAdmin = true;
    search = 'tab=products';

    const { container } = mount(<StudioPage />);

    expect(container.textContent).toContain(tabsLabel);
    expect(container.textContent).toContain('РАЗДЕЛ-ПРОДУКТОВ');
  });

  it('без параметра открыты ассистенты, а не продукты', () => {
    // Сторож от «открыли всем» в смысле «открыли всегда»: продукты — третья
    // вкладка, а не новый экран Студии по умолчанию.
    const { container } = mount(<StudioPage />);

    expect(container.textContent).toContain('СПИСОК-АССИСТЕНТОВ');
    expect(container.textContent).not.toContain('РАЗДЕЛ-ПРОДУКТОВ');
  });

  it('чужая вкладка не ломает экран', () => {
    search = 'tab=чего-то-нет';

    const { container } = mount(<StudioPage />);

    expect(container.textContent).toContain('СПИСОК-АССИСТЕНТОВ');
    expect(container.textContent).not.toContain('РАЗДЕЛ-ПРОДУКТОВ');
  });

  it('вкладка Telegram-ботов не задета снятием гейта', () => {
    // Сторож от «правка задела соседей»: раньше он держал «гейт касается
    // только продуктов», теперь — «снятие гейта касается только продуктов».
    search = 'tab=bots';

    const { container } = mount(<StudioPage />);

    expect(container.textContent).toContain('СПИСОК-БОТОВ');
    expect(container.textContent).not.toContain('РАЗДЕЛ-ПРОДУКТОВ');
  });
});

describe('переход из вкладки ботов в «Продукты»', () => {
  it('ведёт себя как нажатие на вкладку: параметры адреса на месте, история не растёт', () => {
    // Ровно тот адрес, с которым владелец пришёл с лендинга.
    search = 'utm_content=sites&lang=ru&tab=bots';
    const { container } = mount(<StudioPage />);

    click(byButton(container, /В-ПРОДУКТЫ/)!);

    expect(setParams).toHaveBeenCalledTimes(1);
    const [next, opts] = setParams.mock.calls[0] as [URLSearchParams, unknown];
    expect(next.get('tab')).toBe('products');
    expect(next.get('utm_content')).toBe('sites');
    expect(next.get('lang')).toBe('ru');
    expect(opts).toEqual({ replace: true });
  });
});
