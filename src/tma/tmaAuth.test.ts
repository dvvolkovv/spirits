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

/**
 * Мок fetch, который никогда сам не ответит — как реальный fetch на
 * зависшем соединении. Единственный способ его развязать — прерывание через
 * тот же AbortSignal, что передаёт вызывающий код: так тест бьёт по
 * настоящему механизму (controller.abort() → fetch реджектится), а не по
 * подделке таймаута.
 */
function neverSettlingFetch() {
  return vi.fn().mockImplementation((_url: string, options: RequestInit = {}) => {
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });
}

/**
 * Страховка на случай регрессии в самой обвязке таймаута (например, если
 * кто-то в будущем уберёт `signal` из fetch-опций): без неё сломанный код
 * реально повесил бы прогон тестов на дефолтный таймаут vitest вместо
 * понятного сообщения об ошибке.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`завис: не settled за ${ms}мс`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
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

  it('200, но в теле нет токенов: notInTelegram, токены не трогает', async () => {
    // Сервер ответил ok, но без пары токенов — не тот формат, на который
    // рассчитывает клиент. Не должно ронять и не должно писать в tokenManager.
    globalThis.fetch = mockFetch(200, { some: 'unexpected shape' }) as any;
    expect(await tmaLogin()).toEqual({ status: 'notInTelegram' });
    expect(tokenManager.hasTokens()).toBe(false);
  });

  it('РЕГРЕССИЯ: fetch, который никогда не отвечает, не вешает — таймаут даёт notInTelegram', async () => {
    // Маленький timeoutMs вместо прод-значения (8с) — тест не должен реально
    // ждать. Дефолт (без параметра) вызывающий код в проде не переопределяет.
    globalThis.fetch = neverSettlingFetch() as any;
    const r = await withTimeout(tmaLogin({}, 15), 500);
    expect(r).toEqual({ status: 'notInTelegram' });
  });

  it('быстрый ответ не задет таймаутом и не оставляет висящий таймер', async () => {
    // 401 вместо успеха: tokenManager.saveTokens() внутри jsdom сам планирует
    // свои setTimeout(0) на диспатч 'storage' — это шум jsdom, а не то, что
    // проверяет тест. 401 не трогает localStorage.setItem вообще, поэтому
    // единственный таймер в игре — наш собственный из tmaLogin.
    vi.useFakeTimers();
    try {
      globalThis.fetch = mockFetch(401, { error: 'invalid initData' }) as any;
      const r = await tmaLogin();
      expect(r).toEqual({ status: 'notInTelegram' });
      // clearTimeout в finally должен снять таймер сразу после ответа —
      // иначе он висел бы в очереди ещё 8 секунд без дела.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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

  it('на прочих неуспешных статусах возвращает failed', async () => {
    globalThis.fetch = mockFetch(500, { error: 'server error' }) as any;
    expect(await tmaLinkExisting()).toEqual({ status: 'failed' });
  });

  it('РЕГРЕССИЯ: fetch, который никогда не отвечает, не вешает — таймаут даёт failed', async () => {
    globalThis.fetch = neverSettlingFetch() as any;
    const r = await withTimeout(tmaLinkExisting(15), 500);
    expect(r).toEqual({ status: 'failed' });
  });

  it('быстрый ответ не задет таймаутом и не оставляет висящий таймер', async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = mockFetch(200, { ok: true }) as any;
      const r = await tmaLinkExisting();
      expect(r).toEqual({ status: 'ok' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
