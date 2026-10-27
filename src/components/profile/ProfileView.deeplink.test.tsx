// @vitest-environment jsdom
//
// Ссылка ассистента на карточку профиля (/profile?open=<карточка>) обязана
// раскрыть нужный блок и прокрутить к ЭТОЙ карточке. Проверяем по экрану:
// раскрыт ли блок (видна ли заглушка карточки) и к какому элементу ушла
// прокрутка. Карточки настроек заглушены — они тянут свои ручки и к проверке
// отношения не имеют; SettingsView настоящий: якоря живут в нём.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { actAsync, flush, mount, tRu, visibleText, type Mounted } from '../../test/dom';
import { PROFILE_CARDS, profileCardAnchor, type ProfileCard } from '../../utils/cabinetSections';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    // Без телефона: профиль и аватар с сервера не грузятся — здесь они ни к чему.
    user: { firstName: 'Тест' },
    updateUserInfo: () => {},
    updateAvatar: () => {},
    logout: () => {},
    deleteProfile: async () => {},
  }),
}));
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

let view: Mounted | null = null;
const scrolledTo: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  scrolledTo.length = 0;
  // jsdom не прокручивает: записываем, к какому элементу ушла прокрутка.
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolledTo.push(this.id);
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
