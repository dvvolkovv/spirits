// @vitest-environment jsdom
//
// jsdom нужен: этот файл гоняет apiClient.request() через реальный 401-флоу,
// который трогает window.location и tokenManager (читает/пишет глобальный
// localStorage) — оба существуют только здесь, глобальное окружение
// репозитория (vitest.config.ts) — 'node'.
//
// ЛОКАЛЬНЫЙ ЗАПУСК НА МАКЕ: если этот файл падает с «Cannot read properties
// of undefined (reading 'removeItem'/'getItem')», хотя докблок jsdom стоит —
// это не баг теста. Системный Homebrew `node` (проверено на v26.0.0) даёт
// свой экспериментальный глобальный `localStorage`, который конфликтует с
// jsdom и оставляет и `window.localStorage`, и голый `localStorage`
// неопределёнными. Тестовая нода (dv@85.192.61.231) гоняет Node 22.x, и там
// это работает штатно — локально нужно то же: положить в PATH
// `~/.nvm/versions/node/v22.x/bin` перед системным node.
//
// Что проверяет файл:
// 1. Wiring reauthHandler внутри apiClient.request() — реальный публичный
//    путь (401 → handleTokenRefresh → reauthHandler), а не приватный метод
//    напрямую: handleTokenRefresh — private, и тестировать его в обход
//    request() значило бы проверять не то, чем реально пользуется код.
// 2. Регрессионный барьер для прод-веба: без setReauthHandler (как сейчас
//    живёт my.linkeon.io) поведение обязано остаться прежним — ошибка,
//    редирект, разрешение очереди, без повторного запроса.
// 3. pickRedirectTarget — чистая функция выбора цели редиректа.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient, pickRedirectTarget } from '../services/apiClient';
import { authService } from '../services/authService';
import { tokenManager } from '../utils/tokenManager';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Мок fetch: первые `failCount` вызовов — 401, дальше — успешный ретрай. */
function mockFetchFailThenSucceed(failCount: number) {
  let call = 0;
  return vi.fn().mockImplementation(async () => {
    call += 1;
    if (call <= failCount) return jsonResponse(401, {});
    return jsonResponse(200, { data: 'ok' });
  });
}

beforeEach(() => {
  tokenManager.clearTokens();
  apiClient.setReauthHandler(null);
  vi.restoreAllMocks();
});

describe('apiClient + reauthHandler (Mini App путь)', () => {
  it('нет refresh-токена: reauthHandler вызывается, запрос повторяется при успехе', async () => {
    // tokenManager.clearTokens() в beforeEach уже гарантирует "нет токенов" —
    // это ветка `if (!refreshToken)` в handleTokenRefresh.
    const reauth = vi.fn().mockImplementation(async () => {
      tokenManager.saveTokens('NEW_ACCESS', 'NEW_REFRESH');
      return true;
    });
    apiClient.setReauthHandler(reauth);

    const fetchMock = mockFetchFailThenSucceed(1);
    global.fetch = fetchMock as any;

    const res = await apiClient.get('/webhook/profile');

    expect(reauth).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2); // оригинал + ретрай
  });

  it('refresh вернул невалидный ответ: reauthHandler вызывается, запрос повторяется при успехе', async () => {
    // Есть refresh-токен, но authService.refreshTokens() возвращает null —
    // так выглядит реальный протухший/невалидный refresh-токен, ветка
    // `else { ... invalid response ... }`.
    tokenManager.saveTokens('OLD_ACCESS', 'OLD_REFRESH');
    vi.spyOn(authService, 'refreshTokens').mockResolvedValue(null);

    const reauth = vi.fn().mockImplementation(async () => {
      tokenManager.saveTokens('NEW_ACCESS', 'NEW_REFRESH');
      return true;
    });
    apiClient.setReauthHandler(reauth);

    const fetchMock = mockFetchFailThenSucceed(1);
    global.fetch = fetchMock as any;

    const res = await apiClient.get('/webhook/profile');

    expect(reauth).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refresh упал с ошибкой: reauthHandler вызывается, запрос повторяется при успехе', async () => {
    // authService.refreshTokens() бросает (сеть легла) — ветка `catch`.
    tokenManager.saveTokens('OLD_ACCESS', 'OLD_REFRESH');
    vi.spyOn(authService, 'refreshTokens').mockRejectedValue(new Error('network down'));

    const reauth = vi.fn().mockImplementation(async () => {
      tokenManager.saveTokens('NEW_ACCESS', 'NEW_REFRESH');
      return true;
    });
    apiClient.setReauthHandler(reauth);

    const fetchMock = mockFetchFailThenSucceed(1);
    global.fetch = fetchMock as any;

    const res = await apiClient.get('/webhook/profile');

    expect(reauth).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('очередь параллельных запросов освобождается, а не виснет, после успешного reauth', async () => {
    // Два одновременных защищённых запроса ловят 401. Владелец refresh
    // (первый) уходит в reauthHandler; второй должен ждать очередью
    // (waitForTokenRefresh), а не запускать reauthHandler повторно, и обязан
    // получить свой ретрай, а не зависнуть навсегда.
    tokenManager.saveTokens('OLD_ACCESS', 'OLD_REFRESH');
    vi.spyOn(authService, 'refreshTokens').mockResolvedValue(null);

    const reauth = vi.fn().mockImplementation(async () => {
      tokenManager.saveTokens('NEW_ACCESS', 'NEW_REFRESH');
      return true;
    });
    apiClient.setReauthHandler(reauth);

    // Первые два вызова fetch — исходные параллельные запросы (оба 401),
    // остальные — их ретраи (200).
    const fetchMock = mockFetchFailThenSucceed(2);
    global.fetch = fetchMock as any;

    const [r1, r2] = await Promise.all([
      apiClient.get('/webhook/profile'),
      apiClient.get('/webhook/user/tokens/'),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // Один owner — один вызов reauthHandler, а не по одному на запрос.
    expect(reauth).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 2 оригинала + 2 ретрая
  });
});

describe('apiClient без reauthHandler — поведение веба не меняется (регрессионный барьер my.linkeon.io)', () => {
  it('провал refresh: исходная ошибка, без повторного запроса, токены очищены', async () => {
    tokenManager.saveTokens('OLD_ACCESS', 'OLD_REFRESH');
    vi.spyOn(authService, 'refreshTokens').mockResolvedValue(null);
    // reauthHandler не установлен — apiClient.setReauthHandler(null) в beforeEach,
    // именно так сейчас живёт прод-веб.

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    global.fetch = fetchMock as any;

    await expect(apiClient.get('/webhook/profile')).rejects.toThrow(
      'Authentication failed: token refresh unsuccessful',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1); // ни одного ретрая
    expect(tokenManager.hasTokens()).toBe(false); // clearTokens сработал как раньше
  });

  it('нет refresh-токена вообще: та же ошибка, без reauthHandler', async () => {
    // tokenManager.clearTokens() уже в beforeEach — токенов нет.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    global.fetch = fetchMock as any;

    await expect(apiClient.get('/webhook/profile')).rejects.toThrow(
      'Authentication failed: token refresh unsuccessful',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refresh бросил ошибку: та же ошибка, без reauthHandler', async () => {
    tokenManager.saveTokens('OLD_ACCESS', 'OLD_REFRESH');
    vi.spyOn(authService, 'refreshTokens').mockRejectedValue(new Error('network down'));

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    global.fetch = fetchMock as any;

    await expect(apiClient.get('/webhook/profile')).rejects.toThrow(
      'Authentication failed: token refresh unsuccessful',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('очередь параллельных запросов не виснет и без reauthHandler — оба падают', async () => {
    tokenManager.saveTokens('OLD_ACCESS', 'OLD_REFRESH');
    vi.spyOn(authService, 'refreshTokens').mockResolvedValue(null);

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    global.fetch = fetchMock as any;

    const results = await Promise.allSettled([
      apiClient.get('/webhook/profile'),
      apiClient.get('/webhook/user/tokens/'),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });
});

describe('pickRedirectTarget', () => {
  it('остаётся в Mini App для путей /tma...', () => {
    expect(pickRedirectTarget('/tma/')).toBe('/tma/');
    expect(pickRedirectTarget('/tma/chat')).toBe('/tma/');
    expect(pickRedirectTarget('/tma')).toBe('/tma/');
  });

  it('уходит на веб-корень для остальных путей', () => {
    expect(pickRedirectTarget('/')).toBe('/');
    expect(pickRedirectTarget('/chat')).toBe('/');
    expect(pickRedirectTarget('/admin')).toBe('/');
    expect(pickRedirectTarget('')).toBe('/');
  });
});
