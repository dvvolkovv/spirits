import { describe, it, expect } from 'vitest';
import { FALLBACK_TERMS, payoutTerms, rubToTokens, withdrawableRub } from './referralPayout';

describe('payoutTerms', () => {
  it('берёт условия из ответа API — считает тот, кто зачисляет', () => {
    expect(payoutTerms({ rate_tokens_per_rub: 900, min_rub: 50, withdraw_min_rub: 300 })).toEqual({
      rateTokensPerRub: 900,
      minRub: 50,
      withdrawMinRub: 300,
    });
  });

  it('старый ответ без поля payout — работаем на запасных значениях', () => {
    expect(payoutTerms(undefined)).toEqual(FALLBACK_TERMS);
    expect(payoutTerms(null)).toEqual(FALLBACK_TERMS);
  });

  it('мусор вместо числа не обнуляет курс', () => {
    // Курс 0 превратил бы «771,30 ₽ → 0 токенов» в правдоподобную подпись.
    expect(payoutTerms({ rate_tokens_per_rub: 0 }).rateTokensPerRub).toBe(FALLBACK_TERMS.rateTokensPerRub);
    expect(payoutTerms({ rate_tokens_per_rub: NaN }).rateTokensPerRub).toBe(FALLBACK_TERMS.rateTokensPerRub);
    expect(payoutTerms({ withdraw_min_rub: -100 }).withdrawMinRub).toBe(FALLBACK_TERMS.withdrawMinRub);
  });
});

describe('withdrawableRub', () => {
  it('начислено минус выплачено', () => {
    expect(withdrawableRub(771.3, 0)).toBe(771.3);
    expect(withdrawableRub(492.37, 492.37)).toBe(0);
  });

  it('не уходит в минус, если выплачено больше начисленного', () => {
    expect(withdrawableRub(100, 150)).toBe(0);
  });

  it('копеечные хвосты не текут в подпись', () => {
    expect(withdrawableRub(194.36999999999998, 0)).toBe(194.37);
  });

  it('пустые данные — ноль, а не NaN', () => {
    expect(withdrawableRub()).toBe(0);
  });
});

describe('rubToTokens', () => {
  it('считает по курсу из условий', () => {
    expect(rubToTokens(771.3, { ...FALLBACK_TERMS, rateTokensPerRub: 750 })).toBe(578475);
  });

  it('прежний курс дал бы меньше — подпись обязана следовать за бэком', () => {
    expect(rubToTokens(771.3, { ...FALLBACK_TERMS, rateTokensPerRub: 600 })).toBe(462780);
  });
});
