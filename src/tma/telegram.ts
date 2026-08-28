/**
 * Тонкая обёртка над window.Telegram.WebApp.
 *
 * Существует ради одного: весь остальной код Mini App не должен трогать
 * глобальный объект напрямую. Вне Telegram (дев-сервер, случайный заход
 * браузером) каждая функция обязана деградировать молча, а не падать —
 * иначе разработка превращается в отладку белого экрана.
 */

interface TelegramWebApp {
  initData: string;
  themeParams: Record<string, string>;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  close(): void;
  openLink?(url: string): void;
}

function webApp(): TelegramWebApp | null {
  return (window as any)?.Telegram?.WebApp ?? null;
}

export function getInitData(): string {
  return webApp()?.initData ?? '';
}

/**
 * Пустой initData означает открытие вне Telegram: сам объект WebApp
 * существует и в обычном браузере, если подключён их скрипт.
 */
export function isInsideTelegram(): boolean {
  return getInitData().length > 0;
}

/**
 * Язык приложения Telegram. initData — обычная query-строка, поле `user` в
 * ней это JSON. Битый JSON здесь не исключение, а норма для чужих клиентов:
 * молча отдаём null, интерфейс просто останется на языке устройства.
 */
export function getTelegramLanguage(): string | null {
  try {
    const raw = new URLSearchParams(getInitData()).get('user');
    if (!raw) return null;
    return JSON.parse(raw)?.language_code ?? null;
  } catch {
    return null;
  }
}

export function applyTelegramTheme(): void {
  const app = webApp();
  if (!app) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(app.themeParams || {})) {
    root.style.setProperty(`--tg-${key.replace(/_/g, '-')}`, value);
  }
  root.setAttribute('data-theme', app.colorScheme || 'light');
}

export function readyAndExpand(): void {
  const app = webApp();
  if (!app) return;
  app.ready();
  app.expand();
}

export function closeApp(): void {
  webApp()?.close();
}

/**
 * Внешняя ссылка. Через WebApp.openLink она открывается в системном браузере
 * поверх Telegram; window.open внутри WebView в лучшем случае не делает
 * ничего. Фолбэк на window.open — для дев-сервера и обычного браузера.
 */
export function openLink(url: string): void {
  const app = webApp();
  if (app?.openLink) app.openLink(url);
  else window.open(url, '_blank');
}
