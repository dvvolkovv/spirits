// src/components/guest/guestApi.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
import { apiClient } from '../../services/apiClient';
import { claimGuestTrial, fetchGuestAgents, fetchGuestConfig, loadGuestSession, sendGuestMessage } from './guestApi';
import type { GuestEvent } from './guestTypes';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ndjson = (lines: object[]) => new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { status: 200 });

const INPUT = { token: null, assistantId: '12', message: 'Привет', lang: 'ru', tz: 'Europe/Moscow', preview: false, source: null, campaign: null, sid: 's_1' };

beforeEach(() => { get.mockReset(); post.mockReset(); });

describe('config', () => {
  it('режим с сервера; мусор — «выкл»; сбой — null; без авторизации', async () => {
    get.mockResolvedValueOnce(json(200, { mode: 'on', answersPerTrial: 3, maxChars: 2000 }));
    expect(await fetchGuestConfig()).toEqual({ mode: 'on', answersPerTrial: 3, maxChars: 2000 });
    expect(get).toHaveBeenCalledWith('/webhook/guest/config', expect.objectContaining({ skipAuth: true }));
    get.mockResolvedValueOnce(json(200, { mode: 'всё' }));
    expect((await fetchGuestConfig())?.mode).toBe('off');
    get.mockRejectedValueOnce(new Error('сеть'));
    expect(await fetchGuestConfig()).toBeNull();
  });

  it('answersPerTrial и maxChars: 0, мусор, отрицательное — дефолты 3 и 2000', async () => {
    get.mockResolvedValueOnce(json(200, { mode: 'on', answersPerTrial: 0, maxChars: 0 }));
    expect(await fetchGuestConfig()).toEqual({ mode: 'on', answersPerTrial: 3, maxChars: 2000 });
    get.mockResolvedValueOnce(json(200, { mode: 'on', answersPerTrial: 'abc', maxChars: 'abc' }));
    expect(await fetchGuestConfig()).toEqual({ mode: 'on', answersPerTrial: 3, maxChars: 2000 });
    get.mockResolvedValueOnce(json(200, { mode: 'on', answersPerTrial: -5, maxChars: -5 }));
    expect(await fetchGuestConfig()).toEqual({ mode: 'on', answersPerTrial: 3, maxChars: 2000 });
  });
});

describe('ассистенты', () => {
  it('имя — displayName, без числового id — отбрасывается', async () => {
    get.mockResolvedValueOnce(json(200, [{ id: 12, name: 'Роман', displayName: 'Roman' }, { id: 'custom:x', name: 'Мой' }]));
    expect(await fetchGuestAgents('en')).toEqual([{ id: '12', name: 'Roman' }]);
    expect(get).toHaveBeenCalledWith('/webhook/agents?lang=en', expect.objectContaining({ skipAuth: true }));
  });
});

describe('ход', () => {
  it('события по порядку, ok', async () => {
    post.mockResolvedValueOnce(ndjson([{ type: 'guest', left: 3 }, { type: 'begin' }, { type: 'item', content: 'При' }, { type: 'end', content: 'Привет' }]));
    const got: GuestEvent[] = [];
    expect(await sendGuestMessage(INPUT, (e) => got.push(e))).toBe('ok');
    expect(got.map((e) => e.type)).toEqual(['guest', 'begin', 'item', 'end']);
    expect(post).toHaveBeenCalledWith('/webhook/guest/chat', INPUT, { skipAuth: true });
  });

  it('404 и чужой ассистент — проба пропала; занята — busy_trial; 400; сеть', async () => {
    post.mockResolvedValueOnce(json(404, { error: 'trial' }));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('trial_gone');
    post.mockResolvedValueOnce(json(409, { error: 'assistant_mismatch' }));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('trial_gone');
    post.mockResolvedValueOnce(json(409, { error: 'busy_trial' }));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('busy_trial');
    post.mockResolvedValueOnce(json(400, { error: 'message' }));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('bad_request');
    post.mockRejectedValueOnce(new Error('сеть'));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('network');
  });

  it('403 происхождение и 5xx — server, а не network', async () => {
    post.mockResolvedValueOnce(json(403, { error: 'origin' }));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('server');
    post.mockResolvedValueOnce(json(502, {}));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('server');
  });
});

describe('отмена хода (по ревью B3)', () => {
  it('signal доходит до apiClient.post', async () => {
    const controller = new AbortController();
    post.mockResolvedValueOnce(ndjson([{ type: 'end', content: 'X' }]));
    await sendGuestMessage(INPUT, () => {}, controller.signal);
    expect(post).toHaveBeenCalledWith('/webhook/guest/chat', INPUT, expect.objectContaining({ skipAuth: true, signal: controller.signal }));
  });

  it('post отклонён AbortError — aborted, а не network', async () => {
    post.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('aborted');
  });

  it('поток оборван AbortError — aborted', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(new DOMException('aborted', 'AbortError')); },
    });
    post.mockResolvedValueOnce(new Response(stream, { status: 200 }));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('aborted');
  });

  it('поток оборван обычной ошибкой сети — network', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(new Error('сеть')); },
    });
    post.mockResolvedValueOnce(new Response(stream, { status: 200 }));
    expect(await sendGuestMessage(INPUT, () => {})).toBe('network');
  });
});

describe('таймауты зависшего бэка (Critical, ревью B4)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Эмулирует зависший fetch: не резолвится сама, но отклоняется при срабатывании signal,
  // как это делает настоящий fetch при AbortController.abort().
  const hangsUntilAborted = (opts: { signal?: AbortSignal }) => new Promise<Response>((_resolve, reject) => {
    opts.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

  it('config: завис — через 4 с null, signal доходит до apiClient.get', async () => {
    vi.useFakeTimers();
    get.mockImplementationOnce((_url: string, opts: any) => hangsUntilAborted(opts));
    const pending = fetchGuestConfig();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toBeNull();
    expect(get).toHaveBeenCalledWith('/webhook/guest/config', expect.objectContaining({ skipAuth: true, signal: expect.any(AbortSignal) }));
  });

  it('агенты: завис — через 8 с [], signal доходит до apiClient.get', async () => {
    vi.useFakeTimers();
    get.mockImplementationOnce((_url: string, opts: any) => hangsUntilAborted(opts));
    const pending = fetchGuestAgents('ru');
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toEqual([]);
    expect(get).toHaveBeenCalledWith('/webhook/agents?lang=ru', expect.objectContaining({ skipAuth: true, signal: expect.any(AbortSignal) }));
  });

  it('session: завис — через 8 с error (не gone), signal доходит до apiClient.post', async () => {
    vi.useFakeTimers();
    post.mockImplementationOnce((_url: string, _body: unknown, opts: any) => hangsUntilAborted(opts));
    const pending = loadGuestSession('T');
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toEqual({ status: 'error' });
    expect(post).toHaveBeenCalledWith('/webhook/guest/session', { token: 'T' }, expect.objectContaining({ skipAuth: true, signal: expect.any(AbortSignal) }));
  });
});

describe('разговор после перезагрузки и перенос', () => {
  // m3 (ревью качества B9-fix): 'gone' (404) и 'error' (сбой) — РАЗНЫЕ исходы,
  // страница решает по ним по-разному (gone стирает ключ пробы, error — нет).
  it('session — роли и остаток; 404 — gone; 5xx и сеть — error', async () => {
    post.mockResolvedValueOnce(json(200, { assistantId: '14', messages: [{ role: 'user', content: 'В' }, { role: 'x', content: 'мусор' }], left: 2 }));
    expect(await loadGuestSession('T')).toEqual({ status: 'ok', assistantId: '14', messages: [{ role: 'user', content: 'В' }], left: 2 });
    post.mockResolvedValueOnce(json(404, { error: 'trial' }));
    expect(await loadGuestSession('T')).toEqual({ status: 'gone' });
    post.mockResolvedValueOnce(json(500, {}));
    expect(await loadGuestSession('T')).toEqual({ status: 'error' });
    post.mockRejectedValueOnce(new Error('сеть'));
    expect(await loadGuestSession('T')).toEqual({ status: 'error' });
  });

  it('claim: 200 — перенесено; 404/409 — пробы нет; 500 и сеть — повторить позже', async () => {
    post.mockResolvedValueOnce(json(200, { assistantId: '12', moved: 4 }));
    expect(await claimGuestTrial('T')).toEqual({ status: 'claimed', assistantId: '12' });
    expect(post).toHaveBeenLastCalledWith('/webhook/guest/claim', { token: 'T' });
    post.mockResolvedValueOnce(json(404, {}));
    expect(await claimGuestTrial('T')).toEqual({ status: 'gone' });
    post.mockResolvedValueOnce(json(409, {}));
    expect(await claimGuestTrial('T')).toEqual({ status: 'gone' });
    post.mockResolvedValueOnce(json(500, {}));
    expect(await claimGuestTrial('T')).toEqual({ status: 'retry' });
    post.mockRejectedValueOnce(new Error('сеть'));
    expect(await claimGuestTrial('T')).toEqual({ status: 'retry' });
  });
});
