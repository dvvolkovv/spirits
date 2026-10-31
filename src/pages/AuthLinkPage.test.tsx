// @vitest-environment jsdom
//
// E2c (находка ревью пробы 31.10, с f620c70): после успешной привязки
// AuthLinkPage сохранял только jwt-токены (tokenManager.saveTokens) и делал
// window.location.replace('/chat') без вызова login() из AuthContext.
// initAuth (AuthContext.tsx) восстанавливает сессию ТОЛЬКО когда в
// localStorage лежат ОБА легаси-ключа authToken+userData — без них жёсткий
// переход на /chat (полная перезагрузка SPA) приводит не вошедшего, а
// OnboardingPage. Верный образец — AuthOAuthCallbackPage.tsx / SmsLoginPane.tsx:
// await login(phone, accessToken) ПЕРЕД переходом — внутри login() уже лежат
// запись authToken/userData, отметка «входили» и перенос пробы.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, byButton, clickAsync, tRu } from '../test/dom';
import AuthLinkPage from './AuthLinkPage';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import { tokenManager } from '../utils/tokenManager';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../test/dom');
  return { useTranslation: () => ({ t }) };
});

const ticketParams = new URLSearchParams({ ticket: 'tkt-1', hint: '+7 900 ***-**-00' });
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [ticketParams],
}));

// Стабильная ссылка на мок: useAuth() зовётся на каждый рендер, и без
// vi.hoisted (как в products/ProductChat.test.tsx) каждый вызов фабрики
// `() => ({ login: vi.fn() })` создавал бы НОВЫЙ vi.fn() — счётчик вызовов
// на старой ссылке остался бы пустым, хотя страница login() реально зовёт.
const auth = vi.hoisted(() => ({
  login: vi.fn(async (phone: string, _token: string) => {
    // Минимальный слепок настоящего AuthContext.login() (persistUser): кладёт
    // userData — ровно то, что требует initAuth при жёстком переходе на
    // /chat. Корректность самого login() — предмет его собственных мест
    // вызова (AuthOAuthCallbackPage и т.п.); здесь важно, что AuthLinkPage
    // его зовёт и дожидается ДО перехода, передавая настоящий access-токен.
    localStorage.setItem('userData', JSON.stringify({ phone }));
  }),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ login: auth.login }) }));

vi.mock('../services/authService', () => ({
  authService: { requestSMSCode: vi.fn(), verifyCode: vi.fn() },
}));
vi.mock('../services/apiClient', () => ({
  apiClient: { post: vi.fn() },
}));
vi.mock('../utils/tokenManager', () => ({
  tokenManager: { saveTokens: vi.fn() },
}));

vi.mock('../components/onboarding/PhoneInput', () => ({
  default: (p: { onSubmit: (phone: string) => void }) => (
    <button type="button" onClick={() => p.onSubmit('79991234567')}>phone-submit</button>
  ),
}));
vi.mock('../components/onboarding/OTPInput', () => ({
  default: (p: { onSubmit: (code: string) => void }) => (
    <button type="button" onClick={() => p.onSubmit('1234')}>otp-submit</button>
  ),
}));

const requestSMSCode = vi.mocked(authService.requestSMSCode);
const verifyCode = vi.mocked(authService.verifyCode);
const apiPost = vi.mocked(apiClient.post);
const saveTokens = vi.mocked(tokenManager.saveTokens);

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as any;

describe('AuthLinkPage: после привязки человек входит', () => {
  const realLocation = Object.getOwnPropertyDescriptor(window, 'location')!;
  let replace: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    replace = vi.fn();
    // jsdom не умеет переходить по адресу — подменяем, как в ZoomConnectCard.test.tsx.
    Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', realLocation);
  });

  it('вход по номеру существующего аккаунта: login вызывается с access-токеном и userData записан ДО перехода в /chat', async () => {
    requestSMSCode.mockResolvedValue({ success: true, message: 'SMS sent' });
    verifyCode.mockResolvedValue({
      success: true,
      tokens: { 'access-token': 'acc-1', 'refresh-token': 'ref-1' },
    });
    apiPost.mockResolvedValue(ok({}));

    const { container } = mount(<AuthLinkPage />);
    await clickAsync(byButton(container, new RegExp(tRu('authLink.loginByPhone')))!);
    await clickAsync(byButton(container, /phone-submit/)!);
    await clickAsync(byButton(container, /otp-submit/)!);

    expect(auth.login).toHaveBeenCalledWith('79991234567', 'acc-1');
    expect(apiPost).toHaveBeenCalledWith('/webhook/auth/link/attach', { ticket: 'tkt-1' });
    expect(localStorage.getItem('userData')).not.toBeNull();
    expect(replace).toHaveBeenCalledWith('/chat');
    // Порядок важен: без await login() до перехода initAuth на /chat не
    // увидит ни одной отметки входа (баг E2c).
    expect(auth.login.mock.invocationCallOrder[0]).toBeLessThan(replace.mock.invocationCallOrder[0]);
  });

  it('создать отдельный аккаунт: login вызывается с токеном из /auth/link/new, userData записан ДО перехода', async () => {
    apiPost.mockResolvedValue(ok({ 'access-token': 'acc-2', 'refresh-token': 'ref-2' }));
    saveTokens.mockReturnValue(true);

    const { container } = mount(<AuthLinkPage />);
    await clickAsync(byButton(container, new RegExp(tRu('authLink.createNew')))!);

    expect(saveTokens).toHaveBeenCalledWith('acc-2', 'ref-2');
    expect(auth.login).toHaveBeenCalledWith('', 'acc-2');
    expect(localStorage.getItem('userData')).not.toBeNull();
    expect(replace).toHaveBeenCalledWith('/chat');
    expect(auth.login.mock.invocationCallOrder[0]).toBeLessThan(replace.mock.invocationCallOrder[0]);
  });

  it('привязка почты к аккаунту не удалась — человек всё равно входит (login зовётся), ошибка только в консоли', async () => {
    requestSMSCode.mockResolvedValue({ success: true, message: 'SMS sent' });
    verifyCode.mockResolvedValue({
      success: true,
      tokens: { 'access-token': 'acc-3', 'refresh-token': 'ref-3' },
    });
    apiPost.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as any);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = mount(<AuthLinkPage />);
    await clickAsync(byButton(container, new RegExp(tRu('authLink.loginByPhone')))!);
    await clickAsync(byButton(container, /phone-submit/)!);
    await clickAsync(byButton(container, /otp-submit/)!);

    expect(auth.login).toHaveBeenCalledWith('79991234567', 'acc-3');
    expect(replace).toHaveBeenCalledWith('/chat');
    consoleError.mockRestore();
  });
});
