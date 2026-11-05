import { describe, it, expect } from 'vitest';
import { isNoTokensEnd, restoreDraftText } from './noTokensDraft';

describe('isNoTokensEnd', () => {
  it('end с reason no_tokens — это остановка по балансу', () => {
    expect(isNoTokensEnd({ type: 'end', reason: 'no_tokens' })).toBe(true);
  });

  it('обычный end — нет', () => {
    expect(isNoTokensEnd({ type: 'end' })).toBe(false);
    expect(isNoTokensEnd({ type: 'end', reason: undefined })).toBe(false);
  });

  it('item/ping с таким же reason — нет: признак живёт только в end', () => {
    expect(isNoTokensEnd({ type: 'item', reason: 'no_tokens' })).toBe(false);
    expect(isNoTokensEnd({ type: 'ping' })).toBe(false);
  });

  it('битое событие не роняет разбор', () => {
    expect(isNoTokensEnd(null)).toBe(false);
    expect(isNoTokensEnd(undefined)).toBe(false);
    expect(isNoTokensEnd({})).toBe(false);
  });
});

describe('restoreDraftText', () => {
  it('пустое поле — возвращаем отправленный текст', () => {
    expect(restoreDraftText('', 'мой вопрос')).toBe('мой вопрос');
    expect(restoreDraftText('   ', 'мой вопрос')).toBe('мой вопрос');
  });

  it('непустое поле — не затираем то, что человек набрал, пока шёл отказ', () => {
    expect(restoreDraftText('уже пишу новое', 'мой вопрос')).toBe('уже пишу новое');
  });
});
