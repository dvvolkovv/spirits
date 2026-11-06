import { test, expect, type Page } from '@playwright/test';

// Run under mobile-user project (iPhone 13 viewport, storageState: test-user.json)

test.describe('Flow 10 — Mobile Layout', () => {
  // Mobile nav and mobile layout tests require a mobile viewport.
  // Skip when running under desktop browser projects.
  test.beforeEach(async ({}, testInfo) => {
    if (!testInfo.project.name.startsWith('mobile')) {
      test.skip();
    }
  });

  test('mobile nav is visible on chat', async ({ page }) => {
    await page.goto('/chat');
    // On mobile, the second nav is inside the md:hidden container (mobile-only nav)
    await expect(page.getByTestId('nav-root').last()).toBeVisible({ timeout: 15_000 });
    const nav = page.getByTestId('nav-root').last();
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
  });

  test('mobile nav links work', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByTestId('nav-root').last()).toBeVisible({ timeout: 15_000 });

    // Navigate to profile — use the last (mobile) nav items
    await page.getByTestId('nav-item-profile').last().click();
    await expect(page).toHaveURL(/\/profile/, { timeout: 10_000 });

    // Navigate to search
    await page.getByTestId('nav-item-search').last().click();
    await expect(page).toHaveURL(/\/search/, { timeout: 10_000 });

    // Navigate back to chat
    await page.getByTestId('nav-item-chat').last().click();
    await expect(page).toHaveURL(/\/chat/, { timeout: 10_000 });
  });

  test('chat interface is usable on mobile', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Wait for chat interface to render (may need to select assistant first)
    const chatRoot = page.getByTestId('chat-root');
    const assistantSelection = page.getByTestId('assistant-selection');

    // Either chat interface or assistant selection should be visible
    const chatVisible = await chatRoot.isVisible({ timeout: 10_000 }).catch(() => false);
    const assistantVisible = await assistantSelection.isVisible({ timeout: 2_000 }).catch(() => false);

    if (assistantVisible && !chatVisible) {
      // Select the first assistant
      const firstCard = page.getByTestId('assistant-card').first();
      await firstCard.click();
      // Wait for chat to open
      await expect(page.getByTestId('chat-root')).toBeVisible({ timeout: 10_000 });
    }

    // Verify chat input and send button are visible on mobile
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('chat-send-btn')).toBeVisible({ timeout: 10_000 });
  });

  const expectNoProfileOverflow = async (page: Page) => {
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      profile: document.querySelector<HTMLElement>('[data-testid="profile-root"]')?.scrollWidth ?? 0,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.profile).toBeLessThanOrEqual(dimensions.viewport);
  };

  const expectControlInsideViewport = async (page: Page, testId: string) => {
    const control = page.getByTestId(testId);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  };

  for (const width of [320, 360, 390]) {
    test(`profile controls fit ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/profile');
      await expect(page.getByTestId('profile-root')).toBeVisible();
      await expectControlInsideViewport(page, 'profile-edit-btn');
      await expectNoProfileOverflow(page);

      await page.getByTestId('profile-name').evaluate((element) => {
        element.textContent = 'ОченьДлинноеИмяПользователяБезПробеловКотороеНеДолжноРасширятьКарточку';
      });
      await page.getByTestId('profile-phone').evaluate((element) => {
        element.textContent = 'very-long-email-address-without-spaces@example-with-a-long-domain.invalid';
      });
      await expectNoProfileOverflow(page);

      await page.getByTestId('profile-edit-btn').click();
      await expectControlInsideViewport(page, 'profile-cancel-btn');
      await expectControlInsideViewport(page, 'profile-save-btn');
      await expectNoProfileOverflow(page);
    });
  }
});
