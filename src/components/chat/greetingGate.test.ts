// src/components/chat/greetingGate.test.ts
import { describe, it, expect } from 'vitest';
import { greetingStillWanted } from './greetingGate';

const idle = { queuedCount: 0, sending: false, sendSeqAtDecision: 3, sendSeqNow: 3 };

describe('greetingStillWanted', () => {
  it('пустой чат, человек ничего не делал — приветствуем', () => {
    expect(greetingStillWanted(idle)).toBe(true);
  });

  it('человек успел отправить своё — приветствие прервало бы его ход', () => {
    expect(greetingStillWanted({ ...idle, sendSeqNow: 4 })).toBe(false);
  });

  it('реплика ждёт в очереди — она и станет первым сообщением', () => {
    expect(greetingStillWanted({ ...idle, queuedCount: 1 })).toBe(false);
  });

  it('отправка в пути (идёт проверка удалённого хода) — не приветствуем', () => {
    expect(greetingStillWanted({ ...idle, sending: true })).toBe(false);
  });
});
