# Аренда продуктов Linkeon в токенах — план реализации (кусок 3)

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОД-НАВЫК: `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`. Шаги помечены чекбоксами `- [ ]`.

**Цель:** продукт стоит 50 000 токенов в месяц; кончились — засыпает, код цел; пополнил — просыпается.

**Архитектура:** сервер решает, агент хоста исполняет. Сон и пробуждение — новые виды заданий в той очереди, что уже работает для заведения. Списание — один SQL-оператор, потому что прод работает в кластере из двух процессов.

**Стек:** NestJS 10, PostgreSQL 16, `product-runner` (TypeScript, свой jest), React 18 + vitest.

**Спека:** `docs/superpowers/specs/2026-09-16-linkeon-products-rent-design.md`

---

## Правила прогона

Мак не тянет тяжёлое — всё уезжает на тестовую ноду, в CI-клоны:

```bash
git push -u origin <ветка>
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && git fetch -q origin && git checkout -qf <sha> \
  && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL="postgres:///prov_fields?host=/var/run/postgresql" npx jest src/products'
```

- `source ~/.nvm/nvm.sh` обязателен в каждой ssh-команде.
- **Не трогать `~/spirits_back` и `~/spirits_front` на ноде** — это живой чекаут стенда.
- База `prov_fields` уже заведена; интеграционный сьют сам накатывает схему файлами миграций и требует пустую таблицу на входе.
- **Прогонять весь `src/products`, а не свой файл.** На этой неделе правка `COLUMNS` с прогоном одного файла сломала сторож формы запроса, и он упал уже на выкате.
- jest в бэкенде **типы не проверяет** (`isolatedModules` + транспайлер). Единственный шлюз — `npx tsc --noEmit -p tsconfig.build.json`.
- На фронте голый `tsc --noEmit` компилирует ноль файлов и всегда зелёный, нужен `-p tsconfig.app.json`.
- Мутации: каждая со **счётом замен** и с контрольным прогоном **без мутации** до и после серии. Сверять и `Test Suites:`, и `Tests: N total` — харнесс в этой работе врал девять раз.
- `deploy.sh` не запускать: выкат ведёт владелец.

**Базовая линия:** 18 сьютов, 364 теста в `src/products`; 11 сьютов, 265 тестов в `product-runner`; 51 файл, 602 теста на фронте.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/products/migrations/004_rent.sql` | колонки аренды, статус `sleeping`, вид задания |
| `src/products/rent.service.ts` | списание, сборщик, постановка заданий сна и пробуждения |
| `src/products/rent.service.spec.ts` | форма запросов на заглушках |
| `src/products/provisioning.integration.spec.ts` | поведение против живого Postgres (дописывается) |
| `src/products/provisioning.service.ts` | `kind` в выдаче задания и в приёме отчёта |
| `src/products/turns.service.ts` | отказ спящему продукту |
| `product-runner/src/host/sleep.ts` | хостовые шаги сна и пробуждения |
| `product-runner/src/host/sleep.spec.ts` | их проверка на симуляторе хоста |
| `product-runner/src/host/index.ts` | разбор вида задания в цикле опроса |
| `spirits_front/src/components/products/ProductsListView.tsx` | «оплачено до», «спит», предупреждение |

Новый сервис, а не дописка в `provisioning.service.ts`: тот уже 900 строк и отвечает за заведение. Аренда — другая ответственность и другой жизненный цикл.

---

## Task 1: Миграция схемы

**Файлы:**
- Создать: `spirits_back/src/products/migrations/004_rent.sql`
- Изменить: `spirits_back/src/products/products.service.ts` (вызов миграции, `COLUMNS`, `ProductRow`)
- Тест: `spirits_back/src/products/products.migration.spec.ts`

- [ ] **Шаг 1: Написать миграцию**

`004_rent.sql`:

```sql
-- Аренда продуктов в токенах. Кусок 3.
ALTER TABLE products ADD COLUMN IF NOT EXISTS paid_until timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sleep_reason text;

-- Продукты, заведённые ДО этой работы (demo, shop2 и всё, что появится до
-- выката), имеют paid_until = NULL. Наивный сборщик списал бы с них аренду в
-- первый же оборот — за период, которого не было. Даём тот же бесплатный
-- первый месяц, что и новым.
UPDATE products SET paid_until = now() + interval '1 month'
 WHERE paid_until IS NULL AND archived_at IS NULL;

-- Статус sleeping. CHECK расширяется ВМЕСТЕ со статусом: в куске 2 пропущенный
-- 'failed' в CHECK привёл бы к нарушению ограничения внутри обработчика ошибки.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('provisioning','running','degraded','stopped','failed','archived','sleeping'));

-- Вид задания. Сегодня вид один и подразумевается; со сном их три.
ALTER TABLE product_provision_jobs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'provision';
ALTER TABLE product_provision_jobs DROP CONSTRAINT IF EXISTS product_provision_jobs_kind_check;
ALTER TABLE product_provision_jobs ADD CONSTRAINT product_provision_jobs_kind_check
  CHECK (kind IN ('provision','sleep','wake'));

-- Сборщику нужен быстрый отбор «кому пора платить». Частичный: архивные и
-- спящие в него не попадают никогда.
CREATE INDEX IF NOT EXISTS products_paid_until_due
  ON products (paid_until)
  WHERE archived_at IS NULL AND status = 'running';
```

- [ ] **Шаг 2: Подключить миграцию**

В `products.service.ts`, метод `onModuleInit`, после `002_provisioning.sql`:

```ts
await this.applyMigration('002_provisioning.sql');
// Строго после 002: 004 расширяет CHECK статуса и вид задания, которые
// заводит 002.
await this.applyMigration('004_rent.sql');
```

Нумерация перескакивает через `003_host_agent.sql` — он уже есть и применяется там же; не удалять и не переименовывать, на проде он накачен.

- [ ] **Шаг 3: Отдать новые колонки кабинету**

В `products.service.ts` — в `ProductRow` и в `COLUMNS`:

```ts
export interface ProductRow {
  // ... существующие поля ...
  paid_until: string | null;
  sleep_reason: string | null;
}
```

```ts
const COLUMNS = `id, user_id, name, slug, status, kind, domain,
                 runner_seen_at, provision_error, paid_until, sleep_reason, created_at`;
```

- [ ] **Шаг 4: Написать тест**

В `products.migration.spec.ts` добавить:

```ts
it('004 заводит колонки аренды, статус sleeping и вид задания', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '004_rent.sql'), 'utf8',
  );
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS paid_until');
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS sleep_reason');
  // Статус добавляется В СПИСОК, а не заменяет его: потеря любого из
  // существующих сломает запись, которая им пользуется.
  for (const s of ['provisioning', 'running', 'degraded', 'stopped', 'failed', 'archived', 'sleeping']) {
    expect(sql).toContain(`'${s}'`);
  }
  expect(sql).toContain(`kind IN ('provision','sleep','wake')`);
});
```

- [ ] **Шаг 5: Прогнать**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh \
  && PROVISIONING_PG_URL="postgres:///prov_fields?host=/var/run/postgresql" npx jest src/products'
```
Ожидание: PASS, 365 тестов.

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/migrations/004_rent.sql src/products/products.service.ts src/products/products.migration.spec.ts
git commit -m "feat(products): схема аренды — оплачено до, статус сна, вид задания"
```

---

## Task 2: Списание аренды одним оператором

> **ЧИТАТЬ ДО РЕАЛИЗАЦИИ. Две мины, обе настоящие.**
>
> **1. Существующее списание берёт ЧАСТИЧНО.** `misc.deductTokens` зовёт `consume_user_tokens`, а та при нехватке баланса забирает **сколько есть** и возвращает это число (проверено на проде: `IF v_current_balance >= p_amount THEN … ELSE v_actual_amount := v_current_balance`). Для правки это верно, для аренды — худший исход: денег взяли не сколько надо, продукт всё равно засыпает, а баланс обнулён. **Аренду нельзя списывать через `deductTokens`.**
>
> **2. Прод работает в кластере из ДВУХ процессов.** «Прочитать баланс, потом списать» — гонка с двойным списанием. Единственная защита — один оператор, где точка сериализации это блокировка строки продукта: второй процесс встаёт на замке, после коммита первого перепроверяет `paid_until` по новой версии строки (EvalPlanQual) и не находит ничего.

**Файлы:**
- Создать: `spirits_back/src/products/rent.service.ts`
- Тест: `spirits_back/src/products/rent.service.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

`rent.service.spec.ts`:

```ts
import { RentService } from './rent.service';

function makeService() {
  const calls: { sql: string; params: any[] }[] = [];
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [{ charged: 1 }], rowCount: 1 };
    }),
  };
  return { svc: new RentService(pg as any), calls, pg };
}

describe('RentService.chargeRent', () => {
  it('списание и сдвиг периода идут ОДНИМ оператором', async () => {
    // Два запроса вместо одного — это окно, в которое второй процесс кластера
    // спишет второй раз.
    const { svc, calls } = makeService();

    await svc.chargeRent('p-1');

    expect(calls).toHaveLength(1);
  });

  it('период сдвигается только при достаточном балансе', async () => {
    const { svc, calls } = makeService();

    await svc.chargeRent('p-1');

    // Проверка достатка стоит В УСЛОВИИ сдвига, а не отдельным запросом:
    // иначе период уедет вперёд, а денег не возьмут — бесплатный месяц.
    expect(calls[0].sql).toContain('>= $2');
    expect(calls[0].sql).toContain('paid_until <= now()');
  });

  it('не списывает со спящего и с архивного', async () => {
    const { svc, calls } = makeService();

    await svc.chargeRent('p-1');

    expect(calls[0].sql).toContain(`status = 'running'`);
    expect(calls[0].sql).toContain('archived_at IS NULL');
  });

  it('отдаёт правду о том, списалось ли', async () => {
    const { svc, pg } = makeService();
    pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    expect(await svc.chargeRent('p-1')).toBe(false);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest src/products/rent.service.spec.ts'
```
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

`rent.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';

/** Месячная аренда продукта. Около 149 ₽ по цене пакета starter. */
export const RENT_TOKENS = 50_000;

@Injectable()
export class RentService {
  private readonly logger = new Logger(RentService.name);

  constructor(private readonly pg: PgService) {}

  /**
   * Списать аренду за очередной месяц. Возвращает true, если списали.
   *
   * ОДИН ОПЕРАТОР, и это не стилистика. Прод работает в кластере из двух
   * процессов, и точка сериализации здесь — блокировка строки продукта:
   * второй процесс встаёт на замке, после коммита первого перепроверяет
   * `paid_until` уже по новой версии строки и не находит ничего.
   *
   * Достаток баланса стоит В УСЛОВИИ сдвига периода. Проверять его отдельным
   * запросом нельзя дважды: это окно для гонки И это случай «период уехал
   * вперёд, а денег не взяли» — бесплатный месяц.
   *
   * `deductTokens` здесь НЕ используется намеренно: он списывает частично
   * (consume_user_tokens при нехватке забирает сколько есть). Для аренды это
   * худший исход — денег взяли не сколько надо, продукт всё равно заснёт, а
   * баланс обнулён.
   *
   * GREATEST(0, …) — от редкой гонки с ходом, завершившимся в тот же миг:
   * баланс прочитан в подзапросе того же оператора, и параллельное списание
   * за правку могло увести его ниже. Цена — недобор нескольких токенов;
   * альтернатива — отрицательный баланс, который дальше по коду никто не ждёт.
   */
  async chargeRent(productId: string): Promise<boolean> {
    const r = await this.pg.query(
      `WITH claimed AS (
          UPDATE products p
             SET paid_until = p.paid_until + interval '1 month'
           WHERE p.id = $1
             AND p.archived_at IS NULL
             AND p.status = 'running'
             AND p.paid_until <= now()
             AND COALESCE(
                   (SELECT a.tokens FROM ai_profiles_consolidated a WHERE a.user_id = p.user_id),
                   0) >= $2
          RETURNING p.id, p.user_id
       )
       UPDATE ai_profiles_consolidated a
          SET tokens = GREATEST(0, a.tokens - $2), updated_at = now()
         FROM claimed c
        WHERE a.user_id = c.user_id
       RETURNING a.user_id`,
      [productId, RENT_TOKENS],
    );
    return (r.rowCount ?? 0) > 0;
  }
}
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest src/products/rent.service.spec.ts'
```
Ожидание: PASS, 4 теста.

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/rent.service.ts src/products/rent.service.spec.ts
git commit -m "feat(products): списание аренды одним оператором"
```

---

## Task 3: Поведение списания против живого Postgres

> Заглушки из Task 2 доказывают **форму запроса**, а не поведение. Двойное списание, частичный расход и гонка с ходом видны только на живой базе и только при настоящей одновременности — на одном соединении гонка вырождается в последовательность.

**Файлы:**
- Изменить: `spirits_back/src/products/provisioning.integration.spec.ts`

- [ ] **Шаг 1: Написать сценарии**

Дописать в конец `maybe(...)`-блока, перед закрывающей скобкой:

```ts
  it('21. два ОДНОВРЕМЕННЫХ сборщика списывают аренду ровно один раз', async () => {
    // Прод работает в кластере из двух процессов. Это главный сценарий файла
    // для куска 3: наивная реализация спишет 100k и уедет на два месяца
    // вперёд, и увидит это только владелец в своём балансе.
    const p = await product({ slug: 'rent-race', status: 'running' });
    await pool.query(`UPDATE products SET paid_until = now() - interval '1 day' WHERE id = $1`, [p.id]);
    await setBalance('u-1', 120_000);

    const outcomes = await Promise.all([
      new RentService(pg as any).chargeRent(p.id),
      new RentService(pg as any).chargeRent(p.id),
    ]);

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(await balanceOf('u-1')).toBe(70_000);
    const row = await getProduct(p.id);
    expect(new Date(row.paid_until).getTime()).toBeGreaterThan(Date.now());
  });

  it('22. при нехватке баланса не списывается НИЧЕГО и период не двигается', async () => {
    // Существующий deductTokens в этом месте забрал бы 30k из 50k и оставил
    // ноль: денег не взяли сколько надо, продукт всё равно заснёт, а баланс
    // обнулён. Здесь не должно списаться ни токена.
    const p = await product({ slug: 'rent-poor', status: 'running' });
    await pool.query(`UPDATE products SET paid_until = now() - interval '1 day' WHERE id = $1`, [p.id]);
    await setBalance('u-1', 30_000);
    const before = await getProduct(p.id);

    expect(await new RentService(pg as any).chargeRent(p.id)).toBe(false);

    expect(await balanceOf('u-1')).toBe(30_000);
    expect((await getProduct(p.id)).paid_until).toEqual(before.paid_until);
  });

  it('23. неистёкший период не списывается', async () => {
    const p = await product({ slug: 'rent-early', status: 'running' });
    await pool.query(`UPDATE products SET paid_until = now() + interval '10 days' WHERE id = $1`, [p.id]);
    await setBalance('u-1', 120_000);

    expect(await new RentService(pg as any).chargeRent(p.id)).toBe(false);
    expect(await balanceOf('u-1')).toBe(120_000);
  });

  it('24. со спящего аренда не списывается', async () => {
    // Спящий не копит долг — это решение владельца, и оно держится ровно на
    // условии status = 'running' в операторе списания.
    const p = await product({ slug: 'rent-asleep', status: 'sleeping' });
    await pool.query(`UPDATE products SET paid_until = now() - interval '2 months' WHERE id = $1`, [p.id]);
    await setBalance('u-1', 500_000);

    expect(await new RentService(pg as any).chargeRent(p.id)).toBe(false);
    expect(await balanceOf('u-1')).toBe(500_000);
  });

  it('25. ровно на границе баланса списание проходит', async () => {
    // Сторож знака: `>` вместо `>=` отбил бы владельца, у которого ровно на
    // месяц, и продукт заснул бы при достаточных деньгах.
    const p = await product({ slug: 'rent-exact', status: 'running' });
    await pool.query(`UPDATE products SET paid_until = now() - interval '1 hour' WHERE id = $1`, [p.id]);
    await setBalance('u-1', 50_000);

    expect(await new RentService(pg as any).chargeRent(p.id)).toBe(true);
    expect(await balanceOf('u-1')).toBe(0);
  });
```

- [ ] **Шаг 2: Добавить фикстуры баланса**

Рядом с существующими фикстурами (`product`, `job`, `failedProduct`):

```ts
  /** Баланс живёт в ai_profiles_consolidated — той же таблице, из которой
   *  его читает оператор списания. Заводим строку, если её нет. */
  async function setBalance(userId: string, tokens: number) {
    await pool.query(
      `INSERT INTO ai_profiles_consolidated (user_id, tokens) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET tokens = EXCLUDED.tokens`,
      [userId, tokens],
    );
  }

  const balanceOf = async (userId: string) =>
    Number(
      (await pool.query('SELECT tokens FROM ai_profiles_consolidated WHERE user_id = $1', [userId]))
        .rows[0]?.tokens ?? 0,
    );
```

- [ ] **Шаг 3: Завести таблицу баланса в сьюте**

Схема сьюта накатывается файлами миграций продуктов, а `ai_profiles_consolidated` в них нет. В `beforeAll`, перед накаткой миграций:

```ts
    // Таблица баланса живёт вне модуля продуктов, миграциями продуктов не
    // заводится. Здесь нужен только тот минимум, который читает и пишет
    // оператор списания.
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ai_profiles_consolidated (
         user_id text PRIMARY KEY,
         tokens bigint NOT NULL DEFAULT 0,
         updated_at timestamptz NOT NULL DEFAULT now())`,
    );
```

И в `beforeEach`/`afterAll` добавить её в `TRUNCATE`:

```ts
'TRUNCATE products, product_provision_jobs, product_turns, ai_profiles_consolidated RESTART IDENTITY CASCADE'
```

- [ ] **Шаг 4: Прогнать**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh \
  && PROVISIONING_PG_URL="postgres:///prov_fields?host=/var/run/postgresql" npx jest src/products'
```
Ожидание: PASS, 374 теста.

- [ ] **Шаг 5: Проверить мутациями**

Каждая со счётом замен, контроль без мутации до и после серии:

| Мутация | Что обязано покраснеть |
|---|---|
| убрать `AND p.paid_until <= now()` из `claimed` | 21 (двойное списание), 23 |
| убрать проверку баланса из условия | 22 |
| заменить `>=` на `>` | 25 |
| убрать `status = 'running'` | 24 |
| разбить на два оператора (сначала списать, потом сдвинуть) | 21 |

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/provisioning.integration.spec.ts
git commit -m "test(products): списание аренды против живого Postgres, пять сценариев"
```

---

## Task 4: Сборщик — кому пора платить

**Файлы:**
- Изменить: `spirits_back/src/products/rent.service.ts`
- Тест: `spirits_back/src/products/rent.service.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

```ts
describe('RentService.tick', () => {
  it('у кого хватило — списывает, у кого нет — усыпляет', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const pg = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT id')) {
          return { rows: [{ id: 'rich' }, { id: 'poor' }], rowCount: 2 };
        }
        // chargeRent: богатому списалось, бедному нет
        if (sql.includes('interval \'1 month\'')) {
          return { rowCount: params[0] === 'rich' ? 1 : 0, rows: [] };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    const sleep = jest.fn(async () => {});
    const svc = new RentService(pg as any);
    (svc as any).requestSleep = sleep;

    await svc.tick();

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith('poor');
  });

  it('падение на одном продукте не роняет обход остальных', async () => {
    // Без этого один битый продукт останавливает списание у всех, и узнать об
    // этом можно только по недосчитанной выручке.
    const pg = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        if (sql.includes('SELECT id')) return { rows: [{ id: 'a' }, { id: 'b' }], rowCount: 2 };
        if (params[0] === 'a') throw new Error('база моргнула');
        return { rowCount: 1, rows: [] };
      }),
    };
    const svc = new RentService(pg as any);

    await expect(svc.tick()).resolves.toBeUndefined();
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest src/products/rent.service.spec.ts'
```
Ожидание: FAIL — `svc.tick is not a function`.

- [ ] **Шаг 3: Реализовать**

В `rent.service.ts` добавить:

```ts
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

/** Раз в сутки. Сдвиг периода — месяц, чаще проверять незачем, а реже значит
 *  держать неоплаченный продукт запущенным до суток лишних. */
const TICK_MS = 24 * 60 * 60 * 1000;
/** Первый оборот не на старте: рестарт API не должен сразу же лезть в базу за
 *  списаниями, пока модуль ещё поднимается. */
const FIRST_TICK_MS = 60 * 1000;
```

```ts
export class RentService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  onModuleInit() {
    setTimeout(() => { void this.tick(); }, FIRST_TICK_MS).unref?.();
    this.timer = setInterval(() => { void this.tick(); }, TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Обход тех, у кого истёк оплаченный период.
   *
   * Продукты обходятся ПО ОДНОМУ и каждый в своём операторе: один битый
   * продукт не должен останавливать списание у остальных, а узнать об этом
   * можно было бы только по недосчитанной выручке.
   */
  async tick(): Promise<void> {
    const due = await this.pg.query(
      `SELECT id FROM products
        WHERE archived_at IS NULL AND status = 'running' AND paid_until <= now()
        ORDER BY paid_until`,
    );
    for (const row of due.rows) {
      try {
        if (await this.chargeRent(row.id)) continue;
        await this.requestSleep(row.id);
      } catch (e: any) {
        this.logger.error(`аренда продукта ${row.id}: ${e?.message ?? e}`);
      }
    }
  }
}
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest src/products/rent.service.spec.ts'
```
Ожидание: PASS, 6 тестов. `requestSleep` появится в Task 5 — пока метод подменяется в тесте.

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/rent.service.ts src/products/rent.service.spec.ts
git commit -m "feat(products): сборщик аренды — списать или усыпить"
```

---

## Task 5: Постановка заданий сна и пробуждения

> **Сон обязан дождаться хода.** Ассистент в контейнере пишет код, мы гасим контейнер — ход умирает молча: ни ошибки, ни строки в истории, ни списания. Это тот же дефект, из-за которого `deploy.sh` не рестартует API при живых ходах. У ожидания нужен потолок, иначе зависший ход держит неоплаченный продукт запущенным неограниченно долго.

**Файлы:**
- Изменить: `spirits_back/src/products/rent.service.ts`
- Тест: `spirits_back/src/products/provisioning.integration.spec.ts`

- [ ] **Шаг 1: Написать сценарии на живой базе**

```ts
  it('26. сон НЕ ставится, пока идёт ход', async () => {
    // Главный сценарий задачи. Погашенный посреди хода контейнер убивает
    // правку молча: токены списаны, результата нет, в истории пусто.
    const p = await product({ slug: 'sleep-busy', status: 'running' });
    await pool.query(
      `INSERT INTO product_turns (id, product_id, user_id, status, created_at)
       VALUES (gen_random_uuid(), $1, 'u-1', 'running', now())`,
      [p.id],
    );

    await new RentService(pg as any).requestSleep(p.id);

    expect(await jobsOf(p.id)).toEqual([]);
    expect((await getProduct(p.id)).status).toBe('running');
  });

  it('27. зависший ход не держит продукт вечно', async () => {
    // Потолок ожидания. Ход старше срока зависшего хода перестаёт считаться
    // живым — иначе неоплаченный продукт работает, пока кто-нибудь не
    // посмотрит в базу руками.
    const p = await product({ slug: 'sleep-stuck', status: 'running' });
    await pool.query(
      `INSERT INTO product_turns (id, product_id, user_id, status, created_at)
       VALUES (gen_random_uuid(), $1, 'u-1', 'running', now() - interval '3 hours')`,
      [p.id],
    );

    await new RentService(pg as any).requestSleep(p.id);

    expect(await jobsOf(p.id)).toEqual(['queued']);
  });

  it('28. два одновременных запроса сна дают одно задание', async () => {
    const p = await product({ slug: 'sleep-double', status: 'running' });

    await Promise.all([
      new RentService(pg as any).requestSleep(p.id).catch(() => undefined),
      new RentService(pg as any).requestSleep(p.id).catch(() => undefined),
    ]);

    expect(await jobsOf(p.id)).toEqual(['queued']);
  });

  it('29. пробуждение ставится только спящему и только при достатке', async () => {
    const rich = await product({ slug: 'wake-rich', status: 'sleeping' });
    const poor = await product({ slug: 'wake-poor', status: 'sleeping' });
    await pool.query(`UPDATE products SET user_id = 'u-w' WHERE id = ANY($1)`, [[rich.id, poor.id]]);
    await setBalance('u-w', 50_000);

    await new RentService(pg as any).wakeAffordable('u-w');

    // Хватило ровно на один: будим по одному, в порядке засыпания, а не всех
    // разом — двадцать контейнеров, стартующих одновременно, это отказ по
    // памяти на общей машине.
    const jobs = [...(await jobsOf(rich.id)), ...(await jobsOf(poor.id))];
    expect(jobs).toEqual(['queued']);
  });
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh \
  && PROVISIONING_PG_URL="postgres:///prov_fields?host=/var/run/postgresql" npx jest src/products/provisioning.integration.spec.ts'
```
Ожидание: FAIL — `requestSleep is not a function`.

- [ ] **Шаг 3: Реализовать**

В `rent.service.ts`:

```ts
/**
 * Сколько ход считается живым. Значение то же, что у сборщика зависших ходов
 * (`turns.reapStuck`), и это не совпадение: два разных потолка разошлись бы,
 * и продукт застревал бы между «ход уже похоронен» и «сон всё ещё ждёт».
 */
const TURN_ALIVE_SQL = `interval '2 hours'`;
```

```ts
  /**
   * Поставить задание на сон. Молча ничего не делает, если продукт занят
   * ходом: погашенный посреди правки контейнер убивает её без следа.
   *
   * Одним оператором — по той же причине, что и списание. Частичный индекс
   * product_provision_jobs_one_active заодно не даёт поставить сон продукту,
   * который прямо сейчас заводится.
   */
  async requestSleep(productId: string): Promise<void> {
    await this.pg.query(
      `WITH marked AS (
          UPDATE products p
             SET status = 'sleeping', sleep_reason = 'не хватило токенов на аренду'
           WHERE p.id = $1
             AND p.archived_at IS NULL
             AND p.status = 'running'
             AND NOT EXISTS (
                   SELECT 1 FROM product_turns t
                    WHERE t.product_id = p.id
                      AND t.status IN ('queued','running')
                      AND t.created_at > now() - ${TURN_ALIVE_SQL})
          RETURNING p.id
       )
       INSERT INTO product_provision_jobs (id, product_id, kind, status, created_at)
       SELECT gen_random_uuid(), m.id, 'sleep', 'queued', now() FROM marked m
       ON CONFLICT DO NOTHING`,
      [productId],
    );
  }

  /**
   * Разбудить спящие продукты владельца, на которые хватает баланса.
   *
   * По одному заданию на продукт и в порядке засыпания: пополнение баланса
   * при двадцати спящих иначе стартует двадцать контейнеров разом, а это
   * отказ по памяти на общей машине. Очередь разбирается по одному — от неё
   * это и требуется.
   */
  async wakeAffordable(userId: string): Promise<void> {
    await this.pg.query(
      `WITH budget AS (
          SELECT COALESCE(
                   (SELECT a.tokens FROM ai_profiles_consolidated a WHERE a.user_id = $1),
                   0) / $2 AS slots
       ), picked AS (
          SELECT p.id, row_number() OVER (ORDER BY p.paid_until) AS n
            FROM products p
           WHERE p.user_id = $1 AND p.archived_at IS NULL AND p.status = 'sleeping'
       )
       INSERT INTO product_provision_jobs (id, product_id, kind, status, created_at)
       SELECT gen_random_uuid(), pk.id, 'wake', 'queued', now()
         FROM picked pk, budget b
        WHERE pk.n <= b.slots
       ON CONFLICT DO NOTHING`,
      [userId, RENT_TOKENS],
    );
  }
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh \
  && PROVISIONING_PG_URL="postgres:///prov_fields?host=/var/run/postgresql" npx jest src/products'
```
Ожидание: PASS, 378 тестов.

- [ ] **Шаг 5: Проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| убрать проверку живого хода | 26 |
| убрать потолок `TURN_ALIVE_SQL` | 27 |
| ставить задание независимо от `marked` | 26 |
| будить всех без учёта баланса | 29 |
| убрать `ORDER BY p.paid_until` из `picked` | 29 |

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/rent.service.ts src/products/provisioning.integration.spec.ts
git commit -m "feat(products): задания сна и пробуждения, сон ждёт завершения хода"
```

---

## Task 6: Вид задания доезжает до агента

**Файлы:**
- Изменить: `spirits_back/src/products/provisioning.service.ts` (`claimJob`, `ClaimedJob`)
- Тест: `spirits_back/src/products/provisioning.job.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

```ts
it('вид задания доезжает до агента', async () => {
  // Без вида агент разворачивает продукт заново на задании «усыпить»:
  // каталог занят, отказ, и владелец читает про занятый каталог вместо сна.
  const { svc, pg } = makeService();
  pg.query.mockResolvedValueOnce({
    rows: [{ job_id: 'j-1', product_id: 'p-1', slug: 's', name: 'имя', kind: 'site',
             job_kind: 'sleep', secrets_encrypted: null }],
    rowCount: 1,
  } as any);

  const job = await svc.claimJob();

  expect(job!.jobKind).toBe('sleep');
});

it('старое задание без вида считается заведением', async () => {
  // Задания, поставленные до выката, kind не имеют. NULL там означает
  // «провижининг», а не «неизвестно»: иначе выкат посреди очереди роняет её.
  const { svc, pg } = makeService();
  pg.query.mockResolvedValueOnce({
    rows: [{ job_id: 'j-1', product_id: 'p-1', slug: 's', name: 'имя', kind: 'site',
             job_kind: null, secrets_encrypted: null }],
    rowCount: 1,
  } as any);

  expect((await svc.claimJob())!.jobKind).toBe('provision');
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest src/products/provisioning.job.spec.ts'
```
Ожидание: FAIL — `jobKind` undefined.

- [ ] **Шаг 3: Реализовать**

В `ClaimedJob`:

```ts
export interface ClaimedJob {
  jobId: string;
  productId: string;
  slug: string;
  name: string;
  kind: ProductKind;
  /** Что делать: развернуть, усыпить, разбудить. */
  jobKind: 'provision' | 'sleep' | 'wake';
  runnerToken: string;
  secrets: Record<string, string>;
}
```

В `claimJob`: добавить `j.kind AS job_kind` в `RETURNING`/`SELECT` выдаваемых полей и в сборку результата:

```ts
      // NULL — это задание, поставленное до выката куска 3. Оно заведение, а
      // не «неизвестно»: иначе выкат посреди очереди роняет её.
      jobKind: (row.job_kind ?? 'provision') as 'provision' | 'sleep' | 'wake',
```

**Выпуск runner-токена делать только для `provision`.** На сне и пробуждении новый токен не нужен, а его поворот сломал бы раннера в контейнере, который после пробуждения обязан продолжить работать со старым.

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh \
  && PROVISIONING_PG_URL="postgres:///prov_fields?host=/var/run/postgresql" npx jest src/products'
```
Ожидание: PASS, 380 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/provisioning.service.ts src/products/provisioning.job.spec.ts
git commit -m "feat(products): вид задания доезжает до агента хоста"
```

---

## Task 7: Хостовые шаги сна и пробуждения

> `PRODUCT_START_SCRIPT` и устройство контейнера трогать не надо — продукт уже поднят. Сон гасит контейнер, пробуждение поднимает и **обязательно проверяет здоровье**: контейнер мог не подняться, и «разбудили» без проверки — то же враньё, что «завели» без проверки.

**Файлы:**
- Создать: `spirits_back/product-runner/src/host/sleep.ts`
- Тест: `spirits_back/product-runner/src/host/sleep.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

`sleep.spec.ts` (симулятор хоста — тот же, что в `provision.spec.ts`; импортировать оттуда, не копировать):

```ts
import { FakeHost } from './provision.spec.helpers';
import { sleepProduct, wakeProduct } from './sleep';

describe('сон продукта', () => {
  it('контейнер остановлен, но НЕ удалён', async () => {
    // Удалённый контейнер — это потерянный порт и заново собранный образ при
    // пробуждении. Каталог и история при этом целы в обоих случаях, поэтому
    // разницу видно только по состоянию хоста.
    const host = new FakeHost({ containers: ['shop'] });

    await sleepProduct({ slug: 'shop', kind: 'site' }, host.deps());

    expect(host.stopped).toContain('shop');
    expect(host.containers).toContain('shop');
  });

  it('домен отдаёт заглушку, а не 502', async () => {
    // 502 читается посетителем как наша поломка. Это не поломка, а штатное
    // состояние неоплаченного продукта.
    const host = new FakeHost({ containers: ['shop'], vhosts: ['shop'] });

    await sleepProduct({ slug: 'shop', kind: 'site' }, host.deps());

    expect(host.vhostMode('shop')).toBe('asleep');
  });

  it('у бота заглушки нет — у него нет домена', async () => {
    const host = new FakeHost({ containers: ['bot'] });

    await sleepProduct({ slug: 'bot', kind: 'bot' }, host.deps());

    expect(host.vhosts).toHaveLength(0);
  });

  it('пробуждение проверяет здоровье и возвращает домен', async () => {
    const host = new FakeHost({ containers: ['shop'], stopped: ['shop'], vhosts: ['shop'], healthy: true });

    await wakeProduct({ slug: 'shop', kind: 'site', port: 8003 }, host.deps());

    expect(host.stopped).not.toContain('shop');
    expect(host.vhostMode('shop')).toBe('live');
  });

  it('не поднявшийся контейнер — отказ, а не тихий успех', async () => {
    const host = new FakeHost({ containers: ['shop'], stopped: ['shop'], vhosts: ['shop'], healthy: false });

    await expect(wakeProduct({ slug: 'shop', kind: 'site', port: 8003 }, host.deps()))
      .rejects.toThrow();
    // Домен НЕ возвращён в боевой режим: иначе посетитель получит 502 вместо
    // честной заглушки.
    expect(host.vhostMode('shop')).toBe('asleep');
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/prov-sleep && source ~/.nvm/nvm.sh && npx jest src/host/sleep.spec.ts'
```
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

`sleep.ts`:

```ts
import { SLUG_RE, HostDeps } from './provision';

/**
 * Усыпить продукт: погасить контейнер, перевести домен на заглушку.
 *
 * Контейнер ОСТАНАВЛИВАЕТСЯ, а не удаляется: удалённый теряет порт и требует
 * пересборки при пробуждении, а смысл сна — перестать тратить память, а не
 * начать заново.
 *
 * Слаг проверяется своей регуляркой, хотя он и проверен на сервере: из него
 * собирается имя контейнера и путь к конфигу nginx, а сервер — другой процесс
 * на другой машине.
 */
export async function sleepProduct(
  job: { slug: string; kind: 'site' | 'bot' },
  deps: HostDeps,
): Promise<void> {
  if (!SLUG_RE.test(job.slug)) throw new Error(`слаг не проходит проверку: ${job.slug}`);

  if (job.kind === 'site') {
    // Заглушка ДО остановки контейнера: между гашением и переключением
    // посетитель получал бы 502 — то есть нашу поломку вместо честного
    // «временно недоступен».
    await deps.run(['product-vhost', job.slug, '--asleep']);
  }
  await deps.run(['docker', 'stop', job.slug]);
}

/**
 * Разбудить: поднять контейнер, дождаться ответа, вернуть домен.
 *
 * Проверка здоровья обязательна и стоит ДО возврата домена. Контейнер мог не
 * подняться: образ обновился, порт занят соседом, диск кончился. «Разбудили»
 * без проверки — то же самое враньё, что «завели» без проверки; в куске 2
 * ровно на этом нашёлся дефект, отключавший автооткат.
 */
export async function wakeProduct(
  job: { slug: string; kind: 'site' | 'bot'; port?: number | null },
  deps: HostDeps,
): Promise<void> {
  if (!SLUG_RE.test(job.slug)) throw new Error(`слаг не проходит проверку: ${job.slug}`);

  await deps.run(['docker', 'start', job.slug]);

  if (job.kind === 'site') {
    if (!job.port) throw new Error(`у сайта ${job.slug} нет порта — пробуждать некуда`);
    // Тот же опрос по факту, что и при заведении: голый TCP-connect здесь
    // бесполезен, порт занимает docker-proxy с момента старта контейнера.
    if (!(await deps.waitPort(job.port))) {
      throw new Error(`${job.slug} не ответил после пробуждения`);
    }
    await deps.run(['product-vhost', job.slug]);
  }
}
```

- [ ] **Шаг 4: Расширить `product-vhost` на хосте**

Скрипт `/usr/local/bin/product-vhost` принимает `--asleep` и пишет вместо `proxy_pass` статическую заглушку:

```nginx
location / {
    return 503;
    # Заглушка отдаётся с кодом 503 и своей страницей: 502 читается как
    # поломка прокси, а 503 — как «сервис временно недоступен», что здесь
    # правда. Retry-After не ставим: когда владелец пополнит баланс,
    # неизвестно.
    error_page 503 /asleep.html;
}
location = /asleep.html { root /usr/share/linkeon; internal; }
```

Правку скрипта положить в репозиторий (`scripts/product-vhost`), а не править на машине: сегодня он существует только на хосте и не версионируется — это уже приводило к тому, что копия в репозитории молча отставала.

- [ ] **Шаг 5: Убедиться, что тесты зелёные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/prov-sleep && source ~/.nvm/nvm.sh && npx jest'
```
Ожидание: PASS, 270 тестов.

- [ ] **Шаг 6: Проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| `docker rm -f` вместо `docker stop` | «контейнер остановлен, но не удалён» |
| заглушка ставится ПОСЛЕ остановки | (добавить тест на порядок вызовов) |
| боту ставится заглушка | «у бота заглушки нет» |
| убрать проверку здоровья при пробуждении | «не поднявшийся контейнер — отказ» |
| возвращать домен до проверки | «домен не возвращён в боевой режим» |

- [ ] **Шаг 7: Коммит**

```bash
git add product-runner/src/host/sleep.ts product-runner/src/host/sleep.spec.ts scripts/product-vhost
git commit -m "feat(runner): хостовые шаги сна и пробуждения"
```

---

## Task 8: Цикл агента разбирает вид задания

**Файлы:**
- Изменить: `spirits_back/product-runner/src/host/index.ts`
- Тест: `spirits_back/product-runner/src/host/index.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

```ts
it('задание «усыпить» не разворачивает продукт заново', async () => {
  // Без разбора вида агент на задании sleep пойдёт в provision, упрётся в
  // занятый каталог и доложит про каталог. Владелец прочитает это вместо
  // «продукт уснул».
  const api = { poll: jest.fn(async () => ({ jobId: 'j-1', slug: 's', kind: 'site', jobKind: 'sleep' })), complete: jest.fn() };
  const provision = jest.fn();
  const sleep = jest.fn(async () => {});

  await tick({ api, provision, sleep, wake: jest.fn() } as any);

  expect(provision).not.toHaveBeenCalled();
  expect(sleep).toHaveBeenCalled();
  expect(api.complete).toHaveBeenCalledWith('j-1', { ok: true });
});

it('неизвестный вид — отказ с внятной причиной, а не тихий провижининг', async () => {
  // Выкат нового вида раньше агента: лучше честный отказ, чем развёртывание
  // поверх работающего продукта.
  const api = { poll: jest.fn(async () => ({ jobId: 'j-1', slug: 's', kind: 'site', jobKind: 'нечто' })), complete: jest.fn() };
  const provision = jest.fn();

  await tick({ api, provision, sleep: jest.fn(), wake: jest.fn() } as any);

  expect(provision).not.toHaveBeenCalled();
  expect(api.complete).toHaveBeenCalledWith('j-1', expect.objectContaining({ ok: false }));
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/prov-sleep && source ~/.nvm/nvm.sh && npx jest src/host/index.spec.ts'
```
Ожидание: FAIL — `provision` вызван.

- [ ] **Шаг 3: Реализовать**

В `tick` заменить безусловный вызов провижининга:

```ts
    const jobKind = job.jobKind ?? 'provision';
    if (jobKind === 'provision') {
      const { port } = await deps.provision(job);
      await deps.api.complete(job.jobId, { ok: true, port });
    } else if (jobKind === 'sleep') {
      await deps.sleep(job);
      await deps.api.complete(job.jobId, { ok: true });
    } else if (jobKind === 'wake') {
      await deps.wake(job);
      await deps.api.complete(job.jobId, { ok: true });
    } else {
      // Честный отказ, а не молчаливый провижининг: развернуть поверх
      // работающего продукта хуже, чем не сделать ничего.
      throw new Error(`неизвестный вид задания: ${jobKind}`);
    }
```

Расширить `HostDeps` полями `sleep` и `wake`, а `realDeps()` — настоящими реализациями из `sleep.ts`. **Маскировку отчёта и досылку не трогать** — они общие для всех видов.

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/prov-sleep && source ~/.nvm/nvm.sh && npx jest'
```
Ожидание: PASS, 272 теста.

- [ ] **Шаг 5: Коммит**

```bash
git add product-runner/src/host/index.ts product-runner/src/host/index.spec.ts
git commit -m "feat(runner): цикл агента разбирает вид задания"
```

---

## Task 9: Спящему продукту не выдаётся работа

> Сегодня работа выдаётся только при `running`. Полагаться на то, что новый статус «сам собой» не `running`, нельзя: проверить надо явно, иначе правка уедет в остановленный контейнер и пропадёт молча.

**Файлы:**
- Изменить: `spirits_back/src/products/turns.service.ts`
- Тест: `spirits_back/src/products/turns.enqueue.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

```ts
it('спящему продукту правка не ставится', async () => {
  const { svc, pg } = makeService();
  pg.query.mockResolvedValueOnce({ rows: [{ id: 'p-1', status: 'sleeping' }], rowCount: 1 } as any);

  await expect(svc.enqueue({ productId: 'p-1', userId: 'u-1', prompt: 'правь' }))
    .rejects.toThrow(/спит|пополн/i);
});

it('текст отказа зовёт пополнить баланс, а не «попробуйте позже»', async () => {
  // «Попробуйте позже» здесь неправда: само оно не пройдёт никогда.
  const { svc, pg } = makeService();
  pg.query.mockResolvedValueOnce({ rows: [{ id: 'p-1', status: 'sleeping' }], rowCount: 1 } as any);

  await expect(svc.enqueue({ productId: 'p-1', userId: 'u-1', prompt: 'правь' }))
    .rejects.toThrow(/пополн/i);
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest src/products/turns.enqueue.spec.ts'
```
Ожидание: FAIL — исключения нет.

- [ ] **Шаг 3: Реализовать**

В `enqueue`, сразу после выборки продукта:

```ts
    // Явная проверка, а не расчёт на то, что sleeping не пройдёт условие
    // running: правка, уехавшая в остановленный контейнер, пропадает молча —
    // ход висит в очереди, контейнер её не заберёт, и владелец увидит только
    // «в очереди» до срока зависшего хода.
    if (product.status === 'sleeping') {
      throw new ConflictException(
        'Продукт спит: не хватило токенов на аренду. Пополните баланс — он проснётся сам.',
      );
    }
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh \
  && PROVISIONING_PG_URL="postgres:///prov_fields?host=/var/run/postgresql" npx jest src/products'
```
Ожидание: PASS, 382 теста.

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/turns.service.ts src/products/turns.enqueue.spec.ts
git commit -m "feat(products): спящему продукту правка не ставится"
```

---

## Task 10: Пробуждение при пополнении баланса

**Файлы:**
- Изменить: `spirits_back/src/payments/payments.service.ts` (место зачисления токенов)
- Тест: `spirits_back/src/products/provisioning.integration.spec.ts`

- [ ] **Шаг 1: Найти точку зачисления**

```bash
grep -n "addTokens\|tokens = tokens +\|пополнен" src/payments/payments.service.ts | head
```
Зачисление идёт в одном месте — там, где платёж подтверждён. Купон (`coupon/redeem`) зачисляет своим путём; **оба** должны будить, иначе оплаченный купоном продукт не проснётся.

- [ ] **Шаг 2: Написать сценарий**

```ts
  it('30. пополнение будит спящие продукты владельца', async () => {
    const p = await product({ slug: 'wake-on-topup', status: 'sleeping' });
    await setBalance('u-1', 0);

    // Зачисление и пробуждение — разные операции: пополнение не должно
    // ЖДАТЬ, пока поднимутся контейнеры, а пробуждение не должно пропасть,
    // если поднять их не удалось.
    await setBalance('u-1', 60_000);
    await new RentService(pg as any).wakeAffordable('u-1');

    expect(await jobsOf(p.id)).toEqual(['queued']);
  });
```

- [ ] **Шаг 3: Позвать пробуждение после зачисления**

```ts
    // Не в той же транзакции и не блокируя ответ: оплата обязана завершиться,
    // даже если очередь заданий сейчас недоступна. Отказ пробуждения — строка
    // в журнале, а не отказ платежа.
    this.rent.wakeAffordable(userId).catch((e) =>
      this.logger.error(`пробуждение после пополнения ${userId}: ${e?.message ?? e}`),
    );
```

Тот же вызов добавить в путь купона.

- [ ] **Шаг 4: Прогнать**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh \
  && PROVISIONING_PG_URL="postgres:///prov_fields?host=/var/run/postgresql" npx jest src/products src/payments'
```
Ожидание: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add src/payments/ src/products/provisioning.integration.spec.ts
git commit -m "feat(payments): пополнение баланса будит спящие продукты"
```

---

## Task 11: Кабинет — оплачено до, спит, предупреждение

**Файлы:**
- Изменить: `spirits_front/src/components/products/ProductsListView.tsx`, `src/services/productsApi.ts`, `src/i18n/locales/{ru,en}.json`
- Тест: `spirits_front/src/components/products/ProductsListView.test.tsx`

- [ ] **Шаг 1: Написать падающие тесты**

```tsx
it('спящий продукт объясняет причину и зовёт пополнить', () => {
  const { container } = mount(
    <ProductsListView onOpen={() => {}} />,
  );
  // ... с фикстурой status: 'sleeping', sleep_reason: 'не хватило токенов на аренду'
  expect(container.textContent).toContain(tRu('products.status.sleeping'));
  expect(byButton(container, /пополнить/i)).toBeTruthy();
});

it('дата списания показывается как дата, а не как «осталось N дней»', () => {
  // Срок считает сервер, а вкладка может висеть открытой сутками: «осталось
  // 2 дня» протухает молча и врёт, дата — нет.
  const { container } = mount(<ProductsListView onOpen={() => {}} />);
  expect(container.textContent).toMatch(/\d{2}\.\d{2}\.\d{4}/);
});

it('предупреждение только при обоих условиях сразу', () => {
  // Скоро списание И не хватает на следующий месяц. Тревога без причины
  // приучает её не замечать.
  // ... три фикстуры: скоро+хватает, нескоро+не хватает, скоро+не хватает
});
```

- [ ] **Шаг 2: Добавить поля в тип**

В `productsApi.ts`:

```ts
export interface Product {
  // ... существующие ...
  paid_until?: string | null;
  sleep_reason?: string | null;
}
```

- [ ] **Шаг 3: Переводы**

`ru.json`, в `products`:

```json
"status": { "sleeping": "Спит" },
"rent": {
  "paidUntil": "Оплачено до {{date}}",
  "sleepingWhy": "Не хватило токенов на аренду — {{amount}} в месяц",
  "wakeHint": "Пополните баланс, продукт проснётся сам",
  "soonWarning": "Списание {{date}}, на балансе не хватает"
}
```

`en.json` — те же ключи. Форм множественного числа здесь нет намеренно: все строки построены так, чтобы обойтись без счётных существительных.

- [ ] **Шаг 4: Прогнать**

```bash
npx vitest run src/components/products/
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Шаг 5: Коммит**

```bash
git add src/components/products/ src/services/productsApi.ts src/i18n/locales/
git commit -m "feat(cabinet): аренда в карточке продукта — оплачено до, сон, предупреждение"
```

---

## Task 12: Живая проверка

**Файлов нет** — проверка на живых продуктах владельца, `demo` и `shop2`, **до** открытия чего-либо клиентам.

- [ ] **Шаг 1: Сон по истёкшему периоду**

Подкрутить `paid_until` в прошлое и обнулить баланс:

```sql
UPDATE products SET paid_until = now() - interval '1 day' WHERE slug = 'demo';
```

Ожидание: контейнер `demo` остановлен (`docker ps -a` показывает `Exited`), `demo.p.linkeon.io` отдаёт 503 с заглушкой (не 502), каталог `/srv/products/demo` и git-история на месте, статус в кабинете — «Спит».

- [ ] **Шаг 2: Пробуждение пополнением**

Пополнить баланс. Ожидание: контейнер поднят, `https://demo.p.linkeon.io/health` отдаёт 200, sha сходится с HEAD чекаута, статус «Работает», `paid_until` в будущем.

- [ ] **Шаг 3: Усыпление посреди правки — ГЛАВНЫЙ**

Отправить продукту долгую правку. Не дожидаясь конца, подкрутить `paid_until` в прошлое и дёрнуть сборщик.

Ожидание: **сон НЕ наступает, пока ход идёт**. Ход доходит до истории, токены списаны, результат на месте. Сон наступает после.

Проверять не «нет ошибки», а состояние: строка хода в `product_turns` со статусом `done` и непустым `tokens_spent`, ответ продукта соответствует правке, и только потом `Exited`.

- [ ] **Шаг 4: Двойное списание**

Дёрнуть сборщик дважды подряд на продукте с истёкшим периодом. Ожидание: баланс уменьшился **на 50 000, а не на 100 000**; `paid_until` уехал на месяц, а не на два.

- [ ] **Шаг 5: Убрать за собой**

Вернуть `paid_until` обоим продуктам, убедиться, что оба отвечают 200.

---

## Самопроверка плана

**Покрытие спеки.** Каждый раздел спеки закрыт задачей: решения владельца — Task 2 (цена), Task 1 (первый месяц, backfill); «что значит спит» — Task 7; списание — Task 2, 3, 4; двойное списание — Task 3; усыпление посреди правки — Task 5, Task 12 шаг 3; буря пробуждений — Task 5 (`wakeAffordable` ставит задания, очередь разбирает по одному); сон заводящегося — существующий индекс, проверяется в Task 5; модель данных — Task 1; спящему не выдаётся работа — Task 9; продукты до выката — Task 1 шаг 1; кабинет — Task 11; тестирование — Task 3, 5, 7 и Task 12.

**Согласованность имён.** `chargeRent`, `requestSleep`, `wakeAffordable`, `tick` — в Task 2, 4, 5, 10 совпадают. `jobKind` — в Task 6, 8. `paid_until`, `sleep_reason` — в Task 1, 3, 5, 11. `RENT_TOKENS` — Task 2, 5.

**Известные незакрытые места, названные честно:**

- `FakeHost` в Task 7 импортируется из `provision.spec.helpers` — сегодня симулятор живёт внутри `provision.spec.ts` и не экспортируется. Первым шагом Task 7 его надо вынести в отдельный файл, не меняя поведения, и убедиться, что 265 существующих тестов остались зелёными.
- Точка зачисления токенов в Task 10 названа поиском, а не путём: в `payments.service.ts` зачисление может идти из нескольких мест (платёж, купон, админская выдача). Исполнитель обязан найти **все** и разбудить из каждого — иначе часть пополнений не будит, и это тихий отказ ровно того класса, который в этом проекте ловился чаще всего.
- `product-vhost` сегодня существует только на машине продуктов и не версионируется. Task 7 шаг 4 вводит его в репозиторий; расхождение живого скрипта с репозиторным надо сверить глазами до правки.
