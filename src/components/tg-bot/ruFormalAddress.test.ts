import { describe, it, expect } from 'vitest';
import ru from '../../i18n/locales/ru.json';

/**
 * Вкладка «Telegram-боты» и мастер создания бота по-русски — на «вы», как весь
 * кабинет и лендинг (решение владельца, 13–14.10.2026).
 *
 * Проверка ищет формы, которые выдают «ты»: повелительное наклонение глаголов
 * этой вкладки и личные местоимения. «Свой» сюда не входит — оно годится и для
 * «вы» («привяжите свой Telegram»). Новое «ты» другой формой проверка не
 * поймает, так что новые строки вкладки всё равно стоит читать глазами.
 */
const INFORMAL =
  /(^|[^а-яё])(привяжи|заполни|выбери|нажми|добавь|открой|создай|подожди|повтори|ты|твой|твоя|твоё|твои|твоих|твоим|твоей|тебе|тебя)([^а-яё]|$)/i;

type Dict = { [k: string]: string | Dict };

const strings = (node: Dict, prefix: string): Array<[string, string]> =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : strings(v, `${prefix}${k}.`),
  );

describe('ru: вкладка ботов и мастер — на «вы»', () => {
  it('в tgBot.* нет обращения на «ты»', () => {
    const informal = strings(ru.tgBot as unknown as Dict, 'tgBot.').filter(([, v]) => INFORMAL.test(v));
    expect(informal).toEqual([]);
  });

  it('подзаголовок вкладки в Студии — тоже', () => {
    expect(ru.pages.studio.bots_subtitle).not.toMatch(INFORMAL);
  });

  it('проверка видит «ты», если оно есть (сторож сторожа)', () => {
    expect(INFORMAL.test('Привяжи свой Telegram')).toBe(true);
    expect(INFORMAL.test('чтобы команды были доступны только тебе')).toBe(true);
    expect(INFORMAL.test('Привяжите свой Telegram')).toBe(false);
  });
});
