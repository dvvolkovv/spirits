# Linkeon Products — бэкенд реестра и API раннера

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Модуль `products` в `spirits_back`: реестр клиентских продуктов, очередь ходов агента, API для раннера на VM продукта, стриминг ответа клиенту и откат.

**Architecture:** Раннер на VM продукта сам ходит на бэкенд long-poll'ом за заданием — бэкенд не хранит SSH-ключей и не инициирует соединений. Один продукт = один активный ход, гарантируется частичным уникальным индексом в Postgres. Ход агента течёт клиенту тем же NDJSON-протоколом, что и чат с ассистентами.

**Tech Stack:** NestJS 10, Postgres (через `PgService`), jest + ts-jest. Списание токенов — `MiscService.deductTokens`. Аутентификация клиента — `JwtGuard`, аутентификация раннера — новый `RunnerGuard` по per-product токену.

**Спека:** `docs/superpowers/specs/2026-09-07-linkeon-products-hosting-design.md` (в репозитории `spirits_front`).

**Границы этого плана:** только `spirits_back`. Раннер (`product-runner`) и кабинет `/products` во фронте — отдельным планом. На этом этапе раннер эмулируется `curl`.

---

## Конвенции, которые надо соблюсти

Прочитать до начала — каждая выведена из инцидента на этом проекте.

**Баланс меняется только через `MiscService.deductTokens`.** Прямой `tokens = tokens - N` запрещён: есть сторож на исходниках `src/tokens/balance-writes.guard.spec.ts`, который падает на любом новом таком месте. Причина в шапке того файла: прямые UPDATE уводили баланс в минус (−7 363 у пользователя 08.08.2026) и не писали в `token_transactions`.

**Миграции модуль накатывает сам.** Общий runner миграций на проде застрял на `base/001`. Штатный обход — `onModuleInit` → `applyMigration()`, как в `src/custom-agents/custom-agents.service.ts:28-49`. Скопировать оттуда, включая перебор двух путей (`__dirname/migrations` и `src/<module>/migrations`) — при сборке в `dist` работает первый, в ts-node второй.

**`user_id` — `text`, не `varchar`.** У пользователей с OAuth/email идентификатор — UUID на 36 символов, не телефон. `src/custom-agents/migrations/002_owner_user_id_to_text.sql` — след ровно этой ошибки.

**Тесты — чистые юниты с замоканным `PgService`.** Образец: `src/tg-bot/tg-identity.bind.spec.ts`. База не поднимается. Гонять локально можно: `npx jest src/products`.

**Мок `pg.query` не исполняет SQL — он его игнорирует.** Из этого следует правило: **у каждого значимого условия в запросе должно быть собственное утверждение о тексте SQL.** Не «хотя бы одно утверждение на запрос» — именно по одному на условие.

Разница неочевидна и стоила отдельного разбора. Тест `list` из Task 2 утверждал `toContain('archived_at IS NULL')` и потому выглядел проверенным. Но фильтр владельца в том же `WHERE` не был закрыт ничем: подмена `user_id = $1` на `slug = $1` оставляла все тесты зелёными, а метод при этом начинал отдавать клиенту чужие продукты списком — вместе с `checkout_path`, `domain` и `host_ip`.

Проверка одних лишь параметров фиксирует форму вызова, а не участие параметра в фильтрации: убери условие из `WHERE`, оставив параметр на месте, — тест останется зелёным, назвавшись защитой от утечки. На этом проекте уже было пять ложно-зелёных проверок подряд в i18n; здесь тот же механизм.

Способ убедиться, что тест не ложно-зелёный, один: **сломать каждое проверяемое условие по очереди и увидеть красный.** Зелёный прогон сам по себе не доказывает ничего.

**Глобальный префикс — `webhook`.** Контроллер объявляется как `@Controller('')`, маршрут `@Get('products')` даёт `GET /webhook/products`.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/products/migrations/001_products.sql` | схема: `products`, `product_turns`, замок |
| `src/products/products.service.ts` | реестр: список, чтение, проверка владения |
| `src/products/turns.service.ts` | жизненный цикл хода: постановка, выдача раннеру, финализация, откат |
| `src/products/products.controller.ts` | клиентские маршруты под `JwtGuard` |
| `src/products/runner.controller.ts` | маршруты раннера под `RunnerGuard` |
| `src/products/runner.guard.ts` | аутентификация раннера по per-product токену |
| `src/products/products.module.ts` | сборка модуля |

Два сервиса, а не один: реестр отвечает на вопрос «чей продукт и где он», ходы — на вопрос «что сейчас происходит». Они меняются по разным причинам и тестируются раздельно.

---

## Часть A. Схема и реестр

### Task 1: Схема и самонакат миграции

**Files:**
- Create: `src/products/migrations/001_products.sql`
- Create: `src/products/products.service.ts`
- Test: `src/products/products.migration.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/products/products.migration.spec.ts`:

```ts
import { ProductsService } from './products.service';

function makeService() {
  const queries: string[] = [];
  const pg = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return { rows: [] };
    }),
  };
  return { svc: new ProductsService(pg as any), queries };
}

describe('ProductsService.onModuleInit', () => {
  it('накатывает схему products и product_turns', async () => {
    const { svc, queries } = makeService();

    await svc.onModuleInit();

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS products');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS product_turns');
  });

  it('создаёт замок «один активный ход на продукт»', async () => {
    const { svc, queries } = makeService();

    await svc.onModuleInit();

    expect(queries.join('\n')).toContain('product_turns_one_active');
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `cd ~/Downloads/spirits_back && npx jest src/products/products.migration.spec.ts`
Expected: FAIL — `Cannot find module './products.service'`

- [ ] **Step 3: Написать схему**

`src/products/migrations/001_products.sql`:

```sql
-- 001_products.sql
-- Реестр клиентских продуктов, которые Linkeon хостит, и история ходов
-- живущего внутри каждого продукта агента.
-- Дизайн: docs/superpowers/specs/2026-09-07-linkeon-products-hosting-design.md

CREATE TABLE IF NOT EXISTS products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- text, не varchar: у OAuth/email-пользователей это UUID на 36 символов,
  -- а не телефон. См. custom-agents/migrations/002.
  user_id            text NOT NULL,
  name               text NOT NULL,
  slug               text NOT NULL UNIQUE,
  status             text NOT NULL DEFAULT 'running',
  host_ip            inet,
  domain             text,
  repo_url           text,
  checkout_path      text NOT NULL,
  build_cmd          text,
  restart_cmd        text,
  health_url         text,
  runner_token_hash  text NOT NULL,
  runner_seen_at     timestamptz,
  claude_session_id  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  archived_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_products_user
  ON products (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS product_turns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  -- Словарь закреплён так же, как у status: TS-тип 'web' | 'telegram' не
  -- переживает границу рантайма, а значение приходит из контроллера.
  channel      text NOT NULL CHECK (channel IN ('web', 'telegram')),
  prompt       text NOT NULL,
  result       text,
  status       text NOT NULL DEFAULT 'queued',
  sha_before   text,
  sha_after    text,
  -- Непустое => это служебный ход отката, и вот на какой sha возвращать.
  -- Отдельная колонка, а не префикс в prompt: prompt приходит от пользователя
  -- и уезжает в enqueue без разбора, поэтому управляющий канал внутри него
  -- подделывается обычным запросом в чат. Плюс поле читают раннер (другой
  -- репозиторий, другая машина) и фронт — строковый контракт разъехался бы
  -- молча. Заполняется только revert().
  revert_to_sha text,
  -- Признак жизни идущего хода: обновляется маршрутом событий раннера.
  -- Нужен сборщику зависших. Без него он отбирал бы по длительности, то есть
  -- по догадке о смерти, и снимал бы замок под легитимно длинным ходом —
  -- а тогда рядом стартовал бы второй claude -p в том же чекауте.
  -- runner_seen_at здесь не годится: во время хода раннер не опрашивает, он
  -- работает, и отметка живости не двигается.
  last_progress_at timestamptz,
  tokens_spent bigint NOT NULL DEFAULT 0,
  error        text,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_turns_product
  ON product_turns (product_id, created_at DESC);

-- Замок: один продукт = один активный ход. Два параллельных claude -p в одном
-- чекауте передерутся за файлы и оставят его в состоянии, не соответствующем
-- ни одному коммиту. Гарантию даёт база, а не аккуратность вызывающего кода.
CREATE UNIQUE INDEX IF NOT EXISTS product_turns_one_active
  ON product_turns (product_id)
  WHERE status IN ('queued', 'running');
```

- [ ] **Step 4: Написать минимальный сервис**

`src/products/products.service.ts`:

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PgService } from '../common/services/pg.service';

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly pg: PgService) {}

  async onModuleInit() {
    await this.applyMigration('001_products.sql');
  }

  /**
   * Модуль накатывает свою схему сам: общий runner миграций на проде застрял
   * на base/001 и не докатывает ничего после. Тот же приём в custom-agents и
   * tg-bot. Два пути-кандидата — dist (после сборки) и src (ts-node).
   */
  private async applyMigration(filename: string) {
    const candidates = [
      path.join(__dirname, 'migrations', filename),
      path.join(__dirname, '..', '..', 'src', 'products', 'migrations', filename),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          await this.pg.query(fs.readFileSync(p, 'utf8'));
          this.logger.log(`products migration ${filename} applied from ${p}`);
          return;
        }
      } catch (e: any) {
        this.logger.error(`products migration ${filename} failed (${p}): ${e.message}`);
      }
    }
    this.logger.warn(`products migration ${filename} not found, skipping`);
  }
}
```

- [ ] **Step 5: Прогнать тест, убедиться что проходит**

Run: `npx jest src/products/products.migration.spec.ts`
Expected: PASS, 2 теста

- [ ] **Step 6: Коммит**

```bash
git add src/products/
git commit -m "feat(products): схема реестра продуктов и ходов агента"
```

---

### Task 2: Список и чтение продукта с проверкой владения

**Files:**
- Modify: `src/products/products.service.ts`
- Test: `src/products/products.access.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/products/products.access.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';

const ROW = {
  id: 'p-1',
  user_id: '79030169187',
  name: 'selyanska',
  slug: 'selyanska',
  status: 'running',
  checkout_path: '/home/dv/selyanska',
};

function makeService(rows: any[]) {
  const calls: { sql: string; params: any[] }[] = [];
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows };
    }),
  };
  return { svc: new ProductsService(pg as any), calls };
}

describe('ProductsService.list', () => {
  it('фильтрует по владельцу и не отдаёт архивные', async () => {
    const { svc, calls } = makeService([ROW]);

    await svc.list('79030169187');

    expect(calls[0].params).toEqual(['79030169187']);
    // Оба условия WHERE проверяются отдельно. Утверждение только про архивные
    // оставляет фильтр владельца без сторожа, а этот метод отдаёт коллекцию:
    // снятый предикат вернёт клиенту чужие продукты списком, вместе с их
    // checkout_path, domain и host_ip.
    expect(calls[0].sql).toContain('user_id = $1');
    expect(calls[0].sql).toContain('archived_at IS NULL');
  });
});

describe('ProductsService.getOwned', () => {
  it('отдаёт продукт своему владельцу', async () => {
    const { svc } = makeService([ROW]);

    await expect(svc.getOwned('p-1', '79030169187')).resolves.toMatchObject({ id: 'p-1' });
  });

  it('чужой продукт не отличим от несуществующего', async () => {
    const { svc, calls } = makeService([]);

    await expect(svc.getOwned('p-1', '70000000000')).rejects.toBeInstanceOf(NotFoundException);
    // Владелец в WHERE, а не в проверке после выборки: иначе existence чужого
    // продукта утекает через разницу между 403 и 404.
    //
    // Утверждение о тексте SQL здесь обязательно. Мок игнорирует sql и всегда
    // отдаёт заданный rows, поэтому проверка одних только params фиксирует
    // форму вызова, а не участие параметра в фильтрации: убери `AND user_id =
    // $2` из запроса, оставив параметр на месте, — и тест останется зелёным.
    expect(calls[0].sql).toContain('user_id = $2');
    // На getOwned завязаны все три клиентских маршрута из Task 8 — chat,
    // history и revert. Без этого условия заархивированный продукт останется
    // полностью управляемым по прямому id: клиент продолжит гонять агента в
    // чекауте продукта, выведенного из эксплуатации.
    expect(calls[0].sql).toContain('archived_at IS NULL');
    expect(calls[0].params).toEqual(['p-1', '70000000000']);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/products/products.access.spec.ts`
Expected: FAIL — `svc.list is not a function`

- [ ] **Step 3: Реализовать**

Добавить в `src/products/products.service.ts` (импорт `NotFoundException` из `@nestjs/common`):

```ts
export interface ProductRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  status: string;
  host_ip: string | null;
  domain: string | null;
  repo_url: string | null;
  checkout_path: string;
  build_cmd: string | null;
  restart_cmd: string | null;
  health_url: string | null;
  runner_seen_at: string | null;
  claude_session_id: string | null;
  created_at: string;
}

const COLUMNS = `id, user_id, name, slug, status, host_ip, domain, repo_url,
                 checkout_path, build_cmd, restart_cmd, health_url,
                 runner_seen_at, claude_session_id, created_at`;

  async list(userId: string): Promise<ProductRow[]> {
    const r = await this.pg.query(
      `SELECT ${COLUMNS} FROM products
        WHERE user_id = $1 AND archived_at IS NULL
        ORDER BY created_at DESC`,
      [userId],
    );
    return r.rows;
  }

  /**
   * Владелец в WHERE, а не в проверке после выборки. Разница между «нет
   * такого» и «есть, но не твой» — это утечка существования чужих продуктов.
   */
  async getOwned(id: string, userId: string): Promise<ProductRow> {
    const r = await this.pg.query(
      `SELECT ${COLUMNS} FROM products
        WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
      [id, userId],
    );
    if (!r.rows[0]) throw new NotFoundException('Product not found');
    return r.rows[0];
  }
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/products/products.access.spec.ts`
Expected: PASS, 3 теста

- [ ] **Step 5: Коммит**

```bash
git add src/products/products.service.ts src/products/products.access.spec.ts
git commit -m "feat(products): список и чтение продукта с проверкой владения"
```

---

## Часть B. Ходы агента

### Task 3: Постановка хода в очередь и замок

**Files:**
- Create: `src/products/turns.service.ts`
- Test: `src/products/turns.enqueue.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/products/turns.enqueue.spec.ts`:

```ts
import { ConflictException } from '@nestjs/common';
import { TurnsService } from './turns.service';

function makeService(
  opts: {
    duplicate?: boolean;
    failWithCode?: string;
    productStatus?: string;
    balanceOk?: boolean;
  } = {},
) {
  const calls: { sql: string; params: any[] }[] = [];
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT status FROM products')) {
        return { rows: [{ status: opts.productStatus ?? 'running' }] };
      }
      if (sql.includes('INSERT INTO product_turns') && opts.duplicate) {
        throw Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'product_turns_one_active',
        });
      }
      if (sql.includes('INSERT INTO product_turns') && opts.failWithCode) {
        throw Object.assign(new Error('boom'), { code: opts.failWithCode });
      }
      if (sql.includes('INSERT INTO product_turns')) {
        return { rows: [{ id: 't-1', status: 'queued' }] };
      }
      return { rows: [] };
    }),
  };
  const misc = {
    deductTokens: jest.fn(),
    checkTokenBalance: jest.fn(async () => ({ ok: opts.balanceOk ?? true })),
  };
  // Третьим аргументом идёт RedisService — он понадобится в Task 8 для буфера
  // событий. Заводим заглушку сразу, чтобы сигнатура не менялась по ходу плана.
  const redis = { rpush: jest.fn(), expire: jest.fn(), lrange: jest.fn(async () => []) };
  return { svc: new TurnsService(pg as any, misc as any, redis as any), calls, misc };
}

describe('TurnsService.enqueue', () => {
  it('создаёт ход в статусе queued', async () => {
    const { svc, calls } = makeService();

    await expect(
      svc.enqueue({ productId: 'p-1', userId: 'u-1', channel: 'web', prompt: 'поправь футер' }),
    ).resolves.toMatchObject({ id: 't-1', status: 'queued' });

    // INSERT ищется по содержимому, а не по индексу: первым запросом идёт
    // проверка статуса продукта, и привязка к calls[0] сломается от любой
    // будущей вставки предусловия.
    const insert = calls.find((c) => c.sql.includes('INSERT INTO product_turns'))!;

    // Три утверждения о тексте нужны потому, что мок отдаёт захардкоженную
    // строку и ни на одну из этих подмен сам по себе не отреагирует. Каждая
    // подмена ломает тихо, без исключения и без строки в логе:
    //
    //   'queued' → 'running'     — claimNext ищет строго 'queued' и такой ход
    //                              не подберёт никогда, а замок будет считать
    //                              продукт занятым до сборщика через полчаса;
    //   перестановка колонок     — userId уезжает в product_id, ход повисает
    //   или плейсхолдеров          на несуществующем продукте, замок занимает
    //                              не тот продукт;
    //   усечение RETURNING       — наружу уходит объект без status, а его
    //                              отдают клиенту revert (Task 5) и chat
    //                              (Task 8).
    //
    // Колонки и плейсхолдеры охраняются раздельно: переставить можно любое из
    // двух, последствие одинаковое, а params при этом не меняется.
    expect(insert.sql).toContain('(product_id, user_id, channel, prompt, revert_to_sha, status)');
    expect(insert.sql).toContain('VALUES ($1, $2, $3, $4, $5');
    expect(insert.sql).toContain("'queued'");
    expect(insert.sql).toContain('RETURNING id, status');
    expect(insert.params).toEqual(['p-1', 'u-1', 'web', 'поправь футер', null]);

    // Владение проверяется в сервисе, а не только в контроллере: у ходов два
    // входа, и телеграм-вход унаследовал бы шлагбаум по балансу даром, а
    // проверку владения молча не получил.
    const guard = calls.find((c) => c.sql.includes('SELECT status FROM products'))!;
    expect(guard.sql).toContain('user_id = $2');
    expect(guard.sql).toContain('archived_at IS NULL');
    expect(guard.params).toEqual(['p-1', 'u-1']);
  });

  it('обычный ход не может притвориться откатом', async () => {
    // Признак отката несёт отдельная колонка, а не префикс в prompt. Иначе
    // POST /products/:id/chat с телом {"prompt": "__revert__:<sha>"} доехал бы
    // до раннера как команда отката мимо всех проверок revert(), а sha
    // пользователь знает — история сама отдаёт ему sha_before и sha_after.
    const { svc, calls } = makeService();

    await svc.enqueue({
      productId: 'p-1',
      userId: 'u-1',
      channel: 'web',
      prompt: '__revert__:deadbeef',
    });

    const insert = calls.find((c) => c.sql.includes('INSERT INTO product_turns'))!;
    expect(insert.params[4]).toBeNull();
  });

  it('второй ход по тому же продукту отбивается 409, а не 500', async () => {
    const { svc } = makeService({ duplicate: true });

    await expect(
      svc.enqueue({ productId: 'p-1', userId: 'u-1', channel: 'web', prompt: 'ещё раз' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('ошибка, не связанная с замком, пробрасывается как есть', async () => {
    // Без этого теста безусловный ConflictException в catch проходит незамеченным,
    // и тогда падение базы, таймаут пула или нарушение CHECK приезжают клиенту
    // как «агент уже работает» — на продукте, где никто не работает. В логе при
    // этом пусто: ConflictException штатный 4xx, а не 5xx, и диагностика уходит
    // искать зависший ход, которого нет.
    const { svc } = makeService({ failWithCode: '23514' });

    await expect(
      svc.enqueue({ productId: 'p-1', userId: 'u-1', channel: 'web', prompt: 'go' }),
    ).rejects.not.toBeInstanceOf(ConflictException);
  });

  it('ход на неработающем продукте не создаётся', async () => {
    const { svc, calls } = makeService({ productStatus: 'stopped' });

    await expect(
      svc.enqueue({ productId: 'p-1', userId: 'u-1', channel: 'web', prompt: 'go' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(calls.some((c) => c.sql.includes('INSERT INTO product_turns'))).toBe(false);
  });

  it('при нулевом балансе ход не создаётся', async () => {
    const { svc, calls } = makeService({ balanceOk: false });

    await expect(
      svc.enqueue({ productId: 'p-1', userId: 'u-1', channel: 'web', prompt: 'go' }),
    ).rejects.toThrow();

    // Ход = реальный запуск claude -p на VM, то есть живые деньги. Вставка не
    // должна происходить вовсе, а не «происходить и не тарифицироваться».
    expect(calls.some((c) => c.sql.includes('INSERT INTO product_turns'))).toBe(false);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/products/turns.enqueue.spec.ts`
Expected: FAIL — `Cannot find module './turns.service'`

- [ ] **Step 3: Реализовать**

`src/products/turns.service.ts`:

```ts
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { RedisService } from '../common/services/redis.service';
import { MiscService } from '../misc/misc.service';

export interface EnqueueInput {
  productId: string;
  userId: string;
  channel: 'web' | 'telegram';
  prompt: string;
  /** Только для служебного хода отката. Заполняется исключительно `revert()`. */
  revertToSha?: string;
}

export interface TurnRow {
  id: string;
  status: string;
}

@Injectable()
export class TurnsService {
  private readonly logger = new Logger(TurnsService.name);

  constructor(
    private readonly pg: PgService,
    private readonly misc: MiscService,
    private readonly redis: RedisService,
  ) {}

  async enqueue(input: EnqueueInput): Promise<TurnRow> {
    // Предусловия живут здесь, а не в контроллере, сознательно. Шлагбаум по
    // балансу в чате стоял только на одном входе, и второй — загрузка файлов —
    // про него забыл: до 06.09.2026 пользователь с нулём получал там самый
    // дорогой тип хода без ограничений (см. комментарий в chat.controller.ts).
    // У ходов входов тоже два, web и telegram, поэтому проверка ставится в
    // единственном общем месте.
    // Владение проверяется здесь же, а не только в контроллере, по той же
    // причине, что статус и баланс: у ходов два входа, web и telegram, и
    // будущий телеграм-вход унаследовал бы шлагбаум по балансу даром, а
    // проверку владения молча не получил. Условие в тот же запрос — бесплатно.
    const p = await this.pg.query(
      `SELECT status FROM products WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
      [input.productId, input.userId],
    );
    const productStatus = p.rows[0]?.status;
    if (!productStatus) throw new NotFoundException('Product not found');
    if (productStatus !== 'running') {
      throw new ConflictException('Продукт сейчас недоступен для правок');
    }

    // Порог тот же, что в чате с ассистентами: balance <= 0 запрещает ход.
    // Ход — это реальный запуск claude -p на VM, то есть живые деньги; при
    // нехватке deductTokens спишет сколько есть и запишет в лог «не хватило
    // баланса», то есть работа окажется выполнена и не оплачена.
    const { ok } = await this.misc.checkTokenBalance(input.userId, 1);
    if (!ok) {
      throw new HttpException('Недостаточно токенов', HttpStatus.PAYMENT_REQUIRED);
    }

    try {
      const r = await this.pg.query(
        `INSERT INTO product_turns (product_id, user_id, channel, prompt, revert_to_sha, status)
         VALUES ($1, $2, $3, $4, $5, 'queued')
         RETURNING id, status`,
        [input.productId, input.userId, input.channel, input.prompt, input.revertToSha ?? null],
      );
      return r.rows[0];
    } catch (e: any) {
      // Только замок product_turns_one_active. Это не ошибка сервера: клиент
      // отправил второй запрос, пока агент ещё работает над первым.
      //
      // Условие обязано быть узким. Безусловный ConflictException превращает
      // падение базы, таймаут пула и нарушение CHECK в спокойное «агент занят»
      // без следа в логах: 4xx не попадает в отчёты об ошибках, и диагностика
      // уходит искать зависший ход, которого нет.
      if (e?.code === '23505') {
        throw new ConflictException('Агент уже работает над предыдущим запросом');
      }
      throw e;
    }
  }
}
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/products/turns.enqueue.spec.ts`
Expected: PASS, 2 теста

- [ ] **Step 5: Коммит**

```bash
git add src/products/turns.service.ts src/products/turns.enqueue.spec.ts
git commit -m "feat(products): постановка хода в очередь с замком на параллельные ходы"
```

---

### Task 4: Выдача задания раннеру и финализация хода

**Files:**
- Modify: `src/products/turns.service.ts`
- Test: `src/products/turns.lifecycle.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/products/turns.lifecycle.spec.ts`:

```ts
import { TurnsService } from './turns.service';

function makeService(opts: { claim?: any[]; used?: number; alreadyFinal?: boolean } = {}) {
  const calls: { sql: string; params: any[] }[] = [];
  // Возвращает фактически списанное — как настоящий deductTokens, который при
  // нехватке баланса берёт остаток и отдаёт число меньше запрошенного.
  const deductTokens = jest.fn(async (_u: string, amount: number) => opts.used ?? amount);
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("SET status = 'running'")) {
        const rows = opts.claim ?? [{ id: 't-1', prompt: 'go', channel: 'web', user_id: 'u-1' }];
        return { rows, rowCount: rows.length };
      }
      // Диспетчеризация по `SET status = $2` — намеренно НЕ по литералу
      // `AND status = 'running'`, хотя тот выглядит естественнее. Иначе мок
      // маршрутизировал бы по той же строке, которую охраняет утверждение, и
      // мутация «снять сторож состояния» одновременно снимала бы триггер
      // мок-ветки: запрос начал бы отдавать rowCount 0 всегда, сервис считал
      // бы ход финализированным, и тест на повтор остался бы зелёным именно
      // тогда, когда защита сломана.
      //
      // rowCount = 0 моделирует «ход уже финализирован»: сторож не нашёл
      // строки, и повтор обязан стать no-op.
      if (sql.includes('SET status = $2')) {
        return { rows: [], rowCount: opts.alreadyFinal ? 0 : 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
  const redis = { rpush: jest.fn(), expire: jest.fn(), lrange: jest.fn(async () => []) };
  return { svc: new TurnsService(pg as any, { deductTokens } as any, redis as any), calls, deductTokens };
}

const sqlOf = (calls: { sql: string }[]) => calls.map((c) => c.sql).join('\n');

describe('TurnsService.claimNext', () => {
  it('забирает ровно один queued-ход и переводит его в running', async () => {
    const { svc, calls } = makeService();

    const turn = await svc.claimNext('p-1');

    expect(turn).toMatchObject({ id: 't-1' });
    // Отбор — не косметика: без product_id раннер одного продукта заберёт ход
    // чужого и пойдёт править не тот чекаут, а без status='queued' подхватит
    // уже выполняющийся ход.
    expect(sqlOf(calls)).toContain('t.product_id = $1');
    expect(sqlOf(calls)).toContain("t.status = 'queued'");
    // Статус продукта проверяется при выдаче, а не только при постановке:
    // между ними проходит время, и продукт мог уехать в stopped.
    expect(sqlOf(calls)).toContain("p.status = 'running'");
    expect(sqlOf(calls)).toContain('p.archived_at IS NULL');
    expect(sqlOf(calls)).toContain('FOR UPDATE SKIP LOCKED');
    expect(sqlOf(calls)).toContain('LIMIT 1');
    // Перевод в running охраняется явно, а не через диспетчер мока: тот
    // маршрутизирует по этой же строке, поэтому покрытие есть, но невидимое —
    // переписав мок на другой предикат, его снимут не заметив.
    expect(sqlOf(calls)).toContain("SET status = 'running'");
    // Самая дорогая из подмен в этом запросе. reapStuck (Task 10) отбирает
    // ходы по `started_at < now() - interval '30 minutes'`; при started_at
    // IS NULL сравнение даёт NULL, строка не отбирается никогда, и мьютекс
    // держит продукт вечно. То есть снятие этой строки молча выключает
    // единственный механизм самовосстановления.
    expect(sqlOf(calls)).toContain('started_at = now()');
    // Task 7 читает prompt, user_id и revert_to_sha и шлёт их на VM. Мок эти
    // поля выдумывает, поэтому усечение RETURNING без утверждения незаметно.
    // `channel` здесь намеренно нет: он никем не читается, а поле, которое
    // существует и не используется, рано или поздно начнут поддерживать.
    expect(sqlOf(calls)).toContain('RETURNING id, prompt, user_id, revert_to_sha');
  });

  it('отдаёт null, когда очередь пуста', async () => {
    const { svc } = makeService({ claim: [] });

    await expect(svc.claimNext('p-1')).resolves.toBeNull();
  });
});

describe('TurnsService.complete', () => {
  it('успешный ход списывает токены', async () => {
    const { svc, calls, deductTokens } = makeService();

    await svc.complete('t-1', {
      productId: 'p-1',
      userId: 'u-1',
      status: 'done',
      result: 'готово',
      shaBefore: 'aaa',
      shaAfter: 'bbb',
      tokens: 1200,
    });

    expect(deductTokens).toHaveBeenCalledWith('u-1', 1200, expect.stringContaining('product'));

    // Без утверждения о WHERE подмена `id = $1` на `id = $2` проходит мимо
    // всех тестов: мок игнорирует текст, а проверяется только вызов
    // deductTokens, который от этого не зависит. Последствие — исход хода
    // записывается не в ту строку либо никуда, ход остаётся running, и замок
    // держит продукт до сборщика через полчаса.
    expect(calls[0].sql).toContain('WHERE id = $1');
    // COALESCE хранит уже записанный sha_before, когда раннер его не прислал.
    // Без него откат теряет точку возврата, а кнопка «вернуть как было»
    // перестаёт работать на ходах, доложенных без shaBefore.
    expect(calls[0].sql).toContain('COALESCE($5, sha_before)');
    expect(calls[0].sql).toContain('result = $3, error = $4');
    expect(calls[0].sql).toContain('tokens_spent = $7');
    expect(calls[0].sql).toContain('finished_at = now()');
    // Сторож состояния — то, что делает повтор безвредным.
    expect(calls[0].sql).toContain("AND status = 'running'");
  });

  it('повторный complete не списывает второй раз', async () => {
    // Маршрут завершения идёт с клиентской VM через интернет: таймаут чтения
    // ответа при доставленном запросе штатен, и раннер обязан ретраить. Без
    // сторожа состояния пользователь платит дважды за один ход.
    //
    // Область этого теста ограничена намеренно: он проверяет, что при ответе
    // базы «ни одна строка не перешла» списания не происходит. Присутствие
    // самого сторожа в SQL он поймать НЕ может и не должен — мок не исполняет
    // запрос и берёт rowCount из флага сценария, а не из предиката. Текст
    // запроса охраняет утверждение toContain("AND status = 'running'") в
    // соседнем тесте, а совместную работу текста и базы — живая проверка
    // двойного complete из Task 11. Строить state-full мок, симулирующий
    // Postgres, не надо: он даёт собственную ложную уверенность вместо той,
    // которую должна давать сама база.
    const { svc, deductTokens } = makeService({ alreadyFinal: true });

    await svc.complete('t-1', { productId: 'p-1', userId: 'u-1', status: 'done', tokens: 1200 });

    expect(deductTokens).not.toHaveBeenCalled();
  });

  it('в историю пишется фактически списанное, а не запрошенное', async () => {
    // deductTokens при нехватке баланса берёт остаток и возвращает меньше
    // запрошенного. Если писать в tokens_spent число из тела раннера, кабинет
    // покажет пользователю расход, которого с него не взяли.
    const { svc, calls } = makeService({ used: 300 });

    await svc.complete('t-1', { productId: 'p-1', userId: 'u-1', status: 'done', tokens: 1200 });

    const fix = calls.find((c) => c.sql.includes('SET tokens_spent = $2'));
    expect(fix).toBeDefined();
    expect(fix!.params).toEqual(['t-1', 300]);
  });

  it('отрицательные токены от раннера не уходят в базу', async () => {
    const { svc, calls, deductTokens } = makeService();

    await svc.complete('t-1', { productId: 'p-1', userId: 'u-1', status: 'done', tokens: -5 });

    // Кламп существует потому, что тело запроса раннера — TS-тип при
    // ValidationPipe({whitelist:false}), то есть рантайм-проверки нет вовсе.
    // Без клампа сюда прилетает 23514 от CHECK (tokens_spent >= 0), уходит
    // наружу необработанным 500, ход остаётся running и держит замок.
    expect(calls[0].params[7]).toBe(0);
    expect(deductTokens).not.toHaveBeenCalled();
  });

  it('ход чужого продукта не завершается', async () => {
    // RunnerGuard подтверждает, каким продуктом является раннер, но не то, что
    // переданный в URL turnId принадлежит этому продукту. Без product_id в
    // WHERE раннер продукта A завершил бы ход продукта B и списал бы за него
    // с владельца A.
    const { svc, calls } = makeService();

    await svc.complete('t-1', { productId: 'p-1', userId: 'u-1', status: 'done', tokens: 100 });

    expect(calls[0].sql).toContain('product_id = $2');
    expect(calls[0].params[1]).toBe('p-1');
  });

  it('упавший ход не тарифицируется', async () => {
    const { svc, deductTokens } = makeService();

    await svc.complete('t-1', { productId: 'p-1', userId: 'u-1', status: 'failed', error: 'claude exited 1', tokens: 900 });

    expect(deductTokens).not.toHaveBeenCalled();
  });

  it('откат по health-check не тарифицируется', async () => {
    const { svc, deductTokens } = makeService();

    await svc.complete('t-1', { productId: 'p-1', userId: 'u-1', status: 'reverted', shaBefore: 'aaa', tokens: 900 });

    expect(deductTokens).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/products/turns.lifecycle.spec.ts`
Expected: FAIL — `svc.claimNext is not a function`

- [ ] **Step 3: Реализовать**

Добавить в `src/products/turns.service.ts`:

```ts
export type TurnStatus = 'queued' | 'running' | 'done' | 'failed' | 'reverted';

export interface CompleteInput {
  /**
   * Продукт, от имени которого пришёл раннер — всегда `req.product.id` из
   * `RunnerGuard`, никогда значение из запроса. Без этого ограничения раннер
   * продукта A завершил бы ход продукта B, передав его `turnId` в URL.
   */
  productId: string;
  userId: string;
  status: Extract<TurnStatus, 'done' | 'failed' | 'reverted'>;
  result?: string;
  error?: string;
  shaBefore?: string;
  shaAfter?: string;
  tokens?: number;
}

/**
 * Форма, которую `claimNext` отдаёт раннеру. Отличается от `TurnRow`: там
 * `{id, status}` для клиента, здесь всё, что нужно на VM для запуска хода.
 * Значение пересекает границу процесса, поэтому нетипизированным быть не
 * должно.
 */
export interface ClaimedTurn {
  id: string;
  prompt: string;
  user_id: string;
  /** Непустое => это откат, и раннеру надо сбросить дерево на этот sha. */
  revert_to_sha: string | null;
}

  /**
   * SKIP LOCKED: если раннер продукта по какой-то причине запущен в двух
   * экземплярах, второй не заблокируется на строке, а увидит пустую очередь.
   */
  async claimNext(productId: string): Promise<ClaimedTurn | null> {
    const r = await this.pg.query(
      `UPDATE product_turns
          SET status = 'running', started_at = now()
        WHERE id = (
          SELECT t.id FROM product_turns t
            -- ВАЖНО про семантику: это закрывает выдачу НОВОЙ работы, но не
            -- прерывает ход, забранный до остановки. Тот живёт на VM минутами
            -- — агент правит код, коммитит, собирает и перезапускает прод.
            -- Отмена требует участия раннера и относится к его плану.
            --
            -- Статус продукта проверяется ЗДЕСЬ, а не только в enqueue.
            -- Между постановкой хода и его забором проходит время: раннер мог
            -- лежать полчаса. Если за это время продукт перевели в stopped,
            -- выдавать по нему работу нельзя — агент будет править живой прод
            -- продукта, который считается выведенным из эксплуатации.
            JOIN products p ON p.id = t.product_id
           WHERE t.product_id = $1 AND t.status = 'queued'
             AND p.status = 'running' AND p.archived_at IS NULL
           -- ORDER BY здесь страховка, а не работающая логика: частичный
           -- уникальный индекс из Task 1 не допускает больше одной строки в
           -- ('queued','running') на продукт, значит сортировать нечего.
           -- Строка остаётся на случай ослабления предиката индекса.
           ORDER BY t.created_at
           -- OF t: блокируем только строку хода, не строку продукта.
           FOR UPDATE OF t SKIP LOCKED
           LIMIT 1
        )
        RETURNING id, prompt, user_id, revert_to_sha`,
      [productId],
    );
    return r.rows[0] ?? null;
  }

  /**
   * Тарифицируется только `done`. `failed` — работа не выполнена; `reverted` —
   * выполнена и тут же отменена автооткатом по health-check. В обоих случаях
   * клиент не получил результата и платить не должен. То же правило уже
   * действует при временном сбое связи с моделью в чате.
   */
  async complete(turnId: string, input: CompleteInput) {
    // `AND status = 'running'` делает финализацию переходом состояния, а не
    // перезаписью, и это обязательное условие, а не оптимизация.
    //
    // Маршрут завершения идёт с клиентской VM через интернет: таймаут чтения
    // ответа при успешно доставленном запросе — штатное событие, и раннер
    // обязан ретраить. Без сторожа повтор списывал бы токены второй раз за
    // тот же ход.
    //
    // Второй сценарий дороже: reapStuck (Task 10) переводит зависший ход в
    // `failed`, а опоздавший ответ раннера воскрешал бы его в `done` и брал
    // деньги за работу, за которую решили не брать.
    //
    // Транзакции здесь нет намеренно. `PgService.query` ходит через пул, а
    // `BEGIN` через пул на этом проекте уже давал код, рапортующий об откате,
    // которого не было. Сторож состояния даёт нужное свойство дешевле: повтор
    // становится безвредным no-op, а окно падения процесса превращается в
    // недобор («записано, но не списано»), а не в перебор. Недобор ловится
    // сверкой `tokens_spent` с `token_transactions`, перебор — только жалобой.
    const claimed = await this.pg.query(
      `UPDATE product_turns
          SET status = $3, result = $4, error = $5,
              sha_before = COALESCE($6, sha_before),
              sha_after = $7,
              tokens_spent = $8,
              finished_at = now()
        WHERE id = $1 AND product_id = $2 AND status = 'running'`,
      [
        turnId,
        input.productId,
        input.status,
        input.result ?? null,
        input.error ?? null,
        input.shaBefore ?? null,
        input.shaAfter ?? null,
        // Клампим: на колонке стоит CHECK (tokens_spent >= 0), а тело запроса
        // раннера типизировано TS-типом при ValidationPipe({whitelist:false}) —
        // рантайм-валидации нет. Раннер с tokens: -5 иначе получит 23514 наружу
        // необработанным 500, ход останется running, и мьютекс продержит продукт
        // до reapStuck через полчаса.
        input.status === 'done' ? Math.max(0, input.tokens ?? 0) : 0,
      ],
    );

    if (claimed.rowCount !== 1) {
      // Тихий успех для раннера здесь правильный — ретрай не должен получать
      // ошибку. Но в лог нужно писать то, что есть, а не догадку: `rowCount`
      // не единица наступает в трёх разных случаях, и только один из них
      // повтор. Битый `turnId` и ход, который раннер завершает не забрав,
      // означают сломанного раннера, получающего `{ok: true}` бесконечно.
      // `.catch` обязателен: эта ветка обслуживает штатный ретрай раннера и
      // бросать не имеет права. Без него кратковременный сбой базы превращает
      // повтор в 500, раннер повторяет, попадает туда же и получает 500 снова.
      // Диагностика не должна быть важнее того, что она диагностирует.
      const d = await this.pg
        .query(`SELECT status FROM product_turns WHERE id = $1`, [turnId])
        .catch(() => ({ rows: [] }) as any);
      const actual = d.rows[0]?.status;
      this.logger.warn(
        actual
          ? `complete: ход ${turnId} в статусе ${actual}, а не running — повтор проигнорирован`
          : `complete: ход ${turnId} не найден`,
      );
      return;
    }

    if (input.status === 'done' && (input.tokens ?? 0) > 0) {
      // deductTokens возвращает, сколько списалось ФАКТИЧЕСКИ — при нехватке
      // баланса меньше запрошенного, и её докблок прямо предлагает этим
      // числом воспользоваться. Пишем его обратно: иначе история в кабинете
      // покажет пользователю расход, которого с него не взяли.
      const used = await this.misc.deductTokens(
        input.userId,
        Math.max(0, input.tokens!),
        `product turn ${turnId}`,
      );
      if (used !== input.tokens) {
        await this.pg.query(`UPDATE product_turns SET tokens_spent = $2 WHERE id = $1`, [turnId, used]);
      }
    }
  }
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/products/turns.lifecycle.spec.ts`
Expected: PASS, 6 тестов

- [ ] **Step 5: Прогнать сторож балансовых записей**

Run: `npx jest src/tokens/balance-writes.guard.spec.ts`
Expected: PASS — новый код не содержит прямых `tokens = tokens ± N`

- [ ] **Step 6: Коммит**

```bash
git add src/products/turns.service.ts src/products/turns.lifecycle.spec.ts
git commit -m "feat(products): выдача задания раннеру и финализация хода"
```

---

### Task 5: Откат хода

**Files:**
- Modify: `src/products/turns.service.ts`
- Test: `src/products/turns.revert.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/products/turns.revert.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { TurnsService } from './turns.service';

function makeService(target: any) {
  const calls: { sql: string; params: any[] }[] = [];
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id, sha_before')) return { rows: target ? [target] : [] };
      if (sql.includes('INSERT INTO product_turns')) return { rows: [{ id: 't-revert', status: 'queued' }] };
      return { rows: [] };
    }),
  };
  const redis = { rpush: jest.fn(), expire: jest.fn(), lrange: jest.fn(async () => []) };
  return { svc: new TurnsService(pg as any, { deductTokens: jest.fn() } as any, redis as any), calls };
}

describe('TurnsService.revert', () => {
  it('ставит служебный ход отката на sha_before выбранного хода', async () => {
    const { svc, calls } = makeService({ id: 't-1', sha_before: 'aaa111' });

    // Возврат идёт наружу: Task 8 отдаёт его клиенту как `202 + тело`, и без
    // него кнопка «откат поставлен» не покажет поставленный ход.
    await expect(svc.revert({ productId: 'p-1', turnId: 't-1', userId: 'u-1' })).resolves.toMatchObject({
      id: 't-revert',
    });

    const insert = calls.find((c) => c.sql.includes('INSERT INTO product_turns'))!;
    // Точка возврата уезжает отдельной колонкой, а не подстрокой в prompt.
    // Это и есть защита от подделки отката через обычный чат.
    expect(insert.params[4]).toBe('aaa111');
    // Что именно revert передаёт в enqueue, охраняется отдельно. Без этого
    // опечатка `productId: input.turnId` вставит turnId в колонку product_id:
    // ход повиснет на несуществующем продукте, а мьютекс займёт не тот. И без
    // проверки channel подмена на значение вне CHECK (channel IN
    // ('web','telegram')) даст 500 на живой базе, но зелёный юнит-прогон.
    expect(insert.params.slice(0, 3)).toEqual(['p-1', 'u-1', 'web']);
    // Ход ищется в пределах своего продукта. Без product_id в WHERE клиент
    // откатит чужой продукт на его же sha, передав чужой turnId — владение
    // проверено на уровне продукта, а сам ход взят по голому id.
    const select = calls.find((c) => c.sql.includes('SELECT id, sha_before'))!;
    expect(select.sql).toContain('product_id = $2');
  });

  it('ход без sha_before откатить нельзя', async () => {
    const { svc } = makeService({ id: 't-1', sha_before: null });

    await expect(svc.revert({ productId: 'p-1', turnId: 't-1', userId: 'u-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('несуществующий ход не откатывается', async () => {
    const { svc } = makeService(null);

    await expect(svc.revert({ productId: 'p-1', turnId: 'nope', userId: 'u-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/products/turns.revert.spec.ts`
Expected: FAIL — `svc.revert is not a function`

- [ ] **Step 3: Реализовать**

Добавить в `src/products/turns.service.ts` (импорт `BadRequestException`):

```ts
  /**
   * Откат оформляется обычным ходом со специальным prompt'ом: тот же путь
   * reset → build → restart → health на стороне раннера, та же строка в
   * истории. История остаётся линейной, откат отката работает без отдельного
   * кода. Замок product_turns_one_active работает и здесь — откатить посреди
   * живого хода нельзя.
   */
  async revert(input: { productId: string; turnId: string; userId: string }) {
    const r = await this.pg.query(
      `SELECT id, sha_before FROM product_turns
        WHERE id = $1 AND product_id = $2`,
      [input.turnId, input.productId],
    );
    const target = r.rows[0];
    if (!target) throw new BadRequestException('Ход не найден');
    if (!target.sha_before) throw new BadRequestException('У этого хода нет точки возврата');

    return this.enqueue({
      productId: input.productId,
      userId: input.userId,
      channel: 'web',
      // prompt человекочитаемый и годится для показа в истории как есть.
      // Признак отката несёт отдельная колонка: строковый префикс внутри
      // prompt подделывался бы обычным запросом в чат — тот передаёт тело
      // пользователя в enqueue без разбора, а sha пользователь знает из
      // истории. Плюс префикс пришлось бы парсить раннеру из другого
      // репозитория, и расхождение прошло бы молча.
      prompt: `Откат к ${target.sha_before}`,
      revertToSha: target.sha_before,
    });
  }
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/products/turns.revert.spec.ts`
Expected: PASS, 3 теста

- [ ] **Step 5: Коммит**

```bash
git add src/products/turns.service.ts src/products/turns.revert.spec.ts
git commit -m "feat(products): откат хода служебным ходом на sha_before"
```

---

## Часть C. HTTP-слой

### Task 6: Аутентификация раннера

**Files:**
- Create: `src/products/runner.guard.ts`
- Test: `src/products/runner.guard.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/products/runner.guard.spec.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { RunnerGuard } from './runner.guard';

const TOKEN = 'runner-secret-token';
const HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');

function makeContext(header?: string) {
  const req: any = { headers: header ? { authorization: header } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    __req: req,
  } as any;
}

function makeGuard(rows: any[]) {
  const pg = { query: jest.fn(async () => ({ rows })) };
  return { guard: new RunnerGuard(pg as any), pg };
}

describe('RunnerGuard', () => {
  it('пропускает раннера с валидным токеном и кладёт продукт в запрос', async () => {
    const { guard } = makeGuard([{ id: 'p-1', checkout_path: '/home/dv/selyanska' }]);
    const ctx = makeContext(`Bearer ${TOKEN}`);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.__req.product).toMatchObject({ id: 'p-1' });
  });

  it('ищет по хешу, а не по самому токену', async () => {
    const { guard, pg } = makeGuard([{ id: 'p-1' }]);

    await guard.canActivate(makeContext(`Bearer ${TOKEN}`));

    // Оба утверждения нужны. Мок отдаёт rows независимо от sql, поэтому одна
    // проверка параметров зафиксировала бы лишь форму вызова: запрос без
    // `WHERE runner_token_hash = $1` прошёл бы тест насквозь.
    expect(pg.query.mock.calls[0][0]).toContain('runner_token_hash = $1');
    // Раннер архивного продукта должен терять доступ вместе с архивацией,
    // иначе он продолжит забирать задания и править чекаут выведенного из
    // эксплуатации продукта.
    expect(pg.query.mock.calls[0][0]).toContain('archived_at IS NULL');
    expect(pg.query.mock.calls[0][1]).toEqual([HASH]);
  });

  it('без заголовка — 401', async () => {
    // Мок отдаёт НЕпустые rows намеренно. С пустыми тест носил бы имя одной
    // защиты, а держался на другой: пустой токен дошёл бы до запроса, ничего
    // не нашёл, и сработал бы второй страж `if (!r.rows[0])`. Исключение
    // вылетело бы всё равно — и снятие ранней проверки `!token` осталось бы
    // незамеченным. С непустыми rows такая мутация даёт resolves(true), то
    // есть тест ловит ровно ту защиту, которую называет.
    const { guard } = makeGuard([{ id: 'p-1' }]);

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('заголовок без префикса Bearer не принимается', async () => {
    // Утверждение явное, потому что иначе эта мутация ловится случайно: без
    // разбора префикса в хеш уходит вся строка целиком, значение расходится с
    // константой HASH, и тест краснеет по совпадению, а не по замыслу.
    //
    // Разбор регистрозависимый. RFC 7235 объявляет схему авторизации
    // регистронезависимой, то есть мы строже стандарта — это осознанно:
    // раннера пишем мы сами, и заголовок формирует наш же код.
    const { guard } = makeGuard([{ id: 'p-1' }]);

    await expect(guard.canActivate(makeContext(TOKEN))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('неизвестный токен — 401', async () => {
    const { guard } = makeGuard([]);

    await expect(guard.canActivate(makeContext('Bearer wrong'))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/products/runner.guard.spec.ts`
Expected: FAIL — `Cannot find module './runner.guard'`

- [ ] **Step 3: Реализовать**

`src/products/runner.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PgService } from '../common/services/pg.service';

/**
 * Раннер живёт на клиентской VM и приходит с per-product токеном. JwtGuard
 * здесь не подходит: у раннера нет пользователя, он представляет продукт.
 *
 * В базе лежит только sha256 токена — утечка дампа не даёт доступа к VM.
 */
@Injectable()
export class RunnerGuard implements CanActivate {
  constructor(private readonly pg: PgService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const raw = String(req.headers['authorization'] ?? '');
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    if (!token) throw new UnauthorizedException('Missing runner token');

    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const r = await this.pg.query(
      `SELECT id, user_id, checkout_path, build_cmd, restart_cmd, health_url,
              repo_url, claude_session_id
         FROM products
        WHERE runner_token_hash = $1 AND archived_at IS NULL`,
      [hash],
    );
    if (!r.rows[0]) throw new UnauthorizedException('Unknown runner token');

    req.product = r.rows[0];
    return true;
  }
}
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/products/runner.guard.spec.ts`
Expected: PASS, 4 теста

- [ ] **Step 5: Коммит**

```bash
git add src/products/runner.guard.ts src/products/runner.guard.spec.ts
git commit -m "feat(products): аутентификация раннера по per-product токену"
```

---

### Task 7: Маршруты раннера

**Files:**
- Create: `src/products/runner.controller.ts`
- Modify: `src/products/turns.service.ts` (добавить `touchRunner`)
- Test: `src/products/runner.controller.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/products/runner.controller.spec.ts`:

```ts
import { RunnerController } from './runner.controller';

function makeController(claimResult: any) {
  const turns = {
    claimNext: jest.fn(async () => claimResult),
    complete: jest.fn(async () => undefined),
    touchRunner: jest.fn(async () => undefined),
  };
  const turnEvents = { appendEvent: jest.fn(async () => undefined) };
  return { ctrl: new RunnerController(turns as any, turnEvents as any), turns, turnEvents };
}

// Фикстура повторяет то, что кладёт в запрос RunnerGuard — всю строку
// продукта. Именно поэтому маршрут обязан собирать ответ явным списком.
const req = (
  product: any = {
    id: 'p-1',
    user_id: 'u-1',
    checkout_path: '/srv/app',
    build_cmd: 'npm run build',
    restart_cmd: 'pm2 restart web',
    health_url: 'https://x/api/healthz',
    repo_url: null,
    claude_session_id: null,
  },
) => ({ product });

describe('RunnerController.poll', () => {
  it('отдаёт задание вместе с контекстом продукта', async () => {
    const { ctrl } = makeController({
      id: 't-1',
      prompt: 'поправь футер',
      user_id: 'u-1',
      revert_to_sha: null,
    });

    const res = await ctrl.poll(req() as any);

    expect(res).toMatchObject({
      turn: { id: 't-1', prompt: 'поправь футер' },
      product: { checkoutPath: '/srv/app' },
    });

    // Набор ключей проверяется точно, а не toMatchObject. Guard кладёт в
    // req.product всю строку продукта, включая user_id и claude_session_id;
    // маршрут, пробросивший её целиком или получивший новое поле в guard,
    // отдал бы раннеру лишнее — и этот тест это заметит.
    expect(Object.keys(res.product).sort()).toEqual(
      ['buildCmd', 'checkoutPath', 'claudeSessionId', 'healthUrl', 'repoUrl', 'restartCmd'].sort(),
    );
    expect(Object.keys(res.turn!).sort()).toEqual(['id', 'prompt', 'revertToSha', 'userId'].sort());
  });

  it('heartbeat пишется до выдачи задания, а не после', async () => {
    // Порядок наблюдаем, а не косметичен. Если продукт в degraded, touchRunner
    // возвращает его в running — и claimNext, отбирающий только по
    // p.status = 'running', выдаст ход в том же цикле. Обратный порядок отдал
    // бы turn: null, и работа поехала бы только следующим опросом.
    const { ctrl, turns } = makeController(null);

    await ctrl.poll(req() as any);

    expect(turns.touchRunner.mock.invocationCallOrder[0]).toBeLessThan(
      turns.claimNext.mock.invocationCallOrder[0],
    );
  });

  it('пустая очередь — turn: null, а не ошибка', async () => {
    const { ctrl } = makeController(null);

    await expect(ctrl.poll(req() as any)).resolves.toMatchObject({ turn: null });
  });

  it('каждый опрос обновляет heartbeat, даже когда заданий нет', async () => {
    const { ctrl, turns } = makeController(null);

    await ctrl.poll(req() as any);

    // Признак живости не должен зависеть от того, случился ли ход: алерт,
    // опирающийся на запись, которую не делает путь ошибки, залипает.
    expect(turns.touchRunner).toHaveBeenCalledWith('p-1');
  });
});

describe('RunnerController.complete', () => {
  it('передаёт исход хода в сервис', async () => {
    const { ctrl, turns } = makeController(null);

    await ctrl.complete(req() as any, 't-1', {
      status: 'done',
      result: 'готово',
      shaBefore: 'aaa',
      shaAfter: 'bbb',
      tokens: 1500,
    } as any);

    // productId берётся из req.product, а не из тела или URL: guard знает,
    // каким продуктом является раннер, но не то, что turnId принадлежит ему.
    expect(turns.complete).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ status: 'done', tokens: 1500, productId: 'p-1', userId: 'u-1' }),
    );
  });

  it('productId из тела запроса игнорируется', async () => {
    // Раннер продукта A не должен уметь адресоваться к продукту B, дописав
    // поле в тело. ValidationPipe стоит с whitelist: false и лишнее не срежет.
    const { ctrl, turns } = makeController(null);

    await ctrl.complete(req() as any, 't-1', { status: 'done', productId: 'p-999' } as any);

    expect(turns.complete).toHaveBeenCalledWith('t-1', expect.objectContaining({ productId: 'p-1' }));
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/products/runner.controller.spec.ts`
Expected: FAIL — `Cannot find module './runner.controller'`

- [ ] **Step 3: Добавить `touchRunner` в сервис**

В `src/products/turns.service.ts`:

```ts
  /**
   * Отметка прогресса идущего хода — единственный доступный сборщику признак
   * его жизни. `runner_seen_at` здесь не годится: во время выполнения раннер
   * не опрашивает, он работает, и отметка живости продукта не двигается.
   *
   * Запись условная по тем же соображениям, что у heartbeat: события идут
   * пачками по несколько раз в секунду, а сборщику хватает разрешения в
   * десятки секунд.
   *
   * `product_id` в условии — не защита (её даёт ключ буфера по конструкции),
   * а корректность: чужой ход не должен получать отметку жизни.
   */
  async markProgress(turnId: string, productId: string) {
    await this.pg.query(
      `UPDATE product_turns
          SET last_progress_at = now()
        WHERE id = $1 AND product_id = $2
          AND (last_progress_at IS NULL OR last_progress_at < now() - interval '30 seconds')`,
      [turnId, productId],
    );
  }

  /**
   * Heartbeat раннера. Пишется на каждом опросе, независимо от наличия хода.
   *
   * Заодно снимает `degraded`. Этот статус ставит мониторинг, когда раннер
   * долго молчит, — и без обратного перехода он тупик: раннер оживёт, будет
   * слать heartbeat, а продукт останется навсегда «нет связи», причём
   * `claimNext` перестанет выдавать ему работу. Опрос и есть доказательство
   * живости, поэтому снимать признак должен он.
   *
   * Остальные статусы не трогаются: `stopped` и `archived` — решение
   * владельца, и heartbeat его не отменяет.
   */
  async touchRunner(productId: string) {
    await this.pg.query(
      `UPDATE products
          SET runner_seen_at = now(),
              status = CASE WHEN status = 'degraded' THEN 'running' ELSE status END
        WHERE id = $1
          -- Запись условная. Без этого heartbeat пишет в одну и ту же строку
          -- каждые три секунды на каждый продукт независимо от наличия работы.
          -- Колонки runner_seen_at и status не проиндексированы, поэтому
          -- обновления идут HOT и катастрофы с вакуумом не будет, но два
          -- десятка записей в минуту ни за чем не нужны. Третье условие
          -- сохраняет мгновенное восстановление из degraded.
          --
          -- Требование: порог алерта «нет связи» обязан быть заметно больше
          -- 30 секунд, иначе продукт будет мигать между статусами.
          AND (runner_seen_at IS NULL
               OR runner_seen_at < now() - interval '30 seconds'
               OR status = 'degraded')`,
      [productId],
    );
  }
```

- [ ] **Step 3б: Тест на heartbeat**

В `src/products/turns.lifecycle.spec.ts`:

```ts
describe('TurnsService.touchRunner', () => {
  it('heartbeat снимает degraded и не трогает остальные статусы', async () => {
    // Без обратного перехода degraded — тупик: мониторинг его ставит, никто
    // не снимает, и продукт навсегда остаётся «нет связи» и без работы,
    // потому что claimNext отбирает только по p.status = 'running'.
    const { svc, calls } = makeService();

    await svc.touchRunner('p-1');

    expect(calls[0].sql).toContain('runner_seen_at = now()');
    // Два узких утверждения вместо одного точного сравнения всего выражения:
    // то было бы привязано к форматированию — перенос строки или лишний
    // пробел ронял бы тест, ничего не сломав. Здесь два разных обещания:
    // срабатывает только на degraded, и всё остальное сохраняется как было.
    expect(calls[0].sql).toContain("WHEN status = 'degraded'");
    expect(calls[0].sql).toContain('ELSE status END');
    // Условная запись — иначе два десятка записей в минуту на продукт.
    expect(calls[0].sql).toContain("interval '30 seconds'");
    // Третье условие ускоряет восстановление: без него продукт, помеченный
    // degraded при свежей отметке, ждал бы истечения порога.
    expect(calls[0].sql).toContain("OR status = 'degraded'");
    expect(calls[0].sql).toContain('WHERE id = $1');
    expect(calls[0].params).toEqual(['p-1']);
  });
});
```

Настоящая граница «heartbeat не отменяет решение владельца» юнитом не проверяется — мок не хранит состояние строки. Её доказывает живая проверка из Task 11: heartbeat на `stopped` не воскрешает продукт, на `degraded` возвращает в `running`.

- [ ] **Step 4: Написать контроллер**

`src/products/runner.controller.ts`:

```ts
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RunnerGuard } from './runner.guard';
import { TurnsService, CompleteInput } from './turns.service';
import { TurnEventsService } from './turn-events.service';

@Controller('')
@UseGuards(RunnerGuard)
export class RunnerController {
  constructor(
    private readonly turns: TurnsService,
    private readonly turnEvents: TurnEventsService,
  ) {}

  /**
   * Long-poll раннера. Возвращает задание либо turn: null. Раннер зовёт этот
   * маршрут по кругу; соединение инициирует VM, поэтому бэкенд не хранит
   * SSH-ключей от клиентских машин и не зависит от их белого IP.
   */
  @Post('products/runner/poll')
  async poll(@Req() req: any) {
    const product = req.product;
    await this.turns.touchRunner(product.id);

    const turn = await this.turns.claimNext(product.id);
    return {
      turn: turn
        ? {
            id: turn.id,
            prompt: turn.prompt,
            userId: turn.user_id,
            // Раннер читает поле, а не парсит префикс промпта: контракт между
            // двумя репозиториями не должен быть строковым.
            revertToSha: turn.revert_to_sha,
          }
        : null,
      product: {
        checkoutPath: product.checkout_path,
        buildCmd: product.build_cmd,
        restartCmd: product.restart_cmd,
        healthUrl: product.health_url,
        repoUrl: product.repo_url,
        claudeSessionId: product.claude_session_id,
      },
    };
  }

  /**
   * `productId` и `userId` берутся ИСКЛЮЧИТЕЛЬНО из `req.product`, который
   * положил `RunnerGuard`. Ничего из тела и URL, кроме `turnId`, доверять
   * нельзя: guard подтверждает, каким продуктом является раннер, но не то,
   * что переданный `turnId` принадлежит этому продукту.
   *
   * `Omit` здесь не защита, а документация: `ValidationPipe` поднят с
   * `whitelist: false`, TS-типы в рантайме не существуют, и лишние поля из
   * тела дошли бы до сервиса. Спасает то, что `complete` собирает параметры
   * явным списком.
   */
  @Post('products/runner/turns/:id/complete')
  async complete(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: Omit<CompleteInput, 'userId' | 'productId'>,
  ) {
    await this.turns.complete(id, {
      ...body,
      productId: req.product.id,
      userId: req.product.user_id,
    });
    return { ok: true };
  }
}
```

- [ ] **Step 5: Прогнать тест, убедиться что проходит**

Run: `npx jest src/products/runner.controller.spec.ts`
Expected: PASS, 6 тестов

- [ ] **Step 6: Коммит**

```bash
git add src/products/runner.controller.ts src/products/turns.service.ts src/products/runner.controller.spec.ts
git commit -m "feat(products): long-poll и финализация хода для раннера"
```

---

### Task 8: Клиентские маршруты и стриминг

**Files:**
- Create: `src/products/turn-events.service.ts`
- Create: `src/products/products.controller.ts`
- Modify: `src/products/turns.service.ts` (добавить `history`, **убрать `RedisService` из конструктора**)
- Modify: `src/products/runner.controller.ts` (маршрут событий)
- Test: `src/products/turn-events.spec.ts`, `src/products/products.controller.spec.ts`

Стриминг устроен так: раннер шлёт события в `POST /products/runner/turns/:id/events`, бэкенд складывает их в Redis-список, а клиентский `POST /products/:id/chat` читает оттуда и отдаёт NDJSON. Так ход переживает обрыв клиентского соединения — клиент переподключается и дочитывает.

**Буфер событий живёт в отдельном сервисе, а не в `TurnsService`.** Решение откладывалось до этой задачи и принимается здесь по зависимости, а не по числу строк: буфер — единственный потребитель `RedisService`, и продуктовый ключ сделал его самодостаточным (ему не нужен ни один метод `TurnsService`). Оставить его в общем файле означало бы, что `TurnsService` зависит от Postgres и Redis по двум несвязанным причинам.

Побочно это чинит уже существующий дефект: `RedisService` лежит в конструкторе `TurnsService` с Task 3 и **не используется ни разу** — `this.redis` не встречается в файле. Задел, который так и не понадобился. Убираем оттуда, а тестовые фабрики в `turns.enqueue.spec.ts`, `turns.lifecycle.spec.ts` и `turns.revert.spec.ts` перестают его подсовывать.

- [ ] **Step 1: Написать падающий тест**

`src/products/products.controller.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { ProductsController } from './products.controller';

// Минимальный req: нужен только обработчик 'close', которым маршрут узнаёт
// об обрыве клиента.
function makeReq() {
  const handlers: Record<string, (() => void)[]> = {};
  return {
    on: (event: string, fn: () => void) => {
      (handlers[event] ??= []).push(fn);
    },
    fireClose: () => (handlers['close'] ?? []).forEach((fn) => fn()),
  };
}

function makeRes() {
  const chunks: string[] = [];
  return {
    chunks,
    setHeader: jest.fn(),
    write: jest.fn((s: string) => { chunks.push(s); return true; }),
    end: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function makeController(events: any[]) {
  const products = {
    list: jest.fn(async () => [{ id: 'p-1', name: 'selyanska' }]),
    getOwned: jest.fn(async () => ({ id: 'p-1', name: 'selyanska' })),
  };
  const turns = {
    enqueue: jest.fn(async () => ({ id: 't-1' })),
    history: jest.fn(async () => []),
    revert: jest.fn(async () => ({ id: 't-revert' })),
  };
  const turnEvents = {
    readEvents: jest.fn(async function* () { for (const e of events) yield e; }),
  };
  return {
    ctrl: new ProductsController(products as any, turns as any, turnEvents as any),
    products,
    turns,
    turnEvents,
  };
}

const user = { userId: 'u-1' };

describe('ProductsController.chat', () => {
  it('отдаёт NDJSON тем же протоколом, что и чат с ассистентами', async () => {
    const { ctrl } = makeController([
      { type: 'begin' },
      { type: 'item', content: 'правлю футер' },
      { type: 'end' },
    ]);
    const res = makeRes();

    await ctrl.chat(user, 'p-1', { prompt: 'поправь футер' } as any, makeReq() as any, res as any);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    const lines = res.chunks.join('').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(['begin', 'item', 'end']);
  });

  it('проверяет владение продуктом до постановки хода', async () => {
    const { ctrl, products, turns } = makeController([{ type: 'end' }]);

    await ctrl.chat(user, 'p-1', { prompt: 'go' } as any, makeReq() as any, makeRes() as any);

    expect(products.getOwned).toHaveBeenCalledWith('p-1', 'u-1');
    expect(products.getOwned.mock.invocationCallOrder[0]).toBeLessThan(
      turns.enqueue.mock.invocationCallOrder[0],
    );
  });
});

describe('ProductsController.chat — защита от подделки отката', () => {
  it('revertToSha из тела запроса не доезжает до enqueue', async () => {
    // Контроллер обязан перечислять поля явно. Написанный как
    // `enqueue({ ...body, productId: id, userId })` он вернул бы дыру:
    // ValidationPipe стоит с whitelist: false и лишние поля из тела не
    // срезает, а признак отката — это право сбросить прод клиента на
    // произвольный коммит мимо всех проверок revert().
    const { ctrl, turns } = makeController([{ type: 'end' }]);

    await ctrl.chat(user, 'p-1', { prompt: 'go', revertToSha: 'deadbeef' } as any, makeReq() as any, makeRes() as any);

    expect(turns.enqueue).toHaveBeenCalledWith(
      expect.not.objectContaining({ revertToSha: expect.anything() }),
    );
  });
});

describe('ProductsController — привязка отмены', () => {
  it('обрыв клиента виден генератору, а не только внешней проверке', async () => {
    // Внешний `if (clientGone) break` работает, только пока идут события,
    // поэтому все тесты на обрыв проходят и с отвязанным предикатом:
    // подмена `() => clientGone` на `() => false` оставляла набор зелёным и
    // молча возвращала дыру. Заглушка ниже не отдаёт ничего — значит внешняя
    // проверка не сработает никогда, и связка держится только на предикате.
    const { ctrl, turnEvents } = makeController([]);
    let captured: (() => boolean) | undefined;
    turnEvents.readEvents = jest.fn((_p: any, _t: any, isCancelled: () => boolean) => {
      captured = isCancelled;
      return (async function* () {})();
    }) as any;

    const req = makeReq();
    await ctrl.chat(user, 'p-1', { prompt: 'go' } as any, req as any, makeRes() as any);
    req.fireClose();

    expect(captured).toBeDefined();
    expect(captured!()).toBe(true);
  });
});

describe('ProductsController.revert', () => {
  it('проверяет владение и ставит откат', async () => {
    const { ctrl, products, turns } = makeController([]);
    const res = makeRes();

    await ctrl.revert(user, 'p-1', 't-1', res as any);

    expect(products.getOwned).toHaveBeenCalledWith('p-1', 'u-1');
    expect(turns.revert).toHaveBeenCalledWith({ productId: 'p-1', turnId: 't-1', userId: 'u-1' });
  });
});

describe('ProductsController.history', () => {
  it('чужой продукт не отдаёт историю', async () => {
    // Проверка порядка через invocationCallOrder здесь недостаточна: она
    // фиксирует момент ОБРАЩЕНИЯ к getOwned, а не его завершения, поэтому
    // потеря `await` её не роняет. А без await отказ всплывает уже после
    // того, как история прочитана и отдана.
    //
    // Этот тест проверяет саму гарантию: если владение не подтверждено,
    // history не должен быть вызван вовсе.
    const { ctrl, products, turns } = makeController([]);
    products.getOwned.mockRejectedValue(new NotFoundException('Product not found'));

    await expect(ctrl.history(user, 'p-1', makeRes() as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(turns.history).not.toHaveBeenCalled();
  });

  it('своя история читается с владельцем в запросе', async () => {
    const { ctrl, turns } = makeController([]);

    await ctrl.history(user, 'p-1', makeRes() as any);

    // userId уезжает в сервис второй линией защиты — одной контроллерной
    // проверки мало, см. комментарий в TurnsService.history.
    expect(turns.history).toHaveBeenCalledWith('p-1', 'u-1');
  });
});

describe('ProductsController.chat — владение и обрыв', () => {
  it('чужой продукт не ставит ход', async () => {
    const { ctrl, products, turns } = makeController([{ type: 'end' }]);
    products.getOwned.mockRejectedValue(new NotFoundException('Product not found'));

    await expect(
      ctrl.chat(user, 'p-1', { prompt: 'go' } as any, makeReq() as any, makeRes() as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(turns.enqueue).not.toHaveBeenCalled();
  });

it('обрыв клиента прекращает чтение потока', async () => {
    // ВАЖНО (отклонение от синхронного fireClose сразу после вызова chat()):
    // getOwned() и enqueue() внутри chat() — обе async-функции без внутренних
    // await, но `await` в самом chat() всё равно требует минимум один тик
    // микрозадач на каждую, чтобы продолжить выполнение. req.on('close', ...)
    // регистрируется только ПОСЛЕ обеих. Синхронный `req.fireClose()` сразу
    // после `ctrl.chat(...)` (как в первой версии этого теста) стабильно
    // ничего не обрывает — обработчик ещё не зарегистрирован, — и тест
    // одинаково "проходил" бы что с проверкой clientGone, что без неё.
    //
    // Вместо подсчёта тиков привязываем обрыв к наблюдаемому событию: клиент
    // исчезает сразу после получения первого чанка. Это не только надёжнее
    // (не зависит от числа await до регистрации обработчика), но и ближе к
    // реальности — соединение рвётся уже во время стрима, а не до его начала.
    const { ctrl } = makeController([
      { type: 'begin' },
      { type: 'item', content: 'первый' },
      { type: 'item', content: 'второй' },
      { type: 'end' },
    ]);
    const req = makeReq();
    const res = makeRes();
    res.write.mockImplementationOnce((s: string) => {
      res.chunks.push(s);
      req.fireClose();
      return true;
    });

    await ctrl.chat(user, 'p-1', { prompt: 'go' } as any, req as any, res as any);

    const types = res.chunks.join('').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).type);
    expect(types).toEqual(['begin']);
    // Обрыв не просто прекращает запись — res.end() тоже не должен звонить
    // в уже закрытый сокет.
    expect(res.end).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/products/products.controller.spec.ts`
Expected: FAIL — `Cannot find module './products.controller'`

- [ ] **Step 3о: Дописать `rpush` и `lrange` в `RedisService`**

**Их там нет.** `src/common/services/redis.service.ts` умеет `get/set/del/exists/incr/expire/keys` и не отдаёт наружу сырой клиент — списочных операций в нём не существует, значит буфер написать не на чем. Заглушки `redis` в тестах Task 3–7 описывали API, которого не было: их писали, не проверив сервис.

Добавить двумя тонкими обёртками в стиле соседних методов, только добавление:

```ts
  /** Добавляет значение в конец списка. Нужно буферу событий хода (products). */
  async rpush(key: string, value: string): Promise<number> {
    return this.client.rpush(key, value);
  }

  /** Диапазон списка включительно, как в ioredis/Redis (`-1` — последний элемент). */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }
```

Это общий файл, которым пользуется десяток модулей. Правка обязана быть чисто аддитивной — существующие методы не трогать.

- [ ] **Step 3: Создать сервис буфера событий**

Тест к этому сервису обязан начинаться с низкого таймаута:

```ts
// Регрессия, потерявшая условие выхода из readEvents, не даёт осмысленного
// падения: генератор уходит в бесконечный поллинг с реальными setTimeout, и
// прогон виснет вместо красного assert'а. Низкий таймаут превращает зависание
// в быстрый понятный отказ.
jest.setTimeout(2000);
```

`src/products/turn-events.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { RedisService } from '../common/services/redis.service';

/**
 * Буфер событий хода. Отдельный сервис, а не метод `TurnsService`: это
 * единственный потребитель Redis, и продуктовый ключ сделал его
 * самодостаточным — ни один метод жизненного цикла хода ему не нужен.
 */
@Injectable()
export class TurnEventsService {
  constructor(
    private readonly pg: PgService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Продукт в ключе — это ограничение по конструкции, а не проверка.
   *
   * Клиент дочитывает поток по своему маршруту и составляет ключ из своих же
   * параметров, поэтому до чужого хода не дотянется в принципе. Раннер,
   * пославший события не в тот ход, пишет в ключ, который никто не читает.
   * Проверять нечего и забыть нечего — в отличие от варианта с явной
   * проверкой принадлежности на каждом маршруте.
   */
  private eventsKey(productId: string, turnId: string) {
    return `product:${productId}:turn:${turnId}:events`;
  }

  /** Раннер шлёт сюда события хода; живут час — этого хватает на дочитывание. */
  async appendEvent(productId: string, turnId: string, event: any) {
    // Тело маршрута раннера типизировано TS-типом при ValidationPipe с
    // whitelist: false — рантайм-проверки нет. `{"events":[null]}` положил бы
    // в буфер строку "null", а на чтении `event.type` дал бы TypeError уже
    // ПОСЛЕ отправки заголовков: клиент увидел бы обрыв сокета без события
    // error. Отбрасываем то, что событием быть не может.
    if (!event || typeof event !== 'object') return;

    const key = this.eventsKey(productId, turnId);
    await this.redis.rpush(key, JSON.stringify(event));
    await this.redis.expire(key, 3600);
  }

  /**
   * Читает события хода по мере поступления. Завершается на `end` или `error`,
   * либо когда ход в базе уже не `running` — иначе клиент повиснет навсегда,
   * если раннер умер, не дописав финальное событие.
   */
  async *readEvents(
    productId: string,
    turnId: string,
    isCancelled: () => boolean = () => false,
  ): AsyncGenerator<any> {
    const key = this.eventsKey(productId, turnId);
    let cursor = 0;
    // 1800 тиков по 500 мс = 15 минут. Порог ПАРНЫЙ к сборщику зависших в
    // TurnsService.reapStuck (30 минут): читатель обязан сдаваться раньше,
    // чем ход помечается неудачным, иначе клиент получит два терминальных
    // события подряд. Менять только вместе.
    for (let tick = 0; tick < 1800; tick++) {
      // Признак отмены проверяется ВНУТРИ цикла, а не снаружи в `for await`.
      // Снаружи он бесполезен ровно в том случае, ради которого нужен: пока
      // событий нет, генератор не доходит до yield, управление в контроллер
      // не возвращается, и проверять флаг некому. А клиент отваливается чаще
      // всего именно в тишине — агент думает, ответа нет минуту, пользователь
      // закрывает вкладку. Брошенное соединение иначе стоит до 1800 тиков по
      // паре запросов, то есть трёх с половиной тысяч обращений к Redis и
      // Postgres, и всё это время занят воркер.
      if (isCancelled()) return;

      const batch = await this.redis.lrange(key, cursor, -1);
      for (const raw of batch) {
        cursor++;
        const event = JSON.parse(raw);
        yield event;
        if (event?.type === 'end' || event?.type === 'error') return;
      }

      const r = await this.pg.query(`SELECT status FROM product_turns WHERE id = $1`, [turnId]);
      const status = r.rows[0]?.status;
      if (status && status !== 'queued' && status !== 'running') {
        // Финальный дренаж перед выходом. События, дописанные между lrange
        // выше и этим запросом, иначе не прочитаются никогда: генератор
        // завершится, не заглянув в буфер повторно, и клиент получит `end` с
        // обрезанным хвостом. Итог правки останется в истории, а из живого
        // потока пропадёт молча.
        for (const raw of await this.redis.lrange(key, cursor, -1)) {
          cursor++;
          const event = JSON.parse(raw);
          yield event;
          // Своего `end` достаточно. Без этой проверки дренаж отдаёт хвост и
          // следом добавляет синтетический `end` — а хвост, ради которого он
          // написан, это последние события раннера, который завершает поток
          // именно `end`. То есть штатное срабатывание давало бы дубль
          // терминального события, и обработчик завершения на клиенте
          // отрабатывал бы дважды.
          if (event?.type === 'end' || event?.type === 'error') return;
        }
        yield { type: 'end' };
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    yield { type: 'error', message: 'Ход не завершился за отведённое время' };
  }
}
```

- [ ] **Step 3б: Убрать `RedisService` из `TurnsService`**

Он лежит в конструкторе с Task 3 и не используется ни разу — проверяется командой `grep -c 'this.redis' src/products/turns.service.ts`, должно быть `0` до правки.

Убрать параметр из конструктора и импорт. Затем убрать заглушку `redis` из фабрик в `turns.enqueue.spec.ts`, `turns.lifecycle.spec.ts`, `turns.revert.spec.ts` — конструктор станет двухаргументным.

Прогнать `npx jest src/products` — все существующие тесты обязаны остаться зелёными. Если что-то падает, значит зависимость всё-таки использовалась и надо разбираться, а не подгонять.

- [ ] **Step 3в: Добавить историю в `TurnsService`**

В `src/products/turns.service.ts`:

```ts
  /**
   * Продукт в ключе — это ограничение по конструкции, а не проверка.
   *
   * Клиент дочитывает поток по своему маршруту и составляет ключ из своих же
   * параметров, поэтому до чужого хода не дотянется в принципе. Раннер,
   * пославший события не в тот ход, пишет в ключ, который никто не читает.
   * Проверять нечего и забыть нечего — в отличие от варианта с явной
   * проверкой принадлежности на каждом маршруте.
   */
  async history(productId: string) {
    const r = await this.pg.query(
      `SELECT id, channel, prompt, result, status, sha_before, sha_after,
              revert_to_sha, tokens_spent, error, created_at, finished_at
         FROM product_turns
        WHERE product_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [productId],
    );
    return r.rows;
  }
```

- [ ] **Step 4: Написать контроллер**

`src/products/products.controller.ts`:

```ts
import { Body, Controller, Get, Logger, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { ProductsService } from './products.service';
import { TurnsService } from './turns.service';
import { TurnEventsService } from './turn-events.service';

@Controller('')
@UseGuards(JwtGuard)
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(
    private readonly products: ProductsService,
    private readonly turns: TurnsService,
    private readonly turnEvents: TurnEventsService,
  ) {}

  @Get('products')
  async list(@CurrentUser() user: any, @Res() res: Response) {
    return res.status(200).json(await this.products.list(user.userId));
  }

  @Get('products/:id/turns')
  async history(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    await this.products.getOwned(id, user.userId);
    return res.status(200).json(await this.turns.history(id, user.userId));
  }

  /**
   * Заголовки скопированы из chat.controller.ts: X-Accel-Buffering: no
   * обязателен, иначе nginx придержит чанки и стриминг превратится в один
   * ответ в конце.
   */
  @Post('products/:id/chat')
  async chat(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { prompt: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.products.getOwned(id, user.userId);
    const turn = await this.turns.enqueue({
      productId: id,
      userId: user.userId,
      channel: 'web',
      prompt: body.prompt,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    // Обрыв клиента прекращает чтение. Без этого генератор крутится до своего
    // предела в 15 минут, опрашивая Redis и Postgres ради ответа, который
    // некому принять: nginx рвёт соединение по proxy_read_timeout заметно
    // раньше, а воркер Node всё это время занят. На параллельных ходах это
    // накопительная утечка.
    //
    // Ход при этом не прерывается — он живёт на VM и договорит сам. Клиент
    // дочитает результат из истории.
    let clientGone = false;
    req.on('close', () => {
      clientGone = true;
    });

    try {
      // Признак отмены уезжает ВНУТРЬ генератора: снаружи он не сработает,
      // пока поток молчит, а именно тогда клиент обычно и отваливается.
      // Внешняя проверка остаётся — она закрывает гонку внутри одного тика.
      for await (const event of this.turnEvents.readEvents(id, turn.id, () => clientGone)) {
        if (clientGone) break;
        res.write(JSON.stringify(event) + '\n');
      }
    } catch (e: any) {
      // Заголовки уже ушли, поэтому фильтр исключений Nest отдать чистый JSON
      // не сможет — клиент увидел бы обрыв сокета без объяснения. Отдаём
      // событие error, чтобы NDJSON-парсер на той стороне получил внятное
      // завершение.
      // След обязателен: заголовки ушли, клиент получит только «поток
      // прерван», а настоящая причина — падение Postgres, отказ Redis,
      // порча буфера — иначе не попадёт никуда. Это третий случай в модуле,
      // когда диагностика на редкой ветке отсутствует или врёт; два
      // предыдущих уже стоили времени.
      this.logger.error(`chat: поток хода ${turn.id} прерван: ${e?.message}`);
      if (!clientGone) {
        res.write(JSON.stringify({ type: 'error', message: 'Поток прерван' }) + '\n');
      }
    }
    if (!clientGone) res.end();
  }

  @Post('products/:id/turns/:turnId/revert')
  async revert(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('turnId') turnId: string,
    @Res() res: Response,
  ) {
    await this.products.getOwned(id, user.userId);
    const turn = await this.turns.revert({ productId: id, turnId, userId: user.userId });
    return res.status(202).json(turn);
  }
}
```

- [ ] **Step 5: Добавить приём событий в маршруты раннера**

В `src/products/runner.controller.ts`:

```ts
  /**
   * Принадлежность хода проверяется явно: события уезжают в Redis по ключу
   * хода, и там нет продукта, поэтому в самом `appendEvent` ограничить нечем.
   *
   * Без проверки раннер продукта A вливал бы произвольный текст в живой
   * стрим чата продукта B — клиент B увидел бы это в своём разговоре с
   * агентом как ответ собственного ассистента.
   */
  @Post('products/runner/turns/:id/events')
  async events(@Req() req: any, @Param('id') id: string, @Body() body: { events: any[] }) {
    for (const event of body.events ?? []) {
      await this.turnEvents.appendEvent(req.product.id, id, event);
    }
    // Признак жизни идущего хода. Без него сборщик отбирает по длительности —
    // то есть по догадке о смерти — и снимает замок под легитимно длинным
    // ходом, после чего рядом стартует второй claude -p в том же чекауте.
    await this.turns.markProgress(id, req.product.id);
    return { ok: true };
  }
```

- [ ] **Step 6: Прогнать тесты, убедиться что проходят**

Run: `npx jest src/products`
Expected: PASS, все файлы модуля

- [ ] **Step 7: Коммит**

```bash
git add src/products/
git commit -m "feat(products): клиентские маршруты, NDJSON-стриминг хода и откат"
```

---

### Task 9: Сборка модуля и регистрация

**Files:**
- Create: `src/products/products.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/products/products.routes.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/products/products.routes.spec.ts`:

```ts
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProductsController } from './products.controller';
import { RunnerController } from './runner.controller';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RunnerGuard } from './runner.guard';

/**
 * Регрессия по образцу src/common/guards/admin-routes.spec.ts.
 *
 * Клиентские маршруты продуктов отдают чужой код и историю правок; маршруты
 * раннера позволяют завершить ход и списать токены. Незакрытый маршрут здесь
 * стоит дороже, чем в большинстве мест кодовой базы.
 */
const guardsOf = (ctrl: any) => Reflect.getMetadata(GUARDS_METADATA, ctrl) ?? [];

describe('охрана маршрутов products', () => {
  it('клиентские маршруты закрыты JwtGuard', () => {
    expect(guardsOf(ProductsController)).toContain(JwtGuard);
  });

  it('маршруты раннера закрыты RunnerGuard и НЕ пускают по JWT пользователя', () => {
    const guards = guardsOf(RunnerController);
    expect(guards).toContain(RunnerGuard);
    expect(guards).not.toContain(JwtGuard);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что проходит или падает осмысленно**

Run: `npx jest src/products/products.routes.spec.ts`
Expected: PASS (guard'ы уже расставлены в Task 7 и 8). Если FAIL — расставить `@UseGuards` согласно тесту.

- [ ] **Step 3: Написать модуль**

`src/products/products.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { MiscModule } from '../misc/misc.module';
import { ProductsController } from './products.controller';
import { RunnerController } from './runner.controller';
import { ProductsService } from './products.service';
import { TurnsService } from './turns.service';
import { TurnEventsService } from './turn-events.service';
import { RunnerGuard } from './runner.guard';

@Module({
  imports: [CommonModule, MiscModule],
  controllers: [ProductsController, RunnerController],
  providers: [ProductsService, TurnsService, TurnEventsService, RunnerGuard],
  exports: [ProductsService, TurnsService],
})
export class ProductsModule {}
```

- [ ] **Step 4: Зарегистрировать модуль**

В `src/app.module.ts` добавить импорт рядом с остальными:

```ts
import { ProductsModule } from './products/products.module';
```

и `ProductsModule` в массив `imports` (рядом с `CustomAgentsModule`).

- [ ] **Step 5: Убедиться, что приложение собирается**

Локально `pnpm build` не гонять — мак не тянет. На тестовой ноде, в CI-клоне:

```bash
git push -u origin <ветка>
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && git fetch -q origin && git checkout -q <sha>'
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npm ci && npx tsc --noEmit -p tsconfig.json'
```

Expected: без ошибок компиляции.

`source ~/.nvm/nvm.sh` обязателен — вне nvm на ноде `node` не найдётся. Работать только в `~/ci/`: `~/spirits_back` на этой ноде — живой чекаут, из которого работает API `test.linkeon.io`, и переключение веток там уронит стенд.

- [ ] **Step 6: Коммит**

```bash
git add src/products/products.module.ts src/products/products.routes.spec.ts src/app.module.ts
git commit -m "feat(products): регистрация модуля и охрана маршрутов"
```

---

### Task 10: Сборщик зависших ходов

Без этой задачи модуль ломается необратимо. Раннер может умереть посреди хода — упасть, потерять сеть, уехать в перезагрузку VM. Ход остаётся в статусе `running` навсегда, а замок `product_turns_one_active` считает продукт занятым: каждый следующий запрос клиента отбивается 409, и починить это из интерфейса невозможно. Клиент видит «агент уже работает» на продукте, где никто не работает.

**Files:**
- Modify: `src/products/turns.service.ts`
- Test: `src/products/turns.reap.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/products/turns.reap.spec.ts`:

```ts
import { TurnsService } from './turns.service';

function makeService(reaped: any[] = []) {
  const calls: { sql: string; params: any[] }[] = [];
  const pg = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: reaped };
    }),
  };
  const redis = { rpush: jest.fn(), expire: jest.fn(), lrange: jest.fn(async () => []) };
  const deductTokens = jest.fn();
  return { svc: new TurnsService(pg as any, { deductTokens } as any, redis as any), calls, deductTokens };
}

describe('TurnsService.reapStuck', () => {
  it('переводит зависшие running-ходы в failed', async () => {
    const { svc, calls } = makeService([{ id: 't-1' }]);

    await svc.reapStuck();

    const sql = calls[0].sql;
    expect(sql).toContain("SET status = 'failed'");
    expect(sql).toContain("status = 'running'");
    expect(sql).toContain('started_at <');
  });

  it('не трогает ходы, начатые только что', async () => {
    const { svc, calls } = makeService([]);

    await svc.reapStuck();

    // Проверяется само значение, а не наличие слова: /interval/i прошло бы и
    // при '30 seconds', и при '30 days', то есть тест обещал бы больше, чем
    // доказывает.
    expect(calls[0].sql).toContain("interval '30 minutes'");
    // И отбор идёт по признаку прогресса, а не по длительности хода.
    expect(calls[0].sql).toContain('COALESCE(last_progress_at, started_at)');
  });

  it('зависший ход не тарифицируется', async () => {
    const { svc, deductTokens } = makeService([{ id: 't-1' }]);

    await svc.reapStuck();

    expect(deductTokens).not.toHaveBeenCalled();
  });
});

describe('TurnsService — жизненный цикл сборщика', () => {
  // Хуки onModuleInit/onModuleDestroy не покрывает ни один другой тест модуля:
  // все спеки создают сервис через `new` и жизненный цикл Nest не поднимают.
  // А сборщик — единственный механизм самовосстановления: без него умерший
  // раннер оставляет ход в running навсегда, и замок держит продукт.
  afterEach(() => jest.useRealTimers());

  it('таймер стартует и вызывает сборщик по интервалу', async () => {
    jest.useFakeTimers();
    const { svc, calls } = makeService([]);

    svc.onModuleInit();
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(calls.some((c) => c.sql.includes("SET status = 'failed'"))).toBe(true);
  });

  it('таймер не держит процесс', () => {
    jest.useFakeTimers();
    const { svc } = makeService([]);

    svc.onModuleInit();

    // Без unref таймер удерживает event loop: прогон jest не завершается, а
    // остановка приложения подвисает на пять минут.
    expect((svc as any).reaper.hasRef()).toBe(false);
  });

  it('остановка модуля гасит таймер', async () => {
    jest.useFakeTimers();
    const { svc, calls } = makeService([]);

    svc.onModuleInit();
    svc.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/products/turns.reap.spec.ts`
Expected: FAIL — `svc.reapStuck is not a function`

- [ ] **Step 3: Реализовать**

Добавить в `src/products/turns.service.ts`:

```ts
  /**
   * Раннер может умереть посреди хода — упасть, потерять сеть, уехать в
   * перезагрузку VM. Ход останется `running`, а замок будет считать продукт
   * занятым: клиент получит 409 на всё и не сможет починить это сам.
   *
   * Порог 30 минут ПАРНЫЙ к пределу чтения в `TurnEventsService.readEvents`
   * (1800 тиков по 500 мс = 15 минут). Правка одного без другого разъезжает
   * поведение: если сборщик станет быстрее читателя, клиент получит два
   * терминальных события подряд — свой таймаут и следом `end` от снятого
   * хода. Менять только вместе.
   *
   * Токены не списываются — работа не доведена до результата.
   */
  async reapStuck(): Promise<number> {
    const r = await this.pg.query(
      `UPDATE product_turns
          SET status = 'failed',
              error = 'Раннер не завершил ход: связь потеряна',
              finished_at = now()
        WHERE status = 'running'
          -- По признаку прогресса, а не по длительности. «Идёт дольше
          -- получаса» — догадка о смерти: крупный рефакторинг со сборкой и
          -- тестами живёт дольше, и снятие замка под ним запускает второй
          -- claude -p в том же чекауте. «Полчаса не подаёт признаков жизни» —
          -- свидетельство.
          --
          -- COALESCE на случай хода, забранного до появления колонки, и на
          -- случай раннера, который ещё не прислал ни одного события.
          AND COALESCE(last_progress_at, started_at) < now() - interval '30 minutes'
        RETURNING id`,
    );
    if (r.rows.length) {
      this.logger.warn(`reapStuck: снято ${r.rows.length} зависших ходов`);
    }
    return r.rows.length;
  }
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/products/turns.reap.spec.ts`
Expected: PASS, 3 теста

- [ ] **Step 5: Подключить к планировщику**

Весь reaper живёт в `TurnsService` — своим таймером, а не через общий `scheduler`: модуль должен восстанавливаться независимо от того, жив ли планировщик.

Изменить объявление класса в `src/products/turns.service.ts` и добавить два хука (импорты `OnModuleInit`, `OnModuleDestroy` из `@nestjs/common`):

```ts
export class TurnsService implements OnModuleInit, OnModuleDestroy {
  private reaper?: NodeJS.Timeout;

  onModuleInit() {
    this.reaper = setInterval(() => {
      this.reapStuck().catch((e) => this.logger.error(`reapStuck failed: ${e.message}`));
    }, 5 * 60 * 1000);
    // unref, иначе таймер держит процесс и jest не завершается.
    this.reaper.unref();
  }

  onModuleDestroy() {
    if (this.reaper) clearInterval(this.reaper);
  }
```

Остальное тело класса не трогается.

- [ ] **Step 6: Прогнать весь модуль**

Run: `npx jest src/products`
Expected: PASS

- [ ] **Step 7: Коммит**

```bash
git add src/products/turns.service.ts src/products/turns.reap.spec.ts
git commit -m "fix(products): снимать зависшие ходы, иначе замок блокирует продукт навсегда"
```

---

### Task 11: Заведение первого продукта и ручная проверка

**Files:**
- Create: `scripts/products-register.sh`

- [ ] **Step 1: Написать скрипт регистрации**

`scripts/products-register.sh`:

```bash
#!/usr/bin/env bash
# Заводит продукт в реестре и печатает runner-токен ОДИН раз.
# В базе лежит только sha256 — восстановить токен потом нельзя, только выпустить новый.
#
# Использование:
#   scripts/products-register.sh <user_id> <name> <slug> <checkout_path>
set -euo pipefail

USER_ID="$1"; NAME="$2"; SLUG="$3"; CHECKOUT="$4"
TOKEN="$(openssl rand -hex 32)"
HASH="$(printf '%s' "$TOKEN" | openssl dgst -sha256 -hex | awk '{print $NF}')"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO products (user_id, name, slug, checkout_path, runner_token_hash, status)
   VALUES ('$USER_ID', '$NAME', '$SLUG', '$CHECKOUT', '$HASH', 'running')
   RETURNING id;"

echo "RUNNER_TOKEN=$TOKEN"
echo "Сохрани токен сейчас — второй раз он не покажется."
```

- [ ] **Step 2: Сделать исполняемым и проверить схему на тестовом стенде**

```bash
chmod +x scripts/products-register.sh
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"SELECT conname, contype FROM pg_constraint WHERE conrelid = 'product_turns'::regclass ORDER BY conname;\""
```

Expected: среди прочего — `CHECK` на `status` и `CHECK` на `tokens_spent`.

Отдельно проверить **состав колонок** — констрейнты его не покрывают:

```bash
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"SELECT attname FROM pg_attribute WHERE attrelid = 'product_turns'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum;\""
```

Expected: среди прочего — `revert_to_sha`.

Это не педантизм, а тот же механизм, который уже приходилось чинить: `CREATE TABLE IF NOT EXISTS` на существующей таблице не добавляет ни констрейнтов, ни **колонок**. Проверку под констрейнты мы завели раньше, а `revert_to_sha` появилась после неё — и приёмка за схемой не поехала. При старой таблице проверка отчитается зелёным, а каждый `enqueue` упадёт в рантайме с `42703: column "revert_to_sha" does not exist`.

Правило общее: сверять по системному каталогу и **пересматривать список при каждом изменении схемы**, а не полагаться на то, что файл `.sql` лежит на месте.

**Критерий приёмки здесь — наличие констрейнтов, а не наличие таблиц.** Разница принципиальная: `CREATE TABLE IF NOT EXISTS` не добавляет констрейнты к уже существующей таблице. Если `products`/`product_turns` где-то уже созданы прежней редакцией `001` — на тестовом стенде, в чьей-то локальной базе, параллельной сессией — миграция отработает как no-op, ни один `CHECK` не появится, а в логе будет зелёное `products migration 001_products.sql applied from ...`. Проверка «таблицы существуют» пройдёт на старой схеме и ничего не докажет.

Поэтому **до выката** убедиться, что таблиц ещё нигде нет:

```bash
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"SELECT to_regclass('products'), to_regclass('product_turns');\""
```

Если обе `NULL` — редактировать `001` на месте законно, он ещё нигде не применялся. Если хотя бы одна не `NULL` — заводить `002_*.sql` с `ALTER TABLE ... ADD CONSTRAINT` и не полагаться на `001`.

Если таблиц нет и после выката — смотреть логи старта `pm2 logs linkeon-api | grep "products migration"`. Файл в `migrations/` сам по себе ничего не доказывает.

- [ ] **Step 3: Проверить контракт раннера curl'ом**

Раннера ещё нет — эмулируем его. С тестового стенда:

```bash
# 1. Пустая очередь
curl -sS -X POST https://test.linkeon.io/webhook/products/runner/poll \
  -H "Authorization: Bearer $RUNNER_TOKEN" | jq .
# Expected: {"turn": null, "product": {"checkoutPath": "...", ...}}

# 2. Неизвестный токен
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://test.linkeon.io/webhook/products/runner/poll \
  -H "Authorization: Bearer nonsense"
# Expected: 401

# 3. Heartbeat записался
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c 'SELECT slug, runner_seen_at FROM products'"
# Expected: runner_seen_at — только что
```

Проверять код ответа здесь можно: это API-маршруты, а не пути SPA. Для путей, которые отдаёт фронтовый nginx, код `200` ничего не значит — SPA-фолбэк отдаёт `200` с HTML на любой путь.

- [ ] **Step 4: Проверить замок на параллельные ходы**

```bash
TOKEN_JWT=... # access-токен владельца продукта
PID=...       # id продукта

# Первый ход — повиснет в стриминге, это нормально, раннера нет
curl -sS -X POST "https://test.linkeon.io/webhook/products/$PID/chat" \
  -H "Authorization: Bearer $TOKEN_JWT" -H 'Content-Type: application/json' \
  -d '{"prompt":"первый"}' &
sleep 2

# Второй — должен отбиться 409
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "https://test.linkeon.io/webhook/products/$PID/chat" \
  -H "Authorization: Bearer $TOKEN_JWT" -H 'Content-Type: application/json' \
  -d '{"prompt":"второй"}'
# Expected: 409
kill %1
```

- [ ] **Step 5: Сломать проверку нарочно**

Зелёный прогон сам по себе ничего не доказывает — на этом проекте уже было пять ложно-зелёных проверок подряд в i18n. Убедиться, что замок действительно работает:

```bash
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c 'DROP INDEX product_turns_one_active;'"
# Повторить шаг 4 — второй запрос теперь должен пройти (не 409).
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"CREATE UNIQUE INDEX product_turns_one_active ON product_turns (product_id) WHERE status IN ('queued','running');\""
# Повторить шаг 4 — снова 409.
```

Если второй запрос отбивается 409 и с удалённым индексом — значит защита не там, где мы думаем, и её надо искать.

Прибрать зависшие ходы после экспериментов. Сборщик из Task 10 снимет `running`-ходы сам через 30 минут, но `queued` он не трогает — их убрать руками:

```bash
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"UPDATE product_turns SET status='failed', error='ручная проверка' WHERE status IN ('queued','running');\""
```

- [ ] **Step 6: Проверить идемпотентность завершения хода — против настоящей базы**

Единственная проверка, которая доказывает защиту от двойного списания. Юнит-тесты её дать не могут: мок не исполняет SQL и берёт `rowCount` из флага сценария, а не из предиката запроса. Гарантия здесь — гарантия Postgres, и проверяется она только Postgres'ом.

```bash
# Подготовить ход в статусе running
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"UPDATE product_turns SET status='running', started_at=now() WHERE id='<turn_id>';\""

# Запомнить баланс
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"SELECT tokens FROM ai_profiles_consolidated WHERE user_id='<user_id>';\""

# Дважды подряд завершить один и тот же ход
for i in 1 2; do
  curl -sS -X POST "https://test.linkeon.io/webhook/products/runner/turns/<turn_id>/complete" \
    -H "Authorization: Bearer $RUNNER_TOKEN" -H 'Content-Type: application/json' \
    -d '{"status":"done","result":"ок","shaBefore":"aaa","shaAfter":"bbb","tokens":1000}'
  echo
done
```

Expected: баланс уменьшился ровно на 1000, а не на 2000. В `token_transactions` — одна строка, не две. В логе `pm2 logs linkeon-api | grep "уже финализирован"` — сообщение о проигнорированном повторе.

```bash
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"SELECT count(*) FROM token_transactions WHERE description = 'product turn <turn_id>';\""
```

Expected: `1`.

Проверять **и баланс, и число строк в реестре** — не одно из двух. При снятом стороже и нехватке баланса второе списание дало бы нулевую дельту баланса (списывать уже нечего), но лишнюю строку в `token_transactions`: проверка только по балансу такой случай пропустит.

Сверочный запрос писать **в обе стороны**. Расхождение возможно в двух направлениях, и они означают разное:

```sql
SELECT t.id, t.tokens_spent, COALESCE(SUM(tr.amount), 0) AS actually_charged
  FROM product_turns t
  LEFT JOIN token_transactions tr ON tr.description = 'product turn ' || t.id
 WHERE t.status = 'done'
 GROUP BY t.id, t.tokens_spent
HAVING t.tokens_spent <> COALESCE(SUM(tr.amount), 0);
```

`tokens_spent > списанного` — недобор по деньгам, но завышенный расход в кабинете: процесс умер между списанием и дозаписью фактического числа. `tokens_spent < списанного` — переплата, то есть отказ сторожа состояния.

**Сломать проверку нарочно:** временно снять `AND status = 'running'` из `complete`, выкатить на test, повторить — баланс обязан уменьшиться на 2000, а строк в `token_transactions` стать две. Вернуть. Без этого шага зелёный результат не доказывает, что сторож вообще участвует.

- [ ] **Step 7: Проверить, что heartbeat не воскрешает остановленный продукт**

Юнит-тест этого не доказывает: он сравнивает точный текст выражения `CASE`, то есть краснеет на любом его изменении, включая корректное. Настоящая граница — поведение базы.

```bash
# Продукт остановлен владельцем
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"UPDATE products SET status='stopped' WHERE slug='selyanska';\""

# Раннер опрашивает (или дождаться его собственного опроса)
curl -sS -X POST https://test.linkeon.io/webhook/products/runner/poll \
  -H "Authorization: Bearer $RUNNER_TOKEN" > /dev/null

ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"SELECT status, runner_seen_at FROM products WHERE slug='selyanska';\""
```

Expected: `status` остался `stopped`, `runner_seen_at` обновился. Heartbeat подтверждает живость, но не отменяет решение владельца.

Затем то же с `degraded`:

```bash
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"UPDATE products SET status='degraded' WHERE slug='selyanska';\""
curl -sS -X POST https://test.linkeon.io/webhook/products/runner/poll -H "Authorization: Bearer $RUNNER_TOKEN" > /dev/null
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"SELECT status FROM products WHERE slug='selyanska';\""
```

Expected: `running`. Без этого перехода `degraded` — тупик: мониторинг его ставит, никто не снимает, и продукт навсегда остаётся без работы.

Вернуть `status='running'` после проверок.

- [ ] **Step 8: Проверить сборщик зависших ходов**

```bash
# Оставить ход в running с давним started_at
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"UPDATE product_turns SET status='running', started_at = now() - interval '2 hours' WHERE id = '<turn_id>';\""
# Подождать до 5 минут (интервал таймера) и проверить
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"SELECT id, status, error FROM product_turns WHERE id = '<turn_id>';\""
# Expected: status = failed, error = 'Раннер не завершил ход: связь потеряна'
```

Затем убедиться, что продукт снова принимает запросы: повторить шаг 4 — первый ход должен встать в очередь, а не отбиться 409.

- [ ] **Step 9: Коммит**

```bash
git add scripts/products-register.sh
git commit -m "chore(products): скрипт заведения продукта в реестре"
```

---

## Что осталось за пределами этого плана

| Кусок | Где |
|---|---|
| `product-runner` — сервис на VM продукта | следующий план |
| Кабинет `/products` во фронте | следующий план |
| Автопровижининг новых VM | кусок 2, отдельная спека |
| Рублёвая подписка за слот | кусок 3, отдельная спека |
| Self-serve заведение продукта клиентом | кусок 4, отдельная спека |

## Проверка перед сдачей

- [ ] `npx jest src/products` — зелено
- [ ] `npx jest src/tokens/balance-writes.guard.spec.ts` — зелено (нет прямых записей в баланс)
- [ ] `npx jest src/common/guards/admin-routes.spec.ts` — зелено (не сломали существующую охрану)
- [ ] На тестовой ноде в CI-клоне: `npx tsc --noEmit -p tsconfig.json` — без ошибок
- [ ] Таблицы `products` и `product_turns` существуют на тестовом стенде — проверено запросом, а не наличием файла
- [ ] Замок проверен в обе стороны: с индексом — 409, без индекса — проходит
- [ ] Сборщик зависших ходов проверен: `running` со старым `started_at` уходит в `failed`, и продукт снова принимает запросы

Полный `npm test` на этом репозитории красный и без наших правок: jest скребёт `.worktrees/`, и два теста падают на `main`. Свою работу мерить дельтой к состоянию `main`, а не абсолютным «всё зелено».
