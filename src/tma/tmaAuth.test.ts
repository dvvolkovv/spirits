// @vitest-environment jsdom
//
// Как и telegram.test.ts: этот файл трогает window.Telegram и tokenManager,
// который читает/пишет глобальный localStorage — оба существуют только в
// jsdom, глобальное окружение репозитория (vitest.config.ts) — 'node'.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tmaLogin, tmaLinkExisting } from './tmaAuth';
import { tokenManager } from '../utils/tokenManager';

beforeEach(() => {
  tokenManager.clearTokens();
  (globalThis as any).window.Telegram = { WebApp: { initData: 'auth_date=1&hash=abc' } };
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('tmaLogin', () => {
  it('сохраняет пару токенов при успехе', async () => {
    globalThis.fetch = mockFetch(200, { 'access-token': 'ACC', 'refresh-token': 'REF' }) as any;
    const r = await tmaLogin();
    expect(r).toEqual({ status: 'authenticated' });
    expect(tokenManager.getAccessToken()).toBe('ACC');
    expect(tokenManager.getRefreshToken()).toBe('REF');
  });

  it('на 404 возвращает needsChoice и токены не трогает', async () => {
    globalThis.fetch = mockFetch(404, { needsChoice: true }) as any;
    const r = await tmaLogin();
    expect(r).toEqual({ status: 'needsChoice' });
    expect(tokenManager.hasTokens()).toBe(false);
  });

  it('на 401 возвращает notInTelegram', async () => {
    globalThis.fetch = mockFetch(401, { error: 'invalid initData' }) as any;
    expect(await tmaLogin()).toEqual({ status: 'notInTelegram' });
  });

  it('с intent=signup передаёт его в теле запроса', async () => {
    const f = mockFetch(200, { 'access-token': 'A', 'refresh-token': 'R' });
    globalThis.fetch = f as any;
    await tmaLogin({ intent: 'signup' });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.intent).toBe('signup');
    expect(body.initData).toBe('auth_date=1&hash=abc');
  });

  it('без initData не ходит в сеть', async () => {
    (globalThis as any).window.Telegram = { WebApp: { initData: '' } };
    const f = mockFetch(200, {});
    globalThis.fetch = f as any;
    expect(await tmaLogin()).toEqual({ status: 'notInTelegram' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('tmaLinkExisting', () => {
  it('на 200 возвращает ok', async () => {
    globalThis.fetch = mockFetch(200, { ok: true }) as any;
    expect(await tmaLinkExisting()).toEqual({ status: 'ok' });
  });

  it('на 409 возвращает conflict', async () => {
    globalThis.fetch = mockFetch(409, { error: 'conflict' }) as any;
    expect(await tmaLinkExisting()).toEqual({ status: 'conflict' });
  });
});
