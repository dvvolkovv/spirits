# Свой домен для продуктов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** владелец сайта в Линкеоне привязывает свой домен (`dmitryvolkov.ru` к `dmitryvolkov.p.linkeon.io`) из кабинета или через ассистента; платформа сама проверяет DNS, выпускает сертификат Let's Encrypt и держит домен во всех состояниях продукта.

**Architecture:** реестр `product_domains` на сервере — единственный источник правды. Сервер проверяет DNS через публичные резолверы и одним оператором переводит домен в выпуск вместе с постановкой задания `domain` агенту машины. Агент пишет свои имена в **тот же** конфиг продукта через `product-vhost --domain` и выпускает сертификат `certbot --webroot`. Список имён приезжает в каждом задании (заведение, сон, пробуждение), поэтому заглушки ложатся на свой домен сами. Владение подтверждается TXT-записью с разовым кодом.

**Tech Stack:** NestJS 10, PostgreSQL 16, `tldts` (список публичных суффиксов), Node `dns.promises.Resolver`, product-runner (TypeScript, свой jest), POSIX sh (`product-vhost`), certbot 2.9 + nginx 1.24 на машинах продуктов, React 18 + vitest (кабинет), i18next (7 локалей).

**Спека:** [2026-09-24-linkeon-products-custom-domain-design.md](../specs/2026-09-24-linkeon-products-custom-domain-design.md)

---

## Что выяснилось при разведке и влияет на план

Прочитать до первой задачи. Всё ниже сверено с `origin/main` обоих репозиториев и с машинами 24.09.2026.

**Устройство, на которое опирается план**

1. **`claimJob` раздаёт задания по `CASE j.kind … ELSE p.status = 'sleeping'`** (`provisioning.service.ts:724`). Вид `domain` без своей ветки выдавался бы только спящим, а у работающего висел бы вечно. Нужна явная ветка (задача 6).
2. **`completeJob` при отказе пишет `provision_error` в продукт для любого вида** (`provisioning.service.ts:915`). Отказ выпуска выглядел бы в карточке как «ошибка заведения». Отчёт по `domain` разбирается своей веткой (задача 6).
3. **Модульные миграции исполняются все подряд при каждом старте API.** `004_rent.sql:74-76` заново навешивает `product_provision_jobs_kind_check` со словарём `('provision','sleep','wake')`. Первое же задание `domain` уронило бы 004 на каждом старте — молча, `applyMigration` ловит отказ. Поэтому `domain` вписывается и в 008, и в 004. Страж правила — `products.migration.spec.ts`, тест «один именованный словарь — один состав во ВСЕХ миграциях». Словарь видов объявлен только в 004 (задача 1).
4. **Намерение задания `domain` не хранится в задании** — его даёт состояние строки домена: `issuing` — привязка, `removing` — отвязка. Оба перехода делаются одним оператором вместе с постановкой задания. Агент понимает намерение по списку имён: непустой — привязать, пустой — отвязать (задачи 6, 11).
5. **`product-vhost` зовут три места агента**: `provision.ts:476`, `sleep.ts:96`, `sleep.ts:222`. Во все три должны доехать имена, иначе первый же сон уберёт домен из конфига (задача 10).
6. **`workFor` отдаёт сну и пробуждению явную выжимку задания, а не задание целиком** — чтобы на хостовой шаг не уехали токен раннера и секреты. Задание `domain` получает такую же выжимку (задача 11).
7. **Wildcard-записи есть в обеих зонах машин**: `*.p.linkeon.io` → 139.59.210.42, `*.c.linkeon.io` → 206.81.17.255. На обеих машинах есть боевая учётная запись Let's Encrypt; на второй (`clients`) есть и учётная запись staging, а продуктов нет — репетиция идёт туда (задача 18).
8. **Хуков продления certbot на машинах нет** (`renewal-hooks` пусты). Это касается уже работающего wildcard `*.p.linkeon.io` (до 08.12.2026). Задача 13 закрывает это для всех сертификатов.
9. **Бэкенд — npm (`package-lock.json`)**, библиотеки публичных суффиксов нет. **Кабинет — 7 языков** (`ru en de es fr pt zh`), ключа `products.domain` ещё нет ни в одном.
10. **Колонка называется `check_result`, а не `check`**, как в спеке: `check` — зарезервированное слово SQL.

**Дыры, которых в спеке нет и которые план закрывает**

11. **Гашение и снятие блокировки снимают активное задание ЛЮБОГО вида** (`block.service.ts`, CTE `killed_jobs`), сборщик зависших — тоже (`failStaleProvisioning`: любое задание старше срока). Снятое задание `domain` оставило бы строку в `issuing` или `removing` навсегда: отвязать нельзя, фоновый оборот её не видит, индекс держит домен занятым. Спека сама называет «`issuing` без задания — навсегда» дефектом. **Лечение — сверка сирот в фоновом обороте:** строка в `issuing`/`removing` без активного задания переводится в `failed` с понятным текстом (задача 5).
12. **`promoteReady` переводит проснувшийся продукт в `running`, только если ПОСЛЕДНЕЕ задание — удачное пробуждение** (`WOKEN_SQL`, `provisioning.service.ts:285`). Задание `domain`, вставшее между пробуждением и переводом, оставило бы продукт «спящим» с работающим контейнером. А режим конфига, вычисленный по статусу `sleeping`, вернул бы на его адрес страницу 503. **Лечение:** в «последнее задание» `domain` не входит, режим конфига считается тем же предикатом (задача 6).
13. **Фоновая проверка перевела бы в выпуск и погашенный продукт** — то есть новая привязка у погашенного, которую спека запрещает. `tryIssue` сверяет статус продукта, оборот погашенных не берёт (задачи 4, 5).
14. **Длина имени — предел всей машины.** Замерено на ноде (nginx 1.24, строка кэша 64 — как на обеих машинах): при `server_names_hash_bucket_size` по умолчанию **имя от 47 знаков роняет `nginx -t`**. Это задевает и сегодняшнюю систему: слаг до 40 знаков плюс `.p.linkeon.io` даёт до 53, **продукт со слагом от 34 знаков завести нельзя** (замерено: 34 знака — `nginx -t` красный). PHASE 4 ставит корзину 128 (потолок 110 знаков), свои имена ограничены 100 (задачи 2, 12, 13).
15. **`product-vhost` оставлял на диске файл, не прошедший `nginx -t`** — и дальше падал `nginx -t` для всей машины. Новая редакция откатывает прежний файл. **Скрипт из задачи 12 уже прогнан на ноде с настоящим `nginx -t`**: все режимы, откат, пороги длины, отказы до записи.
16. **`nginx -t` в 1.24 привязывает порты.** Проверка в песочнице без root переносит 80/443 выше 1024 (обёртка в тесте задачи 12).
17. **Отказ certbot оставлял бы блоки порта 80 на машине** до следующей перегенерации конфига. Продукт, который потом законно получит этот домен, делил бы с ними `server_name`. Агент откатывает конфиг без своих имён (задача 11).
18. **«`https://<домен>` — главная ссылка карточки»** требует, чтобы работающий свой домен приезжал в списке продуктов. Колонка `custom_domain` в выборке и помощник `siteAddress` во фронте (задачи 8, 14, 15).

**Приметы кода, на которых легко споткнуться**

19. `assertUuid` бросает `NotFoundException`, а не 400.
20. У `FakeHost` нет метода `deps()` — фабрика отдельная: `deps(host, over)` из `fake-host.ts`. Фикстуры: `job(over)` в `provision.spec.ts`, `seed(slug)` и `asleep(slug)` в `sleep.spec.ts`, `host.ran(bin)` у симулятора.
21. `HostDeps` литералом собирают `makeDeps` в `index.spec.ts` и тест в `review10.defects.spec.ts`. Поле `domain` у `HostDeps` обязательное (как `sleepProduct`), и оба литерала надо дополнить. Иначе ts-jest откажет в сборке набора, и тот молча выпадет из счёта.
22. **Живые наборы против одной базы — только `--runInBand`.** У каждого `TRUNCATE` и страж «база пуста»; параллельные воркеры стёрли бы друг другу данные.
23. `apiClient.delete` во фронте есть, но в подмене `productsApi.test.ts` его нет — дописать.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `spirits_back/src/products/migrations/008_domains.sql` (создать) | таблица `product_domains`, уникальность занятых доменов, вид задания `domain` |
| `spirits_back/src/products/migrations/004_rent.sql` (править) | словарь видов заданий дополняется `domain` |
| `spirits_back/src/products/domain-name.ts` (создать) | нормализация ввода, корень или поддомен, запреты, потолок длины |
| `spirits_back/src/products/domain-dns.ts` (создать) | проверка DNS через подменяемый резолвер |
| `spirits_back/src/products/domains.service.ts` (создать) | привязка, отвязка, проверка, выпуск, сверка сирот, фоновый оборот |
| `spirits_back/src/products/provisioning.service.ts` (править) | вид `domain` в выдаче и отчёте, имена в каждом задании, `wokenSql` |
| `spirits_back/src/products/products.controller.ts` (править) | четыре ручки `/products/:id/domain` |
| `spirits_back/src/products/products.service.ts` (править) | `custom_domain` в выборке кабинета |
| `spirits_back/src/products/products.module.ts` (править) | регистрация `DomainsService` |
| `spirits_back/src/products/product-tool.service.ts` (править) | действие `domain` у `manage_product`, поиск по своему домену |
| `spirits_back/product-runner/src/host/vhost.ts` (создать) | командная строка `product-vhost`, проверка имени |
| `spirits_back/product-runner/src/host/domain.ts` (создать) | задание `domain`: конфиг → certbot → конфиг; отвязка; откат |
| `spirits_back/product-runner/src/host/{api,index,provision,sleep,fake-host}.ts` (править) | поля задания, вид `domain`, имена во всех вызовах |
| `spirits_back/scripts/product-vhost` (переписать) | `--domain`, откат при красном `nginx -t`, потолок длины, пути для теста |
| `spirits_back/scripts/linkeon-reload-nginx` (создать) | хук certbot: перечитать nginx после продления |
| `spirits_back/scripts/linkeon-products-nginx.conf` (создать) | корзина имён 128 для nginx машин |
| `spirits_back/scripts/deploy.sh` (править) | PHASE 4: шаг «nginx под свои домены», нумерация `/5` |
| `spirits_back/relay-agent/server.mjs` (править) | строка про `domain` в `PRODUCTS_PROMPT` |
| `spirits_front/src/services/productsApi.ts` (править) | типы, четыре вызова, `custom_domain`, `siteAddress` |
| `spirits_front/src/components/products/CustomDomain.tsx` (создать) | блок «Свой домен» в карточке |
| `spirits_front/src/components/products/ProductsListView.tsx` (править) | блок в карточке сайта, адрес из `siteAddress` |
| `spirits_front/src/components/products/ProductsSection.tsx` (править) | ссылка открытого продукта из `siteAddress` |
| `spirits_front/src/i18n/locales/*.json` (править, 7 файлов) | ключи `products.domain.*` |

---

## Как гонять

Всё тяжёлое — на тестовой ноде `dv@85.192.61.231`, в CI-клонах `~/ci/`, всегда с `source ~/.nvm/nvm.sh`. **`~/spirits_back` и `~/spirits_front` на ноде не трогать** — это живые чекауты стенда. Бэкенд ставится только `npm ci`, не pnpm.

Работа идёт в воркдеревьях: параллельные сессии коммитят в общие чекауты.

```bash
git -C ~/Downloads/spirits_back fetch -q origin
git -C ~/Downloads/spirits_back worktree add -b feat/custom-domain ~/Downloads/spirits_back/.worktrees/custom-domain origin/main
git -C ~/Downloads/spirits_front fetch -q origin
git -C ~/Downloads/spirits_front worktree add -b feat/custom-domain ~/Downloads/spirits_front/.worktrees/custom-domain origin/main
```

После каждого коммита — на ноду, **по sha, а не по имени ветки**:

```bash
cd ~/Downloads/spirits_back/.worktrees/custom-domain && git push -q -u origin feat/custom-domain
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_back && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && npm ci --silent && (cd product-runner && npm ci --silent)"
```

Для фронта — то же с `~/ci/spirits_front` и `pnpm install`.

Одноразовая база для тестов против живого Postgres (создаётся один раз):

```bash
ssh dv@85.192.61.231 'sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='"'"'pdom'"'"'" | grep -q 1 || sudo -u postgres psql -q -c "CREATE ROLE pdom LOGIN PASSWORD '"'"'pdom'"'"';"; sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='"'"'pdom'"'"'" | grep -q 1 || sudo -u postgres psql -q -c "CREATE DATABASE pdom OWNER pdom;"'
```

Команды:

- бэкенд: `PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="<шаблон>"`
- агент: `cd product-runner && npx jest <шаблон>`
- типы: `npx tsc --noEmit -p tsconfig.build.json` (бэкенд), `cd product-runner && npx tsc --noEmit` (агент), `npx tsc --noEmit -p tsconfig.app.json` (кабинет)
- кабинет: `npx vitest run <файл>`

**Ловушки прибора — все уже оплачены в этом проекте:**
- без `PROVISIONING_PG_URL` живые наборы пропускаются целиком, а прогон зелёный. Читать `Tests:` на `skipped`;
- набор, упавший на загрузке, исчезает из счёта, а `Tests:` остаётся зелёным. Читать и `Test Suites:`;
- два живых набора без `--runInBand` стирают друг другу данные;
- jest бэкенда не проверяет типы — гейт только `tsc`;
- голый `tsc --noEmit` во фронте компилирует ноль файлов — только с `-p tsconfig.app.json`;
- у `tsconfig.json` агента исключены `*.spec.ts` — типы спеков проверяет ts-jest в прогоне;
- тест `product-vhost` с настоящим `nginx -t` идёт только там, где есть `/usr/sbin/nginx` (на ноде есть). На ноде у этого файла обязано быть **0 skipped**.

---

### Task 1: Миграция 008 и словарь видов заданий

**Files:**
- Create: `spirits_back/src/products/migrations/008_domains.sql`
- Modify: `spirits_back/src/products/migrations/004_rent.sql:74-76`
- Modify: `spirits_back/src/products/products.service.ts` (массив `MIGRATIONS`)
- Test: `spirits_back/src/products/domains.migration.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/src/products/domains.migration.spec.ts`:

```ts
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { MIGRATIONS } from './products.service';

const PG = process.env.PROVISIONING_PG_URL;
const maybe = PG ? describe : describe.skip;

const WIPE = 'TRUNCATE products, product_provision_jobs, product_turns, product_host_agent, product_hosts RESTART IDENTITY CASCADE';

maybe('миграция 008: свой домен', () => {
  jest.setTimeout(60_000);
  let pool: Pool;

  const sqlOf = (f: string) => fs.readFileSync(path.join(__dirname, 'migrations', f), 'utf8');

  const mkHost = () =>
    pool.query(
      `INSERT INTO product_hosts (id, ssh_target, public_ip, domain_suffix, agent_token_hash, capacity, audience)
       VALUES ('own', 'root@139.59.210.42', '139.59.210.42', 'p.linkeon.io', 'probe-hash', 20, 'own')`,
    );

  const mkProduct = async (slug: string, user = '79030169187') => {
    const r = await pool.query(
      `INSERT INTO products (user_id, name, slug, kind, status, checkout_path, runner_token_hash, host_id)
       VALUES ($1, $2, $2, 'site', 'running', $3, $4, 'own') RETURNING id`,
      [user, slug, `/srv/${slug}`, `hash-${slug}`],
    );
    return r.rows[0].id as string;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: PG, max: 4 });
    for (const f of MIGRATIONS) await pool.query(sqlOf(f));
    // Гард на чужую базу: TRUNCATE ниже адрес не разбирает.
    const n = await pool.query('SELECT count(*) FROM products');
    if (Number(n.rows[0].count) > 0) throw new Error('PROVISIONING_PG_URL указывает на НЕпустую базу');
  });
  afterAll(async () => {
    await pool?.query(WIPE);
    await pool?.end();
  });
  beforeEach(async () => {
    await pool.query(WIPE);
    await mkHost();
  });

  it('задание вида domain ставится', async () => {
    const id = await mkProduct('shop');
    await pool.query(`INSERT INTO product_provision_jobs (product_id, kind, status) VALUES ($1, 'domain', 'queued')`, [id]);
    const r = await pool.query(`SELECT kind FROM product_provision_jobs`);
    expect(r.rows[0].kind).toBe('domain');
  });

  // Главный сторож задачи. Модуль накатывает ВЕСЬ список при каждом старте;
  // 004 со старым словарём падала бы на существующем задании 'domain' — молча,
  // потому что applyMigration ловит отказ и едет дальше.
  it('повторная накатка всех миграций переживает существующее задание domain', async () => {
    const id = await mkProduct('shop');
    await pool.query(`INSERT INTO product_provision_jobs (product_id, kind, status) VALUES ($1, 'domain', 'done')`, [id]);
    for (const f of MIGRATIONS) {
      await expect(pool.query(sqlOf(f))).resolves.toBeDefined();
    }
  });

  it('один свой домен на продукт', async () => {
    const id = await mkProduct('shop');
    await pool.query(`INSERT INTO product_domains (product_id, domain, names, token) VALUES ($1, 'a.ru', '{a.ru,www.a.ru}', 'lk-1')`, [id]);
    await expect(
      pool.query(`INSERT INTO product_domains (product_id, domain, names, token) VALUES ($1, 'b.ru', '{b.ru}', 'lk-2')`, [id]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('заявок в awaiting_dns на один домен может быть несколько', async () => {
    const a = await mkProduct('shop-a');
    const b = await mkProduct('shop-b', '70000000000');
    await pool.query(`INSERT INTO product_domains (product_id, domain, names, token) VALUES ($1, 'a.ru', '{a.ru}', 'lk-1')`, [a]);
    await expect(
      pool.query(`INSERT INTO product_domains (product_id, domain, names, token) VALUES ($1, 'a.ru', '{a.ru}', 'lk-2')`, [b]),
    ).resolves.toBeDefined();
  });

  it('занятый домен второй раз не занимается: индекс product_domains_occupied', async () => {
    const a = await mkProduct('shop-a');
    const b = await mkProduct('shop-b', '70000000000');
    await pool.query(`INSERT INTO product_domains (product_id, domain, names, token, status) VALUES ($1, 'a.ru', '{a.ru}', 'lk-1', 'active')`, [a]);
    await pool.query(`INSERT INTO product_domains (product_id, domain, names, token) VALUES ($1, 'a.ru', '{a.ru}', 'lk-2')`, [b]);
    await expect(
      pool.query(`UPDATE product_domains SET status = 'issuing' WHERE product_id = $1`, [b]),
    ).rejects.toMatchObject({ code: '23505', constraint: 'product_domains_occupied' });
  });

  it('словарь состояний закрыт', async () => {
    const id = await mkProduct('shop');
    await expect(
      pool.query(`INSERT INTO product_domains (product_id, domain, names, token, status) VALUES ($1, 'a.ru', '{a.ru}', 'lk', 'weird')`, [id]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('удаление продукта уносит его домен', async () => {
    const id = await mkProduct('shop');
    await pool.query(`INSERT INTO product_domains (product_id, domain, names, token) VALUES ($1, 'a.ru', '{a.ru}', 'lk')`, [id]);
    await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
    const r = await pool.query(`SELECT count(*) FROM product_domains`);
    expect(Number(r.rows[0].count)).toBe(0);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/domains.migration" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|✕"'
```

Ожидается: FAIL — `relation "product_domains" does not exist` и отказ CHECK на `kind = 'domain'`. Если видишь `skipped` — переменная не доехала, прогона не было.

- [ ] **Step 3: Написать миграцию 008**

`spirits_back/src/products/migrations/008_domains.sql`:

```sql
-- Свой домен продукта.
-- Дизайн: spirits_front/docs/superpowers/specs/2026-09-24-linkeon-products-custom-domain-design.md
--
-- ОДНА СТРОКА НА ПРОДУКТ: первичный ключ по product_id и есть правило «один
-- свой домен на продукт». Отдельная таблица, а не колонки products, — у домена
-- свои состояния, свой разовый код и своя уникальность, и всё это не касается
-- ни одного другого места, читающего products.
--
-- Состояния: awaiting_dns → issuing → active; failed — отказ Let's Encrypt,
-- агента или снятое задание; removing — отвязка поставлена агенту. Словарь
-- инлайновый: таблица новая, и CREATE TABLE ниже исполняется ровно один раз
-- (страж именованных словарей в products.migration.spec.ts инлайновые
-- намеренно не видит).
--
-- check_result, а не check: check — зарезервированное слово SQL.
CREATE TABLE IF NOT EXISTS product_domains (
  product_id     uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  domain         text NOT NULL,
  names          text[] NOT NULL,
  token          text NOT NULL,
  status         text NOT NULL DEFAULT 'awaiting_dns'
                 CHECK (status IN ('awaiting_dns','issuing','active','failed','removing')),
  error          text,
  check_result   jsonb,
  checked_at     timestamptz,
  attempts       int NOT NULL DEFAULT 0,
  attempts_since timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  activated_at   timestamptz
);

-- Уникальность ТОЛЬКО среди занятых доменов. Заявок в awaiting_dns на один
-- домен может быть сколько угодно, у каждой свой код: домен достаётся той,
-- чей TXT первым появится в DNS. Переход в issuing — одним оператором, и
-- этот индекс не пускает туда вторую заявку. Так нельзя ни забронировать
-- чужой домен впрок, ни перехватить работающий.
CREATE UNIQUE INDEX IF NOT EXISTS product_domains_occupied
  ON product_domains (domain) WHERE status IN ('issuing','active','removing');

-- Вид задания 'domain'. Тот же именованный словарь объявлен в 004_rent.sql,
-- и составы ОБЯЗАНЫ совпадать: модуль накатывает весь список при каждом
-- старте, и 004 со старым словарём падала бы на первом же задании 'domain' —
-- молча, applyMigration ловит отказ. Страж — products.migration.spec.ts.
ALTER TABLE product_provision_jobs DROP CONSTRAINT IF EXISTS product_provision_jobs_kind_check;
ALTER TABLE product_provision_jobs ADD CONSTRAINT product_provision_jobs_kind_check
  CHECK (kind IN ('provision','sleep','wake','domain'));
```

- [ ] **Step 4: Дополнить словарь в 004**

В `spirits_back/src/products/migrations/004_rent.sql` над строкой 74 дописать:

```sql
-- 'domain' — вид из 008_domains.sql. Вписан и сюда: 004 исполняется при каждом
-- старте и навешивает словарь на уже живые задания (см. 008).
```

и строку 76

```sql
  CHECK (kind IN ('provision','sleep','wake'));
```

заменить на

```sql
  CHECK (kind IN ('provision','sleep','wake','domain'));
```

- [ ] **Step 5: Зарегистрировать миграцию**

В `spirits_back/src/products/products.service.ts` в массив `MIGRATIONS` после `'007_selfservice.sql',` добавить `'008_domains.sql',`.

- [ ] **Step 6: Прогнать новый тест и страж словарей**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/(domains.migration|products.migration)" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|✕"'
```

Ожидается: оба набора `PASS`, в `domains.migration` — 7 passed, 0 skipped.

- [ ] **Step 7: Мутация — 004 без `domain`**

Временно на ноде вернуть в 004 старый словарь. Ожидается красный «один именованный словарь — один состав» в `products.migration.spec.ts` **и** красный «повторная накатка … переживает существующее задание domain». Вернуть (`git checkout -- src/products/migrations/004_rent.sql`).

- [ ] **Step 8: Коммит**

```bash
git add src/products/migrations/008_domains.sql src/products/migrations/004_rent.sql src/products/products.service.ts src/products/domains.migration.spec.ts
git commit -m "feat(products): таблица своих доменов и вид задания domain"
```

---

### Task 2: Нормализация домена

**Files:**
- Modify: `spirits_back/package.json`, `spirits_back/package-lock.json` (зависимость `tldts`)
- Create: `spirits_back/src/products/domain-name.ts`
- Test: `spirits_back/src/products/domain-name.spec.ts`

- [ ] **Step 1: Добавить `tldts`**

Локально, без установки `node_modules` (мак не тянет установку, а лок обязан быть в коммите):

```bash
cd ~/Downloads/spirits_back/.worktrees/custom-domain && npm install tldts@^7 --save --package-lock-only
git diff --stat package.json package-lock.json
```

Ожидается: в `dependencies` появился `"tldts": "^7.…"`, лок обновлён.

- [ ] **Step 2: Написать падающий тест**

`spirits_back/src/products/domain-name.spec.ts`:

```ts
import { MAX_NAME_LENGTH, normalizeDomain, relativeName } from './domain-name';

const ok = (raw: string) => {
  const r = normalizeDomain(raw);
  if (!r.ok) throw new Error(`ждали ok для ${raw}, получили ${r.reason}`);
  return r;
};
const refused = (raw: unknown) => {
  const r = normalizeDomain(raw);
  if (r.ok) throw new Error(`ждали отказ для ${String(raw)}, получили ${r.domain}`);
  return r.reason;
};

describe('нормализация своего домена', () => {
  it('корень привязывается вместе с www', () => {
    expect(ok('dmitryvolkov.ru')).toEqual({
      ok: true, domain: 'dmitryvolkov.ru', zone: 'dmitryvolkov.ru', apex: true,
      names: ['dmitryvolkov.ru', 'www.dmitryvolkov.ru'],
    });
  });

  it('поддомен привязывается один, без www', () => {
    expect(ok('shop.dmitryvolkov.ru')).toMatchObject({
      domain: 'shop.dmitryvolkov.ru', zone: 'dmitryvolkov.ru', apex: false, names: ['shop.dmitryvolkov.ru'],
    });
  });

  it('www.<корень> понимается как корень', () => {
    expect(ok('www.dmitryvolkov.ru')).toMatchObject({ domain: 'dmitryvolkov.ru', apex: true });
  });

  it('схема, путь, запрос, порт, регистр и точка на конце снимаются', () => {
    expect(ok('https://Www.DmitryVolkov.RU:443/path?x=1#top').domain).toBe('dmitryvolkov.ru');
    expect(ok('dmitryvolkov.ru.').domain).toBe('dmitryvolkov.ru');
    expect(ok('  DMITRYVOLKOV.RU  ').domain).toBe('dmitryvolkov.ru');
  });

  // Корень определяется по списку публичных суффиксов, а не «две метки»:
  // иначе site.co.uk считался бы поддоменом co.uk, а shop.site.ru — корнем.
  it('корень по списку публичных суффиксов', () => {
    expect(ok('site.co.uk')).toMatchObject({ apex: true, zone: 'site.co.uk' });
    expect(ok('shop.site.co.uk')).toMatchObject({ apex: false, zone: 'site.co.uk' });
    expect(ok('site.spb.ru')).toMatchObject({ apex: true });
  });

  it('кириллица переводится в punycode', () => {
    expect(ok('пример.рф')).toMatchObject({ domain: 'xn--e1afmkfd.xn--p1ai', apex: true });
  });

  it('IP — не домен', () => {
    expect(refused('1.2.3.4')).toBe('ip');
    expect(refused('1.2.3.4:8080')).toBe('ip');
    expect(refused('[::1]')).toBe('ip');
    expect(refused('[2a00:15f8::1]:443')).toBe('ip');
    expect(refused('http://139.59.210.42/')).toBe('ip');
  });

  it('зоны Линкеона — наши, а не свои', () => {
    expect(refused('linkeon.io')).toBe('our_zone');
    expect(refused('demo.p.linkeon.io')).toBe('our_zone');
    expect(refused('x.c.linkeon.io')).toBe('our_zone');
  });

  it('чужой домен с похожим хвостом — не наша зона', () => {
    expect(ok('evil-linkeon.io').domain).toBe('evil-linkeon.io');
  });

  it('пустое, без точки и кривая форма отбиваются', () => {
    expect(refused('')).toBe('empty');
    expect(refused(undefined)).toBe('empty');
    expect(refused('localhost')).toBe('no_dot');
    expect(refused('a..b.ru')).toBe('bad_form');
    expect(refused('-bad.ru')).toBe('bad_form');
    expect(refused('co.uk')).toBe('bad_form');
    expect(refused('under_score.ru')).toBe('bad_form');
  });

  // Замер на nginx 1.24 машин продуктов: длинное имя роняет `nginx -t` всей
  // машины. Потолок — на каждое имя, включая www.
  it('имя длиннее потолка отбивается, ровно потолок — нет', () => {
    const exact = `${'a'.repeat(48)}.${'b'.repeat(48)}.ru`;
    expect(exact.length).toBe(MAX_NAME_LENGTH);
    expect(ok(exact).names).toEqual([exact]);
    expect(refused(`${'a'.repeat(50)}.${'b'.repeat(50)}.ru`)).toBe('too_long');
  });

  it('у отказа есть человеческий текст', () => {
    const r = normalizeDomain('1.2.3.4');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.say).toMatch(/IP/);
  });

  it('относительное имя записи — от зоны регистратора', () => {
    expect(relativeName('dmitryvolkov.ru', 'dmitryvolkov.ru')).toBe('@');
    expect(relativeName('www.dmitryvolkov.ru', 'dmitryvolkov.ru')).toBe('www');
    expect(relativeName('_linkeon.shop.dmitryvolkov.ru', 'dmitryvolkov.ru')).toBe('_linkeon.shop');
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/domain-name" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|Cannot find"'
```

Ожидается: FAIL, `Cannot find module './domain-name'`.

- [ ] **Step 4: Написать реализацию**

`spirits_back/src/products/domain-name.ts`:

```ts
import { isIP } from 'net';
import { domainToASCII } from 'url';
import { parse } from 'tldts';

/**
 * Зона Линкеона. Всё под ней — адреса платформы (p.linkeon.io, c.linkeon.io),
 * и «своим доменом» быть не может: у продукта такой адрес уже есть.
 */
export const OUR_ZONE = 'linkeon.io';

/**
 * Потолок длины КАЖДОГО имени, включая www. Замерено 24.09.2026 на nginx 1.24
 * машин продуктов: при server_names_hash_bucket_size по умолчанию (64) имя от
 * 47 знаков роняет `nginx -t` ВСЕЙ машины. PHASE 4 ставит корзину 128 —
 * потолок 110 знаков; 100 оставляет запас. Та же граница — в product-vhost.
 */
export const MAX_NAME_LENGTH = 100;

export type DomainRefusal = 'empty' | 'ip' | 'no_dot' | 'bad_form' | 'our_zone' | 'too_long';

export interface NormalizedDomain {
  /** Что привязываем: корень или поддомен, в punycode. */
  domain: string;
  /** Зона у регистратора (регистрируемый домен) — от неё считаются имена записей. */
  zone: string;
  /** Корень ли. Корень едет вместе с www. */
  apex: boolean;
  /** На какие имена выпускается сертификат. */
  names: string[];
}

export type NormalizeResult = ({ ok: true } & NormalizedDomain) | { ok: false; reason: DomainRefusal; say: string };

const SAY: Record<DomainRefusal, string> = {
  empty: 'Не указан домен.',
  ip: 'Это IP-адрес, а нужен домен — например, mysite.ru.',
  no_dot: 'Нужен домен целиком, вместе с зоной — например, mysite.ru.',
  bad_form: 'Это не похоже на домен. Пример правильного: mysite.ru.',
  our_zone: 'Это адрес Линкеона — он у продукта уже есть. Свой домен — тот, что вы купили у регистратора.',
  too_long: `Слишком длинный домен: вместе с www имя должно укладываться в ${MAX_NAME_LENGTH} знаков.`,
};

const refuse = (reason: DomainRefusal): NormalizeResult => ({ ok: false, reason, say: SAY[reason] });

/** Метка DNS: латиница, цифры, дефис внутри, до 63 знаков. */
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Ввод человека → домен, который можно привязать.
 *
 * Корень отличается от поддомена ТОЛЬКО по списку публичных суффиксов
 * (`tldts`): «две метки» ошиблись бы на site.co.uk (корень, три метки) и на
 * shop.site.ru (поддомен). Ошибка здесь стоила бы сертификата: корень без www
 * или поддомен с несуществующим www.
 */
export function normalizeDomain(raw: unknown): NormalizeResult {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return refuse('empty');

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // схема
  s = s.split(/[/?#]/)[0]; // путь, запрос, якорь

  // IPv6 — до снятия порта: двоеточия у него внутри адреса.
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracketed && isIP(bracketed[1])) return refuse('ip');
  if (isIP(s)) return refuse('ip');

  s = s.replace(/:\d+$/, '').replace(/\.+$/, '');
  if (!s) return refuse('empty');
  if (isIP(s)) return refuse('ip');

  const ascii = domainToASCII(s);
  if (!ascii) return refuse(s.includes('.') ? 'bad_form' : 'no_dot');
  if (!ascii.includes('.')) return refuse('no_dot');
  if (ascii.length > 253 || !ascii.split('.').every((label) => LABEL.test(label))) return refuse('bad_form');

  if (ascii === OUR_ZONE || ascii.endsWith(`.${OUR_ZONE}`)) return refuse('our_zone');
  const info = parse(ascii);
  if (info.isIp) return refuse('ip');
  if (!info.domain || !info.publicSuffix || !info.domainWithoutSuffix) return refuse('bad_form');

  let domain = ascii;
  if (domain.startsWith('www.') && domain.slice(4) === info.domain) domain = info.domain;
  const apex = domain === info.domain;
  const names = apex ? [domain, `www.${domain}`] : [domain];
  if (names.some((n) => n.length > MAX_NAME_LENGTH)) return refuse('too_long');
  return { ok: true, domain, zone: info.domain, apex, names };
}

/** Имя записи так, как его вводят в панели регистратора: относительно зоны. */
export function relativeName(fqdn: string, zone: string): string {
  return fqdn === zone ? '@' : fqdn.slice(0, -(zone.length + 1));
}
```

- [ ] **Step 5: Прогнать тест и типы**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/domain-name" 2>&1 | grep -E "^(PASS|FAIL|Tests:)|✕"; npx tsc --noEmit -p tsconfig.build.json && echo TSC_OK'
```

Ожидается: `Tests: 13 passed`, `TSC_OK`. Если красный только `-bad.ru` или `a..b.ru` с причиной `no_dot`, значит `domainToASCII` вернул пустую строку на имени с точкой — проверь ветку `if (!ascii)`.

- [ ] **Step 6: Коммит**

```bash
git add package.json package-lock.json src/products/domain-name.ts src/products/domain-name.spec.ts
git commit -m "feat(products): нормализация своего домена по списку публичных суффиксов"
```

---

### Task 3: Проверка DNS

**Files:**
- Create: `spirits_back/src/products/domain-dns.ts`
- Test: `spirits_back/src/products/domain-dns.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/src/products/domain-dns.spec.ts`:

```ts
import { checkDns, DnsResolver, TXT_LABEL } from './domain-dns';

type Zone = Record<string, { A?: string[]; AAAA?: string[]; TXT?: string[][]; fail?: string }>;

function fake(zone: Zone): DnsResolver {
  const pick = (name: string, key: 'A' | 'AAAA' | 'TXT') => {
    const r = zone[name];
    if (r?.fail) return Promise.reject(Object.assign(new Error(r.fail), { code: r.fail }));
    const v = r?.[key];
    if (!v) return Promise.reject(Object.assign(new Error('ENODATA'), { code: 'ENODATA' }));
    return Promise.resolve(v as any);
  };
  return {
    resolve4: (n) => pick(n, 'A'),
    resolve6: (n) => pick(n, 'AAAA'),
    resolveTxt: (n) => pick(n, 'TXT'),
  };
}

const IP = '139.59.210.42';
const INPUT = { domain: 'dmitryvolkov.ru', names: ['dmitryvolkov.ru', 'www.dmitryvolkov.ru'], token: 'lk-abc', hostIp: IP };
const READY: Zone = {
  [`${TXT_LABEL}.dmitryvolkov.ru`]: { TXT: [['lk-abc']] },
  'dmitryvolkov.ru': { A: [IP] },
  'www.dmitryvolkov.ru': { A: [IP] },
};

describe('проверка DNS своего домена', () => {
  it('всё на месте — ok', async () => {
    const r = await checkDns(INPUT, fake(READY));
    expect(r.ok).toBe(true);
    expect(r.records.map((x) => `${x.type} ${x.name}`)).toEqual([
      'TXT _linkeon.dmitryvolkov.ru',
      'A dmitryvolkov.ru', 'AAAA dmitryvolkov.ru',
      'A www.dmitryvolkov.ru', 'AAAA www.dmitryvolkov.ru',
    ]);
  });

  it('чужой TXT — не ok, и видно, что там сейчас', async () => {
    const r = await checkDns(INPUT, fake({ ...READY, [`${TXT_LABEL}.dmitryvolkov.ru`]: { TXT: [['lk-other']] } }));
    expect(r.ok).toBe(false);
    expect(r.records[0]).toMatchObject({ type: 'TXT', ok: false, current: ['lk-other'], want: 'lk-abc' });
  });

  it('TXT, разрезанный на куски, склеивается', async () => {
    const r = await checkDns(INPUT, fake({ ...READY, [`${TXT_LABEL}.dmitryvolkov.ru`]: { TXT: [['lk-', 'abc']] } }));
    expect(r.ok).toBe(true);
  });

  // Одна чужая A из нескольких — половина посетителей и проверка Let's Encrypt
  // уходят на старый хостинг.
  it('одна чужая A из нескольких — не ok', async () => {
    const r = await checkDns(INPUT, fake({ ...READY, 'dmitryvolkov.ru': { A: [IP, '90.156.201.49'] } }));
    expect(r.ok).toBe(false);
    expect(r.records.find((x) => x.type === 'A' && x.name === 'dmitryvolkov.ru')).toMatchObject({
      ok: false, current: [IP, '90.156.201.49'], want: IP,
    });
  });

  it('A нет вовсе — не ok', async () => {
    const r = await checkDns(INPUT, fake({ ...READY, 'www.dmitryvolkov.ru': {} }));
    expect(r.ok).toBe(false);
  });

  // У машин продуктов нет IPv6, а Let's Encrypt предпочитает IPv6.
  it('оставшаяся AAAA — не ok', async () => {
    const r = await checkDns(INPUT, fake({ ...READY, 'dmitryvolkov.ru': { A: [IP], AAAA: ['2a00:15f8::1'] } }));
    expect(r.ok).toBe(false);
    expect(r.records.find((x) => x.type === 'AAAA' && x.name === 'dmitryvolkov.ru')).toMatchObject({
      ok: false, current: ['2a00:15f8::1'],
    });
  });

  it('сбой резолвера — не ok и не «записи нет», а названная ошибка', async () => {
    const r = await checkDns(INPUT, fake({ ...READY, 'www.dmitryvolkov.ru': { fail: 'ESERVFAIL' } }));
    expect(r.ok).toBe(false);
    expect(r.records.find((x) => x.type === 'A' && x.name === 'www.dmitryvolkov.ru')?.current[0]).toMatch(/ESERVFAIL/);
  });

  it('поддомен — только своё имя', async () => {
    const r = await checkDns(
      { domain: 'shop.x.ru', names: ['shop.x.ru'], token: 't', hostIp: IP },
      fake({ [`${TXT_LABEL}.shop.x.ru`]: { TXT: [['t']] }, 'shop.x.ru': { A: [IP] } }),
    );
    expect(r.ok).toBe(true);
    expect(r.records).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/domain-dns" 2>&1 | grep -E "^(PASS|FAIL|Tests:)|Cannot find"'
```

Ожидается: FAIL, `Cannot find module './domain-dns'`.

- [ ] **Step 3: Написать реализацию**

`spirits_back/src/products/domain-dns.ts`:

```ts
import { promises as dnsp } from 'dns';

/** Имя TXT-записи подтверждения: `_linkeon.<домен>`. */
export const TXT_LABEL = '_linkeon';

export interface DnsResolver {
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
  resolveTxt(name: string): Promise<string[][]>;
}

export interface RecordCheck {
  type: 'TXT' | 'A' | 'AAAA';
  name: string;
  ok: boolean;
  /** Что сейчас в DNS. При сбое резолвера — одна строка «ошибка DNS: …». */
  current: string[];
  /** Что должно быть. У AAAA — пусто: записей быть не должно. */
  want: string;
}

export interface DnsCheckResult {
  ok: boolean;
  records: RecordCheck[];
}

export interface DnsCheckInput {
  domain: string;
  names: string[];
  token: string;
  hostIp: string;
}

/**
 * Публичные резолверы, а не системный кеш прод-сервера: пользователь поправит
 * запись, а системный резолвер ещё час отдавал бы старую. Проверено 24.09.2026 —
 * с прод-сервера 1.1.1.1 и 8.8.8.8 доступны, Resolver отдаёт A, TXT и AAAA.
 */
export function publicResolver(): DnsResolver {
  const r = new dnsp.Resolver({ timeout: 3000, tries: 1 });
  r.setServers(['1.1.1.1', '8.8.8.8']);
  return r;
}

/** «Записи нет» — не ошибка, а ответ. Всё остальное — сбой, и он называется. */
const NO_RECORD = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

async function lookup<T>(fn: () => Promise<T[]>): Promise<{ values: T[]; error: string | null }> {
  try {
    return { values: await fn(), error: null };
  } catch (e: any) {
    if (NO_RECORD.has(e?.code)) return { values: [], error: null };
    return { values: [], error: String(e?.code ?? e?.message ?? e) };
  }
}

/**
 * Готов ли домен к выпуску сертификата: все три условия сразу.
 *
 * 1. TXT `_linkeon.<домен>` содержит разовый код — домен принадлежит заявителю.
 *    Без этого на общем IP любой пользователь мог бы занять домен, уже
 *    направленный на машину другим.
 * 2. У КАЖДОГО имени ВСЕ A-записи — IP машины продукта. CNAME резолвер
 *    разворачивает сам и отдаёт итоговый A.
 * 3. AAAA нет ни у одного имени: у машин продуктов нет IPv6, а Let's Encrypt
 *    предпочитает IPv6 — одна оставшаяся AAAA роняет выпуск.
 */
export async function checkDns(input: DnsCheckInput, resolver: DnsResolver): Promise<DnsCheckResult> {
  const records: RecordCheck[] = [];

  const txtName = `${TXT_LABEL}.${input.domain}`;
  const txt = await lookup(() => resolver.resolveTxt(txtName));
  const txtValues = txt.values.map((chunks) => chunks.join(''));
  records.push({
    type: 'TXT',
    name: txtName,
    ok: !txt.error && txtValues.includes(input.token),
    current: txt.error ? [`ошибка DNS: ${txt.error}`] : txtValues,
    want: input.token,
  });

  for (const name of input.names) {
    const a = await lookup(() => resolver.resolve4(name));
    records.push({
      type: 'A',
      name,
      ok: !a.error && a.values.length > 0 && a.values.every((ip) => ip === input.hostIp),
      current: a.error ? [`ошибка DNS: ${a.error}`] : a.values,
      want: input.hostIp,
    });
    const aaaa = await lookup(() => resolver.resolve6(name));
    records.push({
      type: 'AAAA',
      name,
      ok: !aaaa.error && aaaa.values.length === 0,
      current: aaaa.error ? [`ошибка DNS: ${aaaa.error}`] : aaaa.values,
      want: '',
    });
  }

  return { ok: records.every((r) => r.ok), records };
}
```

- [ ] **Step 4: Прогнать тест и типы**

Ожидается: `Tests: 8 passed`, `TSC_OK`.

- [ ] **Step 5: Мутации**

Каждую — временно, на ноде, с возвратом:
- (а) `a.values.every(...)` → `a.values.some(...)` — ждём красный «одна чужая A»;
- (б) у AAAA `ok: true` — ждём красный «оставшаяся AAAA»;
- (в) `catch` в `lookup` глотает всё (возвращает пустоту без ошибки) — ждём красный «сбой резолвера».

- [ ] **Step 6: Коммит**

```bash
git add src/products/domain-dns.ts src/products/domain-dns.spec.ts
git commit -m "feat(products): проверка DNS своего домена — TXT, A на машину, без AAAA"
```

---

### Task 4: Сервис доменов — привязка, состояние, отвязка

**Files:**
- Create: `spirits_back/src/products/domains.service.ts`
- Test: `spirits_back/src/products/domains.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/src/products/domains.spec.ts`:

```ts
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { MIGRATIONS } from './products.service';
import { DomainsService } from './domains.service';
import { DnsResolver, TXT_LABEL } from './domain-dns';

const PG = process.env.PROVISIONING_PG_URL;
const maybe = PG ? describe : describe.skip;

const WIPE = 'TRUNCATE products, product_provision_jobs, product_turns, product_host_agent, product_hosts RESTART IDENTITY CASCADE';

/** Подменный DNS: изменяемая таблица записей. Пусто — «записи нет». */
class FakeDns implements DnsResolver {
  zone: Record<string, { A?: string[]; AAAA?: string[]; TXT?: string[][] }> = {};
  private get(name: string, key: 'A' | 'AAAA' | 'TXT') {
    const v = this.zone[name]?.[key];
    return v ? Promise.resolve(v as any) : Promise.reject(Object.assign(new Error('ENODATA'), { code: 'ENODATA' }));
  }
  resolve4 = (n: string) => this.get(n, 'A');
  resolve6 = (n: string) => this.get(n, 'AAAA');
  resolveTxt = (n: string) => this.get(n, 'TXT');
  /** Всё, что нужно для выпуска, — как сделал бы владелец домена. */
  ready(domain: string, names: string[], token: string, ip = '139.59.210.42') {
    this.zone[`${TXT_LABEL}.${domain}`] = { TXT: [[token]] };
    for (const n of names) this.zone[n] = { A: [ip] };
  }
}

maybe('свой домен: сервис против живого Postgres', () => {
  jest.setTimeout(60_000);
  let pool: Pool;
  let pg: { query: (sql: string, params?: any[]) => Promise<any> };
  let dns: FakeDns;

  const OWNER = '79030169187';
  const ALIEN = '70000000000';

  const svc = () => {
    const s = new DomainsService(pg as any);
    (s as any).resolver = dns;
    return s;
  };

  const mkProduct = async (o: { slug: string; user?: string; kind?: string; status?: string }) => {
    const r = await pool.query(
      `INSERT INTO products (user_id, name, slug, kind, status, checkout_path, runner_token_hash, host_id, port, domain)
       VALUES ($1, $2, $2, $3, $4, $5, $6, 'own', 8001, $7) RETURNING id`,
      [o.user ?? OWNER, o.slug, o.kind ?? 'site', o.status ?? 'running', `/srv/${o.slug}`, `hash-${o.slug}`,
       (o.kind ?? 'site') === 'site' ? `${o.slug}.p.linkeon.io` : null],
    );
    return r.rows[0].id as string;
  };
  const row = async (productId: string) =>
    (await pool.query(`SELECT * FROM product_domains WHERE product_id = $1`, [productId])).rows[0];
  const jobs = async (productId: string) =>
    (await pool.query(`SELECT kind, status FROM product_provision_jobs WHERE product_id = $1 ORDER BY created_at`, [productId])).rows;
  const putDomain = (productId: string, status: string, extra: { domain?: string; token?: string; error?: string } = {}) =>
    pool.query(
      `INSERT INTO product_domains (product_id, domain, names, token, status, error) VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, extra.domain ?? 'a.ru', [extra.domain ?? 'a.ru', `www.${extra.domain ?? 'a.ru'}`],
       extra.token ?? 'lk-x', status, extra.error ?? null],
    );

  beforeAll(async () => {
    pool = new Pool({ connectionString: PG, max: 8 });
    pg = { query: (sql: string, params?: any[]) => pool.query(sql, params) };
    for (const f of MIGRATIONS) await pool.query(fs.readFileSync(path.join(__dirname, 'migrations', f), 'utf8'));
    const n = await pool.query('SELECT count(*) FROM products');
    if (Number(n.rows[0].count) > 0) throw new Error('PROVISIONING_PG_URL указывает на НЕпустую базу');
  });
  afterAll(async () => {
    await pool?.query(WIPE);
    await pool?.end();
  });
  beforeEach(async () => {
    await pool.query(WIPE);
    await pool.query(
      `INSERT INTO product_hosts (id, ssh_target, public_ip, domain_suffix, agent_token_hash, capacity, audience)
       VALUES ('own', 'root@139.59.210.42', '139.59.210.42', 'p.linkeon.io', 'probe-hash', 20, 'own')`,
    );
    dns = new FakeDns();
  });

  describe('привязка', () => {
    it('заводит заявку с кодом и отдаёт записи для регистратора', async () => {
      const id = await mkProduct({ slug: 'dmitryvolkov' });
      const v = await svc().attach(OWNER, id, 'dmitryvolkov.ru');
      expect(v.status).toBe('awaiting_dns');
      expect(v.names).toEqual(['dmitryvolkov.ru', 'www.dmitryvolkov.ru']);
      const r = await row(id);
      expect(r.token).toMatch(/^lk-[0-9a-f]{32}$/);
      expect(v.records).toEqual([
        { type: 'TXT', name: '_linkeon', fqdn: '_linkeon.dmitryvolkov.ru', value: r.token },
        { type: 'A', name: '@', fqdn: 'dmitryvolkov.ru', value: '139.59.210.42' },
        { type: 'CNAME', name: 'www', fqdn: 'www.dmitryvolkov.ru', value: 'dmitryvolkov.p.linkeon.io' },
      ]);
    });

    it('сразу проверяет DNS и показывает, что там сейчас', async () => {
      const id = await mkProduct({ slug: 'dmitryvolkov' });
      dns.zone['dmitryvolkov.ru'] = { A: ['90.156.201.49'] };
      const v = await svc().attach(OWNER, id, 'dmitryvolkov.ru');
      expect(v.checkedAt).not.toBeNull();
      expect(v.check?.find((c) => c.type === 'A' && c.name === 'dmitryvolkov.ru')).toMatchObject({
        ok: false, current: ['90.156.201.49'],
      });
    });

    it('поддомен — CNAME на адрес продукта, без www', async () => {
      const id = await mkProduct({ slug: 'shop' });
      const v = await svc().attach(OWNER, id, 'shop.dmitryvolkov.ru');
      expect(v.records.map((r) => `${r.type} ${r.name}`)).toEqual(['TXT _linkeon.shop', 'CNAME shop']);
      expect(v.records[1].value).toBe('shop.p.linkeon.io');
    });

    it('кривой ввод — 422 с человеческим текстом', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await expect(svc().attach(OWNER, id, '1.2.3.4')).rejects.toMatchObject({ status: 422 });
    });

    it('чужой продукт — не найден, строка не заводится', async () => {
      const alien = await mkProduct({ slug: 'alien', user: ALIEN });
      await expect(svc().attach(OWNER, alien, 'a.ru')).rejects.toMatchObject({ status: 404 });
      expect(await row(alien)).toBeUndefined();
    });

    it('у бота своего домена нет', async () => {
      const id = await mkProduct({ slug: 'bot', kind: 'bot' });
      await expect(svc().attach(OWNER, id, 'a.ru')).rejects.toMatchObject({ status: 409 });
    });

    it('погашенному администратором — отказ', async () => {
      const id = await mkProduct({ slug: 'shop', status: 'blocked' });
      await expect(svc().attach(OWNER, id, 'a.ru')).rejects.toMatchObject({ status: 409 });
    });

    it('незаведённому — отказ', async () => {
      const id = await mkProduct({ slug: 'shop', status: 'provisioning' });
      await expect(svc().attach(OWNER, id, 'a.ru')).rejects.toMatchObject({ status: 409 });
    });

    it('спящему — можно: заглушка ляжет и на свой домен', async () => {
      const id = await mkProduct({ slug: 'shop', status: 'sleeping' });
      await expect(svc().attach(OWNER, id, 'a.ru')).resolves.toMatchObject({ status: 'awaiting_dns' });
    });

    it('повторная привязка того же домена — тот же ответ, код не меняется', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await svc().attach(OWNER, id, 'a.ru');
      const token = (await row(id)).token;
      await svc().attach(OWNER, id, 'https://A.RU/');
      expect((await row(id)).token).toBe(token);
    });

    it('второй домен на продукт — отказ', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await svc().attach(OWNER, id, 'a.ru');
      await expect(svc().attach(OWNER, id, 'b.ru')).rejects.toMatchObject({ status: 409 });
    });

    it('домен, работающий у другого продукта, — отказ', async () => {
      const mine = await mkProduct({ slug: 'mine' });
      const theirs = await mkProduct({ slug: 'theirs', user: ALIEN });
      await putDomain(theirs, 'active');
      await expect(svc().attach(OWNER, mine, 'a.ru')).rejects.toMatchObject({ status: 409 });
      expect(await row(mine)).toBeUndefined();
    });
  });

  describe('состояние', () => {
    it('нет домена — null', async () => {
      const id = await mkProduct({ slug: 'shop' });
      expect(await svc().get(OWNER, id)).toBeNull();
    });
    it('чужой продукт — не найден', async () => {
      const alien = await mkProduct({ slug: 'alien', user: ALIEN });
      await expect(svc().get(OWNER, alien)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('отвязка', () => {
    it('из awaiting_dns — строка удаляется сразу, задания нет', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await svc().attach(OWNER, id, 'a.ru');
      await expect(svc().detach(OWNER, id)).resolves.toEqual({ removed: 'now' });
      expect(await row(id)).toBeUndefined();
      expect(await jobs(id)).toEqual([]);
    });

    it('из active — removing и задание domain, одним оператором', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'active');
      await expect(svc().detach(OWNER, id)).resolves.toEqual({ removed: 'queued' });
      expect((await row(id)).status).toBe('removing');
      expect(await jobs(id)).toEqual([{ kind: 'domain', status: 'queued' }]);
    });

    // После отказа агент мог успеть записать блоки порта 80 — без задания
    // отвязки они остались бы на машине.
    it('из failed — тоже через removing и задание', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'failed', { error: 'x' });
      await expect(svc().detach(OWNER, id)).resolves.toEqual({ removed: 'queued' });
      expect(await jobs(id)).toEqual([{ kind: 'domain', status: 'queued' }]);
    });

    it('у погашенного — можно: отвязка сужает, а не расширяет', async () => {
      const id = await mkProduct({ slug: 'shop', status: 'blocked' });
      await putDomain(id, 'active');
      await expect(svc().detach(OWNER, id)).resolves.toEqual({ removed: 'queued' });
    });

    it('во время выпуска — отказ', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'issuing');
      await expect(svc().detach(OWNER, id)).rejects.toMatchObject({ status: 409 });
    });

    it('у продукта идёт другое задание — отказ, строка не тронута', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'active');
      await pool.query(`INSERT INTO product_provision_jobs (product_id, kind, status) VALUES ($1, 'sleep', 'running')`, [id]);
      await expect(svc().detach(OWNER, id)).rejects.toMatchObject({ status: 409 });
      expect((await row(id)).status).toBe('active');
    });

    // Отказ «домен занят другим продуктом»: у этой заявки на машине ничего нет,
    // а перевод в removing упёрся бы в индекс занятых доменов.
    it('failed из-за занятого домена — строка удаляется сразу', async () => {
      const mine = await mkProduct({ slug: 'mine' });
      const theirs = await mkProduct({ slug: 'theirs', user: ALIEN });
      await putDomain(theirs, 'active', { token: 'lk-t' });
      await putDomain(mine, 'failed', { token: 'lk-m', error: 'занят' });
      await expect(svc().detach(OWNER, mine)).resolves.toEqual({ removed: 'now' });
      expect(await row(mine)).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/domains.spec" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|Cannot find"'
```

Ожидается: FAIL, `Cannot find module './domains.service'`.

- [ ] **Step 3: Написать сервис (часть 1)**

`spirits_back/src/products/domains.service.ts`:

```ts
import {
  ConflictException, HttpException, HttpStatus, Injectable, Logger,
  NotFoundException, OnModuleDestroy, OnModuleInit, UnprocessableEntityException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PgService } from '../common/services/pg.service';
import { normalizeDomain, relativeName } from './domain-name';
import { checkDns, DnsResolver, publicResolver, RecordCheck, TXT_LABEL } from './domain-dns';

export type DomainStatus = 'awaiting_dns' | 'issuing' | 'active' | 'failed' | 'removing';

export interface DomainRecordToSet {
  type: 'TXT' | 'A' | 'CNAME';
  /** Как вводить в панели регистратора — относительно зоны (`@`, `www`, `_linkeon`). */
  name: string;
  fqdn: string;
  value: string;
}

export interface DomainView {
  domain: string;
  names: string[];
  status: DomainStatus;
  error: string | null;
  checkedAt: string | null;
  check: RecordCheck[] | null;
  records: DomainRecordToSet[];
}

/** Фоновая проверка ждущих DNS. */
export const DOMAIN_TICK_MS = 120_000;
/** Сколько суток после заявки фоновая проверка ещё смотрит DNS. Кнопка работает всегда. */
export const PENDING_DAYS = 7;
/** «Проверить сейчас» — не чаще. Это только DNS, Let's Encrypt не трогается. */
export const CHECK_THROTTLE_S = 30;
/** Повторных выпусков после отказа в час. Предел Let's Encrypt — 5 неудач в час на имя. */
export const RETRIES_PER_HOUR = 3;

/**
 * Статусы продукта, при которых домен можно ВЫПУСКАТЬ. Погашенный сюда не
 * входит: гашение бывает и за злоупотребление, и новый домен расширил бы его.
 * Отвязка у погашенного разрешена — она сужает.
 */
const ISSUABLE = ['running', 'degraded', 'sleeping'];
const ISSUABLE_SQL = "('running','degraded','sleeping')";

const TAKEN = 'Этот домен уже привязан к другому продукту.';
const BLOCKED = 'Продукт остановлен администратором — привязать домен нельзя.';
export const ORPHAN_ISSUING =
  'Выпуск прерван: задание снято (продукт остановлен или машина не ответила вовремя). Нажмите «Проверить снова».';
export const ORPHAN_REMOVING =
  'Отвязка прервана: задание снято (продукт остановлен или машина не ответила вовремя). Отвяжите домен ещё раз.';

interface OwnedProduct {
  id: string;
  slug: string;
  kind: string;
  status: string;
  host_ip: string;
  domain_suffix: string;
}

interface DomainRow {
  product_id: string;
  domain: string;
  names: string[];
  token: string;
  status: DomainStatus;
  error: string | null;
  check_result: { records: RecordCheck[] } | null;
  checked_at: string | null;
  attempts: number;
  attempts_since: string;
}

@Injectable()
export class DomainsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainsService.name);
  /** Поле, а не аргумент конструктора: Nest внедряет только провайдеры, а тесты подменяют резолвер. */
  private resolver: DnsResolver = publicResolver();
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(private readonly pg: PgService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.safeTick(), DOMAIN_TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Владелец в WHERE, а не проверкой после выборки: «нет такого» и «есть, но
   * не твой» — одна и та же 404, иначе утекает существование чужих продуктов.
   * Адрес машины — из реестра: продукт второй машины получает её IP и её зону.
   */
  private async owned(userId: string, productId: string): Promise<OwnedProduct> {
    const r = await this.pg.query(
      `SELECT p.id, p.slug, p.kind, p.status, host(h.public_ip) AS host_ip, h.domain_suffix
         FROM products p
         JOIN product_hosts h ON h.id = p.host_id
        WHERE p.id = $1 AND p.user_id = $2 AND p.archived_at IS NULL`,
      [productId, userId],
    );
    if (!r.rows[0]) throw new NotFoundException('Продукт не найден');
    return r.rows[0];
  }

  private async rowOf(productId: string): Promise<DomainRow | null> {
    const r = await this.pg.query(`SELECT * FROM product_domains WHERE product_id = $1`, [productId]);
    return r.rows[0] ?? null;
  }

  private recordsFor(row: DomainRow, p: OwnedProduct): DomainRecordToSet[] {
    const n = normalizeDomain(row.domain);
    const zone = n.ok ? n.zone : row.domain;
    const txtFqdn = `${TXT_LABEL}.${row.domain}`;
    const out: DomainRecordToSet[] = [{ type: 'TXT', name: relativeName(txtFqdn, zone), fqdn: txtFqdn, value: row.token }];
    for (const fqdn of row.names) {
      // У корня CNAME запрещён стандартом — только A. Остальные имена — CNAME
      // на адрес продукта: переживёт смену IP машины без правки у регистратора.
      out.push(
        fqdn === zone
          ? { type: 'A', name: '@', fqdn, value: p.host_ip }
          : { type: 'CNAME', name: relativeName(fqdn, zone), fqdn, value: `${p.slug}.${p.domain_suffix}` },
      );
    }
    return out;
  }

  private view(row: DomainRow, p: OwnedProduct): DomainView {
    return {
      domain: row.domain,
      names: row.names,
      status: row.status,
      error: row.error,
      checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
      check: row.check_result?.records ?? null,
      records: this.recordsFor(row, p),
    };
  }

  async get(userId: string, productId: string): Promise<DomainView | null> {
    const p = await this.owned(userId, productId);
    const row = await this.rowOf(productId);
    return row ? this.view(row, p) : null;
  }

  async attach(userId: string, productId: string, raw: unknown): Promise<DomainView> {
    const n = normalizeDomain(raw);
    if (!n.ok) throw new UnprocessableEntityException(n.say);

    const p = await this.owned(userId, productId);
    if (p.kind !== 'site') throw new ConflictException('У бота нет адреса — свой домен бывает только у сайта.');
    if (p.status === 'blocked') throw new ConflictException(BLOCKED);
    if (!ISSUABLE.includes(p.status)) {
      throw new ConflictException('Продукт ещё не заведён — привязать домен можно, когда он заработает.');
    }

    const existing = await this.rowOf(productId);
    if (existing) {
      if (existing.domain === n.domain) return this.view(existing, p);
      throw new ConflictException(`У продукта уже есть свой домен ${existing.domain} — сначала отвяжите его.`);
    }

    const busy = await this.pg.query(
      `SELECT 1 FROM product_domains
        WHERE domain = $1 AND status IN ('issuing','active','removing') AND product_id <> $2`,
      [n.domain, productId],
    );
    if (busy.rows.length) throw new ConflictException(TAKEN);

    const token = `lk-${crypto.randomBytes(16).toString('hex')}`;
    await this.pg.query(
      `INSERT INTO product_domains (product_id, domain, names, token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id) DO NOTHING`,
      [productId, n.domain, n.names, token],
    );

    const row = (await this.rowOf(productId))!;
    if (row.domain !== n.domain) {
      // Гонка: параллельная привязка того же продукта успела с другим доменом.
      throw new ConflictException(`У продукта уже есть свой домен ${row.domain} — сначала отвяжите его.`);
    }
    return this.view(await this.runCheck(row, p), p);
  }

  async detach(userId: string, productId: string): Promise<{ removed: 'now' | 'queued' }> {
    await this.owned(userId, productId);
    const row = await this.rowOf(productId);
    if (!row) throw new NotFoundException('У продукта нет своего домена.');

    if (row.status === 'awaiting_dns') {
      await this.pg.query(`DELETE FROM product_domains WHERE product_id = $1 AND status = 'awaiting_dns'`, [productId]);
      return { removed: 'now' };
    }
    if (row.status === 'issuing') {
      throw new ConflictException('Идёт выпуск сертификата — отвязать можно, когда он закончится (обычно меньше минуты).');
    }
    if (row.status === 'removing') return { removed: 'queued' };

    try {
      const r = await this.pg.query(
        `WITH d AS (
            UPDATE product_domains SET status = 'removing', error = NULL
             WHERE product_id = $1 AND status IN ('active','failed')
               AND NOT EXISTS (SELECT 1 FROM product_provision_jobs j
                                WHERE j.product_id = $1 AND j.status IN ('queued','running'))
            RETURNING product_id
         ), q AS (
            INSERT INTO product_provision_jobs (product_id, kind, status)
            SELECT product_id, 'domain', 'queued' FROM d
            RETURNING product_id
         )
         SELECT (SELECT count(*) FROM q)::int AS queued`,
        [productId],
      );
      if (r.rows[0].queued === 1) return { removed: 'queued' };
    } catch (e: any) {
      if (e?.code === '23505' && e?.constraint === 'product_domains_occupied') {
        // Домен держит другой продукт: эта заявка до машины не доходила.
        await this.pg.query(`DELETE FROM product_domains WHERE product_id = $1 AND status = 'failed'`, [productId]);
        return { removed: 'now' };
      }
      if (e?.code !== '23505') throw e;
    }
    throw new ConflictException('У продукта сейчас идёт другое задание — отвяжите через минуту.');
  }

  /** Проверка DNS и сохранение результата. Ошибку Let's Encrypt (`error`) не трогает. */
  private async runCheck(row: DomainRow, p: OwnedProduct): Promise<DomainRow> {
    const result = await checkDns({ domain: row.domain, names: row.names, token: row.token, hostIp: p.host_ip }, this.resolver);
    await this.pg.query(
      `UPDATE product_domains SET check_result = $2::jsonb, checked_at = now() WHERE product_id = $1`,
      [row.product_id, JSON.stringify({ records: result.records })],
    );
    if (result.ok) await this.tryIssue(row.product_id);
    return (await this.rowOf(row.product_id))!;
  }

  // Задача 5 заменяет обе заглушки и добавляет check, checkPending, reconcileOrphans.
  async tryIssue(_productId: string): Promise<'queued' | 'busy' | 'taken' | 'refused' | 'none'> {
    return 'none';
  }

  private async safeTick() {
    /* задача 5 */
  }
}
```

- [ ] **Step 4: Прогнать тест и типы**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/domains.spec" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|✕"; npx tsc --noEmit -p tsconfig.build.json && echo TSC_OK'
```

Ожидается: `Tests: 21 passed`, 0 skipped, `TSC_OK`.

- [ ] **Step 5: Мутации**

- (а) из `owned()` убрать `AND p.user_id = $2` — ждём красные «чужой продукт — не найден» (две штуки);
- (б) `detach` из `failed` удаляет строку сразу, как из `awaiting_dns`, — ждём красный «из failed — тоже через removing»;
- (в) снять проверку `busy` в `attach` — ждём красный «домен, работающий у другого продукта».

- [ ] **Step 6: Коммит**

```bash
git add src/products/domains.service.ts src/products/domains.spec.ts
git commit -m "feat(products): сервис своих доменов — привязка, состояние, отвязка"
```

---

### Task 5: Выпуск, проверки, сверка сирот и фоновый оборот

**Files:**
- Modify: `spirits_back/src/products/domains.service.ts` (заменить заглушки `tryIssue` и `safeTick`, добавить `check`, `checkPending`, `reconcileOrphans`)
- Modify: `spirits_back/src/products/domains.spec.ts` (новые `describe`)

- [ ] **Step 1: Написать падающие тесты**

Дописать в `domains.spec.ts` внутрь `maybe(...)`:

```ts
  describe('переход в выпуск', () => {
    it('DNS готов — issuing и задание domain одним оператором', async () => {
      const id = await mkProduct({ slug: 'shop' });
      const s = svc();
      await s.attach(OWNER, id, 'a.ru');
      dns.ready('a.ru', ['a.ru', 'www.a.ru'], (await row(id)).token);
      await expect(s.tryIssue(id)).resolves.toBe('queued');
      expect((await row(id)).status).toBe('issuing');
      expect(await jobs(id)).toEqual([{ kind: 'domain', status: 'queued' }]);
    });

    it('у продукта идёт другое задание — перехода нет вовсе, домен ждёт следующего круга', async () => {
      const id = await mkProduct({ slug: 'shop' });
      const s = svc();
      await s.attach(OWNER, id, 'a.ru');
      await pool.query(`INSERT INTO product_provision_jobs (product_id, kind, status) VALUES ($1, 'sleep', 'running')`, [id]);
      await expect(s.tryIssue(id)).resolves.toBe('busy');
      expect((await row(id)).status).toBe('awaiting_dns');
      expect((await jobs(id)).filter((j: any) => j.kind === 'domain')).toEqual([]);
    });

    // Спека: у погашенного — никакого нового домена. Без этой сверки фоновая
    // проверка выпустила бы сертификат погашенному, едва DNS сойдётся.
    it('погашенный продукт — выпуска нет, строка не тронута', async () => {
      const id = await mkProduct({ slug: 'shop' });
      const s = svc();
      await s.attach(OWNER, id, 'a.ru');
      await pool.query(`UPDATE products SET status = 'blocked' WHERE id = $1`, [id]);
      await expect(s.tryIssue(id)).resolves.toBe('refused');
      expect((await row(id)).status).toBe('awaiting_dns');
      expect(await jobs(id)).toEqual([]);
    });

    // Главный сценарий спеки: две заявки, TXT первым появился у одной.
    it('гонка двух заявок: выпуск достаётся одной, вторая получает отказ', async () => {
      const mine = await mkProduct({ slug: 'mine' });
      const theirs = await mkProduct({ slug: 'theirs', user: ALIEN });
      const s = svc();
      await s.attach(OWNER, mine, 'a.ru');
      await s.attach(ALIEN, theirs, 'a.ru');
      const results = await Promise.all([s.tryIssue(mine), s.tryIssue(theirs)]);
      expect(results.sort()).toEqual(['queued', 'taken']);
      const statuses = (await pool.query(`SELECT status, error FROM product_domains ORDER BY status`)).rows;
      expect(statuses.map((r: any) => r.status)).toEqual(['failed', 'issuing']);
      expect(statuses[0].error).toMatch(/другому продукту/);
    });

    it('attach с готовым DNS сразу уходит в выпуск', async () => {
      const id = await mkProduct({ slug: 'shop' });
      // Код неизвестен до привязки — TXT отвечает кодом из строки, как только она есть.
      dns.resolveTxt = async () => [[(await row(id))?.token ?? 'none']];
      dns.zone['a.ru'] = { A: ['139.59.210.42'] };
      dns.zone['www.a.ru'] = { A: ['139.59.210.42'] };
      await expect(svc().attach(OWNER, id, 'a.ru')).resolves.toMatchObject({ status: 'issuing' });
    });
  });

  describe('«Проверить сейчас» и «Проверить снова»', () => {
    it('в awaiting_dns — только DNS, и не чаще раза в 30 секунд', async () => {
      const id = await mkProduct({ slug: 'shop' });
      const s = svc();
      await s.attach(OWNER, id, 'a.ru'); // attach уже проверял — checked_at свежий
      await expect(s.check(OWNER, id)).rejects.toMatchObject({ status: 429 });
      await pool.query(`UPDATE product_domains SET checked_at = now() - interval '31 seconds'`);
      await expect(s.check(OWNER, id)).resolves.toMatchObject({ status: 'awaiting_dns' });
    });

    it('из failed — повторный выпуск, если DNS готов, и счётчик попыток растёт', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'failed', { token: 'lk-f', error: 'LE отказал' });
      dns.ready('a.ru', ['a.ru', 'www.a.ru'], 'lk-f');
      await expect(svc().check(OWNER, id)).resolves.toMatchObject({ status: 'issuing', error: null });
      expect((await row(id)).attempts).toBe(1);
    });

    it('больше трёх повторов в час — 429', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'failed');
      await pool.query(`UPDATE product_domains SET attempts = 3, attempts_since = now() - interval '10 minutes'`);
      await expect(svc().check(OWNER, id)).rejects.toMatchObject({ status: 429 });
    });

    it('через час счётчик обнуляется', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'failed', { token: 'lk' });
      await pool.query(`UPDATE product_domains SET attempts = 3, attempts_since = now() - interval '61 minutes'`);
      dns.ready('a.ru', ['a.ru', 'www.a.ru'], 'lk');
      await expect(svc().check(OWNER, id)).resolves.toMatchObject({ status: 'issuing' });
      expect((await row(id)).attempts).toBe(1);
    });

    it('у погашенного — 409, DNS не трогается', async () => {
      const id = await mkProduct({ slug: 'shop', status: 'blocked' });
      await putDomain(id, 'failed');
      await expect(svc().check(OWNER, id)).rejects.toMatchObject({ status: 409 });
      expect((await row(id)).checked_at).toBeNull();
    });
  });

  describe('фоновый оборот', () => {
    it('проверяет ждущих и переводит готовых', async () => {
      const id = await mkProduct({ slug: 'shop' });
      const s = svc();
      await s.attach(OWNER, id, 'a.ru');
      dns.ready('a.ru', ['a.ru', 'www.a.ru'], (await row(id)).token);
      await expect(s.checkPending()).resolves.toBe(1);
      expect((await row(id)).status).toBe('issuing');
    });

    it('заявки старше семи суток фоновый оборот не трогает', async () => {
      const id = await mkProduct({ slug: 'shop' });
      const s = svc();
      await s.attach(OWNER, id, 'a.ru');
      await pool.query(`UPDATE product_domains SET created_at = now() - interval '8 days'`);
      await expect(s.checkPending()).resolves.toBe(0);
    });

    it('погашенных фоновый оборот не проверяет', async () => {
      const id = await mkProduct({ slug: 'shop', status: 'blocked' });
      await putDomain(id, 'awaiting_dns');
      await expect(svc().checkPending()).resolves.toBe(0);
      expect((await row(id)).checked_at).toBeNull();
    });
  });

  // Гашение и снятие блокировки снимают активное задание ЛЮБОГО вида
  // (block.service.ts, killed_jobs), сборщик зависших — тоже. Без сверки
  // строка осталась бы в issuing навсегда: отвязать нельзя, индекс держит домен.
  describe('сверка сирот', () => {
    const killJobs = (productId: string) =>
      pool.query(
        `UPDATE product_provision_jobs SET status = 'failed', error = 'снято гашением', finished_at = now()
          WHERE product_id = $1 AND status IN ('queued','running')`,
        [productId],
      );

    it('выпуск, чьё задание сняли, уходит в failed с понятным текстом', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'issuing');
      await pool.query(`INSERT INTO product_provision_jobs (product_id, kind, status) VALUES ($1, 'domain', 'running')`, [id]);
      await killJobs(id);
      await expect(svc().reconcileOrphans()).resolves.toBe(1);
      expect(await row(id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/Выпуск прерван/) });
    });

    it('отвязка, чьё задание сняли, — тоже, со своим текстом', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'removing');
      await pool.query(`INSERT INTO product_provision_jobs (product_id, kind, status) VALUES ($1, 'domain', 'queued')`, [id]);
      await killJobs(id);
      await svc().reconcileOrphans();
      expect(await row(id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/Отвязка прервана/) });
    });

    it('пока у продукта есть активное задание — строка не трогается', async () => {
      const id = await mkProduct({ slug: 'shop' });
      await putDomain(id, 'issuing');
      await pool.query(`INSERT INTO product_provision_jobs (product_id, kind, status) VALUES ($1, 'domain', 'running')`, [id]);
      await expect(svc().reconcileOrphans()).resolves.toBe(0);
      expect((await row(id)).status).toBe('issuing');
    });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

Ожидается: FAIL в 16 новых тестах: `tryIssue` отвечает `'none'`, а `check`, `checkPending` и `reconcileOrphans` не существуют.

- [ ] **Step 3: Дописать сервис**

В `domains.service.ts` заменить заглушки `tryIssue` и `safeTick` на:

```ts
  /**
   * Перевод в выпуск и постановка задания агенту — ОДИН оператор. Два шага
   * оставили бы домен в issuing без задания навсегда, если между ними у
   * продукта появится сон или пробуждение.
   *
   * Исходы:
   *   queued  — перевели, задание стоит;
   *   busy    — у продукта идёт другое задание: перехода нет вовсе, следующий
   *             круг попробует снова;
   *   taken   — домен занят другим продуктом (индекс занятых доменов): эта
   *             заявка переводится в failed с понятным текстом;
   *   refused — продукт не в том статусе (погашен, не заведён): выпуска нет,
   *             строка не тронута;
   *   none    — строка не в том состоянии.
   *
   * Из failed счётчик повторов растёт; через час окно попыток начинается заново.
   */
  async tryIssue(productId: string): Promise<'queued' | 'busy' | 'taken' | 'refused' | 'none'> {
    try {
      const r = await this.pg.query(
        `WITH d AS (
            UPDATE product_domains
               SET status = 'issuing', error = NULL,
                   attempts = CASE WHEN status <> 'failed' THEN attempts
                                   WHEN attempts_since < now() - interval '1 hour' THEN 1
                                   ELSE attempts + 1 END,
                   attempts_since = CASE WHEN status = 'failed' AND attempts_since < now() - interval '1 hour'
                                         THEN now() ELSE attempts_since END
             WHERE product_id = $1 AND status IN ('awaiting_dns','failed')
               AND EXISTS (SELECT 1 FROM products p
                            WHERE p.id = $1 AND p.archived_at IS NULL AND p.status IN ${ISSUABLE_SQL})
               AND NOT EXISTS (SELECT 1 FROM product_provision_jobs j
                                WHERE j.product_id = $1 AND j.status IN ('queued','running'))
            RETURNING product_id
         ), q AS (
            INSERT INTO product_provision_jobs (product_id, kind, status)
            SELECT product_id, 'domain', 'queued' FROM d
            RETURNING product_id
         )
         SELECT (SELECT count(*) FROM q)::int AS queued,
                EXISTS (SELECT 1 FROM product_domains
                         WHERE product_id = $1 AND status IN ('awaiting_dns','failed')) AS waiting,
                EXISTS (SELECT 1 FROM products p
                         WHERE p.id = $1 AND p.archived_at IS NULL AND p.status IN ${ISSUABLE_SQL}) AS issuable`,
        [productId],
      );
      const { queued, waiting, issuable } = r.rows[0];
      if (queued === 1) return 'queued';
      if (!waiting) return 'none';
      return issuable ? 'busy' : 'refused';
    } catch (e: any) {
      if (e?.code === '23505' && e?.constraint === 'product_domains_occupied') {
        await this.pg.query(
          `UPDATE product_domains SET status = 'failed', error = $2
            WHERE product_id = $1 AND status IN ('awaiting_dns','failed')`,
          [productId, TAKEN],
        );
        return 'taken';
      }
      // Задание вставилось мимо NOT EXISTS (параллельный сон) — оператор
      // откатился целиком, переход не состоялся. Это busy, а не сбой.
      if (e?.code === '23505') return 'busy';
      throw e;
    }
  }

  /** «Проверить сейчас» (awaiting_dns) и «Проверить снова» (failed). */
  async check(userId: string, productId: string): Promise<DomainView> {
    const p = await this.owned(userId, productId);
    const row = await this.rowOf(productId);
    if (!row) throw new NotFoundException('У продукта нет своего домена.');
    if (row.status !== 'awaiting_dns' && row.status !== 'failed') return this.view(row, p);
    if (p.status === 'blocked') {
      throw new ConflictException('Продукт остановлен администратором — выпуск сертификата невозможен.');
    }

    if (row.status === 'awaiting_dns') {
      if (row.checked_at && Date.now() - new Date(row.checked_at).getTime() < CHECK_THROTTLE_S * 1000) {
        throw new HttpException('Проверяли только что — подождите полминуты.', HttpStatus.TOO_MANY_REQUESTS);
      }
    } else {
      const windowOpen = Date.now() - new Date(row.attempts_since).getTime() < 3600_000;
      if (windowOpen && row.attempts >= RETRIES_PER_HOUR) {
        throw new HttpException(
          'Три попытки за час уже были — Let’s Encrypt не любит частых повторов. Попробуйте через час.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return this.view(await this.runCheck(row, p), p);
  }

  /** Фоновый оборот: ждущие DNS не старше PENDING_DAYS у продуктов, которым можно выпускать. */
  async checkPending(): Promise<number> {
    const r = await this.pg.query(
      `SELECT d.*, p.slug, p.kind, p.status AS product_status,
              host(h.public_ip) AS host_ip, h.domain_suffix
         FROM product_domains d
         JOIN products p ON p.id = d.product_id AND p.archived_at IS NULL AND p.status IN ${ISSUABLE_SQL}
         JOIN product_hosts h ON h.id = p.host_id
        WHERE d.status = 'awaiting_dns'
          AND d.created_at > now() - make_interval(days => $1)
        ORDER BY d.checked_at NULLS FIRST
        LIMIT 50`,
      [PENDING_DAYS],
    );
    for (const row of r.rows) {
      const p: OwnedProduct = {
        id: row.product_id, slug: row.slug, kind: row.kind, status: row.product_status,
        host_ip: row.host_ip, domain_suffix: row.domain_suffix,
      };
      try {
        await this.runCheck(row, p);
      } catch (e: any) {
        this.logger.warn(`проверка DNS ${row.domain}: ${e?.message ?? e}`);
      }
    }
    return r.rows.length;
  }

  /**
   * Сироты: строки в issuing и removing, у продукта которых нет активного
   * задания. Законно так не бывает — оба перехода делаются одним оператором
   * вместе с заданием, и закрывает их тоже один оператор (completeJob). Значит
   * задание сняли снаружи: гашение и снятие блокировки снимают активное
   * задание ЛЮБОГО вида (block.service.ts, killed_jobs), сборщик зависших —
   * тоже (failStaleProvisioning).
   *
   * В failed, а не повторная постановка. Повтор крутился бы вечно там, где
   * задание снимают раз за разом (машина молчит, продукт гасят), а failed
   * отдаёт решение человеку и пределу повторов.
   */
  async reconcileOrphans(): Promise<number> {
    const r = await this.pg.query(
      `UPDATE product_domains d
          SET status = 'failed',
              error = CASE d.status WHEN 'removing' THEN $1 ELSE $2 END
        WHERE d.status IN ('issuing','removing')
          AND NOT EXISTS (SELECT 1 FROM product_provision_jobs j
                           WHERE j.product_id = d.product_id AND j.status IN ('queued','running'))
       RETURNING d.domain`,
      [ORPHAN_REMOVING, ORPHAN_ISSUING],
    );
    if (r.rows.length) {
      this.logger.warn(`домены без задания переведены в failed: ${r.rows.map((x: any) => x.domain).join(', ')}`);
    }
    return r.rows.length;
  }

  /** Оборот не перекрывается сам с собой: медленный DNS не должен плодить параллельные проходы. */
  private async safeTick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.reconcileOrphans();
      await this.checkPending();
    } catch (e: any) {
      this.logger.error(`оборот своих доменов упал: ${e?.message ?? e}`);
    } finally {
      this.ticking = false;
    }
  }
```

Строка `if (result.ok) await this.tryIssue(row.product_id);` в `runCheck` уже стоит — теперь она работает.

- [ ] **Step 4: Прогнать тест и типы**

Ожидается: `Tests: 37 passed`, 0 skipped, `TSC_OK`.

- [ ] **Step 5: Мутации**

- (а) `tryIssue` двумя операторами: отдельно `UPDATE`, отдельно `INSERT` — ждём красный «перехода нет вовсе» (UPDATE пройдёт, INSERT упадёт, строка останется в `issuing`);
- (б) убрать ветку `taken` (пробрасывать 23505) — ждём красный «гонка двух заявок»;
- (в) убрать `EXISTS (… p.status IN …)` из `d` — ждём красный «погашенный продукт — выпуска нет»;
- (г) `reconcileOrphans` без `NOT EXISTS` — ждём красный «пока есть активное задание».

- [ ] **Step 6: Коммит**

```bash
git add src/products/domains.service.ts src/products/domains.spec.ts
git commit -m "feat(products): выпуск своего домена одним оператором, сверка сирот, фоновый оборот"
```

---

### Task 6: Протокол заданий на сервере

**Files:**
- Modify: `spirits_back/src/products/provisioning.service.ts` (`WOKEN_SQL`, `JobKind`, `ClaimedJob`, `claimJob`, `completeJob`)
- Test: `spirits_back/src/products/domains.jobs.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/src/products/domains.jobs.spec.ts`:

```ts
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { MIGRATIONS } from './products.service';
import { ProvisioningService } from './provisioning.service';
import { SecretsService } from './secrets.service';
import { HostsService } from './hosts.service';
import { LimitsService } from './limits.service';

const PG = process.env.PROVISIONING_PG_URL;
const maybe = PG ? describe : describe.skip;
const KEY = '00112233445566778899aabbccddeeff0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const WIPE = 'TRUNCATE products, product_provision_jobs, product_turns, product_host_agent, product_hosts RESTART IDENTITY CASCADE';

maybe('задание domain: выдача агенту и приём отчёта', () => {
  jest.setTimeout(60_000);
  let pool: Pool;
  let pg: { query: (sql: string, params?: any[]) => Promise<any> };
  let prov: ProvisioningService;

  const mkProduct = async (slug: string, status = 'running') => {
    const r = await pool.query(
      `INSERT INTO products (user_id, name, slug, kind, status, checkout_path, runner_token_hash, host_id, port, domain)
       VALUES ('79030169187', $1, $1, 'site', $2, $3, $4, 'own', 8001, $5) RETURNING id`,
      [slug, status, `/srv/${slug}`, `hash-${slug}`, `${slug}.p.linkeon.io`],
    );
    return r.rows[0].id as string;
  };
  const domain = (id: string, status: string) =>
    pool.query(
      `INSERT INTO product_domains (product_id, domain, names, token, status) VALUES ($1, 'a.ru', '{a.ru,www.a.ru}', 'lk', $2)`,
      [id, status],
    );
  const job = (id: string, kind: string, status = 'queued', ago = '0 seconds') =>
    pool
      .query(
        `INSERT INTO product_provision_jobs (product_id, kind, status, created_at)
         VALUES ($1, $2, $3, now() - $4::interval) RETURNING id`,
        [id, kind, status, ago],
      )
      .then((r) => r.rows[0].id as string);
  const productRow = async () => (await pool.query(`SELECT status, provision_error FROM products`)).rows[0];

  beforeAll(async () => {
    pool = new Pool({ connectionString: PG, max: 8 });
    pg = { query: (sql: string, params?: any[]) => pool.query(sql, params) };
    for (const f of MIGRATIONS) await pool.query(fs.readFileSync(path.join(__dirname, 'migrations', f), 'utf8'));
    const n = await pool.query('SELECT count(*) FROM products');
    if (Number(n.rows[0].count) > 0) throw new Error('PROVISIONING_PG_URL указывает на НЕпустую базу');
    const secrets = new SecretsService({ get: (k: string) => (k === 'PRODUCT_SECRETS_KEY' ? KEY : undefined) } as any);
    prov = new ProvisioningService(pg as any, secrets, new HostsService(pg as any), new LimitsService(pg as any));
    (prov as any).fetchFn = async () => ({ status: 200 });
  });
  afterAll(async () => {
    await pool?.query(WIPE);
    await pool?.end();
  });
  beforeEach(async () => {
    await pool.query(WIPE);
    await pool.query(
      `INSERT INTO product_hosts (id, ssh_target, public_ip, domain_suffix, agent_token_hash, capacity, audience)
       VALUES ('own', 'root@139.59.210.42', '139.59.210.42', 'p.linkeon.io', 'probe-hash', 20, 'own')`,
    );
  });

  // Главный сторож задачи: без своей ветки в CASE задание domain выдавалось
  // бы только у спящих, а у работающего висело бы вечно.
  it('задание domain выдаётся у работающего продукта', async () => {
    const id = await mkProduct('shop', 'running');
    await domain(id, 'issuing');
    await job(id, 'domain');
    expect(await prov.claimJob('own')).toMatchObject({
      jobKind: 'domain', slug: 'shop', port: 8001, customNames: ['a.ru', 'www.a.ru'], vhostMode: 'proxy',
    });
  });

  it('у спящего и погашенного — тоже, в режиме заглушки', async () => {
    for (const status of ['sleeping', 'blocked']) {
      await pool.query('TRUNCATE products, product_provision_jobs RESTART IDENTITY CASCADE');
      const id = await mkProduct(`shop-${status}`, status);
      await domain(id, 'issuing');
      await job(id, 'domain');
      expect(await prov.claimJob('own')).toMatchObject({ jobKind: 'domain', vhostMode: 'asleep' });
    }
  });

  // Проснулся, но promoteReady ещё не перевёл в running: контейнер уже жив,
  // конфиг уже прокси. Режим по статусу 'sleeping' вернул бы на адрес 503.
  it('проснувшийся, но ещё не переведённый — режим прокси, а не заглушка', async () => {
    const id = await mkProduct('shop', 'sleeping');
    await job(id, 'wake', 'done', '1 minute');
    await domain(id, 'issuing');
    await job(id, 'domain');
    expect(await prov.claimJob('own')).toMatchObject({ jobKind: 'domain', vhostMode: 'proxy' });
  });

  it('у заводящегося — не выдаётся', async () => {
    const id = await mkProduct('shop', 'provisioning');
    await job(id, 'domain');
    expect(await prov.claimJob('own')).toBeNull();
  });

  it('отвязка (removing) приезжает с пустым списком имён', async () => {
    const id = await mkProduct('shop');
    await domain(id, 'removing');
    await job(id, 'domain');
    expect(await prov.claimJob('own')).toMatchObject({ jobKind: 'domain', customNames: [] });
  });

  // Имена в КАЖДОМ задании: иначе первый же сон переписал бы конфиг без них.
  it('сон и пробуждение несут работающий домен', async () => {
    const id = await mkProduct('shop', 'sleeping');
    await domain(id, 'active');
    await job(id, 'wake');
    expect(await prov.claimJob('own')).toMatchObject({ jobKind: 'wake', customNames: ['a.ru', 'www.a.ru'] });
  });

  it('отказавший домен в задания не попадает', async () => {
    const id = await mkProduct('shop', 'sleeping');
    await domain(id, 'failed');
    await job(id, 'wake');
    expect(await prov.claimJob('own')).toMatchObject({ customNames: [] });
  });

  it('успех привязки: issuing → active, продукт не тронут', async () => {
    const id = await mkProduct('shop');
    await domain(id, 'issuing');
    const jobId = await job(id, 'domain');
    await prov.claimJob('own');
    await prov.completeJob(jobId, { ok: true });
    expect((await pool.query(`SELECT status, activated_at FROM product_domains`)).rows[0]).toMatchObject({
      status: 'active', activated_at: expect.any(Date),
    });
    expect(await productRow()).toEqual({ status: 'running', provision_error: null });
  });

  it('успех отвязки: строка удалена', async () => {
    const id = await mkProduct('shop');
    await domain(id, 'removing');
    const jobId = await job(id, 'domain');
    await prov.claimJob('own');
    await prov.completeJob(jobId, { ok: true });
    expect((await pool.query(`SELECT count(*) FROM product_domains`)).rows[0].count).toBe('0');
  });

  // Отказ выпуска — это состояние домена, а не «ошибка заведения» продукта.
  it('отказ: домен в failed с текстом, продукт не тронут', async () => {
    const id = await mkProduct('shop');
    await domain(id, 'issuing');
    const jobId = await job(id, 'domain');
    await prov.claimJob('own');
    await prov.completeJob(jobId, { ok: false, error: 'Challenge failed for domain a.ru' });
    expect((await pool.query(`SELECT status, error FROM product_domains`)).rows[0]).toEqual({
      status: 'failed', error: 'Challenge failed for domain a.ru',
    });
    expect(await productRow()).toEqual({ status: 'running', provision_error: null });
  });

  it('отказ отвязки: failed с пометкой, домен можно отвязать снова', async () => {
    const id = await mkProduct('shop');
    await domain(id, 'removing');
    const jobId = await job(id, 'domain');
    await prov.claimJob('own');
    await prov.completeJob(jobId, { ok: false, error: 'nginx -t failed' });
    expect((await pool.query(`SELECT status, error FROM product_domains`)).rows[0]).toMatchObject({
      status: 'failed', error: 'отвязка не удалась: nginx -t failed',
    });
  });

  // Живой дефект, который сторожит этот тест: «последнее задание» видело бы
  // domain вместо пробуждения, и проснувшийся продукт навсегда оставался бы
  // «спящим» с работающим контейнером.
  it('задание domain после пробуждения не мешает переводу в running', async () => {
    const id = await mkProduct('shop', 'sleeping');
    await pool.query(`UPDATE products SET runner_seen_at = now() WHERE id = $1`, [id]);
    await job(id, 'wake', 'done', '2 minutes');
    await job(id, 'domain', 'done', '1 minute');
    await prov.promoteReady();
    expect((await productRow()).status).toBe('running');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/domains.jobs" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|✕"'
```

Ожидается: FAIL — задание `domain` не выдаётся у работающего, нет `customNames`/`vhostMode`, отказ пишет `provision_error`, продукт после `domain` не переводится.

- [ ] **Step 3: Предикат «проснулся» — без заданий domain**

В `provisioning.service.ts` заменить объявление `const WOKEN_SQL = …` (строка ~285) на функцию и константу. Докблок над ним сохранить и дописать абзац:

```ts
 *
 * ЗАДАНИЯ `domain` В «ПОСЛЕДНЕЕ» НЕ ВХОДЯТ. Свой домен не меняет ни сна, ни
 * бодрствования продукта, а без этой оговорки задание domain, вставшее между
 * пробуждением и переводом в running, заслонило бы пробуждение: продукт
 * остался бы «спящим» с работающим контейнером. `productRef` — ссылка на
 * строку products в том запросе, куда предикат подставляется.
 */
const wokenSql = (productRef: string) => `COALESCE((
          SELECT j.kind = 'wake' AND j.status = 'done'
            FROM product_provision_jobs j
           WHERE j.product_id = ${productRef}
             AND j.kind <> 'domain'
           ORDER BY j.created_at DESC, j.id DESC
           LIMIT 1), false)`;
const WOKEN_SQL = wokenSql('products.id');
```

Оба места в `promoteReady`, где стоит `${WOKEN_SQL}`, не меняются.

- [ ] **Step 4: Типы**

```ts
export type JobKind = 'provision' | 'sleep' | 'wake' | 'domain';
```

В `interface ClaimedJob` после `secrets: Record<string, string>;`:

```ts
  /**
   * Свои имена продукта (product_domains в issuing или active). Приезжают в
   * КАЖДОМ задании: любая перегенерация конфига строит его из того, что
   * прислал сервер, и потерять домен не может. У отвязки (removing) — пусто:
   * агент понимает намерение задания domain именно по пустоте списка.
   */
  customNames: string[];
  /**
   * Режим конфига для задания domain. Вычисляет сервер: агенту нечем узнать
   * статус продукта. Спящий, но уже проснувшийся (пробуждение сделано,
   * promoteReady ещё не перевёл) — прокси: его конфиг уже прокси.
   */
  vhostMode: 'proxy' | 'asleep';
```

- [ ] **Step 5: Выдача**

В `claimJob`, в `CASE j.kind` перед `ELSE` добавить ветку:

```sql
                                  -- Своя ветка ОБЯЗАТЕЛЬНА: без неё 'domain'
                                  -- попал бы в ELSE и выдавался бы только
                                  -- спящим — у работающего висел бы вечно.
                                  -- 'blocked' — ради отвязки: убрать свой домен
                                  -- у погашенного можно, выпустить нельзя
                                  -- (это сторожит DomainsService.tryIssue).
                                  WHEN 'domain' THEN p.status IN ('running','degraded','sleeping','blocked')
```

В итоговый `SELECT` после `(i.id IS NOT NULL) AS token_issued` добавить:

```sql
              , COALESCE((SELECT d.names FROM product_domains d
                           WHERE d.product_id = p.id AND d.status IN ('issuing','active')), '{}') AS custom_names
              , CASE WHEN p.status = 'blocked' THEN 'asleep'
                     WHEN p.status = 'sleeping' AND NOT ${wokenSql('p.id')} THEN 'asleep'
                     ELSE 'proxy' END AS vhost_mode
```

В возвращаемый объект после `secrets: …`:

```ts
      customNames: Array.isArray(row.custom_names) ? row.custom_names : [],
      vhostMode: row.vhost_mode === 'asleep' ? 'asleep' : 'proxy',
```

- [ ] **Step 6: Приём отчёта**

В начало `completeJob` добавить:

```ts
    // Отчёт по своему домену разбирается отдельно: общий путь ниже пишет
    // provision_error в продукт при ЛЮБОМ отказе, и отказ Let's Encrypt
    // выглядел бы в карточке как «ошибка заведения». Вид задания неизменен,
    // так что отдельное чтение гонки не открывает.
    const kindRow = await this.pg.query(`SELECT kind FROM product_provision_jobs WHERE id = $1`, [jobId]);
    if (kindRow.rows[0]?.kind === 'domain') return this.completeDomainJob(jobId, result);
```

И метод в класс:

```ts
  /**
   * Намерение задания domain — в состоянии строки домена: issuing (привязка)
   * или removing (отвязка). Оба перехода делаются одним оператором вместе с
   * постановкой задания, так что состояние не может расходиться с заданием.
   * Продукт не трогается ни при успехе, ни при отказе.
   *
   * Замок тот же, что у completeJob: `status = 'running'`. Задание, снятое
   * гашением или сборщиком, отчётом не закрывается — его строку домена
   * переводит в failed сверка сирот (DomainsService.reconcileOrphans).
   */
  private async completeDomainJob(jobId: string, result: { ok: boolean; error?: string }) {
    const r = await this.pg.query(
      `WITH closed AS (
          UPDATE product_provision_jobs
             SET status = CASE WHEN $2::boolean THEN 'done' ELSE 'failed' END,
                 error = CASE WHEN $2::boolean THEN NULL ELSE $3::text END,
                 finished_at = now()
           WHERE id = $1 AND status = 'running' AND kind = 'domain'
          RETURNING product_id
       ), activated AS (
          UPDATE product_domains d SET status = 'active', error = NULL, activated_at = now()
            FROM closed WHERE $2::boolean AND d.product_id = closed.product_id AND d.status = 'issuing'
          RETURNING d.product_id
       ), removed AS (
          DELETE FROM product_domains d USING closed
           WHERE $2::boolean AND d.product_id = closed.product_id AND d.status = 'removing'
          RETURNING d.product_id
       ), refused AS (
          UPDATE product_domains d
             SET status = 'failed',
                 error = CASE WHEN d.status = 'removing' THEN 'отвязка не удалась: ' || $3::text ELSE $3::text END
            FROM closed WHERE NOT $2::boolean AND d.product_id = closed.product_id AND d.status IN ('issuing','removing')
          RETURNING d.product_id
       )
       SELECT (SELECT count(*) FROM closed)::int AS closed`,
      [jobId, result.ok, result.error ?? 'без причины'],
    );
    if (!r.rows[0].closed) this.logger.warn(`отчёт по незапущенному заданию domain ${jobId} — домен не тронут`);
  }
```

- [ ] **Step 7: Прогнать новый тест и весь провижининг**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/(domains|provisioning|host)" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|✕"; npx tsc --noEmit -p tsconfig.build.json && echo TSC_OK'
```

Ожидается: все наборы `PASS`, в `domains.jobs` — 12 passed, прежние наборы провижининга зелёные, `TSC_OK`. Если старый тест сверяет точную форму объекта `claimJob` через `toEqual`, дописать туда `customNames: []` и `vhostMode: 'proxy'` (или `'asleep'` для сна): это расширение контракта, а не поломка. Тесты `provisioning.job.spec.ts` на `completeJob` фильтруют вызовы по `UPDATE`, и лишний `SELECT kind` их не задевает.

- [ ] **Step 8: Мутации**

- (а) убрать ветку `WHEN 'domain'` — ждём красный «выдаётся у работающего продукта»;
- (б) в `custom_names` добавить `'failed'` — ждём красный «отказавший домен в задания не попадает»;
- (в) убрать ранний возврат в `completeJob` — ждём красный «отказ: … продукт не тронут»;
- (г) убрать `AND j.kind <> 'domain'` из `wokenSql` — ждём красные «не мешает переводу в running» и «проснувшийся … режим прокси».

- [ ] **Step 9: Коммит**

```bash
git add src/products/provisioning.service.ts src/products/domains.jobs.spec.ts
git commit -m "feat(products): задание domain — выдача в любом режиме, имена в каждом задании, пробуждение не заслоняется"
```

---

### Task 7: Ручки кабинета

**Files:**
- Modify: `spirits_back/src/products/products.controller.ts`
- Modify: `spirits_back/src/products/products.routes.spec.ts`
- Test: `spirits_back/src/products/domains.controller.spec.ts`

- [ ] **Step 1: Написать падающие тесты**

В `products.routes.spec.ts`, внутри `describe('охрана маршрутов products', …)` рядом с «кнопки кабинета бьют туда же, куда ходит фронт»:

```ts
  it('ручки своего домена стоят по адресам, которые зовёт кабинет', () => {
    // Адреса — контракт с ДРУГИМ репозиторием (spirits_front, productsApi.ts),
    // поэтому сверяются с литералом.
    expect(endpointOf(ProductsController, 'getDomain')).toBe('GET /webhook/products/:id/domain');
    expect(endpointOf(ProductsController, 'attachDomain')).toBe('POST /webhook/products/:id/domain');
    expect(endpointOf(ProductsController, 'checkDomain')).toBe('POST /webhook/products/:id/domain/check');
    expect(endpointOf(ProductsController, 'detachDomain')).toBe('DELETE /webhook/products/:id/domain');
  });
```

`spirits_back/src/products/domains.controller.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { ProductsController } from './products.controller';

describe('ручки своего домена', () => {
  const make = () => {
    const domains = {
      get: jest.fn(async () => null),
      attach: jest.fn(async () => ({ domain: 'a.ru' })),
      check: jest.fn(async () => ({ domain: 'a.ru' })),
      detach: jest.fn(async () => ({ removed: 'now' })),
    };
    const ctrl = new ProductsController({} as any, {} as any, {} as any, {} as any, {} as any, domains as any);
    return { ctrl, domains };
  };
  const user = { userId: '79030169187' };
  const ID = '11111111-2222-3333-4444-555555555555';

  it('владелец берётся из токена, а не из тела', async () => {
    const { ctrl, domains } = make();
    await ctrl.attachDomain(user, ID, { domain: 'a.ru', userId: '70000000000' } as any);
    expect(domains.attach).toHaveBeenCalledWith('79030169187', ID, 'a.ru');
  });

  it('кривой идентификатор отбивается до сервиса', async () => {
    const { ctrl, domains } = make();
    await expect(ctrl.getDomain(user, 'не-uuid')).rejects.toBeInstanceOf(NotFoundException);
    expect(domains.get).not.toHaveBeenCalled();
  });

  it('ответы в конверте { domain }', async () => {
    const { ctrl } = make();
    await expect(ctrl.getDomain(user, ID)).resolves.toEqual({ domain: null });
    await expect(ctrl.checkDomain(user, ID)).resolves.toEqual({ domain: { domain: 'a.ru' } });
    await expect(ctrl.detachDomain(user, ID)).resolves.toEqual({ removed: 'now' });
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Ожидается: FAIL — методов нет.

- [ ] **Step 3: Написать ручки**

В `products.controller.ts`: добавить `Delete` в импорт из `@nestjs/common`, `import { DomainsService } from './domains.service';`, последним параметром конструктора — `private readonly domains: DomainsService,`, и методы рядом с `retry`:

```ts
  /**
   * Свой домен продукта. Владелец — из токена (`@CurrentUser`), продукт ищется
   * с `user_id` в WHERE внутри сервиса. Тело — только `{ domain }`: поле
   * userId в нём ничего не значит.
   */
  @Get('products/:id/domain')
  async getDomain(@CurrentUser() user: any, @Param('id') id: string) {
    assertUuid(id, 'Product');
    return { domain: await this.domains.get(user.userId, id) };
  }

  @Post('products/:id/domain')
  async attachDomain(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { domain?: string }) {
    assertUuid(id, 'Product');
    return { domain: await this.domains.attach(user.userId, id, body?.domain) };
  }

  @Post('products/:id/domain/check')
  async checkDomain(@CurrentUser() user: any, @Param('id') id: string) {
    assertUuid(id, 'Product');
    return { domain: await this.domains.check(user.userId, id) };
  }

  @Delete('products/:id/domain')
  async detachDomain(@CurrentUser() user: any, @Param('id') id: string) {
    assertUuid(id, 'Product');
    return this.domains.detach(user.userId, id);
  }
```

- [ ] **Step 4: Прогнать тесты**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && npx jest --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/(products.routes|domains.controller)" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|✕"'
```

Ожидается: оба `PASS`, включая существующие «каждый :плейсхолдер пути спрашивается @Param-ом» и «ни один маршрут кабинета не занимает двухсегментный POST». Типы проверяются в задаче 8, когда сервис появится в модуле.

- [ ] **Step 5: Коммит**

```bash
git add src/products/products.controller.ts src/products/products.routes.spec.ts src/products/domains.controller.spec.ts
git commit -m "feat(products): ручки своего домена в кабинете"
```

---

### Task 8: Модуль и работающий домен в списке продуктов

**Files:**
- Modify: `spirits_back/src/products/products.module.ts`
- Modify: `spirits_back/src/products/products.service.ts` (`COLUMNS`, `ProductRow`)
- Modify: `spirits_back/src/products/products.access.spec.ts`
- Modify: `spirits_back/src/products/domains.spec.ts`

- [ ] **Step 1: Написать падающие тесты**

В `products.access.spec.ts`, в «отдают ровно то, что читает кабинет», в конец перечня колонок добавить:

```ts
      // Свой домен (миграция 008), только работающий: «https://<домен>»
      // становится главной ссылкой карточки. Привязка в процессе ссылкой не
      // становится — сервер отдаёт NULL.
      'custom_domain',
```

В `domains.spec.ts`: в шапку — `import { ProductsService } from './products.service';` (рядом с импортом `MIGRATIONS`, можно одной строкой `import { MIGRATIONS, ProductsService } from './products.service';`). Внутрь `maybe(...)`:

```ts
  describe('список продуктов кабинета', () => {
    it('отдаёт работающий свой домен и только работающий', async () => {
      const live = await mkProduct({ slug: 'live' });
      const wait = await mkProduct({ slug: 'wait' });
      await putDomain(live, 'active', { domain: 'live.ru' });
      await putDomain(wait, 'awaiting_dns', { domain: 'wait.ru' });
      const rows = await new ProductsService(pg as any).list(OWNER);
      const by = Object.fromEntries(rows.map((r: any) => [r.slug, r.custom_domain]));
      expect(by).toEqual({ live: 'live.ru', wait: null });
    });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

Ожидается: красный «отдают ровно то, что читает кабинет» (нет `custom_domain`) и красный новый тест в `domains.spec.ts`.

- [ ] **Step 3: Колонка**

В `products.service.ts` константу `COLUMNS` дописать так, чтобы она кончалась подзапросом (над ней — абзац в комментарий):

```ts
// custom_domain — свой домен продукта (миграция 008), ТОЛЬКО в состоянии
// active: кабинет делает его главной ссылкой карточки, и привязка в процессе
// ссылкой становиться не должна. Подзапрос, а не JOIN: у продукта не больше
// одной строки домена, а выборка остаётся «SELECT … FROM products».
const COLUMNS = `id, user_id, name, slug, status, kind, domain,
                 runner_seen_at, provision_error, paid_until, sleep_reason,
                 block_reason, created_at,
                 (SELECT d.domain FROM product_domains d
                   WHERE d.product_id = products.id AND d.status = 'active') AS custom_domain`;
```

В `interface ProductRow` добавить `custom_domain: string | null;`.

- [ ] **Step 4: Модуль**

В `products.module.ts`: `import { DomainsService } from './domains.service';`, `DomainsService` — в `providers` и в `exports`.

- [ ] **Step 5: Прогнать тесты, типы и сборку**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/(products.access|domains.spec|products.routes)" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|✕"; npx tsc --noEmit -p tsconfig.build.json && echo TSC_OK && npm run build 2>&1 | tail -2'
```

Ожидается: все `PASS`, `TSC_OK`, сборка без ошибок. Сторож «не отдают внутреннюю топологию» остаётся зелёным: в подзапросе нет ни `port`, ни `host_ip`.

- [ ] **Step 6: Коммит**

```bash
git add src/products/products.module.ts src/products/products.service.ts src/products/products.access.spec.ts src/products/domains.spec.ts
git commit -m "feat(products): DomainsService в модуле, работающий свой домен в списке кабинета"
```

---

### Task 9: Действие `domain` у инструмента ассистента

**Files:**
- Modify: `spirits_back/src/products/product-tool.service.ts`
- Modify: `spirits_back/src/products/product-tool.defs.spec.ts`
- Modify: `spirits_back/src/products/product-tool.spec.ts`

- [ ] **Step 1: Написать падающие тесты**

В `product-tool.defs.spec.ts` тест «инструмент ровно один, с тремя действиями» переименовать в «инструмент ровно один, с четырьмя действиями», а ожидание перечня заменить на:

```ts
    expect((tool().input_schema as any).properties.action.enum.slice().sort()).toEqual(['domain', 'edit', 'list', 'status']);
```

И дописать:

```ts
  it('описание учит привязке домена: записи дословно, AAAA удалить, не врать про «работает», бесплатно', () => {
    const d = tool().description;
    expect(d).toMatch(/action="domain"/);
    expect(d).toMatch(/ДОСЛОВНО/);
    expect(d).toMatch(/AAAA/);
    expect(d).toMatch(/Не говори «домен работает»/);
    expect(d).toMatch(/бесплатн/i);
  });
```

В `product-tool.spec.ts`: в шапку — `import { DomainsService } from './domains.service';`. `TRUNCATE` в `beforeEach` и `afterAll` заменить на `'TRUNCATE products, product_turns, product_hosts RESTART IDENTITY CASCADE'`. Внутрь `maybe(...)` дописать:

```ts
  describe('действие domain', () => {
    const noDns = async () => {
      throw Object.assign(new Error('ENODATA'), { code: 'ENODATA' });
    };
    const withDomains = () => {
      const domains = new DomainsService(pg as any);
      (domains as any).resolver = { resolve4: noDns, resolve6: noDns, resolveTxt: noDns };
      return new ProductToolService(pg as any, {} as any, domains);
    };
    const onHost = async (id: string) => {
      await pool.query(
        `INSERT INTO product_hosts (id, ssh_target, public_ip, domain_suffix, agent_token_hash, capacity, audience)
         VALUES ('own', 'root@139.59.210.42', '139.59.210.42', 'p.linkeon.io', 'probe-hash', 20, 'own')
         ON CONFLICT (id) DO NOTHING`,
      );
      await pool.query(`UPDATE products SET host_id = 'own' WHERE id = $1`, [id]);
    };

    it('привязка возвращает записи для регистратора и не называет домен работающим', async () => {
      const id = await mkProduct({ name: 'Сайт визитка', slug: 'dmitryvolkov' });
      await onHost(id);
      const out: any = await withDomains().execute(OWNER, { action: 'domain', product: 'визитка', domain: 'dmitryvolkov.ru' });
      expect(out.ok).toBe(true);
      expect(out.domain.status).toBe('awaiting_dns');
      expect(out.domain.records.map((r: any) => r.type)).toEqual(['TXT', 'A', 'CNAME']);
      expect(out.say).toMatch(/AAAA/);
      expect(out.say).not.toMatch(/Домен работает/);
    });

    it('без domain — состояние; нет домена — так и сказано', async () => {
      const id = await mkProduct({ name: 'Сайт визитка', slug: 'dmitryvolkov' });
      await onHost(id);
      const out: any = await withDomains().execute(OWNER, { action: 'domain', product: 'визитка' });
      expect(out).toMatchObject({ ok: true, domain: null });
    });

    it('отказ сервиса доходит текстом', async () => {
      const id = await mkProduct({ name: 'Сайт визитка', slug: 'dmitryvolkov' });
      await onHost(id);
      const out: any = await withDomains().execute(OWNER, { action: 'domain', product: 'визитка', domain: '1.2.3.4' });
      expect(out.ok).toBe(false);
      expect(out.say).toMatch(/IP/);
    });

    it('неоднозначное имя продукта — уточняет', async () => {
      await mkProduct({ name: 'Магазин цветов', slug: 'flowers' });
      await mkProduct({ name: 'Магазин книг', slug: 'books' });
      const out: any = await withDomains().execute(OWNER, { action: 'domain', product: 'магазин', domain: 'a.ru' });
      expect(out.reason).toBe('ambiguous');
    });

    // После привязки человек называет сайт его доменом.
    it('продукт находится по своему домену', async () => {
      const id = await mkProduct({ name: 'Сайт визитка', slug: 'dmitryvolkov' });
      await pool.query(
        `INSERT INTO product_domains (product_id, domain, names, token, status)
         VALUES ($1, 'dmitryvolkov.ru', '{dmitryvolkov.ru,www.dmitryvolkov.ru}', 'lk', 'active')`,
        [id],
      );
      const svc = new ProductToolService(pg as any, {} as any, {} as any);
      expect((await svc.resolve(OWNER, 'https://DmitryVolkov.RU/')).map((p) => p.id)).toEqual([id]);
    });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/products/product-tool" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|✕"'
```

Ожидается: FAIL в 5 новых тестах, в перечне действий и в описании.

- [ ] **Step 3: Написать действие**

В `product-tool.service.ts`:
- импорт `HttpException` из `@nestjs/common`, `import { DomainsService, DomainView } from './domains.service';`, `import { normalizeDomain } from './domain-name';`;
- конструктор получает третий аргумент `private readonly domains: DomainsService,`.

В `resolve()` — поиск и по своему домену. Перед запросом:

```ts
    // Свой домен сравнивается в нормальной форме: «https://DmitryVolkov.RU/»
    // и «пример.рф» хранятся как dmitryvolkov.ru и punycode.
    const normalized = normalizeDomain(raw);
    const custom = normalized.ok ? normalized.domain : raw;
```

и в запросе заменить условие и параметры:

```ts
        WHERE user_id = $1 AND archived_at IS NULL
          AND ( id::text = $2
             OR lower(slug) = $2
             OR lower(domain) = $2
             OR lower(name) LIKE $3
             OR EXISTS (SELECT 1 FROM product_domains d
                         WHERE d.product_id = products.id AND d.domain = $4) )
        ORDER BY created_at DESC`,
      [userId, raw, like, custom],
```

В `execute` перед `bad_action`:

```ts
    if (action === 'domain') return this.domain(userId, input);
```

и текст `bad_action` заменить на `'Неизвестное действие. Доступны: list (показать продукты), edit (поставить правку), status (узнать исход правки), domain (свой домен сайта).'`.

Методы в класс:

```ts
  /**
   * Свой домен продукта. Продукт ищется тем же нестрогим поиском, что у
   * правок, и при неоднозначности — тот же вопрос, а не выбор наугад.
   */
  private async domain(userId: string, input: any) {
    const matches = await this.resolve(userId, String(input?.product ?? ''));
    if (matches.length > 1) {
      return { ok: false, reason: 'ambiguous', matches,
        say: 'Под это описание подходит несколько продуктов. СПРОСИ, к какому привязывать домен.' };
    }
    if (matches.length === 0) {
      return { ok: false, reason: 'not_found', say: 'Такого продукта у пользователя нет.' };
    }
    const product = matches[0];
    try {
      if (input?.remove === true) {
        const r = await this.domains.detach(userId, product.id);
        return { ok: true, product, removed: r.removed,
          say: r.removed === 'now' ? 'Домен отвязан.' : 'Отвязка поставлена — займёт до минуты.' };
      }
      const raw = typeof input?.domain === 'string' ? input.domain.trim() : '';
      const view = raw ? await this.domains.attach(userId, product.id, raw) : await this.domains.get(userId, product.id);
      return { ok: true, product, domain: view, say: this.domainSay(view) };
    } catch (e: any) {
      if (e instanceof HttpException) {
        const r = e.getResponse() as any;
        return { ok: false, reason: 'refused', product, say: typeof r === 'string' ? r : (r?.message ?? e.message) };
      }
      throw e;
    }
  }

  private domainSay(v: DomainView | null): string {
    if (!v) return 'Своего домена у продукта нет.';
    switch (v.status) {
      case 'active':
        return `Домен работает: https://${v.domain}`;
      case 'issuing':
        return 'DNS в порядке, сертификат выпускается — обычно меньше минуты. Пока не говори, что домен работает.';
      case 'failed':
        return `Выпуск не удался: ${v.error ?? 'без причины'}. Можно проверить снова. Не говори, что домен работает.`;
      case 'removing':
        return 'Домен отвязывается.';
      default:
        return (
          'Домен ждёт изменения DNS. Назови пользователю записи ДОСЛОВНО из records (тип, имя, значение) и скажи ' +
          'удалить у этих имён остальные A-записи и ВСЕ AAAA — иначе сертификат не выпустится. Изменения DNS ' +
          'расходятся от 15 минут до суток, платформа проверяет сама. Это бесплатно. Не говори, что домен уже подключён.'
        );
    }
  }
```

В `list()` заменить SQL на выборку со своим доменом:

```ts
        `SELECT p.id, p.name, p.slug, p.domain, p.kind, p.status,
                d.domain AS custom_domain, d.status AS custom_domain_status
           FROM products p
           LEFT JOIN product_domains d ON d.product_id = p.id
          WHERE p.user_id = $1 AND p.archived_at IS NULL
          ORDER BY p.created_at DESC`,
```

В `PRODUCT_TOOLS`: в `enum` добавить `'domain'`; в `properties` —

```ts
        domain: {
          type: 'string',
          description: 'Свой домен пользователя для action="domain" (например, "mysite.ru"). Без него — узнать состояние.',
        },
        remove: {
          type: 'boolean',
          description: 'Для action="domain": true — отвязать свой домен.',
        },
```

В описание, перед абзацем «ЧЕГО ТЫ НЕ МОЖЕШЬ», вставить:

```ts
      '• action="domain" — свой домен сайта: { product, domain } — привязать; { product } — узнать состояние; ' +
      '{ product, remove: true } — отвязать. Вернутся records — записи для регистратора: называй их ДОСЛОВНО ' +
      '(тип, имя, значение), не пересказывая, и обязательно скажи удалить у этих имён остальные A-записи и ВСЕ AAAA. ' +
      'Не говори «домен работает», пока domain.status не "active". Свой домен бесплатный, входит в аренду. ' +
      'Бывает только у сайта, один на продукт.\n' +
```

- [ ] **Step 4: Прогнать тесты и типы**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && source ~/.nvm/nvm.sh && PROVISIONING_PG_URL=postgres://pdom:pdom@127.0.0.1:5432/pdom npx jest --runInBand --testPathIgnorePatterns=/node_modules/ --testPathPattern="src/(products/product-tool|mcp/)" 2>&1 | grep -E "^(PASS|FAIL|Tests:|Test Suites:)|✕"; npx tsc --noEmit -p tsconfig.build.json && echo TSC_OK'
```

Ожидается: все `PASS`, 0 skipped, `TSC_OK`.

- [ ] **Step 5: Мутация**

В `domainSay` для `awaiting_dns` вернуть «Домен работает». Ожидается красный «не называет домен работающим».

- [ ] **Step 6: Коммит**

```bash
git add src/products/product-tool.service.ts src/products/product-tool.defs.spec.ts src/products/product-tool.spec.ts
git commit -m "feat(products): ассистент привязывает свой домен — записи дословно, «работает» только после выпуска"
```

---

### Task 10: Агент — имена во всех вызовах `product-vhost`

**Files:**
- Create: `spirits_back/product-runner/src/host/vhost.ts`
- Modify: `spirits_back/product-runner/src/host/api.ts` (поля `HostJob`)
- Modify: `spirits_back/product-runner/src/host/provision.ts` (`ProvisionJob`, строка 476)
- Modify: `spirits_back/product-runner/src/host/sleep.ts` (`SleepJob`, строки 96 и 222)
- Modify: `spirits_back/product-runner/src/host/index.ts` (`workFor`)
- Modify: `spirits_back/product-runner/src/host/fake-host.ts` (разбор `--domain`)
- Test: `vhost.spec.ts` (создать), `provision.spec.ts`, `sleep.spec.ts`, `fake-host.spec.ts`

- [ ] **Step 1: Написать падающие тесты**

`spirits_back/product-runner/src/host/vhost.spec.ts`:

```ts
import { assertDomainName, vhostArgv } from './vhost';

describe('командная строка product-vhost', () => {
  it('без своих имён — как прежде', () => {
    expect(vhostArgv('product-vhost', 'shop', 8001)).toEqual(['product-vhost', 'shop', '8001']);
    expect(vhostArgv('product-vhost', 'shop', '--asleep')).toEqual(['product-vhost', 'shop', '--asleep']);
  });

  it('свои имена — парами --domain', () => {
    expect(vhostArgv('product-vhost', 'shop', 8001, ['a.ru', 'www.a.ru'])).toEqual([
      'product-vhost', 'shop', '8001', '--domain', 'a.ru', '--domain', 'www.a.ru',
    ]);
  });

  // Имя уезжает в конфиг nginx; мусор в нём роняет `nginx -t` у ВСЕЙ машины.
  it('мусор в имени отбивается до запуска', () => {
    for (const bad of ['', 'a', 'a..b.ru', '-a.ru', 'a-.ru', 'a.ru;', 'a ru', 'A.RU', 'a.ru/x', '.a.ru', 'a.ru.']) {
      expect(() => assertDomainName(bad)).toThrow();
    }
    expect(() => vhostArgv('product-vhost', 'shop', 8001, ['a.ru; rm -rf /'])).toThrow();
  });

  it('длиннее 100 знаков — отказ, ровно 100 — нет', () => {
    const exact = `${'a'.repeat(48)}.${'b'.repeat(48)}.ru`;
    expect(() => assertDomainName(exact)).not.toThrow();
    expect(() => assertDomainName(`b${exact}`)).toThrow();
  });

  it('punycode проходит', () => {
    expect(() => assertDomainName('xn--e1afmkfd.xn--p1ai')).not.toThrow();
  });
});
```

В `provision.spec.ts` (фикстуры `job(over)`, `host`, `deps(host)` уже есть в шапке):

```ts
describe('свои домены продукта', () => {
  it('заведение передаёт свои имена в product-vhost', async () => {
    const res = await provision(job({ customNames: ['a.ru'] }), deps(host));
    expect(host.ran('product-vhost').pop()).toEqual(['product-vhost', 'kafe-ulej', String(res.port), '--domain', 'a.ru']);
  });
});
```

В `sleep.spec.ts`, в `describe('сон продукта', …)`:

```ts
  it('сон передаёт свои имена: заглушка ложится и на свой домен', async () => {
    await seed('shop');
    await sleepProduct({ slug: 'shop', kind: 'site', customNames: ['a.ru', 'www.a.ru'] }, deps(host));
    expect(host.ran('product-vhost').pop()).toEqual([
      'product-vhost', 'shop', '--asleep', '--domain', 'a.ru', '--domain', 'www.a.ru',
    ]);
    expect(host.vhostDomains.get('shop')).toEqual(['a.ru', 'www.a.ru']);
  });
```

и в `describe` пробуждения, рядом с «контейнер поднят, домен вернулся в боевой режим» (там объявлен помощник `asleep`):

```ts
  it('пробуждение передаёт свои имена', async () => {
    const port = await asleep('shop');
    await wakeProduct({ slug: 'shop', kind: 'site', port, customNames: ['a.ru'] }, deps(host));
    expect(host.ran('product-vhost').pop()).toEqual(['product-vhost', 'shop', String(port), '--domain', 'a.ru']);
  });
```

В `fake-host.spec.ts`:

```ts
describe('product-vhost со своими доменами', () => {
  it('имена запоминаются, непонятный хвост — отказ', async () => {
    const host = new FakeHost();
    await host.run(['product-vhost', 'shop', '8001', '--domain', 'a.ru']);
    expect(host.vhostDomains.get('shop')).toEqual(['a.ru']);
    await expect(host.run(['product-vhost', 'shop', '8001', '--foo', 'a.ru'])).rejects.toThrow(/хвост/);
  });
});
```

(если `FakeHost` в шапке `fake-host.spec.ts` не импортирован — `import { FakeHost } from './fake-host';`).

- [ ] **Step 2: Убедиться, что тесты падают**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back/product-runner && source ~/.nvm/nvm.sh && npx jest src/host 2>&1 | grep -E "^(Tests:|Test Suites:)|✕|Cannot find"'
```

Ожидается: FAIL — модуля `./vhost` нет, имена не передаются.

- [ ] **Step 3: Помощник**

`spirits_back/product-runner/src/host/vhost.ts`:

```ts
/**
 * Командная строка product-vhost — одна на все места вызова (заведение, сон,
 * пробуждение, задание domain). Разъехавшись, они потеряли бы свой домен
 * ровно в том месте, где забыли дописать имена: первый же сон переписал бы
 * конфиг без них.
 */

/**
 * Потолок длины имени. Замерено 24.09.2026 на nginx 1.24 машин продуктов:
 * при корзине server_names_hash_bucket_size 64 имя от 47 знаков роняет
 * `nginx -t` всей машины; PHASE 4 ставит 128 (потолок 110). Та же граница —
 * в normalizeDomain на сервере и в самом product-vhost.
 */
export const MAX_DOMAIN_LENGTH = 100;

/** Имя домена: метки [a-z0-9-] без дефиса по краям, минимум две. Та же форма разбирается в product-vhost. */
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export function assertDomainName(name: string): void {
  if (typeof name !== 'string' || name.length > MAX_DOMAIN_LENGTH || !DOMAIN_RE.test(name)) {
    throw new Error(`имя домена не годится для конфига nginx: ${JSON.stringify(name)}`);
  }
}

export function vhostArgv(bin: string, slug: string, target: number | '--asleep', names: string[] = []): string[] {
  const argv = [bin, slug, String(target)];
  for (const name of names) {
    assertDomainName(name);
    argv.push('--domain', name);
  }
  return argv;
}
```

- [ ] **Step 4: Поля задания и места вызова**

`api.ts`, в `interface HostJob` после `port?: number | null;`:

```ts
  /** Свои имена продукта. Приезжают в каждом задании; у отвязки — пусто. */
  customNames?: string[];
  /** Режим конфига для задания domain: прокси или заглушка. Вычисляет сервер. */
  vhostMode?: 'proxy' | 'asleep';
```

`provision.ts`: в `interface ProvisionJob` добавить `customNames?: string[];`, импорт `import { vhostArgv } from './vhost';`, строку 476 заменить на

```ts
      await deps.run(vhostArgv(deps.vhostBin ?? DEFAULTS.vhostBin, job.slug, port, job.customNames ?? []));
```

`sleep.ts`: в `interface SleepJob` добавить

```ts
  /** Свои имена продукта: заглушка и возврат прокси обязаны лечь и на них. */
  customNames?: string[];
```

импорт `import { vhostArgv } from './vhost';`, строку 96 заменить на

```ts
    await deps.run(vhostArgv(deps.vhostBin ?? DEFAULTS.vhostBin, job.slug, '--asleep', job.customNames ?? []));
```

и строку 222 — на

```ts
  await deps.run(vhostArgv(deps.vhostBin ?? DEFAULTS.vhostBin, job.slug, port as number, job.customNames ?? []));
```

`index.ts`, в `workFor` выжимка сна и пробуждения:

```ts
  const step: SleepJob = { slug: job.slug, kind: job.kind, port: job.port, customNames: job.customNames ?? [] };
```

- [ ] **Step 5: Симулятор**

В `fake-host.ts` добавить поле рядом с `vhostModes`:

```ts
  /** Свои имена продукта из последнего вызова product-vhost. */
  vhostDomains = new Map<string, string[]>();
```

и в ветке `case 'product-vhost'` сразу после `const [slug, arg] = rest;`:

```ts
        // Хвост — только пары `--domain <имя>`, как у живого скрипта: всё
        // непонятое он отбивает до первой записи.
        const tail = rest.slice(2);
        const names: string[] = [];
        for (let i = 0; i < tail.length; i += 2) {
          if (tail[i] !== '--domain' || !tail[i + 1]) {
            throw new Error(`product-vhost: непонятный хвост: ${tail.join(' ')}`);
          }
          names.push(tail[i + 1]);
        }
        this.vhostDomains.set(slug, names);
```

- [ ] **Step 6: Прогнать всё агента и типы**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back/product-runner && source ~/.nvm/nvm.sh && npx jest 2>&1 | grep -E "^(Tests:|Test Suites:)|✕"; npx tsc --noEmit && echo TSC_OK'
```

Ожидается: все наборы `passed`, счёт тестов вырос на 9 относительно исходного, `TSC_OK`.

- [ ] **Step 7: Коммит**

```bash
git add product-runner/src/host/
git commit -m "feat(host): свои имена продукта доезжают до product-vhost в заведении, сне и пробуждении"
```

---

### Task 11: Агент — задание `domain`

**Files:**
- Create: `spirits_back/product-runner/src/host/domain.ts`
- Modify: `spirits_back/product-runner/src/host/index.ts` (`KNOWN_KINDS`, `HostDeps`, `workFor`, `overdue`, `RealDepsParts`, `realDeps`)
- Modify: `spirits_back/product-runner/src/host/fake-host.ts` (certbot)
- Modify: `spirits_back/product-runner/src/host/index.spec.ts`, `review10.defects.spec.ts` (литералы `HostDeps`)
- Test: `spirits_back/product-runner/src/host/domain.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`spirits_back/product-runner/src/host/domain.spec.ts`:

```ts
import { ACME_WEBROOT, applyDomain, certName } from './domain';
import { FakeHost, deps } from './fake-host';

let host: FakeHost;
beforeEach(() => {
  host = new FakeHost();
});

const CERTBOT_ISSUE = (names: string[]) => [
  'certbot', 'certonly', '--webroot', '-w', ACME_WEBROOT, '--cert-name', certName('shop'),
  '--non-interactive', '--agree-tos', '--keep-until-expiring', '--expand',
  ...names.flatMap((n) => ['-d', n]),
];

describe('задание domain на машине', () => {
  it('привязка: конфиг → certbot → конфиг, в таком порядке', async () => {
    await applyDomain({ slug: 'shop', kind: 'site', port: 8001, vhostMode: 'proxy', customNames: ['a.ru', 'www.a.ru'] }, deps(host));
    expect(host.calls).toEqual([
      ['product-vhost', 'shop', '8001', '--domain', 'a.ru', '--domain', 'www.a.ru'],
      CERTBOT_ISSUE(['a.ru', 'www.a.ru']),
      ['product-vhost', 'shop', '8001', '--domain', 'a.ru', '--domain', 'www.a.ru'],
    ]);
    expect(host.certs.has('linkeon-shop')).toBe(true);
  });

  it('спящий продукт — конфиг в режиме заглушки', async () => {
    await applyDomain({ slug: 'shop', kind: 'site', port: 8001, vhostMode: 'asleep', customNames: ['a.ru'] }, deps(host));
    expect(host.calls[0]).toEqual(['product-vhost', 'shop', '--asleep', '--domain', 'a.ru']);
  });

  // Порядок обязателен: наоборот конфиг на мгновение ссылается на удалённый
  // сертификат, и любая перечитка роняет nginx всей машины.
  it('отвязка: сначала конфиг без имён, потом удалить сертификат', async () => {
    host.certs.add('linkeon-shop');
    await applyDomain({ slug: 'shop', kind: 'site', port: 8001, vhostMode: 'proxy', customNames: [] }, deps(host));
    expect(host.calls).toEqual([
      ['product-vhost', 'shop', '8001'],
      ['certbot', 'delete', '--cert-name', 'linkeon-shop', '--non-interactive'],
    ]);
    expect(host.certs.has('linkeon-shop')).toBe(false);
  });

  it('отвязка, когда сертификата нет, — не ошибка', async () => {
    await expect(
      applyDomain({ slug: 'shop', kind: 'site', port: 8001, vhostMode: 'proxy', customNames: [] }, deps(host)),
    ).resolves.toBeUndefined();
  });

  // Без отката блоки порта 80 отказавшего домена жили бы на машине до
  // следующей перегенерации, и продукт, который потом законно получит этот
  // домен, делил бы с ними server_name.
  it('отказ certbot: конфиг возвращается без своих имён, наружу — текст certbot', async () => {
    host.certbotFails = 'Challenge failed for domain a.ru';
    await expect(
      applyDomain({ slug: 'shop', kind: 'site', port: 8001, vhostMode: 'proxy', customNames: ['a.ru'] }, deps(host)),
    ).rejects.toThrow(/Challenge failed/);
    expect(host.ran('product-vhost')).toEqual([
      ['product-vhost', 'shop', '8001', '--domain', 'a.ru'],
      ['product-vhost', 'shop', '8001'],
    ]);
    expect(host.vhostDomains.get('shop')).toEqual([]);
  });

  it('у бота — отказ до любых действий', async () => {
    await expect(
      applyDomain({ slug: 'bot', kind: 'bot', port: null, vhostMode: 'proxy', customNames: ['a.ru'] }, deps(host)),
    ).rejects.toThrow();
    expect(host.calls).toEqual([]);
  });

  it('прокси без порта — отказ до любых действий', async () => {
    await expect(
      applyDomain({ slug: 'shop', kind: 'site', port: null, vhostMode: 'proxy', customNames: ['a.ru'] }, deps(host)),
    ).rejects.toThrow(/порт/);
    expect(host.calls).toEqual([]);
  });

  it('мусор в имени — отказ до любых действий', async () => {
    await expect(
      applyDomain({ slug: 'shop', kind: 'site', port: 8001, vhostMode: 'proxy', customNames: ['a.ru;x'] }, deps(host)),
    ).rejects.toThrow();
    expect(host.calls).toEqual([]);
  });
});
```

В `index.spec.ts`: в `makeDeps` добавить

```ts
  const domain = jest.fn(async (_job: DomainJob): Promise<void> => undefined);
```

поле `domain,` в литерал `deps: HostDeps` и `domain` в возвращаемый объект; в шапку — `import { DomainJob } from './domain';`. Новый тест рядом с тестами сна и пробуждения через `tick`:

```ts
  it('задание domain уходит в deps.domain ВЫЖИМКОЙ, отчёт — без порта', async () => {
    const { deps, poll, complete, domain } = makeDeps();
    poll.mockResolvedValueOnce({
      ok: true,
      job: {
        jobId: 'j-1', productId: 'p-1', slug: 'shop', kind: 'site', name: 'Магазин',
        runnerToken: 'секрет', secrets: { A: 'b' },
        jobKind: 'domain', port: 8001, customNames: ['a.ru'], vhostMode: 'proxy',
      },
    });
    await tick(deps);
    // Токен и секреты на хостовой шаг не уезжают — ровно как у сна.
    expect(domain).toHaveBeenCalledWith({ slug: 'shop', kind: 'site', port: 8001, customNames: ['a.ru'], vhostMode: 'proxy' });
    expect(lastReport(complete)).toEqual({ ok: true });
  });
```

В `review10.defects.spec.ts`, в литерале `HostDeps` рядом с `wakeProduct: async () => ({}),` добавить `domain: async () => undefined,`.

- [ ] **Step 2: Убедиться, что тест падает**

Ожидается: FAIL — модуля `./domain` нет.

- [ ] **Step 3: Написать задание**

`spirits_back/product-runner/src/host/domain.ts`:

```ts
import { DEFAULTS, ProvisionDeps, SLUG_RE } from './provision';
import { ProductKind } from './skeleton';
import { vhostArgv } from './vhost';

/** Каталог для HTTP-01. Путь `/.well-known/acme-challenge/` отдаётся из него в блоках порта 80 своих имён. */
export const ACME_WEBROOT = '/var/www/linkeon-acme';

/** Один сертификат на все свои имена продукта. */
export function certName(slug: string): string {
  return `linkeon-${slug}`;
}

/**
 * Выжимка задания для хостового шага — как у сна и пробуждения: токен
 * раннера и секреты сюда не уезжают (см. workFor в index.ts).
 */
export interface DomainJob {
  slug: string;
  kind: ProductKind;
  port?: number | null;
  customNames: string[];
  vhostMode?: 'proxy' | 'asleep';
}

/**
 * Задание domain. Намерение — по списку имён: непустой — привязать, пустой —
 * отвязать (сервер присылает пустой список у строки в removing).
 *
 * Привязка: конфиг с блоками порта 80 (путь для Let's Encrypt) → certbot →
 * конфиг заново (сертификат на диске, появляются блоки 443). product-vhost
 * сам пишет 443 только при наличии файла сертификата. Отказ certbot
 * откатывает конфиг к состоянию без своих имён.
 *
 * Отвязка: конфиг без имён → удалить сертификат. Обратный порядок на мгновение
 * оставил бы конфиг со ссылкой на удалённый файл, и любая перечитка уронила
 * бы nginx всей машины.
 */
export async function applyDomain(job: DomainJob, deps: ProvisionDeps): Promise<void> {
  if (!SLUG_RE.test(job.slug)) throw new Error(`слаг не годится: ${JSON.stringify(job.slug)}`);
  if (job.kind !== 'site') throw new Error(`свой домен бывает только у сайта, а ${job.slug} — ${job.kind}`);
  let target: number | '--asleep';
  if (job.vhostMode === 'asleep') {
    target = '--asleep';
  } else {
    if (typeof job.port !== 'number') throw new Error(`у сайта ${job.slug} нет порта — прокси писать некуда`);
    target = job.port;
  }
  const bin = deps.vhostBin ?? DEFAULTS.vhostBin;
  const names = job.customNames;
  // Сборка ДО первого действия: vhostArgv бросает на мусоре в имени.
  const withNames = vhostArgv(bin, job.slug, target, names);
  const withoutNames = vhostArgv(bin, job.slug, target, []);

  if (names.length) {
    await deps.run(withNames);
    try {
      await deps.run([
        'certbot', 'certonly', '--webroot', '-w', ACME_WEBROOT, '--cert-name', certName(job.slug),
        '--non-interactive', '--agree-tos', '--keep-until-expiring', '--expand',
        ...names.flatMap((n) => ['-d', n]),
      ]);
    } catch (e: any) {
      try {
        await deps.run(withoutNames);
      } catch (rollback: any) {
        throw new Error(`${e?.message ?? e}\nи откатить конфиг не удалось: ${rollback?.message ?? rollback}`);
      }
      throw e;
    }
    await deps.run(withNames);
    return;
  }

  await deps.run(withoutNames);
  try {
    await deps.run(['certbot', 'delete', '--cert-name', certName(job.slug), '--non-interactive']);
  } catch (e: any) {
    // Сертификата могло не быть вовсе (выпуск не дошёл) — это не отказ отвязки.
    if (!/No certificate found/i.test(String(e?.message ?? e))) throw e;
  }
}
```

- [ ] **Step 4: Подключить в агенте**

`index.ts`:
- импорт `import { applyDomain, DomainJob } from './domain';`;
- `export const KNOWN_KINDS = ['provision', 'sleep', 'wake', 'domain'] as const;`;
- в `HostDeps` после `wakeProduct`:

```ts
  /**
   * Свой домен: выпуск сертификата или отвязка. Обязательное, как сон и
   * пробуждение, — по той же причине (см. докблок выше).
   */
  domain: (job: DomainJob) => Promise<void>;
```

- в `workFor` перед `const step`:

```ts
  // Свой домен — тоже ВЫЖИМКОЙ, как сон: токену раннера и секретам на этом
  // шаге делать нечего. Порт в отчёт не кладётся — задание его не меняет.
  if (kind === 'domain') {
    return deps
      .domain({ slug: job.slug, kind: job.kind, port: job.port, customNames: job.customNames ?? [], vhostMode: job.vhostMode })
      .then(() => ({}));
  }
```

- в `overdue()` перед `default`:

```ts
    case 'domain':
      return (
        `задание своего домена не уложилось в ${sec} с и брошено: состояние хоста НЕИЗВЕСТНО — `
        + 'конфиг и сертификат могли остаться частично, сверить `nginx -t` и `certbot certificates`'
      );
```

- в `RealDepsParts`: `domain?: (job: DomainJob, deps: ProvisionDeps) => Promise<void>;`
- в `realDeps`: `const doDomain = parts.domain ?? applyDomain;` и в возвращаемом объекте после `wakeProduct` — `domain: (job: DomainJob) => doDomain(job, build(provisionOverrides(config, log))),`.

- [ ] **Step 5: certbot в симуляторе**

В `fake-host.ts` поля:

```ts
  /** Сертификаты Let's Encrypt на машине, по имени (`--cert-name`). */
  certs = new Set<string>();
  /** Сломать выпуск: certbot certonly бросит с этим текстом. */
  certbotFails: string | null = null;
```

и ветка в `dispatch`:

```ts
      case 'certbot': {
        const [sub] = rest;
        const i = rest.indexOf('--cert-name');
        const name = i >= 0 ? rest[i + 1] : '';
        if (sub === 'certonly') {
          if (this.certbotFails) throw new Error(this.certbotFails);
          this.certs.add(name);
          return '';
        }
        if (sub === 'delete') {
          if (!this.certs.has(name)) throw new Error(`No certificate found with name ${name}`);
          this.certs.delete(name);
          return '';
        }
        throw new Error(`неожиданный вызов certbot: ${rest.join(' ')}`);
      }
```

- [ ] **Step 6: Прогнать всё агента и типы**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back/product-runner && source ~/.nvm/nvm.sh && npx jest 2>&1 | grep -E "^(Tests:|Test Suites:)|✕"; npx tsc --noEmit && echo TSC_OK'
```

Ожидается: все наборы `passed` — число `Test Suites` то же, что до задачи, плюс один (`domain.spec.ts`); `TSC_OK`.

- [ ] **Step 7: Мутации**

- (а) в отвязке поменять порядок (сначала `certbot delete`) — ждём красный «сначала конфиг без имён»;
- (б) при привязке убрать второй вызов `product-vhost` — ждём красный «конфиг → certbot → конфиг»;
- (в) убрать откат в `catch` — ждём красный «отказ certbot: конфиг возвращается»;
- (г) `KNOWN_KINDS` без `'domain'` — ждём красный теста `tick`;
- (д) в `workFor` передать `job` целиком — ждём красный «ВЫЖИМКОЙ».

- [ ] **Step 8: Коммит**

```bash
git add product-runner/src/host/
git commit -m "feat(host): задание domain — выпуск по HTTP-01, откат при отказе, отвязка в безопасном порядке"
```

---

### Task 12: `product-vhost` учится `--domain` и откату

**Files:**
- Modify: `spirits_back/scripts/product-vhost` (переписать целиком)
- Test: `spirits_back/product-runner/src/host/product-vhost.script.spec.ts`

Редакция скрипта ниже уже прогнана на ноде с настоящим `nginx -t` (24.09.2026, dash, nginx 1.24): 34 проверки, ни одного расхождения.

- [ ] **Step 1: Написать падающий тест**

`spirits_back/product-runner/src/host/product-vhost.script.spec.ts`:

```ts
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Настоящий скрипт в песочнице. Пути подменяются через окружение (PV_*),
 * перечитка — `true`. `nginx -t` — НАСТОЯЩИЙ там, где есть /usr/sbin/nginx
 * (нода): через обёртку, которая переносит порты 80/443 выше 1024 — nginx
 * 1.24 при `-t` привязывает сокеты, а тест идёт не от root.
 */
const SCRIPT = path.resolve(__dirname, '../../../scripts/product-vhost');
const NGINX = '/usr/sbin/nginx';
const HAVE_NGINX = fs.existsSync(NGINX);

interface Sandbox {
  root: string;
  run: (...args: string[]) => { status: number | null; out: string };
  conf: (slug: string) => string;
  confs: () => string[];
  cert: (slug: string) => void;
  bucket: (size: number | null) => void;
}

function sandbox(realNginx: boolean): Sandbox {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));
  for (const d of ['conf', 'live', 'acme', 'share', 'snippets', 'tmp', 'shadow']) fs.mkdirSync(path.join(root, d));
  let nginxBin = 'true';
  if (realNginx) {
    const gen = spawnSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=probe',
      '-keyout', path.join(root, 'key.pem'), '-out', path.join(root, 'crt.pem'),
    ], { encoding: 'utf8' });
    if (gen.status !== 0) throw new Error(`openssl: ${gen.stderr}`);
    // Как snippets/products-ssl.conf на машинах, только с самоподписанным сертификатом.
    fs.writeFileSync(path.join(root, 'snippets/products-ssl.conf'),
      `ssl_certificate ${root}/crt.pem;\nssl_certificate_key ${root}/key.pem;\n` +
      'ssl_protocols TLSv1.2 TLSv1.3;\nssl_session_cache shared:SSL:10m;\n');
    const p80 = 30000 + (process.pid % 10000);
    const p443 = p80 + 1;
    const wrapper = path.join(root, 'nginx-t');
    fs.writeFileSync(wrapper, [
      '#!/bin/sh',
      `rm -f "${root}/shadow/"*.conf`,
      `for f in "${root}/conf/"*.conf; do`,
      '  [ -e "$f" ] || continue',
      `  sed -e 's/listen 80;/listen 127.0.0.1:${p80};/' -e 's/listen 443 ssl;/listen 127.0.0.1:${p443} ssl;/' "$f" > "${root}/shadow/$(basename "$f")"`,
      'done',
      `exec ${NGINX} -t -p "${root}/" -c "${root}/nginx.conf" -e "${root}/error.log"`,
      '',
    ].join('\n'), { mode: 0o755 });
    nginxBin = wrapper;
  }
  const bucket = (size: number | null) => fs.writeFileSync(path.join(root, 'nginx.conf'), [
    `pid ${root}/nginx.pid;`,
    `error_log ${root}/error.log;`,
    'events {}',
    'http {',
    size ? `  server_names_hash_bucket_size ${size};` : '',
    `  client_body_temp_path ${root}/tmp/body; proxy_temp_path ${root}/tmp/proxy; fastcgi_temp_path ${root}/tmp/fcgi;`,
    `  uwsgi_temp_path ${root}/tmp/uwsgi; scgi_temp_path ${root}/tmp/scgi; access_log off;`,
    `  include ${root}/shadow/*.conf;`,
    '}',
    '',
  ].join('\n'));
  bucket(null); // как на машинах до PHASE 4 этой задачи: корзина по умолчанию, 64
  const env = {
    ...process.env,
    PV_CONF_DIR: path.join(root, 'conf'),
    PV_LE_LIVE: path.join(root, 'live'),
    PV_ACME_ROOT: path.join(root, 'acme'),
    PV_ASLEEP_DIR: path.join(root, 'share'),
    PV_NGINX: nginxBin,
    PV_RELOAD: 'true',
  };
  return {
    root,
    bucket,
    run: (...args) => {
      const r = spawnSync('sh', [SCRIPT, ...args], { env, encoding: 'utf8' });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    },
    conf: (slug) => fs.readFileSync(path.join(root, 'conf', `${slug}.conf`), 'utf8'),
    confs: () => fs.readdirSync(path.join(root, 'conf')),
    cert: (slug) => {
      const d = path.join(root, 'live', `linkeon-${slug}`);
      fs.mkdirSync(d, { recursive: true });
      const src = (f: string) => (realNginx ? fs.readFileSync(path.join(root, f)) : 'x');
      fs.writeFileSync(path.join(d, 'fullchain.pem'), src('crt.pem'));
      fs.writeFileSync(path.join(d, 'privkey.pem'), src('key.pem'));
    },
  };
}

const count = (text: string, re: RegExp) => (text.match(new RegExp(re.source, 'g')) ?? []).length;
const LONG = `${'a'.repeat(55)}.com`; // 59 знаков: больше 46, меньше 100

(HAVE_NGINX ? describe : describe.skip)('product-vhost с настоящим nginx -t', () => {
  jest.setTimeout(30_000);

  it('без --domain — прежние два блока', () => {
    const s = sandbox(true);
    expect(s.run('shop', '8001')).toMatchObject({ status: 0 });
    const c = s.conf('shop');
    expect(count(c, /listen 80;/)).toBe(1);
    expect(count(c, /listen 443 ssl;/)).toBe(1);
    expect(c).not.toMatch(/acme-challenge/);
  });

  it('свой домен без сертификата: только порт 80 с путём Let’s Encrypt и страницей «подключается»', () => {
    const s = sandbox(true);
    expect(s.run('shop', '8001', '--domain', 'a.ru', '--domain', 'www.a.ru')).toMatchObject({ status: 0 });
    const c = s.conf('shop');
    expect(count(c, /acme-challenge/)).toBe(2);
    expect(c).toMatch(/connecting\.html/);
    expect(count(c, /listen 443 ssl;/)).toBe(1); // только основной адрес
  });

  it('с сертификатом: блок 443 у каждого имени, тот же прокси, путь для продления остаётся', () => {
    const s = sandbox(true);
    s.cert('shop');
    expect(s.run('shop', '8001', '--domain', 'a.ru', '--domain', 'www.a.ru')).toMatchObject({ status: 0 });
    const c = s.conf('shop');
    expect(count(c, /listen 443 ssl;/)).toBe(3);
    expect(c).toMatch(/server_name www\.a\.ru;[\s\S]*?ssl_certificate\s+\S*linkeon-shop\/fullchain\.pem/);
    expect(count(c, /proxy_pass http:\/\/127\.0\.0\.1:8001;/)).toBe(3);
    expect(count(c, /acme-challenge/)).toBe(2);
  });

  // Главное свойство варианта А: заглушка ложится на свой домен сама.
  it('спящий продукт: на своём домене заглушка, а не прокси', () => {
    const s = sandbox(true);
    s.cert('shop');
    expect(s.run('shop', '--asleep', '--domain', 'a.ru')).toMatchObject({ status: 0 });
    const c = s.conf('shop');
    expect(c).not.toMatch(/proxy_pass/);
    expect(count(c, /return 503;/)).toBe(2);
  });

  // Новый конфиг, не прошедший `nginx -t`, не остаётся на диске: иначе падал
  // бы `nginx -t` всей машины, и ни один продукт больше не перечитывался.
  it('красный nginx -t: прежний файл возвращается байт в байт, выход ненулевой', () => {
    const s = sandbox(true);
    expect(s.run('shop', '8001', '--domain', 'a.ru')).toMatchObject({ status: 0 });
    const before = s.conf('shop');
    expect(s.run('shop', '8001', '--domain', LONG).status).toBe(1);
    expect(s.conf('shop')).toBe(before);
  });

  it('красный nginx -t у нового продукта: файла не остаётся', () => {
    const s = sandbox(true);
    expect(s.run('fresh', '8002', '--domain', LONG).status).toBe(1);
    expect(s.confs()).toEqual([]);
  });

  // Замер, ради которого PHASE 4 ставит корзину 128: при 64 не заводится
  // даже продукт со слагом из 34 знаков (34 + «.p.linkeon.io» = 47).
  it('корзина 64 не держит слаг из 34 знаков, корзина 128 держит и его, и длинный домен', () => {
    const s = sandbox(true);
    expect(s.run('a'.repeat(34), '8003').status).toBe(1);
    s.bucket(128);
    expect(s.run('a'.repeat(40), '8003')).toMatchObject({ status: 0 });
    expect(s.run('shop', '8001', '--domain', LONG)).toMatchObject({ status: 0 });
    expect(s.run('shop', '8001', '--domain', `${'a'.repeat(48)}.${'b'.repeat(48)}.ru`)).toMatchObject({ status: 0 });
  });
});

describe('product-vhost: разбор аргументов', () => {
  it('мусор в домене — отказ до записи файла', () => {
    const s = sandbox(false);
    for (const bad of ['a..ru', '-a.ru', 'a-.ru', 'a.-ru', 'a.ru;', 'A.RU', 'nodot', '']) {
      expect({ bad, status: s.run('shop', '8001', '--domain', bad).status }).toEqual({ bad, status: 2 });
    }
    expect(s.confs()).toEqual([]);
  });

  it('имя длиннее 100 знаков — отказ, ровно 100 — нет', () => {
    const s = sandbox(false);
    const exact = `${'a'.repeat(48)}.${'b'.repeat(48)}.ru`;
    expect(s.run('shop', '8001', '--domain', `b${exact}`).status).toBe(2);
    expect(s.confs()).toEqual([]);
    expect(s.run('shop', '8001', '--domain', exact).status).toBe(0);
  });

  it('--domain без значения и непонятный хвост — отказ', () => {
    const s = sandbox(false);
    expect(s.run('shop', '8001', '--domain').status).toBe(2);
    expect(s.run('shop', '8001', '--foo', 'a.ru').status).toBe(2);
    expect(s.confs()).toEqual([]);
  });

  // Самопроверка PHASE 4 (ensure_product_vhost) требует rc=2 ровно на этом.
  it('прежние отказы на месте', () => {
    const s = sandbox(false);
    expect(s.run().status).toBe(2);
    expect(s.run('deploy-selfcheck', '--sleep').status).toBe(2);
    expect(s.run('-evil', '8001').status).toBe(2);
    expect(s.confs()).toEqual([]);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back/product-runner && source ~/.nvm/nvm.sh && npx jest product-vhost.script 2>&1 | grep -E "^(Tests:|Test Suites:)|✕"'
```

Ожидается: красные — скрипт не знает `--domain`, `PV_*` и отката.

- [ ] **Step 3: Переписать скрипт**

`spirits_back/scripts/product-vhost` заменить целиком:

```sh
#!/bin/sh
# product-vhost <slug> <порт|--asleep> [--domain <имя>]... — заводит vhost
# продукта на хосте продуктов.
#
#   product-vhost shop 8001                     боевой режим: домен проксирует на контейнер
#   product-vhost shop --asleep                 заглушка: продукт спит, аренда не оплачена
#   product-vhost shop 8001 --domain a.ru --domain www.a.ru
#                                               то же плюс свои домены продукта
#
# ВЕРСИОНИРУЕТСЯ ЗДЕСЬ, СТАВИТСЯ НА ХОСТ РУКАМИ. До 16.09.2026 скрипт
# существовал ТОЛЬКО в /usr/local/bin/product-vhost на 139.59.210.42 и не был
# в репозитории ни в каком виде. Это ровно та форма, из-за которой в этом
# проекте уже молча отставала копия file-agent на релее: правка на машине
# видна одному человеку и теряется при пересоздании машины.
#
# Живая редакция прочитана целиком перед правкой (16.09.2026). Ниже —
# построчно она же плюс --asleep. Расхождения с живой на момент снятия: нет.
#
# ЧТО ЗДЕСЬ ОПАСНО И ПОЧЕМУ НАПИСАНО ИМЕННО ТАК:
#
#   1. Битый файл в sites-products роняет `nginx -t` для ВСЕГО хоста: ни один
#      другой продукт больше не перечитается, и продление сертификата тоже.
#      Прежняя редакция на `product-vhost shop --asleep` подставила бы
#      `--asleep` в proxy_pass и сделала бы ровно это. Поэтому, во-первых, все
#      аргументы разбираются ЯВНО и всё непонятое отбивается ДО первой записи,
#      а во-вторых (с 24.09.2026) новый конфиг, не прошедший `nginx -t`,
#      ОТКАТЫВАЕТСЯ: прежний файл возвращается на место, а у нового продукта
#      файла не остаётся вовсе. Скрипт никогда не оставляет машину с
#      конфигом, который не проходит проверку.
#   2. `set -eu` и позиционные `$1`/`$2` — без проверки пустой аргумент дал бы
#      конфиг на server_name `.<зона>`, то есть домен второго уровня.
#   3. TLS основного адреса — из общего snippets/products-ssl.conf, сертификат
#      на продукт не выпускается. Поэтому ожидание при заведении и пробуждении —
#      это ожидание ПРИЛОЖЕНИЯ, а не сертификата.
#
# 503, А НЕ 502. Между погашенным контейнером и живым proxy_pass домен отдаёт
# 502, и посетитель читает его как нашу поломку. Спящий продукт — не поломка,
# а штатное состояние неоплаченного. Retry-After не ставим: когда владелец
# пополнит баланс, неизвестно, а врать роботам сроком не нужно.
#
# СВОИ ДОМЕНЫ (24.09.2026, спека custom-domain). `--domain <имя>` можно
# передать несколько раз. Каждое имя получает блоки в ЭТОМ ЖЕ файле: порт 80
# с путём /.well-known/acme-challenge/ (Let's Encrypt, HTTP-01) и, если
# сертификат linkeon-<слаг> уже на диске, порт 443 с ним и с тем же телом,
# что у основного адреса. Поэтому заглушки «спит» и «остановлен» ложатся на
# свой домен сами: скрипт переписывает весь файл при каждом переходе.
#
# Блок 443 своего имени пишется ТОЛЬКО при наличии файла сертификата: ссылка
# на отсутствующий файл роняет `nginx -t`. Путь для Let's Encrypt остаётся и
# при готовом сертификате — без него не пройдёт продление.
#
# ДЛИНА ИМЕНИ — НЕ БОЛЬШЕ 100 ЗНАКОВ. Замерено 24.09.2026 на nginx 1.24 при
# корзине server_names_hash_bucket_size по умолчанию (64): имя от 47 знаков
# роняет `nginx -t` всей машины. PHASE 4 ставит корзину 128 (потолок — 110
# знаков), 100 — с запасом.
#
# PV_* — пути и команды для теста (product-vhost.script.spec.ts). На машине
# не задаются.
set -eu

# Диапазоны `[a-z]` в `case` — по байтам, а не по локали: в UTF-8-локали у
# части оболочек `[a-z]` ловит и заглавные.
LC_ALL=C
export LC_ALL

# ЗОНА ДОМЕНОВ ЭТОЙ МАШИНЫ. Строка одна, и она же — единственное, чем копии
# скрипта на разных машинах отличаются друг от друга.
#
# Зона перестала быть общей вместе с реестром машин (кусок 4а): у каждой строки
# product_hosts своя `domain_suffix`, и сервер пишет продукту домен ИМЕННО из
# неё (products.domain). Зашитая здесь `p.linkeon.io` на второй машине разошлась
# бы с сервером МОЛЧА: сервер выписал бы продукту домен своей зоны, vhost встал
# бы на server_name чужой, проба promoteReady не нашла бы сайт никогда, и через
# десять минут сборщик зависших похоронил бы исправный продукт «по сроку».
#
# Поэтому значение сюда подставляет PHASE 4 deploy.sh — по строке реестра той
# машины, на которую ставит, и только в эту строку (подстановка обязана быть
# ровно одна, иначе фаза отказывается ставить). Ручной запуск скрипта из
# репозитория берёт зону машины владельца — ту, что была зашита раньше.
ZONE=p.linkeon.io

CONF_DIR="${PV_CONF_DIR:-/etc/nginx/sites-products}"
LE_LIVE="${PV_LE_LIVE:-/etc/letsencrypt/live}"
ACME_ROOT="${PV_ACME_ROOT:-/var/www/linkeon-acme}"
ASLEEP_DIR="${PV_ASLEEP_DIR:-/usr/share/linkeon}"
NGINX="${PV_NGINX:-nginx}"
RELOAD="${PV_RELOAD:-systemctl reload nginx}"

S="${1:-}"
P="${2:-}"

# Форма слага — та же, что у SLUG_RE на сервере и у копии в агенте: строчная
# латиница, цифры и дефис ВНУТРИ. Ведущий дефис отбивается отдельной веткой:
# он законен для `case`, но в аргументе программы разбирается как флаг, а имя
# отсюда уезжает и в имя файла конфига, и в server_name.
case "$S" in
  -* | *- ) echo "product-vhost: слаг не годится (дефис по краям): '$S'" >&2; exit 2 ;;
  '' | *[!a-z0-9-]* ) echo "product-vhost: слаг не годится: '$S'" >&2; exit 2 ;;
esac

case "$P" in
  --asleep) ;;
  '' | *[!0-9]* ) echo "product-vhost: второй аргумент — порт или --asleep, получено: '$P'" >&2; exit 2 ;;
esac

if [ $# -ge 2 ]; then shift 2; else shift $#; fi

# Свои имена. Форма — та же, что у vhostArgv в агенте: метки [a-z0-9-], минимум
# две, без дефиса по краям и без пустых меток. Разбираются ДО первой записи.
DOMAINS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --domain)
      D="${2:-}"
      case "$D" in
        '' | .* | *. | *..* | -* | *-.* | *.-* | *- | *[!a-z0-9.-]* )
          echo "product-vhost: домен не годится: '$D'" >&2; exit 2 ;;
      esac
      case "$D" in
        *.*) ;;
        *) echo "product-vhost: домен без зоны: '$D'" >&2; exit 2 ;;
      esac
      if [ "${#D}" -gt 100 ]; then
        echo "product-vhost: домен длиннее 100 знаков: '$D'" >&2; exit 2
      fi
      DOMAINS="$DOMAINS $D"
      shift 2
      ;;
    *) echo "product-vhost: непонятный аргумент: '$1'" >&2; exit 2 ;;
  esac
done

CONF="$CONF_DIR/$S.conf"
CERT="$LE_LIVE/linkeon-$S"

mkdir -p "$ASLEEP_DIR"

if [ "$P" = "--asleep" ]; then
  # Страница заводится здесь же: без неё nginx отдаст свой собственный 503 без
  # единого слова о том, что делать. Перезаписывается при каждом вызове —
  # тогда правка текста доезжает выкатом скрипта, а не отдельным ритуалом.
  cat > "$ASLEEP_DIR/asleep.html" <<'HTML'
<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Продукт временно недоступен</title>
<style>
 body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;
      min-height:100vh;color:#1b1b1f;background:#f6f6f8;padding:24px}
 main{max-width:34rem;text-align:center}
 h1{font-size:1.4rem;margin:0 0 .6em}
 p{margin:0 0 .6em;color:#4a4a55}
</style></head>
<body><main>
 <h1>Продукт временно недоступен</h1>
 <p>Сайт приостановлен владельцем. Данные и содержимое сохранены.</p>
 <p>Если это ваш продукт — пополните баланс в личном кабинете Linkeon,
    и он поднимется автоматически.</p>
</main></body></html>
HTML
  BODY="  location / {
    return 503;
    error_page 503 /asleep.html;
  }
  location = /asleep.html {
    root $ASLEEP_DIR;
    internal;
  }"
  WHAT="заглушка 503"
else
  BODY="  location / {
    proxy_pass http://127.0.0.1:$P;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }"
  WHAT="127.0.0.1:$P"
fi

if [ -n "$DOMAINS" ]; then
  cat > "$ASLEEP_DIR/connecting.html" <<'HTML'
<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Домен подключается</title>
<style>
 body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;
      min-height:100vh;color:#1b1b1f;background:#f6f6f8;padding:24px}
 main{max-width:34rem;text-align:center}
 h1{font-size:1.4rem;margin:0 0 .6em}
 p{margin:0;color:#4a4a55}
</style></head>
<body><main>
 <h1>Домен подключается</h1>
 <p>Выпускаем сертификат. Обычно это занимает меньше минуты.</p>
</main></body></html>
HTML
fi

# Прежний файл — в сторону, в mktemp, а НЕ рядом: всё, что лежит в
# sites-products и кончается на .conf, nginx читает как конфиг.
PREV=""
if [ -f "$CONF" ]; then
  PREV=$(mktemp)
  cp "$CONF" "$PREV"
fi

{
  cat <<CONF
server {
  listen 80;
  server_name $S.$ZONE;
  return 301 https://\$host\$request_uri;
}
server {
  listen 443 ssl;
  server_name $S.$ZONE;
  include snippets/products-ssl.conf;
$BODY
}
CONF
  for D in $DOMAINS; do
    if [ -f "$CERT/fullchain.pem" ]; then
      cat <<CONF
server {
  listen 80;
  server_name $D;
  location /.well-known/acme-challenge/ { root $ACME_ROOT; }
  location / { return 301 https://\$host\$request_uri; }
}
server {
  listen 443 ssl;
  server_name $D;
  ssl_certificate     $CERT/fullchain.pem;
  ssl_certificate_key $CERT/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_cache shared:SSL:10m;
$BODY
}
CONF
    else
      cat <<CONF
server {
  listen 80;
  server_name $D;
  location /.well-known/acme-challenge/ { root $ACME_ROOT; }
  location / {
    return 503;
    error_page 503 /connecting.html;
  }
  location = /connecting.html {
    root $ASLEEP_DIR;
    internal;
  }
}
CONF
    fi
  done
} > "$CONF"

if "$NGINX" -t >/dev/null 2>&1; then
  if [ -n "$PREV" ]; then rm -f "$PREV"; fi
  $RELOAD
  echo "  vhost $S.$ZONE → $WHAT${DOMAINS:+ (+$DOMAINS)}"
else
  if [ -n "$PREV" ]; then
    cat "$PREV" > "$CONF"
    rm -f "$PREV"
  else
    rm -f "$CONF"
  fi
  echo "product-vhost: новый конфиг $S не прошёл nginx -t — прежний возвращён, nginx не перечитан" >&2
  exit 1
fi
```

- [ ] **Step 4: Прогнать тест и синтаксис**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && sh -n scripts/product-vhost && echo SH_OK; grep -c "^ZONE=" scripts/product-vhost; test -x /usr/sbin/nginx && echo NGINX_HERE; cd product-runner && source ~/.nvm/nvm.sh && npx jest product-vhost.script 2>&1 | grep -E "^(Tests:|Test Suites:)|✕"'
```

Ожидается: `SH_OK`, `1`, `NGINX_HERE`, `Tests: 11 passed` — **0 skipped**. Если `skipped` — прогон без nginx, ничего не проверено.

- [ ] **Step 5: Мутации**

- (а) писать 443 своего имени без проверки `-f "$CERT/fullchain.pem"` — ждём красный «без сертификата: только порт 80» (настоящий `nginx -t` откажет на несуществующем файле, откат вернёт rc 1);
- (б) в ветке с сертификатом убрать `location /.well-known/acme-challenge/` — ждём красный «путь для продления остаётся»;
- (в) разбирать `--domain` после записи файла — ждём красный «мусор в домене — отказ до записи»;
- (г) убрать откат (ветку `else` после `nginx -t`) — ждём красные «прежний файл возвращается» и «файла не остаётся».

- [ ] **Step 6: Коммит**

```bash
git add scripts/product-vhost product-runner/src/host/product-vhost.script.spec.ts
git commit -m "feat(host): product-vhost пишет свои домены и откатывает конфиг, не прошедший nginx -t"
```

---

### Task 13: PHASE 4 — корзина имён, каталог ACME и хук продления

**Files:**
- Create: `spirits_back/scripts/linkeon-reload-nginx`
- Create: `spirits_back/scripts/linkeon-products-nginx.conf`
- Modify: `spirits_back/scripts/deploy.sh`

⚠️ Перед правкой: `pgrep -fl deploy.sh` пуст. Bash дочитывает скрипт с диска, и правка ломает идущий прогон.

- [ ] **Step 1: Хук продления**

`spirits_back/scripts/linkeon-reload-nginx`:

```sh
#!/bin/sh
# Хук certbot (/etc/letsencrypt/renewal-hooks/deploy/): после продления
# любого сертификата перечитать nginx. Ставится PHASE 4 deploy.sh.
#
# Без него nginx держит в памяти СТАРЫЙ сертификат до первой случайной
# перечитки. Найдено 24.09.2026: на обеих машинах продуктов каталоги
# renewal-hooks были пусты, и это касалось уже работающего wildcard
# *.p.linkeon.io — спасало лишь то, что nginx перечитывается при каждом сне
# и пробуждении продукта. На второй машине продуктов не было, и перечитывать
# там было некому.
#
# `nginx -t` впереди: битый конфиг на машине не должен превратиться в
# уронённый nginx из-за планового продления.
nginx -t && systemctl reload nginx
```

`chmod +x scripts/linkeon-reload-nginx`.

- [ ] **Step 2: Корзина имён**

`spirits_back/scripts/linkeon-products-nginx.conf`:

```nginx
# Ставится PHASE 4 deploy.sh в /etc/nginx/conf.d/linkeon-products.conf на
# каждой машине продуктов. Руками не править — следующий выкат вернёт как было.
#
# Корзина хеша имён server_name. Замерено 24.09.2026 на nginx 1.24 этих машин:
# при умолчании (64 — размер строки кэша) имя от 47 знаков роняет `nginx -t`
# ВСЕЙ машины. Это задевает и сегодняшние продукты: слаг до 40 знаков плюс
# «.p.linkeon.io» — до 53 знаков. 128 держит имена до 110 знаков; свои домены
# ограничены 100 (normalizeDomain, product-vhost).
server_names_hash_bucket_size 128;
```

- [ ] **Step 3: Функция PHASE 4**

В `scripts/deploy.sh` сразу после функции `ensure_product_vhost()` добавить:

```bash
# Nginx машины под свои домены продуктов: корзина имён, каталог для HTTP-01 и
# хук, перечитывающий nginx после продления сертификатов.
#
# КОРЗИНА. Замерено 24.09.2026 на nginx 1.24 этих машин: при
# server_names_hash_bucket_size по умолчанию (64) имя от 47 знаков роняет
# `nginx -t` всей машины. Это задевает и сегодняшние продукты: слаг до 40
# знаков плюс «.p.linkeon.io» — до 53. Корзина 128 держит имена до 110.
#
# ХУК. Каталоги renewal-hooks на машинах были пусты: продлённый wildcard nginx
# держал бы в памяти старым до первой случайной перечитки.
#
# Всё идемпотентно: сверка по sha, запись только при расхождении. Конфиг
# корзины ставится с проверкой: `nginx -t` красный — прежнее состояние
# возвращается, nginx не перечитывается, фаза красная.
ensure_nginx_domains() {
  local conf_src="$PH_SRC_DIR/scripts/linkeon-products-nginx.conf"
  local hook_src="$PH_SRC_DIR/scripts/linkeon-reload-nginx"
  local conf_dst=/etc/nginx/conf.d/linkeon-products.conf
  local hook_dst=/etc/letsencrypt/renewal-hooks/deploy/linkeon-reload-nginx
  bold "[машина $PH_ID 3/5] nginx под свои домены: корзина имён, каталог ACME, хук продления"

  local f
  for f in "$conf_src" "$hook_src"; do
    if [[ ! -f "$f" ]]; then
      red "  ✗ в выкладке прод-коммита ${PH_PROD_SHA:0:8} нет ${f#"$PH_SRC_DIR"/}"
      return 1
    fi
  done

  local want_conf want_hook state have_conf have_hook acme
  want_conf=$(sha256_local "$conf_src")
  want_hook=$(sha256_local "$hook_src")
  state=$(ssh_remote "
    set -uo pipefail
    echo CONF=\$($PH_SUDO sha256sum $conf_dst 2>/dev/null | cut -d' ' -f1)
    echo HOOK=\$($PH_SUDO sha256sum $hook_dst 2>/dev/null | cut -d' ' -f1)
    if [ -d /var/www/linkeon-acme/.well-known/acme-challenge ]; then echo ACME=ok; else echo ACME=нет; fi
  ") || { red "  ✗ не смог опросить $PH_TARGET"; return 1; }
  have_conf=$(sed -n 's/^CONF=//p' <<<"$state" | tail -1)
  have_hook=$(sed -n 's/^HOOK=//p' <<<"$state" | tail -1)
  acme=$(sed -n 's/^ACME=//p' <<<"$state" | tail -1)

  if [[ "$have_conf" == "$want_conf" && "$have_hook" == "$want_hook" && "$acme" == "ok" ]]; then
    green "  ✓ корзина, каталог ACME и хук совпадают с прод-коммитом ${PH_PROD_SHA:0:8}"
    return 0
  fi
  [[ "$have_conf" == "$want_conf" ]] || red "  ! конфиг корзины расходится с прод-коммитом (машина: ${have_conf:-нет файла})"
  [[ "$have_hook" == "$want_hook" ]] || red "  ! хук продления расходится с прод-коммитом (машина: ${have_hook:-нет файла})"
  [[ "$acme" == "ok" ]] || red "  ! нет каталога /var/www/linkeon-acme"
  if [[ -n "${PH_CHECK_ONLY:-}" ]]; then
    red "  ✗ режим проверки (PRODUCTS_HOST_CHECK_ONLY/SMOKE_ONLY) — не пишу ничего"
    return 1
  fi

  # base64 — в самом аргументе команды, а не через stdin: ssh_remote ретраит
  # команду при обрыве связи, и pipe на повторной попытке был бы уже пуст.
  local conf_b64 hook_b64 out
  conf_b64=$(base64 < "$conf_src" | tr -d '\r\n')
  hook_b64=$(base64 < "$hook_src" | tr -d '\r\n')
  out=$(ssh_remote "
    set -uo pipefail
    $PH_SUDO mkdir -p /var/www/linkeon-acme/.well-known/acme-challenge /etc/letsencrypt/renewal-hooks/deploy
    printf '%s' '$hook_b64' | base64 -d | $PH_SUDO tee $hook_dst >/dev/null
    $PH_SUDO chmod 755 $hook_dst
    $PH_SUDO sh -n $hook_dst || { echo NGD:HOOK_PARSE; exit 0; }
    PREV=\$(mktemp)
    if $PH_SUDO test -f $conf_dst; then $PH_SUDO cat $conf_dst > \"\$PREV\"; HAD=1; else HAD=0; fi
    printf '%s' '$conf_b64' | base64 -d | $PH_SUDO tee $conf_dst >/dev/null
    if $PH_SUDO nginx -t >/dev/null 2>&1; then
      if $PH_SUDO systemctl reload nginx; then echo NGD:OK; else echo NGD:RELOAD_FAIL; fi
    else
      if [ \"\$HAD\" = 1 ]; then $PH_SUDO tee $conf_dst < \"\$PREV\" >/dev/null; else $PH_SUDO rm -f $conf_dst; fi
      echo NGD:NGINX_RED
    fi
    rm -f \"\$PREV\"
  ") || { red "  ✗ не смог записать на $PH_TARGET"; return 1; }

  case "$(grep -o 'NGD:[A-Z_]*' <<<"$out" | tail -1)" in
    NGD:OK) ;;
    NGD:NGINX_RED)
      red "  ✗ с новой корзиной nginx -t красный — прежнее состояние возвращено, nginx не перечитан"
      return 1 ;;
    *)
      red "  ✗ установка не подтвердилась: $out"
      return 1 ;;
  esac

  state=$(ssh_remote "
    echo CONF=\$($PH_SUDO sha256sum $conf_dst | cut -d' ' -f1)
    echo HOOK=\$($PH_SUDO sha256sum $hook_dst | cut -d' ' -f1)
  ") || { red "  ✗ не смог перепроверить $PH_TARGET"; return 1; }
  if [[ "$(sed -n 's/^CONF=//p' <<<"$state" | tail -1)" != "$want_conf" \
     || "$(sed -n 's/^HOOK=//p' <<<"$state" | tail -1)" != "$want_hook" ]]; then
    red "  ✗ после установки sha не совпали с прод-коммитом"
    return 1
  fi
  green "  ✓ корзина 128, каталог ACME и хук продления стоят, nginx перечитан"
}
```

- [ ] **Step 4: Вызов, выкладка, нумерация**

- в `products_host_one` после строки `ensure_product_vhost || fails=$(( fails + 1 ))` добавить `ensure_nginx_domains || fails=$(( fails + 1 ))`;
- в `git archive --format=tar "$prod_sha" product-runner scripts/product-vhost` дописать `scripts/linkeon-reload-nginx scripts/linkeon-products-nginx.conf`, и в цикл `for part in …` — те же два пути;
- метки шагов машины переписать на пять: личность `1/5`, product-vhost `2/5`, nginx под свои домены `3/5`, агент `4/5`, образ `5/5`. Если в шапке PHASE 4 сказано «из 4 частей», заменить на «из 5».

```bash
grep -nE '\[машина \$PH_ID [0-9]/[0-9]\]' scripts/deploy.sh
```

Ожидается: пять меток, все `/5`, номера 1–5 без повторов.

- [ ] **Step 5: Проверить синтаксис**

```bash
bash -n scripts/deploy.sh && echo BASH_OK
sh -n scripts/linkeon-reload-nginx && echo HOOK_OK
command -v shellcheck >/dev/null && shellcheck -S warning scripts/deploy.sh | grep -c "^In " || true
```

Ожидается: `BASH_OK`, `HOOK_OK`, у shellcheck не больше замечаний, чем на `origin/main` (сверить тем же прогоном по `git show origin/main:scripts/deploy.sh`).

- [ ] **Step 6: Коммит**

```bash
git add scripts/linkeon-reload-nginx scripts/linkeon-products-nginx.conf scripts/deploy.sh
git commit -m "feat(deploy): PHASE 4 ставит корзину имён nginx, каталог ACME и хук перечитывания после продления"
```

---

### Task 14: Кабинет — вызовы API и адрес сайта

**Files:**
- Modify: `spirits_front/src/services/productsApi.ts`
- Modify: `spirits_front/src/services/productsApi.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `productsApi.test.ts`: в подмену `apiClient` добавить `delete: vi.fn(async () => ({ ok: true, json: async () => ({}) })),`, в импорт — `siteAddress`. Новые тесты:

```ts
describe('свой домен', () => {
  beforeEach(() => vi.clearAllMocks());

  it('состояние: GET /webhook/products/:id/domain, конверт { domain }', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(res({ ok: true, json: async () => ({ domain: null }) }));
    await expect(productsApi.getDomain('p-1')).resolves.toEqual({ ok: true, view: null });
    expect(apiClient.get).toHaveBeenCalledWith('/webhook/products/p-1/domain');
  });

  it('привязка: POST с { domain }', async () => {
    const view = { domain: 'a.ru', status: 'awaiting_dns' };
    vi.mocked(apiClient.post).mockResolvedValueOnce(res({ ok: true, json: async () => ({ domain: view }) }));
    await expect(productsApi.attachDomain('p-1', 'a.ru')).resolves.toEqual({ ok: true, view });
    expect(apiClient.post).toHaveBeenCalledWith('/webhook/products/p-1/domain', { domain: 'a.ru' });
  });

  it('проверка: POST /domain/check', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(res({ ok: true, json: async () => ({ domain: { status: 'issuing' } }) }));
    await productsApi.checkDomain('p-1');
    expect(apiClient.post).toHaveBeenCalledWith('/webhook/products/p-1/domain/check');
  });

  it('отвязка: DELETE', async () => {
    await expect(productsApi.detachDomain('p-1')).resolves.toEqual({ ok: true });
    expect(apiClient.delete).toHaveBeenCalledWith('/webhook/products/p-1/domain');
  });

  it('отказ сервера — Problem с кодом и текстом', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(
      res({ ok: false, status: 409, json: async () => ({ message: 'Этот домен уже привязан к другому продукту.' }) }),
    );
    await expect(productsApi.attachDomain('p-1', 'a.ru')).resolves.toEqual({
      ok: false, status: 409, message: 'Этот домен уже привязан к другому продукту.',
    });
  });

  it('обрыв сети — статус 0', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('network'));
    await expect(productsApi.attachDomain('p-1', 'a.ru')).resolves.toMatchObject({ ok: false, status: 0 });
  });

  it('адрес сайта: свой домен, когда работает, иначе адрес платформы', () => {
    expect(siteAddress({ domain: 'shop.p.linkeon.io', custom_domain: 'a.ru' })).toBe('a.ru');
    expect(siteAddress({ domain: 'shop.p.linkeon.io', custom_domain: null })).toBe('shop.p.linkeon.io');
    expect(siteAddress({ domain: null })).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && npx vitest run src/services/productsApi.test.ts 2>&1 | tail -6'
```

- [ ] **Step 3: Написать вызовы**

В `productsApi.ts`: в `interface Product` после `kind?: ProductKind;`:

```ts
  /**
   * Свой домен продукта — ТОЛЬКО работающий (сервер отдаёт NULL, пока
   * привязка в процессе). Главная ссылка карточки: см. siteAddress.
   */
  custom_domain?: string | null;
```

После типов `Problem`/`MutationResult`:

```ts
export type DomainStatus = 'awaiting_dns' | 'issuing' | 'active' | 'failed' | 'removing';

export interface DomainRecordCheck {
  type: 'TXT' | 'A' | 'AAAA';
  name: string;
  ok: boolean;
  current: string[];
  want: string;
}

export interface DomainRecordToSet {
  type: 'TXT' | 'A' | 'CNAME';
  name: string;
  fqdn: string;
  value: string;
}

export interface DomainView {
  domain: string;
  names: string[];
  status: DomainStatus;
  error: string | null;
  checkedAt: string | null;
  check: DomainRecordCheck[] | null;
  records: DomainRecordToSet[];
}

export type DomainResult = { ok: true; view: DomainView | null } | Problem;

/**
 * Адрес сайта, который показывать владельцу: свой домен, когда он работает,
 * иначе адрес платформы.
 */
export function siteAddress(p: Pick<Product, 'domain' | 'custom_domain'>): string | null {
  return p.custom_domain || p.domain || null;
}
```

Над объектом `productsApi`:

```ts
/** Общий разбор ответов ручек своего домена: конверт { domain }, обрыв — статус 0. */
async function domainCall(send: () => Promise<Response>): Promise<DomainResult> {
  let res: Response;
  try {
    res = await send();
  } catch {
    return { ok: false, status: 0, message: '' };
  }
  if (!res.ok) return problem(res);
  const body = (await res.json().catch(() => null)) as { domain?: DomainView | null } | null;
  return { ok: true, view: body?.domain ?? null };
}
```

В объект `productsApi`:

```ts
  async getDomain(productId: string): Promise<DomainResult> {
    return domainCall(() => apiClient.get(`/webhook/products/${enc(productId)}/domain`));
  },

  async attachDomain(productId: string, domain: string): Promise<DomainResult> {
    return domainCall(() => apiClient.post(`/webhook/products/${enc(productId)}/domain`, { domain }));
  },

  async checkDomain(productId: string): Promise<DomainResult> {
    return domainCall(() => apiClient.post(`/webhook/products/${enc(productId)}/domain/check`));
  },

  async detachDomain(productId: string): Promise<MutationResult> {
    let res: Response;
    try {
      res = await apiClient.delete(`/webhook/products/${enc(productId)}/domain`);
    } catch {
      return { ok: false, status: 0, message: '' };
    }
    if (!res.ok) return problem(res);
    return { ok: true };
  },
```

- [ ] **Step 4: Прогнать тест и типы**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && npx vitest run src/services/productsApi.test.ts 2>&1 | tail -4 && npx tsc --noEmit -p tsconfig.app.json && echo TSC_OK'
```

- [ ] **Step 5: Коммит**

```bash
git add src/services/productsApi.ts src/services/productsApi.test.ts
git commit -m "feat(products): кабинет — вызовы своего домена и адрес сайта"
```

---

### Task 15: Кабинет — блок «Свой домен» и главная ссылка

**Files:**
- Create: `spirits_front/src/components/products/CustomDomain.tsx`
- Create: `spirits_front/src/components/products/CustomDomain.test.tsx`
- Modify: `spirits_front/src/components/products/ProductsListView.tsx`, `ProductsListView.test.tsx`
- Modify: `spirits_front/src/components/products/ProductsSection.tsx`
- Modify: `spirits_front/src/i18n/locales/{ru,en,de,es,fr,pt,zh}.json`

- [ ] **Step 1: Ключи локалей**

В каждый из семи файлов в объект `products` добавить объект `domain`.

`ru.json` (источник правды):

```json
"domain": {
  "title": "Свой домен",
  "label": "Домен",
  "placeholder": "например, mysite.ru",
  "attach": "Привязать",
  "attaching": "Привязываем…",
  "free": "Бесплатно, входит в аренду.",
  "status": {
    "awaiting_dns": "Ждём изменения DNS",
    "issuing": "Выпускаем сертификат…",
    "active": "Работает",
    "failed": "Не получилось",
    "removing": "Отвязываем…"
  },
  "recordsIntro": "Создайте у регистратора домена эти записи:",
  "colType": "Тип",
  "colName": "Имя",
  "colValue": "Значение",
  "copy": "скопировать",
  "deleteOthers": "Удалите у этих имён остальные A-записи и все AAAA-записи — иначе сертификат не выпустится.",
  "oldSite": "После смены записей сайт на старом хостинге по этому домену открываться перестанет.",
  "propagation": "Изменения DNS расходятся от 15 минут до суток — мы проверяем сами каждые пару минут.",
  "lastCheck": "Последняя проверка:",
  "checkOk": "в порядке",
  "checkMissing": "записи нет",
  "checkNeed": "сейчас {{current}}, нужно {{want}}",
  "checkAaaa": "есть AAAA: {{current}} — удалите",
  "checkNow": "Проверить сейчас",
  "checkAgain": "Проверить снова",
  "detach": "Отвязать",
  "errors": {
    "network": "Нет связи с сервером — попробуйте ещё раз.",
    "generic": "Не получилось — попробуйте ещё раз."
  }
}
```

`en.json`:

```json
"domain": {
  "title": "Custom domain",
  "label": "Domain",
  "placeholder": "e.g. mysite.com",
  "attach": "Connect",
  "attaching": "Connecting…",
  "free": "Free, included in the rent.",
  "status": {
    "awaiting_dns": "Waiting for DNS changes",
    "issuing": "Issuing a certificate…",
    "active": "Live",
    "failed": "Didn't work",
    "removing": "Disconnecting…"
  },
  "recordsIntro": "Create these records at your domain registrar:",
  "colType": "Type",
  "colName": "Name",
  "colValue": "Value",
  "copy": "copy",
  "deleteOthers": "Remove all other A records and all AAAA records for these names — otherwise the certificate can't be issued.",
  "oldSite": "Once the records change, the site at your old hosting will stop opening on this domain.",
  "propagation": "DNS changes take from 15 minutes to a day to spread — we check automatically every couple of minutes.",
  "lastCheck": "Last check:",
  "checkOk": "OK",
  "checkMissing": "no record",
  "checkNeed": "now {{current}}, needs {{want}}",
  "checkAaaa": "AAAA present: {{current}} — remove it",
  "checkNow": "Check now",
  "checkAgain": "Try again",
  "detach": "Disconnect",
  "errors": {
    "network": "No connection to the server — please try again.",
    "generic": "That didn't work — please try again."
  }
}
```

`de.json` (на «ты», как остальной кабинет):

```json
"domain": {
  "title": "Eigene Domain",
  "label": "Domain",
  "placeholder": "z. B. meineseite.de",
  "attach": "Verbinden",
  "attaching": "Wird verbunden…",
  "free": "Kostenlos, in der Miete enthalten.",
  "status": {
    "awaiting_dns": "Warten auf DNS-Änderungen",
    "issuing": "Zertifikat wird ausgestellt…",
    "active": "Aktiv",
    "failed": "Hat nicht geklappt",
    "removing": "Wird getrennt…"
  },
  "recordsIntro": "Lege diese Einträge bei deinem Domain-Registrar an:",
  "colType": "Typ",
  "colName": "Name",
  "colValue": "Wert",
  "copy": "kopieren",
  "deleteOthers": "Lösche für diese Namen alle anderen A-Einträge und alle AAAA-Einträge — sonst kann das Zertifikat nicht ausgestellt werden.",
  "oldSite": "Sobald die Einträge geändert sind, ist die Seite beim alten Hoster unter dieser Domain nicht mehr erreichbar.",
  "propagation": "DNS-Änderungen brauchen 15 Minuten bis einen Tag — wir prüfen alle paar Minuten automatisch.",
  "lastCheck": "Letzte Prüfung:",
  "checkOk": "in Ordnung",
  "checkMissing": "kein Eintrag",
  "checkNeed": "jetzt {{current}}, nötig {{want}}",
  "checkAaaa": "AAAA vorhanden: {{current}} — bitte löschen",
  "checkNow": "Jetzt prüfen",
  "checkAgain": "Erneut prüfen",
  "detach": "Trennen",
  "errors": {
    "network": "Keine Verbindung zum Server — versuch es noch einmal.",
    "generic": "Hat nicht geklappt — versuch es noch einmal."
  }
}
```

`es.json` (на «tú»):

```json
"domain": {
  "title": "Dominio propio",
  "label": "Dominio",
  "placeholder": "p. ej., misitio.es",
  "attach": "Conectar",
  "attaching": "Conectando…",
  "free": "Gratis, incluido en el alquiler.",
  "status": {
    "awaiting_dns": "Esperando cambios de DNS",
    "issuing": "Emitiendo el certificado…",
    "active": "Activo",
    "failed": "No se pudo",
    "removing": "Desconectando…"
  },
  "recordsIntro": "Crea estos registros en el registrador de tu dominio:",
  "colType": "Tipo",
  "colName": "Nombre",
  "colValue": "Valor",
  "copy": "copiar",
  "deleteOthers": "Elimina los demás registros A y todos los AAAA de estos nombres; si no, no se podrá emitir el certificado.",
  "oldSite": "Cuando cambies los registros, el sitio del hosting anterior dejará de abrirse con este dominio.",
  "propagation": "Los cambios de DNS tardan de 15 minutos a un día en propagarse; lo comprobamos solos cada par de minutos.",
  "lastCheck": "Última comprobación:",
  "checkOk": "correcto",
  "checkMissing": "no hay registro",
  "checkNeed": "ahora {{current}}, debe ser {{want}}",
  "checkAaaa": "hay AAAA: {{current}} — elimínalo",
  "checkNow": "Comprobar ahora",
  "checkAgain": "Volver a comprobar",
  "detach": "Desconectar",
  "errors": {
    "network": "Sin conexión con el servidor; inténtalo de nuevo.",
    "generic": "No se pudo; inténtalo de nuevo."
  }
}
```

`fr.json` (на «vous»):

```json
"domain": {
  "title": "Domaine personnalisé",
  "label": "Domaine",
  "placeholder": "p. ex. monsite.fr",
  "attach": "Connecter",
  "attaching": "Connexion…",
  "free": "Gratuit, inclus dans la location.",
  "status": {
    "awaiting_dns": "En attente des modifications DNS",
    "issuing": "Émission du certificat…",
    "active": "Actif",
    "failed": "Échec",
    "removing": "Déconnexion…"
  },
  "recordsIntro": "Créez ces enregistrements chez le registraire de votre domaine :",
  "colType": "Type",
  "colName": "Nom",
  "colValue": "Valeur",
  "copy": "copier",
  "deleteOthers": "Supprimez les autres enregistrements A et tous les enregistrements AAAA de ces noms — sinon le certificat ne pourra pas être émis.",
  "oldSite": "Une fois les enregistrements modifiés, le site de l’ancien hébergeur ne s’ouvrira plus sur ce domaine.",
  "propagation": "Les modifications DNS se propagent en 15 minutes à une journée — nous vérifions automatiquement toutes les deux minutes.",
  "lastCheck": "Dernière vérification :",
  "checkOk": "OK",
  "checkMissing": "aucun enregistrement",
  "checkNeed": "actuellement {{current}}, attendu {{want}}",
  "checkAaaa": "AAAA présent : {{current}} — à supprimer",
  "checkNow": "Vérifier maintenant",
  "checkAgain": "Vérifier à nouveau",
  "detach": "Déconnecter",
  "errors": {
    "network": "Pas de connexion au serveur — réessayez.",
    "generic": "Cela n’a pas fonctionné — réessayez."
  }
}
```

`pt.json` (европейский португальский, как остальной кабинет):

```json
"domain": {
  "title": "Domínio próprio",
  "label": "Domínio",
  "placeholder": "ex.: meusite.pt",
  "attach": "Ligar",
  "attaching": "A ligar…",
  "free": "Grátis, incluído no aluguer.",
  "status": {
    "awaiting_dns": "À espera de alterações de DNS",
    "issuing": "A emitir o certificado…",
    "active": "Ativo",
    "failed": "Não resultou",
    "removing": "A desligar…"
  },
  "recordsIntro": "Crie estes registos no registador do seu domínio:",
  "colType": "Tipo",
  "colName": "Nome",
  "colValue": "Valor",
  "copy": "copiar",
  "deleteOthers": "Apague os outros registos A e todos os registos AAAA destes nomes — caso contrário, o certificado não poderá ser emitido.",
  "oldSite": "Depois de alterar os registos, o site no alojamento antigo deixará de abrir neste domínio.",
  "propagation": "As alterações de DNS demoram de 15 minutos a um dia a propagar-se — verificamos automaticamente a cada dois minutos.",
  "lastCheck": "Última verificação:",
  "checkOk": "ok",
  "checkMissing": "sem registo",
  "checkNeed": "agora {{current}}, deve ser {{want}}",
  "checkAaaa": "existe AAAA: {{current}} — apague",
  "checkNow": "Verificar agora",
  "checkAgain": "Verificar novamente",
  "detach": "Desligar",
  "errors": {
    "network": "Sem ligação ao servidor — tente novamente.",
    "generic": "Não resultou — tente novamente."
  }
}
```

`zh.json`:

```json
"domain": {
  "title": "自定义域名",
  "label": "域名",
  "placeholder": "例如 mysite.cn",
  "attach": "绑定",
  "attaching": "正在绑定…",
  "free": "免费，已包含在租金中。",
  "status": {
    "awaiting_dns": "等待 DNS 变更",
    "issuing": "正在签发证书…",
    "active": "已生效",
    "failed": "未成功",
    "removing": "正在解绑…"
  },
  "recordsIntro": "请在域名注册商处添加以下记录：",
  "colType": "类型",
  "colName": "名称",
  "colValue": "值",
  "copy": "复制",
  "deleteOthers": "请删除这些名称的其他 A 记录和所有 AAAA 记录，否则无法签发证书。",
  "oldSite": "记录更改后，旧主机上的网站将无法再通过此域名访问。",
  "propagation": "DNS 变更需要 15 分钟到一天才能生效——我们每隔几分钟自动检查一次。",
  "lastCheck": "上次检查：",
  "checkOk": "正常",
  "checkMissing": "无记录",
  "checkNeed": "当前为 {{current}}，应为 {{want}}",
  "checkAaaa": "存在 AAAA：{{current}}——请删除",
  "checkNow": "立即检查",
  "checkAgain": "重新检查",
  "detach": "解绑",
  "errors": {
    "network": "无法连接服务器，请重试。",
    "generic": "未成功，请重试。"
  }
}
```

- [ ] **Step 2: Написать падающие тесты**

`spirits_front/src/components/products/CustomDomain.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { byButton, clickAsync, flush, mount, type, visibleText } from '../../test/dom';
import { CustomDomain } from './CustomDomain';
import { productsApi } from '../../services/productsApi';
import type { DomainView, Product } from '../../services/productsApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

vi.mock('../../services/productsApi', () => ({
  productsApi: {
    getDomain: vi.fn(async () => ({ ok: true, view: null })),
    attachDomain: vi.fn(),
    checkDomain: vi.fn(),
    detachDomain: vi.fn(async () => ({ ok: true })),
  },
}));

const api = vi.mocked(productsApi);

const product = {
  id: 'p-1', name: 'Сайт визитка', slug: 'dmitryvolkov', status: 'running', kind: 'site',
  domain: 'dmitryvolkov.p.linkeon.io', runner_seen_at: null, created_at: '2026-09-24T10:00:00Z',
} as Product;

const awaiting: DomainView = {
  domain: 'dmitryvolkov.ru',
  names: ['dmitryvolkov.ru', 'www.dmitryvolkov.ru'],
  status: 'awaiting_dns',
  error: null,
  checkedAt: '2026-09-24T12:00:00Z',
  check: [
    { type: 'TXT', name: '_linkeon.dmitryvolkov.ru', ok: false, current: [], want: 'lk-abc' },
    { type: 'A', name: 'dmitryvolkov.ru', ok: false, current: ['90.156.201.49'], want: '139.59.210.42' },
    { type: 'AAAA', name: 'dmitryvolkov.ru', ok: false, current: ['2a00:15f8::1'], want: '' },
  ],
  records: [
    { type: 'TXT', name: '_linkeon', fqdn: '_linkeon.dmitryvolkov.ru', value: 'lk-abc' },
    { type: 'A', name: '@', fqdn: 'dmitryvolkov.ru', value: '139.59.210.42' },
    { type: 'CNAME', name: 'www', fqdn: 'www.dmitryvolkov.ru', value: 'dmitryvolkov.p.linkeon.io' },
  ],
};

describe('блок «Свой домен»', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDomain.mockResolvedValue({ ok: true, view: null });
  });

  it('без домена — поле и кнопка «Привязать»', async () => {
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    expect(byButton(container, /Привязать/)).not.toBeNull();
    expect(visibleText(container)).toMatch(/Бесплатно/);
  });

  it('привязка показывает таблицу записей и требование удалить AAAA', async () => {
    api.attachDomain.mockResolvedValueOnce({ ok: true, view: awaiting });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    type(container.querySelector('input')!, 'dmitryvolkov.ru');
    await clickAsync(byButton(container, /Привязать/)!);
    const text = visibleText(container);
    expect(api.attachDomain).toHaveBeenCalledWith('p-1', 'dmitryvolkov.ru');
    expect(text).toMatch(/lk-abc/);
    expect(text).toMatch(/139\.59\.210\.42/);
    expect(text).toMatch(/dmitryvolkov\.p\.linkeon\.io/);
    expect(text).toMatch(/все AAAA-записи/);
  });

  it('результат проверки: текущее и нужное значение', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: awaiting });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    const text = visibleText(container);
    expect(text).toMatch(/сейчас 90\.156\.201\.49, нужно 139\.59\.210\.42/);
    expect(text).toMatch(/есть AAAA: 2a00:15f8::1/);
  });

  it('отказ сервера виден текстом', async () => {
    api.attachDomain.mockResolvedValueOnce({ ok: false, status: 409, message: 'Этот домен уже привязан к другому продукту.' });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    type(container.querySelector('input')!, 'dmitryvolkov.ru');
    await clickAsync(byButton(container, /Привязать/)!);
    expect(visibleText(container)).toMatch(/другому продукту/);
  });

  it('обрыв сети — своё сообщение, а не пустота', async () => {
    api.attachDomain.mockResolvedValueOnce({ ok: false, status: 0, message: '' });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    type(container.querySelector('input')!, 'dmitryvolkov.ru');
    await clickAsync(byButton(container, /Привязать/)!);
    expect(visibleText(container)).toMatch(/Нет связи с сервером/);
  });

  it('работающий домен — ссылка https и «Отвязать»', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: { ...awaiting, status: 'active', check: null } });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    expect(container.querySelector('a[href="https://dmitryvolkov.ru"]')).not.toBeNull();
    expect(byButton(container, /Отвязать/)).not.toBeNull();
  });

  it('ошибка выпуска — текст и «Проверить снова»', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: { ...awaiting, status: 'failed', error: 'Challenge failed' } });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    expect(visibleText(container)).toMatch(/Challenge failed/);
    expect(byButton(container, /Проверить снова/)).not.toBeNull();
  });

  it('во время выпуска отвязать нельзя', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: { ...awaiting, status: 'issuing' } });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    expect(visibleText(container)).toMatch(/Выпускаем сертификат/);
    expect(byButton(container, /Отвязать/)).toBeNull();
  });
});
```

В `ProductsListView.test.tsx`: в подмену `productsApi` добавить `getDomain: vi.fn(async () => ({ ok: true, view: null })),` (карточки сайтов теперь спрашивают домен) и `siteAddress: (p: any) => p.custom_domain || p.domain || null,` (фабрика `vi.mock` подменяет модуль целиком). Новый тест:

```tsx
  it('работающий свой домен — главный адрес карточки', async () => {
    api.list.mockResolvedValue(listing([
      product({ kind: 'site', domain: 'my-shop.p.linkeon.io', custom_domain: 'dmitryvolkov.ru' }),
    ]));
    const { container } = mount(<ProductsListView onOpen={() => {}} />);
    await flush();
    const text = visibleText(container);
    expect(text).toMatch(/dmitryvolkov\.ru/);
    expect(text).not.toMatch(/my-shop\.p\.linkeon\.io/);
  });
```

- [ ] **Step 3: Убедиться, что тесты падают**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && npx vitest run src/components/products/ 2>&1 | tail -8'
```

- [ ] **Step 4: Написать компонент**

`spirits_front/src/components/products/CustomDomain.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { productsApi } from '../../services/productsApi';
import type { DomainRecordCheck, DomainView, Problem, Product } from '../../services/productsApi';

/** Пока домен в движении, обновляемся сами: DNS и выпуск идут без участия человека. */
const POLL_MS = 10_000;
const MOVING = new Set(['awaiting_dns', 'issuing', 'removing']);

const Check: React.FC<{ c: DomainRecordCheck }> = ({ c }) => {
  const { t } = useTranslation();
  const text = c.ok
    ? t('products.domain.checkOk')
    : c.type === 'AAAA'
      ? t('products.domain.checkAaaa', { current: c.current.join(', ') })
      : c.current.length
        ? t('products.domain.checkNeed', { current: c.current.join(', '), want: c.want })
        : t('products.domain.checkMissing');
  return (
    <li className={c.ok ? 'text-green-700' : 'text-amber-700'}>
      {c.type} {c.name}: {text}
    </li>
  );
};

export const CustomDomain: React.FC<{ product: Product }> = ({ product }) => {
  const { t } = useTranslation();
  const [view, setView] = useState<DomainView | null | undefined>(undefined);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = (p: Problem) =>
    p.status === 0 ? t('products.domain.errors.network') : p.message || t('products.domain.errors.generic');

  const load = useCallback(async () => {
    const r = await productsApi.getDomain(product.id);
    if (r.ok) setView(r.view);
  }, [product.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!view || !MOVING.has(view.status)) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [view, load]);

  const run = async (fn: () => Promise<{ ok: true; view?: DomainView | null } | Problem>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      setError(explain(r));
      return;
    }
    if ('view' in r) setView(r.view ?? null);
    else await load();
  };

  if (view === undefined) return null;

  return (
    <div className="px-4 pb-4 -mt-1">
      <div className="rounded-lg border border-gray-200 px-3 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Globe className="w-4 h-4 text-gray-400" />
          {t('products.domain.title')}
          {view && <span className="text-xs text-gray-500">— {t(`products.domain.status.${view.status}`)}</span>}
        </div>

        {!view && (
          <>
            <div className="mt-2 flex flex-col gap-2 md:flex-row">
              <label htmlFor={`domain-${product.id}`} className="sr-only">
                {t('products.domain.label')}
              </label>
              <input
                id={`domain-${product.id}`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('products.domain.placeholder')}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2"
              />
              <button
                onClick={() => run(() => productsApi.attachDomain(product.id, input))}
                disabled={busy || !input.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-60"
              >
                {busy ? t('products.domain.attaching') : t('products.domain.attach')}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">{t('products.domain.free')}</p>
          </>
        )}

        {view?.status === 'active' && (
          <a href={`https://${view.domain}`} target="_blank" rel="noopener noreferrer" className="mt-2 block text-indigo-600 break-all">
            https://{view.domain}
          </a>
        )}

        {view?.status === 'awaiting_dns' && (
          <div className="mt-2 space-y-2">
            <p>{t('products.domain.recordsIntro')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pr-2">{t('products.domain.colType')}</th>
                    <th className="pr-2">{t('products.domain.colName')}</th>
                    <th className="pr-2">{t('products.domain.colValue')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {view.records.map((r) => (
                    <tr key={`${r.type}-${r.fqdn}`}>
                      <td className="pr-2">{r.type}</td>
                      <td className="pr-2 font-mono">{r.name}</td>
                      <td className="pr-2 font-mono break-all">{r.value}</td>
                      <td>
                        <button onClick={() => void navigator.clipboard?.writeText(r.value)} className="text-indigo-600">
                          {t('products.domain.copy')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-amber-700">{t('products.domain.deleteOthers')}</p>
            <p className="text-gray-500">{t('products.domain.oldSite')}</p>
            <p className="text-gray-500">{t('products.domain.propagation')}</p>
            {view.check && (
              <div>
                <div className="text-xs text-gray-500">{t('products.domain.lastCheck')}</div>
                <ul className="text-xs">
                  {view.check.map((c) => (
                    <Check key={`${c.type}-${c.name}`} c={c} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {view?.status === 'failed' && view.error && (
          <div className="mt-2 max-h-32 overflow-y-auto rounded bg-red-50 border border-red-200 px-2 py-1 text-xs text-red-800 whitespace-pre-wrap break-words">
            {view.error}
          </div>
        )}

        {view && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(view.status === 'awaiting_dns' || view.status === 'failed') && (
              <button
                onClick={() => run(() => productsApi.checkDomain(product.id))}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-60"
              >
                {view.status === 'failed' ? t('products.domain.checkAgain') : t('products.domain.checkNow')}
              </button>
            )}
            {view.status !== 'issuing' && view.status !== 'removing' && (
              <button
                onClick={() => run(() => productsApi.detachDomain(product.id))}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-red-700 disabled:opacity-60"
              >
                {t('products.domain.detach')}
              </button>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-2 text-xs text-red-600 break-words">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Встроить в карточку и в открытый продукт**

`ProductsListView.tsx`:
- импорты `import { CustomDomain } from './CustomDomain';` и `siteAddress` из `../../services/productsApi`;
- в заголовке карточки строку `{p.domain && <div className="text-sm text-gray-500 truncate">{p.domain}</div>}` заменить на

```tsx
                      {siteAddress(p) && <div className="text-sm text-gray-500 truncate">{siteAddress(p)}</div>}
```

- после `{p.status === 'blocked' && <BlockedNote product={p} />}`:

```tsx
                {p.kind === 'site' && ['running', 'degraded', 'sleeping'].includes(p.status) && (
                  <CustomDomain product={p} />
                )}
```

`ProductsSection.tsx`: импорт `siteAddress`; блок ссылки (строки ~53–64) заменить на

```tsx
          {siteAddress(selected) && (
            // Ссылка, а не подпись: домен есть только у сайта, и добраться до
            // него — первое, что владелец хочет сделать с готовым продуктом.
            // Свой домен, когда он работает, — главный адрес.
            <a
              href={`https://${siteAddress(selected)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-forest-700 hover:underline mt-1 inline-block"
            >
              {siteAddress(selected)}
            </a>
          )}
```

- [ ] **Step 6: Прогнать тесты, типы и сверку локалей**

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && npx vitest run src/components/products/ src/services/ 2>&1 | tail -5 && npx tsc --noEmit -p tsconfig.app.json && echo TSC_OK'
cd ~/Downloads/spirits_front/.worktrees/custom-domain && python3 - <<'PY'
import json
def keys(d, p=''):
    out = set()
    for k, v in d.items():
        out |= keys(v, f'{p}{k}.') if isinstance(v, dict) else {f'{p}{k}'}
    return out
ru = keys(json.load(open('src/i18n/locales/ru.json'))['products']['domain'])
print('ru', len(ru))
for l in ['en', 'de', 'es', 'fr', 'pt', 'zh']:
    other = keys(json.load(open(f'src/i18n/locales/{l}.json'))['products']['domain'])
    print(l, 'совпадает' if other == ru else f'РАСХОДИТСЯ: нет {ru - other}, лишние {other - ru}')
PY
```

Ожидается: тесты зелёные, `TSC_OK`, `ru 30` и шесть строк «совпадает».

- [ ] **Step 7: Коммит**

```bash
git add src/components/products/ src/i18n/locales/
git commit -m "feat(products): кабинет — блок «Свой домен», работающий домен становится главным адресом, 7 языков"
```

---

### Task 16: Промпт релея

**Files:**
- Modify: `spirits_back/relay-agent/server.mjs` (`PRODUCTS_PROMPT`)

- [ ] **Step 1: Сверить копию с живым файлом**

```bash
ssh dv@5.101.115.184 'md5sum /home/dv/file-agent/server.mjs'
git -C ~/Downloads/spirits_back/.worktrees/custom-domain show origin/main:relay-agent/server.mjs | md5
```

Суммы обязаны совпасть (на 24.09.2026 — `dc0ead6e9ada955b87034859f67de7b9`). Разошлись — СТОП: сначала втянуть живой файл отдельным коммитом.

- [ ] **Step 2: Дописать строку**

В `PRODUCTS_PROMPT` после строки `- { action: "status", product или turnId } — узнать, чем кончилась правка.` добавить:

```
- { action: "domain", product, domain: "<домен пользователя>" } — привязать свой домен к сайту; { action: "domain", product } — узнать, как дела; { action: "domain", product, remove: true } — отвязать.
  Записи DNS из ответа называй ДОСЛОВНО и обязательно скажи удалить у этих имён остальные A-записи и ВСЕ AAAA. Не говори «домен работает», пока domain.status не "active". Свой домен бесплатный.
```

- [ ] **Step 3: Синтаксис**

```bash
cd ~/Downloads/spirits_back/.worktrees/custom-domain/relay-agent && cp server.mjs /private/tmp/claude-501/check-relay.mjs && node --check /private/tmp/claude-501/check-relay.mjs && echo SYNTAX_OK
```

- [ ] **Step 4: Коммит**

```bash
git add relay-agent/server.mjs
git commit -m "feat(relay): ассистент знает действие domain у инструмента продуктов"
```

---

### Task 17: Сводная батарея мутаций

Каждая мутация — временно, на ноде, без коммита, с возвратом. Засчитывается только красный **утверждением**, а не аварией. Контроль ДО и ПОСЛЕ: три числа (`passed`, `total`, `skipped`) по бэкенду, агенту и кабинету обязаны совпасть.

| № | Что ломаем | Ждём красным |
|---|---|---|
| 1 | `runCheck` зовёт `tryIssue` при любом результате проверки | новый тест: «чужой TXT — выпуска нет» — дописать в `domains.spec.ts` (DNS с A на нашу машину, TXT чужой → после `check` статус `awaiting_dns`) |
| 2 | индекс `product_domains_occupied` снят (DROP в тесте после миграций) | «гонка двух заявок» |
| 3 | `checkDns` допускает AAAA | «оставшаяся AAAA — не ok» |
| 4 | блок 443 без проверки сертификата | «без сертификата: только порт 80» (настоящий `nginx -t`) |
| 5 | при отвязке сертификат удаляется раньше конфига | «сначала конфиг без имён» |
| 6 | `sleepProduct` не передаёт имена | «сон передаёт свои имена» |
| 7 | `domainSay` говорит «работает» до `active` | «не называет домен работающим» |
| 8 | `tryIssue` двумя операторами | «перехода нет вовсе» |
| 9 | отвязка из `failed` удаляет строку сразу | «из failed — тоже через removing» |
| 10 | ветка `WHEN 'domain'` в `claimJob` снята | «выдаётся у работающего продукта» |
| 11 | `reconcileOrphans` не зовётся в `safeTick` | дописать тест: `safeTick` переводит сироту в `failed` |
| 12 | `wokenSql` без `j.kind <> 'domain'` | «не мешает переводу в running» |
| 13 | `tryIssue` без сверки статуса продукта | «погашенный продукт — выпуска нет» |
| 14 | `product-vhost` без отката | «прежний файл возвращается байт в байт» |
| 15 | агент без отката при отказе certbot | «отказ certbot: конфиг возвращается» |

Выжившую мутацию не чинить кодом — дописать тест и перемерить. Итог записать в этот план разделом «Батарея мутаций».

## Батарея мутаций (25.09.2026)

Бэкенд и агент — `feat/custom-domain` на `ba94a6d`, кабинет — `bad30d0`. Всё на ноде в CI-клонах `~/ci/cdom-back` и `~/ci/cdom-front`; каждая мутация — правка в клоне, прогон, `git checkout -- .`. Прогоны: бэкенд — `domain*`, `provisioning*`, `product-tool*`, `host*` из `src/products` (`--runInBand`, живой Postgres `pdom`); агент — `npx jest` целиком; кабинет — `vitest run src/components/products src/services`. Выжившие перемерены полным прогоном. Во всех 29 прогонах красное — утверждением: ни одной аварии набора, ни одной ошибки компиляции.

| № | Мутация | Чем поймана / выжила → какой тест добавлен |
|---|---|---|
| 1 | `domains.service.ts` `runCheck`: `if (result.ok && (expected …))` → `if ((expected …))` | 21 красный, в т.ч. «гонка двух заявок», «погашенный продукт — выпуска нет», «из awaiting_dns — строка удаляется сразу». Своего теста не было → **добавлен** «чужой TXT — выпуска нет: A на нашу машину, заявка остаётся в awaiting_dns» (`domains.spec.ts`; привязка, кнопка и фоновый оборот). Под мутацией красный: `Expected "awaiting_dns", Received "issuing"` |
| 2 | `DROP INDEX product_domains_occupied` в `beforeAll` `domains.spec.ts` после миграций | «гонка двух заявок: выпуск достаётся одной…», «отказ taken по коду сменённой заявки…», «failed, а домен уже занят другим продуктом…», «failed при занятом домене и встречном задании…» |
| 3 | `domain-dns.ts`: AAAA `ok: !aaaa.error && aaaa.values.length === 0` → `ok: !aaaa.error` | «оставшаяся AAAA — не ok» |
| 4 | `product-vhost`: `if [ -f "$CERT/fullchain.pem" ]` → `if true` (443 без сертификата) | «свой домен без сертификата: только порт 80…» (настоящий `nginx -t`), «красный nginx -t: прежний файл… байт в байт», «корзина 64…», «повтор имени — один блок…», «vhostArgv и product-vhost согласны…» |
| 5 | `domain.ts` (агент), отвязка: `certbot delete` раньше конфига без имён | «сначала конфиг без имён, потом удаление сертификата» |
| 6а | `sleep.ts` `sleepProduct`: имена → `[]` | «заглушка сна ложится и на свои имена», «мусорное имя — отказ сна ДО гашения контейнера» |
| 6б | `index.ts` (агент) `workFor`: выжимка сна без `customNames` | «свои имена задания доезжают до сна и до пробуждения», «хостовому шагу уезжают слаг, форма и порт…» |
| 7 | `product-tool.service.ts` `domainSay`: awaiting_dns и issuing идут веткой `active` | «привязка отдаёт записи для регистратора и не называет домен работающим», «“Домен работает” — только у active», «check: true проверяет DNS сейчас…», «ждущая заявка: …предложено проверить сейчас» |
| 8 | `tryIssue` двумя операторами: CTE `q` без INSERT, задание — отдельным `INSERT` после | «встречное задание в тот же миг — перехода нет вовсе…», «взаимоблокировка с гашением: выпуск — busy, перевод откатился» |
| 9 | `detach`: из `failed` сразу `DELETE` строки, `{ removed: 'now' }` | «из failed — тоже через removing и задание» и ещё 8 (отвязка failed при занятом домене, 40P01, отказ отвязки, уборка) |
| 10 | `provisioning.service.ts` `claimJob`: ветка `WHEN 'domain' THEN …` снята | 26 красных, в т.ч. «задание domain выдаётся у работающего продукта» |
| 11 | `safeTick`: `else await this.reconcileOrphans()` → `else await Promise.resolve(0)` | «сверка сирот — своим таймером и своим флагом: медленный DNS её не держит» — такт таймера сирот обязан перевести сироту в `failed`; тест уже был, дописывать не пришлось |
| 12 | `wokenSql` без `AND j.kind <> 'domain'` | «задание domain после пробуждения не мешает переводу в running», «проснувшийся, но ещё не переведённый — режим прокси» |
| 13 | `tryIssue` без `EXISTS (… p.status IN ISSUABLE)` | «погашенный продукт — выпуска нет, строка не тронута», «из failed у неработающего продукта — 409 not_ready», «из failed: продукт погасили, пока шла проверка, — 409 blocked» |
| 14 | `product-vhost`: `restore \|\| RESTORE_FAILED=1` → `true` (без отката) | «красный nginx -t: прежний файл возвращается байт в байт…» и ещё 5 (новый продукт, соседний конфиг, откат не удался ×2, права 644) |
| 15 | `domain.ts` (агент): при отказе certbot `rollback(…)` → `undefined` | «отказ certbot: конфиг откатывается БЕЗ своих имён…» и ещё 4 (certbot занят, отказ и отката, остаток впереди ×2) |
| 16 | `completeDomainJob`: возврат попытки `GREATEST(d.attempts - 1, 0)` → `d.attempts` | «такие отказы не расходуют ни окно повторов…», «три отказа Let’s Encrypt, затем устаревший агент…» (смешанная последовательность) |
| 17а | `completeDomainJob`: `raw.startsWith(AGENT_OUTDATED_MARKER)` → `raw.includes(…)` | «маркер не в начале текста — обычный отказ issue_failed» |
| 17б | `domains.service.ts` `domainJobsLeft`: `LIKE '<маркер>%'` → `LIKE '%<маркер>%'` | **ВЫЖИЛА** (полный прогон 1122/19 зелёный) → **добавлен** «маркер не в начале текста задания — такие задания в предел domain в час идут» (`domains.jobs.spec.ts`: шесть отказавших заданий с маркером в середине → `limited`). Под мутацией: `Expected "limited", Received "queued"` |
| 18 | `domainForAssistant`: в `check` уходит и `current` | «содержимое DNS в ответ не попадает», «в ответ идут записи и код причины, но не… содержимое DNS» |
| 19 | `product-tool` `resolve`: совпадение по своему домену вынесено из-под `user_id = $1` | «продукт находится по своему домену — в любом написании» (поиск от чужого пользователя ALIEN по тому же домену обязан вернуть пусто) |
| 20 | `CustomDomain.tsx` `load`: `my !== seq.current \|\|` снято | «медленный GET, начатый до отвязки, не воскрешает снятый домен», «зависший GET через 30 с считается брошенным…» |
| 21 | `productsApi.ts` `siteHref`: хост из `custom_domain_unicode` | «кириллический домен: подпись по-человечески, ссылка — в punycode» |
| 22 | `CustomDomain.tsx`: `canCheck` без `!detachOnly` | 4 красных в «только отвязка (продукт погашен администратором)»: «заявка ждёт DNS — без таблицы записей и без “Проверить”», «ошибка agent_outdated / issue_failed / orphan_issuing не зовёт нажать “Проверить снова”» |
| 23 | `product-vhost`: запись прямо в `$CONF`, без временного файла и `mv` | «ошибка записи: прежний файл байт в байт…» и «ошибка записи у нового продукта: не остаётся ничего» (`/dev/full`) |
| 24а | `vhost.ts` `vhostArgv`: `uniqueNames(names)` → `names` | «повтор имени — одна пара --domain, порядок первого появления» |
| 24б | `domain.ts` (агент) `applyDomain`: без `uniqueNames` — повторы уходят в `-d` certbot | **ВЫЖИЛА** (агент 462/462): тест сверял `certbot.slice(-4)`, а при повторах последние четыре элемента те же → **тест усилен**: «повторённые имена уезжают один раз» сверяет весь хвост после `--expand`. Под мутацией: лишние `-d www.a.ru -d a.ru` |
| 25а | `clipDomainError` → `text` без подрезки | «длинный отказ подрезается до 1000 знаков…», «длинный отказ отвязки: …не длиннее 1000 знаков вместе с пометкой», «эмодзи на границе подрезки не разрезается пополам» |
| 25б | `host.controller.ts`: подрезка `ERROR_MAX` (2000) снята | «длинная причина режется маршрутом, а не отбивается» |

Итог: 29 мутаций (25 из списка, три из них в двух местах), **27 пойманы** существующими тестами, **2 выжили** (17б, 24б) и закрыты тестами. Для мутации 1 добавлен тест, которого не хватало, хотя её ловили и другие. Тесты — коммит `84b37c2` в `feat/custom-domain` spirits_back. Каждый новый тест: зелёный без мутации, красный утверждением под своей мутацией.

Контроль (`passed` / `total` / `skipped`):

| Набор | До (`ba94a6d` / `bad30d0`) | После (`84b37c2` / `bad30d0`) |
|---|---|---|
| бэкенд `npx jest src/products src/mcp --runInBand` | 1122 / 1141 / 19 | 1124 / 1143 / 19 (+2 новых теста) |
| агент `product-runner` `npx jest` | 462 / 462 / 0 | 462 / 462 / 0 (один тест усилен, новых нет) |
| кабинет `npx vitest run` | 764 / 764 / 0 (59 файлов) | 764 / 764 / 0 (59 файлов) |

Клоны после батареи чистые (`git status` — только штампы `.cdom-lock-sha`), индекс `product_domains_occupied` в базе `pdom` на месте.

---

### Task 18: Репетиция на второй машине продуктов

Машина `clients` (`root@206.81.17.255`, зона `c.linkeon.io`): продуктов на ней нет, учётная запись Let's Encrypt staging уже заведена. Имя репетиции — под нашей зоной (wildcard ведёт на машину), сертификат — **staging** (`--test-cert`), лимиты боевого сервера не расходуются. На машине ничего не ставится насовсем: скрипт и каталог ACME — во временных путях, постоянные части ставит только PHASE 4 при выкате.

- [ ] **Step 1: Проверить, что машина пуста и спокойна**

```bash
ssh root@206.81.17.255 'ls /etc/nginx/sites-products/; nginx -t 2>&1 | tail -1; certbot certificates 2>/dev/null | grep "Certificate Name"'
```

Ожидается: каталог пуст, `test is successful`, только `products`. Если продукты появились — репетировать всё равно здесь: скрипт трогает только файл `roll-probe-dom.conf`.

- [ ] **Step 2: Временный скрипт и первый проход**

```bash
N=$(date +%s); echo "$N" > "$SCRATCH/rehearsal-n"
sed 's/^ZONE=.*/ZONE=c.linkeon.io/' ~/Downloads/spirits_back/.worktrees/custom-domain/scripts/product-vhost > "$SCRATCH/product-vhost-rehearsal"
scp -q "$SCRATCH/product-vhost-rehearsal" root@206.81.17.255:/tmp/product-vhost-rehearsal
ssh root@206.81.17.255 "set -e; mkdir -p /tmp/rehearsal-acme/.well-known/acme-challenge;
  PV_ACME_ROOT=/tmp/rehearsal-acme sh /tmp/product-vhost-rehearsal roll-probe-dom 18099 --domain rehearsal-dom-$N.c.linkeon.io;
  nginx -t && echo NGINX_OK"
```

(`$SCRATCH` — каталог черновиков сессии.) Ожидается: `NGINX_OK`; в `roll-probe-dom.conf` — блок 80 с `acme-challenge` для `rehearsal-dom-$N.c.linkeon.io`, без 443 для него. Имя — 37 знаков, в корзину 64 помещается.

- [ ] **Step 3: Путь Let's Encrypt отвечает, остальное — «подключается»**

```bash
N=$(cat "$SCRATCH/rehearsal-n")
ssh root@206.81.17.255 "echo probe > /tmp/rehearsal-acme/.well-known/acme-challenge/probe-$N"
curl -s "http://rehearsal-dom-$N.c.linkeon.io/.well-known/acme-challenge/probe-$N"; echo
curl -s -o /dev/null -w "%{http_code}\n" "http://rehearsal-dom-$N.c.linkeon.io/"
```

Ожидается: `probe`, затем `503`.

- [ ] **Step 4: Выпуск staging-сертификата и второй проход**

```bash
N=$(cat "$SCRATCH/rehearsal-n")
ssh root@206.81.17.255 "set -e;
  certbot certonly --test-cert --webroot -w /tmp/rehearsal-acme --cert-name linkeon-roll-probe-dom \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring --expand \
    -d rehearsal-dom-$N.c.linkeon.io;
  PV_ACME_ROOT=/tmp/rehearsal-acme sh /tmp/product-vhost-rehearsal roll-probe-dom 18099 --domain rehearsal-dom-$N.c.linkeon.io;
  nginx -t && echo NGINX_OK"
echo | openssl s_client -connect 206.81.17.255:443 -servername "rehearsal-dom-$N.c.linkeon.io" 2>/dev/null | openssl x509 -noout -subject -issuer
```

Ожидается: `NGINX_OK`, `subject=CN=rehearsal-dom-….c.linkeon.io`, издатель — staging Let's Encrypt.

- [ ] **Step 5: Хук и заглушка на своём домене**

```bash
N=$(cat "$SCRATCH/rehearsal-n")
scp -q ~/Downloads/spirits_back/.worktrees/custom-domain/scripts/linkeon-reload-nginx root@206.81.17.255:/tmp/linkeon-reload-nginx-rehearsal
ssh root@206.81.17.255 "sh /tmp/linkeon-reload-nginx-rehearsal && echo HOOK_OK;
  PV_ACME_ROOT=/tmp/rehearsal-acme sh /tmp/product-vhost-rehearsal roll-probe-dom --asleep --domain rehearsal-dom-$N.c.linkeon.io"
curl -sk -o /dev/null -w "%{http_code}\n" "https://rehearsal-dom-$N.c.linkeon.io/"
```

Ожидается: `HOOK_OK`, затем `503`.

- [ ] **Step 6: Отвязка в безопасном порядке и уборка**

```bash
ssh root@206.81.17.255 "set -e;
  PV_ACME_ROOT=/tmp/rehearsal-acme sh /tmp/product-vhost-rehearsal roll-probe-dom 18099;
  certbot delete --cert-name linkeon-roll-probe-dom --non-interactive;
  rm -f /etc/nginx/sites-products/roll-probe-dom.conf /tmp/product-vhost-rehearsal /tmp/linkeon-reload-nginx-rehearsal;
  rm -rf /tmp/rehearsal-acme;
  nginx -t && systemctl reload nginx && echo CLEAN_OK;
  ls /etc/nginx/sites-products/; certbot certificates 2>/dev/null | grep 'Certificate Name'"
```

Ожидается: `CLEAN_OK`, `sites-products` пуст, из сертификатов — только `products`. Остаётся безвредный `/usr/share/linkeon/connecting.html`: его всё равно заведёт `product-vhost` после выката.

- [x] **Step 7: Записать результат репетиции в этот план**

**Итог репетиции (25.09.2026, машина `clients`, скрипт с коммита `1fc097a`): все шаги зелёные, машина убрана.**

- Шаг 2 в написанном виде падает: новый `product-vhost` отбивает имена под своей `ZONE` (rc 2, «домен в зоне платформы»), а репетиционное имя лежит под `c.linkeon.io`. Так задумано. Во временной копии поставлена `ZONE=rehearsal.invalid`, имя оставлено под `c.linkeon.io`, на машину его ведёт wildcard. Строка спеки «машине запрет не мешает» устарела.
- Первый проход: `nginx -t` зелёный, в конфиге один `listen 443` (только основной адрес) и один путь ACME, права файла 644.
- Путь Let's Encrypt отдал `probe`, корень отдал 503 со страницей «Домен подключается».
- Сертификат staging выпущен: `subject=CN=rehearsal-dom-1790317632.c.linkeon.io`, издатель `(STAGING) Baloney Bulgur YE2`. После второго прохода в конфиге два `listen 443`. На https 502, это ожидаемо: на порту 18099 никого нет. HTTP отвечает 301 на https, путь ACME остался.
- Хук `linkeon-reload-nginx` отработал. С `--asleep` на своём домене по https стоит 503 «Продукт временно недоступен».
- `certbot renew --cert-name … --dry-run` дал «all simulated renewals succeeded». **Без терминала certbot выдерживает случайную паузу до 8 минут**, поэтому в живой проверке (задача 19, шаг 5.6) добавлять `--no-random-sleep-on-renew`.
- Уборка: конфиг без имён → `certbot delete` → файлы удалены → `CLEAN_OK`. В `sites-products` пусто, из сертификатов только `products`, `nginx -t` зелёный.
- Сверено чтением на обеих машинах продуктов: `snippets/products-ssl.conf` объявляет `ssl_session_cache shared:SSL:10m` (тот же размер, что в блоках 443 своих доменов). Корзина в `nginx.conf` закомментирована, `conf.d/*.conf` подключён внутри `http{}`, certbot 2.9.0 стоит из apt в `/usr/bin`, `certbot.timer` включён.

---

### Task 19: Выкат и живая проверка

⚠️ `deploy.sh` — только с явного «да» владельца, запуск отвязанный и без `tail`. Перед запуском — нет живых ходов, чата и активных заданий:

```bash
ssh dvolkov@212.113.106.202 'bash -s' <<'SQL'
cd ~/spirits_back && export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env | tr -d "\"'")"
psql "$DATABASE_URL" -Atc "SELECT 'jobs', count(*) FROM product_provision_jobs WHERE status IN ('queued','running')"
psql "$DATABASE_URL" -Atc "SELECT 'turns', count(*) FROM product_turns WHERE status IN ('queued','running')"
SQL
```

**Дополнения по итогам реализации (25.09.2026), выполнять вместе с шагами ниже:**

- **Перед выкатом.** Ещё раз сверить md5 живого `/home/dv/file-agent/server.mjs` на релее с `origin/main:relay-agent/server.mjs` (24–25.09 было `dc0ead6e…`, совпадало).
- **Миграции.** 008 применяется сама при старте API (`ProductsService.onModuleInit`), сломанный migrate-runner здесь не участвует. После выката в логах pm2 искать `008_domains.sql` и `004_rent.sql` (словарь вида `'domain'` живёт только в 004). Проверить:
  - `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='product_provision_jobs_kind_check'` — в словаре есть `'domain'`;
  - `\d product_domains` — таблица существует.

  Разовое падение одного процесса кластера на первом `CREATE` — гонка, повторного быть не должно.
- **PHASE 4 по машинам.** Если `3/5` красная (корзина осталась 64), домены длиннее ~46 знаков на этой машине падают. Если `4/5` пропущен, задания `domain` получают `agent_outdated`. В обоих случаях до живой проверки повторить `PRODUCTS_HOST_ONLY=1 PRODUCTS_HOST=<id>` (с «да» владельца). Агента на новую машину ставить только через PHASE 4: `product-host-agent-install.sh` напрямую обходит защиту «агент только вместе со скриптом».
- **Шаг 4, дополнительно.** `command -v certbot` на обеих машинах должен дать `/usr/bin/certbot`. 25.09 это так, чтением проверено.
- **Риск отката.** Если после выката откатить бэкенд, старый сервер не шлёт `customNames`, новый агент читает это как пустой список, и первый же сон или пробуждение снимает работающие свои домены. При таком откате вручную прогнать `product-vhost <slug> <порт> --domain …` по строкам `product_domains` в `active` (с «да» владельца).
- **Архивация вручную через psql** оставляет домен занятым навсегда: индекс занятости про архив не знает. В ранбук: при архивации удалять строку `product_domains` и ставить задание `domain` на уборку.
- **Шаг 5.6:** `certbot renew --cert-name linkeon-dmitryvolkov --dry-run --no-random-sleep-on-renew`.

- [ ] **Step 1: Влить ветки в main**

Бэкенд и фронт: `git merge --no-ff feat/custom-domain` в общих чекаутах на `main`, `git push origin main`, сверка `git rev-parse HEAD` против `git rev-parse origin/main` и `git merge-base --is-ancestor`.

- [ ] **Step 2: Выкат**

```bash
cd ~/Downloads/spirits_back && nohup bash scripts/deploy.sh > "$SCRATCH/deploy-domain.log" 2>&1 < /dev/null & disown
```

Выкат пересоздаст контейнеры продуктов: исходники `product-runner/src` изменились, метка образа по содержимому сменится. Это ожидаемо — отсюда требование «нет живых ходов».

Проверить в логе: PHASE 4 на обеих машинах — `3/5` «корзина 128, каталог ACME и хук продления стоят», product-vhost совпадает с прод-коммитом, итог `ALL PHASES GREEN`.

- [ ] **Step 3: Выкат релея руками**

md5 до → бэкап → `scp` → `node --check` под `.mjs` → `pm2 restart file-agent` в тихое окно → md5 после.

- [ ] **Step 4: Состояние машин после выката**

```bash
for h in root@139.59.210.42 root@206.81.17.255; do ssh $h 'nginx -T 2>/dev/null | grep -m1 server_names_hash_bucket_size; ls -l /etc/letsencrypt/renewal-hooks/deploy/; ls -d /var/www/linkeon-acme/.well-known/acme-challenge; nginx -t 2>&1 | tail -1'; done
```

Ожидается: `server_names_hash_bucket_size 128;`, хук на месте, каталог на месте, `test is successful` — на обеих.

- [ ] **Step 5: Живая проверка на `dmitryvolkov.ru`**

1. Владелец в свежей сессии просит Романа привязать `dmitryvolkov.ru` к «Сайт визитка». Роман называет TXT, A `@` → `139.59.210.42`, CNAME `www` → `dmitryvolkov.p.linkeon.io` и требует удалить четыре A и четыре AAAA. **Не говорит, что домен работает.**
2. Владелец меняет записи в masterhost. Кабинет показывает проверку по каждой записи; когда DNS сошёлся — «Выпускаем сертификат…», затем «Работает». Карточка и открытый продукт показывают `dmitryvolkov.ru` главным адресом.
3. `https://dmitryvolkov.ru` и `https://www.dmitryvolkov.ru` открывают продукт; сертификат — настоящий Let's Encrypt на оба имени:
   ```bash
   for h in dmitryvolkov.ru www.dmitryvolkov.ru; do echo | openssl s_client -connect $h:443 -servername $h 2>/dev/null | openssl x509 -noout -subject -issuer -ext subjectAltName; curl -s -o /dev/null -w "$h %{http_code}\n" https://$h/; done
   ```
4. Администратор гасит продукт: на `https://dmitryvolkov.ru` заглушка 503, не 502. После снятия блокировки сайт возвращается. Если гашение пришлось на выпуск — строка домена уходит в `failed` с текстом «Выпуск прерван», а не висит в `issuing`.
5. Второй аккаунт: если у тестового аккаунта `70000000000` есть сайт (`SELECT slug, user_id FROM products` на проде), с его токеном `POST /webhook/products/<id>/domain {"domain":"dmitryvolkov.ru"}` → 409 «уже привязан к другому продукту». Если сайта нет — шаг закрыт тестом «домен, работающий у другого продукта, — отказ».
6. Продление: `ssh root@139.59.210.42 'certbot renew --cert-name linkeon-dmitryvolkov --dry-run 2>&1 | tail -3'` → «all simulated renewals succeeded».
7. Отвязка — **только с согласия владельца**: она снимает его настоящий домен, а повторная привязка выдаст новый TXT-код. Если согласен: «Отвязать» → домен перестаёт обслуживаться, `certbot certificates` без `linkeon-dmitryvolkov`, `nginx -t` зелёный. Если нет — отвязка закрыта репетицией (задача 18) и тестами.

- [ ] **Step 6: Записать результат живой проверки в этот план**

---

## Самопроверка плана

**Покрытие спеки:**

| Требование спеки | Задача |
|---|---|
| Один домен на продукт, корень + www, поддомен один | 1, 2, 4 |
| Нормализация, punycode, запреты (наши зоны, IP) | 2 |
| Таблица, состояния, уникальность занятых | 1 |
| TXT-подтверждение, гонка двух заявок | 3, 5 |
| Проверка DNS через публичные резолверы, A на машину, без AAAA | 3 |
| Частота: фон 2 мин 7 суток, «сейчас» 30 с, повтор 3/час | 5 |
| Отвязка: awaiting_dns сразу, active/failed через removing, issuing — отказ | 4 |
| Погашенному — отказ в привязке, незаведённому — отказ | 4, 5 |
| Переход в issuing одним оператором | 5 |
| Задание `domain`, выдача в любом режиме, имена в каждом задании | 6, 10 |
| Режим конфига вычисляет сервер | 6 |
| Отказ домена не трогает продукт | 6 |
| `product-vhost --domain`, 443 только при сертификате, заглушка на своём домене, имена отбиваются до записи | 12 |
| Привязка: конфиг → certbot → конфиг; отвязка: конфиг → сертификат | 11 |
| Хук продления, каталог ACME — PHASE 4 | 13 |
| API кабинета, коды 409/422/429 | 4, 5, 7 |
| Кабинет: таблица записей, проверка по записи, состояния, главная ссылка | 8, 14, 15 |
| Ассистент: действие `domain`, правила описания, `list` со своим доменом, промпт релея | 9, 16 |
| Сервер раньше агента — `failed`, «Проверить снова» после выката | 6 (отказ агента → `failed`), 11 (`KNOWN_KINDS`) |
| Мутации из спеки | 17 |
| Репетиция на staging | 18 |
| Живая проверка | 19 |

**Сверх спеки, найдено разведкой:** сверка сирот (п. 11 разведки → задача 5), `wokenSql` (12 → задача 6), сверка статуса при выпуске (13 → задачи 4, 5), корзина имён и потолок длины (14 → задачи 2, 12, 13), откат `product-vhost` (15 → задача 12), откат агента при отказе certbot (17 → задача 11).

**Заглушки:** «TBD»/«TODO» нет. Код, ссылающийся на существующие заготовки тестов (`job`, `seed`, `asleep`, `makeDeps`, `listing`, `product`, `res`), сверен с `origin/main` 24.09.2026.

**Согласованность имён:**
- `normalizeDomain`, `relativeName`, `MAX_NAME_LENGTH` (задача 2) используются в задачах 4 и 9;
- `checkDns`, `DnsResolver`, `RecordCheck`, `TXT_LABEL`, `publicResolver` (3) — в 4, 5 и 9;
- `DomainsService.attach/get/detach/check/checkPending/tryIssue/reconcileOrphans`, `DomainView`, `DomainRecordToSet`, `ORPHAN_*` (4, 5) — в 7 и 9;
- `customNames`/`vhostMode` (6) — в 10 и 11;
- `vhostArgv`/`assertDomainName`/`MAX_DOMAIN_LENGTH` (10) — в 11;
- `applyDomain`/`certName`/`ACME_WEBROOT`/`DomainJob` (11) — в index.ts и спеках;
- `custom_domain` (8) — во фронте (14, 15);
- `DomainView`/`DomainResult`/`siteAddress` во фронте (14) — в 15;
- колонка `check_result` (1) — в 4 и 5.
