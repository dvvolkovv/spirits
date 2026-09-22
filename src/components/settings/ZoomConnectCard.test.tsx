// @vitest-environment jsdom
//
// Подключение Zoom — единственное место, где человек даёт согласие, без
// которого ассистент заперт во встречах нашего аккаунта. Поэтому проверяем не
// вёрстку, а поведение: уводим ли браузер к Zoom, показываем ли подключённое
// состояние и не остаётся ли на экране вчерашнее сообщение об исходе.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flush, visibleText, tRu, byButton, clickAsync } from '../../test/dom';
import ZoomConnectCard from './ZoomConnectCard';
import { apiClient } from '../../services/apiClient';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

vi.mock('../../services/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const api = vi.mocked(apiClient);
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as any;
const settle = async () => { await flush(); await flush(); };

describe('подключение Zoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/settings');
  });

  it('подключённый аккаунт показывает как подключённый', async () => {
    api.get.mockResolvedValue(ok({ connected: true }));
    const { container } = mount(<ZoomConnectCard />);
    await settle();
    expect(visibleText(container)).toContain(tRu('settings.zoom.connected'));
  });

  it('по кнопке уводит браузер на согласие Zoom', async () => {
    api.get.mockResolvedValue(ok({ connected: false }));
    api.post.mockResolvedValue(ok({ authorizeUrl: 'https://zoom.us/oauth/authorize?x=1' }));
    const { container } = mount(<ZoomConnectCard />);
    await settle();

    // jsdom не умеет переходить по адресу — подменяем присваивание.
    const href = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '', pathname: '/settings', set href(v: string) { href(v); } },
      writable: true,
    });

    await clickAsync(byButton(container, new RegExp(tRu('settings.zoom.connect')))!);
    await settle();
    expect(href).toHaveBeenCalledWith('https://zoom.us/oauth/authorize?x=1');
  });

  it('отказ от подключения объясняет, а пометку из адреса убирает', async () => {
    // Иначе, перезагрузив страницу, человек снова увидит вчерашнее сообщение.
    window.history.replaceState({}, '', '/settings?zoom_connect=denied');
    api.get.mockResolvedValue(ok({ connected: false }));
    const { container } = mount(<ZoomConnectCard />);
    await settle();
    expect(visibleText(container)).toContain(tRu('settings.zoom.denied'));
    expect(window.location.search).toBe('');
  });

  it('успешный возврат ничего не объясняет — и так видно', async () => {
    window.history.replaceState({}, '', '/settings?zoom_connect=ok');
    api.get.mockResolvedValue(ok({ connected: true }));
    const { container } = mount(<ZoomConnectCard />);
    await settle();
    expect(visibleText(container)).toContain(tRu('settings.zoom.connected'));
    expect(window.location.search).toBe('');
  });
});
