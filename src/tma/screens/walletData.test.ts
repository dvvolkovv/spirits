import { describe, it, expect, vi } from 'vitest';
import { parseBalance, parseHistory, loadWallet, tokensLabel } from './walletData';

describe('parseBalance', () => {
  it('читает tokens — реальную форму /webhook/user/tokens/', () => {
    expect(parseBalance({ success: true, tokens: 42000 })).toBe(42000);
  });

  it('0, если поля нет или оно не число', () => {
    expect(parseBalance({})).toBe(0);
    expect(parseBalance(null)).toBe(0);
  });
});

describe('parseHistory', () => {
  it('читает items — реальную форму /webhook/tokens/history (только начисления)', () => {
    const raw = { items: [{ at: '2026-08-01T00:00:00Z', type: 'purchase', tokens: 200000, description: 'Basic' }] };
    expect(parseHistory(raw)).toEqual([
      { at: '2026-08-01T00:00:00Z', type: 'purchase', tokens: 200000, description: 'Basic' },
    ]);
  });

  it('пустой список, если items не массив', () => {
    expect(parseHistory({})).toEqual([]);
    expect(parseHistory(null)).toEqual([]);
  });
});

describe('loadWallet — независимая деградация', () => {
  it('падение истории не гасит уже полученный баланс', async () => {
    const deps = {
      getTokens: vi.fn(async () => ({ tokens: 100 })),
      getHistory: vi.fn(async () => { throw new Error('500'); }),
    };
    const r = await loadWallet(deps);
    expect(r.balance).toBe(100);
    expect(r.history).toBe('failed');
  });

  it('падение баланса не гасит уже полученную историю', async () => {
    const deps = {
      getTokens: vi.fn(async () => { throw new Error('500'); }),
      getHistory: vi.fn(async () => ({ items: [] })),
    };
    const r = await loadWallet(deps);
    expect(r.balance).toBe('failed');
    expect(r.history).toEqual([]);
  });
});

describe('tokensLabel', () => {
  it('делегирует счёт в t(), а не форматирует число сама', () => {
    const t = vi.fn((key: string, opts: Record<string, unknown>) => `${key}:${opts.count}`);
    expect(tokensLabel(t, 5)).toBe('tma.wallet.tokens:5');
    expect(t).toHaveBeenCalledWith('tma.wallet.tokens', { count: 5 });
  });
});
