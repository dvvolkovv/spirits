import { Page } from '@playwright/test';
import { BASE_URL } from './testData';
import { assertIsTestPhone } from './guards';

/**
 * Извлечь JWT access token из localStorage текущей страницы.
 * Предполагает, что globalSetup уже положил токен в storageState.
 */
async function getAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('jwt_access_token'));
  if (!token) {
    throw new Error('cleanup: no jwt_access_token in page localStorage');
  }
  return token;
}

/**
 * Удалить историю чата с конкретным ассистентом текущего пользователя.
 */
export async function clearChatHistory(page: Page, assistantId: string): Promise<void> {
  const token = await getAccessToken(page);
  const res = await fetch(
    `${BASE_URL}/webhook/chat/history?assistantId=${encodeURIComponent(assistantId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) {
    throw new Error(`clearChatHistory failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Обновить произвольные поля профиля текущего пользователя.
 * Используется для отката изменений в Flow 04 (profile).
 */
export async function updateProfile(
  page: Page,
  payload: Record<string, unknown>,
): Promise<void> {
  const token = await getAccessToken(page);
  const res = await fetch(`${BASE_URL}/webhook/profile-update`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`updateProfile failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Изменить баланс токенов через debug-эндпоинт (может быть отрицательным).
 * Guard-ится whitelist тестовых телефонов на бэке.
 */
export async function resetTokens(phone: string, delta: number): Promise<void> {
  assertIsTestPhone(phone);
  const res = await fetch(
    `${BASE_URL}/webhook/debug/add-tokens/${phone}/${delta}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    throw new Error(`resetTokens failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Создать купон через admin API. Требует admin storageState.
 */
export async function createCoupon(
  page: Page,
  params: { code: string; tokens: number },
): Promise<unknown> {
  const token = await getAccessToken(page);
  const res = await fetch(`${BASE_URL}/webhook/admin/coupons`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'create', ...params }),
  });
  if (!res.ok) {
    throw new Error(`createCoupon failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Удалить купон через admin API. Требует admin storageState.
 */
export async function deleteCoupon(page: Page, code: string): Promise<void> {
  const token = await getAccessToken(page);
  const res = await fetch(`${BASE_URL}/webhook/admin/coupons`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'delete', code }),
  });
  if (!res.ok) {
    throw new Error(`deleteCoupon failed: ${res.status} ${await res.text()}`);
  }
}
