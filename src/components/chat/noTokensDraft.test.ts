import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as noTokensDraft from './noTokensDraft';

describe('isNoTokensEnd', () => {
  it('только end с reason no_tokens — остановка по балансу', () => {
    expect(noTokensDraft.isNoTokensEnd({ type: 'end', reason: 'no_tokens' })).toBe(true);
    expect(noTokensDraft.isNoTokensEnd({ type: 'end' })).toBe(false);
    expect(noTokensDraft.isNoTokensEnd({ type: 'end', reason: 'preempted' })).toBe(false);
  });

  it('item и ping не принимает за сигнал остановки', () => {
    expect(noTokensDraft.isNoTokensEnd({ type: 'item', reason: 'no_tokens' })).toBe(false);
    expect(noTokensDraft.isNoTokensEnd({ type: 'ping', reason: 'no_tokens' })).toBe(false);
  });

  it('null, undefined и пустое событие не роняют разбор', () => {
    expect(noTokensDraft.isNoTokensEnd(null)).toBe(false);
    expect(noTokensDraft.isNoTokensEnd(undefined)).toBe(false);
    expect(noTokensDraft.isNoTokensEnd({})).toBe(false);
  });
});

describe('restoreIntoInput', () => {
  it('в пустое поле возвращает отклонённый текст', () => {
    expect(noTokensDraft.restoreIntoInput('', 'отклонённый вопрос')).toBe('отклонённый вопрос');
    expect(noTokensDraft.restoreIntoInput('   ', 'отклонённый вопрос')).toBe('отклонённый вопрос');
  });

  it('сохраняет новый набор и добавляет отклонённый текст через пустую строку', () => {
    const restored = noTokensDraft.restoreIntoInput('уже пишу новое', 'отклонённый вопрос');
    expect(restored).toBe('уже пишу новое\n\nотклонённый вопрос');
    expect(restored.match(/отклонённый вопрос/g)).toHaveLength(1);
  });

  it('пустой отклонённый текст не меняет поле и не добавляет разделители', () => {
    expect(noTokensDraft.restoreIntoInput('новый набор', '   ')).toBe('новый набор');
    expect(noTokensDraft.restoreIntoInput('', '')).toBe('');
  });
});

describe('applyNoTokensOutcome', () => {
  it('возвращает отклонённый текст и для поля, и для общего черновика', () => {
    expect(noTokensDraft.applyNoTokensOutcome({ rejectedText: 'не отправилось', queuedText: '' })).toEqual({
      input: 'не отправилось',
      draftText: 'не отправилось',
    });
    expect(noTokensDraft.applyNoTokensOutcome({ rejectedText: 'не отправилось', queuedText: '   ' })).toEqual({
      input: 'не отправилось',
      draftText: 'не отправилось',
    });
  });

  it('не теряет сообщение из очереди', () => {
    expect(noTokensDraft.applyNoTokensOutcome({ rejectedText: 'первый', queuedText: 'второй из очереди' })).toEqual({
      input: 'первый\n\nвторой из очереди',
      draftText: 'первый\n\nвторой из очереди',
    });
  });

  it('обрезает пробелы по краям сообщения из очереди', () => {
    expect(noTokensDraft.applyNoTokensOutcome({ rejectedText: 'первый', queuedText: '  второе  ' })).toEqual({
      input: 'первый\n\nвторое',
      draftText: 'первый\n\nвторое',
    });
  });
});

describe('collapseNoTokensStop', () => {
  const rejected = { id: 'rejected', type: 'user' as const, content: 'не отправилось' };
  const newStop = { id: 'stop-new', type: 'assistant' as const, content: 'Нужно пополнить баланс', noTokensStop: true };

  it('удаляет rejected и прежний stop, который оказался в конце', () => {
    const previousStop = { id: 'stop-old', type: 'assistant' as const, content: 'Старое предложение', noTokensStop: true };
    expect(noTokensDraft.collapseNoTokensStop([previousStop, rejected], rejected.id, newStop)).toEqual([newStop]);
  });

  it('заменяет прежний stop даже без rejected', () => {
    const previousStop = { id: 'stop-old', type: 'assistant' as const, content: 'Старое предложение', noTokensStop: true };
    expect(noTokensDraft.collapseNoTokensStop([previousStop], '', newStop)).toEqual([newStop]);
  });

  it('обычный успешный ответ в конце сохраняет', () => {
    const success = { id: 'success', type: 'assistant' as const, content: 'Готово' };
    expect(noTokensDraft.collapseNoTokensStop([rejected, success], rejected.id, newStop)).toEqual([success, newStop]);
  });

  it('работает с синтетическими сообщениями без id', () => {
    const previousStop = { type: 'assistant' as const, content: 'Старый stop', noTokensStop: true };
    const syntheticStop = { type: 'assistant' as const, content: 'Новый stop', noTokensStop: true };
    expect(noTokensDraft.collapseNoTokensStop([previousStop, rejected], rejected.id, syntheticStop)).toEqual([syntheticStop]);
  });
});

/** Временная совместимость до миграции ChatInterface на чистые helpers. */
describe('legacy restoreDraftText', () => {
  it('пустое поле — возвращает отправленный текст', () => {
    expect(noTokensDraft.restoreDraftText('', 'мой вопрос')).toBe('мой вопрос');
    expect(noTokensDraft.restoreDraftText('   ', 'мой вопрос')).toBe('мой вопрос');
  });

  it('непустое поле — сохраняет текущий набор', () => {
    expect(noTokensDraft.restoreDraftText('уже пишу новое', 'мой вопрос')).toBe('уже пишу новое');
  });
});

/** Минимальный sessionStorage для node-окружения vitest. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
}

describe('legacy no_tokens sessionStorage', () => {
  const real = (globalThis as any).sessionStorage;
  beforeEach(() => { (globalThis as any).sessionStorage = new MemoryStorage(); });
  afterEach(() => { (globalThis as any).sessionStorage = real; });

  it('сохранённый текст читается для того же ассистента', () => {
    noTokensDraft.saveNoTokensDraft(12, 'мой вопрос');
    expect(noTokensDraft.peekNoTokensDraft(12)).toBe('мой вопрос');
  });

  it('чужой ассистент свой черновик не видит', () => {
    noTokensDraft.saveNoTokensDraft(12, 'мой вопрос');
    expect(noTokensDraft.peekNoTokensDraft(10)).toBeNull();
  });

  it('после явной отправки копия стёрта', () => {
    noTokensDraft.saveNoTokensDraft(12, 'мой вопрос');
    noTokensDraft.clearNoTokensDraft(12);
    expect(noTokensDraft.peekNoTokensDraft(12)).toBeNull();
  });

  it('пустой текст не сохраняется', () => {
    noTokensDraft.saveNoTokensDraft(12, '   ');
    expect(noTokensDraft.peekNoTokensDraft(12)).toBeNull();
  });

  it('без sessionStorage — молчаливый no-op', () => {
    delete (globalThis as any).sessionStorage;
    expect(() => noTokensDraft.saveNoTokensDraft(12, 'текст')).not.toThrow();
    expect(noTokensDraft.peekNoTokensDraft(12)).toBeNull();
    expect(() => noTokensDraft.clearNoTokensDraft(12)).not.toThrow();
  });
});
