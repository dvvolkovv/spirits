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

type TgBot = Record<string, unknown> & { intro: Record<string, string> };

const LOCALES = [
  ['ru', ru], ['en', en], ['de', de], ['fr', fr], ['es', es], ['pt', pt], ['zh', zh],
] as const;

// tgBot содержит и вложенный intro — к строкам приводим через unknown.
const tgOf = (locale: unknown) => (locale as { tgBot: TgBot }).tgBot;

/** Как подписана кнопка запуска бота в самом Telegram на этом языке. */
const TELEGRAM_START: Record<string, string> = {
  ru: 'Запустить', en: 'Start', de: 'Starten', fr: 'Démarrer', es: 'Iniciar', pt: 'Iniciar', zh: '开始',
};

describe('подсказки режимов бота — без жаргона', () => {
  it.each(LOCALES)('%s', (_lang, locale) => {
    const tg = tgOf(locale);
    for (const k of KEYS) expect(typeof tg[k], k).toBe('string');
    const jargon = KEYS.filter((k) => JARGON.test(tg[k] as string));
    expect(jargon).toEqual([]);
  });

  it('проверка видит жаргон, если он есть (сторож сторожа)', () => {
    expect(JARGON.test('Сам решает (rate-limit 60 сек)')).toBe(true);
    expect(JARGON.test('(в strict-режиме)')).toBe(true);
    expect(JARGON.test('自行判断何时适合介入（限流 60 秒）')).toBe(true);
    expect(JARGON.test('Сам решает, когда стоит вмешаться — не чаще раза в минуту')).toBe(false);
  });
});

describe('мастер: подсказки говорят то, что есть', () => {
  // Имя срабатывает во всех режимах (прямое обращение), а не только «по обращению».
  it.each(LOCALES)('%s: подсказка имени — без оговорки про один режим', (_lang, locale) => {
    expect(tgOf(locale).name_hint).not.toMatch(/[(（]/);
  });

  // Кнопка проверяет привязку — и называется так на всех языках, а не «Я нажал /start».
  it.each(LOCALES)('%s: кнопка шага 1 — про проверку, не про /start', (_lang, locale) => {
    expect(tgOf(locale).i_pressed_start).not.toMatch(/\/start/);
  });

  it('ru: кнопка без рода — «Проверить привязку», а не «Я нажал(а)»', () => {
    expect(ru.tgBot.i_pressed_start).not.toMatch(/нажал[аи]?(\s|$)/);
  });

  // Без этого человек открывает бота и не знает, что дальше: кнопку в Telegram
  // называем так, как она подписана там.
  it.each(LOCALES)('%s: шаг 1 говорит нажать в Telegram кнопку запуска', (lang, locale) => {
    expect(tgOf(locale).step1_desc).toContain(TELEGRAM_START[lang]);
  });

  // При нуле бот говорит тому, кто его позвал, а владельцу пишет в Telegram —
  // «предупредит группу» больше не так.
  it.each(LOCALES)('%s: карточка — владельцу напишут в Telegram, когда токены кончатся', (_lang, locale) => {
    expect(tgOf(locale).intro.cost).toMatch(/Telegram/);
  });

  it('en: апострофы прямые, как во всём en.json', () => {
    const tg = tgOf(en);
    expect(KEYS.filter((k) => (tg[k] as string).includes('’'))).toEqual([]);
  });
});
