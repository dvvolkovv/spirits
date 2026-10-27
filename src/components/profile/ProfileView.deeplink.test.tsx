// @vitest-environment jsdom
//
// Ссылка ассистента на карточку профиля (/profile?open=<карточка>) обязана
// раскрыть нужный блок и прокрутить к ЭТОЙ карточке. Проверяем по экрану:
// раскрыт ли блок (видна ли заглушка карточки) и к какому элементу ушла
// прокрутка. Карточки настроек заглушены — они тянут свои ручки и к проверке
// отношения не имеют; SettingsView настоящий: якоря живут в нём.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { actAsync, byButton, click, clickAsync, flush, mount, tRu, visibleText, type Mounted } from '../../test/dom';
import { PROFILE_CARDS, profileCardAnchor, type ProfileCard } from '../../utils/cabinetSections';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
// Выход и удаление аккаунта гасят вход так же, как AuthContext: экран
// переключает оболочка SignedInShell ниже.
const auth = vi.hoisted(() => ({ signOut: () => {} }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    // Без телефона: профиль и аватар с сервера не грузятся — здесь они ни к чему.
    user: { firstName: 'Тест' },
    updateUserInfo: () => {},
    updateAvatar: () => {},
    logout: () => auth.signOut(),
    // Как настоящий: вход гаснет после ответа сервера, а не в том же такте.
    deleteProfile: async () => {
      await Promise.resolve();
      auth.signOut();
    },
  }),
}));
vi.mock('../onboarding/LoginTabs', () => ({ default: () => null }));
vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: async () => ({ ok: false, json: async () => ({}) }),
    post: async () => ({ ok: false, json: async () => ({}) }),
    request: async () => ({ ok: false }),
  },
}));
vi.mock('../../services/tgBotApi', () => ({ tgBotApi: { identityStatus: async () => ({ bound: false }) } }));
vi.mock('../../services/pushClient', () => ({
  pushSupported: () => false,
  isPushSubscribed: async () => false,
  enablePush: async () => false,
  disablePush: async () => true,
  sendTestPush: async () => false,
}));
vi.mock('./ReferralDashboard', () => ({ default: () => 'ПАНЕЛЬ-ПАРТНЁРОВ' }));
vi.mock('./ProfileTasks', () => ({ default: () => null }));
vi.mock('./BusinessCard', () => ({ default: () => null }));
vi.mock('./InviteFriendBlock', () => ({ default: () => null }));
vi.mock('../settings/LanguageSelect', () => ({ LanguageSelect: () => null }));
vi.mock('../settings/RoutinesManager', () => ({ default: () => 'КАРТОЧКА-НАПОМИНАНИЙ' }));
vi.mock('../settings/TalerIdEcosystemCard', () => ({ default: () => 'КАРТОЧКА-TALERID' }));
vi.mock('../settings/ZoomConnectCard', () => ({ default: () => 'КАРТОЧКА-ZOOM' }));
vi.mock('../settings/CalendarSourcesCard', () => ({ default: () => 'КАРТОЧКА-КАЛЕНДАРЕЙ' }));
vi.mock('../settings/VoiceSettings', () => ({ default: () => 'КАРТОЧКА-ГОЛОСОВ' }));
vi.mock('../settings/LinkedAccountsView', () => ({ default: () => 'КАРТОЧКА-ВХОДА' }));

import ProfileView from './ProfileView';
import OnboardingPage from '../../pages/OnboardingPage';

let view: Mounted | null = null;
const scrolledTo: string[] = [];
const scrollOptions: unknown[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  scrolledTo.length = 0;
  scrollOptions.length = 0;
  // jsdom не прокручивает: записываем, к какому элементу ушла прокрутка и как.
  Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
    scrolledTo.push(this.id);
    scrollOptions.push(options);
  };
});

afterEach(() => {
  view?.unmount();
  view = null;
  vi.useRealTimers();
});

async function open(url: string): Promise<string> {
  view = mount(
    <MemoryRouter initialEntries={[url]}>
      <ProfileView />
    </MemoryRouter>,
  );
  await flush();
  await flush();
  // Прокрутка — через 350 мс после монтирования: раскрытый блок успевает нарисоваться.
  await actAsync(() => {
    vi.advanceTimersByTime(400);
  });
  return visibleText(view.container);
}

/** Что лежит внутри якоря — по нему видно, что якорь обнимает свою карточку. */
const anchored = (anchor: string): string =>
  view?.container.querySelector(`[id="${anchor}"]`)?.textContent ?? '';

const SETTINGS_CARDS: [ProfileCard, string][] = [
  ['calendars', 'КАРТОЧКА-КАЛЕНДАРЕЙ'],
  ['zoom', 'КАРТОЧКА-ZOOM'],
  ['talerid', 'КАРТОЧКА-TALERID'],
  ['logins', 'КАРТОЧКА-ВХОДА'],
  ['reminders', 'КАРТОЧКА-НАПОМИНАНИЙ'],
  ['voices', 'КАРТОЧКА-ГОЛОСОВ'],
];

describe('ссылка на карточку «Моего профиля»', () => {
  it.each(SETTINGS_CARDS)('?open=%s раскрывает «Настройки» и прокручивает к своей карточке', async (card, stub) => {
    const screen = await open(`/profile?open=${card}`);
    expect(screen).toContain(stub);
    expect(scrolledTo).toEqual([profileCardAnchor(card)]);
    expect(anchored(profileCardAnchor(card))).toBe(stub);
  });

  it('?open=notifications — к уведомлениям на этом устройстве', async () => {
    await open('/profile?open=notifications');
    expect(scrolledTo).toEqual([profileCardAnchor('notifications')]);
    expect(anchored(profileCardAnchor('notifications'))).toContain(tRu('settings.push.title'));
  });

  it('?open=partners раскрывает «Партнёры», «Настройки» остаются свёрнутыми', async () => {
    const screen = await open('/profile?open=partners');
    expect(screen).toContain('ПАНЕЛЬ-ПАРТНЁРОВ');
    expect(screen).not.toContain('КАРТОЧКА-ZOOM');
    expect(scrolledTo).toEqual([profileCardAnchor('partners')]);
  });

  it('?open=telegram — к карточке Telegram, ничего не раскрывая', async () => {
    const screen = await open('/profile?open=telegram');
    expect(screen).not.toContain('КАРТОЧКА-ZOOM');
    expect(screen).not.toContain('ПАНЕЛЬ-ПАРТНЁРОВ');
    expect(scrolledTo).toEqual([profileCardAnchor('telegram')]);
    expect(anchored(profileCardAnchor('telegram'))).toContain(tRu('profile.telegram_not_bound'));
  });

  it('?settings=1 раскрывает «Настройки», но никуда не прокручивает', async () => {
    const screen = await open('/profile?settings=1');
    expect(screen).toContain('КАРТОЧКА-ZOOM');
    expect(scrolledTo).toEqual([]);
  });

  // Находка ревью (M1): ?settings раскрывает «Настройки» и рядом с карточкой
  // вне их — как до ссылок на карточки.
  it('?settings=1&open=telegram — «Настройки» раскрыты, прокрутка к Telegram', async () => {
    const screen = await open('/profile?settings=1&open=telegram');
    expect(screen).toContain('КАРТОЧКА-ZOOM');
    expect(scrolledTo).toEqual([profileCardAnchor('telegram')]);
  });

  it('?settings=1&open=partners — раскрыты и «Настройки», и «Партнёры»', async () => {
    const screen = await open('/profile?settings=1&open=partners');
    expect(screen).toContain('КАРТОЧКА-ZOOM');
    expect(screen).toContain('ПАНЕЛЬ-ПАРТНЁРОВ');
    expect(scrolledTo).toEqual([profileCardAnchor('partners')]);
  });

  // Находка ревью (I3): знак вплотную за адресом автоссылка забрала в параметр.
  it.each(['/profile?open=zoom）', '/profile?open=zoom%E3%80%82'])('%s — всё равно карточка Zoom', async (url) => {
    const screen = await open(url);
    expect(screen).toContain('КАРТОЧКА-ZOOM');
    expect(scrolledTo).toEqual([profileCardAnchor('zoom')]);
  });

  it.each(['/profile', '/profile?open=integrations'])('%s — всё свёрнуто, без прокрутки', async (url) => {
    const screen = await open(url);
    expect(screen).not.toContain('КАРТОЧКА-ZOOM');
    expect(screen).not.toContain('ПАНЕЛЬ-ПАРТНЁРОВ');
    expect(scrolledTo).toEqual([]);
  });

  // Карточка, которую называет ссылка, но якоря у которой на экране нет, —
  // тихий провал: профиль откроется, а прокрутка уйдёт в никуда.
  it.each([...PROFILE_CARDS])('у карточки %s есть якорь на экране', async (card) => {
    await open(`/profile?open=${card}`);
    expect(view?.container.querySelector(`[id="${profileCardAnchor(card)}"]`)).not.toBeNull();
  });
});

// Находка ревью (I2): к карточке прокручиваем один раз, а блоки над ней ещё
// дорастают (анкета, карточки настроек со своими запросами) — и карточка
// уезжает. Позицию доводим, пока человек не взялся за страницу сам.
describe('прокрутка к карточке', () => {
  const content = () => view!.container.querySelector('[data-testid="profile-content"]')!;

  it('к началу карточки: у якорей scroll-mt-4', async () => {
    await open('/profile?open=zoom');
    expect(scrollOptions).toEqual([{ behavior: 'smooth', block: 'start' }]);
  });

  it('без вмешательства позиция доводится ещё раз — к той же карточке', async () => {
    await open('/profile?open=zoom');
    await actAsync(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(scrolledTo.length).toBeGreaterThan(1);
    expect(new Set(scrolledTo)).toEqual(new Set([profileCardAnchor('zoom')]));
  });

  it.each(['touchstart', 'wheel', 'keydown'])('человек взялся сам (%s) — доводка отменяется', async (type) => {
    await open('/profile?open=zoom');
    content().dispatchEvent(new Event(type, { bubbles: true }));
    await actAsync(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(scrolledTo).toEqual([profileCardAnchor('zoom')]);
  });
});

// Переходы внутри кабинета, пока профиль открыт: ссылка из поддержки или из
// чата поверх профиля, возврат от Zoom.
let go: (to: string) => void = () => {};
const Nav = () => {
  go = useNavigate();
  return null;
};

async function openWithNav(url: string): Promise<HTMLElement> {
  view = mount(
    <MemoryRouter initialEntries={[url]}>
      <ProfileView />
      <Nav />
    </MemoryRouter>,
  );
  await flush();
  await flush();
  await actAsync(() => {
    vi.advanceTimersByTime(400);
  });
  return view.container;
}

async function navigateTo(url: string): Promise<void> {
  await actAsync(() => go(url));
  await actAsync(() => {
    vi.advanceTimersByTime(400);
  });
}

describe('ссылка на карточку, когда профиль уже открыт', () => {
  // Находка ревью (M2): эффект зависел только от search, и та же ссылка ещё
  // раз ничего не делала — свёрнутые человеком «Настройки» так и оставались
  // свёрнутыми, прокрутки не было.
  it('повтор той же ссылки раскрывает и прокручивает снова', async () => {
    const c = await openWithNav('/profile?open=zoom');
    click(byButton(c, new RegExp(`^${tRu('settings.title')}$`))!);
    expect(visibleText(c)).not.toContain('КАРТОЧКА-ZOOM');
    scrolledTo.length = 0;

    await navigateTo('/profile?open=zoom');
    expect(visibleText(c)).toContain('КАРТОЧКА-ZOOM');
    expect(scrolledTo).toEqual([profileCardAnchor('zoom')]);
  });

  // Находка ревью (M5): смену адреса без перемонтирования не проверял никто.
  it('смена адреса без перемонтирования раскрывает и прокручивает', async () => {
    const c = await openWithNav('/profile');
    expect(scrolledTo).toEqual([]);

    await navigateTo('/profile?open=partners');
    expect(visibleText(c)).toContain('ПАНЕЛЬ-ПАРТНЁРОВ');
    expect(scrolledTo).toEqual([profileCardAnchor('partners')]);
  });
});

// Как App.tsx: вошёл — кабинет, вышел — экран входа на том же адресе.
function SignedInShell() {
  const [signedIn, setSignedIn] = useState(true);
  auth.signOut = () => setSignedIn(false);
  return signedIn ? <ProfileView /> : <OnboardingPage />;
}

const Where = () => {
  const l = useLocation();
  return <div data-where>{`${l.pathname}${l.search}`}</div>;
};

// Находка ревью (I1): экран входа встаёт на текущий адрес и запоминает его
// как намерение (OnboardingPage → loginIntent). Выход с /profile?settings=1
// оставлял pending_destination, и следующий вход на этом устройстве — уже
// другого человека — открывал настройки.
describe('выход и удаление аккаунта с адреса раздела', () => {
  const realConfirm = window.confirm;

  beforeEach(() => {
    localStorage.clear();
    window.confirm = () => true;
  });
  afterEach(() => {
    window.confirm = realConfirm;
  });

  async function openSignedIn(url: string): Promise<HTMLElement> {
    view = mount(
      <MemoryRouter initialEntries={[url]}>
        <SignedInShell />
        <Where />
      </MemoryRouter>,
    );
    await flush();
    await flush();
    return view.container;
  }

  const signedOut = (c: HTMLElement) => c.querySelector('[data-testid="onboarding-root"]') !== null;

  it.each(['/profile?settings=1', '/profile?open=zoom'])('выход с %s не оставляет раздел следующему входу', async (url) => {
    const c = await openSignedIn(url);
    click(byButton(c, new RegExp(`^${tRu('settings.logout')}$`))!);
    await flush();
    expect(signedOut(c)).toBe(true);
    expect(localStorage.getItem('pending_destination')).toBeNull();
    expect(c.querySelector('[data-where]')?.textContent).toBe('/chat');
  });

  it('удаление аккаунта с /profile?open=zoom не оставляет раздел следующему входу', async () => {
    const c = await openSignedIn('/profile?open=zoom');
    click(byButton(c, new RegExp(`^${tRu('settings.delete_account')}$`))!);
    await clickAsync(byButton(c, new RegExp(`^${tRu('profile.delete_confirm_button')}$`))!);
    await flush();
    expect(signedOut(c)).toBe(true);
    expect(localStorage.getItem('pending_destination')).toBeNull();
  });
});
