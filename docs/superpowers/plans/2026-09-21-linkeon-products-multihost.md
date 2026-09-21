# Несколько машин под продукты Linkeon — план реализации (кусок 4а)

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОД-НАВЫК: `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`. Шаги помечены чекбоксами `- [ ]`.

**Цель:** задание уезжает на ту машину, которой принадлежит продукт, а не той, что первой спросила.

**Архитектура:** метка машины **и есть** её токен. Гвард превращает предъявленный токен в метку, выдача заданий фильтрует по ней. Список машин живёт в базе, потому что он нужен внутри запроса выдачи, а не только при старте.

**Стек:** NestJS 10, PostgreSQL 16, bash (`scripts/deploy.sh`).

**Спека:** `docs/superpowers/specs/2026-09-21-linkeon-products-multihost-design.md`

---

## Правила прогона

Мак не тянет тяжёлое — всё уезжает на тестовую ноду, в CI-клоны.

**Гони на СВОЕЙ базе и сноси схему перед каждым прогоном.** Общая `prov_fields` уже испортила одну батарею в куске 3: мутация поменяла определение колонки и **осталась в базе навсегда** — идемпотентная миграция существующую колонку не правит. Пять следующих мутаций краснели от чужого следа, а контроль после серии оказался красным на чистом коде.

```bash
ssh dv@85.192.61.231 'sudo -u postgres psql -qc "DROP DATABASE IF EXISTS mh_<задача>"; \
  sudo -u postgres psql -qc "CREATE DATABASE mh_<задача> OWNER dv"'
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && git fetch -q origin && git checkout -qf <sha> \
  && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL="postgres:///mh_<задача>?host=/var/run/postgresql" npx jest src/products'
```

- `source ~/.nvm/nvm.sh` обязателен в каждой ssh-команде.
- **Не трогать `~/spirits_back` и `~/spirits_front` на ноде** — живой чекаут стенда.
- **Прогонять весь `src/products`**, а не свой файл. Правка `COLUMNS` с прогоном одного файла уже сломала сторож формы запроса, и он упал на выкате.
- jest в бэкенде **типы не проверяет** (`isolatedModules` + транспайлер). Единственный шлюз — `npx tsc --noEmit -p tsconfig.build.json`.
- **Идемпотентность проверяется на СПИСКЕ миграций, а не на файле.** Модуль накатывает все при каждом старте. Значение, дописанное в именованный словарь поздней миграцией, дописывается и во все ранние — иначе ранняя падает на живых данных, отказ уходит в лог, и она умирает молча.
- Мутации: каждая со **счётом замен**, контроль без мутации до и после серии, сверка `Test Suites:` и `Tests: N total`. Харнесс в этой работе врал **одиннадцать раз**. Таблицу класть в текст коммита.
- `deploy.sh` не запускать: выкат ведёт владелец.

**Базовую линию снять самому** — числа в этом плане устареют.

**Прод и машина продуктов — только на чтение.** На `139.59.210.42` два боевых продукта.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/products/migrations/005_hosts.sql` | таблица машин, `products.host_id`, заведение машины `own` |
| `src/products/hosts.service.ts` | чтение реестра, выбор машины под новый продукт |
| `src/products/hosts.service.spec.ts` | форма запросов на заглушках |
| `src/products/host.guard.ts` | токен → метка машины |
| `src/products/host.controller.ts` | передача метки в выдачу задания |
| `src/products/provisioning.service.ts` | фильтр выдачи по метке; константы адреса и зоны уходят |
| `src/products/provisioning.integration.spec.ts` | поведение против живого Postgres |
| `scripts/deploy.sh` | фаза 4 обходит все машины реестра |

Новый сервис, а не дописка в `provisioning.service.ts`: тот уже за 1000 строк и отвечает за жизненный цикл продукта. Реестр машин — другая ответственность.

---

## Task 1: Схема и реестр машин

**Файлы:**
- Создать: `spirits_back/src/products/migrations/005_hosts.sql`
- Изменить: `spirits_back/src/products/products.service.ts` (список миграций)
- Тест: `spirits_back/src/products/products.migration.spec.ts`, `provisioning.integration.spec.ts`

- [ ] **Шаг 1: Написать миграцию**

`005_hosts.sql`:

```sql
-- Реестр машин под продукты. Кусок 4а.
CREATE TABLE IF NOT EXISTS product_hosts (
  id            text PRIMARY KEY,
  ssh_target    text NOT NULL,
  public_ip     text NOT NULL,
  domain_suffix text NOT NULL,
  -- sha256 токена агента. Открытый токен живёт ТОЛЬКО в конфиге машины:
  -- тот же приём, что у runner_token_hash продукта.
  agent_token_hash text NOT NULL,
  capacity      int  NOT NULL CHECK (capacity > 0),
  accepts_new   boolean NOT NULL DEFAULT true,
  -- Чьи продукты сюда уезжают. Набор выбирается по признаку администратора:
  -- продукты админов — на 'own', всех остальных — на 'clients'.
  audience      text NOT NULL CHECK (audience IN ('own','clients')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS host_id text REFERENCES product_hosts(id);

-- Нынешняя машина заводится из того, что уже есть в окружении бэкенда.
-- Токен НЕ меняется: агент на машине не трогается, его конфиг прежний —
-- токен просто перестаёт быть общим.
INSERT INTO product_hosts (id, ssh_target, public_ip, domain_suffix,
                           agent_token_hash, capacity, audience)
SELECT 'own', 'root@139.59.210.42', '139.59.210.42', 'p.linkeon.io',
       encode(digest(current_setting('linkeon.host_token'), 'sha256'), 'hex'),
       20, 'own'
WHERE NOT EXISTS (SELECT 1 FROM product_hosts WHERE id = 'own');

-- Метка проставляется СОПОСТАВЛЕНИЕМ по адресу, а не по умолчанию.
UPDATE products p SET host_id = h.id
  FROM product_hosts h
 WHERE p.host_id IS NULL AND p.host_ip = h.public_ip;

-- И отказ, если сопоставить не удалось. «Поставлю первую попавшуюся» здесь
-- означает продукт, получающий задания на машину, где его каталога нет:
-- заведение начнётся заново поверх пустого места.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM products
   WHERE host_id IS NULL AND archived_at IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'у % продуктов host_ip не сошёлся ни с одной машиной реестра', n;
  END IF;
END $$;
```

- [ ] **Шаг 2: Передать токен в миграцию**

`current_setting('linkeon.host_token')` читает параметр сессии. В `products.service.ts`, в `applyMigration`, перед выполнением `005_hosts.sql`:

```ts
    // Токен не подставляется в текст SQL: он ушёл бы в логи Postgres целиком.
    // Параметр сессии живёт только в этом соединении и в pg_stat_statements
    // не печатается.
    if (file === '005_hosts.sql') {
      const token = process.env.PRODUCT_HOST_TOKEN ?? '';
      if (!token) throw new Error('PRODUCT_HOST_TOKEN пуст — машину own завести нечем');
      await client.query(`SELECT set_config('linkeon.host_token', $1, true)`, [token]);
    }
```

Если `applyMigration` работает не на выделенном клиенте, а через пул — параметр сессии не переживёт границу запроса. **Проверь это первым делом**: `set_config(..., true)` действует до конца транзакции, а через пул каждый запрос — своя транзакция. Тогда токен надо подставлять параметром в сам `INSERT`, вынеся его из файла в код.

- [ ] **Шаг 3: Подключить миграцию**

В `products.service.ts` дописать `'005_hosts.sql'` в общий список `MIGRATIONS` — он вынесен в экспортируемую константу и читается ещё и интеграционным сьютом. Забытая там миграция даёт «column does not exist» в сценариях, к машинам отношения не имеющих.

- [ ] **Шаг 4: Написать тесты**

В `provisioning.integration.spec.ts`:

```ts
  it('40. машина own заводится из существующего токена, продукты получают метку', async () => {
    const h = await pool.query('SELECT id, audience, capacity FROM product_hosts');
    expect(h.rows).toEqual([{ id: 'own', audience: 'own', capacity: 20 }]);

    const p = await product({ slug: 'mh-existing' });
    await pool.query('UPDATE products SET host_ip = $2, host_id = NULL WHERE id = $1',
      [p.id, '139.59.210.42']);
    await pool.query(fs.readFileSync(path.join(__dirname, 'migrations', '005_hosts.sql'), 'utf8'));

    expect((await getProduct(p.id)).host_id).toBe('own');
  });

  it('41. несопоставленный продукт РОНЯЕТ миграцию, а не получает метку по умолчанию', async () => {
    // Продукт с чужой меткой получает задания на машину, где его каталога
    // нет. Отказ громкий — единственный способ это заметить.
    const p = await product({ slug: 'mh-orphan' });
    await pool.query('UPDATE products SET host_ip = $2, host_id = NULL WHERE id = $1',
      [p.id, '10.0.0.99']);

    await expect(
      pool.query(fs.readFileSync(path.join(__dirname, 'migrations', '005_hosts.sql'), 'utf8')),
    ).rejects.toThrow(/не сошёлся/);
  });

  it('42. повторная накатка ничего не меняет', async () => {
    const before = await pool.query('SELECT * FROM product_hosts ORDER BY id');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '005_hosts.sql'), 'utf8');
    await pool.query(sql);
    await pool.query(sql);
    expect((await pool.query('SELECT * FROM product_hosts ORDER BY id')).rows).toEqual(before.rows);
  });
```

- [ ] **Шаг 5: Прогнать и проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| убрать `DO $$ ... RAISE` | 41 |
| сопоставлять по умолчанию (`host_id = 'own'` без условия) | 41 |
| убрать `WHERE NOT EXISTS` у вставки машины | 42 |
| `capacity` без `CHECK (capacity > 0)` | (добавить тест на нулевой потолок) |

- [ ] **Шаг 6: Коммит**

```bash
git add src/products/migrations/005_hosts.sql src/products/products.service.ts \
        src/products/provisioning.integration.spec.ts
git commit -m "feat(products): реестр машин и метка машины у продукта"
```

---

## Task 2: Гвард превращает токен в метку

> **Сегодня токен один на всех**, и гвард только сверяет его с `PRODUCT_HOST_TOKEN` из окружения. Какая машина спросила — сервер не знает.

**Файлы:**
- Изменить: `spirits_back/src/products/host.guard.ts`
- Тест: `spirits_back/src/products/host.guard.spec.ts`

- [ ] **Шаг 1: Написать падающие тесты**

```ts
it('метка машины берётся из базы по предъявленному токену', async () => {
  const pg = { query: jest.fn(async () => ({ rows: [{ id: 'clients' }], rowCount: 1 })) };
  const guard = new HostGuard(pg as any);
  const req: any = { headers: { authorization: 'Bearer ' + 'a'.repeat(64) } };

  await guard.canActivate(ctxOf(req));

  expect(req.hostId).toBe('clients');
});

it('ищет по ХЕШУ, а не по самому токену', async () => {
  // Открытый токен в базе означал бы, что дамп базы даёт право заводить
  // продукты на любой машине. Тот же приём, что у runner-токена продукта.
  const pg = { query: jest.fn(async () => ({ rows: [{ id: 'own' }], rowCount: 1 })) };
  const token = 'b'.repeat(64);
  await new HostGuard(pg as any).canActivate(ctxOf({ headers: { authorization: 'Bearer ' + token } }));

  const [, params] = pg.query.mock.calls[0];
  expect(params[0]).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  expect(params[0]).not.toBe(token);
});

it('неизвестный токен — отказ, и метки на запросе не появляется', async () => {
  const pg = { query: jest.fn(async () => ({ rows: [], rowCount: 0 })) };
  const req: any = { headers: { authorization: 'Bearer ' + 'c'.repeat(64) } };

  await expect(new HostGuard(pg as any).canActivate(ctxOf(req))).rejects.toThrow();
  expect(req.hostId).toBeUndefined();
});
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest src/products/host.guard.spec.ts'
```
Ожидание: FAIL — конструктор ждёт `ConfigService`.

- [ ] **Шаг 3: Реализовать**

```ts
  constructor(private readonly pg: PgService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const raw = typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    if (!token) throw new UnauthorizedException('Missing host token');
    if (token.length < MIN_TOKEN_LEN || !TOKEN_SHAPE.test(token)) {
      throw new UnauthorizedException('Bad host token');
    }

    // Ищем по хешу: открытый токен в базе означал бы, что её дамп даёт право
    // заводить продукты на любой машине.
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const r = await this.pg.query('SELECT id FROM product_hosts WHERE agent_token_hash = $1', [hash]);
    const hostId = r.rows[0]?.id;
    if (!hostId) {
      // Строка в журнале обязательна: у агента с чужим токеном снаружи всё
      // выглядит исправным — юнит active, перезапусков нет, ошибок нет.
      this.log.warn('агент предъявил неизвестный токен — работы не получит');
      throw new UnauthorizedException('Unknown host token');
    }
    req.hostId = hostId;
    return true;
  }
```

Сверка постоянного времени здесь не нужна: сравнение делает индекс по хешу, а не наш код.

- [ ] **Шаг 4: Прогнать и проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| искать по самому токену, а не по хешу | «ищет по ХЕШУ» |
| при пустой выборке пускать с меткой по умолчанию | «неизвестный токен — отказ» |
| не класть метку на запрос | «метка берётся из базы» |

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/host.guard.ts src/products/host.guard.spec.ts
git commit -m "feat(products): гвард агента превращает токен в метку машины"
```

---

## Task 3: Выдача заданий фильтрует по метке

> Главная задача куска. Сегодня `claimJob()` не знает о машинах и отдаёт **любое** задание **любому** спросившему.

**Файлы:**
- Изменить: `spirits_back/src/products/provisioning.service.ts`, `host.controller.ts`
- Тест: `spirits_back/src/products/provisioning.integration.spec.ts`

- [ ] **Шаг 1: Написать сценарий на живой базе**

```ts
  it('43. два агента ОДНОВРЕМЕННО берут задания — каждый только своё', async () => {
    // Главный сценарий куска. На одном соединении одновременность вырождается
    // в последовательность, поэтому строго на пуле.
    await pool.query(
      `INSERT INTO product_hosts (id, ssh_target, public_ip, domain_suffix,
                                  agent_token_hash, capacity, audience)
       VALUES ('clients','root@10.0.0.2','10.0.0.2','c.linkeon.io','hash-c',20,'clients')`);
    const mine = await product({ slug: 'mh-own', status: 'provisioning' });
    const theirs = await product({ slug: 'mh-cli', status: 'provisioning' });
    await pool.query(`UPDATE products SET host_id='own'     WHERE id=$1`, [mine.id]);
    await pool.query(`UPDATE products SET host_id='clients' WHERE id=$1`, [theirs.id]);
    await job(mine.id); await job(theirs.id);

    const [a, b] = await Promise.all([
      new ProvisioningService(pg as any, secrets).claimJob('own'),
      new ProvisioningService(pg as any, secrets).claimJob('clients'),
    ]);

    expect(a!.slug).toBe('mh-own');
    expect(b!.slug).toBe('mh-cli');
  });

  it('44. агент не получает задание чужой машины, даже если своих нет', async () => {
    // Без фильтра единственное задание досталось бы первому спросившему, и
    // продукт клиента развернулся бы на машине владельца.
    await pool.query(
      `INSERT INTO product_hosts (id, ssh_target, public_ip, domain_suffix,
                                  agent_token_hash, capacity, audience)
       VALUES ('clients','root@10.0.0.2','10.0.0.2','c.linkeon.io','hash-c',20,'clients')`);
    const theirs = await product({ slug: 'mh-only-cli', status: 'provisioning' });
    await pool.query(`UPDATE products SET host_id='clients' WHERE id=$1`, [theirs.id]);
    await job(theirs.id);

    expect(await makeSvc().claimJob('own')).toBeNull();
    expect(await jobsOf(theirs.id)).toEqual(['queued']);
  });
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Ожидание: FAIL — `claimJob` не принимает аргумент; 44 отдаёт чужое задание.

- [ ] **Шаг 3: Реализовать**

В `claimJob` сигнатура становится `claimJob(hostId: string)`, а в `picked` добавляется условие:

```ts
             AND EXISTS (SELECT 1 FROM products p
                          WHERE p.id = j.product_id
                            AND p.archived_at IS NULL
                            -- Метка машины. Без неё задание достаётся тому,
                            -- кто первым спросил: продукт клиента уехал бы на
                            -- машину владельца, а его каталога там нет.
                            AND p.host_id = $1
                            AND CASE j.kind
                                  WHEN 'provision' THEN p.status = 'provisioning'
                                  ELSE p.status = 'sleeping'
                                END)
```

В `host.controller.ts` метка берётся **из запроса**, куда её положил гвард, а не из тела:

```ts
  @Post('products/host/poll')
  async poll(@Req() req: any) {
    // Метка приходит из гварда, то есть выведена из предъявленного токена.
    // Взятая из тела, она была бы заявлением агента о себе.
    return { job: await this.provisioning.claimJob(req.hostId) };
  }
```

- [ ] **Шаг 4: Прогнать и проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| убрать `AND p.host_id = $1` | 43, 44 |
| брать метку из тела запроса | (добавить тест: тело с чужой меткой игнорируется) |
| `p.host_id <> $1` | 43 |

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/provisioning.service.ts src/products/host.controller.ts \
        src/products/provisioning.integration.spec.ts
git commit -m "feat(products): задание уезжает только на свою машину"
```

---

## Task 3б: Отметка о жизни — своя у каждой машины

> **НАЙДЕНО ЗАДАЧЕЙ 3, В ИСХОДНОМ ПЛАНЕ ЭТОЙ ЗАДАЧИ НЕТ.** Отметка о жизни агента лежит в `product_host_agent` — **одной строкой на всё**, by design куска 3 («хост один»). С двумя машинами опрос живого агента **выдаёт за живого и мёртвого соседа**: заголовок `X-Host-Agent: live` отвечает за обоих.
>
> Это ровно та диагностика, ради которой отметку заводили: без неё владелец жмёт кнопку, видит «Заводится…» и через десять минут читает про истёкший срок, хотя забирать задание было некому. С общей отметкой он читает то же самое, но теперь ещё и при зелёном индикаторе.

**Файлы:**
- Создать: `spirits_back/src/products/migrations/006_host_agent_per_host.sql`
- Изменить: `spirits_back/src/products/provisioning.service.ts` (`touchHostAgent`, `hostAgentLive`), `host.controller.ts`
- Тест: `spirits_back/src/products/provisioning.integration.spec.ts`

- [ ] **Шаг 1: Прочитать, что уже есть**

`003_host_agent.sql` завёл таблицу одной строкой: `id boolean PRIMARY KEY DEFAULT true CHECK (id)`. Приём был осознанный — единственность держит база, читатель берёт отметку без `ORDER BY`. Теперь единственность нужна **на машину**.

Посмотри, что делает `hostAgentLive()`: вердикт двухэтажный — свежая отметка **или** задание в работе моложе срока заведения. Занятость по свидетельству, а не по догадке: пока агент разворачивает продукт, он не опрашивает и молчать может до восьми минут.

- [ ] **Шаг 2: Написать сценарий на живой базе**

```ts
  it('47. живой агент не выдаёт за живого мёртвого соседа', async () => {
    // Главный сценарий задачи. С общей отметкой обе машины считались бы
    // живыми по опросу одной.
    await addHost('clients', 'clients', 20);
    await svc.touchHostAgent('own');

    expect(await svc.hostAgentLive('own')).toBe(true);
    expect(await svc.hostAgentLive('clients')).toBe(false);
  });

  it('48. занятость считается по заданиям СВОЕЙ машины', async () => {
    // Вторая половина вердикта. Задание соседа не делает молчащего агента
    // живым — иначе одна занятая машина покрывает все.
    await addHost('clients', 'clients', 20);
    const p = await product({ slug: 'mh-busy', status: 'provisioning' });
    await pool.query(`UPDATE products SET host_id='clients' WHERE id=$1`, [p.id]);
    await job(p.id, { status: 'running', startedAgo: '1 minute' });

    expect(await svc.hostAgentLive('clients')).toBe(true);
    expect(await svc.hostAgentLive('own')).toBe(false);
  });
```

- [ ] **Шаг 3: Реализовать**

Миграция переносит единственную строку на машину `own` — она и была единственной:

```sql
-- Отметка о жизни агента была одной на всё: хост был один. С реестром машин
-- общая отметка выдаёт живого агента за живого и мёртвого соседа — то есть
-- ровно ту диагностику, которую она заменяла, превращает в ложь.
ALTER TABLE product_host_agent ADD COLUMN IF NOT EXISTS host_id text
  REFERENCES product_hosts(id);
UPDATE product_host_agent SET host_id = 'own' WHERE host_id IS NULL;
ALTER TABLE product_host_agent DROP CONSTRAINT IF EXISTS product_host_agent_pkey;
ALTER TABLE product_host_agent ALTER COLUMN host_id SET NOT NULL;
ALTER TABLE product_host_agent ADD PRIMARY KEY (host_id);
-- Колонка id со своим CHECK больше не нужна: единственность держит host_id.
ALTER TABLE product_host_agent DROP COLUMN IF EXISTS id;
```

`touchHostAgent(hostId)` и `hostAgentLive(hostId)` получают метку; загрубление записи до 30 секунд остаётся **на машину**, а не на всё.

Заголовок `X-Host-Agent` отвечает **про машину продукта**, а не про абстрактный агент. У клиента продукты могут стоять на разных машинах — значит заголовка мало. Реши сам и обоснуй: заголовок про худшую из машин владельца, поле в строке продукта, или что-то третье.

- [ ] **Шаг 4: Прогнать и проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| отметка пишется без метки (одна на всё) | 47 |
| `hostAgentLive` игнорирует метку | 47 |
| занятость считается по заданиям всех машин | 48 |
| загрубление записи общее, а не на машину | (добавить тест: две машины пишут отметку в одну секунду) |

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/migrations/006_host_agent_per_host.sql \
        src/products/provisioning.service.ts src/products/host.controller.ts \
        src/products/provisioning.integration.spec.ts
git commit -m "feat(products): отметка о жизни своя у каждой машины"
```

---

## Task 4: Выбор машины при заведении

**Файлы:**
- Создать: `spirits_back/src/products/hosts.service.ts`, `hosts.service.spec.ts`
- Изменить: `spirits_back/src/products/provisioning.service.ts` (константы уходят), `products.module.ts`
- Тест: `spirits_back/src/products/provisioning.integration.spec.ts`

- [ ] **Шаг 1: Написать сценарии на живой базе**

```ts
  it('45. продукт клиента уезжает на клиентскую машину, продукт админа — на свою', async () => {
    await addHost('clients', 'clients', 20);
    const cli = await svc.create({ userId: 'u-кли', isAdmin: false, name: 'к', slug: 'mh-r1', kind: 'site', secrets: {} });
    const own = await svc.create({ userId: 'u-адм', isAdmin: true,  name: 'в', slug: 'mh-r2', kind: 'site', secrets: {} });

    expect((await getProduct(cli.productId)).host_id).toBe('clients');
    expect((await getProduct(own.productId)).host_id).toBe('own');
  });

  it('46. домен и адрес берутся у ВЫБРАННОЙ машины, а не из константы', async () => {
    // Иначе продукт получает домен одной зоны, а адрес другой — и это
    // расходится молча.
    await addHost('clients', 'clients', 20, { suffix: 'c.linkeon.io', ip: '10.0.0.2' });
    const r = await svc.create({ userId: 'u-кли', isAdmin: false, name: 'к', slug: 'mh-zone', kind: 'site', secrets: {} });

    const row = await getProduct(r.productId);
    expect(row.domain).toBe('mh-zone.c.linkeon.io');
    expect(row.host_ip).toBe('10.0.0.2');
  });

  it('47. потолок считает СПЯЩИХ, но не архивных', async () => {
    // Спящий контейнер остановлен и памяти не ест — считать его выглядит
    // расточительным. Не считать опаснее: двадцать спящих просыпаются от
    // одного пополнения баланса, и машина, заполненная по живым, ляжет.
    await addHost('clients', 'clients', 2);
    await filledProduct('clients', 'sleeping');
    await filledProduct('clients', 'archived');

    const r = await svc.create({ userId: 'u-кли', isAdmin: false, name: 'к', slug: 'mh-cap1', kind: 'site', secrets: {} });
    expect((await getProduct(r.productId)).host_id).toBe('clients');

    await expect(svc.create({ userId: 'u-кли', isAdmin: false, name: 'к', slug: 'mh-cap2', kind: 'site', secrets: {} }))
      .rejects.toThrow(/мест/i);
  });

  it('48. машина, не принимающая новые, пропускается', async () => {
    await addHost('clients', 'clients', 20, { acceptsNew: false });
    await expect(svc.create({ userId: 'u-кли', isAdmin: false, name: 'к', slug: 'mh-closed', kind: 'site', secrets: {} }))
      .rejects.toThrow(/мест/i);
  });
```

- [ ] **Шаг 2: Убедиться, что тесты красные**

Ожидание: FAIL — `create` не принимает `isAdmin`, машина не выбирается.

- [ ] **Шаг 3: Реализовать**

`hosts.service.ts`:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';

export interface ChosenHost {
  id: string;
  publicIp: string;
  domainSuffix: string;
}

@Injectable()
export class HostsService {
  constructor(private readonly pg: PgService) {}

  /**
   * Машина под новый продукт: есть место, принимает новые, нужная аудитория.
   *
   * Потолок считает ВСЕ продукты машины, кроме архивных, — спящих в том
   * числе. Спящий контейнер остановлен и памяти не ест, но место занимает до
   * архивации: двадцать спящих просыпаются от одного пополнения баланса.
   */
  async pickForNewProduct(isAdmin: boolean): Promise<ChosenHost> {
    const r = await this.pg.query(
      `SELECT h.id, h.public_ip, h.domain_suffix
         FROM product_hosts h
        WHERE h.accepts_new
          AND h.audience = $1
          AND (SELECT count(*) FROM products p
                WHERE p.host_id = h.id AND p.archived_at IS NULL) < h.capacity
        ORDER BY h.id
        LIMIT 1`,
      [isAdmin ? 'own' : 'clients'],
    );
    const row = r.rows[0];
    if (!row) {
      // Текст называет причину. «Попробуйте позже» здесь неправда: само оно
      // не пройдёт, пока владелец не добавит машину.
      throw new ConflictException(
        'Свободных мест на машинах нет — новый продукт пока завести некуда. Мы уже знаем.',
      );
    }
    return { id: row.id, publicIp: row.public_ip, domainSuffix: row.domain_suffix };
  }
}
```

В `provisioning.service.ts` **удалить** константы `PRODUCTS_IP`, `DOMAIN_SUFFIX` и `PUBLIC_ZONE`, а в `create` взять их у выбранной машины:

```ts
    const host = await this.hosts.pickForNewProduct(input.isAdmin);
```

и в `INSERT` вместо констант — `host.id`, `host.publicIp`, `${input.slug}.${host.domainSuffix}`.

`PUBLIC_ZONE` используется в пробе `promoteReady`: адрес пробы собирается из `products.domain`, который теперь и так полон, — брать зону отдельно незачем.

**Обе формы оставлять нельзя.** Константа «на всякий случай» разойдётся с реестром молча, и продукт получит домен одной зоны, а адрес другой.

- [ ] **Шаг 4: Прогнать и проверить мутациями**

| Мутация | Что обязано покраснеть |
|---|---|
| потолок считает только `running` | 47 |
| потолок считает и архивные | 47 |
| `accepts_new` не проверяется | 48 |
| аудитория не проверяется | 45 |
| домен собирается из константы | 46 |

- [ ] **Шаг 5: Коммит**

```bash
git add src/products/hosts.service.ts src/products/hosts.service.spec.ts \
        src/products/provisioning.service.ts src/products/products.module.ts \
        src/products/provisioning.integration.spec.ts
git commit -m "feat(products): новый продукт уезжает на машину с местом"
```

---

## Task 5: Фаза выката обходит все машины

> `PHASE 4` написана 21.09.2026 **под один адрес** — `PRODUCTS_HOST`. С реестром она обязана обойти все машины и назвать каждую поимённо.

**Файлы:**
- Изменить: `spirits_back/scripts/deploy.sh`

- [ ] **Шаг 1: Прочитать, что уже есть**

Фаза лежит между `PHASE 2` и `PHASE 3`. Её устройство: проверка достижимости с `BatchMode=yes`, сверка `product-vhost` по содержимому, сверка HEAD прода с локальным, ожидание освобождения агента, установка штатным `product-host-agent-install.sh`.

**`FORCE=1` не передаётся никогда** — сторож написан против аварии, в которой перезапуск убивает `docker run` вместе с control-group, и подчистка не отрабатывает.

- [ ] **Шаг 2: Взять список машин из базы**

Список читается **с прода**, а не из локального файла: реестр живёт в базе, и локальная копия разошлась бы молча.

```bash
products_hosts_list() {
  ssh_prod "psql \"\$(grep -E '^DATABASE_URL=' ~/spirits_back/.env | cut -d= -f2- | tr -d '\"')\" \
    -tAc \"SELECT id || ' ' || ssh_target FROM product_hosts ORDER BY id\""
}
```

Список пуст или запрос не удался — **отказ фазы**, а не «возьму умолчание». Умолчание здесь означает выкат на одну машину при живых нескольких, то есть частичное расхождение, которое потом ищут руками.

- [ ] **Шаг 3: Обойти машины**

Каждая машина обходится отдельно, результат копится:

```bash
  local failed=0 total=0
  while read -r hid target; do
    [[ -n "$hid" ]] || continue
    total=$((total+1))
    bold "[машина $hid] $target"
    products_host_one "$target" || { failed=$((failed+1)); warn "машина $hid не доехала"; }
  done < <(products_hosts_list)
```

**Одна недоступная не отменяет остальных**: они независимы, и половина обновлённых лучше, чем ни одной. Но итог называет, сколько машин из скольких не доехало, и фаза возвращает ненулевой код — `ALL PHASES GREEN` не печатается.

- [ ] **Шаг 4: Проверить, не выкатывая**

`deploy.sh` целиком **не запускать**. Проверять тем же способом, которым проверялась сама фаза 4: вырезать всё до точки входа байт в байт, подменить диспетчер, гонять настоящие функции со стабом `ssh_remote`. Плюс `bash -n`, `shellcheck` и прогон с `PRODUCTS_HOST_CHECK_ONLY=1` против живой машины — он ничего не пишет.

**Ломать нарочно обязательно**: пустой список, недоступная вторая машина при живой первой, запрос к базе, вернувший мусор.

- [ ] **Шаг 5: Коммит**

```bash
git add scripts/deploy.sh
git commit -m "feat(deploy): фаза машин продуктов обходит весь реестр"
```

---

## Task 6: Живая проверка

**Файлов нет** — проверка на живых машинах.

- [ ] **Шаг 1: Завести вторую машину**

Дроплет, агент через `scripts/product-host-agent-install.sh`, изоляция через `scripts/product-host-harden.sh`, зона доменов, копии кода. **Свой токен**, не тот же самый.

Строка в реестре заводится запросом; `agent_token_hash` — sha256 нового токена.

- [ ] **Шаг 2: Два агента, два задания**

Завести одновременно продукт владельца и продукт обычного пользователя. Ожидание: каждый встал на свою машину, оба отвечают 200, домены из разных зон.

Проверять **состояние**, а не отсутствие ошибок: `docker ps` на обеих машинах, `host_id` в базе, ответ по обоим доменам.

- [ ] **Шаг 3: Агент с чужим токеном — ОБЯЗАТЕЛЬНЫЙ**

Подменить токен в конфиге агента второй машины на токен первой. Ожидание: агент **не получает работы**, в журнале строка про неизвестный токен, задания первой машины к нему **не уезжают**.

Вернуть токен, убедиться, что работа возобновилась.

- [ ] **Шаг 4: Потолок**

Выставить машине потолок, равный числу её продуктов. Ожидание: заведение отбивается текстом про отсутствие мест, на машинах ничего не остаётся.

- [ ] **Шаг 5: Убрать за собой**

Снести подопытные продукты с обеих машин: контейнеры, каталоги, конфиги доменов, `nginx -t` и перечитывание. Строки в базе заархивировать. Убедиться, что `demo` и `shop2` отвечают.

---

## Самопроверка плана

**Покрытие спеки.** Реестр и его колонки — Task 1; токен как метка — Task 2; фильтр выдачи — Task 3; выбор машины, аудитория, потолок со спящими, уход констант — Task 4; фаза выката по всем машинам — Task 5; живые сценарии, включая чужой токен, — Task 6. Отказ миграции при несопоставленном продукте — Task 1, шаг 4, сценарий 41.

**Согласованность имён.** `product_hosts`, `host_id`, `agent_token_hash`, `accepts_new`, `audience`, `capacity` — в Task 1, 3, 4, 5 совпадают. `claimJob(hostId)` — Task 3 и Task 5. `pickForNewProduct(isAdmin)` — Task 4.

**Известные незакрытые места, названные честно:**

- **`create` получает новый параметр `isAdmin`.** Кто его передаёт — контроллер, у которого есть пользователь. Проверь, что признак берётся тем же способом, которым закрыта вкладка «Продукты» в Студии, и что второго понятия «свой пользователь» не заводится.
- **Параметр сессии в миграции (Task 1, шаг 2) может не пережить пул.** `set_config(..., true)` действует до конца транзакции; если `applyMigration` ходит через пул, каждый запрос — своя транзакция. Это проверяется первым делом, и если так — токен подставляется параметром в `INSERT`, вынесенным из файла в код.
- **Потолок `20` у машины `own` выбран на глаз.** Замерено 21.09.2026: продукт ест около 90 МБ, на машине 3 ГБ свободно и два ядра. Двадцать спящих поместятся, двадцать одновременно работающих — нет. Настоящий предел — одновременные правки, а не число продуктов; этого кусок не решает, и число стоит пересмотреть по первой живой нагрузке.
