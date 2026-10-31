import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Cpu, Loader } from 'lucide-react';
import {
  GlobalLlmState, PROVIDERS, PROVIDER_LABELS, Provider,
  announceGlobalLlm, fetchGlobalLlm, fmtSince, saveGlobalLlm,
} from './globalLlm';

/**
 * Общий рубильник модели ответов (spec spirits_back 2026-10-31-global-llm-switch):
 * ассистенты, фоновые задачи и проба без входа. Личный выбор в карточке
 * пользователя важнее. Модель без ключа на сервере недоступна.
 */
export const GlobalLlmProviderControl: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<GlobalLlmState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    fetchGlobalLlm()
      .then((s) => { if (!cancelled) setState(s); })
      .catch((e: any) => { if (!cancelled) setError(`${t('admin.globalLlm.error', 'Не удалось загрузить или сохранить')}: ${e?.message ?? 'error'}`); });
    return () => { cancelled = true; };
  }, []);

  const available = (p: Provider) => p === 'claude' || !!state?.configured[p];

  const choose = async (p: Provider) => {
    if (saving || !state || p === state.provider || !available(p)) return;
    if (state.provider === 'claude' && p !== 'claude') {
      const sure = window.confirm(t('admin.globalLlm.confirm', 'Ассистенты, фоновые задачи и проба без входа перейдут на {{model}}. Вернуть — здесь же.', { model: PROVIDER_LABELS[p] }));
      if (!sure) return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await saveGlobalLlm(p);
      if (r.error === 'no_key') setError(t('admin.globalLlm.errorNoKey', 'У этой модели нет ключа на сервере.'));
      else if (r.error) setError(`${t('admin.globalLlm.error', 'Не удалось загрузить или сохранить')}: ${r.error}`);
      else if (r.state) { setState(r.state); announceGlobalLlm(r.state); }
    } catch (e: any) {
      setError(`${t('admin.globalLlm.error', 'Не удалось загрузить или сохранить')}: ${e?.message ?? 'error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-4 mt-4 bg-white border border-gray-200 rounded-xl p-4" data-testid="global-llm-control">
      <div id={titleId} className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-800">
        <Cpu className="w-4 h-4" />
        {t('admin.globalLlm.title', 'Модель ответов для всех')}
        {saving && <Loader className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {state && (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={titleId}>
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={state.provider === p}
                disabled={!available(p)}
                onClick={() => choose(p)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50 disabled:cursor-not-allowed',
                  state.provider === p
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
                )}
              >
                {PROVIDER_LABELS[p]}
                {!available(p) && (
                  <span className="ml-1 text-xs opacity-75">
                    <span aria-hidden="true">·</span> {t('admin.globalLlm.noKey', 'нет ключа на сервере')}
                  </span>
                )}
              </button>
            ))}
          </div>
          {state.since && (
            <p className="mt-2 text-xs text-gray-500">
              {t('admin.globalLlm.since', 'С {{since}}, переключил {{by}}', { since: fmtSince(state.since), by: state.by ?? '—' })}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {t('admin.globalLlm.hint', 'Ассистенты, фоновые задачи и проба без входа. Личный выбор в карточке пользователя важнее.')}
          </p>
        </>
      )}
    </div>
  );
};
