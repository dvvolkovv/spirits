/**
 * Запись в localStorage, устойчивая к переполнению квоты.
 *
 * Инцидент 2026-08-07: у пользователей с давним аккаунтом localStorage забит
 * legacy-ключами `chat_messages_assistant_*` — их писали старые сборки, сейчас
 * их только читают как офлайн-фолбэк, и никто не чистит. Когда квота (~5 МБ)
 * исчерпана, `localStorage.setItem` бросает QuotaExceededError. В `login()`
 * это происходило на записи `authToken` — до `setUser`, — и успешный вход
 * выглядел как «Неверный код»: сервер OTP уже принял и погасил, а человек
 * запрашивал новый код по кругу.
 *
 * Поэтому при переполнении сначала освобождаем место за счёт того, что
 * восстановимо с сервера (кеш истории чатов, результаты поиска), и повторяем
 * запись. Данные сессии не трогаем никогда.
 */

/** Кеш истории чатов старых сборок. Источник правды — `/webhook/chat/history`. */
const REGENERABLE_PREFIXES = ['chat_messages_assistant_'];

/** Результаты последнего поиска — перезапрашиваются с сервера. */
export const REGENERABLE_KEYS = ['search_results', 'search_query', 'search_comment', 'has_searched'];

function isRegenerable(key: string): boolean {
  return REGENERABLE_KEYS.includes(key) || REGENERABLE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Удаляет из хранилища всё, что можно перезапросить с сервера.
 * @returns сколько ключей удалено
 */
export function evictRegenerable(store: Storage = localStorage): number {
  const doomed: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && isRegenerable(key)) doomed.push(key);
    }
    doomed.forEach((key) => store.removeItem(key));
  } catch {
    // Хранилище недоступно целиком (приватный режим, отключённые куки) —
    // освобождать нечего, вызывающий получит false от setItemResilient.
  }
  return doomed.length;
}

/**
 * `localStorage.setItem`, который не бросает: при нехватке места чистит
 * восстановимое и пробует ещё раз.
 *
 * @returns удалось ли сохранить. false означает, что сессия не переживёт
 *          перезагрузку страницы — это нужно показать пользователю честно,
 *          а не выдавать за ошибку кода из SMS.
 */
export function setItemResilient(key: string, value: string, store: Storage = localStorage): boolean {
  try {
    store.setItem(key, value);
    return true;
  } catch {
    if (evictRegenerable(store) === 0) return false;
    try {
      store.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
