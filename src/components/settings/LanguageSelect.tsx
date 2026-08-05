import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, resolveLanguage } from '../../i18n/languages';

interface LanguageSelectProps {
  onChange?: (lang: string) => void;
  className?: string;
}

/**
 * Единственный переключатель языка в приложении. Список берётся из реестра,
 * поэтому новый язык не требует правок здесь.
 */
export const LanguageSelect: React.FC<LanguageSelectProps> = ({ onChange, className }) => {
  const { i18n } = useTranslation();
  const current = resolveLanguage(i18n.language);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    i18n.changeLanguage(lang);
    onChange?.(lang);
  };

  return (
    <select
      value={current}
      onChange={handleChange}
      className={
        className ??
        'px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent'
      }
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.nativeName}
        </option>
      ))}
    </select>
  );
};
