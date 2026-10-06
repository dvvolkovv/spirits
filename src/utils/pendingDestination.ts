/**
 * Раздел кабинета, в который человек шёл до входа.
 *
 * Кнопка «Сделать сайт или бота» на linkeon.io ведёт на /studio?tab=products.
 * Новый человек сначала видит экран входа, а все пути входа кончаются голым
 * /chat: SMS и OAuth — navigate('/chat'), экран привязки —
 * window.location.replace('/chat'), ссылка из письма — страница бэкенда с
 * location.replace('/chat'). Поэтому адрес запоминается здесь до входа, а
 * после входа его забирает PendingDestinationRedirect, стоящий на /chat.
 *
 * Только из белого списка: произвольный адрес из ссылки сделал бы кабинет
 * открытым редиректом. Хранилище и срок — как у pendingAssistant:
 * localStorage (ссылку из письма часто открывают в новой вкладке), час.
 */
const KEY = 'pending_destination';
const TTL_MS = 60 * 60 * 1000;

/** Разрешённые разделы: путь и обязательная вкладка. */
const ALLOWED: { path: string; tab: string }[] = [{ path: '/studio', tab: 'products' }];

interface Stored {
  value: string;
  expires: number;
}

/** Канонический адрес из белого списка или null. Лишние параметры отбрасываются. */
export function allowedDestination(pathname: string, search: string): string | null {
  const tab = new URLSearchParams(search).get('tab');
  const hit = ALLOWED.find((a) => a.path === pathname && a.tab === tab);
  return hit ? `${hit.path}?tab=${hit.tab}` : null;
}

export function forgetPendingDestination(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* хранилище недоступно — забывать нечего */
  }
}

/** Запись из хранилища; битая стирается — второй раз спотыкаться о неё незачем. */
function read(): Stored | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.value === 'string' && typeof parsed.expires === 'number') {
      return { value: parsed.value, expires: parsed.expires };
    }
  } catch {
    /* не JSON — стираем ниже */
  }
  forgetPendingDestination();
  return null;
}

/** Запомнить раздел до входа, если он из белого списка. Возвращает, запомнен ли. */
export function rememberPendingDestination(pathname: string, search: string, now = Date.now()): boolean {
  const value = allowedDestination(pathname, search);
  if (!value) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ value, expires: now + TTL_MS }));
    return true;
  } catch {
    /* переполненное хранилище не должно ломать вход */
    return false;
  }
}

/**
 * Запомненное — один раз: отдаёт и стирает. Просроченное не отдаётся. Запись
 * сверяется со списком повторно: в хранилище могли положить что угодно, а
 * отдаётся всегда канонический адрес из списка, не строка из хранилища.
 */
export function takePendingDestination(now = Date.now()): string | null {
  const stored = read();
  forgetPendingDestination();
  if (!stored || stored.expires <= now) return null;
  let url: URL;
  try {
    url = new URL(stored.value, 'https://cabinet.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://cabinet.invalid') return null;
  return allowedDestination(url.pathname, url.search);
}
