import { postStream } from '../api';
import { appendChunk } from './compatFlow';

/**
 * Логика поиска людей, отделённая от экрана.
 *
 * Так устроены и остальные экраны мини-аппа: разбор ответа и состояния живут
 * рядом, но проверяются без React. Здесь это особенно уместно — выдача идёт
 * потоком, и склейка результатов заслуживает собственных тестов.
 *
 * Формат ответа (spirits_back, MiscService.searchMate) — построчный поток
 * кусков текста `{type:'item', content}`. Склеенный текст: сначала проза для
 * человека, затем маркер `search_result:` и JSON-массив карточек; карточки
 * приходят в самом конце. До 12.10.2026 здесь ждали в потоке готовые
 * объекты-находки, каких сервер не шлёт, и выдача всегда была пустой.
 */

export interface SearchMatch {
  /** Идентификатор пользователя у нас. */
  userId: string;
  name: string;
  /** Почему подошёл — текст от модели, показывается под именем. */
  reason?: string;
  avatarUrl?: string;
}

/**
 * Сервер шлёт разнородные объекты: служебные отметки о ходе работы и сами
 * находки. Берём только то, у кого есть идентификатор и имя — остальное
 * пропускаем молча, чтобы смена формата служебных полей не ломала выдачу.
 */
export function toMatch(raw: any): SearchMatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const userId = raw.userId ?? raw.user_id ?? raw.id;
  const name = raw.name ?? raw.displayName ?? raw.display_name;
  if (!userId || !name) return null;
  return {
    userId: String(userId),
    name: String(name),
    // Бэк называет причину matchReason; reason — запасное имя.
    reason: typeof raw.matchReason === 'string' ? raw.matchReason
      : typeof raw.reason === 'string' ? raw.reason : undefined,
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : undefined,
  };
}

/**
 * Дописать находку к уже показанным.
 *
 * Дубли отсекаются по идентификатору: одного и того же человека сервер может
 * прислать дважды — например, уточнив причину. Побеждает последняя версия,
 * место в списке сохраняется, чтобы выдача не прыгала под пальцем.
 */
export function mergeMatch(list: SearchMatch[], next: SearchMatch): SearchMatch[] {
  const at = list.findIndex((m) => m.userId === next.userId);
  if (at < 0) return [...list, next];
  const copy = list.slice();
  copy[at] = next;
  return copy;
}

const MARKER = 'search_result:';

/**
 * Карточки из склеенного текста ответа, в порядке выдачи.
 *
 * @returns null, если выдачи в ответе нет вовсе: так сервер отвечает на сбой
 *   («Ошибка при обработке запроса.»), а это не то же, что «никого не нашлось».
 */
export function parseSearchResult(text: string): SearchMatch[] | null {
  const at = text.indexOf(MARKER);
  if (at < 0) return null;
  const tail = text.slice(at + MARKER.length);
  const start = tail.indexOf('[');
  const end = tail.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  let list: unknown;
  try {
    list = JSON.parse(tail.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  return list.map(toMatch).filter((m): m is SearchMatch => m !== null);
}

/**
 * Запустить поиск.
 *
 * @param onMatch зовётся на каждую находку по порядку. Карточки приходят в
 *   самом конце ответа, после прозы, поэтому все вызовы — в конце.
 * @throws если в ответе нет выдачи: экран покажет сбой, а не пустой список.
 */
export async function runSearch(
  query: string,
  onMatch: (m: SearchMatch) => void,
): Promise<void> {
  const q = query.trim();
  // Пустой запрос до сервера не доводим: ответ был бы мусорным, а минута
  // ожидания — настоящей.
  if (!q) return;
  let text = '';
  await postStream('/webhook/search-mate', { query: q }, (raw) => {
    text = appendChunk(text, raw);
  });
  const matches = parseSearchResult(text);
  if (!matches) throw new Error('search-mate: в ответе нет выдачи');
  for (const m of matches) onMatch(m);
}
