import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { BASE_URL } from '../helpers/testData';

// Run under chromium-user project (storageState: test-user.json).
// Admin API calls are made directly via fetch using the admin storageState JSON.

const TOKENS_URL = `/tokens?phone=70000000000`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADMIN_AUTH_PATH = resolve(__dirname, '../.auth/test-admin.json');

function getAdminToken(): string {
  const raw = fs.readFileSync(ADMIN_AUTH_PATH, 'utf-8');
  const data = JSON.parse(raw);
  const token = data.origins?.[0]?.localStorage?.find(
    (item: { name: string }) => item.name === 'jwt_access_token',
  )?.value;
  if (!token) throw new Error('No admin jwt_access_token found in storageState');
  return token;
}

async function adminCreateCoupon(code: string, tokenAmount: number): Promise<void> {
  const adminToken = getAdminToken();
  const res = await fetch(`${BASE_URL}/webhook/admin/coupons`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', code, token_amount: tokenAmount }),
  });
  if (!res.ok) throw new Error(`adminCreateCoupon failed: ${res.status} ${await res.text()}`);
}

async function adminDeleteCoupon(code: string): Promise<void> {
  const adminToken = getAdminToken();
  const res = await fetch(`${BASE_URL}/webhook/admin/coupons`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', code }),
  });
  if (!res.ok) throw new Error(`adminDeleteCoupon failed: ${res.status}`);
}

test.describe('Flow 06 — Coupon', () => {
  test.use({ storageState: './tests/e2e/.auth/test-user.json' });

  test('coupon input is visible', async ({ page }) => {
    await page.goto(TOKENS_URL);
    await expect(page.getByTestId('token-packages-root')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('coupon-root')).toBeVisible();
    await expect(page.getByTestId('coupon-input')).toBeVisible();
    await expect(page.getByTestId('coupon-submit-btn')).toBeVisible();
  });

  test('valid coupon adds tokens', async ({ page }) => {
    const uniqueCode = `E2ECOUPON${Date.now()}`;
    const tokensToGrant = 1000;

    await adminCreateCoupon(uniqueCode, tokensToGrant);

    try {
      await page.goto(TOKENS_URL);
      await expect(page.getByTestId('token-packages-root')).toBeVisible({ timeout: 15_000 });

      // Get initial token balance via API
      const tokensBefore = await page.evaluate(async (baseUrl) => {
        const token = localStorage.getItem('jwt_access_token');
        const res = await fetch(`${baseUrl}/webhook/user/tokens/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return Number(data.tokens ?? data.balance ?? 0);
      }, BASE_URL);

      // Redeem coupon
      await page.getByTestId('coupon-input').fill(uniqueCode);
      await expect(page.getByTestId('coupon-submit-btn')).not.toBeDisabled();
      await page.getByTestId('coupon-submit-btn').click();

      // Expect success message
      await expect(page.getByTestId('coupon-success-msg')).toBeVisible({ timeout: 15_000 });

      // Verify balance increased
      const tokensAfter = await page.evaluate(async (baseUrl) => {
        const token = localStorage.getItem('jwt_access_token');
        const res = await fetch(`${baseUrl}/webhook/user/tokens/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        return Number(data.tokens ?? data.balance ?? 0);
      }, BASE_URL);

      expect(tokensAfter).toBeGreaterThan(tokensBefore);
    } finally {
      await adminDeleteCoupon(uniqueCode).catch(() => {});
    }
  });

  test('invalid coupon shows error', async ({ page }) => {
    await page.goto(TOKENS_URL);
    await expect(page.getByTestId('token-packages-root')).toBeVisible({ timeout: 15_000 });

    const invalidCode = `INVALID${Date.now()}`;
    await page.getByTestId('coupon-input').fill(invalidCode);
    await expect(page.getByTestId('coupon-submit-btn')).not.toBeDisabled();
    await page.getByTestId('coupon-submit-btn').click();

    await expect(page.getByTestId('coupon-error-msg')).toBeVisible({ timeout: 10_000 });
  });
});
