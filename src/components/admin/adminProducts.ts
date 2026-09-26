/**
 * Раздел «Сайты и боты»: типы контракта, фильтры ↔ адрес страницы ↔ запрос,
 * подписи и форматирование.
 *
 * Отдельный модуль, а не экспорт из компонента: из файла с компонентом нельзя
 * экспортировать ещё и функции — ломается hot reload (правило
 * react-refresh/only-export-components), да и тесту не нужен весь React.
 *
 * Админка русская по решению из спеки — подписи здесь литералами, без t().
 */

// ── Контракт ────────────────────────────────────────────────────────────────
// GET /webhook/admin/products и GET /webhook/admin/products/:id. Бэкенд
// пишется параллельно; всё, что здесь помечено `| null`, экран обязан
// переживать молча, а незнакомый статус — показывать как есть.

export type AdminProductKind = 'site' | 'bot';

export interface AdminCustomDomain {
  /** punycode — как в DNS и в сертификате. */
  domain: string;
  /** Для глаз человека (`кофе.рф`). */
  domainUnicode: string;
  status: string;
}

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  kind: AdminProductKind;
  status: string;
  /** Адрес на платформе; у бота null. */
  domain: string | null;
  customDomain: AdminCustomDomain | null;
  owner: { userId: string; name: string | null; email: string | null };
  host: { id: string; publicIp: string | null } | null;
  createdAt: string;
  archivedAt: string | null;
  paidUntil: string | null;
  runnerSeenAt: string | null;
  sleepReason: string | null;
  blockReason: string | null;
  provisionError: string | null;
  lastTurnAt: string | null;
  lastActivityAt: string | null;
  turnsInPeriod: number;
  tokensInPeriod: number;
}

export interface AdminProductsResponse {
  periodDays: number;
  products: AdminProductRow[];
}

export interface AdminProductDomain {
  domain: string;
  domainUnicode: string;
  names: string[];
  status: string;
  error: string | null;
  errorReason: string | null;
  checkedAt: string | null;
}

export interface AdminProductTurn {
  id: string;
  channel: 'web' | 'telegram';
  status: string;
  prompt: string;
  result: string | null;
  tokensSpent: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AdminProductJob {
  id: string;
  kind: string;
  status: string;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AdminProductDetail {
  /**
   * За сколько дней посчитаны turnsInPeriod и tokensInPeriod карточки. Ручка
   * принимает ?periodDays= и называет свой период в ответе; по нему — и
   * подпись «за N дней». null — поля в ответе нет (бэкенд до этой правки):
   * тогда число не выдумывается.
   */
  periodDays: number | null;
  product: AdminProductRow;
  domain: AdminProductDomain | null;
  turns: AdminProductTurn[];
  jobs: AdminProductJob[];
}

/**
 * Адрес карточки. Период — всегда явный, тот же, что у списка: иначе правки
 * и токены в карточке считались бы за другой срок, чем в строке таблицы.
 */
export const detailUrl = (id: string, periodDays: number): string =>
  `/webhook/admin/products/${encodeURIComponent(id)}?periodDays=${periodDays}`;

/** «день / дня / дней» — у админки один язык, русский. */
function days(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

/** «за 30 дней»; неизвестный период — «за период», без выдуманного числа. */
export const periodLabel = (n: number | null): string => (n ? `за ${n} ${days(n)}` : 'за период');

/**
 * Карточка в том виде, который экран переживёт при любом ответе: списки —
 * всегда массивы, домен — объект или null. `null` — ответ вообще не похож на
 * карточку (нет `product`): так выглядит, например, 200 с HTML от SPA-фолбэка.
 */
export function normalizeDetail(body: unknown): AdminProductDetail | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!b.product || typeof b.product !== 'object') return null;
  const period = typeof b.periodDays === 'number' ? b.periodDays : Number.NaN;
  return {
    periodDays: Number.isInteger(period) && period > 0 ? period : null,
    product: b.product as AdminProductRow,
    domain: b.domain && typeof b.domain === 'object' ? (b.domain as AdminProductDomain) : null,
    turns: Array.isArray(b.turns) ? (b.turns as AdminProductTurn[]) : [],
    jobs: Array.isArray(b.jobs) ? (b.jobs as AdminProductJob[]) : [],
  };
}

// ── Фильтры ─────────────────────────────────────────────────────────────────

export type KindFilter = 'all' | AdminProductKind;

export interface ProductFilters {
  q: string;
  statuses: string[];
  kind: KindFilter;
  periodDays: number;
  includeTest: boolean;
  includeArchived: boolean;
}

export const PERIODS = [7, 30, 90];
export const DEFAULT_PERIOD = 30;
/** Пауза после последнего нажатия, после которой поиск уходит в адрес и в запрос. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Тестовые аккаунты и архивные по умолчанию СКРЫТЫ: раздел про живых
 * пользователей, а прогоны владельца с тестовых номеров заслонили бы их.
 */
export const DEFAULT_FILTERS: ProductFilters = {
  q: '',
  statuses: [],
  kind: 'all',
  periodDays: DEFAULT_PERIOD,
  includeTest: false,
  includeArchived: false,
};

/**
 * Параметры в адресе страницы. Короче, чем в запросе к бэкенду: адрес читает
 * человек, и им делятся. В адрес пишется только то, что отличается от
 * значения по умолчанию, — «чистый» раздел это просто ?tab=products.
 */
export const PARAM = {
  q: 'q',
  status: 'status',
  kind: 'kind',
  period: 'period',
  test: 'test',
  archived: 'archived',
  product: 'product',
} as const;

/** Словарь статусов продукта (002_provisioning.sql, 004_rent.sql, 007_selfservice.sql) в порядке показа. */
const STATUS_ORDER = ['provisioning', 'running', 'degraded', 'sleeping', 'blocked', 'failed', 'stopped', 'archived'];

/** Кнопки фильтра, которые есть всегда; прочие статусы добавляются по данным. */
export const BASE_STATUSES = ['provisioning', 'running', 'degraded', 'sleeping', 'blocked', 'failed'];

/** Статус из адреса — чужой ввод: пускаем только то, что похоже на код статуса. */
const STATUS_SHAPE = /^[a-z0-9_-]{1,40}$/;

/** Без повторов, известные — в порядке словаря, незнакомые — по алфавиту после них. */
export function orderStatuses(list: string[]): string[] {
  const unique = Array.from(new Set(list));
  const known = STATUS_ORDER.filter((s) => unique.includes(s));
  const other = unique.filter((s) => !STATUS_ORDER.includes(s)).sort();
  return [...known, ...other];
}

export function readFilters(params: URLSearchParams): ProductFilters {
  const kind = params.get(PARAM.kind);
  const period = Number(params.get(PARAM.period));
  return {
    q: params.get(PARAM.q) ?? '',
    statuses: orderStatuses(
      (params.get(PARAM.status) ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => STATUS_SHAPE.test(s)),
    ),
    kind: kind === 'site' || kind === 'bot' ? kind : 'all',
    periodDays: PERIODS.includes(period) ? period : DEFAULT_PERIOD,
    includeTest: params.get(PARAM.test) === '1',
    includeArchived: params.get(PARAM.archived) === '1',
  };
}

/**
 * Новый адрес: фильтры из текущего, поверх — правка. Чужие параметры
 * (?tab, ?product, ?sub соседних разделов) не трогаются.
 */
export function withFilters(params: URLSearchParams, patch: Partial<ProductFilters>): URLSearchParams {
  const f = { ...readFilters(params), ...patch };
  const next = new URLSearchParams(params);
  const put = (key: string, value: string | null) => {
    if (value === null) next.delete(key);
    else next.set(key, value);
  };
  const statuses = orderStatuses(f.statuses);
  put(PARAM.q, f.q.trim() || null);
  put(PARAM.status, statuses.length ? statuses.join(',') : null);
  put(PARAM.kind, f.kind === 'all' ? null : f.kind);
  put(PARAM.period, f.periodDays === DEFAULT_PERIOD ? null : String(f.periodDays));
  put(PARAM.test, f.includeTest ? '1' : null);
  put(PARAM.archived, f.includeArchived ? '1' : null);
  return next;
}

/** Открытая карточка — `?product=<id>`: ссылкой на неё можно поделиться. */
export function withProduct(params: URLSearchParams, id: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (id) next.set(PARAM.product, id);
  else next.delete(PARAM.product);
  return next;
}

/**
 * Строка запроса к GET /webhook/admin/products.
 *
 * Несколько статусов — через запятую (`status=running,blocked`). Флаги — `=1`
 * и только когда включены, как у /webhook/admin/calls: отсутствие значит
 * «выключено».
 */
export function listQuery(f: ProductFilters): string {
  const parts: string[] = [];
  const q = f.q.trim();
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  const statuses = orderStatuses(f.statuses);
  if (statuses.length) parts.push(`status=${statuses.map(encodeURIComponent).join(',')}`);
  if (f.kind !== 'all') parts.push(`kind=${f.kind}`);
  parts.push(`periodDays=${f.periodDays}`);
  if (f.includeTest) parts.push('includeTest=1');
  if (f.includeArchived) parts.push('includeArchived=1');
  return parts.join('&');
}

/** Кнопки статусов: основные всегда, плюс увиденные в данных и выбранные (иначе фильтр действовал бы невидимо). */
export function statusChips(seen: string[], selected: string[]): string[] {
  return orderStatuses([...BASE_STATUSES, ...seen, ...selected]);
}

/** Статус строки как есть; пустой — отдельным словом, а не пустой кнопкой. */
export const rowStatus = (r: { status?: unknown }): string =>
  typeof r.status === 'string' && r.status ? r.status : 'unknown';

export function countByStatus(rows: Array<{ status?: unknown }>): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const s = rowStatus(r);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return orderStatuses(Array.from(counts.keys())).map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

// ── Подписи ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  provisioning: 'Заводится',
  running: 'Работает',
  degraded: 'Нет связи',
  sleeping: 'Спит',
  blocked: 'Погашен',
  failed: 'Не завёлся',
  stopped: 'Остановлен',
  archived: 'В архиве',
  unknown: 'Без статуса',
};

/** Незнакомый статус показывается кодом: новый статус бэкенда виден без правки фронта. */
export const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s;

export function statusTone(s: string): string {
  switch (s) {
    case 'running':
      return 'bg-green-100 text-green-700';
    case 'degraded':
      return 'bg-amber-100 text-amber-800';
    case 'provisioning':
      return 'bg-blue-100 text-blue-700';
    case 'sleeping':
      return 'bg-gray-200 text-gray-700';
    case 'blocked':
    case 'failed':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export const kindLabel = (k: string): string => (k === 'site' ? 'Сайт' : k === 'bot' ? 'Бот' : k || '—');

/** Словарь домена — domains.service.ts на бэкенде; подписи как в кабинете владельца. */
const DOMAIN_STATUS_LABEL: Record<string, string> = {
  awaiting_dns: 'Ждём DNS',
  issuing: 'Выпускаем сертификат',
  active: 'Работает',
  failed: 'Не получилось',
  removing: 'Отвязываем',
};

export const domainStatusLabel = (s: string): string => DOMAIN_STATUS_LABEL[s] ?? s;

export function domainStatusTone(s: string): string {
  switch (s) {
    case 'active':
      return 'bg-green-100 text-green-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'awaiting_dns':
    case 'issuing':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

/** Статусы правок (product_turns) и заданий (product_provision_jobs) — один словарь. */
const WORK_STATUS_LABEL: Record<string, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  done: 'Готово',
  failed: 'Не выполнено',
  reverted: 'Откачено',
};

export const workStatusLabel = (s: string): string => WORK_STATUS_LABEL[s] ?? s;

export function workStatusTone(s: string): string {
  switch (s) {
    case 'done':
      return 'bg-green-100 text-green-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'running':
      return 'bg-blue-100 text-blue-700';
    case 'queued':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

/** Виды заданий машины продуктов (CHECK в 007_selfservice.sql + domain из 008). */
const JOB_KIND_LABEL: Record<string, string> = {
  provision: 'Заведение',
  sleep: 'Гашение',
  wake: 'Пробуждение',
  domain: 'Домен',
};

export const jobKindLabel = (k: string): string => JOB_KIND_LABEL[k] ?? k;

// ── Действия ────────────────────────────────────────────────────────────────

/**
 * Какая кнопка у карточки. Погашенный — только «Снять блок», остальные —
 * только «Погасить». Архивный — никакой: BlockService отказывает архивному и
 * в гашении, и в снятии (409), кнопка вела бы только к отказу.
 */
export function availableAction(p: { status: string; archivedAt: string | null }): 'block' | 'unblock' | null {
  if (p.archivedAt || p.status === 'archived') return null;
  return p.status === 'blocked' ? 'unblock' : 'block';
}

const count = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const field = (body: unknown, key: string): unknown =>
  body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;

/**
 * Строка результата гашения — из BlockResult (`slug`, `wasStatus`,
 * `killedTurns`, `killedJobs`). Оборванные правки называются всегда, даже
 * нулём: это единственный способ узнать, что гашение убило чужую идущую
 * правку. Пустые задания — шум, про них молчим.
 */
export function describeBlock(body: unknown): string {
  const slug = field(body, 'slug');
  const was = field(body, 'wasStatus');
  let head = typeof slug === 'string' && slug ? `Погашен «${slug}»` : 'Продукт погашен';
  if (typeof was === 'string' && was) head += ` (до гашения — ${statusLabel(was).toLowerCase()})`;
  const parts = [head];
  const turns = count(field(body, 'killedTurns'));
  if (turns !== null) parts.push(`оборвано правок: ${turns}`);
  const jobs = count(field(body, 'killedJobs'));
  if (jobs) parts.push(`снято заданий: ${jobs}`);
  return parts.join('; ');
}

/**
 * Строка результата снятия — из UnblockResult (`slug`, `killedJobs`). Сервер
 * возвращает продукт в сон и ставит пробуждение: в работу его переводит уже
 * агент, когда раннер выйдет на связь.
 */
export function describeUnblock(body: unknown): string {
  const slug = field(body, 'slug');
  const parts = [
    `${typeof slug === 'string' && slug ? `Блокировка снята с «${slug}»` : 'Блокировка снята'} — поставлено пробуждение`,
  ];
  const jobs = count(field(body, 'killedJobs'));
  if (jobs) parts.push(`снято заданий: ${jobs}`);
  return parts.join('; ');
}

/** Текст отказа для обрыва связи: у него нет ни кода, ни тела. */
export const NETWORK_ERROR = 'Нет связи с сервером — проверьте соединение и повторите.';

/**
 * Причина отказа словами сервера: Nest кладёт её в `message` — строкой или,
 * у ValidationPipe, массивом строк. Тело может не быть JSON вовсе (502 от
 * nginx приходит HTML-страницей) — тогда честнее назвать код, чем выдумать
 * причину.
 */
export async function problemText(res: { status: number; json: () => Promise<unknown> }): Promise<string> {
  try {
    const m = field(await res.json(), 'message');
    const text = Array.isArray(m)
      ? m.filter((x): x is string => typeof x === 'string').join('; ')
      : typeof m === 'string'
        ? m
        : '';
    if (text.trim()) return text.trim();
  } catch {
    // Не JSON — ниже код ответа.
  }
  return `Ошибка сервера (HTTP ${res.status})`;
}

// ── Время и числа ───────────────────────────────────────────────────────────

const parse = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(iso: string | null | undefined): string {
  const t = parse(iso);
  if (t === null) return '—';
  const d = new Date(t);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  const t = parse(iso);
  if (t === null) return '—';
  const d = new Date(t);
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** «5 мин назад»; старше месяца — датой. Будущее (часы сервера впереди) — «только что». */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  const t = parse(iso);
  if (t === null) return '—';
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} дн назад`;
  return formatDate(iso);
}

/** Просрочено — только настоящая дата в прошлом; пустое и мусор — не просрочка. */
export function isPast(iso: string | null | undefined, now: number = Date.now()): boolean {
  const t = parse(iso);
  return t !== null && t < now;
}

/** Свёрнутый текст правки: одна строка, не длиннее `max` знаков. */
export function preview(text: string | null | undefined, max = 80): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
