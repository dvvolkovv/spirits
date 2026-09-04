import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appendChunk, toCompatId, runCompat } from './compatFlow';
import * as api from '../api';

beforeEach(() => vi.restoreAllMocks());

describe('appendChunk', () => {
  it('склеивает куски текста по порядку', () => {
    let acc = '';
    acc = appendChunk(acc, { type: 'item', content: 'Вы оба ' });
    acc = appendChunk(acc, { type: 'item', content: 'любите горы' });
    expect(acc).toBe('Вы оба любите горы');
  });

  it('служебные типы потока не попадают в текст', () => {
    // 'begin' и 'end' несут разметку хода, а не разбор.
    expect(appendChunk('текст', { type: 'begin' })).toBe('текст');
    expect(appendChunk('текст', { type: 'item' })).toBe('текст');
    expect(appendChunk('текст', null)).toBe('текст');
  });
});

describe('toCompatId', () => {
  it('телефон приводится к цифрам', () => {
    expect(toCompatId('+7 (903) 016-91-87')).toBe('79030169187');
  });

  it('UUID не годится для сравнения', () => {
    // userId при входе через почту или OAuth — UUID, и цифры из него мусор.
    // Лучше честно отказать, чем прислать ручке бессмыслицу.
    expect(toCompatId('6ae81490-ee75-4df1-9738-73f33493ce7e')).toBeNull();
    // Обрывок UUID даёт ровно десять цифр — проверка по одной длине его
    // пропускала. Поймано тестом, а не на живом разборе.
    expect(toCompatId('6ae81490-ee75-4df1')).toBeNull();
    expect(toCompatId('')).toBeNull();
  });
});

describe('runCompat', () => {
  it('отдаёт текст по мере генерации', async () => {
    vi.spyOn(api, 'postStream').mockImplementation(async (_u, _d, onChunk) => {
      onChunk({ type: 'begin' });
      onChunk({ type: 'item', content: 'Вы оба ' });
      onChunk({ type: 'item', content: 'любите горы' });
    });
    const seen: string[] = [];
    const ok = await runCompat('79030169187', (t) => seen.push(t));
    expect(ok).toBe(true);
    // Экран получает растущий текст, а не только итог.
    expect(seen).toEqual(['Вы оба ', 'Вы оба любите горы']);
  });

  it('негодный собеседник — отказ без запроса', async () => {
    const spy = vi.spyOn(api, 'postStream').mockResolvedValue(undefined);
    expect(await runCompat('6ae81490-ee75-4df1', () => {})).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('телефон уходит очищенным от разделителей', async () => {
    const spy = vi.spyOn(api, 'postStream').mockResolvedValue(undefined);
    await runCompat('+7 903 016-91-87', () => {});
    expect(spy).toHaveBeenCalledWith(
      '/webhook/analyze-compatibility', { users: ['79030169187'] }, expect.any(Function),
    );
  });
});
