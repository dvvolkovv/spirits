import { describe, it, expect } from 'vitest';
import { RUB_PACKAGES, BASE_PRICE_PER_1000, CRYPTO_NAME_KEY } from './tokenPackages';

/**
 * Согласованный прайс, выписанный явно и отдельно от реализации.
 *
 * Смысл дублирования: правка цены в модуле «мимоходом» роняет этот тест, и
 * менять прайс приходится осознанно, в двух местах. Прайс — не тот код, где
 * незамеченная правка допустима.
 */
const EXPECTED: Array<[string, number, number]> = [
  ['starter', 149, 50_000],
  ['extended', 499, 200_000],
  ['professional', 1990, 1_000_000],
  ['business', 4990, 3_000_000],
  ['maximum', 9990, 7_000_000],
];

const pricePer1000 = (p: { priceRub: number; tokens: number }) => p.priceRub / (p.tokens / 1000);

describe('прайс токенов', () => {
  it('совпадает с согласованным списком', () => {
    expect(RUB_PACKAGES.map((p) => [p.id, p.priceRub, p.tokens])).toEqual(EXPECTED);
  });

  // Немонотонная лестница означает, что более крупная покупка невыгодна.
  // Именно так выглядел max_usd ($19.6 за миллион) рядом с business_usd ($20.7).
  it('цена за 1000 токенов строго убывает', () => {
    const prices = RUB_PACKAGES.map(pricePer1000);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThan(prices[i - 1]);
    }
  });

  it('ярлык скидки не превышает фактическую выгоду', () => {
    for (const p of RUB_PACKAGES) {
      if (p.savingsPct === undefined) continue;
      const actual = (1 - pricePer1000(p) / BASE_PRICE_PER_1000) * 100;
      expect(p.savingsPct).toBeLessThanOrEqual(actual);
    }
  });

  it('ярлык скидки кратен пяти', () => {
    for (const p of RUB_PACKAGES) {
      if (p.savingsPct === undefined) continue;
      expect(p.savingsPct % 5).toBe(0);
    }
  });

  it('у базового пакета ярлыка скидки нет', () => {
    expect(RUB_PACKAGES[0].savingsPct).toBeUndefined();
  });

  it('у каждого пакета есть ключ названия и ключ объёма', () => {
    for (const p of RUB_PACKAGES) {
      expect(p.nameKey).toMatch(/^payment\./);
      expect(p.amountKey).toMatch(/^payment\./);
    }
  });

  it('плашка «популярный» ровно одна', () => {
    expect(RUB_PACKAGES.filter((p) => p.popular)).toHaveLength(1);
  });

  it('каждый валютный пакет витрины подписан', () => {
    for (const id of ['pro_usd', 'business_usd', 'maximum_usd']) {
      expect(CRYPTO_NAME_KEY[id]).toBeTruthy();
    }
  });

  // Снят с витрины, но может приехать из кеша старого ответа бэкенда.
  // Тест держит алиас: без него будущий рефакторинг удалит его молча.
  it('снятый с витрины max_usd всё ещё подписан', () => {
    expect(CRYPTO_NAME_KEY.max_usd).toBeTruthy();
  });
});
