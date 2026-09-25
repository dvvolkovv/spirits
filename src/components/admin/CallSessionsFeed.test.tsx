// @vitest-environment jsdom
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));

import CallSessionsFeed from './CallSessionsFeed';
import type { CallSession } from './CallSessionItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (i: number): CallSession => ({
  id: `c-${i}`, user_id: '79236230446', provider: i % 2 ? 'zoom' : 'telemost', agent_name: 'Роман',
  started_at: '2026-09-16T09:46:31Z', duration_sec: 60, status: 'completed', model: null,
  summary: `Встреча ${i}`, tokens_call: 100, tokens_consult: 0, tokens_total: 100,
  consults: 0, flags: [], user_turns: 3,
});

/** Ответ ручки ленты: столько сессий, сколько просили, но не больше total. */
const reply = (total: number) => (url: string) => {
  const limit = Number(new URL(url, 'http://x').searchParams.get('limit'));
  const n = Math.min(limit, total);
  return Promise.resolve({
    ok: true, status: 200,
    json: async () => ({ total, limit, sessions: Array.from({ length: n }, (_, i) => mk(i)) }),
  });
};

let container: HTMLDivElement;
let root: Root;

/** Дать допройти цепочке промисов загрузки. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const mount = async (onOpenUser = vi.fn()) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CallSessionsFeed query="days=30&kind=all&includeTest=1" reloadKey={0} onOpenUser={onOpenUser} />);
  });
  await settle();
};

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const click = async (el: HTMLElement | null) => {
  if (!el) throw new Error('нет элемента');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

beforeEach(() => { get.mockReset(); });

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('CallSessionsFeed', () => {
  it('первая порция — 50 сессий с теми же фильтрами, что у таблицы', async () => {
    get.mockImplementation(reply(131));
    await mount();
    expect(get).toHaveBeenCalledWith('/webhook/admin/calls/sessions?days=30&kind=all&includeTest=1&limit=50');
    expect(q('call-sessions-count')?.textContent).toBe('Показано 50 из 131');
  });

  it('«Показать ещё» перезапрашивает первые 100', async () => {
    get.mockImplementation(reply(131));
    await mount();
    await click(q('call-sessions-more'));
    expect(get).toHaveBeenLastCalledWith('/webhook/admin/calls/sessions?days=30&kind=all&includeTest=1&limit=100');
    expect(q('call-sessions-count')?.textContent).toBe('Показано 100 из 131');
  });

  it('когда показано всё, кнопки «Показать ещё» нет', async () => {
    get.mockImplementation(reply(3));
    await mount();
    expect(q('call-sessions-more')).toBeNull();
  });

  it('клик по номеру в строке открывает карточку человека', async () => {
    get.mockImplementation(reply(1));
    const onOpenUser = vi.fn();
    await mount(onOpenUser);
    await click(q('call-session-user-c-0'));
    expect(onOpenUser).toHaveBeenCalledWith('79236230446');
  });

  it('ошибка ручки видна, а не выдаёт себя за «сессий не было»', async () => {
    get.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await mount();
    expect(container.textContent).toContain('Сессии: 404');
    expect(container.textContent).not.toContain('Сессий за период не было');
  });

  it('на потолке сервера (500) кнопки нет — вместо неё подсказка', async () => {
    // Сервер отдаёт не больше 500 за запрос: кнопка на потолке ничего бы не
    // догрузила, а висела бы, как будто ещё есть что показать.
    get.mockImplementation(reply(1000));
    await mount();
    for (let i = 0; i < 9; i++) await click(q('call-sessions-more'));
    expect(get).toHaveBeenLastCalledWith('/webhook/admin/calls/sessions?days=30&kind=all&includeTest=1&limit=500');
    expect(q('call-sessions-more')).toBeNull();
    expect(q('call-sessions-capped')?.textContent).toContain('500');
  });
});
