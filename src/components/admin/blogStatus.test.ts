import { describe, it, expect } from 'vitest';
import {
  statusLabel,
  statusTone,
  isQueue,
  isArchive,
  canTransition,
  isTerminal,
  normalizeSlotDays,
  isValidSlotHour,
  SLOT_DAYS,
} from './blogStatus';

describe('statusLabel', () => {
  it('переводит статусы на русский', () => {
    expect(statusLabel('pending_review')).toBe('На апруве');
    expect(statusLabel('published')).toBe('Опубликован');
  });

  it('неизвестный статус отдаёт сам себя, а не падает', () => {
    expect(statusLabel('что-то новое' as any)).toBe('что-то новое');
  });
});

describe('statusTone', () => {
  it('failed красный, published зелёный', () => {
    expect(statusTone('failed')).toContain('red');
    expect(statusTone('published')).toContain('green');
  });
});

describe('группировка', () => {
  it('очередь — всё, что ещё не вышло', () => {
    expect(isQueue('idea')).toBe(true);
    expect(isQueue('pending_review')).toBe(true);
    expect(isQueue('approved')).toBe(true);
    expect(isQueue('published')).toBe(false);
  });

  it('архив — опубликованное, отклонённое и сорвавшееся', () => {
    expect(isArchive('published')).toBe(true);
    expect(isArchive('rejected')).toBe(true);
    expect(isArchive('failed')).toBe(true);
    expect(isArchive('idea')).toBe(false);
  });
});

describe('доступные действия', () => {
  /**
   * Ровно тот разрыв, ради которого `isTerminal` существует отдельно от
   * `isQueue`: бэковый `list` кладёт сорвавшийся пост в очередь, а `isArchive`
   * относит его к архиву. Гасить кнопки по `isQueue` нельзя — пост залипнет.
   */
  it('сорвавшийся пост ещё можно переписать и выбросить, хотя он «в архиве»', () => {
    expect(isArchive('failed')).toBe(true);
    expect(isTerminal('failed')).toBe(false);
    expect(canTransition('failed', 'drafting')).toBe(true);
    expect(canTransition('failed', 'rejected')).toBe(true);
  });

  it('сорвавшийся пост нельзя одобрить в обход переписывания', () => {
    expect(canTransition('failed', 'approved')).toBe(false);
  });

  it('опубликованный и выброшенный — терминальные', () => {
    expect(isTerminal('published')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
  });

  it('незнакомый статус считается терминальным, а не всемогущим', () => {
    expect(isTerminal('что-то новое' as any)).toBe(true);
    expect(canTransition('что-то новое' as any, 'approved')).toBe(false);
  });

  it('апрув доступен только с апрува', () => {
    expect(canTransition('pending_review', 'approved')).toBe(true);
    expect(canTransition('idea', 'approved')).toBe(false);
    expect(canTransition('drafting', 'approved')).toBe(false);
  });
});

describe('дни слотов', () => {
  it('предлагает ровно семь дней в ISO-нумерации', () => {
    expect(SLOT_DAYS.map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('выкидывает день вне недели — иначе [99] доедет до базы', () => {
    expect(normalizeSlotDays([1, 99, 3])).toEqual([1, 3]);
    expect(normalizeSlotDays([0])).toEqual([]);
    expect(normalizeSlotDays([8])).toEqual([]);
  });

  it('выкидывает мусор вместо чисел', () => {
    expect(normalizeSlotDays(['', 'пн', null, undefined, NaN, 2.5])).toEqual([]);
    expect(normalizeSlotDays(null)).toEqual([]);
  });

  it('снимает дубли и сортирует', () => {
    expect(normalizeSlotDays([5, 1, 5, 3])).toEqual([1, 3, 5]);
  });

  it('строку с числом принимает: JSONB отдаёт дни и так', () => {
    expect(normalizeSlotDays(['1', '3'])).toEqual([1, 3]);
  });
});

describe('час слота', () => {
  it('принимает только целые 0…23', () => {
    expect(isValidSlotHour(0)).toBe(true);
    expect(isValidSlotHour(23)).toBe(true);
    expect(isValidSlotHour(24)).toBe(false);
    expect(isValidSlotHour(-1)).toBe(false);
    expect(isValidSlotHour(10.5)).toBe(false);
  });

  it('пустое поле — не полночь', () => {
    expect(isValidSlotHour('')).toBe(false);
    expect(isValidSlotHour(NaN)).toBe(false);
  });
});
