import { isUuid } from '../utils/uuid';

/**
 * Кнопка бота открывает мини-приложение адресом `/tma/?pa=<id>` (строка
 * запроса): карточка ключей бота показывается вместо вкладок. Фрагмент
 * (`#pa=<id>`) — запасной путь: Telegram дописывает в адрес СВОИ параметры
 * запуска во фрагмент (`#tgWebAppData=...`), и не каждый клиент гарантированно
 * сохраняет фрагмент, который был в адресе до открытия, — а строку запроса
 * Telegram не трогает вовсе.
 */
function extract(raw: string): string | null {
  const params = new URLSearchParams(String(raw ?? '').replace(/^[?#]/, ''));
  const id = params.get('pa');
  return isUuid(id) ? id : null;
}

/** Тонкая обёртка над extract — оставлена отдельно для прямых проверок фрагмента. */
export function actionFromHash(hash: string): string | null {
  return extract(hash);
}

/**
 * Основной разбор адреса мини-приложения: строка запроса первой, фрагмент —
 * запасной путь. Вызывается как
 * `actionFromLocation(window.location.search, window.location.hash)`.
 */
export function actionFromLocation(search: string, hash: string): string | null {
  return extract(search) ?? extract(hash);
}
