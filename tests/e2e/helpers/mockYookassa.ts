import { Page } from '@playwright/test';

/**
 * Перехватывает запрос на создание YooKassa-платежа и возвращает фейковый
 * confirmation_url, ведущий на страницу успеха того же фронта.
 * Вызывать ДО навигации на /tokens.
 */
export async function mockYookassaCheckout(page: Page): Promise<void> {
  await page.route('**/webhook/yookassa/create-payment', async (route) => {
    const paymentId = `test-pw-${Date.now()}`;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        payment_id: paymentId,
        confirmation_url: `/payment/success?fake=1&payment_id=${paymentId}`,
        status: 'pending',
      }),
    });
  });
}

/**
 * Перехватывает polling payment-status и возвращает "succeeded".
 */
export async function mockYookassaPaymentStatus(page: Page): Promise<void> {
  await page.route('**/webhook/payment-status*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'succeeded' }),
    });
  });
}
