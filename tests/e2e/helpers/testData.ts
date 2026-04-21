export const BASE_URL = 'https://my.linkeon.io';

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
