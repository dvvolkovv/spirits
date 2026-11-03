import { describe, expect, it } from 'vitest';
import { remainingText, slaState } from './sla';

const NOW = Date.parse('2026-11-03T12:00:00Z');

function ticket(firstResponseDueAt: string | null, firstOwnerReplyAt: string | null = null) {
  return {
    first_response_due_at: firstResponseDueAt,
    first_owner_reply_at: firstOwnerReplyAt,
  };
}

describe('SLA первого ответа', () => {
  it('останавливается после первого ответа владельца', () => {
    expect(slaState(ticket('2026-11-03T10:00:00Z', '2026-11-03T11:00:00Z'), NOW)).toBe('answered');
  });

  it('не считается просроченным без дедлайна', () => {
    expect(slaState(ticket(null), NOW)).toBe('normal');
  });

  it('закрывает SLA у решённого тикета даже без первого ответа', () => {
    expect(slaState({ ...ticket('2026-11-03T10:00:00Z'), status: 'resolved' }, NOW)).toBe('closed');
  });

  it('помечает прошедший дедлайн просроченным', () => {
    expect(slaState(ticket('2026-11-03T11:59:59Z'), NOW)).toBe('overdue');
  });

  it('считает дедлайн ровно через 30 минут ближайшим', () => {
    expect(slaState(ticket('2026-11-03T12:30:00Z'), NOW)).toBe('soon');
  });

  it('считает дедлайн позже 30 минут обычным', () => {
    expect(slaState(ticket('2026-11-03T12:30:01Z'), NOW)).toBe('normal');
  });
});

describe('оставшееся до первого ответа время', () => {
  it('показывает прочерк без дедлайна', () => {
    expect(remainingText(null, NOW)).toBe('—');
  });

  it('округляет минуты вверх', () => {
    expect(remainingText('2026-11-03T12:10:01Z', NOW)).toBe('11 мин');
  });

  it('показывает просрочку со знаком минус', () => {
    expect(remainingText('2026-11-03T10:55:00Z', NOW)).toBe('−65 мин');
  });

  it('раскладывает часы и минуты', () => {
    expect(remainingText('2026-11-03T14:05:00Z', NOW)).toBe('2 ч 5 мин');
  });
});
