# Сортировки в аналитических таблицах админки

**Дата:** 2026-06-26
**Скоуп:** Фронт (`spirits_front`)
**Зависимости от бэка:** нет

## Контекст

В админке (`/admin`) ~12 вкладок с аналитическими данными. В 10 из них есть таблицы с метриками; в 2 — карточки (рекомендации VmmView/VpmView). Сейчас:

- 2 таблицы умеют сортироваться (`AdminUsersView` — клиент, `AdminTokensView` — сервер), но через кнопки-чипсы под графиком, без кликабельных заголовков.
- 9 таблиц не сортируются вовсе.
- 2 списка карточек (VmmView, VpmView) сортируются только в порядке прихода с API.
- Нет общего компонента/хука — каждая вьюха решает сама.

Цель — единый UX «кликнул по заголовку → отсортировалось со стрелкой ↑/↓» во всех таблицах, и небольшой `<SortSelect>` над списком карточек.

## Архитектура

Один новый файл: `src/components/admin/shared/sortableTable.tsx`. Экспортирует:

- `SortableTh<K>` — компонент-обёртка над `<th>` со стрелкой и кликом.
- `useTableSort<T, K>(rows, state, comparators)` — хук с `useMemo`, возвращает отсортированный массив.
- `cmp.num`, `cmp.str`, `cmp.date` — фабрики компараторов.
- `SortSelect<K>` — `<select>` для списка карточек (VmmView/VpmView).
- Типы `SortState<K>`, `Dir`, `Comparator<T>`.

Состояние сортировки живёт в локальном `useState` каждой вьюхи. Не пишется в URL, не сохраняется между сессиями (YAGNI).

### Контракты

```ts
type Dir = 'asc' | 'desc';
type SortState<K extends string> = { key: K; dir: Dir } | null;
type Comparator<T> = (a: T, b: T) => number;

interface SortableThProps<K extends string> {
  sortKey: K;
  state: SortState<K>;
  onSort: (next: SortState<K>) => void;
  align?: 'left' | 'right';   // text-align + положение стрелки
  defaultDir?: Dir;           // первое направление при клике; число/дата → 'desc', строка → 'asc'
  className?: string;
  children: React.ReactNode;
}

function useTableSort<T, K extends string>(
  rows: T[],
  state: SortState<K>,
  comparators: Record<K, Comparator<T>>,
): T[];

export const cmp: {
  num: <T>(get: (r: T) => number | null | undefined) => Comparator<T>;
  str: <T>(get: (r: T) => string | null | undefined) => Comparator<T>;
  date: <T>(get: (r: T) => string | number | null | undefined) => Comparator<T>;
};

interface SortSelectProps<K extends string> {
  state: SortState<K>;
  onSort: (next: SortState<K>) => void;
  options: { key: K; dir: Dir; label: string }[];
  className?: string;
}
```

### Поведение клика

- **Цикл клика по колонке:** `(текущий sort_key ≠ этой колонки) → (defaultDir этой колонки) → (противоположное) → null`. Для чисел/дат `defaultDir='desc'`, для строк `'asc'`. После третьего клика по одной и той же колонке состояние становится `null` и `useTableSort` возвращает массив в исходном порядке API. Initial-state в `useState` устанавливается один раз при монтировании вьюхи и потом не «возвращается» — после `null` пользователь либо кликает по другой колонке, либо снова по этой.
- Клавиатура: `Enter`/`Space` на `<th>` с `tabIndex=0`.
- `aria-sort="ascending|descending|none"` на `<th>`.

### Стабильность сортировки

`useTableSort` оборачивает строки в `{ row, idx }`, при ничьей сравнивает `idx`. Это гарантирует, что одинаковые значения остаются в исходном порядке.

### Обработка null/undefined

- **Числа/даты:** трактуем как `-Infinity` → всегда в низу при `desc`, всегда сверху при `asc`. Удобно: при сортировке «Последняя активность ↓» юзеры без активности уходят в самый низ.
- **Строки:** `null` → пустая строка, попадает в начало при `asc`.

### Визуальный стиль

- Заголовок: `cursor-pointer select-none hover:text-forest-600 hover:bg-gray-50 transition-colors`.
- Иконка справа от лейбла (или слева, если `align="right"`):
  - неактивная колонка — `ChevronsUpDown` 12px, `text-gray-300`;
  - активная — `ArrowDown` или `ArrowUp` 12px, `text-forest-600`;
  - активный лейбл — `text-forest-600 font-semibold`.

### Серверная сортировка — отказ от неё в этом цикле

`AdminTokensView` сейчас передаёт `?sort=balance|spent_period` на бэк. **Меняем на клиентскую** — все балансы грузятся одним пакетом (top-N ~200 строк), refetch ради сортировки не нужен. Бэк-параметр `?sort=` перестаём слать; на бэке оставляем как есть для обратной совместимости.

Это упрощает контракт: `mode="server"` в `SortableTh` не нужен, сервис только клиентский.

## Покрытие

### Клиентская сортировка через `SortableTh` + `useTableSort`

| Вьюха | Таблица | Сортируемые колонки | Дефолт |
|---|---|---|---|
| AdminUsersView | Пользователи | Зарегистрирован, Последняя активность, Списано (30д), Баланс, Платежей | Списано ↓ |
| AdminTokensView | Балансы | Баланс, Списано (период), Последняя активность, Платежей | Списано ↓ |
| AdminPaymentsView | Платежи | Сумма, Токены, Статус, Дата | Дата ↓ |
| AdsView | Объявления в кампаниях | Показы, Клики, CTR, CPC, Расход, Регистрации, Платящие, CPR | Расход ↓ |
| UserActivityDrawer | По ассистентам | Запросов, Токенов, Последний | Токенов ↓ |
| MonitoringAttributionView | Атрибуция по источникам | Лендинги, Регистрации, Активация, Платящие, Выручка | Выручка ↓ |
| MonitoringAttributionView | A/B по кампаниям | Регистрации, Активация, Платящие, Выручка | Выручка ↓ |
| MonitoringChurnView | Retention по когортам | Неделя, Signups, D7 удержано, D7 retention, D30 удержано, D30 retention | Неделя ↓ |
| MonitoringNetworkingView | Топ-отправители | Отправил, Принято | Отправил ↓ |
| MonitoringNetworkingView | Топ-получатели | Получил, Принял | Получил ↓ |
| MonitoringQualityView | Ассистенты | Сообщений, Юзеров, Средн. ответ, p95, Ср. на сессию, % ошибок | Сообщений ↓ |

### Карточки через `SortSelect`

| Вьюха | Опции | Дефолт |
|---|---|---|
| VmmView | Приоритет ↓, Дата ↓, Дата ↑ | Приоритет ↓ |
| VpmView | Приоритет ↓, Дата ↓, Дата ↑ | Приоритет ↓ |

### Несортируемые колонки

Везде: `#`, Телефон (как идентификатор), Реферал (тег), Ассистент/Кампания/Источник (название), Статус как бейдж, действия. Если в будущем понадобится строковая сортировка — добавим точечно.

### Не входит в скоуп

- AdminSupportView (диалоги, не таблица метрик).
- AdminCouponsView, AdminAssistantsView, AdminReferralsView, AdminRetentionView, AdminActivationView, AdminProductManagementView, AdminBacklogView — карточные/настроечные интерфейсы без аналитических таблиц.
- Прочие секции в UserActivityDrawer (платежи/задачи/транзакции/сообщения) — короткие inline-списки 5–15 строк.

## Снятие старого UI

- `AdminUsersView`: удалить блок из 3 кнопок-чипсов под графиком (`spent_period`/`balance`/`registered_at`). Дефолт `Списано ↓` сохраняется через initial `useState`.
- `AdminTokensView`: удалить аналогичный блок кнопок, перестать слать `?sort=` на бэк.

## Edge-cases

- **Пустая таблица** (`rows.length === 0`) — заголовки кликабельны, рисуем как обычно.
- **Загрузка** — таблица скрыта/спиннер (как сейчас в каждой вьюхе).
- **Refetch** (смена периода/фильтра) — `useTableSort` пересчитает на новых данных, состояние сортировки сохранится.
- **Нестабильные данные** (дубликаты) — стабильная сортировка по индексу решает.

## Тестирование

- Юнит-тесты `useTableSort` в `src/components/admin/shared/sortableTable.test.tsx` (vitest, если в проекте есть тест-раннер — проверить перед написанием): пустой массив, единственный элемент, стабильность при ничьих, обработка `null`/`undefined`, переключение направления.
- Smoke вручную: открыть каждую из 10 таблиц + 2 SortSelect-карточек VmmView/VpmView, клик по 1–2 заголовкам/опциям:
  - стрелка появилась/исчезла;
  - данные действительно отсортированы;
  - дефолтная сортировка применилась при первом рендере;
  - смена периода/фильтра не теряет сортировку.

## Порядок реализации

1. `src/components/admin/shared/sortableTable.tsx` — `SortableTh`, `useTableSort`, `cmp.{num,str,date}`, `SortSelect`, типы.
2. Юнит-тесты, если в проекте есть test runner.
3. Proof-of-concept на одной простой вьюхе — `MonitoringQualityView`.
4. Раскатить на остальные:
   - AdminUsersView (+ убрать старые кнопки)
   - AdminTokensView (+ убрать старые кнопки + клиентский режим)
   - AdminPaymentsView
   - AdsView
   - UserActivityDrawer (таблица «По ассистентам»)
   - MonitoringAttributionView (2 таблицы)
   - MonitoringChurnView
   - MonitoringNetworkingView (2 таблицы)
   - VmmView (SortSelect)
   - VpmView (SortSelect)
5. Smoke вручную в браузере.

## Что НЕ делаю

- Не сохраняю сортировку в URL/localStorage (YAGNI).
- Не трогаю бэк.
- Не делаю multi-column sort.
- Не делаю сортировку по строковым колонкам без явной просьбы.
- Не перепаковываю layout/стиль таблиц.
- Не меняю бэк-контракт `?sort=` в `AdminTokensView` (фронт просто перестаёт его слать).

## Bundle impact

+~2 КБ (новый файл ~150 строк + `ChevronsUpDown` из lucide-react уже в bundle через другие вьюхи).
