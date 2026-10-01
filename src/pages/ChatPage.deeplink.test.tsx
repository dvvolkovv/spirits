// @vitest-environment jsdom
//
// Человек со страницы ассистента на linkeon.io приходит в кабинет по ссылке
// /chat?assistant=<id>. Новичка (onboarded === false) раньше встречал экран
// «С чего начнём?», даже когда ассистент уже выбран, а после входа параметр
// терялся вовсе. Тесты смотрят на экран — что человек видит.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { actAsync, byButton, click, flush, mount, tRu, visibleText, type Mounted } from '../test/dom';

const AGENTS = [
  { id: 12, name: 'Роман', displayName: 'Роман', description: 'Помогаю делать все, что не могут другие', category: 'assistant' },
  { id: 2, name: 'Оля', displayName: 'Оля', description: 'Психолог и фасилитатор самоисследования', category: 'personal' },
  { id: 14, name: 'Райя', displayName: 'Райя', description: 'Human Design ридер', category: 'personal' },
];
type Agent = (typeof AGENTS)[number];
// Форма ответа мока apiClient.get в тестах — не настоящий Response (у него
// нет headers/status/clone/…), поэтому отложенный промис типизируем явно
// этим типом, а не выводом из реальной сигнатуры apiClient.get.
type AgentsResponse = { ok: boolean; json: () => Promise<typeof AGENTS> };

const auth = vi.hoisted(() => ({
  user: { onboarded: false } as { onboarded?: boolean },
  completeOnboarding: vi.fn(async () => {}),
}));

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../services/apiClient', () => ({
  apiClient: { get: vi.fn(async () => ({ ok: true, json: async () => AGENTS })) },
}));
vi.mock('../services/avatarService', () => ({ avatarService: { getAvatarUrl: vi.fn(async () => '') } }));
vi.mock('../services/customAgentsApi', () => ({ customAgentsApi: { list: vi.fn(async () => []) } }));
vi.mock('../components/tokens/TokenPackages', () => ({ TokenPackages: () => null }));
vi.mock('../components/chat/ChatInterface', () => ({
  default: (p: {
    preSelectedAssistant: { displayName?: string } | null;
    welcomeMessage?: string;
    onAssistantSelected?: (a: Agent) => void;
  }) => (
    <div data-testid="chat">
      чат: {p.preSelectedAssistant?.displayName ?? 'без ассистента'} | {p.welcomeMessage}
      {/* Переключение собеседника БЕЗ выхода из чата — тем же путём, которым
          приветствие одного ассистента утекало в чат другого. */}
      <button onClick={() => p.onAssistantSelected?.(AGENTS[1])}>выбрать Олю</button>
    </div>
  ),
}));

import ChatPage from './ChatPage';
import { apiClient } from '../services/apiClient';

const PICKER = tRu('onboarding.match.subtitle');
let view: Mounted | null = null;
let lastUrl: string | null = null;

// Функция, а не сохранённый элемент: React бросает ПОЛНЫЙ bailout, если
// root.render() вызвать второй раз с ТЕМ ЖЕ объектом элемента (в HostRoot
// nextChildren === prevChildren по ссылке) — тогда ни один компонент дерева
// не перерисовывается, и мутация внешнего мока (auth.user) до ChatPage
// никогда не доходит. Здесь каждый вызов строит новый объект с тем же
// маршрутом — React не бастует, а MemoryRouter всё равно не сбрасывает
// историю: initialEntries читается только в его ленивом инициализаторе.
function page(url: string) {
  return (
    <MemoryRouter initialEntries={[url]}>
      <ChatPage />
    </MemoryRouter>
  );
}

async function open(url: string): Promise<string> {
  lastUrl = url;
  view = mount(page(url));
  // Список ассистентов приходит промисом, выбор применяется эффектом после него.
  for (let i = 0; i < 6; i++) await flush();
  return visibleText(view.container);
}

/** Перерисовать тот же экран (после open) и дождаться эффектов — напр. когда профиль догрузился позже. */
async function rerenderAndFlush(): Promise<string> {
  if (!view || lastUrl === null) throw new Error('сначала нужно открыть страницу через open()');
  view.rerender(page(lastUrl));
  await flush();
  return visibleText(view.container);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  auth.user = { onboarded: false };
  auth.completeOnboarding.mockClear();
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

afterEach(() => {
  view?.unmount();
  view = null;
  lastUrl = null;
});

describe('новичок пришёл к конкретному ассистенту', () => {
  it('?assistant=14 — сразу чат с Райей, без экрана выбора темы', async () => {
    const text = await open('/chat?assistant=14');
    expect(text).not.toContain(PICKER);
    expect(text).toContain('чат: Райя');
    expect(text).toContain('Я Райя');
    expect(auth.completeOnboarding).toHaveBeenCalled();
  });

  it('выбор, запомненный до входа, открывает Райю и стирается', async () => {
    localStorage.setItem('pending_assistant', JSON.stringify({ value: '14', expires: Date.now() + 60_000 }));
    const text = await open('/chat');
    expect(text).not.toContain(PICKER);
    expect(text).toContain('чат: Райя');
    expect(localStorage.getItem('pending_assistant')).toBeNull();
    expect(auth.completeOnboarding).toHaveBeenCalled();
  });

  it('профиль пришёл позже списка ассистентов — онбординг закрывается после подгрузки флага', async () => {
    // onboarded ещё неизвестен (профиль не догрузился) — fail-open в чат,
    // но закрывать онбординг рано: неизвестно, нужно ли это вообще.
    auth.user = {};
    const text1 = await open('/chat?assistant=14');
    expect(text1).not.toContain(PICKER);
    expect(auth.completeOnboarding).not.toHaveBeenCalled();

    // Профиль догрузился ПОСЛЕ того, как deep-link уже применился.
    auth.user = { onboarded: false };
    const text2 = await rerenderAndFlush();
    expect(auth.completeOnboarding).toHaveBeenCalled();
    expect(text2).not.toContain(PICKER);
    expect(text2).toContain('чат: Райя');
  });
});

describe('всё остальное — как раньше', () => {
  it('новичок без ссылки видит экран выбора темы', async () => {
    expect(await open('/chat')).toContain(PICKER);
  });

  it('просроченный выбор не мешает экрану выбора темы', async () => {
    localStorage.setItem('pending_assistant', JSON.stringify({ value: '14', expires: Date.now() - 1 }));
    expect(await open('/chat')).toContain(PICKER);
  });

  it('вернувшийся человек по ссылке попадает в чат, онбординг не трогается', async () => {
    auth.user = { onboarded: true };
    const text = await open('/chat?assistant=14');
    expect(text).toContain('чат: Райя');
    expect(auth.completeOnboarding).not.toHaveBeenCalled();
  });

  it('resume важнее запомненного выбора, но запомненное всё равно стирается', async () => {
    auth.user = { onboarded: true };
    localStorage.setItem('linkeon_last_assistant', JSON.stringify(AGENTS[1])); // Оля — «Продолжить»
    localStorage.setItem('pending_assistant', JSON.stringify({ value: '14', expires: Date.now() + 60_000 })); // Райя — запомнена до входа
    const text = await open('/chat?resume=1');
    expect(text).toContain('чат: Оля');
    expect(localStorage.getItem('pending_assistant')).toBeNull();
  });
});

describe('неизвестный ассистент в ссылке', () => {
  it('новичку — обычный экран тем, онбординг не закрывается', async () => {
    // Ассистента сняли с ростера после выката лендинга — ссылка на linkeon.io
    // ведёт на id, которого уже нет. Человек ничего не выбрал: это не должно
    // выглядеть как выбор.
    const text = await open('/chat?assistant=999');
    expect(text).toContain(PICKER);
    expect(auth.completeOnboarding).not.toHaveBeenCalled();
  });
});

describe('приветствие привязано к ассистенту, не к странице', () => {
  it('не перетекает к другому ассистенту при переключении внутри чата', async () => {
    auth.user = { onboarded: true };
    const text1 = await open('/chat?assistant=14');
    expect(text1).toContain('Я Райя');

    const switchButton = byButton(view!.container, /выбрать Олю/);
    expect(switchButton).not.toBeNull();
    click(switchButton!);
    await flush();

    const text2 = visibleText(view!.container);
    expect(text2).toContain('чат: Оля');
    expect(text2).not.toContain('Я Райя');
  });
});

describe('исход ссылки сообщается всегда — новичок не застревает без экрана тем', () => {
  it('пустой ?assistant= — не ссылка: новичок видит экран выбора темы', async () => {
    const text = await open('/chat?assistant=');
    expect(text).toContain(PICKER);
    expect(auth.completeOnboarding).not.toHaveBeenCalled();
  });

  it('пока список грузится, экран тем не мелькает', async () => {
    // Ответ списка откладываем: пока он не пришёл, ChatLayout не прогнал
    // deep-link-эффект ни разу, и deepLink в ChatPage должен оставаться
    // 'pending' (не 'none') — иначе экран тем мигнёт поверх открывающегося чата.
    let resolveAgents!: (v: AgentsResponse) => void;
    const deferred = new Promise<AgentsResponse>((resolve) => { resolveAgents = resolve; });
    // apiClient.get в реальной сигнатуре отдаёт Promise<Response> — мок отдаёт
    // облегчённую форму (см. AgentsResponse выше), отсюда честное приведение
    // на границе мока, а не подгонка типа самого промиса.
    vi.mocked(apiClient.get).mockImplementationOnce(
      () => deferred as unknown as ReturnType<typeof apiClient.get>,
    );

    view = mount(page('/chat?assistant=14'));
    await flush();
    expect(visibleText(view.container)).not.toContain(PICKER);

    resolveAgents({ ok: true, json: async () => AGENTS });
    for (let i = 0; i < 6; i++) await flush();
    const text = visibleText(view.container);
    expect(text).toContain('чат: Райя');
    expect(text).not.toContain(PICKER);
  });

  it('ссылка исчезла до загрузки списка (resume забрал запись, совпадения нет) — новичку экран тем', async () => {
    // deepLink стартует как 'pending' из-за непросроченной записи. Ветка resume
    // забирает её первой (?resume=1 важнее запомненного), linkeon_last_assistant
    // пуст — никого не находит. Исход должен прийти null, а не оставить
    // deepLink в 'pending' навечно (тогда экран тем не показался бы никогда).
    localStorage.setItem('pending_assistant', JSON.stringify({ value: '14', expires: Date.now() + 60_000 }));
    const text = await open('/chat?resume=1');
    expect(text).toContain(PICKER);
    expect(auth.completeOnboarding).not.toHaveBeenCalled();
  });
});

describe('повторный прогон без ссылки после применения не отменяет выбор', () => {
  it('SMS-вход: список и ?assistant= применились раньше навигации на голый /chat, профиль догрузился позже', async () => {
    // Сценарий входа по SMS: ChatLayout успевает получить список и применить
    // ?assistant=14 ДО того, как SmsLoginPane убирает параметр из адреса своим
    // navigate('/chat', { replace: true }) — а ответ профиля (onboarded)
    // приходит ещё позже этого. Смена адреса меняет location.key/search и
    // заново прогоняет deep-link-эффект ChatLayout; без защёлки settledRef
    // этот повторный прогон (ни ссылки, ни resume) сообщил бы родителю null
    // поверх уже сделанного выбора — запоздавший профиль открыл бы экран тем
    // над чатом Райи и не закрыл бы онбординг.
    auth.user = {}; // профиль ещё не догрузился
    localStorage.setItem('pending_assistant', JSON.stringify({ value: '14', expires: Date.now() + 60_000 }));

    // useNavigate() изнутри того же дерева — нужен РЕАЛЬНЫЙ переход (меняющий
    // location.key), а не просто новый проп у MemoryRouter: так SmsLoginPane
    // убирает ?assistant= из адреса после входа.
    let nav: ReturnType<typeof useNavigate> | null = null;
    const NavGrab = () => { nav = useNavigate(); return null; };

    view = mount(
      <MemoryRouter initialEntries={['/chat?assistant=14']}>
        <NavGrab />
        <ChatPage />
      </MemoryRouter>,
    );
    for (let i = 0; i < 6; i++) await flush();
    expect(visibleText(view.container)).toContain('чат: Райя');

    await actAsync(() => nav?.('/chat', { replace: true }));
    for (let i = 0; i < 3; i++) await flush();

    // Профиль догрузился позже навигации — новичок, onboarded явно false.
    auth.user = { onboarded: false };
    view.rerender(
      <MemoryRouter initialEntries={['/chat']}>
        <NavGrab />
        <ChatPage />
      </MemoryRouter>,
    );
    for (let i = 0; i < 3; i++) await flush();

    const text = visibleText(view.container);
    expect(text).toContain('чат: Райя');
    expect(text).not.toContain(PICKER);
    expect(auth.completeOnboarding).toHaveBeenCalled();
  });
});
