# Design: «Задачи» в профиле пользователя

**Дата:** 2026-05-22
**Статус:** approved (brainstorming-этап завершён, ждём план реализации)
**Контекст:** на бэке LLM-extractor уже создаёт задачи как cross-agent operational memory (`/webhook/admin/users/:phone/tasks` показано в `UserActivityDrawer` для админа). Юзер сейчас этих задач не видит и не управляет ими.

## Цель

Дать пользователю в его собственном профиле раздел «Задачи» с тремя одновременно решаемыми сценариями:
- **прозрачность** — что агенты обо мне помнят;
- **operational dashboard** — что у меня сейчас в работе;
- **управление контекстом** — закрывать неактуальное, чтобы агенты не цеплялись за устаревшее.

В MVP набор операций сведён до **смены статуса** (close/archive/reopen). Редактирование `claudemd`, manual events, создание задач вручную, удаление — за рамками MVP.

## Размещение

Новая секция внутри `/profile` (`ProfileView.tsx`). Никаких отдельных маршрутов, drawer'ов, виджетов в чате. Раздел добавляется после блока entity-карточек (values / beliefs / desires / intents / interests / skills) и до footer-кнопок (LogOut / Delete).

## Архитектура

### Новый файл

`src/components/profile/ProfileTasks.tsx` — изолированный компонент:
- свой fetch к `/webhook/user/tasks`;
- свой локальный стейт (список, expanded id, статусы in-flight операций);
- внутренний под-компонент `TaskRow` в том же файле (вынесем наружу только когда появится второй потребитель — пока YAGNI).

Существующая логика задач в `UserActivityDrawer` **не переиспользуется**: админский вариант детализированнее (показывает `kind`, `agent_id`, `claudemd`), а UX юзер-варианта по решению намеренно упрощённый. Преждевременная общая абстракция дороже дублирования 30 строк JSX.

### Зависимости

- `apiClient` (auth, refresh, error envelope).
- `react-i18next`.
- `lucide-react`: `ClipboardList`, `Loader`, `ChevronDown`, `ChevronRight`, `Archive`, `RotateCcw`, `Check`.
- Никакого нового стейт-менеджмента; всё — `useState` / `useEffect`.

### Типы

`src/types/tasks.ts` (новый файл):

```ts
export type TaskStatus = 'active' | 'done' | 'archived';

export interface TaskListItem {
  id: string;
  title: string;
  status: TaskStatus;
  summary: string | null;
  last_active_at: string | null; // ISO
}

export interface TaskEvent {
  id: string;
  content: string;
  agent_id: number | null;
  agent_name: string | null;
  created_at: string; // ISO
}

export interface TaskDetails {
  task: TaskListItem & { agents?: Array<{ id: number; name: string }> };
  events: TaskEvent[];
}
```

## UI / UX

### Карточка секции

Стиль и плотность — как у соседних блоков профиля: `bg-white border border-gray-200 rounded-xl`. Шапка: иконка `ClipboardList`, заголовок «Задачи», справа счётчик активных в pill-бейдже.

### Состояния

| Состояние | Что рисуем |
|-----------|------------|
| Loading (первая загрузка) | Спиннер в центре карточки |
| Ошибка загрузки | Inline «Не удалось загрузить задачи. [Повторить]» |
| Пусто | «Задач пока нет. Они появляются автоматически, когда ты обсуждаешь с ассистентами текущие дела.» |
| Есть задачи | Список активных по умолчанию, отсортирован по `last_active_at` desc |

### Неактивные (done + archived)

По умолчанию виден только `active`. Если у пользователя есть `done` или `archived` — под шапкой появляется тогл **«Показать завершённые и архив (N)»**, где N = `done + archived`. По клику они добавляются в список под separator'ом, отсортированные по `last_active_at` desc (без вторичной группировки по статусу — различие видно по badge). Если неактивных нет — тогла нет.

### Свёрнутая строка задачи

- `▸` chevron.
- `title` (truncate, single line).
- Status badge: `active` — forest-50/700, `done` — gray-100/600, `archived` — gray-100/600 (light).
- Под title — `last_active_at` относительно («2 часа назад», «вчера»). Если `null` — строку не рисуем.
- Если есть `summary` — первая строка под title, `line-clamp-1`.

### Развёрнутая задача

- Полный `summary`.
- Список событий: каждое — белая плашка, текст события + строка «Ассистент {agent_name || 'Ассистент'} • {formatDateTime(created_at)}». Метки `kind` и сырой `agent_id` пользователю не показываем.
- Если `events` пуст — блок «События» не рисуем (не шумим «событий нет»).
- Action bar внизу:
  - `active`: `[Закрыть]` (→ `done`), `[Архивировать]` (→ `archived`).
  - `done` или `archived`: `[Восстановить]` (→ `active`).
  - Кнопки compact, secondary-стиль (`border text-gray-700`), иконки слева (`Check`, `Archive`, `RotateCcw`).

### Подтверждения

Нет. Operations не destructive — задача в БД остаётся, меняется только статус. Оптимистичный апдейт; на ошибку — rollback + inline-сообщение.

### Mobile

Та же одноколоночная раскладка, что у соседних блоков профиля. Action bar — flex-wrap.

## Data flow

```
ProfileTasks (mount)
  └─ GET /webhook/user/tasks
       → tasks: TaskListItem[]

User кликает на строку
  └─ если taskDetails[id] нет:
       GET /webhook/user/tasks/:id?limit=30
       → taskDetails[id]: TaskDetails
     иначе:
       toggle expanded

User кликает action (Close / Archive / Reopen)
  └─ optimistic: tasks[id].status = newStatus
     PATCH /webhook/user/tasks/:id { status: newStatus }
       on 200: noop
       on error: rollback + show inline error
```

Polling **не делаем**: задачи не баланс токенов. Refresh на mount достаточно. Если по факту юзеры будут жаловаться, что свежесозданная задача не появляется без F5 — добавим кнопку обновления в шапке (или polling 30s — но в MVP не закладываем).

## API контракты (новые user-эндпоинты на бэке)

Авторизация — Bearer JWT. `user_id` бэк извлекает из токена. Никаких `:phone` в пути.

```
GET    /webhook/user/tasks
  → 200 TaskListItem[]

GET    /webhook/user/tasks/:id?limit=30
  → 200 TaskDetails
  → 404 если задача не принадлежит пользователю

PATCH  /webhook/user/tasks/:id
  body: { status: 'active' | 'done' | 'archived' }
  → 200 TaskListItem  // обновлённая
  → 404 если не принадлежит пользователю
  → 400 если неизвестный статус
```

**Backend-зависимость:** этих эндпоинтов сейчас нет. Их реализация — отдельный шаг в плане работ (зона `spirits_back`).

**Сверка enum'а статусов:** перед реализацией PATCH сверить с тем, что сейчас в БД для `task.status`. Если в проде окажутся `cancelled`, `paused` и прочее — расширим `TaskStatus` и мэппинг кнопок без перевёрстки UX.

## Ошибки и edge cases

- 401 — обрабатывает `apiClient` (refresh flow), компонент ничего не ловит специально.
- Fetch списка падает → inline-сообщение + кнопка «Повторить».
- Fetch деталей падает → внутри развёрнутой задачи, кнопка «Повторить».
- PATCH падает → rollback + inline-сообщение.
- Очень длинные `title` / `summary` → `truncate` / `line-clamp-2`.
- `last_active_at = null` → строку с датой не рисуем.
- 100+ задач → `max-h-[600px] overflow-y-auto` внутри секции (паттерн из админки).
- `agent_name = null` → «Ассистент».

## i18n

Все строки через `t()`, ключи под неймспейсом `profile.tasks.*` в `src/i18n/locales/{ru,en}.json`. Никаких хардкоженых русских строк в JSX.

## Тестирование

- Ручной QA по матрице состояний (loading / empty / list / expand / 3 action'а / rollback / архивный тогл / мобайл).
- Юнитов на фронте у проекта нет — отдельную инфраструктуру под этот компонент не вводим.
- E2E (Playwright) — опционально, если бэк-эндпоинты тоже идут с тестами в `spirits_back/tests/`. Не блокер MVP.
- TDD на новые user-эндпоинты — обязательно (зона `spirits_back`).

## Что НЕ делаем в MVP (явно отложено)

- Редактирование `claudemd` (memo для агентов).
- Lock/unlock задачи (`claudemd_locked`).
- Добавление своих событий (manual milestones).
- Удаление задач совсем.
- Создание задач вручную, минуя LLM-extractor.
- Push/badge о новой задаче в навигации.
- Polling и real-time апдейты.

Каждый из этих пунктов — отдельный round брейнсторма по факту запроса, не превентивно.

## Open questions

1. Реальный enum `task.status` на бэке — сверить перед реализацией PATCH.
2. Бэкенд возвращает `agent_name` в `TaskEvent`? Если сейчас только `agent_id` — нужен join к таблице агентов в новом эндпоинте.
