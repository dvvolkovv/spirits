// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, mount } from '../../test/dom';
import type { Mounted } from '../../test/dom';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get, post } }));

import AdminReferralsView from './AdminReferralsView';

const leader = {
  id: 'leader-1',
  name: '547d1770-390c-4e7e-89db-7bd38bbec72a',
  slug: 'leader-slug',
  user_phone: '70000000001',
  parent_leader_id: null,
  level: 1,
  commission_pct: 10,
  is_active: true,
  total_referees: 1,
  total_commission_rub: 100,
  paid_out_rub: 0,
  pending_rub: 100,
  commissions: [],
};

let mounted: Mounted | undefined;

beforeEach(async () => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({
    ok: true,
    json: async () => ({
      summary: { total_commission_all_rub: 100, total_paid_out_rub: 0, total_pending_rub: 100 },
      leaders: [leader],
    }),
  });
  mounted = mount(<AdminReferralsView />);
  await flush();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
});

describe('мобильные карточки рефералов', () => {
  it('раскладывает карточку вертикально и обозначает иконочные действия', () => {
    const row = mounted!.container.querySelector('[data-testid="leader-row"]')!;
    expect(row.className).toContain('flex-col');
    expect(row.querySelector('[data-testid="leader-toggle"]')?.getAttribute('aria-label')).toBe('Деактивировать');
    expect(row.querySelector('[data-testid="leader-expand"]')?.getAttribute('aria-label')).toBe('Развернуть');
    expect(row.querySelector('[data-testid="leader-copy"]')?.className).toContain('min-h-11');
    expect(row.querySelector('[data-testid="leader-toggle"]')?.className).toContain('min-h-11');
    expect(row.querySelector('[data-testid="leader-expand"]')?.className).toContain('min-h-11');
  });
});
