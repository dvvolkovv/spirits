// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actAsync, byButton, click, clickAsync, flush, mount } from '../test/dom';
import { apiClient } from '../services/apiClient';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../services/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../services/authService', () => ({
  authService: {
    refreshTokens: vi.fn(),
    registerReferral: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../utils/tokenManager', () => ({
  tokenManager: {
    hasTokens: vi.fn(() => false),
    isAccessTokenExpiringSoon: vi.fn(() => false),
    clearTokens: vi.fn(),
  },
}));

vi.mock('../utils/clearAppStorage', () => ({ clearAppStorage: vi.fn() }));
vi.mock('../utils/persistentStorage', () => ({ setItemResilient: vi.fn(() => true) }));
vi.mock('../services/eventsClient', () => ({ attributeSource: vi.fn() }));
vi.mock('../components/guest/guestStorage', () => ({ markHasAccount: vi.fn() }));
vi.mock('../components/guest/guestClaim', () => ({ claimPendingGuestTrial: vi.fn(async () => {}) }));
vi.mock('../i18n', () => ({ default: { language: 'ru', changeLanguage: vi.fn() } }));
vi.mock('../i18n/languages', () => ({ resolveLanguage: (language: string) => language }));

const PHONE_A = '79030169187';
const PHONE_B = '79030000000';

function Harness() {
  const { user, isLoading, login, logout } = useAuth();
  return (
    <>
      <div data-testid="session">
        {isLoading
          ? 'loading'
          : user
            ? `${user.phone}|${user.backendUserId || ''}|${user.isAdmin ? 'admin' : 'user'}`
            : 'signed-out'}
      </div>
      <button onClick={() => { void login(PHONE_A, 'token-a'); }}>login-a</button>
      <button onClick={() => { void login(PHONE_B, 'token-b'); }}>login-b</button>
      <button onClick={logout}>logout</button>
    </>
  );
}

function profileResponse(phone: string, backendUserId: string, isAdmin: boolean) {
  return new Response(JSON.stringify([{
    profileJson: {
      user_id: backendUserId,
      phone,
      isadmin: isAdmin,
      onboarded: true,
      language: 'ru',
    },
  }]), { status: 200 });
}

describe('актуальность identity в AuthContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useRealTimers();
  });

  it('не даёт ответу профиля admin A восстановить identity после logout и входа B', async () => {
    const profileRequests: Array<(response: Response) => void> = [];
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === '/webhook/user/tokens/') {
        return Promise.resolve(new Response(JSON.stringify({ success: true, tokens: 50 }), { status: 200 }));
      }
      if (url === '/webhook/profile') {
        return new Promise<Response>((resolve) => profileRequests.push(resolve));
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    const view = mount(<AuthProvider><Harness /></AuthProvider>);
    await flush();

    click(byButton(view.container, /login-a/)!);
    await flush();
    await flush();
    expect(profileRequests.length).toBeGreaterThan(0);
    const adminARequests = [...profileRequests];

    await clickAsync(byButton(view.container, /logout/)!);
    expect(view.container.querySelector('[data-testid="session"]')?.textContent).toBe('signed-out');

    click(byButton(view.container, /login-b/)!);
    await flush();
    await flush();
    expect(profileRequests.length).toBeGreaterThan(adminARequests.length);

    await actAsync(() => profileRequests[profileRequests.length - 1](
      profileResponse(PHONE_B, 'backend-b', false),
    ));
    await flush();
    expect(view.container.querySelector('[data-testid="session"]')?.textContent)
      .toBe(`${PHONE_B}|backend-b|user`);

    for (const resolve of adminARequests) {
      await actAsync(() => resolve(profileResponse(PHONE_A, 'backend-a', true)));
    }
    await flush();

    expect(view.container.querySelector('[data-testid="session"]')?.textContent)
      .toBe(`${PHONE_B}|backend-b|user`);
    view.unmount();
  });
});
