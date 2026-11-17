import { apiClient } from '../../../services/apiClient';

export type ChatFileKind = 'image' | 'video' | 'document' | 'audio';

/** Запись GET /webhook/chat/files — spirits_back: chat-files.service.ts, ChatFileItem. */
export interface ChatFileItem {
  key: string;
  kind: ChatFileKind;
  /**
   * Нет у stored=false: файл пропал, скачивать нечего. У загрузок пользователя
   * (origin='upload') — приватная ручка /webhook/chat-uploads/<id>: открывать
   * только запросом с JWT, не простым <img src>.
   */
  url?: string;
  /** У загрузок — /webhook/chat-uploads/<id>/thumb, тоже только с JWT; есть, если миниатюра получилась. */
  thumbUrl?: string;
  /** Только у картинок из наших бакетов: путь ручки миниатюры на бэке (chat-thumb.controller.ts). */
  thumbPath?: string;
  name: string;
  ext: string;
  createdAt: string;
  /** Строка истории с файлом. У загрузок пользователя её нет — и поля нет. */
  messageId?: number;
  stored: boolean;
  /**
   * 'assistant' — файл из ответа ассистента, 'upload' — его загрузил сам
   * пользователь. Поля нет — флаг CHAT_UPLOADS_ENABLED на бэке выключен:
   * это файл ассистента, как раньше.
   */
  origin?: 'assistant' | 'upload';
  /** Только у загрузок: веб и приложения, PDF у Маши или Telegram — для пометки на плитке. */
  source?: 'web' | 'scan' | 'telegram';
  /** Только у загрузок: комментарий ассистента; null — его ещё нет. */
  note?: string | null;
  /** Только у загрузок: id для deleteChatUpload. */
  uploadId?: string;
  /** Только у загрузок: байты оригинала — плитка без миниатюры тянет его, только если он небольшой. */
  sizeBytes?: number;
}

export type FilesTab = 'media' | 'files';

export async function fetchChatFiles(assistantId: string | number, freshTs?: string | null): Promise<ChatFileItem[]> {
  const fresh = freshTs ? `&freshTs=${encodeURIComponent(freshTs)}` : '';
  const res = await apiClient.get(`/webhook/chat/files?assistantId=${encodeURIComponent(String(assistantId))}${fresh}`);
  if (!res.ok) throw new Error(`chat files: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

/**
 * Удалить свою загрузку: DELETE /webhook/chat-uploads/:id, только владелец
 * по JWT (его добавляет apiClient). 204 — удалена. 404 — её уже нет
 * (например, удалили в другой вкладке): для панели итог тот же, плитку можно
 * убирать. Остальное — исключение (502: хранилище не ответило, файл цел), и
 * панель показывает delete_failed, оставляя плитку на месте.
 */
export async function deleteChatUpload(uploadId: string): Promise<void> {
  if (!uploadId) throw new Error('chat upload delete: empty id');
  const res = await apiClient.delete(`/webhook/chat-uploads/${encodeURIComponent(uploadId)}`);
  if (res.ok || res.status === 404) return;
  throw new Error(`chat upload delete: HTTP ${res.status}`);
}

/**
 * Адрес миниатюры: путь ручки достраивается от нашего бэкенда, поэтому test,
 * прод и приложение на Capacitor берут миниатюры каждый со своего.
 */
export function thumbUrlFor(thumbPath: string): string {
  return `${import.meta.env.VITE_BACKEND_URL || ''}${thumbPath}`;
}

const isMedia = (f: ChatFileItem) => f.kind === 'image' || f.kind === 'video';

/** Файлы вкладки: те, что можно открыть, и не сохранившиеся. */
export function splitTab(items: ChatFileItem[], tab: FilesTab): { stored: ChatFileItem[]; unsaved: ChatFileItem[] } {
  const inTab = items.filter((f) => (tab === 'media' ? isMedia(f) : !isMedia(f)));
  return {
    stored: inTab.filter((f) => f.stored && !!f.url),
    unsaved: inTab.filter((f) => !f.stored || !f.url),
  };
}

/** «Медиа», если в ней есть что открыть, иначе «Файлы». */
export function startTab(items: ChatFileItem[]): FilesTab {
  return splitTab(items, 'media').stored.length > 0 ? 'media' : 'files';
}

export interface MonthGroup {
  key: string;
  label: string;
  items: ChatFileItem[];
}

/** Группы по месяцам в порядке прихода: сервер отдаёт файлы от новых к старым. */
export function groupByMonth(items: ChatFileItem[], lang: string): MonthGroup[] {
  const fmt = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' });
  const groups: MonthGroup[] = [];
  for (const it of items) {
    const d = new Date(it.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const label = fmt.format(d);
      g = { key, label: label.charAt(0).toLocaleUpperCase(lang) + label.slice(1), items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

export type FileIconKind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'archive' | 'code' | 'audio' | 'other';

const WORD = new Set(['doc', 'docx', 'odt', 'rtf', 'txt', 'md']);
const EXCEL = new Set(['xls', 'xlsx', 'ods', 'csv']);
const POWERPOINT = new Set(['ppt', 'pptx', 'odp']);
const ARCHIVE = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
const CODE = new Set(['py', 'js', 'ts', 'json', 'html', 'htm', 'css', 'sh', 'sql', 'xml', 'yaml', 'yml']);

/**
 * Форматы, которые браузер рисует в картинке. Остальное (HEIC/HEIF с айфона,
 * TIFF, BMP, SVG) в blob ради «битой картинки» не тянем: миниатюры у HEIC и BMP
 * нет (бэк, upload-thumb.ts), а оригинал до 100 МБ браузер всё равно не покажет.
 */
export const BROWSER_IMAGE_EXTS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);

const browserShows = (f: Pick<ChatFileItem, 'ext' | 'kind'>) =>
  f.kind === 'image' && BROWSER_IMAGE_EXTS.has((f.ext || '').toLowerCase());

/**
 * Потолок оригинала для плитки без миниатюры. Плитка ~120 px, а оригинал
 * загрузки — до 100 МБ: больше потолка (или размер неизвестен) — значок файла.
 */
export const TILE_ORIGINAL_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Что плитка загрузки показывает превью: миниатюра (webp до 480 px), а у
 * картинки без неё — оригинал, если браузер его покажет и он не больше
 * TILE_ORIGINAL_MAX_BYTES. undefined — превью нет: у видео тёмная плитка, у
 * картинки — значок файла. Просмотр (uploadViewerPath) оригинал грузит всегда:
 * его открывают нарочно.
 */
export function uploadTilePath(f: ChatFileItem): string | undefined {
  if (f.thumbUrl) return f.thumbUrl;
  const small = typeof f.sizeBytes === 'number' && f.sizeBytes <= TILE_ORIGINAL_MAX_BYTES;
  return browserShows(f) && small ? f.url : undefined;
}

/**
 * Что просмотр загрузки показывает картинкой: оригинал, если браузер его
 * покажет, иначе миниатюра (TIFF). undefined — ни того, ни другого (HEIC):
 * значок файла и «Скачать».
 */
export function uploadViewerPath(f: ChatFileItem): string | undefined {
  return browserShows(f) ? f.url : f.thumbUrl;
}

export function fileIconKind(f: Pick<ChatFileItem, 'ext' | 'kind'>): FileIconKind {
  if (f.kind === 'audio') return 'audio';
  if (f.ext === 'pdf') return 'pdf';
  if (WORD.has(f.ext)) return 'word';
  if (EXCEL.has(f.ext)) return 'excel';
  if (POWERPOINT.has(f.ext)) return 'powerpoint';
  if (ARCHIVE.has(f.ext)) return 'archive';
  if (CODE.has(f.ext)) return 'code';
  return 'other';
}
