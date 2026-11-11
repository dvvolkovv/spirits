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
export function applyNoTokensOutcome(args: {
  rejectedText: string;
  queuedText: string;
}): { input: string; draftText: string } {
  const queued = args.queuedText.trim();
  const input = queued ? `${args.rejectedText}\n\n${queued}` : args.rejectedText;
  return { input, draftText: input };
}

/*
 * Временная совместимость для ChatInterface до его миграции в Task 2.
 * Новые helpers выше эти wrappers не используют.
 */
const KEY_PREFIX = 'no_tokens_draft:';

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** @deprecated Использовать restoreIntoInput после миграции ChatInterface. */
export function restoreDraftText(current: string, sent: string): string {
  return current.trim() ? current : sent;
}

/** @deprecated Временный per-tab черновик до перехода ChatInterface на pendingDraft. */
export function saveNoTokensDraft(assistantId: number | string, text: string): void {
  if (!text.trim()) return;
  try { storage()?.setItem(KEY_PREFIX + assistantId, text); } catch { /* квота/приватный режим */ }
}

/** @deprecated Временный per-tab черновик до перехода ChatInterface на pendingDraft. */
export function peekNoTokensDraft(assistantId: number | string): string | null {
  try { return storage()?.getItem(KEY_PREFIX + assistantId) || null; } catch { return null; }
}

/** @deprecated Временный per-tab черновик до перехода ChatInterface на pendingDraft. */
export function clearNoTokensDraft(assistantId: number | string): void {
  try { storage()?.removeItem(KEY_PREFIX + assistantId); } catch { /* no-op */ }
}
