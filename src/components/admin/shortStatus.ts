import { formatSlotAt } from './blogSlotFormat';
import { realCaseChars } from './blogStatus';

/**
 * Ролики — экран «Ролики» вкладки «Блог» (спека spirits_back
 * docs/superpowers/specs/2026-10-30-admin-shorts-in-blog-design.md): типы
 * ответа `admin/shorts`, подписи, группы и правила кнопок.
 *
 * Правила — копия бэка (`src/shorts/shorts.types.ts`, `short-review.ts`,
 * `shorts.controller.ts`), как `blogStatus.ts` у постов: источник правды —
 * бэк, а здесь они нужны, только чтобы не рисовать кнопку, которая заведомо
 * получит 409.
 */

export type ShortStatus =
  | 'idea' | 'directing' | 'capture_queued' | 'capturing' | 'writing'
  | 'animate_queued' | 'animating' | 'render_queued' | 'rendering'
  | 'pending_review' | 'approved' | 'publishing' | 'published' | 'rejected' | 'failed';
export type ShortRubric = 'assistant' | 'feature' | 'news' | 'case';
export type ShortAngle = 'uncomfortable' | 'roast' | 'myth' | 'calm';
export type ShortFormat = 'skit' | 'chat';
export type ShortSource = 'catalog' | 'git' | 'manual';
export type ShortPlatform = 'telegram' | 'vk' | 'youtube';
export type PublicationStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'manual_pending' | 'manual_done';
export type YoutubeMode = 'manual' | 'unlisted' | 'public';

export interface ShortPublication {
  platform: ShortPlatform;
  status: PublicationStatus;
  url: string | null;
  lastError: string | null;
}

/** Ролик в списке (`list`): без съёмки, сценария, подписей и оживления. */
export interface ShortItem {
  id: string;
  rubric: ShortRubric;
  angle: ShortAngle;
  /** Подача задана заказом; нет — её поставит ритм недели при запуске. */
  angleLocked: boolean;
  source: ShortSource;
  topicKey: string;
  topicHint: string | null;
  title: string | null;
  assistantId: number | null;
  format: ShortFormat;
  scene: { assistantName?: string; question?: string } | null;
  status: ShortStatus;
  slotAt: string | null;
  approvedAt: string | null;
  failedFrom: ShortStatus | null;
  lastError: string | null;
  attempts: number;
  ownerNote: string | null;
  durationMs: number | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** `updated_at::text` из базы — ею админка подписывает решения. */
  version: string | null;
  publications: ShortPublication[];
}

/** Ролик целиком (`get`) — для раскрытой карточки. */
export interface ShortDetail extends ShortItem {
  capture: { answerText?: string } | null;
  script: { hook?: string; lines?: { id: string; scene: string; text: string }[] } | null;
  captions: { telegram?: string; youtube?: { title?: string } } | null;
  animation: { omniSeconds?: number } | null;
  videoUrl: string | null;
  coverUrl: string | null;
}

export interface ShortSettings {
  slotDays: number[];
  slotHourMsk: number;
  prepareLeadHours: number;
  minAnswerChars: number;
  tgChannelChatId: string | null;
  platforms: ShortPlatform[];
  narratorVoice: string;
  format: ShortFormat;
  maxOmniSeconds: number;
  youtubeMode: YoutubeMode;
}

export const RUBRICS: ShortRubric[] = ['assistant', 'feature', 'news', 'case'];
export const RUBRIC_TITLES: Record<ShortRubric, string> = {
  assistant: 'Ассистент за работой',
  feature: 'Возможность Linkeon',
  news: 'Новинка',
  case: 'Реальный кейс',
};
export const ANGLES: ShortAngle[] = ['uncomfortable', 'roast', 'myth', 'calm'];
export const ANGLE_TITLES: Record<ShortAngle, string> = {
  uncomfortable: 'Неудобный вопрос',
  roast: 'Разнос',
  myth: 'ИИ против мифа',
  calm: 'Как это работает',
};
export const FORMAT_TITLES: Record<ShortFormat, string> = { skit: 'сценки', chat: 'только чат' };
export const SOURCE_TITLES: Record<ShortSource, string> = { catalog: 'каталог', git: 'новость', manual: 'заказ' };
export const PLATFORM_TITLES: Record<ShortPlatform, string> = { telegram: 'Telegram', youtube: 'YouTube', vk: 'VK' };
export const YOUTUBE_MODE_TITLES: Record<YoutubeMode, string> = {
  manual: 'набор владельцу',
  unlisted: 'по ссылке',
  public: 'публично',
};

export const STATUS_TITLES: Record<ShortStatus, string> = {
  idea: 'Идея',
  directing: 'В работе',
  capture_queued: 'В работе',
  capturing: 'В работе',
  writing: 'В работе',
  animate_queued: 'В работе',
  animating: 'В работе',
  render_queued: 'В работе',
  rendering: 'В работе',
  pending_review: 'Ждёт решения',
  approved: 'Запланирован',
  publishing: 'Публикуется',
  published: 'Вышел',
  rejected: 'Отклонён',
  failed: 'Упал',
};

const WORKING_TONE = 'bg-blue-100 text-blue-700';
const STATUS_TONES: Record<ShortStatus, string> = {
  idea: 'bg-gray-100 text-gray-700',
  directing: WORKING_TONE,
  capture_queued: WORKING_TONE,
  capturing: WORKING_TONE,
  writing: WORKING_TONE,
  animate_queued: WORKING_TONE,
  animating: WORKING_TONE,
  render_queued: WORKING_TONE,
  rendering: WORKING_TONE,
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-forest-100 text-forest-700',
  publishing: WORKING_TONE,
  published: 'bg-green-100 text-green-700',
  rejected: 'bg-gray-100 text-gray-500',
  failed: 'bg-red-100 text-red-700',
};

export function statusTone(s: ShortStatus): string {
  return STATUS_TONES[s] ?? 'bg-gray-100 text-gray-700';
}

/** Этап словами — у ролика в работе и в «упал: …». */
export const STAGE_TITLES: Partial<Record<ShortStatus, string>> = {
  idea: 'идея',
  directing: 'режиссёр',
  capture_queued: 'съёмка в очереди',
  capturing: 'съёмка',
  writing: 'сценарий',
  animate_queued: 'оживление в очереди',
  animating: 'оживление',
  render_queued: 'сборка в очереди',
  rendering: 'сборка',
  publishing: 'публикация',
};

export type ShortsScreen = 'queue' | 'published' | 'rejected';
export type ShortGroup = 'review' | 'failed' | 'scheduled' | 'working' | 'ideas';

export const GROUP_ORDER: ShortGroup[] = ['review', 'failed', 'scheduled', 'working', 'ideas'];
export const GROUP_TITLES: Record<ShortGroup, string> = {
  review: 'Ждут решения',
  failed: 'Упали',
  scheduled: 'Запланированы',
  working: 'В работе',
  ideas: 'Идеи',
};

export function screenOf(s: ShortStatus): ShortsScreen {
  if (s === 'published') return 'published';
  if (s === 'rejected') return 'rejected';
  return 'queue';
}

/** Группа очереди; у вышедшего и отклонённого её нет — они в архиве. */
export function groupOf(s: ShortStatus): ShortGroup | null {
  if (s === 'pending_review') return 'review';
  if (s === 'failed') return 'failed';
  if (s === 'approved' || s === 'publishing') return 'scheduled';
  if (s === 'idea') return 'ideas';
  if (s === 'published' || s === 'rejected') return null;
  return 'working';
}

/** Момент для сортировки; нет даты — после всех (бесконечность). */
const time = (iso: string | null): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

/** По слоту; ролики без слота — после, между собой по времени создания. */
function bySlot(a: ShortItem, b: ShortItem): number {
  return time(a.slotAt) - time(b.slotAt) || time(a.createdAt) - time(b.createdAt);
}

/** Очередь по группам срочности; пустых групп нет. */
export function queueGroups(items: ShortItem[]): { group: ShortGroup; items: ShortItem[] }[] {
  return GROUP_ORDER
    .map((group) => ({ group, items: items.filter((i) => groupOf(i.status) === group).sort(bySlot) }))
    .filter((g) => g.items.length > 0);
}

/** Архив — новые сверху: по выходу, иначе по последнему изменению. */
export function archiveOf(items: ShortItem[], screen: 'published' | 'rejected'): ShortItem[] {
  const latest = (i: ShortItem) => {
    const t = Date.parse(i.publishedAt ?? i.updatedAt ?? i.createdAt ?? '');
    return Number.isNaN(t) ? 0 : t;
  };
  return items.filter((i) => screenOf(i.status) === screen).sort((a, b) => latest(b) - latest(a));
}

export function screenCounts(items: ShortItem[]): Record<ShortsScreen, number> {
  const out: Record<ShortsScreen, number> = { queue: 0, published: 0, rejected: 0 };
  for (const i of items) out[screenOf(i.status)] += 1;
  return out;
}

/** Как назвать ролик: название, иначе тема, иначе ключ темы. */
export function shortTitle(i: Pick<ShortItem, 'title' | 'topicHint' | 'topicKey'>): string {
  return i.title?.trim() || i.topicHint?.trim() || i.topicKey;
}

/** Что сказать о ролике в свёрнутой строке. Даты — той же фразой, что у постов и в Telegram. */
export function statusLine(i: ShortItem, now: Date): string {
  const slot = i.slotAt ? formatSlotAt(i.slotAt, now) : null;
  switch (i.status) {
    case 'pending_review':
      return slot ? `под слот ${slot}` : 'ждёт решения';
    case 'approved':
      return slot ? `выйдет ${slot}` : 'одобрен, слот не назначен';
    case 'publishing':
      return 'отправляется на площадки';
    case 'failed': {
      const stage = i.failedFrom ? STAGE_TITLES[i.failedFrom] ?? i.failedFrom : null;
      return stage ? `упал: ${stage}` : 'упал';
    }
    case 'idea':
      return `идея · ${SOURCE_TITLES[i.source] ?? i.source}`;
    case 'published':
      return i.publishedAt ? `вышел ${formatSlotAt(i.publishedAt, now)}` : 'вышел';
    case 'rejected':
      return 'отклонён';
    default: {
      const stage = STAGE_TITLES[i.status] ?? i.status;
      return slot ? `${stage} · под слот ${slot}` : stage;
    }
  }
}

export function publicationLabel(p: ShortPublication): string {
  switch (p.status) {
    case 'published':
      return 'вышел';
    case 'manual_pending':
      return 'набор отправлен';
    case 'manual_done':
      return 'ссылка записана';
    case 'publishing':
      return 'отправляется';
    case 'failed':
      return 'упал';
    default:
      return 'ждёт';
  }
}

/** Вышел хоть на одной площадке: пост в канале есть или набор YouTube ушёл владельцу (RELEASED_SQL бэка). */
const RELEASED: PublicationStatus[] = ['published', 'manual_pending', 'manual_done'];

export function isReleased(i: Pick<ShortItem, 'publications'>): boolean {
  return i.publications.some((p) => RELEASED.includes(p.status));
}

/** Пределы заказа и замечания — копия бэка (MIN/MAX_ORDER_CHARS, MAX_OWNER_NOTE_CHARS). */
export const MIN_ORDER_CHARS = 10;
export const MAX_ORDER_CHARS = 4000;
export const MAX_NOTE_CHARS = 2000;

/** Длина заказа так, как её меряет бэк: символы без пробелов по краям (тот же подсчёт, что у истории кейса блога). */
export function orderChars(text: string): number {
  return realCaseChars(text);
}

export function noteChars(text: string): number {
  return Array.from(text.trim()).length;
}
