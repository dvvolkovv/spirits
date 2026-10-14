import { describe, it, expect } from 'vitest';
import ru from '../../i18n/locales/ru.json';
import en from '../../i18n/locales/en.json';
import de from '../../i18n/locales/de.json';
import fr from '../../i18n/locales/fr.json';
import es from '../../i18n/locales/es.json';
import pt from '../../i18n/locales/pt.json';
import zh from '../../i18n/locales/zh.json';

/**
 * Подсказки мастера и правки бота — человеческими словами (ревью 14.10.2026).
 *
 * Было «в strict-режиме», «rate-limit 60 сек», «@-mention», «реплай на бота»:
 * внутренние названия режимов и жаргон разработчика в интерфейсе. Режим
 * называем так же, как его кнопка («По обращению»), лимиты — по-человечески.
 */
const JARGON = /strict|rate.?limit|@-mention|@-menci|реплай|限流/i;

const KEYS = ['name_hint', 'addr_strict_desc', 'addr_smart_desc', 'addr_always_desc'] as const;

describe('подсказки режимов бота — без жаргона', () => {
  it.each([
    ['ru', ru], ['en', en], ['de', de], ['fr', fr], ['es', es], ['pt', pt], ['zh', zh],
  ] as const)('%s', (_lang, locale) => {
    // tgBot содержит и вложенный intro — к строкам приводим через unknown.
    const tg = (locale as unknown as { tgBot: Record<string, string> }).tgBot;
    const jargon = KEYS.filter((k) => JARGON.test(tg[k]));
    expect(jargon).toEqual([]);
  });

  it('ru: «Я нажал /start» — без рода, кнопка говорит, что она делает', () => {
    expect(ru.tgBot.i_pressed_start).not.toMatch(/нажал(\s|$)/);
  });

  it('проверка видит жаргон, если он есть (сторож сторожа)', () => {
    expect(JARGON.test('Сам решает (rate-limit 60 сек)')).toBe(true);
    expect(JARGON.test('(в strict-режиме)')).toBe(true);
    expect(JARGON.test('自行判断何时适合介入（限流 60 秒）')).toBe(true);
    expect(JARGON.test('Сам решает, когда стоит вмешаться — не чаще раза в минуту')).toBe(false);
  });
});
