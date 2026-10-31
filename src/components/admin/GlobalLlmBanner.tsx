import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { GLOBAL_LLM_EVENT, GlobalLlmState, PROVIDER_LABELS, fetchGlobalLlm, fmtSince } from './globalLlm';

/**
 * Плашка на всех вкладках админки, пока общий рубильник не на Claude
 * (spec spirits_back 2026-10-31-global-llm-switch, раздел 7): возврат только
 * вручную, и про него легко забыть.
 */
const GlobalLlmBanner: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<GlobalLlmState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGlobalLlm().then((s) => { if (!cancelled) setState(s); }).catch(() => { /* без плашки */ });
    const onChange = (e: Event) => setState((e as CustomEvent<GlobalLlmState>).detail);
    window.addEventListener(GLOBAL_LLM_EVENT, onChange);
    return () => { cancelled = true; window.removeEventListener(GLOBAL_LLM_EVENT, onChange); };
  }, []);

  if (!state || state.provider === 'claude') return null;
  const model = PROVIDER_LABELS[state.provider];
  return (
    <div data-testid="global-llm-banner" className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-900 flex-shrink-0">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 min-w-0">
        {state.since
          ? t('admin.globalLlm.banner', 'Все отвечают через {{model}} с {{since}}', { model, since: fmtSince(state.since) })
          : t('admin.globalLlm.bannerNoSince', 'Все отвечают через {{model}}', { model })}
      </span>
      <button type="button" onClick={onOpen} className="underline flex-shrink-0">
        {t('admin.globalLlm.bannerOpen', 'Изменить')}
      </button>
    </div>
  );
};

export default GlobalLlmBanner;
