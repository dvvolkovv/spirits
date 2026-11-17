import { useTranslation } from 'react-i18next';

/**
 * Черта «Чистого листа» в ленте: выше — то, чего ассистент уже не учитывает.
 * Личного текста нет; лента и так под ym-hide-content.
 */
export function ContextResetDivider() {
  const { t } = useTranslation();
  return (
    <div data-testid="chat-fresh-divider" role="separator" className="flex items-center gap-2 my-2">
      <div className="flex-1 h-px bg-gray-300" />
      <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium text-center">
        {t('chat.fresh_divider')}
      </span>
      <div className="flex-1 h-px bg-gray-300" />
    </div>
  );
}
