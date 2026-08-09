import { describe, it, expect } from 'vitest';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { defaultCountryForLanguage } from './phoneCountry';

describe('defaultCountryForLanguage', () => {
  it('подбирает страну по языку интерфейса', () => {
    expect(defaultCountryForLanguage('de')).toBe('DE');
    expect(defaultCountryForLanguage('zh')).toBe('CN');
    expect(defaultCountryForLanguage('fr')).toBe('FR');
  });

  it('схлопывает региональный вариант языка', () => {
    expect(defaultCountryForLanguage('es-MX')).toBe('ES');
  });

  it('для незнакомой локали предлагает США, а не Россию', () => {
    // Следствие английского фолбэка (i18n/languages.ts): португалец больше не
    // получает предзаполненный +7. Страна — лишь первый выбор, список открыт.
    expect(defaultCountryForLanguage('pt')).toBe('US');
    expect(defaultCountryForLanguage(undefined)).toBe('US');
    expect(defaultCountryForLanguage(null)).toBe('US');
  });

  it('русский интерфейс по-прежнему даёт RU', () => {
    expect(defaultCountryForLanguage('ru')).toBe('RU');
    expect(defaultCountryForLanguage('ru-RU')).toBe('RU');
  });
});

describe('международный разбор номера', () => {
  it('принимает номера стран, которые старая маска +7 не пропускала', () => {
    // Ровно та регрессия, ради которой всё переделывалось: раньше форма
    // физически не принимала номер длиннее/короче 11 цифр и не с +7.
    const cases: Array<[string, string]> = [
      ['DE', '151 23456789'],
      ['US', '(213) 373-4253'],
      ['FR', '06 12 34 56 78'],
      ['CN', '131 2345 6789'],
      ['BY', '29 123-45-67'],
    ];
    for (const [country, input] of cases) {
      const parsed = parsePhoneNumberFromString(input, country as never);
      expect(parsed?.isValid(), `${country} ${input}`).toBe(true);
    }
  });

  it('по-прежнему принимает российский номер', () => {
    const parsed = parsePhoneNumberFromString('903 016 91 87', 'RU');
    expect(parsed?.isValid()).toBe(true);
    expect(parsed?.number).toBe('+79030169187');
  });

  it('отклоняет номер неверной длины для страны', () => {
    expect(parsePhoneNumberFromString('123', 'DE')?.isValid() ?? false).toBe(false);
    expect(parsePhoneNumberFromString('903 016 91', 'RU')?.isValid() ?? false).toBe(false);
  });
});
