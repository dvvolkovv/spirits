import { describe, expect, it } from 'vitest';
import {
  PROFILE_CARDS,
  SECTION_LINKS,
  cabinetPath,
  chatLinkPath,
  deepSectionLink,
  isWebLink,
  legacyProfilePath,
  paramWord,
  profileCardAnchor,
  profileTarget,
  type ProfileCard,
} from './cabinetSections';

/**
 * Адреса разделов, которые дают ассистенты, и что по ним делает кабинет.
 *
 * ОБЩАЯ ТАБЛИЦА — дословно та же стоит в spirits_back
 * src/platform-kb/section-links.spec.ts: оттуда адреса берут справка и блок
 * «Что есть в Linkeon» в промпте ассистентов. Меняется в обоих репозиториях
 * одним изменением. Сверка — пустой вывод diff блоков между строками-метками
 * «<<<» и «>>>» с «АДРЕСА РАЗДЕЛОВ» (команда — задача С1 плана
 * 2026-10-27-assistant-links-sources-roles).
 */
// <<< АДРЕСА РАЗДЕЛОВ — общая таблица бэка и фронта, менять в обоих репозиториях
const SECTION_TABLE = [
  '/chat',
  '/help',
  '/image-gen',
  '/profile',
  '/profile?open=calendars',
  '/profile?open=logins',
  '/profile?open=notifications',
  '/profile?open=partners',
  '/profile?open=reminders',
  '/profile?open=talerid',
  '/profile?open=telegram',
  '/profile?open=voices',
  '/profile?open=zoom',
  '/profile?settings=1',
  '/search',
  '/studio',
  '/studio?tab=bots',
  '/studio?tab=products',
  '/support',
  '/video',
];
// >>> АДРЕСА РАЗДЕЛОВ

describe('таблица адресов разделов', () => {
  it('кабинет открывает ровно общую таблицу', () => {
    expect([...SECTION_LINKS].sort()).toEqual(SECTION_TABLE);
  });

  it('каждый адрес таблицы — путь кабинета: ссылка на него открывается в той же вкладке', () => {
    for (const link of SECTION_TABLE) {
      expect(cabinetPath(`https://my.linkeon.io${link}`, 'my.linkeon.io'), link).toBe(link);
    }
  });

  it('у каждой карточки из таблицы есть якорь', () => {
    for (const link of SECTION_TABLE.filter((l) => l.startsWith('/profile?open='))) {
      expect(profileTarget(link.slice('/profile'.length)).anchor, link).not.toBeNull();
    }
  });

  it('адрес с параметром — в каноническом виде: его запоминает вход', () => {
    for (const link of SECTION_TABLE.filter((l) => l.includes('?'))) {
      const [path, query] = link.split('?');
      expect(deepSectionLink(path, `?${query}`), link).toBe(link);
    }
  });

  it('голый раздел — не намерение: вход его не запоминает', () => {
    for (const link of SECTION_TABLE.filter((l) => !l.includes('?'))) {
      expect(deepSectionLink(link, ''), link).toBeNull();
    }
  });
});

describe('paramWord — значение параметра раздела', () => {
  // Знак вплотную за адресом автоссылка забирает в значение: «…?open=zoom）».
  it.each([
    ['zoom', 'zoom'],
    ['zoom）', 'zoom'],
    ['zoom。', 'zoom'],
    ['zoom。然后', 'zoom'],
    ['bots;', 'bots'],
    ['products»', 'products'],
    ['）zoom', null],
    ['', null],
    [null, null],
  ])('%s → %s', (value, word) => {
    expect(paramWord(value)).toBe(word);
  });
});

describe('profileTarget — что сделать «Моему профилю»', () => {
  // [карточка, раскрыть «Настройки», раскрыть «Партнёры»]
  const CARDS: [ProfileCard, boolean, boolean][] = [
    ['calendars', true, false],
    ['zoom', true, false],
    ['talerid', true, false],
    ['logins', true, false],
    ['reminders', true, false],
    ['voices', true, false],
    ['notifications', true, false],
    ['partners', false, true],
    ['telegram', false, false],
  ];

  it.each(CARDS)('?open=%s — settings: %s, referral: %s, якорь своей карточки', (card, settings, referral) => {
    expect(profileTarget(`?open=${card}`)).toEqual({ settings, referral, anchor: profileCardAnchor(card) });
  });

  it('перечень карточек — ровно эти девять', () => {
    expect([...PROFILE_CARDS].sort()).toEqual(CARDS.map(([c]) => c).sort());
  });

  it('?settings=1 — раскрыть «Настройки» без прокрутки (так шлёт виджет лаунчера)', () => {
    expect(profileTarget('?settings=1')).toEqual({ settings: true, referral: false, anchor: null });
  });

  it('незнакомая карточка и пустой адрес — ничего не раскрывать', () => {
    expect(profileTarget('?open=integrations')).toEqual({ settings: false, referral: false, anchor: null });
    expect(profileTarget('')).toEqual({ settings: false, referral: false, anchor: null });
  });

  it('карточка важнее ?settings: прокрутка нужна к ней', () => {
    expect(profileTarget('?settings=1&open=zoom')).toEqual({
      settings: true,
      referral: false,
      anchor: profileCardAnchor('zoom'),
    });
  });

  // Находка ревью (M1): до ссылок на карточки ?settings раскрывал «Настройки»
  // при любом ?open, и виджет лаунчера на это полагался.
  it('?settings рядом с карточкой вне «Настроек» раскрывает и их', () => {
    expect(profileTarget('?settings=1&open=telegram')).toEqual({
      settings: true,
      referral: false,
      anchor: profileCardAnchor('telegram'),
    });
    expect(profileTarget('?settings=1&open=partners')).toEqual({
      settings: true,
      referral: true,
      anchor: profileCardAnchor('partners'),
    });
  });

  // Находка ревью (I3): GFM-автоссылка забирает в адрес знак вплотную за ним.
  it.each([
    '?open=zoom%EF%BC%89',
    '?open=zoom%E3%80%82',
    '?open=zoom）',
    '?open=zoom;',
    '?open=zoom%E3%80%82%E7%84%B6%E5%90%8E',
  ])('%s — всё равно карточка Zoom', (search) => {
    expect(profileTarget(search)).toEqual({ settings: true, referral: false, anchor: profileCardAnchor('zoom') });
  });

  it('буквы сверх названия карточки — уже не карточка', () => {
    expect(profileTarget('?open=zoomx').anchor).toBeNull();
  });

  it('якоря у карточек разные', () => {
    expect(new Set(PROFILE_CARDS.map(profileCardAnchor)).size).toBe(PROFILE_CARDS.length);
  });
});

describe('deepSectionLink — канонический адрес для входа', () => {
  it('лишние параметры отбрасываются', () => {
    expect(deepSectionLink('/profile', '?open=zoom&zoom_connect=ok&utm_source=kb')).toBe('/profile?open=zoom');
    expect(deepSectionLink('/studio', '?tab=bots&utm=1')).toBe('/studio?tab=bots');
    expect(deepSectionLink('/profile', '?settings=yes')).toBe('/profile?settings=1');
  });

  it('повтор параметра — не угадываем', () => {
    expect(deepSectionLink('/studio', '?tab=bots&tab=products')).toBeNull();
    expect(deepSectionLink('/profile', '?open=zoom&open=talerid')).toBeNull();
  });

  it('знак вплотную за адресом — тот же канонический адрес', () => {
    expect(deepSectionLink('/profile', '?open=zoom%EF%BC%89')).toBe('/profile?open=zoom');
    expect(deepSectionLink('/studio', '?tab=bots%E3%80%82')).toBe('/studio?tab=bots');
    expect(deepSectionLink('/studio', '?tab=productsx')).toBeNull();
  });

  it('чужие разделы и вкладки — null', () => {
    expect(deepSectionLink('/studio', '?tab=agents')).toBeNull();
    expect(deepSectionLink('/admin', '?tab=products')).toBeNull();
    expect(deepSectionLink('/settings', '?open=zoom')).toBeNull();
    expect(deepSectionLink('//evil.example/profile', '?open=zoom')).toBeNull();
  });
});

describe('legacyProfilePath — старые /settings и /referral', () => {
  const CASES: ['settings' | 'referral', string, string][] = [
    ['settings', '', '/profile?settings=1'],
    ['settings', '?open=zoom', '/profile?open=zoom'],
    ['settings', '?linked=1', '/profile?linked=1&settings=1'],
    ['settings', '?settings=1', '/profile?settings=1'],
    ['referral', '', '/profile?open=partners'],
    ['referral', '?ref=abc', '/profile?ref=abc&open=partners'],
    // Находка ревью (M1): незнакомое ?open — как без него, а не «своя карточка».
    ['settings', '?open=integrations', '/profile?open=integrations&settings=1'],
    ['referral', '?open=integrations', '/profile?open=partners'],
    ['settings', '?settings=1&open=telegram', '/profile?settings=1&open=telegram'],
  ];

  it.each(CASES)('/%s%s → %s', (from, search, to) => {
    expect(legacyProfilePath(from, search)).toBe(to);
  });
});

describe('cabinetPath — своя ссылка открывается в кабинете', () => {
  const HERE = 'my.linkeon.io';

  it.each([
    ['https://my.linkeon.io/profile?open=zoom', '/profile?open=zoom'],
    ['http://my.linkeon.io/studio?tab=bots', '/studio?tab=bots'],
    ['https://MY.LINKEON.IO/help', '/help'],
    ['https://my.linkeon.io/chat?view=tokens#top', '/chat?view=tokens#top'],
    ['https://my.linkeon.io/settings?open=zoom', '/settings?open=zoom'],
  ])('%s → %s', (href, path) => {
    expect(cabinetPath(href, HERE)).toBe(path);
  });

  it('свой стенд — тоже свой: тестовый сервер, локальная сборка', () => {
    expect(cabinetPath('https://test.linkeon.io/profile?open=zoom', 'test.linkeon.io')).toBe('/profile?open=zoom');
    expect(cabinetPath('http://localhost:5173/support', 'localhost:5173')).toBe('/support');
    expect(cabinetPath('https://test.linkeon.io/profile', HERE)).toBeNull();
  });

  it.each([
    'https://my.linkeon.io/',
    'https://my.linkeon.io/static/generated/a.png',
    'https://my.linkeon.io/smm-media/linkeon-assets/app/linkeon-android.apk',
    'https://my.linkeon.io/webhook/mcp/linkeon',
    'https://my.linkeon.io/tma/',
    'https://my.linkeon.io/room/ABC234',
    'https://my.linkeon.io.evil.example/profile',
    'https://my.linkeon.io@evil.example/profile',
    'https://evil.example/?next=https://my.linkeon.io/profile',
    'javascript:alert(1)',
    '/profile?open=zoom',
    'не адрес',
  ])('%s — не раздел кабинета', (href) => {
    expect(cabinetPath(href, HERE)).toBeNull();
  });

  // Путь, который вернул cabinetPath, идёт прямо в navigate(). Начнись он с
  // «//» или «/\», браузер прочёл бы его как адрес чужого сайта.
  it.each([
    '//evil.example/profile?open=zoom',
    '/\\evil.example/profile',
    'https://my.linkeon.io//evil.example/profile',
    'https://my.linkeon.io/\\evil.example/profile',
    'https:\\\\evil.example\\profile',
    'https://my.linkeon.io/profile/..//evil.example',
  ])('%s — не раздел кабинета: «//», «\\» и «/..//» не уводят на чужой хост', (href) => {
    expect(cabinetPath(href, HERE)).toBeNull();
  });
});

describe('chatLinkPath — куда вести ссылку из ответа в чате', () => {
  const HERE = 'my.linkeon.io';

  // Так ссылку отдаёт GFM-автоссылка: знак, забранный вплотную за адресом,
  // закодирован (поведение GFM закреплено в chat/cabinetLinksRender.test.tsx).
  it.each([
    ['https://my.linkeon.io/profile?open=zoom', '/profile?open=zoom'],
    ['https://my.linkeon.io/profile?open=zoom%EF%BC%89', '/profile?open=zoom'],
    ['https://my.linkeon.io/profile?open=zoom%E3%80%82', '/profile?open=zoom'],
    ['https://my.linkeon.io/support%E3%80%8D%EF%BC%9F', '/support'],
    ['https://my.linkeon.io/chat%C2%BB', '/chat'],
    ['https://my.linkeon.io/chat%E2%80%A6', '/chat'],
    ['https://my.linkeon.io/studio?tab=bots%E2%80%94', '/studio?tab=bots'],
    ['/profile?open=zoom', '/profile?open=zoom'],
    ['/chat', '/chat'],
  ])('%s → %s, в той же вкладке', (url, path) => {
    expect(chatLinkPath(url, HERE)).toBe(path);
  });

  // Находка ревью (I4): «//host» и «/\host» браузер читает как адрес чужого
  // сайта. Переход роутера туда (pushState на чужой домен падает, и роутер
  // уходит через location.assign) увёл бы вкладку кабинета.
  it.each([
    '//evil.example',
    '//evil.example/profile?open=zoom',
    '/\\evil.example',
    '/\\/evil.example',
    '/\t/evil.example',
    'https://evil.example/profile?open=zoom',
    'https://my.linkeon.io/static/generated/a.png',
    '/static/generated/a.png',
    'https://my.linkeon.io/room/ABC234',
    'javascript:alert(1)',
    'mailto:help@example.org',
    'profile?open=zoom',
  ])('%s — в новую вкладку', (url) => {
    expect(chatLinkPath(url, HERE)).toBeNull();
  });

  it('хвост пунктуации срезается только при проверке своего адреса', () => {
    // Чужой адрес открывается как дан: как он устроен, нам неизвестно.
    expect(chatLinkPath('https://example.org/a%E3%80%82', HERE)).toBeNull();
    // Знак внутри своего адреса — не хвост.
    expect(chatLinkPath('https://my.linkeon.io/chat?q=%E3%80%82x', HERE)).toBe('/chat?q=%E3%80%82x');
  });

  it('битая %-последовательность не роняет разбор', () => {
    expect(chatLinkPath('https://my.linkeon.io/chat?x=%E0%A4%A', HERE)).toBe('/chat?x=%E0%A4%A');
  });

  it('путь для роутера никогда не начинается с «//» или «/\\»', () => {
    for (const url of ['/chat', '/\\chat', '//chat', '/./\\x', '/%2F%2Fevil.example', 'https://my.linkeon.io//x']) {
      const path = chatLinkPath(url, HERE);
      if (path !== null) expect(path, url).toMatch(/^\/(?![/\\])/);
    }
  });
});

// Ссылку в ответе ассистента может подсунуть чужой текст (страница из
// поиска, файл), а {{link}} кладёт адрес в обработчик как есть. Чат
// открывает только веб-адреса: http(s) и относительные пути кабинета.
describe('isWebLink — чат открывает только веб-адреса', () => {
  it.each([
    'https://example.org/a',
    'http://example.org/a',
    'HTTPS://EXAMPLE.ORG/a',
    '  https://example.org/a',
    // Протокольно-относительный — тоже веб: откроется в новой вкладке (chatLinkPath его не пускает в роутер).
    '//evil.example',
    '/static/generated/a.png',
    '/profile?open=zoom',
    'profile?open=zoom',
    '#top',
  ])('%s — открывается', (url) => {
    expect(isWebLink(url)).toBe(true);
  });

  const SOH = String.fromCharCode(1);
  const NUL = String.fromCharCode(0);
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'JAVASCRIPT:alert(1)',
    ' javascript:alert(1)',
    '\tjavascript:alert(1)',
    '\njavascript:alert(1)',
    `${SOH}javascript:alert(1)`,
    `${NUL} javascript:alert(1)`,
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'DATA:text/html;base64,PHNjcmlwdD4=',
    ' data:text/html,x',
    'vbscript:msgbox(1)',
    'VBScript:msgbox(1)',
    'file:///etc/passwd',
    'FILE://host/share',
    'blob:https://my.linkeon.io/0b9e1c2a-0000-4000-8000-000000000000',
    'mailto:help@example.org',
    'tel:000',
    'ftp://example.org/f',
    'about:blank',
    'intent://x#Intent;end',
    '',
    '   ',
  ])('%j — не открывается вовсе: ни переходом роутера, ни новой вкладкой', (url) => {
    expect(isWebLink(url)).toBe(false);
    expect(chatLinkPath(url, 'my.linkeon.io')).toBeNull();
  });
});
