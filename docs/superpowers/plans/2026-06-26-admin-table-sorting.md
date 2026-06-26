# Admin Table Sorting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить кликабельную сортировку по заголовкам колонок во все аналитические таблицы админки (11 таблиц) и SortSelect для двух списков карточек (VmmView, VpmView), через единый компонент `SortableTh` + хук `useTableSort`.

**Architecture:** Один общий модуль `src/components/admin/shared/sortableTable.tsx` со всеми примитивами. Только клиентская сортировка (AdminTokensView мигрирует с серверного `?sort=` на клиент). Состояние сортировки — локальный `useState` каждой вьюхи, не персистится.

**Tech Stack:** React 18 + TypeScript, Tailwind, `lucide-react` для иконок (`ArrowUp`, `ArrowDown`, `ChevronsUpDown`). Тест-раннер в проекте отсутствует — верификация через `pnpm lint` + `pnpm build` + ручной smoke.

**Спек:** [docs/superpowers/specs/2026-06-26-admin-table-sorting-design.md](../specs/2026-06-26-admin-table-sorting-design.md).

---

## File Structure

**Create:**
- `src/components/admin/shared/sortableTable.tsx` — `SortableTh`, `useTableSort`, `cmp.{num,str,date}`, `SortSelect`, типы `Dir`, `SortState<K>`, `Comparator<T>`.

**Modify (11 файлов):**
- `src/components/admin/AdminUsersView.tsx`
- `src/components/admin/AdminTokensView.tsx`
- `src/components/admin/AdminPaymentsView.tsx`
- `src/components/admin/AdsView.tsx`
- `src/components/admin/UserActivityDrawer.tsx`
- `src/components/admin/monitoring/MonitoringAttributionView.tsx`
- `src/components/admin/monitoring/MonitoringChurnView.tsx`
- `src/components/admin/monitoring/MonitoringNetworkingView.tsx`
- `src/components/admin/monitoring/MonitoringQualityView.tsx`
- `src/components/admin/VmmView.tsx`
- `src/components/admin/VpmView.tsx`

---

## Task 1: Shared `sortableTable` module

**Files:**
- Create: `src/components/admin/shared/sortableTable.tsx`

- [ ] **Step 1: Создать файл с полной реализацией**

```tsx
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
  const ariaLabel =
    dir === 'asc' ? 'Сортировка по возрастанию'
    : dir === 'desc' ? 'Сортировка по убыванию'
    : 'Сортировка отключена';

  return (
    <th
      role="columnheader"
      aria-sort={ariaSort}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      className={clsx(
        'px-4 py-2.5 font-medium cursor-pointer select-none hover:text-forest-600 hover:bg-gray-100 transition-colors',
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
        <Icon size={12} className={iconClass} aria-label={ariaLabel} />
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
  }, [rows, state, comparators]);
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
```

> **Замечание для имплементатора:**
> - Логика `null`-обработки в `cmp.num`/`cmp.date`: возвращаем `-1` если `a` это `-Infinity`, `+1` если `b`. Это значит «`null` всегда меньше любого числа». Для `desc` это даёт нужный эффект (null уходит в самый низ); для `asc` null окажется наверху — это ок по спеку.
> - Хедер фон `hover:bg-gray-100` (а не `hover:bg-gray-50`) сделан темнее, потому что в большинстве вьюх `<thead>` уже `bg-gray-50`.

- [ ] **Step 2: Прогнать lint и build**

Run: `pnpm lint && pnpm build`
Expected: zero errors, dist собран.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/shared/sortableTable.tsx
git commit -m "feat(admin/shared): SortableTh + useTableSort + SortSelect

Общий модуль для сортировок в админских таблицах:
- SortableTh: клик по <th> → переключение dir со стрелкой и aria-sort
- useTableSort: стабильная сортировка через useMemo с tie-break по индексу
- cmp.{num,str,date}: фабрики компараторов с обработкой null/undefined
- SortSelect: <select> для карточек (VmmView/VpmView)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Proof-of-concept — `MonitoringQualityView`

**Files:**
- Modify: `src/components/admin/monitoring/MonitoringQualityView.tsx`

- [ ] **Step 1: Прочитать файл и найти `<th>` таблицы «Ассистенты»**

Прочитать `MonitoringQualityView.tsx` целиком. Найти `<thead>` с колонками: Ассистент, Категория, Сообщений, Юзеров, Средн. ответ, p95, Ср. на сессию, % ошибок.

Записать: точное имя поля каждой row-структуры (вероятно `messages`, `users`, `avg_response_ms`/`avg_response`, `p95_ms`/`p95`, `avg_per_session`, `error_rate` — конкретные имена сверить с типом строки).

- [ ] **Step 2: Добавить импорт и состояние сортировки**

В импорты добавить:
```tsx
import { SortableTh, useTableSort, cmp, SortState } from '../shared/sortableTable';
```

Внутри компонента, после существующих `useState`, добавить:
```tsx
type QualitySortKey = 'messages' | 'users' | 'avg_response' | 'p95' | 'avg_per_session' | 'error_rate';
const [sort, setSort] = useState<SortState<QualitySortKey>>({ key: 'messages', dir: 'desc' });
```

(Если имя поля «Сообщений» в типе строки другое — заменить `'messages'` на реальное.)

- [ ] **Step 3: Создать компараторы и обернуть массив строк**

Перед `return`:
```tsx
const sortedRows = useTableSort(rows, sort, {
  messages: cmp.num(r => r.messages),
  users: cmp.num(r => r.users),
  avg_response: cmp.num(r => r.avg_response),
  p95: cmp.num(r => r.p95),
  avg_per_session: cmp.num(r => r.avg_per_session),
  error_rate: cmp.num(r => r.error_rate),
});
```

(Заменить `rows` на реальное имя массива; заменить геттеры на реальные имена полей.)

Поменять `{rows.map(...)}` в `<tbody>` на `{sortedRows.map(...)}`.

- [ ] **Step 4: Заменить `<th>` на `<SortableTh>`**

Несортируемые («Ассистент», «Категория») остаются обычными `<th className="text-left px-4 py-2.5 font-medium">…</th>`.

Сортируемые превратить в:
```tsx
<SortableTh sortKey="messages" state={sort} onSort={setSort} align="right">Сообщений</SortableTh>
<SortableTh sortKey="users" state={sort} onSort={setSort} align="right">Юзеров</SortableTh>
<SortableTh sortKey="avg_response" state={sort} onSort={setSort} align="right">Средн. ответ</SortableTh>
<SortableTh sortKey="p95" state={sort} onSort={setSort} align="right">p95</SortableTh>
<SortableTh sortKey="avg_per_session" state={sort} onSort={setSort} align="right">Ср. на сессию</SortableTh>
<SortableTh sortKey="error_rate" state={sort} onSort={setSort} align="right">% ошибок</SortableTh>
```

- [ ] **Step 5: Lint + build + ручной smoke**

```bash
pnpm lint && pnpm build
pnpm dev
```

В браузере: открыть `/admin?tab=monitoring`, перейти на под-вкладку «Качество». Клик по каждому из 6 заголовков — стрелка переключается, строки переупорядочиваются. Третий клик по одной колонке — сбрасывает (стрелка становится бледной).

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/monitoring/MonitoringQualityView.tsx
git commit -m "feat(admin/monitoring): кликабельная сортировка в таблице качества ассистентов

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `AdminUsersView`

**Files:**
- Modify: `src/components/admin/AdminUsersView.tsx`

- [ ] **Step 1: Добавить импорт shared-модуля**

В существующие импорты добавить:
```tsx
import { SortableTh, useTableSort, cmp, SortState } from './shared/sortableTable';
```

- [ ] **Step 2: Заменить старый `type SortBy` и `useState` на новый**

Удалить:
```tsx
type SortBy = 'spent_period' | 'balance' | 'registered_at';
```

И заменить:
```tsx
const [sortBy, setSortBy] = useState<SortBy>('spent_period');
```

На:
```tsx
type UserSortKey = 'registered_at' | 'last_active' | 'spent_period' | 'balance' | 'paid_count';
const [sort, setSort] = useState<SortState<UserSortKey>>({ key: 'spent_period', dir: 'desc' });
```

- [ ] **Step 3: Переписать `useMemo` filteredUsers — оставить фильтр, заменить сортировку**

Текущий `useMemo` (строки 131–148) меняется так:
```tsx
const filteredUsers = useMemo(() => {
  if (!users) return [] as UserRow[];
  const q = search.trim().replace(/\D/g, '');
  if (q.length === 0) return users.users;
  return users.users.filter(u => (u.phone || '').replace(/\D/g, '').includes(q));
}, [users, search]);

const sortedUsers = useTableSort(filteredUsers, sort, {
  registered_at: cmp.date(u => u.registered_at),
  last_active: cmp.date(u => u.last_active),
  spent_period: cmp.num(u => u.spent_period),
  balance: cmp.num(u => u.balance),
  paid_count: cmp.num(u => u.paid_count),
});
```

В `<tbody>` поменять `filteredUsers.map(...)` на `sortedUsers.map(...)`.

В строке-счётчике (`{filteredUsers.length} из {users?.users.length ?? 0}`) тоже `sortedUsers.length` (логически эквивалентно — длина не меняется, но единообразно).

- [ ] **Step 4: Удалить блок кнопок-чипсов сортировки (строки 349–369)**

Удалить весь `<div className="flex items-center gap-2 flex-wrap">` со «Сортировка:» и тремя кнопками `spent_period`/`balance`/`registered_at`. Остаётся только поиск и счётчик.

После удаления `<div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">` оборачивает только два элемента: поиск и счётчик. Класс `flex-wrap` оставить.

- [ ] **Step 5: Превратить нужные `<th>` в `<SortableTh>`**

В `<thead>` (строки 388–404) поменять:

`#` и `Телефон` и `Реферал` — остаются обычными `<th>`.

`Зарегистрирован`:
```tsx
<SortableTh sortKey="registered_at" state={sort} onSort={setSort} defaultDir="desc">
  <span className="inline-flex items-center gap-1">
    <Calendar className="w-3 h-3" />
    Зарегистрирован
  </span>
</SortableTh>
```

`Последняя активность`:
```tsx
<SortableTh sortKey="last_active" state={sort} onSort={setSort} defaultDir="desc">Последняя активность</SortableTh>
```

`Списано за 30 дн`:
```tsx
<SortableTh sortKey="spent_period" state={sort} onSort={setSort} align="right">Списано за 30 дн</SortableTh>
```

`Баланс`:
```tsx
<SortableTh sortKey="balance" state={sort} onSort={setSort} align="right">Баланс</SortableTh>
```

`Платежей`:
```tsx
<SortableTh sortKey="paid_count" state={sort} onSort={setSort} align="right">Платежей</SortableTh>
```

- [ ] **Step 6: Lint + build + ручной smoke**

```bash
pnpm lint && pnpm build
pnpm dev
```

В браузере: `/admin?tab=users`. Проверить:
- блок кнопок-чипсов исчез;
- по умолчанию таблица отсортирована по «Списано за 30 дн» ↓ (стрелка ↓ зелёная);
- клик по «Баланс» → стрелка ↓ зелёная на «Баланс», бледная на остальных;
- второй клик → ↑;
- третий клик → возврат к API-порядку (все стрелки бледные);
- смена периода/поиск сохраняют сортировку.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/AdminUsersView.tsx
git commit -m "feat(admin/users): кликабельная сортировка по заголовкам, убрать чипсы

Сортировка теперь через SortableTh по 5 колонкам: Зарегистрирован,
Последняя активность, Списано за 30 дн, Баланс, Платежей. Старый
блок кнопок-чипсов под фильтром удалён, дефолт (Списано ↓) сохранён
в initial state useState.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `AdminTokensView` (миграция с серверного `?sort=` на клиент)

**Files:**
- Modify: `src/components/admin/AdminTokensView.tsx`

- [ ] **Step 1: Добавить импорт**

```tsx
import { SortableTh, useTableSort, cmp, SortState } from './shared/sortableTable';
```

- [ ] **Step 2: Удалить старый `type SortBy` и `useState<SortBy>`**

Удалить:
```tsx
type SortBy = 'balance' | 'spent_period';
const [sortBy, setSortBy] = useState<SortBy>('balance');
```

Добавить:
```tsx
type TokenSortKey = 'balance' | 'spent_period' | 'last_active' | 'paid_count';
const [sort, setSort] = useState<SortState<TokenSortKey>>({ key: 'spent_period', dir: 'desc' });
```

- [ ] **Step 3: Убрать `?sort=` из URL и `sortBy` из зависимостей useEffect**

Поменять строку запроса (строка ~94):
```tsx
apiClient.get(`/webhook/admin/users/tokens?hours=${periodHours}&limit=200`),
```

Поменять `useEffect`:
```tsx
useEffect(() => { load(); }, [bucket, days]); // eslint-disable-line
```

- [ ] **Step 4: Клиентская сортировка через `useTableSort`**

Найти место рендера таблицы. Перед ним добавить:
```tsx
const sortedRows = useTableSort(usersData?.users ?? [], sort, {
  balance: cmp.num(u => u.balance),
  spent_period: cmp.num(u => u.spent_period),
  last_active: cmp.date(u => u.last_active),
  paid_count: cmp.num(u => u.paid_count),
});
```

В `<tbody>` поменять `usersData.users.map(...)` на `sortedRows.map(...)`.

- [ ] **Step 5: Удалить кнопки-чипсы сортировки**

Найти блок (~строки 270–295) с кнопками `balance` / `spent_period` (вокруг `setSortBy(o.id)`). Удалить весь div с этими чипсами и текст «Сортировка:».

Заодно поправить статус-текст (строка ~297), который раньше показывал `{sortBy === 'spent_period' ? ` активных ${periodLabel}` : ''}` — теперь sortBy нет; убрать это условие, оставить просто `{usersData?.users.length ?? 0} пользователей`.

- [ ] **Step 6: Превратить `<th>` в `<SortableTh>` для 4 колонок**

В таблице балансов:
- `Телефон`, `Реферал` — обычный `<th>`.
- `Баланс`: `<SortableTh sortKey="balance" state={sort} onSort={setSort} align="right">Баланс</SortableTh>`
- `Списано` (период): `<SortableTh sortKey="spent_period" state={sort} onSort={setSort} align="right">Списано</SortableTh>` (текст лейбла как сейчас — может содержать periodLabel).
- `Последняя активность`: `<SortableTh sortKey="last_active" state={sort} onSort={setSort} defaultDir="desc">Последняя активность</SortableTh>`
- `Платежей`: `<SortableTh sortKey="paid_count" state={sort} onSort={setSort} align="right">Платежей</SortableTh>`

- [ ] **Step 7: Lint + build + smoke**

```bash
pnpm lint && pnpm build
pnpm dev
```

В DevTools Network вкладке убедиться, что `/webhook/admin/users/tokens` вызывается БЕЗ `sort=` параметра. Клики по заголовкам не вызывают refetch. Смена периода (`?hours=`) — вызывает.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/AdminTokensView.tsx
git commit -m "feat(admin/tokens): клиентская сортировка по заголовкам

Перевод AdminTokensView с серверного ?sort= на клиентский useTableSort.
Все ~200 строк уже грузятся одним пакетом, refetch ради сортировки не нужен.
Кнопки-чипсы заменены на кликабельные заголовки таблицы.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `AdminPaymentsView`

**Files:**
- Modify: `src/components/admin/AdminPaymentsView.tsx`

- [ ] **Step 1: Прочитать файл, найти таблицу платежей**

Найти `<thead>` с колонками: Телефон, Сумма, Токены, Реферал, Статус, Дата. Записать имена полей строки (вероятно `amount`/`amount_rub`, `tokens`, `status`, `created_at`/`paid_at` — сверить с реальным типом).

- [ ] **Step 2: Импорт + состояние + компараторы**

```tsx
import { SortableTh, useTableSort, cmp, SortState } from './shared/sortableTable';

type PaymentSortKey = 'amount' | 'tokens' | 'status' | 'created_at';
const [sort, setSort] = useState<SortState<PaymentSortKey>>({ key: 'created_at', dir: 'desc' });

const sortedPayments = useTableSort(filteredPayments, sort, {
  amount: cmp.num(p => p.amount), // подставить реальное имя
  tokens: cmp.num(p => p.tokens),
  status: cmp.str(p => p.status),
  created_at: cmp.date(p => p.created_at), // подставить реальное имя
});
```

Заменить рендер `filteredPayments.map(...)` на `sortedPayments.map(...)`.

- [ ] **Step 3: Заменить `<th>` на `<SortableTh>`**

`Телефон`, `Реферал` — обычный `<th>`. Остальные:
```tsx
<SortableTh sortKey="amount" state={sort} onSort={setSort} align="right">Сумма</SortableTh>
<SortableTh sortKey="tokens" state={sort} onSort={setSort} align="right">Токены</SortableTh>
<SortableTh sortKey="status" state={sort} onSort={setSort} defaultDir="asc">Статус</SortableTh>
<SortableTh sortKey="created_at" state={sort} onSort={setSort} defaultDir="desc">Дата</SortableTh>
```

- [ ] **Step 4: Lint + build + smoke**

```bash
pnpm lint && pnpm build
pnpm dev
```

`/admin?tab=payments` — клик по «Сумма», «Дата», «Статус». Смена фильтра по статусу не теряет сортировку.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/AdminPaymentsView.tsx
git commit -m "feat(admin/payments): кликабельная сортировка в таблице платежей

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `AdsView`

**Files:**
- Modify: `src/components/admin/AdsView.tsx`

- [ ] **Step 1: Прочитать файл, найти таблицу объявлений в кампании**

Найти `<table>` внутри `c.creatives.map(...)`. Записать имена полей: `impressions`, `clicks`, `ctr`, `cpc`, `spend`, `registrations`, `payers`, `cpr` (сверить).

- [ ] **Step 2: Сортировка работает на уровне ОДНОЙ кампании**

Поскольку таблица рендерится внутри `.map` по кампаниям, состояние сортировки **общее для всех кампаний** (одно `useState` на уровне `AdsView`), но `useTableSort` вызывается отдельно для каждого `c.creatives` через мемоизованный helper.

Подход:
```tsx
import { SortableTh, useTableSort, cmp, SortState } from './shared/sortableTable';

type AdSortKey = 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'spend' | 'registrations' | 'payers' | 'cpr';
const [sort, setSort] = useState<SortState<AdSortKey>>({ key: 'spend', dir: 'desc' });

const adComparators = useMemo(() => ({
  impressions: cmp.num<Creative>(c => c.impressions),
  clicks: cmp.num<Creative>(c => c.clicks),
  ctr: cmp.num<Creative>(c => c.ctr),
  cpc: cmp.num<Creative>(c => c.cpc),
  spend: cmp.num<Creative>(c => c.spend),
  registrations: cmp.num<Creative>(c => c.registrations),
  payers: cmp.num<Creative>(c => c.payers),
  cpr: cmp.num<Creative>(c => c.cpr),
}), []);
```

Заменить `Creative` на реальное имя типа строки креатива.

Вместо `c.creatives.map(...)` использовать helper-компонент:
```tsx
const CreativeRows: React.FC<{ creatives: Creative[] }> = ({ creatives }) => {
  const sorted = useTableSort(creatives, sort, adComparators);
  return <>{sorted.map((cr, idx) => (
    /* существующая разметка <tr> */
  ))}</>;
};
```

И в основном JSX: `<tbody><CreativeRows creatives={c.creatives} /></tbody>`.

(Альтернатива — вынести `useTableSort` в отдельный компонент-таблицу. Но helper проще и не ломает существующий layout.)

- [ ] **Step 3: Заменить `<th>` на `<SortableTh>`**

`Объявление`, `Статус` — обычный `<th>`. Остальные 8 — `<SortableTh align="right">`.

- [ ] **Step 4: Lint + build + smoke**

`/admin?tab=ads` — клик по «Расход», «Регистрации», «CPR». Каждая таблица в каждой кампании сортируется одновременно по одному ключу.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/AdsView.tsx
git commit -m "feat(admin/ads): кликабельная сортировка объявлений в кампании

Сортировка общая для всех креативов всех кампаний (один useState).
Каждая под-таблица сортируется через свой useTableSort с общими компараторами.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `UserActivityDrawer` — таблица «По ассистентам»

**Files:**
- Modify: `src/components/admin/UserActivityDrawer.tsx`

- [ ] **Step 1: Прочитать файл, найти таблицу «По ассистентам»**

Найти `<table>` с колонками: Ассистент, Запросов, Токенов, Последний. Записать имена полей строки (вероятно `requests`/`messages_count`, `tokens`, `last_at` — сверить).

- [ ] **Step 2: Импорт + состояние + сортировка**

```tsx
import { SortableTh, useTableSort, cmp, SortState } from './shared/sortableTable';

type AssistantSortKey = 'requests' | 'tokens' | 'last_at';
const [sort, setSort] = useState<SortState<AssistantSortKey>>({ key: 'tokens', dir: 'desc' });

const sortedAssistants = useTableSort(assistantsArray, sort, {
  requests: cmp.num(a => a.requests),
  tokens: cmp.num(a => a.tokens),
  last_at: cmp.date(a => a.last_at),
});
```

Заменить рендер на `sortedAssistants.map(...)`.

- [ ] **Step 3: Заменить `<th>` на `<SortableTh>`**

`Ассистент` — обычный `<th>`. Остальные 3 — `<SortableTh align="right">` (для «Последний» align остаётся слева).

- [ ] **Step 4: Lint + build + smoke**

В `/admin?tab=users` кликнуть на любого юзера → откроется drawer → таблица «По ассистентам» сортируется.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/UserActivityDrawer.tsx
git commit -m "feat(admin/users): сортировка таблицы «По ассистентам» в drawer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `MonitoringAttributionView` — 2 таблицы

**Files:**
- Modify: `src/components/admin/monitoring/MonitoringAttributionView.tsx`

- [ ] **Step 1: Прочитать файл, найти обе таблицы**

Таблица 1 «Атрибуция по источникам»: Источник, Лендинги, Регистрации, Активация, Платящие, Выручка.
Таблица 2 «A/B по кампаниям»: Кампания, Регистрации, Активация, Платящие, Выручка.

Записать имена полей строк (сверить с типами).

- [ ] **Step 2: Импорт + два состояния (по одному на таблицу)**

```tsx
import { SortableTh, useTableSort, cmp, SortState } from '../shared/sortableTable';

type SourceSortKey = 'landings' | 'registrations' | 'activation' | 'payers' | 'revenue';
type CampaignSortKey = 'registrations' | 'activation' | 'payers' | 'revenue';

const [sourceSort, setSourceSort] = useState<SortState<SourceSortKey>>({ key: 'revenue', dir: 'desc' });
const [campaignSort, setCampaignSort] = useState<SortState<CampaignSortKey>>({ key: 'revenue', dir: 'desc' });

const sortedSources = useTableSort(sourceRows, sourceSort, {
  landings: cmp.num(r => r.landings),
  registrations: cmp.num(r => r.registrations),
  activation: cmp.num(r => r.activation),
  payers: cmp.num(r => r.payers),
  revenue: cmp.num(r => r.revenue),
});
const sortedCampaigns = useTableSort(campaignRows, campaignSort, {
  registrations: cmp.num(r => r.registrations),
  activation: cmp.num(r => r.activation),
  payers: cmp.num(r => r.payers),
  revenue: cmp.num(r => r.revenue),
});
```

- [ ] **Step 3: Заменить `<th>` на `<SortableTh>` в обеих таблицах**

Названия (Источник/Кампания) остаются обычными `<th>`. Метрические — `<SortableTh align="right">`.

В `<tbody>` использовать `sortedSources` / `sortedCampaigns`.

- [ ] **Step 4: Lint + build + smoke**

`/admin?tab=monitoring`, под-вкладка «Атрибуция». Обе таблицы сортируются независимо.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/monitoring/MonitoringAttributionView.tsx
git commit -m "feat(admin/monitoring): сортировка в таблицах атрибуции и A/B по кампаниям

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `MonitoringChurnView` — таблица «Retention по когортам»

**Files:**
- Modify: `src/components/admin/monitoring/MonitoringChurnView.tsx`

- [ ] **Step 1: Прочитать файл**

Колонки: Неделя, Signups, D7 удержано, D7 retention, D30 удержано, D30 retention. Имена полей сверить (вероятно `week`, `signups`, `d7_retained`/`d7_kept`, `d7_rate`, `d30_retained`, `d30_rate`).

- [ ] **Step 2: Импорт + состояние + сортировка**

```tsx
import { SortableTh, useTableSort, cmp, SortState } from '../shared/sortableTable';

type ChurnSortKey = 'week' | 'signups' | 'd7_retained' | 'd7_rate' | 'd30_retained' | 'd30_rate';
const [sort, setSort] = useState<SortState<ChurnSortKey>>({ key: 'week', dir: 'desc' });

const sortedRows = useTableSort(cohortRows, sort, {
  week: cmp.date(r => r.week), // ISO-неделя обычно строка YYYY-MM-DD начала недели → date OK
  signups: cmp.num(r => r.signups),
  d7_retained: cmp.num(r => r.d7_retained),
  d7_rate: cmp.num(r => r.d7_rate),
  d30_retained: cmp.num(r => r.d30_retained),
  d30_rate: cmp.num(r => r.d30_rate),
});
```

> Если `week` это формат `2026-W23`, заменить `cmp.date` на `cmp.str` — лексикографический порядок работает корректно для этого формата.

- [ ] **Step 3: Заменить `<th>` на `<SortableTh>` (все 6)**

`Неделя` — `<SortableTh sortKey="week">Неделя</SortableTh>` (без `align="right"`). Остальные 5 — `align="right"`.

- [ ] **Step 4: Lint + build + smoke**

`/admin?tab=monitoring` → «Отток». Клик по «D30 retention» сортирует когорты по удержанию.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/monitoring/MonitoringChurnView.tsx
git commit -m "feat(admin/monitoring): сортировка в таблице retention по когортам

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `MonitoringNetworkingView` — 2 таблицы

**Files:**
- Modify: `src/components/admin/monitoring/MonitoringNetworkingView.tsx`

- [ ] **Step 1: Прочитать файл**

Таблица 1 «Топ-отправители»: user_id, Отправил, Принято.
Таблица 2 «Топ-получатели»: user_id, Получил, Принял.

- [ ] **Step 2: Импорт + два состояния**

```tsx
import { SortableTh, useTableSort, cmp, SortState } from '../shared/sortableTable';

type SenderSortKey = 'sent' | 'accepted';
type ReceiverSortKey = 'received' | 'accepted';

const [senderSort, setSenderSort] = useState<SortState<SenderSortKey>>({ key: 'sent', dir: 'desc' });
const [receiverSort, setReceiverSort] = useState<SortState<ReceiverSortKey>>({ key: 'received', dir: 'desc' });

const sortedSenders = useTableSort(senderRows, senderSort, {
  sent: cmp.num(r => r.sent),
  accepted: cmp.num(r => r.accepted),
});
const sortedReceivers = useTableSort(receiverRows, receiverSort, {
  received: cmp.num(r => r.received),
  accepted: cmp.num(r => r.accepted),
});
```

(Сверить имена полей по факту: возможно `requests_sent`/`accepted_count`.)

- [ ] **Step 3: Заменить `<th>` на `<SortableTh>` в обеих таблицах**

`user_id` — обычный `<th>`. Остальные — `<SortableTh align="right">`.

- [ ] **Step 4: Lint + build + smoke**

`/admin?tab=monitoring` → «Социальная сеть». Две таблицы сортируются независимо.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/monitoring/MonitoringNetworkingView.tsx
git commit -m "feat(admin/monitoring): сортировка в топ-отправителях и топ-получателях

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `VmmView` — SortSelect для карточек

**Files:**
- Modify: `src/components/admin/VmmView.tsx`

- [ ] **Step 1: Прочитать файл, найти список рекомендаций**

Найти `.map(...)` по массиву рекомендаций. Записать имена полей: `priority` (вероятно число или 'high'/'medium'/'low'), `created_at` (или `date`).

- [ ] **Step 2: Импорт + состояние + сортировка**

```tsx
import { SortSelect, useTableSort, cmp, SortState } from './shared/sortableTable';

type RecSortKey = 'priority' | 'created_at';
const [sort, setSort] = useState<SortState<RecSortKey>>({ key: 'priority', dir: 'desc' });

const sortedRecs = useTableSort(filteredRecs, sort, {
  priority: cmp.num(r => priorityToNum(r.priority)),
  created_at: cmp.date(r => r.created_at),
});
```

Если `priority` это строка 'high'/'medium'/'low', добавить локальный helper:
```tsx
const priorityToNum = (p: string | null | undefined): number => {
  if (p === 'high') return 3;
  if (p === 'medium') return 2;
  if (p === 'low') return 1;
  return 0;
};
```

Если `priority` это уже число — использовать прямой геттер `r.priority`.

- [ ] **Step 3: Добавить `<SortSelect>` в шапку списка**

Найти место с заголовком/счётчиком рекомендаций. Добавить рядом:
```tsx
<SortSelect
  state={sort}
  onSort={setSort}
  options={[
    { key: 'priority', dir: 'desc', label: 'Приоритет ↓' },
    { key: 'created_at', dir: 'desc', label: 'Дата ↓' },
    { key: 'created_at', dir: 'asc', label: 'Дата ↑' },
  ]}
/>
```

Подменить `filteredRecs.map(...)` на `sortedRecs.map(...)`.

- [ ] **Step 4: Lint + build + smoke**

В админке открыть «Виртуальный маркетолог». В шапке появился `<select>`. Переключение опций перестраивает карточки.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/VmmView.tsx
git commit -m "feat(admin/vmm): SortSelect для рекомендаций (приоритет/дата)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: `VpmView` — SortSelect для карточек

**Files:**
- Modify: `src/components/admin/VpmView.tsx`

- [ ] **Step 1: Применить те же изменения, что в Task 11**

Структура VpmView повторяет VmmView (тот же спек на карточках рекомендаций). Скопировать паттерн из Task 11:
- импорт `SortSelect`, `useTableSort`, `cmp`, `SortState`;
- `type RecSortKey`, `useState`, `useTableSort`;
- helper `priorityToNum` (если priority — строка);
- `<SortSelect>` в шапке списка с теми же 3 опциями;
- замена `.map` на отсортированный массив.

- [ ] **Step 2: Lint + build + smoke**

`/admin` → «Виртуальный PM». `<select>` появился, сортировка работает.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/VpmView.tsx
git commit -m "feat(admin/vpm): SortSelect для рекомендаций (приоритет/дата)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Финальный smoke по всему

**Files:** ничего не меняется.

- [ ] **Step 1: Полный smoke по всем 11 таблицам + 2 SortSelect**

```bash
pnpm dev
```

Открыть `/admin` локально, пройти по чек-листу:

- [ ] users — клик по 5 заголовкам, дефолт «Списано ↓» при первом открытии
- [ ] payments — клик по 4 заголовкам
- [ ] tokens — клик по 4 заголовкам, Network вкладка: `?sort=` не передаётся
- [ ] ads — клик по 8 заголовкам в нескольких кампаниях
- [ ] users → drawer → «По ассистентам» — клик по 3 заголовкам
- [ ] monitoring → атрибуция: обе таблицы независимо
- [ ] monitoring → отток: 6 заголовков retention
- [ ] monitoring → социальная сеть: 2 таблицы независимо
- [ ] monitoring → качество (PoC из Task 2): 6 заголовков
- [ ] vmm — `<select>` переключает 3 опции
- [ ] vpm — `<select>` переключает 3 опции

- [ ] **Step 2: Проверить, что lint и build всё ещё зелёные**

```bash
pnpm lint && pnpm build
```

- [ ] **Step 3: Если всё ок — финальный merge-коммит не нужен; работа уже в main через серию feature-коммитов**

Если работа велась в worktree/feature-branch — push и создать PR через `gh pr create`. Не деплоить (deploy.sh — отдельная процедура с согласованием).

---

## Self-Review (выполнено автором плана)

**1. Spec coverage:**
- Архитектура (`SortableTh`, `useTableSort`, `cmp`, `SortSelect`) — Task 1 ✓
- Все 11 таблиц из таблицы покрытия — Tasks 2–10 ✓
- 2 SortSelect (VmmView, VpmView) — Tasks 11, 12 ✓
- Удаление старых чипсов AdminUsersView/AdminTokensView — Tasks 3 step 4 / Task 4 step 5 ✓
- Миграция AdminTokensView на клиент, отказ от `?sort=` — Task 4 steps 3, 5 ✓
- Финальный smoke — Task 13 ✓

**2. Placeholder scan:**
- Нет «TBD/TODO». Есть «подставить реальное имя» — это инструкция исполнителю прочитать тип, потому что точные имена полей варьируются между вьюхами. Допустимо.

**3. Type consistency:**
- `SortState<K>`, `Dir`, `Comparator<T>` экспортируются из shared-модуля и используются единообразно во всех задачах.
- Имена типов `*SortKey` локальны для каждой вьюхи — это by design.
- `cmp.num`, `cmp.str`, `cmp.date` — единый стиль вызова `cmp.num(r => r.field)`.
- Везде `state={sort}` / `onSort={setSort}` или со специфичными именами (`sourceSort`/`setSourceSort` в Task 8).

**4. Известное ограничение:**
- Task 6 (AdsView) использует helper-компонент `CreativeRows`, чтобы вызвать `useTableSort` в каждой кампании. Это рабочий паттерн (хук вызывается ровно один раз внутри своего компонента).
- Task 11/12 предполагают, что `priority` — это строка. Если число — `priorityToNum` не нужен, прямой геттер; шаг написан с условием.
