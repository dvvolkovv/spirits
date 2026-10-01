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

  // Дольше часа это уже не намерение: зашёл через неделю — а открылась Райя.
  it('через час забывается', () => {
    // Ровно в момент истечения запись уже просрочена (expires <= now).
    // Отдельный rememberPendingAssistant перед каждой проверкой — чтобы
    // первая проверка не стёрла запись до второй.
    rememberPendingAssistant('14', NOW);
    expect(peekPendingAssistant(NOW + HOUR)).toBeNull();

    rememberPendingAssistant('14', NOW);
    expect(peekPendingAssistant(NOW + HOUR + 1)).toBeNull();
    expect(localStorage.getItem('pending_assistant')).toBeNull();
  });

  it('значение обрезается по краям, 64 знака — ещё можно', () => {
    rememberPendingAssistant('  14  ', NOW);
    expect(takePendingAssistant(NOW)).toBe('14');

    rememberPendingAssistant('x'.repeat(64), NOW);
    expect(takePendingAssistant(NOW)).toBe('x'.repeat(64));
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
