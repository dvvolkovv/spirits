// src/components/calendar/CalendarProposalCard.tsx
import React, { useState } from 'react';
import { CalendarPlus, CalendarCheck, AlertTriangle, X, Check, RotateCcw, Loader2 } from 'lucide-react';
import { ConnectCalendarModal } from './ConnectCalendarModal';
import { ApiPost, CalendarProposalEvent, CalendarConflict, CalendarProposalKind, CalendarRecurrence } from './types';

export type { ApiPost, CalendarProposalEvent, CalendarConflict, CalendarProposalKind } from './types';

interface Props {
  event: CalendarProposalEvent;
  connected: boolean;
  conflicts: CalendarConflict[];
  /** Number of occurrences the proposal expands to. >1 (with `event.recurrence`
   * or `event.dates` present) switches the card into read-only series mode.
   * Defaults to 1 (single-event, unchanged behavior) for back-compat. */
  occurrenceCount?: number;
  /** ISO-local start of the first/last occurrence (series only). */
  firstAt?: string;
  lastAt?: string;
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

// --- Series-mode helpers -----------------------------------------------
// firstAt/lastAt/event.datetime and recurrence.until are all naive
// Asia/Yekaterinburg wall-clock strings (no offset) per the backend's
// Global Constraints — display is a straight string slice, no Date/TZ
// conversion needed (and none wanted: `new Date(naiveIso)` would parse it
// in the browser's own local timezone, which is a different bug).
const formatDateShort = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}` : iso;
};

const formatTimeShort = (iso: string): string => {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
};

const addMinutesToTime = (iso: string, minutes: number): string => {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return '';
  const total = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + minutes + 1440 * 100) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const pluralRu = (n: number, one: string, few: string, many: string): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};

const WEEK_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const RU_DAY: Record<string, string> = {
  MO: 'Пн',
  TU: 'Вт',
  WE: 'Ср',
  TH: 'Чт',
  FR: 'Пт',
  SA: 'Сб',
  SU: 'Вс',
};

const formatByDay = (byDay: string[]): string => {
  const idxs = byDay
    .map((d) => WEEK_ORDER.indexOf(d))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (idxs.length === 0) return '';
  const isContiguous = idxs.every((v, i) => i === 0 || v === idxs[i - 1] + 1);
  if (isContiguous && idxs.length > 1) {
    return `${RU_DAY[WEEK_ORDER[idxs[0]]]}–${RU_DAY[WEEK_ORDER[idxs[idxs.length - 1]]]}`;
  }
  return idxs.map((i) => RU_DAY[WEEK_ORDER[i]]).join(', ');
};

const formatRecurrence = (r: CalendarRecurrence): string => {
  let base: string;
  if (r.freq === 'daily') {
    const interval = r.interval && r.interval > 1 ? r.interval : 1;
    base = interval > 1 ? `каждые ${interval} дн.` : 'каждый день';
  } else {
    base = r.byDay && r.byDay.length > 0 ? formatByDay(r.byDay) : 'еженедельно';
    if (r.interval && r.interval > 1) base += ` (раз в ${r.interval} нед.)`;
  }
  const tail = r.count ? `${r.count} раз` : r.until ? `до ${formatDateShort(r.until)}` : '';
  return tail ? `${base} · ${tail}` : base;
};

export const CalendarProposalCard: React.FC<Props> = ({
  event,
  connected,
  conflicts,
  occurrenceCount,
  firstAt,
  lastAt,
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
  const [addedInfo, setAddedInfo] = useState<{ created: number; failed: number } | null>(null);

  const isSeries = (occurrenceCount ?? 1) > 1 && !!(event.recurrence || event.dates?.length);

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

  const handleAddSeries = async () => {
    setStatus('saving');
    setError(null);
    try {
      const r = await apiPost('/webhook/calendar/events', {
        title: event.title,
        datetime: event.datetime,
        durationMin: event.durationMin,
        note: event.note,
        recurrence: event.recurrence,
        dates: event.dates,
      });
      if (r?.ok) {
        setAddedInfo({ created: r.created ?? 0, failed: r.failed ?? 0 });
        setStatus('added');
      } else {
        setStatus('error');
        setError(r?.error || 'Не удалось добавить серию');
      }
    } catch (e: any) {
      setStatus('error');
      setError(e?.message ?? 'Не удалось добавить серию');
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
        {isSeries ? (
          <div className="rounded-lg bg-forest-50/60 px-3 py-2 space-y-1 text-sm text-forest-900">
            <div className="flex justify-between gap-2">
              <span className="text-gray-600">Даты</span>
              <span className="font-medium">
                {formatDateShort(firstAt ?? event.datetime)}–{formatDateShort(lastAt ?? firstAt ?? event.datetime)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-600">Время</span>
              <span className="font-medium">
                {formatTimeShort(firstAt ?? event.datetime)}–
                {addMinutesToTime(firstAt ?? event.datetime, event.durationMin ?? 60)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-600">Повтор</span>
              <span className="font-medium">
                {event.recurrence
                  ? formatRecurrence(event.recurrence)
                  : `${occurrenceCount ?? event.dates?.length ?? 0} дат`}
              </span>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
        {event.note && <p className="text-xs text-gray-500">{event.note}</p>}
        {conflicts.length > 0 &&
          (isSeries ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {conflicts.length} {pluralRu(conflicts.length, 'пересечение', 'пересечения', 'пересечений')}
            </div>
          ) : (
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
          ))}
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
            {isSeries && addedInfo
              ? addedInfo.failed > 0
                ? `Добавлено ${addedInfo.created} из ${addedInfo.created + addedInfo.failed}`
                : `Добавлено: ${addedInfo.created}`
              : 'Добавлено ✓'}
          </span>
        ) : status === 'error' ? (
          <button
            type="button"
            onClick={isSeries ? handleAddSeries : handleAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Повторить
          </button>
        ) : (
          <button
            type="button"
            onClick={isSeries ? handleAddSeries : handleAdd}
            disabled={status === 'saving' || (!isSeries && !canAdd)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {status === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarCheck className="w-3.5 h-3.5" />}
            {isSeries ? 'Добавить серию' : 'Добавить'}
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
