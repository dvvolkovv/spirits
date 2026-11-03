export type SlaState = 'overdue' | 'soon' | 'normal' | 'answered' | 'closed';

export function slaState(ticket: {
  first_response_due_at: string | null;
  first_owner_reply_at: string | null;
  status?: string;
}, nowMs: number): SlaState {
  if (ticket.status === 'resolved') return 'closed';
  if (ticket.first_owner_reply_at) return 'answered';
  if (!ticket.first_response_due_at) return 'normal';
  const due = Date.parse(ticket.first_response_due_at);
  if (due < nowMs) return 'overdue';
  return due - nowMs <= 30 * 60_000 ? 'soon' : 'normal';
}

export function remainingText(dueIso: string | null, nowMs: number): string {
  if (!dueIso) return '—';
  const minutes = Math.ceil((Date.parse(dueIso) - nowMs) / 60_000);
  if (minutes < 0) return `−${Math.abs(minutes)} мин`;
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}
