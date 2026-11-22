// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initKbdDebug, resolveKbdDebug } from './kbdDebug';

const KEY = 'kbd_debug';

describe('флаг диагностической плашки клавиатуры', () => {
  beforeEach(() => localStorage.clear());

  it('?kbd-debug=1 включает и запоминает', () => {
    expect(resolveKbdDebug('?kbd-debug=1', localStorage)).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('запомненный флаг включает плашку без параметра — так она доезжает до PWA', () => {
    localStorage.setItem(KEY, '1');
    expect(resolveKbdDebug('?src=pwa', localStorage)).toBe(true);
  });

  it('?kbd-debug=0 выключает и стирает', () => {
    localStorage.setItem(KEY, '1');
    expect(resolveKbdDebug('?kbd-debug=0', localStorage)).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('без параметра и флага — выключено', () => {
    expect(resolveKbdDebug('', localStorage)).toBe(false);
  });

  it('хранилище недоступно — параметр всё равно включает на эту загрузку', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    } as unknown as Storage;
    expect(resolveKbdDebug('?kbd-debug=1', broken)).toBe(true);
    expect(resolveKbdDebug('', broken)).toBe(false);
  });
});

describe('плашка в DOM', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => document.querySelectorAll('[data-kbd-debug]').forEach((n) => n.remove()));

  it('по умолчанию не появляется', () => {
    initKbdDebug('');
    expect(document.querySelector('[data-kbd-debug]')).toBeNull();
  });

  it('с флагом появляется и показывает высоты окна', () => {
    const stop = initKbdDebug('?kbd-debug=1');
    const panel = document.querySelector('[data-kbd-debug]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('win');
    stop();
  });

  it('кнопка off убирает плашку и стирает флаг', () => {
    initKbdDebug('?kbd-debug=1');
    const off = document.querySelector<HTMLButtonElement>('[data-kbd-debug-off]');
    off!.click();
    expect(document.querySelector('[data-kbd-debug]')).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
