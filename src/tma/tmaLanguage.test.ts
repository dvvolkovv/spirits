import { describe, it, expect } from 'vitest';
import { resolveTmaLanguage, extractProfileLanguage } from './tmaLanguage';

describe('resolveTmaLanguage', () => {
  it('язык профиля побеждает язык Telegram', () => {
    expect(resolveTmaLanguage({ profileLanguage: 'ru', telegramLanguage: 'en' })).toBe('ru');
  });

  it('без профиля берётся язык Telegram', () => {
    expect(resolveTmaLanguage({ profileLanguage: null, telegramLanguage: 'de' })).toBe('de');
  });

  it('без обоих — null, детектор i18next решает сам', () => {
    expect(resolveTmaLanguage({ profileLanguage: null, telegramLanguage: null })).toBeNull();
  });

  it('неподдерживаемый язык отбрасывается в пользу следующего источника', () => {
    expect(resolveTmaLanguage({ profileLanguage: 'kk', telegramLanguage: 'en' })).toBe('en');
  });

  it('региональный код сводится к базовому', () => {
    expect(resolveTmaLanguage({ profileLanguage: null, telegramLanguage: 'pt-BR' })).toBe('pt');
  });
});

describe('extractProfileLanguage', () => {
  it('достаёт язык из массива с profileJson — реальная форма ответа', () => {
    expect(
      extractProfileLanguage([{ profileJson: { profile_data: { language: 'es' } } }]),
    ).toBe('es');
  });

  it('терпит старый формат profile_data', () => {
    expect(extractProfileLanguage({ profile_data: { language: 'fr' } })).toBe('fr');
  });

  it('профиль без языка — null, а не падение', () => {
    expect(extractProfileLanguage([{ profileJson: {} }])).toBeNull();
    expect(extractProfileLanguage(null)).toBeNull();
  });
});
