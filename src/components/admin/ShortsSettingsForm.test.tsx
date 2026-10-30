// @vitest-environment jsdom
import { StrictMode } from 'react';
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
afterEach(() => {
  m?.unmount();
  // Спай на window.confirm — через afterEach, а не ручной .mockRestore() в
  // каждом тесте: упавшее до него утверждение иначе оставляет спай висеть и
  // ломает подтверждения в следующих тестах файла.
  vi.restoreAllMocks();
});

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
  });

  it('отказ от подтверждения — ничего не отправлено, режим и кнопка на месте', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    m = mount(<ShortsSettingsForm />);
    await settle();
    await clickAsync(q('shorts-youtube-manual')!);
    await settle();

    expect(confirm).toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1); // только начальный get_settings
    expect(q('shorts-youtube-mode')!.textContent).toBe('по ссылке');
    expect(q('shorts-youtube-manual')).toBeTruthy();
  });

  it('отказ сервера при сохранении: текст с сервера в баннере, поле цело, без уведомления, «Сохранить» снова включена', async () => {
    post.mockImplementation(async (_url: string, p: any) => {
      if (p.action === 'get_settings') return res(200, settings);
      if (p.action === 'update_settings') {
        return res(400, { statusCode: 400, message: 'narratorVoice — один из: alena, filipp', error: 'Bad Request' });
      }
      throw new Error(`неожиданное действие ${p.action}`);
    });
    m = mount(<ShortsSettingsForm />);
    await settle();
    type(q('shorts-voice')!, 'oksana');
    await clickAsync(q('shorts-save-settings')!);
    await settle();

    expect(q('shorts-settings-error')!.textContent).toBe('narratorVoice — один из: alena, filipp');
    expect((q('shorts-voice') as HTMLInputElement).value).toBe('oksana');
    expect(q('shorts-settings-notice')).toBeNull();
    expect((q('shorts-save-settings') as HTMLButtonElement).disabled).toBe(false);
  });

  it('несохранённый час переживает «Перевести в ручной»: аварийный переход не стирает правку', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    m = mount(<ShortsSettingsForm />);
    await settle();
    type(q('shorts-hour')!, '19');
    await clickAsync(q('shorts-youtube-manual')!);
    await settle();

    expect((q('shorts-hour') as HTMLInputElement).value).toBe('19');
    expect(q('shorts-youtube-mode')!.textContent).toBe('набор владельцу');
  });

  it('ошибка загрузки — «Не загрузил настройки: …» и «Повторить», который грузит настройки заново', async () => {
    let calls = 0;
    post.mockImplementation(async (_url: string, p: any) => {
      if (p.action === 'get_settings') {
        calls += 1;
        return calls === 1 ? res(500, { message: 'сервер лёг' }) : res(200, settings);
      }
      throw new Error(`неожиданное действие ${p.action}`);
    });
    m = mount(<ShortsSettingsForm />);
    await settle();

    expect(q('shorts-settings-error')!.textContent).toContain('Не загрузил настройки: сервер лёг');

    await clickAsync(q('shorts-settings-retry')!);
    await settle();

    expect(q('shorts-settings-error')).toBeNull();
    expect(q('shorts-youtube-mode')!.textContent).toBe('по ссылке');
  });

  it('предупреждение о пустом канале Telegram: появляется с площадкой и пустым полем, исчезает без площадки', async () => {
    m = mount(<ShortsSettingsForm />);
    await settle();
    expect(q('shorts-channel-warning')).toBeNull(); // канал задан по умолчанию

    type(q('shorts-channel')!, '');
    expect(q('shorts-channel-warning')).toBeTruthy();
    expect(q('shorts-channel-warning')!.textContent).toContain('пост в Telegram не выйдет');

    click(q('shorts-platform-telegram')!);
    expect(q('shorts-channel-warning')).toBeNull();
  });
});

describe('под StrictMode', () => {
  // src/main.tsx рендерит приложение внутри <React.StrictMode> — в dev-режиме
  // React прогоняет эффекты монтирования дважды (эффект → снятие → эффект),
  // чтобы поймать именно такие баги с несброшенным флагом.
  it('форма загружается, а не зависает на «Загружаю настройки…»', async () => {
    m = mount(<StrictMode><ShortsSettingsForm /></StrictMode>);
    await settle();

    expect(q('shorts-settings-error')).toBeNull();
    expect(m.container.textContent).not.toContain('Загружаю настройки');
    expect(q('shorts-hour')).toBeTruthy();
    expect((q('shorts-hour') as HTMLInputElement).value).toBe('18');
  });
});
