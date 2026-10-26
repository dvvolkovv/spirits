import { describe, it, expect } from 'vitest';
import { isUuid, UUID_RE } from './uuid';

/**
 * Один разбор uuid на четыре места (StudioPage, pendingDestination,
 * productActionBlock, tma/productAction) — находка ревью F2. Сам разбор не
 * новый (четыре копии одной и той же регулярки до этого), тест фиксирует
 * прежнее поведение на новом месте.
 */
describe('isUuid', () => {
  const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  it('настоящий uuid — true', () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
  });

  it('мусор, пустая строка, не-строка — false', () => {
    expect(isUuid('не-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
    // Длина и дефисы на месте, но не hex.
    expect(isUuid('gggggggg-gggg-gggg-gggg-gggggggggggg')).toBe(false);
  });

  it('UUID_RE доступен отдельно — тот же результат', () => {
    expect(UUID_RE.test(ID)).toBe(true);
  });
});
