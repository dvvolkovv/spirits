// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actAsync, byButton, flush, mount } from '../../test/dom';
import type { Mounted } from '../../test/dom';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));
vi.mock('./UserActivityDrawer', () => ({ default: () => null }));

import AdminPaymentsView from './AdminPaymentsView';

const stats = {
  currencies: ['RUB'],
  include_test: false,
  daily: [],
  totals: {
    succeeded_count: 0,
    pending_count: 0,
    canceled_count: 0,
    failed_count: 0,
    total_count: 0,
    revenue_all: {},
    revenue_30d: {},
    revenue_7d: {},
    revenue_today: {},
    unique_payers: 0,
  },
};

let mounted: Mounted | undefined;

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation((url: string) => Promise.resolve({
    ok: true,
    status: 200,
    json: async () => url.includes('/stats?') ? stats : [],
  }));
  mounted = mount(<AdminPaymentsView />);
  await flush();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

describe('тестовые аккаунты в платежах', () => {
  it('исключены по умолчанию и включаются явным переключателем', async () => {
    const initialUrls = get.mock.calls.map((call) => call[0]);
    expect(initialUrls.every((url) => !url.includes('includeTest'))).toBe(true);

    await actAsync(async () => {
      byButton(mounted!.container, /^Тестовые$/)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();
    const enabledUrls = get.mock.calls.map((call) => call[0]).slice(initialUrls.length);
    expect(enabledUrls.length).toBeGreaterThan(0);
    expect(enabledUrls.every((url) => url.includes('includeTest=1'))).toBe(true);
  });
});
