import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, SUPPORTED_CODES, DEFAULT_LANGUAGE, VISITOR_FALLBACK, resolveLanguage } from './languages';

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

  it('незнакомый язык уводит в английский, а не в русский', () => {
    expect(resolveLanguage('pt')).toBe(VISITOR_FALLBACK);
    expect(resolveLanguage('ja-JP')).toBe(VISITOR_FALLBACK);
    expect(resolveLanguage('pt')).not.toBe(DEFAULT_LANGUAGE);
  });

  it('пустое значение — тоже английский: языка посетителя мы не знаем', () => {
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage(null)).toBe('en');
    expect(resolveLanguage('')).toBe('en');
  });

  it('русский остаётся русским — фолбэк не подменяет явный язык', () => {
    expect(resolveLanguage('ru')).toBe('ru');
    expect(resolveLanguage('ru-RU')).toBe('ru');
  });
});
