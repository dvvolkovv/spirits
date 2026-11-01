// @vitest-environment jsdom
/**
 * Общий рубильник модели ответов (spec spirits_back 2026-10-31-global-llm-switch).
 * Правки по ревью качества 01.11.2026: подтверждение при любом переходе не на
 * Claude, двойной клик, «Загрузка…»/«Повторить», перечитывание ключей после
 * 409, доступность (role="alert", aria-busy), строка «переключил» скрыта от
 * Вебвизора (см. src/components/webvisorPrivacy.test.ts).
 */
import { act, StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { doubleClick } from '../../test/dom';

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
const retryButton = () =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Повторить')) as HTMLButtonElement | undefined;

// Слушатели на window переживают тест, если снимать их только в теле теста:
// ранний throw до соответствующего removeEventListener оставляет висящий
// обработчик, который может задеть следующий тест. afterEach снимает все.
const addedListeners: EventListener[] = [];
const onGlobalLlmEvent = (fn: EventListener) => {
  addedListeners.push(fn);
  window.addEventListener(GLOBAL_LLM_EVENT, fn);
};

beforeEach(() => { get.mockReset(); post.mockReset(); });
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  addedListeners.forEach((fn) => window.removeEventListener(GLOBAL_LLM_EVENT, fn));
  addedListeners.length = 0;
});

describe('GlobalLlmProviderControl', () => {
  it('три варианта, текущий выбран; GET общего рубильника', async () => {
    get.mockResolvedValue(state('qwen'));
    await mount();
    expect(get).toHaveBeenCalledWith('/webhook/admin/llm-provider');
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('true');
  });

  it('React.StrictMode (двойной запуск эффектов в dev, src/main.tsx) — после ответа GET блок не виснет на «Загрузка…»', async () => {
    // StrictMode монтирует дважды: mount → cleanup эффектов → mount. Без
    // сброса cancelledRef на каждый запуск эффекта (не только на первый)
    // cleanup между двумя монтированиями ставит его в true навсегда, и
    // fetchGlobalLlm(), даже успешно разрешившись, никогда не доходит до
    // setState (повторное ревью качества 01.11.2026).
    get.mockResolvedValue(state('qwen'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<StrictMode><GlobalLlmProviderControl /></StrictMode>); });
    await settle();
    expect(container.textContent).not.toContain('Загрузка');
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('true');
  });

  it('«Загрузка…» пока идёт GET', async () => {
    let resolveGet: (v: unknown) => void = () => {};
    get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));
    await mount();
    expect(container.textContent).toContain('Загрузка');
    await act(async () => { resolveGet(state('claude')); });
    await settle();
    expect(container.textContent).not.toContain('Загрузка');
  });

  it('ошибка GET — кнопка «Повторить» перезапускает загрузку', async () => {
    get.mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(state('qwen'));
    await mount();
    expect(container.textContent).toContain('Не удалось загрузить или сохранить');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const retry = retryButton();
    expect(retry).toBeTruthy();
    await act(async () => { retry!.click(); });
    await settle();
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('true');
    expect(retryButton()).toBeUndefined();
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
    onGlobalLlmEvent(seen);
    await mount();
    await act(async () => { radio('Qwen').click(); });
    await settle();
    expect(post).toHaveBeenCalledWith('/webhook/admin/llm-provider', { provider: 'qwen' });
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('true');
    expect(seen).toHaveBeenCalledTimes(1);
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

  it('переход между не-Claude моделями — тоже требует подтверждения', async () => {
    // kimi: true — иначе кнопка Kimi disabled (нет ключа) и клик не дойдёт до confirm.
    get.mockResolvedValue(state('qwen', true));
    post.mockResolvedValue(state('kimi'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await act(async () => { radio('Kimi').click(); });
    await settle();
    expect(confirm).toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith('/webhook/admin/llm-provider', { provider: 'kimi' });
  });

  it('confirm для Kimi — предупреждение про обучение моделей', async () => {
    // kimi: true — иначе кнопка Kimi disabled (нет ключа) и клик не дойдёт до confirm.
    get.mockResolvedValue(state('claude', true));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount();
    await act(async () => { radio('Kimi').click(); });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('Kimi (Moonshot AI) может использовать тексты для обучения своих моделей.');
  });

  it('confirm для Qwen — без предупреждения про обучение моделей', async () => {
    get.mockResolvedValue(state('claude'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount();
    await act(async () => { radio('Qwen').click(); });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).not.toContain('обучения');
  });

  it('два клика подряд — один confirm и один POST', async () => {
    get.mockResolvedValue(state('claude'));
    post.mockResolvedValue(state('qwen'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    doubleClick(radio('Qwen'));
    await settle();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('во время сохранения radiogroup помечена aria-busy', async () => {
    get.mockResolvedValue(state('claude'));
    let resolvePost: (v: unknown) => void = () => {};
    post.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await act(async () => { radio('Qwen').click(); });
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-busy')).toBe('true');
    await act(async () => { resolvePost(state('qwen')); });
    await settle();
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-busy')).toBe('false');
  });

  it('строка «с …, переключил …» скрыта от Вебвизора', async () => {
    get.mockResolvedValue(state('qwen'));
    await mount();
    const row = container.querySelector('[data-testid="global-llm-since"]');
    expect(row).not.toBeNull();
    expect(row!.className).toContain('ym-hide-content');
    expect(row!.textContent).toContain(fmtSince('2026-10-31T13:40:00.000Z'));
    expect(row!.textContent).toContain('admin-1');
  });

  it('409 no_key — понятная ошибка; выбор не меняется, событие не уходит, ключи перечитаны', async () => {
    get.mockResolvedValueOnce(state('claude', true)).mockResolvedValueOnce(state('claude', false));
    post.mockResolvedValue(ok({ error: 'no_key', provider: 'kimi' }, 409));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const seen = vi.fn();
    onGlobalLlmEvent(seen);
    await mount();
    await act(async () => { radio('Kimi').click(); });
    await settle();
    expect(container.textContent).toContain('У этой модели нет ключа на сервере');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(radio('Claude').getAttribute('aria-checked')).toBe('true');
    expect(seen).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(2);
    expect(radio('Kimi').disabled).toBe(true);
  });
});
