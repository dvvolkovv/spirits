// @vitest-environment jsdom
/**
 * Правки по ревью качества 01.11.2026: при ошибке загрузки — нейтральная
 * плашка, а не молчаливое исчезновение (читалось бы как «все на Claude»);
 * перечитывание состояния при смене вкладки (activeTab); «Изменить» скрывает
 * проп hideOpen на вкладке «Ассистенты»; опоздавший GET не затирает событие,
 * пришедшее раньше (heard); модель рубильника без ключа — отдельный текст.
 */
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
interface Opts { onOpen?: () => void; activeTab?: string; hideOpen?: boolean }
const render = (opts: Opts) => <GlobalLlmBanner onOpen={opts.onOpen ?? vi.fn()} activeTab={opts.activeTab ?? 'support'} hideOpen={opts.hideOpen} />;
const mount = async (opts: Opts = {}) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(render(opts)); });
  await settle();
  return opts.onOpen;
};
const rerender = async (opts: Opts) => {
  await act(async () => { root.render(render(opts)); });
  await settle();
};
const banner = () => container.querySelector('[data-testid="global-llm-banner"]');

beforeEach(() => { get.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('GlobalLlmBanner', () => {
  it('рубильник на Claude — плашки нет', async () => {
    get.mockResolvedValue(ok({ provider: 'claude', since: null, by: null, configured: { qwen: true, kimi: false } }));
    await mount();
    expect(banner()).toBeNull();
  });

  it('рубильник на Qwen — плашка с моделью; «Изменить» открывает блок и описана aria-describedby', async () => {
    get.mockResolvedValue(ok({ provider: 'qwen', since: '2026-10-31T13:40:00.000Z', by: 'admin-1', configured: { qwen: true, kimi: false } }));
    const onOpen = vi.fn();
    await mount({ onOpen });
    const b = banner()!;
    expect(b.textContent).toContain('Qwen');
    const button = b.querySelector('button') as HTMLButtonElement;
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toContain('Qwen');
    await act(async () => { button.click(); });
    expect(onOpen).toHaveBeenCalled();
  });

  it('hideOpen скрывает кнопку «Изменить», текст плашки остаётся', async () => {
    get.mockResolvedValue(ok({ provider: 'qwen', since: '2026-10-31T13:40:00.000Z', by: 'admin-1', configured: { qwen: true, kimi: false } }));
    await mount({ hideOpen: true });
    const b = banner()!;
    expect(b.textContent).toContain('Qwen');
    expect(b.querySelector('button')).toBeNull();
  });

  it('смена вкладки (activeTab) перечитывает состояние', async () => {
    get.mockResolvedValue(ok({ provider: 'claude', since: null, by: null, configured: { qwen: true, kimi: false } }));
    await mount({ activeTab: 'support' });
    expect(get).toHaveBeenCalledTimes(1);
    await rerender({ activeTab: 'assistants' });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('модель рубильника без ключа — явно говорит, что фактически отвечает Claude', async () => {
    get.mockResolvedValue(ok({ provider: 'qwen', since: '2026-10-31T13:40:00.000Z', by: 'admin-1', configured: { qwen: false, kimi: false } }));
    await mount();
    expect(banner()!.textContent).toContain('фактически Claude');
  });

  it('событие смены на Qwen — плашка появляется', async () => {
    get.mockResolvedValue(ok({ provider: 'claude', since: null, by: null, configured: { qwen: true, kimi: false } }));
    await mount();
    expect(banner()).toBeNull();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(GLOBAL_LLM_EVENT, { detail: { provider: 'qwen', since: null, by: null, configured: { qwen: true, kimi: false } } }));
    });
    expect(banner()).not.toBeNull();
  });

  it('событие смены на Claude — плашка исчезает без запроса', async () => {
    get.mockResolvedValue(ok({ provider: 'qwen', since: null, by: null, configured: { qwen: true, kimi: false } }));
    await mount();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(GLOBAL_LLM_EVENT, { detail: { provider: 'claude', since: null, by: null, configured: { qwen: true, kimi: false } } }));
    });
    expect(banner()).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('событие пришло раньше ответа GET — опоздавший GET не затирает событие', async () => {
    let resolveGet: (v: unknown) => void = () => {};
    get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));
    await mount();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(GLOBAL_LLM_EVENT, { detail: { provider: 'qwen', since: null, by: null, configured: { qwen: true, kimi: false } } }));
    });
    await act(async () => { resolveGet(ok({ provider: 'claude', since: null, by: null, configured: { qwen: true, kimi: false } })); });
    await settle();
    expect(banner()).not.toBeNull();
    expect(banner()!.textContent).toContain('Qwen');
  });

  it('ошибка загрузки — нейтральная плашка с кнопкой «Открыть» (не «Изменить» — неизвестно что менять), не молчание', async () => {
    get.mockRejectedValue(new Error('network'));
    await mount();
    const b = banner();
    expect(b).not.toBeNull();
    expect(b!.textContent).toContain('Не удалось узнать модель ответов для всех');
    expect(b!.querySelector('button')?.textContent).toBe('Открыть');
  });

  it('повторное ревью 01.11.2026: смена вкладки в состоянии ошибки не мигает — ошибка не сбрасывается до результата нового GET', async () => {
    get.mockRejectedValueOnce(new Error('net'));
    await mount({ activeTab: 'support' });
    expect(banner()!.textContent).toContain('Не удалось узнать модель ответов для всех');

    let resolveGet: (v: unknown) => void = () => {};
    get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));
    await rerender({ activeTab: 'assistants' });
    // До ответа нового GET плашка ошибки должна остаться как есть — не
    // исчезать и не мигать (эффект больше не сбрасывает error в начале).
    expect(banner()).not.toBeNull();
    expect(banner()!.textContent).toContain('Не удалось узнать модель ответов для всех');

    await act(async () => { resolveGet(ok({ provider: 'qwen', since: null, by: null, configured: { qwen: true, kimi: false } })); });
    await settle();
    expect(banner()!.textContent).toContain('Qwen');
  });
});
