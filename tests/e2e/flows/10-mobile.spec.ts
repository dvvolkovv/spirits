import { test, expect, type Locator, type Page } from '@playwright/test';

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

  const LONG_NAME = 'ОченьДлинноеИмяПользователяБезПробелов'.repeat(2);
  const LONG_SURNAME = 'ОченьДлиннаяФамилияПользователяБезПробелов'.repeat(2);
  const LONG_NICKNAME = 'longnickname'.repeat(12);
  const LONG_EMAIL = `${'a'.repeat(64)}@${'b'.repeat(63)}.invalid`;
  const LONG_DISPLAY_NAME = `${LONG_NAME} ${LONG_SURNAME}`;
  const LONG_NICKNAME_TEXT = `@${LONG_NICKNAME}`;

  const setupProfileFixture = async (page: Page) => {
    await page.addInitScript(({ firstName, lastName, phone, email }) => {
      const stored = localStorage.getItem('userData');
      if (!stored) throw new Error('profile fixture: userData is missing from storageState');
      const userData = JSON.parse(stored);
      localStorage.setItem('userData', JSON.stringify({
        ...userData,
        firstName,
        lastName,
        // ProfileView запрашивает анкету только при truthy user.phone. Email-shaped
        // значение сохраняет реальный GET/render-путь и не использует номер телефона.
        phone,
        email,
      }));
    }, { firstName: LONG_NAME, lastName: LONG_SURNAME, phone: LONG_EMAIL, email: LONG_EMAIL });

    await page.route('**/webhook/profile', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        json: [{
          profileJson: {
            name: LONG_NAME,
            family_name: LONG_SURNAME,
            user_nickname: LONG_NICKNAME,
            email: LONG_EMAIL,
            phone: '',
            language: 'ru',
            isadmin: false,
            onboarded: true,
            profile: [],
            values: [],
            beliefs: [],
            desires: [],
            intents: [],
            interests: [],
            skills: [],
            valuesRich: [],
            beliefsRich: [],
            desiresRich: [],
            intentsRich: [],
            interestsRich: [],
            skillsRich: [],
          },
        }],
      });
    });
    await page.route('**/webhook/profile-update', (route) => route.fulfill({ json: { success: true } }));
    await page.route('**/webhook/tg-bot/identity-status', (route) => route.fulfill({
      json: { bound: true, tgUsername: LONG_NICKNAME },
    }));
  };

  const longProfileLocators = (page: Page) => {
    const name = page.getByTestId('profile-name');
    return {
      name,
      phone: page.getByTestId('profile-phone'),
      emails: page.getByText(LONG_EMAIL, { exact: true }),
      photoNickname: name.locator('..').getByText(LONG_NICKNAME_TEXT, { exact: true }),
      telegramNickname: page.locator('#profile-card-telegram').getByText(LONG_NICKNAME_TEXT, { exact: true }),
    };
  };

  const expectLongProfileText = async (page: Page) => {
    const locators = longProfileLocators(page);
    await expect(locators.name).toHaveText(LONG_DISPLAY_NAME);
    await expect(locators.phone).toHaveText(LONG_EMAIL);
    await expect(locators.emails).toHaveCount(2);
    await expect(locators.photoNickname).toHaveCount(1);
    await expect(locators.photoNickname).toHaveText(LONG_NICKNAME_TEXT);
    await expect(locators.telegramNickname).toHaveCount(1);
    await expect(locators.telegramNickname).toHaveText(LONG_NICKNAME_TEXT);
  };

  const openProfileFixture = async (page: Page) => {
    await page.goto('/profile?lang=ru');
    const root = page.getByTestId('profile-root');
    await expect(root).toBeVisible();
    await expectLongProfileText(page);
    await expect(root.locator('.animate-spin')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
  };

  const expectNoProfileOverflow = async (page: Page) => {
    await expect.poll(() => page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-testid="profile-root"]');
      const content = document.querySelector<HTMLElement>('[data-testid="profile-content"]');
      if (!root || !content) return false;
      return document.documentElement.scrollWidth <= window.innerWidth
        && root.scrollWidth <= window.innerWidth
        && content.scrollWidth <= content.clientWidth;
    })).toBe(true);
  };

  const expectOwnContentToFit = async (locator: Locator) => {
    await expect.poll(() => locator.evaluate((element) => (
      element.scrollWidth <= element.clientWidth
    ))).toBe(true);
  };

  const expectLongProfileValuesToFit = async (page: Page) => {
    const locators = longProfileLocators(page);
    for (const locator of [
      locators.name,
      locators.phone,
      locators.emails.nth(0),
      locators.emails.nth(1),
      locators.photoNickname,
      locators.telegramNickname,
    ]) {
      await expectOwnContentToFit(locator);
    }
  };

  const expectControlInsideViewport = async (control: Locator) => {
    await expect(control).toBeVisible();
    await expect(control).toBeEnabled();
    await expect(control).toBeInViewport({ ratio: 1 });
  };

  test.describe('profile layout regressions', () => {
    // PWA service worker после load перехватывает контроль страницы, и page.route
    // перестаёт видеть API. Блокируем его только для этих fixture-тестов.
    test.use({ serviceWorkers: 'block' });

    for (const width of [320, 360, 390]) {
      test(`profile controls fit ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 664 });
        await setupProfileFixture(page);
        await openProfileFixture(page);

        await expectControlInsideViewport(page.getByRole('combobox', { name: 'Язык интерфейса' }));
        await expectControlInsideViewport(page.getByRole('button', { name: 'Обновить', exact: true }));
        await expectControlInsideViewport(page.getByTestId('profile-edit-btn'));
        await expectLongProfileValuesToFit(page);
        await expectNoProfileOverflow(page);

        await page.getByTestId('profile-edit-btn').click();
        await expectControlInsideViewport(page.getByTestId('profile-cancel-btn'));
        await expectControlInsideViewport(page.getByTestId('profile-save-btn'));
        await expect(page.getByTestId('profile-name-input')).toHaveValue(LONG_NAME);
        await expect(page.getByTestId('profile-lastname-input')).toHaveValue(LONG_SURNAME);
        await expectNoProfileOverflow(page);

        await page.getByTestId('profile-cancel-btn').click();
        await expectControlInsideViewport(page.getByTestId('profile-edit-btn'));

        await page.getByTestId('profile-edit-btn').click();
        await expect(page.getByTestId('profile-name-input')).toHaveValue(LONG_NAME);
        await expect(page.getByTestId('profile-lastname-input')).toHaveValue(LONG_SURNAME);
        page.once('dialog', async (dialog) => dialog.accept());
        await page.getByTestId('profile-save-btn').click();
        await expectControlInsideViewport(page.getByTestId('profile-edit-btn'));
        await expectNoProfileOverflow(page);
      });
    }

    test('profile keeps bottom navigation clearance at 640px', async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 800 });
      await setupProfileFixture(page);
      await openProfileFixture(page);

      await expect.poll(() => page.getByTestId('profile-content').evaluate((element) => (
        getComputedStyle(element).paddingBottom
      ))).toBe('80px');
    });

    test('profile delete dialog fits short mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await setupProfileFixture(page);
      await openProfileFixture(page);

      await page.getByRole('button', { name: 'Удалить аккаунт', exact: true }).click();
      const confirmDelete = page.getByRole('button', { name: 'Удалить навсегда', exact: true });
      const cancel = page.getByRole('button', { name: 'Отмена', exact: true });
      await expect(confirmDelete).toBeVisible();
      await expect(cancel).toBeVisible();
      await cancel.scrollIntoViewIfNeeded();
      await expect(cancel).toBeInViewport({ ratio: 1 });
      await cancel.click();
      await expect(confirmDelete).toHaveCount(0);
    });
  });
});
