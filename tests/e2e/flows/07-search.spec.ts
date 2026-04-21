import { test, expect } from '@playwright/test';

// Run under chromium-user project (storageState: test-user.json)

test.describe('Flow 07 — Search + Compatibility', () => {
  test.use({ storageState: './tests/e2e/.auth/test-user.json' });

  test('search page loads', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByTestId('search-root')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('search-input')).toBeVisible();
    await expect(page.getByTestId('search-submit-btn')).toBeVisible();
  });

  test('can search for a user', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByTestId('search-root')).toBeVisible({ timeout: 15_000 });

    // Type a search query and submit
    await page.getByTestId('search-input').fill('психолог коуч семья');
    await page.getByTestId('search-submit-btn').click();

    // Wait for streaming response — the blue info box should appear
    await expect(page.locator('[class*="bg-blue-50"]').first()).toBeVisible({ timeout: 60_000 });
  });

  test('compatibility page loads', async ({ page }) => {
    await page.goto('/compatibility');
    await expect(page.getByTestId('compatibility-root')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('compatibility-phone-input')).toBeVisible();
    await expect(page.getByTestId('compatibility-submit-btn')).toBeVisible();
  });

  test('can add phone for compatibility check', async ({ page }) => {
    await page.goto('/compatibility');
    await expect(page.getByTestId('compatibility-root')).toBeVisible({ timeout: 15_000 });

    // Add admin phone number via the input
    const phoneInput = page.getByTestId('compatibility-phone-input');
    await phoneInput.fill('79030169187');

    // Click "Добавить" button (the button next to the phone input)
    // It shows <Plus /> icon and text "Добавить" on sm+ screens
    const addBtn = page.locator('button').filter({ hasText: /добавить/i }).first();
    await addBtn.click();

    // Phone should be added — a tag with the phone appears
    await expect(page.locator('text=+7 (903) 016-91-87')).toBeVisible({ timeout: 5_000 });

    // Submit button should now be enabled
    await expect(page.getByTestId('compatibility-submit-btn')).not.toBeDisabled();
  });
});
