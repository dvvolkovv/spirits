# Linkeon Products — раннер на VM продукта и кабинет клиента

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Замкнуть кусок 1: сервис `product-runner` на VM продукта, который забирает задания у Linkeon, гоняет `claude -p` в чекауте и деплоит результат с автооткатом, плюс кабинет `/products` во фронте.

**Architecture:** Раннер — отдельный деплоймент на чужой машине, без доступа к нашей базе; общается только через four HTTP-маршрута из плана бэкенда. Внутри — четыре независимых модуля: git-обвязка, спавн Claude с переводом событий, деплой с health-check, и цикл, который их связывает. Кабинет переиспользует NDJSON-цикл чата.

**Tech Stack:** Раннер — Node 20 + TypeScript, commonjs, без фреймворка (по образцу `worker/`). Кабинет — React 18 + Tailwind + i18next, `apiClient.fetchStream`.

**Предусловие:** план `2026-09-07-linkeon-products-backend.md` выполнен и выкачен на `test.linkeon.io`. Без его маршрутов раннеру некуда ходить.

---

## Конвенции

**Раннер живёт в `spirits_back/product-runner/`.** Там уже три отдельно деплоящихся подпроекта — `worker/`, `relay-agent/`, `voice-host/`. Копировать структуру `worker/`: свой `package.json`, свой `tsconfig.json`, `build: tsc`, `start: node dist/index.js`.

**`deploy.sh` подпроекты не катает автоматически, и молча глотает падение их сборки** — `set -e` без `pipefail` плюс `| tail` уже приводили к тому, что воркер не собрался, а деплой поехал дальше. Раннер выкатывается на клиентскую VM отдельно, это часть Task 12.

**Переводить события Claude в NDJSON — на стороне раннера, не бэкенда.** В бэкенде есть готовый `src/chat/claude-agent.event-translator.ts`, и соблазн переиспользовать его велик. Нельзя: транслятор держит состояние (`tool_use_id → имя инструмента`) в пределах одного хода, а события приезжают на бэкенд отдельными HTTP-запросами — состояние не переживёт ни рестарт, ни второй инстанс. В раннере же инстанс транслятора живёт ровно столько, сколько идёт ход. Дублирование здесь осознанное.

**Health-check проверяет content-type и тело, а не код ответа.** На доменах проекта SPA-фолбэк отдаёт `200` с HTML на любой путь, включая несуществующий. Проверка по коду будет всегда зелёной.

**Локалей семь:** `ru, en, es, pt, de, fr, zh`. Ключи добавляются во все. Скрипт `translate-locales` не запускать — он требует `ANTHROPIC_API_KEY`, которого нет, и переписывает файл локали целиком. Формы множественного числа брать из `Intl.PluralRules` целевого языка, а не переносить русские `_few`/`_many`.

---

## Структура файлов

**Раннер** (`spirits_back/product-runner/`):

| Файл | Ответственность |
|---|---|
| `src/config.ts` | чтение env, падение при отсутствии обязательных |
| `src/api.ts` | HTTP-клиент к Linkeon: poll, events, complete |
| `src/git.ts` | состояние дерева, sha, коммит, reset |
| `src/claude.ts` | спавн `claude -p`, перевод stream-json в NDJSON |
| `src/deploy.ts` | build → restart → health, откат при красном |
| `src/index.ts` | цикл: poll → выполнить → доложить |

**Кабинет** (`spirits_front/src/`):

| Файл | Ответственность |
|---|---|
| `services/productsApi.ts` | обёртки над `apiClient` для маршрутов продуктов |
| `components/products/ProductsListView.tsx` | список продуктов |
| `components/products/ProductChat.tsx` | чат с агентом продукта + стриминг |
| `components/products/TurnHistory.tsx` | история ходов и кнопка отката |
| `pages/ProductsPage.tsx` | тонкая обёртка: роутинг и выбор продукта |

---

## Часть A. Раннер

### Task 1: Скелет подпроекта и конфиг

**Files:**
- Create: `product-runner/package.json`
- Create: `product-runner/tsconfig.json`
- Create: `product-runner/src/config.ts`
- Test: `product-runner/src/config.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`product-runner/src/config.spec.ts`:

```ts
import { loadConfig } from './config';

const BASE = {
  LINKEON_URL: 'https://test.linkeon.io',
  RUNNER_TOKEN: 'tok',
  CHECKOUT_PATH: '/home/dv/selyanska',
};

describe('loadConfig', () => {
  it('читает обязательные переменные', () => {
    const cfg = loadConfig({ ...BASE } as any);

    expect(cfg.linkeonUrl).toBe('https://test.linkeon.io');
    expect(cfg.runnerToken).toBe('tok');
  });

  it('падает при отсутствии токена, а не стартует вхолостую', () => {
    const env: any = { ...BASE };
    delete env.RUNNER_TOKEN;

    expect(() => loadConfig(env)).toThrow(/RUNNER_TOKEN/);
  });

  it('срезает хвостовой слеш у адреса, чтобы не собрать //webhook', () => {
    const cfg = loadConfig({ ...BASE, LINKEON_URL: 'https://test.linkeon.io/' } as any);

    expect(cfg.linkeonUrl).toBe('https://test.linkeon.io');
  });

  it('без пути к чекауту не стартует', () => {
    // Пустой путь не безобиден: claude -p уедет работать в текущий каталог
    // процесса, то есть агент начнёт править файлы неизвестно где на машине
    // клиента. Отказ на старте дешевле такого хода.
    const env: any = { ...BASE };
    delete env.CHECKOUT_PATH;

    expect(() => loadConfig(env)).toThrow(/CHECKOUT_PATH/);
  });

  it('таймаут хода по умолчанию меньше серверного порога снятия зависших', () => {
    const cfg = loadConfig({ ...BASE } as any);

    // Сервер снимает running старше 30 минут. Если раннер сдаётся позже, ход
    // успеет уехать в failed, и раннер отчитается по уже закрытому ходу.
    expect(cfg.turnTimeoutMs).toBeLessThan(30 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `cd ~/Downloads/spirits_back/product-runner && npx jest src/config.spec.ts`
Expected: FAIL — `Cannot find module './config'`

- [ ] **Step 3: Создать подпроект**

`product-runner/package.json`:

```json
{
  "name": "linkeon-product-runner",
  "version": "0.1.0",
  "description": "Агент Linkeon, живущий на VM клиентского продукта",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "start:dev": "ts-node src/index.ts",
    "test": "jest"
  },
  "dependencies": {
    "dotenv": "^16.6.1"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.4.11",
    "ts-node": "^10.9.1",
    "typescript": "^5.0.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testMatch": ["**/src/**/*.spec.ts"]
  }
}
```

`product-runner/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts"]
}
```

`product-runner/src/config.ts`:

```ts
export interface RunnerConfig {
  linkeonUrl: string;
  runnerToken: string;
  checkoutPath: string;
  pollIntervalMs: number;
  turnTimeoutMs: number;
  claudeBin: string;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} не задан — раннер не может стартовать`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  return {
    // Хвостовой слеш дал бы https://host//webhook/... — nginx такие пути не
    // всегда нормализует.
    linkeonUrl: required(env, 'LINKEON_URL').replace(/\/+$/, ''),
    runnerToken: required(env, 'RUNNER_TOKEN'),
    checkoutPath: required(env, 'CHECKOUT_PATH'),
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 3000),
    // Меньше серверного порога снятия зависших ходов (30 минут): иначе раннер
    // отчитается по ходу, который сервер уже закрыл как failed.
    turnTimeoutMs: Number(env.TURN_TIMEOUT_MS ?? 20 * 60 * 1000),
    // Бэкенд зовёт /usr/bin/claude, а не тот claude, что первым найдётся в
    // PATH шелла. На клиентской VM путь может отличаться — выносим в env.
    claudeBin: env.CLAUDE_BIN ?? '/usr/bin/claude',
  };
}
```

- [ ] **Step 4: Установить зависимости и прогнать тест**

```bash
cd ~/Downloads/spirits_back/product-runner && npm install && npx jest src/config.spec.ts
```
Expected: PASS, 4 теста

- [ ] **Step 5: Коммит**

```bash
git add product-runner/
git commit -m "feat(runner): скелет подпроекта и конфиг раннера"
```

---

### Task 2: Git-обвязка

**Files:**
- Create: `product-runner/src/git.ts`
- Test: `product-runner/src/git.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`product-runner/src/git.spec.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Git } from './git';

function makeGit(responses: Record<string, string> = {}) {
  const runs: string[][] = [];
  const run = jest.fn(async (args: string[]) => {
    runs.push(args);
    const key = args.join(' ');
    for (const [pattern, out] of Object.entries(responses)) {
      if (key.startsWith(pattern)) return out;
    }
    return '';
  });
  return { git: new Git('/srv/app', run), runs, run };
}

describe('Git.headSha', () => {
  it('возвращает текущий sha', async () => {
    const { git } = makeGit({ 'rev-parse HEAD': 'abc123\n' });

    await expect(git.headSha()).resolves.toBe('abc123');
  });
});

describe('Git.commitPendingChanges', () => {
  it('коммитит грязное дерево до начала хода', async () => {
    const { git, runs } = makeGit({ 'status --porcelain': ' M src/index.ts\n' });

    await git.commitPendingChanges();

    // Без этого git reset --hard при откате уничтожит чужие ручные правки.
    expect(runs.some((r) => r[0] === 'add')).toBe(true);
    expect(runs.some((r) => r[0] === 'commit')).toBe(true);
  });

  it('на чистом дереве не создаёт пустой коммит', async () => {
    const { git, runs } = makeGit({ 'status --porcelain': '' });

    await git.commitPendingChanges();

    expect(runs.some((r) => r[0] === 'commit')).toBe(false);
  });
});

describe('Git.resetHard', () => {
  it('возвращает дерево на указанный sha', async () => {
    const { git, runs } = makeGit();

    await git.resetHard('aaa111');

    expect(runs).toContainEqual(['reset', '--hard', 'aaa111']);
  });
});

describe('Git — настоящий child_process', () => {
  // Единственный тест, который идёт через реальную ветку execFile: все
  // остальные подают свой run-мок и защиту от инъекции не проверяют вовсе.
  // А защита нужна: сообщение коммита собирается из промпта пользователя.
  it('сообщение коммита не исполняется как команда', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-git-'));
    const run = (args: string[]) => execFileSync('git', args, { cwd: dir });
    run(['init', '-q']);
    run(['config', 'user.email', 'runner@test']);
    run(['config', 'user.name', 'runner']);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');

    const sentinel = path.join(dir, 'pwned');
    // Git без инжектированного раннера — идёт настоящий execFile.
    const git = new Git(dir);
    await git.commitAll(`правка"; touch ${sentinel}; echo "`);

    expect(fs.existsSync(sentinel)).toBe(false);
    // И сообщение сохранилось буквально, а не обрезалось по разделителю.
    expect(run(['log', '-1', '--pretty=%s']).toString()).toContain('touch');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('Git.push', () => {
  it('без remote не пушит и не падает', async () => {
    const { git, runs } = makeGit({ remote: '' });

    await git.push();

    expect(runs.some((r) => r[0] === 'push')).toBe(false);
  });

  it('с remote пушит', async () => {
    const { git, runs } = makeGit({ remote: 'origin\n' });

    await git.push();

    expect(runs.some((r) => r[0] === 'push')).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/git.spec.ts`
Expected: FAIL — `Cannot find module './git'`

- [ ] **Step 3: Реализовать**

`product-runner/src/git.ts`:

```ts
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type GitRunner = (args: string[]) => Promise<string>;

export class Git {
  private readonly run: GitRunner;

  constructor(
    private readonly cwd: string,
    run?: GitRunner,
  ) {
    this.run =
      run ??
      (async (args: string[]) => {
        const { stdout } = await execFileAsync('git', args, { cwd: this.cwd, maxBuffer: 16 * 1024 * 1024 });
        return stdout;
      });
  }

  async headSha(): Promise<string> {
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  async isDirty(): Promise<boolean> {
    return (await this.run(['status', '--porcelain'])).trim().length > 0;
  }

  /**
   * Кто-то полезет на VM руками — это вопрос времени. Если не закоммитить их
   * работу ДО начала хода, sha_before укажет на состояние без неё, и откат её
   * уничтожит.
   */
  async commitPendingChanges(): Promise<void> {
    if (!(await this.isDirty())) return;
    await this.run(['add', '-A']);
    await this.run(['commit', '-m', 'ручные правки на сервере (сохранено раннером)']);
  }

  async commitAll(message: string): Promise<string> {
    if (await this.isDirty()) {
      await this.run(['add', '-A']);
      await this.run(['commit', '-m', message]);
    }
    return this.headSha();
  }

  async resetHard(sha: string): Promise<void> {
    await this.run(['reset', '--hard', sha]);
  }

  /** У продукта может не быть remote — это нормально, ход не должен падать. */
  async push(): Promise<void> {
    const remotes = (await this.run(['remote'])).trim();
    if (!remotes) return;
    await this.run(['push']);
  }
}
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/git.spec.ts`
Expected: PASS, 6 тестов

- [ ] **Step 5: Коммит**

```bash
git add product-runner/src/git.ts product-runner/src/git.spec.ts
git commit -m "feat(runner): git-обвязка с сохранением ручных правок до хода"
```

---

### Task 3: Деплой и health-check

**Files:**
- Create: `product-runner/src/deploy.ts`
- Test: `product-runner/src/deploy.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`product-runner/src/deploy.spec.ts`:

```ts
import { checkHealth, deploy } from './deploy';

function response(init: { status: number; contentType: string; body: string }) {
  return {
    status: init.status,
    ok: init.status >= 200 && init.status < 300,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? init.contentType : null) },
    text: async () => init.body,
  } as any;
}

describe('checkHealth', () => {
  it('здоров при JSON-ответе 200', async () => {
    const fetchFn = jest.fn(async () => response({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

    await expect(checkHealth('https://x/api/healthz', fetchFn as any)).resolves.toBe(true);
  });

  it('SPA-фолбэк с кодом 200 и HTML считается НЕздоровым', async () => {
    // На доменах проекта nginx отдаёт index.html с кодом 200 на любой путь,
    // включая несуществующий. Проверка по коду ответа всегда зелёная и потому
    // бесполезна — именно этот случай ловит тест.
    const fetchFn = jest.fn(async () =>
      response({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><div id="root">' }),
    );

    await expect(checkHealth('https://x/api/healthz', fetchFn as any)).resolves.toBe(false);
  });

  it('5xx — нездоров', async () => {
    const fetchFn = jest.fn(async () => response({ status: 502, contentType: 'text/plain', body: 'bad gateway' }));

    await expect(checkHealth('https://x/api/healthz', fetchFn as any)).resolves.toBe(false);
  });

  it('сеть упала — нездоров, а не исключение наружу', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    await expect(checkHealth('https://x/api/healthz', fetchFn as any)).resolves.toBe(false);
  });

  it('без health_url считается здоровым: проверять нечем', async () => {
    await expect(checkHealth(null, jest.fn() as any)).resolves.toBe(true);
  });
});

describe('deploy', () => {
  const okShell = jest.fn(async () => undefined);

  it('красный health откатывает на sha_before', async () => {
    const git = { resetHard: jest.fn(async () => undefined) };
    const unhealthy = jest.fn(async () => response({ status: 500, contentType: 'text/plain', body: 'x' }));

    const result = await deploy({
      git: git as any,
      shaBefore: 'aaa111',
      buildCmd: 'npm run build',
      restartCmd: 'pm2 restart web',
      healthUrl: 'https://x/api/healthz',
      shell: okShell,
      fetchFn: unhealthy as any,
    });

    expect(result.reverted).toBe(true);
    expect(git.resetHard).toHaveBeenCalledWith('aaa111');
  });

  it('после отката пересобирает и поднимает, а не оставляет сломанное', async () => {
    const git = { resetHard: jest.fn(async () => undefined) };
    const shell = jest.fn(async () => undefined);
    const unhealthy = jest.fn(async () => response({ status: 500, contentType: 'text/plain', body: 'x' }));

    await deploy({
      git: git as any,
      shaBefore: 'aaa111',
      buildCmd: 'npm run build',
      restartCmd: 'pm2 restart web',
      healthUrl: 'https://x/api/healthz',
      shell,
      fetchFn: unhealthy as any,
    });

    // build+restart дважды: первый раз с новым кодом, второй после отката
    expect(shell).toHaveBeenCalledTimes(4);
  });

  it('зелёный health — отката нет', async () => {
    const git = { resetHard: jest.fn(async () => undefined) };
    const healthy = jest.fn(async () => response({ status: 200, contentType: 'application/json', body: '{}' }));

    const result = await deploy({
      git: git as any,
      shaBefore: 'aaa111',
      buildCmd: 'npm run build',
      restartCmd: 'pm2 restart web',
      healthUrl: 'https://x/api/healthz',
      shell: okShell,
      fetchFn: healthy as any,
    });

    expect(result.reverted).toBe(false);
    expect(git.resetHard).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/deploy.spec.ts`
Expected: FAIL — `Cannot find module './deploy'`

- [ ] **Step 3: Реализовать**

`product-runner/src/deploy.ts`:

```ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { Git } from './git';

const execAsync = promisify(exec);

export type Shell = (cmd: string) => Promise<void>;
export type FetchFn = typeof fetch;

/**
 * Здоровье определяется телом ответа, а не кодом. На доменах проекта
 * SPA-фолбэк отдаёт 200 с index.html на любой путь, включая несуществующий:
 * проверка по коду будет зелёной на мёртвом сервисе.
 */
export async function checkHealth(url: string | null, fetchFn: FetchFn = fetch): Promise<boolean> {
  if (!url) return true;
  try {
    const res = await fetchFn(url, { redirect: 'manual' } as any);
    if (res.status < 200 || res.status >= 300) return false;
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('text/html')) return false;
    const body = await res.text();
    if (/<!doctype html|<html/i.test(body)) return false;
    return true;
  } catch {
    return false;
  }
}

export interface DeployInput {
  git: Git;
  shaBefore: string;
  buildCmd: string | null;
  restartCmd: string | null;
  healthUrl: string | null;
  cwd?: string;
  shell?: Shell;
  fetchFn?: FetchFn;
}

export async function deploy(input: DeployInput): Promise<{ reverted: boolean }> {
  const shell: Shell =
    input.shell ??
    (async (cmd: string) => {
      await execAsync(cmd, { cwd: input.cwd, maxBuffer: 16 * 1024 * 1024 });
    });
  const fetchFn = input.fetchFn ?? fetch;

  const bringUp = async () => {
    if (input.buildCmd) await shell(input.buildCmd);
    if (input.restartCmd) await shell(input.restartCmd);
  };

  await bringUp();

  if (await checkHealth(input.healthUrl, fetchFn)) {
    return { reverted: false };
  }

  // Откатить мало — надо ещё поднять откаченное. Иначе продукт останется
  // лежать на старом коде, который не собран и не запущен.
  await input.git.resetHard(input.shaBefore);
  await bringUp();
  return { reverted: true };
}
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/deploy.spec.ts`
Expected: PASS, 8 тестов

- [ ] **Step 5: Сломать проверку нарочно**

Зелёный прогон сам по себе ничего не доказывает. Временно закомментировать в `checkHealth` две строки про `content-type` и `<!doctype`:

Run: `npx jest src/deploy.spec.ts`
Expected: FAIL на тесте «SPA-фолбэк с кодом 200 и HTML считается НЕздоровым»

Вернуть строки, прогнать снова — PASS. Если тест зелёный в обоих случаях, значит он проверяет не то, что написано в его названии.

- [ ] **Step 6: Коммит**

```bash
git add product-runner/src/deploy.ts product-runner/src/deploy.spec.ts
git commit -m "feat(runner): деплой с health-check по телу ответа и автооткатом"
```

---

### Task 4: Спавн Claude и перевод событий

**Files:**
- Create: `product-runner/src/claude.ts`
- Test: `product-runner/src/claude.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`product-runner/src/claude.spec.ts`:

```ts
import { translateEvent, ClaudeTranslator } from './claude';

describe('ClaudeTranslator', () => {
  it('system/init → begin', () => {
    const t = new ClaudeTranslator();

    expect(t.translate({ type: 'system', subtype: 'init' })).toEqual([{ type: 'begin' }]);
  });

  it('текстовая дельта → item', () => {
    const t = new ClaudeTranslator();

    const out = t.translate({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'правлю ' } },
    });

    expect(out).toEqual([{ type: 'item', content: 'правлю ' }]);
  });

  it('result → end с расходом токенов', () => {
    const t = new ClaudeTranslator();

    const out = t.translate({ type: 'result', subtype: 'success', usage: { input_tokens: 10, output_tokens: 20 } });

    expect(out[0]).toMatchObject({ type: 'end' });
    expect((out[0] as any).usage.total).toBe(30);
  });

  it('неизвестное событие не роняет и не шумит', () => {
    const t = new ClaudeTranslator();

    expect(t.translate({ type: 'wat' })).toEqual([]);
  });

  it('мусор вместо объекта не роняет', () => {
    const t = new ClaudeTranslator();

    expect(t.translate(null)).toEqual([]);
    expect(t.translate('строка' as any)).toEqual([]);
  });
});

describe('translateEvent — потоковый разбор строк', () => {
  it('склеивает разорванную по границе чанка строку', () => {
    const t = new ClaudeTranslator();
    const out: any[] = [];

    out.push(...translateEvent(t, '{"type":"system","subty'));
    out.push(...translateEvent(t, 'pe":"init"}\n'));

    expect(out).toEqual([{ type: 'begin' }]);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/claude.spec.ts`
Expected: FAIL — `Cannot find module './claude'`

- [ ] **Step 3: Реализовать**

`product-runner/src/claude.ts`:

```ts
import { spawn } from 'child_process';

export type NDJsonEvent =
  | { type: 'begin' }
  | { type: 'item'; content: string }
  | { type: 'tool_start'; tool: string; input: any }
  | { type: 'tool_result'; tool: string; result: any }
  | { type: 'end'; usage?: { input: number; output: number; total: number } }
  | { type: 'error'; message: string };

/**
 * Переводит stream-json от `claude -p` в NDJSON-протокол, который уже понимает
 * фронт (`begin | item | tool_start | tool_result | end | error`).
 *
 * Такой же транслятор есть в бэкенде (src/chat/claude-agent.event-translator.ts),
 * и переиспользовать его нельзя намеренно: он держит состояние в пределах хода,
 * а на бэкенд события приезжают отдельными HTTP-запросами — состояние не
 * переживёт ни рестарт, ни второй инстанс. Здесь инстанс живёт ровно один ход.
 */
export class ClaudeTranslator {
  private toolNames = new Map<string, string>();
  private buffer = '';

  translate(event: any): NDJsonEvent[] {
    if (!event || typeof event !== 'object') return [];

    if (event.type === 'system' && event.subtype === 'init') {
      return [{ type: 'begin' }];
    }

    if (event.type === 'stream_event') {
      const inner = event.event;
      if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
        return [{ type: 'item', content: String(inner.delta.text ?? '') }];
      }
      return [];
    }

    if (event.type === 'assistant') {
      const out: NDJsonEvent[] = [];
      for (const block of event.message?.content ?? []) {
        if (block.type === 'tool_use') {
          this.toolNames.set(block.id, block.name);
          out.push({ type: 'tool_start', tool: block.name, input: block.input });
        }
      }
      return out;
    }

    if (event.type === 'user') {
      const out: NDJsonEvent[] = [];
      for (const block of event.message?.content ?? []) {
        if (block.type === 'tool_result') {
          out.push({
            type: 'tool_result',
            tool: this.toolNames.get(block.tool_use_id) ?? 'unknown',
            result: block.content,
          });
        }
      }
      return out;
    }

    if (event.type === 'result') {
      const input = Number(event.usage?.input_tokens ?? 0);
      const output = Number(event.usage?.output_tokens ?? 0);
      return [{ type: 'end', usage: { input, output, total: input + output } }];
    }

    return [];
  }

  /** Достаёт целые строки из потока, придерживая хвост до следующего чанка. */
  takeLines(chunk: string): string[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.filter((l) => l.trim().length > 0);
  }
}

export function translateEvent(translator: ClaudeTranslator, chunk: string): NDJsonEvent[] {
  const out: NDJsonEvent[] = [];
  for (const line of translator.takeLines(chunk)) {
    try {
      out.push(...translator.translate(JSON.parse(line)));
    } catch {
      // Строка не JSON — CLI иногда пишет в stdout служебные сообщения.
    }
  }
  return out;
}

export interface RunClaudeInput {
  claudeBin: string;
  cwd: string;
  prompt: string;
  sessionId?: string | null;
  timeoutMs: number;
  onEvents: (events: NDJsonEvent[]) => void;
}

export async function runClaude(input: RunClaudeInput): Promise<{ ok: boolean; error?: string }> {
  const args = ['-p', input.prompt, '--output-format', 'stream-json', '--verbose'];
  if (input.sessionId) args.push('--resume', input.sessionId);

  return new Promise((resolve) => {
    const child = spawn(input.claudeBin, args, { cwd: input.cwd });
    const translator = new ClaudeTranslator();
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ ok: false, error: `Ход не уложился в ${Math.round(input.timeoutMs / 60000)} минут` });
    }, input.timeoutMs);

    child.stdout.on('data', (d) => input.onEvents(translateEvent(translator, d.toString())));
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: stderr.trim().slice(0, 2000) || `claude exited ${code}` });
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
  });
}
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/claude.spec.ts`
Expected: PASS, 6 тестов

- [ ] **Step 5: Коммит**

```bash
git add product-runner/src/claude.ts product-runner/src/claude.spec.ts
git commit -m "feat(runner): спавн claude и перевод stream-json в NDJSON"
```

---

### Task 5: HTTP-клиент к Linkeon

**Files:**
- Create: `product-runner/src/api.ts`
- Test: `product-runner/src/api.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`product-runner/src/api.spec.ts`:

```ts
import { LinkeonApi } from './api';

function makeApi(responder: (url: string, init: any) => any) {
  const calls: { url: string; init: any }[] = [];
  const fetchFn = jest.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    return responder(url, init);
  });
  const api = new LinkeonApi(
    { linkeonUrl: 'https://test.linkeon.io', runnerToken: 'tok' } as any,
    fetchFn as any,
  );
  return { api, calls };
}

const ok = (body: any) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

describe('LinkeonApi.poll', () => {
  it('ходит на маршрут раннера с Bearer-токеном', async () => {
    const { api, calls } = makeApi(() => ok({ turn: null, product: {} }));

    await api.poll();

    expect(calls[0].url).toBe('https://test.linkeon.io/webhook/products/runner/poll');
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok');
  });

  it('сетевая ошибка не роняет раннера — возвращает null', async () => {
    const { api } = makeApi(() => {
      throw new Error('ECONNRESET');
    });

    await expect(api.poll()).resolves.toBeNull();
  });

  it('401 не роняет раннера', async () => {
    const { api } = makeApi(() => ({ ok: false, status: 401, text: async () => 'unauthorized' }));

    await expect(api.poll()).resolves.toBeNull();
  });
});

describe('LinkeonApi.sendEvents', () => {
  it('пустой пакет не отправляется', async () => {
    const { api, calls } = makeApi(() => ok({ ok: true }));

    await api.sendEvents('t-1', []);

    expect(calls).toHaveLength(0);
  });

  it('события уходят пакетом', async () => {
    const { api, calls } = makeApi(() => ok({ ok: true }));

    await api.sendEvents('t-1', [{ type: 'begin' }, { type: 'item', content: 'x' }]);

    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].init.body).events).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/api.spec.ts`
Expected: FAIL — `Cannot find module './api'`

- [ ] **Step 3: Реализовать**

`product-runner/src/api.ts`:

```ts
import { RunnerConfig } from './config';
import { NDJsonEvent } from './claude';

export interface PollResult {
  /** `revertToSha` непустое => это служебный ход отката, а не запрос к агенту. */
  turn: { id: string; prompt: string; userId: string; revertToSha: string | null } | null;
  product: {
    checkoutPath: string;
    buildCmd: string | null;
    restartCmd: string | null;
    healthUrl: string | null;
    repoUrl: string | null;
    claudeSessionId: string | null;
  };
}

export interface CompletePayload {
  status: 'done' | 'failed' | 'reverted';
  result?: string;
  error?: string;
  shaBefore?: string;
  shaAfter?: string;
  tokens?: number;
}

export class LinkeonApi {
  constructor(
    private readonly config: RunnerConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private url(path: string) {
    return `${this.config.linkeonUrl}/webhook/${path}`;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.config.runnerToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Никакая ошибка связи не должна ронять раннер: он живёт на чужой машине,
   * а сеть между ней и Linkeon не наша. Все отказы схлопываются в null, и
   * цикл просто пробует снова.
   */
  async poll(): Promise<PollResult | null> {
    try {
      const res = await this.fetchFn(this.url('products/runner/poll'), {
        method: 'POST',
        headers: this.headers(),
      });
      if (!res.ok) return null;
      return (await res.json()) as PollResult;
    } catch {
      return null;
    }
  }

  async sendEvents(turnId: string, events: NDJsonEvent[]): Promise<boolean> {
    if (events.length === 0) return true;
    try {
      const res = await this.fetchFn(this.url(`products/runner/turns/${turnId}/events`), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ events }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async complete(turnId: string, payload: CompletePayload): Promise<boolean> {
    try {
      const res = await this.fetchFn(this.url(`products/runner/turns/${turnId}/complete`), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/api.spec.ts`
Expected: PASS, 5 тестов

- [ ] **Step 5: Коммит**

```bash
git add product-runner/src/api.ts product-runner/src/api.spec.ts
git commit -m "feat(runner): HTTP-клиент к Linkeon, устойчивый к обрывам связи"
```

---

### Task 6: Выполнение одного хода

**Files:**
- Create: `product-runner/src/turn.ts`
- Test: `product-runner/src/turn.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`product-runner/src/turn.spec.ts`:

```ts
import { executeTurn } from './turn';

function makeDeps(over: any = {}) {
  const git = {
    commitPendingChanges: jest.fn(async () => undefined),
    headSha: jest.fn(async () => 'sha-before'),
    commitAll: jest.fn(async () => 'sha-after'),
    resetHard: jest.fn(async () => undefined),
    push: jest.fn(async () => undefined),
    ...over.git,
  };
  const api = {
    sendEvents: jest.fn(async () => true),
    complete: jest.fn(async () => true),
    ...over.api,
  };
  const runClaude = over.runClaude ?? jest.fn(async () => ({ ok: true }));
  const deploy = over.deploy ?? jest.fn(async () => ({ reverted: false }));
  return { git, api, runClaude, deploy };
}

const PRODUCT = {
  checkoutPath: '/srv/app',
  buildCmd: 'npm run build',
  restartCmd: 'pm2 restart web',
  healthUrl: 'https://x/api/healthz',
  repoUrl: null,
  claudeSessionId: null,
};

const TURN = { id: 't-1', prompt: 'поправь футер', userId: 'u-1', revertToSha: null };

describe('executeTurn — обычный ход', () => {
  it('сохраняет ручные правки ДО снятия sha_before', async () => {
    const d = makeDeps();

    await executeTurn({ turn: TURN, product: PRODUCT, config: {} as any, ...d } as any);

    // Иначе sha_before укажет на состояние без чужой работы, и откат её сотрёт
    expect(d.git.commitPendingChanges.mock.invocationCallOrder[0]).toBeLessThan(
      d.git.headSha.mock.invocationCallOrder[0],
    );
  });

  it('успешный ход докладывает done с обоими sha', async () => {
    const d = makeDeps();

    await executeTurn({ turn: TURN, product: PRODUCT, config: {} as any, ...d } as any);

    expect(d.api.complete).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({ status: 'done', shaBefore: 'sha-before', shaAfter: 'sha-after' }),
    );
  });

  it('красный health докладывает reverted, а не done', async () => {
    const d = makeDeps({ deploy: jest.fn(async () => ({ reverted: true })) });

    await executeTurn({ turn: TURN, product: PRODUCT, config: {} as any, ...d } as any);

    expect(d.api.complete).toHaveBeenCalledWith('t-1', expect.objectContaining({ status: 'reverted' }));
  });

  it('упавший claude докладывает failed и НЕ деплоит', async () => {
    const d = makeDeps({ runClaude: jest.fn(async () => ({ ok: false, error: 'claude exited 1' })) });

    await executeTurn({ turn: TURN, product: PRODUCT, config: {} as any, ...d } as any);

    expect(d.deploy).not.toHaveBeenCalled();
    expect(d.api.complete).toHaveBeenCalledWith('t-1', expect.objectContaining({ status: 'failed' }));
  });
});

describe('executeTurn — служебный ход отката', () => {
  // Откат опознаётся по полю, а не по префиксу промпта. Промпт при этом
  // человекочитаемый и показывается в истории как есть.
  const revertTurn = { id: 't-2', prompt: 'Откат к aaa111', userId: 'u-1', revertToSha: 'aaa111' };

  it('не запускает claude', async () => {
    const d = makeDeps();

    await executeTurn({ turn: revertTurn, product: PRODUCT, config: {} as any, ...d } as any);

    expect(d.runClaude).not.toHaveBeenCalled();
  });

  it('сбрасывает дерево на указанный sha и докладывает reverted', async () => {
    const d = makeDeps();

    await executeTurn({ turn: revertTurn, product: PRODUCT, config: {} as any, ...d } as any);

    expect(d.git.resetHard).toHaveBeenCalledWith('aaa111');
    expect(d.api.complete).toHaveBeenCalledWith('t-2', expect.objectContaining({ status: 'reverted' }));
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `npx jest src/turn.spec.ts`
Expected: FAIL — `Cannot find module './turn'`

- [ ] **Step 3: Реализовать**

`product-runner/src/turn.ts`:

```ts
import { RunnerConfig } from './config';
import { LinkeonApi, PollResult } from './api';
import { Git } from './git';
import { NDJsonEvent, runClaude as runClaudeReal } from './claude';
import { deploy as deployReal } from './deploy';

export interface ExecuteTurnInput {
  turn: NonNullable<PollResult['turn']>;
  product: PollResult['product'];
  config: RunnerConfig;
  git: Git;
  api: LinkeonApi;
  runClaude?: typeof runClaudeReal;
  deploy?: typeof deployReal;
}

export async function executeTurn(input: ExecuteTurnInput): Promise<void> {
  const { turn, product, git, api } = input;
  const runClaude = input.runClaude ?? runClaudeReal;
  const deploy = input.deploy ?? deployReal;

  // Чужие ручные правки коммитятся ДО снятия точки возврата: иначе sha_before
  // укажет на состояние без них, и откат их уничтожит.
  await git.commitPendingChanges();
  const shaBefore = await git.headSha();

  // Признак отката — отдельное поле, а не префикс промпта. Строковый контракт
  // между двумя репозиториями разъезжается молча, и его нечем охранять: тест
  // на стороне бэкенда не знает про парсер здесь, а тест здесь не знает про
  // формат там. Плюс prompt приходит от пользователя, и префикс внутри него
  // подделывался бы обычным запросом в чат.
  if (turn.revertToSha) {
    const target = turn.revertToSha;
    await api.sendEvents(turn.id, [{ type: 'begin' }, { type: 'item', content: `Возвращаю на ${target}` }]);
    await git.resetHard(target);
    await deploy({
      git,
      shaBefore: target,
      buildCmd: product.buildCmd,
      restartCmd: product.restartCmd,
      healthUrl: product.healthUrl,
      cwd: product.checkoutPath,
    });
    await api.sendEvents(turn.id, [{ type: 'end' }]);
    await api.complete(turn.id, { status: 'reverted', shaBefore: target });
    return;
  }

  let tokens = 0;
  const buffered: NDJsonEvent[] = [];
  const flush = async () => {
    const batch = buffered.splice(0, buffered.length);
    // Не смогли доставить — возвращаем в буфер и досылаем позже. Ход при этом
    // не прерывается: агент уже работает, обрывать его нельзя.
    if (!(await api.sendEvents(turn.id, batch))) buffered.unshift(...batch);
  };

  // Сборка и рестарт — самая долгая часть хода, и для сборщика зависших она
  // выглядит молчанием: события шлёт только claude, а он в этот момент уже
  // отработал. Ход, чья сборка идёт дольше получаса, снялся бы как мёртвый.
  // Поэтому фазы деплоя отчитываются сами — это и признак жизни, и то, что
  // клиент видит в чате вместо тишины.
  const outcome = await runClaude({
    claudeBin: input.config.claudeBin,
    cwd: product.checkoutPath,
    prompt: turn.prompt,
    sessionId: product.claudeSessionId,
    timeoutMs: input.config.turnTimeoutMs,
    onEvents: (events) => {
      for (const e of events) {
        if (e.type === 'end' && e.usage) tokens = e.usage.total;
      }
      buffered.push(...events);
      void flush();
    },
  });

  await flush();

  if (!outcome.ok) {
    await api.sendEvents(turn.id, [{ type: 'error', message: outcome.error ?? 'unknown' }]);
    await api.complete(turn.id, { status: 'failed', error: outcome.error, shaBefore, tokens });
    return;
  }

  const shaAfter = await git.commitAll(`linkeon: ${turn.prompt.slice(0, 60)}`);
  await git.push();

  await api.sendEvents(turn.id, [{ type: 'item', content: '\n\nСобираю и перезапускаю…' }]);

  const result = await deploy({
    git,
    shaBefore,
    buildCmd: product.buildCmd,
    restartCmd: product.restartCmd,
    healthUrl: product.healthUrl,
    cwd: product.checkoutPath,
    // Отчёт о фазах: без него сборка выглядит для сборщика зависших молчанием,
    // и ход длиннее получаса снимут как мёртвый — а он жив.
    onPhase: (phase) => void api.sendEvents(turn.id, [{ type: 'item', content: `\n${phase}` }]),
  });

  await api.complete(turn.id, {
    status: result.reverted ? 'reverted' : 'done',
    shaBefore,
    shaAfter: result.reverted ? undefined : shaAfter,
    tokens,
  });
}
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `npx jest src/turn.spec.ts`
Expected: PASS, 6 тестов

- [ ] **Step 5: Коммит**

```bash
git add product-runner/src/turn.ts product-runner/src/turn.spec.ts
git commit -m "feat(runner): выполнение хода агента и служебного хода отката"
```

---

### Task 7: Цикл раннера и systemd

**Files:**
- Create: `product-runner/src/index.ts`
- Create: `product-runner/linkeon-product-runner.service`
- Create: `product-runner/README.md`

- [ ] **Step 1: Написать цикл**

`product-runner/src/index.ts`:

```ts
import 'dotenv/config';
import { loadConfig } from './config';
import { LinkeonApi } from './api';
import { Git } from './git';
import { executeTurn } from './turn';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const config = loadConfig();
  const api = new LinkeonApi(config);
  const git = new Git(config.checkoutPath);

  console.log(`[runner] старт, чекаут ${config.checkoutPath}, Linkeon ${config.linkeonUrl}`);

  for (;;) {
    const poll = await api.poll();

    if (!poll) {
      // Связи нет либо токен не принят. Не выходим: systemd перезапустит нас
      // в тот же цикл, а Linkeon может быть просто на деплое.
      await sleep(config.pollIntervalMs * 3);
      continue;
    }

    if (!poll.turn) {
      await sleep(config.pollIntervalMs);
      continue;
    }

    console.log(`[runner] ход ${poll.turn.id}`);
    try {
      await executeTurn({ turn: poll.turn, product: poll.product, config, git, api });
    } catch (e: any) {
      // Ни одно исключение не должно останавливать цикл: продукт останется с
      // висящим ходом, и замок заблокирует его до серверного сборщика.
      console.error(`[runner] ход ${poll.turn.id} упал: ${e?.message}`);
      await api.complete(poll.turn.id, { status: 'failed', error: String(e?.message ?? e) });
    }
  }
}

main().catch((e) => {
  console.error(`[runner] фатально: ${e?.message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Написать systemd-юнит**

`product-runner/linkeon-product-runner.service`:

```ini
[Unit]
Description=Linkeon product runner
After=network-online.target

[Service]
Type=simple
User=%i
WorkingDirectory=/opt/linkeon-product-runner
EnvironmentFile=/etc/linkeon-product-runner.env
ExecStart=/usr/bin/node /opt/linkeon-product-runner/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Раннер намеренно под systemd, а сам продукт — под PM2. В образце `selyanska` агент живёт дочерним процессом бота, из-за чего `pm2 restart` убивает его посреди ответа — на это потрачен отдельный раздел `CLAUDE.md:22-33` с пометкой «случалось десятки раз». Разные супервизоры разрывают эту связь: `pm2 restart` продукта раннера не касается.

- [ ] **Step 3: Написать README**

`product-runner/README.md`:

````markdown
# linkeon-product-runner

Агент Linkeon на VM клиентского продукта. Забирает задания long-poll'ом,
гоняет `claude -p` в чекауте продукта, коммитит, деплоит и откатывает при
красном health-check.

Соединение всегда инициирует эта машина. Linkeon не хранит SSH-ключей от
клиентских VM и не ходит сюда сам.

## Установка на VM продукта

```bash
sudo mkdir -p /opt/linkeon-product-runner
sudo rsync -az --exclude node_modules --exclude .git \
  ./ root@<vm>:/opt/linkeon-product-runner/
ssh root@<vm> 'cd /opt/linkeon-product-runner && npm ci && npm run build'
```

`rsync` без `--delete` — сознательно: с `--delete` он уже сносил `.env`
воркера на этом проекте.

## Конфиг

`/etc/linkeon-product-runner.env`:

```
LINKEON_URL=https://my.linkeon.io
RUNNER_TOKEN=<из scripts/products-register.sh, показывается один раз>
CHECKOUT_PATH=/home/dv/selyanska
CLAUDE_BIN=/usr/bin/claude
```

`CLAUDE_BIN` задаётся явно: бэкенд Linkeon зовёт `/usr/bin/claude`, а не тот
`claude`, что первым найдётся в `PATH` интерактивного шелла — на серверах это
разные бинари.

## Запуск

```bash
sudo cp linkeon-product-runner.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now linkeon-product-runner
journalctl -u linkeon-product-runner -f
```

## Проверка

```bash
# heartbeat дошёл до Linkeon
psql "$DATABASE_URL" -c 'SELECT slug, runner_seen_at FROM products'
```

`runner_seen_at` обновляется на каждом опросе, даже когда заданий нет.
Молчание дольше порога означает, что раннер мёртв, а не что ходов не было.
````

- [ ] **Step 4: Собрать раннер**

Локально `tsc` не гонять — мак не тянет. На тестовой ноде:

```bash
git push -u origin <ветка>
ssh dv@85.192.61.231 'cd ~/ci/spirits_back && git fetch -q origin && git checkout -q <sha>'
ssh dv@85.192.61.231 'cd ~/ci/spirits_back/product-runner && source ~/.nvm/nvm.sh && npm ci && npm run build && npx jest'
```

Expected: сборка без ошибок, все тесты зелёные.

Проверять вывод целиком, а не хвост: `deploy.sh` уже глотал падение сборки подпроекта из-за `set -e` без `pipefail` в связке с `| tail`.

- [ ] **Step 5: Коммит**

```bash
git add product-runner/
git commit -m "feat(runner): цикл раннера, systemd-юнит и инструкция по установке"
```

---

### Task 8: Живая проверка на тестовом стенде

- [ ] **Step 1: Поставить раннер на VM подопытного продукта**

Подопытный — `selyanska` (`165.227.141.149`). По инструкции из `product-runner/README.md`, `LINKEON_URL=https://test.linkeon.io`.

Токен получить скриптом из плана бэкенда:

```bash
ssh dv@85.192.61.231 'cd ~/spirits_back && DATABASE_URL=... scripts/products-register.sh <user_id> selyanska selyanska /home/dv/selyanska'
```

- [ ] **Step 2: Положить в чекаут `CLAUDE.md` продукта**

Без него агент не знает ни как собрать продукт, ни что трогать нельзя. Это и есть главная находка образца: `CLAUDE.md` там не документация для людей, а рабочий интерфейс агента.

У selyanska он уже написан (`/home/dv/selyanska/CLAUDE.md`, 14 КБ) — его нужно не сочинять заново, а адаптировать: **удалить весь раздел про Telegram-бот как claude-runner** (`CLAUDE.md:22-33` и `:99-122`). Он описывает прежнюю схему, где агент жил дочерним процессом бота и мог себя убить; теперь агента запускает раннер под systemd, и предупреждение «не делай `pm2 restart selyanska-bot`» станет ложным следом.

Добавить в начало блок про новую схему:

```markdown
## Как ты сюда попал

Тебя запустил `linkeon-product-runner` (systemd-юнит на этой машине) по
заданию из Linkeon. Ты работаешь в `/home/dv/selyanska` — этот чекаут и есть
прод `https://selyanska.eu`.

Собирать и перезапускать продукт **не нужно**: раннер сделает это сам после
твоего хода, проверит `/api/healthz` и откатит всё, если проверка красная.
Твоя задача — только правки в файлах.

Коммитить тоже не нужно — раннер закоммитит сам.
```

Проверить, что команды в реестре совпадают с реальностью продукта:

```bash
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c \"UPDATE products SET build_cmd='npm run build', restart_cmd='pm2 restart selyanska-web', health_url='https://selyanska.eu/api/healthz' WHERE slug='selyanska';\""
```

`restart_cmd` перезапускает **только** `selyanska-web`. `pm2 restart all` на этой машине заденет и `selyanska-bot`, а `pm2 restart` самого раннера тут не при чём — он под systemd.

- [ ] **Step 3: Убедиться, что heartbeat дошёл**

```bash
ssh dv@85.192.61.231 "psql \"\$DATABASE_URL\" -c 'SELECT slug, status, runner_seen_at FROM products'"
```
Expected: `runner_seen_at` — не старше минуты.

- [ ] **Step 4: Прогнать безобидный ход**

Через `POST /webhook/products/<id>/chat` с промптом «покажи содержимое README.md, ничего не меняй».

Expected: в ответе течёт NDJSON, ход завершается `done`, `sha_after` равен `sha_before` (агент ничего не менял), токены списались.

- [ ] **Step 5: Прогнать ход, который ломает продукт**

Промпт: «добавь в начало `src/app/layout.tsx` строку `throw new Error('проверка отката')`».

Expected: ход завершается `reverted`, сайт `selyanska.eu` жив, `git log` показывает коммит агента и следом возврат, токены **не** списаны.

Это главная проверка всей модели: агент правит живой прод, и единственное, что стоит между клиентом и лежащим сайтом — автооткат.

- [ ] **Step 6: Проверить откат кнопкой**

`POST /webhook/products/<id>/turns/<turn_id>/revert` по безобидному ходу из шага 4.

Expected: создаётся служебный ход, дерево возвращается на `sha_before`, статус `reverted`, токены не списаны.

- [ ] **Step 7: Проверить, что мёртвый раннер не блокирует продукт навсегда**

```bash
ssh root@165.227.141.149 'systemctl stop linkeon-product-runner'
# поставить ход через /chat — он повиснет в queued
ssh root@165.227.141.149 'systemctl start linkeon-product-runner'
```

Expected: раннер поднимается и забирает зависший `queued`-ход.

Затем то же с обрывом посреди хода:

```bash
# во время идущего хода
ssh root@165.227.141.149 'systemctl stop linkeon-product-runner'
```

Expected: ход остаётся `running`, а через 30 минут серверный сборщик переводит его в `failed`, и продукт снова принимает запросы.

---

## Часть B. Кабинет

### Task 9: Клиент API продуктов

**Files:**
- Create: `src/services/productsApi.ts` (репозиторий `spirits_front`)
- Test: `src/services/productsApi.spec.ts`

- [ ] **Step 1: Написать падающий тест**

`src/services/productsApi.spec.ts`:

```ts
import { productsApi } from './productsApi';
import { apiClient } from './apiClient';

jest.mock('./apiClient', () => ({
  apiClient: {
    get: jest.fn(async () => ({ ok: true, json: async () => [] })),
    post: jest.fn(async () => ({ ok: true, json: async () => ({}) })),
    fetchStream: jest.fn(async () => null),
  },
}));

describe('productsApi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('список продуктов', async () => {
    await productsApi.list();

    expect(apiClient.get).toHaveBeenCalledWith('/webhook/products');
  });

  it('история ходов', async () => {
    await productsApi.turns('p-1');

    expect(apiClient.get).toHaveBeenCalledWith('/webhook/products/p-1/turns');
  });

  it('откат идёт POST-ом на конкретный ход', async () => {
    await productsApi.revert('p-1', 't-1');

    expect(apiClient.post).toHaveBeenCalledWith('/webhook/products/p-1/turns/t-1/revert');
  });

  it('чат открывает поток, а не обычный запрос', async () => {
    await productsApi.chatStream('p-1', 'поправь футер');

    expect(apiClient.fetchStream).toHaveBeenCalledWith(
      '/webhook/products/p-1/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `cd ~/Downloads/spirits_front && npx vitest run src/services/productsApi.spec.ts`
Expected: FAIL — модуль не найден

(Если в репозитории настроен jest, а не vitest — использовать его. Проверить командой `grep -E '"(test|vitest|jest)"' package.json`.)

- [ ] **Step 3: Реализовать**

`src/services/productsApi.ts`:

```ts
import { apiClient } from './apiClient';

export interface Product {
  id: string;
  name: string;
  slug: string;
  status: 'provisioning' | 'running' | 'degraded' | 'stopped' | 'archived';
  domain: string | null;
  runner_seen_at: string | null;
  created_at: string;
}

export interface Turn {
  id: string;
  channel: 'web' | 'telegram';
  prompt: string;
  result: string | null;
  status: 'queued' | 'running' | 'done' | 'failed' | 'reverted';
  sha_before: string | null;
  sha_after: string | null;
  tokens_spent: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export const productsApi = {
  async list(): Promise<Product[]> {
    const res = await apiClient.get('/webhook/products');
    return res.ok ? res.json() : [];
  },

  async turns(productId: string): Promise<Turn[]> {
    const res = await apiClient.get(`/webhook/products/${productId}/turns`);
    return res.ok ? res.json() : [];
  },

  async revert(productId: string, turnId: string) {
    return apiClient.post(`/webhook/products/${productId}/turns/${turnId}/revert`);
  },

  chatStream(productId: string, prompt: string) {
    return apiClient.fetchStream(`/webhook/products/${productId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Expected: PASS, 4 теста

- [ ] **Step 5: Коммит**

```bash
git add src/services/productsApi.ts src/services/productsApi.spec.ts
git commit -m "feat(products): клиент API продуктов"
```

---

### Task 10: Список продуктов

**Files:**
- Create: `src/components/products/ProductsListView.tsx`
- Modify: `src/i18n/locales/{ru,en,es,pt,de,fr,zh}.json`

- [ ] **Step 1: Добавить ключи во все семь локалей**

В каждый файл — блок `products` верхнего уровня. Русский:

```json
"products": {
  "nav": "Продукты",
  "title": "Мои продукты",
  "subtitle": "Сайты и боты, которые Linkeon хостит и дорабатывает",
  "empty": "Пока ни одного продукта",
  "status": {
    "running": "Работает",
    "degraded": "Нет связи с сервером",
    "stopped": "Остановлен",
    "provisioning": "Разворачивается",
    "archived": "В архиве"
  },
  "chat": {
    "placeholder": "Что поправить?",
    "send": "Отправить",
    "busy": "Агент уже работает над предыдущим запросом"
  },
  "history": {
    "title": "История правок",
    "empty": "Правок пока не было",
    "revert": "Вернуть как было",
    "reverted": "Откачено",
    "failed": "Не выполнено",
    "tokens": "Списано токенов: {{count}}"
  }
}
```

Английский:

```json
"products": {
  "nav": "Products",
  "title": "My products",
  "subtitle": "Sites and bots that Linkeon hosts and maintains",
  "empty": "No products yet",
  "status": {
    "running": "Running",
    "degraded": "No connection to server",
    "stopped": "Stopped",
    "provisioning": "Provisioning",
    "archived": "Archived"
  },
  "chat": {
    "placeholder": "What should I change?",
    "send": "Send",
    "busy": "The agent is still working on your previous request"
  },
  "history": {
    "title": "Change history",
    "empty": "No changes yet",
    "revert": "Roll back",
    "reverted": "Rolled back",
    "failed": "Failed",
    "tokens": "Tokens spent: {{count}}"
  }
}
```

Испанский (`es.json`):

```json
"products": {
  "nav": "Productos",
  "title": "Mis productos",
  "subtitle": "Sitios y bots que Linkeon aloja y mantiene",
  "empty": "Aún no hay productos",
  "status": {
    "running": "En funcionamiento",
    "degraded": "Sin conexión con el servidor",
    "stopped": "Detenido",
    "provisioning": "Desplegando",
    "archived": "Archivado"
  },
  "chat": {
    "placeholder": "¿Qué quieres cambiar?",
    "send": "Enviar",
    "busy": "El agente aún está trabajando en tu solicitud anterior"
  },
  "history": {
    "title": "Historial de cambios",
    "empty": "Todavía no hay cambios",
    "revert": "Deshacer",
    "reverted": "Revertido",
    "failed": "Fallido",
    "tokens": "Tokens gastados: {{count}}"
  }
}
```

Португальский (`pt.json`):

```json
"products": {
  "nav": "Produtos",
  "title": "Meus produtos",
  "subtitle": "Sites e bots que a Linkeon hospeda e mantém",
  "empty": "Ainda não há produtos",
  "status": {
    "running": "Em funcionamento",
    "degraded": "Sem conexão com o servidor",
    "stopped": "Parado",
    "provisioning": "Provisionando",
    "archived": "Arquivado"
  },
  "chat": {
    "placeholder": "O que devo alterar?",
    "send": "Enviar",
    "busy": "O agente ainda está trabalhando no seu pedido anterior"
  },
  "history": {
    "title": "Histórico de alterações",
    "empty": "Ainda não houve alterações",
    "revert": "Reverter",
    "reverted": "Revertido",
    "failed": "Falhou",
    "tokens": "Tokens gastos: {{count}}"
  }
}
```

Немецкий (`de.json`):

```json
"products": {
  "nav": "Produkte",
  "title": "Meine Produkte",
  "subtitle": "Websites und Bots, die Linkeon hostet und weiterentwickelt",
  "empty": "Noch keine Produkte",
  "status": {
    "running": "Läuft",
    "degraded": "Keine Verbindung zum Server",
    "stopped": "Gestoppt",
    "provisioning": "Wird eingerichtet",
    "archived": "Archiviert"
  },
  "chat": {
    "placeholder": "Was soll geändert werden?",
    "send": "Senden",
    "busy": "Der Agent arbeitet noch an deiner vorherigen Anfrage"
  },
  "history": {
    "title": "Änderungsverlauf",
    "empty": "Noch keine Änderungen",
    "revert": "Zurücksetzen",
    "reverted": "Zurückgesetzt",
    "failed": "Fehlgeschlagen",
    "tokens": "Verbrauchte Tokens: {{count}}"
  }
}
```

Французский (`fr.json`):

```json
"products": {
  "nav": "Produits",
  "title": "Mes produits",
  "subtitle": "Sites et bots que Linkeon héberge et fait évoluer",
  "empty": "Aucun produit pour l'instant",
  "status": {
    "running": "En service",
    "degraded": "Pas de connexion au serveur",
    "stopped": "Arrêté",
    "provisioning": "Déploiement en cours",
    "archived": "Archivé"
  },
  "chat": {
    "placeholder": "Que faut-il modifier ?",
    "send": "Envoyer",
    "busy": "L'agent travaille encore sur votre demande précédente"
  },
  "history": {
    "title": "Historique des modifications",
    "empty": "Aucune modification pour l'instant",
    "revert": "Revenir en arrière",
    "reverted": "Annulé",
    "failed": "Échec",
    "tokens": "Jetons dépensés : {{count}}"
  }
}
```

Китайский (`zh.json`):

```json
"products": {
  "nav": "产品",
  "title": "我的产品",
  "subtitle": "由 Linkeon 托管和维护的网站与机器人",
  "empty": "暂无产品",
  "status": {
    "running": "运行中",
    "degraded": "与服务器失去连接",
    "stopped": "已停止",
    "provisioning": "部署中",
    "archived": "已归档"
  },
  "chat": {
    "placeholder": "需要修改什么？",
    "send": "发送",
    "busy": "智能体仍在处理上一个请求"
  },
  "history": {
    "title": "修改记录",
    "empty": "暂无修改",
    "revert": "撤销",
    "reverted": "已撤销",
    "failed": "失败",
    "tokens": "已消耗代币：{{count}}"
  }
}
```

Два правила, каждое выведено из уже случившейся поломки на этом проекте:

- **Не запускать `translate-locales`.** Скрипт требует `ANTHROPIC_API_KEY`, которого в окружении нет, и переписывает файл локали целиком.
- **Не переносить русские формы `_few`/`_many`.** Категории множественного числа берутся из `Intl.PluralRules` целевого языка: у английского их две, у русского три, у китайского одна. Скопированный из русского `_few` в `en.json` просто не сработает.

- [ ] **Step 2: Написать компонент**

`src/components/products/ProductsListView.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, CircleDot } from 'lucide-react';
import { productsApi, Product } from '../../services/productsApi';

const STATUS_STYLE: Record<string, string> = {
  running: 'text-green-600',
  degraded: 'text-amber-600',
  stopped: 'text-gray-400',
  provisioning: 'text-blue-600',
  archived: 'text-gray-400',
};

interface Props {
  onOpen: (product: Product) => void;
}

export const ProductsListView: React.FC<Props> = ({ onOpen }) => {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    productsApi.list().then((rows) => {
      setProducts(rows);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-4 text-sm text-gray-500">…</div>;

  if (products.length === 0) {
    return <div className="p-8 text-center text-gray-500">{t('products.empty')}</div>;
  }

  return (
    <div className="space-y-2">
      {products.map((p) => (
        <button
          key={p.id}
          onClick={() => onOpen(p)}
          className="w-full flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 text-left"
        >
          <Server className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900 truncate">{p.name}</div>
            {p.domain && <div className="text-sm text-gray-500 truncate">{p.domain}</div>}
          </div>
          <span className={`flex items-center gap-1 text-xs ${STATUS_STYLE[p.status] ?? 'text-gray-400'}`}>
            <CircleDot className="w-3 h-3" />
            {t(`products.status.${p.status}`)}
          </span>
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 3: Проверить, что все семь локалей — валидный JSON**

```bash
for f in src/i18n/locales/*.json; do python3 -m json.tool "$f" > /dev/null || echo "СЛОМАН: $f"; done
```
Expected: пусто

- [ ] **Step 4: Проверить, что ключи есть во всех локалях**

```bash
python3 - <<'PY'
import json, glob
need = json.load(open('src/i18n/locales/ru.json'))['products']
def flat(d, p=''):
    out = set()
    for k, v in d.items():
        out |= flat(v, f'{p}{k}.') if isinstance(v, dict) else {f'{p}{k}'}
    return out
base = flat(need)
for f in sorted(glob.glob('src/i18n/locales/*.json')):
    have = flat(json.load(open(f)).get('products', {}))
    missing = base - have
    print(f, 'OK' if not missing else f'НЕТ КЛЮЧЕЙ: {sorted(missing)}')
PY
```
Expected: `OK` для всех семи файлов

- [ ] **Step 5: Коммит**

```bash
git add src/components/products/ProductsListView.tsx src/i18n/locales/
git commit -m "feat(products): список продуктов и локализация на семь языков"
```

---

### Task 11: Чат с агентом продукта

**Files:**
- Create: `src/components/products/ProductChat.tsx`

- [ ] **Step 1: Написать компонент**

`src/components/products/ProductChat.tsx`:

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { productsApi, Product } from '../../services/productsApi';

interface Props {
  product: Product;
  onTurnFinished: () => void;
}

export const ProductChat: React.FC<Props> = ({ product, onTurnFinished }) => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!prompt.trim() || streaming) return;
    setStreaming(true);
    setOutput('');
    setError(null);

    const reader = await productsApi.chatStream(product.id, prompt);
    setPrompt('');

    if (!reader) {
      // fetchStream отдаёт null на любом не-2xx. Самый частый здесь — 409:
      // агент ещё занят предыдущим запросом.
      setError(t('products.chat.busy'));
      setStreaming(false);
      return;
    }

    let buffer = '';
    let accumulated = '';

    // Тот же разбор, что в ChatInterface.tsx: чанк может оборваться посреди
    // строки, поэтому хвост придерживается до следующего чтения.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'item' && event.content) {
            accumulated += event.content;
            setOutput(accumulated);
          } else if (event.type === 'tool_start') {
            accumulated += `\n\n_${event.tool}_\n`;
            setOutput(accumulated);
          } else if (event.type === 'error') {
            setError(event.message);
          }
        } catch {}
      }
    }

    setStreaming(false);
    onTurnFinished();
  };

  return (
    <div className="space-y-3">
      {output && (
        <div className="p-4 bg-gray-50 rounded-xl text-sm whitespace-pre-wrap text-gray-800">{output}</div>
      )}
      {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}

      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={streaming}
          placeholder={t('products.chat.placeholder')}
          className="flex-1 px-4 py-3 border border-gray-200 rounded-xl disabled:bg-gray-50"
        />
        <button
          onClick={send}
          disabled={streaming || !prompt.trim()}
          className="px-4 py-3 bg-blue-600 text-white rounded-xl disabled:opacity-40"
          aria-label={t('products.chat.send')}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Коммит**

```bash
git add src/components/products/ProductChat.tsx
git commit -m "feat(products): чат с агентом продукта со стримингом хода"
```

---

### Task 12: История ходов, откат, роут

**Files:**
- Create: `src/components/products/TurnHistory.tsx`
- Create: `src/pages/ProductsPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Navigation.tsx`

- [ ] **Step 1: Написать историю**

`src/components/products/TurnHistory.tsx`:

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2 } from 'lucide-react';
import { productsApi, Turn } from '../../services/productsApi';

interface Props {
  productId: string;
  turns: Turn[];
  onReverted: () => void;
}

export const TurnHistory: React.FC<Props> = ({ productId, turns, onReverted }) => {
  const { t } = useTranslation();

  if (turns.length === 0) {
    return <div className="p-4 text-sm text-gray-500">{t('products.history.empty')}</div>;
  }

  const revert = async (turnId: string) => {
    await productsApi.revert(productId, turnId);
    onReverted();
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">{t('products.history.title')}</h3>
      {turns.map((turn) => (
        <div key={turn.id} className="p-3 bg-white border border-gray-200 rounded-xl">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-gray-900 break-words">{turn.prompt}</div>
              {turn.status === 'reverted' && (
                <span className="text-xs text-amber-600">{t('products.history.reverted')}</span>
              )}
              {turn.status === 'failed' && (
                <span className="text-xs text-red-600">{t('products.history.failed')}</span>
              )}
              {turn.tokens_spent > 0 && (
                <span className="ml-2 text-xs text-gray-400">
                  {t('products.history.tokens', { count: turn.tokens_spent })}
                </span>
              )}
            </div>
            {turn.sha_before && turn.status === 'done' && (
              <button
                onClick={() => revert(turn.id)}
                className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
              >
                <Undo2 className="w-3 h-3" />
                {t('products.history.revert')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
```

Кнопка отката показывается только у `done`-ходов с точкой возврата: у `failed` откатывать нечего, а у `reverted` дерево уже вернули.

- [ ] **Step 2: Написать страницу**

`src/pages/ProductsPage.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { ProductsListView } from '../components/products/ProductsListView';
import { ProductChat } from '../components/products/ProductChat';
import { TurnHistory } from '../components/products/TurnHistory';
import { productsApi, Product, Turn } from '../services/productsApi';

const ProductsPage: React.FC = () => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Product | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);

  const reloadTurns = useCallback(() => {
    if (selected) productsApi.turns(selected.id).then(setTurns);
  }, [selected]);

  useEffect(() => {
    reloadTurns();
  }, [reloadTurns]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-24">
        {!selected ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('products.title')}</h1>
            <p className="text-sm text-gray-500 mb-4">{t('products.subtitle')}</p>
            <ProductsListView onOpen={setSelected} />
          </>
        ) : (
          <>
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-sm text-gray-500 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('products.title')}
            </button>
            <h1 className="text-xl font-bold text-gray-900 mb-4">{selected.name}</h1>
            <ProductChat product={selected} onTurnFinished={reloadTurns} />
            <div className="mt-6">
              <TurnHistory productId={selected.id} turns={turns} onReverted={reloadTurns} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProductsPage;
```

- [ ] **Step 3: Подключить роут**

В `src/App.tsx` рядом с остальными lazy-импортами:

```tsx
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
```

и в `<Routes>` рядом с `/studio`:

```tsx
<Route path="/products" element={<ProductsPage />} />
```

- [ ] **Step 4: Добавить пункт навигации**

В `src/components/layout/Navigation.tsx` добавить `Server` в импорт из `lucide-react`, затем объявить пункт рядом со `studioNavItem` (строка 102):

```tsx
  const productsNavItem = {
    to: '/products',
    icon: Server,
    label: t('products.nav'),
    isLogo: false,
  };
```

и вставить его в `navItems` (строка 118) под тем же условием, что и админский:

```tsx
  const navItems = [
    ...baseNavItems,
    // Студия доступна всем (создание агентов и Telegram-ботов).
    studioNavItem,
    // Продукты в куске 1 заводит только владелец, у остальных список пуст —
    // пустая вкладка у всех 94 пользователей это шум. Условие снимается в
    // куске 4, когда появится self-serve.
    ...(user?.isAdmin ? [productsNavItem] : []),
    // Админ-инструменты — только для админов.
    ...(user?.isAdmin ? [adminNavItem] : []),
    profileNavItem,
    helpNavItem,
  ];
```

- [ ] **Step 5: Собрать фронт на тестовой ноде**

Локально `pnpm build` не гонять — мак не тянет.

```bash
git push -u origin <ветка>
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && git fetch -q origin && git checkout -q <sha>'
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm install && pnpm build'
```

Expected: сборка проходит.

Проверку типов делать с явным проектом — голый `tsc --noEmit` в этом репозитории компилирует ноль файлов и всегда зелёный:

```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && npx tsc --noEmit -p tsconfig.app.json'
```

- [ ] **Step 6: Коммит**

```bash
git add src/components/products/ src/pages/ProductsPage.tsx src/App.tsx src/components/layout/Navigation.tsx
git commit -m "feat(products): кабинет продуктов — история, откат, роут и навигация"
```

---

## Проверка перед сдачей

**Раннер:**
- [ ] `cd product-runner && npx jest` — зелено
- [ ] Health-check проверен сломанной нарочно проверкой: без разбора content-type тест про SPA-фолбэк должен краснеть
- [ ] На тестовой ноде: `npm run build` в `product-runner/` — без ошибок, вывод смотрен целиком, а не хвостом

**Бэкенд:**
- [ ] `npx jest src/products` — зелено
- [ ] `npx jest src/tokens/balance-writes.guard.spec.ts` — зелено

**Фронт:**
- [ ] Тесты `productsApi` — зелено
- [ ] Все семь локалей — валидный JSON, ключи `products.*` есть в каждой
- [ ] `npx tsc --noEmit -p tsconfig.app.json` — без ошибок (именно с `-p`, иначе проверяется пустота)
- [ ] `pnpm build` на тестовой ноде — проходит

**Живая проверка на `test.linkeon.io`:**
- [ ] Heartbeat идёт, `runner_seen_at` обновляется без заданий
- [ ] Безобидный ход завершается `done`, токены списаны
- [ ] Ломающий ход завершается `reverted`, сайт жив, токены не списаны
- [ ] Кнопка отката возвращает дерево и не тарифицируется
- [ ] Остановленный раннер не теряет `queued`-ход, а подвисший `running` снимается серверным сборщиком

Выкатывать через `bash ~/Downloads/spirits_back/scripts/deploy.sh` без флагов и только после явного согласования. Раннер `deploy.sh` не катает — он ставится на клиентскую VM отдельно по `product-runner/README.md`.
