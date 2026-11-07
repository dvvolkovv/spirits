// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { click, clickAsync, flush, mount, tRu, type, visibleText, type Mounted } from '../../test/dom';
import CompatibilityInterface from './CompatibilityInterface';
import { apiClient } from '../../services/apiClient';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../services/apiClient', () => ({ apiClient: { post: vi.fn() } }));
const api = vi.mocked(apiClient);
let view: Mounted | null = null;

const settle = async () => { await flush(); await flush(); };

const openAnalysis = async () => {
  view = mount(<MemoryRouter><CompatibilityInterface /></MemoryRouter>);
  await flush();
  const input = view.container.querySelector('[data-testid="compatibility-phone-input"]')!;
  type(input, '70000000000');
  const add = Array.from(view.container.querySelectorAll('button'))
    .find((button) => button.textContent?.includes(tRu('compatibility.add')))!;
  click(add);
  const submit = view.container.querySelector<HTMLButtonElement>('[data-testid="compatibility-submit-btn"]')!;
  expect(submit.disabled).toBe(false);
  return { container: view.container, submit };
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { view?.unmount(); view = null; });

it('shows a generic error without reading the body of a non-privacy failure', async () => {
  const json = vi.fn(() => new Promise<never>(() => {}));
  api.post.mockResolvedValue({ ok: false, status: 500, json } as any);
  const { container, submit } = await openAnalysis();

  await clickAsync(submit);
  await settle();

  expect(visibleText(container)).toContain(tRu('compatibility.error_analysis'));
  expect(submit.disabled).toBe(false);
  expect(submit.textContent).toContain(tRu('compatibility.analyze'));
  expect(submit.textContent).not.toContain(tRu('compatibility.analyzing'));
  expect(json).not.toHaveBeenCalled();
});

it.each([
  [404, 'PROFILE_NOT_AVAILABLE', 'compatibility.error_profile_not_available'],
  [422, 'PROFILE_DATA_UNAVAILABLE', 'compatibility.error_profile_data_unavailable'],
])('reads status %i once and shows its privacy error', async (status, code, key) => {
  const json = vi.fn(async () => ({ code }));
  api.post.mockResolvedValue({ ok: false, status, json } as any);
  const { container, submit } = await openAnalysis();

  await clickAsync(submit);
  await settle();

  expect(json).toHaveBeenCalledTimes(1);
  expect(visibleText(container)).toContain(tRu(key));
  expect(visibleText(container)).not.toContain(tRu('compatibility.error_analysis'));
  expect(submit.disabled).toBe(false);
});
