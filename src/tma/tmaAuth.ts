import { tokenManager } from '../utils/tokenManager';
import { getInitData } from './telegram';

const BASE = import.meta.env.VITE_BACKEND_URL || '';

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
 */
export async function tmaLogin(opts: { intent?: 'signup' } = {}): Promise<TmaLoginResult> {
  const initData = getInitData();
  if (!initData) return { status: 'notInTelegram' };

  const res = await fetch(`${BASE}/webhook/tma/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, intent: opts.intent }),
  });

  if (res.status === 404) return { status: 'needsChoice' };
  if (!res.ok) return { status: 'notInTelegram' };

  const data = await res.json();
  const access = data['access-token'];
  const refresh = data['refresh-token'];
  if (!access || !refresh) return { status: 'notInTelegram' };

  tokenManager.saveTokens(access, refresh);
  return { status: 'authenticated' };
}

export type TmaLinkResult = { status: 'ok' } | { status: 'conflict' } | { status: 'failed' };

/**
 * Привязывает Telegram к аккаунту, в который уже вошли по SMS.
 * Требует действующего access-токена: ручка под JwtGuard.
 */
export async function tmaLinkExisting(): Promise<TmaLinkResult> {
  const initData = getInitData();
  if (!initData) return { status: 'failed' };

  const res = await fetch(`${BASE}/webhook/auth/identities/link/telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenManager.getAccessToken() ?? ''}`,
    },
    body: JSON.stringify({ initData }),
  });

  if (res.status === 409) return { status: 'conflict' };
  return res.ok ? { status: 'ok' } : { status: 'failed' };
}
