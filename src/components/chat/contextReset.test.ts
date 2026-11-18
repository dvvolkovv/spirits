import { describe, it, expect } from 'vitest';
import { markFromHistory, mergePolledReset, parseContextResetAt, resetDividerIndex, type ResetMark } from './contextReset';

const R = new Date('2026-11-17T00:00:00Z');
const m = (id: string, iso: string) => ({ id, timestamp: new Date(iso) });
// Метка с опроса истории — без якоря, только время базы.
const polledMark = (at: Date): ResetMark => ({ at });

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

describe('resetDividerIndex: по времени (точка с опроса, без якоря)', () => {
  it('без метки или без сообщений — черты нет', () => {
    expect(resetDividerIndex([m('s1', '2026-11-16T00:00:00Z')], null)).toBeNull();
    expect(resetDividerIndex([], polledMark(R))).toBeNull();
  });
  it('битое время точки — черты нет', () => {
    expect(resetDividerIndex([m('s1', '2026-11-16T00:00:00Z')], polledMark(new Date('не дата')))).toBeNull();
  });
  it('перед первым сообщением новее точки', () => {
    const msgs = [m('s1', '2026-11-16T00:00:00Z'), m('s2', '2026-11-17T01:00:00Z'), m('s3', '2026-11-17T02:00:00Z')];
    expect(resetDividerIndex(msgs, polledMark(R))).toBe(1);
  });
  it('новых ещё нет — черта внизу', () => {
    expect(resetDividerIndex([m('s1', '2026-11-16T00:00:00Z')], polledMark(R))).toBe(1);
  });
  it('первое же сообщение новее точки — черты нет, даже если выше есть непрогруженные страницы', () => {
    // Что старшие сообщения лежат на следующих страницах — допущение: черта
    // встала бы наугад и прыгала бы при подгрузке. Появится на своём месте,
    // когда подгрузится нужная страница.
    expect(resetDividerIndex([m('s1', '2026-11-17T01:00:00Z')], polledMark(R))).toBeNull();
  });
  it('время строкой тоже понимает', () => {
    const msgs = [{ id: 's1', timestamp: '2026-11-16T00:00:00Z' }, { id: 's2', timestamp: '2026-11-17T01:00:00Z' }];
    expect(resetDividerIndex(msgs, polledMark(R))).toBe(1);
  });
  it('сообщение ровно в момент точки — старше её: черта после него', () => {
    expect(resetDividerIndex([m('s1', R.toISOString()), m('s2', '2026-11-17T01:00:00Z')], polledMark(R))).toBe(1);
    expect(resetDividerIndex([m('s1', R.toISOString())], polledMark(R))).toBe(1);
  });
  it('битое время новее точки не считается: такое сообщение остаётся над чертой', () => {
    expect(resetDividerIndex([{ id: 's1', timestamp: 'не дата' }], polledMark(R))).toBe(1);
    const msgs = [m('s1', '2026-11-16T00:00:00Z'), { id: 's2', timestamp: 'не дата' }, m('s3', '2026-11-17T01:00:00Z')];
    expect(resetDividerIndex(msgs, polledMark(R))).toBe(2);
  });
});

describe('resetDividerIndex: с якорем (точка поставлена в этой вкладке)', () => {
  it('часы клиента отстают: сообщения после якоря — под чертой, хоть их время и раньше точки', () => {
    const msgs = [
      m('s1', '2026-11-16T12:00:00Z'),
      m('loc-1', '2026-11-16T23:58:00Z'), // последнее до нажатия
      m('loc-2', '2026-11-16T23:59:00Z'), // после нажатия, но часы на 2 минуты позади базы
    ];
    expect(resetDividerIndex(msgs, { at: R, afterId: 'loc-1' })).toBe(2);
  });
  it('часы клиента спешат: сообщение до нажатия — над чертой, хоть его время и позже точки', () => {
    const msgs = [
      m('loc-1', '2026-11-17T00:05:00Z'), // до нажатия, часы на 5 минут впереди базы
      m('loc-2', '2026-11-17T00:10:00Z'),
    ];
    expect(resetDividerIndex(msgs, { at: R, afterId: 'loc-1' })).toBe(1);
  });
  it('якорь — последнее сообщение: новых ещё нет, черта внизу', () => {
    expect(resetDividerIndex([m('loc-1', '2026-11-17T00:05:00Z')], { at: R, afterId: 'loc-1' })).toBe(1);
  });
  it('якорь не найден (ленту перечитали, перегенерация срезала хвост) — по времени', () => {
    const msgs = [m('s1', '2026-11-16T00:00:00Z'), m('s2', '2026-11-17T01:00:00Z')];
    expect(resetDividerIndex(msgs, { at: R, afterId: 'loc-gone' })).toBe(1);
    expect(resetDividerIndex([m('s2', '2026-11-17T01:00:00Z')], { at: R, afterId: 'loc-gone' })).toBeNull();
  });
  it('afterId: null — лента была пуста при нажатии: всё в ней после точки, черты нет', () => {
    // Время раньше точки — отстающие часы; якорь важнее.
    expect(resetDividerIndex([m('loc-1', '2026-11-16T23:59:00Z')], { at: R, afterId: null })).toBeNull();
    expect(resetDividerIndex([m('loc-1', '2026-11-17T00:01:00Z')], { at: R, afterId: null })).toBeNull();
  });
});

describe('mergePolledReset', () => {
  const anchored: ResetMark = { at: R, afterId: 'loc-1' };

  it('в ответе нет точки (null — сбой чтения, undefined — старый бэк) — прежняя метка', () => {
    expect(mergePolledReset(anchored, null)).toBe(anchored);
    expect(mergePolledReset(anchored, undefined)).toBe(anchored);
    expect(mergePolledReset(null, null)).toBeNull();
    expect(mergePolledReset(null, undefined)).toBeNull();
  });
  it('та же точка — прежняя метка тем же объектом: якорь цел, перерисовки нет', () => {
    expect(mergePolledReset(anchored, new Date(R))).toBe(anchored);
  });
  it('старшая точка — запоздалый ответ опроса: прежняя метка', () => {
    expect(mergePolledReset(anchored, new Date(R.getTime() - 60_000))).toBe(anchored);
  });
  it('новая точка (с другого устройства) — без якоря', () => {
    const later = new Date(R.getTime() + 60_000);
    expect(mergePolledReset(anchored, later)).toStrictEqual({ at: later });
  });
  it('первая точка — без якоря', () => {
    expect(mergePolledReset(null, R)).toStrictEqual({ at: R });
  });
  it('битая дата — прежняя метка', () => {
    expect(mergePolledReset(anchored, new Date('не дата'))).toBe(anchored);
    expect(mergePolledReset(null, new Date('не дата'))).toBeNull();
  });
});

describe('markFromHistory: точка из первой загрузки истории', () => {
  it('все сообщения не новее точки — якорь на последнем серверном', () => {
    const msgs = [m('s1', '2026-11-16T12:00:00Z'), m('s2', '2026-11-16T23:00:00Z')];
    expect(markFromHistory(msgs, R)).toStrictEqual({ at: R, afterId: 's2' });
  });
  it('сообщение ровно в момент точки — старше её: якорь на нём', () => {
    const msgs = [m('s1', '2026-11-16T12:00:00Z'), m('s2', R.toISOString())];
    expect(markFromHistory(msgs, R)).toStrictEqual({ at: R, afterId: 's2' });
  });
  it('хоть одно сообщение новее точки — без якоря: черту ставит время базы', () => {
    const msgs = [m('s1', '2026-11-16T12:00:00Z'), m('s2', '2026-11-17T00:01:00Z')];
    expect(markFromHistory(msgs, R)).toStrictEqual({ at: R });
  });
  it('лента пуста — всё, что придёт, после точки: черты нет', () => {
    expect(markFromHistory([], R)).toStrictEqual({ at: R, afterId: null });
  });
  it('битое время сообщения новее не считается — как в resetDividerIndex', () => {
    const msgs = [m('s1', '2026-11-16T12:00:00Z'), { id: 's2', timestamp: new Date('не дата') }];
    expect(markFromHistory(msgs, R)).toStrictEqual({ at: R, afterId: 's2' });
  });
  it('время строкой тоже понимает', () => {
    expect(markFromHistory([{ id: 's1', timestamp: '2026-11-17T00:01:00Z' }], R)).toStrictEqual({ at: R });
    expect(markFromHistory([{ id: 's1', timestamp: '2026-11-16T00:01:00Z' }], R)).toStrictEqual({ at: R, afterId: 's1' });
  });
  it('битая точка — без якоря (resetDividerIndex её и так не рисует)', () => {
    const bad = new Date('не дата');
    expect(markFromHistory([m('s1', '2026-11-16T12:00:00Z')], bad)).toStrictEqual({ at: bad });
  });
  it('после перезагрузки новое сообщение с отстающими часами клиента — под чертой', () => {
    // Черта внизу, а часы клиента на 2 минуты позади базы: без якоря новое
    // сообщение встало бы над чертой до следующей перезагрузки.
    const loaded = [m('s1', '2026-11-16T12:00:00Z'), m('s2', '2026-11-16T23:59:30Z')];
    const mark = markFromHistory(loaded, R);
    expect(resetDividerIndex(loaded, mark)).toBe(2);
    const afterSend = [...loaded, m('loc-1', '2026-11-16T23:59:50Z')];
    expect(resetDividerIndex(afterSend, mark)).toBe(2);
  });
});
