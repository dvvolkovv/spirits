import { TEST_PHONES } from './testData';

const FIXED_TEST_PHONES: readonly string[] = [
  TEST_PHONES.USER,
  TEST_PHONES.ADMIN,
];

// Паттерн для динамически создаваемых номеров в referral-тестах.
// Бэкенд применяет тот же паттерн к whitelist debug-эндпоинтов.
const TEMP_PHONE_PATTERN = /^790300\d{5}$/;

export function assertIsTestPhone(phone: string): void {
  if (FIXED_TEST_PHONES.includes(phone)) return;
  if (TEMP_PHONE_PATTERN.test(phone)) return;
  throw new Error(
    `SAFETY: only test phones allowed, got: ${phone}. ` +
    `Allowed: ${FIXED_TEST_PHONES.join(', ')} or pattern 790300XXXXX`,
  );
}

export function generateTempReferralPhone(): string {
  // 790300 + 5 случайных цифр. Диапазон [10000, 99999].
  const suffix = Math.floor(Math.random() * 90000) + 10000;
  return `790300${suffix}`;
}
