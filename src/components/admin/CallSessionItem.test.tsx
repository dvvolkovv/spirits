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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const rerender = async (el: ReactElement) => {
  await act(async () => { root.render(<ul>{el}</ul>); });
  await settle();
};

const key = async (el: HTMLElement | null, k: string) => {
  if (!el) throw new Error('нет элемента');
  await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
  await settle();
};

/** Ответ ручки расшифровки с одной репликой человека. */
const reply = (text: string) => ({
  ok: true, status: 200,
  json: async () => ({ transcript: [{ ts: 0, role: 'user', text }] }),
});

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
    expect(q('call-session-panel-c-1')).toBeNull();
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
    get.mockResolvedValueOnce(reply('Первая реплика')).mockResolvedValueOnce(reply('Вторая реплика'));
    await mount(<CallSessionItem session={session({ status: 'active', flags: ['live'], duration_sec: null })} />);
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Вторая реплика');
  });

  it('завершённая сессия грузит расшифровку один раз', async () => {
    await mount(<CallSessionItem session={session()} />);
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('свёрнутая строка обрезает саммари, раскрытая — показывает целиком', async () => {
    // block и line-clamp-2 вместе не работают: block в CSS идёт позже.
    await mount(<CallSessionItem session={session()} />);
    const summary = () => q('call-session-summary-c-1')!;
    expect(summary().classList.contains('line-clamp-2')).toBe(true);
    expect(summary().classList.contains('block')).toBe(false);
    await click(q('call-session-c-1'));
    expect(summary().classList.contains('line-clamp-2')).toBe(false);
  });

  it('ошибка загрузки видна и не кешируется: следующее раскрытие повторяет запрос', async () => {
    get.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new Error('html'); } });
    await mount(<CallSessionItem session={session()} />);
    await click(q('call-session-c-1'));
    expect(container.textContent).toContain('Не удалось загрузить расшифровку');
    expect(container.textContent).not.toContain('Расшифровки нет');
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Какая погода?');
    expect(container.textContent).not.toContain('Не удалось загрузить расшифровку');
  });

  it('404 с JSON-телом — тоже ошибка, а не пустая расшифровка', async () => {
    // Бэкенд отдаёт 404 нарочно: «звонка нет» не должно выглядеть как
    // разговор, в котором молчали.
    get.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'call not found' }) });
    await mount(<CallSessionItem session={session()} />);
    await click(q('call-session-c-1'));
    expect(container.textContent).toContain('Не удалось загрузить расшифровку');
    expect(container.textContent).not.toContain('Расшифровки нет');
  });

  it('расшифровка перечитывается, когда сессия сменила состояние', async () => {
    // Лента перерисовывает строку на месте: встреча, открытая пока шла, после
    // завершения не должна остаться с обрезанной расшифровкой.
    get.mockResolvedValueOnce(reply('Пока шла')).mockResolvedValueOnce(reply('После завершения'));
    const live = session({ status: 'active', flags: ['live'], duration_sec: null, user_turns: 1 });
    await mount(<CallSessionItem session={live} />);
    await click(q('call-session-c-1'));
    await rerender(<CallSessionItem session={{ ...live, status: 'completed', flags: [], duration_sec: 300, user_turns: 4 }} />);
    expect(get).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('После завершения');
  });

  it('строка, переставшая раскрываться, закрывается', async () => {
    const live = session({ status: 'active', flags: ['live'], duration_sec: null, user_turns: 0 });
    await mount(<CallSessionItem session={live} />);
    await click(q('call-session-c-1'));
    expect(q('call-session-panel-c-1')).not.toBeNull();
    await rerender(<CallSessionItem session={{ ...live, status: 'interrupted', flags: ['interrupted'] }} />);
    expect(q('call-session-panel-c-1')).toBeNull();
    expect(q('call-session-c-1')?.hasAttribute('aria-expanded')).toBe(false);
  });

  it('ответ устаревшего запроса не затирает свежий', async () => {
    let resolveOld!: (v: unknown) => void;
    get.mockReset();
    get.mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }));
    get.mockImplementationOnce(() => Promise.resolve(reply('Свежая реплика')));
    await mount(<CallSessionItem session={session({ status: 'active', flags: ['live'], duration_sec: null })} />);
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    await click(q('call-session-c-1'));
    await act(async () => { resolveOld(reply('Старая реплика')); });
    await settle();
    expect(container.textContent).toContain('Свежая реплика');
    expect(container.textContent).not.toContain('Старая реплика');
  });

  it('битая реплика в расшифровке не роняет строку', async () => {
    get.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ transcript: [null, 5, { ts: 0, role: 'user', text: 'Живая реплика' }] }),
    });
    await mount(<CallSessionItem session={session()} />);
    await click(q('call-session-c-1'));
    expect(container.textContent).toContain('Живая реплика');
  });

  it('Enter на строке раскрывает её, Enter на кнопке номера — нет', async () => {
    await mount(<CallSessionItem session={session()} onOpenUser={vi.fn()} />);
    await key(q('call-session-user-c-1'), 'Enter');
    expect(q('call-session-panel-c-1')).toBeNull();
    await key(q('call-session-c-1'), 'Enter');
    expect(q('call-session-panel-c-1')).not.toBeNull();
    expect(q('call-session-c-1')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('раскладка списания видна в раскрытой строке, а не только в подсказке', async () => {
    // title не открывается ни пальцем, ни с клавиатуры.
    await mount(<CallSessionItem session={session()} />);
    await click(q('call-session-c-1'));
    expect(q('call-session-panel-c-1')?.textContent).toContain('консультации');
  });

  it('строка старого формата (без tokens_call) рисуется, а не роняет приложение', async () => {
    // Новый фронт на старом бэкенде: getUserCalls отдавал tokens_charged и не
    // знал про tokens_call/tokens_consult. Выкат только фронта или откат бэка
    // без отката фронта — и карточка человека роняла всё приложение.
    const old = { ...session(), tokens_call: undefined, tokens_consult: undefined, tokens_total: undefined } as unknown as CallSession;
    await mount(<CallSessionItem session={old} />);
    expect(container.textContent).toContain('Обсуждали погоду');
  });
});
