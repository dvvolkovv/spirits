// Условия вывода реферального вознаграждения.
//
// Значения приезжают с бэкенда в `/webhook/referral/stats` (поле `payout`) —
// именно он их и применяет при зачислении. Числа ниже это лишь запас на случай
// старого ответа: у фронта была своя копия курса с подписью «совпадает с бэком»,
// и совпадать она была обязана в двух репозиториях, которые правят по отдельности.

export interface PayoutTerms {
  /** Сколько токенов дают за рубль комиссии. */
  rateTokensPerRub: number;
  /** Минимум для вывода токенами, ₽. */
  minRub: number;
  /** Минимум для заявки на вывод деньгами, ₽. */
  withdrawMinRub: number;
}

export const FALLBACK_TERMS: PayoutTerms = {
  rateTokensPerRub: 750,
  minRub: 100,
  withdrawMinRub: 500,
};

interface StatsPayoutField {
  rate_tokens_per_rub?: number;
  min_rub?: number;
  withdraw_min_rub?: number;
}

const positive = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;

/** Условия вывода из ответа API; чего нет — берём из запаса. */
export function payoutTerms(payout?: StatsPayoutField | null): PayoutTerms {
  return {
    rateTokensPerRub: positive(payout?.rate_tokens_per_rub, FALLBACK_TERMS.rateTokensPerRub),
    minRub: positive(payout?.min_rub, FALLBACK_TERMS.minRub),
    withdrawMinRub: positive(payout?.withdraw_min_rub, FALLBACK_TERMS.withdrawMinRub),
  };
}

/**
 * Сколько рублей комиссии доступно к выводу.
 *
 * Считается как «начислено минус выплачено», а не по полю pending_rub: заявка на
 * вывод деньгами резервирует комиссии тем же признаком paid_out, и после неё
 * pending обнуляется — вторая кнопка не должна предлагать вывести то же самое.
 */
export const withdrawableRub = (totalCommissionRub = 0, paidOutRub = 0): number =>
  Math.round(Math.max(0, totalCommissionRub - paidOutRub) * 100) / 100;

/** Во столько токенов превратится сумма при выводе токенами. */
export const rubToTokens = (rub: number, terms: PayoutTerms): number =>
  Math.round(rub * terms.rateTokensPerRub);
