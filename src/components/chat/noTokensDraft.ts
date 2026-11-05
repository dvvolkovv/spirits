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
