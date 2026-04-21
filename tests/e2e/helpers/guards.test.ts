import { test, expect } from '@playwright/test';
import { assertIsTestPhone, generateTempReferralPhone } from './guards';

test.describe('guards', () => {
  test('assertIsTestPhone разрешает фиксированные номера', () => {
    expect(() => assertIsTestPhone('70000000000')).not.toThrow();
    expect(() => assertIsTestPhone('79030169187')).not.toThrow();
  });

  test('assertIsTestPhone разрешает pattern 790300XXXXX', () => {
    expect(() => assertIsTestPhone('79030012345')).not.toThrow();
    expect(() => assertIsTestPhone('79030099999')).not.toThrow();
  });

  test('assertIsTestPhone бросает на чужом номере', () => {
    expect(() => assertIsTestPhone('79991234567')).toThrow(/SAFETY/);
    expect(() => assertIsTestPhone('')).toThrow(/SAFETY/);
  });

  test('generateTempReferralPhone соответствует паттерну', () => {
    for (let i = 0; i < 10; i++) {
      const p = generateTempReferralPhone();
      expect(p).toMatch(/^790300\d{5}$/);
      expect(() => assertIsTestPhone(p)).not.toThrow();
    }
  });
});
