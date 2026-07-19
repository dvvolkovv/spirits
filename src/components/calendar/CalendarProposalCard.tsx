// src/components/calendar/CalendarProposalCard.tsx
import React, { useState } from 'react';
import { CalendarPlus, CalendarCheck, AlertTriangle, X, Check, RotateCcw, Loader2 } from 'lucide-react';
import { ConnectCalendarModal } from './ConnectCalendarModal';
import { ApiPost, CalendarProposalEvent, CalendarConflict, CalendarProposalKind } from './types';

export type { ApiPost, CalendarProposalEvent, CalendarConflict, CalendarProposalKind } from './types';

interface Props {
  event: CalendarProposalEvent;
  connected: boolean;
  conflicts: CalendarConflict[];
  apiPost: ApiPost;
  /** 'event' (default) or 'task'; the user can flip this via the in-card toggle
   * if the agent guessed wrong. */
  kind?: CalendarProposalKind;
}

type Status = 'idle' | 'saving' | 'added' | 'error' | 'dismissed';

// Backend proposes a local wall-clock datetime with no TZ offset (e.g.
// "2026-07-20T15:00:00"), which is exactly what <input type="datetime-local">
// expects (YYYY-MM-DDTHH:mm) — just trim seconds if present.
const toDatetimeLocalValue = (iso: string): string => {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return m ? m[1] : iso;
};

const formatConflictTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      timeZone: 'Asia/Yekaterinburg',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

// datetime-local yields "YYYY-MM-DDTHH:mm" (or "...:ss"); backend needs full "...:ss".
const withSeconds = (dt: string): string => {
  return /T\d{2}:\d{2}:\d{2}/.test(dt) ? dt : `${dt}:00`;
};

export const CalendarProposalCard: React.FC<Props> = ({
  event,
  connected,
  conflicts,
  apiPost,
  kind: initialKind,
}) => {
  const [isConnected, setIsConnected] = useState(connected);
  const [kind, setKind] = useState<CalendarProposalKind>(initialKind ?? 'event');
  const [datetime, setDatetime] = useState(event.datetime ? toDatetimeLocalValue(event.datetime) : '');
  const [durationMin, setDurationMin] = useState(event.durationMin ?? 60);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  if (status === 'dismissed') return null;

  const isTask = kind === 'task';
  // Event requires a datetime (existing behavior); a task's datetime is an
  // optional due-time hint, so an empty field never blocks "Добавить".
  const canAdd = !isTask ? datetime.length > 0 : true;

  const handleAdd = async () => {
    if (!canAdd) return;
    setStatus('saving');
    setError(null);
    try {
      const body: Record<string, any> = { title: event.title, note: event.note };
      const path = isTask ? '/webhook/calendar/tasks' : '/webhook/calendar/events';
      if (isTask) {
        if (datetime) body.datetime = withSeconds(datetime);
      } else {
        body.datetime = withSeconds(datetime);
        body.durationMin = durationMin;
      }
      const r = await apiPost(path, body);
      if (r?.ok) {
        setStatus('added');
      } else {
        setStatus('error');
        setError(r?.error || (isTask ? 'Не удалось добавить дело' : 'Не удалось добавить событие'));
      }
    } catch (e: any) {
      setStatus('error');
      setError(e?.message ?? (isTask ? 'Не удалось добавить дело' : 'Не удалось добавить событие'));
    }
  };

  const handleDismiss = () => setStatus('dismissed');

  if (!isConnected) {
    return (
      <div className="my-3 max-w-md rounded-xl border border-forest-200 bg-white shadow-sm px-4 py-3">
        <div className="flex items-start gap-3">
          <CalendarPlus className="w-5 h-5 text-forest-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-gray-800">Планируй время с Линкеоном — подключи календарь</p>
            <button
              type="button"
              onClick={() => setShowConnectModal(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700"
            >
              Подключить
            </button>
          </div>
        </div>
        {showConnectModal && (
          <ConnectCalendarModal
            apiPost={apiPost}
            onClose={() => setShowConnectModal(false)}
            onConnected={() => {
              setIsConnected(true);
              setShowConnectModal(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="my-3 max-w-md rounded-xl border border-forest-200 bg-white shadow-sm">
      <div className="border-b border-forest-100 px-4 py-3">
        <h4 className="text-base font-semibold text-forest-900">{event.title}</h4>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {isTask ? 'Добавить в дела' : 'Добавить в календарь'}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setKind('event')}
              disabled={status === 'saving' || status === 'added'}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                !isTask
                  ? 'bg-forest-600 border-forest-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Событие
            </button>
            <button
              type="button"
              onClick={() => setKind('task')}
              disabled={status === 'saving' || status === 'added'}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                isTask
                  ? 'bg-forest-600 border-forest-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Дело
            </button>
          </div>
        </div>
      </div>
      <div className="px-4 py-3 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Дата и время{isTask ? ' (необязательно)' : ''}
          </label>
          <input
            type="datetime-local"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
            disabled={status === 'saving' || status === 'added'}
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
        {!isTask && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Длительность (мин)</label>
            <input
              type="number"
              min={5}
              step={5}
              value={durationMin}
              onChange={(e) => setDurationMin(parseInt(e.target.value, 10) || 60)}
              disabled={status === 'saving' || status === 'added'}
              className="w-32 text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        )}
        {event.note && <p className="text-xs text-gray-500">{event.note}</p>}
        {conflicts.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Пересекается с:
            </div>
            <ul className="text-xs text-amber-700 space-y-0.5">
              {conflicts.map((c, i) => (
                <li key={i}>{c.title} ({formatConflictTime(c.at)})</li>
              ))}
            </ul>
          </div>
        )}
        {status === 'error' && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-forest-100 bg-forest-50 px-4 py-2">
        {status === 'added' ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700">
            <Check className="w-4 h-4" />
            Добавлено ✓
          </span>
        ) : status === 'error' ? (
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Повторить
          </button>
        ) : (
          <button
            type="button"
            onClick={handleAdd}
            disabled={status === 'saving' || !canAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {status === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarCheck className="w-3.5 h-3.5" />}
            Добавить
          </button>
        )}
        {status !== 'added' && (
          <button
            type="button"
            onClick={handleDismiss}
            disabled={status === 'saving'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-forest-300 bg-white px-3 py-1.5 text-sm font-medium text-forest-700 hover:bg-forest-50 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            Отклонить
          </button>
        )}
      </div>
    </div>
  );
};

export default CalendarProposalCard;
