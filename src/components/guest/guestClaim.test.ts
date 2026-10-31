// src/components/guest/guestClaim.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./guestApi', () => ({ claimGuestTrial: vi.fn() }));
vi.mock('../../services/eventsClient', () => ({ track: vi.fn() }));
import { claimGuestTrial } from './guestApi';
import { track } from '../../services/eventsClient';
import { GUEST_CLAIM_TIMEOUT_MS, claimPendingGuestTrial } from './guestClaim';
import { readTrial, saveTrial } from './guestStorage';
import { peekPendingAssistant } from '../../utils/pendingAssistant';

const claim = claimGuestTrial as unknown as ReturnType<typeof vi.fn>;
const trackMock = track as unknown as ReturnType<typeof vi.fn>;
const TOKEN = 'T'.repeat(43);

beforeEach(() => {
  localStorage.clear();
  claim.mockReset();
  trackMock.mockClear();
  saveTrial({ token: TOKEN, assistantId: '14' });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('перенос пробы при входе', () => {
  // m9: потолок ожидания — именованная константа, а не голое число 5000.
  it('m9: таймаут по умолчанию — именованная константа 5000', () => {
    expect(GUEST_CLAIM_TIMEOUT_MS).toBe(5000);
  });

  it('перенесено — ключ забыт, кабинет откроет ассистента, неудача не трекается', async () => {
    claim.mockResolvedValue({ status: 'claimed', assistantId: '14' });
    await claimPendingGuestTrial();
    expect(claim).toHaveBeenCalledWith(TOKEN);
    expect(readTrial()).toBeNull();
    // m13: peekPendingAssistant() вместо разбора pending_assistant руками.
    expect(peekPendingAssistant()).toBe('14');
    expect(trackMock).not.toHaveBeenCalled();
  });

  // m13: на gone ассистент НЕ запоминается (в отличие от claimed выше) — это
  // отдельная проверка, а не предположение «раз ключ забыт, то и так же».
  it('пробы нет (gone) — ключ забыт, ассистент НЕ запоминается, неудача не трекается', async () => {
    claim.mockResolvedValue({ status: 'gone' });
    await claimPendingGuestTrial();
    expect(readTrial()).toBeNull();
    expect(peekPendingAssistant()).toBeNull();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('сбой (статус retry) и таймаут — ключ остаётся для следующей попытки, оба трекаются', async () => {
    claim.mockResolvedValue({ status: 'retry' });
    await claimPendingGuestTrial();
    expect(readTrial()).not.toBeNull();
    expect(trackMock).toHaveBeenCalledWith('guest_trial_claim_failed', { reason: 'retry' });

    trackMock.mockClear();
    claim.mockImplementation(() => new Promise(() => {}));
    await claimPendingGuestTrial(20);
    expect(readTrial()).not.toBeNull();
    expect(trackMock).toHaveBeenCalledWith('guest_trial_claim_failed', { reason: 'timeout' });
  });

  // m13: ветка catch — мок claimGuestTrial ОТКЛОНЯЕТ промис (не просто
  // возвращает статус 'retry'). В реальности guestApi.claimGuestTrial сам
  // ловит свои ошибки и не бросает — но claimPendingGuestTrial не должен
  // полагаться на это: сторонний сбой (например, внутри Promise.race) не
  // должен стирать ключ пробы.
  it('ветка catch (claimGuestTrial отклоняет промис) — ключ остаётся, трекается error (m13, m11)', async () => {
    claim.mockRejectedValue(new Error('сеть'));
    await claimPendingGuestTrial();
    expect(readTrial()).not.toBeNull();
    expect(trackMock).toHaveBeenCalledWith('guest_trial_claim_failed', { reason: 'error' });
  });

  it('без пробы — ни одного запроса', async () => {
    localStorage.clear();
    await claimPendingGuestTrial();
    expect(claim).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  // m10 (Critical): ответ приходит ПОСЛЕ того, как клиент перестал ждать
  // (наш внутренний таймаут уже выиграл гонку, вызов уже вернулся). Если
  // этот поздний ответ — claimed/gone, ключ забывается ЗАДНИМ числом; но
  // ассистент НЕ запоминается — вход уже не ждёт, запоминать его сейчас
  // поздно и может запутать текущую навигацию.
  it('m10: поздний ответ claimed после таймаута — ключ забыт позже, ассистент не запомнен', async () => {
    vi.useFakeTimers();
    let resolveClaim: ((r: unknown) => void) | undefined;
    claim.mockImplementation(() => new Promise((resolve) => { resolveClaim = resolve; }));

    const pending = claimPendingGuestTrial(20);
    await vi.advanceTimersByTimeAsync(20);
    await pending;
    expect(readTrial()).not.toBeNull();

    resolveClaim!({ status: 'claimed', assistantId: '99' });
    await vi.advanceTimersByTimeAsync(0);

    expect(readTrial()).toBeNull();
    expect(peekPendingAssistant()).toBeNull();
  });

  it('m10: поздний ответ gone после таймаута — ключ забыт позже', async () => {
    vi.useFakeTimers();
    let resolveClaim: ((r: unknown) => void) | undefined;
    claim.mockImplementation(() => new Promise((resolve) => { resolveClaim = resolve; }));

    const pending = claimPendingGuestTrial(20);
    await vi.advanceTimersByTimeAsync(20);
    await pending;
    expect(readTrial()).not.toBeNull();

    resolveClaim!({ status: 'gone' });
    await vi.advanceTimersByTimeAsync(0);

    expect(readTrial()).toBeNull();
  });

  // Поздний ответ retry (claimGuestTrial сама решила повторить позже) — не
  // повод трогать ключ, он и так остался от самого таймаута.
  it('m10: поздний ответ retry после таймаута — ключ как был, без лишних действий', async () => {
    vi.useFakeTimers();
    let resolveClaim: ((r: unknown) => void) | undefined;
    claim.mockImplementation(() => new Promise((resolve) => { resolveClaim = resolve; }));

    const pending = claimPendingGuestTrial(20);
    await vi.advanceTimersByTimeAsync(20);
    await pending;

    resolveClaim!({ status: 'retry' });
    await vi.advanceTimersByTimeAsync(0);

    expect(readTrial()).not.toBeNull();
  });
});
