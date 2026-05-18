// src/components/chat/smm/ScenarioCard.tsx
import React, { useEffect, useState } from 'react';
import { Check, RotateCcw, X, Loader2, AlertCircle } from 'lucide-react';
import {
  getScenario,
  approveScenario,
  regenerateScenario,
  rejectScenario,
  ScenarioDetail,
} from './smm-api';

interface Props {
  scenarioId: string;
}

const ROLE_LABEL: Record<string, string> = {
  psy: 'Психолог',
  lawyer: 'Юрист',
  coach: 'Коуч',
};

const MOOD_EMOJI: Record<string, string> = {
  dramatic: '🎭',
  inspiring: '✨',
  calm: '🧘',
  uplifting: '🌟',
  tense: '⚡',
  neutral: '◽',
};

export const ScenarioCard: React.FC<Props> = ({ scenarioId }) => {
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInflight, setActionInflight] = useState<'approve' | 'regenerate' | 'reject' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getScenario(scenarioId)
      .then((s) => { if (alive) { setScenario(s); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [scenarioId]);

  const handleApprove = async () => {
    if (!scenario) return;
    setActionInflight('approve');
    setActionMessage(null);
    try {
      const r = await approveScenario(scenarioId);
      if (r.failed.length > 0) {
        setActionMessage(`Не хватило токенов: ${r.failed[0].reason}`);
      } else {
        setActionMessage(`Утверждено, рендерится. Видео id: ${r.approved[0].videoId.slice(0, 8)}…`);
        const updated = await getScenario(scenarioId);
        setScenario(updated);
      }
    } catch (e: unknown) {
      setActionMessage(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionInflight(null);
    }
  };

  const handleRegenerate = async () => {
    if (!scenario) return;
    const feedback = window.prompt('Что переделать в сценарии?', '');
    if (!feedback) return;
    setActionInflight('regenerate');
    setActionMessage(null);
    try {
      await regenerateScenario(scenarioId, feedback);
      const updated = await getScenario(scenarioId);
      setScenario(updated);
      setActionMessage('Перегенерировано');
    } catch (e: unknown) {
      setActionMessage(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionInflight(null);
    }
  };

  const handleReject = async () => {
    if (!scenario) return;
    if (!window.confirm('Точно отклонить этот сценарий?')) return;
    setActionInflight('reject');
    setActionMessage(null);
    try {
      await rejectScenario(scenarioId);
      const updated = await getScenario(scenarioId);
      setScenario(updated);
      setActionMessage('Отклонено');
    } catch (e: unknown) {
      setActionMessage(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionInflight(null);
    }
  };

  if (loading) {
    return (
      <div className="my-3 inline-flex items-center space-x-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Загружаю сценарий…</span>
      </div>
    );
  }

  if (error || !scenario) {
    return (
      <div className="my-3 inline-flex items-center space-x-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4" />
        <span>Не удалось загрузить сценарий ({error ?? 'unknown'}).</span>
      </div>
    );
  }

  const isActionable = scenario.status === 'pending_review' || scenario.status === 'regenerating';

  return (
    <div className="my-3 max-w-2xl rounded-xl border border-forest-200 bg-white shadow-sm">
      <div className="border-b border-forest-100 px-4 py-3">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h4 className="text-base font-semibold text-forest-900">{scenario.title}</h4>
          <StatusBadge status={scenario.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{MOOD_EMOJI[scenario.mood] ?? '◽'} {scenario.mood}</span>
          <span>·</span>
          <span>{ROLE_LABEL[scenario.assistantRole] ?? scenario.assistantRole}</span>
          <span>·</span>
          <span>{scenario.ttsTier === 'premium' ? 'Премиум' : 'Эконом'}</span>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {scenario.dialog.map((turn, i) => {
          const isHero = turn.speaker === 'hero';
          return (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="shrink-0 text-base leading-5" title={isHero ? 'Герой' : 'Ассистент'}>
                {isHero ? '👤' : '🤖'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={isHero ? 'text-gray-800' : 'text-forest-800'}>
                  {turn.text}
                </p>
                <span className="text-[10px] text-gray-400">{turn.tStart}–{turn.tEnd}s</span>
              </div>
            </div>
          );
        })}
        {scenario.brollPrompts && scenario.brollPrompts.length > 0 && (
          <details className="mt-2 pt-2 border-t border-gray-100">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
              Визуальные вставки ({scenario.brollPrompts.length})
            </summary>
            <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
              {scenario.brollPrompts.map((b, i) => (
                <li key={i}>
                  <span className="text-gray-400">{b.atSec}s · {b.type === 'ai_image' ? '🎨' : '🎞️'}</span>{' '}
                  <span className="italic">{b.prompt}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {isActionable && (
        <div className="flex items-center gap-2 border-t border-forest-100 bg-forest-50 px-4 py-2">
          <button
            onClick={handleApprove}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {actionInflight === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Утвердить
          </button>
          <button
            onClick={handleRegenerate}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-forest-300 bg-white px-3 py-1.5 text-sm font-medium text-forest-700 hover:bg-forest-50 disabled:opacity-50"
          >
            {actionInflight === 'regenerate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Перегенерировать
          </button>
          <button
            onClick={handleReject}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {actionInflight === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Отклонить
          </button>
        </div>
      )}
      {actionMessage && (
        <div className="border-t border-forest-100 bg-forest-50 px-4 py-2 text-xs text-forest-700">
          {actionMessage}
        </div>
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ status: ScenarioDetail['status'] }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending_review: { label: 'На ревью', cls: 'bg-yellow-100 text-yellow-800' },
    approved: { label: 'Утверждено', cls: 'bg-forest-100 text-forest-800' },
    rejected: { label: 'Отклонено', cls: 'bg-gray-200 text-gray-700' },
    regenerating: { label: 'Перегенерация', cls: 'bg-blue-100 text-blue-800' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
};
