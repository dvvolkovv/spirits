// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAppStorage } from '../../utils/clearAppStorage';
import {
  forgetTrial, hasAccount, markHasAccount, previewRequested, readTrial, rememberPreviewFromUrl, saveTrial,
} from './guestStorage';

const TOKEN = 'A'.repeat(43);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('проба в браузере', () => {
  it('ключ и ассистент сохраняются и читаются', () => {
    saveTrial({ token: TOKEN, assistantId: '12' });
    expect(readTrial()).toEqual({ token: TOKEN, assistantId: '12' });
    forgetTrial();
    expect(readTrial()).toBeNull();
  });

  it('битая запись стирается', () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: 'короткий', assistantId: '12' }));
    expect(readTrial()).toBeNull();
    expect(localStorage.getItem('guest_trial')).toBeNull();
  });

  it('выход из аккаунта стирает ключ пробы, но не отметку «входили»', () => {
    saveTrial({ token: TOKEN, assistantId: '12' });
    markHasAccount();
    clearAppStorage();
    expect(readTrial()).toBeNull();
    expect(hasAccount()).toBe(true);
  });

  it('предпросмотр — только из ?trial=1 и только в этой вкладке', () => {
    rememberPreviewFromUrl('?assistant=12');
    expect(previewRequested()).toBe(false);
    rememberPreviewFromUrl('?assistant=12&trial=1');
    expect(previewRequested()).toBe(true);
    expect(localStorage.getItem('guest_trial_preview')).toBeNull();
  });

  it('хранилище бросает (приватный режим, запрет сайта)', () => {
    const denied = () => { throw new DOMException('denied', 'SecurityError'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied);

    expect(readTrial()).toBeNull();
    expect(hasAccount()).toBe(false);
    expect(previewRequested()).toBe(false);

    expect(() => saveTrial({ token: TOKEN, assistantId: '12' })).not.toThrow();
    expect(() => forgetTrial()).not.toThrow();
    expect(() => markHasAccount()).not.toThrow();
    expect(() => rememberPreviewFromUrl('?trial=1')).not.toThrow();
  });
});
