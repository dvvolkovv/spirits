// @vitest-environment jsdom
/**
 * Раздел «Сайты и боты» проверяется монтированием под настоящим роутером:
 * фильтры живут в адресе страницы, и что именно в него легло — и что из него
 * ушло в запрос — по коду не доказать.
 *
 * Бэкенд списка пишется параллельно, поэтому ответы — по контракту
 * GET /webhook/admin/products, а не по живой ручке.
 */
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get, post } }));

import AdminProductsView from './AdminProductsView';
import { SEARCH_DEBOUNCE_MS } from './adminProducts';
import type { AdminProductRow } from './adminProducts';
import { makeRow, makeDetail, daysFromNow } from './adminProducts.fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });
const fail = (status: number, body: unknown) => Promise.resolve({ ok: false, status, json: async () => body });

const ROWS: AdminProductRow[] = [
  makeRow({
    id: 'p-run',
    name: 'Кофейня',
    slug: 'coffee',
    kind: 'site',
    status: 'running',
    domain: 'coffee.c.linkeon.io',
    customDomain: { domain: 'xn--j1aefe.xn--p1ai', domainUnicode: 'кофе.рф', status: 'active' },
    owner: { userId: '79001234567', name: 'Иван Петров', email: 'ivan@example.com' },
    host: { id: 'host-1', publicIp: '203.0.113.7' },
    paidUntil: daysFromNow(10),
    turnsInPeriod: 12,
    tokensInPeriod: 123456,
  }),
  makeRow({
    id: 'p-bot',
    name: 'Бот записи',
    slug: 'booking',
    kind: 'bot',
    status: 'blocked',
    domain: null,
    customDomain: null,
    host: null,
    paidUntil: daysFromNow(-3),
    blockReason: 'фишинг',
  }),
  // Пусто всё, что может быть пустым, плюс статус, которого фронт не знает, и
  // поля, которых по контракту быть не должно, — старый или недоделанный бэкенд.
  {
    ...makeRow({ id: 'p-min', name: 'Минимум', slug: 'min', kind: 'bot', status: 'hibernating' }),
    domain: null,
    customDomain: null,
    host: null,
    paidUntil: null,
    lastActivityAt: null,
    owner: null,
    tokensInPeriod: null,
    turnsInPeriod: undefined,
  } as unknown as AdminProductRow,
];

let rows: AdminProductRow[] = ROWS;

/** Ручки по контракту: список отвечает тем периодом, что спросили. */
const backend = (url: string) => {
  if (url.startsWith('/webhook/admin/products?')) {
    const p = new URL(url, 'http://x').searchParams;
    return ok({ periodDays: Number(p.get('periodDays')), products: rows });
  }
  const m = url.match(/^\/webhook\/admin\/products\/([^/?]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const product = rows.find((r) => r.id === id);
    return product ? ok(makeDetail({ product })) : fail(404, { message: 'Продукт не найден' });
  }
  return Promise.reject(new Error(`неожиданный запрос ${url}`));
};

let container: HTMLDivElement;
let root: Root;
/** Адрес страницы — ровно то, что переживёт F5. */
let search = '';

const LocationProbe = () => {
  search = useLocation().search;
  return null;
};

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** Настоящая пауза внутри act — таймер поиска срабатывает в ней же. */
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const mountAt = async (query = '?tab=products') => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/admin${query}`]}>
        <Routes>
          <Route path="/admin" element={<><AdminProductsView /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
};

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const click = async (testid: string) => {
  const el = q(testid);
  if (!el) throw new Error(`нет элемента ${testid}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

/** Ввод в контролируемое поле: родной сеттер value, иначе React ввода не заметит. */
const typeInto = async (testid: string, value: string) => {
  const el = q(testid) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) throw new Error(`нет поля ${testid}`);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const urls = () => get.mock.calls.map((c) => String(c[0]));
const listUrls = () => urls().filter((u) => u.startsWith('/webhook/admin/products?'));
/** Параметры последнего запроса списка. */
const lastList = () => new URL(listUrls().pop() ?? '', 'http://x').searchParams;
const page = () => new URLSearchParams(search);
const checkbox = (testid: string) => q(testid) as HTMLInputElement;

beforeEach(() => {
  rows = ROWS;
  search = '';
  get.mockReset();
  post.mockReset();
  get.mockImplementation(backend);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('список', () => {
  it('рисует строки из ответа', async () => {
    await mountAt();
    expect(container.querySelectorAll('[data-testid^="admin-product-row-"]')).toHaveLength(3);

    const run = q('admin-product-row-p-run')!.textContent!;
    expect(run).toContain('Кофейня');
    expect(run).toContain('coffee.c.linkeon.io');
    expect(run).toContain('кофе.рф');
    expect(run).toContain('Иван Петров');
    expect(run).toContain('ivan@example.com');
    expect(run).toContain('79001234567');
    expect(run).toContain('203.0.113.7');
    expect(q('admin-product-kind-p-run')!.textContent).toBe('Сайт');
    expect(q('admin-product-status-p-run')!.textContent).toBe('Работает');
    expect(q('admin-product-turns-p-run')!.textContent).toBe('12');
    expect(q('admin-product-tokens-p-run')!.textContent).toBe((123456).toLocaleString('ru-RU'));

    expect(q('admin-product-row-p-bot')!.textContent).toContain('Бот записи');
    expect(q('admin-product-kind-p-bot')!.textContent).toBe('Бот');
    expect(q('admin-product-status-p-bot')!.textContent).toBe('Погашен');
  });

  it('адрес платформы — ссылка https в новой вкладке', async () => {
    await mountAt();
    const link = q('admin-product-link-p-run') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://coffee.c.linkeon.io');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    // У бота адреса нет — и ссылки тоже.
    expect(q('admin-product-link-p-bot')).toBeNull();
  });

  it('пустые поля и незнакомый статус не роняют экран; статус появляется среди кнопок', async () => {
    await mountAt();
    expect(q('admin-product-row-p-min')!.textContent).toContain('hibernating');
    expect(q('admin-products-status-hibernating')).not.toBeNull();
    expect(q('admin-products-status-running')).not.toBeNull();
  });

  it('сводка — сколько каких статусов в текущей выдаче', async () => {
    await mountAt();
    const s = q('admin-products-summary')!.textContent!;
    expect(s).toContain('Всего: 3');
    expect(s).toContain('Работает: 1');
    expect(s).toContain('Погашен: 1');
    expect(s).toContain('hibernating: 1');
    expect(s).not.toContain('Спит');
  });

  it('просроченная оплата подсвечена, будущая — нет', async () => {
    await mountAt();
    expect(q('admin-product-paid-p-bot')!.getAttribute('data-overdue')).toBe('true');
    expect(q('admin-product-paid-p-run')!.getAttribute('data-overdue')).toBe('false');
  });

  it('пустая выдача — так и сказано', async () => {
    rows = [];
    await mountAt();
    expect(q('admin-products-empty')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="admin-product-row-"]')).toHaveLength(0);
  });

  it('ошибка списка — текст сервера', async () => {
    get.mockImplementation((url: string) =>
      url.startsWith('/webhook/admin/products?') ? fail(500, { message: 'База недоступна' }) : backend(url));
    await mountAt();
    expect(q('admin-products-error')!.textContent).toContain('База недоступна');
  });

  it('ответ не того вида (HTML вместо JSON-списка) — ошибка, а не падение', async () => {
    get.mockImplementation((url: string) =>
      url.startsWith('/webhook/admin/products?') ? ok('<!doctype html><html></html>') : backend(url));
    await mountAt();
    expect(q('admin-products-error')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="admin-product-row-"]')).toHaveLength(0);
  });

  it('«Обновить» перечитывает список', async () => {
    await mountAt();
    await click('admin-products-refresh');
    expect(listUrls()).toHaveLength(2);
  });

  it('ответ устаревшего запроса не затирает свежий', async () => {
    await mountAt();
    let release!: () => void;
    get.mockImplementation((url: string) => {
      if (url.startsWith('/webhook/admin/products?') && url.includes('kind=bot')) {
        return new Promise((resolve) => {
          release = () => resolve(ok({ periodDays: 30, products: [ROWS[1]] }));
        });
      }
      if (url.startsWith('/webhook/admin/products?') && url.includes('kind=site')) {
        return ok({ periodDays: 30, products: [ROWS[0]] });
      }
      return backend(url);
    });
    await click('admin-products-kind-bot');
    await click('admin-products-kind-site');
    await act(async () => { release(); });
    await settle();
    expect(q('admin-product-row-p-run')).not.toBeNull();
    expect(q('admin-product-row-p-bot')).toBeNull();
  });
});

describe('фильтры', () => {
  it('первый запрос: 30 дней, без тестовых аккаунтов и архивных', async () => {
    await mountAt();
    expect(listUrls()).toHaveLength(1);
    const p = lastList();
    expect(p.get('periodDays')).toBe('30');
    expect(p.has('includeTest')).toBe(false);
    expect(p.has('includeArchived')).toBe(false);
    expect(p.has('q')).toBe(false);
    expect(p.has('status')).toBe(false);
    expect(p.has('kind')).toBe(false);
    expect(checkbox('admin-products-include-test').checked).toBe(false);
    expect(checkbox('admin-products-include-archived').checked).toBe(false);
    expect(q('admin-products-period-30')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('поиск уходит один раз после паузы и ложится в адрес', async () => {
    await mountAt();
    // Нажатия с промежутками короче паузы: с первого нажатия проходит больше
    // SEARCH_DEBOUNCE_MS, но отсчёт обязан начинаться заново с каждого —
    // иначе запрос ушёл бы посреди набора, с недопечатанным словом.
    const gap = Math.round(SEARCH_DEBOUNCE_MS / 2);
    await typeInto('admin-products-search', 'к');
    await wait(gap);
    await typeInto('admin-products-search', 'ко');
    await wait(gap);
    await typeInto('admin-products-search', 'кофе');
    await wait(gap);
    expect(listUrls()).toHaveLength(1);
    expect(page().has('q')).toBe(false);

    await wait(SEARCH_DEBOUNCE_MS);
    await settle();

    expect(listUrls()).toHaveLength(2);
    expect(lastList().get('q')).toBe('кофе');
    expect(page().get('q')).toBe('кофе');
    expect(page().get('tab')).toBe('products');
  });

  it('очищенный поиск уходит из запроса и из адреса', async () => {
    await mountAt(`?tab=products&q=${encodeURIComponent('кофе')}`);
    expect(lastList().get('q')).toBe('кофе');
    await typeInto('admin-products-search', '');
    await wait(SEARCH_DEBOUNCE_MS + 60);
    await settle();
    expect(lastList().has('q')).toBe(false);
    expect(page().has('q')).toBe(false);
  });

  it('статусы: выбранные уходят в запрос и в адрес, «все» сбрасывает', async () => {
    await mountAt();
    await click('admin-products-status-running');
    expect(lastList().get('status')).toBe('running');
    await click('admin-products-status-blocked');
    expect(lastList().get('status')).toBe('running,blocked');
    expect(page().get('status')).toBe('running,blocked');
    expect(q('admin-products-status-running')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('admin-products-status-sleeping')!.getAttribute('aria-pressed')).toBe('false');

    await click('admin-products-status-running');
    expect(lastList().get('status')).toBe('blocked');

    await click('admin-products-status-all');
    expect(lastList().has('status')).toBe(false);
    expect(page().has('status')).toBe(false);
  });

  it('два быстрых клика по разным статусам — в фильтре оба', async () => {
    await mountAt();
    const running = q('admin-products-status-running')!;
    const failed = q('admin-products-status-failed')!;
    // Оба нажатия до перерисовки: второй обработчик видит адрес, уже
    // изменённый первым, а не тот, что был отрисован.
    await act(async () => {
      running.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      failed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    expect(page().get('status')).toBe('running,failed');
    expect(lastList().get('status')).toBe('running,failed');
  });

  it('поиск, выбранный за время паузы фильтр не затирает', async () => {
    await mountAt();
    await typeInto('admin-products-search', 'кофе');
    await click('admin-products-kind-bot');
    await wait(SEARCH_DEBOUNCE_MS + 60);
    await settle();
    expect(page().get('q')).toBe('кофе');
    expect(page().get('kind')).toBe('bot');
    expect(lastList().get('q')).toBe('кофе');
    expect(lastList().get('kind')).toBe('bot');
  });

  it('вид: только сайты или только боты', async () => {
    await mountAt();
    await click('admin-products-kind-bot');
    expect(lastList().get('kind')).toBe('bot');
    expect(page().get('kind')).toBe('bot');
    await click('admin-products-kind-site');
    expect(lastList().get('kind')).toBe('site');
    await click('admin-products-kind-all');
    expect(lastList().has('kind')).toBe(false);
    expect(page().has('kind')).toBe(false);
  });

  it('период', async () => {
    await mountAt();
    await click('admin-products-period-90');
    expect(lastList().get('periodDays')).toBe('90');
    expect(page().get('period')).toBe('90');
    await click('admin-products-period-30');
    expect(lastList().get('periodDays')).toBe('30');
    expect(page().has('period')).toBe(false);
  });

  it('тестовые аккаунты и архивные — галочки, уходят в запрос и в адрес', async () => {
    await mountAt();
    await click('admin-products-include-test');
    expect(checkbox('admin-products-include-test').checked).toBe(true);
    expect(lastList().get('includeTest')).toBe('1');
    expect(page().get('test')).toBe('1');

    await click('admin-products-include-archived');
    expect(checkbox('admin-products-include-archived').checked).toBe(true);
    expect(lastList().get('includeArchived')).toBe('1');
    expect(page().get('archived')).toBe('1');

    await click('admin-products-include-test');
    expect(lastList().has('includeTest')).toBe(false);
    expect(page().has('test')).toBe(false);
    expect(lastList().get('includeArchived')).toBe('1');
  });

  it('фильтры из адреса переживают F5 — и уходят первым же запросом', async () => {
    await mountAt(`?tab=products&q=${encodeURIComponent('кофе')}&status=failed,blocked&kind=site&period=7&test=1&archived=1`);
    expect(listUrls()).toHaveLength(1);
    const p = lastList();
    expect(p.get('q')).toBe('кофе');
    expect(p.get('status')).toBe('blocked,failed');
    expect(p.get('kind')).toBe('site');
    expect(p.get('periodDays')).toBe('7');
    expect(p.get('includeTest')).toBe('1');
    expect(p.get('includeArchived')).toBe('1');

    expect((q('admin-products-search') as HTMLInputElement).value).toBe('кофе');
    expect(q('admin-products-status-failed')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('admin-products-status-blocked')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('admin-products-kind-site')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('admin-products-period-7')!.getAttribute('aria-pressed')).toBe('true');
    expect(checkbox('admin-products-include-test').checked).toBe(true);
    expect(checkbox('admin-products-include-archived').checked).toBe(true);
  });
});

describe('карточка', () => {
  it('клик по строке открывает карточку, её id ложится в адрес; закрытие убирает', async () => {
    await mountAt();
    await click('admin-product-row-p-run');
    expect(urls()).toContain('/webhook/admin/products/p-run');
    expect(q('admin-product-card')!.textContent).toContain('Кофейня');
    expect(page().get('product')).toBe('p-run');

    await click('admin-product-card-close');
    expect(q('admin-product-card')).toBeNull();
    expect(page().has('product')).toBe(false);
    expect(page().get('tab')).toBe('products');
  });

  it('?product= открывает карточку сразу — ссылкой можно поделиться', async () => {
    await mountAt('?tab=products&product=p-bot');
    expect(urls()).toContain('/webhook/admin/products/p-bot');
    expect(q('admin-product-card')!.textContent).toContain('Бот записи');
  });

  it('клик по ссылке на сайт не открывает карточку', async () => {
    await mountAt();
    const link = q('admin-product-link-p-run')!;
    // jsdom не умеет переходить по ссылкам и ругается в консоль — гасим сам переход.
    link.addEventListener('click', (e) => e.preventDefault());
    await act(async () => { link.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await settle();
    expect(q('admin-product-card')).toBeNull();
    expect(page().has('product')).toBe(false);
  });

  it('гашение из карточки перечитывает и список', async () => {
    post.mockImplementation(() =>
      ok({ id: 'p-run', slug: 'coffee', wasStatus: 'running', by: 'идентификатору', killedJobs: 0, killedTurns: 0 }));
    await mountAt('?tab=products&product=p-run');
    const before = listUrls().length;

    await click('admin-product-block');
    await typeInto('admin-product-block-reason', 'Фишинг');
    await click('admin-product-block-confirm');

    expect(post).toHaveBeenCalledWith('/webhook/products/block', { key: 'p-run', reason: 'Фишинг' });
    expect(listUrls().length).toBe(before + 1);
    // Перечитанный список — с теми же фильтрами, что были.
    expect(lastList().get('periodDays')).toBe('30');
  });
});
