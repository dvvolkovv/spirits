// src/components/guest/GuestChat.test.tsx
// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actAsync, byButton, byLink, click, clickAsync, doubleClick, flush, mount, type, visibleText, type Mounted } from '../../test/dom';

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
vi.mock('../../services/eventsClient', () => ({
  track: vi.fn(),
  getSource: vi.fn(() => null),
  getCampaign: vi.fn(() => null),
  getSessionId: vi.fn(() => 's_test'),
}));
vi.mock('./guestApi', () => ({ sendGuestMessage: vi.fn() }));

import { getSessionId, track } from '../../services/eventsClient';
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
afterEach(() => { view?.unmount(); view = null; vi.useRealTimers(); });

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
    open({ onBusyChange });
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    view!.unmount();
    view = null;
    await flush();
    await flush();
    expect(capturedSignal?.aborted).toBe(true);
    // Опора — onBusyChange: второго вызова (false) не было, значит откат на
    // размонтированном компоненте и правда не трогал состояние. Проверка
    // console.error сюда ничего не добавляла (React 18 не предупреждает о
    // setState после размонтирования) и была убрана по ревью качества B8.
    expect(onBusyChange.mock.calls).toEqual([[true]]);
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

  // --- B8-fix I4: обрыв после begin ---

  it('обрыв связи ПОСЛЕ begin — пузырь остаётся, текст не возвращается, кнопка «Обновить» (I4)', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(async (_i: unknown, on: (e: any) => void) => {
      on({ type: 'guest', token: TOKEN, left: 3 });
      on({ type: 'begin' });
      on({ type: 'item', content: 'Нач' });
      return 'network';
    });
    open();
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(visibleText(view!.container)).toContain('Вопрос'); // пузырь остался в ленте
    expect(visibleText(view!.container)).toContain('Связь прервалась');
    expect(byButton(view!.container, /Обновить/)).not.toBeNull();
    expect(input().value).toBe(''); // текст НЕ возвращён в поле — повтор продублировал бы ответ
  });

  it('обрыв связи ДО begin — обычная сетевая ошибка, текст возвращён в поле (I4)', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockResolvedValue('network');
    open();
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(visibleText(view!.container)).toContain('Нет связи с сервером');
    expect(byButton(view!.container, /Обновить/)).toBeNull(); // кнопка — только у interrupted/badRequest
    expect(input().value).toBe('Вопрос');
  });

  // --- B8-fix M5: новые виды ошибок ---

  it("результат 'busy_trial' — «предыдущий ответ ещё пишется» (M5)", async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockResolvedValue('busy_trial');
    open();
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(visibleText(view!.container)).toContain('Предыдущий ответ ещё пишется');
  });

  it("результат 'bad_request' — текст с кнопкой «Обновить» (M5)", async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockResolvedValue('bad_request');
    open();
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(visibleText(view!.container)).toContain('Не получилось отправить это сообщение');
    expect(byButton(view!.container, /Обновить/)).not.toBeNull();
  });

  // --- B8-fix M1: синхронный замок от двойной отправки ---

  it('двойной клик по кнопке отправки шлёт сообщение только один раз (M1)', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation(answer('Ответ'));
    open();
    type(input(), 'Привет');
    doubleClick(byButton(view!.container, /Отправить/)!);
    await flush();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  // --- B8-fix I6: try/catch/finally, входные данные до оптимистичных шагов ---

  it('getSessionId бросает — видна сетевая ошибка, текст в поле, onBusyChange(false) (I6)', async () => {
    localStorage.setItem('loginConsent', 'true');
    (getSessionId as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const onBusyChange = vi.fn();
    open({ onBusyChange });
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(send).not.toHaveBeenCalled();
    expect(visibleText(view!.container)).toContain('Нет связи с сервером');
    expect(input().value).toBe('Вопрос');
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  // --- B8-fix M10: onStarted — по событию begin, не до отправки ---

  it('onStarted зовётся по событию begin, не раньше отправки (M10)', async () => {
    localStorage.setItem('loginConsent', 'true');
    let onEventFn: ((e: any) => void) | null = null;
    let resolveFn: ((v: string) => void) | null = null;
    send.mockImplementation((_i: unknown, on: (e: any) => void) => {
      onEventFn = on;
      return new Promise<string>((resolve) => { resolveFn = resolve; });
    });
    const p = open();
    type(input(), 'Привет');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    expect(p.onStarted).not.toHaveBeenCalled();
    await actAsync(() => { onEventFn!({ type: 'begin' }); });
    expect(p.onStarted).toHaveBeenCalledTimes(1);
    await actAsync(() => {
      onEventFn!({ type: 'end', content: 'Ответ' });
      resolveFn!('ok');
    });
    expect(visibleText(view!.container)).toContain('Ответ');
  });

  // --- B8-fix M11: сторож зависшего потока ---

  describe('сторож зависшего потока (M11)', () => {
    it('60с без событий ПОСЛЕ begin — поток отменяется, видно «связь прервалась»', async () => {
      localStorage.setItem('loginConsent', 'true');
      let onEventFn: ((e: any) => void) | null = null;
      let capturedSignal: AbortSignal | undefined;
      send.mockImplementation((_i: unknown, on: (e: any) => void, signal?: AbortSignal) => {
        onEventFn = on;
        capturedSignal = signal;
        return new Promise<string>((resolve) => {
          signal?.addEventListener('abort', () => resolve('aborted'));
        });
      });
      vi.useFakeTimers();
      open();
      type(input(), 'Вопрос');
      await clickAsync(byButton(view!.container, /Отправить/)!);
      await actAsync(() => { onEventFn!({ type: 'begin' }); });
      await actAsync(() => { vi.advanceTimersByTime(60_000); });
      expect(capturedSignal?.aborted).toBe(true);
      expect(visibleText(view!.container)).toContain('Связь прервалась');
    });

    it('60с без событий ДО begin — отменяется как обычная сетевая ошибка', async () => {
      localStorage.setItem('loginConsent', 'true');
      let capturedSignal: AbortSignal | undefined;
      send.mockImplementation((_i: unknown, _on: (e: any) => void, signal?: AbortSignal) => {
        capturedSignal = signal;
        return new Promise<string>((resolve) => {
          signal?.addEventListener('abort', () => resolve('aborted'));
        });
      });
      vi.useFakeTimers();
      open();
      type(input(), 'Вопрос');
      await clickAsync(byButton(view!.container, /Отправить/)!);
      await actAsync(() => { vi.advanceTimersByTime(60_000); });
      expect(capturedSignal?.aborted).toBe(true);
      expect(visibleText(view!.container)).toContain('Нет связи с сервером');
    });

    it('ping каждые 20с сбрасывает таймер — за 80с поток не отменяется', async () => {
      localStorage.setItem('loginConsent', 'true');
      let onEventFn: ((e: any) => void) | null = null;
      let resolveFn: ((v: string) => void) | null = null;
      send.mockImplementation((_i: unknown, on: (e: any) => void) => {
        onEventFn = on;
        return new Promise<string>((resolve) => { resolveFn = resolve; });
      });
      vi.useFakeTimers();
      open();
      type(input(), 'Вопрос');
      await clickAsync(byButton(view!.container, /Отправить/)!);
      await actAsync(() => { onEventFn!({ type: 'begin' }); });
      for (let i = 0; i < 4; i++) {
        await actAsync(() => { vi.advanceTimersByTime(20_000); });
        await actAsync(() => { onEventFn!({ type: 'ping' }); });
      }
      await actAsync(() => {
        onEventFn!({ type: 'end', content: 'Ответ после пингов' });
        resolveFn!('ok');
      });
      expect(visibleText(view!.container)).toContain('Ответ после пингов');
    });
  });

  // --- B8-fix I5: StrictMode — автоотправка черновика setTimeout(0) + mountedRef ---

  it('StrictMode: вопрос с лендинга уходит ровно один раз, ход завершается (I5)', async () => {
    localStorage.setItem('loginConsent', 'true');
    send.mockImplementation((_i: unknown, on: (e: any) => void, signal?: AbortSignal) =>
      new Promise<string>((resolve) => {
        signal?.addEventListener('abort', () => resolve('aborted'));
        Promise.resolve().then(() => {
          on({ type: 'guest', token: TOKEN, left: 3 });
          on({ type: 'begin' });
          on({ type: 'end', content: 'Ответ с лендинга' });
          resolve('ok');
        });
      }),
    );
    vi.useFakeTimers();
    const props: GuestChatProps = {
      assistantId: '12', assistantName: 'Роман', config: { mode: 'on', answersPerTrial: 3, maxChars: 2000 },
      token: null, initialMessages: [], initialLeft: null, draft: { text: 'Как поднять цены?', auto: true }, preview: false,
      onToken: vi.fn(), onStarted: vi.fn(), onTrialGone: vi.fn(),
    };
    view = mount(
      <StrictMode>
        <GuestChat {...props} />
      </StrictMode>,
    );
    // Эффекты StrictMode (mount→cleanup→mount) уже отыграли синхронно внутри
    // mount(); единственный переживший их таймер — setTimeout(0) реального
    // (второго) прохода. advanceTimersByTime(0) запускает его.
    await actAsync(() => { vi.advanceTimersByTime(0); });
    expect(send).toHaveBeenCalledTimes(1);
    await flush();
    await flush();
    expect(visibleText(view!.container)).toContain('Ответ с лендинга');
  });

  // --- B8-fix I1: служебные метки customMarkdown — в DOM их не должно остаться ---

  const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  /** Готовый (не частичный) ответ ассистента с меткой — через initialMessages. */
  function openWithAnswer(content: string) {
    return open({ initialMessages: [{ role: 'user', content: 'В' }, { role: 'assistant', content }], initialLeft: 2 });
  }

  describe('служебные метки разметки убраны из DOM (I1)', () => {
    it('{{button}} — пустая строка, подпись кнопки не просачивается', () => {
      openWithAnswer('До. {{button: Нажми меня | action: foo}} После.');
      expect(visibleText(view!.container)).not.toContain('__');
      expect(visibleText(view!.container)).not.toContain('Нажми меня');
    });

    it('{{link}} — текст ссылки виден, метки нет', () => {
      openWithAnswer('Смотрите {{link: сюда | url: https://example.com/page}} за подробностями.');
      expect(visibleText(view!.container)).not.toContain('__');
      expect(visibleText(view!.container)).toContain('сюда');
    });

    it('голый адрес видео — сам адрес становится обычной ссылкой (I2), метки нет', () => {
      openWithAnswer('Ролик: https://cdn.example.com/clip.mp4 смотрите.');
      expect(visibleText(view!.container)).not.toContain('__');
      const a = byLink(view!.container, /clip\.mp4/);
      expect(a).not.toBeNull();
      expect(a!.getAttribute('href')).toBe('https://cdn.example.com/clip.mp4');
      expect(a!.getAttribute('target')).toBe('_blank');
      expect(a!.className).toContain('ym-disable-tracklink');
    });

    it('голый адрес картинки — сам адрес становится обычной ссылкой (I2), метки нет', () => {
      openWithAnswer('Картинка: https://cdn.example.com/pic.png смотрите.');
      expect(visibleText(view!.container)).not.toContain('__');
      const a = byLink(view!.container, /pic\.png/);
      expect(a).not.toBeNull();
      expect(a!.getAttribute('href')).toBe('https://cdn.example.com/pic.png');
    });

    it('{{audio:id=…}} — пустая строка, id не просачивается', () => {
      openWithAnswer(`Запись: {{audio:id=${UUID}}}`);
      expect(visibleText(view!.container)).not.toContain('__');
      expect(visibleText(view!.container)).not.toContain(UUID);
    });

    it('{{voice_call: id=…}} — пустая строка', () => {
      openWithAnswer(`Звонок: {{voice_call: id=${UUID}}}`);
      expect(visibleText(view!.container)).not.toContain('__');
      expect(visibleText(view!.container)).not.toContain(UUID);
    });

    it('{{meeting_join}} — пустая строка, заголовок встречи не просачивается', () => {
      openWithAnswer('{{meeting_join: code=abc123 title=Планёрка}}');
      expect(visibleText(view!.container)).not.toContain('__');
      expect(visibleText(view!.container)).not.toContain('Планёрка');
    });

    it('блок ```ask``` — пустая строка (карточку с вариантами в пробе не отрисовать)', () => {
      const body = JSON.stringify({ questions: [{ question: 'Какой у вас бюджет?', multi: false, options: ['До 10к', 'Больше'] }] });
      openWithAnswer(`Уточню:\n\`\`\`ask\n${body}\n\`\`\``);
      expect(visibleText(view!.container)).not.toContain('__');
      expect(visibleText(view!.container)).not.toContain('бюджет');
    });

    it('блок ```product-action``` — пустая строка', () => {
      openWithAnswer(`Готово:\n\`\`\`product-action\n${JSON.stringify({ id: UUID })}\n\`\`\``);
      expect(visibleText(view!.container)).not.toContain('__');
      expect(visibleText(view!.container)).not.toContain(UUID);
    });
  });

  // --- B8-fix I2: ссылки и картинки ReactMarkdown ---

  describe('ссылки и картинки (I2)', () => {
    // {{link:…}} сам по себе отдаёт только текст (I1, без пометки «станет
    // ссылкой» — в отличие от __IMAGE__/__VIDEO__): безопасность components.a
    // проверяем на настоящей markdown-ссылке, как её мог написать ассистент
    // напрямую, и на голом адресе видео/картинки (тесты I1 выше).
    it('markdown-ссылка на веб-адрес — настоящая <a> с target=_blank и ym-disable-tracklink', () => {
      openWithAnswer('Смотрите [сюда](https://example.com/page) за подробностями.');
      const a = byLink(view!.container, /сюда/);
      expect(a).not.toBeNull();
      expect(a!.getAttribute('href')).toBe('https://example.com/page');
      expect(a!.getAttribute('target')).toBe('_blank');
      expect(a!.getAttribute('rel')).toContain('noopener');
      expect(a!.className).toContain('ym-disable-tracklink');
    });

    it('markdown-ссылка на javascript: — текстом, без <a href>', () => {
      openWithAnswer('Смотрите [кликни](javascript:alert(1)) здесь.');
      expect(visibleText(view!.container)).toContain('кликни');
      const anchors = Array.from(view!.container.querySelectorAll('a'));
      expect(anchors.some((el) => (el.getAttribute('href') ?? '').startsWith('javascript:'))).toBe(false);
    });

    it('сырой HTML в ответе ассистента выводится текстом, а не исполняется', () => {
      openWithAnswer('Текст с <a href="https://evil.example.com/">сырой ссылкой</a> внутри.');
      expect(view!.container.querySelector('a[href="https://evil.example.com/"]')).toBeNull();
    });

    it('настоящая markdown-картинка — без <img>, подпись alt текстом', () => {
      openWithAnswer('![подпись карты](https://cdn.example.com/card.png)');
      expect(view!.container.querySelector('img')).toBeNull();
      expect(visibleText(view!.container)).toContain('подпись карты');
    });
  });

  // --- B8-fix I3: прокрутка к стене ---

  it('при появлении стены лента прокручивается к ней (I3)', async () => {
    localStorage.setItem('loginConsent', 'true');
    const scrollIntoView = vi.fn();
    (HTMLElement.prototype as any).scrollIntoView = scrollIntoView;
    send.mockImplementation(answer('Третий ответ', [{ type: 'wall', reason: 'limit' }]));
    open();
    type(input(), 'Вопрос');
    await clickAsync(byButton(view!.container, /Отправить/)!);
    await flush();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });
});
