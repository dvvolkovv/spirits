import { apiClient } from '../../../services/apiClient';

export type ChatFileKind = 'image' | 'video' | 'document' | 'audio';

/** Запись GET /webhook/chat/files — spirits_back: chat-files.service.ts, ChatFileItem. */
export interface ChatFileItem {
  key: string;
  kind: ChatFileKind;
  /** Нет у stored=false: файл пропал, скачивать нечего. */
  url?: string;
  thumbUrl?: string;
  name: string;
  ext: string;
  createdAt: string;
  messageId: number;
  stored: boolean;
}

export type FilesTab = 'media' | 'files';

export async function fetchChatFiles(assistantId: string | number, freshTs?: string | null): Promise<ChatFileItem[]> {
  const fresh = freshTs ? `&freshTs=${encodeURIComponent(freshTs)}` : '';
  const res = await apiClient.get(`/webhook/chat/files?assistantId=${encodeURIComponent(String(assistantId))}${fresh}`);
  if (!res.ok) throw new Error(`chat files: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
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
