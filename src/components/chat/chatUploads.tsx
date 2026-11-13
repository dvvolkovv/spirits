// Приватные вложения из реестра загрузок чата (spirits_back, chat-uploads).
//
// Бэк с фичи «память загрузок» сохраняет оригиналы присланных файлов и пишет
// в историю ходов строки вида `📎 [имя](/webhook/chat-uploads/<uuid>)`.
// Скачивание требует JWT владельца, поэтому:
// - window.open по сырому адресу НЕ годится — браузер не пошлёт Authorization;
// - забираем файл через apiClient (fetch-обёртка сама добавляет Bearer и
//   обновляет токен при 401) и отдаём его программным <a download> —
//   НЕ вторым window.open: после await'ов пользовательский жест протухает,
//   iOS Safari и Capacitor WebView блокируют окно и вне жеста, а
//   заблокированный open возвращает null и НЕ бросает — клик выглядел бы
//   проигнорированным (в Capacitor WebView blob:-адрес во внешнем браузере
//   в принципе недействителен, см. src/tma/telegram.ts);
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

// Дедуп повторных кликов (I3): двойной клик не должен тянуть вторую копию
// файла (до 100 МБ) параллельно с первой. Запись живёт ровно на время запроса.
const inFlight = new Set<string>();

/**
 * Имя файла из Content-Disposition (ответ same-origin — заголовок читаем).
 * Фолбэк, когда имя не пришло из текста ссылки 📎. Понимаем обе формы:
 * filename*=UTF-8''%D0… (RFC 5987) и filename="…".
 */
function fileNameFromHeaders(response: Response): string | null {
  const cd = response.headers?.get?.('content-disposition');
  if (!cd) return null;
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/i.exec(cd);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // Битый percent-encoding — пробуем обычную форму.
    }
  }
  const plain = /filename=("?)([^";]+)\1/i.exec(cd);
  return plain?.[2]?.trim() || null;
}

/**
 * Скачать приватное вложение и отдать его браузеру программным <a download>.
 *
 * Ошибка НЕфатальна и не должна уводить ход в общий catch с
 * chat.file_error_fallback: показываем тост уже переведённым текстом
 * (вызывающий передаёт t('chat.upload_download_error')) и ничего не открываем.
 *
 * @param fileName — имя из текста ссылки 📎 (уже расэкранированное); если не
 * передано, берём из Content-Disposition ответа.
 */
export async function openChatUpload(href: string, errorText: string, fileName?: string): Promise<void> {
  if (inFlight.has(href)) return;
  inFlight.add(href);
  let objectUrl: string | null = null;
  try {
    const response = await apiClient.get(href);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    objectUrl = URL.createObjectURL(blob);
    // Скачивание, в отличие от window.open, не требует пользовательской
    // активации и не подвержено popup-блоку; download сохраняет имя файла
    // (blob-адрес его не несёт).
    const a = document.createElement('a');
    a.href = objectUrl;
    const name = fileName || fileNameFromHeaders(response);
    if (name) a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    try {
      a.click();
    } finally {
      a.remove();
    }
    // Загрузчику нужно время забрать файл — освобождаем адрес с запасом.
    const urlToRevoke = objectUrl;
    setTimeout(() => URL.revokeObjectURL(urlToRevoke), 60_000);
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    toast.error(errorText);
  } finally {
    inFlight.delete(href);
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
 * превращаются в кликабельные элементы (клик → onLink(href, имя) →
 * handleLinkNavigation → openChatUpload), остальной текст остаётся ровно тем,
 * что набрал человек. Возврат строки как есть (быстрый путь) — гарантия, что
 * для обычных сообщений не меняется ничего, включая переводы строк под
 * whitespace-pre-wrap.
 */
export function renderUserMessageContent(
  content: string,
  onLink: (href: string, fileName?: string) => void,
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
      const name = unescapeFileName(m[1]);
      parts.push(
        <a
          key={`upload-${li}-${idx}`}
          // Без href по образцу cabinetSections-ветки в markdownComponents:
          // сырой GET без JWT вернул бы 401, а средняя кнопка не должна.
          // Без href элемент не фокусируем и не «ссылка» для скринридера —
          // чиним role/tabIndex (I8), клавиатура скачивает так же, как клик.
          role="link"
          tabIndex={0}
          onClick={(e) => {
            e.preventDefault();
            onLink(href, name);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
              e.preventDefault();
              onLink(href, name);
            }
          }}
          className="ym-disable-tracklink underline decoration-white/60 hover:decoration-white cursor-pointer"
        >
          {name}
        </a>,
      );
      last = idx + m[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
  });
  return parts;
}
