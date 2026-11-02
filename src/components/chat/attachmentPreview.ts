/**
 * Ссылка «Скачать имя.jpg» на картинку из файлов чата → нормализованный
 * адрес оригинала и имя файла.
 *
 * Релей прикладывает созданные ассистентом файлы ссылками «Скачать …», и
 * картинку приходилось скачивать, чтобы увидеть: схему зала, превью правки
 * знака (находка «Затыков недели» bfc4c3ad; просьба «пришли превью картинкой
 * в чат, чтоб не надо было скачивать»). Такую ссылку лента рисует самой
 * картинкой (ChatImageAttachment.tsx) — ручка миниатюр не годится: она режет
 * квадратом 384×384 (широкая схема зала обрежется), а по клику всё равно
 * нужен оригинал, который та же ручка отдаёт на скачивание, а не странице.
 *
 * Прод отдаёт файлы под /smm-media/, тестовый стенд — под /minio/
 * (MINIO_PUBLIC_URL разный на средах) — принимается любой из префиксов, на
 * любом из наших хостов.
 */
const OUR_HOSTS = new Set(['my.linkeon.io', 'test.linkeon.io']);
const PREFIXES = ['/smm-media/linkeon-chat-files/', '/minio/linkeon-chat-files/'];
const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;

export interface ImageAttachmentPreview {
  fullUrl: string;
  name: string;
}

export function imageAttachmentPreview(href: string): ImageAttachmentPreview | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, 'https://my.linkeon.io');
  } catch {
    return null;
  }
  // Только https, без логина/пароля/порта в адресе: иначе
  // https://evil.example@my.linkeon.io/… (хост на самом деле наш, но перед
  // ним чужое имя-«логин») прошёл бы проверку хоста ниже, хотя адрес — не
  // тот, что пишет собственный бэк.
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  // Хост проверяем ВСЕГДА, а не только когда href не начинается с «/»:
  // «//evil.example/…» и «/\evil.example/…» тоже начинаются с «/», но
  // резолвятся в чужой hostname (протокол-относительный адрес и обратная
  // косая, которую URL для http/https приравнивает к прямой) — настоящий
  // относительный путь вида «/smm-media/…» при этом резолвится от базы
  // https://my.linkeon.io и проходит эту же проверку как свой хост.
  if (!OUR_HOSTS.has(url.hostname)) return null;

  const prefix = PREFIXES.find((p) => url.pathname.startsWith(p));
  if (!prefix) return null;

  const rawKey = url.pathname.slice(prefix.length);
  let segments: string[];
  try {
    segments = rawKey.split('/').map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
  // «/» (из %2F) или «\» (из %5C) в раскодированном сегменте — тот же
  // риск выхода за пределы сегмента, что и «..», в том же условии: split
  // резал путь ДО decodeURIComponent, закодированный разделитель
  // проявляется только после него.
  if (segments.some((s) => s === '' || s === '.' || s === '..' || s.includes('/') || s.includes('\\'))) return null;
  const name = segments[segments.length - 1];
  if (!IMAGE_RE.test(name)) return null;

  // Настоящий относительный адрес (один ведущий «/», не «//» и не «/\») —
  // от адреса бэкенда ЭТОЙ среды; адрес со своим хостом (как реально пишет
  // бэк — https://my.linkeon.io/smm-media/…) — тем же хостом. В обоих
  // случаях — без query/hash: url.pathname их не несёт.
  const plainRelative = href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\');
  const fullUrl = plainRelative
    ? `${import.meta.env.VITE_BACKEND_URL || ''}${url.pathname}`
    : `https://${url.hostname}${url.pathname}`;

  return { fullUrl, name };
}
