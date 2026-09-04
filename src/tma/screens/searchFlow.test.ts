import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toMatch, mergeMatch, runSearch } from './searchFlow';
import * as api from '../api';

beforeEach(() => vi.restoreAllMocks());

describe('toMatch', () => {
  it('принимает обе формы полей — camelCase и snake_case', () => {
    // Бэкенд исторически отдаёт по-разному; экран не должен об этом знать.
    expect(toMatch({ user_id: 7, display_name: 'Мария' })).toEqual({
      userId: '7', name: 'Мария', reason: undefined, avatarUrl: undefined,
    });
    expect(toMatch({ userId: 7, name: 'Мария' })?.name).toBe('Мария');
  });

  it('служебные объекты потока пропускаются', () => {
    // Сервер шлёт отметки о ходе работы вперемешку с находками. Смена их
    // формата не должна ломать выдачу.
    expect(toMatch({ status: 'searching' })).toBeNull();
    expect(toMatch({ userId: 7 })).toBeNull();
    expect(toMatch(null)).toBeNull();
    expect(toMatch('строка')).toBeNull();
  });
});

describe('mergeMatch', () => {
  const a = { userId: '1', name: 'Аня' };
  const b = { userId: '2', name: 'Борис' };

  it('новая находка дописывается в конец', () => {
    expect(mergeMatch([a], b)).toEqual([a, b]);
  });

  it('повтор обновляет запись, не сдвигая её', () => {
    // Одного человека сервер может прислать дважды, уточнив причину. Если
    // дописывать в конец, список прыгает под пальцем во время чтения.
    const updated = { userId: '1', name: 'Аня', reason: 'общие интересы' };
    expect(mergeMatch([a, b], updated)).toEqual([updated, b]);
  });
});

describe('runSearch', () => {
  it('отдаёт находки по мере прихода и пропускает служебное', async () => {
    vi.spyOn(api, 'postStream').mockImplementation(async (_u, _d, onChunk) => {
      onChunk({ status: 'searching' });
      onChunk({ userId: 1, name: 'Аня' });
      onChunk({ userId: 2, name: 'Борис', reason: 'оба про горы' });
    });
    const got: any[] = [];
    await runSearch('кто увлекается горами', (m) => got.push(m));
    expect(got.map((m) => m.name)).toEqual(['Аня', 'Борис']);
    expect(got[1].reason).toBe('оба про горы');
  });

  it('пустой запрос до сервера не доходит', async () => {
    // Ответ был бы мусорным, а минута ожидания — настоящей.
    const spy = vi.spyOn(api, 'postStream').mockResolvedValue(undefined);
    await runSearch('   ', () => {});
    expect(spy).not.toHaveBeenCalled();
  });

  it('запрос уходит очищенным от лишних пробелов', async () => {
    const spy = vi.spyOn(api, 'postStream').mockResolvedValue(undefined);
    await runSearch('  горы  ', () => {});
    expect(spy).toHaveBeenCalledWith('/webhook/search-mate', { query: 'горы' }, expect.any(Function));
  });
});
