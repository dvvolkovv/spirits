import { thumbUrlFor } from './files/chatFiles';

/**
 * Ссылка «Скачать имя.jpg» на картинку из файлов чата → миниатюра и оригинал.
 *
 * Релей прикладывает созданные ассистентом файлы ссылками «Скачать …», и
 * картинку приходилось скачивать, чтобы увидеть: схему зала, превью правки
 * знака (находка «Затыков недели» bfc4c3ad; просьба «пришли превью картинкой
 * в чат, чтоб не надо было скачивать»). Такую ссылку лента рисует миниатюрой.
 *
 * Только наши хосты и бакет файлов чата: миниатюру ручка строит по КЛЮЧУ в
 * нашем бакете, и чужая ссылка с тем же путём показала бы не тот файл.
 * Ключ — раскодированный путь (как его ждёт parseThumbSrc на бэке).
 */
const OUR_HOSTS = new Set(['my.linkeon.io', 'test.linkeon.io']);
const PREFIX = '/smm-media/linkeon-chat-files/';
const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;
const MAX_SRC_LENGTH = 300;

export interface ImageAttachmentPreview {
  thumbUrl: string;
  fullUrl: string;
}

export function imageAttachmentPreview(href: string): ImageAttachmentPreview | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, 'https://my.linkeon.io');
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const relative = href.startsWith('/');
  if (!relative && !OUR_HOSTS.has(url.hostname)) return null;
  if (!url.pathname.startsWith(PREFIX)) return null;

  const rawKey = url.pathname.slice(PREFIX.length);
  let segments: string[];
  try {
    segments = rawKey.split('/').map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  const key = segments.join('/');
  if (!IMAGE_RE.test(key)) return null;
  const src = `linkeon-chat-files/${key}`;
  if (src.length > MAX_SRC_LENGTH) return null;

  return { thumbUrl: thumbUrlFor(`/webhook/chat/thumb?src=${encodeURIComponent(src)}`), fullUrl: href };
}
