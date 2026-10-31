import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { GLOBAL_LLM_EVENT, GlobalLlmState, PROVIDER_LABELS, fetchGlobalLlm, fmtSince, toGlobalState } from './globalLlm';

/**
 * Плашка на всех вкладках админки, пока общий рубильник не на Claude, и при
 * ошибке загрузки его состояния (spec spirits_back 2026-10-31-global-llm-switch,
 * раздел 7; правки по ревью качества 01.11.2026): молчать при ошибке
 * нельзя — пустая плашка читается как «все на Claude», а бэк на незнакомое
 * значение намеренно отдаёт ошибку, а не тихо подставляет Claude сам.
 *
 * Перечитывает состояние при смене вкладки (activeTab в зависимостях эффекта) —
 * плашка не размонтируется при переключении ?tab=, значение могло устареть.
 * На вкладке «Ассистенты» кнопку «Изменить» скрывает hideOpen: там уже стоит
 * сам блок, вести туда же некуда.
 */
const GlobalLlmBanner: React.FC<{ onOpen: () => void; activeTab: string; hideOpen?: boolean }> = ({ onOpen, activeTab, hideOpen }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<GlobalLlmState | null>(null);
  const [error, setError] = useState(false);
  const textId = useId();

  useEffect(() => {
    let cancelled = false;
    // Событие в этой же вкладке может прийти раньше, чем разрешится GET,
    // запущенный тем же эффектом (переключили рубильник в блоке почти сразу
    // после открытия вкладки) — опоздавший GET не должен затирать более
    // свежее состояние, уже пришедшее через событие.
    let heard = false;
    setError(false);
    fetchGlobalLlm()
      .then((s) => { if (!cancelled && !heard) setState(s); })
      .catch(() => { if (!cancelled && !heard) setError(true); });
    const onChange = (e: Event) => {
      heard = true;
      setError(false);
      setState(toGlobalState((e as CustomEvent).detail));
    };
    window.addEventListener(GLOBAL_LLM_EVENT, onChange);
    return () => { cancelled = true; window.removeEventListener(GLOBAL_LLM_EVENT, onChange); };
    // activeTab — нарочно единственная зависимость (перечитать при смене
    // вкладки); t из useTranslation стабилен между рендерами.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const renderBanner = (text: string) => (
    <div data-testid="global-llm-banner" className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-900 flex-shrink-0">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span id={textId} className="flex-1 min-w-0">{text}</span>
      {!hideOpen && (
        <button type="button" onClick={onOpen} aria-describedby={textId} className="underline flex-shrink-0">
          {t('admin.globalLlm.bannerOpen', 'Изменить')}
        </button>
      )}
    </div>
  );

  if (error) {
    return renderBanner(t('admin.globalLlm.bannerError', 'Не удалось узнать модель ответов для всех'));
  }
  if (!state || state.provider === 'claude') return null;

  const model = PROVIDER_LABELS[state.provider];
  const noKey = !state.configured[state.provider];
  const text = noKey && state.since
    ? t('admin.globalLlm.bannerNoKey', 'Все отвечают через {{model}} с {{since}} — ключа нет, фактически Claude', { model, since: fmtSince(state.since) })
    : state.since
      ? t('admin.globalLlm.banner', 'Все отвечают через {{model}} с {{since}}', { model, since: fmtSince(state.since) })
      : t('admin.globalLlm.bannerNoSince', 'Все отвечают через {{model}}', { model });
  return renderBanner(text);
};

export default GlobalLlmBanner;
