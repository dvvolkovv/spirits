import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toMatch, mergeMatch, runSearch, type SearchMatch } from './searchFlow';
import * as api from '../api';

beforeEach(() => vi.restoreAllMocks());

/**
 * Поток search-mate в том виде, в каком его пишет бэк (spirits_back,
 * MiscService.searchMate): проза кусками item-событий, затем «\n\nsearch_result:»
 * и JSON-массив карточек кусками по 200 символов.
 */
function backendStream(prose: string, cards: object[]): any[] {
  const events: any[] = [];
  for (let i = 0; i < prose.length; i += 7) events.push({ type: 'item', content: prose.slice(i, i + 7) });
  const tail = `\n\nsearch_result:${JSON.stringify(cards)}`;
  for (let i = 0; i < tail.length; i += 200) events.push({ type: 'item', content: tail.slice(i, i + 200) });
  return events;
}

/** Карточка ровно с теми полями, что отдаёт бэк. */
const card = (userId: number | null, name: string, matchReason: string) => ({
  userId, name, values: [], intents: [], interests: ['коучинг и обучение'], skills: [], corellation: 0.43, matchReason,
});

function serverSends(events: any[]) {
  return vi.spyOn(api, 'postStream').mockImplementation(async (_u, _d, onChunk) => {
    for (const e of events) onChunk(e);
  });
}

describe('toMatch', () => {
  it('принимает обе формы полей — camelCase и snake_case', () => {
    // Бэкенд исторически отдаёт по-разному; экран не должен об этом знать.
    expect(toMatch({ user_id: 7, display_name: 'Мария' })).toEqual({
      userId: '7', name: 'Мария', reason: undefined, avatarUrl: undefined,
    });
    expect(toMatch({ userId: 7, name: 'Мария' })?.name).toBe('Мария');
  });

  it('причина берётся из matchReason — так её называет бэк', () => {
    expect(toMatch({ userId: 1741, name: 'Коуч', matchReason: 'Учит людей.' })?.reason).toBe('Учит людей.');
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
  // До 12.10.2026 здесь кормили выдуманный поток из объектов-находок, и тесты
  // были зелёными, а в мини-аппе поиск не показал ни одной карточки: сервер
  // таких объектов не шлёт. Теперь поток — ровно как у бэка.
  it('карточки из настоящего потока: проза, затем search_result: и JSON кусками', async () => {
    serverSends(backendStream('Первый учит людей, второй консультирует.', [
      card(1741, 'Коуч', 'Учит людей.'),
      card(4246, 'Консультант-коуч', 'Консультирует.'),
    ]));
    const got: SearchMatch[] = [];
    await runSearch('коуч', (m) => got.push(m));
    expect(got).toEqual([
      { userId: '1741', name: 'Коуч', reason: 'Учит людей.', avatarUrl: undefined },
      { userId: '4246', name: 'Консультант-коуч', reason: 'Консультирует.', avatarUrl: undefined },
    ]);
  });

  it('маркер search_result: на стыке кусков', async () => {
    serverSends([
      { type: 'item', content: 'Ведёт тренинги.\n\nsearch_res' },
      { type: 'item', content: 'ult:[{"userId":55,"name":"Тренер","matchReason":"Ведёт тренинги."}]' },
    ]);
    const got: SearchMatch[] = [];
    await runSearch('коуч', (m) => got.push(m));
    expect(got.map((m) => m.name)).toEqual(['Тренер']);
  });

  it('«никого не нашли» — пустая выдача, а не сбой', async () => {
    serverSends(backendStream('К сожалению, по вашему запросу не найдено подходящих людей.', []));
    const got: SearchMatch[] = [];
    await expect(runSearch('горы', (m) => got.push(m))).resolves.toBeUndefined();
    expect(got).toEqual([]);
  });

  it('ответ без выдачи — сбой: экран скажет правду, а не «никого не нашлось»', async () => {
    serverSends([{ type: 'item', content: 'Ошибка при обработке запроса.' }]);
    await expect(runSearch('коуч', () => {})).rejects.toThrow();
  });

  it('карточка без userId пропускается', async () => {
    serverSends(backendStream('Текст.', [card(null, 'Без профиля', 'нет id'), card(55, 'Тренер', 'Ведёт тренинги.')]));
    const got: SearchMatch[] = [];
    await runSearch('коуч', (m) => got.push(m));
    expect(got.map((m) => m.userId)).toEqual(['55']);
  });

  it('пустой запрос до сервера не доходит', async () => {
    // Ответ был бы мусорным, а минута ожидания — настоящей.
    const spy = vi.spyOn(api, 'postStream').mockResolvedValue(undefined);
    await runSearch('   ', () => {});
    expect(spy).not.toHaveBeenCalled();
  });

  it('запрос уходит очищенным от лишних пробелов', async () => {
    const spy = serverSends(backendStream('Текст.', []));
    await runSearch('  горы  ', () => {});
    expect(spy).toHaveBeenCalledWith('/webhook/search-mate', { query: 'горы' }, expect.any(Function));
  });
});
