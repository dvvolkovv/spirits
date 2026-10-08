/**
 * Черновик первого сообщения ассистенту, пришедший со страницы linkeon.io.
 *
 * Калькулятор Human Design ведёт на /chat?assistant=14#draft=<текст>.
 * Скрипт в index.html (стоит ДО Метрики) забирает текст сюда и стирает
 * фрагмент из адреса: вебвизор Метрики пишет адрес страницы, и данные
 * рождения в нём оказались бы у Метрики. Формат записи этот скрипт повторяет —
 * его тест (draftCapture.test.ts) читает запись через этот модуль.
 *
 * localStorage, а не sessionStorage — как у pendingAssistant: ссылка входа из
 * письма открывается в новой вкладке. Срок — час. Черновик привязан к
 * ассистенту из ?assistant= и подставляется один раз — в чат с ним.
 */
export const DRAFT_KEY = 'pending_draft';
export const DRAFT_TTL_MS = 60 * 60 * 1000;
export const DRAFT_MAX_LENGTH = 600;

interface Stored {
  text: string;
  assistant: string;
  expires: number;
}

function forget(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* хранилище недоступно — забывать нечего */
  }
}

/** Запись из хранилища; битая, просроченная или подозрительная — стирается. */
function read(now: number): Stored | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Stored>;
    if (
      typeof p.text === 'string' &&
      p.text.trim() !== '' &&
      p.text.length <= DRAFT_MAX_LENGTH &&
      typeof p.assistant === 'string' &&
      typeof p.expires === 'number' &&
      p.expires > now
    ) {
      return { text: p.text, assistant: p.assistant, expires: p.expires };
    }
  } catch {
    /* не JSON — стираем ниже */
  }
  forget();
  return null;
}

/**
 * Текст черновика для этого ассистента — один раз: отдаёт и стирает.
 * Черновик другому ассистенту не трогается: человек может дойти до нужного
 * чата позже в пределах часа.
 */
export function takePendingDraftFor(assistantId: string | number, now = Date.now()): string | null {
  const stored = read(now);
  if (!stored || stored.assistant !== String(assistantId)) return null;
  forget();
  return stored.text;
}
