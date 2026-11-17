/**
 * «Чистый лист» — точка отсчёта памяти ассистента (spec spirits_back
 * 2026-11-17-context-reset-design.md). Лента одна; бэк отдаёт точку с
 * историей (`contextResetAt`), а лента проводит по ней черту.
 */

export interface Timestamped {
  timestamp: Date | string;
}

const validOrNull = (d: Date): Date | null => (Number.isFinite(d.getTime()) ? d : null);

/**
 * `contextResetAt` из ответа истории. undefined — поля нет (бэк до выката):
 * состояние не трогаем; null — точки нет.
 *
 * Бэк шлёт ISO-строку. Число принимаем как миллисекунды — оно однозначно, а
 * `new Date(String(n))` прочёл бы его как год или не прочёл вовсе. Date копируем по моменту: через
 * строку он потерял бы миллисекунды. Всё прочее (пустая строка, мусор, другие
 * типы) — точки нет: массив из одной ISO-строки через String() сошёл бы за
 * дату, а такого ответа бэк не даёт.
 */
export function parseContextResetAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date) return validOrNull(new Date(value.getTime()));
  if (typeof value === 'number') return validOrNull(new Date(value));
  if (typeof value !== 'string' || value === '') return null;
  return validOrNull(new Date(value));
}

/**
 * Куда в ленту вставить черту: индекс сообщения, ПЕРЕД которым она стоит
 * (`messages.length` — внизу), или null — черты нет.
 * - перед первым сообщением новее точки;
 * - новых ещё нет — внизу;
 * - старше точки ничего не загружено: черта сверху, если есть ещё страницы,
 *   иначе её нет (над ней было бы пусто).
 *
 * «Новее» — строго: сообщение ровно в момент точки остаётся над чертой.
 * Сообщение с битым временем новее не бывает (NaN > x — false): оно остаётся
 * над чертой, а черта встаёт перед следующим новым или внизу.
 * Лента считается упорядоченной по времени — ищем первое новое, а не все.
 */
export function resetDividerIndex(
  messages: Timestamped[],
  resetAt: Date | null,
  hasMore: boolean,
): number | null {
  if (!resetAt || messages.length === 0) return null;
  const edge = resetAt.getTime();
  const first = messages.findIndex((msg) => new Date(msg.timestamp).getTime() > edge);
  if (first === -1) return messages.length;
  if (first === 0) return hasMore ? 0 : null;
  return first;
}

/** Опрос истории приносит точку каждые 8 с — без лишних перерисовок. */
export function sameResetAt(a: Date | null, b: Date | null): boolean {
  return (a ? a.getTime() : null) === (b ? b.getTime() : null);
}
