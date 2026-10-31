// src/components/guest/GuestChatPage.test.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { byButton, click, flush, mount, visibleText, type Mounted } from '../../test/dom';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../../pages/OnboardingPage', () => ({ default: () => <div>экран входа</div> }));
vi.mock('../../services/avatarService', () => ({ avatarService: { getAvatarUrl: vi.fn(async () => '') } }));
vi.mock('../../services/eventsClient', () => ({ track: vi.fn() }));
// Доп. A7: кнопка-заглушка, которая зовёт onBusyChange(true) — проверить, что
// страница гасит «Войти» в шапке, пока идёт (по мнению заглушки) ход.
vi.mock('./GuestChat', () => ({
  default: (p: any) => (
    <div>
      <div>чат:{p.assistantId}:{p.assistantName}:{p.initialMessages.length}:{p.draft?.text ?? ''}</div>
      <button type="button" onClick={() => p.onBusyChange?.(true)}>ход идёт (мок)</button>
    </div>
  ),
}));
vi.mock('./guestApi', () => ({ fetchGuestAgents: vi.fn(), loadGuestSession: vi.fn() }));

import { fetchGuestAgents, loadGuestSession } from './guestApi';
import GuestChatPage from './GuestChatPage';

const agents = fetchGuestAgents as unknown as ReturnType<typeof vi.fn>;
const session = loadGuestSession as unknown as ReturnType<typeof vi.fn>;
const TOKEN = 'T'.repeat(43);
const CONFIG = { mode: 'on' as const, answersPerTrial: 3, maxChars: 2000 };

let view: Mounted | null = null;
async function open(url: string) {
  view = mount(<MemoryRouter initialEntries={[url]}><GuestChatPage config={CONFIG} preview={false} /></MemoryRouter>);
  await flush();
  await flush();
}

/** Доп. B6: читает текущий ?assistant= из того же MemoryRouter — так тест
 * видит адрес, который видят оба потребителя (страница пробы и useEntryParams),
 * без выхода в настоящий window.location (MemoryRouter его не трогает). */
function LocationProbe() {
  const [sp] = useSearchParams();
  return <span data-testid="url-assistant">{sp.get('assistant') ?? ''}</span>;
}
async function openWithProbe(url: string) {
  view = mount(
    <MemoryRouter initialEntries={[url]}>
      <LocationProbe />
      <GuestChatPage config={CONFIG} preview={false} />
    </MemoryRouter>,
  );
  await flush();
  await flush();
}

/** Выбор в списке — React слушает change, а значение ставится через прототип
 * (как в AdminBlogView.test.tsx: простое el.value = v React не замечает). */
async function selectAssistant(el: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  agents.mockResolvedValue([{ id: '12', name: 'Роман' }, { id: '14', name: 'Райя' }]);
  session.mockResolvedValue(null);
});
afterEach(() => { view?.unmount(); view = null; });

describe('страница пробы', () => {
  it('ассистент из адреса', async () => {
    await open('/chat?assistant=14');
    expect(visibleText(view!.container)).toContain('чат:14:Райя:0');
  });

  it('без адреса — Роман', async () => {
    await open('/chat');
    expect(visibleText(view!.container)).toContain('чат:12:Роман:0');
  });

  it('начатая проба восстанавливается, выбор ассистента закрыт', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '14' }));
    session.mockResolvedValue({ assistantId: '14', messages: [{ role: 'user', content: 'В' }, { role: 'assistant', content: 'О' }], left: 2 });
    await open('/chat?assistant=12');
    expect(visibleText(view!.container)).toContain('чат:14:Райя:2');
    expect(view!.container.querySelector('select')).toBeNull();
    expect(visibleText(view!.container)).toContain('Чтобы поговорить с другими ассистентами, войдите');
  });

  it('проба на сервере пропала — ключ забыт, новая проба', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '14' }));
    await open('/chat');
    expect(localStorage.getItem('guest_trial')).toBeNull();
    expect(visibleText(view!.container)).toContain('чат:12:Роман:0');
  });

  it('вопрос с лендинга доходит до чата', async () => {
    localStorage.setItem('pending_draft', JSON.stringify({ text: 'Как поднять цены?', assistant: '12', expires: Date.now() + 60000, auto: true }));
    await open('/chat?assistant=12');
    expect(visibleText(view!.container)).toContain('чат:12:Роман:0:Как поднять цены?');
  });

  it('ассистенты не загрузились — экран входа', async () => {
    agents.mockResolvedValue([]);
    await open('/chat');
    expect(visibleText(view!.container)).toContain('экран входа');
  });

  it('«Войти» открывает экран входа, «Вернуться» — обратно в чат', async () => {
    await open('/chat');
    click(byButton(view!.container, /^Войти$/)!);
    expect(visibleText(view!.container)).toContain('экран входа');
    click(byButton(view!.container, /Вернуться к разговору/)!);
    expect(visibleText(view!.container)).toContain('чат:12:Роман:0');
  });

  it('рефссылка запоминается и в пробе', async () => {
    await open('/chat?ref=abc');
    expect(localStorage.getItem('referral_slug')).toBe('abc');
  });

  // --- Дополнения контролёра ---

  // Доп. по ревью A7: страница держит busy из onBusyChange и гасит «Войти» в
  // шапке, пока идёт ход (перенос пробы посреди ответа теряет пару, которая
  // ещё пишется). Мок GuestChat даёт кнопку-заглушку, зовущую onBusyChange(true).
  it('во время хода «Войти» в шапке недоступна (доп. A7)', async () => {
    await open('/chat');
    expect(byButton(view!.container, /^Войти$/)!.disabled).toBe(false);
    click(byButton(view!.container, /ход идёт/)!);
    expect(byButton(view!.container, /^Войти$/)!.disabled).toBe(true);
  });

  // Доп. по ревью B6: смена ассистента в select до начала пробы обновляет
  // ?assistant= в адресе (setSearchParams(..., { replace: true })), чтобы
  // useEntryParams (общий у страницы пробы и экрана входа) запомнил нового
  // ассистента как намерение входа — а не того, с кем открыли страницу.
  it('смена ассистента в select обновляет ?assistant= и намерение входа (доп. B6)', async () => {
    await openWithProbe('/chat?assistant=12');
    const select = view!.container.querySelector('select') as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    await selectAssistant(select!, '14');
    await flush();
    expect(view!.container.querySelector('[data-testid="url-assistant"]')!.textContent).toBe('14');
    expect(JSON.parse(localStorage.getItem('pending_assistant') ?? 'null')).toMatchObject({ value: '14' });

    click(byButton(view!.container, /^Войти$/)!);
    expect(JSON.parse(localStorage.getItem('pending_assistant') ?? 'null')).toMatchObject({ value: '14' });
  });
});
