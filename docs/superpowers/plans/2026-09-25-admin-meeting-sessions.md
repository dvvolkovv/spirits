# Встречи в разделе «Звонки» админки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В разделе «Звонки» админки видны сессии всех площадок встреч: Google Meet, Zoom, Яндекс Телемост, Microsoft Teams, Taler ID и комнаты Linkeon. Они есть и в таблице по пользователям (с фильтром по площадке), и в новой ленте сессий под ней.

**Architecture:**
- **Бэкенд (`spirits_back`).** Одно условие выборки `callsWhere` на таблицу, итоги, разбивку по площадкам и ленту. Новая ручка `GET /webhook/admin/calls/sessions`. Одна форма сессии (`SESSION_COLUMNS` + `toCallSession`) у ленты и у карточки человека. Новые пометки `failed` и `live`.
- **Фронт (`spirits_front`).** Общий компонент строки `CallSessionItem`, лента `CallSessionsFeed`, кнопки площадок и переключатель «Тестовые» в `AdminCallsView`.

**Tech Stack:**
- бэк: NestJS 10, сырой SQL через `PgService`, jest + ts-jest;
- фронт: React 18, TypeScript, Tailwind 3.4, vitest 2 + jsdom (без testing-library), i18next (ru/en/pt).

**Спека:** [docs/superpowers/specs/2026-09-24-admin-meeting-sessions-design.md](../specs/2026-09-24-admin-meeting-sessions-design.md)

## Отклонения от кода плана по итогам ревью (25–26.09.2026)

Код Task 1–3 ниже — исходный. После ревью в ветке он отличается так:

- **Task 1:** комментарии в `callFlags.ts` уточнены. Названы оба префикса причины сбоя. Добавлена оговорка про `complete()`, перезаписывающий `failed`. «Короткий» для идущей сессии убран: без длительности он не срабатывал. Комментарий к прерванным звонкам исправлен: расшифровка у них бывает.
- **Task 2:**
  - у `callsWhere` нет второго параметра; разбивка строится как `callsWhere({ ...f, provider: null })`;
  - `days` проходит через `Number.isFinite`;
  - `PROVIDER_RE` — `/^[A-Za-z0-9_.-]{1,64}$/`;
  - добавлен тест «таблица, итоги и разбивка считаются по одному условию», проверенный нарочной поломкой.
- **Task 3:**
  - имя ассистента — `COALESCE(a.display_name, a.name)`;
  - `FROM` и `JOIN` сессии вынесены в константу `SESSION_FROM`;
  - лимиты всех трёх ручек проходят через `clampLimit(v, def, max)`;
  - `getUserCalls` сортирует `started_at DESC, id DESC`;
  - добавлен тест «лента и карточка отдают одну и ту же форму сессии» с точным списком ключей.
- **Task 4:**
  - тесты контроллера вызывают обработчики по именам `@Query('…')` через `ROUTE_ARGS_METADATA` (`viaRoute`), как это делает Nest, а не по позиции аргументов;
  - добавлен тест «таблица и лента читают одни и те же query-параметры»;
  - нарочная поломка `include_test` в `callsByUser` роняет оба теста;
  - в JSDoc `callSessions` — предупреждение о порядке маршрутов;
  - отдельный коммит поставил дату у цифры про прерванные сессии в `callFlags.ts`.
- **Числа тестов в `src/admin`:** 88 после Task 2, 97 после Task 3, 102 после Task 4.
- **Task 9 и 10 ниже уже исправлены.**
  - Прерванный звонок раскрывается, если `user_turns > 0`.
  - На потолке сервера (500) лента показывает подсказку вместо «Показать ещё».

---

## Как здесь работать — прочесть до Task 1

**Рабочие каталоги.** Все уже созданы; ветка `feat/admin-meeting-sessions` есть в обоих репозиториях.

| что | где |
|---|---|
| бэк, правки (мак) | `~/Downloads/spirits_back/.worktrees/admin-meetings` |
| фронт, правки (мак) | `~/Downloads/spirits_front/.worktrees/admin-meetings` |
| бэк, прогоны (нода) | `dv@85.192.61.231:~/ci/wt/admin-meetings-back` — detached, `npm ci` сделан |
| фронт, прогоны (нода) | `dv@85.192.61.231:~/ci/wt/admin-meetings-front` — detached, `pnpm install` сделан |

Чужие чекауты не трогать. Это общие `~/Downloads/spirits_back` и `~/Downloads/spirits_front` на маке, а также `~/ci/spirits_*`, `~/spirits_*` и `~/dev/*` на ноде. В них работают другие сессии, а `~/spirits_*` — это живой тестовый стенд. В общем CI-клоне бэка, кроме того, висит чужой изменённый `pnpm-lock.yaml`, из-за которого переключение коммита там отказывает. Поэтому под эту ветку заведены отдельные worktree на ноде.

**Прогоны.**
- **Бэк — только на ноде.** `jest` и `tsc` на маке запрещены (решение владельца от 15.08.2026). Цикл такой: коммит → `git push` ветки → на ноде `git checkout <sha>` → `npx jest`.
- **Фронт — один тестовый файл можно гонять локально.** Команда: `./node_modules/.bin/vitest run <файл>` из каталога ворктри. Через `pnpm vitest` не получится: pnpm 11 на маке падает на проверке зависимостей из-за непринятых build-скриптов esbuild. Полный прогон, `tsc` и сборка идут на ноде.
- **Каждая ssh-команда, которой нужен node, начинается с `source ~/.nvm/nvm.sh`.** Иначе node не найдётся.

**Базовые линии.** Сняты 25.09.2026 на `origin/main` (бэк `0848a51`, фронт `b69180a`):

| проверка | результат на `origin/main` |
|---|---|
| бэк, `npx jest src/admin` | 9 сюит, 80 тестов, всё зелёное |
| бэк, `npx tsc --noEmit -p tsconfig.json \| grep '^src/'` | 18 строк, в `src/admin` ноль; список лежит на ноде в `~/ci/wt/.tsc-back-base.txt` |
| фронт, `pnpm test` | 59 файлов, 764 теста, всё зелёное |
| фронт, `npx tsc --noEmit -p tsconfig.app.json` | 45 ошибок, в файлах звонков ноль |

Для фронта нужен именно `tsc -p tsconfig.app.json`: голый `tsc --noEmit` проверяет ноль файлов.

**Коммиты.**
- Перед каждым коммитом `git -C <ворктри> branch --show-current` должен показать `feat/admin-meeting-sessions`.
- Добавлять только перечисленные пути, никогда `git add -A`. `pnpm install` в ворктри фронта создаёт неотслеживаемый `pnpm-workspace.yaml`, его не коммитить.
- Каждый коммит заканчивается строкой `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Красные тесты коммитятся отдельно, с пометкой «— красные» в сообщении: так принято в репозитории.

**Не делать без явного слова владельца:**
- `deploy.sh` в любом виде (Task 14–15);
- удаление веток;
- force-push.

---

## Файлы

**Бэк** (`~/Downloads/spirits_back/.worktrees/admin-meetings`):

| файл | что меняется |
|---|---|
| `src/admin/callFlags.ts` | пометки `failed` и `live` |
| `src/admin/callFlags.spec.ts` | тесты этих пометок |
| `src/admin/admin.service.ts` | типы фильтров; `callsFilter`, `callsWhere`; `getCallsByUser` с площадкой, тестовыми и `byProvider`; `SESSION_COLUMNS`, `toCallSession`, `getCallSessions`; `getUserCalls` на общей форме сессии |
| `src/admin/admin.calls.spec.ts` | «Встречи» = все площадки; площадка параметром; тестовые; `byProvider` |
| `src/admin/admin.call-sessions.spec.ts` (новый) | лента |
| `src/admin/admin.user-calls.spec.ts` | общая форма сессии в карточке |
| `src/admin/admin.controller.ts` | параметры `provider` и `includeTest`, маршрут `admin/calls/sessions` |
| `src/admin/admin.calls-controller.spec.ts` (новый) | проводка параметров и объявление маршрута |

**Фронт** (`~/Downloads/spirits_front/.worktrees/admin-meetings`):

| файл | что меняется |
|---|---|
| `src/i18n/locales/{ru,en,pt}.json` | `admin.calls`: площадки, пометки, подсказка списания, заголовок карточки |
| `src/components/admin/callsLocales.test.ts` (новый) | новые ключи на месте во всех трёх локалях |
| `src/components/admin/callProviders.ts` + `.test.ts` (новые) | подписи площадок |
| `src/components/admin/callFlagLabels.ts` + `.test.ts` | пометки `failed` и `live` |
| `src/components/admin/CallSessionItem.tsx` + `.test.tsx` (новые) | строка сессии с раскрытием расшифровки |
| `src/components/admin/UserCallsList.tsx` | карточка человека рисует сессии через `CallSessionItem` |
| `src/components/admin/CallSessionsFeed.tsx` + `.test.tsx` (новые) | лента с «Показать ещё» |
| `src/components/admin/AdminCallsView.tsx` | фильтры, «Тестовые», плашка, лента |
| `src/components/admin/AdminCallsView.test.tsx` (новый) | что уходит в запрос при каждом фильтре |

---

### Task 1: Пометки «сбой» и «идёт сейчас» (бэк)

**Files:**
- Modify: `src/admin/callFlags.ts`
- Test: `src/admin/callFlags.spec.ts`

- [ ] **Step 1: Дописать красные тесты**

В `src/admin/callFlags.spec.ts` добавить три теста внутри `describe('callFlags', …)`: после теста `'короткий И молчаливый получает обе пометки'`, перед закрывающей `});` блока.

```ts
  it('сорвавшаяся встреча — «сбой», а не «человек молчал»', () => {
    // Бот не вошёл во встречу: реплик и длительности нет. Причина лежит в
    // саммари («Звонок не состоялся: …»), а «молчал» увело бы разбор не туда.
    expect(callFlags({ status: 'failed', duration_sec: null, transcript: null }))
      .toEqual(['failed']);
  });

  it('обрыв посреди разговора — тоже только «сбой»', () => {
    // Стенд, 22.09.2026: звук Телемоста оборвался на 161-й секунде после
    // восьми реплик. Строка без пометок выдала бы его за нормальный разговор.
    expect(callFlags({ status: 'failed', duration_sec: 161, transcript: реплики(8) }))
      .toEqual(['failed']);
  });

  it('идущая сессия не считается ни молчанием, ни коротким звонком', () => {
    // Длительности до завершения нет, а расшифровку voice-host дописывает по
    // ходу (VoiceCallService.progress) — пометки по ней врали бы.
    expect(callFlags({ status: 'active', duration_sec: null, transcript: реплики(1) }))
      .toEqual(['live']);
    expect(callFlags({ status: 'dialing', duration_sec: null, transcript: null }))
      .toEqual(['live']);
  });
```

- [ ] **Step 2: Закоммитить, запушить и убедиться, что тесты красные**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B branch --show-current
git -C $B add src/admin/callFlags.spec.ts
git -C $B commit -q -m "test(admin): пометки сбоя и идущей сессии — красные

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C $B push -q -u origin feat/admin-meeting-sessions
SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/admin/callFlags --maxWorkers=2 2>&1 | tail -40"
```

Ожидается FAIL: `Tests: 3 failed, 8 passed`. Старый код отдаёт:

| тест | получено | ждём |
|---|---|---|
| «сорвавшаяся встреча» | `["silent"]` | `["failed"]` |
| «обрыв посреди разговора» | `[]` | `["failed"]` |
| «идущая сессия» | `["nearly_silent"]` | `["live"]` |

- [ ] **Step 3: Реализовать**

В `src/admin/callFlags.ts` заменить строку

```ts
export type CallFlag = 'interrupted' | 'silent' | 'nearly_silent' | 'short';
```

на

```ts
export type CallFlag = 'interrupted' | 'failed' | 'live' | 'silent' | 'nearly_silent' | 'short';

/**
 * Статусы идущей сессии. Длительности у неё ещё нет, а расшифровку voice-host
 * дописывает по ходу (VoiceCallService.progress), так что «молчал» и
 * «короткий» считались бы по недописанному разговору.
 */
const LIVE_STATUSES = new Set(['dialing', 'active']);
```

В функции `callFlags` сразу после строки `if (call.status === 'interrupted') return ['interrupted'];` вставить:

```ts

  // Сорвавшаяся встреча: бот не вошёл или оборвался звук. Реплик может не
  // быть вовсе, но человек при этом не молчал — причина лежит в саммари
  // («Звонок не состоялся: …»).
  if (call.status === 'failed') return ['failed'];
  if (call.status && LIVE_STATUSES.has(call.status)) return ['live'];
```

- [ ] **Step 4: Закоммитить, запушить и убедиться, что тесты зелёные**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B branch --show-current
git -C $B add src/admin/callFlags.ts
git -C $B commit -q -m "feat(admin): пометки «сбой» и «идёт сейчас» у звонков и встреч

Сорвавшаяся встреча (бот не вошёл, оборвался звук) получала «человек
молчал», идущая — пометки по недописанной расшифровке.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C $B push -q
SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/admin/callFlags --maxWorkers=2 2>&1 | tail -8"
```

Ожидается PASS: `Tests: 11 passed`.

---

### Task 2: «Встречи» — все площадки; фильтр по площадке, тестовые, разбивка (бэк)

**Files:**
- Modify: `src/admin/admin.service.ts`: типы после импортов (после строки 9), блок `// --- Голосовые звонки ---` … конец `getCallsByUser` (строки 1530–1642)
- Test: `src/admin/admin.calls.spec.ts`

- [ ] **Step 1: Переписать фейковый pg и тест встреч, дописать новые тесты**

В `src/admin/admin.calls.spec.ts` четыре правки.

(1) В шапочном комментарии заменить пункт

```ts
 *  - встречи не подмешиваются к звонкам. Обе сущности живут в voice_calls и
 *    различаются только provider ('linkeon' против 'linkeon_room'). Без
 *    фильтра получасовая встреча выглядит как звонок и ломает средние;
```

на

```ts
 *  - встречи не подмешиваются к звонкам. Обе сущности живут в voice_calls и
 *    различаются только provider: 'linkeon' — звонок из приложения, всё
 *    остальное — встречи на площадках (комната Linkeon, Taler ID, Meet, Zoom,
 *    Teams, Телемост). Без фильтра получасовая встреча выглядит как звонок;
 *  - площадка уходит в SQL параметром, тестовые включаются по запросу, а
 *    разбивка по площадкам не сужается выбранной площадкой;
```

(2) Заменить `const ROWS_Q …`, `const TOTALS_Q …` и всю функцию `makePg` на:

```ts
const ROWS_Q = /GROUP BY c\.user_id/i;
const TOTALS_Q = /COUNT\(DISTINCT c\.user_id\)/i;
const BY_PROVIDER_Q = /GROUP BY c\.provider/i;

/** Фейковый pg: отвечает по форме запроса и запоминает SQL вместе с параметрами. */
function makePg(rows: any[], totals: any, byProvider: any[] = []) {
  const seen: string[] = [];
  const calls: Array<[string, any[] | undefined]> = [];
  return {
    seen,
    calls,
    /** Весь SQL одной строкой — по нему проверяем предикаты. */
    sql: () => seen.join(' | '),
    async query(sql: string, params?: any[]) {
      const flat = sql.replace(/\s+/g, ' ').trim();
      seen.push(flat);
      calls.push([flat, params]);
      if (TOTALS_Q.test(flat)) return { rows: [totals] };
      if (ROWS_Q.test(flat)) return { rows };
      if (BY_PROVIDER_Q.test(flat)) return { rows: byProvider };
      return { rows: [] };
    },
  } as any;
}
```

(3) Тест `'kind=meeting выбирает встречи, а не звонки'` заменить целиком на:

```ts
  it('kind=meeting собирает все площадки встреч, а не одну комнату Linkeon', async () => {
    // Раньше тут стояло provider = 'linkeon_room', и Taler ID, Meet, Zoom,
    // Телемост и Teams не попадали ни в одну вкладку, кроме «Все».
    const pg = makePg([ROW], TOTALS);
    const res = await service(pg).getCallsByUser({ kind: 'meeting' });

    expect(res.kind).toBe('meeting');
    expect(pg.sql()).toMatch(/c\.provider <> 'linkeon'/);
    expect(pg.sql()).not.toMatch(/linkeon_room/);
  });
```

(4) Перед тестом `'период ограничен сверху и снизу'` дописать:

```ts
  it('площадка уходит параметром, а не склейкой в SQL', async () => {
    const pg = makePg([ROW], TOTALS);
    const res = await service(pg).getCallsByUser({ kind: 'meeting', provider: 'zoom' });

    expect(res.provider).toBe('zoom');
    expect(pg.sql()).not.toMatch(/'zoom'/);
    const [rowsSql, rowsParams] = pg.calls.find(([s]: [string]) => ROWS_Q.test(s));
    expect(rowsSql).toMatch(/c\.provider = \$2/);
    expect(rowsParams).toEqual([30, 'zoom']);
  });

  it('площадка не по образцу отбрасывается целиком', async () => {
    // В SQL она и так ушла бы параметром; образец нужен, чтобы в ответ не
    // вернулась произвольная строка, выданная за выбранную площадку.
    const pg = makePg([ROW], TOTALS);
    const res = await service(pg).getCallsByUser({ kind: 'meeting', provider: "zoom' OR 1=1 --" });

    expect(res.provider).toBeNull();
    for (const [, params] of pg.calls) expect(params).toEqual([30]);
  });

  it('includeTest снимает фильтр тестовых аккаунтов', async () => {
    // Все встречи на проде 24.09.2026 — прогоны владельца с тестового номера.
    // Без этого переключателя раздел встреч на проде пуст.
    const pg = makePg([ROW], TOTALS);
    const res = await service(pg).getCallsByUser({ includeTest: true });

    expect(res.include_test).toBe(true);
    expect(pg.sql()).not.toMatch(/c\.user_id <> ALL/);
  });

  it('разбивка по площадкам не сужается выбранной площадкой', async () => {
    // Иначе после клика по «Zoom» остальные кнопки исчезли бы и вернуться к
    // ним было бы нельзя.
    const pg = makePg([ROW], TOTALS, [
      { provider: 'talerid', sessions: 43 },
      { provider: 'zoom', sessions: '2' },
    ]);
    const res = await service(pg).getCallsByUser({ kind: 'meeting', provider: 'zoom' });

    const [byProvSql, byProvParams] = pg.calls.find(([s]: [string]) => BY_PROVIDER_Q.test(s));
    expect(byProvSql).toMatch(/c\.provider <> 'linkeon'/);
    expect(byProvSql).not.toMatch(/c\.provider = \$/);
    expect(byProvParams).toEqual([30]);
    expect(res.byProvider).toEqual([
      { provider: 'talerid', sessions: 43 },
      { provider: 'zoom', sessions: 2 },
    ]);
  });
```

- [ ] **Step 2: Закоммитить, запушить и убедиться, что тесты красные**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B branch --show-current
git -C $B add src/admin/admin.calls.spec.ts
git -C $B commit -q -m "test(admin): встречи всех площадок, площадка и тестовые в разделе звонков — красные

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C $B push -q
SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/admin/admin.calls --maxWorkers=2 2>&1 | tail -40"
```

Ожидается FAIL: `Tests: 5 failed, 8 passed`. Должны упасть:
- «kind=meeting собирает все площадки» — в SQL всё ещё `linkeon_room`;
- «площадка уходит параметром» и «площадка не по образцу» — в ответе нет `provider`;
- «includeTest» — в ответе нет `include_test`;
- «разбивка по площадкам» — запроса по площадкам нет, `find` вернул `undefined`.

- [ ] **Step 3: Типы фильтров**

В `src/admin/admin.service.ts` сразу после строки `import { callFlags, countUserTurns } from './callFlags';` вставить:

```ts

/** Вкладка раздела «Звонки»: звонки из приложения, встречи на площадках или всё. */
export type CallKind = 'call' | 'meeting' | 'all';

/** Фильтры раздела «Звонки», как они приходят из query-параметров. */
export interface CallsQuery {
  days?: number;
  kind?: string;
  provider?: string | null;
  includeTest?: boolean;
  limit?: number;
}

/** Те же фильтры после разбора: вкладка известна, площадка проверена. */
export interface CallsFilter {
  days: number;
  kind: CallKind;
  provider: string | null;
  includeTest: boolean;
}
```

Экспорт обязателен: в `tsconfig.json` стоит `declaration: true`, и публичный метод с неэкспортированным типом параметра сломает `nest build` (TS4073).

- [ ] **Step 4: Условие выборки и новый `getCallsByUser`**

В `src/admin/admin.service.ts` заменить весь блок от строки `  // --- Голосовые звонки ---` до закрывающей `  }` метода `getCallsByUser` включительно. Сейчас это строки 1530–1642; после неё идёт пустая строка и `  /**` с текстом «Звонки одного человека для карточки в админке.». Новый блок:

```ts
  // --- Голосовые звонки и встречи ---

  /** Звонок из приложения. Всё остальное в voice_calls — встречи на площадках. */
  private static readonly CALL_PROVIDER = 'linkeon';

  /**
   * Образец идентификатора площадки. В SQL площадка и так уходит параметром;
   * образец нужен, чтобы в ответ не вернулась произвольная строка, выданная
   * за выбранную площадку.
   */
  private static readonly PROVIDER_RE = /^[a-z0-9_]{1,32}$/;

  /**
   * Фильтры раздела «Звонки» из query-параметров.
   *
   * Незнакомый kind схлопывается в 'call', а не снимает фильтр: иначе
   * произвольный ?kind= молча подмешал бы встречи в звонки. Проверка живёт
   * здесь одна — в контроллере она разъехалась бы при добавлении площадки.
   */
  private static callsFilter(opts: CallsQuery): CallsFilter {
    const kind: CallKind = opts.kind === 'meeting' || opts.kind === 'all' ? opts.kind : 'call';
    const provider =
      typeof opts.provider === 'string' && AdminService.PROVIDER_RE.test(opts.provider)
        ? opts.provider
        : null;
    return {
      days: Math.min(Math.max(opts.days ?? 30, 1), 365),
      kind,
      provider,
      includeTest: !!opts.includeTest,
    };
  }

  /**
   * Условие выборки сессий — одно на таблицу, итоги, разбивку по площадкам и
   * ленту. Разъехавшись, они показали бы разные наборы, и сумма колонок не
   * сошлась бы с итогом.
   *
   * Встречи — «всё, кроме звонка из приложения», а не перечень площадок:
   * новая площадка попадёт во встречи без правки этого места.
   *
   * withProvider=false — для разбивки по площадкам: выбранная площадка не
   * должна прятать остальные кнопки, иначе к ним не вернуться.
   */
  private static callsWhere(f: CallsFilter, withProvider = true): { where: string; params: any[] } {
    const params: any[] = [f.days];
    const parts = [`c.started_at >= now() - $1 * interval '1 day'`];
    if (f.kind === 'call') parts.push(`c.provider = '${AdminService.CALL_PROVIDER}'`);
    if (f.kind === 'meeting') parts.push(`c.provider <> '${AdminService.CALL_PROVIDER}'`);
    if (withProvider && f.provider) {
      params.push(f.provider);
      parts.push(`c.provider = $${params.length}`);
    }
    parts.push(AdminService.testFilter('c.user_id', f.includeTest));
    return { where: parts.join(' AND '), params };
  }

  /**
   * Звонки и встречи в разрезе пользователей: сколько их было и сколько за
   * это списано.
   *
   * Списаний два, и лежат они в разных таблицах: voice_calls.tokens_charged —
   * минуты разговора, voice_call_jobs.tokens_used — каждый вопрос ведущего
   * профильному ассистенту. Отдаём обе цифры раздельно и сумму: при разборе
   * крупного счёта первым делом надо понять, съели его минуты или консультации,
   * а по одной общей цифре этого не видно.
   *
   * Встречи и звонки живут в одной таблице и различаются только provider, так
   * что без фильтра получасовая встреча считалась бы звонком. kind выбирает
   * вкладку, provider — площадку внутри неё; byProvider кормит кнопки площадок.
   */
  async getCallsByUser(opts: CallsQuery = {}) {
    const f = AdminService.callsFilter(opts);
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const { where, params } = AdminService.callsWhere(f);

    // Консультации подтягиваем коррелированным подзапросом по call_id, а не
    // отдельным JOIN по user_id: иначе в выборку звонков приехали бы вопросы,
    // заданные тем же человеком на встрече.
    const consultSum = `(
      SELECT COALESCE(SUM(j.tokens_used), 0)
      FROM voice_call_jobs j WHERE j.call_id = c.id
    )`;
    const consultCount = `(
      SELECT COUNT(*) FROM voice_call_jobs j WHERE j.call_id = c.id
    )`;

    const rowsRes = await this.pg.query(
      `SELECT
         c.user_id,
         COUNT(*)::int AS calls,
         COALESCE(SUM(c.duration_sec), 0)::bigint AS duration_sec,
         COALESCE(SUM(c.tokens_charged), 0)::bigint AS tokens_call,
         COALESCE(SUM(${consultSum}), 0)::bigint AS tokens_consult,
         COALESCE(SUM(${consultCount}), 0)::int AS consults,
         MAX(c.started_at) AS last_call
       FROM voice_calls c
       WHERE ${where}
       GROUP BY c.user_id
       ORDER BY (COALESCE(SUM(c.tokens_charged), 0) + COALESCE(SUM(${consultSum}), 0)) DESC,
                calls DESC, c.user_id ASC
       LIMIT ${limit}`,
      params,
    );

    // Итоги считаем отдельным запросом, а не суммой строк: строки обрезаны
    // лимитом, и на большом хвосте подпись под таблицей врала бы в меньшую
    // сторону, оставаясь правдоподобной.
    const totalsRes = await this.pg.query(
      `SELECT
         COUNT(*)::int AS calls,
         COUNT(DISTINCT c.user_id)::int AS users,
         COALESCE(SUM(c.duration_sec), 0)::bigint AS duration_sec,
         COALESCE(SUM(c.tokens_charged), 0)::bigint AS tokens_call,
         COALESCE(SUM(${consultSum}), 0)::bigint AS tokens_consult
       FROM voice_calls c
       WHERE ${where}`,
      params,
    );
    const tot = totalsRes.rows[0] || {};

    // Сессии по площадкам — для кнопок фильтра на «Встречах». Считаются без
    // условия по выбранной площадке: иначе остальные кнопки пропали бы.
    const byProv = AdminService.callsWhere(f, false);
    const byProviderRes = await this.pg.query(
      `SELECT c.provider, COUNT(*)::int AS sessions
         FROM voice_calls c
        WHERE ${byProv.where}
        GROUP BY c.provider
        ORDER BY sessions DESC, c.provider ASC`,
      byProv.params,
    );

    const tokensCall = Number(tot.tokens_call) || 0;
    const tokensConsult = Number(tot.tokens_consult) || 0;

    return {
      days: f.days,
      kind: f.kind,
      provider: f.provider,
      include_test: f.includeTest,
      byUser: rowsRes.rows.map((r: any) => {
        const call = Number(r.tokens_call) || 0;
        const consult = Number(r.tokens_consult) || 0;
        return {
          user_id: r.user_id,
          calls: Number(r.calls) || 0,
          duration_sec: Number(r.duration_sec) || 0,
          tokens_call: call,
          tokens_consult: consult,
          tokens_total: call + consult,
          consults: Number(r.consults) || 0,
          last_call: r.last_call,
        };
      }),
      totals: {
        calls: Number(tot.calls) || 0,
        users: Number(tot.users) || 0,
        duration_sec: Number(tot.duration_sec) || 0,
        tokens_call: tokensCall,
        tokens_consult: tokensConsult,
        tokens_total: tokensCall + tokensConsult,
      },
      byProvider: byProviderRes.rows.map((r: any) => ({
        provider: String(r.provider),
        sessions: Number(r.sessions) || 0,
      })),
    };
  }
```

Контроллер пока передаёт `kind` с приведением к `'call' | 'meeting' | 'all'` — это совместимо с `kind?: string`, его правит Task 4.

- [ ] **Step 5: Закоммитить, запушить и убедиться, что тесты зелёные**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B branch --show-current
git -C $B add src/admin/admin.service.ts
git -C $B commit -q -m "feat(admin): «Встречи» в разделе звонков — все площадки, фильтр площадки и тестовых

Вкладка «Встречи» смотрела только на linkeon_room: Taler ID, Meet, Zoom,
Телемост и Teams не попадали никуда, кроме «Все». Теперь встречи — всё,
кроме звонка из приложения; площадка уходит параметром; includeTest снимает
фильтр тестовых (все встречи на проде — прогоны владельца); byProvider
считается без выбранной площадки. Условие выборки одно на все запросы.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C $B push -q
SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/admin --maxWorkers=2 2>&1 | tail -8"
```

Ожидается PASS: `Test Suites: 9 passed`, `Tests: 87 passed` (80 базовых + 3 из Task 1 + 4 из этой задачи).

---

### Task 3: Лента сессий и одна форма сессии (бэк)

**Files:**
- Create: `src/admin/admin.call-sessions.spec.ts`
- Modify: `src/admin/admin.user-calls.spec.ts`
- Modify: `src/admin/admin.service.ts` — JSDoc и метод `getUserCalls`, от `/** Звонки одного человека для карточки в админке.` до строки перед `/** Расшифровка одного звонка — по клику из списка. */`

- [ ] **Step 1: Спек ленты — красный**

Создать `src/admin/admin.call-sessions.spec.ts`:

```ts
/**
 * Лента сессий раздела «Звонки»: по строке на звонок или встречу.
 *
 * Что здесь закреплено:
 *  - лента и её total считаются по тому же условию, что таблица: разойдясь,
 *    они показали бы «показано 50 из 131», когда над таблицей 140;
 *  - расшифровка в ленту не едет: она тяжёлая и нужна по клику;
 *  - списание разложено так же, как в таблице: разговор + консультации;
 *  - сорвавшаяся встреча помечена сбоем, а не молчанием.
 */
import { AdminService } from './admin.service';

const FEED_Q = /ORDER BY c\.started_at DESC, c\.id DESC/i;
const TOTAL_Q = /COUNT\(\*\)::int AS total/i;

/** Внешнее условие запроса — то, что после WHERE у voice_calls c. */
const outerWhere = (sql: string) =>
  sql.match(/FROM voice_calls c(?: LEFT JOIN agents a ON a\.id = c\.agent_id)? WHERE (.*?)(?: GROUP BY | ORDER BY | LIMIT |$)/)?.[1];

/** Фейковый pg: лента отдаёт rows, счётчик — total; запоминает SQL и параметры. */
function makePg(rows: any[], total: number) {
  const calls: Array<[string, any[] | undefined]> = [];
  return {
    calls,
    async query(sql: string, params?: any[]) {
      const flat = sql.replace(/\s+/g, ' ').trim();
      calls.push([flat, params]);
      if (FEED_Q.test(flat)) return { rows };
      if (TOTAL_Q.test(flat)) return { rows: [{ total }] };
      return { rows: [] };
    },
  };
}

const service = (pg: any) => new (AdminService as any)(pg);

const ZOOM_OK = {
  id: 'c-1', user_id: '79236230446', provider: 'zoom', agent_name: 'Роман',
  started_at: '2026-09-16T09:46:31Z', duration_sec: 117, status: 'completed',
  model: 'gpt-realtime-2.1', summary: 'Обсуждали погоду',
  transcript: [
    { ts: 1, role: 'assistant', text: 'Здравствуйте' },
    { ts: 2, role: 'user', text: 'Какая погода?' },
    { ts: 3, role: 'user', text: 'В Москве' },
    { ts: 4, role: 'user', text: 'Спасибо' },
  ],
  tokens_charged: 6241, tokens_consult: '1100', consults: 2,
};

const TELEMOST_FAILED = {
  id: 'c-2', user_id: '79030169187', provider: 'telemost', agent_name: 'Роман',
  started_at: '2026-09-22T10:00:00Z', duration_sec: null, status: 'failed', model: null,
  summary: 'Звонок не состоялся: бот Attendee: fatal_error (could_not_join_meeting)',
  transcript: null, tokens_charged: 0, tokens_consult: '0', consults: 0,
};

describe('AdminService.getCallSessions', () => {
  it('сессия несёт площадку, ассистента и списание по частям', async () => {
    const res = await service(makePg([ZOOM_OK], 1)).getCallSessions({ kind: 'all' });

    expect(res.sessions[0]).toMatchObject({
      id: 'c-1', provider: 'zoom', agent_name: 'Роман',
      tokens_call: 6241, tokens_consult: 1100, tokens_total: 7341, consults: 2,
      user_turns: 3, flags: [],
    });
  });

  it('расшифровка в ленту не едет', async () => {
    const res = await service(makePg([ZOOM_OK], 1)).getCallSessions({});
    expect(res.sessions[0]).not.toHaveProperty('transcript');
  });

  it('сорвавшаяся встреча помечена сбоем', async () => {
    const res = await service(makePg([TELEMOST_FAILED], 1)).getCallSessions({ kind: 'meeting' });
    expect(res.sessions[0].flags).toEqual(['failed']);
  });

  it('лента и её total считаются по одному условию', async () => {
    const pg = makePg([ZOOM_OK], 131);
    const res = await service(pg).getCallSessions({ kind: 'meeting', provider: 'zoom', includeTest: true });

    const feed = pg.calls.find(([s]) => FEED_Q.test(s))!;
    const total = pg.calls.find(([s]) => TOTAL_Q.test(s))!;
    expect(outerWhere(feed[0])).toMatch(/c\.provider <> 'linkeon'/);
    expect(outerWhere(feed[0])).toBe(outerWhere(total[0]));
    expect(feed[1]).toEqual(total[1]);
    expect(feed[1]).toEqual([30, 'zoom']);
    expect(res.total).toBe(131);
  });

  it('тестовые аккаунты исключены, пока их не попросили', async () => {
    const pg = makePg([], 0);
    await service(pg).getCallSessions({});
    expect(pg.calls[0][0]).toMatch(/c\.user_id <> ALL/);

    const pg2 = makePg([], 0);
    const res = await service(pg2).getCallSessions({ includeTest: true });
    expect(pg2.calls[0][0]).not.toMatch(/c\.user_id <> ALL/);
    expect(res.include_test).toBe(true);
  });

  it('лимит: по умолчанию 50, прижат к 1…500, нечисло даёт 50', async () => {
    const limitOf = async (limit?: number) => {
      const pg = makePg([], 0);
      const res = await service(pg).getCallSessions({ limit });
      const feed = pg.calls.find(([s]) => FEED_Q.test(s))!;
      return { echoed: res.limit, sql: feed[0].match(/LIMIT (\d+)/)?.[1] };
    };
    expect(await limitOf(undefined)).toEqual({ echoed: 50, sql: '50' });
    expect(await limitOf(0)).toEqual({ echoed: 1, sql: '1' });
    expect(await limitOf(9999)).toEqual({ echoed: 500, sql: '500' });
    expect(await limitOf(NaN)).toEqual({ echoed: 50, sql: '50' });
  });

  it('ассистент подтянут из agents, консультации — по call_id', async () => {
    const pg = makePg([], 0);
    await service(pg).getCallSessions({});
    const feed = pg.calls.find(([s]) => FEED_Q.test(s))!;
    expect(feed[0]).toMatch(/LEFT JOIN agents a ON a\.id = c\.agent_id/);
    expect(feed[0]).toMatch(/call_id = c\.id/);
  });
});
```

- [ ] **Step 2: Тест общей формы в карточке — красный**

В `src/admin/admin.user-calls.spec.ts` внутри `describe('getUserCalls', …)`, после теста `'user_id уходит параметром, а не склейкой в SQL'`, дописать:

```ts
  it('отдаёт ту же форму сессии, что и лента раздела', async () => {
    pg.query.mockResolvedValue({
      rows: [{
        id: 'c-9', user_id: '79030169187', provider: 'talerid', agent_name: 'Роман',
        started_at: '2026-09-21T11:00:00Z', duration_sec: 712, status: 'completed',
        model: 'gpt-realtime', summary: 'Итоги встречи', transcript: [],
        tokens_charged: 7200, tokens_consult: '1100', consults: 2,
      }],
    });

    const r = await svc.getUserCalls('79030169187');
    const [sql] = pg.query.mock.calls[0];

    expect(sql).toMatch(/LEFT JOIN agents a ON a\.id = c\.agent_id/);
    expect(r.calls[0]).toMatchObject({
      provider: 'talerid', agent_name: 'Роман',
      tokens_call: 7200, tokens_consult: 1100, tokens_total: 8300, consults: 2,
    });
  });
```

- [ ] **Step 3: Закоммитить, запушить и убедиться, что тесты красные**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B branch --show-current
git -C $B add src/admin/admin.call-sessions.spec.ts src/admin/admin.user-calls.spec.ts
git -C $B commit -q -m "test(admin): лента сессий и одна форма сессии в карточке — красные

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C $B push -q
SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/admin/admin.call-sessions src/admin/admin.user-calls --maxWorkers=2 2>&1 | tail -40"
```

Ожидается FAIL:
- в `admin.call-sessions.spec.ts` падают все 7 тестов, у старого сервиса нет метода: `getCallSessions is not a function`;
- в `admin.user-calls.spec.ts` падает только новый тест: в ответе `tokens_charged` вместо `tokens_call`, JOIN с `agents` нет;
- остальные тесты `admin.user-calls.spec.ts` зелёные.

- [ ] **Step 4: Реализовать**

В `src/admin/admin.service.ts` заменить JSDoc и метод `getUserCalls` целиком: от строки `  /**` перед текстом `   * Звонки одного человека для карточки в админке.` до закрывающей `  }` метода. Строку `  /** Расшифровка одного звонка — по клику из списка. */` и `getCallTranscript` не трогать. Новый код:

```ts
  /**
   * Колонки сессии — общие у ленты и карточки человека, чтобы оба места
   * получали одну форму. Расшифровка читается ради пометок и в ответ не уходит
   * (см. toCallSession). Консультации — подзапросами по call_id, а не JOIN по
   * user_id: иначе к звонку приехали бы вопросы, заданные тем же человеком на
   * встрече.
   */
  private static readonly SESSION_COLUMNS = `
    c.id, c.user_id, c.provider, a.name AS agent_name,
    c.started_at, c.duration_sec, c.status, c.model, c.summary, c.transcript,
    c.tokens_charged,
    (SELECT COALESCE(SUM(j.tokens_used), 0) FROM voice_call_jobs j WHERE j.call_id = c.id)::bigint AS tokens_consult,
    (SELECT COUNT(*) FROM voice_call_jobs j WHERE j.call_id = c.id)::int AS consults`;

  /**
   * Строка voice_calls → сессия для админки.
   *
   * Расшифровку отрезаем: на проде она весит больше всего остального ответа,
   * а открывают её по одной. Пометки считаем здесь же, чтобы интерфейс не
   * тянул диалоги ради подсчёта реплик.
   */
  private static toCallSession(r: any) {
    const call = Number(r.tokens_charged) || 0;
    const consult = Number(r.tokens_consult) || 0;
    return {
      id: r.id,
      user_id: r.user_id,
      provider: r.provider,
      agent_name: r.agent_name ?? null,
      started_at: r.started_at,
      duration_sec: r.duration_sec ?? null,
      status: r.status,
      model: r.model ?? null,
      summary: r.summary ?? null,
      tokens_call: call,
      tokens_consult: consult,
      tokens_total: call + consult,
      consults: Number(r.consults) || 0,
      flags: callFlags(r),
      user_turns: countUserTurns(r.transcript),
    };
  }

  /**
   * Лента раздела «Звонки»: по строке на звонок или встречу, новые сверху.
   *
   * Условие то же, что у таблицы (callsWhere), total — отдельным запросом по
   * нему же: «показано 50 из 131» не должно расходиться с итогом над таблицей.
   * «Показать ещё» на фронте перезапрашивает первые N+50 целиком, а не
   * страницу по курсору: сессий сотни, и так пришедшая за это время новая
   * сессия не задваивает строку.
   */
  async getCallSessions(opts: CallsQuery = {}) {
    const f = AdminService.callsFilter(opts);
    const asked = Number.isFinite(opts.limit) ? Math.trunc(opts.limit as number) : 50;
    const limit = Math.min(Math.max(asked, 1), 500);
    const { where, params } = AdminService.callsWhere(f);

    const rowsRes = await this.pg.query(
      `SELECT ${AdminService.SESSION_COLUMNS}
         FROM voice_calls c
         LEFT JOIN agents a ON a.id = c.agent_id
        WHERE ${where}
        ORDER BY c.started_at DESC, c.id DESC
        LIMIT ${limit}`,
      params,
    );
    const totalRes = await this.pg.query(
      `SELECT COUNT(*)::int AS total FROM voice_calls c WHERE ${where}`,
      params,
    );

    return {
      days: f.days,
      kind: f.kind,
      provider: f.provider,
      include_test: f.includeTest,
      total: Number(totalRes.rows[0]?.total) || 0,
      limit,
      sessions: rowsRes.rows.map((r: any) => AdminService.toCallSession(r)),
    };
  }

  /**
   * Звонки и встречи одного человека — для его карточки в админке. Форма
   * сессии та же, что у ленты раздела: карточку и ленту рисует один компонент.
   *
   * Тестовые аккаунты не исключаем — в отличие от раздела: сюда приходят по
   * конкретному user_id, и если открыли карточку тестового аккаунта, значит
   * его и хотят посмотреть.
   */
  async getUserCalls(userId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const res = await this.pg.query(
      `SELECT ${AdminService.SESSION_COLUMNS}
         FROM voice_calls c
         LEFT JOIN agents a ON a.id = c.agent_id
        WHERE c.user_id = $1
        ORDER BY c.started_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return { userId, calls: res.rows.map((r: any) => AdminService.toCallSession(r)) };
  }
```

- [ ] **Step 5: Закоммитить, запушить и убедиться, что тесты зелёные**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B branch --show-current
git -C $B add src/admin/admin.service.ts
git -C $B commit -q -m "feat(admin): лента сессий звонков и встреч, одна форма сессии с карточкой

getCallSessions: по строке на сессию, новые сверху, total по тому же
условию, что таблица. Форма сессии (площадка, ассистент, списание по
частям, пометки) общая с getUserCalls — карточку и ленту рисует один
компонент. Расшифровка по-прежнему только по клику.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C $B push -q
SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/admin --maxWorkers=2 2>&1 | tail -8"
```

Ожидается PASS: `Test Suites: 10 passed`, `Tests: 95 passed` (87 + 7 + 1).

---

### Task 4: Маршрут ленты и параметры в контроллере (бэк)

**Files:**
- Create: `src/admin/admin.calls-controller.spec.ts`
- Modify: `src/admin/admin.controller.ts` — блок `// --- Голосовые звонки ---` и метод `callsByUser` (строки 226–243)

- [ ] **Step 1: Спек контроллера — красный**

Создать `src/admin/admin.calls-controller.spec.ts`:

```ts
import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AdminController } from './admin.controller';

/**
 * Проводка фильтров раздела «Звонки» от query-параметров до сервиса.
 *
 * Сервис фильтры разбирает сам, но только те, что до него доехали: забытый
 * здесь includeTest молча вернул бы пустой раздел встреч на проде, где все
 * встречи — прогоны владельца. Защиту маршрутов держит
 * common/guards/admin-routes.spec.ts — он обходит все методы контроллера.
 */

/** Фейковый express Response: запоминает статус и тело. */
function fakeRes() {
  const r: any = { statusCode: 0, body: undefined };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  return r;
}

describe('AdminController: звонки и встречи', () => {
  it('лента объявлена как GET admin/calls/sessions', () => {
    const handler = AdminController.prototype.callSessions;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('admin/calls/sessions');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('лента передаёт в сервис все фильтры', async () => {
    const svc = { getCallSessions: jest.fn().mockResolvedValue({ sessions: [] }) };
    const ctrl = new AdminController(svc as any, {} as any);
    const res = fakeRes();
    await ctrl.callSessions('90', 'meeting', 'zoom', '1', '100', res);

    expect(svc.getCallSessions).toHaveBeenCalledWith({
      days: 90, kind: 'meeting', provider: 'zoom', includeTest: true, limit: 100,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ sessions: [] });
  });

  it('таблица принимает площадку и тестовые', async () => {
    const svc = { getCallsByUser: jest.fn().mockResolvedValue({}) };
    const ctrl = new AdminController(svc as any, {} as any);
    await ctrl.callsByUser('30', 'meeting', 'talerid', '1', undefined, fakeRes());

    expect(svc.getCallsByUser).toHaveBeenCalledWith({
      days: 30, kind: 'meeting', provider: 'talerid', includeTest: true, limit: undefined,
    });
  });

  it('без includeTest тестовые не включаются', async () => {
    const svc = { getCallSessions: jest.fn().mockResolvedValue({}) };
    const ctrl = new AdminController(svc as any, {} as any);
    await ctrl.callSessions(undefined, undefined, undefined, undefined, undefined, fakeRes());

    expect(svc.getCallSessions).toHaveBeenCalledWith(expect.objectContaining({ includeTest: false }));
  });
});
```

- [ ] **Step 2: Закоммитить, запушить и убедиться, что тесты красные**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B branch --show-current
git -C $B add src/admin/admin.calls-controller.spec.ts
git -C $B commit -q -m "test(admin): маршрут ленты и проводка фильтров звонков — красные

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C $B push -q
SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/admin/admin.calls-controller --maxWorkers=2 2>&1 | tail -40"
```

Ожидается FAIL, 4 из 4:
- у контроллера нет `callSessions`;
- `callsByUser` по старой сигнатуре `(days, kind, limit, res)` получает строку `'1'` вместо `res` и падает на `res.status is not a function`.

- [ ] **Step 3: Реализовать**

В `src/admin/admin.controller.ts` заменить блок от строки `  // --- Голосовые звонки ---` до закрывающей `  }` метода `callsByUser` включительно (строки 226–243) на:

```ts
  // --- Голосовые звонки и встречи ---

  @Get('admin/calls')
  async callsByUser(
    @Query('days') days: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('provider') provider: string | undefined,
    @Query('includeTest') includeTest: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res() res: Response,
  ) {
    // kind и provider не валидируем здесь: сервис сам схлопывает незнакомое
    // значение. Проверка в двух местах разъехалась бы при добавлении площадки.
    const stats = await this.adminService.getCallsByUser({
      days: days ? parseInt(days, 10) || undefined : undefined,
      kind,
      provider,
      includeTest: AdminController.isTruthy(includeTest),
      limit: limit ? parseInt(limit, 10) || undefined : undefined,
    });
    return res.status(200).json(stats);
  }

  /**
   * Лента сессий раздела: звонки и встречи всех площадок строками, новые
   * сверху. Фильтры те же, что у таблицы выше, — разбирает их сервис.
   */
  @Get('admin/calls/sessions')
  async callSessions(
    @Query('days') days: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('provider') provider: string | undefined,
    @Query('includeTest') includeTest: string | undefined,
    @Query('limit') limit: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.adminService.getCallSessions({
      days: days ? parseInt(days, 10) || undefined : undefined,
      kind,
      provider,
      includeTest: AdminController.isTruthy(includeTest),
      limit: limit ? parseInt(limit, 10) || undefined : undefined,
    });
    return res.status(200).json(data);
  }
```

Маршрут `admin/calls/sessions` (три сегмента) не пересекается с `admin/calls/:id/transcript` и `admin/calls/user/:userId` (по четыре сегмента).

- [ ] **Step 4: Закоммитить, запушить и убедиться, что тесты зелёные вместе со спеком защиты маршрутов**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B branch --show-current
git -C $B add src/admin/admin.controller.ts
git -C $B commit -q -m "feat(admin): маршрут ленты сессий, площадка и тестовые в запросе звонков

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git -C $B push -q
SHA=$(git -C $B rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npx jest src/admin --maxWorkers=2 2>&1 | tail -6; npx jest src/common/guards --maxWorkers=2 2>&1 | tail -6"
```

Ожидается PASS в обоих прогонах. Первый: `Test Suites: 11 passed`, `Tests: 101 passed` (97 после правок ревью Task 1–3 + 4; после правки ревью Task 4 — 102). Второй: всё зелёное, `failed` нет. Спек `admin-routes.spec.ts` сам обходит все методы контроллера, поэтому в его выводе должен быть `callSessions закрыт AdminGuard`. Проверить отдельно:

```bash
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && source ~/.nvm/nvm.sh && npx jest src/common/guards/admin-routes --verbose 2>&1 | grep -c callSessions"
```

Ожидается `2` — строки «закрыт AdminGuard» и «требует JwtGuard».

---

### Task 5: Проверка бэка — типы и живая база стенда

Юнит-тесты подменяют `pg` целиком, поэтому SQL в них не выполняется вовсе. Проверка SQL — только прогоном на настоящей базе. Берём базу тестового стенда: в ней есть сессии всех площадок. Запросы только читают.

**Files:** временный `tmp-calls-check.ts` в корне ворктри на ноде. В git он не идёт; удалить сразу после прогона.

- [ ] **Step 1: Дельта `tsc`**

```bash
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && source ~/.nvm/nvm.sh && npx tsc --listFilesOnly -p tsconfig.json | grep -c 'src/admin/admin.service.ts'; npx tsc --noEmit -p tsconfig.json 2>&1 | grep '^src/' | sort > ~/ci/wt/.tsc-back-branch.txt; wc -l < ~/ci/wt/.tsc-back-branch.txt; diff ~/ci/wt/.tsc-back-base.txt ~/ci/wt/.tsc-back-branch.txt && echo 'дельта tsc: ноль'"
```

Ожидается:
- первая строка `1` — файл сервиса входит в программу, то есть проверка не пустая;
- затем `18` и `дельта tsc: ноль`.

Если в выводе `diff` есть строки из `src/admin/`, ошибка наша: чинить и прогонять заново.

- [ ] **Step 2: Прогон сервиса на базе стенда**

```bash
ssh dv@85.192.61.231 'cat > ~/ci/wt/admin-meetings-back/tmp-calls-check.ts' <<'EOF'
import { Client } from 'pg';
import { AdminService } from './src/admin/admin.service';

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const svc = new AdminService({ query: (sql: string, params?: any[]) => client.query(sql, params) } as any);

  const meet = await svc.getCallsByUser({ days: 90, kind: 'meeting', includeTest: true });
  const feed = await svc.getCallSessions({ days: 90, kind: 'meeting', includeTest: true, limit: 500 });
  const sum = meet.byProvider.reduce((a, p) => a + p.sessions, 0);
  console.log('byProvider', JSON.stringify(meet.byProvider));
  console.log('встречи: итог', meet.totals.calls, '| сумма площадок', sum, '| total ленты', feed.total, '| строк ленты', feed.sessions.length);

  const zoom = await svc.getCallsByUser({ days: 90, kind: 'meeting', provider: 'zoom', includeTest: true });
  console.log('zoom: итог', zoom.totals.calls, '| кнопок площадок', zoom.byProvider.length);

  const noTest = await svc.getCallsByUser({ days: 90, kind: 'meeting' });
  console.log('без тестовых: встреч', noTest.totals.calls);

  const flags: Record<string, number> = {};
  for (const s of feed.sessions) {
    const k = `${s.status}:${s.flags.join('+') || '—'}`;
    flags[k] = (flags[k] || 0) + 1;
  }
  console.log('статус:пометки', JSON.stringify(flags));
  console.log('пример', JSON.stringify(feed.sessions[0]));

  const card = await svc.getUserCalls(feed.sessions[0].user_id, { limit: 3 });
  const same = JSON.stringify(Object.keys(card.calls[0]).sort()) === JSON.stringify(Object.keys(feed.sessions[0]).sort());
  console.log('карточка и лента — одна форма:', same);
  await client.end();
})().catch((e) => { console.error(e); process.exit(1); });
EOF
ssh dv@85.192.61.231 'cd ~/ci/wt/admin-meetings-back && source ~/.nvm/nvm.sh && DATABASE_URL="$(grep ^DATABASE_URL= ~/spirits_back/.env | cut -d= -f2-)" npx ts-node --transpile-only tmp-calls-check.ts; rm -f tmp-calls-check.ts; ls tmp-calls-check.ts 2>/dev/null || echo "скрипт удалён"'
```

Файл `~/spirits_back/.env` живого стенда здесь только читается.

Ожидается (числа на 25.09.2026, к моменту прогона могли подрасти):
- `byProvider` содержит `meet`, `telemost`, `linkeon_room`, `zoom`, `talerid`, `teams` и не содержит `linkeon`;
- итог встреч, сумма площадок и `total` ленты — **одно и то же число** (на 25.09 — 78);
- у `zoom` итог равен числу его сессий, а кнопок площадок столько же, сколько в общем `byProvider`;
- в «статус:пометки» каждый `failed` идёт только с `failed`, а каждый `interrupted` — только с `interrupted`;
- в примере есть `agent_name`, `tokens_call`, `tokens_consult`, `tokens_total`, `flags` и нет `transcript`;
- `карточка и лента — одна форма: true`;
- в конце `скрипт удалён`.

Любое расхождение трёх чисел — дефект условия выборки. Не продолжать, пока не найдена причина.

---

### Task 6: Ключи локалей (фронт)

**Files:**
- Create: `src/components/admin/callsLocales.test.ts`
- Modify: `src/i18n/locales/ru.json`, `en.json`, `pt.json` — блок `admin.calls`

- [ ] **Step 1: Тест ключей — красный**

Создать `src/components/admin/callsLocales.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import ru from '../../i18n/locales/ru.json';
import en from '../../i18n/locales/en.json';
import pt from '../../i18n/locales/pt.json';

/**
 * Раздел admin переведён только в ru, en и pt: остальные языки берут
 * английский по цепочке откатов (en → ru), а check-locales ключи admin.*
 * не требует вовсе. Поэтому ключ, забытый в en, никто не поймает — его
 * немецкий, испанский и прочие администраторы увидят русским.
 */
const LOCALES: Record<string, any> = { ru, en, pt };

const NEW_KEYS = [
  'provider.linkeon', 'provider.linkeon_room', 'provider.talerid', 'provider.meet',
  'provider.zoom', 'provider.teams', 'provider.telemost',
  'flag.failed', 'flag.live', 'tokensHint',
];

const at = (obj: any, path: string) => path.split('.').reduce((o, k) => o?.[k], obj);

describe('ключи раздела звонков', () => {
  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name}: площадки, новые пометки и подсказка списания`, () => {
      for (const key of NEW_KEYS) {
        expect(at(loc, `admin.calls.${key}`), `${name}: admin.calls.${key}`).toBeTruthy();
      }
    });
  }

  it('подсказка списания подставляет обе части', () => {
    for (const [name, loc] of Object.entries(LOCALES)) {
      const hint = at(loc, 'admin.calls.tokensHint') as string;
      expect(hint, name).toContain('{{call}}');
      expect(hint, name).toContain('{{consult}}');
    }
  });

  it('заголовок блока в карточке говорит и про встречи', () => {
    expect(at(ru, 'admin.calls.sectionTitle')).toBe('Звонки и встречи');
    expect(at(en, 'admin.calls.sectionTitle')).toBe('Calls and meetings');
    expect(at(pt, 'admin.calls.sectionTitle')).toBe('Chamadas e reuniões');
  });
});
```

- [ ] **Step 2: Убедиться, что тест красный**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/callsLocales.test.ts 2>&1 | tail -15)
```

Ожидается FAIL, 5 из 5: `ru: admin.calls.provider.linkeon`, `expected undefined to be truthy` и т. п.

- [ ] **Step 3: Добавить ключи**

`src/i18n/locales/ru.json` — заменить

```json
      "sectionTitle": "Звонки",
      "loadFailed": "Не удалось загрузить звонки",
      "noSummary": "Без саммари",
      "noTranscript": "Расшифровки нет",
      "human": "Человек",
      "assistant": "Ассистент",
      "flag": {
        "interrupted": "не состоялся",
        "silent": "человек молчал",
        "nearlySilent": "почти молчал",
        "short": "короткий"
      },
```

на

```json
      "sectionTitle": "Звонки и встречи",
      "loadFailed": "Не удалось загрузить звонки",
      "noSummary": "Без саммари",
      "noTranscript": "Расшифровки нет",
      "human": "Человек",
      "assistant": "Ассистент",
      "tokensHint": "разговор {{call}} + консультации {{consult}}",
      "flag": {
        "interrupted": "не состоялся",
        "failed": "сбой",
        "live": "идёт сейчас",
        "silent": "человек молчал",
        "nearlySilent": "почти молчал",
        "short": "короткий"
      },
      "provider": {
        "linkeon": "Звонок",
        "linkeon_room": "Комната Linkeon",
        "talerid": "Taler ID",
        "meet": "Google Meet",
        "zoom": "Zoom",
        "teams": "Microsoft Teams",
        "telemost": "Яндекс Телемост"
      },
```

`src/i18n/locales/en.json` — заменить

```json
      "sectionTitle": "Calls",
      "loadFailed": "Could not load calls",
      "noSummary": "No summary",
      "noTranscript": "No transcript",
      "human": "Person",
      "assistant": "Assistant",
      "flag": {
        "interrupted": "not connected",
        "silent": "person silent",
        "nearlySilent": "barely spoke",
        "short": "short"
      },
```

на

```json
      "sectionTitle": "Calls and meetings",
      "loadFailed": "Could not load calls",
      "noSummary": "No summary",
      "noTranscript": "No transcript",
      "human": "Person",
      "assistant": "Assistant",
      "tokensHint": "conversation {{call}} + consultations {{consult}}",
      "flag": {
        "interrupted": "not connected",
        "failed": "failed",
        "live": "in progress",
        "silent": "person silent",
        "nearlySilent": "barely spoke",
        "short": "short"
      },
      "provider": {
        "linkeon": "Call",
        "linkeon_room": "Linkeon room",
        "talerid": "Taler ID",
        "meet": "Google Meet",
        "zoom": "Zoom",
        "teams": "Microsoft Teams",
        "telemost": "Yandex Telemost"
      },
```

`src/i18n/locales/pt.json` (европейский португальский, как весь файл: «ficheiro», «a decorrer») — заменить

```json
      "sectionTitle": "Chamadas",
      "loadFailed": "Falha ao carregar chamadas",
      "noSummary": "Sem resumo",
      "noTranscript": "Sem transcrição",
      "human": "Pessoa",
      "assistant": "Assistente",
      "flag": {
        "interrupted": "não conectou",
        "silent": "pessoa em silêncio",
        "nearlySilent": "falou pouco",
        "short": "curta"
      },
```

на

```json
      "sectionTitle": "Chamadas e reuniões",
      "loadFailed": "Falha ao carregar chamadas",
      "noSummary": "Sem resumo",
      "noTranscript": "Sem transcrição",
      "human": "Pessoa",
      "assistant": "Assistente",
      "tokensHint": "conversa {{call}} + consultas {{consult}}",
      "flag": {
        "interrupted": "não conectou",
        "failed": "falhou",
        "live": "a decorrer",
        "silent": "pessoa em silêncio",
        "nearlySilent": "falou pouco",
        "short": "curta"
      },
      "provider": {
        "linkeon": "Chamada",
        "linkeon_room": "Sala Linkeon",
        "talerid": "Taler ID",
        "meet": "Google Meet",
        "zoom": "Zoom",
        "teams": "Microsoft Teams",
        "telemost": "Yandex Telemost"
      },
```

- [ ] **Step 4: Прогнать тест и проверить, что JSON валиден**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && for l in ru en pt; do python3 -m json.tool src/i18n/locales/$l.json >/dev/null && echo "$l ok"; done && ./node_modules/.bin/vitest run src/components/admin/callsLocales.test.ts src/i18n 2>&1 | tail -6)
```

Ожидается: `ru ok`, `en ok`, `pt ok`, все тесты PASS (новый файл и тесты `src/i18n`).

- [ ] **Step 5: Закоммитить**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
git -C $F branch --show-current
git -C $F add src/components/admin/callsLocales.test.ts src/i18n/locales/ru.json src/i18n/locales/en.json src/i18n/locales/pt.json
git -C $F commit -q -m "feat(admin): подписи площадок встреч и новых пометок в ru/en/pt

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Подписи площадок (фронт)

**Files:**
- Create: `src/components/admin/callProviders.ts`
- Test: `src/components/admin/callProviders.test.ts`

- [ ] **Step 1: Тест — красный**

Создать `src/components/admin/callProviders.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { providerLabel, KNOWN_PROVIDERS } from './callProviders';

describe('подписи площадок', () => {
  const t = ((key: string, def?: string) => def ?? key) as any;

  it('площадки встреч подписаны по-человечески', () => {
    expect(providerLabel('meet', t)).toBe('Google Meet');
    expect(providerLabel('telemost', t)).toBe('Яндекс Телемост');
    expect(providerLabel('talerid', t)).toBe('Taler ID');
    expect(providerLabel('linkeon', t)).toBe('Звонок');
    expect(KNOWN_PROVIDERS).toHaveLength(7);
  });

  it('незнакомая площадка показывается техническим именем', () => {
    // Бэкенд заводит площадку раньше, чем фронт узнаёт её подпись.
    expect(providerLabel('webex', t)).toBe('webex');
  });

  it('имя из прототипа объекта не подменяет подпись', () => {
    expect(providerLabel('constructor', t)).toBe('constructor');
    expect(providerLabel('toString', t)).toBe('toString');
  });
});
```

- [ ] **Step 2: Убедиться, что тест красный**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/callProviders.test.ts 2>&1 | tail -8)
```

Ожидается FAIL: `Failed to resolve import "./callProviders"`.

- [ ] **Step 3: Реализовать**

Создать `src/components/admin/callProviders.ts`:

```ts
import type { TFunction } from 'i18next';

/**
 * Площадки из voice_calls.provider. Звонок из приложения — тоже площадка: на
 * вкладке «Все» он стоит в ленте рядом со встречами, и без подписи строки не
 * различить.
 */
export const KNOWN_PROVIDERS = ['linkeon', 'linkeon_room', 'talerid', 'meet', 'zoom', 'teams', 'telemost'] as const;
export type CallProvider = (typeof KNOWN_PROVIDERS)[number];

const LABELS: Record<CallProvider, [string, string]> = {
  linkeon: ['admin.calls.provider.linkeon', 'Звонок'],
  linkeon_room: ['admin.calls.provider.linkeon_room', 'Комната Linkeon'],
  talerid: ['admin.calls.provider.talerid', 'Taler ID'],
  meet: ['admin.calls.provider.meet', 'Google Meet'],
  zoom: ['admin.calls.provider.zoom', 'Zoom'],
  teams: ['admin.calls.provider.teams', 'Microsoft Teams'],
  telemost: ['admin.calls.provider.telemost', 'Яндекс Телемост'],
};

/**
 * Незнакомую площадку показываем её техническим именем, а не прячем: бэкенд
 * заводит площадку раньше, чем фронт узнаёт её подпись, и спрятанная сессия
 * хуже неподписанной. hasOwnProperty — чтобы «constructor» из базы не достал
 * функцию из прототипа вместо подписи.
 */
export function providerLabel(provider: string, t: TFunction): string {
  const pair = Object.prototype.hasOwnProperty.call(LABELS, provider)
    ? LABELS[provider as CallProvider]
    : undefined;
  return pair ? t(pair[0], pair[1]) : provider;
}
```

- [ ] **Step 4: Прогнать — зелёный**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/callProviders.test.ts 2>&1 | tail -6)
```

Ожидается PASS, 3 теста.

- [ ] **Step 5: Закоммитить**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
git -C $F branch --show-current
git -C $F add src/components/admin/callProviders.ts src/components/admin/callProviders.test.ts
git -C $F commit -q -m "feat(admin): подписи площадок встреч, незнакомая — техническим именем

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Пометки «сбой» и «идёт сейчас» (фронт)

**Files:**
- Modify: `src/components/admin/callFlagLabels.ts`
- Test: `src/components/admin/callFlagLabels.test.ts`

- [ ] **Step 1: Тест — красный**

В `src/components/admin/callFlagLabels.test.ts`, внутри `describe('подписи пометок', …)` после теста `'незнакомая пометка с бэкенда не роняет строку'`, дописать:

```ts
  it('сбой встречи и идущая сессия подписаны и окрашены', () => {
    expect(flagLabel('failed', t)).toBe('сбой');
    expect(flagTone('failed')).toBe('danger');
    expect(flagLabel('live', t)).toBe('идёт сейчас');
    expect(flagTone('live')).toBe('neutral');
  });
```

- [ ] **Step 2: Убедиться, что тест красный**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/callFlagLabels.test.ts 2>&1 | tail -10)
```

Ожидается FAIL: `expected 'failed' to be 'сбой'`.

- [ ] **Step 3: Реализовать**

`src/components/admin/callFlagLabels.ts` — заменить три объявления:

```ts
export const KNOWN_FLAGS = ['interrupted', 'silent', 'nearly_silent', 'short'] as const;
```

на

```ts
export const KNOWN_FLAGS = ['interrupted', 'failed', 'live', 'silent', 'nearly_silent', 'short'] as const;
```

объект `LABELS` на

```ts
const LABELS: Record<CallFlag, [string, string]> = {
  interrupted: ['admin.calls.flag.interrupted', 'не состоялся'],
  failed: ['admin.calls.flag.failed', 'сбой'],
  live: ['admin.calls.flag.live', 'идёт сейчас'],
  silent: ['admin.calls.flag.silent', 'человек молчал'],
  nearly_silent: ['admin.calls.flag.nearlySilent', 'почти молчал'],
  short: ['admin.calls.flag.short', 'короткий'],
};
```

и объект `TONES` на

```ts
const TONES: Record<CallFlag, 'danger' | 'warn' | 'neutral'> = {
  interrupted: 'danger',
  failed: 'danger',
  live: 'neutral',
  silent: 'danger',
  nearly_silent: 'warn',
  short: 'warn',
};
```

- [ ] **Step 4: Прогнать — зелёный**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/callFlagLabels.test.ts 2>&1 | tail -6)
```

Ожидается PASS, 3 теста.

- [ ] **Step 5: Закоммитить**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
git -C $F branch --show-current
git -C $F add src/components/admin/callFlagLabels.ts src/components/admin/callFlagLabels.test.ts
git -C $F commit -q -m "feat(admin): пометки «сбой» и «идёт сейчас» в интерфейсе звонков

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Строка сессии — общая у ленты и карточки (фронт)

**Files:**
- Create: `src/components/admin/CallSessionItem.tsx`
- Test: `src/components/admin/CallSessionItem.test.tsx`
- Modify: `src/components/admin/UserCallsList.tsx` — переписывается целиком

- [ ] **Step 1: Тест — красный**

Создать `src/components/admin/CallSessionItem.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * Строку сессии проверяем монтированием: два клика в одной строке — по номеру
 * человека и по самой строке — должны делать разное, и по коду это не
 * доказывается.
 *
 * Без @testing-library, как AdminBlogView.test.tsx: хватает createRoot и act.
 */
import { act, type ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));

import { CallSessionItem, type CallSession } from './CallSessionItem';
import { formatTokens } from './callsFormat';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const session = (over: Partial<CallSession> = {}): CallSession => ({
  id: 'c-1', user_id: '79236230446', provider: 'zoom', agent_name: 'Роман',
  started_at: '2026-09-16T09:46:31Z', duration_sec: 117, status: 'completed',
  model: 'gpt-realtime-2.1', summary: 'Обсуждали погоду',
  tokens_call: 6241, tokens_consult: 1100, tokens_total: 7341, consults: 2,
  flags: [], user_turns: 3,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const mount = async (el: ReactElement) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ul>{el}</ul>); });
};

/** Дать допройти цепочке промисов внутри обработчика клика. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const click = async (el: HTMLElement | null) => {
  if (!el) throw new Error('нет элемента');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ transcript: [{ ts: 0, role: 'user', text: 'Какая погода?' }] }),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('CallSessionItem', () => {
  it('подписывает площадку, ассистента и списание', async () => {
    await mount(<CallSessionItem session={session()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Zoom');
    expect(text).toContain('Роман');
    expect(text).toContain(formatTokens(7341));
  });

  it('клик по строке раскрывает расшифровку', async () => {
    await mount(<CallSessionItem session={session()} />);
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledWith('/webhook/admin/calls/c-1/transcript');
    expect(container.textContent).toContain('Какая погода?');
  });

  it('клик по номеру открывает человека и не раскрывает расшифровку', async () => {
    const onOpenUser = vi.fn();
    await mount(<CallSessionItem session={session()} onOpenUser={onOpenUser} />);
    await click(q('call-session-user-c-1'));
    expect(onOpenUser).toHaveBeenCalledWith('79236230446');
    expect(get).not.toHaveBeenCalled();
  });

  it('без onOpenUser номера нет: в карточке человек и так известен', async () => {
    await mount(<CallSessionItem session={session()} />);
    expect(q('call-session-user-c-1')).toBeNull();
  });

  it('прерванный звонок без реплик человека не раскрывается', async () => {
    await mount(<CallSessionItem session={session({ status: 'interrupted', flags: ['interrupted'], duration_sec: null, user_turns: 0 })} />);
    await click(q('call-session-c-1'));
    expect(get).not.toHaveBeenCalled();
  });

  it('прерванный звонок с репликами раскрывается: расшифровку пишут по ходу', async () => {
    // На стенде 25.09.2026 расшифровка есть у 7 из 11 прерванных встреч.
    await mount(<CallSessionItem session={session({ status: 'interrupted', flags: ['interrupted'], duration_sec: null, user_turns: 2 })} />);
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('сбой встречи раскрывается: расшифровка бывает и до обрыва', async () => {
    await mount(<CallSessionItem session={session({ status: 'failed', flags: ['failed'] })} />);
    await click(q('call-session-c-1'));
    expect(get).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('сбой');
  });
});
```

- [ ] **Step 2: Убедиться, что тест красный**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/CallSessionItem.test.tsx 2>&1 | tail -8)
```

Ожидается FAIL: `Failed to resolve import "./CallSessionItem"`.

- [ ] **Step 3: Реализовать строку сессии**

Создать `src/components/admin/CallSessionItem.tsx`:

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Coins } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { flagLabel, flagTone } from './callFlagLabels';
import { providerLabel } from './callProviders';
import { formatTokens, formatWhen } from './callsFormat';

/** Сессия, как её отдают /admin/calls/sessions и /admin/calls/user/:id. */
export interface CallSession {
  id: string;
  user_id: string;
  provider: string;
  agent_name: string | null;
  started_at: string;
  duration_sec: number | null;
  status: string;
  model: string | null;
  summary: string | null;
  tokens_call: number;
  tokens_consult: number;
  tokens_total: number;
  consults: number;
  flags: string[];
  user_turns: number;
}

interface Turn {
  ts?: number;
  role?: string;
  text?: string;
}

/**
 * Смещение реплики от начала разговора: «01:23». Пустая строка, если меток
 * времени нет — у части расшифровок `ts` может отсутствовать, и «NaN:NaN» в
 * диалоге хуже, чем ничего.
 */
function offsetLabel(firstTs?: number, ts?: number): string {
  if (typeof firstTs !== 'number' || typeof ts !== 'number') return '';
  const sec = Math.max(0, Math.round((ts - firstTs) / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/** Длительность одной сессии «12:05»: тут минуты с секундами точнее, чем «12 мин». */
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

const TONE_CLASS = {
  danger: 'bg-red-50 text-red-700 border-red-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  neutral: 'bg-gray-50 text-gray-600 border-gray-200',
} as const;

/**
 * Строка сессии — звонка или встречи — с раскрытием расшифровки. Общая у
 * ленты раздела «Звонки» и карточки человека, чтобы сессия выглядела в обоих
 * местах одинаково.
 *
 * Строка — div с role="button", а не <button>: внутри стоит кнопка
 * пользователя, а кнопка в кнопке — невалидная разметка.
 *
 * Имена говорящих из расшифровки не показываем: метку speaker ставит
 * определитель активности голоса, и 07.09.2026 она уже выдала за «слышал
 * коллег» то, чего не было. Реплики людей подписаны «Человек».
 */
export const CallSessionItem: React.FC<{
  session: CallSession;
  /** Есть — номер человека становится кнопкой, открывающей его карточку. */
  onOpenUser?: (userId: string) => void;
}> = ({ session: s, onOpenUser }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[] | null>(null);
  // Прерванный звонок раскрываем, только если человек успел что-то сказать:
  // расшифровку voice-host пишет по ходу, и у части прерванных она есть (на
  // стенде — у 7 из 11 прерванных встреч). Без реплик раскрывать нечего.
  // Сбой встречи раскрывается всегда — реплики до обрыва у него бывают.
  const expandable = s.status !== 'interrupted' || s.user_turns > 0;

  const toggle = async () => {
    if (!expandable) return;
    const next = !open;
    setOpen(next);
    if (!next || turns) return;
    try {
      const r = await apiClient.get(`/webhook/admin/calls/${encodeURIComponent(s.id)}/transcript`);
      const d = await r.json();
      setTurns(Array.isArray(d.transcript) ? d.transcript : []);
    } catch {
      setTurns([]);
    }
  };

  return (
    <li className="rounded-lg border border-gray-200">
      <div
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        data-testid={`call-session-${s.id}`}
        onClick={toggle}
        onKeyDown={(e) => {
          // Enter на кнопке пользователя всплывает сюда же — его не трогаем,
          // иначе открытие карточки заодно раскрывало бы расшифровку.
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        className={clsx(
          'flex w-full items-start gap-2 p-3 text-left',
          expandable && 'cursor-pointer hover:bg-gray-50',
        )}
      >
        {expandable && (open
          ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />)}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span>{formatWhen(s.started_at)}</span>
            <span className="rounded bg-forest-50 px-1.5 py-0.5 font-medium text-forest-700">
              {providerLabel(s.provider, t)}
            </span>
            {onOpenUser && (
              <button
                type="button"
                data-testid={`call-session-user-${s.id}`}
                onClick={(e) => {
                  // Клик по номеру открывает карточку и не раскрывает строку.
                  e.stopPropagation();
                  onOpenUser(s.user_id);
                }}
                className="font-medium text-forest-700 underline-offset-2 hover:underline"
              >
                {s.user_id}
              </button>
            )}
            {s.agent_name && <span>{s.agent_name}</span>}
            {s.duration_sec ? <span>{clock(s.duration_sec)}</span> : null}
            {s.tokens_total > 0 && (
              <span
                className="inline-flex items-center gap-1"
                title={t('admin.calls.tokensHint', {
                  defaultValue: 'разговор {{call}} + консультации {{consult}}',
                  call: formatTokens(s.tokens_call),
                  consult: formatTokens(s.tokens_consult),
                })}
              >
                <Coins className="h-3 w-3" />
                {formatTokens(s.tokens_total)}
              </span>
            )}
            {s.flags.map((f) => (
              <span key={f} className={clsx('rounded border px-1.5 py-0.5', TONE_CLASS[flagTone(f)])}>
                {flagLabel(f, t)}
              </span>
            ))}
          </span>
          {/* Свёрнутая строка — две строки саммари, раскрытая — всё целиком:
              у встреч саммари бывает на полэкрана. */}
          <span className={clsx('mt-1 block whitespace-pre-line text-sm text-gray-800', !open && 'line-clamp-2')}>
            {s.summary || t('admin.calls.noSummary', 'Без саммари')}
          </span>
        </span>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50 p-3">
          {turns === null && <p className="text-xs text-gray-400">…</p>}
          {turns?.length === 0 && (
            <p className="text-xs text-gray-500">
              {t('admin.calls.noTranscript', 'Расшифровки нет')}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {turns?.map((turn, i, all) => (
              <div key={i} className="text-sm">
                {/* Время от начала разговора, а не абсолютное: важно
                    «на какой секунде человек замолчал», а не «в котором
                    часу это было». */}
                <span className="mr-2 font-mono text-xs text-gray-400">
                  {offsetLabel(all[0]?.ts, turn.ts)}
                </span>
                <span className={clsx(
                  'mr-2 text-xs font-medium',
                  turn.role === 'user' ? 'text-forest-700' : 'text-gray-500',
                )}>
                  {turn.role === 'user'
                    ? t('admin.calls.human', 'Человек')
                    : t('admin.calls.assistant', 'Ассистент')}
                </span>
                <span className="text-gray-800">{turn.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </li>
  );
};
```

- [ ] **Step 4: Переписать карточку человека на общую строку**

Заменить содержимое `src/components/admin/UserCallsList.tsx` целиком:

```tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { CallSessionItem, type CallSession } from './CallSessionItem';

/**
 * Звонки и встречи человека — отдельным компонентом, как UserDevicesList:
 * карточка пользователя уже 990 строк, и класть туда ещё один экран значит
 * сделать её нечитаемой. Строку рисует CallSessionItem — тот же, что в ленте
 * раздела «Звонки», поэтому сессия в обоих местах выглядит одинаково.
 */
export const UserCallsList: React.FC<{ userId: string }> = ({ userId }) => {
  const { t } = useTranslation();
  const [calls, setCalls] = useState<CallSession[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    apiClient
      .get(`/webhook/admin/calls/user/${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setCalls(d.calls ?? []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [userId]);

  if (failed) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm text-red-600">
          {t('admin.calls.loadFailed', 'Не удалось загрузить звонки')}
        </p>
      </div>
    );
  }
  if (calls === null) {
    return <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm text-gray-400">…</div>;
  }
  // Сессий нет — секцию не показываем вовсе: пустая карточка «Звонки (0)» в
  // карточке каждого не звонившего человека только зашумляет.
  if (calls.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
        <Phone className="w-4 h-4 text-forest-600" />
        {t('admin.calls.sectionTitle', 'Звонки и встречи')}
        <span className="text-xs font-normal text-gray-500">({calls.length})</span>
      </h3>

      <ul className="flex flex-col gap-2">
        {calls.map((c) => (
          <CallSessionItem key={c.id} session={c} />
        ))}
      </ul>
    </div>
  );
};
```

- [ ] **Step 5: Прогнать тест и линтер**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/CallSessionItem.test.tsx 2>&1 | tail -6 && ./node_modules/.bin/eslint src/components/admin/CallSessionItem.tsx src/components/admin/UserCallsList.tsx && echo "eslint чисто")
```

Ожидается: PASS (7 тестов) и `eslint чисто`.

- [ ] **Step 6: Закоммитить**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
git -C $F branch --show-current
git -C $F add src/components/admin/CallSessionItem.tsx src/components/admin/CallSessionItem.test.tsx src/components/admin/UserCallsList.tsx
git -C $F commit -q -m "feat(admin): строка сессии — площадка, ассистент, списание; общая с карточкой

Раскрытие расшифровки переехало из UserCallsList в CallSessionItem: тот же
компонент рисует ленту раздела «Звонки». Клик по номеру человека открывает
карточку и не раскрывает строку; сбой встречи раскрывается, несостоявшийся
звонок — нет.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Лента сессий (фронт)

**Files:**
- Create: `src/components/admin/CallSessionsFeed.tsx`
- Test: `src/components/admin/CallSessionsFeed.test.tsx`

- [ ] **Step 1: Тест — красный**

Создать `src/components/admin/CallSessionsFeed.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));

import CallSessionsFeed from './CallSessionsFeed';
import type { CallSession } from './CallSessionItem';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (i: number): CallSession => ({
  id: `c-${i}`, user_id: '79236230446', provider: i % 2 ? 'zoom' : 'telemost', agent_name: 'Роман',
  started_at: '2026-09-16T09:46:31Z', duration_sec: 60, status: 'completed', model: null,
  summary: `Встреча ${i}`, tokens_call: 100, tokens_consult: 0, tokens_total: 100,
  consults: 0, flags: [], user_turns: 3,
});

/** Ответ ручки ленты: столько сессий, сколько просили, но не больше total. */
const reply = (total: number) => (url: string) => {
  const limit = Number(new URL(url, 'http://x').searchParams.get('limit'));
  const n = Math.min(limit, total);
  return Promise.resolve({
    ok: true, status: 200,
    json: async () => ({ total, limit, sessions: Array.from({ length: n }, (_, i) => mk(i)) }),
  });
};

let container: HTMLDivElement;
let root: Root;

/** Дать допройти цепочке промисов загрузки. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const mount = async (onOpenUser = vi.fn()) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CallSessionsFeed query="days=30&kind=all&includeTest=1" reloadKey={0} onOpenUser={onOpenUser} />);
  });
  await settle();
};

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const click = async (el: HTMLElement | null) => {
  if (!el) throw new Error('нет элемента');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

beforeEach(() => { get.mockReset(); });

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('CallSessionsFeed', () => {
  it('первая порция — 50 сессий с теми же фильтрами, что у таблицы', async () => {
    get.mockImplementation(reply(131));
    await mount();
    expect(get).toHaveBeenCalledWith('/webhook/admin/calls/sessions?days=30&kind=all&includeTest=1&limit=50');
    expect(q('call-sessions-count')?.textContent).toBe('Показано 50 из 131');
  });

  it('«Показать ещё» перезапрашивает первые 100', async () => {
    get.mockImplementation(reply(131));
    await mount();
    await click(q('call-sessions-more'));
    expect(get).toHaveBeenLastCalledWith('/webhook/admin/calls/sessions?days=30&kind=all&includeTest=1&limit=100');
    expect(q('call-sessions-count')?.textContent).toBe('Показано 100 из 131');
  });

  it('когда показано всё, кнопки «Показать ещё» нет', async () => {
    get.mockImplementation(reply(3));
    await mount();
    expect(q('call-sessions-more')).toBeNull();
  });

  it('клик по номеру в строке открывает карточку человека', async () => {
    get.mockImplementation(reply(1));
    const onOpenUser = vi.fn();
    await mount(onOpenUser);
    await click(q('call-session-user-c-0'));
    expect(onOpenUser).toHaveBeenCalledWith('79236230446');
  });

  it('ошибка ручки видна, а не выдаёт себя за «сессий не было»', async () => {
    get.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await mount();
    expect(container.textContent).toContain('Сессии: 404');
    expect(container.textContent).not.toContain('Сессий за период не было');
  });

  it('на потолке сервера (500) кнопки нет — вместо неё подсказка', async () => {
    // Сервер отдаёт не больше 500 за запрос: кнопка на потолке ничего бы не
    // догрузила, а висела бы, как будто ещё есть что показать.
    get.mockImplementation(reply(1000));
    await mount();
    for (let i = 0; i < 9; i++) await click(q('call-sessions-more'));
    expect(get).toHaveBeenLastCalledWith('/webhook/admin/calls/sessions?days=30&kind=all&includeTest=1&limit=500');
    expect(q('call-sessions-more')).toBeNull();
    expect(q('call-sessions-capped')?.textContent).toContain('500');
  });
});
```

- [ ] **Step 2: Убедиться, что тест красный**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/CallSessionsFeed.test.tsx 2>&1 | tail -8)
```

Ожидается FAIL: `Failed to resolve import "./CallSessionsFeed"`.

- [ ] **Step 3: Реализовать**

Создать `src/components/admin/CallSessionsFeed.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { CallSessionItem, type CallSession } from './CallSessionItem';

/** Сколько сессий добавляет «Показать ещё». */
const PAGE = 50;

/** Потолок сервера за один запрос (AdminService.clampLimit для ленты). */
const MAX_LIMIT = 500;

interface SessionsResp {
  total: number;
  limit: number;
  sessions: CallSession[];
}

/**
 * Лента сессий раздела «Звонки»: звонки и встречи всех площадок строками,
 * новые сверху.
 *
 * «Показать ещё» перезапрашивает первые N+50 целиком, а не следующую страницу
 * по курсору: сессий сотни, и так пришедшая за это время новая сессия не
 * сдвигает страницы и не задваивает строку.
 *
 * При смене фильтров родитель пересоздаёт ленту через key — лимит сам
 * возвращается к первой порции.
 */
const CallSessionsFeed: React.FC<{
  /** Строка фильтров без limit — та же, что у таблицы над лентой. */
  query: string;
  /** Растёт по кнопке «Обновить» в шапке раздела. */
  reloadKey: number;
  onOpenUser: (userId: string) => void;
}> = ({ query, reloadKey, onOpenUser }) => {
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<SessionsResp | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setError(null);
    apiClient
      .get(`/webhook/admin/calls/sessions?${query}&limit=${limit}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Сессии: ${r.status}`);
        const d = await r.json();
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Не удалось загрузить сессии');
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => { alive = false; };
  }, [query, limit, reloadKey]);

  const sessions = data?.sessions ?? [];
  const hasMore = !!data && sessions.length < data.total;
  // На потолке сервера кнопка ничего бы не догрузила — вместо неё подсказка.
  const atCap = limit >= MAX_LIMIT;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Сессии</h2>
        {data && (
          <span data-testid="call-sessions-count" className="text-xs text-gray-400">
            Показано {sessions.length} из {data.total}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!data ? (
        isLoading && <p className="text-sm text-gray-400 py-12 text-center">Загрузка…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">Сессий за период не было</p>
      ) : (
        <ul data-testid="call-sessions" className="flex flex-col gap-2 p-4">
          {sessions.map((s) => (
            <CallSessionItem key={s.id} session={s} onOpenUser={onOpenUser} />
          ))}
        </ul>
      )}

      {hasMore && !atCap && (
        <div className="px-4 pb-4">
          <button
            data-testid="call-sessions-more"
            onClick={() => setLimit((l) => Math.min(l + PAGE, MAX_LIMIT))}
            disabled={isLoading}
            className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:border-forest-400 hover:bg-forest-50 disabled:opacity-50"
          >
            {isLoading ? 'Загрузка…' : 'Показать ещё'}
          </button>
        </div>
      )}

      {hasMore && atCap && (
        <p data-testid="call-sessions-capped" className="px-4 pb-4 text-xs text-gray-400">
          Показаны последние {sessions.length}. Чтобы увидеть более ранние, сузьте период или выберите площадку.
        </p>
      )}
    </div>
  );
};

export default CallSessionsFeed;
```

- [ ] **Step 4: Прогнать тест и линтер**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/CallSessionsFeed.test.tsx 2>&1 | tail -6 && ./node_modules/.bin/eslint src/components/admin/CallSessionsFeed.tsx && echo "eslint чисто")
```

Ожидается: PASS (6 тестов) и `eslint чисто`.

- [ ] **Step 5: Закоммитить**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
git -C $F branch --show-current
git -C $F add src/components/admin/CallSessionsFeed.tsx src/components/admin/CallSessionsFeed.test.tsx
git -C $F commit -q -m "feat(admin): лента сессий звонков и встреч с «Показать ещё»

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Раздел «Звонки и встречи» — фильтры, «Тестовые», лента (фронт)

**Files:**
- Modify: `src/components/admin/AdminCallsView.tsx` — переписывается целиком
- Test: `src/components/admin/AdminCallsView.test.tsx` (новый)

- [ ] **Step 1: Тест — красный**

Создать `src/components/admin/AdminCallsView.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * Раздел «Звонки» проверяем монтированием: какие фильтры реально уходят в
 * запрос, по коду не доказать, а дефект был именно в них — встречи Taler ID,
 * Meet, Zoom и Телемоста не попадали ни в одну вкладку, кроме «Все».
 */
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get } }));
// Карточка человека тянет полсайта, а здесь она не участвует.
vi.mock('./UserActivityDrawer', () => ({ default: () => null }));

import AdminCallsView from './AdminCallsView';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const CALLS = {
  days: 30, kind: 'all', provider: null, include_test: true,
  byUser: [],
  totals: { calls: 46, users: 1, duration_sec: 0, tokens_call: 0, tokens_consult: 0, tokens_total: 0 },
  byProvider: [{ provider: 'talerid', sessions: 43 }, { provider: 'zoom', sessions: 3 }],
};

const ok = (body: any) => Promise.resolve({ ok: true, status: 200, json: async () => body });

/** Ручка таблицы отвечает CALLS с тем include_test, что пришёл в запросе. */
const backend = (url: string) =>
  url.startsWith('/webhook/admin/calls/sessions')
    ? ok({ total: 0, limit: 50, sessions: [] })
    : ok({ ...CALLS, include_test: url.includes('includeTest=1') });

let container: HTMLDivElement;
let root: Root;

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const click = async (testid: string) => {
  const el = q(testid);
  if (!el) throw new Error(`нет элемента ${testid}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

const urls = () => get.mock.calls.map((c) => c[0] as string);
/** Последний запрос таблицы (не ленты). */
const lastTableUrl = () => urls().filter((u) => u.startsWith('/webhook/admin/calls?')).pop();

beforeEach(async () => {
  get.mockReset();
  get.mockImplementation(backend);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AdminCallsView />); });
  await settle();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('AdminCallsView', () => {
  it('по умолчанию — все сессии вместе с тестовыми и предупреждение об этом', () => {
    expect(lastTableUrl()).toBe('/webhook/admin/calls?days=30&kind=all&includeTest=1');
    expect(q('admin-calls-test-banner')).not.toBeNull();
  });

  it('лента получает те же фильтры, что таблица', () => {
    expect(urls().find((u) => u.startsWith('/webhook/admin/calls/sessions')))
      .toBe('/webhook/admin/calls/sessions?days=30&kind=all&includeTest=1&limit=50');
  });

  it('на вкладке «Все» кнопок площадок нет', () => {
    expect(q('admin-calls-providers')).toBeNull();
  });

  it('на «Встречах» кнопки площадок, и выбранная уходит в запрос', async () => {
    await click('admin-calls-kind-meeting');
    expect(q('admin-calls-provider-all')?.textContent).toBe('Все площадки · 46');
    expect(q('admin-calls-provider-talerid')?.textContent).toBe('Taler ID · 43');

    await click('admin-calls-provider-zoom');
    expect(lastTableUrl()).toBe('/webhook/admin/calls?days=30&kind=meeting&provider=zoom&includeTest=1');
  });

  it('смена вкладки сбрасывает площадку', async () => {
    await click('admin-calls-kind-meeting');
    await click('admin-calls-provider-zoom');
    await click('admin-calls-kind-call');
    expect(lastTableUrl()).toBe('/webhook/admin/calls?days=30&kind=call&includeTest=1');
  });

  it('без «Тестовых» фильтр уходит в запрос и плашка исчезает', async () => {
    await click('admin-calls-include-test');
    expect(lastTableUrl()).toBe('/webhook/admin/calls?days=30&kind=all');
    expect(q('admin-calls-test-banner')).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тест красный**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/AdminCallsView.test.tsx 2>&1 | tail -15)
```

Ожидается FAIL, 6 из 6. Старый раздел открывается на `kind=call`, не шлёт `includeTest`, не зовёт `/sessions` и не рисует кнопок площадок.

- [ ] **Step 3: Переписать раздел**

Заменить содержимое `src/components/admin/AdminCallsView.tsx` целиком:

```tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, AlertCircle, RefreshCw, Coins, Users, Clock, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { formatTokens, formatDuration, formatWhen } from './callsFormat';
import { providerLabel } from './callProviders';
import UserActivityDrawer from './UserActivityDrawer';
import CallSessionsFeed from './CallSessionsFeed';

type CallKind = 'call' | 'meeting' | 'all';

interface CallUserRow {
  user_id: string;
  calls: number;
  duration_sec: number;
  /** Списано за минуты разговора (voice_calls.tokens_charged). */
  tokens_call: number;
  /** Списано за вопросы ведущего профильным ассистентам (voice_call_jobs). */
  tokens_consult: number;
  tokens_total: number;
  consults: number;
  last_call: string | null;
}

interface CallsResp {
  days: number;
  kind: CallKind;
  provider: string | null;
  include_test: boolean;
  byUser: CallUserRow[];
  totals: {
    calls: number;
    users: number;
    duration_sec: number;
    tokens_call: number;
    tokens_consult: number;
    tokens_total: number;
  };
  /** Сессии по площадкам за период — для кнопок фильтра на «Встречах». */
  byProvider: { provider: string; sessions: number }[];
}

const KINDS: { id: CallKind; label: string }[] = [
  { id: 'call', label: 'Звонки' },
  { id: 'meeting', label: 'Встречи' },
  { id: 'all', label: 'Все' },
];

/** Как называть счётчик и пустую выборку на каждой вкладке. */
const COUNT_LABEL: Record<CallKind, string> = { call: 'Звонков', meeting: 'Встреч', all: 'Сессий' };
const EMPTY_LABEL: Record<CallKind, string> = {
  call: 'Звонков за период не было',
  meeting: 'Встреч за период не было',
  all: 'Сессий за период не было',
};

const PERIODS = [7, 30, 90];

const chipClass = (active: boolean) =>
  clsx(
    'px-2.5 py-1 text-xs rounded-md border transition-colors',
    active
      ? 'border-forest-400 bg-forest-50 text-forest-700'
      : 'border-gray-200 text-gray-600 hover:border-gray-300',
  );

const AdminCallsView: React.FC = () => {
  const { t } = useTranslation();
  // Клик по строке открывает карточку человека — там лежат его разговоры.
  // Раньше провалиться отсюда было некуда: карточка открывалась только из
  // «Платежей», «Пользователей» и «Токенов».
  const [drawerUser, setDrawerUser] = useState<string | null>(null);
  const [data, setData] = useState<CallsResp | null>(null);
  const [days, setDays] = useState(30);
  // «Все» по умолчанию: раздел про звонки и встречи, и встречи должны быть
  // видны сразу, а не за вкладкой.
  const [kind, setKind] = useState<CallKind>('all');
  // Площадка внутри «Встреч»; null — все площадки.
  const [provider, setProvider] = useState<string | null>(null);
  // Тестовые аккаунты по умолчанию показываем, как в «Платежах»: на 24.09.2026
  // все встречи на проде — прогоны владельца с тестового номера, и без них
  // раздел выглядит так, будто встреч нет вовсе. Снимается одним кликом.
  const [includeTest, setIncludeTest] = useState(true);
  // Растёт по «Обновить»: лента перезагружается вместе с таблицей.
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Одна строка фильтров на таблицу и ленту: разойдясь, они показали бы
  // разные наборы сессий.
  const query = [
    `days=${days}`,
    `kind=${kind}`,
    provider ? `provider=${encodeURIComponent(provider)}` : '',
    includeTest ? 'includeTest=1' : '',
  ]
    .filter(Boolean)
    .join('&');

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get(`/webhook/admin/calls?${query}`);
      if (!resp.ok) throw new Error(`Звонки: ${resp.status}`);
      setData(await resp.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [query]); // eslint-disable-line

  // Площадка имеет смысл только внутри «Встреч»: при смене вкладки она
  // сбрасывается, иначе «Звонки» молча отфильтровались бы по Zoom в ноль.
  const selectKind = (k: CallKind) => {
    setKind(k);
    setProvider(null);
  };

  const refresh = () => {
    load();
    setReloadKey((n) => n + 1);
  };

  const rows = data?.byUser ?? [];
  const byProvider = data?.byProvider ?? [];
  const providersTotal = byProvider.reduce((sum, p) => sum + p.sessions, 0);

  return (
    <>
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 pb-20 md:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Phone className="w-6 h-6 text-forest-600" />
            <h1 className="text-xl font-bold text-gray-900">Звонки и встречи</h1>
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:border-forest-400 hover:bg-forest-50 disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
            Обновить
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {data?.include_test && (
          <div
            data-testid="admin-calls-test-banner"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            Цифры включают тестовые аккаунты. Снимите «Тестовые», чтобы оставить только живых пользователей.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {KINDS.map((k) => (
              <button
                key={k.id}
                data-testid={`admin-calls-kind-${k.id}`}
                onClick={() => selectKind(k.id)}
                className={chipClass(kind === k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {PERIODS.map((d) => (
              <button key={d} onClick={() => setDays(d)} className={chipClass(days === d)}>
                {d} дней
              </button>
            ))}
          </div>
          <button
            data-testid="admin-calls-include-test"
            onClick={() => setIncludeTest((v) => !v)}
            title="Сессии тестовых аккаунтов — в таблице, в ленте и в цифрах выше"
            className={clsx(
              'px-2.5 py-1 text-xs rounded-md border transition-colors',
              includeTest
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300',
            )}
          >
            {includeTest ? '✓ ' : ''}Тестовые
          </button>
        </div>

        {/* Кнопки площадок строятся по данным: новая площадка появится без
            правки фронта, под техническим именем, пока ей не дадут подпись. */}
        {kind === 'meeting' && byProvider.length > 0 && (
          <div data-testid="admin-calls-providers" className="flex flex-wrap gap-1">
            <button
              data-testid="admin-calls-provider-all"
              onClick={() => setProvider(null)}
              className={chipClass(provider === null)}
            >
              Все площадки · {providersTotal}
            </button>
            {byProvider.map((p) => (
              <button
                key={p.provider}
                data-testid={`admin-calls-provider-${p.provider}`}
                onClick={() => setProvider(p.provider)}
                className={chipClass(provider === p.provider)}
              >
                {providerLabel(p.provider, t)} · {p.sessions}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label={COUNT_LABEL[kind]}
            value={formatTokens(data?.totals.calls ?? 0)}
            icon={<Phone className="w-3.5 h-3.5" />}
          />
          <StatCard
            label="Пользователей"
            value={formatTokens(data?.totals.users ?? 0)}
            icon={<Users className="w-3.5 h-3.5" />}
          />
          <StatCard
            label="Общая длительность"
            value={formatDuration(data?.totals.duration_sec ?? 0)}
            icon={<Clock className="w-3.5 h-3.5" />}
          />
          <StatCard
            label="Списано всего"
            value={formatTokens(data?.totals.tokens_total ?? 0)}
            icon={<Coins className="w-3.5 h-3.5" />}
            hint={`разговор ${formatTokens(data?.totals.tokens_call ?? 0)} + консультации ${formatTokens(data?.totals.tokens_consult ?? 0)}`}
            accent
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Разбивка по пользователям</h2>
            <span className="text-xs text-gray-400">за {data?.days ?? days} дней</span>
          </div>

          {isLoading && !data ? (
            <p className="text-sm text-gray-400 py-12 text-center">Загрузка…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 py-12 text-center">{EMPTY_LABEL[kind]}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 font-medium">Пользователь</th>
                    <th className="text-right px-4 py-2.5 font-medium">{COUNT_LABEL[kind]}</th>
                    <th className="text-right px-4 py-2.5 font-medium">Длительность</th>
                    <th className="text-right px-4 py-2.5 font-medium">Консультаций</th>
                    <th className="text-right px-4 py-2.5 font-medium">За разговор</th>
                    <th className="text-right px-4 py-2.5 font-medium">За консультации</th>
                    <th className="text-right px-4 py-2.5 font-medium">Всего списано</th>
                    <th className="text-right px-4 py-2.5 font-medium">Последний</th>
                  </tr>
                </thead>
                <tbody data-testid="admin-calls-rows" className="divide-y divide-gray-100">
                  {rows.map((r, idx) => (
                    <tr
                      key={r.user_id}
                      onClick={() => setDrawerUser(r.user_id)}
                      className="cursor-pointer hover:bg-gray-50"
                      title={t('admin.calls.openUser', 'Открыть карточку и разговоры')}
                    >
                      <td className="px-4 py-2.5 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-forest-700 underline-offset-2 hover:underline">{r.user_id}</td>
                      <td className="px-4 py-2.5 text-right text-gray-900">{r.calls}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{formatDuration(r.duration_sec)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                          {r.consults}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{formatTokens(r.tokens_call)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{formatTokens(r.tokens_consult)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-forest-800">
                        {formatTokens(r.tokens_total)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{formatWhen(r.last_call)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Оговорка про два списания стоит рядом с таблицей, а не в
              документации: цифры сходятся только если знать, что консультации
              ассистентов тарифицируются отдельно от минут разговора. */}
          <p className="text-xs text-gray-400 px-4 py-3 border-t border-gray-100">
            «За разговор» — списание за минуты голосовой сессии. «За консультации» — вопросы,
            которые ведущий во время звонка или встречи задал профильным ассистентам; они
            тарифицируются отдельно.
          </p>
        </div>

        {/* key={query}: при смене фильтров лента пересоздаётся и снова
            начинает с первой порции. */}
        <CallSessionsFeed key={query} query={query} reloadKey={reloadKey} onOpenUser={setDrawerUser} />
      </div>
    </div>

      {/* Карточка человека: там его звонки и встречи с саммари, пометками и диалогом. */}
      {drawerUser && (
        <UserActivityDrawer phone={drawerUser} onClose={() => setDrawerUser(null)} />
      )}
    </>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon?: React.ReactNode; hint?: string; accent?: boolean }> = ({ label, value, icon, hint, accent }) => (
  <div className={clsx('rounded-xl border p-3', accent ? 'border-forest-300 bg-forest-50' : 'border-gray-200 bg-white')}>
    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
      {icon}
      <span>{label}</span>
    </div>
    <p className={clsx('text-lg font-semibold', accent ? 'text-forest-800' : 'text-gray-900')}>{value}</p>
    {hint && <p className="text-xs text-gray-400 mt-1 leading-tight">{hint}</p>}
  </div>
);

export default AdminCallsView;
```

- [ ] **Step 4: Прогнать тесты раздела и линтер**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
(cd $F && ./node_modules/.bin/vitest run src/components/admin/ 2>&1 | tail -8 && ./node_modules/.bin/eslint src/components/admin/AdminCallsView.tsx src/components/admin/callProviders.ts src/components/admin/callFlagLabels.ts && echo "eslint чисто")
```

Ожидается: все тесты `src/components/admin/` PASS, среди них 6 новых раздела; затем `eslint чисто`.

- [ ] **Step 5: Закоммитить**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
git -C $F branch --show-current
git -C $F add src/components/admin/AdminCallsView.tsx src/components/admin/AdminCallsView.test.tsx
git -C $F commit -q -m "feat(admin): раздел «Звонки и встречи» — площадки, тестовые, лента сессий

Раздел открывается на «Все»; на «Встречах» кнопки площадок с числом
сессий, выбранная уходит в запрос и сбрасывается при смене вкладки.
«Тестовые» включены по умолчанию, как в «Платежах», с плашкой: все
встречи на проде — прогоны владельца. Под таблицей — лента сессий.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Проверка фронта на ноде — полный прогон, типы, сборка

- [ ] **Step 1: Запушить ветку и прогнать все тесты**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
git -C $F push -q -u origin feat/admin-meeting-sessions
SHA=$(git -C $F rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm test 2>&1 | tail -6"
```

Ожидается: `Test Files 64 passed (64)`, `Tests 792 passed (792)`. Это 764 базовых и 28 новых:
- `callsLocales` — 5;
- `callProviders` — 3;
- `callFlagLabels` — 1;
- `CallSessionItem` — 7;
- `CallSessionsFeed` — 6;
- `AdminCallsView` — 6.

Если числа не сходятся, выяснить почему, а не подгонять ожидание.

- [ ] **Step 2: Дельта `tsc`**

```bash
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-front && source ~/.nvm/nvm.sh && npx tsc --listFilesOnly -p tsconfig.app.json | grep -c 'components/admin/CallSessionItem.tsx'; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep 'error TS' > ~/ci/wt/.tsc-front-branch.txt; wc -l < ~/ci/wt/.tsc-front-branch.txt; grep -E 'components/admin/(CallSession|callProviders|callsLocales|AdminCallsView|UserCallsList|callFlagLabels)' ~/ci/wt/.tsc-front-branch.txt; echo конец"
```

Ожидается:
- `1` — наш файл в программе;
- `45` — столько же, сколько на `origin/main`;
- ни одной строки с нашими файлами перед `конец`.

Если число выросло, найти новые ошибки: `diff` с базой на `b69180a` (`git checkout -q b69180a` и тот же прогон) и починить.

- [ ] **Step 3: Сборка**

```bash
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-front && source ~/.nvm/nvm.sh && pnpm build 2>&1 | tail -4"
```

Ожидается `✓ built in …`, без ошибок.

---

### Task 13: Слить в `main` (бэк, затем фронт)

Пуш в `main` согласован владельцем в дизайне («после зелёных прогонов влью в main»). Сливаем merge-коммитом, как принято в репозиториях (`Merge feat/…: …`). Слияние собирается поверх свежего `origin/main` в ворктри, чтобы не трогать общий чекаут. Push идёт без force: merge-коммит — потомок и `origin/main`, и ветки.

- [ ] **Step 1: Убедиться, что никто не катит прямо сейчас**

Прод-фаза чужого деплоя тянет `origin/main` заново: пуш посреди неё увезёт на прод код, который тестовая фаза не проверяла.

```bash
ps -eo command | grep -c "^bash .*scripts/deploy.sh"
ssh dv@85.192.61.231 'ps -eo command | grep -c "^bash .*scripts/deploy.sh"'
```

Ожидается `0` и `0`. Иначе ждать окончания и спросить владельца.

- [ ] **Step 2: Собрать merge-коммит бэка и прогнать тесты на нём**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B fetch -q origin
git -C $B log --oneline HEAD..origin/main
git -C $B checkout -q --detach origin/main
git -C $B merge --no-ff feat/admin-meeting-sessions -m "Merge feat/admin-meeting-sessions: встречи всех площадок в разделе «Звонки» админки

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
MERGE=$(git -C $B rev-parse HEAD)
git -C $B push -q origin $MERGE:refs/heads/feat/admin-meeting-sessions
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-back && git fetch -q origin && git checkout -q $MERGE && source ~/.nvm/nvm.sh && npx jest src/admin src/common/guards --maxWorkers=2 2>&1 | tail -6"
```

Ожидается: слияние без конфликтов, все тесты зелёные. Если `log HEAD..origin/main` что-то показал, в `main` пришли чужие коммиты. Тогда перед пушем в `main` дополнительно повторить Task 5, Step 1 (дельту `tsc`) на `$MERGE`. При конфликте остановиться и разобраться: чужую работу не перетирать.

- [ ] **Step 3: Запушить бэк в `main`**

```bash
B=~/Downloads/spirits_back/.worktrees/admin-meetings
git -C $B push origin $MERGE:main
git -C $B checkout -q feat/admin-meeting-sessions
git -C $B merge -q --ff-only $MERGE
git -C $B log --oneline -1
```

Если push отклонён как non-fast-forward, пока шла проверка, в `main` успели запушить. Повторить Step 2 с новым `origin/main`.

- [ ] **Step 4: То же для фронта**

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
git -C $F fetch -q origin
git -C $F log --oneline HEAD..origin/main
git -C $F checkout -q --detach origin/main
git -C $F merge --no-ff feat/admin-meeting-sessions -m "Merge feat/admin-meeting-sessions: раздел «Звонки и встречи» — площадки, тестовые, лента сессий

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
MERGE=$(git -C $F rev-parse HEAD)
git -C $F push -q origin $MERGE:refs/heads/feat/admin-meeting-sessions
ssh dv@85.192.61.231 "cd ~/ci/wt/admin-meetings-front && git fetch -q origin && git checkout -q $MERGE && source ~/.nvm/nvm.sh && pnpm test 2>&1 | tail -4 && pnpm build 2>&1 | tail -2"
```

Ожидается: тесты зелёные, сборка собрана. Затем:

```bash
F=~/Downloads/spirits_front/.worktrees/admin-meetings
git -C $F push origin $MERGE:main
git -C $F checkout -q feat/admin-meeting-sessions
git -C $F merge -q --ff-only $MERGE
```

В общем чекауте фронта на маке останется локальный непушенный `054611f`: это исходный коммит спеки, до переноса её в ветку. Его содержимое уже в `main` в виде `21bca6d`, поэтому `git pull --rebase` там сам его отбросит («skipped previously applied commit»). Общий чекаут не трогать.

---

### Task 14: Выкат на test и проверка глазами — ТОЛЬКО с разрешения владельца

- [ ] **Step 1: Спросить владельца**

Спросить три вещи:
1. Можно ли катить `TEST_ONLY=1`?
2. Не ведёт ли выкат другая сессия?
3. Откуда запускать?
   - Рекомендация — с ноды из `~/dev`: браузерный smoke там осмысленный.
   - С мака браузерный слой test краснеет на любом коде: падения ровно по 50,1 с — это таймаут навигации, а не регрессия.

- [ ] **Step 2: Проверить чекаут, из которого пойдёт деплой**

`deploy.sh` пушит `main` из своего чекаута и отказывает, если в нём есть незакоммиченное вне `docs/` или если `main` отстаёт от `origin`. Для мака:

```bash
git -C ~/Downloads/spirits_back status -sb | head -1; git -C ~/Downloads/spirits_back status --porcelain | grep -v '^.. docs/'
git -C ~/Downloads/spirits_front status -sb | head -1; git -C ~/Downloads/spirits_front status --porcelain | grep -v '^.. docs/'
```

Для ноды — те же команды через `ssh dv@85.192.61.231` для `~/dev/spirits_back` и `~/dev/spirits_front`.

- Если деревья чистые и отстают — `git -C <чекаут> pull -q --rebase`.
- Если в дереве чужие правки — **не трогать** и спросить владельца.

- [ ] **Step 3: Запустить отвязанно и следить за логом**

С мака:

```bash
( TEST_ONLY=1 nohup bash ~/Downloads/spirits_back/scripts/deploy.sh > /private/tmp/claude-501/-Users-dmitry-Downloads-spirits-front/67f5b616-ad99-492d-a5fc-6072808905a0/scratchpad/deploy-test.log 2>&1 < /dev/null & )
```

С ноды: `ssh dv@85.192.61.231 '( TEST_ONLY=1 nohup bash ~/dev/spirits_back/scripts/deploy.sh > ~/deploy-admin-meetings.log 2>&1 < /dev/null & )'`.

Как ждать:
- Ждать через Monitor по логу, до строки с итогом PHASE 1.
- Не пускать через `| tail`: конвейер спрячет код возврата.
- Не запускать с таймаутом инструмента: убитый процесс молча откатит test на предыдущий SHA.

Если PHASE 1 красный, прочитать причину в логе. Падения браузерного слоя ровно по 50,1 с при запуске с мака — не регрессия (память `project_test_stand_browser_smoke_red`). Любое другое падение разбирать.

- [ ] **Step 4: Проверить API на test**

```bash
set -a; . ~/Downloads/spirits_back/scripts/test-server.env.local; set +a
BASE=https://test.linkeon.io; P=79030169187
curl -s -u "$TEST_BASIC_AUTH" -m 15 "$BASE/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/$P" >/dev/null
CODE=$(curl -s -u "$TEST_BASIC_AUTH" -m 15 "$BASE/webhook/debug/sms-code/$P" | grep -oE '[0-9]{4,6}' | head -1)
TOKEN=$(curl -s -u "$TEST_BASIC_AUTH" -m 15 "$BASE/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/$P/$CODE" | sed -n 's/.*"access-token":"\([^"]*\)".*/\1/p')
curl -s -u "$TEST_BASIC_AUTH" -H "Authorization: Bearer $TOKEN" "$BASE/webhook/admin/calls?days=90&kind=meeting&includeTest=1" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["kind"], d["include_test"], d["totals"]["calls"], d["byProvider"])'
curl -s -u "$TEST_BASIC_AUTH" -H "Authorization: Bearer $TOKEN" "$BASE/webhook/admin/calls/sessions?days=90&kind=meeting&provider=telemost&includeTest=1&limit=3" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["total"], [(s["provider"], s["status"], s["flags"]) for s in d["sessions"]])'
```

Ожидается:
- первая строка: `meeting True <N>`, а в `byProvider` площадки `meet`, `telemost`, `zoom`, `teams`, `talerid` и `linkeon_room`;
- вторая строка: только `telemost`, у `failed` пометка `['failed']`.

Проверять тело ответа, а не код: SPA-фолбэк на этом хосте отдаёт 200 с HTML на любой путь. Если вместо JSON пришёл HTML, до API запрос не дошёл.

- [ ] **Step 5: Посмотреть раздел глазами**

Через Playwright:
1. Открыть `https://<TEST_BASIC_AUTH>@test.linkeon.io/`, положить в `localStorage` ключи `jwt_access_token` (`$TOKEN`) и `jwt_refresh_token`. Refresh-токен взять из того же ответа `check-code`, из поля `refresh-token`.
2. Перейти на `/admin?tab=calls`.
3. Сверить имя бандла на странице с бандлом в `dist` на стенде, чтобы убедиться, что смотришь свою сборку.

Проверить:
- [ ] заголовок «Звонки и встречи», открыта вкладка «Все», жёлтая плашка на месте;
- [ ] на «Встречах» есть кнопки площадок с числами; клик по «Яндекс Телемост» сужает таблицу и ленту, клик по «Звонки» сбрасывает площадку;
- [ ] в ленте у строк подписи площадок, ассистент, списание; есть строки «сбой» с причиной в саммари; «Показать ещё» догружает;
- [ ] клик по строке раскрывает расшифровку, клик по номеру открывает карточку, в карточке — «Звонки и встречи» с подписями площадок;
- [ ] без «Тестовых» плашка исчезает, числа меняются;
- [ ] при ширине 390 px кнопки и строки переносятся, горизонтальной прокрутки страницы нет.

Сделать скриншот раздела и ленты — для отчёта владельцу.

---

### Task 15: Прод — ТОЛЬКО по команде владельца «деплой»

- [ ] **Step 1: Получить команду и повторить проверки Task 14, Steps 1–2**
- [ ] **Step 2: Запустить `deploy.sh` без флагов, отвязанно, как в Task 14, Step 3**
- [ ] **Step 3: Проверить прод**

Та же пара `curl`, что в Task 14, Step 4, но с `BASE=https://my.linkeon.io` и без `-u "$TEST_BASIC_AUTH"`.

На тестовые номера (в том числе `79030169187`) SMS не уходит: код лежит только в Redis и отдаётся через `/webhook/debug/sms-code` — так же логинится прод-smoke `deploy.sh`. Если ручка ответила пусто, токен админа брать по шапке `spirits_back/CLAUDE.md`, раздел «Автономия»: refresh-token из `admin-state.json` обменять на access.

Ожидается на проде: на «Встречах» с «Тестовыми» — `talerid` и `linkeon_room` (на 25.09 это 43 и 13, если попадают в 90 дней). Без «Тестовых» встреч ноль: все они — прогоны владельца.

---

### Task 16: Уборка

- [ ] **Step 1: Снять ворктри на ноде**

```bash
ssh dv@85.192.61.231 'git -C ~/ci/spirits_back worktree remove --force ~/ci/wt/admin-meetings-back; git -C ~/ci/spirits_front worktree remove --force ~/ci/wt/admin-meetings-front; rm -f ~/ci/wt/.tsc-back-base.txt ~/ci/wt/.tsc-back-branch.txt ~/ci/wt/.tsc-front-branch.txt; ls ~/ci/wt'
```

- [ ] **Step 2: Снять ворктри на маке**

Только после того, как код в `main` и на проде:

```bash
git -C ~/Downloads/spirits_back worktree remove ~/Downloads/spirits_back/.worktrees/admin-meetings
git -C ~/Downloads/spirits_front worktree remove --force ~/Downloads/spirits_front/.worktrees/admin-meetings
```

У фронта `--force` нужен из-за неотслеживаемого `node_modules` и `pnpm-workspace.yaml`.

- [ ] **Step 3: Спросить про ветки**

Ветки `feat/admin-meeting-sessions` (локальные и в `origin`) — спросить владельца, удалять ли их. Удаление веток без спроса запрещено.
