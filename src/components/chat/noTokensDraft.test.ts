import { describe, it, expect } from 'vitest';
import { isNoTokensEnd, restoreIntoInput } from './noTokensDraft';

describe('isNoTokensEnd', () => {
  it('true на событии end с reason no_tokens', () => {
    expect(isNoTokensEnd({ type: 'end', reason: 'no_tokens' })).toBe(true);
  });

  it('false на end без reason', () => {
    expect(isNoTokensEnd({ type: 'end' })).toBe(false);
  });

  it('false на end с другим reason (например preempted)', () => {
    expect(isNoTokensEnd({ type: 'end', reason: 'preempted' })).toBe(false);
  });

  it('false на другом типе события, даже если reason совпал', () => {
    expect(isNoTokensEnd({ type: 'item', reason: 'no_tokens' })).toBe(false);
  });

  it('false на null/undefined — разбор потока зовёт на каждой строке', () => {
    expect(isNoTokensEnd(null)).toBe(false);
    expect(isNoTokensEnd(undefined)).toBe(false);
  });
});

describe('restoreIntoInput', () => {
  it('пустое поле — просто отклонённый текст', () => {
    expect(restoreIntoInput('', 'привет')).toBe('привет');
  });

  it('поле из одних пробелов — тоже считается пустым', () => {
    expect(restoreIntoInput('   ', 'привет')).toBe('привет');
  });

  it('непустое поле — дописывает через пустую строку (как подстановка очереди)', () => {
    expect(restoreIntoInput('уже набрано', 'привет')).toBe('уже набрано\n\nпривет');
  });

  it('пустой rejected — поле не трогает', () => {
    expect(restoreIntoInput('уже набрано', '')).toBe('уже набрано');
  });

  it('rejected из одних пробелов — тоже не трогает поле', () => {
    expect(restoreIntoInput('уже набрано', '   ')).toBe('уже набрано');
  });

  it('оба пустые — результат пустая строка', () => {
    expect(restoreIntoInput('', '')).toBe('');
  });
});
