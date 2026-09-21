export type BlogStatus =
  | 'idea' | 'drafting' | 'pending_review' | 'approved'
  | 'publishing' | 'published' | 'rejected' | 'failed';

const LABELS: Record<BlogStatus, string> = {
  idea: 'Тема',
  drafting: 'Пишется',
  pending_review: 'На апруве',
  approved: 'Запланирован',
  publishing: 'Публикуется',
  published: 'Опубликован',
  rejected: 'В мусоре',
  failed: 'Сорвался',
};

const TONES: Record<BlogStatus, string> = {
  idea: 'bg-gray-100 text-gray-700',
  drafting: 'bg-blue-100 text-blue-700',
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-forest-100 text-forest-700',
  publishing: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  rejected: 'bg-gray-100 text-gray-500',
  failed: 'bg-red-100 text-red-700',
};

export function statusLabel(status: BlogStatus): string {
  return LABELS[status] ?? String(status);
}

export function statusTone(status: BlogStatus): string {
  return TONES[status] ?? 'bg-gray-100 text-gray-700';
}

const ARCHIVE: BlogStatus[] = ['published', 'rejected', 'failed'];

export function isArchive(status: BlogStatus): boolean {
  return ARCHIVE.includes(status);
}

export function isQueue(status: BlogStatus): boolean {
  return !isArchive(status);
}

/**
 * Копия машины состояний бэка (`src/blog/blog.types.ts`). Источник правды там:
 * здесь она нужна только чтобы не рисовать кнопку, которая заведомо вернёт 409.
 *
 * Отдельно от `isQueue`/`isArchive`: те делят посты по «вышел / не вышел» и
 * ставят `failed` рядом с архивом, а бэковый `list` отдаёт сорвавшийся пост
 * именно в очередь — его надо чинить, а не хоронить. Если гасить кнопки по
 * `isQueue`, у `failed` не останется ни «Переписать заново», ни «В мусор»,
 * хотя бэк оба перехода разрешает, и пост залипнет в очереди навсегда.
 */
export const ALLOWED_TRANSITIONS: Record<BlogStatus, BlogStatus[]> = {
  idea: ['drafting', 'rejected'],
  drafting: ['drafting', 'pending_review', 'failed'],
  pending_review: ['approved', 'drafting', 'rejected'],
  approved: ['publishing', 'drafting', 'rejected'],
  publishing: ['published', 'approved', 'failed'],
  published: [],
  rejected: [],
  failed: ['drafting', 'rejected'],
};

export function canTransition(from: BlogStatus, to: BlogStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Пост, из которого уже никуда не уйти. Незнакомый статус считается
 * терминальным намеренно: лучше не показать кнопку, чем предложить действие,
 * про которое фронт ничего не знает.
 */
export function isTerminal(status: BlogStatus): boolean {
  return (ALLOWED_TRANSITIONS[status] ?? []).length === 0;
}

/** Дни слотов — ISO-нумерация: 1 = понедельник … 7 = воскресенье. */
export const SLOT_DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' },
];

/**
 * Бэк `slotDays` не валидирует — кладёт массив в JSONB как есть, и `[99]`
 * всплывает только на апруве поста, когда `nextSlotAfter` не находит слот за
 * две недели вперёд. Пустой список падает там же. Поэтому сюда приходит всё,
 * что пользователь мог накликать, а уходит — только осмысленное.
 */
export function normalizeSlotDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [];
  const valid = days
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  return [...new Set(valid)].sort((a, b) => a - b);
}

/**
 * Час слота по Москве: 0…23, целый. Всё остальное — не час.
 *
 * Пустая строка отсекается отдельной веткой: `Number('')` — это ноль, и без
 * неё стёртое поле ввода молча означало бы полночь.
 */
export function isValidSlotHour(hour: unknown): boolean {
  if (typeof hour === 'string' && hour.trim() === '') return false;
  const h = Number(hour);
  return Number.isInteger(h) && h >= 0 && h <= 23;
}
