# Аналитика устройств — план 1 из 2: сбор и API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Начать собирать, с каких устройств люди пользуются продуктом, и отдавать эти данные админке.

**Architecture:** Разбор `User-Agent` своим классификатором в грубые корзины, таблица `user_devices` со строкой на пару «пользователь — устройство», запись в двух точках входа в аккаунт, два админских эндпоинта — сводка и разрез по пользователю.

**Tech Stack:** NestJS 10, TypeScript, PostgreSQL, jest.

**Спека:** `docs/superpowers/specs/2026-08-11-device-analytics-design.md` (в репозитории spirits_front)

**Все команды выполняются из `/Users/dmitry/Downloads/spirits_back`.**

---

## Почему сбор идёт отдельным планом

Аналитика без накопленных данных бесполезна: экран, построенный на пустой
таблице, ничего не покажет. Запустив сбор первым, мы дадим данным накопиться,
пока делается интерфейс. Плана 2 (экраны в админке) без этого просто нечем
наполнять.

## Миграции на проде: читать до начала

**`npm run migrate` на проде не работает и не заработает от этой задачи.**

Проверено сухим прогоном 11.08.2026: числятся применёнными 17 миграций из 49,
**32 в ожидании**, и первая же по порядку после `backlog/003` — это
`base/001_core_schema.sql`, которая падает. Раннер применяет по порядку и
бросает на первой ошибке, обрывая всё последующее.

Новая миграция `devices/001_user_devices.sql` сортируется после `base/`, то есть
раннер до неё не дойдёт **никогда**.

Поэтому применять её на серверах надо руками: выполнить SQL через `psql` и
отдельно записать факт в `schema_migrations`. Точные команды — в Задаче 1,
шаг 6. Не пытайся «сначала починить раннер»: это отдельная задача про 32
миграции и расхождение схемы с журналом, и в этот объём она не входит.

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/devices/migrations/001_user_devices.sql` | **создать** — таблица |
| `src/devices/user-agent.ts` | **создать** — разбор строки в корзины. Чистая функция, без зависимостей |
| `src/devices/user-agent.spec.ts` | **создать** — реальные строки User-Agent |
| `src/devices/devices.service.ts` | **создать** — запись и выборки |
| `src/devices/devices.service.spec.ts` | **создать** — запись не роняет вход |
| `src/devices/devices.module.ts` | **создать** — модуль Nest |
| `src/auth/auth.service.ts` | отдаёт `userId` из `refreshTokens` и `checkCode`, зовёт запись |
| `src/auth/auth.controller.ts` | читает заголовок и передаёт дальше |
| `src/admin/admin.controller.ts` | два эндпоинта |
| `src/admin/admin.service.ts` | агрегаты |

Разбор вынесен в отдельный файл-функцию намеренно: он не зависит ни от базы, ни
от Nest, и тестируется строками без всякого окружения.

---

## Задача 1: Таблица

**Files:**
- Create: `src/devices/migrations/001_user_devices.sql`

- [ ] **Шаг 1: Написать миграцию**

Создать `src/devices/migrations/001_user_devices.sql`:

```sql
-- Устройства, с которых люди заходят. Строка на пару «пользователь —
-- устройство»: человек с ноутбуком и телефоном даёт две строки, и сводка
-- честно показывает его в обеих корзинах.
CREATE TABLE IF NOT EXISTS user_devices (
  user_id         text NOT NULL,
  -- Огрублённый отпечаток: платформа|ОС|браузер|мажорная версия. Ключом взят
  -- он, а не сырой User-Agent: браузер обновляется каждые пару недель, и по
  -- сырой строке у одного человека за год накопились бы десятки «устройств».
  signature       text NOT NULL,
  platform        text NOT NULL,
  os_name         text,
  os_version      text,
  browser_name    text,
  browser_version text,
  -- Последняя сырая строка — для разбора спорных случаев.
  raw_user_agent  text,
  first_seen      timestamptz NOT NULL DEFAULT now(),
  last_seen       timestamptz NOT NULL DEFAULT now(),
  -- Считает записи, то есть входы и продления токена, а не запросы вообще.
  -- Числом визитов это называть нельзя.
  seen_count      integer NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, signature)
);

-- Сводка всегда фильтрует по свежести, разрез по пользователю — по user_id.
CREATE INDEX IF NOT EXISTS user_devices_last_seen_idx ON user_devices (last_seen);

COMMENT ON TABLE user_devices IS 'С каких устройств заходят пользователи';
COMMENT ON COLUMN user_devices.user_id IS 'ТОЛЬКО text: у телефонных регистраций это номер, у email и OAuth — UUID на 36 символов';
```

Обрати внимание на тип `user_id`. Он `text` и никаким `varchar(20)` быть не
может: у email- и OAuth-регистраций идентификатор — UUID на 36 символов, и
экономия сломалась бы на первом же таком пользователе.

- [ ] **Шаг 2: Проверить синтаксис локально**

Run: `psql --version`
Expected: команда есть. Если `psql` не установлен локально — пропусти шаг 3 и
проверяй на тестовом сервере в шаге 5.

- [ ] **Шаг 3: Применить на тестовом сервере**

Тестовый сервер: `ssh dv@85.192.61.231`, каталог `~/spirits_back`.

```bash
scp src/devices/migrations/001_user_devices.sql dv@85.192.61.231:/tmp/001_user_devices.sql
ssh dv@85.192.61.231 'cd ~/spirits_back && set -a && . ./.env && set +a && psql "$DATABASE_URL" -f /tmp/001_user_devices.sql'
```

Expected: `CREATE TABLE`, `CREATE INDEX`, два `COMMENT`.

- [ ] **Шаг 4: Записать факт применения на тесте**

```bash
ssh dv@85.192.61.231 'cd ~/spirits_back && set -a && . ./.env && set +a && psql "$DATABASE_URL" -c "INSERT INTO schema_migrations (filename) VALUES ('"'"'devices/001_user_devices.sql'"'"') ON CONFLICT DO NOTHING"'
```

Expected: `INSERT 0 1`.

Без этой записи следующий запуск раннера попытается применить миграцию заново.
`CREATE TABLE IF NOT EXISTS` это переживёт, но журнал должен отражать
действительность.

- [ ] **Шаг 5: Убедиться, что таблица есть и пуста**

```bash
ssh dv@85.192.61.231 'cd ~/spirits_back && set -a && . ./.env && set +a && psql "$DATABASE_URL" -c "\d user_devices"'
```

Expected: описание таблицы с восемью колонками и первичным ключом
`(user_id, signature)`.

- [ ] **Шаг 6: На прод НЕ применять**

Прод трогается только в связке с выкатом кода и только по явному согласованию с
владельцем. Команды те же, но с `ssh dvolkov@212.113.106.202`. Отметь в отчёте,
что прод не тронут.

- [ ] **Шаг 7: Коммит**

```bash
git add src/devices/migrations/001_user_devices.sql
git commit -m "feat(devices): таблица устройств пользователей

Строка на пару «пользователь — устройство»: человек с ноутбуком и телефоном
даёт две строки, и сводка честно показывает его в обеих корзинах."
```

---

## Задача 2: Разбор User-Agent

**Files:**
- Create: `src/devices/user-agent.ts`
- Create: `src/devices/user-agent.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

Создать `src/devices/user-agent.spec.ts`:

```ts
import { parseUserAgent, signatureOf } from './user-agent';

/**
 * Настоящие строки User-Agent, снятые с живых клиентов. Ожидаемый разбор
 * выписан рядом явно: правка регулярки «мимоходом» роняет тест, и менять
 * классификацию приходится осознанно.
 *
 * Точность библиотеки нам не нужна — нужны грубые корзины. Экзотика обязана
 * честно падать в unknown, а не получать выдуманную классификацию.
 */
const CASES: Array<{
  название: string;
  ua: string;
  platform: string;
  os_name: string | null;
  browser_name: string | null;
}> = [
  {
    название: 'Chrome на Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    platform: 'desktop',
    os_name: 'Windows',
    browser_name: 'Chrome',
  },
  {
    название: 'Safari на macOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    platform: 'desktop',
    os_name: 'macOS',
    browser_name: 'Safari',
  },
  {
    название: 'Safari на iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    platform: 'mobile',
    os_name: 'iOS',
    browser_name: 'Safari',
  },
  {
    название: 'Chrome на Android',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    platform: 'mobile',
    os_name: 'Android',
    browser_name: 'Chrome',
  },
  {
    название: 'iPad',
    ua: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    platform: 'tablet',
    os_name: 'iPadOS',
    browser_name: 'Safari',
  },
  {
    название: 'наша обёртка на Android — маркер wv',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36',
    platform: 'app_webview',
    os_name: 'Android',
    browser_name: 'WebView',
  },
  {
    название: 'мобильное приложение на Flutter',
    ua: 'Dart/3.10 (dart:io)',
    platform: 'app_flutter',
    os_name: null,
    browser_name: null,
  },
  {
    название: 'Firefox на Linux',
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
    platform: 'desktop',
    os_name: 'Linux',
    browser_name: 'Firefox',
  },
  {
    название: 'Edge на Windows',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    platform: 'desktop',
    os_name: 'Windows',
    browser_name: 'Edge',
  },
  {
    название: 'мусор',
    ua: 'зфыв123!!!',
    platform: 'unknown',
    os_name: null,
    browser_name: null,
  },
  {
    название: 'пустая строка',
    ua: '',
    platform: 'unknown',
    os_name: null,
    browser_name: null,
  },
];

describe('разбор User-Agent', () => {
  for (const c of CASES) {
    it(c.название, () => {
      const got = parseUserAgent(c.ua);
      expect(got.platform).toBe(c.platform);
      expect(got.osName).toBe(c.os_name);
      expect(got.browserName).toBe(c.browser_name);
    });
  }

  // Edge притворяется Chrome, а Chrome на Android — Safari. Проверка на то,
  // что порядок распознавания не переставили: иначе весь Edge уедет в Chrome.
  it('Edge не считается Chrome, а Chrome на Android — не Safari', () => {
    const edge = CASES.find((c) => c.название.startsWith('Edge'))!;
    expect(parseUserAgent(edge.ua).browserName).toBe('Edge');

    const android = CASES.find((c) => c.название.startsWith('Chrome на Android'))!;
    expect(parseUserAgent(android.ua).browserName).toBe('Chrome');
  });
});

describe('подпись устройства', () => {
  const chrome141 =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  const chrome141minor =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.55 Safari/537.36';
  const chrome142 =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

  // Без этого у одного человека за год накопились бы десятки «устройств».
  it('минорное обновление браузера не создаёт новое устройство', () => {
    expect(signatureOf(parseUserAgent(chrome141minor))).toBe(signatureOf(parseUserAgent(chrome141)));
  });

  it('мажорное обновление создаёт новое устройство', () => {
    expect(signatureOf(parseUserAgent(chrome142))).not.toBe(signatureOf(parseUserAgent(chrome141)));
  });

  it('у неразобранного тоже есть подпись — такие клиенты не теряются', () => {
    expect(signatureOf(parseUserAgent('зфыв'))).toBeTruthy();
  });
});
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

Run: `npx jest src/devices/user-agent.spec.ts`
Expected: FAIL — `Cannot find module './user-agent'`.

- [ ] **Шаг 3: Написать разбор**

Создать `src/devices/user-agent.ts`:

```ts
/**
 * Разбор User-Agent в грубые корзины.
 *
 * Своими руками, а не библиотекой. `ua-parser-js` во второй ветке сменила
 * лицензию на AGPL с платной альтернативой, первая ветка означает заморозку
 * на старой версии, а нужной нам точности от неё и не требуется: нужны
 * платформа, семейство ОС и семейство браузера с мажорной версией.
 *
 * Всё, что не распознано, честно уходит в `unknown` — доля таких видна в
 * сводке отдельной строкой. Классификатор, который относит непонятное в
 * «прочие», выглядит точным и молча врёт.
 *
 * Порядок проверок важен и переставлять его нельзя: Edge представляется как
 * Chrome, Chrome на Android — как Safari, а наша обёртка на Android — как
 * Chrome с маркером `wv`. Более частные случаи проверяются раньше общих.
 */

export type Platform =
  | 'desktop'
  | 'mobile'
  | 'tablet'
  | 'app_flutter'
  | 'app_webview'
  | 'unknown';

export interface ParsedUserAgent {
  platform: Platform;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
}

const UNKNOWN: ParsedUserAgent = {
  platform: 'unknown',
  osName: null,
  osVersion: null,
  browserName: null,
  browserVersion: null,
};

/** Мажорная версия из строки вида «141.0.7390.55». */
function major(version: string | null): string | null {
  if (!version) return null;
  const m = /^(\d+)/.exec(version);
  return m ? m[1] : null;
}

function detectOs(ua: string): { name: string | null; version: string | null } {
  let m: RegExpExecArray | null;

  // iPad раньше iOS: на планшете строка содержит «iPad», а не «iPhone».
  if (/\biPad\b/.test(ua)) {
    m = /CPU OS (\d+[._]\d+)/.exec(ua);
    return { name: 'iPadOS', version: m ? m[1].replace('_', '.') : null };
  }
  if (/\b(iPhone|iPod)\b/.test(ua)) {
    m = /CPU iPhone OS (\d+[._]\d+)/.exec(ua);
    return { name: 'iOS', version: m ? m[1].replace('_', '.') : null };
  }
  // Android раньше Linux: строка Android содержит и «Linux».
  if (/\bAndroid\b/.test(ua)) {
    m = /Android (\d+(?:\.\d+)?)/.exec(ua);
    return { name: 'Android', version: m ? m[1] : null };
  }
  if (/\bWindows NT\b/.test(ua)) {
    m = /Windows NT (\d+\.\d+)/.exec(ua);
    return { name: 'Windows', version: m ? m[1] : null };
  }
  if (/\bMac OS X\b/.test(ua)) {
    m = /Mac OS X (\d+[._]\d+)/.exec(ua);
    return { name: 'macOS', version: m ? m[1].replace(/_/g, '.') : null };
  }
  if (/\bLinux\b|\bX11\b/.test(ua)) return { name: 'Linux', version: null };
  return { name: null, version: null };
}

function detectBrowser(ua: string): { name: string | null; version: string | null } {
  let m: RegExpExecArray | null;

  // Обёртка помечает себя «wv» — проверяем раньше Chrome, иначе уедет в него.
  if (/;\s*wv\)/.test(ua)) {
    m = /Chrome\/([\d.]+)/.exec(ua);
    return { name: 'WebView', version: m ? m[1] : null };
  }
  // Edge представляется Chrome и добавляет «Edg» — раньше Chrome.
  if ((m = /\bEdg(?:iOS|A)?\/([\d.]+)/.exec(ua))) return { name: 'Edge', version: m[1] };
  if ((m = /\bOPR\/([\d.]+)/.exec(ua))) return { name: 'Opera', version: m[1] };
  if ((m = /\bYaBrowser\/([\d.]+)/.exec(ua))) return { name: 'Yandex', version: m[1] };
  if ((m = /\bFirefox\/([\d.]+)/.exec(ua))) return { name: 'Firefox', version: m[1] };
  if ((m = /\bChrome\/([\d.]+)/.exec(ua))) return { name: 'Chrome', version: m[1] };
  // Safari последним: он упомянут почти во всех строках на WebKit.
  if (/\bSafari\//.test(ua)) {
    m = /Version\/([\d.]+)/.exec(ua);
    return { name: 'Safari', version: m ? m[1] : null };
  }
  return { name: null, version: null };
}

export function parseUserAgent(raw: string | undefined | null): ParsedUserAgent {
  const ua = (raw ?? '').trim();
  if (!ua) return UNKNOWN;

  // Flutter ходит через Dio и своего агента не ставит — присылает дефолтный
  // Dart. Это единственный клиент, который виден однозначно.
  if (/^Dart\//.test(ua)) {
    return { ...UNKNOWN, platform: 'app_flutter' };
  }

  const os = detectOs(ua);
  const browser = detectBrowser(ua);
  if (!os.name && !browser.name) return UNKNOWN;

  let platform: Platform;
  if (browser.name === 'WebView') platform = 'app_webview';
  else if (os.name === 'iPadOS' || /\bTablet\b/.test(ua)) platform = 'tablet';
  else if (os.name === 'iOS' || os.name === 'Android' || /\bMobile\b/.test(ua)) platform = 'mobile';
  else platform = 'desktop';

  return {
    platform,
    osName: os.name,
    osVersion: os.version,
    browserName: browser.name,
    browserVersion: browser.version,
  };
}

/**
 * Отпечаток устройства: платформа, ОС, браузер и МАЖОРНАЯ версия.
 *
 * Мажорная, а не полная: браузер обновляется каждые пару недель, и по полной
 * версии у одного человека за год накопились бы десятки «устройств».
 */
export function signatureOf(p: ParsedUserAgent): string {
  return [p.platform, p.osName ?? '-', p.browserName ?? '-', major(p.browserVersion) ?? '-'].join('|');
}
```

- [ ] **Шаг 4: Запустить и убедиться, что проходит**

Run: `npx jest src/devices/user-agent.spec.ts`
Expected: PASS, 15 тестов.

- [ ] **Шаг 5: Сломать нарочно**

Временно переставь в `detectBrowser` проверку Chrome ВЫШЕ проверки Edge.

Run: `npx jest src/devices/user-agent.spec.ts`
Expected: FAIL — «Edge на Windows» и «Edge не считается Chrome…».

Верни порядок, прогони — PASS. Приведи вывод обеих команд. Этот излом
проверяет ровно то, что делает классификатор хрупким: порядок проверок.

- [ ] **Шаг 6: Коммит**

```bash
git add src/devices/user-agent.ts src/devices/user-agent.spec.ts
git commit -m "feat(devices): разбор User-Agent в грубые корзины

Своими руками, без библиотеки: ua-parser-js во второй ветке под AGPL, а
нужной нам точности от неё не требуется. Нераспознанное честно уходит в
unknown — классификатор, относящий непонятное в «прочие», молча врёт."
```

---

## Задача 3: Сервис записи

**Files:**
- Create: `src/devices/devices.service.ts`
- Create: `src/devices/devices.module.ts`
- Create: `src/devices/devices.service.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

Создать `src/devices/devices.service.spec.ts`:

```ts
import { DevicesService } from './devices.service';

function fakePg(behaviour: { throws?: boolean } = {}) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  return {
    calls,
    async query(sql: string, params: any[] = []) {
      calls.push({ sql, params });
      if (behaviour.throws) throw new Error('база недоступна');
      return { rows: [] };
    },
  };
}

describe('запись устройства', () => {
  it('пишет разобранные поля и подпись', async () => {
    const pg = fakePg();
    await new DevicesService(pg as any).record(
      '79088644408',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    );

    expect(pg.calls).toHaveLength(1);
    expect(pg.calls[0].sql).toContain('user_devices');
    expect(pg.calls[0].params[0]).toBe('79088644408');
    expect(pg.calls[0].params).toContain('desktop');
    expect(pg.calls[0].params).toContain('Windows');
    expect(pg.calls[0].params).toContain('Chrome');
  });

  it('повторная запись обновляет, а не плодит строки', async () => {
    const pg = fakePg();
    await new DevicesService(pg as any).record('u1', 'Dart/3.10 (dart:io)');

    expect(pg.calls[0].sql).toContain('ON CONFLICT');
    expect(pg.calls[0].sql).toContain('last_seen');
  });

  // Вход по SMS в этом проекте уже ломался. Цеплять к нему необязательную
  // аналитику без страховки нельзя.
  it('падение базы НЕ пробрасывается наружу', async () => {
    const pg = fakePg({ throws: true });
    await expect(new DevicesService(pg as any).record('u1', 'Dart/3.10')).resolves.toBeUndefined();
  });

  // Клиент, который вообще не представляется, должен быть виден, а не пропущен.
  it('пустой User-Agent пишется как unknown, а не пропускается', async () => {
    const pg = fakePg();
    await new DevicesService(pg as any).record('u1', undefined);

    expect(pg.calls).toHaveLength(1);
    expect(pg.calls[0].params).toContain('unknown');
  });

  it('без userId не пишет ничего', async () => {
    const pg = fakePg();
    await new DevicesService(pg as any).record('', 'Dart/3.10');

    expect(pg.calls).toHaveLength(0);
  });
});
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

Run: `npx jest src/devices/devices.service.spec.ts`
Expected: FAIL — `Cannot find module './devices.service'`.

- [ ] **Шаг 3: Написать сервис**

Создать `src/devices/devices.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PgService } from '../common/services/pg.service';
import { parseUserAgent, signatureOf } from './user-agent';

/**
 * С каких устройств заходят пользователи.
 *
 * Запись делается в двух точках входа в аккаунт — при входе и при продлении
 * токена. Продление случается примерно раз в два часа активного использования,
 * поэтому «последний визит» остаётся свежим без глобального перехватчика на
 * каждый запрос: такого механизма в проекте нет, и заводить его ради сбора
 * статистики значило бы положить его на горячий путь стриминга чата.
 */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly pg: PgService) {}

  /**
   * Записать устройство. Никогда не бросает.
   *
   * Вход по SMS в этом проекте уже ломался, и цеплять к нему необязательную
   * аналитику без страховки нельзя: человек, который не может войти из-за
   * упавшего сбора статистики, — цена, несопоставимая с пользой от неё.
   */
  async record(userId: string, userAgent: string | undefined | null): Promise<void> {
    if (!userId) return;

    try {
      const parsed = parseUserAgent(userAgent);
      const signature = signatureOf(parsed);

      await this.pg.query(
        `INSERT INTO user_devices
           (user_id, signature, platform, os_name, os_version, browser_name, browser_version, raw_user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, signature) DO UPDATE
            SET last_seen = now(),
                raw_user_agent = EXCLUDED.raw_user_agent,
                seen_count = user_devices.seen_count + 1`,
        [
          userId,
          signature,
          parsed.platform,
          parsed.osName,
          parsed.osVersion,
          parsed.browserName,
          parsed.browserVersion,
          (userAgent ?? '').slice(0, 500),
        ],
      );
    } catch (e: any) {
      this.logger.warn(`не удалось записать устройство для ${userId}: ${e?.message}`);
    }
  }
}
```

Обрати внимание на обрезку сырой строки до 500 символов: User-Agent приходит от
клиента и его длину мы не контролируем.

- [ ] **Шаг 4: Написать модуль**

Создать `src/devices/devices.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { PgService } from '../common/services/pg.service';

@Module({
  providers: [DevicesService, PgService],
  exports: [DevicesService],
})
export class DevicesModule {}
```

Сверься с тем, как устроены соседние модули (например `src/offer/offer.module.ts`):
если `PgService` в проекте предоставляется глобально, из `providers` его надо
убрать. Следуй принятому в репозитории образцу, а не этому куску вслепую.

- [ ] **Шаг 5: Запустить тесты**

Run: `npx jest src/devices/`
Expected: PASS.

- [ ] **Шаг 6: Сломать нарочно**

Временно убери `try/catch` из `record` — оставь тело без обёртки.

Run: `npx jest src/devices/devices.service.spec.ts`
Expected: FAIL — «падение базы НЕ пробрасывается наружу».

Верни обёртку, прогони — PASS. Это единственная защита входа от аналитики,
и она обязана быть проверенной.

- [ ] **Шаг 7: Коммит**

```bash
git add src/devices/devices.service.ts src/devices/devices.module.ts src/devices/devices.service.spec.ts
git commit -m "feat(devices): сервис записи устройств

Запись обёрнута так, чтобы никогда не бросать: вход по SMS уже ломался, и
цеплять к нему необязательную аналитику без страховки нельзя."
```

---

## Задача 4: Запись при входе и продлении токена

**Files:**
- Modify: `src/auth/auth.service.ts`
- Modify: `src/auth/auth.controller.ts`
- Modify: `src/auth/auth.module.ts`

`refreshTokens` знает `userId` внутри, но наружу его не отдаёт. Самый чистый
путь — вернуть его вместе с токенами и передать в контроллер, а тот пусть зовёт
запись. Так транспортная деталь (заголовок запроса) не протекает в сервис
авторизации.

- [ ] **Шаг 1: Отдать userId из refreshTokens**

В `src/auth/auth.service.ts` изменить сигнатуру и возврат `refreshTokens`:

```ts
  async refreshTokens(
    refreshToken: string,
  ): Promise<{ 'access-token': string; 'refresh-token': string; userId: string } | null> {
    try {
      const payload = this.jwtSvc.verify(refreshToken);
      if (payload.type !== 'refresh') return null;
      const userId: string = payload.userId ?? payload.sub;
      return {
        'access-token': this.jwtSvc.signAccess(userId),
        'refresh-token': this.jwtSvc.signRefresh(userId),
        userId,
      };
    } catch {
      return null;
    }
  }
```

- [ ] **Шаг 2: Проверить, что никто больше не зависит от формы ответа**

Run: `grep -rn "refreshTokens" src --include="*.ts" | grep -v spec`
Expected: только `auth.service.ts` и `auth.controller.ts`. Если найдётся третий
потребитель — остановись и сообщи.

- [ ] **Шаг 3: Не отдавать userId наружу в ответе**

В `src/auth/auth.controller.ts` метод `refresh` — отделить `userId` от тела
ответа, иначе форма ответа изменится для всех клиентов:

```ts
  @Post('auth/refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing token' });
    }
    const token = authHeader.substring(7);
    const result = await this.authService.refreshTokens(token);
    if (!result) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    // userId наружу не уходит: он нужен только для записи устройства, а форма
    // ответа читается уже выложенными клиентами и меняться не должна.
    const { userId, ...tokens } = result;
    void this.devices.record(userId, req.headers['user-agent']);
    return res.status(200).json(tokens);
  }
```

- [ ] **Шаг 4: Запись при входе по коду**

В том же контроллере метод `checkCode` — добавить `@Req() req: Request` в
параметры и запись после успешной проверки:

```ts
  @Get('a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/:phone/:code')
  async checkCode(
    @Param('phone') phone: string,
    @Param('code') code: string,
    @Query('sid') sid: string,
    @Query('src') src: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tokens = await this.authService.checkCode(phone, code, sid, src);
    if (!tokens) {
      return res.set(CORS).status(401).json({ error: 'Invalid or expired code' });
    }
    // У телефонной регистрации внутренний идентификатор — сам номер.
    void this.devices.record(phone, req.headers['user-agent']);
    return res.set(CORS).status(200).json(tokens);
  }
```

- [ ] **Шаг 5: Подключить сервис**

Добавить `DevicesService` в конструктор `AuthController` и `DevicesModule` в
`imports` модуля авторизации. Сверься с тем, как в этом модуле подключены
другие сервисы.

- [ ] **Шаг 6: Проверки**

Run: `npx jest src/auth/ src/devices/`
Expected: PASS.

Run: `npm run build`
Expected: успех.

- [ ] **Шаг 7: Проверить живьём на тесте**

Выкатывать не надо — проверить можно локально, если поднимается dev-сервер.
Если нет, отметь в отчёте, что живая проверка отложена до выката, и переходи
дальше. Не изобретай способ поднять прод локально.

- [ ] **Шаг 8: Коммит**

```bash
git add src/auth
git commit -m "feat(devices): запись устройства при входе и продлении токена

Две уже существующие точки вместо глобального перехватчика: такого механизма
в проекте нет, а заводить его ради статистики значило бы положить его на
горячий путь стриминга чата."
```

---

## Задача 5: Эндпоинты админки

**Files:**
- Modify: `src/admin/admin.service.ts`
- Modify: `src/admin/admin.controller.ts`
- Create: `src/admin/devices.spec.ts`

- [ ] **Шаг 1: Написать падающий тест**

Создать `src/admin/devices.spec.ts`:

```ts
import { AdminService } from './admin.service';

function fakePg(rows: Record<string, any[]> = {}) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  return {
    calls,
    async query(sql: string, params: any[] = []) {
      calls.push({ sql, params });
      for (const [needle, value] of Object.entries(rows)) {
        if (sql.includes(needle)) return { rows: value };
      }
      return { rows: [] };
    },
  };
}

describe('устройства в админке', () => {
  describe('разрез по пользователю', () => {
    it('отдаёт устройства одного человека, свежие первыми', async () => {
      const pg = fakePg();
      await new AdminService(pg as any).getUserDevices('79088644408');

      const call = pg.calls[0];
      expect(call.sql).toContain('user_devices');
      expect(call.sql).toContain('ORDER BY last_seen DESC');
      expect(call.params).toContain('79088644408');
    });
  });

  describe('сводка', () => {
    it('считает РАЗЛИЧНЫХ людей, а не строки', async () => {
      const pg = fakePg();
      await new AdminService(pg as any).getDeviceStats();

      // Два браузера у одного человека не должны дать двойку в «десктоп».
      expect(pg.calls.some((c) => c.sql.includes('COUNT(DISTINCT user_id)'))).toBe(true);
    });

    it('ограничивает окно свежестью, а не берёт всё подряд', async () => {
      const pg = fakePg();
      await new AdminService(pg as any).getDeviceStats();

      expect(pg.calls.every((c) => c.sql.includes('last_seen'))).toBe(true);
    });

    it('отдаёт разбивки по платформе, ОС и браузеру', async () => {
      const pg = fakePg();
      const stats = await new AdminService(pg as any).getDeviceStats();

      expect(stats).toHaveProperty('byPlatform');
      expect(stats).toHaveProperty('byOs');
      expect(stats).toHaveProperty('byBrowser');
    });

    // Ради этих двух чисел мы и храним все устройства, а не последнее.
    it('отдаёт «трогали мобилку» и «только мобилка»', async () => {
      const pg = fakePg();
      const stats = await new AdminService(pg as any).getDeviceStats();

      expect(stats).toHaveProperty('mobileTouched');
      expect(stats).toHaveProperty('mobileOnly');
    });

    // Без этой доли классификатор молча врёт: относит непонятное в «прочие»
    // и выглядит точным.
    it('отдаёт долю неразобранного', async () => {
      const pg = fakePg();
      const stats = await new AdminService(pg as any).getDeviceStats();

      expect(stats).toHaveProperty('unknownUsers');
    });
  });
});
```

- [ ] **Шаг 2: Запустить и убедиться, что падает**

Run: `npx jest src/admin/devices.spec.ts`
Expected: FAIL — методов `getUserDevices` и `getDeviceStats` не существует.

- [ ] **Шаг 3: Написать выборки**

Добавить в `src/admin/admin.service.ts` два метода. Место — рядом с остальными
методами админки, по образцу соседних.

```ts
  /** Окно свежести сводки: активными считаем тех, кто заходил за 30 дней. */
  private static readonly DEVICE_WINDOW = "last_seen > now() - interval '30 days'";

  /** Устройства одного человека, свежие первыми. */
  async getUserDevices(userId: string) {
    const res = await this.pg.query(
      `SELECT signature, platform, os_name, os_version, browser_name, browser_version,
              first_seen, last_seen, seen_count
         FROM user_devices
        WHERE user_id = $1
        ORDER BY last_seen DESC`,
      [userId],
    );
    return res.rows.map((r) => ({
      signature: r.signature,
      platform: r.platform,
      os: [r.os_name, r.os_version].filter(Boolean).join(' ') || null,
      browser: [r.browser_name, r.browser_version].filter(Boolean).join(' ') || null,
      first_seen: r.first_seen,
      last_seen: r.last_seen,
      seen_count: Number(r.seen_count) || 0,
    }));
  }

  /**
   * Сводка по устройствам активных пользователей.
   *
   * Везде считаются РАЗЛИЧНЫЕ пользователи, а не строки: два браузера у одного
   * человека дают единицу в «десктоп», а не двойку.
   *
   * Проценты по корзинам намеренно не сходятся к 100%: человек с ноутбуком и
   * телефоном попадает в обе. Подписать это обязан интерфейс.
   *
   * ВНИМАНИЕ на два разных «unknown», которые легко спутать:
   *   - `unknownUsers` — клиент, которого классификатор не узнал вовсе. Рост
   *     этого числа означает, что процентам верить нельзя.
   *   - `unknown` в разбивке по ОС — это ещё и Flutter: он сообщает платформу
   *     (`app_flutter`), но операционную систему из его строки не достать.
   *     Это НЕ признак поломки разбора.
   * Интерфейс обязан называть их по-разному, иначе нормальная работа Flutter
   * будет выглядеть как деградация классификатора.
   */
  async getDeviceStats() {
    const W = AdminService.DEVICE_WINDOW;

    const bucket = async (column: string) => {
      const res = await this.pg.query(
        `SELECT COALESCE(${column}, 'unknown') AS key, COUNT(DISTINCT user_id)::int AS users
           FROM user_devices
          WHERE ${W}
          GROUP BY 1
          ORDER BY users DESC`,
      );
      return res.rows.map((r) => ({ key: r.key, users: Number(r.users) || 0 }));
    };

    const totalRes = await this.pg.query(
      `SELECT COUNT(DISTINCT user_id)::int AS users FROM user_devices WHERE ${W}`,
    );

    const mobilePlatforms = "('mobile','app_flutter','app_webview')";

    const touchedRes = await this.pg.query(
      `SELECT COUNT(DISTINCT user_id)::int AS users
         FROM user_devices
        WHERE ${W} AND platform IN ${mobilePlatforms}`,
    );

    const onlyRes = await this.pg.query(
      `SELECT COUNT(*)::int AS users FROM (
         SELECT user_id
           FROM user_devices
          WHERE ${W}
          GROUP BY user_id
         HAVING bool_and(platform IN ${mobilePlatforms})
       ) t`,
    );

    const unknownRes = await this.pg.query(
      `SELECT COUNT(DISTINCT user_id)::int AS users
         FROM user_devices
        WHERE ${W} AND platform = 'unknown'`,
    );

    return {
      windowDays: 30,
      totalUsers: Number(totalRes.rows[0]?.users) || 0,
      byPlatform: await bucket('platform'),
      byOs: await bucket('os_name'),
      byBrowser: await bucket('browser_name'),
      mobileTouched: Number(touchedRes.rows[0]?.users) || 0,
      mobileOnly: Number(onlyRes.rows[0]?.users) || 0,
      unknownUsers: Number(unknownRes.rows[0]?.users) || 0,
    };
  }
```

- [ ] **Шаг 4: Добавить эндпоинты**

В `src/admin/admin.controller.ts`, рядом с остальными админскими маршрутами:

```ts
  @Get('admin/devices/stats')
  async deviceStats(@Res() res: Response) {
    return res.status(200).json(await this.adminService.getDeviceStats());
  }

  @Get('admin/devices')
  async userDevices(@Query('userId') userId: string, @Res() res: Response) {
    if (!userId) return res.status(400).json({ error: 'userId required' });
    return res.status(200).json(await this.adminService.getUserDevices(userId));
  }
```

Сверься с соседними маршрутами: если там стоят гарды или декораторы админского
доступа, поставь такие же.

- [ ] **Шаг 5: Запустить тесты**

Run: `npx jest src/admin/devices.spec.ts`
Expected: PASS, 7 тестов.

- [ ] **Шаг 6: Сломать нарочно**

Временно замени `COUNT(DISTINCT user_id)` на `COUNT(*)` в функции `bucket`.

Run: `npx jest src/admin/devices.spec.ts`
Expected: FAIL — «считает РАЗЛИЧНЫХ людей, а не строки».

Верни, прогони — PASS. Это та ошибка, из-за которой человек с Chrome и Firefox
раздул бы десктоп вдвое.

- [ ] **Шаг 7: Полная проверка**

Run: `npx jest src/admin/ src/devices/ src/auth/`
Expected: PASS.

Run: `npm run build`
Expected: успех.

- [ ] **Шаг 8: Коммит**

```bash
git add src/admin/admin.service.ts src/admin/admin.controller.ts src/admin/devices.spec.ts
git commit -m "feat(admin): эндпоинты сводки по устройствам и разреза по пользователю

Везде считаются различные пользователи, а не строки: два браузера у одного
человека дают единицу в корзине, а не двойку."
```

---

## Задача 6: Готовность

- [ ] **Шаг 1: Полный прогон**

Run: `npx jest`
Expected: PASS, весь набор.

Run: `npm run build`
Expected: успех.

Run: `git status --short`
Expected: пусто.

- [ ] **Шаг 2: Что сказать владельцу**

В отчёте перечислить:

- миграция применена на тестовом сервере, на прод **не применялась**;
- при выкате прода миграцию надо применить руками (`npm run migrate` там не
  работает — 32 миграции в ожидании, раннер падает на `base/001_core_schema.sql`);
- данные начнут накапливаться сразу после выката, экраны появятся планом 2.

Деплой — только через `bash ~/Downloads/spirits_back/scripts/deploy.sh` и только
по явному согласованию с владельцем.

---

## Что этот план не делает

- Экраны в админке — план 2: блок сводки во вкладке «Использование» и список
  устройств в карточке пользователя.
- Историю и динамику по времени — потребует таблицы событий, отдельная задача.
- Связку устройства с конверсией и ошибками.
- Починку раннера миграций и разбор 32 неприменённых — отдельная задача,
  затрагивающая всю схему.
- Уточнение «Capacitor против мобильного браузера» заголовком от клиента.
