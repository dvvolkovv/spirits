import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Coins } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { flagLabel, flagTone } from './callFlagLabels';
import { providerLabel } from './callProviders';
import { formatClock, formatTokens, formatWhen } from './callsFormat';

/** Сессия, как её отдаёт /admin/calls/user/:id. */
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

const TONE_CLASS = {
  danger: 'bg-red-50 text-red-700 border-red-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200',
} as const;

/**
 * Строка сессии — звонка или встречи — в карточке человека, с раскрытием
 * расшифровки.
 *
 * Имена говорящих из расшифровки не показываем: метку speaker ставит
 * определитель активности голоса, и 07.09.2026 она уже выдала за «слышал
 * коллег» то, чего не было. Реплики людей подписаны «Человек».
 */
export const CallSessionItem: React.FC<{ session: CallSession }> = ({ session: s }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Расшифровка вместе с версией сессии, для которой её загрузили. Если строку
  // перерисуют новыми данными на месте (ключ — id), расшифровка встречи, взятая,
  // пока та шла, иначе так и осталась бы обрезанной.
  const [loaded, setLoaded] = useState<{ version: string; turns: Turn[] } | null>(null);
  const [failed, setFailed] = useState(false);
  // Номер последнего запроса: ответ устаревшего не затирает более свежий.
  const lastReq = useRef(0);

  // Прерванный звонок раскрываем, только если человек успел что-то сказать:
  // расшифровку voice-host пишет по ходу, и у части прерванных она есть (на
  // стенде 25.09.2026 — у 7 из 11 прерванных встреч). Без реплик раскрывать
  // нечего. Сбой встречи раскрывается всегда — реплики до обрыва бывают.
  const expandable = s.status !== 'interrupted' || s.user_turns > 0;
  // Строка, которая перестала раскрываться (идущая сессия стала прерванной без
  // реплик), не должна остаться открытой без способа её закрыть.
  const isOpen = open && expandable;
  const live = s.flags.includes('live');
  const version = `${s.status}:${s.user_turns}`;

  const load = async () => {
    const req = ++lastReq.current;
    setFailed(false);
    try {
      const r = await apiClient.get(`/webhook/admin/calls/${encodeURIComponent(s.id)}/transcript`);
      // 404 бэкенд отдаёт нарочно: «звонка нет» — не то же, что пустой диалог.
      if (!r.ok) throw new Error(`transcript ${r.status}`);
      const d = await r.json();
      if (req !== lastReq.current) return;
      const raw: unknown[] = Array.isArray(d?.transcript) ? d.transcript : [];
      // Битая реплика (null, число) уронила бы всю страницу: своей границы
      // ошибок у админки нет, только общая на приложение.
      const turns = raw.filter((x): x is Turn => typeof x === 'object' && x !== null);
      setLoaded({ version, turns });
    } catch {
      if (req === lastReq.current) setFailed(true);
    }
  };

  // Перечитываем, когда строка открыта, а расшифровка устарела: ещё не
  // загружена, загружена для прежней версии сессии или сессия идёт и
  // дописывается по ходу. Сбой не кешируется — следующее раскрытие повторит.
  useEffect(() => {
    if (!isOpen) return;
    if (loaded && loaded.version === version && !live) return;
    void load();
  }, [isOpen, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    if (expandable) setOpen((o) => !o);
  };

  const tokensHint = t('admin.calls.tokensHint', {
    defaultValue: 'разговор {{call}} + консультации {{consult}}',
    call: formatTokens(s.tokens_call),
    consult: formatTokens(s.tokens_consult),
  });

  return (
    <li className="rounded-lg border border-gray-200">
      <div
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? isOpen : undefined}
        data-testid={`call-session-${s.id}`}
        onClick={toggle}
        onKeyDown={(e) => {
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
        {expandable && (isOpen
          ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />)}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span>{formatWhen(s.started_at)}</span>
            <span className="rounded bg-forest-50 px-1.5 py-0.5 font-medium text-forest-700">
              {providerLabel(s.provider, t)}
            </span>
            {s.agent_name && <span>{s.agent_name}</span>}
            {s.duration_sec ? <span>{formatClock(s.duration_sec)}</span> : null}
            {s.tokens_total > 0 && (
              <span
                className="inline-flex items-center gap-1"
                title={tokensHint}
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
              у встреч саммари бывает на полэкрана. block и line-clamp-2
              вместе не ставить: block идёт в CSS позже и отменяет обрезку. */}
          <span
            data-testid={`call-session-summary-${s.id}`}
            className={clsx('mt-1 whitespace-pre-line break-words text-sm text-gray-800', isOpen ? 'block' : 'line-clamp-2')}
          >
            {s.summary || t('admin.calls.noSummary', 'Без саммари')}
          </span>
        </span>
      </div>

      {isOpen && (
        <div data-testid={`call-session-panel-${s.id}`} className="border-t border-gray-100 bg-gray-50 p-3">
          {/* Раскладка списания — ещё и здесь: подсказка у суммы не
              открывается ни пальцем, ни с клавиатуры. */}
          {s.tokens_total > 0 && <p className="mb-2 text-xs text-gray-500">{tokensHint}</p>}
          {failed && (
            <p className="text-xs text-red-600">
              {t('admin.calls.transcriptFailed', 'Не удалось загрузить расшифровку')}
            </p>
          )}
          {!failed && !loaded && <p className="text-xs text-gray-400">…</p>}
          {!failed && loaded?.turns.length === 0 && (
            <p className="text-xs text-gray-500">
              {t('admin.calls.noTranscript', 'Расшифровки нет')}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {loaded?.turns.map((turn, i, all) => (
              <div key={i} className="break-words text-sm">
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
                <span className="text-gray-800">{String(turn.text ?? '')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </li>
  );
};
