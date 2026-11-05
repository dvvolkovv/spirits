import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isNoTokensEnd, restoreDraftText, saveNoTokensDraft, peekNoTokensDraft, clearNoTokensDraft } from './noTokensDraft';

/** Минимальный sessionStorage для node-окружения vitest. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
}

describe('черновик переживает уход на оплату', () => {
  const real = (globalThis as any).sessionStorage;
  beforeEach(() => { (globalThis as any).sessionStorage = new MemoryStorage(); });
  afterEach(() => { (globalThis as any).sessionStorage = real; });

  it('сохранённый текст читается для того же ассистента', () => {
    saveNoTokensDraft(12, 'мой вопрос');
    expect(peekNoTokensDraft(12)).toBe('мой вопрос');
  });

  it('чужой ассистент свой черновик не видит', () => {
    saveNoTokensDraft(12, 'мой вопрос');
    expect(peekNoTokensDraft(10)).toBeNull();
  });

  it('после явной отправки копия стёрта — после F5 текст не воскресает', () => {
    saveNoTokensDraft(12, 'мой вопрос');
    clearNoTokensDraft(12);
    expect(peekNoTokensDraft(12)).toBeNull();
  });

  it('пустой текст не сохраняем', () => {
    saveNoTokensDraft(12, '   ');
    expect(peekNoTokensDraft(12)).toBeNull();
  });

  it('без sessionStorage (SSR/приватный режим) — молчаливый no-op', () => {
    delete (globalThis as any).sessionStorage;
    expect(() => saveNoTokensDraft(12, 'текст')).not.toThrow();
    expect(peekNoTokensDraft(12)).toBeNull();
    expect(() => clearNoTokensDraft(12)).not.toThrow();
  });
});


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
