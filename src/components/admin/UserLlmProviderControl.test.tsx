// @vitest-environment jsdom
/**
 * Модель ответов человека в карточке (spec spirits_back 2026-10-30-llm-provider-switch).
 */
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get, post } }));

import { UserLlmProviderControl } from './UserLlmProviderControl';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const mount = async (userId = '79030169187') => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<UserLlmProviderControl userId={userId} />); });
  await settle();
};
const rerender = async (userId: string) => {
  await act(async () => { root.render(<UserLlmProviderControl userId={userId} />); });
  await settle();
};
const radio = (name: string) =>
  Array.from(container.querySelectorAll('[role="radio"]')).find((el) => el.textContent?.includes(name)) as HTMLButtonElement;

beforeEach(() => { get.mockReset(); post.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('UserLlmProviderControl', () => {
  it('показывает текущий выбор', async () => {
    get.mockResolvedValue(ok({ userId: '79030169187', provider: 'qwen', qwenConfigured: true }));
    await mount();
    expect(get).toHaveBeenCalledWith('/webhook/admin/users/79030169187/llm-provider');
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('true');
    expect(radio('Claude').getAttribute('aria-checked')).toBe('false');
  });

  it('переключение сохраняется сразу', async () => {
    get.mockResolvedValue(ok({ userId: '79030169187', provider: 'claude', qwenConfigured: true }));
    post.mockResolvedValue(ok({ userId: '79030169187', provider: 'qwen', qwenConfigured: true }));
    await mount();
    await act(async () => { radio('Qwen').click(); });
    await settle();
    expect(post).toHaveBeenCalledWith('/webhook/admin/users/79030169187/llm-provider', { provider: 'qwen' });
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('true');
  });

  it('без ключа на сервере — предупреждение', async () => {
    get.mockResolvedValue(ok({ userId: '79030169187', provider: 'claude', qwenConfigured: false }));
    await mount();
    expect(container.textContent).toContain('Ключ Qwen на сервере не настроен');
  });

  it('ошибка загрузки видна', async () => {
    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await mount();
    expect(container.textContent).toContain('Не удалось загрузить или сохранить выбор');
  });

  it('заголовок связан с radiogroup через aria-labelledby', async () => {
    get.mockResolvedValue(ok({ userId: '79030169187', provider: 'claude', qwenConfigured: true }));
    await mount();
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    const labelledBy = group.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const titleEl = document.getElementById(labelledBy as string);
    expect(titleEl?.textContent).toContain('Модель ответов');
  });

  it('до ответа GET виден индикатор загрузки', async () => {
    let resolveGet: (v: unknown) => void = () => {};
    get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));
    await mount();
    expect(container.textContent).toContain('Загрузка…');
    await act(async () => { resolveGet(ok({ userId: '79030169187', provider: 'claude', qwenConfigured: true })); });
    await settle();
    expect(container.textContent).not.toContain('Загрузка…');
  });

  it('поздний ответ POST не ложится на чужую карточку после смены userId', async () => {
    let resolvePostA: (v: unknown) => void = () => {};
    get.mockImplementation((url: string) => {
      if (url.includes('userA')) return Promise.resolve(ok({ userId: 'userA', provider: 'claude', qwenConfigured: true }));
      return Promise.resolve(ok({ userId: 'userB', provider: 'claude', qwenConfigured: true }));
    });
    post.mockReturnValue(new Promise((resolve) => { resolvePostA = resolve; }));
    await mount('userA');
    await act(async () => { radio('Qwen').click(); });
    await settle();

    // GET для userB возвращает claude; карточка переключилась на другого человека.
    get.mockResolvedValue(ok({ userId: 'userB', provider: 'claude', qwenConfigured: true }));
    await rerender('userB');
    await settle();
    expect(radio('Claude').getAttribute('aria-checked')).toBe('true');

    // Запоздавший ответ POST для userA с qwen не должен тронуть карточку userB.
    await act(async () => { resolvePostA(ok({ userId: 'userA', provider: 'qwen', qwenConfigured: true })); });
    await settle();
    expect(radio('Claude').getAttribute('aria-checked')).toBe('true');
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('false');
  });

  it('POST 404 показывает понятную ошибку без кода', async () => {
    get.mockResolvedValue(ok({ userId: '79030169187', provider: 'claude', qwenConfigured: true }));
    post.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await mount();
    await act(async () => { radio('Qwen').click(); });
    await settle();
    expect(container.textContent).toContain('Пользователь не найден');
    expect(container.textContent).not.toContain('404');
  });
});
