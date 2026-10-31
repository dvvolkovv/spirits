import { track } from '../../services/eventsClient';
import { rememberPendingAssistant } from '../../utils/pendingAssistant';
import { claimGuestTrial, type GuestClaimResult } from './guestApi';
import { forgetTrial, readTrial } from './guestStorage';

/** m9: потолок ожидания переноса именованной константой, а не голым числом. */
export const GUEST_CLAIM_TIMEOUT_MS = 5000;

/**
 * Перенести пробу этого устройства в аккаунт, в который только что вошли.
 * Не бросает и ждёт не дольше timeoutMs: вход важнее переноса. Сбой и таймаут
 * оставляют ключ — перенос повторится при следующем открытии кабинета (initAuth).
 */
export async function claimPendingGuestTrial(timeoutMs = GUEST_CLAIM_TIMEOUT_MS): Promise<void> {
  const trial = readTrial();
  if (!trial) return;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const real = claimGuestTrial(trial.token);
  const timeout = new Promise<GuestClaimResult>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve({ status: 'retry' });
    }, timeoutMs);
  });
  try {
    const r = await Promise.race([real, timeout]);
    if (r.status === 'claimed') {
      rememberPendingAssistant(r.assistantId);
      forgetTrial();
    } else if (r.status === 'gone') {
      forgetTrial();
    } else {
      // m11: неудача (не 'claimed'/'gone') — видна в событиях. 'timeout' —
      // победил НАШ таймер (клиент перестал ждать), а не честный ответ
      // 'retry' от самого claimGuestTrial.
      track('guest_trial_claim_failed', { reason: timedOut ? 'timeout' : 'retry' });
    }
    // m10 (Critical): таймаут выиграл гонку, но настоящий запрос ещё летит —
    // когда он всё же ответит, обработать это ЗАДНИМ числом: claimed/gone —
    // забыть ключ (сервер подтвердил исход), но без rememberPendingAssistant —
    // вход уже не ждёт этого ответа, запоминать ассистента сейчас поздно и
    // рискует подменить более новое намерение навигации. 'retry' — не повод
    // трогать что-либо (ключ и так остался от самого таймаута).
    if (timedOut) {
      void real
        .then((late) => {
          if (late.status === 'claimed' || late.status === 'gone') forgetTrial();
        })
        .catch(() => { /* сеть у позднего ответа — не повод действовать задним числом */ });
    }
  } catch {
    // m11: сторонний сбой (claimGuestTrial отклонила промис) — как сетевая
    // неудача: ключ остаётся, повтор — на следующем открытии кабинета.
    track('guest_trial_claim_failed', { reason: 'error' });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
