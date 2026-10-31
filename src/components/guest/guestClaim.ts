import { rememberPendingAssistant } from '../../utils/pendingAssistant';
import { claimGuestTrial, type GuestClaimResult } from './guestApi';
import { forgetTrial, readTrial } from './guestStorage';

/**
 * Перенести пробу этого устройства в аккаунт, в который только что вошли.
 * Не бросает и ждёт не дольше timeoutMs: вход важнее переноса. Сбой и таймаут
 * оставляют ключ — перенос повторится при следующем открытии кабинета (initAuth).
 */
export async function claimPendingGuestTrial(timeoutMs = 5000): Promise<void> {
  const trial = readTrial();
  if (!trial) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<GuestClaimResult>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'retry' }), timeoutMs);
  });
  try {
    const r = await Promise.race([claimGuestTrial(trial.token), timeout]);
    if (r.status === 'claimed') {
      rememberPendingAssistant(r.assistantId);
      forgetTrial();
    } else if (r.status === 'gone') {
      forgetTrial();
    }
  } catch {
    /* сеть — как retry */
  } finally {
    if (timer) clearTimeout(timer);
  }
}
