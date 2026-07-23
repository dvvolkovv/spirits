// src/components/calendar/types.ts
// Shared types for the calendar-proposal card + connect modal — kept in their own
// module so CalendarProposalCard and ConnectCalendarModal don't need to import
// from each other (avoids a circular import between the two).

/** Authorized POST helper, passed down from ChatInterface so components here
 * don't duplicate the Bearer-token fetch logic (see ChatInterface's `apiPost`,
 * which wraps the existing `apiClient` service). */
export type ApiPost = (path: string, body: any) => Promise<any>;

/** Recurrence rule for a series proposal (weekly/daily), mirrors backend
 * `Recurrence` (spirits_back/src/calendar/recurrence.ts). Exactly one of
 * `count`/`until` is expected when present. */
export interface CalendarRecurrence {
  freq: 'daily' | 'weekly';
  byDay?: string[];
  interval?: number;
  count?: number;
  until?: string;
}

export interface CalendarProposalEvent {
  title: string;
  /** ISO local, e.g. "2026-07-20T15:00:00" (no timezone offset — wall-clock time).
   * Optional for tasks — a task may have no due-time hint. Required in practice
   * for events (backend always supplies it for kind 'event'). Also optional for a
   * dates-only series proposal, which carries its occurrences in `dates` and omits this. */
  datetime?: string;
  durationMin?: number;
  note?: string;
  /** Series via RRULE (weekly/daily). Mutually informative with `dates`. */
  recurrence?: CalendarRecurrence;
  /** Series via explicit list of ISO-local start datetimes. */
  dates?: string[];
}

export interface CalendarConflict {
  title: string;
  /** ISO instant. */
  at: string;
}

/** Whether a resolved proposal is a calendar event or a task ("дело"). Backend
 * defaults to 'event' when omitted (older payloads / undefined = treat as event). */
export type CalendarProposalKind = 'event' | 'task';
