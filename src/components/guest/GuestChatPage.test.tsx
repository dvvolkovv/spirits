// src/components/guest/GuestChatPage.test.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { byButton, click, flush, mount, visibleText, type Mounted } from '../../test/dom';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../../pages/OnboardingPage', () => ({ default: () => <div>экран входа</div> }));
vi.mock('../../services/avatarService', () => ({ avatarService: { getAvatarUrl: vi.fn(async () => '') } }));
vi.mock('../../services/eventsClient', () => ({ track: vi.fn() }));
// Доп. A7 + C1 (ревью качества B9-fix): кнопка-заглушка зовёт onBusyChange(true)
// — проверить, что страница гасит «Войти» в шапке, пока идёт (по мнению
// заглушки) ход. useEffect с [] считает МОНТИРОВАНИЯ (не перерисовки) через
// глобальный счётчик — C1 проверяет, что «Войти» → «Вернуться» не создаёт
// новый экземпляр GuestChat (window.__guestChatMounts не растёт).
vi.mock('./GuestChat', () => ({
  default: (p: any) => {
    useEffect(() => {
      (globalThis as any).__guestChatMounts = ((globalThis as any).__guestChatMounts ?? 0) + 1;
    }, []);
    return (
      <div>
        <div>чат:{p.assistantId}:{p.assistantName}:{p.initialMessages.length}:{p.draft?.text ?? ''}</div>
        <button type="button" onClick={() => p.onBusyChange?.(true)}>ход идёт (мок)</button>
      </div>
    );
  },
}));
vi.mock('./guestApi', () => ({ fetchGuestAgents: vi.fn(), loadGuestSession: vi.fn() }));

import { avatarService } from '../../services/avatarService';
import { fetchGuestAgents, loadGuestSession } from './guestApi';
import GuestChatPage from './GuestChatPage';

const agents = fetchGuestAgents as unknown as ReturnType<typeof vi.fn>;
const session = loadGuestSession as unknown as ReturnType<typeof vi.fn>;
const avatarSpy = avatarService.getAvatarUrl as unknown as ReturnType<typeof vi.fn>;
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
  // 'error' — нейтральный дефолт новой формы ответа (m3): большинство тестов
  // не кладут guest_trial в localStorage, и loadGuestSession вовсе не зовётся.
  session.mockResolvedValue({ status: 'error' });
  avatarSpy.mockClear();
  (globalThis as any).__guestChatMounts = 0;
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
    session.mockResolvedValue({ status: 'ok', assistantId: '14', messages: [{ role: 'user', content: 'В' }, { role: 'assistant', content: 'О' }], left: 2 });
    await open('/chat?assistant=12');
    expect(visibleText(view!.container)).toContain('чат:14:Райя:2');
    expect(view!.container.querySelector('select')).toBeNull();
    expect(visibleText(view!.container)).toContain('Чтобы поговорить с другими ассистентами, войдите');
  });

  it('проба на сервере пропала (gone) — ключ забыт, новая проба', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '14' }));
    session.mockResolvedValue({ status: 'gone' });
    await open('/chat');
    expect(localStorage.getItem('guest_trial')).toBeNull();
    expect(visibleText(view!.container)).toContain('чат:12:Роман:0');
  });

  // m3: ассистент пробы на сервере НАЙДЕН (status: 'ok'), но его больше нет в
  // списке агентов — ключ тоже забывается (с ним так и так нечем продолжить),
  // но это ДРУГАЯ ветка, чем 'gone', и важно, чтобы обе вели к одному итогу.
  it('ассистент пробы пропал из списка — ключ забыт, новая проба (m3)', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '99' }));
    session.mockResolvedValue({ status: 'ok', assistantId: '99', messages: [{ role: 'user', content: 'В' }], left: 2 });
    await open('/chat');
    expect(localStorage.getItem('guest_trial')).toBeNull();
    expect(visibleText(view!.container)).toContain('чат:12:Роман:0');
  });

  // m3 (Critical, ревью качества B9-fix): сбой loadGuestSession (сеть, 5xx,
  // таймаут) — НЕ 'gone', ключ обязан остаться («при сбое ключ остаётся»,
  // обещание «перезагрузка разговор не теряет»). Проба открывается этим же
  // ключом, но без ленты — она появится, когда сервер ответит.
  it('сбой восстановления пробы — ключ остаётся, проба открывается без ленты (m3)', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '14' }));
    session.mockResolvedValue({ status: 'error' });
    await open('/chat');
    expect(localStorage.getItem('guest_trial')).toBe(JSON.stringify({ token: TOKEN, assistantId: '14' }));
    expect(visibleText(view!.container)).toContain('чат:14:Райя:0');
    expect(visibleText(view!.container)).not.toContain('экран входа');
    // T9 (хвост по перепроверкам B9-fix, 31.10): ключ пробы есть (хоть лента
    // и не загрузилась) — выбор ассистента должен быть СКРЫТ, как и при
    // непустой ленте: token этой пробы привязан к ассистенту '14', и выбор
    // другого дал бы лишний круг 409 (assistant_mismatch) → trial_gone.
    expect(view!.container.querySelector('select')).toBeNull();
  });

  // m3: пустой список ассистентов (сбой fetchGuestAgents или и впрямь пусто)
  // — экран входа, но ключ НАЧАТОЙ пробы трогать нельзя: список может быть
  // пуст из-за сбоя сети, а не потому что ассистентов нет вообще.
  it('пустой список ассистентов с начатой пробой — экран входа, ключ не трогается (m3)', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '14' }));
    agents.mockResolvedValue([]);
    // vitest.config.ts не включает clearMocks — счётчик вызовов session
    // копится по всем тестам файла; обнулить ЗДЕСЬ, иначе «не вызван»
    // проверяет чужую историю, а не эту пробу.
    session.mockClear();
    await open('/chat');
    expect(visibleText(view!.container)).toContain('экран входа');
    expect(localStorage.getItem('guest_trial')).toBe(JSON.stringify({ token: TOKEN, assistantId: '14' }));
    expect(session).not.toHaveBeenCalled();
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

  // C1 (Critical, ревью качества B9-fix): «Войти» больше не размонтирует
  // GuestChat — он остаётся в дереве, просто скрытый, пока показан экран
  // входа. Счётчик монтирований мока (useEffect с []) должен остаться 1 за
  // весь сценарий: «Вернуться» не создаёт новый экземпляр (старый token/лента
  // не теряются, черновик не передаётся заново).
  it('«Войти» открывает экран входа, «Вернуться» — обратно в чат, тот же экземпляр чата (C1)', async () => {
    await open('/chat');
    expect((globalThis as any).__guestChatMounts).toBe(1);
    click(byButton(view!.container, /^Войти$/)!);
    expect(visibleText(view!.container)).toContain('экран входа');
    expect((globalThis as any).__guestChatMounts).toBe(1);
    click(byButton(view!.container, /Вернуться к разговору/)!);
    expect(visibleText(view!.container)).toContain('чат:12:Роман:0');
    expect((globalThis as any).__guestChatMounts).toBe(1);
  });

  // E1 (решение владельца 31.10.2026): «Не сохранять» на экране входа стирает
  // ключ пробы (сам экран — отдельный компонент, тут замокан; его собственная
  // кнопка проверяется в OnboardingPage.claimNotice.test.tsx). GuestChat всё
  // это время остаётся смонтированным со СТАРЫМ токеном в памяти (C1 выше) —
  // без явного сброса следующее сообщение продолжило бы именно ту пробу,
  // которую попросили не сохранять, через тот же tokenRef. started — сигнал
  // «проба уже шла, когда открывали вход»: без него открытие экрана входа ДО
  // начала пробы (ключа и так нет) ошибочно сбросило бы ещё не отправленный
  // черновик в поле ввода (см. тест C1 — там мок не меняется).
  it('«Не сохранять» на экране входа — «Вернуться» начинает пробу заново (новый экземпляр чата)', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '14' }));
    session.mockResolvedValue({
      status: 'ok',
      assistantId: '14',
      messages: [{ role: 'user', content: 'В' }, { role: 'assistant', content: 'О' }],
      left: 2,
    });
    await open('/chat');
    expect((globalThis as any).__guestChatMounts).toBe(1);
    click(byButton(view!.container, /^Войти$/)!);
    expect(visibleText(view!.container)).toContain('экран входа');
    // Настоящий экран входа тут замокан — имитируем его «Не сохранять» тем же
    // эффектом, который даёт forgetTrial() (стирает ровно этот ключ).
    localStorage.removeItem('guest_trial');
    click(byButton(view!.container, /Вернуться к разговору/)!);
    expect((globalThis as any).__guestChatMounts).toBe(2);
    expect(visibleText(view!.container)).toContain('чат:14:Райя:0');
  });

  // E1 (хвост по ревью, 31.10.2026): «Не сохранять» нажали в ДРУГОЙ вкладке —
  // эта страница про это узнаёт не из своего эффекта (ключ читается только
  // при открытии), а из события 'storage', которое браузер шлёт во все
  // открытые вкладки того же origin, КРОМЕ той, что сама поменяла
  // localStorage. Без подписки GuestChat этой вкладки остался бы
  // смонтированным со старым token в памяти — ровно тот же риск, что и при
  // возврате со своего экрана входа (тест выше), просто источник сброса
  // ключа другой.
  it('«Не сохранять» в другой вкладке — storage-событие сбрасывает пробу здесь же', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '14' }));
    session.mockResolvedValue({
      status: 'ok',
      assistantId: '14',
      messages: [{ role: 'user', content: 'В' }, { role: 'assistant', content: 'О' }],
      left: 2,
    });
    await open('/chat');
    expect((globalThis as any).__guestChatMounts).toBe(1);
    // Сама браузерная реализация стирает ключ раньше, чем доставляет
    // событие другим вкладкам, — e.newValue здесь уже null, а не прежнее
    // значение.
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'guest_trial', newValue: null }));
    });
    expect((globalThis as any).__guestChatMounts).toBe(2);
    expect(visibleText(view!.container)).toContain('чат:14:Райя:0');
  });

  it('storage-событие про другой ключ или без удаления — пробу не трогает', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '14' }));
    session.mockResolvedValue({
      status: 'ok',
      assistantId: '14',
      messages: [{ role: 'user', content: 'В' }, { role: 'assistant', content: 'О' }],
      left: 2,
    });
    await open('/chat');
    expect((globalThis as any).__guestChatMounts).toBe(1);
    // Другой ключ localStorage (например, вход в другой вкладке).
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'linkeon_has_account', newValue: '1' }));
    });
    expect((globalThis as any).__guestChatMounts).toBe(1);
    // Тот же ключ, но не удаление — перезапись новой пробой на устройстве.
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'guest_trial', newValue: JSON.stringify({ token: TOKEN, assistantId: '12' }) }));
    });
    expect((globalThis as any).__guestChatMounts).toBe(1);
    expect(visibleText(view!.container)).toContain('чат:14:Райя:2');
  });

  it('рефссылка запоминается и в пробе', async () => {
    await open('/chat?ref=abc');
    expect(localStorage.getItem('referral_slug')).toBe('abc');
  });

  // --- Дополнения контролёра ---

  // Доп. по ревью A7: страница держит busy из onBusyChange и гасит «Войти» в
  // шапке, пока идёт ход (перенос пробы посреди ответа теряет пару, которая
  // ещё пишется). Мок GuestChat даёт кнопку-заглушку, зовущую onBusyChange(true).
  it('во время хода «Войти» в шапке недоступна и подсказывает почему (доп. A7, m1)', async () => {
    await open('/chat');
    const loginBtn = byButton(view!.container, /^Войти$/)!;
    expect(loginBtn.disabled).toBe(false);
    expect(loginBtn.title).toBe('');
    click(byButton(view!.container, /ход идёт/)!);
    expect(byButton(view!.container, /^Войти$/)!.disabled).toBe(true);
    expect(byButton(view!.container, /^Войти$/)!.title).toBe('Подождите, пока ассистент ответит');
  });

  // m2: аватар ассистента не запрашивается, пока список ассистентов не
  // загружен (ещё идёт первый запрос) или пуст (экран входа всё равно
  // покажется, дёргать сервер за картинкой незачем).
  it('аватар не запрашивается при пустом списке, но запрашивается при обычной загрузке (m2)', async () => {
    agents.mockResolvedValue([]);
    await open('/chat');
    expect(visibleText(view!.container)).toContain('экран входа');
    expect(avatarSpy).not.toHaveBeenCalled();
    view!.unmount();

    avatarSpy.mockClear();
    agents.mockResolvedValue([{ id: '12', name: 'Роман' }, { id: '14', name: 'Райя' }]);
    await open('/chat');
    expect(avatarSpy).toHaveBeenCalledWith(12);
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
