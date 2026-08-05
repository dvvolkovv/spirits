import { describe, it, expect } from 'vitest';
import { flatten, unflatten, missingKeys, extractPlaceholders, placeholdersMatch } from './locale-utils.mjs';

describe('flatten / unflatten', () => {
  it('разворачивает вложенный объект в плоские ключи', () => {
    expect(flatten({ a: { b: 'x' }, c: 'y' })).toEqual({ 'a.b': 'x', c: 'y' });
  });

  it('сворачивает обратно без потерь', () => {
    const nested = { chat: { send: 'Отправить', empty: 'Пусто' }, ok: 'Да' };
    expect(unflatten(flatten(nested))).toEqual(nested);
  });
});

describe('missingKeys', () => {
  it('находит ключи источника, отсутствующие в цели', () => {
    expect(missingKeys({ a: '1', b: '2' }, { a: 'x' })).toEqual(['b']);
  });

  it('считает пустую строку отсутствующим переводом', () => {
    expect(missingKeys({ a: '1' }, { a: '' })).toEqual(['a']);
  });

  it('возвращает пустой список при полном покрытии', () => {
    expect(missingKeys({ a: '1' }, { a: 'x' })).toEqual([]);
  });

  it('не требует перевода для намеренно пустого значения в источнике', () => {
    expect(missingKeys({ a: '' }, {})).toEqual([]);
    expect(missingKeys({ a: '' }, { a: '' })).toEqual([]);
  });
});

describe('extractPlaceholders', () => {
  it('находит интерполяцию i18next', () => {
    expect(extractPlaceholders('Осталось {{count}} дней')).toEqual(['{{count}}']);
  });

  it('находит кастомные теги кнопок целиком', () => {
    const s = '{{button: Купить | action: buy | variant: primary}}';
    expect(extractPlaceholders(s)).toEqual([s]);
  });

  it('возвращает пустой список без плейсхолдеров', () => {
    expect(extractPlaceholders('Просто текст')).toEqual([]);
  });
});

describe('placeholdersMatch', () => {
  it('пропускает перевод с идентичным набором плейсхолдеров', () => {
    expect(placeholdersMatch('Осталось {{count}} дней', '{{count}} days left')).toBe(true);
  });

  it('отклоняет перевод, потерявший плейсхолдер', () => {
    expect(placeholdersMatch('Осталось {{count}} дней', 'Días restantes')).toBe(false);
  });

  it('отклоняет перевод, переведший содержимое кастомного тега', () => {
    expect(
      placeholdersMatch('{{button: Купить | action: buy}}', '{{button: Comprar | action: buy}}'),
    ).toBe(false);
  });
});
