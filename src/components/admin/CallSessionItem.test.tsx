// @vitest-environment jsdom
/**
 * Строку сессии проверяем монтированием: два клика в одной строке — по номеру
 * человека и по самой строке — должны делать разное, и по коду это не
 * доказывается.
 *
 * Без @testing-library, как AdminBlogView.test.tsx: хватает createRoot и act.
 */
import { act, type ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));

import { CallSessionItem, type CallSession } from './CallSessionItem';
import { formatTokens } from './callsFormat';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const session = (over: Partial<CallSession> = {}): CallSession => ({
  id: 'c-1', user_id: '79236230446', provider: 'zoom', agent_name: 'Роман',
  started_at: '2026-09-16T09:46:31Z', duration_sec: 117, status: 'completed',
  model: 'gpt-realtime-2.1', summary: 'Обсуждали погоду',
  tokens_call: 6241, tokens_consult: 1100, tokens_total: 7341, consults: 2,
  flags: [], user_turns: 3,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const mount = async (el: ReactElement) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ul>{el}</ul>); });
};

/** Дать допройти цепочке промисов внутри обработчика клика. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const click = async (el: HTMLElement | null) => {
  if (!el) throw new Error('нет элемента');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ transcript: [{ ts: 0, role: 'user', text: 'Какая погода?' }] }),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('CallSessionItem', () => {
  it('подписывает площадку, ассистента и списание', async () => {
    await mount(<CallSessionItem session={session()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Zoom');
    expect(text).toContain('Роман');
    expect(text).toContain(formatTokens(7341));
  });

  it('клик по строке раскрывает расшифровку', async () => {
    await mount(<CallSessionItem session={session()} />);
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledWith('/webhook/admin/calls/c-1/transcript');
    expect(container.textContent).toContain('Какая погода?');
  });

  it('клик по номеру открывает человека и не раскрывает расшифровку', async () => {
    const onOpenUser = vi.fn();
    await mount(<CallSessionItem session={session()} onOpenUser={onOpenUser} />);
    await click(q('call-session-user-c-1'));
    expect(onOpenUser).toHaveBeenCalledWith('79236230446');
    expect(get).not.toHaveBeenCalled();
  });

  it('без onOpenUser номера нет: в карточке человек и так известен', async () => {
    await mount(<CallSessionItem session={session()} />);
    expect(q('call-session-user-c-1')).toBeNull();
  });

  it('прерванный звонок без реплик человека не раскрывается', async () => {
    await mount(<CallSessionItem session={session({ status: 'interrupted', flags: ['interrupted'], duration_sec: null, user_turns: 0 })} />);
    await click(q('call-session-c-1'));
    expect(get).not.toHaveBeenCalled();
  });

  it('прерванный звонок с репликами раскрывается: расшифровку пишут по ходу', async () => {
    // На стенде 25.09.2026 расшифровка есть у 7 из 11 прерванных встреч.
    await mount(<CallSessionItem session={session({ status: 'interrupted', flags: ['interrupted'], duration_sec: null, user_turns: 2 })} />);
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('сбой встречи раскрывается: расшифровка бывает и до обрыва', async () => {
    await mount(<CallSessionItem session={session({ status: 'failed', flags: ['failed'] })} />);
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('сбой');
  });

  it('идущая сессия перечитывает расшифровку при каждом раскрытии', async () => {
    // Расшифровку voice-host дописывает по ходу: сохранённая при первом
    // раскрытии к следующему уже устарела бы.
    await mount(<CallSessionItem session={session({ status: 'active', flags: ['live'], duration_sec: null })} />);
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('завершённая сессия грузит расшифровку один раз', async () => {
    await mount(<CallSessionItem session={session()} />);
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledTimes(1);
  });
});
