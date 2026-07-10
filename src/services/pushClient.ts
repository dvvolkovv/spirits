// Web Push клиент (Слой 1 low-friction Android). Регистрирует PushManager-подписку
// в браузере и синхронизирует её с бэкендом (/webhook/push/*). Всё best-effort:
// на неподдерживающих браузерах (iOS < 16.4, отсутствие SW) тихо возвращает false.

import { tokenManager } from '../utils/tokenManager';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export const pushPermission = (): NotificationPermission | 'unsupported' =>
  pushSupported() ? Notification.permission : 'unsupported';

// base64url (VAPID public key) → Uint8Array для applicationServerKey.
const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
};

const authHeaders = (): Record<string, string> => {
  const t = tokenManager.getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Регистрирует SW (идемпотентно). Возвращает регистрацию или null.
export const ensureServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
};

// Полный опт-ин: запрос разрешения → подписка → отправка на бэкенд.
// Возвращает true при успехе. Требует залогиненного юзера (иначе бэкенд отвергнет).
export const enablePush = async (): Promise<boolean> => {
  if (!pushSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;

    const reg = await ensureServiceWorker();
    if (!reg) return false;
    await navigator.serviceWorker.ready;

    // VAPID public key с бэкенда.
    const keyRes = await fetch(`${BACKEND}/webhook/push/public-key`);
    const { publicKey } = await keyRes.json();
    if (!publicKey) return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const res = await fetch(`${BACKEND}/webhook/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

// Отписка: убирает подписку в браузере и на бэкенде.
export const disablePush = async (): Promise<boolean> => {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await fetch(`${BACKEND}/webhook/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
};

// Уже подписан в этом браузере?
export const isPushSubscribed = async (): Promise<boolean> => {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return false;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
};

// Тестовый пуш самому себе (для кнопки «проверить»).
export const sendTestPush = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${BACKEND}/webhook/push/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    return res.ok;
  } catch {
    return false;
  }
};
