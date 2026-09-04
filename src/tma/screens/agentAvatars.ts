import { getBlob } from '../api';

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
 * Загрузить фото для списка ассистентов.
 *
 * Ошибка по одному не отменяет остальных: у части ассистентов фото может не
 * быть вовсе, и это нормальное состояние, а не сбой — карточка покажет
 * инициалы.
 *
 * @returns соответствие id → объектный URL, только для успешно загруженных.
 */
export async function loadAgentAvatars(ids: number[]): Promise<Record<number, string>> {
  const pairs = await Promise.all(
    ids.map(async (id) => {
      try {
        const blob = await getBlob(`${PATH}/${id}`);
        return blob ? ([id, URL.createObjectURL(blob)] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  const out: Record<number, string> = {};
  for (const p of pairs) if (p) out[p[0]] = p[1];
  return out;
}

/** Отозвать объектные URL. Зовётся при уходе с экрана. */
export function releaseAvatars(urls: Record<number, string>): void {
  for (const url of Object.values(urls)) {
    try { URL.revokeObjectURL(url); } catch { /* уже отозван — не беда */ }
  }
}
