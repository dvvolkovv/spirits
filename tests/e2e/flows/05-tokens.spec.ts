import { test, expect } from '@playwright/test';
import { mockYookassaCheckout, mockYookassaPaymentStatus } from '../helpers/mockYookassa';
import { TEST_PHONES } from '../helpers/testData';

// The /tokens page is public but buttons are disabled without ?phone= param.
// We supply the test phone so we can actually click "Купить".
const TOKENS_URL = `/tokens?phone=${TEST_PHONES.USER}`;

test.describe('Flow 05 — Token Purchase', () => {
  test.use({ storageState: './tests/e2e/.auth/test-user.json' });

  test('token packages page loads', async ({ page }) => {
    await page.goto(TOKENS_URL);
    await expect(page.getByTestId('token-packages-root')).toBeVisible({ timeout: 15_000 });
  });

  test('all three packages are visible', async ({ page }) => {
    await page.goto(TOKENS_URL);
    await expect(page.getByTestId('token-packages-root')).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId('token-package-starter')).toBeVisible();
    await expect(page.getByTestId('token-package-extended')).toBeVisible();
    await expect(page.getByTestId('token-package-professional')).toBeVisible();
  });

  test('buy buttons are enabled when phone param is present', async ({ page }) => {
    await page.goto(TOKENS_URL);
    await expect(page.getByTestId('token-packages-root')).toBeVisible({ timeout: 15_000 });

    // All three buy buttons should be enabled (phone param supplied)
    const btns = page.getByTestId('token-buy-btn');
    await expect(btns).toHaveCount(3);
    for (const btn of await btns.all()) {
      await expect(btn).not.toBeDisabled();
    }
  });

  test('can initiate purchase flow (mocked YooKassa)', async ({ page }) => {
    // Set up mocks BEFORE navigating
    await mockYookassaCheckout(page);
    await mockYookassaPaymentStatus(page);

    // Mock set-email endpoint (called before create-payment)
    await page.route('**/webhook/set-email', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto(TOKENS_URL);
    await expect(page.getByTestId('token-packages-root')).toBeVisible({ timeout: 15_000 });

    // Wait for email input to be interactive (loading state clears after profile fetch)
    const emailInput = page.getByTestId('token-email-input');
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await expect(emailInput).not.toBeDisabled({ timeout: 10_000 });

    // Fill email (required for purchase)
    await emailInput.fill('test@example.com');

    // Click buy on the first (starter) package
    const buyBtn = page.getByTestId('token-buy-btn').first();
    await expect(buyBtn).not.toBeDisabled();
    await buyBtn.click();

    // The mock returns confirmation_url: /payment/success?fake=1&payment_id=...
    // window.location.href assignment navigates the page
    await page.waitForURL('**/payment/success**', { timeout: 15_000 });
    expect(page.url()).toContain('payment/success');
    expect(page.url()).toContain('fake=1');
  });

  test('shows error when email is missing', async ({ page }) => {
    await page.goto(TOKENS_URL);
    await expect(page.getByTestId('token-packages-root')).toBeVisible({ timeout: 15_000 });

    // Wait for email input to be interactive
    const emailInput = page.getByTestId('token-email-input');
    await expect(emailInput).not.toBeDisabled({ timeout: 10_000 });

    // Ensure email is empty
    await emailInput.fill('');

    // Click buy without entering email
    const buyBtn = page.getByTestId('token-buy-btn').first();
    await buyBtn.click();

    // Should show email validation error (page stays on /tokens)
    await expect(page.locator('text=Пожалуйста, укажите email')).toBeVisible({ timeout: 5_000 });
    // URL should not change
    expect(page.url()).toContain('/tokens');
  });
});
