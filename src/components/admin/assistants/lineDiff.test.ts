import { describe, expect, it } from 'vitest';
import { lineDiff } from './lineDiff';

describe('lineDiff', () => {
  it('marks a replacement as removed followed by added', () => {
    expect(lineDiff('one\ntwo\nthree', 'one\nchanged\nthree')).toEqual([
      { kind: 'same', left: 'one', right: 'one' },
      { kind: 'removed', left: 'two', right: null },
      { kind: 'added', left: null, right: 'changed' },
      { kind: 'same', left: 'three', right: 'three' },
    ]);
  });

  it('adds every line when the left side is empty', () => {
    expect(lineDiff('', 'new')).toEqual([
      { kind: 'added', left: null, right: 'new' },
    ]);
    expect(lineDiff('', 'first\nsecond')).toEqual([
      { kind: 'added', left: null, right: 'first' },
      { kind: 'added', left: null, right: 'second' },
    ]);
  });

  it('removes every line when the right side is empty', () => {
    expect(lineDiff('first\nsecond', '')).toEqual([
      { kind: 'removed', left: 'first', right: null },
      { kind: 'removed', left: 'second', right: null },
    ]);
  });

  it('returns no rows when both sides are empty', () => {
    expect(lineDiff('', '')).toEqual([]);
  });

  it('keeps matching lines across multiple edits', () => {
    expect(lineDiff('a\nb\nc\nd', 'a\nx\nc\nd\ne')).toEqual([
      { kind: 'same', left: 'a', right: 'a' },
      { kind: 'removed', left: 'b', right: null },
      { kind: 'added', left: null, right: 'x' },
      { kind: 'same', left: 'c', right: 'c' },
      { kind: 'same', left: 'd', right: 'd' },
      { kind: 'added', left: null, right: 'e' },
    ]);
  });

  it('chooses removal before addition on an LCS tie', () => {
    expect(lineDiff('a\nb', 'b\na')).toEqual([
      { kind: 'removed', left: 'a', right: null },
      { kind: 'same', left: 'b', right: 'b' },
      { kind: 'added', left: null, right: 'a' },
    ]);
  });

  it('uses bounded prefix/suffix fallback rows above the cell budget', () => {
    const prefix = Array.from({ length: 100 }, (_, i) => `prefix-${i}`);
    const suffix = Array.from({ length: 100 }, (_, i) => `suffix-${i}`);
    const leftMiddle = [
      'shared',
      ...Array.from({ length: 999 }, (_, i) => `left-${i}`),
    ];
    const rightMiddle = [
      ...Array.from({ length: 999 }, (_, i) => `right-${i}`),
      'shared',
    ];
    const rows = lineDiff(
      [...prefix, ...leftMiddle, ...suffix].join('\n'),
      [...prefix, ...rightMiddle, ...suffix].join('\n'),
    );

    expect(rows).toHaveLength(2200);
    expect(rows.filter((row) => row.kind === 'same')).toHaveLength(200);
    expect(rows.filter((row) => row.kind === 'removed')).toHaveLength(1000);
    expect(rows.filter((row) => row.kind === 'added')).toHaveLength(1000);
    expect(rows[0]).toEqual({ kind: 'same', left: 'prefix-0', right: 'prefix-0' });
    expect(rows.at(-1)).toEqual({ kind: 'same', left: 'suffix-99', right: 'suffix-99' });
  });
});
