// Приватные вложения из реестра загрузок чата (spirits_back, chat-uploads).
//
// Бэк с фичи «память загрузок» сохраняет оригиналы присланных файлов и пишет
// в историю ходов строки вида `📎 [имя](/webhook/chat-uploads/<uuid>)`.
// Скачивание требует JWT владельца, поэтому:
// - window.open по сырому адресу НЕ годится — браузер не пошлёт Authorization;
// - забираем файл через apiClient (fetch-обёртка сама добавляет Bearer и
//   обновляет токен при 401) и открываем уже blob через object URL;
// - строку 📎 в пузыре пользователя рисуем кликабельной ссылкой, а не сырым
//   markdown-текстом (общий markdown в пользовательские сообщения не добавляем).
import React from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../services/apiClient';

/** Префикс приватного эндпоинта скачивания (GET /webhook/chat-uploads/:id). */
export const CHAT_UPLOAD_PREFIX = '/webhook/chat-uploads/';

/** Ссылка на приватное вложение — относительный адрес нашего же эндпоинта. */
export function isChatUploadLink(href: string): boolean {
  return href.startsWith(CHAT_UPLOAD_PREFIX);
}

/**
 * Скачать приватное вложение и открыть его в новой вкладке.
 *
 * Ошибка НЕфатальна и не должна уводить ход в общий catch с
 * chat.file_error_fallback: показываем тост уже переведённым текстом
 * (вызывающий передаёт t('chat.upload_download_error')) и ничего не открываем.
 */
export async function openChatUpload(href: string, errorText: string): Promise<void> {
  let objectUrl: string | null = null;
  try {
    const response = await apiClient.get(href);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    // Новой вкладке нужно время забрать файл — освобождаем адрес с запасом.
    const urlToRevoke = objectUrl;
    setTimeout(() => URL.revokeObjectURL(urlToRevoke), 60_000);
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    toast.error(errorText);
  }
}

// Markdown-ссылка на приватное вложение внутри строки 📎. Имя может содержать
// пробелы и кириллицу; адрес — только /webhook/chat-uploads/... без пробелов
// и «)» (uuid), так что жадная скобка безопасна.
// Бэк (spirits_back chat.controller.ts, markdownEscapeName) экранирует в именах
// `\`, `[`, `]`, поэтому имя ловим как «обычный символ ИЛИ экранированная пара»:
// `\[финал\]` внутри имени не рвёт разбор, а «]» имени от «](адрес)» отличим.
const UPLOAD_LINK_RE = /\[((?:[^\]\\]|\\.)*)\]\((\/webhook\/chat-uploads\/[^)\s]+)\)/g;

/** Обратная к markdownEscapeName: `\\`→`\`, `\[`→`[`, `\]`→`]` в имени файла. */
function unescapeFileName(raw: string): string {
  return raw.replace(/\\([\\[\]])/g, '$1');
}

/**
 * Содержимое пузыря пользователя: строки 📎 со ссылками на вложения
 * превращаются в кликабельные элементы (клик → onLink(href) →
 * handleLinkNavigation → openChatUpload), остальной текст остаётся ровно тем,
 * что набрал человек. Возврат строки как есть (быстрый путь) — гарантия, что
 * для обычных сообщений не меняется ничего, включая переводы строк под
 * whitespace-pre-wrap.
 */
export function renderUserMessageContent(
  content: string,
  onLink: (href: string) => void,
): React.ReactNode {
  if (!content.includes(CHAT_UPLOAD_PREFIX)) return content;

  const parts: React.ReactNode[] = [];
  content.split('\n').forEach((line, li) => {
    if (li > 0) parts.push('\n');
    if (!line.startsWith('📎')) {
      parts.push(line);
      return;
    }
    let last = 0;
    for (const m of line.matchAll(UPLOAD_LINK_RE)) {
      const idx = m.index ?? 0;
      if (idx > last) parts.push(line.slice(last, idx));
      const href = m[2];
      parts.push(
        <a
          key={`upload-${li}-${idx}`}
          // Без href по образцу cabinetSections-ветки в markdownComponents:
          // сырой GET без JWT вернул бы 401, а средняя кнопка не должна.
          onClick={(e) => {
            e.preventDefault();
            onLink(href);
          }}
          className="ym-disable-tracklink underline decoration-white/60 hover:decoration-white cursor-pointer"
        >
          {unescapeFileName(m[1])}
        </a>,
      );
      last = idx + m[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
  });
  return parts;
}
