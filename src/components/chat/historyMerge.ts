// Слияние локальной ленты чата с тем, что вернул фоновый поллинг истории.
//
// Вынесено из ChatInterface отдельным модулем, потому что ошибка здесь не
// падает и не логируется — она тихо задваивает сообщение, причём копия из БД
// приезжает ПОСЛЕ ответа ассистента. Со стороны выглядит так, будто вопрос
// пользователя уехал под ответ.

export interface LocalMessage {
  id: string;
  type: string;
  content?: string;
  timestamp: Date | string;
}

export interface PolledMessage {
  id?: string | number;
  type?: string;
  sender_type?: string;
  content?: string;
  timestamp: Date | string;
}

// Сколько последних локальных сообщений сравниваем по тексту. Больше и не
// нужно: поллинг тянет только хвост истории (limit=5).
const RECENT_LOCAL_WINDOW = 8;

/**
 * Ход с вложениями ровно в том написании, в каком его сохранит бэк
 * (spirits_back, chat.controller.ts → uploadAndChat: `📎 ${names}\n${message}`).
 *
 * Пузырь в ленте и запись в истории должны совпадать посимвольно: сравнение
 * текстов — единственное, что мешает поллингу принять копию своего же хода за
 * новое сообщение. Разойдясь, форматы задваивали отправку файлов, и копия
 * вставала ПОД ответом ассистента.
 */
export function attachmentTurnText(names: string[], task: string): string {
  return `📎 ${names.join(', ')}\n${task}`;
}

/**
 * Текст сообщения без строк-заголовков с вложениями.
 *
 * Страховка на случай, когда написания всё же разойдутся: имя файла бэк
 * пропускает через decodeMultipartFilename, да и в БД остались ходы, записанные
 * прежними версиями клиента. Задание пользователя от этого не меняется — по
 * нему и сверяем.
 */
export function stripAttachmentLines(content: string): string {
  return content
    .split('\n')
    .filter(line => !line.startsWith('📎'))
    .join('\n')
    .trim();
}

const roleOf = (m: LocalMessage | PolledMessage): 'human' | 'ai' =>
  m.type === 'user' ? 'human' : m.type === 'assistant' ? 'ai' : ((m as PolledMessage).sender_type as 'human' | 'ai') || 'ai';

const timeOf = (v: Date | string): number =>
  (v instanceof Date ? v : new Date(v)).getTime();

export function selectNewPolledMessages<T extends PolledMessage>(local: LocalMessage[], polled: T[]): T[] {
  if (local.length === 0) return [];

  const lastLocalTime = timeOf(local[local.length - 1].timestamp);
  const existingIds = new Set(local.map(m => String(m.id)));

  const localContentByRole = new Map<string, Set<string>>();
  for (const m of local.slice(-RECENT_LOCAL_WINDOW)) {
    const c = stripAttachmentLines(typeof m.content === 'string' ? m.content : '');
    if (!c) continue;
    const role = roleOf(m);
    if (!localContentByRole.has(role)) localContentByRole.set(role, new Set());
    localContentByRole.get(role)!.add(c);
  }

  return polled.filter(m => {
    const t = timeOf(m.timestamp);
    if (Number.isNaN(t)) return false;
    if (m.id != null && existingIds.has(String(m.id))) return false;
    if (t <= lastLocalTime) return false;
    const content = stripAttachmentLines(typeof m.content === 'string' ? m.content : '');
    if (content && localContentByRole.get(roleOf(m))?.has(content)) return false;
    return true;
  });
}
