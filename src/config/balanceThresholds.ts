/**
 * Пороги остатка токенов — единственный источник правды для всех витрин.
 *
 * LOW_BALANCE обязан совпадать с LOW_BALANCE_THRESHOLD на бэкенде
 * (spirits_back/src/tokens/consumption-rate.ts): ассистент предупреждает
 * пользователя ровно ниже этой отметки, и зелёная цифра рядом с фразой
 * «токены на исходе» выглядела бы как ошибка одного из двух.
 */
export const LOW_BALANCE = 10000;
export const CRITICAL_BALANCE = 2000;

export type BalanceLevel = 'ok' | 'low' | 'critical';

export function balanceLevel(tokens: number): BalanceLevel {
  if (tokens < CRITICAL_BALANCE) return 'critical';
  if (tokens < LOW_BALANCE) return 'low';
  return 'ok';
}
