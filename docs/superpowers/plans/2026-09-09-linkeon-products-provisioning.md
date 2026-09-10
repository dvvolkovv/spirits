# Автопровижининг продуктов — план реализации (кусок 2)

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОДНАВЫК — superpowers:subagent-driven-development. Шаги помечены чекбоксами (`- [ ]`).

**Цель:** продукт заводится кнопкой в кабинете, а не семью командами оператора через два сервера.

**Архитектура:** бэкенд владеет реестром и ставит задание провижининга в очередь; агент на хосте продуктов long-poll'ит задания и делает хостовую часть (каталог, каркас, контейнер, vhost). Соединение всегда инициирует хост — ключей ни у кого. Выход из `provisioning` по измеримому факту: heartbeat раннера плюс, для сайта, публичный 200.

**Стек:** NestJS 10 + Postgres (бэкенд), TypeScript + jest (агент, вторая точка входа в `product-runner`), React + vitest (кабинет).

**Спека:** `docs/superpowers/specs/2026-09-09-linkeon-products-provisioning-design.md`

---

## Правила прогона

Тяжёлое гоняется не на маке (см. `CLAUDE.md`):

```bash
# бэкенд — на CI-клоне тестовой ноды
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && git fetch -q origin && git checkout -q <sha> \
  && source ~/.nvm/nvm.sh && npx jest src/products'

# раннер — в контейнере на хосте продуктов (на хосте нет node)
ssh root@139.59.210.42 'cd /opt/linkeon-repo-check && \
  docker run --rm -v $PWD:/w -w /w node:22 sh -c "npx jest"'
```

**Мутация обязана краснеть.** Для каждой задачи названо, какой тест и от какой мутации. Если мутация прошла зелёной — **не чинить молча**, а доложить: это значит, что либо защиты нет, либо тест слеп, и различить их можно только измерением.

---

## Структура файлов

**Бэкенд** (`spirits_back/src/products/`):

| Файл | Ответственность |
|---|---|
| `migrations/002_provisioning.sql` | колонки `kind`, `port`, `secrets_encrypted`, `provision_error`; таблица `product_provision_jobs` |
| `secrets.service.ts` | шифрование секретов продукта (AES-256-GCM) |
| `provisioning.service.ts` | создание продукта с заданием, выдача заданий агенту, приём отчёта, повтор, таймаут, перевод в `running` |
| `host.guard.ts` | аутентификация агента хоста по токену из окружения |
| `host.controller.ts` | эндпоинты агента: взять задание, отчитаться фазой, завершить |
| `products.controller.ts` (правка) | `POST /products` — заведение, `POST /products/:id/retry` — повтор |

**Агент хоста** (`spirits_back/product-runner/src/host/`):

| Файл | Ответственность |
|---|---|
| `config.ts` | чтение окружения агента |
| `api.ts` | клиент бэкенда: взять задание, отчитаться, завершить |
| `skeleton.ts` | генерация каркаса продукта по форме (`site` / `bot`) |
| `provision.ts` | хостовые шаги: каталог, git, контейнер, vhost, подчистка |
| `index.ts` | цикл опроса, точка входа `dist/host/index.js` |

**Кабинет** (`spirits_front/src/`):

| Файл | Ответственность |
|---|---|
| `components/products/NewProductForm.tsx` | форма заведения |
| `components/products/ProductsListView.tsx` (правка) | кнопка «Новый продукт», статус `provisioning`, кнопка «повторить» |
| `services/productsApi.ts` (правка) | вызовы создания и повтора |

---

## Task 1: Миграция схемы

**Файлы:**
- Создать: `spirits_back/src/products/migrations/002_provisioning.sql`
- Изменить: `spirits_back/src/products/products.service.ts` (список миграций в `onModuleInit`)
- Тест: `spirits_back/src/products/products.migration.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

В `products.migration.spec.ts` добавить:

```ts
describe('миграция 002', () => {
  it('применяется вслед за 001', async () => {
    const applied: string[] = [];
    const pg = { query: jest.fn(async () => ({ rows: [], rowCount: 0 })) };
    const svc = new ProductsService(pg as any);
    (svc as any).applyMigration = jest.fn(async (f: string) => void applied.push(f));

    await svc.onModuleInit();

    // Порядок важен: 002 добавляет колонки в таблицу, которую создаёт 001.
    expect(applied).toEqual(['001_products.sql', '002_provisioning.sql']);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест красный**

Запуск: `npx jest src/products/products.migration.spec.ts`
Ожидание: FAIL — фактический массив содержит только `001_products.sql`.

- [ ] **Шаг 3: Написать миграцию**

`migrations/002_provisioning.sql`:

```sql
-- Форма продукта: от неё зависит, публикуется ли порт и заводится ли vhost.
-- DEFAULT 'site' нужен ради существующих строк: demo и shop2 заведены до
-- появления колонки и являются сайтами.
ALTER TABLE products ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'site';
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_kind_chk CHECK (kind IN ('site','bot'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Порт выбирает агент хоста: только он знает занятые. У бота пуст.
ALTER TABLE products ADD COLUMN IF NOT EXISTS port int;

-- Секреты продукта под AES-256-GCM. bytea, а не text: внутри iv, тег и
-- шифротекст одним значением.
ALTER TABLE products ADD COLUMN IF NOT EXISTS secrets_encrypted bytea;

-- Причина последнего сорванного заведения. Переживает повтор, поэтому не
-- очищается автоматически — только перезаписывается следующей попыткой.
ALTER TABLE products ADD COLUMN IF NOT EXISTS provision_error text;

CREATE TABLE IF NOT EXISTS product_provision_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  phase text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- Одно активное задание на продукт — тем же приёмом, что замок на ходы.
-- Без него двойное нажатие кнопки «повторить» запустило бы два развёртывания
-- в один каталог.
CREATE UNIQUE INDEX IF NOT EXISTS product_provision_jobs_one_active
  ON product_provision_jobs (product_id) WHERE status IN ('queued','running');
```

- [ ] **Шаг 4: Подключить миграцию**

В `products.service.ts`, в `onModuleInit`, после применения `001_products.sql` добавить:

```ts
await this.applyMigration('002_provisioning.sql');
```

- [ ] **Шаг 5: Убедиться, что тест зелёный**

Запуск: `npx jest src/products/products.migration.spec.ts`
Ожидание: PASS.

- [ ] **Шаг 6: Проверить мутацией**

Поменять порядок вызовов местами (`002` перед `001`). Тест из шага 1 обязан покраснеть: `002` добавляет колонки в таблицу, которой ещё нет. Вернуть порядок.

- [ ] **Шаг 7: Коммит**

```bash
git add src/products/migrations/002_provisioning.sql src/products/products.service.ts src/products/products.migration.spec.ts
git commit -m "feat(products): схема провижининга — формы продукта, порт, секреты, задания"
```

---

## Task 2: Шифрование секретов

**Файлы:**
- Создать: `spirits_back/src/products/secrets.service.ts`
- Тест: `spirits_back/src/products/secrets.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`secrets.spec.ts`:

```ts
import { SecretsService } from './secrets.service';

const KEY = 'a'.repeat(64); // 32 байта в hex

describe('SecretsService', () => {
  it('расшифровка возвращает исходное', () => {
    const svc = new SecretsService({ get: () => KEY } as any);

    const box = svc.encrypt({ BOT_TOKEN: '123:abc' });

    expect(svc.decrypt(box)).toEqual({ BOT_TOKEN: '123:abc' });
  });

  it('два шифрования одного и того же дают разный шифротекст', () => {
    // Одинаковый шифротекст означал бы фиксированный iv: по базе стало бы
    // видно, у каких продуктов совпадают секреты.
    const svc = new SecretsService({ get: () => KEY } as any);

    const a = svc.encrypt({ BOT_TOKEN: 'x' });
    const b = svc.encrypt({ BOT_TOKEN: 'x' });

    expect(a.equals(b)).toBe(false);
  });

  it('подмена шифротекста ловится, а не расшифровывается в мусор', () => {
    // Без проверки тега GCM порча данных дала бы тихий мусор вместо ошибки,
    // и в контейнер уехал бы испорченный токен.
    const svc = new SecretsService({ get: () => KEY } as any);
    const box = svc.encrypt({ BOT_TOKEN: 'x' });
    box[box.length - 1] ^= 0xff;

    expect(() => svc.decrypt(box)).toThrow();
  });

  it('без ключа в окружении шифрование отказывает громко', () => {
    // Молчаливый переход на «хранить как есть» означал бы секреты открытым
    // текстом в базе, и заметить это было бы нечем.
    const svc = new SecretsService({ get: () => undefined } as any);

    expect(() => svc.encrypt({ A: '1' })).toThrow(/PRODUCT_SECRETS_KEY/);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx jest src/products/secrets.spec.ts`
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

`secrets.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Секреты продукта (токен бота, ключи бирж) под AES-256-GCM.
 *
 * Предел защиты назван в спеке явно: секрет всё равно становится переменной
 * окружения в контейнере, где работает агент клиента. Шифрование защищает от
 * утечки нашей базы, а не от владельца секрета.
 */
@Injectable()
export class SecretsService {
  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    const hex = this.config.get<string>('PRODUCT_SECRETS_KEY');
    if (!hex || hex.length !== 64) {
      throw new Error('PRODUCT_SECRETS_KEY не задан или не 32 байта в hex');
    }
    return Buffer.from(hex, 'hex');
  }

  encrypt(secrets: Record<string, string>): Buffer {
    const iv = crypto.randomBytes(IV_LEN);
    const c = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const body = Buffer.concat([c.update(JSON.stringify(secrets), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]);
  }

  decrypt(box: Buffer): Record<string, string> {
    const iv = box.subarray(0, IV_LEN);
    const tag = box.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const d = crypto.createDecipheriv('aes-256-gcm', this.key(), iv);
    d.setAuthTag(tag);
    const out = Buffer.concat([d.update(box.subarray(IV_LEN + TAG_LEN)), d.final()]);
    return JSON.parse(out.toString('utf8'));
  }
}
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx jest src/products/secrets.spec.ts`
Ожидание: PASS, 4 теста.

- [ ] **Шаг 5: Проверить мутациями**

| Мутация | Обязан покраснеть |
|---|---|
| `const iv = Buffer.alloc(IV_LEN)` вместо случайного | «два шифрования дают разный шифротекст» |
| убрать `d.setAuthTag(tag)` | «подмена ловится» |
| в `key()` возвращать нули вместо броска при пустом ключе | «без ключа отказывает громко» |

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/secrets.service.ts src/products/secrets.spec.ts
git commit -m "feat(products): шифрование секретов продукта"
```

---

## Task 3: Создание продукта с заданием

**Файлы:**
- Создать: `spirits_back/src/products/provisioning.service.ts`
- Тест: `spirits_back/src/products/provisioning.create.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`provisioning.create.spec.ts`:

```ts
import { ProvisioningService } from './provisioning.service';

function makeService(over: any = {}) {
  const calls: { sql: string; params: any[] }[] = [];
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT count(*)')) return { rows: [{ count: over.slugTaken ? '1' : '0' }] };
      if (sql.includes('INSERT INTO products')) return { rows: [{ id: 'p-1' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
  const secrets = { encrypt: jest.fn(() => Buffer.from('шифр')) };
  return { svc: new ProvisioningService(pg as any, secrets as any), calls, secrets };
}

const sqlOf = (c: { sql: string }[]) => c.map((x) => x.sql).join('\n');

describe('ProvisioningService.create', () => {
  it('заводит продукт в статусе provisioning и ставит задание', async () => {
    const { svc, calls } = makeService();

    await svc.create({ userId: 'u-1', name: 'Сайт', slug: 'site1', kind: 'site', secrets: {} });

    expect(sqlOf(calls)).toContain('INSERT INTO products');
    expect(sqlOf(calls)).toContain('INSERT INTO product_provision_jobs');
    const insert = calls.find((c) => c.sql.includes('INSERT INTO products'))!;
    expect(insert.params).toContain('provisioning');
  });

  it('занятый слаг отвергается до всякой записи', async () => {
    // Без этой проверки вторая запись падала бы на UNIQUE, но уже после
    // выпуска токена — и в базе оставался бы висячий продукт.
    const { svc, calls } = makeService({ slugTaken: true });

    await expect(
      svc.create({ userId: 'u-1', name: 'X', slug: 'site1', kind: 'site', secrets: {} }),
    ).rejects.toThrow(/слаг/i);

    expect(sqlOf(calls)).not.toContain('INSERT INTO products');
  });

  it('в базу уходит хеш токена, а открытый возвращается вызывающему', async () => {
    const { svc, calls } = makeService();

    const res = await svc.create({ userId: 'u-1', name: 'X', slug: 's', kind: 'site', secrets: {} });

    const insert = calls.find((c) => c.sql.includes('INSERT INTO products'))!;
    expect(insert.params).not.toContain(res.runnerToken);
    expect(insert.params.some((p) => typeof p === 'string' && p.length === 64)).toBe(true);
  });

  it('секреты шифруются, а не кладутся как есть', async () => {
    const { svc, calls, secrets } = makeService();

    await svc.create({ userId: 'u-1', name: 'Бот', slug: 'b', kind: 'bot', secrets: { BOT_TOKEN: 'т' } });

    expect(secrets.encrypt).toHaveBeenCalledWith({ BOT_TOKEN: 'т' });
    const insert = calls.find((c) => c.sql.includes('INSERT INTO products'))!;
    expect(insert.params).not.toContain('т');
  });

  it('форма продукта проверяется', async () => {
    const { svc } = makeService();

    await expect(
      svc.create({ userId: 'u-1', name: 'X', slug: 's', kind: 'вирус' as any, secrets: {} }),
    ).rejects.toThrow(/форма/i);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx jest src/products/provisioning.create.spec.ts`
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

`provisioning.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PgService } from '../common/services/pg.service';
import { SecretsService } from './secrets.service';

export type ProductKind = 'site' | 'bot';

export interface CreateInput {
  userId: string;
  name: string;
  slug: string;
  kind: ProductKind;
  secrets: Record<string, string>;
}

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly pg: PgService,
    private readonly secrets: SecretsService,
  ) {}

  async create(input: CreateInput): Promise<{ productId: string; runnerToken: string }> {
    if (input.kind !== 'site' && input.kind !== 'bot') {
      throw new BadRequestException('неизвестная форма продукта');
    }
    if (!SLUG_RE.test(input.slug)) {
      throw new BadRequestException('слаг: строчные латинские, цифры и дефис');
    }

    // Проверка ДО выпуска токена и любой записи: иначе падение на UNIQUE
    // оставляло бы висячий продукт, а токен был бы выпущен впустую.
    const taken = await this.pg.query(`SELECT count(*) FROM products WHERE slug = $1`, [input.slug]);
    if (Number(taken.rows[0].count) > 0) throw new ConflictException('слаг уже занят');

    const runnerToken = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(runnerToken).digest('hex');
    const box = Object.keys(input.secrets).length ? this.secrets.encrypt(input.secrets) : null;

    const r = await this.pg.query(
      `INSERT INTO products (user_id, name, slug, kind, status, checkout_path,
                             runner_token_hash, secrets_encrypted)
       VALUES ($1, $2, $3, $4, 'provisioning', '/product', $5, $6)
       RETURNING id`,
      [input.userId, input.name, input.slug, input.kind, hash, box],
    );
    const productId = r.rows[0].id;

    await this.pg.query(
      `INSERT INTO product_provision_jobs (product_id, status) VALUES ($1, 'queued')`,
      [productId],
    );

    return { productId, runnerToken };
  }
}
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx jest src/products/provisioning.create.spec.ts`
Ожидание: PASS, 5 тестов.

- [ ] **Шаг 5: Проверить мутациями**

| Мутация | Обязан покраснеть |
|---|---|
| убрать проверку занятости слага | «занятый слаг отвергается до всякой записи» |
| класть в `INSERT` `runnerToken` вместо `hash` | «в базу уходит хеш» |
| класть `input.secrets` вместо `box` | «секреты шифруются» |
| убрать проверку `kind` | «форма продукта проверяется» |

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/provisioning.service.ts src/products/provisioning.create.spec.ts
git commit -m "feat(products): заведение продукта с заданием провижининга"
```

---

## Task 4: Выдача задания агенту и приём отчёта

**Файлы:**
- Изменить: `spirits_back/src/products/provisioning.service.ts`
- Тест: `spirits_back/src/products/provisioning.job.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`provisioning.job.spec.ts`:

```ts
import { ProvisioningService } from './provisioning.service';

function makeService(over: any = {}) {
  const calls: { sql: string; params: any[] }[] = [];
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("SET status = 'running'") && sql.includes('product_provision_jobs')) {
        return { rows: over.claim ?? [{ id: 'j-1', product_id: 'p-1', slug: 's', kind: 'site' }], rowCount: 1 };
      }
      return { rows: [], rowCount: over.rowCount ?? 1 };
    }),
  };
  const secrets = { decrypt: jest.fn(() => ({ BOT_TOKEN: 'т' })) };
  return { svc: new ProvisioningService(pg as any, secrets as any), calls, secrets };
}

const sqlOf = (c: { sql: string }[]) => c.map((x) => x.sql).join('\n');

describe('ProvisioningService.claimJob', () => {
  it('берёт задание атомарно и не отдаёт его второму агенту', async () => {
    const { svc, calls } = makeService();

    await svc.claimJob();

    const sql = sqlOf(calls);
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('SKIP LOCKED');
    expect(sql).toContain("status = 'queued'");
  });

  it('выпускает НОВЫЙ runner-токен при выдаче задания', async () => {
    // Старый восстановить нельзя: в базе только sha256. Переиспользование
    // означало бы, что раннер в новом контейнере не аутентифицируется, —
    // и отказ был бы молчаливым.
    const { svc, calls } = makeService();

    const job = await svc.claimJob();

    expect(job!.runnerToken).toMatch(/^[0-9a-f]{64}$/);
    expect(sqlOf(calls)).toContain('runner_token_hash');
  });

  it('секреты отдаются расшифрованными', async () => {
    const { svc, secrets } = makeService();

    const job = await svc.claimJob();

    expect(secrets.decrypt).toHaveBeenCalled();
    expect(job!.secrets).toEqual({ BOT_TOKEN: 'т' });
  });

  it('пустая очередь — не ошибка', async () => {
    const { svc } = makeService({ claim: [] });

    expect(await svc.claimJob()).toBeNull();
  });
});

describe('ProvisioningService.completeJob', () => {
  it('успех НЕ переводит продукт в running сам по себе', async () => {
    // Выход из provisioning — по измеримому факту (heartbeat плюс публичный
    // 200), а не по отчёту агента. Иначе продукт объявляется рабочим, не
    // отвечая.
    const { svc, calls } = makeService();

    await svc.completeJob('j-1', { ok: true, port: 8003 });

    expect(sqlOf(calls)).not.toContain("SET status = 'running'");
    expect(sqlOf(calls)).toContain('port');
  });

  it('отказ пишет причину в продукт и валит задание', async () => {
    const { svc, calls } = makeService();

    await svc.completeJob('j-1', { ok: false, error: 'порт занят' });

    const sql = sqlOf(calls);
    expect(sql).toContain('provision_error');
    expect(sql).toContain("status = 'failed'");
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx jest src/products/provisioning.job.spec.ts`
Ожидание: FAIL — `claimJob` не существует.

- [ ] **Шаг 3: Реализовать**

Добавить в `provisioning.service.ts`:

```ts
export interface ClaimedJob {
  jobId: string;
  productId: string;
  slug: string;
  kind: ProductKind;
  runnerToken: string;
  secrets: Record<string, string>;
}

  /**
   * Выдаёт одно задание агенту хоста.
   *
   * SKIP LOCKED — на случай второго агента: задание не должно достаться
   * двоим, иначе два развёртывания пойдут в один каталог.
   */
  async claimJob(): Promise<ClaimedJob | null> {
    const r = await this.pg.query(
      `UPDATE product_provision_jobs j
          SET status = 'running', started_at = now()
        WHERE j.id = (
          SELECT id FROM product_provision_jobs
           WHERE status = 'queued'
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1)
      RETURNING j.id, j.product_id,
                (SELECT slug FROM products WHERE id = j.product_id) AS slug,
                (SELECT kind FROM products WHERE id = j.product_id) AS kind,
                (SELECT secrets_encrypted FROM products WHERE id = j.product_id) AS box`,
    );
    const row = r.rows[0];
    if (!row) return null;

    // Новый токен на каждое задание. Старый невосстановим — в базе только
    // sha256, открытое значение отдавалось агенту один раз.
    const runnerToken = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(runnerToken).digest('hex');
    await this.pg.query(`UPDATE products SET runner_token_hash = $2 WHERE id = $1`, [
      row.product_id,
      hash,
    ]);

    return {
      jobId: row.id,
      productId: row.product_id,
      slug: row.slug,
      kind: row.kind,
      runnerToken,
      secrets: row.box ? this.secrets.decrypt(row.box) : {},
    };
  }

  async completeJob(jobId: string, result: { ok: boolean; port?: number; error?: string }) {
    if (result.ok) {
      await this.pg.query(
        `UPDATE product_provision_jobs SET status = 'done', finished_at = now() WHERE id = $1`,
        [jobId],
      );
      // Статус продукта здесь НЕ меняется. Перевод в running делает
      // promoteReady по измеримому факту.
      await this.pg.query(
        `UPDATE products SET port = $2
          WHERE id = (SELECT product_id FROM product_provision_jobs WHERE id = $1)`,
        [jobId, result.port ?? null],
      );
      return;
    }
    await this.pg.query(
      `UPDATE product_provision_jobs SET status = 'failed', error = $2, finished_at = now()
        WHERE id = $1`,
      [jobId, result.error ?? 'без причины'],
    );
    await this.pg.query(
      `UPDATE products SET status = 'failed', provision_error = $2
        WHERE id = (SELECT product_id FROM product_provision_jobs WHERE id = $1)`,
      [jobId, result.error ?? 'без причины'],
    );
  }
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx jest src/products/provisioning.job.spec.ts`
Ожидание: PASS, 6 тестов.

- [ ] **Шаг 5: Проверить мутациями**

| Мутация | Обязан покраснеть |
|---|---|
| убрать `SKIP LOCKED` | «берёт задание атомарно» |
| переиспользовать прежний токен вместо нового | «выпускает НОВЫЙ runner-токен» |
| добавить в `completeJob` перевод продукта в `running` | «успех НЕ переводит в running сам по себе» |

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/provisioning.service.ts src/products/provisioning.job.spec.ts
git commit -m "feat(products): выдача заданий агенту хоста и приём отчёта"
```

---

## Task 5: Выход из provisioning по измеримому факту и таймаут

**Файлы:**
- Изменить: `spirits_back/src/products/provisioning.service.ts`
- Тест: `spirits_back/src/products/provisioning.promote.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`provisioning.promote.spec.ts`:

```ts
import { ProvisioningService } from './provisioning.service';

function makeService(rows: any[], fetchImpl?: any) {
  const calls: { sql: string; params: any[] }[] = [];
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM products') && sql.includes("status = 'provisioning'")) {
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
  const svc = new ProvisioningService(pg as any, {} as any);
  (svc as any).fetchFn = fetchImpl ?? (async () => ({ status: 200 }));
  return { svc, calls };
}

const sqlOf = (c: { sql: string }[]) => c.map((x) => x.sql).join('\n');

describe('ProvisioningService.promoteReady', () => {
  it('сайт без heartbeat не переводится, даже если отвечает', async () => {
    const { svc, calls } = makeService([
      { id: 'p-1', slug: 's', kind: 'site', runner_seen_at: null },
    ]);

    await svc.promoteReady();

    expect(sqlOf(calls)).not.toContain("SET status = 'running'");
  });

  it('сайт с heartbeat, но не отвечающий, не переводится', async () => {
    // Иначе продукт объявляется рабочим, не отвечая: ровно то, что мы
    // ловили сверкой sha в куске 1.
    const { svc, calls } = makeService(
      [{ id: 'p-1', slug: 's', kind: 'site', runner_seen_at: new Date() }],
      async () => ({ status: 502 }),
    );

    await svc.promoteReady();

    expect(sqlOf(calls)).not.toContain("SET status = 'running'");
  });

  it('сайт с heartbeat и ответом переводится', async () => {
    const { svc, calls } = makeService([
      { id: 'p-1', slug: 's', kind: 'site', runner_seen_at: new Date() },
    ]);

    await svc.promoteReady();

    expect(sqlOf(calls)).toContain("SET status = 'running'");
  });

  it('боту публичный адрес не проверяется — его нет', async () => {
    const probe = jest.fn(async () => ({ status: 404 }));
    const { svc, calls } = makeService(
      [{ id: 'p-2', slug: 'b', kind: 'bot', runner_seen_at: new Date() }],
      probe,
    );

    await svc.promoteReady();

    expect(probe).not.toHaveBeenCalled();
    expect(sqlOf(calls)).toContain("SET status = 'running'");
  });
});

describe('ProvisioningService.failStaleProvisioning', () => {
  it('валит заведение, не уложившееся в срок', async () => {
    // Без таймаута тупик не исчезает, а переезжает на шаг позже: продукт
    // вечно «заводится» и молча не получает работы.
    const { svc, calls } = makeService([]);

    await svc.failStaleProvisioning();

    const sql = sqlOf(calls);
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("interval '10 minutes'");
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx jest src/products/provisioning.promote.spec.ts`
Ожидание: FAIL — `promoteReady` не существует.

- [ ] **Шаг 3: Реализовать**

Добавить в `provisioning.service.ts`:

```ts
  /** Подменяется в тестах. */
  private fetchFn: typeof fetch = fetch;

  /**
   * Переводит в `running` только то, что доказало готовность.
   *
   * Спека куска 1 предупреждала: `provisioning` — тупик той же формы, какой
   * был у `degraded`. Работа выдаётся только при `running`, снять статус
   * некому, отказ молчаливый. Поэтому условие — наблюдаемое состояние, а не
   * отчёт агента.
   */
  async promoteReady(): Promise<number> {
    const r = await this.pg.query(
      `SELECT id, slug, kind, runner_seen_at FROM products
        WHERE status = 'provisioning' AND archived_at IS NULL`,
    );
    let promoted = 0;
    for (const p of r.rows) {
      if (!p.runner_seen_at) continue;
      if (p.kind === 'site' && !(await this.answers(p.slug))) continue;
      await this.pg.query(
        `UPDATE products SET status = 'running', provision_error = NULL WHERE id = $1`,
        [p.id],
      );
      promoted++;
    }
    return promoted;
  }

  /**
   * Проверка по ПУБЛИЧНОМУ адресу: до 127.0.0.1 на хосте бэкенд не дотянется,
   * а заодно это подтверждает, что vhost заведён и TLS работает.
   */
  private async answers(slug: string): Promise<boolean> {
    try {
      const res = await this.fetchFn(`https://${slug}.p.linkeon.io/health`);
      return res.status >= 200 && res.status < 300;
    } catch {
      return false;
    }
  }

  async failStaleProvisioning(): Promise<number> {
    const r = await this.pg.query(
      `UPDATE products
          SET status = 'failed',
              provision_error = 'заведение не уложилось в 10 минут'
        WHERE status = 'provisioning'
          AND created_at < now() - interval '10 minutes'
        RETURNING slug`,
    );
    if (r.rows.length) {
      this.logger.warn(`провижининг просрочен: ${r.rows.map((x: any) => x.slug).join(', ')}`);
    }
    return r.rows.length;
  }
```

Подключить оба метода к таймеру в `onModuleInit` рядом с `reapStuck` (интервал 30 секунд — заведение должно оживать быстро, а не через пять минут):

```ts
  private promoter?: NodeJS.Timeout;

  onModuleInit() {
    this.promoter = setInterval(() => {
      this.promoteReady().catch((e) => this.logger.error(`promoteReady failed: ${e.message}`));
      this.failStaleProvisioning().catch((e) =>
        this.logger.error(`failStaleProvisioning failed: ${e.message}`),
      );
    }, 30 * 1000);
    this.promoter.unref();
  }

  onModuleDestroy() {
    if (this.promoter) clearInterval(this.promoter);
  }
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx jest src/products/provisioning.promote.spec.ts`
Ожидание: PASS, 5 тестов.

- [ ] **Шаг 5: Проверить мутациями**

| Мутация | Обязан покраснеть |
|---|---|
| убрать `if (!p.runner_seen_at) continue` | «сайт без heartbeat не переводится» |
| убрать проверку `answers` для сайта | «сайт с heartbeat, но не отвечающий, не переводится» |
| проверять `answers` и для бота | «боту публичный адрес не проверяется» |
| убрать `failStaleProvisioning` из таймера | тест проводки из шага 3а (см. ниже) |

**Шаг 3а обязателен отдельно.** В куске 1 выяснилось: сверка sha жила в `deploy.ts` и была там покрыта, но удаление одной строки в `turn.ts` отключало защиту целиком — и все 77 тестов оставались зелёными. Здесь то же самое: тесты выше проверяют SQL внутри методов, но не то, что методы вообще кто-то зовёт.

Добавить в `provisioning.promote.spec.ts`:

```ts
describe('проводка таймера', () => {
  it('таймер зовёт и перевод в running, и таймаут', () => {
    jest.useFakeTimers();
    const { svc } = makeService([]);
    const promote = jest.spyOn(svc, 'promoteReady').mockResolvedValue(0);
    const stale = jest.spyOn(svc, 'failStaleProvisioning').mockResolvedValue(0);

    svc.onModuleInit();
    jest.advanceTimersByTime(30_000);

    expect(promote).toHaveBeenCalled();
    expect(stale).toHaveBeenCalled();
    svc.onModuleDestroy();
    jest.useRealTimers();
  });
});
```

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/provisioning.service.ts src/products/provisioning.promote.spec.ts
git commit -m "feat(products): выход из provisioning по измеримому факту плюс таймаут"
```

---

## Task 6: Аутентификация агента хоста

**Файлы:**
- Создать: `spirits_back/src/products/host.guard.ts`
- Тест: `spirits_back/src/products/host.guard.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`host.guard.spec.ts`:

```ts
import { HostGuard } from './host.guard';
import { UnauthorizedException } from '@nestjs/common';

const ctx = (auth?: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers: auth ? { authorization: auth } : {} }) }) }) as any;

describe('HostGuard', () => {
  it('пропускает с верным токеном', async () => {
    const g = new HostGuard({ get: () => 'секрет-хоста' } as any);

    await expect(g.canActivate(ctx('Bearer секрет-хоста'))).resolves.toBe(true);
  });

  it('отвергает чужой токен', async () => {
    const g = new HostGuard({ get: () => 'секрет-хоста' } as any);

    await expect(g.canActivate(ctx('Bearer чужой'))).rejects.toThrow(UnauthorizedException);
  });

  it('отвергает запрос без токена', async () => {
    const g = new HostGuard({ get: () => 'секрет-хоста' } as any);

    await expect(g.canActivate(ctx())).rejects.toThrow(UnauthorizedException);
  });

  it('не пускает никого, когда токен не настроен', async () => {
    // Пустой ожидаемый токен и пустой присланный совпали бы, и эндпоинты
    // провижининга открылись бы всему интернету.
    const g = new HostGuard({ get: () => undefined } as any);

    await expect(g.canActivate(ctx('Bearer '))).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx jest src/products/host.guard.spec.ts`
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

`host.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Агент хоста представляет машину, а не продукт и не пользователя, поэтому ни
 * JwtGuard, ни RunnerGuard не подходят.
 *
 * Токен один и лежит в окружении: хост один. Таблица хостов — YAGNI, триггер
 * пересмотра назван в спеке (второй хост).
 */
@Injectable()
export class HostGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const expected = this.config.get<string>('PRODUCT_HOST_TOKEN');
    // Ненастроенный токен обязан закрывать вход, а не открывать: иначе
    // пустое ожидаемое совпало бы с пустым присланным.
    if (!expected) throw new UnauthorizedException('host token not configured');

    const raw = String(context.switchToHttp().getRequest().headers['authorization'] ?? '');
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    if (!token) throw new UnauthorizedException('Missing host token');

    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Bad host token');
    }
    return true;
  }
}
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx jest src/products/host.guard.spec.ts`
Ожидание: PASS, 4 теста.

- [ ] **Шаг 5: Проверить мутацией**

Убрать бросок при ненастроенном токене — тест «не пускает никого, когда токен не настроен» обязан покраснеть.

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/host.guard.ts src/products/host.guard.spec.ts
git commit -m "feat(products): аутентификация агента хоста"
```

---

## Task 7: Эндпоинты агента и кнопки кабинета

**Файлы:**
- Создать: `spirits_back/src/products/host.controller.ts`
- Изменить: `spirits_back/src/products/products.controller.ts`, `products.module.ts`
- Тест: `spirits_back/src/products/host.controller.spec.ts`, `products.routes.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`host.controller.spec.ts`:

```ts
import { HostController } from './host.controller';

describe('HostController', () => {
  it('poll отдаёт задание', async () => {
    const prov = { claimJob: jest.fn(async () => ({ jobId: 'j-1' })) };
    const c = new HostController(prov as any);

    expect(await c.poll()).toEqual({ job: { jobId: 'j-1' } });
  });

  it('пустая очередь отдаёт job: null, а не ошибку', async () => {
    const prov = { claimJob: jest.fn(async () => null) };
    const c = new HostController(prov as any);

    expect(await c.poll()).toEqual({ job: null });
  });

  it('complete передаёт порт и признак успеха', async () => {
    const prov = { completeJob: jest.fn(async () => undefined) };
    const c = new HostController(prov as any);

    await c.complete('j-1', { ok: true, port: 8003 });

    expect(prov.completeJob).toHaveBeenCalledWith('j-1', { ok: true, port: 8003 });
  });
});
```

В `products.routes.spec.ts` добавить проверку, что новые маршруты закрыты гвардами:

```ts
it('эндпоинты агента закрыты HostGuard, а не JwtGuard', () => {
  // JwtGuard здесь означал бы, что агент обязан иметь пользователя, которого
  // у него нет; отсутствие гварда — что задания раздаются всему интернету.
  const guards = Reflect.getMetadata('__guards__', HostController) ?? [];
  expect(guards.map((g: any) => g.name)).toContain('HostGuard');
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx jest src/products/host.controller.spec.ts src/products/products.routes.spec.ts`
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

`host.controller.ts`:

```ts
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { HostGuard } from './host.guard';
import { ProvisioningService } from './provisioning.service';

@Controller('webhook')
@UseGuards(HostGuard)
export class HostController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Post('products/host/poll')
  async poll() {
    return { job: await this.provisioning.claimJob() };
  }

  @Post('products/host/jobs/:id/complete')
  async complete(@Param('id') id: string, @Body() body: { ok: boolean; port?: number; error?: string }) {
    await this.provisioning.completeJob(id, body);
    return { ok: true };
  }
}
```

В `products.controller.ts` добавить:

```ts
  @Post('products')
  async create(@Req() req: any, @Body() body: { name: string; slug: string; kind: 'site' | 'bot'; secrets?: Record<string, string> }) {
    const r = await this.provisioning.create({
      userId: req.user.userId,
      name: body.name,
      slug: body.slug,
      kind: body.kind,
      secrets: body.secrets ?? {},
    });
    // runnerToken наружу не отдаётся: он нужен агенту хоста, а не браузеру.
    return { id: r.productId };
  }

  @Post('products/:id/retry')
  async retry(@Req() req: any, @Param('id') id: string) {
    await this.provisioning.retry(id, req.user.userId);
    return { ok: true };
  }
```

Добавить в `provisioning.service.ts`:

```ts
  /**
   * Повтор переиспользует ту же строку продукта: слаг, имя и форма
   * сохраняются, история отказов не теряется. Новый токен выпускается при
   * выдаче задания (`claimJob`).
   */
  async retry(productId: string, userId: string) {
    const r = await this.pg.query(
      `UPDATE products SET status = 'provisioning'
        WHERE id = $1 AND user_id = $2 AND status = 'failed' AND archived_at IS NULL
      RETURNING id`,
      [productId, userId],
    );
    if (!r.rows[0]) throw new NotFoundException('продукт не найден или не в состоянии отказа');
    await this.pg.query(
      `INSERT INTO product_provision_jobs (product_id, status) VALUES ($1, 'queued')`,
      [productId],
    );
  }
```

Зарегистрировать `HostController`, `HostGuard`, `ProvisioningService`, `SecretsService` в `products.module.ts`.

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx jest src/products`
Ожидание: PASS, все тесты модуля.

- [ ] **Шаг 5: Проверить мутациями**

| Мутация | Обязан покраснеть |
|---|---|
| снять `@UseGuards(HostGuard)` с `HostController` | «эндпоинты агента закрыты HostGuard» |
| в `retry` убрать `user_id = $2` | добавить тест: чужой продукт не перезаводится |
| в `create` вернуть `runnerToken` в ответе | добавить тест: токен не уезжает в браузер |

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/
git commit -m "feat(products): эндпоинты агента хоста, заведение и повтор из кабинета"
```

---

## Task 8: Каркасы продукта в агенте

**Файлы:**
- Создать: `spirits_back/product-runner/src/host/skeleton.ts`
- Тест: `spirits_back/product-runner/src/host/skeleton.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`skeleton.spec.ts`:

```ts
import { skeletonFor } from './skeleton';

describe('skeletonFor', () => {
  it('сайт и бот отдают разный набор файлов, но оба с server.js', () => {
    const site = skeletonFor('site', 'Мой сайт');
    const bot = skeletonFor('bot', 'Мой бот');

    expect(Object.keys(site)).toContain('server.js');
    expect(Object.keys(bot)).toContain('server.js');
  });

  it('оба каркаса вычисляют sha один раз при старте', () => {
    // Чтение на каждый запрос позволило бы осиротевшему процессу отдать
    // свежий sha и подделать выкат — дефект, стоивший куска 1 двух аварий.
    for (const kind of ['site', 'bot'] as const) {
      const js = skeletonFor(kind, 'X')['server.js'];

      expect(js).toMatch(/const\s+GIT_SHA\s*=/);
      expect(js).toContain('rev-parse');
      // sha не должен вычисляться внутри обработчика запроса
      const handlerStart = js.indexOf('createServer');
      expect(js.indexOf('rev-parse')).toBeLessThan(handlerStart);
    }
  });

  it('бот не слушает публичный порт, а сайт слушает', () => {
    expect(skeletonFor('bot', 'X')['server.js']).toContain('127.0.0.1');
    expect(skeletonFor('site', 'X')['server.js']).not.toContain('127.0.0.1');
  });

  it('CLAUDE.md запрещает запускать сервер руками', () => {
    // Агент уже оставлял процесс, занявший порт: после этого все выкаты
    // падали с EADDRINUSE, а сайт отвечал старым кодом.
    for (const kind of ['site', 'bot'] as const) {
      expect(skeletonFor(kind, 'X')['CLAUDE.md']).toMatch(/не запускать сервер руками/i);
    }
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx jest src/host/skeleton.spec.ts`
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

`skeleton.ts` экспортирует `skeletonFor(kind: 'site'|'bot', name: string): Record<string, string>` — имя файла в содержимое.

**Каркас сайта берётся дословно** из `spirits_back/scripts/product-provision.sh`, блок `cat > server.js <<'SRV' … SRV` вместе с `package.json` и `CLAUDE.md` из соседних heredoc'ов. Он обкатан на двух продуктах, переписывать его заново незачем; после переноса скрипт должен звать агента, а не дублировать каркас.

**Каркас бота** — тот же `GIT_SHA` на верхнем уровне модуля, но:

```js
const http = require("http");
const { execFileSync } = require("child_process");

// Один раз при старте: по этому полю раннер отличает поднявшийся новый код от
// процесса прошлой версии, оставшегося на порту.
const GIT_SHA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: __dirname, encoding: "utf8" }).trim();
const TOKEN = process.env.BOT_TOKEN;

// Здоровье слушает 127.0.0.1: наружу боту торчать нечем и незачем, а раннер
// внутри контейнера дотянется.
http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, sha: GIT_SHA }));
}).listen(3000, "127.0.0.1");

// Long polling. setWebhook не используется: общий токен между средами уже
// уводил боевого бота.
let offset = 0;
async function loop() {
  for (;;) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=30&offset=${offset}`);
      const d = await r.json();
      for (const u of d.result ?? []) {
        offset = u.update_id + 1;
        if (u.message?.text) {
          await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: u.message.chat.id, text: "Бот заведён и ждёт правок." }),
          });
        }
      }
    } catch (e) {
      // Обрыв связи с Telegram не должен ронять процесс: health обязан
      // продолжать отвечать, иначе ход откатится из-за чужой сетевой ошибки.
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
loop();
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx jest src/host/skeleton.spec.ts`
Ожидание: PASS, 4 теста.

- [ ] **Шаг 5: Проверить мутациями**

| Мутация | Обязан покраснеть |
|---|---|
| перенести вычисление `GIT_SHA` внутрь обработчика | «вычисляют sha один раз при старте» |
| заставить бота слушать `0.0.0.0` | «бот не слушает публичный порт» |
| убрать запрет из `CLAUDE.md` | «CLAUDE.md запрещает запускать сервер руками» |

- [ ] **Шаг 6: Коммит**

```bash
git add product-runner/src/host/skeleton.ts product-runner/src/host/skeleton.spec.ts
git commit -m "feat(runner): каркасы продукта для сайта и бота"
```

---

## Task 9: Хостовые шаги провижининга

**Файлы:**
- Создать: `spirits_back/product-runner/src/host/provision.ts`
- Тест: `spirits_back/product-runner/src/host/provision.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`provision.spec.ts`:

```ts
import { provision } from './provision';

function deps(over: any = {}) {
  const cmds: string[] = [];
  return {
    cmds,
    shell: over.shell ?? (async (c: string) => void cmds.push(c)),
    writeFiles: over.writeFiles ?? (async () => {}),
    freePort: over.freePort ?? (async () => 8003),
  };
}

describe('provision', () => {
  it('сайт получает публикацию порта и vhost', async () => {
    const d = deps();

    await provision({ slug: 's', kind: 'site', name: 'X', runnerToken: 't', secrets: {} }, d as any);

    const all = d.cmds.join('\n');
    expect(all).toContain('-p 127.0.0.1:8003:3000');
    expect(all).toContain('product-vhost s 8003');
  });

  it('бот не получает ни публикации порта, ни vhost', async () => {
    // Публикация порта открыла бы бота наружу, а vhost создал бы домен,
    // которого у бота быть не должно.
    const d = deps();

    await provision({ slug: 'b', kind: 'bot', name: 'X', runnerToken: 't', secrets: {} }, d as any);

    const all = d.cmds.join('\n');
    expect(all).not.toContain('-p 127.0.0.1');
    expect(all).not.toContain('product-vhost');
  });

  it('секреты уезжают в контейнер переменными окружения', async () => {
    const d = deps();

    await provision(
      { slug: 'b', kind: 'bot', name: 'X', runnerToken: 't', secrets: { BOT_TOKEN: 'тк' } },
      d as any,
    );

    expect(d.cmds.join('\n')).toContain('-e BOT_TOKEN=');
  });

  it('падение на середине подчищает за собой', async () => {
    // Иначе слаги и порты кончаются молча: каталог занят, контейнер висит,
    // а продукт числится незаведённым.
    const cmds: string[] = [];
    const d = deps({
      shell: async (c: string) => {
        cmds.push(c);
        if (c.includes('docker run')) throw new Error('нет места');
      },
    });
    (d as any).cmds = cmds;

    await expect(
      provision({ slug: 's', kind: 'site', name: 'X', runnerToken: 't', secrets: {} }, d as any),
    ).rejects.toThrow('нет места');

    const all = cmds.join('\n');
    expect(all).toContain('docker rm -f s');
    expect(all).toContain('rm -rf /srv/products/s');
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx jest src/host/provision.spec.ts`
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

```ts
export interface ProvisionJob {
  slug: string;
  kind: 'site' | 'bot';
  name: string;
  runnerToken: string;
  secrets: Record<string, string>;
}

export interface ProvisionDeps {
  shell: (cmd: string) => Promise<void>;
  writeFiles: (dir: string, files: Record<string, string>) => Promise<void>;
  freePort: () => Promise<number>;
}

export async function provision(job: ProvisionJob, deps: ProvisionDeps): Promise<{ port?: number }> {
  const dir = `/srv/products/${job.slug}`;
  const port = job.kind === 'site' ? await deps.freePort() : undefined;

  try {
    await deps.writeFiles(dir, skeletonFor(job.kind, job.name));
    await deps.shell(`cd ${dir} && git init -q && git config user.email assistant@linkeon.io`
      + ` && git config user.name "Linkeon Assistant" && git add -A && git commit -qm "первичный каркас продукта"`);
    await deps.shell(`chown -R 1000:1000 ${dir}`);

    // Секреты уезжают переменными окружения. Кавычки обязательны: токен бота
    // содержит двоеточие, а ключи бирж — символы, которые шелл иначе съест.
    const env = Object.entries(job.secrets).map(([k, v]) => `-e ${k}='${v}'`).join(' ');
    const publish = port ? `-p 127.0.0.1:${port}:3000` : '';

    await deps.shell(
      `docker run -d --name ${job.slug} --restart unless-stopped -v ${dir}:/product ${publish} `
      + `-e LINKEON_URL=https://my.linkeon.io -e RUNNER_TOKEN='${job.runnerToken}' `
      + `-e CLAUDE_CODE_OAUTH_TOKEN="$(cat /root/.secrets/claude-oauth-token)" `
      + `-e PRODUCT_START_SCRIPT=server.js -e PORT=3000 ${env} `
      + `--memory=1g --cpus=1 linkeon-product:base`,
    );

    if (port) await deps.shell(`product-vhost ${job.slug} ${port}`);
    return { port };
  } catch (e) {
    // Подчистка обязательна: иначе каталог занят, контейнер висит, а продукт
    // числится незаведённым — слаги и порты кончаются молча.
    await deps.shell(`docker rm -f ${job.slug} || true`).catch(() => {});
    await deps.shell(`rm -rf ${dir}`).catch(() => {});
    await deps.shell(`rm -f /etc/nginx/sites-products/${job.slug}.conf && nginx -s reload || true`).catch(() => {});
    throw e;
  }
}
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx jest src/host/provision.spec.ts`
Ожидание: PASS, 4 теста.

- [ ] **Шаг 5: Проверить мутациями**

| Мутация | Обязан покраснеть |
|---|---|
| публиковать порт и для бота | «бот не получает публикации порта» |
| звать `product-vhost` для обеих форм | «бот не получает vhost» |
| убрать подчистку в обработчике ошибки | «падение на середине подчищает за собой» |

- [ ] **Шаг 6: Коммит**

```bash
git add product-runner/src/host/provision.ts product-runner/src/host/provision.spec.ts
git commit -m "feat(runner): хостовые шаги провижининга с подчисткой при отказе"
```

---

## Task 10: Цикл опроса агента

**Файлы:**
- Создать: `spirits_back/product-runner/src/host/config.ts`, `api.ts`, `index.ts`
- Тест: `spirits_back/product-runner/src/host/index.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`index.spec.ts`:

```ts
import { tick } from './index';

describe('tick агента хоста', () => {
  it('пустая очередь — не ошибка и не действие', async () => {
    const api = { poll: jest.fn(async () => null), complete: jest.fn() };
    const provision = jest.fn();

    await tick({ api, provision } as any);

    expect(provision).not.toHaveBeenCalled();
    expect(api.complete).not.toHaveBeenCalled();
  });

  it('успех докладывается с портом', async () => {
    const api = { poll: jest.fn(async () => ({ jobId: 'j-1', slug: 's', kind: 'site' })), complete: jest.fn() };
    const provision = jest.fn(async () => ({ port: 8003 }));

    await tick({ api, provision } as any);

    expect(api.complete).toHaveBeenCalledWith('j-1', { ok: true, port: 8003 });
  });

  it('падение провижининга докладывается, а не проглатывается', async () => {
    // Непойманная ошибка оставила бы задание в running навсегда, и продукт
    // висел бы в provisioning до таймаута без объяснения причины.
    const api = { poll: jest.fn(async () => ({ jobId: 'j-1', slug: 's', kind: 'site' })), complete: jest.fn() };
    const provision = jest.fn(async () => { throw new Error('нет места'); });

    await tick({ api, provision } as any);

    expect(api.complete).toHaveBeenCalledWith('j-1', { ok: false, error: 'нет места' });
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx jest src/host/index.spec.ts`
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать**

`config.ts` и `api.ts` пишутся по образцу `product-runner/src/config.ts` и `src/api.ts` — те же таймауты через `AbortController` (опрос 35 с, прочие запросы 10 с), тот же разбор окружения. Читать оба файла перед реализацией обязательно.

`index.ts`:

```ts
export interface HostDeps {
  api: { poll: () => Promise<any>; complete: (jobId: string, r: any) => Promise<void> };
  provision: (job: any) => Promise<{ port?: number }>;
}

/** Вынесено из цикла ровно для тестируемости — как tick в раннере. */
export async function tick(deps: HostDeps): Promise<void> {
  const job = await deps.api.poll();
  if (!job) return;
  try {
    const { port } = await deps.provision(job);
    await deps.api.complete(job.jobId, { ok: true, port });
  } catch (e: any) {
    // Молчаливое проглатывание оставило бы задание в running навсегда, а
    // продукт висел бы в provisioning до таймаута без объяснения причины.
    await deps.api.complete(job.jobId, { ok: false, error: e?.message ?? String(e) });
  }
}

if (require.main === module) {
  void (async () => {
    for (;;) await tick(realDeps());
  })();
}
```

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx jest src/host/index.spec.ts`
Ожидание: PASS, 3 теста.

- [ ] **Шаг 5: Проверить мутацией**

Убрать `try/catch` вокруг `provision` — тест «падение докладывается» обязан покраснеть.

- [ ] **Шаг 6: Собрать вторую точку входа**

В `product-runner/tsconfig.json` вход уже покрывает `src/**/*.ts`, поэтому дополнительной настройки не нужно; проверить, что появился `dist/host/index.js`:

```bash
npx tsc -p tsconfig.json && ls dist/host/index.js
```

- [ ] **Шаг 7: Коммит**

```bash
git add product-runner/src/host/
git commit -m "feat(runner): цикл опроса агента хоста"
```

---

## Task 11: Установка агента на хост

**Файлы:**
- Создать: `spirits_back/product-runner/docker/linkeon-product-host-agent.service`
- Изменить: `spirits_back/product-runner/README.md`

- [ ] **Шаг 1: Написать юнит**

```ini
[Unit]
Description=Linkeon product host agent
After=network-online.target docker.service

[Service]
Type=simple
WorkingDirectory=/opt/linkeon-host-agent
EnvironmentFile=/etc/linkeon-host-agent.env
# Путь к node подставляется при установке: /usr/bin/node существует не везде,
# на тестовой ноде node стоит под nvm и юнит падает с status=203/EXEC.
Environment=PATH=__NODE_BIN__:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=__NODE__ /opt/linkeon-host-agent/dist/host/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

- [ ] **Шаг 2: Описать установку в README**

Раздел «Агент хоста»: агент живёт **вне** контейнера (ему нужен Docker), раскладывается в `/opt/linkeon-host-agent`, конфиг `/etc/linkeon-host-agent.env` с `LINKEON_URL` и `HOST_TOKEN`. Отдельно указать, что `HOST_TOKEN` должен совпадать с `PRODUCT_HOST_TOKEN` в окружении бэкенда, иначе агент молча не получит ни одного задания — снаружи это выглядит как «кнопка не работает».

- [ ] **Шаг 3: Коммит**

```bash
git add product-runner/docker/linkeon-product-host-agent.service product-runner/README.md
git commit -m "docs(runner): установка агента хоста"
```

---

## Task 12: Форма заведения в кабинете

**Файлы:**
- Создать: `spirits_front/src/components/products/NewProductForm.tsx`
- Изменить: `spirits_front/src/components/products/ProductsListView.tsx`, `spirits_front/src/services/productsApi.ts`
- Тест: `spirits_front/src/components/products/NewProductForm.test.tsx`

- [ ] **Шаг 1: Написать падающие тесты**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { NewProductForm } from './NewProductForm';

describe('NewProductForm', () => {
  it('поле токена появляется только для бота', () => {
    const { rerender } = render(<NewProductForm kind="site" onSubmit={() => {}} />);
    expect(screen.queryByLabelText(/токен бота/i)).toBeNull();

    rerender(<NewProductForm kind="bot" onSubmit={() => {}} />);
    expect(screen.getByLabelText(/токен бота/i)).toBeTruthy();
  });

  it('слаг с недопустимыми символами не отправляется', () => {
    // Иначе отказ прилетит с сервера уже после нажатия, а пользователь не
    // поймёт, что именно не так.
    const onSubmit = jest.fn();
    render(<NewProductForm kind="site" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/адрес/i), { target: { value: 'Мой Сайт!' } });
    fireEvent.click(screen.getByRole('button', { name: /создать/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('бот не спрашивает адрес — у него нет домена', () => {
    render(<NewProductForm kind="bot" onSubmit={() => {}} />);

    expect(screen.queryByLabelText(/адрес/i)).toBeNull();
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Запуск: `npx vitest run src/components/products/NewProductForm.test.tsx`
Ожидание: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать форму и подключить к списку**

```tsx
const SLUG_RE = /^[a-z0-9-]{2,40}$/;

export function NewProductForm({ kind, onSubmit }: {
  kind: 'site' | 'bot';
  onSubmit: (v: { name: string; slug: string; kind: 'site' | 'bot'; secrets: Record<string, string> }) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [token, setToken] = useState('');

  const submit = () => {
    // Проверка здесь, а не только на сервере: иначе отказ прилетает уже после
    // нажатия и пользователю неясно, что именно не так.
    if (kind === 'site' && !SLUG_RE.test(slug)) return;
    if (!name.trim()) return;
    onSubmit({ name, slug: kind === 'site' ? slug : name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
               kind, secrets: kind === 'bot' ? { BOT_TOKEN: token } : {} });
  };

  return (
    <div>
      <label htmlFor="np-name">Название</label>
      <input id="np-name" value={name} onChange={(e) => setName(e.target.value)} />

      {kind === 'site' && (<>
        <label htmlFor="np-slug">Адрес</label>
        <input id="np-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
      </>)}

      {kind === 'bot' && (<>
        <label htmlFor="np-token">Токен бота</label>
        <input id="np-token" value={token} onChange={(e) => setToken(e.target.value)} />
      </>)}

      <button onClick={submit}>Создать</button>
    </div>
  );
}
```

В `ProductsListView` — кнопка «Новый продукт», статус `provisioning` показывается как «заводится…», `failed` — с текстом `provision_error` и кнопкой «повторить». В `productsApi.ts` — `createProduct(body)` и `retryProduct(id)` через `apiClient.post`.

- [ ] **Шаг 4: Убедиться, что тесты зелёные**

Запуск: `npx vitest run src/components/products/`
Ожидание: PASS.

- [ ] **Шаг 5: Проверить типы**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Голый `tsc --noEmit` не годится: он компилирует ноль файлов и всегда зелёный.

- [ ] **Шаг 6: Коммит**

```bash
git add src/components/products/ src/services/productsApi.ts
git commit -m "feat(cabinet): форма заведения продукта и повтор при отказе"
```

---

## Task 13: Живая проверка

**Файлы:** нет — проверка на живом хосте.

- [ ] **Шаг 1: Раскатать агента**

Разложить `product-runner` в `/opt/linkeon-host-agent` на 139.59.210.42, собрать, задать `/etc/linkeon-host-agent.env`, поднять юнит. Убедиться, что в журнале есть строка о старте и опросе.

- [ ] **Шаг 2: Сайт кнопкой**

Завести сайт через кабинет. Ожидание: статус проходит `provisioning` → `running`, публичный адрес отдаёт 200, `/health` отдаёт sha, совпадающий с HEAD чекаута.

- [ ] **Шаг 3: Бот кнопкой**

Завести бота с настоящим тестовым токеном. Ожидание: `running` **без** домена и без vhost; `docker inspect` показывает отсутствие публикации портов; бот отвечает на сообщение в Telegram.

- [ ] **Шаг 4: Сорванное заведение**

Занять слаг каталогом на хосте (`mkdir /srv/products/broken`) и завести продукт с этим слагом. Ожидание: статус `failed`, причина видна в кабинете, контейнер и vhost не остались, кнопка «повторить» после освобождения слага доводит дело до `running`.

Это главная проверка. В куске 1 пять дефектов из восьми прятались именно в том, что отказ выглядел успехом.

- [ ] **Шаг 5: Проверить, что таймаут работает**

Остановить агента, завести продукт, дождаться 10 минут. Ожидание: статус `failed` с причиной «не уложилось в 10 минут», а не вечное «заводится».

---

## Самопроверка плана

**Покрытие спеки.** Каждый раздел спеки имеет задачу: поток заведения — Task 3, 4, 7, 10; выход из `provisioning` и таймаут — Task 5; отказ и повтор — Task 4, 7, 9; модель данных — Task 1; формы продукта — Task 8, 9, 12; секреты — Task 2, 3, 4, 9; аутентификация агента — Task 6; тестирование — мутации в каждой задаче и Task 13.

**Заглушек нет.** Каждый шаг с кодом содержит код; команды запуска и ожидаемый результат указаны.

**Согласованность имён.** `ProvisioningService.create/claimJob/completeJob/retry/promoteReady/failStaleProvisioning`, `SecretsService.encrypt/decrypt`, `skeletonFor(kind, name)`, `provision(job, deps)`, `tick(deps)` — используются одинаково во всех задачах.

**Отличие от куска 1, которое стоит держать в голове:** там мутации ловились тестами не всегда, и дважды выяснялось, что проверка проходит по соседней причине. Поэтому в каждой задаче названо, какой именно тест обязан покраснеть от какой мутации, а не «прогон станет красным».
