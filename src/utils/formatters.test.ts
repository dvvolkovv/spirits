import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../i18n';
import { toIntlLocale, formatDate, formatNumber, formatCurrency } from './formatters';

describe('toIntlLocale', () => {
  it('разворачивает корень языка в полную Intl-локаль', () => {
    expect(toIntlLocale('ru')).toBe('ru-RU');
    expect(toIntlLocale('en')).toBe('en-US');
    expect(toIntlLocale('zh')).toBe('zh-CN');
  });

  it('падает в русскую локаль на неизвестном языке', () => {
    expect(toIntlLocale('pt')).toBe('ru-RU');
  });
});

describe('форматирование по активному языку', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru');
  });

  it('форматирует число по-русски', () => {
    // NBSP-разделитель разрядов — сравниваем по наличию цифр, не по байтам
    expect(formatNumber(1234567)).toMatch(/^1.234.567$/);
  });

  it('переключает формат числа вместе с языком', async () => {
    await i18n.changeLanguage('de');
    expect(formatNumber(1234567)).toBe('1.234.567');
    await i18n.changeLanguage('en');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('форматирует дату по активному языку', async () => {
    const date = new Date(Date.UTC(2026, 7, 4));
    await i18n.changeLanguage('ru');
    expect(formatDate(date)).toBe('04.08.2026');
    await i18n.changeLanguage('en');
    expect(formatDate(date)).toBe('08/04/2026');
  });

  it('форматирует сумму в рублях', () => {
    expect(formatCurrency(1500)).toContain('1');
    expect(formatCurrency(1500)).toContain('₽');
  });
});
