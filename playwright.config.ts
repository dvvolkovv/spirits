import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.(test|spec)\.ts/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://my.linkeon.io',
    actionTimeout: 15_000,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  projects: [
    {
      name: 'chromium-user',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/e2e/.auth/test-user.json',
      },
    },
    {
      name: 'chromium-admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/e2e/.auth/test-admin.json',
      },
    },
    {
      name: 'chromium-anon',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-user',
      use: {
        ...devices['iPhone 13'],
        storageState: './tests/e2e/.auth/test-user.json',
      },
    },
  ],
});
