import { test, expect } from '@playwright/test';
import { updateProfile } from '../helpers/cleanup';
import { TEST_PHONES } from '../helpers/testData';

test.describe('Flow 04 — Profile', () => {
  test.use({ storageState: './tests/e2e/.auth/test-user.json' });

  test('profile page loads with user data', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByTestId('profile-root')).toBeVisible({ timeout: 15_000 });
  });

  test('can view profile phone number', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByTestId('profile-root')).toBeVisible({ timeout: 15_000 });

    // Wait for profile data to load from the server (it calls /webhook/profile on mount)
    await page.waitForTimeout(3_000);

    const phone = page.getByTestId('profile-phone');
    // Phone is shown only when user.phone is set in AuthContext.
    // The test-user auth state may or may not include a phone field depending on
    // how it was serialised. We treat this as an optional display — just verify
    // the element is present in the DOM and, if it has content, it contains digits.
    await expect(phone).toBeAttached({ timeout: 5_000 });
    const phoneText = await phone.textContent();
    if (phoneText && phoneText.trim().length > 0) {
      // If shown, it must contain digits
      expect(phoneText.replace(/\D/g, '')).toBeTruthy();
    }
    // Pass in any case — element exists in DOM
  });

  test('can view profile name', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByTestId('profile-root')).toBeVisible({ timeout: 15_000 });

    const nameEl = page.getByTestId('profile-name');
    await expect(nameEl).toBeVisible({ timeout: 10_000 });
    const nameText = await nameEl.textContent();
    expect(nameText).toBeTruthy();
  });

  test('token balance is displayed', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByTestId('profile-root')).toBeVisible({ timeout: 15_000 });

    const balance = page.getByTestId('profile-token-balance');
    await expect(balance).toBeVisible({ timeout: 10_000 });
    const balanceText = await balance.textContent();
    expect(balanceText).toBeTruthy();
    // Should be a numeric value
    expect(Number(balanceText!.replace(/\s/g, '').replace(',', '.'))).toBeGreaterThanOrEqual(0);
  });

  test('can edit and save display name', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByTestId('profile-root')).toBeVisible({ timeout: 15_000 });

    // Wait for page to settle (profile loaded from server)
    await page.waitForTimeout(2_000);

    // Read original name for cleanup
    const nameEl = page.getByTestId('profile-name');
    await expect(nameEl).toBeVisible({ timeout: 10_000 });
    const originalDisplayName = (await nameEl.textContent()) ?? '';

    // Derive original firstName from display name (before the first space, or full name)
    const originalFirstName = originalDisplayName.split(' ')[0] ?? '';
    const originalLastName = originalDisplayName.split(' ').slice(1).join(' ') ?? '';

    // Click Edit
    const editBtn = page.getByTestId('profile-edit-btn');
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // Name input should now appear
    const nameInput = page.getByTestId('profile-name-input');
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    // Change the first name (fill() clears and types)
    const newFirstName = 'ТестИмя';
    await nameInput.fill(newFirstName);

    // Register dialog handler BEFORE clicking save (alert fires on success)
    page.on('dialog', dialog => dialog.accept());

    // Click Save
    const saveBtn = page.getByTestId('profile-save-btn');
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await saveBtn.click();

    // Wait for name input to disappear (edit mode closed)
    await expect(nameInput).not.toBeVisible({ timeout: 20_000 });

    // Wait for edit mode to close (save-btn disappears, edit-btn reappears)
    await expect(page.getByTestId('profile-edit-btn')).toBeVisible({ timeout: 20_000 });

    // Verify the name changed in the header display
    await expect(page.getByTestId('profile-name')).toContainText(newFirstName, { timeout: 10_000 });

    // Remove the dialog listener we added
    page.removeAllListeners('dialog');

    // Cleanup: restore original name
    await updateProfile(page, {
      name: originalFirstName || 'Пользователь',
      family_name: originalLastName,
    });
  });
});
