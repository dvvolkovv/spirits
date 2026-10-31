import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Cpu, Loader } from 'lucide-react';
import {
  AnswerProvider, GlobalLlmState, PROVIDERS, PROVIDER_LABELS,
  announceGlobalLlm, fetchGlobalLlm, fmtSince, saveGlobalLlm,
} from './globalLlm';

/**
 * Общий рубильник модели ответов (spec spirits_back 2026-10-31-global-llm-switch):
 * ассистенты, фоновые задачи и проба без входа. Личный выбор в карточке
 * пользователя важнее. Модель без ключа на сервере недоступна.
 *
 * Правки по ревью качества 01.11.2026: подтверждение — при любом переходе НЕ
 * на Claude (а не только с Claude), двойной клик не шлёт два confirm/POST,
 * «Загрузка…»/«Повторить» при ошибке GET, после 409 перечитываем ключи
 * (иначе кнопка молча останется недоступной), строка «переключил» скрыта от
 * Вебвизора (см. src/components/webvisorPrivacy.test.ts).
 */
export const GlobalLlmProviderControl: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<GlobalLlmState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  // Синхронный замок: два клика в одном тике (двойной клик, Enter вместе с
  // кликом) видят React-состояние saving ДО того, как React успел применить
  // setSaving(true) — ref читается и пишется немедленно, без ожидания рендера.
  const savingRef = useRef(false);
  const cancelledRef = useRef(false);
  useEffect(() => {
    // Сброс на КАЖДЫЙ запуск эффекта, не только на инициализацию ref.
    // React.StrictMode (dev, src/main.tsx) монтирует компонент дважды:
    // mount → cleanup → mount. Без этой строки cleanup между двумя
    // монтированиями ставит cancelledRef.current в true навсегда — второй
    // (настоящий) эффект её не снимает, и даже успешный fetchGlobalLlm()
    // из load() никогда не доходит до setState (повторное ревью 01.11.2026).
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  const load = () => {
    setError(null);
    fetchGlobalLlm()
      .then((s) => { if (!cancelledRef.current) setState(s); })
      .catch((e: any) => { if (!cancelledRef.current) setError(`${t('admin.globalLlm.error', 'Не удалось загрузить или сохранить')}: ${e?.message ?? 'error'}`); });
  };

  useEffect(() => {
    load();
    // load() пересоздаётся на каждый рендер, но перезапускать его должен
    // только явный клик «Повторить» — не сам эффект при каждом рендере;
    // t из useTranslation стабилен между рендерами и эффекту не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const available = (p: AnswerProvider) => p === 'claude' || !!state?.configured[p];

  const choose = async (p: AnswerProvider) => {
    if (savingRef.current || !state || p === state.provider || !available(p)) return;
    if (p !== 'claude') {
      const sure = window.confirm(t('admin.globalLlm.confirm', 'Ассистенты, фоновые задачи и проба без входа перейдут на {{model}}. Вернуть — здесь же.', { model: PROVIDER_LABELS[p] }));
      if (!sure) return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const r = await saveGlobalLlm(p);
      if (!r.ok) {
        if (r.error === 'no_key') {
          setError(t('admin.globalLlm.errorNoKey', 'У этой модели нет ключа на сервере.'));
          // Ключ сняли уже после того, как мы решили, что модель доступна —
          // перечитываем configured, иначе кнопка молча останется нерабочей.
          try { setState(await fetchGlobalLlm()); } catch { /* оставляем прежний стейт */ }
        } else {
          setError(`${t('admin.globalLlm.error', 'Не удалось загрузить или сохранить')}: ${r.error}`);
        }
      } else {
        setState(r.state);
        announceGlobalLlm(r.state);
      }
    } catch (e: any) {
      setError(`${t('admin.globalLlm.error', 'Не удалось загрузить или сохранить')}: ${e?.message ?? 'error'}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="mx-4 mt-4 bg-white border border-gray-200 rounded-xl p-4 flex-shrink-0" data-testid="global-llm-control">
      <div id={titleId} className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-800">
        <Cpu className="w-4 h-4" />
        {t('admin.globalLlm.title', 'Модель ответов для всех')}
        {saving && <Loader className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 mb-2">
          {error}
          {!state && (
            <button type="button" onClick={load} className="ml-2 underline">
              {t('admin.globalLlm.retry', 'Повторить')}
            </button>
          )}
        </p>
      )}
      {!state && !error && (
        <p className="text-sm text-gray-500">
          {t('admin.globalLlm.loading', 'Загрузка…')}
        </p>
      )}
      {state && (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={titleId} aria-busy={saving}>
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={state.provider === p}
                aria-disabled={saving}
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
            // ym-hide-content: строка называет человека, который переключил
            // рубильник (личные данные) — см. webvisorPrivacy.test.ts.
            <p className="ym-hide-content mt-2 text-xs text-gray-500" data-testid="global-llm-since">
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
