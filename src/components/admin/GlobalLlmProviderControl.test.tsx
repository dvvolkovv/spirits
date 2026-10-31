// @vitest-environment jsdom
/** Общий рубильник модели ответов (spec spirits_back 2026-10-31-global-llm-switch). */
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get, post } }));
// В тестах i18n не инициализирован: без подмены t() вернёт текст по умолчанию
// без подстановки {{model}}/{{since}}. Подмена подставляет значения.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, def?: string, opts?: Record<string, unknown>) =>
      String(def ?? k).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(opts?.[n] ?? '')),
  }),
}));

import { GlobalLlmProviderControl } from './GlobalLlmProviderControl';
import { GLOBAL_LLM_EVENT, fmtSince } from './globalLlm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const state = (provider: string, kimi = false, since: string | null = '2026-10-31T13:40:00.000Z') =>
  ok({ provider, since, by: 'admin-1', configured: { qwen: true, kimi } });
const mount = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<GlobalLlmProviderControl />); });
  await settle();
};
const radio = (name: string) =>
  Array.from(container.querySelectorAll('[role="radio"]')).find((el) => el.textContent?.includes(name)) as HTMLButtonElement;

beforeEach(() => { get.mockReset(); post.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe('GlobalLlmProviderControl', () => {
  it('три варианта, текущий выбран; GET общего рубильника', async () => {
    get.mockResolvedValue(state('qwen'));
    await mount();
    expect(get).toHaveBeenCalledWith('/webhook/admin/llm-provider');
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('true');
  });

  it('модель без ключа недоступна и помечена', async () => {
    get.mockResolvedValue(state('claude', false));
    await mount();
    expect(radio('Kimi').disabled).toBe(true);
    expect(radio('Kimi').textContent).toContain('нет ключа на сервере');
  });

  it('уход с Claude — подтверждение; отказ — без запроса', async () => {
    get.mockResolvedValue(state('claude'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount();
    await act(async () => { radio('Qwen').click(); });
    expect(confirm).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('уход с Claude — согласие: POST и событие смены', async () => {
    get.mockResolvedValue(state('claude'));
    post.mockResolvedValue(state('qwen'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const seen = vi.fn();
    window.addEventListener(GLOBAL_LLM_EVENT, seen);
    await mount();
    await act(async () => { radio('Qwen').click(); });
    await settle();
    expect(post).toHaveBeenCalledWith('/webhook/admin/llm-provider', { provider: 'qwen' });
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('true');
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(GLOBAL_LLM_EVENT, seen);
  });

  it('возврат на Claude — без подтверждения', async () => {
    get.mockResolvedValue(state('qwen'));
    post.mockResolvedValue(state('claude'));
    const confirm = vi.spyOn(window, 'confirm');
    await mount();
    await act(async () => { radio('Claude').click(); });
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith('/webhook/admin/llm-provider', { provider: 'claude' });
  });

  it('строка «с …, переключил …»', async () => {
    get.mockResolvedValue(state('qwen'));
    await mount();
    expect(container.textContent).toContain(fmtSince('2026-10-31T13:40:00.000Z'));
    expect(container.textContent).toContain('admin-1');
  });

  it('409 no_key — понятная ошибка', async () => {
    get.mockResolvedValue(state('claude', true));
    post.mockResolvedValue(ok({ error: 'no_key', provider: 'kimi' }, 409));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await act(async () => { radio('Kimi').click(); });
    await settle();
    expect(container.textContent).toContain('У этой модели нет ключа на сервере');
  });
});
