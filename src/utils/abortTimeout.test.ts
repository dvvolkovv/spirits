import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { withAbortTimeout } from './abortTimeout';

/**
 * AbortSignal.timeout нет в Safari < 16 и WebView < 103: там вызов бросает
 * TypeError ещё до запроса, и любой catch вокруг него принимает это за сбой
 * сети. Помощник собран из AbortController и setTimeout — они есть везде.
 */
describe('withAbortTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('сигнал отменяется по истечении срока, не раньше', () => {
    vi.useFakeTimers();
    const { signal } = withAbortTimeout(2000);
    vi.advanceTimersByTime(1999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
  });

  it('done() снимает таймер: ответ уже пришёл — отменять нечего', () => {
    vi.useFakeTimers();
    const { signal, done } = withAbortTimeout(2000);
    done();
    vi.advanceTimersByTime(10_000);
    expect(signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('работает там, где AbortSignal.timeout нет', () => {
    const original = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
    try {
      Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true });
      vi.useFakeTimers();
      const { signal } = withAbortTimeout(100);
      vi.advanceTimersByTime(100);
      expect(signal.aborted).toBe(true);
    } finally {
      if (original) Object.defineProperty(AbortSignal, 'timeout', original);
    }
  });

  it('сам не зовёт AbortSignal.timeout', () => {
    const src = readFileSync(join(__dirname, 'abortTimeout.ts'), 'utf8');
    expect(src).not.toMatch(/AbortSignal\.timeout\(/);
  });

  it('проба без входа берёт общий помощник, а не свою копию', () => {
    const guestApi = readFileSync(join(__dirname, '..', 'components', 'guest', 'guestApi.ts'), 'utf8');
    expect(guestApi).toContain("import { withAbortTimeout } from '../../utils/abortTimeout';");
    expect(guestApi).not.toMatch(/function withAbortTimeout\(/);
  });
});
