// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { peekPendingAssistant, rememberPendingAssistant, takePendingAssistant } from './pendingAssistant';

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

describe('ассистент, выбранный до входа', () => {
  beforeEach(() => localStorage.clear());

  it('запомненное отдаётся один раз', () => {
    rememberPendingAssistant('14', NOW);
    expect(takePendingAssistant(NOW + 1000)).toBe('14');
    expect(takePendingAssistant(NOW + 2000)).toBeNull();
  });

  it('подсмотреть — не значит забрать', () => {
    rememberPendingAssistant('14', NOW);
    expect(peekPendingAssistant(NOW)).toBe('14');
    expect(takePendingAssistant(NOW)).toBe('14');
  });

  // Через неделю это уже не намерение, а сюрприз: зашёл — открылась Райя.
  it('через час забывается', () => {
    rememberPendingAssistant('14', NOW);
    expect(peekPendingAssistant(NOW + HOUR + 1)).toBeNull();
    expect(localStorage.getItem('pending_assistant')).toBeNull();
  });

  it('пустое и мусор не запоминаются', () => {
    rememberPendingAssistant(null, NOW);
    rememberPendingAssistant('   ', NOW);
    rememberPendingAssistant('x'.repeat(65), NOW);
    expect(peekPendingAssistant(NOW)).toBeNull();
  });

  it('битая запись не роняет', () => {
    localStorage.setItem('pending_assistant', '{oops');
    expect(takePendingAssistant(NOW)).toBeNull();
  });
});
