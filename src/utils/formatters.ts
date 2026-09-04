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

/** Дата и время вместе — для отметок «когда пришло сообщение». */
export function formatDateTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
): string {
  return new Date(value).toLocaleString(activeLocale(), options);
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

/**
 * Компактный баланс для узких экранов: 97 083 375 → «97,1 млн».
 *
 * Нужен ровно в одном месте — шапке чата на мобиле. Там на 390 px
 * фиксированные элементы (аватар, кнопки «чистый лист» и «позвонить», баланс,
 * перегенерация, очистка) съедали всю ширину, правый блок уезжал за экран, а
 * имени ассистента не оставалось ни пикселя (замер на проде 04.09.2026).
 * Полное число занимает вчетверо больше места, чем компактное, и именно оно
 * было самым дорогим элементом.
 *
 * Разряды подписываем словом, а не буквой: «97,1M» на кириллическом экране
 * читается как латиница посреди русского текста.
 */
export function formatTokensCompact(tokens: number): string {
  const abs = Math.abs(tokens);
  if (abs >= 1_000_000) {
    return `${formatNumber(tokens / 1_000_000, { maximumFractionDigits: 1 })} млн`;
  }
  if (abs >= 10_000) {
    return `${formatNumber(Math.round(tokens / 1000), { maximumFractionDigits: 0 })} тыс`;
  }
  return formatNumber(tokens);
}
