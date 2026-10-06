// @vitest-environment jsdom
//
// Разбор дефекта: вход по SMS с «/» или голого /chat терял запомненный раздел.
// AuthContext.login() делает setUser ДО того, как SmsLoginPane успевает
// перейти на /chat — оболочка вошедшего рисуется сразу по адресу экрана
// входа, PendingDestinationRedirect забирает запись сам, а navigate('/chat')
// ниже в SmsLoginPane уводит обратно в чат. Чиним: SmsLoginPane забирает
// запись ДО login() и уходит прямо в раздел (PendingDestinationRedirect тут
// не смонтирован — проверяется сама проводка SmsLoginPane).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { click, flush, mount, type, type Mounted } from '../../test/dom';
import { rememberPendingDestination } from '../../utils/pendingDestination';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});

// login — через vi.hoisted: фабрика vi.mock поднимается над импортами, и без
// этого обращение к внешней переменной внутри неё упало бы на инициализации.
// Сам мок попутно пишет в loginCalls, ЧТО лежало в pending_destination в
// момент вызова, — порядок «забрать запись → потом login» и есть суть фикса.
const { login, loginCalls } = vi.hoisted(() => {
  const loginCalls: Array<string | null> = [];
  const login = vi.fn(async () => {
    loginCalls.push(localStorage.getItem('pending_destination'));
  });
  return { login, loginCalls };
});
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ login }) }));

vi.mock('../../services/authService', () => ({
  authService: {
    requestSMSCode: vi.fn(async () => ({ success: true })),
    verifyCode: vi.fn(async () => ({
      success: true,
      tokens: { 'access-token': 'a', 'refresh-token': 'r' },
    })),
  },
  STORAGE_FULL: 'Storage unavailable',
}));

import SmsLoginPane from './SmsLoginPane';

// Свидетель: показывает, где человек оказался после входа. Свой data-testid,
// а не весь текст контейнера, — SmsLoginPane законно остаётся смонтированным
// рядом (в реальном приложении его снимает смена ветки isAuthenticated, не
// забота этого компонента), и его текст иначе склеился бы с адресом.
const Where = () => {
  const l = useLocation();
  return <div data-testid="where">at:{l.pathname}{l.search}</div>;
};

let view: Mounted | null = null;

function whereText(): string {
  return view?.container.querySelector('[data-testid="where"]')?.textContent ?? '';
}

/** Полный проход формы: телефон → код → (внутри) login() → переход. */
async function loginVia(url: string): Promise<string> {
  view = mount(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="*" element={<><SmsLoginPane /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
  await flush();

  const phoneInput = view.container.querySelector('[data-testid="phone-input"]');
  if (!phoneInput) throw new Error('phone-input не найден');
  type(phoneInput, '9030169187');
  await flush();

  const submitBtn = view.container.querySelector('[data-testid="phone-submit-btn"]');
  if (!submitBtn) throw new Error('phone-submit-btn не найден');
  click(submitBtn);
  // Запрос кода (authService.requestSMSCode) — промис мока, плюс переход
  // шага 'phone' → 'otp'. Несколько тиков вместо подсчёта микрозадач вручную —
  // так же, как в соседних тестах входа (ChatPage.deeplink.test.tsx).
  for (let i = 0; i < 3; i++) await flush();

  const otpInput0 = view.container.querySelector('[data-testid="otp-input-0"]');
  if (!otpInput0) throw new Error('otp-input-0 не найден: шаг "otp" не наступил');
  // Весь код сразу в первую ячейку — тот же путь, что обрабатывает вставку:
  // onChange с value.length > 1 шлёт код целиком, не дожидаясь остальных ячеек.
  type(otpInput0, '123456');
  // Цепочка подлиннее: verifyCode → (фикс) takePendingDestination → login → navigate.
  for (let i = 0; i < 5; i++) await flush();

  return whereText();
}

beforeEach(() => {
  localStorage.clear();
  login.mockClear();
  loginCalls.length = 0;
});

afterEach(() => {
  view?.unmount();
  view = null;
});

describe('вход по SMS уходит в запомненный раздел', () => {
  it('запомненный раздел — после входа туда, а не в чат', async () => {
    rememberPendingDestination('/studio', '?tab=products');
    const text = await loginVia('/');
    expect(text).toBe('at:/studio?tab=products');
    expect(localStorage.getItem('pending_destination')).toBeNull();
  });

  it('запись забрана до login()', async () => {
    rememberPendingDestination('/studio', '?tab=products');
    await loginVia('/');
    expect(loginCalls).toEqual([null]);
  });

  it('ничего не запомнено — в чат, как раньше', async () => {
    const text = await loginVia('/');
    expect(text).toBe('at:/chat');
  });
});
