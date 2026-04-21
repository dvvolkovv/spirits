import { test, expect } from '@playwright/test';
import { fetchOtp } from '../helpers/otp';
import { TEST_PHONES } from '../helpers/testData';

test.describe('Flow 01 — Onboarding', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // anon — no pre-auth

  test('phone + OTP login lands on /chat', async ({ page }) => {
    await page.goto('/');
    // Wait for JS to load and React to render
    await page.waitForLoadState('networkidle');

    // Onboarding screen should appear (increase timeout for slower mobile rendering)
    await expect(page.getByTestId('onboarding-root')).toBeVisible({ timeout: 20_000 });

    // Type phone number — formatPhone will reformat as +7 (700) 000-00-00
    const phoneInput = page.getByTestId('phone-input');
    await phoneInput.click();
    await phoneInput.fill('');
    for (const digit of '70000000000') {
      await phoneInput.type(digit);
    }

    // Accept consent
    const consent = page.getByTestId('consent-checkbox');
    if (!(await consent.isChecked())) {
      await consent.check();
    }

    // Submit
    const submitBtn = page.getByTestId('phone-submit-btn');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Wait for OTP screen
    await expect(page.getByTestId('otp-root')).toBeVisible({ timeout: 15_000 });

    // Fetch OTP code
    const otp = await fetchOtp(TEST_PHONES.USER);
    expect(otp).toMatch(/^\d{6}$/);

    // Fill 6 OTP inputs
    for (let i = 0; i < 6; i++) {
      const input = page.getByTestId(`otp-input-${i}`);
      await input.click();
      await input.fill(otp[i]);
    }

    // Auto-submit fires when all 6 filled — wait for redirect to /chat
    await page.waitForURL('**/chat**', { timeout: 30_000 });
    expect(page.url()).toContain('/chat');
  });
});
