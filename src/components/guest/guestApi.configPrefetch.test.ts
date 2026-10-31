// src/components/guest/guestApi.configPrefetch.test.ts
// @vitest-environment jsdom
//
// I1 (ревью качества B9-fix): fetchGuestConfig забирает window.__guestConfigPrefetch
// (ранний запрос из index.html), если он есть, и не делает обычный запрос
// через apiClient. Отдельный файл, а не блок в guestApi.test.ts: тому файлу
// намеренно не нужен jsdom (окружение по умолчанию — node, см.
// vite.config.ts), и менять окружение целого файла ради window — лишний
// риск для остальных 20+ тестов там, которые jsdom не касается.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
import { apiClient } from '../../services/apiClient';
import { fetchGuestConfig } from './guestApi';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  get.mockReset();
  delete (window as any).__guestConfigPrefetch;
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as any).__guestConfigPrefetch;
});

describe('fetchGuestConfig: префетч из index.html (I1)', () => {
  it('префетч есть — apiClient.get не вызывается, ответ разобран как обычно', async () => {
    (window as any).__guestConfigPrefetch = Promise.resolve({ mode: 'on', answersPerTrial: 3, maxChars: 2000 });
    expect(await fetchGuestConfig()).toEqual({ mode: 'on', answersPerTrial: 3, maxChars: 2000 });
    expect(get).not.toHaveBeenCalled();
  });

  it('префетч забирается ОДИН раз — повторный вызов идёт обычным запросом', async () => {
    (window as any).__guestConfigPrefetch = Promise.resolve({ mode: 'on', answersPerTrial: 3, maxChars: 2000 });
    await fetchGuestConfig();
    expect((window as any).__guestConfigPrefetch).toBeUndefined();
    get.mockResolvedValueOnce(json(200, { mode: 'preview', answersPerTrial: 1, maxChars: 500 }));
    expect(await fetchGuestConfig()).toEqual({ mode: 'preview', answersPerTrial: 1, maxChars: 500 });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('префетч разрешился в null (сбой на стороне скрипта) — null, без обычного запроса', async () => {
    (window as any).__guestConfigPrefetch = Promise.resolve(null);
    expect(await fetchGuestConfig()).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('мусор в mode у ответа префетча — «выкл», как и у обычного ответа', async () => {
    (window as any).__guestConfigPrefetch = Promise.resolve({ mode: 'всё' });
    expect((await fetchGuestConfig())?.mode).toBe('off');
    expect(get).not.toHaveBeenCalled();
  });

  it('префетч завис дольше GUEST_CONFIG_TIMEOUT_MS — null по тому же потолку, без обычного запроса', async () => {
    vi.useFakeTimers();
    (window as any).__guestConfigPrefetch = new Promise(() => {});
    const pending = fetchGuestConfig();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('нет префетча — обычный запрос, как раньше', async () => {
    get.mockResolvedValueOnce(json(200, { mode: 'on', answersPerTrial: 3, maxChars: 2000 }));
    expect(await fetchGuestConfig()).toEqual({ mode: 'on', answersPerTrial: 3, maxChars: 2000 });
    expect(get).toHaveBeenCalledWith('/webhook/guest/config', expect.objectContaining({ skipAuth: true }));
  });
});
