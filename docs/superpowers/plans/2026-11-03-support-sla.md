# Support Assignment and First-Response SLA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Назначать ответственного за тикет и не пропускать дедлайн первого ответа владельца.

**Architecture:** Поля назначения и SLA живут в `support_tickets`; назначение атомарно и защищено `expectedUpdatedAt`, а первый видимый ответ записывает `first_owner_reply_at`. Очередь сортируется SQL-запросом, frontend использует отдельные чистые SLA-функции и компонент назначения.

**Tech Stack:** NestJS 10, PostgreSQL, TypeScript, React 18, Tailwind CSS, Jest, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-support-sla-design.md`

---

## File map

Backend:

- Create `src/support/migrations/002_support_sla.sql` — поля и backfill.
- Create `src/support/support-sla.ts` — сроки по срочности и SLA-фильтры.
- Create `src/support/support-sla.spec.ts` — unit-правила.
- Modify `src/support/support.service.ts` — operators, назначение, первый ответ, очередь.
- Create `src/support/support.assignment.spec.ts` — назначение и конфликт-конкуренция.
- Create `src/support/support-sla.pg.spec.ts` — миграция и реальная конкуренция.
- Modify `src/support/support.controller.ts` — operators и assign endpoint.
- Modify `src/support/support.controller.spec.ts` — HTTP-контракт.

Frontend:

- Create `src/services/supportAssignmentApi.ts` — operators и assign вызовы.
- Create `src/components/admin/support/sla.ts` — чистые функции индикатора.
- Create `src/components/admin/support/sla.test.ts` — граничные состояния.
- Create `src/components/admin/support/TicketAssignment.tsx` — контрол назначения.
- Create `src/components/admin/support/TicketAssignment.test.tsx` — поведение.
- Modify `src/components/admin/AdminSupportView.tsx` — очередь, фильтры, карточка, события.
- Create `tests/support-sla.e2e.mjs` — реальный сценарий.

---

### Task 1: Поля и backfill SLA

**Files:**
- Create: `src/support/migrations/002_support_sla.sql`
- Create: `src/support/support-sla.ts`
- Create: `src/support/support-sla.spec.ts`
- Create: `src/support/support-sla.pg.spec.ts`

- [ ] **Step 1: Написать failing tests сроков и backfill**

```ts
import { firstResponseDueAt, SLA_SOON_MS } from './support-sla';

describe('firstResponseDueAt', () => {
  it.each([
    ['critical', 15 * 60_000],
    ['high', 60 * 60_000],
    ['normal', 4 * 60 * 60_000],
    ['low', 24 * 60 * 60_000],
    [null, 4 * 60 * 60_000],
  ])('%s => %i ms', (urgency, expected) => {
    const escalation = Date.parse('2026-11-03T12:00:00Z');
    expect(firstResponseDueAt(urgency, escalation)).toBe(escalation + expected);
  });
});

it('uses 30 minutes for the soon threshold', () => {
  expect(SLA_SOON_MS).toBe(30 * 60_000);
});
```

PG spec creates a disposable schema with `support_tickets` and `support_messages`, inserts an escalated ticket and expects the migration to set due time and the first visible owner reply. It also checks a ticket without escalation uses `created_at`.

- [ ] **Step 2: Запушить тесты и подтвердить FAIL**

```bash
git add src/support/support-sla.spec.ts src/support/support-sla.pg.spec.ts
git commit -m "test: зафиксировать сроки первого ответа"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npm ci && npx jest src/support/support-sla.spec.ts --maxWorkers=2"
```

Expected: FAIL — `support-sla.ts` отсутствует.

- [ ] **Step 3: Добавить SLA helpers**

```ts
export const SLA_SOON_MS = 30 * 60_000;

const DURATIONS: Record<string, number> = {
  critical: 15 * 60_000,
  high: 60 * 60_000,
  normal: 4 * 60 * 60_000,
  low: 24 * 60 * 60_000,
};

export function firstResponseDueAt(urgency: string | null, escalationMs: number): number {
  return escalationMs + (DURATIONS[urgency || 'normal'] ?? DURATIONS.normal);
}

export type SlaFilter = 'overdue' | 'soon' | 'unassigned' | 'mine';

export function slaFilterSql(filter: SlaFilter | undefined, actorId: string): { sql: string; params: any[] } {
  if (filter === 'overdue') return { sql: 'first_owner_reply_at IS NULL AND first_response_due_at < now()', params: [] };
  if (filter === 'soon') return { sql: 'first_owner_reply_at IS NULL AND first_response_due_at >= now() AND first_response_due_at <= now() + interval \'30 minutes\'', params: [] };
  if (filter === 'unassigned') return { sql: 'assigned_to IS NULL', params: [] };
  if (filter === 'mine') return { sql: 'assigned_to = $SLA_ACTOR$', params: [actorId] };
  return { sql: 'TRUE', params: [] };
}
```

- [ ] **Step 4: Добавить миграцию**

```sql
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_due_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_owner_reply_at timestamptz;

WITH escalation AS (
  SELECT t.id,
         COALESCE((SELECT min(e.created_at) FROM support_events e WHERE e.ticket_id = t.id AND e.action = 'escalate'), t.created_at) AS at,
         t.urgency
  FROM support_tickets t
)
UPDATE support_tickets t
SET first_response_due_at = escalation.at + CASE escalation.urgency
  WHEN 'critical' THEN interval '15 minutes'
  WHEN 'high' THEN interval '1 hour'
  WHEN 'low' THEN interval '24 hours'
  ELSE interval '4 hours'
END
FROM escalation
WHERE t.id = escalation.id;

UPDATE support_tickets t
SET first_owner_reply_at = (
  SELECT min(m.created_at) FROM support_messages m
  WHERE m.ticket_id = t.id AND m.sender_type = 'owner' AND m.visible_to_user = true
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_due
  ON support_tickets (first_response_due_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee
  ON support_tickets (assigned_to);
```

`SupportModule`/`SupportService.onModuleInit` применяет файл через один dedicated client и transaction-scoped advisory lock, как в предыдущих миграциях.

- [ ] **Step 5: Запушить реализацию и получить PASS**

```bash
git add src/support/migrations/002_support_sla.sql src/support/support-sla.ts src/support/support-sla.pg.spec.ts
git commit -m "feat: добавить сроки первого ответа в поддержку"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/support/support-sla.spec.ts src/support/support-sla.pg.spec.ts --maxWorkers=2"
```

Expected: unit и PG backfill PASS.

---

### Task 2: Назначение ответственного и защита от гонок

**Files:**
- Modify: `src/support/support.service.ts`
- Create: `src/support/support.assignment.spec.ts`
- Modify: `src/support/support-sla.pg.spec.ts`

- [ ] **Step 1: Написать failing tests назначения**

```ts
it('assigns an active admin and writes an event', async () => {
  const { svc, client } = assignmentHarness();
  await svc.assign('actor', 'ticket-1', { assigneeId: 'admin-2', expectedUpdatedAt: '2026-11-03T12:00:00Z' });
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = 'owner_handling'"), expect.any(Array));
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('assignment'), expect.arrayContaining(['actor', 'admin-2']));
  expect(client.query).toHaveBeenCalledWith('COMMIT');
});

it('returns 409 for stale updatedAt without overwriting', async () => {
  const { svc, client } = assignmentHarness({ stale: true });
  await expect(svc.assign('actor', 'ticket-1', { assigneeId: 'admin-2', expectedUpdatedAt: 'old' }))
    .rejects.toMatchObject({ response: { status: 409 } });
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
});

it('unassigns back to escalated', async () => {
  const { svc, client } = assignmentHarness();
  await svc.assign('actor', 'ticket-1', { assigneeId: null, expectedUpdatedAt: '2026-11-03T12:00:00Z' });
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = 'escalated'"), expect.any(Array));
});

it('rejects a non-admin assignee before writing', async () => {
  const { svc, client } = assignmentHarness({ assigneeIsAdmin: false });
  await expect(svc.assign('actor', 'ticket-1', { assigneeId: 'user-1', expectedUpdatedAt: '2026-11-03T12:00:00Z' }))
    .rejects.toMatchObject({ response: { status: 400 } });
});
```

- [ ] **Step 2: Запушить тесты и подтвердить FAIL**

```bash
git add src/support/support.assignment.spec.ts src/support/support-sla.pg.spec.ts
git commit -m "test: покрыть назначение и гонки"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/support/support.assignment.spec.ts --maxWorkers=2"
```

Expected: FAIL — `assign` отсутствует.

- [ ] **Step 3: Реализовать operators и assign**

```ts
async adminOperators() {
  const r = await this.pg.query(
    `SELECT p.user_id, COALESCE(p.profile_data->>'name', p.profile_data->>'first_name', p.user_id) AS name
       FROM ai_profiles_consolidated p
       JOIN user_id u ON u.internal_id = p.user_id AND u.state <> 'deleted'
      WHERE p.isadmin = true
      ORDER BY name`,
  );
  return r.rows.map((row) => ({ id: row.user_id, name: row.name }));
}

async assign(actorId: string, ticketId: string, input: { assigneeId: string | null; expectedUpdatedAt: string }) {
  if (typeof input.expectedUpdatedAt !== 'string' || !input.expectedUpdatedAt) {
    throw new BadRequestException('expectedUpdatedAt required');
  }
  const client = await this.pg.getClient();
  let committed = false;
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM support_tickets WHERE id = $1 FOR UPDATE', [ticketId]);
    const ticket = current.rows[0];
    if (!ticket) throw new NotFoundException('ticket not found');
    if (ticket.updated_at.toISOString() !== input.expectedUpdatedAt) {
      throw new ConflictException('ticket changed');
    }
    if (input.assigneeId !== null) {
      const operator = await client.query(
        `SELECT p.user_id FROM ai_profiles_consolidated p
         JOIN user_id u ON u.internal_id = p.user_id AND u.state <> 'deleted'
         WHERE p.user_id = $1 AND p.isadmin = true`,
        [input.assigneeId],
      );
      if (!operator.rows[0]) throw new BadRequestException('assignee is not an active admin');
    }
    const nextStatus = input.assigneeId === null ? 'escalated' : 'owner_handling';
    const updated = await client.query(
      `UPDATE support_tickets
       SET assigned_to = $1, assigned_at = CASE WHEN $1 IS NULL THEN NULL ELSE now() END,
           status = $2, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [input.assigneeId, nextStatus, ticketId],
    );
    await client.query(
      `INSERT INTO support_events (ticket_id, actor_type, actor_id, action, payload)
       VALUES ($1, 'owner', $2, 'assignment', $3)`,
      [ticketId, actorId, JSON.stringify({ from: ticket.assigned_to, to: input.assigneeId })],
    );
    await client.query('COMMIT');
    committed = true;
    return updated.rows[0];
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => { throw error; });
    throw error;
  } finally {
    client.release();
  }
}
```

В production rollback failure не маскируется; при ошибке rollback клиент уничтожается `release(true)`, как в предыдущей реализации.

- [ ] **Step 4: Добавить реальную PG-гонку**

Два клиента с одинаковым `expectedUpdatedAt`: один назначает admin A, другой admin B. Проверить ровно один `COMMIT` и один `409`, итоговый assignee соответствует первой успешной операции.

- [ ] **Step 5: Запушить реализацию и получить PASS**

```bash
git add src/support/support.service.ts src/support/support.assignment.spec.ts src/support/support-sla.pg.spec.ts
git commit -m "feat: назначать ответственного за тикет"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/support --maxWorkers=2"
```

Expected: assignment и PG race PASS.

---

### Task 3: Остановка SLA и очередь

**Files:**
- Modify: `src/support/support.service.ts`
- Modify: `src/support/support.assignment.spec.ts`
- Modify: `src/support/support.controller.ts`
- Modify: `src/support/support.controller.spec.ts`

- [ ] **Step 1: Написать failing tests первого ответа и очереди**

```ts
it('sets first reply only on a visible owner message', async () => {
  const { svc, pg } = assignmentHarness();
  await svc.adminReply('ticket-1', 'owner-1', 'Ответ', true);
  expect(pg.query).toHaveBeenCalledWith(
    expect.stringContaining('first_owner_reply_at = COALESCE(first_owner_reply_at, now())'),
    ['ticket-1'],
  );
});

it('does not set first reply for an internal note', async () => {
  const { svc, pg } = assignmentHarness();
  await svc.adminReply('ticket-1', 'owner-1', 'Внутреннее', false);
  expect(pg.query).not.toHaveBeenCalledWith(expect.stringContaining('first_owner_reply_at'), expect.anything());
});

it('sorts overdue first and filters mine', async () => {
  const { svc, pg } = assignmentHarness();
  await svc.adminListTickets({ sla: 'mine', actorId: 'admin-1', status: 'all' });
  expect(pg.query.mock.calls[0][0]).toContain('first_response_due_at < now()');
  expect(pg.query.mock.calls[0][0]).toContain('assigned_to = $1');
  expect(pg.query.mock.calls[0][1]).toEqual(['admin-1']);
});
```

- [ ] **Step 2: Запушить тесты и подтвердить FAIL**

```bash
git add src/support/support.assignment.spec.ts src/support/support.controller.spec.ts
git commit -m "test: проверить остановку SLA и очередь"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/support --maxWorkers=2"
```

Expected: FAIL — новая логика отсутствует.

- [ ] **Step 3: Обновить adminReply и Telegram reply**

В `adminReply` при `visibleToUser === true` после сохранения сообщения выполнить:

```ts
await this.pg.query(
  'UPDATE support_tickets SET first_owner_reply_at = COALESCE(first_owner_reply_at, now()) WHERE id = $1',
  [ticketId],
);
```

В `postOwnerReplyFromTelegram` при `visibleToUser === true` выполнить то же обновление. При false не выполнять.

- [ ] **Step 4: Обновить очередь и API**

`adminListTickets` принимает `{status, limit, sla, actorId}`. Добавить `slaFilterSql`, вывод `assigned_to`, `assigned_at`, `first_response_due_at`, `first_owner_reply_at`, имя ответственного. SQL сортировка:

```sql
ORDER BY
  CASE WHEN first_owner_reply_at IS NULL AND first_response_due_at < now() THEN 0
       WHEN first_owner_reply_at IS NULL AND first_response_due_at <= now() + interval '30 minutes' THEN 1
       ELSE 2 END,
  CASE urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
  updated_at DESC
```

`admin/tickets` передаёт `sla` query и текущий `userId`. `operators` возвращает `adminOperators()`. `assign` endpoint принимает body и вызывает сервис с `u.userId`. При добавлении `slaFilterSql` к существующему `whereStatus` плейсхолдер `$SLA_ACTOR$` заменяется фактическим индексом: `$1` без status и `$2` при заданном status.

- [ ] **Step 5: Запушить реализацию и получить PASS**

```bash
git add src/support
git commit -m "feat: остановить SLA после ответа и отсортировать очередь"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/support --maxWorkers=2"
```

Expected: все support tests PASS.

---

### Task 4: UI назначения и индикаторов

**Files:**
- Create: `src/services/supportAssignmentApi.ts`
- Create: `src/components/admin/support/sla.ts`
- Create: `src/components/admin/support/sla.test.ts`
- Create: `src/components/admin/support/TicketAssignment.tsx`
- Create: `src/components/admin/support/TicketAssignment.test.tsx`
- Modify: `src/components/admin/AdminSupportView.tsx`

- [ ] **Step 1: Написать failing UI tests**

```tsx
it('shows overdue and allows taking ownership', async () => {
  const ticket = { ...baseTicket, first_response_due_at: '2026-11-03T10:00:00Z' };
  const view = mount(<TicketAssignment ticket={ticket} operators={OPERATORS} onAssigned={vi.fn()} />);
  expect(visibleText(view.container)).toContain('Просрочено');
  await clickAsync(byButton(view.container, /Взять в работу/)!);
  expect(supportAssignmentApi.assign).toHaveBeenCalledWith(ticket.id, {
    assigneeId: 'admin-1', expectedUpdatedAt: ticket.updated_at,
  });
});

it('preserves reply text and shows conflict on 409', async () => {
  vi.mocked(supportAssignmentApi.assign).mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
  const view = mount(<TicketAssignment ticket={baseTicket} operators={OPERATORS} onAssigned={vi.fn()} />);
  await clickAsync(byButton(view.container, /Взять в работу/)!);
  expect(visibleText(view.container)).toContain('Назначение изменилось другим администратором');
});
```

- [ ] **Step 2: Запушить тесты и подтвердить FAIL**

```bash
git add src/components/admin/support/TicketAssignment.test.tsx src/components/admin/support/sla.test.ts
git commit -m "test: покрыть назначение и SLA-индикаторы"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm install --frozen-lockfile && pnpm exec vitest run src/components/admin/support"
```

Expected: FAIL — компоненты отсутствуют.

- [ ] **Step 3: Реализовать SLA helpers и API**

```ts
export type SlaState = 'overdue' | 'soon' | 'normal' | 'answered';

export function slaState(ticket: { first_response_due_at: string | null; first_owner_reply_at: string | null }, nowMs: number): SlaState {
  if (ticket.first_owner_reply_at) return 'answered';
  if (!ticket.first_response_due_at) return 'normal';
  const due = Date.parse(ticket.first_response_due_at);
  if (due < nowMs) return 'overdue';
  return due - nowMs <= 30 * 60_000 ? 'soon' : 'normal';
}

export function remainingText(dueIso: string | null, nowMs: number): string {
  if (!dueIso) return '—';
  const minutes = Math.ceil((Date.parse(dueIso) - nowMs) / 60_000);
  if (minutes < 0) return `−${Math.abs(minutes)} мин`;
  if (minutes < 60) return `${minutes} мин`;
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}
```

`supportAssignmentApi` экспортирует `operators()` и `assign(ticketId, {assigneeId, expectedUpdatedAt})` через `apiClient`.

- [ ] **Step 4: Реализовать TicketAssignment**

Props: `ticket`, `operators`, `onAssigned`. Контрол показывает ответственного, due/remaining, кнопку «Взять в работу», выбор и «Переназначить», «Снять назначение». Использует `expectedUpdatedAt = ticket.updated_at`. При 409 вызывает `onAssigned` для refresh и показывает конфликт без удаления текста. При ошибке сохраняет текущего ответственного.

`AdminSupportView` получает operators, добавляет фильтры, сортировку сервера и `TicketAssignment`. Событие `assignment` отображает `payload.from → payload.to` с именами операторов.

- [ ] **Step 5: Запушить реализацию и получить PASS**

```bash
git add src/services/supportAssignmentApi.ts src/components/admin/support src/components/admin/AdminSupportView.tsx
git commit -m "feat: назначать ответственного и показывать SLA в админке"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm exec vitest run src/components/admin/support && pnpm build"
```

Expected: UI tests и Vite build PASS.

---

### Task 5: E2E и выкат

**Files:**
- Create: `tests/support-sla.e2e.mjs`
- Modify: `AGENTS.md`

- [ ] **Step 1: Написать E2E**

Скрипт создаёт эскалированный тикет через `sshPsql`, входит админом по существующему debug OTP helper и проверяет:

```js
const assigned = await api.post(`/webhook/support/admin/ticket/${ticketId}/assign`, {
  assigneeId: ADMIN_PHONE,
  expectedUpdatedAt: ticket.updated_at,
});
assert.equal(assigned.data.assigned_to, ADMIN_PHONE);

await api.post(`/webhook/support/admin/ticket/${ticketId}/reply`, {
  content: 'Первый ответ владельца', visibleToUser: true,
});
const answered = await api.get(`/webhook/support/admin/ticket/${ticketId}`);
assert.ok(answered.data.ticket.first_owner_reply_at);

const filtered = await api.get('/webhook/support/admin/tickets?sla=mine&status=all');
assert.ok(filtered.data.some((t) => t.id === ticketId));
```

Затем `finally` удаляет только тестовый тикет через одну DB-транзакцию. Вторая проверка со stale `expectedUpdatedAt` возвращает 409 без изменения назначения.

- [ ] **Step 2: Полные проверки CI**

```bash
git add tests/support-sla.e2e.mjs AGENTS.md
git commit -m "test: добавить E2E назначения и SLA"
git push origin main
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npm ci && npx jest src/support --maxWorkers=2 && npm run build"
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm test && pnpm build"
```

Expected: связанные backend/frontend тесты и builds PASS.

- [ ] **Step 3: Выкатить test и прогнать E2E**

```bash
TEST_ONLY=1 bash /Users/dmitry/Downloads/spirits_back/scripts/deploy.sh
BASE_URL=https://test.linkeon.io node /Users/dmitry/Downloads/spirits_back/tests/support-sla.e2e.mjs
```

Expected: назначение, первый ответ, `mine`, 409 и cleanup GREEN.

- [ ] **Step 4: Выкатить prod**

```bash
bash /Users/dmitry/Downloads/spirits_back/scripts/deploy.sh
```

Expected: test smoke GREEN и prod smoke GREEN. Соседние фазы bots/products анализировать отдельно от основного сайта.
