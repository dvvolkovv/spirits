import { describe, it, expect } from 'vitest';
import { needsVeoConcat, veoCostFor } from './videoPricing';

// Зеркало backend video.dto.ts: цена на кнопке обязана совпадать со списанной.
describe('videoPricing', () => {
  it.each([
    ['9:16', 8, false],
    ['9:16', 12, true],
    ['16:9', 8, false],
    ['16:9', 32, false],
    ['16:9', 36, false],   // 8 + 4×7 = 36 — цепочка помещается в 40 с Omni
    ['16:9', 37, true],
    ['16:9', 48, true],
    ['16:9', 60, true],
  ] as const)('%s, %i с → склейка: %s', (aspect, sec, expected) => {
    expect(needsVeoConcat(aspect, sec)).toBe(expected);
  });

  it('8 с стоят базу в любом формате', () => {
    expect(veoCostFor(8, '9:16')).toBe(90_000);
    expect(veoCostFor(8, '16:9')).toBe(90_000);
  });

  it('цепочка продлений: база + 63k за каждые 7 с', () => {
    expect(veoCostFor(24, '16:9')).toBe(90_000 + 3 * 63_000);
    expect(veoCostFor(32, '16:9')).toBe(90_000 + 4 * 63_000);
  });

  it('склейка: N × база — вертикаль и горизонталь длиннее 36 с', () => {
    expect(veoCostFor(24, '9:16')).toBe(3 * 90_000);
    expect(veoCostFor(48, '16:9')).toBe(6 * 90_000);
    expect(veoCostFor(60, '16:9')).toBe(8 * 90_000);
  });
});
