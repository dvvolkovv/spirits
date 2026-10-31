import { tokenManager } from '../../utils/tokenManager';

/**
 * Что проба без входа держит в браузере (spec 2026-10-30-guest-trial).
 *
 * guest_trial — ключ пробы и её ассистент. Ключ выдаёт сервер; без него
 * разговор нельзя ни продолжить, ни перенести в аккаунт. Стирается после
 * переноса и при выходе из аккаунта (clearAppStorage): следующий на этом
 * устройстве не должен забрать чужую пробу.
 *
 * linkeon_has_account — «с этого устройства уже входили». Такому устройству
 * кабинет показывает экран входа, а не пробу. clearAppStorage его НЕ стирает:
 * в этом его смысл. hasAccount() ниже считает «входили» и по оставшемуся
 * jwt_access_token (G2, ревью B-final, 31.10) — тем же правилом, что и
 * ранний скрипт index.html.
 *
 * guest_trial_preview — в sessionStorage: вкладка открыта с ?trial=1, и режим
 * «предпросмотр» показывает пробу только ей.
 */
const TRIAL_KEY = 'guest_trial';
const HAS_ACCOUNT_KEY = 'linkeon_has_account';
const PREVIEW_KEY = 'guest_trial_preview';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export interface StoredTrial {
  token: string;
  assistantId: string;
}

export function readTrial(): StoredTrial | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(TRIAL_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<StoredTrial>;
    if (typeof p.token === 'string' && TOKEN_RE.test(p.token) && typeof p.assistantId === 'string' && /^\d{1,6}$/.test(p.assistantId)) {
      return { token: p.token, assistantId: p.assistantId };
    }
  } catch {
    /* не JSON — стираем ниже */
  }
  forgetTrial();
  return null;
}

export function saveTrial(trial: StoredTrial): void {
  try { localStorage.setItem(TRIAL_KEY, JSON.stringify(trial)); } catch { /* приватный режим: проба живёт до перезагрузки */ }
}

export function forgetTrial(): void {
  try { localStorage.removeItem(TRIAL_KEY); } catch { /* хранилище недоступно — забывать нечего */ }
}

export function markHasAccount(): void {
  try { localStorage.setItem(HAS_ACCOUNT_KEY, '1'); } catch { /* приватный режим */ }
}

export function hasAccount(): boolean {
  // G2 (ревью B-final, 31.10): «входили» — не только по отметке
  // linkeon_has_account, но и по оставшемуся jwt_access_token. Ранний
  // скрипт index.html (data-guest-config-prefetch) уже решает так же, по
  // любому из двух ключей — иначе кабинет предложит пробу тому, у кого
  // живой access-токен просто не стёрт.
  try {
    if (localStorage.getItem(HAS_ACCOUNT_KEY) === '1') return true;
    return !!tokenManager.getAccessToken();
  } catch {
    return false;
  }
}

export function rememberPreviewFromUrl(search: string): void {
  try {
    if (new URLSearchParams(search).get('trial') === '1') sessionStorage.setItem(PREVIEW_KEY, '1');
  } catch { /* приватный режим */ }
}

export function previewRequested(): boolean {
  try { return sessionStorage.getItem(PREVIEW_KEY) === '1'; } catch { return false; }
}
