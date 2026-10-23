import { formatDate } from '../utils/formatters';

/**
 * Сводка расхода по месяцам — GET /webhook/tokens/spending. Общая часть для
 * веба (окно оплаты, /tokens) и кошелька мини-аппа.
 *
 * Ключ категории приходит строкой: бэк может добавить новую раньше, чем
 * обновится фронт, — тогда она подписывается как «Прочее», а при разборе
 * сразу сливается с существующей «other» того же месяца.
 */
export interface SpendingCategory {
  key: string;
  tokens: number;
  count: number;
}

export interface SpendingMonth {
  /** 'YYYY-MM' в поясе пользователя. */
  month: string;
  total: number;
  categories: SpendingCategory[];
}

const LABEL_KEYS: Record<string, string> = {
  replies: 'payment.spending.cat.replies',
  calls: 'payment.spending.cat.calls',
  images: 'payment.spending.cat.images',
  video: 'payment.spending.cat.video',
  voice: 'payment.spending.cat.voice',
  tg_bots: 'payment.spending.cat.tg_bots',
  products: 'payment.spending.cat.products',
  other: 'payment.spending.cat.other',
};

/**
 * `LABEL_KEYS[key]` и `key in LABEL_KEYS` оба попадаются на ключах
 * Object.prototype («toString», «constructor» и т. п.) — hasOwnProperty
 * единственный надёжный способ отличить настоящую категорию от свойства
 * прототипа.
 */
function isKnownCategoryKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(LABEL_KEYS, key);
}

export function categoryLabelKey(key: string): string {
  return isKnownCategoryKey(key) ? LABEL_KEYS[key] : LABEL_KEYS.other;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function toCategory(raw: unknown): SpendingCategory {
  const c = (raw ?? {}) as Record<string, unknown>;
  const rawKey = String(c.key ?? 'other');
  return {
    key: isKnownCategoryKey(rawKey) ? rawKey : 'other',
    tokens: Number(c.tokens) || 0,
    count: Number(c.count) || 0,
  };
}

/**
 * Категории с нулевым расходом выбрасываются. Незнакомый ключ (бэк завёл
 * категорию раньше фронта) сливается с «other» того же месяца — tokens и
 * count складываются, а не теряются. Итог — по убыванию tokens, при
 * равенстве — по алфавиту ключа.
 */
function mergeCategories(rawCategories: unknown[]): SpendingCategory[] {
  const merged = new Map<string, SpendingCategory>();
  for (const raw of rawCategories) {
    const c = toCategory(raw);
    if (c.tokens <= 0) continue;
    const existing = merged.get(c.key);
    if (existing) {
      existing.tokens += c.tokens;
      existing.count += c.count;
    } else {
      merged.set(c.key, { ...c });
    }
  }
  return Array.from(merged.values()).sort(
    (a, b) => b.tokens - a.tokens || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

export function parseSpending(raw: unknown): SpendingMonth[] {
  const months = (raw as { months?: unknown } | null)?.months;
  if (!Array.isArray(months)) return [];
  return months
    .filter((m): m is Record<string, unknown> => {
      const month = (m as Record<string, unknown> | null)?.month;
      return typeof month === 'string' && MONTH_RE.test(month);
    })
    .map((m) => ({
      month: m.month as string,
      total: Number(m.total) || 0,
      categories: mergeCategories(Array.isArray(m.categories) ? m.categories : []),
    }))
    .filter((m) => m.total > 0);
}

/**
 * «Октябрь 2026 г.» на языке интерфейса. timeZone: 'UTC' обязателен: дата
 * собрана в UTC, и без него к западу от Гринвича 1 октября 00:00 UTC — ещё
 * 30 сентября.
 */
export function monthLabel(month: string): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  const s = formatDate(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Адрес ручки с поясом браузера: границы месяцев бэк считает в нём. */
export function spendingUrl(): string {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    tz = '';
  }
  return tz ? `/webhook/tokens/spending?tz=${encodeURIComponent(tz)}` : '/webhook/tokens/spending';
}
