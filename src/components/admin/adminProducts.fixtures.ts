/**
 * Данные для тестов раздела «Сайты и боты» — строго по контракту
 * GET /webhook/admin/products и GET /webhook/admin/products/:id.
 *
 * Отдельным модулем, потому что их делят тест списка и тест карточки.
 * В сборку не попадает: его импортируют только *.test.tsx.
 */
import type { AdminProductDetail, AdminProductRow } from './adminProducts';

const DAY = 24 * 60 * 60 * 1000;

/** Дата относительно «сейчас» — чтобы «оплачено до» не протухало вместе с календарём. */
export const daysFromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString();

export function makeRow(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return {
    id: 'p1',
    name: 'Продукт',
    slug: 'product',
    kind: 'site',
    status: 'running',
    domain: 'product.c.linkeon.io',
    customDomain: null,
    owner: { userId: '79000000001', name: 'Владелец', email: 'owner@example.com' },
    host: { id: 'host-1', publicIp: '203.0.113.10' },
    createdAt: '2026-09-01T12:00:00Z',
    archivedAt: null,
    paidUntil: daysFromNow(10),
    runnerSeenAt: daysFromNow(0),
    sleepReason: null,
    blockReason: null,
    provisionError: null,
    lastTurnAt: daysFromNow(-1),
    lastActivityAt: daysFromNow(-1),
    turnsInPeriod: 3,
    tokensInPeriod: 4500,
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
  return {
    product: makeRow(),
    domain: null,
    turns: [],
    jobs: [],
    ...overrides,
  };
}
