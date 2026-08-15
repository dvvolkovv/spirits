import { describe, it, expect } from 'vitest';
import { balanceLevel, LOW_BALANCE, CRITICAL_BALANCE } from './balanceThresholds';

describe('balanceLevel', () => {
  it('большой баланс — ok', () => {
    expect(balanceLevel(50000)).toBe('ok');
  });

  it('ровно на пороге низкого — ещё ok', () => {
    expect(balanceLevel(LOW_BALANCE)).toBe('ok');
  });

  it('ниже порога низкого — low', () => {
    expect(balanceLevel(LOW_BALANCE - 1)).toBe('low');
  });

  it('ровно на критическом — ещё low', () => {
    expect(balanceLevel(CRITICAL_BALANCE)).toBe('low');
  });

  it('ниже критического — critical', () => {
    expect(balanceLevel(CRITICAL_BALANCE - 1)).toBe('critical');
  });

  it('ноль — critical', () => {
    expect(balanceLevel(0)).toBe('critical');
  });
});

describe('пороги', () => {
  it('низкий порог совпадает с бэкендовым LOW_BALANCE_THRESHOLD', () => {
    // Бэк предупреждает устами ассистента ниже 10 000 — цвет должен меняться
    // там же, иначе пользователь видит зелёную цифру и слышит «токены на исходе».
    expect(LOW_BALANCE).toBe(10000);
  });

  it('критический порог — 2 000', () => {
    expect(CRITICAL_BALANCE).toBe(2000);
  });
});
