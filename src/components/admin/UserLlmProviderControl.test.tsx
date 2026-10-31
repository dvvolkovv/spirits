// @vitest-environment jsdom
/**
 * Модель ответов человека в карточке (spec spirits_back 2026-10-30-llm-provider-switch,
 * 2026-10-31-kimi-provider-design).
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
/** Ответ нового бэкенда: выбор и ключи по каждому запасному. */
const state = (provider: string, qwen = true, kimi = true, userId = 'u-1') =>
  ok({ userId, provider, qwenConfigured: qwen, configured: { qwen, kimi } });
const mount = async (userId = 'u-1') => {
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
  it('три варианта; показывает текущий выбор', async () => {
    get.mockResolvedValue(state('kimi'));
    await mount();
    expect(get).toHaveBeenCalledWith('/webhook/admin/users/u-1/llm-provider');
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(radio('Kimi').getAttribute('aria-checked')).toBe('true');
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('false');
    expect(radio('Claude').getAttribute('aria-checked')).toBe('false');
  });

  it('переключение на Kimi сохраняется сразу', async () => {
    get.mockResolvedValue(state('claude'));
    post.mockResolvedValue(state('kimi'));
    await mount();
    await act(async () => { radio('Kimi').click(); });
    await settle();
    expect(post).toHaveBeenCalledWith('/webhook/admin/users/u-1/llm-provider', { provider: 'kimi' });
    expect(radio('Kimi').getAttribute('aria-checked')).toBe('true');
  });

  it('вариант без ключа помечен «нет ключа»; предупреждения нет, пока он не выбран', async () => {
    get.mockResolvedValue(state('claude', true, false));
    await mount();
    expect(radio('Kimi').textContent).toContain('нет ключа');
    expect(radio('Qwen').textContent).not.toContain('нет ключа');
    expect(container.textContent).not.toContain('на сервере не настроен');
  });

  it('выбран Kimi без ключа — предупреждение про Kimi', async () => {
    get.mockResolvedValue(state('kimi', true, false));
    await mount();
    expect(container.textContent).toContain('Ключ Kimi на сервере не настроен');
  });

  it('старый бэкенд (только qwenConfigured): Kimi — без ключа, Qwen — по qwenConfigured', async () => {
    get.mockResolvedValue(ok({ userId: 'u-1', provider: 'qwen', qwenConfigured: false }));
    await mount();
    expect(container.textContent).toContain('Ключ Qwen на сервере не настроен');
    expect(radio('Kimi').textContent).toContain('нет ключа');
  });

  it('подсказка про ответ Claude показана только если выбран не Claude', async () => {
    get.mockResolvedValue(state('kimi'));
    await mount();
    expect(container.textContent).toContain('Если выбранная модель не ответит, ответит Claude.');

    await act(async () => { root.unmount(); });
    container.remove();

    get.mockResolvedValue(state('claude'));
    await mount();
    expect(container.textContent).not.toContain('Если выбранная модель не ответит, ответит Claude.');
  });

  it('ошибка загрузки видна', async () => {
    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await mount();
    expect(container.textContent).toContain('Не удалось загрузить или сохранить выбор');
  });

  it('заголовок связан с radiogroup через aria-labelledby', async () => {
    get.mockResolvedValue(state('claude'));
    await mount();
    const group = container.querySelector('[role="radiogroup"]') as HTMLElement;
    const labelledBy = group.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)?.textContent).toContain('Модель ответов');
  });

  it('до ответа GET виден индикатор загрузки', async () => {
    let resolveGet: (v: unknown) => void = () => {};
    get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));
    await mount();
    expect(container.textContent).toContain('Загрузка…');
    await act(async () => { resolveGet(state('claude')); });
    await settle();
    expect(container.textContent).not.toContain('Загрузка…');
  });

  it('поздний ответ POST не ложится на чужую карточку после смены userId', async () => {
    let resolvePostA: (v: unknown) => void = () => {};
    get.mockImplementation((url: string) => Promise.resolve(
      url.includes('userA') ? state('claude', true, true, 'userA') : state('claude', true, true, 'userB'),
    ));
    post.mockReturnValue(new Promise((resolve) => { resolvePostA = resolve; }));
    await mount('userA');
    await act(async () => { radio('Kimi').click(); });
    await settle();

    await rerender('userB');
    await settle();
    expect(radio('Claude').getAttribute('aria-checked')).toBe('true');

    await act(async () => { resolvePostA(state('kimi', true, true, 'userA')); });
    await settle();
    expect(radio('Claude').getAttribute('aria-checked')).toBe('true');
    expect(radio('Kimi').getAttribute('aria-checked')).toBe('false');
  });

  it('POST 404 показывает понятную ошибку без кода', async () => {
    get.mockResolvedValue(state('claude'));
    post.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await mount();
    await act(async () => { radio('Kimi').click(); });
    await settle();
    expect(container.textContent).toContain('Пользователь не найден');
    expect(container.textContent).not.toContain('404');
  });
});
