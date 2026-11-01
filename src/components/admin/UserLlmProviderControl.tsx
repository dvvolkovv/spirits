import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Cpu, Loader } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { AnswerProvider, PROVIDERS, PROVIDER_LABELS, parseProvider } from './globalLlm';

type Choice = 'default' | AnswerProvider;
type Alt = Exclude<AnswerProvider, 'claude'>;
const CHOICES: readonly Choice[] = ['default', ...PROVIDERS];
interface ProviderState {
  provider: Choice;
  global: AnswerProvider;
  configured: Record<Alt, boolean>;
}

/**
 * j.effective (от бэка) НЕ годится для подписи «Как у всех»: бэк считает
 * его в route() от ТЕКУЩЕГО provider, и при явном личном выборе (например,
 * явный Claude при рубильнике на Qwen) effective — это сам выбор, а не
 * рубильник. Подпись «Как у всех (сейчас: …)» обязана показывать модель
 * РУБИЛЬНИКА независимо от того, что выбрано у этого человека (ошибка
 * повторного ревью 01.11.2026 — effective сюда не читаем и в toState не
 * храним; нужное значение вычисляется ниже, в defaultNow, из global и
 * configured).
 */
const toState = (j: any): ProviderState => ({
  provider: j?.provider === 'claude' || j?.provider === 'qwen' || j?.provider === 'kimi' ? j.provider : 'default',
  global: parseProvider(j?.global),
  configured: j?.configured && typeof j.configured === 'object'
    ? { qwen: j.configured.qwen === true, kimi: j.configured.kimi === true }
    : { qwen: j?.qwenConfigured === true, kimi: false },
});

/**
 * Модель ответов ассистентов этому человеку (spec spirits_back
 * 2026-10-30-llm-provider-switch, 2026-10-31-kimi-provider-design,
 * 2026-10-31-global-llm-switch). «Как у всех» — модель общего рубильника
 * (вкладка «Ассистенты»); явный выбор здесь важнее рубильника. Меняет
 * только админ; сохраняется сразу.
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
  // Синхронный замок на двойной клик — см. GlobalLlmProviderControl: два
  // onClick в одном тике видят ещё не применённый React-рендер saving.
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setError(null);
    setSaving(false);
    savingRef.current = false;
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
    // t из useTranslation стабилен между рендерами — реагировать на него эффекту ни к чему.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const choose = async (choice: Choice) => {
    if (savingRef.current) return;
    if (!state || choice === state.provider) return;
    const requestedFor = userId;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const r = await apiClient.post(url, { provider: choice });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (userIdRef.current !== requestedFor) return;
      setState(toState(j));
    } catch (e: any) {
      if (userIdRef.current !== requestedFor) return;
      setError(httpErrorMessage(e, t));
    } finally {
      savingRef.current = false;
      if (userIdRef.current === requestedFor) setSaving(false);
    }
  };

  // Модель рубильника с учётом её ключа — для подписи «Как у всех» и для
  // подсказки про обычный путь. Не state.effective, см. комментарий у toState.
  const usable = (p: AnswerProvider) => p === 'claude' || !!state?.configured[p];
  const defaultNow: AnswerProvider = state && usable(state.global) ? state.global : 'claude';

  const label = (c: Choice) => {
    if (c === 'default') return t('admin.userActivity.llmProvider.default', 'Как у всех (сейчас: {{model}})', { model: PROVIDER_LABELS[defaultNow] });
    if (c === 'claude') return t('admin.userActivity.llmProvider.claude', 'Claude');
    if (c === 'qwen') return t('admin.userActivity.llmProvider.qwen', 'Qwen');
    return t('admin.userActivity.llmProvider.kimi', 'Kimi');
  };
  // Ключи — литералами, без шаблона {{name}}: их видит check-keys.
  const noKeyWarning = (p: Alt) => (p === 'qwen'
    ? t('admin.userActivity.llmProvider.noKey', 'Ключ Qwen на сервере не настроен — ответы пойдут через Claude.')
    : t('admin.userActivity.llmProvider.noKeyKimi', 'Ключ Kimi на сервере не настроен — ответы пойдут через Claude.'));

  // «Как у всех» предупреждает о цепочке на тех же условиях, что явный выбор
  // Qwen/Kimi: только когда модель, которая реально пробует отвечать первой,
  // не Claude. Модель рубильника без ключа (defaultNow уже свёлся к 'claude')
  // этому условию не удовлетворяет — там и предупреждать не о чём.
  const showFallbackHint = !!state && (
    state.provider === 'qwen' || state.provider === 'kimi'
    || (state.provider === 'default' && defaultNow !== 'claude')
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div id={titleId} className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-800">
        <Cpu className="w-4 h-4" />
        {t('admin.userActivity.llmProvider.title', 'Модель ответов')}
        {saving && <Loader className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 mb-2">
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
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={titleId} aria-busy={saving}>
            {CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={state.provider === c}
                aria-disabled={saving}
                onClick={() => choose(c)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg border text-sm',
                  state.provider === c
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
                )}
              >
                {label(c)}
                {(c === 'qwen' || c === 'kimi') && !state.configured[c] && (
                  <span className="ml-1 text-xs opacity-75">
                    <span aria-hidden="true">·</span> {t('admin.userActivity.llmProvider.noKeyShort', 'нет ключа')}
                  </span>
                )}
              </button>
            ))}
          </div>
          {(state.provider === 'qwen' || state.provider === 'kimi') && !state.configured[state.provider] && (
            <p className="mt-2 text-xs text-amber-700">
              {noKeyWarning(state.provider)}
            </p>
          )}
          {showFallbackHint && (
            <p className="mt-2 text-xs text-gray-500">
              {t('admin.userActivity.llmProvider.fallbackHint', 'Если выбранная модель не ответит, ответит Claude.')}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {t('admin.userActivity.llmProvider.hint', 'Всё, что ассистенты делают для этого человека: чат, Маша, TG-боты, рутины, «Путь», план действий, поездки, итоги и документы звонков. «Как у всех» — модель общего рубильника (вкладка «Ассистенты»).')}
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
