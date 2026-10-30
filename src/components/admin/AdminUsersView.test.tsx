// @vitest-environment jsdom
/**
 * Бэкенд (`/webhook/admin/users/tokens`) нарочно исключает тестовые аккаунты
 * из списка — в их числе 79030169187 владельца, — поэтому кликом по строке
 * его карточку не открыть. Если ввод в поиске похож на полный номер и среди
 * строк совпадений нет, под полем должна появиться кнопка «Открыть карточку»,
 * открывающая тот же UserActivityDrawer, что и клик по строке.
 */
import { act } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));

// Карточка человека тянет свой собственный набор запросов — здесь важен
// только пропс phone, которым её открывают.
vi.mock('./UserActivityDrawer', () => ({
  default: ({ phone }: { phone: string | null }) =>
    phone ? <div data-testid="user-activity-drawer">{phone}</div> : null,
}));

import AdminUsersView, { phoneIdFromSearch } from './AdminUsersView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('phoneIdFromSearch', () => {
  it('полный номер с +7 и разделителями — выделяет 11 цифр как есть', () => {
    expect(phoneIdFromSearch('+7 (903) 016-91-87')).toBe('79030169187');
  });

  it('11 цифр, начинающихся с 8, — заменяет 8 на 7', () => {
    expect(phoneIdFromSearch('89030169187')).toBe('79030169187');
  });

  it('10 цифр — приписывает 7 спереди', () => {
    expect(phoneIdFromSearch('9030169187')).toBe('79030169187');
  });

  it('меньше 10 цифр — null', () => {
    expect(phoneIdFromSearch('903')).toBeNull();
  });

  it('больше 11 цифр — null', () => {
    expect(phoneIdFromSearch('1234567890123')).toBeNull();
  });
});

const ACTIVE = {
  days: 30,
  bucket: 'day' as const,
  series: [],
  totals: { total_users: 2, new_30d: 0, new_7d: 0, new_today: 0, dau: 0, wau: 0, mau: 0 },
};

const mkUser = (phone: string) => ({
  phone,
  registered_at: '2026-01-01T00:00:00Z',
  balance: 1000,
  spent_total: 0,
  spent_period: 0,
  last_active: null,
  paid_count: 0,
  paid_rub: 0,
  referral_leader_name: null,
});

// Список, который бэкенд реально отдаёт: без тестового 79030169187.
const USERS = {
  hours: 720,
  users: [mkUser('70000000001'), mkUser('70000000002')],
  totals: { users_with_balance: 2, users_total: 2, total_balance: 2000 },
};

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });

const backend = (url: string) => {
  if (url.includes('/users/active')) return ok(ACTIVE);
  if (url.includes('/users/tokens')) return ok(USERS);
  throw new Error(`неожиданный запрос ${url}`);
};

let container: HTMLDivElement;
let root: Root;

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const typeSearch = async (value: string) => {
  const el = container.querySelector('input') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const click = async (testid: string) => {
  const el = q(testid);
  if (!el) throw new Error(`нет элемента ${testid}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

describe('AdminUsersView — кнопка «Открыть карточку» по номеру', () => {
  beforeEach(async () => {
    get.mockReset();
    get.mockImplementation(backend);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<AdminUsersView />); });
    await settle();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('пустой поиск — кнопки нет', () => {
    expect(q('admin-users-open-by-phone')).toBeNull();
  });

  it('номер похож на полный и совпадений в списке нет — кнопка появляется с отформатированным номером', async () => {
    await typeSearch('9030169187');
    const btn = q('admin-users-open-by-phone');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('+7 903 016-91-87');
  });

  it('клик по кнопке открывает UserActivityDrawer с нормализованным id телефона', async () => {
    await typeSearch('9030169187');
    await click('admin-users-open-by-phone');
    const drawer = q('user-activity-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer!.textContent).toBe('79030169187');
  });

  it('номер есть в списке — кнопки нет', async () => {
    await typeSearch('70000000001');
    expect(q('admin-users-open-by-phone')).toBeNull();
  });
});
