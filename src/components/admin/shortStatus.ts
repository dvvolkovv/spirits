import { formatSlotAt } from './blogSlotFormat';
import { normalizeSlotDays } from './blogStatus';

/**
 * Ролики — экран «Ролики» вкладки «Блог» (спека spirits_back
 * docs/superpowers/specs/2026-10-30-admin-shorts-in-blog-design.md): типы
 * ответа `admin/shorts`, подписи, группы и правила кнопок, запросы решений
 * с подтверждениями, итоговые тексты и черновик формы настроек.
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

export const RUBRICS: readonly ShortRubric[] = ['assistant', 'feature', 'news', 'case'];
export const RUBRIC_TITLES: Record<ShortRubric, string> = {
  assistant: 'Ассистент за работой',
  feature: 'Возможность Linkeon',
  news: 'Новинка',
  case: 'Реальный кейс',
};
export const ANGLES: readonly ShortAngle[] = ['uncomfortable', 'roast', 'myth', 'calm'];
export const ANGLE_TITLES: Record<ShortAngle, string> = {
  uncomfortable: 'Неудобный вопрос',
  roast: 'Разнос',
  myth: 'ИИ против мифа',
  calm: 'Как это работает',
};
export const FORMAT_TITLES: Record<ShortFormat, string> = { skit: 'сценки', chat: 'только чат' };
export const SOURCE_TITLES: Record<ShortSource, string> = {
  catalog: 'из каталога',
  git: 'новость из git',
  manual: 'заказ владельца',
};
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

export const GROUP_ORDER: readonly ShortGroup[] = ['review', 'failed', 'scheduled', 'working', 'ideas'];
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
  const at = i.slotAt ? Date.parse(i.slotAt) : NaN;
  const slot = i.slotAt ? formatSlotAt(i.slotAt, now) : null;
  // Слот до одобрения не сдвигается: прошедший — не «под слот», а повод одобрить в ближайший свободный.
  const past = !Number.isNaN(at) && at <= now.getTime();
  switch (i.status) {
    case 'pending_review':
      if (!slot) return 'ждёт решения';
      return past ? `слот ${slot} прошёл — одобрение займёт ближайший свободный` : `под слот ${slot}`;
    case 'approved':
      if (!slot) return 'одобрен, слот не назначен';
      // «Опубликовать сейчас» и повтор публикации ставят слот «сейчас»: публикатор берёт ролик на ближайшем тике.
      return past ? 'уходит на площадки в ближайшие минуты' : `выйдет ${slot}`;
    case 'publishing':
      return 'отправляется на площадки';
    case 'failed': {
      // Упал YouTube после вышедшего поста — как в сообщении бота.
      if (i.failedFrom === 'publishing' && isReleased(i)) return 'вышел не на все площадки';
      const stage = i.failedFrom ? STAGE_TITLES[i.failedFrom] ?? i.failedFrom : null;
      return stage ? `упал: ${stage}` : 'упал';
    }
    case 'idea':
      return SOURCE_TITLES[i.source] ?? i.source;
    case 'published':
      return i.publishedAt ? `вышел ${formatSlotAt(i.publishedAt, now)}` : 'вышел';
    case 'rejected':
      return 'отклонён';
    default: {
      const stage = STAGE_TITLES[i.status] ?? i.status;
      if (!slot) return stage;
      return past ? `${stage} · слот ${slot} прошёл` : `${stage} · под слот ${slot}`;
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

/** Длина заказа так, как её меряет бэк: символы без пробелов по краям. Сверх двух пределов в UTF-16 текст заведомо длиннее и в символах — без Array.from на каждое нажатие. */
export function orderChars(text: string): number {
  const s = text.trim();
  return s.length > 2 * MAX_ORDER_CHARS ? s.length : Array.from(s).length;
}

export function noteChars(text: string): number {
  return Array.from(text.trim()).length;
}

export type ShortAction =
  | 'approve' | 'note' | 'redo' | 'reject' | 'publish_now'
  | 'retry' | 'retry_directing' | 'retry_writing' | 'mark_published' | 'start_now';

/** С каких этапов «Повторить» возвращает упавший ролик (RESUME_FROM бэка). */
const RESUMABLE: ShortStatus[] = ['directing', 'capturing', 'writing', 'animating', 'rendering'];

/** Пост уже в канале: строка telegram вышла (у упавшего YouTube — всегда). */
export function telegramOut(d: Pick<ShortItem, 'publications'>): boolean {
  return d.publications.some((p) => p.platform === 'telegram' && p.status === 'published');
}

/**
 * Какие кнопки показать — по правилам бэка: «Переснять» и «Отклонить» не у
 * вышедшего хоть где-то; повтор публикации и «Пост вышел» — только у ролика,
 * который владелец одобрял, а «Пост вышел» — пока пост в канале не вышел
 * (у упавшего YouTube он уже вышел); «Новый текст» — только при съёмке.
 * Тот же набор называет бот в сообщении о сбое (failedHint бэка).
 */
export function actionsFor(
  d: Pick<ShortDetail, 'status' | 'failedFrom' | 'approvedAt' | 'publications' | 'capture'>,
): ShortAction[] {
  const released = isReleased(d);
  const leave: ShortAction[] = released ? [] : ['redo', 'reject'];
  switch (d.status) {
    case 'pending_review':
      return ['approve', 'note', ...leave];
    case 'approved':
      return ['publish_now', ...leave];
    case 'idea':
      return ['start_now'];
    case 'failed': {
      const reject: ShortAction[] = released ? [] : ['reject'];
      if (d.failedFrom === 'publishing') {
        if (!d.approvedAt) return reject;
        // Пост уже в канале (упал YouTube после него) — «Пост вышел» перезаписал бы ссылку на настоящий пост.
        const postOut = telegramOut(d);
        return postOut ? ['retry', ...reject] : ['retry', 'mark_published', ...reject];
      }
      if (!d.failedFrom) return reject;
      const out: ShortAction[] = [];
      if (RESUMABLE.includes(d.failedFrom)) out.push('retry');
      out.push('retry_directing');
      if (d.capture) out.push('retry_writing');
      return [...out, ...reject];
    }
    default:
      return [];
  }
}

/** Пост канала — как TG_POST_URL бэка (shorts.controller.ts). */
const TG_POST_URL = /^https:\/\/t\.me\/(?:c\/\d+|[A-Za-z0-9_]{3,32})\/(\d+)$/;

export function isTelegramPostUrl(url: string): boolean {
  return TG_POST_URL.test(url.trim());
}

export interface ActionExtra {
  /** Текст замечания к ролику на проверке. */
  text?: string;
  /** Ссылка на вышедший пост — для «Пост вышел». */
  url?: string;
  /** Необязательное замечание к повтору. */
  note?: string;
}

export interface ActionRequest {
  payload: Record<string, unknown>;
  /** Текст подтверждения; null — без него. */
  confirm: string | null;
  /** Под замком от двойного нажатия: одобрение и публикация. */
  lock: boolean;
}

type Target = Pick<ShortItem, 'id' | 'version' | 'title' | 'topicHint' | 'topicKey' | 'failedFrom' | 'publications'>;

function named(d: Target): string {
  const chars = Array.from(shortTitle(d));
  return `ролик «${chars.length > 80 ? `${chars.slice(0, 79).join('')}…` : chars.join('')}»`;
}

/** Запрос решения. Решения по готовому ролику подписаны версией той карточки, что видел владелец. */
export function actionRequest(kind: ShortAction, d: Target, extra: ActionExtra = {}): ActionRequest {
  const note = extra.note?.trim() ? { note: extra.note.trim() } : {};
  switch (kind) {
    case 'approve':
      return { payload: { action: 'approve', id: d.id, version: d.version }, confirm: null, lock: true };
    case 'note':
      return { payload: { action: 'note', id: d.id, version: d.version, text: (extra.text ?? '').trim() }, confirm: null, lock: false };
    case 'redo':
      return {
        payload: { action: 'redo', id: d.id, version: d.version },
        confirm: `Переснять ${named(d)}?\n\nБудет новая сцена на ту же тему — это снова секунды Omni. Текущая версия пропадёт.`,
        lock: false,
      };
    case 'reject':
      return {
        payload: { action: 'reject', id: d.id, version: d.version },
        confirm: d.failedFrom === 'publishing'
          ? `Отклонить ${named(d)}?\n\nПовторов публикации больше не будет. Если пост всё-таки вышел в канал — сначала отметьте «Пост вышел».`
          : `Отклонить ${named(d)}?\n\nРолик не выйдет, вернуть его нельзя.`,
        lock: false,
      };
    case 'publish_now':
      return {
        payload: { action: 'publish_now', id: d.id },
        confirm: `Опубликовать ${named(d)} сейчас?\n\nРолик уйдёт на площадки в ближайшие 5 минут. Отменить публикацию нельзя.`,
        lock: true,
      };
    case 'retry': {
      // Повтор упавшей публикации, пока пост не в канале, — та же публикация: при неизвестном исходе отправки пост выйдет второй раз.
      const republish = d.failedFrom === 'publishing' && !telegramOut(d);
      return {
        payload: { action: 'retry', id: d.id, ...note },
        confirm: republish
          ? `Повторить публикацию: ${named(d)}?\n\nСначала проверьте канал: если пост уже вышел — нажмите «Пост вышел», иначе он выйдет второй раз.`
          : null,
        lock: republish,
      };
    }
    case 'retry_directing':
      return {
        payload: { action: 'retry', id: d.id, from: 'directing', ...note },
        confirm: `Переснять ${named(d)} с новой сценой?\n\nРежиссёр придумает сцену заново — это снова секунды Omni.`,
        lock: false,
      };
    case 'retry_writing':
      return { payload: { action: 'retry', id: d.id, from: 'writing', ...note }, confirm: null, lock: false };
    case 'mark_published': {
      const url = (extra.url ?? '').trim();
      return {
        payload: { action: 'mark_published', id: d.id, url },
        confirm: `Отметить пост вышедшим: ${named(d)}?\n\nСсылка: ${url}\nОтменить отметку нельзя: в канал ролик больше отправляться не будет.`,
        lock: false,
      };
    }
    case 'start_now':
      return {
        payload: { action: 'start_now', id: d.id },
        confirm: `Запустить ${named(d)} сейчас?\n\nРолик соберётся минут за десять; сценки тратят секунды Omni.`,
        lock: false,
      };
  }
}

/** Итог удачного решения — плашкой над списком: карточка после него закрывается. */
export function successText(kind: ShortAction, d: Pick<ShortItem, 'failedFrom'>, res: unknown, now: Date): string {
  switch (kind) {
    case 'approve': {
      const slotAt = (res as { slotAt?: unknown } | null)?.slotAt;
      return typeof slotAt === 'string' ? `Одобрено. Выйдет ${formatSlotAt(slotAt, now)}.` : 'Одобрено.';
    }
    case 'note':
      return 'Замечание принято: ролик ушёл на переписку, новая версия придёт сюда и в личку.';
    case 'redo':
      return 'Ролик переснимается: новая сцена на ту же тему. Новая версия придёт сюда и в личку.';
    case 'reject':
      return 'Ролик отклонён.';
    case 'publish_now':
      return 'Ролик уйдёт на площадки в ближайшие 5 минут.';
    case 'retry':
      return d.failedFrom === 'publishing' ? 'Публикация повторится в ближайшие 5 минут.' : 'Ролик снова в работе.';
    case 'retry_directing':
      return 'Ролик снова в работе: режиссёр придумает новую сцену.';
    case 'retry_writing':
      return 'Ролик снова в работе: сценарист напишет новый текст по той же съёмке.';
    case 'mark_published':
      return 'Пост отмечен вышедшим — остальные площадки допубликуются сами.';
    case 'start_now':
      return 'Ролик запущен: появится в «Ждут решения», когда соберётся.';
  }
}

/** Черновик формы настроек: числа — строками, как их набирает человек. */
export interface SettingsDraft {
  slotDays: number[];
  slotHourMsk: string;
  format: ShortFormat;
  platforms: ShortPlatform[];
  maxOmniSeconds: string;
  narratorVoice: string;
  minAnswerChars: string;
  prepareLeadHours: string;
  tgChannelChatId: string;
}

/** Площадки этого экрана в каноническом порядке: VK ещё не готов (SUPPORTED_PLATFORMS бэка). */
export const SETTINGS_PLATFORMS: readonly ShortPlatform[] = ['telegram', 'youtube'];

export function toDraft(s: ShortSettings): SettingsDraft {
  return {
    slotDays: [...s.slotDays],
    slotHourMsk: String(s.slotHourMsk),
    format: s.format,
    platforms: SETTINGS_PLATFORMS.filter((p) => s.platforms.includes(p)),
    maxOmniSeconds: String(s.maxOmniSeconds),
    narratorVoice: s.narratorVoice,
    minAnswerChars: String(s.minAnswerChars),
    prepareLeadHours: String(s.prepareLeadHours),
    tgChannelChatId: s.tgChannelChatId ?? '',
  };
}

/** Целое в пределах. Пустая строка — не ноль: стёртое поле не должно молча значить «0». */
const intIn = (raw: string, min: number, max: number): boolean =>
  /^\d+$/.test(raw.trim()) && Number(raw) >= min && Number(raw) <= max;

/** Ошибки до отправки — те же пределы, что у validateSettingsPatch бэка. Пусто — можно сохранять. */
export function draftErrors(d: SettingsDraft): Partial<Record<keyof SettingsDraft, string>> {
  const e: Partial<Record<keyof SettingsDraft, string>> = {};
  if (!normalizeSlotDays(d.slotDays).length) e.slotDays = 'Нужен хотя бы один день.';
  if (!intIn(d.slotHourMsk, 0, 23)) e.slotHourMsk = 'Целое число от 0 до 23.';
  if (!SETTINGS_PLATFORMS.some((p) => d.platforms.includes(p))) e.platforms = 'Нужна хотя бы одна площадка.';
  if (!intIn(d.maxOmniSeconds, 8, 400)) e.maxOmniSeconds = 'Целое число от 8 до 400: клип Omni — 8 секунд.';
  if (!d.narratorVoice.trim()) e.narratorVoice = 'Голос SpeechKit, например alena.';
  if (!intIn(d.minAnswerChars, 100, 5000)) e.minAnswerChars = 'Целое число от 100 до 5000.';
  if (!intIn(d.prepareLeadHours, 1, 96)) e.prepareLeadHours = 'Целое число от 1 до 96.';
  const ch = d.tgChannelChatId.trim();
  if (ch && !/^-100\d{6,}$/.test(ch)) e.tgChannelChatId = 'Числовой id канала вида -100… или пусто.';
  return e;
}

/** Тело update_settings: все поля, кроме режима YouTube — его меняет своя кнопка. */
export function draftToPatch(d: SettingsDraft): Omit<ShortSettings, 'youtubeMode'> {
  return {
    slotDays: normalizeSlotDays(d.slotDays),
    slotHourMsk: Number(d.slotHourMsk),
    prepareLeadHours: Number(d.prepareLeadHours),
    minAnswerChars: Number(d.minAnswerChars),
    tgChannelChatId: d.tgChannelChatId.trim() || null,
    platforms: SETTINGS_PLATFORMS.filter((p) => d.platforms.includes(p)),
    narratorVoice: d.narratorVoice.trim(),
    format: d.format,
    maxOmniSeconds: Number(d.maxOmniSeconds),
  };
}
