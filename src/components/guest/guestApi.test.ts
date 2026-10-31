// src/components/guest/guestApi.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(get).toHaveBeenCalledWith('/webhook/guest/config', { skipAuth: true });
    get.mockResolvedValueOnce(json(200, { mode: 'всё' }));
    expect((await fetchGuestConfig())?.mode).toBe('off');
    get.mockRejectedValueOnce(new Error('сеть'));
    expect(await fetchGuestConfig()).toBeNull();
  });
});

describe('ассистенты', () => {
  it('имя — displayName, без числового id — отбрасывается', async () => {
    get.mockResolvedValueOnce(json(200, [{ id: 12, name: 'Роман', displayName: 'Roman' }, { id: 'custom:x', name: 'Мой' }]));
    expect(await fetchGuestAgents('en')).toEqual([{ id: '12', name: 'Roman' }]);
    expect(get).toHaveBeenCalledWith('/webhook/agents?lang=en', { skipAuth: true });
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

describe('разговор после перезагрузки и перенос', () => {
  it('session — роли и остаток; 404 — null', async () => {
    post.mockResolvedValueOnce(json(200, { assistantId: '14', messages: [{ role: 'user', content: 'В' }, { role: 'x', content: 'мусор' }], left: 2 }));
    expect(await loadGuestSession('T')).toEqual({ assistantId: '14', messages: [{ role: 'user', content: 'В' }], left: 2 });
    post.mockResolvedValueOnce(json(404, { error: 'trial' }));
    expect(await loadGuestSession('T')).toBeNull();
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
