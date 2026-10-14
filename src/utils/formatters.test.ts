import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import i18n from '../i18n';
import { toIntlLocale, formatDate, formatDateTime, formatNumber, formatCurrency, formatTokensCompact } from './formatters';

describe('toIntlLocale', () => {
  it('разворачивает корень языка в полную Intl-локаль', () => {
    expect(toIntlLocale('ru')).toBe('ru-RU');
    expect(toIntlLocale('en')).toBe('en-US');
    expect(toIntlLocale('zh')).toBe('zh-CN');
  });

  it('португальский — европейский pt-PT, а не русская локаль', () => {
    // pt появился в SUPPORTED_CODES позже этой карты: даты и числа португальцам
    // форматировались по-русски («04.08.2026» вместо «04/08/2026»).
    expect(toIntlLocale('pt')).toBe('pt-PT');
  });

  it('падает в русскую локаль на неизвестном языке', () => {
    expect(toIntlLocale('it')).toBe('ru-RU');
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

describe('formatDateTime', () => {
  const iso = '2026-03-09T14:05:00Z';

  it('меняет порядок дня и месяца вместе с языком', async () => {
    await i18n.changeLanguage('ru');
    const ru = formatDateTime(iso);
    await i18n.changeLanguage('en');
    const en = formatDateTime(iso);

    // ru: 09.03.2026, en: 3/9/26 — разделители и порядок разные.
    expect(ru).not.toBe(en);
    expect(ru).toContain('.');
    expect(en).toContain('/');
  });

  it('РЕГРЕССИЯ: не отдаёт русский формат чужим языкам', async () => {
    // 33 места в коде звали toLocaleString('ru-RU') напрямую, из-за чего
    // немец видел русские разряды и русскую дату. Здесь это ловится.
    await i18n.changeLanguage('de');
    const de = formatDateTime(iso);
    await i18n.changeLanguage('ru');
    const ru = formatDateTime(iso);
    expect(de).not.toBe(ru);
  });

  it('уважает переданные опции', async () => {
    await i18n.changeLanguage('ru');
    const short = formatDateTime(iso, { dateStyle: 'short', timeStyle: 'short' });
    const medium = formatDateTime(iso, { dateStyle: 'medium', timeStyle: 'short' });
    expect(short).not.toBe(medium);
  });
});

describe('formatTokensCompact', () => {
  beforeEach(async () => { await i18n.changeLanguage('ru'); });
  afterAll(async () => { await i18n.changeLanguage('ru'); });

  it('миллионы — с одним знаком после запятой', () => {
    expect(formatTokensCompact(97_083_375)).toBe('97,1 млн');
  });

  it('десятки тысяч — без дробной части', () => {
    expect(formatTokensCompact(23_456)).toBe('23 тыс');
  });

  it('мелкие остатки показываем целиком: у них цена решения выше', () => {
    // Ниже 10 000 человек уже считает каждую тысячу — округление до «9 тыс»
    // скрыло бы разницу между 9 400 и 9 900 ровно там, где она важна.
    expect(formatTokensCompact(9_400)).toBe(formatNumber(9_400));
  });

  it('ноль остаётся нулём, а не «0 тыс»', () => {
    expect(formatTokensCompact(0)).toBe('0');
  });

  // Слова разрядов были вшиты по-русски: немец видел «97,1 млн» в шапке чата.
  // Числа те же на всех языках — меняется только подпись разряда.
  it.each([
    ['en', '97.1M', '23K'],
    ['de', '97,1 Mio.', '23 Tsd.'],
    ['fr', '97,1 M', '23 k'],
    ['es', '97,1 M', '23 mil'],
    ['pt', '97,1 M', '23 mil'],
    // Китайский считает в 万/亿 — CLDR через Intl, а не «百万/千».
    ['zh', '9708.3万', '2.3万'],
  ])('%s — разряды словами своего языка, а не «млн/тыс»', async (lng, million, thousand) => {
    await i18n.changeLanguage(lng);
    expect(formatTokensCompact(97_083_375)).toBe(million);
    expect(formatTokensCompact(23_456)).toBe(thousand);
  });
});
