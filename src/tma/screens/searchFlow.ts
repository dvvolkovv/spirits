import { postStream } from '../api';

/**
 * Логика поиска людей, отделённая от экрана.
 *
 * Так устроены и остальные экраны мини-аппа: разбор ответа и состояния живут
 * рядом, но проверяются без React. Здесь это особенно уместно — выдача идёт
 * потоком, и склейка результатов заслуживает собственных тестов.
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
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
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

/**
 * Запустить поиск, отдавая находки по мере прихода.
 *
 * @param onMatch зовётся на каждую распознанную находку — экран дорисовывает
 *   список, не дожидаясь конца.
 */
export async function runSearch(
  query: string,
  onMatch: (m: SearchMatch) => void,
): Promise<void> {
  const q = query.trim();
  // Пустой запрос до сервера не доводим: ответ был бы мусорным, а минута
  // ожидания — настоящей.
  if (!q) return;
  await postStream('/webhook/search-mate', { query: q }, (raw) => {
    const m = toMatch(raw);
    if (m) onMatch(m);
  });
}
