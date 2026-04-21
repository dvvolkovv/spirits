import { test, expect } from '@playwright/test';
import { fetchOtp } from './otp';
import { TEST_PHONES } from './testData';

test.describe('otp helper', () => {
  test('fetchOtp не падает на guard, возвращает код или бросает no-code', async () => {
    // Тест не требует, чтобы код был в Redis — допускаем оба исхода:
    // (A) вернули реальный 6-значный код, (B) выбросили "no code".
    // Важно: тест НЕ должен падать из-за 403/404 или SAFETY.
    try {
      const code = await fetchOtp(TEST_PHONES.USER, { retries: 1, delayMs: 0 });
      expect(code).toMatch(/^\d{4,6}$/);
    } catch (e) {
      expect(String(e)).toMatch(/no code|DEBUG_SMS_CODES/i);
    }
  });

  test('fetchOtp бросает SAFETY на не-тестовом телефоне', async () => {
    await expect(fetchOtp('79991234567')).rejects.toThrow(/SAFETY/);
  });
});
