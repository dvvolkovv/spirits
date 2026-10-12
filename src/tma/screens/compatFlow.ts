import { postStream } from '../api';

/**
 * Разбор совместимости, отделённый от экрана.
 *
 * Ответ — построчный поток кусков текста `{type:'item', content}`, который
 * надо склеить. Так же отвечает и поиск, только у него в конце текста ещё
 * JSON карточек (см. searchFlow.ts).
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
 * Она принимает суррогатный id профиля или цифры телефона. Поиск отдаёт
 * именно суррогатный id (`ai_profiles_consolidated.id`): телефонов в выдаче
 * нет намеренно. Ручка узнаёт такой id по длине — короче 10 цифр — и сама
 * находит телефон. UUID (вход через почту или OAuth) не годится ни так, ни
 * так: цифры из него — мусор. Такого человека в разбор не отдаём вовсе: лучше
 * честно сказать, что сравнить не с кем, чем прислать ручке бессмыслицу и
 * получить уверенный ответ ни о ком.
 */
export function toCompatId(userId: string): string | null {
  const raw = String(userId || '').trim();
  if (/^[1-9]\d{0,8}$/.test(raw)) return raw;
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
