// @vitest-environment jsdom
/**
 * Карточка человека: ошибка загрузки не должна выглядеть как «сессий нет», а
 * первые 50 — как «всего».
 */
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));

import { UserCallsList } from './UserCallsList';
import type { CallSession } from './CallSessionItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (i: number): CallSession => ({
  id: `c-${i}`, user_id: '79030169187', provider: 'talerid', agent_name: 'Роман',
  started_at: '2026-09-16T09:46:31Z', duration_sec: 60, status: 'completed', model: null,
  summary: `Встреча ${i}`, tokens_call: 100, tokens_consult: 0, tokens_total: 100,
  consults: 0, flags: [], user_turns: 3,
});

let container: HTMLDivElement;
let root: Root;

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const mount = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<UserCallsList userId="79030169187" />); });
  await settle();
};

beforeEach(() => { get.mockReset(); });

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('UserCallsList', () => {
  it('ошибка загрузки видна, а не прячет секцию как «сессий нет»', async () => {
    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    await mount();
    expect(container.textContent).toContain('Не удалось загрузить звонки');
  });

  it('полная порция в 50 подписана «50+», а не «50»', async () => {
    // Бэкенд отдаёт карточке 50 последних сессий; у активного человека их больше.
    get.mockResolvedValue({ ok: true, status: 200, json: async () => ({ calls: Array.from({ length: 50 }, (_, i) => mk(i)) }) });
    await mount();
    expect(container.textContent).toContain('(50+)');
  });

  it('неполная порция — точное число', async () => {
    get.mockResolvedValue({ ok: true, status: 200, json: async () => ({ calls: [mk(1), mk(2)] }) });
    await mount();
    expect(container.textContent).toContain('(2)');
  });
});
