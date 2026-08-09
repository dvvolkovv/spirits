import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import i18n from './index';
import { FALLBACK_CHAIN } from './languages';
import ru from './locales/ru.json';
import en from './locales/en.json';
import de from './locales/de.json';

/**
 * Проверяем НАСТОЯЩИЙ инстанс приложения и НАСТОЯЩИЕ файлы локалей.
 *
 * Соблазн собрать здесь свой i18next с FALLBACK_CHAIN велик и ошибочен: такой
 * тест зелёный даже если конфиг приложения цепочку не подключил — он проверяет
 * константу, а не поведение продукта.
 */
describe('фолбэк непереведённого ключа', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('de');
  });

  afterAll(async () => {
    await i18n.changeLanguage('ru');
  });

  it('конфиг приложения объявляет цепочку, а не один язык', () => {
    expect(i18n.options.fallbackLng).toEqual(FALLBACK_CHAIN);
  });

  it('ключ, которого нет в немецком, приходит из английского, а не из русского', () => {
    // admin.title переведён в ru и en, но не в de — ровно тот случай, ради
    // которого цепочка и меняется.
    expect((de as Record<string, any>).admin?.title).toBeUndefined();
    expect(i18n.t('admin.title')).toBe((en as any).admin.title);
    expect(i18n.t('admin.title')).not.toBe((ru as any).admin.title);
  });

  it('переведённый ключ берётся из немецкого и никуда не подменяется', () => {
    expect(i18n.t('settings.language_title')).toBe((de as any).settings.language_title);
  });
});
