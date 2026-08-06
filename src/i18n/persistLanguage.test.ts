import { describe, it, expect, vi } from 'vitest';
import { persistLanguage, PROFILE_UPDATE_URL } from './persistLanguage';

describe('persistLanguage', () => {
  it('пишет язык в профиль, когда есть сессия', async () => {
    const post = vi.fn().mockResolvedValue({});
    const sent = await persistLanguage('es', { hasTokens: () => true, post });

    expect(sent).toBe(true);
    expect(post).toHaveBeenCalledWith(PROFILE_UPDATE_URL, { language: 'es' });
  });

  it('РЕГРЕССИЯ: без сессии запрос не уходит', async () => {
    // Экран входа: аккаунта ещё нет. Раньше здесь был не пропуск, а полное
    // отсутствие записи вообще — и на экране настроек тоже.
    const post = vi.fn();
    const sent = await persistLanguage('de', { hasTokens: () => false, post });

    expect(sent).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('сетевая ошибка не пробрасывается — язык уже переключён локально', async () => {
    const post = vi.fn().mockRejectedValue(new Error('офлайн'));
    const onError = vi.fn();

    await expect(
      persistLanguage('fr', { hasTokens: () => true, post, onError }),
    ).resolves.toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it('отправляет ровно тот код языка, который выбрали', async () => {
    const post = vi.fn().mockResolvedValue({});
    for (const lang of ['ru', 'en', 'es', 'de', 'fr', 'zh']) {
      await persistLanguage(lang, { hasTokens: () => true, post });
      expect(post).toHaveBeenLastCalledWith(PROFILE_UPDATE_URL, { language: lang });
    }
    expect(post).toHaveBeenCalledTimes(6);
  });
});
