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
});
