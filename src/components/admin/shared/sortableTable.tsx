import React, { useMemo } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { clsx } from 'clsx';

export type Dir = 'asc' | 'desc';
export type SortState<K extends string> = { key: K; dir: Dir } | null;
export type Comparator<T> = (a: T, b: T) => number;

interface SortableThProps<K extends string> {
  sortKey: K;
  state: SortState<K>;
  onSort: (next: SortState<K>) => void;
  align?: 'left' | 'right';
  defaultDir?: Dir;
  className?: string;
  children: React.ReactNode;
}

export function SortableTh<K extends string>({
  sortKey,
  state,
  onSort,
  align = 'left',
  defaultDir = 'desc',
  className,
  children,
}: SortableThProps<K>) {
  const isActive = state?.key === sortKey;
  const dir: Dir | null = isActive ? state!.dir : null;

  const handleClick = () => {
    if (!isActive) {
      onSort({ key: sortKey, dir: defaultDir });
      return;
    }
    if (dir === defaultDir) {
      onSort({ key: sortKey, dir: defaultDir === 'desc' ? 'asc' : 'desc' });
      return;
    }
    onSort(null);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTableCellElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const ariaSort: 'ascending' | 'descending' | 'none' =
    dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none';

  const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ChevronsUpDown;
  const iconClass = isActive ? 'text-forest-600' : 'text-gray-300';
  const labelClass = isActive ? 'text-forest-600 font-semibold' : '';

  return (
    <th
      role="columnheader"
      aria-sort={ariaSort}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      className={clsx(
        'px-4 py-2.5 font-medium cursor-pointer select-none hover:text-forest-600 hover:bg-gray-100 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-300 focus-visible:ring-inset',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      <span
        className={clsx(
          'inline-flex items-center gap-1',
          align === 'right' && 'flex-row-reverse',
          labelClass,
        )}
      >
        <Icon size={12} className={iconClass} aria-hidden="true" />
        <span>{children}</span>
      </span>
    </th>
  );
}

export function useTableSort<T, K extends string>(
  rows: T[],
  state: SortState<K>,
  comparators: Record<K, Comparator<T>>,
): T[] {
  return useMemo(() => {
    if (!state) return rows;
    const cmpFn = comparators[state.key];
    if (!cmpFn) return rows;
    const sign = state.dir === 'desc' ? -1 : 1;
    const indexed = rows.map((row, idx) => ({ row, idx }));
    indexed.sort((a, b) => {
      const result = cmpFn(a.row, b.row);
      if (result !== 0) return result * sign;
      return a.idx - b.idx;
    });
    return indexed.map(x => x.row);
    // comparators intentionally excluded from deps: pure functions, identity-only
    // change shouldn't trigger a re-sort. Consumers may pass inline object literals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state]);
}

export const cmp = {
  num<T>(get: (r: T) => number | null | undefined): Comparator<T> {
    return (a, b) => {
      const av = get(a);
      const bv = get(b);
      const ax = av == null ? -Infinity : av;
      const bx = bv == null ? -Infinity : bv;
      if (ax === bx) return 0;
      if (ax === -Infinity) return -1;
      if (bx === -Infinity) return 1;
      return ax - bx;
    };
  },
  str<T>(get: (r: T) => string | null | undefined): Comparator<T> {
    return (a, b) => (get(a) ?? '').localeCompare(get(b) ?? '', 'ru');
  },
  date<T>(get: (r: T) => string | number | null | undefined): Comparator<T> {
    return (a, b) => {
      const av = get(a);
      const bv = get(b);
      const at = av == null ? NaN : new Date(av).getTime();
      const bt = bv == null ? NaN : new Date(bv).getTime();
      const ax = Number.isFinite(at) ? at : -Infinity;
      const bx = Number.isFinite(bt) ? bt : -Infinity;
      if (ax === bx) return 0;
      if (ax === -Infinity) return -1;
      if (bx === -Infinity) return 1;
      return ax - bx;
    };
  },
};

interface SortSelectProps<K extends string> {
  state: SortState<K>;
  onSort: (next: SortState<K>) => void;
  options: { key: K; dir: Dir; label: string }[];
  className?: string;
}

export function SortSelect<K extends string>({
  state,
  onSort,
  options,
  className,
}: SortSelectProps<K>) {
  const currentValue = state ? `${state.key}|${state.dir}` : '';
  return (
    <select
      value={currentValue}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) { onSort(null); return; }
        const [key, dir] = v.split('|') as [K, Dir];
        onSort({ key, dir });
      }}
      className={clsx(
        'text-sm border border-gray-200 rounded px-2 py-1 bg-white text-gray-700',
        'focus:border-forest-400 focus:ring-1 focus:ring-forest-200 outline-none',
        className,
      )}
    >
      {options.map(o => (
        <option key={`${o.key}|${o.dir}`} value={`${o.key}|${o.dir}`}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
