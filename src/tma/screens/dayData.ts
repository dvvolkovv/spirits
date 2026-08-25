/**
 * Логика экрана «День» (Task 13), вынесенная из JSX ради тестов без
 * рендера React-дерева. Три источника, три независимых состояния — падение
 * одного не гасит остальные (см. loadDay: каждый ключ ловит свою ошибку
 * отдельно, а не общим try/catch на весь Promise.all).
 *
 * Расхождения с планом, найденные в реальном бэке:
 *
 * 1. GET /webhook/app-widget/content — это НЕ «фокус дня» в буквальном
 *    смысле; это контент нативного домашнего виджета (app-widget.controller.
 *    ts): последний ассистент + строка контекста + `energyLine`, который
 *    заполнен, ТОЛЬКО если у пользователя включена ежедневная
 *    энерго-рутина (`hasEnergy`). Полей `focus`/`text` в ответе нет вообще.
 *    Ближайший по смыслу к «фокусу дня» — energyLine (сам бэк называет это
 *    «энергия дня» в комментариях), гейт по hasEnergy — так же, как
 *    календарь гейтится по connected: у большинства это будет 'off', и
 *    секция скрывается, а не показывает пустоту.
 *
 * 2. Календарных «ближайших событий» отдать НЕЧЕМ: POST /webhook/calendar/
 *    events — это createEvent (создание, тело ProposedEvent с обязательным
 *    title/datetime), а не список. Метод calendar.service.ts, который
 *    реально умеет отдавать события (listEvents/listEventsLocalRange), не
 *    подключён ни к одному GET-роуту в calendar.controller.ts. Дёрнуть
 *    POST .../events пустым телом — значит либо получить ошибку валидации,
 *    либо (в худшем случае, если бэк когда-нибудь станет терпимее к
 *    пустым полям) реально создать мусорное событие в календаре
 *    пользователя. Ни то ни другое не годится.
 *
 *    Раз читать нечем, блок событий различает только то, что РЕАЛЬНО можно
 *    узнать через GET /webhook/calendar/status: подключён календарь или
 *    нет. Не подключён → приглашение подключить (как и было в плане). Уже
 *    подключён → отдельное честное состояние 'unavailable' («список пока
 *    недоступен»), а не пустой список (это была бы неправда: события могут
 *    быть, мы их просто не можем показать) и не бесконечный спиннер.
 *
 * 3. GET /webhook/user/tasks — голый массив (без обёртки `{tasks:[...]}`),
 *    поля `{id, title, status, summary, last_active_at}` (tasks.service.ts
 *    listForUser). Тут ЛЮБОЙ статус, не только активные — сортировка
 *    active-первыми, но archived/done тоже приходят. «Активные задачи»
 *    требуют фильтра по status==='active' на фронте, иначе список дня
 *    зарастёт архивным и закрытым.
 */
export interface TaskRow {
  id: string;
  title: string;
  status: 'active' | 'archived' | 'done';
}

/** null — ещё грузится, 'off' — источника нет или он выключен для пользователя. */
export type Block<T> = T | null | 'off';

/** Отдельный тип для событий: 'unavailable' — календарь подключён, но список читать нечем (см. п.2 выше). */
export type EventsBlock = 'off' | 'unavailable' | null;

export interface DayDeps {
  getWidgetContent: () => Promise<unknown>;
  getCalendarStatus: () => Promise<unknown>;
  getUserTasks: () => Promise<unknown>;
}

export function parseFocus(raw: unknown): Block<string> {
  const r = raw as any;
  if (r?.hasEnergy && typeof r.energyLine === 'string' && r.energyLine) return r.energyLine;
  return 'off';
}

export function parseEvents(status: unknown): EventsBlock {
  return (status as any)?.connected ? 'unavailable' : 'off';
}

export function parseTasks(raw: unknown): Block<TaskRow[]> {
  if (!Array.isArray(raw)) return 'off';
  return raw.filter((t: any) => t?.status === 'active');
}

export async function loadDay(deps: DayDeps): Promise<{ focus: Block<string>; events: EventsBlock; tasks: Block<TaskRow[]> }> {
  const [focus, events, tasks] = await Promise.all([
    deps.getWidgetContent().then(parseFocus).catch(() => 'off' as const),
    deps.getCalendarStatus().then(parseEvents).catch(() => 'off' as const),
    deps.getUserTasks().then(parseTasks).catch(() => 'off' as const),
  ]);
  return { focus, events, tasks };
}
