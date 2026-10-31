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
//
// Хвост ревью (второй круг): переход — navigate('/chat', { replace: true })
// роутера, а не window.location.replace. Жёсткая перезагрузка повторяет всю
// инициализацию SPA и теряет уже установленное in-memory состояние
// AuthContext, если по любой причине userData всё-таки не записался —
// navigate() этого не требует, сессия просто остаётся в памяти.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, byButton, clickAsync, flush, tRu } from '../test/dom';
import AuthLinkPage from './AuthLinkPage';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import { tokenManager } from '../utils/tokenManager';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../test/dom');
  return { useTranslation: () => ({ t }) };
});

const ticketParams = new URLSearchParams({ ticket: 'tkt-1', hint: '+7 900 ***-**-00' });
// Стабильная ссылка (vi.hoisted), как у auth.login ниже: useNavigate() зовётся
// на каждый рендер, и фабрика `() => vi.fn()` без hoisted создавала бы НОВЫЙ
// мок на каждый вызов — счётчик на старой ссылке остался бы пустым.
const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => nav.navigate,
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
    <button type="button" onClick={() => p.onSubmit('70000000000')}>phone-submit</button>
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
  // Подмена window.location.replace осталась РЕГРЕССИЕЙ-стражем: переход
  // теперь должен идти через navigate() роутера, а не жёсткой перезагрузкой
  // (как в ZoomConnectCard.test.tsx — jsdom всё равно не умеет переходить).
  let replace: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', realLocation);
  });

  it('вход по номеру существующего аккаунта: login вызывается с access-токеном, userData записан, переход — navigate(/chat), не жёсткая перезагрузка', async () => {
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

    expect(auth.login).toHaveBeenCalledWith('70000000000', 'acc-1');
    expect(apiPost).toHaveBeenCalledWith('/webhook/auth/link/attach', { ticket: 'tkt-1' });
    expect(localStorage.getItem('userData')).not.toBeNull();
    expect(nav.navigate).toHaveBeenCalledWith('/chat', { replace: true });
    expect(replace).not.toHaveBeenCalled();
    // Порядок важен: без await login() до перехода initAuth на /chat не
    // увидит ни одной отметки входа (баг E2c).
    expect(auth.login.mock.invocationCallOrder[0]).toBeLessThan(nav.navigate.mock.invocationCallOrder[0]);
  });

  it('создать отдельный аккаунт: login вызывается с токеном из /auth/link/new, userData записан, переход — navigate(/chat)', async () => {
    apiPost.mockResolvedValue(ok({ 'access-token': 'acc-2', 'refresh-token': 'ref-2' }));
    saveTokens.mockReturnValue(true);

    const { container } = mount(<AuthLinkPage />);
    await clickAsync(byButton(container, new RegExp(tRu('authLink.createNew')))!);

    expect(saveTokens).toHaveBeenCalledWith('acc-2', 'ref-2');
    expect(auth.login).toHaveBeenCalledWith('', 'acc-2');
    expect(localStorage.getItem('userData')).not.toBeNull();
    expect(nav.navigate).toHaveBeenCalledWith('/chat', { replace: true });
    expect(replace).not.toHaveBeenCalled();
    expect(auth.login.mock.invocationCallOrder[0]).toBeLessThan(nav.navigate.mock.invocationCallOrder[0]);
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

    expect(auth.login).toHaveBeenCalledWith('70000000000', 'acc-3');
    expect(nav.navigate).toHaveBeenCalledWith('/chat', { replace: true });
    consoleError.mockRestore();
  });

  // Хвост ревью: аккаунт уже создан и билет уже погашен бэком (/auth/link/new
  // отработал, tokenManager.saveTokens прошёл) до того, как может упасть
  // login(). «Ссылка устарела — начните вход заново» в этот момент — ложь:
  // ссылку начинать заново уже нельзя (билет одноразовый), а аккаунт и так
  // создан. Обрабатывается как в ветке привязки — свой try/catch вокруг
  // login(), который не мешает переходу.
  it('создание отдельного аккаунта: login() не удался — человек всё равно переходит в /chat, а не видит «ссылка устарела»', async () => {
    apiPost.mockResolvedValue(ok({ 'access-token': 'acc-4', 'refresh-token': 'ref-4' }));
    saveTokens.mockReturnValue(true);
    auth.login.mockRejectedValueOnce(new Error('сеть'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = mount(<AuthLinkPage />);
    await clickAsync(byButton(container, new RegExp(tRu('authLink.createNew')))!);

    expect(auth.login).toHaveBeenCalledWith('', 'acc-4');
    expect(nav.navigate).toHaveBeenCalledWith('/chat', { replace: true });
    expect(container.textContent).not.toContain(tRu('authLink.ticketExpired'));
    consoleError.mockRestore();
  });

  // Ловит потерю await: если бы login() вызывался без await (fire-and-forget),
  // navigate() случился бы сразу же, не дожидаясь записи userData/authToken.
  it('переход ждёт login() — не случается до его завершения', async () => {
    requestSMSCode.mockResolvedValue({ success: true, message: 'SMS sent' });
    verifyCode.mockResolvedValue({
      success: true,
      tokens: { 'access-token': 'acc-5', 'refresh-token': 'ref-5' },
    });
    apiPost.mockResolvedValue(ok({}));

    let resolveLogin: () => void = () => {};
    auth.login.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveLogin = resolve; }),
    );

    const { container } = mount(<AuthLinkPage />);
    await clickAsync(byButton(container, new RegExp(tRu('authLink.loginByPhone')))!);
    await clickAsync(byButton(container, /phone-submit/)!);
    await clickAsync(byButton(container, /otp-submit/)!);

    // login() вызван, но его промис ещё не разрешён — перехода быть не должно.
    expect(auth.login).toHaveBeenCalledWith('70000000000', 'acc-5');
    expect(nav.navigate).not.toHaveBeenCalled();

    resolveLogin();
    await flush();

    expect(nav.navigate).toHaveBeenCalledWith('/chat', { replace: true });
  });
});
