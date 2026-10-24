// Цена ролика в токенах — зеркало backend video.dto.ts (computeVeoQuote,
// computeVeoConcatQuote, needsVeoConcat). Держать в паре: цена на кнопке
// должна совпадать со списанной.
//
// 24.10.2026: Veo 3.1 снят Google, движок — Gemini Omni с одной моделью;
// по решению владельца тариф Standard слит с Fast.
const BASE_SEC = 8;
const EXTEND_SEC = 7;
const PRICE = { base: 90000, ext: 63000 };
// Omni продлевает ролик не дальше 40 с суммарно.
const MAX_CHAIN_SEC = 40;

/**
 * Собирается ли ролик из независимых 8с-клипов вместо цепочки продлений:
 * вертикаль длиннее 8с и горизонталь, чья цепочка не помещается в 40 с.
 */
export function needsVeoConcat(aspect: '16:9' | '9:16', lengthSec: number): boolean {
  if (aspect === '9:16') return lengthSec > BASE_SEC;
  const extendCount = Math.ceil(Math.max(0, lengthSec - BASE_SEC) / EXTEND_SEC);
  return BASE_SEC + extendCount * EXTEND_SEC > MAX_CHAIN_SEC;
}

export function veoCostFor(lengthSec: number, aspect: '16:9' | '9:16' = '9:16'): number {
  // Склейка: каждый клип — полная база (N×base). Иначе база + продления по 7с.
  if (needsVeoConcat(aspect, lengthSec)) return Math.ceil(lengthSec / BASE_SEC) * PRICE.base;
  const extendCount = Math.ceil(Math.max(0, lengthSec - BASE_SEC) / EXTEND_SEC);
  return PRICE.base + extendCount * PRICE.ext;
}
