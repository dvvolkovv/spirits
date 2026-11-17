import { describe, it, expect } from 'vitest';
import { parseContextResetAt, resetDividerIndex, sameResetAt } from './contextReset';

const R = new Date('2026-11-17T00:00:00Z');
const m = (iso: string) => ({ timestamp: new Date(iso) });

describe('parseContextResetAt', () => {
  it('нет поля (старый бэк) — undefined: состояние не трогаем', () => {
    expect(parseContextResetAt(undefined)).toBeUndefined();
  });
  it('null — точки нет', () => { expect(parseContextResetAt(null)).toBeNull(); });
  it('ISO — дата', () => { expect(parseContextResetAt(R.toISOString())?.getTime()).toBe(R.getTime()); });
  it('мусор — точки нет', () => { expect(parseContextResetAt('не дата')).toBeNull(); });
  it('пустая строка — точки нет', () => { expect(parseContextResetAt('')).toBeNull(); });
  it('миллисекунды числом — тоже дата (бэк шлёт ISO, но число однозначно)', () => {
    expect(parseContextResetAt(R.getTime())?.getTime()).toBe(R.getTime());
  });
  it('нечисловое число — точки нет', () => {
    expect(parseContextResetAt(Number.NaN)).toBeNull();
    expect(parseContextResetAt(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it('Date — копия того же момента, миллисекунды не теряются', () => {
    const withMs = new Date('2026-11-17T00:00:00.123Z');
    const parsed = parseContextResetAt(withMs);
    expect(parsed?.getTime()).toBe(withMs.getTime());
    expect(parsed).not.toBe(withMs);
  });
  it('прочие типы — точки нет, даже если строкой выглядят как дата', () => {
    expect(parseContextResetAt(true)).toBeNull();
    expect(parseContextResetAt({})).toBeNull();
    expect(parseContextResetAt([R.toISOString()])).toBeNull();
  });
});

describe('resetDividerIndex', () => {
  it('без точки или без сообщений — черты нет', () => {
    expect(resetDividerIndex([m('2026-11-16T00:00:00Z')], null, false)).toBeNull();
    expect(resetDividerIndex([], R, false)).toBeNull();
  });
  it('перед первым сообщением новее точки', () => {
    expect(resetDividerIndex([m('2026-11-16T00:00:00Z'), m('2026-11-17T01:00:00Z'), m('2026-11-17T02:00:00Z')], R, false)).toBe(1);
  });
  it('новых ещё нет — черта внизу', () => {
    expect(resetDividerIndex([m('2026-11-16T00:00:00Z')], R, false)).toBe(1);
  });
  it('старше точки ничего нет и больше не подгрузить — черты нет', () => {
    expect(resetDividerIndex([m('2026-11-17T01:00:00Z')], R, false)).toBeNull();
  });
  it('старше точки есть на следующих страницах — черта сверху', () => {
    expect(resetDividerIndex([m('2026-11-17T01:00:00Z')], R, true)).toBe(0);
  });
  it('время строкой тоже понимает', () => {
    expect(resetDividerIndex([{ timestamp: '2026-11-16T00:00:00Z' }, { timestamp: '2026-11-17T01:00:00Z' }], R, false)).toBe(1);
  });
  it('сообщение ровно в момент точки — старше её: черта после него', () => {
    expect(resetDividerIndex([m(R.toISOString()), m('2026-11-17T01:00:00Z')], R, false)).toBe(1);
    expect(resetDividerIndex([m(R.toISOString())], R, false)).toBe(1);
  });
  it('битое время новее точки не считается: такое сообщение остаётся над чертой', () => {
    expect(resetDividerIndex([{ timestamp: 'не дата' }], R, false)).toBe(1);
    expect(resetDividerIndex([m('2026-11-16T00:00:00Z'), { timestamp: 'не дата' }, m('2026-11-17T01:00:00Z')], R, false)).toBe(2);
  });
});

describe('sameResetAt', () => {
  it('сравнивает моменты, а не объекты', () => {
    expect(sameResetAt(new Date(R), new Date(R))).toBe(true);
    expect(sameResetAt(null, null)).toBe(true);
    expect(sameResetAt(R, null)).toBe(false);
  });
  it('разные моменты и null с любой стороны — не одно и то же', () => {
    expect(sameResetAt(null, R)).toBe(false);
    expect(sameResetAt(R, new Date(R.getTime() + 1))).toBe(false);
  });
});
