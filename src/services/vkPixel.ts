// VK Ads пиксель (счётчик top.Mail.Ru 3773048). Базовый pageView + цель
// «registration» при регистрации нового пользователя — чтобы алгоритм VK
// оптимизировал кампании на реальные регистрации, а не на клики (бэклог 46b21d27).
const VK_PIXEL_ID = '3773048';

declare global {
  interface Window { _tmr?: Array<Record<string, unknown>>; }
}

let initialized = false;

export function initVkPixel(): void {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;
  try {
    const _tmr = (window._tmr = window._tmr || []);
    _tmr.push({ id: VK_PIXEL_ID, type: 'pageView', start: Date.now() });
    if (document.getElementById('tmr-code')) return;
    const ts = document.createElement('script');
    ts.type = 'text/javascript';
    ts.async = true;
    ts.id = 'tmr-code';
    ts.src = 'https://top-fwz1.mail.ru/js/code.js';
    const s = document.getElementsByTagName('script')[0];
    s?.parentNode?.insertBefore(ts, s);
  } catch { /* пиксель никогда не ломает приложение */ }
}

export function vkReachGoal(goal: string): void {
  try {
    (window._tmr = window._tmr || []).push({ type: 'reachGoal', id: VK_PIXEL_ID, goal });
  } catch { /* ignore */ }
}
