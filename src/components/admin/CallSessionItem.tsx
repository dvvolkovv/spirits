import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Coins } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { flagLabel, flagTone } from './callFlagLabels';
import { providerLabel } from './callProviders';
import { formatTokens, formatWhen } from './callsFormat';

/** Сессия, как её отдают /admin/calls/sessions и /admin/calls/user/:id. */
export interface CallSession {
  id: string;
  user_id: string;
  provider: string;
  agent_name: string | null;
  started_at: string;
  duration_sec: number | null;
  status: string;
  model: string | null;
  summary: string | null;
  tokens_call: number;
  tokens_consult: number;
  tokens_total: number;
  consults: number;
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

/** Длительность одной сессии «12:05»: тут минуты с секундами точнее, чем «12 мин». */
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

const TONE_CLASS = {
  danger: 'bg-red-50 text-red-700 border-red-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200',
} as const;

/**
 * Строка сессии — звонка или встречи — с раскрытием расшифровки. Общая у
 * ленты раздела «Звонки» и карточки человека, чтобы сессия выглядела в обоих
 * местах одинаково.
 *
 * Строка — div с role="button", а не <button>: внутри стоит кнопка
 * пользователя, а кнопка в кнопке — невалидная разметка.
 *
 * Имена говорящих из расшифровки не показываем: метку speaker ставит
 * определитель активности голоса, и 07.09.2026 она уже выдала за «слышал
 * коллег» то, чего не было. Реплики людей подписаны «Человек».
 */
export const CallSessionItem: React.FC<{
  session: CallSession;
  /** Есть — номер человека становится кнопкой, открывающей его карточку. */
  onOpenUser?: (userId: string) => void;
}> = ({ session: s, onOpenUser }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[] | null>(null);
  // Прерванный звонок раскрываем, только если человек успел что-то сказать:
  // расшифровку voice-host пишет по ходу, и у части прерванных она есть (на
  // стенде 25.09.2026 — у 7 из 11 прерванных встреч). Без реплик раскрывать
  // нечего. Сбой встречи раскрывается всегда — реплики до обрыва у него
  // бывают.
  const expandable = s.status !== 'interrupted' || s.user_turns > 0;

  const toggle = async () => {
    if (!expandable) return;
    const next = !open;
    setOpen(next);
    // Идущая сессия дописывает расшифровку по ходу — её перечитываем при
    // каждом раскрытии; остальные грузим один раз.
    if (!next || (turns && !s.flags.includes('live'))) return;
    try {
      const r = await apiClient.get(`/webhook/admin/calls/${encodeURIComponent(s.id)}/transcript`);
      const d = await r.json();
      setTurns(Array.isArray(d.transcript) ? d.transcript : []);
    } catch {
      setTurns([]);
    }
  };

  return (
    <li className="rounded-lg border border-gray-200">
      <div
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        data-testid={`call-session-${s.id}`}
        onClick={toggle}
        onKeyDown={(e) => {
          // Enter на кнопке пользователя всплывает сюда же — его не трогаем,
          // иначе открытие карточки заодно раскрывало бы расшифровку.
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        className={clsx(
          'flex w-full items-start gap-2 p-3 text-left',
          expandable && 'cursor-pointer hover:bg-gray-50',
        )}
      >
        {expandable && (open
          ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />)}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span>{formatWhen(s.started_at)}</span>
            <span className="rounded bg-forest-50 px-1.5 py-0.5 font-medium text-forest-700">
              {providerLabel(s.provider, t)}
            </span>
            {onOpenUser && (
              <button
                type="button"
                data-testid={`call-session-user-${s.id}`}
                onClick={(e) => {
                  // Клик по номеру открывает карточку и не раскрывает строку.
                  e.stopPropagation();
                  onOpenUser(s.user_id);
                }}
                className="font-medium text-forest-700 underline-offset-2 hover:underline"
              >
                {s.user_id}
              </button>
            )}
            {s.agent_name && <span>{s.agent_name}</span>}
            {s.duration_sec ? <span>{clock(s.duration_sec)}</span> : null}
            {s.tokens_total > 0 && (
              <span
                className="inline-flex items-center gap-1"
                title={t('admin.calls.tokensHint', {
                  defaultValue: 'разговор {{call}} + консультации {{consult}}',
                  call: formatTokens(s.tokens_call),
                  consult: formatTokens(s.tokens_consult),
                })}
              >
                <Coins className="h-3 w-3" />
                {formatTokens(s.tokens_total)}
              </span>
            )}
            {s.flags.map((f) => (
              <span key={f} className={clsx('rounded border px-1.5 py-0.5', TONE_CLASS[flagTone(f)])}>
                {flagLabel(f, t)}
              </span>
            ))}
          </span>
          {/* Свёрнутая строка — две строки саммари, раскрытая — всё целиком:
              у встреч саммари бывает на полэкрана. */}
          <span className={clsx('mt-1 block whitespace-pre-line text-sm text-gray-800', !open && 'line-clamp-2')}>
            {s.summary || t('admin.calls.noSummary', 'Без саммари')}
          </span>
        </span>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50 p-3">
          {turns === null && <p className="text-xs text-gray-400">…</p>}
          {turns?.length === 0 && (
            <p className="text-xs text-gray-500">
              {t('admin.calls.noTranscript', 'Расшифровки нет')}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {turns?.map((turn, i, all) => (
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
};
