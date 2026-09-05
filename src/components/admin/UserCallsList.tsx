import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { flagLabel, flagTone } from './callFlagLabels';

interface CallRow {
  id: string;
  started_at: string;
  duration_sec: number | null;
  status: string;
  tokens_charged: number;
  model: string | null;
  summary: string | null;
  flags: string[];
  user_turns: number;
}

interface Turn {
  ts?: number;
  role?: string;
  text?: string;
}

/**
 * Смещение реплики от начала разговора: «01:23». Пустая строка, если меток
 * времени нет — у части расшифровок `ts` может отсутствовать, и «NaN:NaN» в
 * диалоге хуже, чем ничего.
 */
function offsetLabel(firstTs?: number, ts?: number): string {
  if (typeof firstTs !== 'number' || typeof ts !== 'number') return '';
  const sec = Math.max(0, Math.round((ts - firstTs) / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

const TONE_CLASS = {
  danger: 'bg-red-50 text-red-700 border-red-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200',
} as const;

/**
 * Звонки человека — отдельным компонентом, как UserDevicesList: карточка
 * пользователя уже 990 строк, и класть туда ещё один экран значит сделать её
 * нечитаемой.
 */
export const UserCallsList: React.FC<{ userId: string }> = ({ userId }) => {
  const { t } = useTranslation();
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Record<string, Turn[]>>({});

  useEffect(() => {
    let alive = true;
    apiClient
      .get(`/webhook/admin/calls/user/${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setCalls(d.calls ?? []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [userId]);

  const toggle = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (turns[id]) return;
    try {
      const r = await apiClient.get(`/webhook/admin/calls/${encodeURIComponent(id)}/transcript`);
      const d = await r.json();
      setTurns((prev) => ({ ...prev, [id]: Array.isArray(d.transcript) ? d.transcript : [] }));
    } catch {
      setTurns((prev) => ({ ...prev, [id]: [] }));
    }
  };

  if (failed) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm text-red-600">
          {t('admin.calls.loadFailed', 'Не удалось загрузить звонки')}
        </p>
      </div>
    );
  }
  if (calls === null) {
    return <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-400">…</div>;
  }
  // Звонков нет — секцию не показываем вовсе: пустая карточка «Звонки (0)» в
  // карточке каждого не звонившего человека только зашумляет.
  if (calls.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
        <Phone className="w-4 h-4 text-forest-600" />
        {t('admin.calls.sectionTitle', 'Звонки')}
        <span className="text-xs font-normal text-gray-500">({calls.length})</span>
      </h3>

      <ul className="flex flex-col gap-2">
        {calls.map((c) => {
          const open = openId === c.id;
          const interrupted = c.status === 'interrupted';
          return (
            <li key={c.id} className="rounded-lg border border-gray-200">
              <button
                onClick={() => !interrupted && toggle(c.id)}
                className={clsx(
                  'flex w-full items-start gap-2 p-3 text-left',
                  !interrupted && 'hover:bg-gray-50',
                )}
              >
                {!interrupted && (open
                  ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />)}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{new Date(c.started_at).toLocaleString()}</span>
                    {c.duration_sec
                      ? <span>{Math.floor(c.duration_sec / 60)}:{String(c.duration_sec % 60).padStart(2, '0')}</span>
                      : null}
                    {c.flags.map((f) => (
                      <span key={f} className={clsx('rounded border px-1.5 py-0.5', TONE_CLASS[flagTone(f)])}>
                        {flagLabel(f, t)}
                      </span>
                    ))}
                  </span>
                  <span className="mt-1 block text-sm text-gray-800">
                    {c.summary || t('admin.calls.noSummary', 'Без саммари')}
                  </span>
                </span>
              </button>

              {open && (
                <div className="border-t border-gray-100 bg-gray-50 p-3">
                  {!turns[c.id] && <p className="text-xs text-gray-400">…</p>}
                  {turns[c.id]?.length === 0 && (
                    <p className="text-xs text-gray-500">
                      {t('admin.calls.noTranscript', 'Расшифровки нет')}
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    {turns[c.id]?.map((turn, i, all) => (
                      <div key={i} className="text-sm">
                        {/* Время от начала разговора, а не абсолютное: важно
                            «на какой секунде человек замолчал», а не «в котором
                            часу это было». */}
                        <span className="mr-2 font-mono text-xs text-gray-400">
                          {offsetLabel(all[0]?.ts, turn.ts)}
                        </span>
                        <span className={clsx(
                          'mr-2 text-xs font-medium',
                          turn.role === 'user' ? 'text-forest-700' : 'text-gray-500',
                        )}>
                          {turn.role === 'user'
                            ? t('admin.calls.human', 'Человек')
                            : t('admin.calls.assistant', 'Ассистент')}
                        </span>
                        <span className="text-gray-800">{turn.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
