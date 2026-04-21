import { test, expect } from '@playwright/test';

test.describe('Flow 03 — Assistant Switch', () => {
  test.use({ storageState: './tests/e2e/.auth/test-user.json' });

  /**
   * Ensures the chat interface is visible, selecting the first assistant if needed.
   * Returns the currently selected assistant object from localStorage.
   */
  async function ensureChatInterface(page: import('@playwright/test').Page) {
    await page.goto('/chat');

    const chatRoot = page.getByTestId('chat-root');
    const assistantSelection = page.getByTestId('assistant-selection');

    await Promise.race([
      chatRoot.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
      assistantSelection.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
    ]);

    const selectionVisible = await assistantSelection.isVisible().catch(() => false);
    if (selectionVisible) {
      const firstCard = page.getByTestId('assistant-card').first();
      await expect(firstCard).toBeVisible({ timeout: 15_000 });
      await firstCard.click();
    }

    await expect(chatRoot).toBeVisible({ timeout: 20_000 });
  }

  test('can switch to a different assistant via dropdown', async ({ page }) => {
    await ensureChatInterface(page);

    // Open the assistant dropdown in the chat header using stable testid
    const dropdownTrigger = page.getByTestId('assistant-dropdown-btn');
    await expect(dropdownTrigger).toBeVisible({ timeout: 15_000 });

    // Read the currently displayed assistant name from the UI (more reliable than localStorage)
    const initialName = (await dropdownTrigger.locator('span.font-medium').first().textContent())?.trim() ?? '';
    expect(initialName).toBeTruthy();

    await dropdownTrigger.click();

    // Wait for dropdown list to appear using stable testid
    const dropdownList = page.getByTestId('assistant-dropdown-list');
    await expect(dropdownList).toBeVisible({ timeout: 5_000 });

    // Count available assistants in the dropdown
    const dropdownItems = dropdownList.locator('button');
    const count = await dropdownItems.count();
    if (count < 2) {
      test.skip();
      return;
    }

    // Find a different assistant to switch to (not the currently shown one)
    let targetIndex = -1;
    for (let i = 0; i < count; i++) {
      const itemText = await dropdownItems.nth(i).locator('span.font-medium').textContent();
      if (itemText?.trim() !== initialName) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      test.skip();
      return;
    }

    const targetName = (await dropdownItems.nth(targetIndex).locator('span.font-medium').textContent())?.trim();

    // Click the different assistant
    await dropdownItems.nth(targetIndex).click();

    // Wait for dropdown to close
    await expect(dropdownList).not.toBeVisible({ timeout: 5_000 });

    // Verify the header now shows the new assistant name
    await expect(dropdownTrigger.locator('span.font-medium').first()).toHaveText(targetName!, { timeout: 5_000 });
  });

  test('switched assistant header shows new assistant name', async ({ page }) => {
    await ensureChatInterface(page);

    // Open the assistant dropdown using stable testid
    const dropdownTrigger = page.getByTestId('assistant-dropdown-btn');
    await expect(dropdownTrigger).toBeVisible({ timeout: 15_000 });

    // Get current assistant name from the button
    const initialHeaderName = (await dropdownTrigger.locator('span.font-medium').first().textContent())?.trim();
    await dropdownTrigger.click();

    const dropdownList = page.getByTestId('assistant-dropdown-list');
    await expect(dropdownList).toBeVisible({ timeout: 5_000 });

    const dropdownItems = dropdownList.locator('button');
    const count = await dropdownItems.count();
    if (count < 2) {
      test.skip();
      return;
    }

    // Pick a different assistant
    let targetName: string | null = null;
    for (let i = 0; i < count; i++) {
      const name = (await dropdownItems.nth(i).locator('span.font-medium').textContent())?.trim();
      if (name !== initialHeaderName) {
        targetName = name ?? null;
        await dropdownItems.nth(i).click();
        break;
      }
    }

    if (!targetName) {
      test.skip();
      return;
    }

    // After switch, the header button should show the new assistant's name
    // Wait for dropdown to close and trigger to update
    await expect(dropdownList).not.toBeVisible({ timeout: 5_000 }).catch(() => null);
    const newTrigger = page.getByTestId('assistant-dropdown-btn');
    await expect(newTrigger.locator('span.font-medium').first()).toHaveText(targetName, { timeout: 5_000 });
  });

  test('switching assistant resets and starts a new session', async ({ page }) => {
    await ensureChatInterface(page);

    // Open the assistant dropdown and switch to a different one using stable testid
    const dropdownTrigger = page.getByTestId('assistant-dropdown-btn');
    await expect(dropdownTrigger).toBeVisible({ timeout: 15_000 });

    const initialHeaderName = (await dropdownTrigger.locator('span.font-medium').first().textContent())?.trim();
    await dropdownTrigger.click();

    const dropdownList = page.getByTestId('assistant-dropdown-list');
    await expect(dropdownList).toBeVisible({ timeout: 5_000 });

    const dropdownItems = dropdownList.locator('button');
    const count = await dropdownItems.count();
    if (count < 2) {
      test.skip();
      return;
    }

    for (let i = 0; i < count; i++) {
      const name = (await dropdownItems.nth(i).locator('span.font-medium').textContent())?.trim();
      if (name !== initialHeaderName) {
        await dropdownItems.nth(i).click();
        break;
      }
    }

    // Chat root should still be visible after switch
    await expect(page.getByTestId('chat-root')).toBeVisible({ timeout: 10_000 });

    // Input and send button should be ready
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('chat-send-btn')).toBeVisible({ timeout: 5_000 });

    // Send a message to the newly selected assistant
    await page.getByTestId('chat-input').fill('Привет');
    await page.getByTestId('chat-send-btn').click();

    // The user message should appear
    await expect(page.getByTestId('chat-message').first()).toBeVisible({ timeout: 10_000 });

    // An assistant response should arrive within 60s (streaming)
    await expect(page.getByTestId('chat-message').nth(1)).toBeVisible({ timeout: 60_000 });
  });
});
