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
/**
 * Предел ТОЛЬКО у захвата из адреса (#draft=/#ask=, index.html) — сторож
 * синхронизации (draftCapture.test.ts, draftCaptureAsk.test.ts) сверяет
 * именно это число с хардкодом в index.html, трогать нельзя.
 */
export const DRAFT_MAX_LENGTH = 600;
/**
 * Предел самого хранилища (read() и savePendingDraft) — столько принимает
 * поле пробы (config.maxChars в кабинете может быть больше 600, ревью
 * качества B8, I7). До этой правки read() отбрасывал любую запись длиннее
 * DRAFT_MAX_LENGTH, и savePendingDraft из GuestChat (проба закрылась раньше
 * ответа) молча не сохранял длинный вопрос вовсе — черновик терялся.
 *
 * T5 (хвост по перепроверке 31.10): число ЗАФИКСИРОВАНО здесь, а не читается
 * из config.maxChars — а админ может поднять лимит поля пробы выше 2000 (он
 * хранится на бэке и этой константой не ограничен). В таком случае для
 * текста длиннее PENDING_DRAFT_STORE_MAX, но короче актуального
 * config.maxChars, savePendingDraft на стене снова молча не сохранит
 * черновик — тот же симптом, что чинило I7, просто с другим порогом. Поднять
 * этот предел вместе с admin-лимитом (например, передавать его в
 * savePendingDraft) — отдельная правка, в эту пачку не входит.
 */
export const PENDING_DRAFT_STORE_MAX = 2000;

interface Stored {
  text: string;
  assistant: string;
  expires: number;
  /** Вопрос с поля лендинга (#ask=): проба без входа отправит его сама. */
  auto?: boolean;
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
      p.text.length <= PENDING_DRAFT_STORE_MAX &&
      typeof p.assistant === 'string' &&
      typeof p.expires === 'number' &&
      p.expires > now
    ) {
      return { text: p.text, assistant: p.assistant, expires: p.expires, auto: p.auto === true };
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
  return takePendingDraftEntry(assistantId, now)?.text ?? null;
}

/** Ждёт ли черновик этого ассистента — без выдачи и без стирания (только битая или просроченная запись стирается, как при любом чтении). */
export function hasPendingDraftFor(assistantId: string | number, now = Date.now()): boolean {
  const stored = read(now);
  return stored !== null && stored.assistant === String(assistantId);
}

/** Забыть черновик — при выходе из аккаунта и удалении профиля (clearAppStorage). */
export function forgetPendingDraft(): void {
  forget();
}

export interface PendingDraftEntry {
  text: string;
  auto: boolean;
}

/**
 * То же, что takePendingDraftFor, но с пометкой «отправить» — для пробы без
 * входа. Чат после входа пользуется takePendingDraftFor и только подставляет.
 */
export function takePendingDraftEntry(assistantId: string | number, now = Date.now()): PendingDraftEntry | null {
  const stored = read(now);
  if (!stored || stored.assistant !== String(assistantId)) return null;
  forget();
  return { text: stored.text, auto: stored.auto === true };
}

/**
 * Положить черновик самому: проба закрылась раньше, чем пришёл ответ, — текст
 * дождётся входа и встанет в поле чата с тем же ассистентом.
 *
 * Не трогает ЖИВОЙ черновик другого ассистента (например, #draft= с данными
 * рождения для другого ассистента, пока гость ещё в пробе у этого): чужой
 * непрочитанный черновик ценнее — это редкий случай. Свой черновик (тот же
 * ассистент) и просроченный — перезаписываются.
 */
export function savePendingDraft(text: string, assistantId: string | number, now = Date.now()): void {
  const t = text.trim();
  if (!t || t.length > PENDING_DRAFT_STORE_MAX) return;
  const existing = read(now);
  if (existing && existing.assistant !== String(assistantId)) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: t, assistant: String(assistantId), expires: now + DRAFT_TTL_MS }));
  } catch {
    /* хранилище недоступно — черновик не переживёт вход */
  }
}
