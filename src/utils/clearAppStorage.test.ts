// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clearAppStorage } from './clearAppStorage';
import { DRAFT_KEY } from './pendingDraft';

describe('clearAppStorage', () => {
  it('стирает черновик с данными рождения при выходе из аккаунта', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: 'x', assistant: '14', expires: Date.now() + 60_000 }));
    clearAppStorage();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
