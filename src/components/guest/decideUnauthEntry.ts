import type { GuestMode } from './guestTypes';

export type UnauthEntry = 'guest' | 'login';

export interface EntryInput {
  /** Нативная сборка (Capacitor): там вход открывается из лаунчера, проба не нужна. */
  native: boolean;
  /** Режим с сервера; null — сервер не ответил. */
  mode: GuestMode | null;
  /** Вкладка открыта с ?trial=1. */
  preview: boolean;
  /** С этого устройства уже входили. */
  hasAccount: boolean;
  pathname: string;
}

/**
 * Кого кабинет без входа встречает пробой (spec 2026-10-30-guest-trial):
 * новое устройство на / или /chat в вебе. Все остальные — экраном входа, как раньше.
 */
export function decideUnauthEntry(i: EntryInput): UnauthEntry {
  if (i.native || i.hasAccount) return 'login';
  const path = i.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/' && path !== '/chat') return 'login';
  if (i.mode === 'on') return 'guest';
  if (i.mode === 'preview' && i.preview) return 'guest';
  return 'login';
}
