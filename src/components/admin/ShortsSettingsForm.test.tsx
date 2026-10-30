// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { click, clickAsync, flush, mount, type, Mounted } from '../../test/dom';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { post } }));

import ShortsSettingsForm from './ShortsSettingsForm';

const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const settings = {
  slotDays: [1, 2, 3, 4, 5, 6, 7], slotHourMsk: 18, prepareLeadHours: 24, minAnswerChars: 400,
  tgChannelChatId: '-1003046204962', platforms: ['telegram', 'youtube'], narratorVoice: 'alena', format: 'skit',
  maxOmniSeconds: 48, youtubeMode: 'unlisted',
};

let m: Mounted;
const q = (id: string) => m.container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
/** Цепочка post → json → setState — несколько оборотов микрозадач. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await flush();
};

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(async (_url: string, p: any) => {
    if (p.action === 'get_settings') return res(200, settings);
    if (p.action === 'update_settings') return res(200, { ...settings, ...p.settings });
    throw new Error(`неожиданное действие ${p.action}`);
  });
});
afterEach(() => m?.unmount());

describe('настройки роликов', () => {
  it('сохраняет все поля, кроме режима YouTube; числа — числами', async () => {
    m = mount(<ShortsSettingsForm />);
    await settle();
    type(q('shorts-hour')!, '19');
    click(q('shorts-day-7')!);
    await clickAsync(q('shorts-save-settings')!);
    await settle();
    expect(post).toHaveBeenLastCalledWith('/webhook/admin/shorts', {
      action: 'update_settings',
      settings: {
        slotDays: [1, 2, 3, 4, 5, 6], slotHourMsk: 19, prepareLeadHours: 24, minAnswerChars: 400,
        tgChannelChatId: '-1003046204962', platforms: ['telegram', 'youtube'], narratorVoice: 'alena', format: 'skit',
        maxOmniSeconds: 48,
      },
    });
    expect(q('shorts-settings-notice')!.textContent).toBe('Настройки сохранены');
  });

  it('кривой час — «Сохранить» гаснет, причина под полем', async () => {
    m = mount(<ShortsSettingsForm />);
    await settle();
    type(q('shorts-hour')!, '24');
    expect((q('shorts-save-settings') as HTMLButtonElement).disabled).toBe(true);
    expect(m.container.textContent).toContain('Целое число от 0 до 23.');
  });

  it('режим YouTube показан; «Перевести в ручной» — с подтверждением и только режимом', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    m = mount(<ShortsSettingsForm />);
    await settle();
    expect(q('shorts-youtube-mode')!.textContent).toBe('по ссылке');
    await clickAsync(q('shorts-youtube-manual')!);
    await settle();
    expect(confirm).toHaveBeenCalled();
    expect(post).toHaveBeenLastCalledWith('/webhook/admin/shorts', { action: 'update_settings', settings: { youtubeMode: 'manual' } });
    expect(q('shorts-youtube-manual')).toBeNull();
    confirm.mockRestore();
  });
});
