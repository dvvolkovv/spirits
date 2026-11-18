import { useTranslation } from 'react-i18next';

/**
 * Черта «Чистого листа» в ленте: выше — то, чего ассистент уже не учитывает.
 * Личного текста нет; лента и так под ym-hide-content.
 *
 * Скринридер читает фразу из aria-label разделителя; линии и видимый текст
 * от него скрыты, иначе фраза звучала бы дважды. Подпись — целая фраза, а
 * не короткая метка: обычным регистром, с переносом в пределах 80% ширины,
 * чтобы на телефоне линии по бокам не схлопывались в ноль.
 */
export function ContextResetDivider() {
  const { t } = useTranslation();
  const label = t('chat.fresh_divider');
  return (
    <div data-testid="chat-fresh-divider" role="separator" aria-label={label} className="flex items-center gap-2 my-2">
      <div aria-hidden="true" className="flex-1 min-w-6 h-px bg-gray-300" />
      <span aria-hidden="true" className="max-w-[80%] text-[11px] text-gray-500 font-medium text-center">
        {label}
      </span>
      <div aria-hidden="true" className="flex-1 min-w-6 h-px bg-gray-300" />
    </div>
  );
}
