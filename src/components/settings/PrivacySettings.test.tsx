// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { actAsync, click, clickAsync, flush, mount, tRu, visibleText, type Mounted } from '../../test/dom';
import PrivacySettings from './PrivacySettings';
import { apiClient } from '../../services/apiClient';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('../../services/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
const api = vi.mocked(apiClient);
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as any;
const settle = async () => { await flush(); await flush(); };
let view: Mounted | null = null;

const open = async () => {
  view = mount(<PrivacySettings />);
  await settle();
  return view.container;
};

const privacySwitch = (container: HTMLElement, name: 'automatic_profiling' | 'discoverable') => {
  const label = tRu(`settings.privacy_controls.${name}`);
  const element = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="switch"]'))
    .find((candidate) => candidate.getAttribute('aria-label') === label);
  if (!element) throw new Error(`switch not found: ${label}`);
  return element;
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(ok({ automaticProfiling: true, discoverable: true }));
});
afterEach(() => { view?.unmount(); view = null; });

it('optimistically saves only its own field and ignores the other field in the response', async () => {
  let resolvePost: (value: any) => void = () => {};
  api.post.mockReturnValue(new Promise((resolve) => { resolvePost = resolve; }));
  const container = await open();
  const automatic = privacySwitch(container, 'automatic_profiling');
  const discoverable = privacySwitch(container, 'discoverable');
  click(automatic);
  expect(automatic.getAttribute('aria-checked')).toBe('false');
  expect(automatic.disabled).toBe(true);
  expect(discoverable.disabled).toBe(false);
  expect(api.post).toHaveBeenCalledWith('/webhook/privacy-settings', { automaticProfiling: false });
  await actAsync(() => resolvePost(ok({ automaticProfiling: false, discoverable: false })));
  expect(discoverable.getAttribute('aria-checked')).toBe('true');
  expect(automatic.disabled).toBe(false);
});

it.each([
  ['HTTP 503', () => api.post.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as any)],
  ['network error', () => api.post.mockRejectedValue(new Error('network'))],
])('%s rolls back and shows an error', async (_name, fail) => {
  fail();
  const container = await open();
  const automatic = privacySwitch(container, 'automatic_profiling');
  await clickAsync(automatic);
  await settle();
  expect(automatic.getAttribute('aria-checked')).toBe('true');
  expect(automatic.disabled).toBe(false);
  expect(visibleText(container)).toContain(tRu('settings.privacy_controls.save_error'));
});

it('shows a load error without fake defaults and retries GET', async () => {
  api.get.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as any);
  const container = await open();
  expect(container.querySelectorAll('[role="switch"]')).toHaveLength(0);
  expect(visibleText(container)).toContain(tRu('settings.privacy_controls.load_error'));
  api.get.mockResolvedValueOnce(ok({ automaticProfiling: false, discoverable: true }));
  const retry = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === tRu('settings.privacy_controls.retry'))!;
  await clickAsync(retry);
  await settle();
  expect(privacySwitch(container, 'automatic_profiling').getAttribute('aria-checked')).toBe('false');
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('does not start a duplicate POST for a saving field', async () => {
  api.post.mockReturnValue(new Promise(() => {}));
  const container = await open();
  const automatic = privacySwitch(container, 'automatic_profiling');
  click(automatic); click(automatic);
  expect(api.post).toHaveBeenCalledTimes(1);
});

it('applies two responses only to their own fields in reverse completion order', async () => {
  const pending: Array<{ body: any; resolve: (value: any) => void }> = [];
  api.post.mockImplementation(async (_url, body) => new Promise((resolve) => { pending.push({ body, resolve }); }) as any);
  const container = await open();
  click(privacySwitch(container, 'automatic_profiling'));
  click(privacySwitch(container, 'discoverable'));
  expect(pending.map((item) => item.body)).toEqual([{ automaticProfiling: false }, { discoverable: false }]);
  await actAsync(() => pending[1].resolve(ok({ automaticProfiling: true, discoverable: false })));
  expect(privacySwitch(container, 'automatic_profiling').getAttribute('aria-checked')).toBe('false');
  await actAsync(() => pending[0].resolve(ok({ automaticProfiling: false, discoverable: true })));
  expect(privacySwitch(container, 'discoverable').getAttribute('aria-checked')).toBe('false');
});
