import { describe, it, expect } from 'vitest';
import { setItemResilient, evictRegenerable, REGENERABLE_KEYS } from './persistentStorage';

/**
 * Фейковый localStorage с настраиваемым потолком: setItem бросает
 * QuotaExceededError, как только суммарный размер выходит за лимит.
 * Реальный браузер ведёт себя ровно так — см. воспроизведение бага входа.
 */
function makeStore(limitBytes: number): Storage & { size(): number } {
  const map = new Map<string, string>();
  const size = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const store = {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    setItem: (k: string, v: string) => {
      const next = size() - (map.has(k) ? k.length + map.get(k)!.length : 0) + k.length + v.length;
      if (next > limitBytes) {
        const e: any = new Error(`Setting the value of '${k}' exceeded the quota.`);
        e.name = 'QuotaExceededError';
        throw e;
      }
      map.set(k, v);
    },
    size,
  };
  return store as any;
}

describe('setItemResilient', () => {
  it('пишет значение, когда места хватает', () => {
    const store = makeStore(1000);

    expect(setItemResilient('authToken', 'jwt', store)).toBe(true);
    expect(store.getItem('authToken')).toBe('jwt');
  });

  it('РЕГРЕССИЯ: при переполнении освобождает место и всё-таки сохраняет токен', () => {
    // Инцидент 2026-08-07: у активных пользователей localStorage забит legacy-ключами
    // chat_messages_assistant_* от старых сборок. localStorage.setItem('authToken')
    // бросал QuotaExceededError прямо в AuthContext.login — успешный вход выглядел
    // как «Неверный код», хотя сервер OTP уже принял и погасил.
    const store = makeStore(200);
    store.setItem('chat_messages_assistant_12', 'x'.repeat(150));

    expect(setItemResilient('authToken', 'y'.repeat(100), store)).toBe(true);
    expect(store.getItem('authToken')).toBe('y'.repeat(100));
    expect(store.getItem('chat_messages_assistant_12')).toBeNull();
  });

  it('возвращает false, а не бросает, когда освобождать нечего', () => {
    // Приватный режим iOS / встроенный webview: квота нулевая, чистить нечего.
    // Вызывающий код должен получить честный false, а не исключение.
    const store = makeStore(0);

    expect(() => setItemResilient('authToken', 'jwt', store)).not.toThrow();
    expect(setItemResilient('authToken', 'jwt', store)).toBe(false);
  });

  it('ради места не выбрасывает данные сессии', () => {
    const store = makeStore(300);
    store.setItem('jwt_refresh_token', 'r'.repeat(80));
    store.setItem('userData', 'u'.repeat(80));
    store.setItem('chat_messages_assistant_3', 'c'.repeat(80));

    expect(setItemResilient('authToken', 'a'.repeat(80), store)).toBe(true);
    expect(store.getItem('jwt_refresh_token')).toBe('r'.repeat(80));
    expect(store.getItem('userData')).toBe('u'.repeat(80));
    expect(store.getItem('chat_messages_assistant_3')).toBeNull();
  });
});

describe('evictRegenerable', () => {
  it('чистит только то, что восстановимо с сервера', () => {
    const store = makeStore(10000);
    store.setItem('chat_messages_assistant_1', 'a');
    store.setItem('chat_messages_assistant_default', 'b');
    REGENERABLE_KEYS.forEach((k) => store.setItem(k, 'c'));
    store.setItem('authToken', 'keep');
    store.setItem('jwt_access_token', 'keep');
    store.setItem('loginConsent', 'true');

    const removed = evictRegenerable(store);

    expect(removed).toBe(2 + REGENERABLE_KEYS.length);
    expect(store.getItem('authToken')).toBe('keep');
    expect(store.getItem('jwt_access_token')).toBe('keep');
    expect(store.getItem('loginConsent')).toBe('true');
    expect(store.getItem('chat_messages_assistant_1')).toBeNull();
  });

  it('на пустом хранилище ничего не делает и не падает', () => {
    const store = makeStore(100);
    expect(evictRegenerable(store)).toBe(0);
  });
});
