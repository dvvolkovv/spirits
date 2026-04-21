import { test, expect } from '@playwright/test';

// Run under chromium-admin project (storageState: test-admin.json)

test.describe('Flow 08 — Admin', () => {
  // Skip this entire flow when running under non-admin projects
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name !== 'chromium-admin') {
      test.skip();
    }
  });

  test('admin panel loads', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('admin-root')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('admin-tab-assistants')).toBeVisible();
    await expect(page.getByTestId('admin-tab-coupons')).toBeVisible();
  });

  test('can view assistants list', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('admin-root')).toBeVisible({ timeout: 15_000 });

    // Assistants tab is active by default
    await expect(page.getByTestId('admin-tab-assistants')).toBeVisible();
    // Wait for agents to load
    await expect(page.getByTestId('admin-assistants-list')).toBeVisible({ timeout: 15_000 });
    // Should have at least one assistant
    const items = page.getByTestId('admin-assistants-list').locator('button');
    await expect(items).not.toHaveCount(0, { timeout: 10_000 });
  });

  test('can create and delete a coupon', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('admin-root')).toBeVisible({ timeout: 15_000 });

    // Switch to coupons tab
    await page.getByTestId('admin-tab-coupons').click();

    // Use a short unique code to avoid any length or collision issues
    const uniqueCode = `E2E${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Click the "Создать" button to show the form
    await page.locator('button').filter({ hasText: /Создать/i }).first().click();

    // Wait for create form to appear
    await expect(page.getByTestId('admin-coupon-form')).toBeVisible({ timeout: 5_000 });

    // Fill the form
    await page.getByTestId('admin-coupon-code-input').fill(uniqueCode);
    await page.getByTestId('admin-coupon-tokens-input').fill('5000');

    // Submit form
    await page.getByTestId('admin-coupon-create-btn').click();

    // Coupon should appear in the list (wait for it)
    await expect(page.locator(`button:has-text("${uniqueCode}")`)).toBeVisible({ timeout: 10_000 });

    // Click on the coupon to select it
    await page.locator(`button:has-text("${uniqueCode}")`).click();

    // Register dialog handler BEFORE triggering the confirm dialog
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Delete the coupon
    await page.locator('button').filter({ hasText: /Удалить купон/i }).click();

    // Coupon should no longer be visible
    await expect(page.locator(`button:has-text("${uniqueCode}")`)).not.toBeVisible({ timeout: 10_000 });
  });
});
