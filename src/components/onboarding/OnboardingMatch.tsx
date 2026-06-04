import React from 'react';
import { useTranslation } from 'react-i18next';

interface Assistant {
  id: number;
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
}

// Тема → ассистент по СТАБИЛЬНОМУ name (per spirits_back/CLAUDE.md — name не
// меняется). Фолбэк — Роман (координатор), если профильный ассистент почему-то
// отсутствует в ростере.
export const ONBOARDING_THEMES: { key: string; emoji: string; assistantName: string }[] = [
  { key: 'theme_self', emoji: '🧭', assistantName: 'Оля' },
  { key: 'theme_growth', emoji: '📈', assistantName: 'Миша' },
  { key: 'theme_career', emoji: '💼', assistantName: 'Ирина' },
  { key: 'theme_biz', emoji: '💰', assistantName: 'Андрей' },
  { key: 'theme_practices', emoji: '🔮', assistantName: 'Райя' },
  { key: 'theme_unsure', emoji: '🤔', assistantName: 'Роман' },
];
const FALLBACK_ASSISTANT_NAME = 'Роман';

interface Props {
  assistants: Assistant[];
  onPickTheme: (assistant: Assistant) => void;
  onShowAll: () => void;
}

const OnboardingMatch: React.FC<Props> = ({ assistants, onPickTheme, onShowAll }) => {
  const { t } = useTranslation();

  const resolve = (name: string): Assistant | undefined =>
    assistants.find((a) => a.name === name) ||
    assistants.find((a) => a.name === FALLBACK_ASSISTANT_NAME);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">
        {t('onboarding.match.title')}
      </h1>
      <p className="text-sm text-gray-500 mb-6 text-center max-w-md">
        {t('onboarding.match.subtitle')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {ONBOARDING_THEMES.map((th) => {
          const a = resolve(th.assistantName);
          if (!a) return null;
          return (
            <button
              key={th.key}
              data-testid="onboarding-theme"
              data-assistant={a.name}
              onClick={() => onPickTheme(a)}
              className="flex items-center gap-3 text-left bg-white border-2 border-transparent hover:border-blue-500 shadow-md hover:shadow-xl rounded-2xl p-4 transition-all active:scale-95"
            >
              <span className="text-2xl flex-shrink-0">{th.emoji}</span>
              <span className="font-semibold text-gray-900">
                {t(`onboarding.match.${th.key}`)}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onShowAll}
        data-testid="onboarding-show-all"
        className="mt-6 text-sm text-gray-400 hover:text-gray-600 underline"
      >
        {t('onboarding.match.show_all')}
      </button>
    </div>
  );
};

export default OnboardingMatch;
