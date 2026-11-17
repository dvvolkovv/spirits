/**
 * «Чистый лист» — точка отсчёта памяти ассистента (spec spirits_back
 * 2026-11-17-context-reset-design.md). Лента одна; бэк отдаёт точку с
 * историей (`contextResetAt`), а лента проводит по ней черту.
 */

export interface Timestamped {
  timestamp: Date | string;
}

/**
 * Точка для ленты. afterId — только у точки, поставленной в этой вкладке:
 * id последнего сообщения в момент нажатия (null — лента была пуста).
 * Сообщения вкладки до перезагрузки несут время клиента, а точку ставят
 * часы базы; опрос этого не исправит — selectNewPolledMessages не подменяет
 * локальное сообщение серверной копией.
 */
export interface ResetMark {
  at: Date;
  afterId?: string | null;
}

const validOrNull = (d: Date): Date | null => (Number.isFinite(d.getTime()) ? d : null);

const timeOf = (v: Date | string): number =>
  v instanceof Date ? v.getTime() : new Date(v).getTime();

/**
 * `contextResetAt` из ответа истории. undefined — поля нет (бэк до выката):
 * состояние не трогаем; null — бэк точки не дал (её нет или чтение не
 * удалось — mergePolledReset в обоих случаях держит прежнюю метку).
 *
 * Бэк шлёт ISO-строку. Число принимаем как миллисекунды — оно однозначно,
 * а `new Date(String(n))` прочёл бы его как год или не прочёл вовсе. Date
 * копируем по моменту: через строку он потерял бы миллисекунды. Всё прочее
 * (пустая строка, мусор, другие типы) — точки нет: массив из одной
 * ISO-строки через String() сошёл бы за дату, а такого ответа бэк не даёт.
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
 *
 * Метка из этой вкладки (afterId задан):
 * - якорь найден — сразу после него, что бы ни показывали часы клиента;
 * - afterId === null — лента была пуста при нажатии: всё в ней после точки,
 *   черты нет.
 * Якоря нет или он не найден (ленту перечитали, перегенерация срезала
 * хвост) — по времени:
 * - перед первым сообщением строго новее точки (ровно в момент точки —
 *   старше её);
 * - новых ещё нет — внизу;
 * - первое же сообщение новее точки — черты нет, даже если выше есть
 *   непрогруженные страницы: что старшие лежат там — допущение, черта
 *   встала бы наугад и прыгала бы при подгрузке. Появится на своём месте,
 *   когда подгрузится нужная страница.
 * Сообщение с битым временем новее не бывает (NaN > x — false): оно
 * остаётся над чертой. Точка с битым временем — черты нет.
 *
 * Лента считается упорядоченной по времени — ищем первое новое, а не все.
 * Это верно для серверного времени; смесь часов клиента и базы в своей
 * вкладке снимает якорь.
 */
export function resetDividerIndex(
  messages: Array<Timestamped & { id: string }>,
  mark: ResetMark | null,
): number | null {
  if (!mark || messages.length === 0) return null;
  const edge = mark.at.getTime();
  if (!Number.isFinite(edge)) return null;
  if (mark.afterId === null) return null;
  if (mark.afterId !== undefined) {
    const anchor = messages.findIndex((msg) => msg.id === mark.afterId);
    if (anchor !== -1) return anchor + 1;
  }
  const first = messages.findIndex((msg) => timeOf(msg.timestamp) > edge);
  if (first === -1) return messages.length;
  return first === 0 ? null : first;
}

/**
 * Точка из истории или опроса — только вперёд.
 * - null (сбой чтения на бэке) или undefined (старый бэк) — прежняя метка;
 * - та же или старшая точка — прежняя метка тем же объектом: та же сохраняет
 *   якорь, старшая — запоздалый ответ опроса; а раз объект тот же, опрос
 *   раз в 8 с не перерисовывает ленту;
 * - новая точка (с другого устройства) — без якоря: в этой вкладке её не
 *   ставили, и последнего сообщения в момент нажатия мы не знаем.
 * Битая дата — как отсутствие точки.
 */
export function mergePolledReset(
  prev: ResetMark | null,
  polled: Date | null | undefined,
): ResetMark | null {
  if (!polled) return prev;
  const at = polled.getTime();
  if (!Number.isFinite(at)) return prev;
  if (prev && at <= prev.at.getTime()) return prev;
  return { at: polled };
}
