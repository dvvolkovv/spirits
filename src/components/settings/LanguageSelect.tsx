import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';
import { SUPPORTED_LANGUAGES, resolveLanguage } from '../../i18n/languages';
import { apiClient } from '../../services/apiClient';
import { tokenManager } from '../../utils/tokenManager';
import { persistLanguage } from '../../i18n/persistLanguage';

interface LanguageSelectProps {
  onChange?: (lang: string) => void;
  className?: string;
  /** 'pill' — компактный вид для экрана входа: поверх фона, со значком глобуса. */
  variant?: 'default' | 'pill';
  /** Флаг-эмодзи в подписях. На экране входа выключается: эмодзи выведены из системы иконок. */
  showFlag?: boolean;
}

/**
 * Единственный переключатель языка в приложении. Список берётся из реестра,
 * поэтому новый язык не требует правок здесь.
 *
 * Сохранение в профиль живёт ЗДЕСЬ, а не у вызывающего. Раньше запись делал
 * только экран настроек, а копия на экране входа язык в профиль не отправляла:
 * интерфейс переключался, но ассистенты продолжали отвечать на прежнем языке,
 * и мобильное приложение его не подхватывало. Любая новая копия компонента
 * унаследовала бы ту же полурабочесть.
 *
 * На экране входа токенов ещё нет — там запись пропускается сознательно:
 * язык остаётся в localStorage, а в профиль его положит AuthContext сразу
 * после входа.
 */
export const LanguageSelect: React.FC<LanguageSelectProps> = ({
  onChange, className, variant = 'default', showFlag = true,
}) => {
  const { i18n } = useTranslation();
  const current = resolveLanguage(i18n.language);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    i18n.changeLanguage(lang);

    void persistLanguage(lang, {
      hasTokens: () => tokenManager.hasTokens(),
      post: (url, body) => apiClient.post(url, body),
      onError: (err) => console.warn('Не удалось сохранить язык в профиль:', err),
    });

    onChange?.(lang);
  };

  const options = SUPPORTED_LANGUAGES.map((lang) => (
    <option key={lang.code} value={lang.code}>
      {showFlag ? `${lang.flag} ${lang.nativeName}` : lang.nativeName}
    </option>
  ));

  if (variant === 'pill') {
    // Нативный <select> сохраняется намеренно: на мобильном он даёт системный
    // пикер, который лучше любого самодельного дропдауна.
    return (
      <span className={`relative inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/85 backdrop-blur-sm pl-2.5 pr-2 py-1 ${className ?? ''}`}>
        <Globe className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden />
        <select
          value={current}
          onChange={handleChange}
          aria-label={i18n.t('settings.language_title')}
          className="appearance-none bg-transparent pr-4 text-xs text-gray-600 focus:outline-none cursor-pointer"
        >
          {options}
        </select>
        <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 pointer-events-none" aria-hidden />
      </span>
    );
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      aria-label={i18n.t('settings.language_title')}
      className={
        className ??
        'px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent'
      }
    >
      {options}
    </select>
  );
};
