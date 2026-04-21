import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/testData';

// Run under chromium-admin project (storageState: test-admin.json)
// The admin account (79030169187) is a referral leader, so /webhook/referral/stats
// returns a 200 with stats data.
// The referral UI lives at /referral — ReferralDashboard component.

test.describe('Flow 09 — Referral', () => {
  // Skip admin-required tests when running under non-admin projects
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name !== 'chromium-admin') {
      test.skip();
    }
  });

  test('referral stats endpoint returns data', async ({ page }) => {
    // Navigate to trigger localStorage load for access token
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async (baseUrl) => {
      const token = localStorage.getItem('jwt_access_token');
      const res = await fetch(`${baseUrl}/webhook/referral/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return {
        status: res.status,
        body: await res.json().catch(() => null),
      };
    }, BASE_URL);

    // Admin is a referral leader — expect 200
    expect(result.status).toBe(200);
    expect(result.body).not.toBeNull();
    // Response should have referral leader data
    expect(result.body).toHaveProperty('leader');
    expect(result.body).toHaveProperty('total_referees');
  });

  test('admin can view referral page', async ({ page }) => {
    await page.goto('/referral');
    await page.waitForLoadState('networkidle');

    // ReferralDashboard shows partner program stats for referral leaders
    // Should show referral dashboard content (not the "not a leader" message)
    const notLeaderMsg = page.locator('text=Вы не являетесь участником партнёрской программы');
    const referralDashboard = page.locator('text=Моя реферальная программа');

    // One of these should appear
    const dashboardVisible = await referralDashboard.isVisible({ timeout: 10_000 }).catch(() => false);
    const notLeaderVisible = await notLeaderMsg.isVisible({ timeout: 2_000 }).catch(() => false);

    // Admin account should be a referral leader
    expect(dashboardVisible || notLeaderVisible).toBe(true);
    expect(dashboardVisible).toBe(true);
  });

  test('admin referral stats endpoint returns data', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async (baseUrl) => {
      const token = localStorage.getItem('jwt_access_token');
      const res = await fetch(`${baseUrl}/webhook/admin/referral/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return {
        status: res.status,
        body: await res.json().catch(() => null),
      };
    }, BASE_URL);

    expect(result.status).toBe(200);
    expect(result.body).not.toBeNull();
    // Admin stats response should have summary and leaders
    expect(result.body).toHaveProperty('summary');
    expect(result.body).toHaveProperty('leaders');
    expect(Array.isArray(result.body.leaders)).toBe(true);
  });
});
