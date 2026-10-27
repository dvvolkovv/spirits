import { describe, expect, it } from 'vitest';
import {
  PROFILE_CARDS,
  SECTION_LINKS,
  cabinetPath,
  deepSectionLink,
  legacyProfilePath,
  profileCardAnchor,
  profileTarget,
  type ProfileCard,
  type ProfileTarget,
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

describe('profileTarget — что сделать «Моему профилю»', () => {
  const CARDS: [ProfileCard, ProfileTarget['expand']][] = [
    ['calendars', 'settings'],
    ['zoom', 'settings'],
    ['talerid', 'settings'],
    ['logins', 'settings'],
    ['reminders', 'settings'],
    ['voices', 'settings'],
    ['notifications', 'settings'],
    ['partners', 'referral'],
    ['telegram', null],
  ];

  it.each(CARDS)('?open=%s — блок %s и якорь своей карточки', (card, expand) => {
    expect(profileTarget(`?open=${card}`)).toEqual({ expand, anchor: profileCardAnchor(card) });
  });

  it('перечень карточек — ровно эти девять', () => {
    expect([...PROFILE_CARDS].sort()).toEqual(CARDS.map(([c]) => c).sort());
  });

  it('?settings=1 — раскрыть «Настройки» без прокрутки (так шлёт виджет лаунчера)', () => {
    expect(profileTarget('?settings=1')).toEqual({ expand: 'settings', anchor: null });
  });

  it('незнакомая карточка и пустой адрес — ничего не раскрывать', () => {
    expect(profileTarget('?open=integrations')).toEqual({ expand: null, anchor: null });
    expect(profileTarget('')).toEqual({ expand: null, anchor: null });
  });

  it('карточка важнее ?settings: прокрутка нужна к ней', () => {
    expect(profileTarget('?settings=1&open=zoom')).toEqual({ expand: 'settings', anchor: profileCardAnchor('zoom') });
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
});
