import { test, expect } from '@playwright/test';

// Flow 11 — поле ввода в мобильной вебе.
//
// Высота textarea тянется под текст. После отправки поле пустеет — и должно
// схлопнуться сразу, а не оставаться в рост отправленного сообщения до
// следующего нажатия клавиши: на телефоне разросшийся composer съедает пол-экрана
// переписки, и человек не видит ответа, который в этот момент печатается.
//
// Ответ ассистента здесь ни при чём, поэтому запрос в чат перехватываем: тест
// про поведение поля, а не про модель, и жечь на него токены незачем.

const LONG_TEXT = Array.from(
  { length: 12 },
  (_, i) => `Строка ${i + 1}: длинный вопрос, который не влезает в одну строку поля ввода.`,
).join('\n');

test.describe('Flow 11 — Composer', () => {
  test('после отправки длинного сообщения поле сразу схлопывается', async ({ page }, testInfo) => {
    // Репорт был про мобильную вебу — там цена лишней высоты максимальная.
    test.skip(!testInfo.project.name.startsWith('mobile'), 'нужен мобильный вьюпорт');

    await page.route('**/webhook/soulmate/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: JSON.stringify({ type: 'end', content: 'ок', usage: { total: 0 } }) + '\n',
      });
    });

    // Deep-link, а не клик по списку: на мобиле без выбранного ассистента
    // колонка чата спрятана классом `hidden md:flex`, и поля ввода на экране нет.
    await page.goto('/chat?assistant=roman');
    await expect(page.getByTestId('chat-root')).toBeVisible({ timeout: 20_000 });

    const input = page.getByTestId('chat-input');
    await expect(input).toBeVisible();

    const collapsed = (await input.boundingBox())!.height;

    await input.fill(LONG_TEXT);
    const grown = (await input.boundingBox())!.height;
    // Страховка от ложно-зелёного: если поле не выросло, дальше проверять нечего.
    expect(grown).toBeGreaterThan(collapsed + 40);

    await page.getByTestId('chat-send-btn').click();
    await expect(input).toHaveValue('');

    const afterSend = (await input.boundingBox())!.height;
    expect(afterSend).toBeLessThanOrEqual(collapsed + 2);
  });
});
