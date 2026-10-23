import { formatDate } from '../utils/formatters';

/**
 * Сводка расхода по месяцам — GET /webhook/tokens/spending. Общая часть для
 * веба (окно оплаты, /tokens) и кошелька мини-аппа.
 *
 * Ключ категории приходит строкой: бэк может добавить новую раньше, чем
 * обновится фронт, — тогда она подписывается как «Прочее».
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

export function categoryLabelKey(key: string): string {
  return LABEL_KEYS[key] ?? LABEL_KEYS.other;
}

const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function parseSpending(raw: unknown): SpendingMonth[] {
  const months = (raw as { months?: unknown } | null)?.months;
  if (!Array.isArray(months)) return [];
  return months
    .filter((m: any) => typeof m?.month === 'string' && MONTH_RE.test(m.month))
    .map((m: any) => ({
      month: m.month as string,
      total: Number(m.total) || 0,
      categories: (Array.isArray(m.categories) ? m.categories : [])
        .map((c: any) => ({
          key: String(c?.key ?? 'other'),
          tokens: Number(c?.tokens) || 0,
          count: Number(c?.count) || 0,
        }))
        .filter((c: SpendingCategory) => c.tokens > 0),
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
