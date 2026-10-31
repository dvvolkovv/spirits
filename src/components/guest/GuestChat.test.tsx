// src/components/guest/GuestChat.test.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byButton, click, clickAsync, flush, mount, type, visibleText, type Mounted } from '../../test/dom';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../onboarding/LoginTabs', () => ({ default: () => <div>форма входа</div> }));
vi.mock('../onboarding/LoginConsentBlock', () => ({
  default: ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <input type="checkbox" data-testid="consent-checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  ),
}));
vi.mock('../../services/eventsClient', () => ({ track: vi.fn(), getSource: () => null, getCampaign: () => null, getSessionId: () => 's_test' }));
vi.mock('./guestApi', () => ({ sendGuestMessage: vi.fn() }));

import { track } from '../../services/eventsClient';
import { sendGuestMessage } from './guestApi';
import GuestChat, { type GuestChatProps } from './GuestChat';

const send = sendGuestMessage as unknown as ReturnType<typeof vi.fn>;
const TOKEN = 'T'.repeat(43);

const answer = (text: string, extra: object[] = []) => async (_i: unknown, on: (e: any) => void) => {
  on({ type: 'guest', token: TOKEN, left: 3 });
  on({ type: 'begin' });
  on({ type: 'item', content: text.slice(0, 3) });
  on({ type: 'end', content: text });
  extra.forEach(on);
  return 'ok';
};

let view: Mounted | null = null;
function open(over: Partial<GuestChatProps> = {}) {
  const props: GuestChatProps = {
    assistantId: '12', assistantName: 'Роман', config: { mode: 'on', answersPerTrial: 3, maxChars: 2000 },
    token: null, initialMessages: [], initialLeft: null, draft: null, preview: false,
    onToken: vi.fn(), onStarted: vi.fn(), onTrialGone: vi.fn(), ...over,
  };
  view = mount(<GuestChat {...props} />);
  return props;
}
const input = () => view!.container.querySelector('[data-testid="guest-chat-input"]') as HTMLTextAreaElement;

beforeEach(() => { localStorage.clear(); send.mockReset(); (track as any).mockClear(); });
afterEach(() => { view?.unmount(); view = null; });

describe('чат пробы', () => {
  it('без согласия отправить нельзя; галочка открывает кнопку', async () => {
    open();
    type(input(), 'Привет');
    expect(byButton(view!.container, /Отправить/)!.disabled).toBe(true);
    click(view!.container.querySelector('[data-testid="consent-checkbox"]')!);
    expect(byButton(view!.container, /Отправить/)!.disabled).toBe(false);
    expect(localStorage.getItem('loginConsent')).toBe('true');
  });

  it('ответ печатается и встаёт в ленту; ключ уходит наверх', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(answer('Здравствуйте'));
    const p = open();
    type(input(), 'Привет');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(visibleText(view!.container)).toContain('Привет');
    expect(visibleText(view!.container)).toContain('Здравствуйте');
    expect(p.onToken).toHaveBeenCalledWith(TOKEN);
    expect(p.onStarted).toHaveBeenCalled();
  });

  it('стена после ответа: форма входа, поле убрано, событие', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(answer('Третий ответ', [{ type: 'wall', reason: 'limit' }]));
    open();
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(visibleText(view!.container)).toContain('Третий ответ');
    expect(visibleText(view!.container)).toContain('Чтобы продолжить и сохранить разговор, войдите');
    expect(visibleText(view!.container)).toContain('форма входа');
    expect(input()).toBeNull();
    expect(track).toHaveBeenCalledWith('guest_trial_wall', { reason: 'limit', assistant_id: '12' });
  });

  it('проба закрыта до ответа: текст ждёт входа черновиком', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(async (_i: unknown, on: (e: any) => void) => {
      on({ type: 'guest', left: 0 });
      on({ type: 'wall', reason: 'closed' });
      return 'ok';
    });
    open();
    type(input(), 'Мой вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(visibleText(view!.container)).toContain('Пробный режим сейчас недоступен');
    expect(JSON.parse(localStorage.getItem('pending_draft') ?? 'null')).toMatchObject({ text: 'Мой вопрос', assistant: '12' });
  });

  it('сбой модели: ошибка, сообщение вернулось в поле', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(async (_i: unknown, on: (e: any) => void) => {
      on({ type: 'guest', left: 3 });
      on({ type: 'error', code: 'model' });
      return 'ok';
    });
    open();
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(visibleText(view!.container)).toContain('Не получилось ответить');
    expect(input().value).toBe('Вопрос');
  });

  it('вопрос с лендинга при данном согласии уходит сам; черновик без пометки — только в поле', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(answer('Ответ'));
    open({ draft: { text: 'Как поднять цены?', auto: true } });
    await flush();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ message: 'Как поднять цены?', assistantId: '12', sid: 's_test' });
    view!.unmount();
    send.mockClear();
    open({ draft: { text: 'Данные рождения', auto: false } });
    await flush();
    expect(send).not.toHaveBeenCalled();
    expect(input().value).toBe('Данные рождения');
  });

  it('проба пропала — наверх уходит неотправленный текст', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockResolvedValue('trial_gone');
    const p = open({ token: TOKEN, initialMessages: [{ role: 'user', content: 'В' }, { role: 'assistant', content: 'О' }], initialLeft: 2 });
    type(input(), 'Ещё вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(p.onTrialGone).toHaveBeenCalledWith('Ещё вопрос');
  });

  it('восстановленная проба без остатка — сразу стена', () => {
    open({ token: TOKEN, initialMessages: [{ role: 'user', content: 'В' }, { role: 'assistant', content: 'О' }], initialLeft: 0 });
    expect(visibleText(view!.container)).toContain('форма входа');
  });

  // --- Дополнения контролёра ---

  // Доп. по ревью A7: onBusyChange?: (busy) => void — true на старте хода,
  // false по его окончании, в т.ч. при ошибке и стене (не только при успехе).
  it('onBusyChange: true на старте хода, false — по его завершении (доп. A7)', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(answer('Ответ'));
    const onBusyChange = vi.fn();
    open({ onBusyChange });
    type(input(), 'Привет');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it('onBusyChange отпускает и на стене (доп. A7)', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(answer('Третий ответ', [{ type: 'wall', reason: 'limit' }]));
    const onBusyChange = vi.fn();
    open({ onBusyChange });
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it('onBusyChange отпускает и на сбое модели (доп. A7)', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(async (_i: unknown, on: (e: any) => void) => {
      on({ type: 'guest', left: 3 });
      on({ type: 'error', code: 'model' });
      return 'ok';
    });
    const onBusyChange = vi.fn();
    open({ onBusyChange });
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  // Доп. по ревью B3: AbortController текущего хода, signal третьим аргументом
  // sendGuestMessage, отмена при размонтировании, результат 'aborted' — молча
  // (ни ошибки, ни setState, onBusyChange не зовётся вторым разом).
  it('размонтирование посреди хода отменяет его сигналом; результат aborted — молча (доп. B3)', async () => {
    localStorage.setItem('loginConsent', 'true');
    let capturedSignal: AbortSignal | undefined;
    send.mockImplementation((_i: unknown, _on: (e: any) => void, signal?: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<string>((resolve) => {
        signal?.addEventListener('abort', () => resolve('aborted'));
      });
    });
    const onBusyChange = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    open({ onBusyChange });
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    view!.unmount();
    view = null;
    await flush();
    await flush();
    expect(capturedSignal?.aborted).toBe(true);
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  // Доп. по ревью B4: результат 'server' (403/5xx — сервер ответил отказом)
  // показывается как ошибка 'model' («ассистент сейчас недоступен»), не как
  // «нет сети». Отображение result → ErrorKind — явный switch по всем значениям.
  it("результат 'server' отображается как ошибка модели, не как «нет сети» (доп. B4)", async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockResolvedValue('server');
    open();
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(visibleText(view!.container)).toContain('Не получилось ответить');
  });
});
