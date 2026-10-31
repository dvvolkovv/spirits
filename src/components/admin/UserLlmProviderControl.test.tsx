// @vitest-environment jsdom
/**
 * Модель ответов человека в карточке (spec spirits_back 2026-10-30-llm-provider-switch,
 * 2026-10-31-kimi-provider-design, 2026-10-31-global-llm-switch). Правки по
 * ревью качества 01.11.2026: «Как у всех» показывает ту модель, которая
 * ФАКТИЧЕСКИ отвечает (effective — с учётом ключа рубильника, не только
 * global), подсказка про обычный путь — и для «Как у всех», когда рубильник
 * не на Claude; двойной клик; role="alert"/aria-busy.
 */
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { doubleClick } from '../../test/dom';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get, post } }));
// В тестах i18n не инициализирован: без подмены t() вернёт текст по умолчанию
// без подстановки {{model}} — подпись «Как у всех» не покажет модель рубильника.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, def?: string, opts?: Record<string, unknown>) =>
      String(def ?? k).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(opts?.[n] ?? '')),
  }),
}));

import { UserLlmProviderControl } from './UserLlmProviderControl';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
/**
 * Ответ нового бэкенда: выбор, модель рубильника (global), чем фактически
 * отвечает сейчас (effective — учитывает ключ global, не только личный выбор),
 * ключи по каждому запасному.
 */
const state = (provider: string, qwen = true, kimi = true, userId = 'u-1', global = 'claude', effective?: string) =>
  ok({ userId, provider, effective: effective ?? (provider === 'default' ? global : provider), global, qwenConfigured: qwen, configured: { qwen, kimi } });
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
// «Claude» входит и в подпись «Как у всех (сейчас: Claude)» — ищем точное
// совпадение начала, а не произвольное вхождение.
const radio = (name: string) => {
  const all = Array.from(container.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
  return all.find((el) => el.textContent?.trim().startsWith(name)) as HTMLButtonElement;
};

beforeEach(() => { get.mockReset(); post.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe('UserLlmProviderControl', () => {
  it('четыре варианта; показывает текущий выбор', async () => {
    get.mockResolvedValue(state('kimi'));
    await mount();
    expect(get).toHaveBeenCalledWith('/webhook/admin/users/u-1/llm-provider');
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(4);
    expect(radio('Kimi').getAttribute('aria-checked')).toBe('true');
    expect(radio('Qwen').getAttribute('aria-checked')).toBe('false');
    expect(radio('Claude').getAttribute('aria-checked')).toBe('false');
    expect(radio('Как у всех').getAttribute('aria-checked')).toBe('false');
  });

  it('«Как у всех» — подпись с моделью рубильника; выбран, если provider default', async () => {
    get.mockResolvedValue(state('default', true, true, 'u-1', 'qwen'));
    await mount();
    const d = radio('Как у всех');
    expect(d.textContent).toContain('Qwen');
    expect(d.getAttribute('aria-checked')).toBe('true');
  });

  it('«Как у всех»: у модели рубильника нет ключа — показывает Claude (effective, а не global)', async () => {
    get.mockResolvedValue(state('default', false, true, 'u-1', 'qwen', 'claude'));
    await mount();
    expect(radio('Как у всех').textContent).toContain('Claude');
  });

  it('выбор «Как у всех» отправляет default', async () => {
    get.mockResolvedValue(state('kimi'));
    post.mockResolvedValue(state('default'));
    await mount();
    await act(async () => { radio('Как у всех').click(); });
    await settle();
    expect(post).toHaveBeenCalledWith('/webhook/admin/users/u-1/llm-provider', { provider: 'default' });
  });

  it('явный Claude — отдельный вариант', async () => {
    get.mockResolvedValue(state('claude'));
    await mount();
    expect(radio('Claude').getAttribute('aria-checked')).toBe('true');
    expect(radio('Как у всех').getAttribute('aria-checked')).toBe('false');
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

  it('два клика подряд — один POST', async () => {
    get.mockResolvedValue(state('claude'));
    post.mockResolvedValue(state('kimi'));
    await mount();
    doubleClick(radio('Kimi'));
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('во время сохранения radiogroup помечена aria-busy', async () => {
    get.mockResolvedValue(state('claude'));
    let resolvePost: (v: unknown) => void = () => {};
    post.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
    await mount();
    await act(async () => { radio('Kimi').click(); });
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-busy')).toBe('true');
    await act(async () => { resolvePost(state('kimi')); });
    await settle();
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute('aria-busy')).toBe('false');
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
    expect(radio('Как у всех').textContent).toContain('Как у всех (сейчас: Claude)');
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

  it('подсказка про ответ Claude — и для «Как у всех», когда рубильник не на Claude', async () => {
    get.mockResolvedValue(state('default', true, true, 'u-1', 'qwen'));
    await mount();
    expect(container.textContent).toContain('Если выбранная модель не ответит, ответит Claude.');
  });

  it('«Как у всех» на рубильнике-Claude — подсказки про ответ Claude нет', async () => {
    get.mockResolvedValue(state('default'));
    await mount();
    expect(container.textContent).not.toContain('Если выбранная модель не ответит, ответит Claude.');
  });

  it('ошибка загрузки видна и объявлена как alert', async () => {
    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await mount();
    expect(container.textContent).toContain('Не удалось загрузить или сохранить выбор');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
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
