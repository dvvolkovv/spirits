# «Задачи» в профиле — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователю в `/profile` раздел «Задачи» — список cross-agent operational memory (создаётся LLM-extractor'ом в `spirits_back`) с возможностью смены статуса (close/archive/reopen).

**Architecture:** Новый компонент `ProfileTasks` интегрируется в `ProfileView` отдельной секцией. Он ходит в три новых user-scoped эндпоинта на бэке (`GET /webhook/user/tasks`, `GET /webhook/user/tasks/:id`, `PATCH /webhook/user/tasks/:id`). Бэкенд переиспользует уже существующую таблицу `tasks` и сервис `TasksService` — добавляет три новых метода (`listForUser`, `getTaskFullForUser`, `setStatus`) и три контроллер-хендлера. Авторизация — Bearer JWT, `user_id = payload.phone` (как в `JwtGuard`).

**Tech Stack:**
- Backend (`~/Downloads/spirits_back/`): NestJS 10, PostgreSQL (pg), Jest для unit, `tests/api.test.js` (axios+custom runner) для API integration.
- Frontend (этот репо): React 18 + TS + Vite, Tailwind, `apiClient`, `react-i18next`, `lucide-react`. Тестов фронт-уровня в проекте нет — финальная проверка через ручной QA + smoke (Playwright в `spirits_back/tests/`).

**Связанная спека:** [`docs/superpowers/specs/2026-05-22-profile-tasks-design.md`](../specs/2026-05-22-profile-tasks-design.md).

**Деплой:** оба сервиса деплоятся одним скриптом `bash ~/Downloads/spirits_back/scripts/deploy.sh` (он билдит фронт + бэк, синкает оба, рестартит PM2, прогоняет smoke).

---

## Phase 1 — Backend (`~/Downloads/spirits_back/`)

Все шаги — в репо `spirits_back`. Из этого репо `spirits_front` тащить ничего не нужно.

### Task 1: Service метод `listForUser(userId)` + unit-тест на сортировку

**Files:**
- Modify: `src/tasks/tasks.service.ts` (добавить публичный метод после `listForAdmin`)
- Create: `tests/unit/tasks-listForUser.test.js`

**Зачем отдельный метод, а не reuse `listForAdmin`:** контракт user API не должен случайно расшириться от админских правок. У них разные потребители — лучше изолировать сейчас (10 строк), чем разбираться в кросс-эффектах потом.

- [ ] **Step 1: Написать failing-тест**

`tests/unit/tasks-listForUser.test.js`:
```js
const { TasksService } = require('../../dist/tasks/tasks.service');

// Stub PgService: возвращает преданные rows из последнего query.
function makePg(rows) {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  };
}

describe('TasksService.listForUser', () => {
  test('возвращает поля для user UI (без claudemd) и сортирует active первыми', async () => {
    const pg = makePg([
      { id: 't1', title: 'Active', status: 'active',   summary: 's1', last_active_at: '2026-05-20' },
      { id: 't2', title: 'Done',   status: 'done',     summary: 's2', last_active_at: '2026-05-22' },
      { id: 't3', title: 'Arch',   status: 'archived', summary: 's3', last_active_at: '2026-05-21' },
    ]);
    const svc = new TasksService(pg);
    const rows = await svc.listForUser('79030169187');

    expect(pg.query).toHaveBeenCalledTimes(1);
    const sql = pg.query.mock.calls[0][0];
    expect(sql).toMatch(/FROM tasks/);
    expect(sql).toMatch(/WHERE user_id = \$1/);
    expect(sql).not.toMatch(/claudemd/); // не должен возвращать claudemd
    expect(rows).toEqual([
      { id: 't1', title: 'Active', status: 'active',   summary: 's1', last_active_at: '2026-05-20' },
      { id: 't2', title: 'Done',   status: 'done',     summary: 's2', last_active_at: '2026-05-22' },
      { id: 't3', title: 'Arch',   status: 'archived', summary: 's3', last_active_at: '2026-05-21' },
    ]);
  });

  test('возвращает пустой массив, если pg не сконфигурирован', async () => {
    const svc = new TasksService(undefined);
    expect(await svc.listForUser('user')).toEqual([]);
  });
});
```

- [ ] **Step 2: Прогнать тест — должен упасть (метода нет)**

Запуск: `cd ~/Downloads/spirits_back && npx jest tests/unit/tasks-listForUser.test.js`
Ожидание: FAIL — `svc.listForUser is not a function`.

- [ ] **Step 3: Реализовать минимально**

В `src/tasks/tasks.service.ts` после метода `listForAdmin` (около строки 248) добавить:

```ts
  /**
   * Список задач юзера для пользовательского UI (раздел «Задачи» в /profile).
   * Возвращает только поля, нужные UI: без claudemd (это для агентов, не для юзера в MVP).
   * Сортировка: active сверху, потом по last_active_at desc.
   */
  async listForUser(userId: string): Promise<Array<{
    id: string;
    title: string;
    status: 'active' | 'archived' | 'done';
    summary: string | null;
    last_active_at: string | null;
  }>> {
    if (!this.pg) return [];
    const res = await this.pg.query(
      `SELECT id, title, status, summary, last_active_at
         FROM tasks
         WHERE user_id = $1
         ORDER BY (status = 'active') DESC, last_active_at DESC
         LIMIT 200`,
      [userId],
    );
    return res.rows;
  }
```

- [ ] **Step 4: Билд + прогон теста**

```bash
cd ~/Downloads/spirits_back
pnpm build
npx jest tests/unit/tasks-listForUser.test.js
```
Ожидание: PASS (оба теста).

- [ ] **Step 5: Commit**

```bash
git add src/tasks/tasks.service.ts tests/unit/tasks-listForUser.test.js
git commit -m "feat(tasks): listForUser — список задач юзера для /profile UI"
```

---

### Task 2: Service метод `getTaskFullForUser(taskId, userId)` + ownership check + agent_name join

**Files:**
- Modify: `src/tasks/tasks.service.ts`
- Create: `tests/unit/tasks-getTaskFullForUser.test.js`

**Почему отдельно от `getTaskFull`:** существующий метод не проверяет владение задачей и возвращает `agent_id` без `agent_name`. Для user-эндпоинта нужны и проверка, и человекочитаемые имена ассистентов.

- [ ] **Step 1: Написать failing-тест**

`tests/unit/tasks-getTaskFullForUser.test.js`:
```js
const { TasksService } = require('../../dist/tasks/tasks.service');

function makePg(scriptedResponses) {
  let i = 0;
  return {
    query: jest.fn(async () => {
      const r = scriptedResponses[i++];
      if (!r) throw new Error('pg.query called more times than scripted');
      return r;
    }),
  };
}

describe('TasksService.getTaskFullForUser', () => {
  test('возвращает task + events с agent_name; не возвращает claudemd', async () => {
    const pg = makePg([
      // ownership + task row
      { rows: [{ id: 't1', user_id: '79030169187', title: 'T', summary: 's', status: 'active', last_active_at: '2026-05-22' }] },
      // events with agent_name joined
      { rows: [
        { id: 'e1', content: 'hello', agent_id: 5, agent_name: 'Юля',     created_at: '2026-05-22T10:00:00Z' },
        { id: 'e2', content: 'world', agent_id: null, agent_name: null,    created_at: '2026-05-22T11:00:00Z' },
      ]},
    ]);
    const svc = new TasksService(pg);
    const out = await svc.getTaskFullForUser('t1', '79030169187', 30);

    expect(out).not.toBeNull();
    expect(out.task).toEqual({
      id: 't1', title: 'T', summary: 's', status: 'active', last_active_at: '2026-05-22',
    });
    expect(out.events).toEqual([
      { id: 'e1', content: 'hello', agent_id: 5,    agent_name: 'Юля',  created_at: '2026-05-22T10:00:00Z' },
      { id: 'e2', content: 'world', agent_id: null, agent_name: null,    created_at: '2026-05-22T11:00:00Z' },
    ]);

    // SELECT не должен включать claudemd
    expect(pg.query.mock.calls[0][0]).not.toMatch(/claudemd/);
  });

  test('возвращает null, если задача принадлежит другому юзеру', async () => {
    const pg = makePg([{ rows: [] }]); // ownership check возвращает пусто
    const svc = new TasksService(pg);
    const out = await svc.getTaskFullForUser('t1', '79030169187');
    expect(out).toBeNull();
  });

  test('лимит событий ограничивается значением аргумента', async () => {
    const pg = makePg([
      { rows: [{ id: 't1', user_id: 'u', title: 'T', summary: '', status: 'active', last_active_at: null }] },
      { rows: [] },
    ]);
    const svc = new TasksService(pg);
    await svc.getTaskFullForUser('t1', 'u', 12);
    expect(pg.query.mock.calls[1][1]).toEqual(['t1', 12]);
  });
});
```

- [ ] **Step 2: Прогнать тест — должен упасть**

`npx jest tests/unit/tasks-getTaskFullForUser.test.js` → FAIL.

- [ ] **Step 3: Реализовать**

В `src/tasks/tasks.service.ts` после `listForUser` добавить:

```ts
  /**
   * Детали задачи для user-эндпоинта: проверяет владение,
   * джойнит события с agent_name, не возвращает claudemd.
   */
  async getTaskFullForUser(
    taskId: string,
    userId: string,
    eventsLimit = 20,
  ): Promise<{
    task: {
      id: string;
      title: string;
      summary: string | null;
      status: 'active' | 'archived' | 'done';
      last_active_at: string | null;
    };
    events: Array<{
      id: string;
      content: string;
      agent_id: number | null;
      agent_name: string | null;
      created_at: string;
    }>;
  } | null> {
    if (!this.pg) return null;
    const tRes = await this.pg.query(
      `SELECT id, title, summary, status, last_active_at
         FROM tasks
         WHERE id = $1 AND user_id = $2`,
      [taskId, userId],
    );
    if (!tRes.rows.length) return null;
    const eRes = await this.pg.query(
      `SELECT e.id, e.content, e.agent_id, a.name AS agent_name, e.created_at
         FROM task_events e
         LEFT JOIN agents a ON a.id = e.agent_id
         WHERE e.task_id = $1
         ORDER BY e.created_at DESC
         LIMIT $2`,
      [taskId, eventsLimit],
    );
    return { task: tRes.rows[0], events: eRes.rows.reverse() };
  }
```

**Важно:** join `LEFT JOIN agents a ON a.id = e.agent_id` — это предположение, что таблица называется `agents` с полем `name`. Перед запуском теста проверь реальное имя таблицы:
```bash
ssh dvolkov@212.113.106.202 'psql -d linkeon -c "\dt"' | grep -i agent
ssh dvolkov@212.113.106.202 'psql -d linkeon -c "\d agents"'
```
Если таблица называется иначе (например, `ai_agents`) — поправь SQL и тест.

- [ ] **Step 4: Билд + прогон тестов**

```bash
pnpm build && npx jest tests/unit/tasks-getTaskFullForUser.test.js
```
Ожидание: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tasks/tasks.service.ts tests/unit/tasks-getTaskFullForUser.test.js
git commit -m "feat(tasks): getTaskFullForUser — детали задачи с ownership check + agent_name"
```

---

### Task 3: Service метод `setStatus(taskId, userId, status)`

**Files:**
- Modify: `src/tasks/tasks.service.ts`
- Create: `tests/unit/tasks-setStatus.test.js`

- [ ] **Step 1: Написать failing-тест**

`tests/unit/tasks-setStatus.test.js`:
```js
const { TasksService } = require('../../dist/tasks/tasks.service');

function makePg(scripted) {
  let i = 0;
  return {
    query: jest.fn(async () => {
      const r = scripted[i++];
      if (!r) throw new Error('unexpected pg.query call');
      return r;
    }),
  };
}

describe('TasksService.setStatus', () => {
  test('обновляет статус и last_active_at для активного перевода', async () => {
    const pg = makePg([
      // UPDATE ... RETURNING
      { rows: [{ id: 't1', title: 'T', summary: 's', status: 'done', last_active_at: '2026-05-22' }] },
    ]);
    const svc = new TasksService(pg);
    const updated = await svc.setStatus('t1', '79030169187', 'done');

    expect(updated).toEqual({
      id: 't1', title: 'T', summary: 's', status: 'done', last_active_at: '2026-05-22',
    });
    const [sql, params] = pg.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE tasks/);
    expect(sql).toMatch(/SET status = \$1/);
    expect(sql).toMatch(/WHERE id = \$2 AND user_id = \$3/);
    expect(sql).toMatch(/RETURNING/);
    expect(params).toEqual(['done', 't1', '79030169187']);
  });

  test('возвращает null, если задача чужая', async () => {
    const pg = makePg([{ rows: [] }]);
    const svc = new TasksService(pg);
    const out = await svc.setStatus('t1', 'other-user', 'archived');
    expect(out).toBeNull();
  });

  test('кидает ошибку на невалидный статус', async () => {
    const pg = makePg([]);
    const svc = new TasksService(pg);
    await expect(svc.setStatus('t1', 'u', 'cancelled')).rejects.toThrow(/invalid status/);
    expect(pg.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Прогнать — FAIL**

`npx jest tests/unit/tasks-setStatus.test.js`.

- [ ] **Step 3: Реализовать**

В `src/tasks/tasks.service.ts` после `getTaskFullForUser`:

```ts
  /**
   * Меняет статус задачи. Проверяет владение через WHERE user_id.
   * Возвращает обновлённую запись или null, если задача не принадлежит юзеру.
   */
  async setStatus(
    taskId: string,
    userId: string,
    status: 'active' | 'archived' | 'done',
  ): Promise<{
    id: string;
    title: string;
    summary: string | null;
    status: 'active' | 'archived' | 'done';
    last_active_at: string | null;
  } | null> {
    if (!['active', 'archived', 'done'].includes(status)) {
      throw new Error(`invalid status: ${status}`);
    }
    if (!this.pg) return null;
    const res = await this.pg.query(
      `UPDATE tasks
         SET status = $1, updated_at = now()
         WHERE id = $2 AND user_id = $3
         RETURNING id, title, summary, status, last_active_at`,
      [status, taskId, userId],
    );
    return res.rows.length ? res.rows[0] : null;
  }
```

- [ ] **Step 4: Прогнать тесты**

`pnpm build && npx jest tests/unit/tasks-setStatus.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tasks/tasks.service.ts tests/unit/tasks-setStatus.test.js
git commit -m "feat(tasks): setStatus — смена статуса задачи с ownership check"
```

---

### Task 4: Controller — `GET /webhook/user/tasks`

**Files:**
- Modify: `src/tasks/tasks.controller.ts` (добавить хендлер; контроллер уже подключён к корню префикса)

- [ ] **Step 1: Добавить хендлер**

В `src/tasks/tasks.controller.ts` после метода `details` (около строки 38) добавить:

```ts
  @Get('user/tasks')
  @UseGuards(JwtGuard)
  async listUser(@Req() req: any, @Res() res: Response) {
    if (!this.tasks) return res.status(503).json({ error: 'tasks service not configured' });
    const userId: string = req.user?.phone;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const items = await this.tasks.listForUser(userId);
    return res.status(200).json(items);
  }
```

И в импортах:
```ts
import { Controller, Get, Param, Query, Req, Res, UseGuards, Optional } from '@nestjs/common';
```

- [ ] **Step 2: Билд + ручная проверка через curl**

```bash
pnpm build && pm2 restart linkeon-api  # локально или сразу на test-server
```

На прод-сервере (после деплоя) или локально:
```bash
# Получи access-token для test phone (см. CLAUDE.md)
TOKEN="$(curl -s 'https://my.linkeon.io/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/70000000000/0000' | jq -r .access_token)"
curl -s -H "Authorization: Bearer $TOKEN" 'https://my.linkeon.io/webhook/user/tasks' | jq .
```
Ожидание: массив (возможно пустой) JSON.
Без токена:
```bash
curl -s -o /dev/null -w "%{http_code}\n" 'https://my.linkeon.io/webhook/user/tasks'
```
Ожидание: 401.

- [ ] **Step 3: Добавить API-тест в `tests/api.test.js`**

В `module.exports` добавить:
```js
  'GET /webhook/user/tasks — без токена 401': async () => {
    const resp = await http.get('/webhook/user/tasks');
    assertStatus(resp, 401);
  },

  'GET /webhook/user/tasks — с валидным токеном возвращает массив': async () => {
    const token = await getTestAccessToken();
    const resp = await http.get('/webhook/user/tasks', { headers: bearer(token) });
    assertStatus(resp, 200);
    if (!Array.isArray(resp.data)) throw new Error('Expected array response');
  },
```

`getTestAccessToken()` уже есть в config.js (или в e2e.test.js — посмотри по месту). Если нет — вызови существующий хелпер логина для test-phone.

- [ ] **Step 4: Прогнать API-тесты**

```bash
cd ~/Downloads/spirits_back/tests && node runner.js --suite api
```
Ожидание: оба новых теста PASS, регрессии нет.

- [ ] **Step 5: Commit**

```bash
git add src/tasks/tasks.controller.ts tests/api.test.js
git commit -m "feat(tasks): GET /webhook/user/tasks — user-scoped list endpoint"
```

---

### Task 5: Controller — `GET /webhook/user/tasks/:id`

**Files:**
- Modify: `src/tasks/tasks.controller.ts`

- [ ] **Step 1: Добавить хендлер**

В `tasks.controller.ts` после `listUser`:

```ts
  @Get('user/tasks/:taskId')
  @UseGuards(JwtGuard)
  async detailsUser(
    @Param('taskId') taskId: string,
    @Query('limit') limit: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    if (!this.tasks) return res.status(503).json({ error: 'tasks service not configured' });
    const userId: string = req.user?.phone;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const lim = limit ? Math.min(Math.max(parseInt(limit, 10) || 30, 1), 200) : 30;
    const data = await this.tasks.getTaskFullForUser(taskId, userId, lim);
    if (!data) return res.status(404).json({ error: 'task not found' });
    return res.status(200).json(data);
  }
```

- [ ] **Step 2: Билд + ручная проверка**

```bash
pnpm build && pm2 restart linkeon-api
# Возьми id из списка предыдущего эндпоинта
curl -s -H "Authorization: Bearer $TOKEN" 'https://my.linkeon.io/webhook/user/tasks/<UUID>?limit=10' | jq .
```
Ожидание: `{ task: {...}, events: [...] }`.

Проверка чужой задачи (создай задачу другому юзеру или возьми id из админки):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" 'https://my.linkeon.io/webhook/user/tasks/<UUID-OF-OTHER-USER-TASK>'
```
Ожидание: 404 (не 200 — это важно для безопасности).

- [ ] **Step 3: Добавить API-тест**

```js
  'GET /webhook/user/tasks/:id — без токена 401': async () => {
    const resp = await http.get('/webhook/user/tasks/00000000-0000-0000-0000-000000000000');
    assertStatus(resp, 401);
  },

  'GET /webhook/user/tasks/:id — несуществующий id возвращает 404': async () => {
    const token = await getTestAccessToken();
    const resp = await http.get('/webhook/user/tasks/00000000-0000-0000-0000-000000000000', { headers: bearer(token) });
    assertStatus(resp, 404);
  },
```

- [ ] **Step 4: Прогнать тесты**

`node runner.js --suite api` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tasks/tasks.controller.ts tests/api.test.js
git commit -m "feat(tasks): GET /webhook/user/tasks/:id — детали с ownership check"
```

---

### Task 6: Controller — `PATCH /webhook/user/tasks/:id`

**Files:**
- Modify: `src/tasks/tasks.controller.ts`

- [ ] **Step 1: Добавить хендлер**

В импортах:
```ts
import { Body, Controller, Get, Param, Patch, Query, Req, Res, UseGuards, Optional } from '@nestjs/common';
```

В контроллере:
```ts
  @Patch('user/tasks/:taskId')
  @UseGuards(JwtGuard)
  async setStatusUser(
    @Param('taskId') taskId: string,
    @Body() body: { status?: string },
    @Req() req: any,
    @Res() res: Response,
  ) {
    if (!this.tasks) return res.status(503).json({ error: 'tasks service not configured' });
    const userId: string = req.user?.phone;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const status = body?.status;
    if (!status || !['active', 'archived', 'done'].includes(status)) {
      return res.status(400).json({ error: 'invalid status', allowed: ['active', 'archived', 'done'] });
    }
    try {
      const updated = await this.tasks.setStatus(taskId, userId, status as any);
      if (!updated) return res.status(404).json({ error: 'task not found' });
      return res.status(200).json(updated);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'failed' });
    }
  }
```

- [ ] **Step 2: Билд + ручная проверка**

```bash
pnpm build && pm2 restart linkeon-api
# Возьми существующую задачу test-юзера
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"archived"}' \
  'https://my.linkeon.io/webhook/user/tasks/<UUID>' | jq .
```
Ожидание: 200, обновлённая запись.

Верни обратно:
```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"active"}' \
  'https://my.linkeon.io/webhook/user/tasks/<UUID>' | jq .
```

Невалидный статус:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"cancelled"}' \
  'https://my.linkeon.io/webhook/user/tasks/<UUID>'
```
Ожидание: 400.

- [ ] **Step 3: API-тест**

```js
  'PATCH /webhook/user/tasks/:id — без токена 401': async () => {
    const resp = await http.patch('/webhook/user/tasks/00000000-0000-0000-0000-000000000000',
      { status: 'archived' },
      { headers: { 'Content-Type': 'application/json' } },
    );
    assertStatus(resp, 401);
  },

  'PATCH /webhook/user/tasks/:id — невалидный статус 400': async () => {
    const token = await getTestAccessToken();
    const resp = await http.patch('/webhook/user/tasks/00000000-0000-0000-0000-000000000000',
      { status: 'cancelled' },
      { headers: { ...bearer(token), 'Content-Type': 'application/json' } },
    );
    assertStatus(resp, 400);
  },

  'PATCH /webhook/user/tasks/:id — несуществующий id 404': async () => {
    const token = await getTestAccessToken();
    const resp = await http.patch('/webhook/user/tasks/00000000-0000-0000-0000-000000000000',
      { status: 'archived' },
      { headers: { ...bearer(token), 'Content-Type': 'application/json' } },
    );
    assertStatus(resp, 404);
  },
```

- [ ] **Step 4: Прогнать тесты**

`node runner.js --suite api` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tasks/tasks.controller.ts tests/api.test.js
git commit -m "feat(tasks): PATCH /webhook/user/tasks/:id — смена статуса"
```

---

### Task 7: Бэк-деплой

- [ ] **Step 1: Push в main, дождаться CI (если есть)**

```bash
cd ~/Downloads/spirits_back
git push origin <branch>
```

- [ ] **Step 2: Деплой**

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```
Скрипт сам прогонит smoke (unit + API + Playwright). Если падают новые задачные тесты на проде — задача не выполнена, разбираем.

- [ ] **Step 3: Smoke на проде**

```bash
TOKEN="$(curl -s 'https://my.linkeon.io/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/70000000000/0000' | jq -r .access_token)"
curl -s -H "Authorization: Bearer $TOKEN" 'https://my.linkeon.io/webhook/user/tasks' | jq 'length'
```
Ожидание: число (0 если у test-юзера задач нет).

---

## Phase 2 — Frontend (`~/Downloads/spirits_front/`, этот репо)

Фронт-тестов в проекте нет, поэтому каждая задача завершается ручной QA-проверкой в браузере (`pnpm dev`).

### Task 8: Типы задач

**Files:**
- Create: `src/types/tasks.ts`

- [ ] **Step 1: Создать файл**

```ts
export type TaskStatus = 'active' | 'archived' | 'done';

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
  task: TaskListItem;
  events: TaskEvent[];
}
```

- [ ] **Step 2: Тип-чек**

```bash
cd ~/Downloads/spirits_front
pnpm lint
```
Ожидание: 0 ошибок касающихся этого файла.

- [ ] **Step 3: Commit**

```bash
git add src/types/tasks.ts
git commit -m "feat(tasks): TypeScript types for user-facing tasks"
```

---

### Task 9: ProfileTasks — каркас (fetch списка, loading / error / empty)

**Files:**
- Create: `src/components/profile/ProfileTasks.tsx`

- [ ] **Step 1: Создать каркас**

```tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import type { TaskListItem } from '../../types/tasks';

const ProfileTasks: React.FC = () => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<TaskListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutateError, setMutateError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const resp = await apiClient.get('/webhook/user/tasks');
      if (!resp.ok) {
        setLoadError(t('profile.tasks.loadError', 'Не удалось загрузить задачи'));
        return;
      }
      const data = await resp.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch {
      setLoadError(t('profile.tasks.loadError', 'Не удалось загрузить задачи'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeCount = tasks?.filter(t => t.status === 'active').length ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-900 inline-flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-forest-600" />
          {t('profile.tasks.title', 'Задачи')}
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-medium tabular-nums">
          {activeCount}
        </span>
      </div>

      {loading && !tasks ? (
        <div className="py-6 flex items-center justify-center">
          <Loader className="w-4 h-4 animate-spin text-forest-600" />
        </div>
      ) : loadError ? (
        <div className="py-4 px-4 text-sm text-amber-700 flex items-center justify-between gap-2">
          <span>{loadError}</span>
          <button onClick={load} className="px-2 py-0.5 border border-amber-300 rounded text-xs hover:bg-amber-50">
            {t('common.retry', 'Повторить')}
          </button>
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 px-4 text-center">
          {t('profile.tasks.empty', 'Задач пока нет. Они появляются автоматически, когда ты обсуждаешь с ассистентами текущие дела.')}
        </p>
      ) : (
        <div className="px-4 py-3 text-xs text-gray-400">
          {/* TaskRow's будут в Task 10 */}
          {tasks.length} задач загружено (рендер карточек — следующая задача).
        </div>
      )}
    </div>
  );
};

export default ProfileTasks;
```

- [ ] **Step 2: Запустить dev-сервер и проверить**

```bash
pnpm dev
```
Открыть `http://localhost:5173/profile` (залогиниться, если нужно). Должны видеть:
- При наличии задач — текст «N задач загружено».
- При пустом списке — empty message.
- При оффлайн-бэке — error с кнопкой «Повторить».

Пока компонент не подключён к `ProfileView` — добавим в Task 15. Для проверки в этой задаче — временно ставим его в `ProfileView` сами и убираем потом.

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/ProfileTasks.tsx
git commit -m "feat(profile-tasks): каркас компонента с fetch/loading/error/empty"
```

---

### Task 10: Свёрнутая карточка задачи (TaskRow)

**Files:**
- Modify: `src/components/profile/ProfileTasks.tsx`

- [ ] **Step 1: Добавить formatRelative-хелпер**

В начале файла (после импортов):
```tsx
const formatRelative = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'только что';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} дн назад`;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const statusBadge = (status: TaskStatus) => {
  if (status === 'active')   return { cls: 'bg-forest-50 text-forest-700', label: 'активна' };
  if (status === 'done')     return { cls: 'bg-gray-100 text-gray-600',     label: 'завершена' };
  return { cls: 'bg-gray-100 text-gray-500', label: 'архив' };
};
```

И импорт типа:
```tsx
import type { TaskListItem, TaskStatus } from '../../types/tasks';
```
И добавь `ChevronRight` в импорт `lucide-react`.

- [ ] **Step 2: Заменить placeholder рендером строк**

Заменить блок `{/* TaskRow's будут в Task 10 */}` на:
```tsx
        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {tasks
            .filter(t => t.status === 'active')
            .map(task => {
              const badge = statusBadge(task.status);
              return (
                <div key={task.id} className="w-full px-4 py-2.5 flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 truncate">{task.title}</span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {task.summary && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.summary}</p>
                    )}
                    {task.last_active_at && (
                      <p className="text-[10px] text-gray-400 mt-1">{formatRelative(task.last_active_at)}</p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
```

Пока показываем только активные (`done`/`archived` — в Task 13).

- [ ] **Step 3: Ручная QA**

`pnpm dev` → `/profile`. Должны видеть список активных задач (если есть). Карточки красивые, не разваливаются на узком экране.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/ProfileTasks.tsx
git commit -m "feat(profile-tasks): свёрнутая карточка задачи (TaskRow)"
```

---

### Task 11: Развёрнутая задача (детали + события)

**Files:**
- Modify: `src/components/profile/ProfileTasks.tsx`

- [ ] **Step 1: Добавить стейт expanded + детали**

В компоненте добавь после `const [error, setError] = useState<string | null>(null);`:
```tsx
const [expandedId, setExpandedId] = useState<string | null>(null);
const [details, setDetails] = useState<Record<string, TaskDetails | 'loading' | 'error'>>({});
```

И импорт типа: `import type { TaskListItem, TaskStatus, TaskDetails } from '../../types/tasks';`
И добавь `ChevronDown` в импорт `lucide-react`.

Функция тоггла:
```tsx
const toggle = async (id: string) => {
  if (expandedId === id) { setExpandedId(null); return; }
  setExpandedId(id);
  if (details[id] && details[id] !== 'error') return;
  setDetails(s => ({ ...s, [id]: 'loading' }));
  try {
    const resp = await apiClient.get(`/webhook/user/tasks/${id}?limit=30`);
    if (!resp.ok) {
      setDetails(s => ({ ...s, [id]: 'error' }));
      return;
    }
    const data: TaskDetails = await resp.json();
    setDetails(s => ({ ...s, [id]: data }));
  } catch {
    setDetails(s => ({ ...s, [id]: 'error' }));
  }
};
```

- [ ] **Step 2: Хелпер дат**

В файле:
```tsx
const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
```

- [ ] **Step 3: Сделать карточку кликабельной + рендер деталей**

Замени `<div key={task.id} className="w-full px-4 py-2.5 flex items-start gap-2">` на:
```tsx
<div key={task.id}>
  <button
    onClick={() => toggle(task.id)}
    className="w-full px-4 py-2.5 flex items-start gap-2 text-left hover:bg-gray-50 transition-colors"
  >
    {expandedId === task.id
      ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />}
    <div className="flex-1 min-w-0">
      {/* (тот же контент title/badge/summary/relative, что был) */}
    </div>
  </button>
  {expandedId === task.id && (
    <div className="px-8 pb-3 bg-gray-50/50 border-t border-gray-100">
      {details[task.id] === 'loading' && (
        <div className="py-3 flex items-center justify-center">
          <Loader className="w-3 h-3 animate-spin text-gray-400" />
        </div>
      )}
      {details[task.id] === 'error' && (
        <div className="py-2 flex items-center justify-between gap-2">
          <p className="text-xs text-red-600">{t('profile.tasks.detailsError', 'Не удалось загрузить детали')}</p>
          <button onClick={() => toggle(task.id)} className="px-2 py-0.5 border border-red-300 rounded text-xs text-red-700 hover:bg-red-50">
            {t('common.retry', 'Повторить')}
          </button>
        </div>
      )}
      {details[task.id] && details[task.id] !== 'loading' && details[task.id] !== 'error' && (() => {
        const d = details[task.id] as TaskDetails;
        return (
          <>
            {d.events.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  {t('profile.tasks.events', 'События')}
                </p>
                <div className="space-y-1">
                  {d.events.map(ev => (
                    <div key={ev.id} className="text-[11px] bg-white border border-gray-200 rounded p-2">
                      <p className="text-gray-700 whitespace-pre-wrap mb-1">{ev.content}</p>
                      <p className="text-[10px] text-gray-400">
                        {ev.agent_name || t('profile.tasks.assistantFallback', 'Ассистент')} · {formatDateTime(ev.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  )}
</div>
```

- [ ] **Step 4: Ручная QA**

`pnpm dev` → `/profile` → клик на задачу → видишь развёрнутый блок с событиями (имя ассистента + дата, без `kind`/`agent_id`). При оффлайн-бэке — error с retry.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileTasks.tsx
git commit -m "feat(profile-tasks): развёрнутая задача с событиями и agent_name"
```

---

### Task 12: Действия — Закрыть / Архивировать / Восстановить

**Files:**
- Modify: `src/components/profile/ProfileTasks.tsx`

- [ ] **Step 1: Добавить мутации**

Стейт in-flight операций:
```tsx
const [mutatingId, setMutatingId] = useState<string | null>(null);
```

Функция изменения статуса с optimistic update:
```tsx
const changeStatus = async (id: string, newStatus: TaskStatus) => {
  if (!tasks) return;
  setMutatingId(id);
  const prev = tasks;
  setTasks(tasks.map(tt => tt.id === id ? { ...tt, status: newStatus } : tt));
  try {
    const resp = await apiClient.patch(`/webhook/user/tasks/${id}`, { status: newStatus });
    if (!resp.ok) throw new Error('patch failed');
  } catch {
    setTasks(prev);
    setMutateError(t('profile.tasks.mutateError', 'Не удалось обновить статус'));
    setTimeout(() => setMutateError(null), 4000);
  } finally {
    setMutatingId(null);
  }
};
```

**Note:** `apiClient.patch(url, data)` уже реализован в `src/services/apiClient.ts` (строки 195-203). Сигнатура совместима.

- [ ] **Step 2: Action bar в развёрнутой задаче**

В блоке развёрнутой задачи, после `{d.events.length > 0 && (...)}`, добавь:
```tsx
<div className="mt-3 flex flex-wrap gap-2">
  {(() => {
    const cur = tasks.find(tt => tt.id === task.id);
    const status = cur?.status || 'active';
    if (status === 'active') {
      return (
        <>
          <button
            disabled={mutatingId === task.id}
            onClick={() => changeStatus(task.id, 'done')}
            className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 rounded text-xs text-gray-700 hover:bg-white disabled:opacity-50"
          >
            <Check className="w-3 h-3" />
            {t('profile.tasks.actions.close', 'Закрыть')}
          </button>
          <button
            disabled={mutatingId === task.id}
            onClick={() => changeStatus(task.id, 'archived')}
            className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 rounded text-xs text-gray-700 hover:bg-white disabled:opacity-50"
          >
            <Archive className="w-3 h-3" />
            {t('profile.tasks.actions.archive', 'Архивировать')}
          </button>
        </>
      );
    }
    return (
      <button
        disabled={mutatingId === task.id}
        onClick={() => changeStatus(task.id, 'active')}
        className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 rounded text-xs text-gray-700 hover:bg-white disabled:opacity-50"
      >
        <RotateCcw className="w-3 h-3" />
        {t('profile.tasks.actions.reopen', 'Восстановить')}
      </button>
    );
  })()}
</div>
```

И в импортах `lucide-react`: `Check, Archive, RotateCcw`.

- [ ] **Step 3: Mutate-error баннер (не блокирует список)**

Над списком (но внутри основной карточки секции, после заголовка/тогла, до `divide-y` контейнера) добавь:
```tsx
{mutateError && (
  <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">
    {mutateError}
  </div>
)}
```

Этот баннер показывается параллельно списку (не вместо), автоматически исчезает через 4 секунды (см. `setTimeout` в `changeStatus`).

- [ ] **Step 4: Ручная QA**

- Открой `/profile`, разверни активную задачу, нажми «Архивировать» → бейдж меняется, через секунду задача пропадает из списка активных (потому что фильтр).
- Сделай бэку 500 (например, временно поломай URL в `apiClient.patch`) и убедись, что rollback работает: задача остаётся active, появляется красный баннер «Не удалось обновить статус», через 4 сек уходит.
- Нажми «Восстановить» (когда сделаем тогл архива в следующей задаче) — статус возвращается.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileTasks.tsx
git commit -m "feat(profile-tasks): смена статуса (close/archive/reopen) с optimistic rollback"
```

---

### Task 13: Тогл «Показать завершённые и архив»

**Files:**
- Modify: `src/components/profile/ProfileTasks.tsx`

- [ ] **Step 1: Стейт тогла**

```tsx
const [showInactive, setShowInactive] = useState(false);
```

- [ ] **Step 2: Изменить фильтрацию рендера**

Замени `.filter(t => t.status === 'active')` на:
```tsx
.filter(t => showInactive ? true : t.status === 'active')
```

И добавь подсчёт неактивных:
```tsx
const inactiveCount = tasks?.filter(t => t.status !== 'active').length ?? 0;
```

- [ ] **Step 3: Добавить чекбокс в шапку секции**

Между заголовком и списком (под `border-b`):
```tsx
{tasks && inactiveCount > 0 && (
  <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50">
    <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
      <input
        type="checkbox"
        checked={showInactive}
        onChange={(e) => setShowInactive(e.target.checked)}
        className="w-3 h-3"
      />
      {t('profile.tasks.showInactive', 'Показать завершённые и архив')} ({inactiveCount})
    </label>
  </div>
)}
```

- [ ] **Step 4: Ручная QA**

- Если у юзера нет ни одной не-active задачи — тогл не виден.
- Если есть — клик показывает их в общем списке (с серыми бейджами).
- Сортировка не ломается.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileTasks.tsx
git commit -m "feat(profile-tasks): тогл «Показать завершённые и архив»"
```

---

### Task 14: i18n строки

**Files:**
- Modify: `src/i18n/locales/ru.json`
- Modify: `src/i18n/locales/en.json`

- [ ] **Step 1: Добавить ключи в ru.json**

В соответствующем месте (под `profile:`):
```json
"profile": {
  ...,
  "tasks": {
    "title": "Задачи",
    "empty": "Задач пока нет. Они появляются автоматически, когда ты обсуждаешь с ассистентами текущие дела.",
    "loadError": "Не удалось загрузить задачи",
    "detailsError": "Не удалось загрузить детали",
    "mutateError": "Не удалось обновить статус",
    "events": "События",
    "assistantFallback": "Ассистент",
    "showInactive": "Показать завершённые и архив",
    "actions": {
      "close": "Закрыть",
      "archive": "Архивировать",
      "reopen": "Восстановить"
    }
  }
}
```
Если в `ru.json` нет общего `common.retry` — добавь:
```json
"common": { "retry": "Повторить" }
```

- [ ] **Step 2: Добавить ключи в en.json**

```json
"profile": {
  ...,
  "tasks": {
    "title": "Tasks",
    "empty": "No tasks yet. They appear automatically as you discuss ongoing matters with assistants.",
    "loadError": "Failed to load tasks",
    "detailsError": "Failed to load details",
    "mutateError": "Failed to update status",
    "events": "Events",
    "assistantFallback": "Assistant",
    "showInactive": "Show completed and archived",
    "actions": {
      "close": "Close",
      "archive": "Archive",
      "reopen": "Reopen"
    }
  }
}
```

- [ ] **Step 3: Проверка**

Переключи язык в Settings → проверь, что строки переведены.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/ru.json src/i18n/locales/en.json
git commit -m "i18n(profile-tasks): RU/EN строки для раздела «Задачи»"
```

---

### Task 15: Интеграция в `ProfileView`

**Files:**
- Modify: `src/components/profile/ProfileView.tsx`

- [ ] **Step 1: Импорт**

В начале файла:
```tsx
import ProfileTasks from './ProfileTasks';
```

- [ ] **Step 2: Размещение в JSX**

Найди место в JSX `ProfileView`, где заканчивается блок с entity-карточками (values / beliefs / desires / intents / interests / skills) и до footer-кнопок (LogOut / Delete). Вставь:
```tsx
<ProfileTasks />
```
Обычно это либо в общем grid'е с теми же отступами, либо в обёртке `space-y-N` — повтори существующий паттерн соседних блоков.

- [ ] **Step 3: Ручная QA — полный сценарий**

`pnpm dev` → `/profile`:
1. Видишь секцию «Задачи» между entity-карточками и кнопками внизу.
2. Empty / loading / список — все три состояния выглядят прилично.
3. Разворачивание задачи показывает события с именами ассистентов.
4. Все три action работают, бэйджи обновляются.
5. Тогл «Показать завершённые и архив» показывает их.
6. Mobile (Chrome DevTools 375px) — action bar wrap'ит, никаких overflow.
7. Switching язык → строки переводятся.
8. Ошибки сети (Network throttling → Offline) → видны error-сообщения с retry.

- [ ] **Step 4: Commit**

```bash
git add src/components/profile/ProfileView.tsx
git commit -m "feat(profile): подключаю секцию «Задачи»"
```

---

### Task 16: Фронт-деплой

- [ ] **Step 1: Push**

```bash
cd ~/Downloads/spirits_front
git push origin <branch>
```

- [ ] **Step 2: Деплой через `deploy.sh`**

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```
Скрипт сам забилдит фронт, синкнет, перезапустит PM2 и прогонит smoke (включая Playwright).

- [ ] **Step 3: Проверка на проде**

Открой `https://my.linkeon.io/profile` (войди по test-phone). Прогон по чек-листу из Step 3 предыдущей задачи.

- [ ] **Step 4: Финальный commit/tag (опционально)**

```bash
git tag profile-tasks-mvp && git push --tags
```

---

## Self-review checklist (для writing-plans)

- ✅ Каждая задача — 4-5 шагов, бит-сайз.
- ✅ TDD на бэке: тест → fail → impl → pass → commit.
- ✅ Фронт-тестов нет, заменяем ручной QA с конкретным чек-листом.
- ✅ Каждая API-задача снабжена curl-проверкой.
- ✅ Spec coverage:
  - размещение в `/profile` — Task 15
  - 3 эндпоинта — Tasks 4/5/6
  - смена статуса (close/archive/reopen) — Task 12
  - тогл архив+done — Task 13
  - сортировка active first — Task 1
  - ownership check — Tasks 2/3
  - agent_name join — Task 2
  - оптимистичный апдейт + rollback — Task 12
  - empty/loading/error states — Task 9
  - i18n — Task 14
- ✅ Типы консистентны: `TaskStatus = active|archived|done` везде.
- ✅ Нет TBD/TODO/«similar to».

---

## Открытые вопросы (могут всплыть при выполнении)

1. **Имя таблицы агентов.** В `getTaskFullForUser` join'ится с `agents.id` → `agents.name`. Если в реальной БД таблица называется иначе — поправить в Task 2 Step 3.
2. **`getTestAccessToken()` в API-тестах** — найти существующий хелпер в `tests/` (вероятно в `e2e.test.js` или `config.js`). Использовать его, не плодить дубликат.
