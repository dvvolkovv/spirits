/**
 * Ассистент, выбранный до входа.
 *
 * Страница ассистента на linkeon.io ведёт на /chat?assistant=<id>. Новый
 * человек сначала попадает на экран входа, а после входа кабинет открывает
 * голый /chat (SmsLoginPane, AuthOAuthCallbackPage, AuthLinkPage) — параметр
 * терялся, и человек со страницы Райи оказывался на экране выбора темы.
 *
 * localStorage, а не sessionStorage: ссылка входа из письма часто открывается
 * в новой вкладке. Срок — час: дольше выбор перестаёт быть намерением.
 */
const KEY = 'pending_assistant';
const TTL_MS = 60 * 60 * 1000;
const MAX_LENGTH = 64;

interface Stored {
  value: string;
  expires: number;
}

function forget(): void {
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
  forget();
  return null;
}

/** id или имя ассистента из ?assistant= — до входа. Пустое и длинное игнорируется. */
export function rememberPendingAssistant(value: string | null, now = Date.now()): void {
  const v = value?.trim();
  if (!v || v.length > MAX_LENGTH) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ value: v, expires: now + TTL_MS }));
  } catch {
    /* переполненное хранилище не должно ломать вход */
  }
}

/** Запомненное, не стирая. Просроченное стирается и не отдаётся. */
export function peekPendingAssistant(now = Date.now()): string | null {
  const stored = read();
  if (!stored) return null;
  if (stored.expires <= now) {
    forget();
    return null;
  }
  return stored.value;
}

/** Запомненное — один раз: отдаёт и стирает. */
export function takePendingAssistant(now = Date.now()): string | null {
  const value = peekPendingAssistant(now);
  forget();
  return value;
}
