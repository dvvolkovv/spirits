export type DiffRow = {
  kind: 'same' | 'removed' | 'added';
  left: string | null;
  right: string | null;
};

export function lineDiff(leftText: string, rightText: string): DiffRow[] {
  const left = leftText === '' ? [] : leftText.split('\n');
  const right = rightText === '' ? [] : rightText.split('\n');
  const lcs = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = left[i] === right[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      rows.push({ kind: 'same', left: left[i], right: right[j] });
      i += 1;
      j += 1;
    } else if (i < left.length && (j === right.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      rows.push({ kind: 'removed', left: left[i], right: null });
      i += 1;
    } else {
      rows.push({ kind: 'added', left: null, right: right[j] });
      j += 1;
    }
  }

  return rows;
}
