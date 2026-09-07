import { getBlob as defaultGetBlob } from '../api';

/**
 * Фото ассистентов для экрана выбора.
 *
 * Ручка отдаёт байты картинки, а не ссылку, поэтому под каждое фото заводится
 * объектный URL. Их обязательно отзывать при уходе с экрана: в мини-аппе
 * человек листает вкладки туда-сюда, и утечка накапливается незаметно —
 * браузер держит блобы до перезагрузки страницы, а перезагружают её здесь
 * редко.
 */

const PATH = '/webhook/0cdacf32-7bfd-4888-b24f-3a6af3b5f99e/agent/avatar';

/**
 * Сколько фото тянем одновременно.
 *
 * Раньше запрашивались все сразу — восемнадцать параллельных запросов на
 * ~3,4 МБ через прокси. На телефоне это выглядело как «фото нет вовсе»:
 * часть не доезжала, и карточки оставались с инициалами (замер на проде
 * 07.09.2026; заодно ужаты и сами файлы — стало 1,1 МБ). Очередь по четыре
 * даёт верхним карточкам фото сразу, а не после того, как сеть переварит
 * нижние.
 */
export const AVATAR_CONCURRENCY = 4;

export interface AvatarDeps {
  getBlob: (url: string) => Promise<Blob | null>;
}

/**
 * Загрузить фото для списка ассистентов, по очереди и в порядке списка.
 *
 * Ошибка по одному не отменяет остальных: у части ассистентов фото может не
 * быть вовсе, и это нормальное состояние, а не сбой — карточка покажет
 * инициалы.
 *
 * @returns соответствие id → объектный URL, только для успешно загруженных.
 */
export async function loadAgentAvatars(
  ids: number[],
  deps: AvatarDeps = { getBlob: defaultGetBlob },
): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  let next = 0;

  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        const blob = await deps.getBlob(`${PATH}/${id}`);
        if (blob) out[id] = URL.createObjectURL(blob);
      } catch {
        /* нет фото — карточка покажет инициалы */
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(AVATAR_CONCURRENCY, ids.length) }, worker),
  );
  return out;
}

/** Отозвать объектные URL. Зовётся при уходе с экрана. */
export function releaseAvatars(urls: Record<number, string>): void {
  for (const url of Object.values(urls)) {
    try { URL.revokeObjectURL(url); } catch { /* уже отозван — не беда */ }
  }
}
