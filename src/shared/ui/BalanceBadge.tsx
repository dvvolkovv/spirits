import { balanceLevel } from '../../config/balanceThresholds';

/**
 * Баланс токенов с цветом по порогу.
 *
 * Пороги берём из общего balanceThresholds, а не заводим свои: второй набор
 * порогов рано или поздно разъедется с бэкендом, и цифра стала бы зелёной
 * там, где ассистент уже пишет «токены на исходе».
 */
const COLORS: Record<string, string> = {
  ok: 'text-green-600',
  low: 'text-amber-600',
  critical: 'text-red-600',
};

export function BalanceBadge({ tokens, locale = 'ru-RU' }: { tokens: number; locale?: string }) {
  return (
    <span className={`text-2xl font-semibold ${COLORS[balanceLevel(tokens)]}`}>
      {tokens.toLocaleString(locale)}
    </span>
  );
}
