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

  // Форма адреса — ДО new URL(): релей пишет только настоящий абсолютный
  // https://… (свой хост — проверяется ниже) или относительный путь с ОДНОГО
  // ведущего «/». Всё остальное относительное — smm-media/…, ./…, ../…,
  // minio/… без ведущего «/» — new URL(href, 'https://my.linkeon.io') ниже
  // всё равно резолвит (относительно КОРНЯ зашитой базы: сам путь становится
  // /smm-media/…), и тогда оно проходит проверку хоста как «свой» и даёт
  // ссылку на my.linkeon.io мимо VITE_BACKEND_URL текущей среды — на
  // test.linkeon.io получилась бы ссылка на прод вместо теста. Лишний
  // ведущий «/» (протокол-относительный «//host/…») или обратная косая
  // («/\host/…», которую URL для http/https приравнивает к прямой) —
  // адрес на чужой хост, даже если этот хост совпадает с нашим: такую форму
  // релей не пишет вовсе, отбрасываем по одной форме, не дожидаясь, что её
  // поймает проверка хоста. Лукэхед сверх «/» и «\» исключает ещё и
  // \t\n\r: new URL() их молча выбрасывает при разборе, и «/\t/host» для
  // него оказывается тем же «//host».
  const plainRelative = /^\/(?![/\\\t\n\r])/.test(href);
  if (!plainRelative && !/^https:\/\//i.test(href)) return null;

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
  // Хост проверяем ВСЕГДА, а не только для абсолютной https-формы: настоящий
  // относительный путь «/smm-media/…» тоже резолвится от базы
  // https://my.linkeon.io выше и обязан пройти ту же проверку, что и свой
  // хост в абсолютном адресе. Для абсолютной https-формы хост может быть
  // любым (https://evil.example/smm-media/… с тем же путём) — ровно это
  // отсекается здесь.
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

  // plainRelative — от адреса бэкенда ЭТОЙ среды (VITE_BACKEND_URL);
  // абсолютный адрес со своим хостом (как реально пишет бэк —
  // https://my.linkeon.io/smm-media/…) — тем же хостом. В обоих случаях —
  // без query/hash: url.pathname их не несёт.
  const fullUrl = plainRelative
    ? `${import.meta.env.VITE_BACKEND_URL || ''}${url.pathname}`
    : `https://${url.hostname}${url.pathname}`;

  return { fullUrl, name };
}
