# Самообслуживание и гашение продуктов Linkeon — план реализации (кусок 4б)

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОД-НАВЫК: `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`. Шаги помечены чекбоксами `- [ ]`.

**Цель:** продукт заводит любой, не больше двух на аккаунт, а администратор может погасить любой одним действием по домену.

**Архитектура:** гашение — **новый статус**, а не причина сна. Существующие фильтры отбирают по конкретным статусам, поэтому блокированный выпадает из аренды, будильника и выдачи заданий сам собой. Потолок на аккаунт — своя таблица исключений в модуле продуктов.

**Стек:** NestJS 10, PostgreSQL 16, React 18 + vitest.

**Спека:** `docs/superpowers/specs/2026-09-22-linkeon-products-selfservice-design.md`

---

## Правила прогона

**Гони на СВОЕЙ базе и сноси схему перед каждым прогоном.** Общая `prov_fields` уже испортила батарею в куске 3: мутация поменяла определение колонки и осталась в базе навсегда — идемпотентная миграция существующую колонку не правит.

```bash
ssh dv@85.192.61.231 'sudo -u postgres psql -qc "DROP DATABASE IF EXISTS ss_<задача>"; \
  sudo -u postgres psql -qc "CREATE DATABASE ss_<задача> OWNER dv"'
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && git fetch -q origin && git checkout -qf <sha> \
  && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL="postgres:///ss_<задача>?host=/var/run/postgresql" npx jest src/products'
```

- `source ~/.nvm/nvm.sh` обязателен в каждой ssh-команде.
- **Не трогать `~/spirits_back` и `~/spirits_front` на ноде** — живой чекаут стенда.
- **Прогонять весь `src/products`**, а не свой файл.
- jest в бэкенде **типы не проверяет**. Единственный шлюз — `npx tsc --noEmit -p tsconfig.build.json`.
- На фронте голый `tsc --noEmit` компилирует ноль файлов и всегда зелёный, нужен `-p tsconfig.app.json`.
- **Идемпотентность проверяется на СПИСКЕ миграций, а не на файле.** Значение, дописанное в именованный словарь поздней миграцией, дописывается и во все ранние.
- `deploy.sh` не запускать: выкат ведёт владелец.

**Мутации.** Каждая со счётом замен, контроль без мутации до и после серии. Харнесс в этой работе врал **девятнадцать раз**. Требуй от него: итоговые строки jest есть **И** общее число тестов совпало с базовым. Разошлось — прогон несостоявшийся, а не результат. **Таблицу класть в текст коммита.**

**Базовую линию снять самому.**

**Прод и обе машины продуктов — только на чтение.** `139.59.210.42` — два боевых продукта, `206.81.17.255` — клиентская, пока пустая.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/products/migrations/007_selfservice.sql` | статус `blocked`, `block_reason`, таблица потолков аккаунта |
| `src/products/limits.service.ts` | потолок на аккаунт: чтение и проверка |
| `src/products/block.service.ts` | гашение и снятие: разбор «за что», задание, убийство хода |
| `src/products/products.controller.ts` | маршруты гашения для администратора |
| `src/products/turns.service.ts` | отказ блокированному своим текстом |
| `spirits_front/src/pages/StudioPage.tsx` | вкладка открывается всем |
| `spirits_front/src/components/products/ProductsListView.tsx` | отрисовка блокировки, пустое состояние |

Два новых сервиса, а не дописка: `provisioning.service.ts` уже за 1100 строк, `rent.service.ts` отвечает за деньги. Потолок аккаунта и гашение — разные ответственности с разными жизненными циклами.

---

## Task 1: Схема

**Файлы:**
- Создать: `spirits_back/src/products/migrations/007_selfservice.sql`
- Изменить: `spirits_back/src/products/products.service.ts` (`MIGRATIONS`, `COLUMNS`, `ProductRow`)
- Тест: `spirits_back/src/products/products.migration.spec.ts`, `provisioning.integration.spec.ts`

- [ ] **Шаг 1: Написать миграцию**

`007_selfservice.sql`:

```sql
-- Самообслуживание и гашение. Кусок 4б.

-- Статус blocked. Словарь расширяется ВМЕСТЕ с ним — и не только здесь:
-- значение, дописанное в именованный словарь поздней миграцией, дописывается
-- и во все ранние, где тот же словарь объявлен заново. Иначе ранняя падает на
-- живых данных, отказ уходит в лог, и она умирает молча (случилось в куске 3
-- со статусом сна).
ALTER TABLE products ADD COLUMN IF NOT EXISTS block_reason text;

-- Потолок на аккаунт. Строка появляется ТОЛЬКО у тех, кому подняли:
-- умолчание живёт константой в коде, а не копией в каждой строке.
CREATE TABLE IF NOT EXISTS product_user_limits (
  user_id      text PRIMARY KEY,
  max_products int  NOT NULL CHECK (max_products > 0),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

Словарь статусов расширяется в **003, 004 и 007 одинаково** — посмотри, как это сделано для `sleeping`, и повтори для `blocked`. Имя словаря одно (`products_status_check`), составы обязаны совпасть.

- [ ] **Шаг 2: Подключить и отдать кабинету**

В `products.service.ts`: `'007_selfservice.sql'` в `MIGRATIONS`, `block_reason` в `COLUMNS` и в `ProductRow`.

- [ ] **Шаг 3: Написать сценарии на живой базе**

```ts
  it('60. словарь статусов знает blocked во ВСЕХ миграциях, где объявлен', () => {
    // Сторож класса, а не случая: ранняя миграция с неполным словарём падает
    // на живых данных и умирает молча.
    const dicts = MIGRATIONS
      .map((f) => statusDict(fs.readFileSync(path.join(__dirname, 'migrations', f), 'utf8')))
      .filter((d) => d !== null);
    expect(dicts.length).toBeGreaterThan(1);
    for (const d of dicts) expect(d).toEqual(dicts[0]);
    expect(dicts[0]).toContain('blocked');
  });

  it('61. повторная накатка списка ничего не меняет при блокированном продукте', async () => {
    // Тот самый случай, на котором 002 умерла в куске 3.
    const p = await product({ slug: 'ss-blocked' });
    await pool.query(`UPDATE products SET status='blocked', block_reason='проба' WHERE id=$1`, [p.id]);

    for (const f of MIGRATIONS) {
      await pool.query(fs.readFileSync(path.join(__dirname, 'migrations', f), 'utf8'));
    }

    expect((await getProduct(p.id)).status).toBe('blocked');
  });
```

- [ ] **Шаг 4: Прогнать и проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| `blocked` дописан только в 007 | 60, 61 |
| `max_products` без `CHECK > 0` | (добавить тест на нулевой потолок) |
| `block_reason` не заводится | (тест на выдачу колонки) |

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/migrations/007_selfservice.sql src/products/products.service.ts \
        src/products/provisioning.integration.spec.ts
git commit -m "feat(products): статус блокировки и потолок на аккаунт"
```

---

## Task 2: Потолок на аккаунт

> Проверка стоит **до** выбора машины. «У вас уже два продукта» и «мест на машинах нет» — разные причины с разным лечением: первая чинится архивацией своего, вторая ждёт владельца сервиса.

**Файлы:**
- Создать: `spirits_back/src/products/limits.service.ts`, `limits.service.spec.ts`
- Изменить: `spirits_back/src/products/provisioning.service.ts` (`create`), `products.module.ts`
- Тест: `spirits_back/src/products/provisioning.integration.spec.ts`

- [ ] **Шаг 1: Написать сценарии на живой базе**

```ts
  it('62. третий продукт отбивается потолком аккаунта', async () => {
    await addHost('clients', 'clients', 20);
    for (const s of ['ss-a', 'ss-b']) {
      await svc.create({ userId: 'u-кли', isAdmin: false, name: s, slug: s, kind: 'site', secrets: {} });
    }

    await expect(
      svc.create({ userId: 'u-кли', isAdmin: false, name: 'c', slug: 'ss-c', kind: 'site', secrets: {} }),
    ).rejects.toThrow(/уже .* продукт/i);

    // Ничего не осталось: ни строки, ни задания.
    expect((await pool.query(`SELECT count(*) FROM products WHERE slug='ss-c'`)).rows[0].count).toBe('0');
  });

  it('63. потолок считает спящих и блокированных, но не архивных', async () => {
    // Место занято до архивации. Не считать спящего — значит позволить
    // накопить продуктов больше потолка и разбудить их одним пополнением.
    await addHost('clients', 'clients', 20);
    const a = await svc.create({ userId: 'u-кли', isAdmin: false, name: 'a', slug: 'ss-sl', kind: 'site', secrets: {} });
    const b = await svc.create({ userId: 'u-кли', isAdmin: false, name: 'b', slug: 'ss-bl', kind: 'site', secrets: {} });
    await pool.query(`UPDATE products SET status='sleeping' WHERE id=$1`, [a.productId]);
    await pool.query(`UPDATE products SET status='blocked'  WHERE id=$1`, [b.productId]);

    await expect(
      svc.create({ userId: 'u-кли', isAdmin: false, name: 'c', slug: 'ss-c2', kind: 'site', secrets: {} }),
    ).rejects.toThrow(/уже .* продукт/i);

    await pool.query(`UPDATE products SET archived_at=now() WHERE id=$1`, [a.productId]);
    const ok = await svc.create({ userId: 'u-кли', isAdmin: false, name: 'c', slug: 'ss-c3', kind: 'site', secrets: {} });
    expect(ok.productId).toBeTruthy();
  });

  it('64. поднятый потолок действует только своему аккаунту', async () => {
    await addHost('clients', 'clients', 20);
    await pool.query(
      `INSERT INTO product_user_limits (user_id, max_products, note) VALUES ('u-щедрый', 5, 'по просьбе')`);

    for (const s of ['ss-r1', 'ss-r2', 'ss-r3']) {
      await svc.create({ userId: 'u-щедрый', isAdmin: false, name: s, slug: s, kind: 'site', secrets: {} });
    }
    // А соседу — по-прежнему два.
    for (const s of ['ss-n1', 'ss-n2']) {
      await svc.create({ userId: 'u-сосед', isAdmin: false, name: s, slug: s, kind: 'site', secrets: {} });
    }
    await expect(
      svc.create({ userId: 'u-сосед', isAdmin: false, name: 'x', slug: 'ss-n3', kind: 'site', secrets: {} }),
    ).rejects.toThrow(/уже .* продукт/i);
  });

  it('65. потолок проверяется РАНЬШЕ машины: причина не подменяется', async () => {
    // Машин нет вовсе. Владелец с двумя продуктами обязан услышать про свой
    // потолок, а не про отсутствие хостинга — лечения у них разные.
    await pool.query('DELETE FROM product_hosts');
    for (const s of ['ss-o1', 'ss-o2']) {
      await pool.query(
        `INSERT INTO products (id, user_id, name, slug, kind, status, checkout_path, runner_token_hash)
         VALUES (gen_random_uuid(), 'u-кли', $1, $1, 'site', 'running', '/product', md5($1))`, [s]);
    }

    await expect(
      svc.create({ userId: 'u-кли', isAdmin: false, name: 'x', slug: 'ss-o3', kind: 'site', secrets: {} }),
    ).rejects.toThrow(/уже .* продукт/i);
  });
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Ожидание: FAIL — третий продукт заводится.

- [ ] **Шаг 3: Реализовать**

`limits.service.ts`:

```ts
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';

/** Два продукта на аккаунт. Поднимается строкой в product_user_limits. */
export const DEFAULT_MAX_PRODUCTS = 2;

@Injectable()
export class LimitsService {
  constructor(private readonly pg: PgService) {}

  /**
   * Отбить заведение, если у владельца уже столько продуктов, сколько ему
   * положено.
   *
   * Считаются ВСЕ, кроме архивных, — спящие и блокированные в том числе:
   * место занято до архивации, и спящие просыпаются от одного пополнения.
   *
   * Одним запросом: потолок и счёт берутся из одного снимка. Двумя запросами
   * между ними помещался бы чужой коммит.
   */
  async assertCanCreate(userId: string): Promise<void> {
    const r = await this.pg.query(
      `SELECT COALESCE((SELECT l.max_products FROM product_user_limits l
                         WHERE l.user_id = $1), $2) AS allowed,
              (SELECT count(*) FROM products p
                WHERE p.user_id = $1 AND p.archived_at IS NULL) AS used`,
      [userId, DEFAULT_MAX_PRODUCTS],
    );
    // count(*) приезжает из node-pg СТРОКОЙ: сравнение без Number() ложно.
    const allowed = Number(r.rows[0].allowed);
    const used = Number(r.rows[0].used);
    if (used >= allowed) {
      throw new UnprocessableEntityException(
        `У вас уже ${used} ${used === 1 ? 'продукт' : 'продукта'} — это предел для одного аккаунта. ` +
          'Заархивируйте ненужный или напишите нам, если нужно больше.',
      );
    }
  }
}
```

**422, а не 409.** Кабинет разбирает **код**, и на 409 показывает «Этот адрес уже занят — выберите другой»; всё `>= 500` глушит своим текстом. 422 — единственный код, попадающий в ветку с сообщением сервера. Это измерено в куске 4а, задача 4.

В `create`, **первой строкой, до проверки слага и до выбора машины**:

```ts
    await this.limits.assertCanCreate(input.userId);
```

- [ ] **Шаг 4: Прогнать и проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| потолок считает только `running` | 63 |
| потолок считает и архивные | 63 |
| потолок один на всех (строка исключений игнорируется) | 64 |
| проверка стоит после выбора машины | 65 |
| `used > allowed` вместо `>=` | 62 |
| без `Number()` | 62 |

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/limits.service.ts src/products/limits.service.spec.ts \
        src/products/provisioning.service.ts src/products/products.module.ts \
        src/products/provisioning.integration.spec.ts
git commit -m "feat(products): два продукта на аккаунт, потолок поднимается по просьбе"
```

---

## Task 3: Гашение и снятие

> **Три места, где блокировка ведёт себя не как сон. Читать до реализации.**
>
> **1. Не ждёт завершения хода.** Сон ждёт: погашенный посреди правки контейнер убивает её молча. Блокировку ставят, когда на домене недопустимое, и ждать тридцать минут нельзя. Идущий ход умирает — осознанный размен.
>
> **2. Убитый ход закрывается ТЕМ ЖЕ действием**, статусом отказа и причиной. Оставленный в `running`, он висел бы до срока зависшего хода, а владелец видел бы «выполняется» у погашенного продукта.
>
> **0. ДВА ЧУЖИХ МЕСТА, БЕЗ КОТОРЫХ ГАШЕНИЕ НЕ РАБОТАЕТ ВОВСЕ. Найдено задачей 1, в исходном плане их не было.**
>
> **`claimJob` не отдаст задание блокированному.** Там `CASE j.kind WHEN 'provision' THEN p.status = 'provisioning' ELSE p.status = 'sleeping' END`. Задание вида `sleep` ставится продукту в статусе `blocked` — агент не получит его **никогда**. Контейнер работает, домен отдаёт то, за что погасили, через десять минут сборщик зависших закрывает задание текстом «срок заведения истёк». Ветку `else` расширить до `p.status IN ('sleeping','blocked')`.
>
> **`completeJob` на отказе снимет блокировку.** Путь отказа пишет `CASE closed.kind WHEN 'sleep' THEN 'degraded' ELSE products.status END`, не глядя на нынешний статус. Любой сорвавшийся сон вернёт блокированный продукт в `degraded` — то есть в статус, который платит аренду и принимает правки. Отказ сна у блокированного обязан оставлять `blocked`.
>
> **Сценарий 69 ниже ПРИШПИЛИВАЕТ первый дефект**: `expect(await makeSvc().claimJob('own')).toBeNull()` зелен именно при сломанной реализации. Переписать: после гашения агент обязан **получить** задание на гашение, а не не получить ничего.

> **3. Снимает невыполненное пробуждение.** Порядок, который ломает: продукт спал за неуплату, владелец пополнил, будильник поставил `wake` — и в этот момент администратор гасит. Задание уже в очереди, и агент разбудит блокированный продукт через секунды.

**Файлы:**
- Создать: `spirits_back/src/products/block.service.ts`, `block.service.spec.ts`
- Изменить: `spirits_back/src/products/products.module.ts`
- Тест: `spirits_back/src/products/provisioning.integration.spec.ts`

- [ ] **Шаг 1: Написать сценарии на живой базе**

```ts
  it('66. гашение по домену, слагу и id находит один и тот же продукт', async () => {
    const p = await product({ slug: 'ss-find', kind: 'site' });
    await pool.query(`UPDATE products SET domain='ss-find.c.linkeon.io' WHERE id=$1`, [p.id]);

    for (const key of ['ss-find.c.linkeon.io', 'ss-find', p.id]) {
      await pool.query(`UPDATE products SET status='running', block_reason=NULL WHERE id=$1`, [p.id]);
      await blockSvc.block(key, 'нарушение');
      expect((await getProduct(p.id)).status).toBe('blocked');
    }
  });

  it('67. не нашли — отказ, а не запасной поиск', async () => {
    // Молчаливый поиск «сначала по одному, потом по другому» однажды погасил
    // бы не тот продукт при совпадении слага одного с доменом другого.
    await expect(blockSvc.block('нет-такого', 'проба')).rejects.toThrow(/не найден/i);
  });

  it('68. блокировка НЕ ждёт идущий ход и закрывает его причиной', async () => {
    const p = await product({ slug: 'ss-busy', status: 'running' });
    const t = await pool.query(
      `INSERT INTO product_turns (id, product_id, user_id, status, channel, prompt, created_at, last_progress_at)
       VALUES (gen_random_uuid(), $1, 'u-1', 'running', 'web', 'правь', now(), now()) RETURNING id`,
      [p.id]);

    await blockSvc.block('ss-busy', 'нарушение');

    expect((await getProduct(p.id)).status).toBe('blocked');
    const turn = (await pool.query('SELECT status, error FROM product_turns WHERE id=$1', [t.rows[0].id])).rows[0];
    expect(turn.status).toBe('failed');
    expect(turn.error).toMatch(/администратор/i);
  });

  it('69. блокировка снимает невыполненное пробуждение', async () => {
    const p = await product({ slug: 'ss-waking', status: 'sleeping' });
    await job(p.id, { kind: 'wake', status: 'queued' });

    await blockSvc.block('ss-waking', 'нарушение');

    // Снятое пробуждение агенту не достанется, а гашение — обязано.
    // ИСПРАВЛЕНО ПОСЛЕ ЗАДАЧИ 1: прежняя редакция требовала `toBeNull()` и
    // была зелёной ровно при сломанной реализации, где claimJob не отдаёт
    // задания блокированному вовсе.
    const taken = await makeSvc().claimJob('own');
    expect(taken!.jobKind).toBe('sleep');
    expect(taken!.slug).toBe('ss-waking');
  });

  it('70. снятие блокировки ставит пробуждение и возвращает в работу', async () => {
    const p = await product({ slug: 'ss-unblock', status: 'blocked' });
    await pool.query(`UPDATE products SET block_reason='нарушение' WHERE id=$1`, [p.id]);

    await blockSvc.unblock('ss-unblock');

    expect((await getProduct(p.id)).block_reason).toBeNull();
    expect(await jobsOf(p.id)).toContain('queued');
  });
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

`block.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BlockService {
  constructor(private readonly pg: PgService) {}

  /**
   * Как искать продукт по тому, что принёс администратор.
   *
   * Разбор строгий и БЕЗ запасного варианта: не нашли — отказ. Поиск
   * «сначала по одному, потом по другому» однажды погасил бы не тот продукт
   * при совпадении слага одного с доменом другого.
   */
  private where(key: string): { sql: string; param: string } {
    if (UUID_RE.test(key)) return { sql: 'p.id = $1', param: key };
    if (key.includes('.')) return { sql: 'p.domain = $1', param: key };
    return { sql: 'p.slug = $1', param: key };
  }

  /**
   * Погасить продукт. Одним оператором: снять невыполненное пробуждение,
   * закрыть идущий ход, перевести в blocked, поставить задание на гашение.
   *
   * НЕ ждёт завершения хода — в отличие от сна за неуплату. Блокировку ставят,
   * когда на домене недопустимое, и тридцать минут зависшего хода ждать
   * нельзя. Ход при этом закрывается здесь же: оставленный в running, он висел
   * бы до срока сборщика зависших, а владелец видел бы «выполняется» у
   * погашенного продукта.
   */
  async block(key: string, reason: string): Promise<void> {
    const { sql, param } = this.where(key);
    const r = await this.pg.query(
      `WITH target AS (
          SELECT p.id FROM products p WHERE ${sql} AND p.archived_at IS NULL
          FOR UPDATE
       ), killed_jobs AS (
          UPDATE product_provision_jobs j
             SET status = 'failed', error = 'снято блокировкой администратора', finished_at = now()
            FROM target t
           WHERE j.product_id = t.id AND j.status IN ('queued','running')
       ), killed_turns AS (
          UPDATE product_turns tr
             SET status = 'failed', error = 'продукт остановлен администратором', finished_at = now()
            FROM target t
           WHERE tr.product_id = t.id AND tr.status IN ('queued','running')
       ), marked AS (
          UPDATE products p SET status = 'blocked', block_reason = $2
            FROM target t WHERE p.id = t.id
          RETURNING p.id
       )
       INSERT INTO product_provision_jobs (product_id, kind, status)
       SELECT m.id, 'sleep', 'queued' FROM marked m
       RETURNING product_id`,
      [param, reason],
    );
    if (!r.rowCount) throw new NotFoundException(`Продукт не найден: ${key}`);
  }

  /** Снять блокировку: вернуть в sleeping и поставить пробуждение. */
  async unblock(key: string): Promise<void> {
    const { sql, param } = this.where(key);
    const r = await this.pg.query(
      `WITH target AS (
          SELECT p.id FROM products p
           WHERE ${sql} AND p.archived_at IS NULL AND p.status = 'blocked'
          FOR UPDATE
       ), marked AS (
          UPDATE products p SET status = 'sleeping', block_reason = NULL
            FROM target t WHERE p.id = t.id
          RETURNING p.id
       )
       INSERT INTO product_provision_jobs (product_id, kind, status)
       SELECT m.id, 'wake', 'queued' FROM marked m
       ON CONFLICT DO NOTHING
       RETURNING product_id`,
      [param],
    );
    if (!r.rowCount) throw new NotFoundException(`Блокированный продукт не найден: ${key}`);
  }
}
```

**Статус после снятия — `sleeping`, а не `running`.** Перевод в работу делает `promoteReady` по измеримому факту: раннер на связи и публичный адрес отдал 200. Ставить `running` руками значило бы объявить рабочим продукт, контейнер которого ещё не поднят.

- [ ] **Шаг 4: Прогнать и проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| разбор ключа с запасным вариантом | 67 |
| блокировка ждёт завершения хода | 68 |
| ход не закрывается | 68 |
| невыполненное пробуждение не снимается | 69 |
| снятие ставит `running` вместо `sleeping` | (добавить тест: статус после снятия) |
| гашение трогает архивные | (добавить тест) |

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/block.service.ts src/products/block.service.spec.ts \
        src/products/products.module.ts src/products/provisioning.integration.spec.ts
git commit -m "feat(products): гашение продукта администратором и снятие блокировки"
```

---

## Task 4: Маршруты и отказ блокированному

**Файлы:**
- Изменить: `spirits_back/src/products/products.controller.ts`, `turns.service.ts`
- Тест: `spirits_back/src/products/products.routes.spec.ts`, `turns.enqueue.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

```ts
it('гашение доступно только администратору', async () => {
  await expect(
    controller.block({ user: { isAdmin: false } } as any, { key: 'x', reason: 'r' }),
  ).rejects.toThrow(/доступ/i);
});

it('блокированному продукту правка отбивается СВОИМ текстом', async () => {
  // Общая ветка «Продукт сейчас недоступен для правок» уже отбивает всё, что
  // не running, — то есть отказ формально есть. Но владелец не узнает, что
  // продукт остановлен администратором, и пойдёт искать поломку у себя.
  const { svc, pg } = makeService();
  pg.query.mockResolvedValueOnce({ rows: [{ id: 'p-1', status: 'blocked' }], rowCount: 1 } as any);

  await expect(svc.enqueue({ productId: 'p-1', userId: 'u-1', prompt: 'правь' }))
    .rejects.toThrow(/администратор/i);
});
```

- [ ] **Шаг 2: Реализовать**

В `turns.service.ts`, **перед** общей веткой:

```ts
    if (productStatus === 'blocked') {
      throw new ConflictException(
        'Продукт остановлен администратором. Напишите нам, если это ошибка.',
      );
    }
```

В `products.controller.ts` — два маршрута, признак администратора берётся **из `req.user`**, как в `create`, а не из тела:

```ts
  @Post('products/block')
  async block(@CurrentUser() user: any, @Body() body: { key: string; reason: string }) {
    if (user?.isAdmin !== true) throw new ForbiddenException('Нет доступа');
    await this.blocks.block(body.key, body.reason);
    return { ok: true };
  }

  @Post('products/unblock')
  async unblock(@CurrentUser() user: any, @Body() body: { key: string }) {
    if (user?.isAdmin !== true) throw new ForbiddenException('Нет доступа');
    await this.blocks.unblock(body.key);
    return { ok: true };
  }
```

Сверка строгая `=== true`: `user` здесь `any`, и приведение к истинности сделало бы администратором строку `'false'`.

- [ ] **Шаг 3: Прогнать и коммит**

```bash
git add src/products/products.controller.ts src/products/turns.service.ts \
        src/products/products.routes.spec.ts src/products/turns.enqueue.spec.ts
git commit -m "feat(products): маршруты гашения и отказ блокированному своим текстом"
```

---

## Task 5: Кабинет

**Файлы:**
- Изменить: `spirits_front/src/pages/StudioPage.tsx`, `src/components/products/ProductsListView.tsx`, `src/services/productsApi.ts`, `src/i18n/locales/*.json`
- Тест: `spirits_front/src/pages/StudioPage.test.tsx`, `src/components/products/ProductsListView.test.tsx`

- [ ] **Шаг 1: Переписать тест гейта**

`StudioPage.test.tsx` сегодня сторожит, что вкладка **скрыта** от не-админа — пять сценариев. Это поведение снимается, и тесты надо переписать, а не удалить: вкладка обязана быть видна **всем**, и это такой же сторож.

```tsx
it('вкладка «Продукты» видна обычному пользователю', () => {
  const { container } = mount(<StudioPage />);
  expect(container.textContent).toContain(tRu('studio.tabs.products'));
});

it('?tab=products открывает раздел обычному пользователю', () => {
  search = 'tab=products';
  const { container } = mount(<StudioPage />);
  expect(container.textContent).toContain('РАЗДЕЛ-ПРОДУКТОВ');
});
```

- [ ] **Шаг 2: Снять гейт**

В `StudioPage.tsx` убрать `canProducts` и условия вокруг него: вкладка в списке безусловно, разбор параметра принимает `products` всегда.

- [ ] **Шаг 3: Нарисовать блокировку и пустое состояние**

```tsx
it('блокированный продукт объясняет причину и не зовёт пополнить', () => {
  // Пополнение блокированного не будит. Кнопка «Пополнить» здесь была бы
  // прямым враньём — человек заплатит и ничего не получит.
  const { container } = mount(<ProductsListView onOpen={() => {}} />);
  expect(container.textContent).toContain(tRu('products.status.blocked'));
  expect(byButton(container, /пополнить/i)).toBeNull();
});

it('пустой кабинет объясняет, что тут делают', () => {
  // Этот экран впервые увидит человек без продуктов, токенов и пополнений —
  // и на нём он решает, платить или уйти.
  const { container } = mount(<ProductsListView onOpen={() => {}} />);
  expect(container.textContent).toContain(tRu('products.empty'));
  expect(byButton(container, /новый продукт/i)).toBeTruthy();
});
```

Переводы — во **все семь локалей**: `check-locales` требует полноты, и на этом уже спотыкались (ключ вкладки Студии был добавлен только в две).

- [ ] **Шаг 4: Прогнать**

```bash
npx vitest run src/components/products/ src/pages/StudioPage.test.tsx
npx tsc --noEmit -p tsconfig.app.json
npm run check-locales
```

- [ ] **Шаг 5: Коммит**

```bash
git add src/pages/ src/components/products/ src/services/productsApi.ts src/i18n/locales/
git commit -m "feat(cabinet): вкладка продуктов открыта всем, блокировка видна владельцу"
```

---

## Task 6: Живая проверка

**Файлов нет.** Клиентская машина `206.81.17.255` (зона `c.linkeon.io`), аккаунт `70000000000` — не админ.

- [ ] **Шаг 1: Два продукта заводятся**

Оба встают на `clients`, домены в зоне `c.linkeon.io`, отвечают 200.

- [ ] **Шаг 2: Третий отбивается потолком аккаунта**

Ожидание: 422 с текстом про предел аккаунта (**не** про отсутствие мест). На машине ничего не осталось: ни контейнера, ни чекаута, ни конфига домена.

- [ ] **Шаг 3: Гашение по домену**

Погасить один продукт, передав **домен**. Ожидание: контейнер `Exited`, домен отдаёт заглушку, в кабинете владельца — «Остановлен администратором» с причиной, кнопки пополнения нет.

- [ ] **Шаг 4: Пополнение не будит блокированного — ГЛАВНЫЙ**

Усыпить второй продукт за неуплату, пополнить баланс. Ожидание: спящий **просыпается**, блокированный **остаётся блокированным**.

Проверять состояние: `docker ps` на машине, статусы в базе, ответы обоих доменов.

- [ ] **Шаг 5: Снятие блокировки**

Ожидание: контейнер поднят, домен отвечает 200, sha сходится с HEAD чекаута.

- [ ] **Шаг 6: Пустое состояние**

Войти аккаунтом **без единого продукта и с нулевым балансом**, открыть Студию → «Продукты». Посмотреть глазами: понятно ли, что это, сколько стоит и что нажать.

- [ ] **Шаг 7: Убрать за собой**

Снести подопытные с машины, заархивировать строки, убедиться что `demo` и `shop2` отвечают.

---

## Самопроверка плана

**Покрытие спеки.** Вкладка всем — Task 5; потолок на аккаунт и исключения — Task 2; статус блокировки — Task 1, 3; разбор «за что гасим» — Task 3; блокировка не ждёт ход и закрывает его — Task 3, сценарий 68; снятие невыполненного пробуждения — Task 3, сценарий 69; аренда во время блокировки — выпадает по устройству, сторожит мутация «аренда списывает с блокированного» в Task 1; отказ правке — Task 4; пустое состояние — Task 5 и Task 6 шаг 6; доступ только администратору — Task 4.

**Согласованность имён.** `blocked`, `block_reason`, `product_user_limits`, `max_products` — Task 1, 2, 3, 5. `BlockService.block/unblock`, `LimitsService.assertCanCreate`, `DEFAULT_MAX_PRODUCTS` — Task 2, 3, 4.

**Известные незакрытые места, названные честно:**

- **Потолок мягкий под одновременными заявками.** Проверка и вставка — два действия; два запроса подряд оба увидят «места есть». Цена — третий продукт вместо двух. То же уже записано незакрытым у потолка машины (кусок 4а). Одним оператором не чинится: вставка продукта и так самая сложная запись модуля.
- **Мутация «аренда списывает с блокированного» проверяет ОТСУТСТВИЕ статуса в чужом фильтре.** Такие мутации легко объявить эквивалентными — не объявляй, пока не прогонишь: в куске 3 ровно такая мутация покраснела не тем тестом, которым ожидалось.
- **Сценарий 69 ожидает `['failed','queued']`** — порядок заданий по `created_at`. Если `jobsOf` сортирует иначе, тест зеленеет не по той причине; сверь с реализацией фикстуры, а не с этим текстом.
- **`ForbiddenException` в кабинете не проверен.** Кабинет разбирает коды, и 403 в ветку с сообщением сервера может не попасть. Для маршрутов администратора это терпимо — их зовут не из кабинета, — но если появится кнопка, текст придётся проверить.
