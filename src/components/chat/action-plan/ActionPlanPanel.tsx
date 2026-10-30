import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, ListChecks, Loader2, MessageCircle, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { actionPlansApi, type ActionPlan, type ActionPlanItem } from '../../../services/actionPlansApi';
import { trapTab } from '../files/focusTrap';

interface Props {
  assistantId: string | number;
  freshTs?: string | null;
  onClose: () => void;
  onDiscuss: (plan: ActionPlan) => void;
}

type PanelStatus = 'loading' | 'empty' | 'ready' | 'generating' | 'saving';

function itemId(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const ActionPlanPanel: React.FC<Props> = ({ assistantId, freshTs, onClose, onDiscuss }) => {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [status, setStatus] = useState<PanelStatus>('loading');
  const [error, setError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(false);
    try {
      const saved = await actionPlansApi.get(assistantId, freshTs);
      setPlan(saved);
      setStatus(saved ? 'ready' : 'empty');
      setDirty(false);
    } catch {
      setError(true);
      setStatus('empty');
    }
  }, [assistantId, freshTs]);

  useEffect(() => { void load(); }, [load]);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm(t('chat.action_plan.unsaved_confirm'))) return;
    onClose();
  }, [dirty, onClose, t]);
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab' && dialogRef.current) trapTab(dialogRef.current, event);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const element = previouslyFocused.current;
      if (element instanceof HTMLElement && document.contains(element)) element.focus();
    };
  }, []);

  const change = (patch: Partial<ActionPlan>) => {
    setPlan((current) => current ? { ...current, ...patch } : current);
    setDirty(true);
  };

  const changeItem = (id: string, patch: Partial<ActionPlanItem>) => {
    if (!plan) return;
    change({ items: plan.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  };

  const generate = async () => {
    if (plan && !window.confirm(t('chat.action_plan.regenerate_confirm'))) return;
    setStatus('generating');
    setError(false);
    try {
      const generated = await actionPlansApi.generate(assistantId, freshTs);
      setPlan(generated);
      setStatus('ready');
      setDirty(false);
    } catch {
      setError(true);
      setStatus(plan ? 'ready' : 'empty');
    }
  };

  const save = async () => {
    if (!plan || !dirty) return;
    setStatus('saving');
    setError(false);
    try {
      const saved = await actionPlansApi.update(plan.id, plan);
      setPlan(saved);
      setStatus('ready');
      setDirty(false);
    } catch {
      setError(true);
      setStatus('ready');
    }
  };

  const remove = async () => {
    if (!plan || !window.confirm(t('chat.action_plan.delete_confirm'))) return;
    setStatus('saving');
    setError(false);
    try {
      await actionPlansApi.remove(plan.id);
      setPlan(null);
      setStatus('empty');
      setDirty(false);
    } catch {
      setError(true);
      setStatus('ready');
    }
  };

  const doneCount = plan?.items.filter((item) => item.done).length ?? 0;
  const progress = plan?.items.length ? Math.round(doneCount / plan.items.length * 100) : 0;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.action_plan.title')}
      data-testid="action-plan-panel"
      className="ym-hide-content fixed inset-0 z-[60] flex justify-end outline-none"
    >
      <div className="absolute inset-0 hidden bg-black/30 sm:block" onClick={requestClose} />
      <div className="relative flex h-full w-full flex-col bg-[#fafbf8] sm:w-[460px] sm:shadow-2xl">
        <header className="flex items-center gap-2 border-b border-forest-100 bg-white px-3 py-3">
          <button type="button" onClick={requestClose} aria-label={t('chat.action_plan.back')} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 sm:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
            <ListChecks className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">{t('chat.action_plan.title')}</h2>
            <p className="text-xs text-gray-500">{t('chat.action_plan.subtitle')}</p>
          </div>
          <button type="button" onClick={requestClose} aria-label={t('chat.action_plan.close')} className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 sm:block">
            <X className="h-5 w-5" />
          </button>
        </header>

        {error && (
          <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
            <span>{t('chat.action_plan.error')}</span>
            {!plan && status !== 'generating' && (
              <button type="button" onClick={() => void load()} className="shrink-0 font-medium underline underline-offset-2">{t('chat.action_plan.retry')}</button>
            )}
          </div>
        )}

        {status === 'loading' ? (
          <div className="flex flex-1 items-center justify-center" aria-label={t('chat.action_plan.loading')}>
            <Loader2 className="h-6 w-6 animate-spin text-forest-600" />
          </div>
        ) : !plan ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="mb-5 flex h-20 w-20 rotate-3 items-center justify-center rounded-2xl border border-forest-200 bg-forest-50 shadow-sm">
              <ListChecks className="h-9 w-9 -rotate-3 text-forest-600" />
            </div>
            <h3 className="text-xl font-semibold tracking-tight text-gray-900">{t('chat.action_plan.empty_title')}</h3>
            <p className="mt-3 max-w-xs text-sm leading-6 text-gray-500">{t('chat.action_plan.empty_body')}</p>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={status === 'generating'}
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-forest-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-forest-700 disabled:opacity-60"
            >
              {status === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
              {status === 'generating' ? t('chat.action_plan.generating') : t('chat.action_plan.generate')}
            </button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
              <div className="mb-4 rounded-2xl border border-forest-100 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-forest-700">
                  <span>{t('chat.action_plan.progress', { done: doneCount, total: plan.items.length })}</span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-forest-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-forest-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="action-plan-title">
                {t('chat.action_plan.name_label')}
              </label>
              <input
                id="action-plan-title"
                value={plan.title}
                maxLength={120}
                onChange={(event) => change({ title: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base font-semibold text-gray-900 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
              />

              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="action-plan-summary">
                {t('chat.action_plan.summary_label')}
              </label>
              <textarea
                id="action-plan-summary"
                value={plan.summary}
                maxLength={2000}
                rows={3}
                onChange={(event) => change({ summary: event.target.value })}
                className="mt-1.5 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-6 text-gray-700 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
              />

              <div className="mb-2 mt-5 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('chat.action_plan.steps_label')}</h3>
                <span className="text-xs text-gray-400">{plan.items.length}</span>
              </div>
              <ol className="space-y-2">
                {plan.items.map((item, index) => (
                  <li key={item.id} className={clsx('group flex items-start gap-2 rounded-xl border bg-white p-2.5 transition-colors', item.done ? 'border-forest-100 bg-forest-50/40' : 'border-gray-200')}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.done}
                      aria-label={t(item.done ? 'chat.action_plan.mark_undone' : 'chat.action_plan.mark_done', { step: index + 1 })}
                      onClick={() => changeItem(item.id, { done: !item.done })}
                      className={clsx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors', item.done ? 'border-forest-600 bg-forest-600 text-white' : 'border-gray-300 text-transparent hover:border-forest-500')}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </button>
                    <textarea
                      value={item.text}
                      rows={2}
                      maxLength={400}
                      aria-label={t('chat.action_plan.step_label', { step: index + 1 })}
                      onChange={(event) => changeItem(item.id, { text: event.target.value })}
                      className={clsx('min-w-0 flex-1 resize-none rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm leading-6 focus:border-forest-300 focus:bg-white focus:outline-none', item.done ? 'text-gray-500 line-through' : 'text-gray-800')}
                    />
                    <button
                      type="button"
                      onClick={() => change({ items: plan.items.filter((candidate) => candidate.id !== item.id) })}
                      aria-label={t('chat.action_plan.remove_step', { step: index + 1 })}
                      className="mt-0.5 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => change({ items: [...plan.items, { id: itemId(), text: '', done: false }] })}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-forest-700 hover:bg-forest-50"
              >
                <Plus className="h-4 w-4" />
                {t('chat.action_plan.add_step')}
              </button>
              <p className="mt-5 text-xs leading-5 text-gray-400">{t('chat.action_plan.disclaimer')}</p>
            </div>

            <footer className="border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!dirty || status === 'saving' || !plan.title.trim() || plan.items.length === 0 || plan.items.some((item) => !item.text.trim())}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-forest-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {status === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {status === 'saving' ? t('chat.action_plan.saving') : t('chat.action_plan.save')}
                </button>
                <button
                  type="button"
                  onClick={() => { onDiscuss(plan); onClose(); }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-forest-200 bg-forest-50 px-3 py-2.5 text-sm font-medium text-forest-700 hover:bg-forest-100"
                >
                  <MessageCircle className="h-4 w-4" />
                  {t('chat.action_plan.discuss')}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <button type="button" onClick={() => void generate()} disabled={status === 'generating'} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">
                  {status === 'generating' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {t('chat.action_plan.regenerate')}
                </button>
                <button type="button" onClick={() => void remove()} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('chat.action_plan.delete')}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};

export default ActionPlanPanel;
