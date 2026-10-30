import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Cpu, Loader } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

type Provider = 'claude' | 'qwen';
interface ProviderState { provider: Provider; qwenConfigured: boolean }

const toState = (j: any): ProviderState => ({
  provider: j?.provider === 'qwen' ? 'qwen' : 'claude',
  qwenConfigured: j?.qwenConfigured === true,
});

/**
 * Модель ответов ассистентов этому человеку (spec spirits_back
 * 2026-10-30-llm-provider-switch). Меняет только админ; сохраняется сразу.
 * userId — тот же идентификатор, что получает карточка (телефон или UUID).
 */
export const UserLlmProviderControl: React.FC<{ userId: string }> = ({ userId }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<ProviderState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const url = `/webhook/admin/users/${encodeURIComponent(userId)}/llm-provider`;

  // Карточка может переключиться на другого человека, пока летит запрос
  // (GET при смене userId или POST из choose). Ref всегда хранит актуальный
  // userId — ответ для чужого userId игнорируется, не переопределяя стейт.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setError(null);
    setSaving(false);
    (async () => {
      try {
        const r = await apiClient.get(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!cancelled) setState(toState(j));
      } catch (e: any) {
        if (!cancelled) setError(httpErrorMessage(e, t));
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  const choose = async (provider: Provider) => {
    if (saving) return;
    if (!state || provider === state.provider) return;
    const requestedFor = userId;
    setSaving(true);
    setError(null);
    try {
      const r = await apiClient.post(url, { provider });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (userIdRef.current !== requestedFor) return;
      setState(toState(j));
    } catch (e: any) {
      if (userIdRef.current !== requestedFor) return;
      setError(httpErrorMessage(e, t));
    } finally {
      if (userIdRef.current === requestedFor) setSaving(false);
    }
  };

  const label = (p: Provider) => (p === 'claude'
    ? t('admin.userActivity.llmProvider.claude', 'Claude (по умолчанию)')
    : t('admin.userActivity.llmProvider.qwen', 'Qwen'));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div id={titleId} className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-800">
        <Cpu className="w-4 h-4" />
        {t('admin.userActivity.llmProvider.title', 'Модель ответов')}
        {saving && <Loader className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>
      {error && (
        <p className="text-sm text-red-600 mb-2">
          {error}
        </p>
      )}
      {!state && !error && (
        <p className="text-sm text-gray-500">
          {t('admin.userActivity.llmProvider.loading', 'Загрузка…')}
        </p>
      )}
      {state && (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={titleId}>
            {(['claude', 'qwen'] as Provider[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={state.provider === p}
                aria-disabled={saving}
                onClick={() => choose(p)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg border text-sm',
                  state.provider === p
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
                )}
              >
                {label(p)}
              </button>
            ))}
          </div>
          {!state.qwenConfigured && (
            <p className="mt-2 text-xs text-amber-700">
              {t('admin.userActivity.llmProvider.noKey', 'Ключ Qwen на сервере не настроен — ответы пойдут через Claude.')}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {t('admin.userActivity.llmProvider.hint', 'Веб-ассистенты, Маша и TG-боты этого человека. Пробы мониторинга и фоновые задачи — всегда Claude.')}
          </p>
        </>
      )}
    </div>
  );
};

function httpErrorMessage(e: any, t: (key: string, def: string) => string): string {
  const message: string = e?.message ?? 'error';
  const match = /^HTTP (\d+)$/.exec(message);
  if (match?.[1] === '404') {
    return t('admin.userActivity.llmProvider.notFound', 'Пользователь не найден');
  }
  const prefix = t('admin.userActivity.llmProvider.error', 'Не удалось загрузить или сохранить выбор');
  return `${prefix}: ${message}`;
}
