// @vitest-environment jsdom
/**
 * Гейт вкладки «Продукты» в Студии.
 *
 * Студия видна всем, а продукты заводит пока только владелец. Значит вся
 * защита раздела держится на этом одном условии — и оно стоит в двух местах:
 * вкладка не рисуется И разбор параметра её не принимает. Одного первого мало:
 * /studio?tab=products, набранный руками, открыл бы раздел любому.
 *
 * Проверяется видимое на экране, а не внутреннее состояние: «есть ли слово
 * «Продукты» среди вкладок» и «что нарисовано под ними».
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, tRu } from '../test/dom';
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
  TgBotsListView: () => <div>СПИСОК-БОТОВ</div>,
}));
vi.mock('../components/products/ProductsSection', () => ({
  ProductsSection: () => <div>РАЗДЕЛ-ПРОДУКТОВ</div>,
}));

let isAdmin = false;
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { isAdmin } }),
}));

let search = '';
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(search), vi.fn()],
}));

const tabsLabel = tRu('studio.tabs.products');

afterEach(() => {
  isAdmin = false;
  search = '';
});

describe('вкладка «Продукты» в Студии', () => {
  it('у обычного пользователя вкладки нет', () => {
    const { container } = mount(<StudioPage />);

    expect(container.textContent).not.toContain(tabsLabel);
    expect(container.textContent).toContain('СПИСОК-АССИСТЕНТОВ');
  });

  it('у обычного пользователя ?tab=products НЕ открывает раздел', () => {
    // Главный случай. Скрыть кнопку — косметика: адрес набирается руками, а
    // со вкладками в адресной строке это первое, что пробуют.
    search = 'tab=products';

    const { container } = mount(<StudioPage />);

    expect(container.textContent).not.toContain('РАЗДЕЛ-ПРОДУКТОВ');
    // Не пустой экран, а откат на вкладку по умолчанию: «ничего не
    // нарисовалось» человек читает как поломку, а не как запрет.
    expect(container.textContent).toContain('СПИСОК-АССИСТЕНТОВ');
  });

  it('у владельца вкладка есть и ?tab=products открывает раздел', () => {
    // Обратная сторона: гейт, который не пускает никого, тоже «проходит» два
    // теста выше.
    isAdmin = true;
    search = 'tab=products';

    const { container } = mount(<StudioPage />);

    expect(container.textContent).toContain(tabsLabel);
    expect(container.textContent).toContain('РАЗДЕЛ-ПРОДУКТОВ');
  });

  it('чужая вкладка не ломает экран', () => {
    search = 'tab=чего-то-нет';

    const { container } = mount(<StudioPage />);

    expect(container.textContent).toContain('СПИСОК-АССИСТЕНТОВ');
  });

  it('вкладка Telegram-ботов доступна и без прав владельца', () => {
    // Сторож от «закрыл заодно и соседей»: гейт обязан касаться только
    // продуктов.
    search = 'tab=bots';

    const { container } = mount(<StudioPage />);

    expect(container.textContent).toContain('СПИСОК-БОТОВ');
  });
});
