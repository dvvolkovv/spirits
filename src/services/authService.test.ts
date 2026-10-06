import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

// Модули с сетью и аналитикой запросу кода не нужны — подменяем, чтобы тест
// не зависел от их окружения.
vi.mock('./apiClient', () => ({ apiClient: {} }));
vi.mock('./vkPixel', () => ({ vkReachGoal: vi.fn() }));
vi.mock('./eventsClient', () => ({ getSource: () => null }));

import i18n from '../i18n';
import { authService } from './authService';

/**
 * Запрос SMS-кода: что человек увидит, когда бэкенд отказал лимитом (429) или
 * не принял номер (400 invalid_phone). Перевод — настоящим экземпляром i18n по
 * настоящим файлам локалей, иначе тест зеленел бы и на ключе, которого в
 * локали нет.
 */

const fetchMock = vi.fn();

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json', ...headers },
  });

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  await i18n.changeLanguage('ru');
});
afterEach(() => fetchMock.mockReset());
afterAll(async () => {
  vi.unstubAllGlobals();
  await i18n.changeLanguage('ru');
});

describe('authService.requestSMSCode: лимит отправки (429)', () => {
  it('«слишком часто» с минутами из retryAfterSec, округлёнными вверх', async () => {
    const cases: Array<[number, string]> = [
      [45, 'Слишком часто. Новый код можно запросить через 1 минуту.'],
      [61, 'Слишком часто. Новый код можно запросить через 2 минуты.'],
      [1260, 'Слишком часто. Новый код можно запросить через 21 минуту.'],
      [3420, 'Слишком часто. Новый код можно запросить через 57 минут.'],
    ];
    for (const [sec, text] of cases) {
      fetchMock.mockResolvedValueOnce(
        reply(429, { error: 'too_many_requests', retryAfterSec: sec }, { 'Retry-After': String(sec) }),
      );
      expect(await authService.requestSMSCode('+7 999 123-45-67')).toEqual({
        success: false,
        error: 'too_many_requests',
        retryAfterSec: sec,
        message: text,
      });
    }
    // Номер уходит одними цифрами — бэкенд другого не примет (400 invalid_phone).
    expect(String(fetchMock.mock.calls[0][0])).toContain('/sms/79991234567');
  });

  it('от часа — в часах с формой числа, вверх до часа; меньше часа — в минутах', async () => {
    const cases: Array<[number, string]> = [
      [3540, 'Слишком часто. Новый код можно запросить через 59 минут.'],
      [3600, 'Слишком часто. Новый код можно запросить через 1 час.'],
      [3601, 'Слишком часто. Новый код можно запросить через 2 часа.'], // 61 минута — не занижаем
      [18000, 'Слишком часто. Новый код можно запросить через 5 часов.'],
      [75600, 'Слишком часто. Новый код можно запросить через 21 час.'],
      [82680, 'Слишком часто. Новый код можно запросить через 23 часа.'], // суточное окно
    ];
    for (const [sec, text] of cases) {
      fetchMock.mockResolvedValueOnce(reply(429, { error: 'too_many_requests', retryAfterSec: sec }));
      expect({ sec, message: (await authService.requestSMSCode('79991234567')).message }).toEqual({ sec, message: text });
    }
  });

  it('нет числа в теле — срок из Retry-After; нет и его — минимум минута', async () => {
    fetchMock.mockResolvedValueOnce(reply(429, { error: 'too_many_requests' }, { 'Retry-After': '600' }));
    expect((await authService.requestSMSCode('79991234567')).message)
      .toBe('Слишком часто. Новый код можно запросить через 10 минут.');

    fetchMock.mockResolvedValueOnce(reply(429, 'Too Many Requests'));
    expect((await authService.requestSMSCode('79991234567')).message)
      .toBe('Слишком часто. Новый код можно запросить через 1 минуту.');

    fetchMock.mockResolvedValueOnce(reply(429, { error: 'too_many_requests', retryAfterSec: 0 }));
    expect((await authService.requestSMSCode('79991234567')).message)
      .toBe('Слишком часто. Новый код можно запросить через 1 минуту.');
  });

  it('фраза — на языке интерфейса, с формой числа этого языка', async () => {
    // [30 с, 57 мин, 1 ч, 23 ч]
    const expected: Record<string, string[]> = {
      en: [
        'Too many attempts. You can request a new code in 1 minute.',
        'Too many attempts. You can request a new code in 57 minutes.',
        'Too many attempts. You can request a new code in 1 hour.',
        'Too many attempts. You can request a new code in 23 hours.',
      ],
      de: [
        'Zu viele Versuche. Einen neuen Code kannst du in 1 Minute anfordern.',
        'Zu viele Versuche. Einen neuen Code kannst du in 57 Minuten anfordern.',
        'Zu viele Versuche. Einen neuen Code kannst du in 1 Stunde anfordern.',
        'Zu viele Versuche. Einen neuen Code kannst du in 23 Stunden anfordern.',
      ],
      zh: [
        '请求过于频繁，请在 1 分钟后重新获取验证码。',
        '请求过于频繁，请在 57 分钟后重新获取验证码。',
        '请求过于频繁，请在 1 小时后重新获取验证码。',
        '请求过于频繁，请在 23 小时后重新获取验证码。',
      ],
    };
    try {
      for (const [lang, texts] of Object.entries(expected)) {
        await i18n.changeLanguage(lang);
        for (const [i, sec] of [30, 3420, 3600, 82680].entries()) {
          fetchMock.mockResolvedValueOnce(reply(429, { error: 'too_many_requests', retryAfterSec: sec }));
          expect({ lang, sec, message: (await authService.requestSMSCode('79991234567')).message })
            .toEqual({ lang, sec, message: texts[i] });
        }
      }
    } finally {
      await i18n.changeLanguage('ru');
    }
  });
});

describe('authService.requestSMSCode: прочие ответы', () => {
  it('400 invalid_phone — «Проверьте номер телефона.»', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid_phone' }));
    expect(await authService.requestSMSCode('123')).toEqual({
      success: false,
      error: 'invalid_phone',
      message: 'Проверьте номер телефона.',
    });
  });

  it('400 по другой причине — прежний общий отказ, без объяснения', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'something_else' }));
    expect(await authService.requestSMSCode('79991234567')).toEqual({ success: false, message: 'Failed to send SMS' });
  });

  it('200 и 403 — как раньше', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, 'SMS sent'));
    expect(await authService.requestSMSCode('79991234567')).toEqual({ success: true, message: 'SMS sent' });

    fetchMock.mockResolvedValueOnce(reply(403, 'User blocked'));
    expect(await authService.requestSMSCode('79991234567')).toEqual({ success: false, message: 'User blocked' });
  });
});
