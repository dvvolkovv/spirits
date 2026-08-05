import i18n from '../i18n';
import { DEFAULT_LANGUAGE } from '../i18n/languages';

/**
 * Intl хочет полную локаль, i18next хранит корень языка.
 * Ключи должны совпадать с SUPPORTED_CODES из i18n/languages.
 */
const INTL_LOCALES: Record<string, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  zh: 'zh-CN',
};

export function toIntlLocale(lang: string): string {
  return INTL_LOCALES[lang] ?? INTL_LOCALES[DEFAULT_LANGUAGE];
}

function activeLocale(): string {
  return toIntlLocale(i18n.language || DEFAULT_LANGUAGE);
}

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
): string {
  return new Date(value).toLocaleDateString(activeLocale(), options);
}

export function formatTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
): string {
  return new Date(value).toLocaleTimeString(activeLocale(), options);
}

export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  return value.toLocaleString(activeLocale(), options);
}

export function formatCurrency(value: number, currency = 'RUB'): string {
  return value.toLocaleString(activeLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}
