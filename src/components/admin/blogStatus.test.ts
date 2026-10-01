import { describe, it, expect, vi } from 'vitest';
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
  rubricLabel,
  REAL_CASE_MAX_CHARS,
  realCaseChars,
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

describe('rubricLabel', () => {
  it('реальный кейс подписан словами — код источника наружу не торчит', () => {
    expect(rubricLabel({ rubric: 'case', source: 'real' })).toBe('Реальный кейс');
  });

  it('остальные — как раньше: рубрика и источник', () => {
    expect(rubricLabel({ rubric: 'case', source: 'stats' })).toBe('Кейс · stats');
    expect(rubricLabel({ rubric: 'news', source: 'git' })).toBe('Новинка · git');
  });
});

describe('REAL_CASE_MAX_CHARS и realCaseChars', () => {
  it('предел — 4000, копия бэка (blog-real-case.ts): меняется только вместе с ним', () => {
    expect(REAL_CASE_MAX_CHARS).toBe(4000);
  });

  // Бэк считает символы, а не UTF-16, и обрезает пробелы по краям — счётчик в
  // форме обязан считать так же, иначе кнопка пускала бы то, что бэк отклонит.
  it('считает символы без пробелов по краям, эмодзи — за один', () => {
    expect(realCaseChars('  абв\n')).toBe(3);
    expect(realCaseChars('😀')).toBe(1);
  });

  // Наивный .length погасил бы кнопку на допустимой истории с эмодзи на пределе.
  it('эмодзи на пределе — ровно предел, а не больше', () => {
    expect(realCaseChars('а'.repeat(REAL_CASE_MAX_CHARS - 1) + '😀')).toBe(REAL_CASE_MAX_CHARS);
  });

  // Как на бэке: вставленный целиком документ не считается посимвольно на
  // каждое нажатие — сверх двух пределов в UTF-16 он заведомо длиннее предела.
  it('заведомо длинный текст — больше предела без посимвольного подсчёта', () => {
    const spy = vi.spyOn(Array, 'from');
    try {
      expect(realCaseChars('а'.repeat(REAL_CASE_MAX_CHARS * 3))).toBeGreaterThan(REAL_CASE_MAX_CHARS);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
