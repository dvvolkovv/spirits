/**
 * Список ключей localStorage, используемых приложением
 */
const APP_STORAGE_KEYS = [
  'authToken',
  'userData',
  'selected_assistant',
  'search_query',
  'search_results',
  'search_comment',
  'has_searched',
  'pending_payment_id',
] as const;

const CHAT_MESSAGES_PREFIX = 'chat_messages_assistant_';

/**
 * Очищает localStorage от всех данных приложения.
 * Вызывать после logout и deleteProfile.
 */
export function clearAppStorage(): void {
  if (typeof window === 'undefined') return;

  // Удаляем известные ключи
  APP_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });

  // Удаляем ключи чатов по ассистентам (chat_messages_assistant_1, chat_messages_assistant_2, ...)
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CHAT_MESSAGES_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
