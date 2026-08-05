import type { CountryCode } from 'libphonenumber-js';
import { resolveLanguage } from '../../i18n/languages';

/**
 * Страна по умолчанию для телефонного ввода — угадывается по языку интерфейса.
 *
 * Язык не равен стране (испаноязычных стран два десятка), поэтому это лишь
 * разумный первый выбор: пользователь всегда может сменить страну в списке.
 * Берём самую крупную по аудитории страну для каждого языка.
 *
 * Для русского это RU, а не KZ: у обеих код +7, но подавляющее большинство
 * пользователей продукта — российские.
 */
const COUNTRY_BY_LANGUAGE: Record<string, CountryCode> = {
  ru: 'RU',
  en: 'US',
  es: 'ES',
  de: 'DE',
  fr: 'FR',
  zh: 'CN',
};

export function defaultCountryForLanguage(language?: string | null): CountryCode {
  return COUNTRY_BY_LANGUAGE[resolveLanguage(language)] ?? 'RU';
}
