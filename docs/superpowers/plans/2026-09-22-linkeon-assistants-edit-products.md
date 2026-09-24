# Ассистенты правят продукты — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** дать любому ассистенту чата (Роман, Райя и прочие) один инструмент, которым он видит продукты СВОЕГО собеседника и ставит им правки — теми же ходами в контейнере, что и экран продукта.

**Architecture:** инструмент живёт в `spirits_back` и отдаётся ассистенту через MCP. Правка — это `TurnsService.enqueue()`, то есть ровно тот механизм, что уже работает: изоляция, проверка здоровья, автооткат, история, списание. Инструмент ждёт исход с потолком, производным от бюджета хода релея, и отдаёт три разных конца по-разному. Владелец берётся из подписанного токена сессии, а не из аргумента, который пишет модель.

**Tech Stack:** NestJS 10, PostgreSQL 16, jsonwebtoken, `@modelcontextprotocol/sdk`, jest, relay file-agent (Node, `server.mjs` на 5.101.115.184).

**Спека:** [2026-09-22-linkeon-assistants-edit-products-design.md](../specs/2026-09-22-linkeon-assistants-edit-products-design.md)

---

## Что выяснилось при разведке и меняет спеку

Три факта из живого кода. Читать ДО первой задачи — на них стоит половина плана.

### 1. Инструменты ассистентов ездят через MCP, и `userId` там пишет МОДЕЛЬ

Спека утверждала: «принадлежность закрыта подписью, а не проверкой — `executeTool(userId, …)` получает владельца первым аргументом, и обойти это нельзя».

На живом пути это неверно. Полный маршрут:

1. `chat.service.ts` шлёт ход на релей `https://r.linkeon.io/chat` (`src/chat/chat.service.ts:1584`);
2. релей запускает Claude Code с MCP-конфигом `/home/dv/file-agent/empty-mcp.json`, где один сервер — `https://my.linkeon.io/mcp` с общим `MCP_SECRET`;
3. релей кладёт телефон пользователя В СИСТЕМНЫЙ ПРОМПТ: `Current user phone (use as the \`userId\` argument for any mcp__linkeon__* tool call)` (`relay-agent/server.mjs:378`);
4. `McpController` вынимает `args.userId` и передаёт в `executeTool` (`src/mcp/mcp.controller.ts:74-85`).

То есть `userId` — обычный аргумент, который пишет модель. Пользователь, попросивший «вызови инструмент с userId 79001234567», получает шанс на чужой аккаунт.

**Для существующих инструментов это уже так** (`manage_routine` завёл бы рутину на чужом аккаунте, `generate_image` списал бы чужие токены). Это отдельная находка, она вынесена владельцу и в этом плане НЕ чинится.

**Но продуктам этого пути хватать нельзя**: цена — правка чужого сайта. Поэтому инструмент продуктов **не добавляется в `CHAT_TOOLS`** и не отдаётся с `/mcp`. Он получает свою точку `/webhook/mcp/products` (почему не `/mcp/products` — пункт 1б ниже), чей Bearer — подписанный нами токен с `userId` внутри. Владелец приезжает из проверенной подписи; аргумента `userId` у инструмента нет вовсе.

Приём не выдуман: ровно так уже сделан TalerID — бэкенд чеканит токен пользователя, релей кладёт его в ЗАГОЛОВОК пер-сессионного MCP-конфига, и системный промпт прямо запрещает передавать туда телефон (`relay-agent/server.mjs:279, 444-460`).

Так спека становится правдой: владелец — первый аргумент, и подделать его нельзя.

### 1б. Адрес точки — `/webhook/mcp/products`, а не `/mcp/products`

Найдено при исполнении задачи 9, измерено живым приложением и таблицей маршрутов.

В `src/main.ts:27` стоит `setGlobalPrefix('webhook', { exclude: [{ path: 'mcp', … }] })`. Исключение написано как **точный путь** `mcp`, а не как префикс `mcp/(.*)` — поэтому из-под глобального префикса выходит только сама `/mcp`, а подпуть остаётся под ним.

Замер: `POST /mcp/products` → 404, `POST /webhook/mcp/products` → 200 со списком инструментов.

**Оставлено как есть, а не «починено» правкой `main.ts».** На проде nginx проксирует `location /mcp` префиксом, но **на тестовом стенде такого блока нет вовсе** — там `/mcp/products` ушёл бы в SPA-фолбэк и вернул 200 с HTML. Зелёная проверка при неработающей точке — ровно тот тихий отказ, которым проект уже наелся. `/webhook/*` работает на обеих средах сегодня и ничего в nginx не требует.

Адрес зависит **от двух файлов сразу** и ни один по отдельности правды не говорит, поэтому в `products-mcp.controller.spec.ts` стоит сторож на оба: полный адрес с глаголом и запрет расширять исключение в `main.ts` до подпутей. Проверено ломанием: расширение краснит ровно один тест.

### 2. Релей — белый список, и он НЕ катается `deploy.sh`

`relay-agent/server.mjs:434` — жёсткий перечень разрешённых имён (`--allowedTools`), плюс `--strict-mcp-config`. Новый инструмент, не внесённый туда, ассистенту недоступен, даже если MCP его отдаёт. Системный промпт релея вдобавок говорит «ONLY `mcp__linkeon__*`» (строка 30) — нужна явная оговорка, как у TalerID.

`deploy.sh` релей не катает (см. память `project_relay_file_agent_unversioned.md`). Выкат — отдельная задача 10, руками, с бэкапом.

**Сверено 22.09.2026:** живой `/home/dv/file-agent/server.mjs` и копия в репозитории совпадают побайтно (md5 `16412302b333bf06226f4e3e7e305b4d`, 923 строки). Файл умеет расходиться молча — **перед задачей 9 сверить md5 заново**.

### 3. Строгий разбор ключа из гашения — в `block.service.ts:154`

`lookup()`: UUID → id, есть точка → домен, иначе → слаг. По имени не ищет вовсе. Переиспользовать нельзя — почему, написано в спеке.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/common/relay-budget.ts` (создать) | Единственное место, где живёт бюджет хода релея и производный от него потолок ожидания |
| `src/products/product-tool.token.ts` (создать) | Чеканка и проверка токена сессии для инструмента. Чистые функции, без DI |
| `src/products/product-tool.service.ts` (создать) | Поиск продукта по имени, три действия, ожидание с потолком, разбор исхода |
| `src/mcp/products-mcp.controller.ts` (создать) | Точка `/webhook/mcp/products`: Bearer → userId → `ProductToolService` |
| `src/products/product-tool.spec.ts` (создать) | Проверка против живого Postgres |
| `src/products/product-tool.token.spec.ts` (создать) | Проверка токена без базы |
| `src/mcp/products-mcp.controller.spec.ts` (создать) | Проверка точки: подпись, тип, отсутствие аргумента `userId` |
| `src/chat/chat.service.ts` (править) | Отправить токен и адрес на релей; взять бюджет хода из константы |
| `src/products/products.module.ts` (править) | Отдать `ProductToolService` наружу |
| `src/mcp/mcp.module.ts` (править) | Подключить `ProductsModule` и новый контроллер |
| `relay-agent/server.mjs` (править) | Пер-сессионный MCP-сервер `products`, белый список, блок промпта |

---

## Как гонять тесты

Прогоны — на тестовой ноде, в CI-клоне (правило из `CLAUDE.md`).

Одноразовая база для файлов против живого Postgres (создаётся один раз, дальше переиспользуется):

```bash
ssh dv@85.192.61.231 'sudo -u postgres psql -c "CREATE ROLE ptool LOGIN PASSWORD '"'"'ptool'"'"';" -c "CREATE DATABASE ptool OWNER ptool;"'
```

Прогон одного файла:

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool"'
```

**Прибор врёт молча — три правила, оплаченные 20 ложными прогонами в этом проекте:**
1. без `PROVISIONING_PG_URL` файл пропускается целиком и прогон **зелёный** — сверяй, что `Tests:` показывает пройденные, а не `skipped`;
2. jest на бэке **не проверяет типы** (`isolatedModules`) — типовой гейт только `npx tsc --noEmit -p tsconfig.build.json`;
3. `--testPathPattern` внутри `.worktrees` находит 0 файлов и выглядит как обычный прогон.

Типовой гейт после каждой задачи, где менялся `.ts`:

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx tsc --noEmit -p tsconfig.build.json'
```

---

### Task 1: Один бюджет хода вместо двух чисел

Потолок ожидания обязан быть производным от бюджета ответа релея. Сегодня бюджет — голый литерал `600000` в одном месте.

**Files:**
- Create: `spirits_back/src/common/relay-budget.ts`
- Create: `spirits_back/src/common/relay-budget.spec.ts`
- Modify: `spirits_back/src/chat/chat.service.ts:1586`

- [ ] **Step 1: Написать падающий тест**

Создать `spirits_back/src/common/relay-budget.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { RELAY_TURN_BUDGET_MS, TOOL_STEPS_PER_TURN, PRODUCT_TOOL_WAIT_MS } from './relay-budget';

describe('бюджет хода релея', () => {
  it('потолок ожидания ВЫЧИСЛЕН из бюджета хода, а не выбран своим числом', () => {
    expect(PRODUCT_TOOL_WAIT_MS * TOOL_STEPS_PER_TURN).toBe(RELAY_TURN_BUDGET_MS);
  });

  it('потолок строго меньше бюджета: инструменту нельзя съесть весь ход', () => {
    expect(PRODUCT_TOOL_WAIT_MS).toBeLessThan(RELAY_TURN_BUDGET_MS);
    expect(PRODUCT_TOOL_WAIT_MS).toBeGreaterThan(0);
  });

  // Тест по исходнику, а не по поведению, — сознательно. Вычислить бюджет
  // из работающего axios нельзя, а именно возврат литерала обратно в
  // chat.service.ts и есть та поломка, ради которой константа заводилась:
  // два числа разъедутся молча, и ассистент будет ждать дольше, чем его
  // слушают.
  it('chat.service берёт бюджет из константы, а не держит свой литерал', () => {
    const src = fs.readFileSync(path.join(__dirname, '../chat/chat.service.ts'), 'utf8');
    expect(src).toContain('RELAY_TURN_BUDGET_MS');
    expect(src).not.toMatch(/timeout:\s*600000/);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/common/relay-budget"'
```

Ожидается: FAIL, `Cannot find module './relay-budget'`.

- [ ] **Step 3: Создать константы**

`spirits_back/src/common/relay-budget.ts`:

```ts
/**
 * Сколько бэкенд ждёт ответа релея на ОДИН ход ассистента. Отсюда его берут
 * двое: сам вызов релея и потолок ожидания инструмента продуктов.
 *
 * Вынесено в константу не ради красоты. Инструмент, ждущий правку дольше, чем
 * бэкенд ждёт весь ход, не отдаст результат никогда: соединение к тому времени
 * уже оборвано. Два числа, выбранные порознь, разъезжаются молча — тот же
 * разбор, что у потолка молчания хода в turns.service.ts.
 */
export const RELAY_TURN_BUDGET_MS = 600_000;

/**
 * На сколько шагов инструмента рассчитан один ход. Ассистенту после возврата
 * инструмента надо ещё написать ответ, а в том же ходе он может позвать
 * инструмент повторно (уточнили продукт — правим). Четверть бюджета оставляет
 * место трём таким шагам.
 */
export const TOOL_STEPS_PER_TURN = 4;

/** Потолок ожидания правки внутри одного вызова инструмента. */
export const PRODUCT_TOOL_WAIT_MS = RELAY_TURN_BUDGET_MS / TOOL_STEPS_PER_TURN;
```

- [ ] **Step 4: Заменить литерал в chat.service.ts**

В `spirits_back/src/chat/chat.service.ts` добавить к импортам:

```ts
import { RELAY_TURN_BUDGET_MS } from '../common/relay-budget';
```

Заменить строку 1586:

```ts
          timeout: 600000, // 10 min
```

на:

```ts
          timeout: RELAY_TURN_BUDGET_MS,
```

- [ ] **Step 5: Прогнать тест и типовой гейт**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/common/relay-budget" && npx tsc --noEmit -p tsconfig.build.json'
```

Ожидается: `Tests: 3 passed`, затем `tsc` молча.

- [ ] **Step 6: Коммит**

```bash
git add src/common/relay-budget.ts src/common/relay-budget.spec.ts src/chat/chat.service.ts
git commit -m "feat(products): бюджет хода релея — одно число на двоих"
```

---

### Task 2: Токен сессии для инструмента

Владелец должен приезжать из подписи. Токен чеканит бэкенд на каждый ход, релей кладёт его в заголовок, инструмент никогда не видит телефон аргументом.

**Files:**
- Create: `spirits_back/src/products/product-tool.token.ts`
- Create: `spirits_back/src/products/product-tool.token.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/src/products/product-tool.token.spec.ts`:

```ts
import * as jwt from 'jsonwebtoken';
import { signProductToolToken, verifyProductToolToken, PRODUCT_TOOL_TOKEN_TYPE } from './product-tool.token';

describe('токен инструмента продуктов', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = 'test-secret-for-product-tool'; });
  afterAll(() => { process.env.JWT_SECRET = OLD; });

  it('свой токен разбирается обратно в того же владельца', () => {
    expect(verifyProductToolToken(signProductToolToken('79030169187'))).toBe('79030169187');
  });

  it('чужая подпись отвергается', () => {
    const alien = jwt.sign({ userId: '79030169187', type: PRODUCT_TOOL_TOKEN_TYPE }, 'not-our-secret');
    expect(() => verifyProductToolToken(alien)).toThrow();
  });

  // Тип проверяется ЯВНО. Без него access-токен пользователя (тот же секрет,
  // тот же userId) открывал бы эту точку — то есть утечка access-токена
  // превращалась бы ещё и в правку продуктов, а наш токен на релее работал бы
  // как полный ключ от аккаунта. JwtGuard симметрично требует type='access'
  // (src/common/guards/jwt.guard.ts:25), поэтому обратная подмена тоже закрыта.
  it('access-токен пользователя сюда не годится', () => {
    const access = jwt.sign({ userId: '79030169187', sub: '79030169187', type: 'access' }, process.env.JWT_SECRET!);
    expect(() => verifyProductToolToken(access)).toThrow(/тип/i);
  });

  it('просроченный токен отвергается', () => {
    const stale = jwt.sign(
      { userId: '79030169187', type: PRODUCT_TOOL_TOKEN_TYPE },
      process.env.JWT_SECRET!,
      { expiresIn: -60 },
    );
    expect(() => verifyProductToolToken(stale)).toThrow();
  });

  // Токен живёт дольше хода (RELAY_TURN_BUDGET_MS = 10 мин), иначе длинная
  // правка упёрлась бы в протухшую подпись на последнем шаге, и ассистент
  // потерял бы доступ к продукту посреди собственной работы.
  it('живёт дольше одного хода', () => {
    const p: any = jwt.decode(signProductToolToken('79030169187'));
    expect((p.exp - p.iat) * 1000).toBeGreaterThan(600_000);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.token"'
```

Ожидается: FAIL, `Cannot find module './product-tool.token'`.

- [ ] **Step 3: Написать реализацию**

`spirits_back/src/products/product-tool.token.ts`:

```ts
import * as jwt from 'jsonwebtoken';

/**
 * Отдельный тип, а не 'access'. Токен уезжает на релей и живёт там в файле
 * MCP-конфига — то есть за пределами нашего периметра. Своим типом он не
 * годится ни для одной защищённой ручки: JwtGuard требует type='access'
 * (src/common/guards/jwt.guard.ts:25).
 */
export const PRODUCT_TOOL_TOKEN_TYPE = 'product-tool';

/** Заметно дольше бюджета хода (10 мин) и заметно короче суток. */
const TTL_SECONDS = 30 * 60;

function secret(): string {
  return process.env.JWT_SECRET || 'default_secret_change_me';
}

/**
 * Чистые функции, а не сервис Nest, сознательно. Чеканит их chat.service, у
 * которого конструктор уже на 26 зависимостей и с десятком @Optional: ещё один
 * необязательный параметр молча выключил бы инструмент при ошибке в модуле —
 * ровно тот тихий отказ, которым этот проект уже наелся.
 */
export function signProductToolToken(userId: string): string {
  return jwt.sign({ userId, type: PRODUCT_TOOL_TOKEN_TYPE }, secret(), { expiresIn: TTL_SECONDS });
}

/** Отдаёт владельца или бросает. Возврата «не знаю» нет: без владельца работать нечем. */
export function verifyProductToolToken(token: string): string {
  const payload: any = jwt.verify(token, secret());
  if (payload?.type !== PRODUCT_TOOL_TOKEN_TYPE) {
    throw new Error(`Неверный тип токена: ${payload?.type}`);
  }
  const userId = payload?.userId;
  if (!userId || typeof userId !== 'string') {
    throw new Error('В токене нет владельца');
  }
  return userId;
}
```

- [ ] **Step 4: Прогнать тест**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.token"'
```

Ожидается: `Tests: 5 passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/products/product-tool.token.ts src/products/product-tool.token.spec.ts
git commit -m "feat(products): токен сессии для инструмента ассистента"
```

---

### Task 3: Нестрогий поиск продукта по имени

Человек зовёт продукт именем. Поиск допускает несколько совпадений — решает человек, а не первое попавшееся.

**Files:**
- Create: `spirits_back/src/products/product-tool.service.ts`
- Create: `spirits_back/src/products/product-tool.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/src/products/product-tool.spec.ts`:

```ts
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { MIGRATIONS } from './products.service';
import { ProductToolService } from './product-tool.service';

const PG = process.env.PROVISIONING_PG_URL;
const maybe = PG ? describe : describe.skip;

maybe('инструмент продуктов против живого Postgres', () => {
  jest.setTimeout(60_000);

  let pool: Pool;
  let pg: { query: (sql: string, params?: any[]) => Promise<any> };

  const OWNER = '79030169187';
  const ALIEN = '70000000000';

  /**
   * Заводит продукт напрямую в базе: провижининг здесь не проверяется.
   *
   * checkout_path и runner_token_hash — NOT NULL без DEFAULT в 001_products.sql,
   * и ни одна последующая миграция их не ослабляет: без них вставка падает
   * целиком. Хеш выведен из слага, потому что он UNIQUE — константа развалила бы
   * второй INSERT в сценариях с двумя продуктами.
   */
  const mkProduct = async (o: {
    user?: string; name: string; slug: string; domain?: string | null;
    kind?: string; status?: string;
  }) => {
    const r = await pool.query(
      `INSERT INTO products (user_id, name, slug, domain, kind, status,
                             checkout_path, runner_token_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        o.user ?? OWNER, o.name, o.slug, o.domain ?? null,
        o.kind ?? 'site', o.status ?? 'running',
        `/srv/${o.slug}`, `hash-${o.slug}`,
      ],
    );
    return r.rows[0].id as string;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: PG, max: 8 });
    pg = { query: (sql: string, params?: any[]) => pool.query(sql, params) };
    for (const f of MIGRATIONS) {
      await pool.query(fs.readFileSync(path.join(__dirname, 'migrations', f), 'utf8'));
    }
    // Гард на чужую базу: beforeEach делает TRUNCATE и адрес не разбирает, а на
    // той же ноде живёт база стенда test.linkeon.io с теми же таблицами.
    const n = await pool.query('SELECT count(*) FROM products');
    if (Number(n.rows[0].count) > 0) {
      throw new Error('PROVISIONING_PG_URL указывает на НЕпустую базу — нужна одноразовая');
    }
  });

  afterAll(async () => {
    await pool?.query('TRUNCATE products, product_turns RESTART IDENTITY CASCADE');
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE products, product_turns RESTART IDENTITY CASCADE');
  });

  describe('поиск продукта', () => {
    it('находит по куску имени', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, {} as any);
      const m = await svc.resolve(OWNER, 'цветов');
      expect(m.map((p) => p.id)).toEqual([id]);
    });

    it('находит по слагу и по домену', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers', domain: 'flowers.p.linkeon.io' });
      const svc = new ProductToolService(pg as any, {} as any);
      expect((await svc.resolve(OWNER, 'flowers')).map((p) => p.id)).toEqual([id]);
      expect((await svc.resolve(OWNER, 'flowers.p.linkeon.io')).map((p) => p.id)).toEqual([id]);
    });

    it('находит по идентификатору', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, {} as any);
      expect((await svc.resolve(OWNER, id)).map((p) => p.id)).toEqual([id]);
    });

    it('регистр не имеет значения', async () => {
      const id = await mkProduct({ name: 'Магазин Цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, {} as any);
      expect((await svc.resolve(OWNER, 'МАГАЗИН')).map((p) => p.id)).toEqual([id]);
    });

    // Главный сценарий спеки: два магазина, назвали «магазин».
    it('отдаёт ВСЕ совпадения, а не первое', async () => {
      const a = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const b = await mkProduct({ name: 'Магазин книг', slug: 'books' });
      const svc = new ProductToolService(pg as any, {} as any);
      const m = await svc.resolve(OWNER, 'магазин');
      expect(m.map((p) => p.id).sort()).toEqual([a, b].sort());
    });

    it('чужие продукты не находятся ничем — ни именем, ни идентификатором', async () => {
      const alien = await mkProduct({ user: ALIEN, name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, {} as any);
      expect(await svc.resolve(OWNER, 'магазин')).toEqual([]);
      expect(await svc.resolve(OWNER, alien)).toEqual([]);
      expect(await svc.resolve(OWNER, 'flowers')).toEqual([]);
    });

    it('архивированные не находятся', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      await pool.query('UPDATE products SET archived_at = now() WHERE id = $1', [id]);
      const svc = new ProductToolService(pg as any, {} as any);
      expect(await svc.resolve(OWNER, 'магазин')).toEqual([]);
    });

    // Без экранирования '%' пользовательский поиск «100%» превращается в
    // LIKE '%100\%%' → совпадает со ВСЕМ, и ассистент получает «неоднозначно»
    // на пустом месте. То же с '_' — он в LIKE значит «любой один символ».
    it('проценты и подчёркивания в запросе — обычные символы', async () => {
      await mkProduct({ name: 'Скидки 100% на всё', slug: 'sale' });
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, {} as any);
      expect((await svc.resolve(OWNER, '100%')).map((p) => p.name)).toEqual(['Скидки 100% на всё']);
      expect(await svc.resolve(OWNER, 'м_газин')).toEqual([]);
    });

    it('пустой запрос не ищет ничего', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, {} as any);
      expect(await svc.resolve(OWNER, '   ')).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec"'
```

Ожидается: FAIL, `Cannot find module './product-tool.service'`. **Если видишь `skipped` — переменная не доехала, прогона не было.**

- [ ] **Step 3: Написать реализацию**

`spirits_back/src/products/product-tool.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { TurnsService } from './turns.service';

/** Продукт глазами ассистента: без внутренностей, только то, что можно назвать вслух. */
export interface ProductMatch {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  kind: string;
  status: string;
}

@Injectable()
export class ProductToolService {
  private readonly logger = new Logger(ProductToolService.name);

  constructor(
    private readonly pg: PgService,
    private readonly turns: TurnsService,
  ) {}

  /**
   * Нестрогий поиск по имени плюс точные совпадения по слагу, домену и
   * идентификатору: последние три ассистент мог взять из `list` в том же
   * разговоре.
   *
   * Строгий разбор из BlockService.lookup() переиспользовать НЕЛЬЗЯ: он
   * отвечает «не найден» на «магазин цветов» при двух живых магазинах. Там
   * администратор приходит с доменом из жалобы и цена промаха — тихое гашение
   * чужого продукта; здесь цена — уточняющий вопрос.
   *
   * Владелец в WHERE, а не в проверке после выборки: разница между «нет
   * такого» и «есть, но не твой» — утечка существования чужих продуктов.
   */
  async resolve(userId: string, query: string): Promise<ProductMatch[]> {
    const raw = String(query ?? '').trim().toLowerCase();
    if (!raw) return [];
    // '%' и '_' — служебные символы LIKE. Без экранирования «100%» совпадает со
    // всем подряд, и ассистент получает «неоднозначно» там, где совпадение одно.
    const like = `%${raw.replace(/([\\%_])/g, '\\$1')}%`;
    const r = await this.pg.query(
      `SELECT id, name, slug, domain, kind, status
         FROM products
        WHERE user_id = $1 AND archived_at IS NULL
          AND ( id::text = $2
             OR lower(slug) = $2
             OR lower(domain) = $2
             OR lower(name) LIKE $3 )
        ORDER BY created_at DESC`,
      [userId, raw, like],
    );
    return r.rows;
  }
}
```

- [ ] **Step 4: Прогнать тест**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec"'
```

Ожидается: `Tests: 9 passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/products/product-tool.service.ts src/products/product-tool.spec.ts
git commit -m "feat(products): нестрогий поиск продукта по имени для ассистента"
```

---

### Task 4: Три конца хода различимы

Ассистент, сказавший «готово» после отката, хуже ассистента, не умеющего править. Разбор исхода живёт в одной функции, которой пользуются и `edit`, и `status`.

**Files:**
- Modify: `spirits_back/src/products/product-tool.service.ts`
- Modify: `spirits_back/src/products/product-tool.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Дописать в `product-tool.spec.ts` **ВНЕ** обёртки `maybe(...)` — на верхнем уровне файла, после её закрывающей скобки. Разбор исхода — чистая логика, базы ему не нужно; внутри `maybe` он пропускался бы вместе со всем файлом на обычном прогоне, то есть не проверялся бы почти никогда.

Заодно дописать `describeTurn` в существующий импорт в шапке:

```ts
import { ProductToolService, describeTurn } from './product-tool.service';
```

```ts
  describe('разбор исхода хода', () => {
    it('done — сделано, с расходом', () => {
      const d = describeTurn({ id: 't1', status: 'done', result: 'Добавил раздел', error: null, tokens_spent: 4200 });
      expect(d.outcome).toBe('done');
      expect(d.ok).toBe(true);
      expect(d.tokensSpent).toBe(4200);
    });

    // Главная опасность работы. ok:false — не украшение: McpController
    // выставляет isError по !ok, то есть модель видит откат как неуспех, а не
    // как результат с грустным текстом, который легко пересказать «готово».
    it('reverted — ОТКАТ, и это НЕ успех', () => {
      const d = describeTurn({ id: 't2', status: 'reverted', result: null, error: 'health check failed', tokens_spent: 0 });
      expect(d.outcome).toBe('reverted');
      expect(d.ok).toBe(false);
    });

    it('failed — не сделано', () => {
      const d = describeTurn({ id: 't3', status: 'failed', result: null, error: 'build error', tokens_spent: 0 });
      expect(d.outcome).toBe('failed');
      expect(d.ok).toBe(false);
    });

    it('три конца различимы между собой', () => {
      const outs = ['done', 'reverted', 'failed'].map((s) =>
        describeTurn({ id: 'x', status: s, result: null, error: null, tokens_spent: 0 }).outcome,
      );
      expect(new Set(outs).size).toBe(3);
    });

    // «Не дошло» — это ход, который продукт не забрал. Отдельно от running:
    // running значит «работают», queued значит «никто не взял», и это разные
    // новости для человека.
    it('queued и running — разные незаконченные состояния', () => {
      expect(describeTurn({ id: 'x', status: 'queued', result: null, error: null, tokens_spent: 0 }).outcome).toBe('queued');
      expect(describeTurn({ id: 'x', status: 'running', result: null, error: null, tokens_spent: 0 }).outcome).toBe('running');
    });

    it('незаконченный ход не объявляется ни успехом, ни провалом', () => {
      for (const s of ['queued', 'running']) {
        const d = describeTurn({ id: 'x', status: s, result: null, error: null, tokens_spent: 0 });
        expect(d.ok).toBe(true);
        expect(d.finished).toBe(false);
      }
    });

    it('законченные помечены finished', () => {
      for (const s of ['done', 'reverted', 'failed']) {
        expect(describeTurn({ id: 'x', status: s, result: null, error: null, tokens_spent: 0 }).finished).toBe(true);
      }
    });

    // count(*) и bigint приезжают из node-pg СТРОКОЙ. Без явного Number()
    // расход склеился бы строкой при сложении, а '0' прошёл бы как истинный.
    it('расход приходит строкой из драйвера и становится числом', () => {
      const d = describeTurn({ id: 'x', status: 'done', result: null, error: null, tokens_spent: '4200' as any });
      expect(d.tokensSpent).toBe(4200);
      expect(typeof d.tokensSpent).toBe('number');
    });
  });
```

Прогон без `PROVISIONING_PG_URL` обязан показать `Tests: 9 skipped, 8 passed, 17 total`. Все 17 в `skipped` — значит блок попал внутрь `maybe`.

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec"'
```

Ожидается: FAIL, `describeTurn is not a function`.

- [ ] **Step 3: Написать разбор исхода**

В `spirits_back/src/products/product-tool.service.ts` добавить ПЕРЕД классом:

```ts
/** Строка хода, как её отдаёт product_turns. */
export interface TurnRowLike {
  id: string;
  status: string;
  result: string | null;
  error: string | null;
  tokens_spent: number | string | null;
}

export interface TurnOutcome {
  /**
   * Успех вызова с точки зрения ассистента. ОТКАТ И ПРОВАЛ — НЕ УСПЕХ:
   * McpController выставляет isError по !ok, и модель видит их как ошибку, а не
   * как результат, который легко пересказать словом «готово». Это главная
   * опасность работы (см. спеку).
   */
  ok: boolean;
  outcome: 'done' | 'reverted' | 'failed' | 'queued' | 'running';
  /** Ход кончился хоть как-нибудь. queued/running — ещё нет. */
  finished: boolean;
  turnId: string;
  result: string | null;
  error: string | null;
  tokensSpent: number;
  /** Человеческая формулировка. Ассистент пересказывает её, а не выдумывает свою. */
  say: string;
}

/**
 * Единственное место, где статус хода превращается в новость для человека.
 * Одно на `edit` и `status`: разъехавшись, они сказали бы про один и тот же ход
 * разное — и пересказ «готово» после отката стал бы вопросом того, каким путём
 * ассистент о ходе узнал.
 *
 * count(*) и bigint приезжают из node-pg СТРОКОЙ, поэтому tokens_spent
 * приводится явно: без Number() расход «0» был бы истинным, а сложение с ним
 * дало бы склейку строк.
 */
export function describeTurn(row: TurnRowLike): TurnOutcome {
  const tokensSpent = Number(row.tokens_spent ?? 0) || 0;
  const base = { turnId: row.id, result: row.result ?? null, error: row.error ?? null, tokensSpent };
  switch (row.status) {
    case 'done':
      return { ...base, ok: true, outcome: 'done', finished: true,
        say: `Правка применена. Списано за ход: ${tokensSpent} токенов.` };
    case 'reverted':
      return { ...base, ok: false, outcome: 'reverted', finished: true,
        say: 'ПРАВКА НЕ ПРИМЕНЕНА: продукт не прошёл проверку здоровья, и код автоматически вернули как было. ' +
             'Скажи это пользователю прямо — не называй откат успехом.' };
    case 'failed':
      return { ...base, ok: false, outcome: 'failed', finished: true,
        say: 'ПРАВКА НЕ ВЫПОЛНЕНА: ход завершился ошибкой. Скажи это пользователю прямо.' };
    case 'queued':
      return { ...base, ok: true, outcome: 'queued', finished: false,
        say: 'Правка поставлена в очередь, но продукт её пока не забрал. Скажи, что задача принята, ' +
             'и предложи проверить через минуту действием status.' };
    default:
      return { ...base, ok: true, outcome: 'running', finished: false,
        say: 'Правка выполняется прямо сейчас. Скажи, что работа идёт, и предложи проверить действием status.' };
  }
}
```

- [ ] **Step 4: Прогнать тест**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec"'
```

Ожидается: `Tests: 16 passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/products/product-tool.service.ts src/products/product-tool.spec.ts
git commit -m "feat(products): три конца хода различимы, откат — не успех"
```

---

### Task 5: Действие list

**Files:**
- Modify: `spirits_back/src/products/product-tool.service.ts`
- Modify: `spirits_back/src/products/product-tool.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Дописать в `product-tool.spec.ts` внутрь `maybe(...)`:

```ts
  describe('действие list', () => {
    it('показывает свои продукты с адресом и состоянием', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers', domain: 'flowers.p.linkeon.io' });
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'list' });
      expect(out.ok).toBe(true);
      expect(out.products).toHaveLength(1);
      expect(out.products[0]).toMatchObject({
        name: 'Магазин цветов', domain: 'flowers.p.linkeon.io', status: 'running', kind: 'site',
      });
    });

    it('чужих продуктов не видно', async () => {
      await mkProduct({ user: ALIEN, name: 'Чужой магазин', slug: 'alien' });
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'list' });
      expect(out.products).toEqual([]);
    });

    // У бота домена нет вовсе: create() пишет domain только сайтам. Подсказка
    // обязана это учитывать, иначе ассистент скажет «адрес не указан» как про
    // поломку.
    it('у бота домена нет, и это сказано словами', async () => {
      await mkProduct({ name: 'Бот поддержки', slug: 'supbot', kind: 'bot', domain: null });
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'list' });
      expect(out.products[0].domain).toBeNull();
      expect(out.say).toMatch(/бот/i);
    });

    it('пустой список — это не ошибка', async () => {
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'list' });
      expect(out.ok).toBe(true);
      expect(out.products).toEqual([]);
      expect(out.say).toMatch(/нет|ни одного/i);
    });
  });
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec"'
```

Ожидается: FAIL, `svc.execute is not a function`.

- [ ] **Step 3: Написать реализацию**

В классе `ProductToolService` добавить:

```ts
  /**
   * Единственный вход инструмента. Владелец — ПЕРВЫМ аргументом и приезжает из
   * проверенной подписи токена (products-mcp.controller.ts), а не из поля
   * запроса: инструменту продуктов аргумента `userId` не дано вовсе.
   */
  async execute(userId: string, input: any): Promise<any> {
    const action = String(input?.action ?? '').trim();
    if (action === 'list') return this.list(userId);
    if (action === 'edit') return this.edit(userId, input);
    if (action === 'status') return this.status(userId, input);
    return {
      ok: false,
      reason: 'bad_action',
      say: 'Неизвестное действие. Доступны: list (показать продукты), edit (поставить правку), status (узнать исход правки).',
    };
  }

  private async list(userId: string) {
    const products = await this.pg
      .query(
        `SELECT id, name, slug, domain, kind, status
           FROM products
          WHERE user_id = $1 AND archived_at IS NULL
          ORDER BY created_at DESC`,
        [userId],
      )
      .then((r) => r.rows as ProductMatch[]);

    if (!products.length) {
      return {
        ok: true,
        products,
        say: 'У пользователя нет ни одного продукта. Завести продукт ты не можешь — это делается кнопкой ' +
             'в кабинете, вкладка «Продукты».',
      };
    }
    const hasBot = products.some((p) => p.kind === 'bot');
    return {
      ok: true,
      products,
      say:
        'Продукты пользователя. Правку ставь действием edit, назвав продукт именем.' +
        (hasBot ? ' У бота домена нет вовсе — это нормально, а не поломка: адрес есть только у сайтов.' : ''),
    };
  }
```

- [ ] **Step 4: Прогнать тест**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec"'
```

Ожидается: `Tests: 20 passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/products/product-tool.service.ts src/products/product-tool.spec.ts
git commit -m "feat(products): действие list — ассистент видит продукты владельца"
```

---

### Task 6: Действие edit — постановка правки и отказы

**Files:**
- Modify: `spirits_back/src/products/product-tool.service.ts`
- Modify: `spirits_back/src/products/product-tool.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Дописать в `product-tool.spec.ts` внутрь `maybe(...)`. Добавить импорты в шапку файла:

```ts
import { TurnsService, SLEEPING_REFUSAL, BLOCKED_REFUSAL } from './turns.service';
```

И блок:

```ts
  describe('действие edit', () => {
    /** Настоящий TurnsService на том же пуле: заглушка не исполняет предусловия. */
    const realTurns = (balanceOk = true) =>
      new TurnsService(pg as any, {
        checkTokenBalance: async () => ({ ok: balanceOk }),
        deductTokens: async (_u: string, n: number) => n,
      } as any);

    it('ставит ровно ОДИН ход', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, realTurns());
      (svc as any).waitMs = 0; // не ждём исхода — здесь проверяется постановка
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'цветов', prompt: 'Добавь раздел «О нас»' });
      expect(out.turnId).toBeTruthy();
      const n = await pool.query('SELECT count(*) FROM product_turns');
      expect(Number(n.rows[0].count)).toBe(1);
    });

    it('текст правки доезжает до хода дословно', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, realTurns());
      (svc as any).waitMs = 0;
      await svc.execute(OWNER, { action: 'edit', product: 'цветов', prompt: 'Добавь раздел «О нас»' });
      const r = await pool.query('SELECT prompt, channel FROM product_turns');
      expect(r.rows[0].prompt).toBe('Добавь раздел «О нас»');
      expect(r.rows[0].channel).toBe('web');
    });

    it('два магазина на «магазин» — УТОЧНЯЕТ, а не выбирает', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      await mkProduct({ name: 'Магазин книг', slug: 'books' });
      const svc = new ProductToolService(pg as any, realTurns());
      // Потолок в ноль не ради скорости зелёного прогона — ради ВНЯТНОСТИ
      // красного. Измерено: со снятой веткой уточнения тест уходит в боевое
      // ожидание (150 с), умирает на таймауте jest в 60 с и рапортует
      // «timeout» вместо «поставлен ход, которого быть не должно». С этой
      // строкой мутация краснеет за 82 мс внятным утверждением.
      (svc as any).waitMs = 0;
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'магазин', prompt: 'что-нибудь' });
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('ambiguous');
      expect(out.matches).toHaveLength(2);
      const n = await pool.query('SELECT count(*) FROM product_turns');
      expect(Number(n.rows[0].count)).toBe(0); // ход НЕ поставлен
    });

    it('не нашли — отказ со списком того, что есть', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, realTurns());
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'кофейня', prompt: 'что-нибудь' });
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('not_found');
      expect(out.products).toHaveLength(1);
    });

    it('чужой продукт по его идентификатору — не найден', async () => {
      const alien = await mkProduct({ user: ALIEN, name: 'Чужой магазин', slug: 'alien' });
      const svc = new ProductToolService(pg as any, realTurns());
      const out: any = await svc.execute(OWNER, { action: 'edit', product: alien, prompt: 'сломай' });
      expect(out.reason).toBe('not_found');
      const n = await pool.query('SELECT count(*) FROM product_turns');
      expect(Number(n.rows[0].count)).toBe(0);
    });

    it('без текста правки ход не ставится', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, realTurns());
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'цветов', prompt: '  ' });
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('no_prompt');
      const n = await pool.query('SELECT count(*) FROM product_turns');
      expect(Number(n.rows[0].count)).toBe(0);
    });

    // Спящий и погашенный — РАЗНЫЕ новости. Кабинет держит разницу кодами
    // (402 и 409); слить их значит предложить пополнение тому, кого деньгами
    // не починишь.
    it('спящий — отказ С предложением пополнить', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers', status: 'sleeping' });
      const svc = new ProductToolService(pg as any, realTurns());
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'цветов', prompt: 'правка' });
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('sleeping');
      expect(out.canTopUp).toBe(true);
      expect(out.say).toContain(SLEEPING_REFUSAL);
    });

    it('погашенный — отказ БЕЗ предложения пополнить', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers', status: 'blocked' });
      const svc = new ProductToolService(pg as any, realTurns());
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'цветов', prompt: 'правка' });
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('blocked');
      expect(out.canTopUp).toBe(false);
      expect(out.say).toContain(BLOCKED_REFUSAL);
    });

    it('спящий и погашенный различимы по признаку пополнения', async () => {
      await mkProduct({ name: 'Спящий', slug: 'a', status: 'sleeping' });
      await mkProduct({ name: 'Погашенный', slug: 'b', status: 'blocked' });
      const svc = new ProductToolService(pg as any, realTurns());
      const s: any = await svc.execute(OWNER, { action: 'edit', product: 'спящий', prompt: 'x' });
      const b: any = await svc.execute(OWNER, { action: 'edit', product: 'погашенный', prompt: 'x' });
      expect(s.reason).not.toBe(b.reason);
      expect(s.canTopUp).not.toBe(b.canTopUp);
    });

    it('нет токенов — свой отказ, не слитый со спящим', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, realTurns(false));
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'цветов', prompt: 'правка' });
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('no_tokens');
      expect(out.canTopUp).toBe(true);
    });

    it('агент уже занят — отказ, второй ход не ставится', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      await pool.query(
        `INSERT INTO product_turns (product_id, user_id, channel, prompt, status)
         VALUES ($1, $2, 'web', 'первая', 'running')`,
        [id, OWNER],
      );
      const svc = new ProductToolService(pg as any, realTurns());
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'цветов', prompt: 'вторая' });
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('busy');
      const n = await pool.query('SELECT count(*) FROM product_turns');
      expect(Number(n.rows[0].count)).toBe(1);
    });

    it('дождался конца — отдаёт исход хода, а не «поставлено»', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, realTurns());
      (svc as any).waitMs = 4_000;
      (svc as any).pollMs = 100;
      // Пока инструмент ждёт, «раннер» дописывает ход как откат.
      setTimeout(() => {
        pool.query(
          `UPDATE product_turns SET status = 'reverted', error = 'health check failed', finished_at = now()
            WHERE product_id = $1`,
          [id],
        );
      }, 300);
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'цветов', prompt: 'правка' });
      expect(out.outcome).toBe('reverted');
      expect(out.ok).toBe(false);
    });

    it('не дождался — честное «идёт» с идентификатором хода', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, realTurns());
      (svc as any).waitMs = 300;
      (svc as any).pollMs = 100;
      const out: any = await svc.execute(OWNER, { action: 'edit', product: 'цветов', prompt: 'правка' });
      expect(out.finished).toBe(false);
      expect(out.outcome).toBe('queued');
      expect(out.turnId).toBeTruthy();
      expect(out.say).toMatch(/status/);
    });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec"'
```

Ожидается: FAIL в 13 новых тестах (`reason` undefined и т.п.).

- [ ] **Step 3: Написать реализацию**

В шапку `product-tool.service.ts` добавить импорты:

```ts
import { PRODUCT_TOOL_WAIT_MS } from '../common/relay-budget';
import { SLEEPING_REFUSAL, BLOCKED_REFUSAL } from './turns.service';
```

В класс `ProductToolService` добавить поля и методы:

```ts
  /**
   * Потолок ожидания и шаг опроса — поля, а не константы в теле, ровно ради
   * тестов: сценарии «дождался» и «не дождался» иначе шли бы по 150 секунд
   * каждый. В работе не переопределяются никогда.
   */
  private waitMs = PRODUCT_TOOL_WAIT_MS;
  private pollMs = 2_000;

  private async edit(userId: string, input: any) {
    const prompt = String(input?.prompt ?? '').trim();
    if (!prompt) {
      return { ok: false, reason: 'no_prompt', say: 'Не сказано, что именно править. Спроси у пользователя и повтори вызов.' };
    }

    const matches = await this.resolve(userId, String(input?.product ?? ''));

    if (matches.length > 1) {
      return {
        ok: false,
        reason: 'ambiguous',
        matches,
        say: 'Под это описание подходит несколько продуктов. СПРОСИ у пользователя, какой именно править, ' +
             'и повтори вызов с точным именем или слагом. Не выбирай сам.',
      };
    }

    if (matches.length === 0) {
      const products = (await this.list(userId)).products;
      return {
        ok: false,
        reason: 'not_found',
        products,
        say: products.length
          ? 'Такого продукта у пользователя нет. Вот что есть — уточни, какой из них он имел в виду.'
          : 'У пользователя нет ни одного продукта. Завести продукт ты не можешь — это делается кнопкой в кабинете.',
      };
    }

    const product = matches[0];
    let turnId: string;
    try {
      const turn = await this.turns.enqueue({ productId: product.id, userId, channel: 'web', prompt });
      turnId = turn.id;
    } catch (e: any) {
      return this.refusal(e, product);
    }

    return { ...(await this.waitForOutcome(turnId)), product };
  }

  /**
   * Отказы `enqueue` разбираются по ЭКСПОРТИРОВАННЫМ константам, а не по
   * подстроке в тексте: тексты правят, и сверка по куску фразы разъезжается
   * молча. Сон и гашение обязаны остаться РАЗНЫМИ причинами — погашенному
   * нельзя предлагать пополнение, деньгами он не чинится (кабинет держит ту же
   * разницу кодами 402 и 409).
   */
  private refusal(e: any, product: ProductMatch) {
    const msg = typeof e?.response === 'string' ? e.response : (e?.response?.message ?? e?.message ?? '');
    if (msg === SLEEPING_REFUSAL) {
      return { ok: false, reason: 'sleeping', canTopUp: true, product, say: SLEEPING_REFUSAL };
    }
    if (msg === BLOCKED_REFUSAL) {
      return { ok: false, reason: 'blocked', canTopUp: false, product,
        say: BLOCKED_REFUSAL + ' НЕ предлагай пользователю пополнить баланс — это не поможет.' };
    }
    if (msg === 'Недостаточно токенов') {
      return { ok: false, reason: 'no_tokens', canTopUp: true, product,
        say: 'На балансе пользователя нет токенов на ход. Предложи пополнить баланс.' };
    }
    if (msg === 'Агент уже работает над предыдущим запросом') {
      return { ok: false, reason: 'busy', canTopUp: false, product,
        say: 'Продукт уже выполняет предыдущую правку. Дождись её конца (действие status) и повтори.' };
    }
    if (e?.status === 404 || msg === 'Product not found') {
      return { ok: false, reason: 'not_found', product, say: 'Продукт не найден.' };
    }
    this.logger.warn(`edit: продукт ${product.slug} отбил правку: ${msg}`);
    return { ok: false, reason: 'refused', canTopUp: false, product,
      say: `Продукт не принял правку: ${msg || 'причина неизвестна'}` };
  }

  /**
   * Ожидание с потолком. Успели — ассистент рассказывает исход сразу; не
   * успели — честное «идёт» и предложение посмотреть действием status.
   *
   * Ждать до конца нельзя: правка идёт минуты, и ответ чата к тому времени
   * уже не дойдёт. Не ждать совсем — тоже: «поставил» без продолжения это то
   * самое молчаливое «готово».
   */
  private async waitForOutcome(turnId: string): Promise<TurnOutcome> {
    const deadline = Date.now() + this.waitMs;
    let seen = await this.readTurn(turnId);
    while (!seen.finished && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, this.pollMs));
      seen = await this.readTurn(turnId);
    }
    return seen;
  }

  private async readTurn(turnId: string): Promise<TurnOutcome> {
    const r = await this.pg.query(
      `SELECT id, status, result, error, tokens_spent FROM product_turns WHERE id = $1`,
      [turnId],
    );
    return describeTurn(r.rows[0]);
  }
```

- [ ] **Step 4: Прогнать тест и типовой гейт**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec" && \
  npx tsc --noEmit -p tsconfig.build.json'
```

Ожидается: `Tests: 33 passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/products/product-tool.service.ts src/products/product-tool.spec.ts
git commit -m "feat(products): действие edit — правка ходом, ожидание с потолком, раздельные отказы"
```

---

### Task 7: Действие status

**Files:**
- Modify: `spirits_back/src/products/product-tool.service.ts`
- Modify: `spirits_back/src/products/product-tool.spec.ts`

- [ ] **Step 1: Написать падающий тест**

Дописать в `product-tool.spec.ts` внутрь `maybe(...)`:

```ts
  describe('действие status', () => {
    it('по продукту отдаёт исход последнего хода', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      await pool.query(
        `INSERT INTO product_turns (product_id, user_id, channel, prompt, status, result, tokens_spent, finished_at)
         VALUES ($1, $2, 'web', 'правка', 'done', 'Готово', 4200, now())`,
        [id, OWNER],
      );
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'status', product: 'цветов' });
      expect(out.outcome).toBe('done');
      expect(out.tokensSpent).toBe(4200);
    });

    it('откат в истории остаётся откатом', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      await pool.query(
        `INSERT INTO product_turns (product_id, user_id, channel, prompt, status, error, finished_at)
         VALUES ($1, $2, 'web', 'правка', 'reverted', 'health check failed', now())`,
        [id, OWNER],
      );
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'status', product: 'цветов' });
      expect(out.outcome).toBe('reverted');
      expect(out.ok).toBe(false);
    });

    it('берёт САМЫЙ СВЕЖИЙ ход, а не первый попавшийся', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      await pool.query(
        `INSERT INTO product_turns (product_id, user_id, channel, prompt, status, finished_at, created_at)
         VALUES ($1, $2, 'web', 'старая', 'done', now() - interval '2 hour', now() - interval '2 hour')`,
        [id, OWNER],
      );
      await pool.query(
        `INSERT INTO product_turns (product_id, user_id, channel, prompt, status, error, finished_at, created_at)
         VALUES ($1, $2, 'web', 'свежая', 'failed', 'build error', now(), now())`,
        [id, OWNER],
      );
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'status', product: 'цветов' });
      expect(out.outcome).toBe('failed');
    });

    it('по идентификатору хода — тот самый ход', async () => {
      const id = await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const t = await pool.query(
        `INSERT INTO product_turns (product_id, user_id, channel, prompt, status, finished_at)
         VALUES ($1, $2, 'web', 'старая', 'done', now()) RETURNING id`,
        [id, OWNER],
      );
      await pool.query(
        `INSERT INTO product_turns (product_id, user_id, channel, prompt, status, error, finished_at)
         VALUES ($1, $2, 'web', 'свежая', 'failed', 'build error', now())`,
        [id, OWNER],
      );
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'status', turnId: t.rows[0].id });
      expect(out.outcome).toBe('done');
    });

    it('чужой ход по его идентификатору не отдаётся', async () => {
      const alien = await mkProduct({ user: ALIEN, name: 'Чужой', slug: 'alien' });
      const t = await pool.query(
        `INSERT INTO product_turns (product_id, user_id, channel, prompt, status, finished_at)
         VALUES ($1, $2, 'web', 'чужая', 'done', now()) RETURNING id`,
        [alien, ALIEN],
      );
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'status', turnId: t.rows[0].id });
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('not_found');
    });

    it('ходов не было — так и сказано', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      const svc = new ProductToolService(pg as any, {} as any);
      const out: any = await svc.execute(OWNER, { action: 'status', product: 'цветов' });
      expect(out.reason).toBe('no_turns');
      expect(out.say).toMatch(/не было|ни одной/i);
    });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec"'
```

Ожидается: FAIL в 6 новых тестах.

- [ ] **Step 3: Написать реализацию**

В класс `ProductToolService` добавить:

```ts
  /**
   * Владелец в WHERE обоих запросов, включая поиск по turnId: без этого
   * ассистент читал бы исход чужой правки, зная только её идентификатор.
   */
  private async status(userId: string, input: any) {
    const turnId = String(input?.turnId ?? '').trim();
    if (turnId) {
      const r = await this.pg.query(
        `SELECT t.id, t.status, t.result, t.error, t.tokens_spent
           FROM product_turns t
           JOIN products p ON p.id = t.product_id
          WHERE t.id = $1 AND p.user_id = $2 AND p.archived_at IS NULL`,
        [turnId, userId],
      );
      if (!r.rows[0]) {
        return { ok: false, reason: 'not_found', say: 'Такой правки у пользователя нет.' };
      }
      return describeTurn(r.rows[0]);
    }

    const matches = await this.resolve(userId, String(input?.product ?? ''));
    if (matches.length > 1) {
      return { ok: false, reason: 'ambiguous', matches,
        say: 'Под это описание подходит несколько продуктов. Спроси, про какой именно рассказать.' };
    }
    if (matches.length === 0) {
      return { ok: false, reason: 'not_found', say: 'Такого продукта у пользователя нет.' };
    }

    const r = await this.pg.query(
      `SELECT id, status, result, error, tokens_spent
         FROM product_turns
        WHERE product_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [matches[0].id, userId],
    );
    if (!r.rows[0]) {
      return { ok: false, reason: 'no_turns', product: matches[0],
        say: 'У этого продукта ещё не было ни одной правки.' };
    }
    return { ...describeTurn(r.rows[0]), product: matches[0] };
  }
```

- [ ] **Step 4: Прогнать тест и типовой гейт**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.spec" && \
  npx tsc --noEmit -p tsconfig.build.json'
```

Ожидается: `Tests: 39 passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/products/product-tool.service.ts src/products/product-tool.spec.ts
git commit -m "feat(products): действие status — чем кончился поставленный ход"
```

---

### Task 8: Описание инструмента

Описание — не документация, а единственное, что читает модель перед вызовом. Требование «не называть успехом откат» живёт здесь и в `describeTurn`.

**Files:**
- Modify: `spirits_back/src/products/product-tool.service.ts`
- Create: `spirits_back/src/products/product-tool.defs.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/src/products/product-tool.defs.spec.ts`:

```ts
import { PRODUCT_TOOLS, PRODUCT_TOOL_NAME } from './product-tool.service';

describe('определение инструмента продуктов', () => {
  const tool = () => PRODUCT_TOOLS.find((t) => t.name === PRODUCT_TOOL_NAME)!;

  it('инструмент ровно один, с тремя действиями', () => {
    expect(PRODUCT_TOOLS).toHaveLength(1);
    expect((tool().input_schema as any).properties.action.enum.sort()).toEqual(['edit', 'list', 'status']);
  });

  // Аргумента userId здесь быть НЕ ДОЛЖНО: владелец приезжает из подписи
  // токена. Появление поля вернуло бы дыру, ради закрытия которой заведена
  // отдельная точка /mcp/products.
  it('аргумента userId нет вовсе', () => {
    const props = (tool().input_schema as any).properties;
    expect(Object.keys(props)).not.toContain('userId');
    expect((tool().input_schema as any).required).not.toContain('userId');
  });

  it('описание прямо запрещает называть откат успехом', () => {
    expect(tool().description).toMatch(/откат/i);
    expect(tool().description).toMatch(/не.{0,40}(успех|готово)/i);
  });

  it('описание требует назвать расход', () => {
    expect(tool().description).toMatch(/токен/i);
  });

  it('описание запрещает обещать до вызова', () => {
    expect(tool().description).toMatch(/не говори|пока не вызвал/i);
  });

  it('описание требует уточнять при неоднозначности', () => {
    expect(tool().description).toMatch(/уточн|спрос/i);
  });

  it('описание говорит, что завести и погасить продукт нельзя', () => {
    expect(tool().description).toMatch(/не можешь.{0,80}(завест|создат)/i);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.defs"'
```

Ожидается: FAIL, `PRODUCT_TOOLS is not defined`.

- [ ] **Step 3: Написать определение**

В `spirits_back/src/products/product-tool.service.ts` добавить в конец файла:

```ts
export const PRODUCT_TOOL_NAME = 'manage_product';

/**
 * Один инструмент с перечислением действий, по образцу manage_routine. Три
 * отдельных имени с пересекающимися описаниями модель путает чаще.
 *
 * Аргумента userId здесь нет и быть не должно: владелец приезжает из подписи
 * токена сессии (products-mcp.controller.ts). Общая точка /mcp принимает
 * userId полем запроса — поэтому ЭТОТ инструмент туда не добавляется.
 */
export const PRODUCT_TOOLS = [
  {
    name: PRODUCT_TOOL_NAME,
    description:
      'Посмотреть и ПРАВИТЬ продукты пользователя (сайты и телеграм-боты, которые он разместил в Линкеоне). ' +
      'Ты видишь только продукты этого пользователя — чужих тебе не покажут ни по имени, ни по идентификатору.\n' +
      '• action="list" — показать его продукты: имя, адрес, состояние. У ботов адреса нет вовсе — это норма.\n' +
      '• action="edit" — поставить правку: product (как пользователь назвал продукт) + prompt (что именно сделать, ' +
      'своими словами и подробно — правку исполняет ассистент внутри продукта, он видит только его файлы).\n' +
      '• action="status" — узнать, чем кончилась правка: product или turnId.\n' +
      'ДВА РАЗНЫХ ПОЛЯ В ОТВЕТЕ, и они НИКОГДА не приходят вместе. Если правку приняли в работу — придёт ' +
      'outcome (чем кончился ход). Если правку не приняли вовсе — придёт reason (почему отказали), и никакого ' +
      'outcome не будет. Не ищи outcome в отказе и не выдавай отказ за исход.\n' +
      'ЕСЛИ ПРИШЁЛ outcome — он значит РАЗНОЕ:\n' +
      '  – "done" — правка применена. Только это успех. Назови пользователю расход в токенах из tokensSpent.\n' +
      '  – "reverted" — ОТКАТ: продукт не прошёл проверку здоровья, код вернули как было. ' +
      'НИКОГДА не говори «готово», «сделал», «применил» — скажи прямо, что правка не прошла и всё вернулось назад.\n' +
      '  – "failed" — правка не выполнена, ход завершился ошибкой. Тоже не успех.\n' +
      '  – "running" / "queued" — правка ещё идёт. Скажи честно, что работа выполняется, и предложи посмотреть ' +
      'через минуту: ты сам вызовешь action="status" с этим turnId.\n' +
      'ВАЖНО: не говори «поправил / сделал / обновил», ПОКА не вызвал инструмент и не получил outcome="done". ' +
      'Не выдумывай эту возможность без вызова.\n' +
      'ЕСЛИ вернулось reason="ambiguous" — под описание подошло несколько продуктов: СПРОСИ у пользователя, ' +
      'какой именно править, и вызови снова с точным именем. Не выбирай сам.\n' +
      'ЕСЛИ reason="sleeping" — продукт спит из-за нехватки токенов на аренду: предложи пополнить баланс. ' +
      'ЕСЛИ reason="blocked" — продукт остановлен администратором: пополнение НЕ ПОМОЖЕТ, не предлагай его.\n' +
      'ЧЕГО ТЫ НЕ МОЖЕШЬ: завести новый продукт (это кнопка в кабинете, вкладка «Продукты»; продуктов не больше ' +
      'двух на аккаунт), погасить продукт, загрузить в него файлы. Не обещай этого.\n' +
      'ПРО ДЕНЬГИ: разговор с тобой и правка продукта тарифицируются ОТДЕЛЬНО. Когда сообщаешь результат правки — ' +
      'назови расход за ход, чтобы два списания за одну просьбу не выглядели ошибкой.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'edit', 'status'] },
        product: {
          type: 'string',
          description: 'Как пользователь назвал продукт: имя («магазин цветов»), слаг или домен. Для edit обязательно.',
        },
        prompt: {
          type: 'string',
          description: 'Что именно сделать с продуктом. Подробно и своими словами. Обязательно для edit.',
        },
        turnId: {
          type: 'string',
          description: 'Идентификатор правки из прошлого вызова edit. Для status вместо product.',
        },
      },
      required: ['action'],
    },
  },
];
```

- [ ] **Step 4: Прогнать тест**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool.defs"'
```

Ожидается: `Tests: 7 passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/products/product-tool.service.ts src/products/product-tool.defs.spec.ts
git commit -m "feat(products): описание инструмента — откат не выдать за успех"
```

---

### Task 9: Точка `/webhook/mcp/products` — владелец из подписи

**Files:**
- Create: `spirits_back/src/mcp/products-mcp.controller.ts`
- Create: `spirits_back/src/mcp/products-mcp.controller.spec.ts`
- Modify: `spirits_back/src/products/products.module.ts`
- Modify: `spirits_back/src/mcp/mcp.module.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/src/mcp/products-mcp.controller.spec.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import { ProductsMcpController } from './products-mcp.controller';
import { signProductToolToken } from '../products/product-tool.token';
import * as jwt from 'jsonwebtoken';

describe('точка /mcp/products', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = 'test-secret-for-product-tool'; });
  afterAll(() => { process.env.JWT_SECRET = OLD; });

  const make = () => {
    const calls: any[] = [];
    const tool = { execute: jest.fn(async (userId: string, input: any) => { calls.push({ userId, input }); return { ok: true }; }) };
    return { ctrl: new ProductsMcpController(tool as any), calls, tool };
  };

  it('владелец берётся ИЗ ТОКЕНА', async () => {
    const { ctrl, calls } = make();
    await ctrl.callTool(`Bearer ${signProductToolToken('79030169187')}`, { action: 'list' });
    expect(calls[0].userId).toBe('79030169187');
  });

  // Главная защита этой точки. Поле userId в запросе не должно значить НИЧЕГО:
  // иначе возвращается ровно та дыра, из-за которой инструмент не отдали общей
  // точке /mcp (там userId пишет модель — mcp.controller.ts:74).
  it('поле userId в запросе игнорируется полностью', async () => {
    const { ctrl, calls } = make();
    await ctrl.callTool(`Bearer ${signProductToolToken('79030169187')}`, { action: 'list', userId: '70000000000' });
    expect(calls[0].userId).toBe('79030169187');
    expect(calls[0].input.userId).toBeUndefined();
  });

  it('без токена — отказ, инструмент не зовётся', async () => {
    const { ctrl, tool } = make();
    await expect(ctrl.callTool(undefined, { action: 'list' })).rejects.toThrow(UnauthorizedException);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('чужая подпись — отказ', async () => {
    const { ctrl, tool } = make();
    const alien = jwt.sign({ userId: '79030169187', type: 'product-tool' }, 'not-our-secret');
    await expect(ctrl.callTool(`Bearer ${alien}`, { action: 'list' })).rejects.toThrow(UnauthorizedException);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('access-токен пользователя сюда не пускают', async () => {
    const { ctrl, tool } = make();
    const access = jwt.sign({ userId: '79030169187', type: 'access' }, process.env.JWT_SECRET!);
    await expect(ctrl.callTool(`Bearer ${access}`, { action: 'list' })).rejects.toThrow(UnauthorizedException);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('общий MCP_SECRET здесь не работает', async () => {
    const { ctrl, tool } = make();
    process.env.MCP_SECRET = 'shared-secret';
    await expect(ctrl.callTool('Bearer shared-secret', { action: 'list' })).rejects.toThrow(UnauthorizedException);
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('список инструментов отдаётся без аргумента userId', () => {
    const { ctrl } = make();
    const tools = ctrl.listTools();
    expect(tools).toHaveLength(1);
    expect(Object.keys((tools[0] as any).inputSchema.properties)).not.toContain('userId');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/mcp/products-mcp"'
```

Ожидается: FAIL, `Cannot find module './products-mcp.controller'`.

- [ ] **Step 3: Написать контроллер**

`spirits_back/src/mcp/products-mcp.controller.ts`:

```ts
import { Controller, Post, Get, Delete, Req, Res, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { PRODUCT_TOOLS, ProductToolService } from '../products/product-tool.service';
import { verifyProductToolToken } from '../products/product-tool.token';

/**
 * Отдельная точка, а не ветка в /mcp, СОЗНАТЕЛЬНО.
 *
 * На общей точке владелец приезжает полем запроса, которое пишет модель
 * (mcp.controller.ts:74, релей подсказывает телефон в системном промпте —
 * relay-agent/server.mjs:378). Для картинок это цена в токенах, для продуктов —
 * правка чужого сайта.
 *
 * Здесь Bearer — подписанный нами токен сессии с userId внутри, поэтому
 * принадлежность закрыта ПОДПИСЬЮ, а не проверкой: аргумента userId у
 * инструмента нет вовсе, и подделать его нечем. Тот же приём, что у TalerID
 * (пер-сессионный токен в заголовке), и та же линия, что у метки машины,
 * которая и есть её токен.
 */
@Controller('/mcp/products')
export class ProductsMcpController {
  private readonly logger = new Logger(ProductsMcpController.name);

  constructor(private readonly tool: ProductToolService) {}

  /** Владелец из Bearer. Бросает — значит звать инструмент нечем. */
  private owner(authHeader?: string): string {
    const raw = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    if (!raw) throw new UnauthorizedException('Нет токена');
    try {
      return verifyProductToolToken(raw);
    } catch (e: any) {
      throw new UnauthorizedException(`Токен не принят: ${e?.message}`);
    }
  }

  /** Вынесено из makeServer ради проверяемости: контракт схемы — часть защиты. */
  listTools() {
    return PRODUCT_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema,
    }));
  }

  /** Вынесено из makeServer по той же причине: здесь живёт разбор владельца. */
  async callTool(authHeader: string | undefined, args: any) {
    const userId = this.owner(authHeader);
    // userId из запроса выбрасывается ЯВНО, а не игнорируется по невнимательности:
    // поле могло бы приехать и перекрыть владельца при любой будущей правке
    // execute(), которая начнёт заглядывать в input.
    const { userId: _drop, ...input } = args ?? {};
    return this.tool.execute(userId, input);
  }

  private makeServer(authHeader?: string): Server {
    const server = new Server({ name: 'linkeon-products', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.listTools() }));
    server.setRequestHandler(CallToolRequestSchema, async (req: any) => {
      const { name, arguments: args } = req.params ?? {};
      if (name !== PRODUCT_TOOLS[0].name) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `Неизвестный инструмент: ${name}` }) }], isError: true };
      }
      const result: any = await this.callTool(authHeader, args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok };
    });
    return server;
  }

  @Post()
  async post(@Req() req: Request, @Res() res: Response, @Headers('authorization') auth?: string) {
    this.owner(auth); // отказ до всякой работы, как на общей точке
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = this.makeServer(auth);
    try {
      await server.connect(transport);
      await transport.handleRequest(req as any, res, req.body);
      res.on('close', () => {
        try { transport.close(); server.close(); } catch {}
      });
    } catch (e: any) {
      this.logger.error(`mcp/products failed: ${e?.message || e}`);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  }

  @Get()
  async get(@Res() res: Response, @Headers('authorization') auth?: string) {
    this.owner(auth);
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless mode)' }, id: null });
  }

  @Delete()
  async delete(@Res() res: Response, @Headers('authorization') auth?: string) {
    this.owner(auth);
    res.status(204).send();
  }
}
```

- [ ] **Step 4: Подключить в модулях**

В `spirits_back/src/products/products.module.ts`: добавить импорт

```ts
import { ProductToolService } from './product-tool.service';
```

добавить `ProductToolService` в массив `providers` и в массив `exports`.

В `spirits_back/src/mcp/mcp.module.ts` заменить содержимое на:

```ts
import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { ProductsMcpController } from './products-mcp.controller';
import { ChatModule } from '../chat/chat.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ChatModule, ProductsModule],
  controllers: [McpController, ProductsMcpController],
})
export class McpModule {}
```

- [ ] **Step 5: Прогнать тесты и типовой гейт**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/(mcp|products)/product" && \
  npx tsc --noEmit -p tsconfig.build.json'
```

Ожидается: `Tests: 19 passed` (5 токен + 7 описание + 7 контроллер). Расхождение — значит файл пропущен, а не «тестов стало больше»: сверь список `PASS` в выводе.

- [ ] **Step 6: Проверить, что приложение поднимается**

Циклический импорт модулей (`ProductsModule` ↔ `McpModule`) уронил бы старт молча в тестах и громко на проде.

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npm run build 2>&1 | tail -5'
```

Ожидается: сборка без ошибок. (`ProductsModule` не импортирует `ChatModule` и `McpModule` — цикла нет; шаг это подтверждает.)

- [ ] **Step 7: Коммит**

```bash
git add src/mcp/products-mcp.controller.ts src/mcp/products-mcp.controller.spec.ts src/mcp/mcp.module.ts src/products/products.module.ts
git commit -m "feat(products): точка /mcp/products — владелец из подписи, не из аргумента"
```

---

### Task 10: Бэкенд отдаёт релею токен и адрес

**Files:**
- Modify: `spirits_back/src/chat/chat.service.ts` (рядом с `fd.append('talerid_token', …)`, строки 1577-1581)
- Create: `spirits_back/src/chat/products-relay-fields.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/src/chat/products-relay-fields.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { productsRelayFields } from './products-relay-fields';
import { verifyProductToolToken } from '../products/product-tool.token';

describe('поля инструмента продуктов для релея', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = 'test-secret-for-product-tool'; });
  afterAll(() => { process.env.JWT_SECRET = OLD; });

  it('токен разбирается обратно в того же пользователя', () => {
    const f = productsRelayFields('79030169187');
    expect(verifyProductToolToken(f.products_token)).toBe('79030169187');
  });

  it('адрес точки — https и ведёт на /mcp/products', () => {
    const f = productsRelayFields('79030169187');
    expect(f.products_mcp_url).toMatch(/^https:\/\//);
    // Именно /webhook/mcp/products: исключение глобального префикса в main.ts
    // покрывает точный путь `mcp`, но не его подпути (см. «Что выяснилось»).
    expect(f.products_mcp_url).toMatch(/\/webhook\/mcp\/products$/);
  });

  it('база берётся из окружения, хвостовой слеш не дублируется', () => {
    const old = process.env.BACKEND_URL;
    process.env.BACKEND_URL = 'https://test.linkeon.io/';
    expect(productsRelayFields('79030169187').products_mcp_url).toBe('https://test.linkeon.io/webhook/mcp/products');
    process.env.BACKEND_URL = old;
  });

  // Поля обязаны реально уезжать на релей. Без этого инструмент собран,
  // проверен и недоступен ассистенту — ровно тот тихий отказ, на котором в
  // куске 4а автооткат был выключен целиком при зелёных тестах.
  it('chat.service действительно шлёт оба поля', () => {
    const src = fs.readFileSync(path.join(__dirname, 'chat.service.ts'), 'utf8');
    expect(src).toContain('productsRelayFields');
    expect(src).toContain("fd.append('products_token'");
    expect(src).toContain("fd.append('products_mcp_url'");
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/chat/products-relay-fields"'
```

Ожидается: FAIL, `Cannot find module './products-relay-fields'`.

- [ ] **Step 3: Написать хелпер**

`spirits_back/src/chat/products-relay-fields.ts`:

```ts
import { signProductToolToken } from '../products/product-tool.token';

/**
 * Поля, которыми бэкенд передаёт релею доступ к инструменту продуктов.
 *
 * Чистая функция, а не метод сервиса: конструктор ChatService уже на 26
 * зависимостей, половина из них @Optional — ещё одна необязательная молча
 * выключила бы инструмент при ошибке в модуле.
 *
 * Шлётся ВСЕГДА, всем ассистентам. У пользователя без продуктов инструмент
 * честно ответит «нет ни одного» — это дешевле, чем запрос в базу на каждом
 * ходе ради того, чтобы иногда не показать инструмент.
 */
export function productsRelayFields(userId: string): { products_token: string; products_mcp_url: string } {
  const base = (process.env.BACKEND_URL || 'https://my.linkeon.io').replace(/\/$/, '');
  return {
    products_token: signProductToolToken(userId),
    products_mcp_url: `${base}/webhook/mcp/products`,
  };
}
```

- [ ] **Step 4: Врезать в chat.service.ts**

Добавить к импортам `spirits_back/src/chat/chat.service.ts`:

```ts
import { productsRelayFields } from './products-relay-fields';
```

После блока TalerID (строки 1577-1581, сразу за `fd.append('talerid_mcp_url', tid.mcpUrl);` и закрывающей `}`) добавить:

```ts
        // Инструмент продуктов. В отличие от MCP-инструментов на общей точке,
        // владелец едет ПОДПИСЬЮ в заголовке, а не подсказкой в промпте:
        // телефоном в аргументе правились бы чужие сайты.
        const pf = productsRelayFields(userId);
        fd.append('products_token', pf.products_token);
        fd.append('products_mcp_url', pf.products_mcp_url);
```

- [ ] **Step 5: Прогнать тест и типовой гейт**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/chat/products-relay-fields" && \
  npx tsc --noEmit -p tsconfig.build.json'
```

Ожидается: `Tests: 4 passed`.

- [ ] **Step 6: Коммит**

```bash
git add src/chat/products-relay-fields.ts src/chat/products-relay-fields.spec.ts src/chat/chat.service.ts
git commit -m "feat(products): бэкенд отдаёт релею токен инструмента продуктов"
```

---

### Task 11: Релей подключает инструмент

⚠️ **Файл на релее умеет расходиться с репозиторием молча, и `deploy.sh` его не катает.** Сначала сверка, только потом правка.

**Files:**
- Modify: `spirits_back/relay-agent/server.mjs`

- [ ] **Step 1: Сверить живой файл с копией в репозитории**

```bash
ssh dv@5.101.115.184 'md5sum /home/dv/file-agent/server.mjs'
md5 -q ~/Downloads/spirits_back/relay-agent/server.mjs
```

Ожидается: одинаковые суммы. **Разошлись — СТОП**: сначала втянуть живой файл в репозиторий отдельным коммитом, иначе правка затрёт чужую работу.

- [ ] **Step 2: Перестроить сборку MCP-конфига на ДВУХ постояльцев**

Сейчас ветка TalerID читает базовый конфиг, дописывает себя и пишет файл. Второй такой же блок затёр бы первый: `mcpConfigPath` переприсваивается, и конфиг остался бы один.

В `spirits_back/relay-agent/server.mjs` заменить блок строк 433-460 (от `let mcpConfigPath = BASE_MCP_PATH;` до закрывающей скобки ветки TalerID) на:

```js
  let mcpConfigPath = BASE_MCP_PATH;
  let allowedTools = "Bash(*),Read(*),Write(*),Edit(*),Glob(*),Grep(*),WebSearch(*),WebFetch(*),mcp__linkeon__generate_image,mcp__linkeon__edit_image,mcp__linkeon__compose_image,mcp__linkeon__upscale_image,mcp__linkeon__generate_video,mcp__linkeon__generate_banner,mcp__linkeon__manage_routine,mcp__linkeon__propose_calendar_event,mcp__linkeon__generate_speech,mcp__linkeon__read_calendar";
  let systemPrompt = SYSTEM_PROMPT;
  let sessionMcpPath = null;
  let taleridWriteUsed = false;
  const TALERID_WRITE_RE = /mcp__talerid__(create_note|update_note|delete_note|send_message|send_mail)/;

  // Пер-сессионный MCP-конфиг собирается ОДИН на всех постояльцев и пишется
  // ОДИН раз. Два блока, каждый со своим файлом и своим переприсваиванием
  // mcpConfigPath, оставили бы в живых только последний — молча: конфиг
  // валиден, инструментов половина.
  const _taleridToken = req.body.talerid_token;
  const _taleridMcpUrl = req.body.talerid_mcp_url;
  const _productsToken = req.body.products_token;
  const _productsMcpUrl = req.body.products_mcp_url;
  const wantTalerid = !!(_taleridToken && _taleridMcpUrl && /^https:\/\//.test(_taleridMcpUrl));
  const wantProducts = !!(_productsToken && _productsMcpUrl && /^https:\/\//.test(_productsMcpUrl));

  if (wantTalerid || wantProducts) {
    try {
      const base = JSON.parse(fs.readFileSync(BASE_MCP_PATH, "utf8"));
      if (wantTalerid) {
        base.mcpServers.talerid = { type: "http", url: _taleridMcpUrl, headers: { Authorization: "Bearer " + _taleridToken } };
      }
      if (wantProducts) {
        base.mcpServers.products = { type: "http", url: _productsMcpUrl, headers: { Authorization: "Bearer " + _productsToken } };
      }
      sessionMcpPath = path.join(UPLOAD_DIR, fsKey + "-session-mcp.json");
      fs.writeFileSync(sessionMcpPath, JSON.stringify(base), { mode: 0o600 });
      mcpConfigPath = sessionMcpPath;
      if (wantTalerid) { allowedTools += "," + TALERID_TOOLS; systemPrompt += TALERID_PROMPT; }
      if (wantProducts) { allowedTools += "," + PRODUCTS_TOOLS; systemPrompt += PRODUCTS_PROMPT; }
    } catch (e) {
      // Любая осечка — назад к базовому конфигу целиком. Половина конфига
      // хуже, чем его отсутствие: инструмент в белом списке при отсутствующем
      // сервере даёт ассистенту «инструмент не отвечает» вместо честного «не
      // умею».
      sessionMcpPath = null;
      mcpConfigPath = BASE_MCP_PATH;
      allowedTools = allowedTools.split("," + TALERID_TOOLS)[0].split("," + PRODUCTS_TOOLS)[0];
      systemPrompt = SYSTEM_PROMPT;
    }
  }
```

- [ ] **Step 3: Переименовать уборку временного файла**

Найти в `finally`-блоке того же обработчика уборку `taleridMcpPath` и заменить имя переменной на `sessionMcpPath`:

```bash
grep -n "taleridMcpPath" ~/Downloads/spirits_back/relay-agent/server.mjs
```

Каждое оставшееся вхождение заменить на `sessionMcpPath`. Ожидается: после замены `grep -c taleridMcpPath` = 0.

- [ ] **Step 4: Добавить константы инструмента**

Рядом с `TALERID_TOOLS` / `TALERID_PROMPT` (около строки 268) добавить:

```js
const PRODUCTS_TOOLS = "mcp__products__manage_product";

// Явная оговорка к правилу «только mcp__linkeon__*» из SYSTEM_PROMPT — без неё
// ассистент видит инструмент и не зовёт его, считая запрещённым. Ровно такая же
// оговорка стоит у TalerID.
const PRODUCTS_PROMPT = `

ПРОДУКТЫ ПОЛЬЗОВАТЕЛЯ (сайты и телеграм-боты, размещённые в Линкеоне).
Тебе доступен инструмент mcp__products__manage_product. Это ЯВНОЕ исключение к правилу «только mcp__linkeon__*».
НЕ передавай в него userId/телефон — их там нет: сервер уже знает, чей это разговор.
- { action: "list" } — показать продукты пользователя.
- { action: "edit", product: "<как пользователь назвал>", prompt: "<что сделать, подробно>" } — поставить правку.
- { action: "status", product или turnId } — узнать, чем кончилась правка.
Если пользователь просит что-то изменить на его сайте или в его боте — это ЭТОТ инструмент, а не Bash/Write.
У тебя нет доступа к файлам его продукта: правку исполняет ассистент внутри продукта.
ГЛАВНОЕ: outcome="reverted" значит ОТКАТ — правка НЕ применена, код вернули как было. Никогда не называй это
«готово» или «сделал». outcome="failed" — тоже не успех. Успех только outcome="done".
Если вернулось reason="ambiguous" — СПРОСИ, какой продукт править, и вызови снова. Не выбирай сам.
`;
```

- [ ] **Step 5: Проверить синтаксис**

```bash
cd ~/Downloads/spirits_back/relay-agent && node --check server.mjs && echo "СИНТАКСИС ОК"
```

Ожидается: `СИНТАКСИС ОК`.

- [ ] **Step 6: Проверить, что белый список и конфиг сходятся**

Имя инструмента в `--allowedTools` обязано совпасть с `mcp__<ключ сервера>__<имя инструмента>`. Ключ — `products`, имя — `manage_product`.

```bash
cd ~/Downloads/spirits_back/relay-agent && \
  grep -c 'mcpServers.products' server.mjs && \
  grep -c 'mcp__products__manage_product' server.mjs
```

Ожидается: `1` и не меньше `2` (константа + промпт).

- [ ] **Step 7: Коммит**

```bash
cd ~/Downloads/spirits_back
git add relay-agent/server.mjs
git commit -m "feat(relay): инструмент продуктов — пер-сессионный MCP-сервер и белый список"
```

---

### Task 12: Батарея мутаций

Зелёный прогон ничего не доказывает, пока не показано, что он умеет краснеть. Каждая мутация из спеки обязана дать красный.

**Files:**
- Modify: (временно) файлы реализации — правки откатываются после каждого замера

- [ ] **Step 1: Снять контроль ДО**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && \
  PROVISIONING_PG_URL=postgres://ptool:ptool@127.0.0.1:5432/ptool \
  npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="(product-tool|products-mcp|relay-budget|products-relay-fields)" 2>&1 | tail -5'
```

Записать в блокнот три числа: `Tests: N passed`, `Tests: total`, `skipped`. **Прогон считается годным, только если все три совпадают с этой записью** — забытая переменная окружения однажды увела всю живую половину в skipped при неизменном total.

- [ ] **Step 2: Прогнать восемь мутаций**

Для каждой: внести правку → прогнать → записать результат → **откатить** `git checkout -- <файл>`.

| № | Правка | Файл | Ожидается красным |
|---|---|---|---|
| 1 | убрать `AND user_id = $1` из `resolve()` | `product-tool.service.ts` | «чужие продукты не находятся ничем» |
| 2 | в `describeTurn` у `reverted` поставить `ok: true, outcome: 'done'` | `product-tool.service.ts` | «reverted — ОТКАТ, и это НЕ успех», «три конца различимы» |
| 3 | в `describeTurn` у `failed` поставить `outcome: 'done'` | `product-tool.service.ts` | «failed — не сделано», «три конца различимы» |
| 4 | в `edit` при `matches.length > 1` взять `matches[0]` и ставить ход | `product-tool.service.ts` | «два магазина — УТОЧНЯЕТ, а не выбирает» |
| 5 | `private waitMs = 900_000;` (своё число вместо производного) | `product-tool.service.ts` | «потолок ожидания взят из общей константы» (тест добавлен сразу в задаче 6 — слепое пятно закрыто заранее) |
| 6 | в `refusal()` вернуть для `BLOCKED_REFUSAL` тот же объект, что для `SLEEPING_REFUSAL` | `product-tool.service.ts` | «погашенный — отказ БЕЗ предложения», «различимы по признаку пополнения» |
| 7 | в `edit` вызвать `this.turns.enqueue(...)` дважды | `product-tool.service.ts` | «ставит ровно ОДИН ход» — но **не через `count(*)`**, см. ниже |
| 8 | в `callTool` взять `const userId = args.userId ?? this.owner(authHeader)` | `products-mcp.controller.ts` | «поле userId в запросе игнорируется полностью» |

**Измерено на мутации 7 (записать, а не забыть):** второй `enqueue` не создаёт второго хода — он бьётся о замок `product_turns_one_active` и отдаёт `ConflictException`, то есть `count(*)` остаётся равен 1 и мутацию НЕ различает. Краснеет `expect(out.turnId).toBeTruthy()`: ответ уходит по ветке `busy`, где `turnId` нет.

Вывод для спеки: «двойное списание за одну просьбу» закрыто **уникальным индексом в базе**, а не проверкой в инструменте. Счётчик ходов в этом сценарии — ремень, который не затягивается; убирать его не надо (он сторожит отсутствие замка), но полагаться на него как на ловца этой мутации нельзя.

**Результаты сводного прогона (23.09.2026).** Контроль ДО и ПОСЛЕ совпали: `Tests: 78 passed, 78 total`, `skipped: 0`, шесть файлов `PASS`, клон на ноде чист.

Девять мутаций покраснели **утверждением**, ни одна — аварией. Мутация 8 (владелец в `status` по `turnId`) перемерена чисто: прежнее измерение роняло Postgres на числе параметров, то есть меряло поломку, а не утечку. В форме `($2::text = $2::text)` запрос рабочий, и тест увидел именно чужой ход в ответе.

Три проверки «на ложную защиту» дали два ожидаемых результата и одну находку:

- **`Number()` в `describeTurn`** — краснеет, утверждением: `Expected 4200, Received "4200"`.
- **`.trim()` у `prompt`** — краснел **таймаутом** (63 с вместо 3 с): ход ставился, тест уходил в боевое ожидание и умирал на потолке jest. Починено тем же приёмом, что у уточнения — `waitMs = 0` в тесте; теперь краснеет утверждением за 2,6 с.
- **`ORDER BY created_at DESC` в `list()`** — **мутация выживает, и это не дыра в тестах.** Причина найдена замером: индекс `idx_products_user btree (user_id, created_at DESC)`. Планировщик берёт его на `WHERE user_id = $1` и отдаёт строки уже отсортированными, поэтому снятие клаузы ничего не меняет **ни при какой фикстуре** — проверено и на возрастающей вставке, и на перемешанной. Порядок обеспечен дважды; тест сторожит видимое свойство «свежее первым», но не клаузу, и в нём это написано прямо.

Два замера, стоящие отдельного упоминания:

- **Строка `Tests:` не различает мутации.** Пять из девяти дают одинаковое `1 failed, 76 passed` — засчитывать поимку по числу упавших нельзя, только по имени теста.
- **Фильтр владельца в `resolve()` сторожит один тест, а не два.** Соседний «чужой продукт по идентификатору» остаётся зелёным: `enqueue` заново проверяет владельца и отдаёт тот же `not_found`. Оборона в глубину настоящая, но при снятии обеих проверок сразу красным станет только один тест.

- [ ] **Step 3: Дописать тест на мутацию 5, если она выжила**

Добавить в `product-tool.spec.ts` внутрь `describe('действие edit', …)`:

```ts
    it('потолок ожидания взят из общей константы, а не выбран свой', () => {
      const svc = new ProductToolService(pg as any, {} as any);
      expect((svc as any).waitMs).toBe(PRODUCT_TOOL_WAIT_MS);
    });
```

и импорт в шапку файла:

```ts
import { PRODUCT_TOOL_WAIT_MS } from '../common/relay-budget';
```

Повторить мутацию 5 — теперь обязана покраснеть.

- [ ] **Step 4: Снять контроль ПОСЛЕ**

Повторить Step 1. Три числа обязаны совпасть с записанными (плюс один тест из Step 3).

- [ ] **Step 5: Коммит**

```bash
git add src/products/product-tool.spec.ts
git commit -m "test(products): батарея мутаций — восемь правок, все красные"
```

---

### Task 13: Выкат и живая проверка

⚠️ **`deploy.sh` без явного «ОК» владельца не запускать.** Релей катается руками — его `deploy.sh` не трогает.

**Files:** нет правок кода

- [ ] **Step 1: Влить работу в main и убедиться, что она там**

```bash
cd ~/Downloads/spirits_back && git -C . log --oneline origin/main..HEAD
```

Ожидается: список коммитов этого плана. Затем `git push origin HEAD:main` и сверка:

```bash
git -C ~/Downloads/spirits_back fetch -q origin && git -C ~/Downloads/spirits_back log --oneline -1 origin/main
```

SHA обязан совпасть с локальным HEAD. (Две команды `git push`, склеенные через `&&`, уже один раз отработали в одном репозитории и отрапортовали успехом с чужим SHA.)

- [ ] **Step 2: Спросить владельца разрешение на выкат**

Спросить прямо: «выкатываю?». Заодно спросить, не катит ли прямо сейчас соседняя сессия.

- [ ] **Step 3: Выкатить бэкенд**

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```

Запускать **отвязанно** (дольше лимита инструмента) и **без `tail`** — конвейер копит вывод до конца, и лог все десять минут выглядит пустым.

- [ ] **Step 4: Выкатить релей руками**

```bash
ssh dv@5.101.115.184 'cp /home/dv/file-agent/server.mjs /home/dv/file-agent/server.mjs.bak-$(date +%F-%H%M)'
scp ~/Downloads/spirits_back/relay-agent/server.mjs dv@5.101.115.184:/home/dv/file-agent/server.mjs
ssh dv@5.101.115.184 'node --check /home/dv/file-agent/server.mjs && pm2 restart file-agent && sleep 3 && pm2 status file-agent'
```

Ожидается: `online`. **Перед рестартом убедиться, что нет живых ходов** — рестарт посреди хода убивает ответ молча, без ошибки и без строки в истории.

- [ ] **Step 5: Проверить, что точка отвечает**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://my.linkeon.io/webhook/mcp/products \
  -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Ожидается: `401` (без токена). Код `200` значит, что защита не встала.

⚠️ На linkeon.io SPA-фолбэк отдаёт `200` с HTML на любой путь — если увидел `200`, **проверь `content-type`**: `text/html` значит, что маршрута нет вовсе, а не что он открыт.

- [ ] **Step 6: Живая проверка — пять сценариев в чате с Романом**

Вход под тестовым аккаунтом `79030169187` (OTP — через `GET /webhook/debug/sms-code/79030169187`).

1. **«Какие у меня есть продукты?»** — Роман перечисляет продукты этого аккаунта. Сверить со списком в кабинете; сверить, что чужих нет (по логам `tools/call` видно, с каким userId пришёл вызов).
2. **«Поправь на сайте <имя> заголовок на N»** — ход появляется в истории продукта, правка доезжает до домена (`curl` по домену, искать N).
3. **Два продукта с общим словом в имени, попросить «поправь магазин»** — Роман **спрашивает**, какой, и не ставит ход (`SELECT count(*) FROM product_turns` не растёт).
4. **⚠️ ОБЯЗАТЕЛЬНЫЙ. Правка, которая ломает продукт** — попросить заменить содержимое главной страницы на заведомо нерабочее (например, удалить точку входа). Автооткат обязан сработать, а Роман — назвать это **откатом**, а не успехом. Дословно записать, что он ответил.
5. **Погашенный продукт** — администратором погасить один продукт, попросить Романа его поправить. Отказ обязан быть **без предложения пополнить баланс**.

- [ ] **Step 7: Записать результат живой проверки**

Дописать в конец этого файла раздел «Живая проверка» с пятью строками: сценарий → что увидели дословно → зелёный/красный.

Четыре дефекта в предыдущих кусках нашла ТОЛЬКО живая проверка, ни один тест их не видел. Самый тяжёлый — автооткат, выключенный целиком при зелёном прогоне.

---

## Самопроверка плана

**Покрытие спеки.** Прошёлся по разделам:

| Требование спеки | Задача |
|---|---|
| Один инструмент, три действия | 5, 6, 7, 8 |
| Правка = ход в контейнере, механизм не меняется | 6 (через `TurnsService.enqueue`) |
| Ожидание с потолком от срока ответа чата | 1, 6 |
| Неоднозначный продукт → уточняет | 6 |
| Нестрогий поиск по имени; строгий из гашения не переиспользуем | 3 |
| Не нашли → отказ с перечислением; у бота домена нет | 5, 6 |
| Три конца различимы, откат не выдать за успех | 4, 8 |
| Спящий и погашенный — разные отказы | 6 |
| Два счётчика: назвать расход за ход | 4 (`say`), 8 (описание) |
| Потолок продуктов и аренда: не обещать заведение | 8 (описание) |
| Принадлежность закрыта подписью | 2, 9 — **усилено против спеки**, см. «Что выяснилось» |
| Мутации (7 из спеки) | 12 (восемь: седьмая спеки разделена, добавлена мутация на подмену владельца) |
| Живые сценарии (5, четвёртый обязателен) | 13 |

Пробелов нет. Два требования оказались НЕ покрыты разведкой спеки и добавлены планом: белый список релея (задача 11) и ручной выкат релея (задача 13, шаг 4) — без них инструмент собран и недоступен.

**Заглушки.** Не найдено: в каждом шаге, меняющем код, код приведён целиком.

**Согласованность имён.** `ProductToolService.execute/resolve/list/edit/status`, `describeTurn`, `TurnOutcome`, `ProductMatch`, `PRODUCT_TOOLS`, `PRODUCT_TOOL_NAME`, `signProductToolToken`/`verifyProductToolToken`/`PRODUCT_TOOL_TOKEN_TYPE`, `productsRelayFields`, `RELAY_TURN_BUDGET_MS`/`TOOL_STEPS_PER_TURN`/`PRODUCT_TOOL_WAIT_MS`, `sessionMcpPath`, `PRODUCTS_TOOLS`/`PRODUCTS_PROMPT` — сквозные, расхождений между задачами нет.

---

## Граница, о которой стоит знать

**Инструмент подключён только к веб-чату.** В `chat.service.ts` форма для релея собирается в ДВУХ местах: `streamUniversalAgent` (веб) и `generateAgentReplyWithCharge` (TG-бот, голосовые консультации, пробы качества). Поля инструмента врезаны только в первое — ровно там же, где живут поля TalerID, и по той же линии раздела.

Это не забытое, а невзятое: в TG-боте у хода другой биллинг и другой контекст, и проверять инструмент там пришлось бы отдельно. Дописать — три строки в том же виде, когда владелец скажет.

## Что вынесено владельцу, а не сделано

**`userId` на общей точке `/mcp` пишет модель.** Это не про продукты — это про `manage_routine` (рутина на чужом аккаунте), `generate_image` и `generate_video` (списание чужих токенов), `read_calendar` (чужой календарь). Дыра живая и существует сегодня. План её обходит для продуктов и НЕ чинит для остальных: это отдельная работа со своей спекой, и трогать её попутно — значит менять поведение девяти инструментов без проверки.

**Архивации продуктов нет.** Столбец `archived_at` в схеме есть и везде учитывается, но записать его нечем. Пользователь на потолке в два продукта не может освободить место. Ассистент это честно скажет («завести не могу»), но сама дыра остаётся.

---

## Живая проверка (23–24.09.2026)

Прод `7724674`. Роман, аккаунт владельца, свежие сессии (первые прогоны 23.09 по ошибке шли в живую сессию владельца).

| # | Сценарий | Что увидели | Итог |
|---|---|---|---|
| 1 | «Какие у меня продукты?» | три продукта с адресами и состоянием, чужих нет | зелёный |
| 2 | правка по имени | «Правка применена… За правку списано 789 токенов»; ход `done` за 25 с; сайт отдаёт новый заголовок; pm2 online, EADDRINUSE 0 | зелёный (с третьей попытки, см. ниже) |
| 3 | «поправь мой продукт» при трёх подходящих | перечислил, спросил какой; ходов 14 → 14 | зелёный |
| 4 | правка, не прошедшая проверку здоровья | ход `reverted`; Роман: «правка не применилась… код вернули в прежнее состояние… токены не списались» | зелёный |
| 5 | правка погашенного | «администратор остановил сайт… **Пополнение баланса здесь не поможет**» | зелёный |

### Что нашла только живая проверка

Ни один из дефектов ниже не был виден тестам — все пять вскрыты ходами через Романа.

1. **`git push` без upstream ронял каждый ход** у продуктов с резервной копией (`product-backup-setup.sh` делает `push --all`, привязки не создаёт) — причём **после** правки файлов и **до** проверки здоровья: сайт менялся, ход считался упавшим, Роман говорил «ничего не изменилось». Починено: `push origin HEAD`, копия — после проверки здоровья, её отказ не роняет ход.
2. **Образ раннера не катался ничем** (собран руками 09.09). Написан `scripts/product-image-roll.sh`, врезан в PHASE 4; метка — по содержимому исходников раннера, не по коммиту (сборка невоспроизводима: три сборки из одних исходников — три идентификатора).
3. **Гашение старых продуктов было необратимым**: без `port` в реестре пробуждение падало вечно. Пробуждение теперь берёт порт у контейнера (`.HostConfig.PortBindings`; у остановленного `.NetworkSettings.Ports` пуст) и лечит реестр. Проверено гашением `demo`: `NULL` → `8001`.
4. **В образе не было `ps` — pm2 7 плодил сироту на каждом `pm2 restart`.** TreeKill зовёт `ps`, spawn падает с ENOENT, обратный вызов срабатывает дважды, продукт стартует дважды: одна копия держит порт вне учёта pm2, вторая уходит в `errored`. Опыт A/B на одном образе, отличие только в `procps`: без — сирота с первого рестарта, 47 перезапусков (ровно как `demo`), 96 EADDRINUSE; с — ни одной. Сирота переживала и перезапуск, и откат: `demo` после отката отдавал отменённую правку.
5. **Продукты самообслуживания заведены без `restart_cmd`** — раннер их после правки не перезапускал, и успех зависел от того, перезапустит ли агент pm2 сам после коммита. Теперь по умолчанию `pm2 restart product`.

Плюс уборка порта от процессов вне pm2 перед каждым перезапуском (случай «агент запустил сервер руками») — проверено сквозным ходом: сирота снята, клиенту сказано об этом строкой.
