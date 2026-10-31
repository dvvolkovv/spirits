// @vitest-environment jsdom
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, def?: string, opts?: Record<string, unknown>) =>
      String(def ?? k).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(opts?.[n] ?? '')),
  }),
}));

import GlobalLlmBanner from './GlobalLlmBanner';
import { GLOBAL_LLM_EVENT } from './globalLlm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const mount = async (onOpen = vi.fn()) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<GlobalLlmBanner onOpen={onOpen} />); });
  await settle();
  return onOpen;
};

beforeEach(() => { get.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('GlobalLlmBanner', () => {
  it('рубильник на Claude — плашки нет', async () => {
    get.mockResolvedValue(ok({ provider: 'claude', since: null, by: null, configured: { qwen: true, kimi: false } }));
    await mount();
    expect(container.querySelector('[data-testid="global-llm-banner"]')).toBeNull();
  });

  it('рубильник на Qwen — плашка с моделью; «Изменить» открывает блок', async () => {
    get.mockResolvedValue(ok({ provider: 'qwen', since: '2026-10-31T13:40:00.000Z', by: 'admin-1', configured: { qwen: true, kimi: false } }));
    const onOpen = await mount();
    const b = container.querySelector('[data-testid="global-llm-banner"]')!;
    expect(b.textContent).toContain('Qwen');
    await act(async () => { (b.querySelector('button') as HTMLButtonElement).click(); });
    expect(onOpen).toHaveBeenCalled();
  });

  it('событие смены на Claude — плашка исчезает без запроса', async () => {
    get.mockResolvedValue(ok({ provider: 'qwen', since: null, by: null, configured: { qwen: true, kimi: false } }));
    await mount();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(GLOBAL_LLM_EVENT, { detail: { provider: 'claude', since: null, by: null, configured: { qwen: true, kimi: false } } }));
    });
    expect(container.querySelector('[data-testid="global-llm-banner"]')).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ошибка загрузки — плашки нет', async () => {
    get.mockRejectedValue(new Error('network'));
    await mount();
    expect(container.querySelector('[data-testid="global-llm-banner"]')).toBeNull();
  });
});
