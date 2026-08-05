import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, SUPPORTED_CODES, DEFAULT_LANGUAGE, resolveLanguage } from './languages';

describe('SUPPORTED_LANGUAGES', () => {
  it('содержит шесть языков в фиксированном порядке', () => {
    expect(SUPPORTED_CODES).toEqual(['ru', 'en', 'es', 'de', 'fr', 'zh']);
  });

  it('у каждого языка есть родное название и флаг', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang.nativeName.length).toBeGreaterThan(0);
      expect(lang.flag.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveLanguage', () => {
  it('пропускает поддерживаемый код как есть', () => {
    expect(resolveLanguage('es')).toBe('es');
  });

  it('схлопывает региональный вариант до корня', () => {
    expect(resolveLanguage('es-MX')).toBe('es');
    expect(resolveLanguage('zh-Hans')).toBe('zh');
    expect(resolveLanguage('de_AT')).toBe('de');
  });

  it('не зависит от регистра', () => {
    expect(resolveLanguage('ES')).toBe('es');
  });

  it('возвращает дефолт для неподдерживаемого языка', () => {
    expect(resolveLanguage('pt')).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage('ja-JP')).toBe(DEFAULT_LANGUAGE);
  });

  it('возвращает дефолт для пустого значения', () => {
    expect(resolveLanguage(undefined)).toBe('ru');
    expect(resolveLanguage(null)).toBe('ru');
    expect(resolveLanguage('')).toBe('ru');
  });
});
