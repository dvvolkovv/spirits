import { test, expect } from '@playwright/test';

test.describe('Flow 02 — Chat', () => {
  test.use({ storageState: './tests/e2e/.auth/test-user.json' });

  // Helper: ensure an assistant is selected and the chat interface is shown.
  // If AssistantSelection is visible, click the first card to enter the chat.
  async function ensureChatInterface(page: import('@playwright/test').Page) {
    await page.goto('/chat');

    // Wait for either the chat root or the assistant selection to appear
    const chatRoot = page.getByTestId('chat-root');
    const assistantSelection = page.getByTestId('assistant-selection');

    // Race: whichever appears first
    await Promise.race([
      chatRoot.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
      assistantSelection.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
    ]);

    const selectionVisible = await assistantSelection.isVisible().catch(() => false);
    if (selectionVisible) {
      // Click the first assistant card to enter the chat
      const firstCard = page.getByTestId('assistant-card').first();
      await expect(firstCard).toBeVisible({ timeout: 15_000 });
      await firstCard.click();
    }

    // Now chat-root must be visible
    await expect(chatRoot).toBeVisible({ timeout: 20_000 });
  }

  test('chat interface loads', async ({ page }) => {
    await ensureChatInterface(page);
    await expect(page.getByTestId('chat-input')).toBeVisible();
    await expect(page.getByTestId('chat-send-btn')).toBeVisible();
  });

  test('can send a message and receive a response', async ({ page }) => {
    await ensureChatInterface(page);

    const input = page.getByTestId('chat-input');
    await input.fill('Привет');
    await page.getByTestId('chat-send-btn').click();

    // Wait for at least 2 messages (user message + assistant response)
    // Streaming response can take up to 60s
    await expect(page.getByTestId('chat-message').nth(1)).toBeVisible({ timeout: 60_000 });
  });

  test('assistant selection shows assistants', async ({ page }) => {
    // Clear localStorage before React mounts
    await page.addInitScript(() => {
      localStorage.removeItem('selected_assistant');
      const raw = localStorage.getItem('userData');
      if (raw) {
        try {
          const userData = JSON.parse(raw);
          userData.preferredAgent = '';
          localStorage.setItem('userData', JSON.stringify(userData));
        } catch {}
      }
    });

    // Also mock the profile endpoint so server sync doesn't restore preferredAgent
    await page.route('**/webhook/profile', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const arr = Array.isArray(body) ? body : [body];
      if (arr[0]?.profileJson) arr[0].profileJson.preferredAgent = '';
      else if (arr[0]) arr[0].preferredAgent = '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(Array.isArray(body) ? arr : arr[0]),
      });
    });

    await page.goto('/chat');

    await expect(page.getByTestId('assistant-selection')).toBeVisible({ timeout: 15_000 });
    const cards = page.getByTestId('assistant-card');
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    expect(await cards.count()).toBeGreaterThan(0);
  });
});
