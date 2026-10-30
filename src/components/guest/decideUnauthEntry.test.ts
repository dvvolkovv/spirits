import { describe, expect, it } from 'vitest';
import { decideUnauthEntry } from './decideUnauthEntry';

const guest = { native: false, mode: 'on' as const, preview: false, hasAccount: false, pathname: '/chat' };

describe('проба или экран входа', () => {
  it('новое устройство, режим «вкл», / или /chat — проба', () => {
    expect(decideUnauthEntry(guest)).toBe('guest');
    expect(decideUnauthEntry({ ...guest, pathname: '/' })).toBe('guest');
  });
  it('устройство, где входили, — вход', () => {
    expect(decideUnauthEntry({ ...guest, hasAccount: true })).toBe('login');
  });
  it('нативная сборка — вход', () => {
    expect(decideUnauthEntry({ ...guest, native: true })).toBe('login');
  });
  it('другие разделы кабинета — вход', () => {
    expect(decideUnauthEntry({ ...guest, pathname: '/studio' })).toBe('login');
    expect(decideUnauthEntry({ ...guest, pathname: '/image-gen' })).toBe('login');
  });
  it('«предпросмотр» — только с ?trial=1, «выкл» и неизвестно — вход', () => {
    expect(decideUnauthEntry({ ...guest, mode: 'preview' })).toBe('login');
    expect(decideUnauthEntry({ ...guest, mode: 'preview', preview: true })).toBe('guest');
    expect(decideUnauthEntry({ ...guest, mode: 'off', preview: true })).toBe('login');
    expect(decideUnauthEntry({ ...guest, mode: null })).toBe('login');
  });
  it('хвостовой слэш в пути не считается другим разделом', () => {
    expect(decideUnauthEntry({ ...guest, pathname: '/chat/' })).toBe('guest');
    expect(decideUnauthEntry({ ...guest, pathname: '//' })).toBe('guest');
    expect(decideUnauthEntry({ ...guest, pathname: '/chatroom' })).toBe('login');
    expect(decideUnauthEntry({ ...guest, pathname: '/studio/' })).toBe('login');
  });
});
