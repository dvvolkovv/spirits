// Куда ходит API (SMS, OTP, профиль) — прод по умолчанию.
export const API_URL = process.env.E2E_API_URL || 'https://my.linkeon.io';

// Где открыт сам фронт. Отдельно от API: правку в вебе можно прогнать против
// локального `pnpm dev` (или test.linkeon.io) ещё до выката, оставив API прода —
// CORS на бэке открыт, токены те же. Иначе проверить фикс можно только уже
// задеплоенным, а это проверка задним числом.
export const BASE_URL = process.env.E2E_BASE_URL || API_URL;

export const TEST_PHONES = {
  USER: '70000000000',
  ADMIN: '79030169187',
} as const;

export const AUTH_STATE_PATH = {
  USER: './tests/e2e/.auth/test-user.json',
  ADMIN: './tests/e2e/.auth/test-admin.json',
} as const;

export const TIMEOUTS = {
  STREAM: 60_000,
  API: 10_000,
  BALANCE_POLL: 15_000,
} as const;
