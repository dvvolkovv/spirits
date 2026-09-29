import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { durationParts, type ActivityStep, type ActivitySummary, type TurnActivity } from './turnActivity';

// Шаги работы ассистента: во время хода — вместо трёх точек, после — свёрнутой
// строкой над ответом. Логика — turnActivity.ts.

function useDuration(): (ms: number) => string {
  const { t } = useTranslation();
  return (ms) => {
    const { m, s } = durationParts(ms);
    return m > 0 ? t('chat.activity.min_sec', { m, s }) : t('chat.activity.sec', { s });
  };
}

function StepRow({ step }: { step: ActivityStep }) {
  const { t } = useTranslation();
  // «Читаю файл» без имени звучит обрывком — для чужих путей своя подпись.
  const key = step.kind === 'read_file' && !step.detail ? 'read_file_plain' : step.kind;
  return (
    <li className="flex items-start gap-2 text-xs leading-5 text-gray-600">
      {step.done
        ? <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" aria-hidden />
        : <Loader2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-forest-500 animate-spin" aria-hidden />}
      <span className="min-w-0 break-words">
        {t(`chat.activity.kind.${key}`)}
        {step.detail && <span className="text-gray-400"> · {step.detail}</span>}
        {step.count > 1 && <span className="text-gray-400"> ×{step.count}</span>}
      </span>
    </li>
  );
}

/** Идущий ход: «Думает · 5 с», потом список шагов и общий таймер. */
export function LiveActivity({ activity }: { activity: TurnActivity }) {
  const { t } = useTranslation();
  const fmt = useDuration();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = fmt(now - activity.startedAt);

  if (activity.steps.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 h-[24px]">
        <Loader2 className="w-4 h-4 text-forest-500 animate-spin" aria-hidden />
        <span>{t('chat.activity.thinking')} · {elapsed}</span>
      </div>
    );
  }
  return (
    <div className="mb-2 not-prose">
      <ul className="space-y-0.5">
        {activity.steps.map((s, i) => <StepRow key={i} step={s} />)}
      </ul>
      <div className="text-[11px] text-gray-400 mt-1">{elapsed}</div>
    </div>
  );
}

/** Завершённый ход: «▸ 3 шага · 42 с», по нажатию — список. */
export function ActivitySummaryView({ summary }: { summary: ActivitySummary }) {
  const { t } = useTranslation();
  const fmt = useDuration();
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-1 not-prose">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? t('chat.activity.hide') : t('chat.activity.show')}
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ChevronRight className={clsx('w-3.5 h-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
        {t('chat.activity.steps', { count: summary.steps.length })} · {fmt(summary.durationMs)}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-1">
          {summary.steps.map((s, i) => <StepRow key={i} step={s} />)}
        </ul>
      )}
    </div>
  );
}
