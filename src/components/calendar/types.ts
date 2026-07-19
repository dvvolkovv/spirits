// src/components/calendar/types.ts
// Shared types for the calendar-proposal card + connect modal — kept in their own
// module so CalendarProposalCard and ConnectCalendarModal don't need to import
// from each other (avoids a circular import between the two).

/** Authorized POST helper, passed down from ChatInterface so components here
 * don't duplicate the Bearer-token fetch logic (see ChatInterface's `apiPost`,
 * which wraps the existing `apiClient` service). */
export type ApiPost = (path: string, body: any) => Promise<any>;

export interface CalendarProposalEvent {
  title: string;
  /** ISO local, e.g. "2026-07-20T15:00:00" (no timezone offset — wall-clock time).
   * Optional for tasks — a task may have no due-time hint. Required in practice
   * for events (backend always supplies it for kind 'event'). */
  datetime?: string;
  durationMin?: number;
  note?: string;
}

export interface CalendarConflict {
  title: string;
  /** ISO instant. */
  at: string;
}

/** Whether a resolved proposal is a calendar event or a task ("дело"). Backend
 * defaults to 'event' when omitted (older payloads / undefined = treat as event). */
export type CalendarProposalKind = 'event' | 'task';
