// @vitest-environment jsdom
//
// Человек со страницы ассистента на linkeon.io приходит в кабинет по ссылке
// /chat?assistant=<id>. Новичка (onboarded === false) раньше встречал экран
// «С чего начнём?», даже когда ассистент уже выбран, а после входа параметр
// терялся вовсе. Тесты смотрят на экран — что человек видит.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { flush, mount, tRu, visibleText, type Mounted } from '../test/dom';

const AGENTS = [
  { id: 12, name: 'Роман', displayName: 'Роман', description: 'Помогаю делать все, что не могут другие', category: 'assistant' },
  { id: 2, name: 'Оля', displayName: 'Оля', description: 'Психолог и фасилитатор самоисследования', category: 'personal' },
  { id: 14, name: 'Райя', displayName: 'Райя', description: 'Human Design ридер', category: 'personal' },
];

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
  default: (p: { preSelectedAssistant: { displayName?: string } | null; welcomeMessage?: string }) => (
    <div data-testid="chat">
      чат: {p.preSelectedAssistant?.displayName ?? 'без ассистента'} | {p.welcomeMessage}
    </div>
  ),
}));

import ChatPage from './ChatPage';

const PICKER = tRu('onboarding.match.subtitle');
let view: Mounted | null = null;

async function open(url: string): Promise<string> {
  view = mount(
    <MemoryRouter initialEntries={[url]}>
      <ChatPage />
    </MemoryRouter>,
  );
  // Список ассистентов приходит промисом, выбор применяется эффектом после него.
  for (let i = 0; i < 6; i++) await flush();
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
});
