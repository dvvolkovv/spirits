// @vitest-environment jsdom
/**
 * Раздел «Звонки» проверяем монтированием: какие фильтры реально уходят в
 * запрос, по коду не доказать, а дефект был именно в них — встречи Taler ID,
 * Meet, Zoom и Телемоста не попадали ни в одну вкладку, кроме «Все».
 */
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));
// Карточка человека тянет полсайта, а здесь она не участвует.
vi.mock('./UserActivityDrawer', () => ({ default: () => null }));

import AdminCallsView from './AdminCallsView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CALLS = {
  days: 30, kind: 'all', provider: null, include_test: true,
  byUser: [],
  totals: { calls: 46, users: 1, duration_sec: 0, tokens_call: 0, tokens_consult: 0, tokens_total: 0 },
  byProvider: [{ provider: 'talerid', sessions: 43 }, { provider: 'zoom', sessions: 3 }],
};

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });

/** Разбивка по площадкам — своя у каждой вкладки: у «Все» и «Звонки» есть и звонок из приложения. */
const BY_PROVIDER: Record<string, { provider: string; sessions: number }[]> = {
  all: [{ provider: 'talerid', sessions: 43 }, { provider: 'linkeon', sessions: 10 }, { provider: 'zoom', sessions: 3 }],
  call: [{ provider: 'linkeon', sessions: 10 }],
  meeting: [{ provider: 'talerid', sessions: 43 }, { provider: 'zoom', sessions: 3 }],
};

/** Ручка таблицы отвечает по тем фильтрам, что пришли в запросе. */
const backend = (url: string) => {
  if (url.startsWith('/webhook/admin/calls/sessions')) return ok({ total: 0, limit: 50, sessions: [] });
  const p = new URL(url, 'http://x').searchParams;
  const kind = p.get('kind') ?? 'call';
  return ok({ ...CALLS, kind, provider: p.get('provider'), include_test: p.has('includeTest'), byProvider: BY_PROVIDER[kind] });
};

let container: HTMLDivElement;
let root: Root;

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const click = async (testid: string) => {
  const el = q(testid);
  if (!el) throw new Error(`нет элемента ${testid}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

const urls = () => get.mock.calls.map((c) => c[0] as string);
/** Последний запрос таблицы (не ленты). */
const lastTableUrl = () => urls().filter((u) => u.startsWith('/webhook/admin/calls?')).pop();

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation(backend);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AdminCallsView />); });
  await settle();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('AdminCallsView', () => {
  it('по умолчанию — все сессии вместе с тестовыми и предупреждение об этом', () => {
    expect(lastTableUrl()).toBe('/webhook/admin/calls?days=30&kind=all&includeTest=1');
    expect(q('admin-calls-test-banner')).not.toBeNull();
  });

  it('лента получает те же фильтры, что таблица', () => {
    expect(urls().find((u) => u.startsWith('/webhook/admin/calls/sessions')))
      .toBe('/webhook/admin/calls/sessions?days=30&kind=all&includeTest=1&limit=50');
  });

  it('на вкладке «Все» кнопок площадок нет', () => {
    expect(q('admin-calls-providers')).toBeNull();
  });

  it('на «Встречах» кнопки площадок, и выбранная уходит в запрос', async () => {
    await click('admin-calls-kind-meeting');
    expect(q('admin-calls-provider-all')?.textContent).toBe('Все площадки · 46');
    expect(q('admin-calls-provider-talerid')?.textContent).toBe('Taler ID · 43');

    await click('admin-calls-provider-zoom');
    expect(lastTableUrl()).toBe('/webhook/admin/calls?days=30&kind=meeting&provider=zoom&includeTest=1');
    expect(q('admin-calls-provider-zoom')?.getAttribute('aria-pressed')).toBe('true');
    expect(urls().filter((u) => u.startsWith('/webhook/admin/calls/sessions')).pop())
      .toBe('/webhook/admin/calls/sessions?days=30&kind=meeting&provider=zoom&includeTest=1&limit=50');
  });

  it('смена вкладки сбрасывает площадку', async () => {
    await click('admin-calls-kind-meeting');
    await click('admin-calls-provider-zoom');
    await click('admin-calls-kind-call');
    expect(lastTableUrl()).toBe('/webhook/admin/calls?days=30&kind=call&includeTest=1');
  });

  it('без «Тестовых» фильтр уходит в запрос и плашка исчезает', async () => {
    await click('admin-calls-include-test');
    expect(lastTableUrl()).toBe('/webhook/admin/calls?days=30&kind=all');
    expect(q('admin-calls-test-banner')).toBeNull();
  });

  it('«Обновить» перечитывает и таблицу, и ленту', async () => {
    const before = urls().length;
    await click('admin-calls-refresh');
    const after = urls().slice(before);
    expect(after).toContain('/webhook/admin/calls?days=30&kind=all&includeTest=1');
    expect(after).toContain('/webhook/admin/calls/sessions?days=30&kind=all&includeTest=1&limit=50');
  });

  it('кнопки площадок строятся по ответу «Встреч», а не по ответу прошлой вкладки', async () => {
    let release!: () => void;
    get.mockImplementation((url: string) => {
      if (url.startsWith('/webhook/admin/calls?') && url.includes('kind=meeting')) {
        return new Promise((resolve) => { release = () => resolve(backend(url)); });
      }
      return backend(url);
    });
    await click('admin-calls-kind-meeting');
    expect(q('admin-calls-providers')).toBeNull();
    await act(async () => { release(); });
    await settle();
    expect(q('admin-calls-provider-talerid')?.textContent).toBe('Taler ID · 43');
    expect(q('admin-calls-provider-linkeon')).toBeNull();
  });

  it('ответ устаревшего запроса таблицы не затирает свежий', async () => {
    await click('admin-calls-kind-meeting');
    let releaseZoom!: () => void;
    const meeting = (provider: string, calls: number) =>
      ok({ ...CALLS, kind: 'meeting', provider, byProvider: BY_PROVIDER.meeting, totals: { ...CALLS.totals, calls } });
    get.mockImplementation((url: string) => {
      if (url.startsWith('/webhook/admin/calls?') && url.includes('provider=zoom')) {
        return new Promise((resolve) => { releaseZoom = () => resolve(meeting('zoom', 3)); });
      }
      if (url.startsWith('/webhook/admin/calls?') && url.includes('provider=talerid')) return meeting('talerid', 43);
      return backend(url);
    });
    await click('admin-calls-provider-zoom');
    await click('admin-calls-provider-talerid');
    await act(async () => { releaseZoom(); });
    await settle();
    expect(q('admin-calls-stat-count')?.textContent).toBe('Встреч43');
  });

  it('выбранная площадка остаётся на экране с нулём, когда за период по ней ничего', async () => {
    await click('admin-calls-kind-meeting');
    await click('admin-calls-provider-zoom');
    get.mockImplementation((url: string) =>
      url.startsWith('/webhook/admin/calls?')
        ? ok({ ...CALLS, kind: 'meeting', provider: 'zoom', byProvider: [{ provider: 'talerid', sessions: 10 }], totals: { ...CALLS.totals, calls: 0 } })
        : backend(url));
    await click('admin-calls-period-7');
    expect(q('admin-calls-provider-zoom')?.textContent).toBe('Zoom · 0');
    expect(q('admin-calls-provider-zoom')?.getAttribute('aria-pressed')).toBe('true');
  });
});
