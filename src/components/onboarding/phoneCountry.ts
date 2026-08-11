import type { CountryCode } from 'libphonenumber-js';
import { resolveLanguage, VISITOR_FALLBACK } from '../../i18n/languages';

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
export const COUNTRY_BY_LANGUAGE: Record<string, CountryCode> = {
  ru: 'RU',
  en: 'US',
  es: 'ES',
  de: 'DE',
  fr: 'FR',
  zh: 'CN',
  // Европейский португальский, поэтому PT, а не BR.
  pt: 'PT',
};

/**
 * Язык, попавший в реестр, но забытый в карте выше, раньше проваливался в
 * `?? 'RU'` — и португалец получал предзаполненный +7. Дыра открылась ровно
 * в тот момент, когда 'pt' перестал быть незнакомым кодом и resolveLanguage
 * вернул его самому себе вместо английского.
 *
 * Поэтому промах карты уходит туда же, куда уходит незнакомый посетитель,
 * — в VISITOR_FALLBACK, а не в русскую страну по умолчанию.
 */
const FALLBACK_COUNTRY: CountryCode = COUNTRY_BY_LANGUAGE[VISITOR_FALLBACK] ?? 'US';

export function defaultCountryForLanguage(language?: string | null): CountryCode {
  return COUNTRY_BY_LANGUAGE[resolveLanguage(language)] ?? FALLBACK_COUNTRY;
}
