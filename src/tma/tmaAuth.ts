import { tokenManager } from '../utils/tokenManager';
import { getInitData } from './telegram';

const BASE = import.meta.env.VITE_BACKEND_URL || '';

/**
 * Таймаут на fetch к auth-ручкам Mini App.
 *
 * Без него зависший (не упавший, а именно НЕ ОТВЕТИВШИЙ) fetch вешает
 * tmaLogin/tmaLinkExisting навсегда — а через apiClient.setReauthHandler
 * (Task 9: `async () => (await tmaLogin()).status === 'authenticated'`) это
 * вешает и очередь запросов в apiClient, у которого своего таймаута нет и не
 * будет (см. ревью: apiClient слишком общий, чтобы знать разумную длительность
 * для чужого колбэка — таймаут должен жить у источника сетевого вызова).
 *
 * 8 секунд — компромисс для мобильного вебвью Telegram на плохой связи
 * (метро, поезд, EDGE/слабый 3G): там TTFB в единицы секунд — обычное дело,
 * а сам запрос маленький (один POST с initData). Меньше — и человека на
 * медленном, но живом соединении молча выкинет на экран «откройте через
 * Telegram», хотя он и так в нём сидит. Больше — и реальный обрыв связи
 * ощущается как зависшее приложение дольше, чем нужно. Это ВИДНО человеку:
 * через apiClient.setReauthHandler этот вызов сидит внутри цепочки промисов,
 * которую ждёт исходный вызывающий код (apiClient.request → handleTokenRefresh
 * → reauthHandler), — то есть что бы ни показывал вызывающий экран на время
 * запроса (спиннер, дизейбл кнопки), оно провисит все 8с, если связь плохая.
 * Поэтому таймаут и выбран осознанно, а не «поставили с запасом»: короче —
 * ложные срабатывания на живом, но медленном соединении, длиннее — человек
 * дольше смотрит на зависшее место в интерфейсе.
 */
const AUTH_FETCH_TIMEOUT_MS = 8000;

export type TmaLoginResult =
  | { status: 'authenticated' }
  | { status: 'needsChoice' }
  | { status: 'notInTelegram' };

/**
 * Вход по подписанному initData.
 *
 * Без intent ручка на незнакомый Telegram отвечает 404 needsChoice — аккаунт
 * заводится только после явного выбора человека, иначе каждый заглянувший
 * получал бы пустой аккаунт.
 *
 * @param timeoutMs переопределяет таймаут fetch — параметр только для тестов
 * (не ждать реальные 8с), в проде вызывающий код его не передаёт.
 */
export async function tmaLogin(
  opts: { intent?: 'signup' } = {},
  timeoutMs: number = AUTH_FETCH_TIMEOUT_MS,
): Promise<TmaLoginResult> {
  const initData = getInitData();
  if (!initData) return { status: 'notInTelegram' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}/webhook/tma/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, intent: opts.intent }),
      signal: controller.signal,
    });

    if (res.status === 404) return { status: 'needsChoice' };
    if (!res.ok) return { status: 'notInTelegram' };

    const data = await res.json();
    const access = data['access-token'];
    const refresh = data['refresh-token'];
    if (!access || !refresh) return { status: 'notInTelegram' };

    tokenManager.saveTokens(access, refresh);
    return { status: 'authenticated' };
  } catch {
    // Таймаут (AbortError) и любой другой сетевой обрыв — трактуем как «не
    // вошли», а не бросаем: функция документирована как возвращающая статус,
    // а не кидающая исключение (вызывающий код, включая reauthHandler в
    // apiClient, полагается именно на это).
    return { status: 'notInTelegram' };
  } finally {
    clearTimeout(timer);
  }
}

export type TmaLinkResult = { status: 'ok' } | { status: 'conflict' } | { status: 'failed' };

/**
 * Привязывает Telegram к аккаунту, в который уже вошли по SMS.
 * Требует действующего access-токена: ручка под JwtGuard.
 *
 * @param timeoutMs см. tmaLogin — тот же смысл, тот же дефолт.
 */
export async function tmaLinkExisting(
  timeoutMs: number = AUTH_FETCH_TIMEOUT_MS,
): Promise<TmaLinkResult> {
  const initData = getInitData();
  if (!initData) return { status: 'failed' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE}/webhook/auth/identities/link/telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenManager.getAccessToken() ?? ''}`,
      },
      body: JSON.stringify({ initData }),
      signal: controller.signal,
    });

    if (res.status === 409) return { status: 'conflict' };
    return res.ok ? { status: 'ok' } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
