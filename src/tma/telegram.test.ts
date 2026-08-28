// @vitest-environment jsdom
//
// Глобальное окружение vitest — 'node' (vitest.config.ts): большинство тестов
// в репозитории не трогают DOM, и jsdom для них лишний вес. Этот файл — первый,
// которому нужны document/window, поэтому переопределяем окружение точечно,
// а не глобально для всех 18 файлов тестов.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getInitData, isInsideTelegram, applyTelegramTheme, closeApp, openLink } from './telegram';

function mockWebApp(overrides: Record<string, unknown> = {}) {
  const webApp = {
    initData: 'auth_date=1&hash=abc',
    themeParams: { bg_color: '#112233', text_color: '#ffffff' },
    colorScheme: 'dark',
    ready: vi.fn(),
    expand: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
  (globalThis as any).window.Telegram = { WebApp: webApp };
  return webApp;
}

describe('telegram wrapper', () => {
  beforeEach(() => {
    delete (globalThis as any).window.Telegram;
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
  });

  it('isInsideTelegram false без объекта Telegram', () => {
    expect(isInsideTelegram()).toBe(false);
  });

  it('isInsideTelegram false при пустом initData — так выглядит открытие в браузере', () => {
    mockWebApp({ initData: '' });
    expect(isInsideTelegram()).toBe(false);
  });

  it('isInsideTelegram true при непустом initData', () => {
    mockWebApp();
    expect(isInsideTelegram()).toBe(true);
  });

  it('getInitData отдаёт пустую строку вне Telegram', () => {
    expect(getInitData()).toBe('');
  });

  it('applyTelegramTheme кладёт цвета в CSS-переменные и ставит data-theme', () => {
    mockWebApp();
    applyTelegramTheme();
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--tg-bg-color')).toBe('#112233');
    expect(root.style.getPropertyValue('--tg-text-color')).toBe('#ffffff');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('closeApp зовёт WebApp.close', () => {
    const webApp = mockWebApp();
    closeApp();
    expect(webApp.close).toHaveBeenCalled();
  });

  it('closeApp не падает вне Telegram', () => {
    expect(() => closeApp()).not.toThrow();
  });

  it('openLink открывает ссылку через Telegram, а не window.open', () => {
    const webApp = mockWebApp();
    (webApp as any).openLink = vi.fn();
    openLink('https://my.linkeon.io/tokens');
    expect((webApp as any).openLink).toHaveBeenCalledWith('https://my.linkeon.io/tokens');
  });

  it('вне Telegram деградирует до window.open, а не падает', () => {
    (window as any).Telegram = undefined;
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    openLink('https://my.linkeon.io/tokens');
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
