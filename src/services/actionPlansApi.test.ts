import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
import { apiClient } from './apiClient';
import { ActionPlanRequestError, actionPlansApi } from './actionPlansApi';

const api = vi.mocked(apiClient);
const res = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const PLAN = {
  id: 'plan-1', assistantId: '12', title: 'План', summary: '', items: [],
  createdAt: '2026-11-17T10:00:00Z', updatedAt: '2026-11-17T10:00:00Z',
};
// Тело NestJS на BadRequestException (spirits_back: action-plans.service.ts, generate).
const NOT_ENOUGH = { statusCode: 400, message: 'not enough conversation for an action plan', error: 'Bad Request' };

describe('actionPlansApi — без метки «Чистого листа»', () => {
  beforeEach(() => vi.clearAllMocks());

  it('get просит план только по ассистенту', async () => {
    api.get.mockResolvedValue(res(200, { plan: PLAN }));
    await expect(actionPlansApi.get(12)).resolves.toEqual(PLAN);
    expect(api.get).toHaveBeenCalledWith('/webhook/chat/action-plans?assistantId=12');
  });

  it('get не шлёт метку, даже если её передал старый вызов: точка отсчёта — на сервере', async () => {
    api.get.mockResolvedValue(res(200, { plan: null }));
    await (actionPlansApi.get as (...args: unknown[]) => Promise<unknown>)(12, '1728000000000');
    expect(api.get).toHaveBeenCalledWith('/webhook/chat/action-plans?assistantId=12');
  });

  it('generate шлёт в теле только assistantId', async () => {
    api.post.mockResolvedValue(res(200, PLAN));
    await expect(actionPlansApi.generate('custom:abc')).resolves.toEqual(PLAN);
    expect(api.post).toHaveBeenCalledWith('/webhook/chat/action-plans/generate', { assistantId: 'custom:abc' });
  });

  it('generate не шлёт метку, даже если её передал старый вызов', async () => {
    api.post.mockResolvedValue(res(200, PLAN));
    await (actionPlansApi.generate as (...args: unknown[]) => Promise<unknown>)(12, '1728000000000');
    expect(api.post).toHaveBeenCalledWith('/webhook/chat/action-plans/generate', { assistantId: '12' });
  });
});

describe('actionPlansApi — ошибки с кодом и текстом бэка', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400 «мало разговора» — ActionPlanRequestError с notEnoughConversation', async () => {
    api.post.mockResolvedValue(res(400, NOT_ENOUGH));
    const err = await actionPlansApi.generate(12).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ActionPlanRequestError);
    expect(err).toMatchObject({ status: 400, serverMessage: NOT_ENOUGH.message, notEnoughConversation: true });
  });

  it('другая 400 — не «мало разговора»: различаем по тексту, а не по коду', async () => {
    api.post.mockResolvedValue(res(400, { statusCode: 400, message: 'assistantId is required', error: 'Bad Request' }));
    const err = await actionPlansApi.generate(12).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, serverMessage: 'assistantId is required', notEnoughConversation: false });
  });

  it('тот же текст с другим кодом — не «мало разговора»', async () => {
    api.post.mockResolvedValue(res(502, { statusCode: 502, message: NOT_ENOUGH.message }));
    const err = await actionPlansApi.generate(12).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, notEnoughConversation: false });
  });

  it('тело не JSON (прокси отдал HTML) — ошибка с кодом и без текста бэка', async () => {
    api.get.mockResolvedValue({ ok: false, status: 504, json: async () => { throw new SyntaxError('Unexpected token <'); } } as unknown as Response);
    const err = await actionPlansApi.get(12).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ActionPlanRequestError);
    expect(err).toMatchObject({ status: 504, serverMessage: null, notEnoughConversation: false });
  });

  it('message массивом (ValidationPipe) — без текста бэка', async () => {
    api.patch.mockResolvedValue(res(400, { statusCode: 400, message: ['title must be a string'], error: 'Bad Request' }));
    const err = await actionPlansApi.update('plan-1', { title: 'x', summary: '', items: [] }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400, serverMessage: null, notEnoughConversation: false });
  });
});
