// @vitest-environment jsdom
/**
 * Вкладка «Сайты и боты» в админке.
 *
 * Как и у Студии, мест два, и каждое проверяется отдельно: кнопка в ряду
 * вкладок и разбор ?tab= из адреса. Половина правки хуже никакой: кнопка без
 * разбора даёт вкладку, которая после F5 молча возвращает на «Поддержку».
 *
 * Разделы заглушены — они тянут свои ручки и к этой проверке отношения не
 * имеют. Заглушки печатают своё имя: по нему видно, что показано на экране.
 * Подписи вкладок — из настоящего ru.json (tRu): ключа, которого в локали
 * нет, тест не найдёт.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { mount, click, tRu } from '../test/dom';
import type { Mounted } from '../test/dom';
import en from '../i18n/locales/en.json';
import pt from '../i18n/locales/pt.json';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../test/dom');
  return { useTranslation: () => ({ t }) };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { isAdmin: true }, isLoading: false }),
}));

let search = '';
const setSearchParams = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(search), setSearchParams],
    Navigate: () => null,
  };
});

vi.mock('../components/admin/AdminSupportView', () => ({ default: () => 'РАЗДЕЛ-ПОДДЕРЖКА' }));
vi.mock('../components/admin/AdminUsersView', () => ({ default: () => 'РАЗДЕЛ-ПОЛЬЗОВАТЕЛИ' }));
vi.mock('../components/admin/AdminProductsView', () => ({ default: () => 'РАЗДЕЛ-САЙТЫ-И-БОТЫ' }));
vi.mock('../components/admin/AdminPaymentsView', () => ({ default: () => 'РАЗДЕЛ-ПЛАТЕЖИ' }));
vi.mock('../components/admin/AdminTokensView', () => ({ default: () => 'РАЗДЕЛ-ТОКЕНЫ' }));
vi.mock('../components/admin/AdminUsageView', () => ({ default: () => 'РАЗДЕЛ-ИСПОЛЬЗОВАНИЕ' }));
vi.mock('../components/admin/AdminCallsView', () => ({ default: () => 'РАЗДЕЛ-ЗВОНКИ' }));
vi.mock('../components/admin/AdminAssistantsView', () => ({ default: () => 'РАЗДЕЛ-АССИСТЕНТЫ' }));
vi.mock('../components/admin/AdminCouponsView', () => ({ default: () => 'РАЗДЕЛ-КУПОНЫ' }));
vi.mock('../components/admin/AdminReferralsView', () => ({ default: () => 'РАЗДЕЛ-РЕФЕРАЛЫ' }));
vi.mock('../components/admin/AdminRetentionView', () => ({ default: () => 'РАЗДЕЛ-RETENTION' }));
vi.mock('../components/admin/AdminActivationView', () => ({ default: () => 'РАЗДЕЛ-АКТИВАЦИЯ' }));
vi.mock('../components/admin/AdminMonitoringView', () => ({ default: () => 'РАЗДЕЛ-МОНИТОРИНГ' }));
vi.mock('../components/admin/AdminProductManagementView', () => ({ default: () => 'РАЗДЕЛ-УПРАВЛЕНИЕ-ПРОДУКТОМ' }));
vi.mock('../components/admin/AdminIntegrationsView', () => ({ default: () => 'РАЗДЕЛ-ИНТЕГРАЦИИ' }));
vi.mock('../components/admin/AdminBlogView', () => ({ default: () => 'РАЗДЕЛ-БЛОГ' }));

// Заглушка записывает пропы, а не просто рендерит null: ниже проверяем, что
// AdminPage передаёт в плашку activeTab (для перечитывания при смене вкладки,
// ревью качества 01.11.2026) и hideOpen именно на вкладке «Ассистенты».
const { bannerProps } = vi.hoisted(() => ({ bannerProps: { current: null as Record<string, unknown> | null } }));
vi.mock('../components/admin/GlobalLlmBanner', () => ({
  default: (props: Record<string, unknown>) => { bannerProps.current = props; return null; },
}));

import AdminPage from './AdminPage';

// jsdom не умеет прокручивать, а страница подкручивает активную вкладку в видимую область.
Element.prototype.scrollIntoView = () => {};

let mounted: Mounted | null = null;
const render = () => {
  mounted = mount(<AdminPage />);
  return mounted.container;
};

const tab = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLButtonElement>(`[data-testid="admin-tab-${id}"]`);
const isActive = (el: HTMLElement | null) => !!el && el.className.includes('border-forest-600');

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  search = '';
  setSearchParams.mockReset();
  bannerProps.current = null;
});

describe('вкладка «Сайты и боты»', () => {
  it('есть в ряду вкладок с подписью из ru.json', () => {
    const container = render();
    const btn = tab(container, 'products');
    expect(btn).not.toBeNull();
    expect(tRu('admin.tabs.products')).toBe('Сайты и боты');
    expect(btn!.textContent).toBe('Сайты и боты');
  });

  it('в en и pt своя подпись: остальные языки откатываются на en, без неё увидели бы русскую', () => {
    expect((en.admin.tabs as Record<string, string>).products).toBe('Sites & bots');
    expect((pt.admin.tabs as Record<string, string>).products).toBe('Sites e bots');
  });

  it('все 16 разделов доступны в пяти группах и мобильном переключателе', () => {
    const container = render();
    const select = container.querySelector<HTMLSelectElement>('[data-testid="admin-section-select"]')!;
    expect(container.querySelectorAll('[data-testid^="admin-group-"]')).toHaveLength(5);
    expect(select.querySelectorAll('optgroup')).toHaveLength(5);
    expect(select.querySelectorAll('option')).toHaveLength(16);

    act(() => {
      select.value = 'blog';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const [next] = setSearchParams.mock.calls[0];
    expect((next as URLSearchParams).get('tab')).toBe('blog');
  });

  it('?tab=products открывает раздел и подсвечивает вкладку', () => {
    search = 'tab=products';
    const container = render();
    expect(container.textContent).toContain('РАЗДЕЛ-САЙТЫ-И-БОТЫ');
    expect(container.textContent).not.toContain('РАЗДЕЛ-ПОДДЕРЖКА');
    expect(isActive(tab(container, 'products'))).toBe(true);
    expect(isActive(tab(container, 'product'))).toBe(false);
  });

  it('клик по вкладке открывает раздел и пишет ?tab=products, не теряя остальное', () => {
    search = 'tab=users&kind=bot';
    const container = render();
    click(tab(container, 'products')!);
    expect(container.textContent).toContain('РАЗДЕЛ-САЙТЫ-И-БОТЫ');
    const [next, opts] = setSearchParams.mock.calls[0];
    expect((next as URLSearchParams).get('tab')).toBe('products');
    expect((next as URLSearchParams).get('kind')).toBe('bot');
    expect(opts).toEqual({ replace: true });
  });

  it('?tab=product — по-прежнему «Управление продуктом», а не новый раздел', () => {
    search = 'tab=product';
    const container = render();
    expect(container.textContent).toContain('РАЗДЕЛ-УПРАВЛЕНИЕ-ПРОДУКТОМ');
    expect(container.textContent).not.toContain('РАЗДЕЛ-САЙТЫ-И-БОТЫ');
  });

  it('без параметра — «Поддержка», как и раньше', () => {
    const container = render();
    expect(container.textContent).toContain('РАЗДЕЛ-ПОДДЕРЖКА');
    expect(container.textContent).not.toContain('РАЗДЕЛ-САЙТЫ-И-БОТЫ');
  });
});

describe('плашка общего рубильника модели (GlobalLlmBanner)', () => {
  it('на вкладке «Ассистенты» получает activeTab и hideOpen=true — кнопка «Изменить» здесь не нужна', () => {
    search = 'tab=assistants';
    render();
    expect(bannerProps.current?.activeTab).toBe('assistants');
    expect(bannerProps.current?.hideOpen).toBe(true);
  });

  it('на остальных вкладках hideOpen снят', () => {
    search = 'tab=support';
    render();
    expect(bannerProps.current?.activeTab).toBe('support');
    expect(bannerProps.current?.hideOpen).toBe(false);
  });
});
