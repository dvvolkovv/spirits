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

type Dict = { [k: string]: string | Dict };

const LOCALES = [
  ['ru', ru], ['en', en], ['de', de], ['fr', fr], ['es', es], ['pt', pt], ['zh', zh],
] as const;

type Lang = (typeof LOCALES)[number][0];

// tgBot содержит и вложенный intro — к строкам приводим через unknown.
const tgOf = (locale: unknown) => (locale as { tgBot: Dict }).tgBot;
const str = (tg: Dict, key: string) => tg[key] as string;
const strings = (node: Dict): string[] =>
  Object.values(node).flatMap((v) => (typeof v === 'string' ? [v] : strings(v)));

/** Как подписана кнопка запуска бота в самом Telegram на этом языке. */
const TELEGRAM_START: Record<Lang, string> = {
  ru: 'Запустить', en: 'Start', de: 'Starten', fr: 'Démarrer', es: 'Iniciar', pt: 'Iniciar', zh: '开始',
};

describe('подсказки режимов бота — без жаргона', () => {
  it.each(LOCALES)('%s', (_lang, locale) => {
    const tg = tgOf(locale);
    for (const k of KEYS) expect(typeof tg[k], k).toBe('string');
    const jargon = KEYS.filter((k) => JARGON.test(str(tg, k)));
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
  // Имя срабатывает во всех режимах (прямое обращение), а не только в одном.
  it.each(LOCALES)('%s: подсказка имени — без оговорки про один режим', (_lang, locale) => {
    const tg = tgOf(locale);
    for (const mode of ['mode_strict', 'mode_smart', 'mode_always']) {
      expect(str(tg, mode), mode).toBeTruthy();
      expect(str(tg, 'name_hint')).not.toContain(str(tg, mode));
    }
  });

  // Кнопка проверяет привязку — и называется так на всех языках, а не «Я нажал /start».
  it.each(LOCALES)('%s: кнопка шага 1 — про проверку, не про /start', (_lang, locale) => {
    expect(str(tgOf(locale), 'i_pressed_start')).not.toMatch(/\/start/);
  });

  it('ru: кнопка без рода — «Проверить привязку», а не «Я нажал(а)»', () => {
    expect(ru.tgBot.i_pressed_start).not.toMatch(/нажал/i);
  });

  // Рядом кнопка «Generate link», где link — адрес: «Check link» читалось как
  // «проверить ссылку».
  it('en: кнопка проверки не путается со ссылкой', () => {
    expect(en.tgBot.i_pressed_start).not.toMatch(/\blink\b/i);
  });

  // Без этого человек открывает бота и не знает, что дальше: кнопку в Telegram
  // называем так, как она подписана там. Голый /start руками не привяжет —
  // нужен тот, что уходит по ссылке, поэтому «/start» не советуем нигде.
  it.each(LOCALES)('%s: шаг 1 и подсказка «ещё не привязано» — нажать в Telegram кнопку запуска', (lang, locale) => {
    const tg = tgOf(locale);
    for (const key of ['step1_desc', 'not_bound_error']) {
      expect(str(tg, key), key).toContain(TELEGRAM_START[lang]);
      expect(str(tg, key), key).not.toMatch(/\/start/);
    }
  });

  // При нуле бот говорит тому, кто его позвал, а владельцу пишет в Telegram.
  it.each(LOCALES)('%s: карточка — владельцу напишут в Telegram, когда токены кончатся', (_lang, locale) => {
    expect((tgOf(locale).intro as Dict).cost).toMatch(/Telegram/);
  });

  it('ru: карточка не обещает «предупредит группу» — объясняет только позвавшему', () => {
    expect(ru.tgBot.intro.cost).not.toMatch(/предупредит группу/);
  });

  it('en: апострофы прямые, как во всём en.json', () => {
    expect(strings(tgOf(en)).filter((s) => s.includes('’'))).toEqual([]);
  });
});
