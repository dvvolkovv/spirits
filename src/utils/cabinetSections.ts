/**
 * Адреса кабинета, которые дают ассистенты, — что по ним открывается и что из
 * них переживает вход.
 *
 * Находка «Затыков недели» 19–25.10.2026 (e4f01175): ассистент объяснил
 * словами, где раздел («в интеграциях»), и человек его не нашёл. Раздела
 * «Интеграции» в кабинете нет, подключения разбросаны по карточкам
 * «Настроек». Теперь справка и блок о платформе дают ссылку
 * https://my.linkeon.io/…, а кабинет по ней раскрывает нужный блок и
 * прокручивает к карточке.
 *
 * ДВЕ КОПИИ ОДНОЙ ТАБЛИЦЫ: эта и spirits_back src/platform-kb/section-links.ts
 * (оттуда адреса берут справка и блок «Что есть в Linkeon»). Разъедутся —
 * ассистент даст ссылку, по которой кабинет откроет не ту карточку или после
 * входа уведёт в чат. Сторож — общая таблица между метками «АДРЕСА РАЗДЕЛОВ»
 * в cabinetSections.test.ts и в section-links.spec.ts бэка, дословно одна и
 * та же; меняется в обоих репозиториях одним изменением.
 */

/** Карточки «Моего профиля», к которым кабинет прокручивает по /profile?open=<ключ>. */
export const PROFILE_CARDS = [
  'calendars',
  'zoom',
  'talerid',
  'logins',
  'reminders',
  'voices',
  'notifications',
  'telegram',
  'partners',
] as const;
export type ProfileCard = (typeof PROFILE_CARDS)[number];

/** Карточки внутри свёрнутых «Настроек»: чтобы показать такую, блок раскрывается. */
const SETTINGS_CARDS: readonly ProfileCard[] = [
  'calendars',
  'zoom',
  'talerid',
  'logins',
  'reminders',
  'voices',
  'notifications',
];

export function isProfileCard(v: string | null | undefined): v is ProfileCard {
  return typeof v === 'string' && (PROFILE_CARDS as readonly string[]).includes(v);
}

/**
 * Значение параметра раздела (?open=, ?tab=) — его ведущие латинские буквы.
 * Знак вплотную за адресом автоссылка (remark-gfm в чате, Telegram) забирает
 * в адрес: «…?open=zoom）», «…?tab=bots。», а китайский текст без пробела —
 * целиком («zoom。然后»). Без этого кабинет не узнавал свою карточку. Результат
 * всё равно сверяется со списком карточек и вкладок.
 */
export function paramWord(value: string | null): string | null {
  return (value ?? '').match(/^[a-z]+/)?.[0] ?? null;
}

/** id элемента, к которому прокручивает /profile?open=<card>. */
export function profileCardAnchor(card: ProfileCard): string {
  return `profile-card-${card}`;
}

export interface ProfileTarget {
  /** Раскрыть свёрнутые «Настройки». */
  settings: boolean;
  /** Раскрыть свёрнутый блок «Партнёры». */
  referral: boolean;
  /** id элемента, к которому прокрутить; null — не прокручивать. */
  anchor: string | null;
}

/**
 * Что сделать «Моему профилю» по параметрам адреса. ?open= с незнакомым
 * значением — как без него: старая или битая ссылка открывает профиль, а не
 * ломает его. ?settings= с любым значением раскрывает «Настройки», как и
 * раньше (так шлёт виджет лаунчера), — в том числе рядом с карточкой вне них:
 * /profile?settings=1&open=telegram.
 */
export function profileTarget(search: string): ProfileTarget {
  const q = new URLSearchParams(search);
  const word = paramWord(q.get('open'));
  const card = isProfileCard(word) ? word : null;
  return {
    settings: q.has('settings') || (card !== null && SETTINGS_CARDS.includes(card)),
    referral: card === 'partners',
    anchor: card === null ? null : profileCardAnchor(card),
  };
}

/**
 * Все адреса разделов, которые дают ассистенты. Относительные: домен
 * (https://my.linkeon.io) бэк подставляет сам. Сверяются с общей таблицей.
 */
export const SECTION_LINKS: readonly string[] = [
  '/chat',
  '/search',
  '/image-gen',
  '/video',
  '/studio',
  '/studio?tab=bots',
  '/studio?tab=products',
  '/profile',
  '/profile?settings=1',
  ...PROFILE_CARDS.map((card) => `/profile?open=${card}`),
  '/help',
  '/support',
];

/**
 * Канонический вид адреса раздела С ПАРАМЕТРОМ — его запоминает вход
 * (pendingDestination.ts) — или null. Голые разделы (/profile, /studio,
 * /chat …) здесь null намеренно: экран входа стоит на любом адресе, и
 * «обычная страница» не должна перебивать запомненное намерение
 * (loginIntent.ts, тест «обычная страница ничего не трогает»). Повтор
 * параметра (?tab=bots&tab=products) — тоже null: какой из двух имелся в
 * виду, не угадать.
 */
export function deepSectionLink(pathname: string, search: string): string | null {
  const q = new URLSearchParams(search);
  if (q.getAll('tab').length > 1 || q.getAll('open').length > 1) return null;
  let link: string | null = null;
  if (pathname === '/studio') {
    const tab = paramWord(q.get('tab'));
    if (tab === 'bots' || tab === 'products') link = `/studio?tab=${tab}`;
  } else if (pathname === '/profile') {
    const card = paramWord(q.get('open'));
    if (isProfileCard(card)) link = `/profile?open=${card}`;
    else if (q.has('settings')) link = '/profile?settings=1';
  }
  return link !== null && SECTION_LINKS.includes(link) ? link : null;
}

/**
 * Куда ведут старые адреса /settings и /referral: в «Мой профиль» — с
 * параметрами. Прежний <Navigate to="/profile"> терял всё после «?»: и
 * /settings?open=zoom, и возврат после привязки входа (/settings?linked=1)
 * открывали профиль со свёрнутыми настройками. /settings без своей карточки
 * раскрывает «Настройки», /referral — блок «Партнёры». Незнакомое ?open=
 * (старая или битая ссылка) — как без него: иначе /referral?open=integrations
 * открывал бы профиль, где не раскрыто ничего.
 */
export function legacyProfilePath(from: 'settings' | 'referral', search: string): string {
  const q = new URLSearchParams(search);
  if (!isProfileCard(paramWord(q.get('open')))) {
    if (from === 'referral') q.set('open', 'partners');
    else if (!q.has('settings')) q.set('settings', '1');
  }
  const qs = q.toString();
  return qs ? `/profile?${qs}` : '/profile';
}

/** Боевой домен кабинета: его адреса дают ассистенты — и на тестовом стенде тоже. */
const CABINET_HOST = 'my.linkeon.io';

/**
 * Первые части пути, которые рисует сам кабинет (маршруты App.tsx). Остальное
 * на том же домене — файлы (/static, /smm-media, /files), API (/webhook),
 * мини-приложение (/tma) и голосовая комната (/room: пусть открывается рядом,
 * не закрывая чат) — открывается как раньше, полной загрузкой в новой вкладке.
 */
const CABINET_ROUTES = new Set([
  'chat',
  'chats',
  'profile',
  'studio',
  'products',
  'telegram-bots',
  'search',
  'image-gen',
  'video',
  'help',
  'support',
  'contact-requests',
  'settings',
  'referral',
  'tokens',
]);

function currentHost(): string {
  return typeof window === 'undefined' ? '' : window.location.host;
}

/**
 * Путь внутри кабинета для ссылки на свой домен — или null.
 *
 * Ссылку https://my.linkeon.io/profile?open=zoom из ответа ассистента кабинет
 * открывает в той же вкладке, переходом роутера, как относительную. Новая
 * вкладка загружала бы кабинет заново, а в приложении (Capacitor) открылся бы
 * внешний браузер без входа. Свой домен — боевой и тот, на котором открыт
 * кабинет (тестовый стенд, локальная сборка). Чужой хост, другой протокол или
 * путь не из CABINET_ROUTES — null, и ссылка ведёт себя как прежде.
 */
export function cabinetPath(href: string, here: string = currentHost()): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.host.toLowerCase();
  if (host !== CABINET_HOST && host !== here.toLowerCase()) return null;
  if (!CABINET_ROUTES.has(u.pathname.split('/')[1] ?? '')) return null;
  return `${u.pathname}${u.search}${u.hash}`;
}
