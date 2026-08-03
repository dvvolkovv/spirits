// src/components/calendar/InlineCalendarProposals.tsx
// Mirrors <InlineVideoCards> in ChatInterface.tsx: the backend tags streamed
// assistant text with `[CALENDAR_PROPOSAL:<uuid>]` markers (Task S1/S2 — replaces
// the dead T6 `tool_result`/`propose_calendar_event` structural dispatch, which
// never fires for the real agent path). This component resolves each marker id
// to its proposal payload via an authorized GET and renders the existing
// <CalendarProposalCard/> unchanged.
//
// Auth: uses the same `apiClient` Bearer-token client (with auto-refresh on 401)
// as every other authorized call in this app — see src/components/video/useVideoJobs.ts
// for the identical pattern. No hand-rolled auth here.
import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import { CalendarProposalCard } from './CalendarProposalCard';
import { ApiPost, CalendarProposalEvent, CalendarConflict, CalendarProposalKind } from './types';

interface ProposalData {
  event: CalendarProposalEvent;
  connected: boolean;
  conflicts: CalendarConflict[];
  /** 'event' or 'task'; normalized below since older/omitted payloads mean 'event'. */
  kind: CalendarProposalKind;
  /** Number of occurrences the proposal expands to (1 for a single event, N
   * for a series). Defaults to 1 when the backend omits it (back-compat). */
  occurrenceCount: number;
  /** ISO-local start of the first/last occurrence, when the backend computed
   * them (series only). */
  firstAt?: string;
  lastAt?: string;
}

type Entry = { status: 'loading' | 'error' } | { status: 'ok'; data: ProposalData };

export const InlineCalendarProposals = ({ ids, apiPost }: { ids: string[]; apiPost: ApiPost }) => {
  const [byId, setById] = useState<Record<string, Entry>>({});
  // Tracks ids we've already kicked off a fetch for, so re-renders (and new ids
  // arriving alongside already-resolved ones) never re-request the same proposal.
  const requestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    for (const id of ids) {
      if (requestedRef.current.has(id)) continue;
      requestedRef.current.add(id);
      if (!cancelled) {
        setById((prev) => ({ ...prev, [id]: { status: 'loading' } }));
      }
      apiClient
        .get(`/webhook/calendar/proposal/${id}`)
        .then(async (resp) => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          if (!data?.event) throw new Error('missing event');
          if (!cancelled) {
            setById((prev) => ({
              ...prev,
              [id]: {
                status: 'ok',
                data: {
                  event: data.event,
                  connected: !!data.connected,
                  conflicts: Array.isArray(data.conflicts) ? data.conflicts : [],
                  kind: data.kind === 'task' ? 'task' : 'event',
                  occurrenceCount:
                    typeof data.occurrenceCount === 'number' && data.occurrenceCount > 0
                      ? data.occurrenceCount
                      : 1,
                  firstAt: typeof data.firstAt === 'string' ? data.firstAt : undefined,
                  lastAt: typeof data.lastAt === 'string' ? data.lastAt : undefined,
                },
              },
            }));
          }
        })
        .catch(() => {
          // Not found / expired / network error — skip this card gracefully,
          // same as InlineVideoCards rendering nothing for an unresolvable id.
          if (!cancelled) {
            setById((prev) => ({ ...prev, [id]: { status: 'error' } }));
          }
        });
    }

    return () => {
      cancelled = true;
    };

    // Re-run whenever the set of ids changes; dedup via requestedRef keeps it cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  if (!ids.length) return null;

  return (
    <>
      {ids.map((id) => {
        const entry = byId[id];
        if (!entry || entry.status === 'loading') {
          return <div key={id} className="mt-2 max-w-md h-28 rounded-xl bg-gray-200 animate-pulse" />;
        }
        if (entry.status === 'error') return null;
        return (
          <CalendarProposalCard
            key={id}
            event={entry.data.event}
            connected={entry.data.connected}
            conflicts={entry.data.conflicts}
            kind={entry.data.kind}
            occurrenceCount={entry.data.occurrenceCount}
            firstAt={entry.data.firstAt}
            lastAt={entry.data.lastAt}
            apiPost={apiPost}
          />
        );
      })}
    </>
  );
};

export default InlineCalendarProposals;
