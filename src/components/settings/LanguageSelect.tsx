import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, resolveLanguage } from '../../i18n/languages';
import { apiClient } from '../../services/apiClient';
import { tokenManager } from '../../utils/tokenManager';
import { persistLanguage } from '../../i18n/persistLanguage';

interface LanguageSelectProps {
  onChange?: (lang: string) => void;
  className?: string;
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
export const LanguageSelect: React.FC<LanguageSelectProps> = ({ onChange, className }) => {
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
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.nativeName}
        </option>
      ))}
    </select>
  );
};
