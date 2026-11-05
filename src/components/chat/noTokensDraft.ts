/**
 * Ход, остановленный шлагбаумом баланса. Бэк с 03.11.2026 присылает в конце
 * потока `end` с `reason: 'no_tokens'` (spirits_back/src/chat/chat.service.ts),
 * а сообщение пользователя при таком отказе на сервер НЕ записывается: без
 * восстановления оно пропадало при F5 и на другом устройстве, и человек
 * набирал его заново (бэклог 2d71aaf8).
 *
 * Кабинет по этому признаку возвращает текст в поле ввода и открывает окно
 * пополнения. Проверка именно `type === 'end'`: `item` с тем же текстом
 * остановки — просто реплика ассистента, а не сигнал.
 */
export interface ChatStreamEvent {
  type?: string;
  reason?: string;
}

export function isNoTokensEnd(event: ChatStreamEvent | null | undefined): boolean {
  return event?.type === 'end' && event?.reason === 'no_tokens';
}

/**
 * Текст возвращаем только в пустое поле: пока шёл отказ, человек мог уже
 * начать писать следующее сообщение — его набор затирать нельзя.
 */
export function restoreDraftText(current: string, sent: string): string {
  return current.trim() ? current : sent;
}

/**
 * Копия отклонённого черновика в sessionStorage (per-tab). Нужна потому, что
 * переход к оплате — это window.location.href: страница выгружается, и всё
 * состояние чата умирает ровно в момент, когда человек пошёл пополнять баланс.
 * Без копии текст пропадал бы уже ПОСЛЕ покупки. Читаем при монтировании,
 * стираем только при явной отправке — F5 до отправки текст сохраняет.
 *
 * Файлы здесь сознательно не храним: File не сериализуется, после перезагрузки
 * вложения прикрепляют заново (их имена остаются в пузыре ленты).
 */
const KEY_PREFIX = 'no_tokens_draft:';

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function saveNoTokensDraft(assistantId: number | string, text: string): void {
  if (!text.trim()) return;
  try { storage()?.setItem(KEY_PREFIX + assistantId, text); } catch { /* квота/приватный режим */ }
}

export function peekNoTokensDraft(assistantId: number | string): string | null {
  try { return storage()?.getItem(KEY_PREFIX + assistantId) || null; } catch { return null; }
}

export function clearNoTokensDraft(assistantId: number | string): void {
  try { storage()?.removeItem(KEY_PREFIX + assistantId); } catch { /* no-op */ }
}

