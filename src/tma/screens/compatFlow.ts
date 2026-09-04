import { postStream } from '../api';

/**
 * Разбор совместимости, отделённый от экрана.
 *
 * Формат ответа отличается от поиска: там объекты-находки, здесь построчный
 * поток кусков текста `{type:'item', content}`, который надо склеить. Общий
 * postStream читает и то, и другое — разница только в сборке.
 */

/** Куски приходят по мере генерации: текст растёт на глазах. */
export function appendChunk(acc: string, raw: any): string {
  if (!raw || typeof raw !== 'object') return acc;
  // Служебные типы потока ('begin', 'end' и прочие) пропускаем: они несут
  // разметку хода, а не текст разбора.
  if (raw.type !== 'item' || typeof raw.content !== 'string') return acc;
  return acc + raw.content;
}

/**
 * Идентификатор человека в том виде, в каком его ждёт ручка совместимости.
 *
 * Она принимает цифры телефона. Но userId у нас не всегда телефон: при входе
 * через почту или OAuth это UUID, и цифры из него — мусор. Такого человека
 * в разбор не отдаём вовсе: лучше честно сказать, что сравнить не с кем, чем
 * прислать ручке бессмыслицу и получить уверенный ответ ни о ком.
 */
export function toCompatId(userId: string): string | null {
  const raw = String(userId || '').trim();
  // Смотрим на ИСХОДНУЮ строку, а не на результат вычистки: из обрывка UUID
  // `6ae81490-ee75-4df1` вычищается ровно десять цифр, и проверка по одной
  // длине его пропускала. В телефоне букв не бывает — этого достаточно.
  if (!/^[+\d][\d\s()-]*$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/**
 * Запустить разбор совместимости с одним человеком.
 *
 * @param onText зовётся на каждый прирост текста — экран показывает разбор
 *   по мере генерации, а не после.
 * @returns false, если собеседник не годится для сравнения (см. toCompatId).
 */
export async function runCompat(
  otherUserId: string,
  onText: (text: string) => void,
): Promise<boolean> {
  const id = toCompatId(otherUserId);
  if (!id) return false;
  let acc = '';
  await postStream('/webhook/analyze-compatibility', { users: [id] }, (raw) => {
    const next = appendChunk(acc, raw);
    if (next !== acc) {
      acc = next;
      onText(acc);
    }
  });
  return true;
}
