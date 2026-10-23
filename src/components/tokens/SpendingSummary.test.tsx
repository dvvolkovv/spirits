// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));
vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('../../i18n', () => ({ default: { language: 'ru' } }));

import { mount, flush, visibleText, type Mounted } from '../../test/dom';
import { SpendingSummary } from './SpendingSummary';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

let m: Mounted | null = null;
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  get.mockReset();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  m?.unmount();
  m = null;
  vi.restoreAllMocks();
});

const render = async () => {
  m = mount(<SpendingSummary />);
  await flush();
  await flush();
  return m;
};

describe('SpendingSummary', () => {
  it('показывает заголовок и месяцы из ручки; запрос — с поясом', async () => {
    get.mockResolvedValue(ok({ months: [{ month: '2026-10', total: 6193, categories: [{ key: 'replies', tokens: 6193, count: 12 }] }] }));
    const r = await render();
    expect(visibleText(r.container)).toContain('Расход по месяцам');
    expect(visibleText(r.container)).toContain('Ответы ассистентов');
    expect(String(get.mock.calls[0][0])).toMatch(/^\/webhook\/tokens\/spending\?tz=.+$/);
  });

  it('ручка ответила ошибкой — блока нет', async () => {
    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect((await render()).container.innerHTML).toBe('');
  });

  it('трат нет — блока нет', async () => {
    get.mockResolvedValue(ok({ months: [] }));
    expect((await render()).container.innerHTML).toBe('');
  });

  it('в ответе нет months — блока нет', async () => {
    get.mockResolvedValue(ok({}));
    expect((await render()).container.innerHTML).toBe('');
  });

  it('запрос упал — блока нет', async () => {
    get.mockRejectedValue(new Error('network'));
    expect((await render()).container.innerHTML).toBe('');
  });

  it('пока грузится — блока нет', async () => {
    get.mockReturnValue(new Promise(() => {}));
    const r = await render();
    expect(r.container.innerHTML).toBe('');
  });

  it('ошибка ручки — залогирована с понятной меткой', async () => {
    get.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await render();
    expect(consoleError).toHaveBeenCalledWith('расход по месяцам:', expect.anything());
  });

  it('упавший запрос — залогирован с понятной меткой', async () => {
    get.mockRejectedValue(new Error('network'));
    await render();
    expect(consoleError).toHaveBeenCalledWith('расход по месяцам:', expect.anything());
  });
});
