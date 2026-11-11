/**
 * Ход, остановленный шлагбаумом баланса. Бэк присылает в конце потока `end`
 * с `reason: 'no_tokens'`; `item` с таким же reason — обычная реплика, не сигнал.
 */
export function isNoTokensEnd(
  event: { type?: string; reason?: string } | null | undefined,
): boolean {
  return event?.type === 'end' && event?.reason === 'no_tokens';
}

/** Возвращает отклонённый текст, не затирая новый набор в поле. */
export function restoreIntoInput(current: string, rejected: string): string {
  if (!rejected.trim()) return current;
  return current.trim() ? `${current}\n\n${rejected}` : rejected;
}

export interface ChatMessageLike {
  id?: string;
  type: 'user' | 'assistant';
  content: string;
  noTokensStop?: boolean;
}

/** Убирает отклонённый пузырь и прежний финальный stop, затем добавляет новый. */
export function collapseNoTokensStop<T extends ChatMessageLike>(
  messages: T[],
  rejectedId: string,
  stopMessage: T,
): T[] {
  const remaining = messages.filter((message) => message.id !== rejectedId);
  const withoutPreviousStop = remaining[remaining.length - 1]?.noTokensStop
    ? remaining.slice(0, -1)
    : remaining;
  return [...withoutPreviousStop, stopMessage];
}

/** Текст для поля и общего pending_draft после отказа по балансу. */
export function applyNoTokensOutcome({
  rejectedText,
  queuedText,
}: {
  rejectedText: string;
  queuedText: string;
}): { input: string; draftText: string } {
  const input = queuedText.trim() ? `${rejectedText}\n\n${queuedText}` : rejectedText;
  return { input, draftText: input };
}
