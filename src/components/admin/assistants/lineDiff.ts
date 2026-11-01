export type DiffRow = {
  kind: 'same' | 'removed' | 'added';
  left: string | null;
  right: string | null;
};

const MAX_LCS_CELLS = 1_000_000;

function linearDiff(left: string[], right: string[]): DiffRow[] {
  let prefixLength = 0;
  while (
    prefixLength < left.length &&
    prefixLength < right.length &&
    left[prefixLength] === right[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < left.length - prefixLength &&
    suffixLength < right.length - prefixLength &&
    left[left.length - 1 - suffixLength] === right[right.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const leftEnd = left.length - suffixLength;
  const rightEnd = right.length - suffixLength;
  const rows: DiffRow[] = [];

  for (let i = 0; i < prefixLength; i += 1) {
    rows.push({ kind: 'same', left: left[i], right: right[i] });
  }
  for (let i = prefixLength; i < leftEnd; i += 1) {
    rows.push({ kind: 'removed', left: left[i], right: null });
  }
  for (let j = prefixLength; j < rightEnd; j += 1) {
    rows.push({ kind: 'added', left: null, right: right[j] });
  }
  for (let i = 0; i < suffixLength; i += 1) {
    rows.push({ kind: 'same', left: left[leftEnd + i], right: right[rightEnd + i] });
  }

  return rows;
}

export function lineDiff(leftText: string, rightText: string): DiffRow[] {
  const left = leftText === '' ? [] : leftText.split('\n');
  const right = rightText === '' ? [] : rightText.split('\n');

  if ((left.length + 1) * (right.length + 1) > MAX_LCS_CELLS) {
    return linearDiff(left, right);
  }

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
