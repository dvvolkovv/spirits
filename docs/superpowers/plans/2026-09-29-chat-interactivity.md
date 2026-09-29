# Интерактивность чата — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вместо трёх точек показывать шаги работы ассистента, и научить ассистентов задавать уточняющие вопросы карточкой с вариантами.

**Architecture:** Бэк перестаёт выбрасывать событие `tool` от релея и превращает его в `{type:'activity', kind, detail?}` (функция `toActivity`). Правило про карточки (`ASK_RULE`) идёт в системный промпт. И то и другое включается, только если клиент прислал `ui`. Фронт рисует шаги (`ActivitySteps.tsx`) и разбирает блок ` ```ask ` в тексте ответа в карточку (`AskCard.tsx`). Релей не меняется.

**Tech Stack:** NestJS 10 + jest/ts-jest (`spirits_back`), React 18 + TS + Tailwind + i18next + vitest (`spirits_front`).

**Спецификация:** `docs/superpowers/specs/2026-09-29-chat-interactivity-design.md`

---

## Правила прогона (читать до начала)

- **Тяжёлое — только на тестовой ноде `dv@85.192.61.231`**: jest бэка, `tsc`, `pnpm build`, полный vitest. На маке можно только точечный `vitest run <файл>`, eslint по файлам и `node scripts/check-*.mjs`.
- `source ~/.nvm/nvm.sh` — в каждой ssh-команде.
- Код на ноду — только `git push` + `checkout <sha>`, никакого rsync.
- Бэк ставится через `npm ci`, не pnpm.
- Коммиты с «красным» тестом — нормальная практика репо (`test(...): … — красный`): без пуша тест бэка не прогнать.
- Каждый коммит заканчивается строкой `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Файлы добавлять поимённо (`git add <путь>`); `pnpm-workspace.yaml` не коммитить.
- В `~/Downloads/spirits_*` могут работать параллельные сессии: чужое незакоммиченное не трогать.

Пути ниже:
- `BACK` = `~/Downloads/spirits_back/.worktrees/chat-interactivity`
- `FRONT` = `~/Downloads/spirits_front/.worktrees/chat-interactivity`

---

## Task 0: Рабочие места

- [ ] **Step 1: Фронт — worktree на ветку со спекой.** Ветка `feat/chat-interactivity` уже есть и сейчас выставлена в общем чекауте. Вернуть общий чекаут на `main` и вынести ветку в worktree:

```bash
git -C ~/Downloads/spirits_front status --short   # должно быть пусто, иначе стоп и спросить
git -C ~/Downloads/spirits_front switch main
git -C ~/Downloads/spirits_front worktree add .worktrees/chat-interactivity feat/chat-interactivity
git -C ~/Downloads/spirits_front/.worktrees/chat-interactivity log --oneline -2
```

Ожидается: наверху коммиты `docs(plan)…`/`docs(spec)…`.

- [ ] **Step 2: Бэк — ветка и worktree от свежего origin/main.** Upstream снять: иначе `git push` без аргументов уедет в main.

```bash
git -C ~/Downloads/spirits_back fetch -q origin
git -C ~/Downloads/spirits_back worktree add .worktrees/chat-interactivity -b feat/chat-interactivity origin/main
git -C ~/Downloads/spirits_back/.worktrees/chat-interactivity branch --unset-upstream
```

- [ ] **Step 3: Скрипт прогона бэка на ноде** — `~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh` (каталог `.worktrees/` в .gitignore):

```bash
#!/usr/bin/env bash
# Пушит текущий HEAD ветки и гоняет jest на ноде ровно на этом sha.
set -euo pipefail
WT=~/Downloads/spirits_back/.worktrees/chat-interactivity
SHA=$(git -C "$WT" rev-parse HEAD)
git -C "$WT" push -q origin HEAD:refs/heads/feat/chat-interactivity
ssh dv@85.192.61.231 "cd ~/ci/wt/chat-interactivity-back && git fetch -q origin && git checkout -q --detach $SHA && git log -1 --oneline && source ~/.nvm/nvm.sh && npx jest $* --maxWorkers=2"
```

```bash
chmod +x ~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh
```

- [ ] **Step 4: Worktree-ы на ноде** (свои, не общий `~/ci/spirits_*`: его переключают из-под рук):

```bash
ssh dv@85.192.61.231 'git -C ~/ci/spirits_back fetch -q origin && git -C ~/ci/spirits_back worktree add --detach ~/ci/wt/chat-interactivity-back origin/main && cd ~/ci/wt/chat-interactivity-back && source ~/.nvm/nvm.sh && npm ci >/dev/null && echo back-ok'
ssh dv@85.192.61.231 'git -C ~/ci/spirits_front fetch -q origin && git -C ~/ci/spirits_front worktree add --detach ~/ci/wt/chat-interactivity-front origin/main && cd ~/ci/wt/chat-interactivity-front && source ~/.nvm/nvm.sh && pnpm install --frozen-lockfile >/dev/null && echo front-ok'
```

- [ ] **Step 5: Базовая линия — что красное на main ДО нас** (мерить потом дельтой):

```bash
ssh dv@85.192.61.231 'cd ~/ci/wt/chat-interactivity-back && source ~/.nvm/nvm.sh && npx jest src/chat --maxWorkers=2 2>&1 | grep -E "^(Tests|Test Suites):|✕" | tee ~/ci/wt/base-back-jest.txt; npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep -c "error TS" | tee ~/ci/wt/base-back-tsc.txt'
ssh dv@85.192.61.231 'cd ~/ci/wt/chat-interactivity-front && source ~/.nvm/nvm.sh && pnpm typecheck 2>&1 | grep "error TS" | sort > ~/ci/wt/base-front-tsc.txt; wc -l < ~/ci/wt/base-front-tsc.txt; pnpm test 2>&1 | grep -E "Test Files|Tests " | tee ~/ci/wt/base-front-vitest.txt'
```

Записать числа — они понадобятся в Task 8 и Task 16.

- [ ] **Step 6: Проверить, что точечный vitest работает в worktree фронта** (он берёт `node_modules` родительского чекаута; зависимости совпадают с origin/main):

```bash
cd ~/Downloads/spirits_front/.worktrees/chat-interactivity && ../../node_modules/.bin/vitest run src/utils/customMarkdown.test.ts
```

Ожидается: PASS. Если модули не находятся — `pnpm install --frozen-lockfile` в worktree и дальше `./node_modules/.bin/vitest`.

---

# Часть A — бэк (`BACK`)

## Task 1: Разбор возможностей клиента

**Files:**
- Create: `src/chat/client-ui.ts`
- Test: `src/chat/client-ui.spec.ts`

- [ ] **Step 1: Тест**

```ts
// src/chat/client-ui.spec.ts
import { parseClientUi } from './client-ui';

describe('parseClientUi — что умеет клиент чата', () => {
  it('объект от веба: обе возможности', () => {
    expect(parseClientUi({ activity: true, ask: true })).toEqual({ activity: true, ask: true });
  });

  it('строка с JSON — так приходит multipart загрузки файла', () => {
    expect(parseClientUi('{"activity":true}')).toEqual({ activity: true, ask: false });
  });

  it('нет поля — клиент ничего нового не умеет (мобилка, старый веб)', () => {
    expect(parseClientUi(undefined)).toEqual({ activity: false, ask: false });
  });

  it('признаётся только строгое true', () => {
    expect(parseClientUi({ activity: 'true', ask: 1 })).toEqual({ activity: false, ask: false });
  });

  it('мусор равен отсутствию поля', () => {
    expect(parseClientUi('{not json')).toEqual({ activity: false, ask: false });
    expect(parseClientUi(42)).toEqual({ activity: false, ask: false });
    expect(parseClientUi(null)).toEqual({ activity: false, ask: false });
  });
});
```

- [ ] **Step 2: Коммит и прогон — красный**

```bash
git -C $BACK add src/chat/client-ui.spec.ts
git -C $BACK commit -q -m "test(chat): возможности клиента из поля ui — красный" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/client-ui.spec.ts
```

Ожидается: FAIL, `Cannot find module './client-ui'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/client-ui.ts
/**
 * Что умеет клиент чата — сообщает он сам полем `ui` запроса.
 *
 * Веб шлёт `{ activity: true, ask: true }`: рисует шаги работы ассистента и
 * карточки уточняющих вопросов. Мобилка и старые сборки поле не шлют — им не
 * уходят ни события шагов, ни правило про карточки в промпте.
 *
 * Признаём только строгое `true`. Поле приходит и объектом (обычный ход), и
 * строкой с JSON (upload-and-chat — multipart, там всё строки). Мусор равен
 * отсутствию поля: ошибиться в сторону «клиент не умеет» дешевле, чем
 * прислать мобилке событие, которое она вклеит в ответ.
 */
export interface ClientUi {
  activity: boolean;
  ask: boolean;
}

export const NO_CLIENT_UI: ClientUi = { activity: false, ask: false };

export function parseClientUi(raw: unknown): ClientUi {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return { ...NO_CLIENT_UI };
    }
  }
  if (!v || typeof v !== 'object') return { ...NO_CLIENT_UI };
  const o = v as Record<string, unknown>;
  return { activity: o.activity === true, ask: o.ask === true };
}
```

- [ ] **Step 4: Коммит и прогон — зелёный**

```bash
git -C $BACK add src/chat/client-ui.ts
git -C $BACK commit -q -m "feat(chat): parseClientUi — возможности клиента из поля ui" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/client-ui.spec.ts
```

Ожидается: PASS, 5 тестов.

## Task 2: Инструмент → шаг работы

**Files:**
- Create: `src/chat/activity-map.ts`
- Test: `src/chat/activity-map.spec.ts`

- [ ] **Step 1: Тест**

```ts
// src/chat/activity-map.spec.ts
import { toActivity, ActivityKind } from './activity-map';

const PHONE = '79030169187';
const WHO = { userId: PHONE, relaySessionId: `${PHONE}_12_ru` };
const UUID = '0b7c2a4e-1f3d-4c8a-9e2b-5d6f7a8b9c0d';
const json = (o: unknown) => JSON.stringify(o);

describe('toActivity — что видит человек вместо трёх точек', () => {
  it('поиск в интернете — с запросом', () => {
    expect(toActivity('WebSearch', json({ query: 'аренда офиса Казань' }), WHO))
      .toEqual({ type: 'activity', kind: 'web_search', detail: 'аренда офиса Казань' });
  });

  it('чтение страницы — только хост, без пути и параметров', () => {
    expect(toActivity('WebFetch', json({ url: 'https://www.avito.ru/kazan?id=1&token=abc', prompt: 'цены' }), WHO))
      .toEqual({ type: 'activity', kind: 'web_fetch', detail: 'avito.ru' });
  });

  it('input, обрезанный релеем до 300 символов, всё равно даёт закрытое поле', () => {
    const cut = json({ file_path: `/tmp/agent-output/${PHONE}_12_ru/Отчёт.pdf`, content: 'x'.repeat(500) }).slice(0, 300);
    expect(() => JSON.parse(cut)).toThrow();
    expect(toActivity('Write', cut, WHO)).toEqual({ type: 'activity', kind: 'write_file', detail: 'Отчёт.pdf' });
  });

  it('оборванное посередине значение не показывается', () => {
    expect(toActivity('WebSearch', '{"query":"очень длинный запрос, который обре', WHO))
      .toEqual({ type: 'activity', kind: 'web_search' });
  });

  it('загрузка: префикс сессии релея срезан, латинское имя видно', () => {
    expect(toActivity('Read', json({ file_path: `/tmp/agent-uploads/${PHONE}_12_ru_egrul.pdf` }), WHO))
      .toEqual({ type: 'activity', kind: 'read_upload', detail: 'egrul.pdf' });
  });

  it('загрузка с кириллическим именем — без имени: релей заменил буквы подчёркиваниями', () => {
    expect(toActivity('Read', json({ file_path: `/tmp/agent-uploads/${PHONE}_12_ru_______.pdf` }), WHO))
      .toEqual({ type: 'activity', kind: 'read_upload' });
    expect(toActivity('Read', json({ file_path: `/tmp/agent-uploads/${PHONE}_12_ru_2024______.pdf` }), WHO))
      .toEqual({ type: 'activity', kind: 'read_upload' });
  });

  it('незнакомый префикс загрузки: телефон остался в имени — имени нет', () => {
    expect(toActivity('Read', json({ file_path: `/tmp/agent-uploads/${PHONE}_12_report.pdf` }), WHO))
      .toEqual({ type: 'activity', kind: 'read_upload' });
  });

  it('UUID пользователя с почтовым входом тоже не уходит наружу', () => {
    const a = toActivity('Read', json({ file_path: `/tmp/agent-uploads/${UUID}_5_report.pdf` }), { userId: UUID });
    expect(JSON.stringify(a)).not.toContain(UUID);
  });

  it('пути вне папок загрузок и результатов — без имени', () => {
    expect(toActivity('Read', json({ file_path: '/home/dv/file-agent/scripts/hd_bodygraph.py' }), WHO))
      .toEqual({ type: 'activity', kind: 'read_file' });
    expect(toActivity('Write', json({ file_path: '/home/dv/.bashrc' }), WHO))
      .toEqual({ type: 'activity', kind: 'write_file' });
  });

  it('служебный sleep не показывается вовсе', () => {
    expect(toActivity('Bash', json({ command: 'sleep 4' }), WHO)).toBeNull();
  });

  it('прочий Bash — без команды', () => {
    expect(toActivity('Bash', json({ command: `python3 /tmp/x.py ${PHONE}` }), WHO))
      .toEqual({ type: 'activity', kind: 'compute' });
  });

  it('уточнение — в одну строку и не длиннее 80 символов', () => {
    const a = toActivity('WebSearch', json({ query: `строка\nперевод ${'я'.repeat(200)}` }), WHO)!;
    expect(a.detail!.length).toBeLessThanOrEqual(80);
    expect(a.detail).not.toMatch(/\n/);
  });

  it('запрос с телефоном пользователя — без уточнения', () => {
    expect(toActivity('WebSearch', json({ query: `кто звонил с ${PHONE}` }), WHO))
      .toEqual({ type: 'activity', kind: 'web_search' });
  });

  it.each<[string, ActivityKind]>([
    ['Glob', 'search_files'], ['Grep', 'search_files'],
    ['mcp__linkeon__generate_image', 'image_generate'], ['mcp__linkeon__generate_banner', 'image_generate'],
    ['mcp__linkeon__edit_image', 'image_edit'], ['mcp__linkeon__compose_image', 'image_edit'],
    ['mcp__linkeon__upscale_image', 'image_edit'], ['mcp__linkeon__generate_video', 'video'],
    ['mcp__linkeon__generate_speech', 'speech'], ['mcp__linkeon__read_calendar', 'calendar_read'],
    ['mcp__linkeon__propose_calendar_event', 'calendar_propose'], ['mcp__linkeon__manage_routine', 'routine'],
    ['mcp__talerid__list_notes', 'notes'], ['mcp__talerid__create_note', 'notes'],
    ['mcp__talerid__update_note', 'notes'], ['mcp__talerid__delete_note', 'notes'],
    ['mcp__talerid__list_contacts', 'messages_read'], ['mcp__talerid__list_conversations', 'messages_read'],
    ['mcp__talerid__get_messages', 'messages_read'], ['mcp__talerid__search_messages', 'messages_read'],
    ['mcp__talerid__send_message', 'message_send'], ['mcp__talerid__check_mail', 'mail_read'],
    ['mcp__talerid__read_mail', 'mail_read'], ['mcp__talerid__send_mail', 'mail_send'],
    ['mcp__products__manage_product', 'product'],
    ['mcp__linkeon__something_new', 'other'], ['TodoWrite', 'other'],
  ])('%s → %s', (tool, kind) => {
    expect(toActivity(tool, '{}', WHO)).toEqual({ type: 'activity', kind });
  });

  it('в событии нет полей, которые Flutter вклеил бы в текст ответа', () => {
    const input = json({ query: 'q', url: 'https://a.b/c', file_path: '/tmp/agent-output/s/a.txt', command: 'ls' });
    for (const tool of ['WebSearch', 'WebFetch', 'Read', 'Write', 'Bash', 'Glob', 'mcp__products__manage_product', 'x']) {
      const a = toActivity(tool, input, WHO);
      expect(a).not.toBeNull();
      for (const k of ['text', 'content', 'delta']) expect(a).not.toHaveProperty(k);
    }
  });

  it('без имени инструмента шага нет', () => {
    expect(toActivity(undefined, '{}', WHO)).toBeNull();
    expect(toActivity('', '{}', WHO)).toBeNull();
  });
});
```

- [ ] **Step 2: Коммит и прогон — красный**

```bash
git -C $BACK add src/chat/activity-map.spec.ts
git -C $BACK commit -q -m "test(chat): шаг работы из вызова инструмента — красный" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/activity-map.spec.ts
```

Ожидается: FAIL, `Cannot find module './activity-map'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/activity-map.ts
/**
 * Шаг работы ассистента для клиента — из события `tool` релея.
 *
 * Релей (r.linkeon.io, server.mjs) на каждый вызов инструмента шлёт
 * `{type:'tool', tool:<имя>, input:<JSON аргументов, обрезанный до 300 символов>}`.
 * Наружу из этого уходит только код шага и, где это безопасно, короткое
 * уточнение. Команды, пути и телефон пользователя остаются на сервере.
 *
 * ВАЖНО: полей text/content/delta в событии нет и быть не должно. Flutter
 * (lib/services/chat_service.dart) берёт `content ?? text ?? delta` из любого
 * события, кроме begin/end, и вклеил бы шаг в текст ответа.
 *
 * Коды шагов — контракт с фронтом (spirits_front, components/chat/turnActivity.ts,
 * ACTIVITY_KINDS). Незнакомый код фронт показывает как `other`: расхождение
 * портит подпись, но не ломает чат.
 */

export type ActivityKind =
  | 'web_search' | 'web_fetch' | 'read_upload' | 'read_file' | 'write_file' | 'search_files'
  | 'compute' | 'image_generate' | 'image_edit' | 'video' | 'speech' | 'calendar_read'
  | 'calendar_propose' | 'routine' | 'notes' | 'messages_read' | 'message_send'
  | 'mail_read' | 'mail_send' | 'product' | 'other';

export interface ActivityEvent {
  type: 'activity';
  kind: ActivityKind;
  detail?: string;
}

export interface ActivityOwner {
  userId: string;
  /** Ключ сессии релея: с него начинается имя загруженного файла на диске релея. */
  relaySessionId?: string;
}

const BY_NAME: Record<string, ActivityKind> = {
  Glob: 'search_files',
  Grep: 'search_files',
  mcp__linkeon__generate_image: 'image_generate',
  mcp__linkeon__generate_banner: 'image_generate',
  mcp__linkeon__edit_image: 'image_edit',
  mcp__linkeon__compose_image: 'image_edit',
  mcp__linkeon__upscale_image: 'image_edit',
  mcp__linkeon__generate_video: 'video',
  mcp__linkeon__generate_speech: 'speech',
  mcp__linkeon__read_calendar: 'calendar_read',
  mcp__linkeon__propose_calendar_event: 'calendar_propose',
  mcp__linkeon__manage_routine: 'routine',
  mcp__talerid__list_notes: 'notes',
  mcp__talerid__create_note: 'notes',
  mcp__talerid__update_note: 'notes',
  mcp__talerid__delete_note: 'notes',
  mcp__talerid__list_contacts: 'messages_read',
  mcp__talerid__list_conversations: 'messages_read',
  mcp__talerid__get_messages: 'messages_read',
  mcp__talerid__search_messages: 'messages_read',
  mcp__talerid__send_message: 'message_send',
  mcp__talerid__check_mail: 'mail_read',
  mcp__talerid__read_mail: 'mail_read',
  mcp__talerid__send_mail: 'mail_send',
  mcp__products__manage_product: 'product',
};

const DETAIL_MAX = 80;
const UPLOAD_DIR = '/tmp/agent-uploads/';
const OUTPUT_DIR = '/tmp/agent-output/';

/** Поле аргументов. input обрезан релеем — целиком он часто не разбирается. */
function inputField(raw: unknown, key: string): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  try {
    const v = JSON.parse(raw)?.[key];
    return typeof v === 'string' ? v : undefined;
  } catch {
    // Обрезанный JSON: достаём поле регуляркой, но только если строка успела
    // закрыться кавычкой. Оборванное посередине значение не показываем.
    const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(raw);
    if (!m) return undefined;
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return undefined;
    }
  }
}

function cleanDetail(s: string | undefined, userId: string): string | undefined {
  if (!s) return undefined;
  const one = s.replace(/\s+/g, ' ').trim();
  if (!one) return undefined;
  if (userId && one.includes(userId)) return undefined;
  return one.length > DETAIL_MAX ? `${one.slice(0, DETAIL_MAX - 1)}…` : one;
}

function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

/** Имя файла для показа, если его можно показать. */
function fileName(filePath: string, who: ActivityOwner): string | undefined {
  let base = filePath.slice(filePath.lastIndexOf('/') + 1);
  if (filePath.startsWith(UPLOAD_DIR)) {
    // Релей кладёт загрузку как `<ключ сессии>_<имя>` и меняет всё, кроме
    // [a-zA-Z0-9._-], на «_» (relay-agent/paths.mjs, uploadFileName).
    if (who.relaySessionId) {
      const prefix = `${who.relaySessionId.replace(/[^a-zA-Z0-9._-]/g, '_')}_`;
      if (base.startsWith(prefix)) base = base.slice(prefix.length);
    }
    // Кириллическое имя после релея — строка подчёркиваний («выписка.pdf» →
    // «_______.pdf»). Человеку оно ничего не скажет: лучше шаг без имени.
    const stem = base.replace(/\.[^.]*$/, '');
    if (!/[a-zA-Z0-9]/.test(stem) || /__/.test(stem)) return undefined;
  }
  return cleanDetail(base, who.userId);
}

export function toActivity(tool: unknown, rawInput: unknown, who: ActivityOwner): ActivityEvent | null {
  if (typeof tool !== 'string' || !tool) return null;
  const ev = (kind: ActivityKind, detail?: string): ActivityEvent =>
    detail ? { type: 'activity', kind, detail } : { type: 'activity', kind };

  switch (tool) {
    case 'WebSearch':
      return ev('web_search', cleanDetail(inputField(rawInput, 'query'), who.userId));
    case 'WebFetch':
      return ev('web_fetch', cleanDetail(hostOf(inputField(rawInput, 'url')), who.userId));
    case 'Read': {
      const p = inputField(rawInput, 'file_path');
      if (p?.startsWith(UPLOAD_DIR)) return ev('read_upload', fileName(p, who));
      if (p?.startsWith(OUTPUT_DIR)) return ev('read_file', fileName(p, who));
      return ev('read_file');
    }
    case 'Write':
    case 'Edit': {
      const p = inputField(rawInput, 'file_path');
      return ev('write_file', p?.startsWith(OUTPUT_DIR) ? fileName(p, who) : undefined);
    }
    case 'Bash': {
      // «sleep 4» — повтор подключения MCP по инструкции релея. Системный
      // промпт релея прямо запрещает показывать эту кухню пользователю.
      const cmd = inputField(rawInput, 'command');
      if (cmd && /^\s*sleep\s+\d+(\.\d+)?\s*$/.test(cmd)) return null;
      return ev('compute');
    }
    default:
      return ev(BY_NAME[tool] ?? 'other');
  }
}
```

- [ ] **Step 4: Коммит и прогон — зелёный**

```bash
git -C $BACK add src/chat/activity-map.ts
git -C $BACK commit -q -m "feat(chat): toActivity — шаг работы из вызова инструмента без служебных подробностей" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/activity-map.spec.ts
```

Ожидается: PASS.

## Task 3: Правило про карточки

**Files:**
- Create: `src/chat/ask-rule.ts`
- Test: `src/chat/ask-rule.spec.ts`

- [ ] **Step 1: Тест**

```ts
// src/chat/ask-rule.spec.ts
import { ASK_RULE } from './ask-rule';

describe('ASK_RULE', () => {
  it('пример в правиле — валидный JSON того формата, что разбирает фронт', () => {
    const m = /```ask\n([\s\S]*?)\n```/.exec(ASK_RULE);
    expect(m).not.toBeNull();
    const q = JSON.parse(m![1]).questions[0];
    expect(typeof q.question).toBe('string');
    expect(typeof q.header).toBe('string');
    expect(typeof q.multi).toBe('boolean');
    expect(q.options.length).toBeGreaterThanOrEqual(2);
  });

  it('«Свой вариант» модель не пишет — его добавляет фронт', () => {
    expect(ASK_RULE).toMatch(/Свой вариант.*добавляется сам/);
  });

  it('не спорит с правилом «один вопрос» там, где оно есть (Маша)', () => {
    expect(ASK_RULE).toMatch(/только один вопрос.*в карточке тоже один/);
  });
});
```

- [ ] **Step 2: Коммит и прогон — красный**

```bash
git -C $BACK add src/chat/ask-rule.spec.ts
git -C $BACK commit -q -m "test(chat): правило карточек вопросов — красный" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/ask-rule.spec.ts
```

Ожидается: FAIL, `Cannot find module './ask-rule'`.

- [ ] **Step 3: Реализация**

```ts
// src/chat/ask-rule.ts
/**
 * Правило про уточняющие вопросы карточкой.
 *
 * Только клиенту, который карточку рисует (веб присылает ui.ask, см.
 * client-ui.ts). Мобилка, TG-бот и голос показали бы блок как есть, а TTS
 * зачитал бы JSON.
 *
 * Идёт в СИСТЕМНЫЙ промпт, а не в реплику: релей резюмит сессию, и всё, что
 * лежит в реплике, копится в ней на каждом ходе (так уже раздувало сессии до
 * 99% повторов, замер 30.08.2026). Системный промпт при --resume применяется
 * заново и кэшируется.
 *
 * Формат блока — контракт с фронтом (spirits_front, src/utils/askBlock.ts).
 * Правило собрано массивом строк: в шаблонной строке тройные обратные кавычки
 * пришлось бы экранировать, и пример ломался бы от первой правки.
 */
export const ASK_RULE = [
  '--- УТОЧНЯЮЩИЕ ВОПРОСЫ С ВАРИАНТАМИ ---',
  '• Если без ответа пользователя хорошо не сделать, а ответ укладывается в 2–4 чётких варианта (формат, срок, для кого, какой тон), задай вопрос карточкой — блоком кода с языком ask:',
  '```ask',
  '{"questions":[{"header":"<1–2 слова>","question":"<вопрос>","multi":false,"options":["<вариант>","<вариант>"]}]}',
  '```',
  '• В блоке не больше 3 вопросов, у каждого 2–4 коротких варианта. "multi": true — если можно выбрать несколько.',
  '• Если твои инструкции разрешают только один вопрос за сообщение — в карточке тоже один вопрос.',
  '• Один блок на ответ, в самом конце. После блока ничего не пиши и жди ответа.',
  '• Вариант «Свой вариант» добавляется сам — не пиши его.',
  '• Вопросы и варианты — на языке ответа.',
  '• Не используй карточку в личных, эмоциональных и открытых вопросах («что вы чувствуете», «расскажите подробнее») — там спрашивай обычным текстом.',
  '• Не спрашивай то, что уже известно из разговора или профиля. Если можно сделать хорошо без уточнения — делай.',
].join('\n');
```

- [ ] **Step 4: Коммит и прогон — зелёный**

```bash
git -C $BACK add src/chat/ask-rule.ts
git -C $BACK commit -q -m "feat(chat): ASK_RULE — правило уточняющих вопросов карточкой" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/ask-rule.spec.ts
```

Ожидается: PASS.

## Task 4: Путь релея — шаги и правило

**Files:**
- Modify: `src/chat/chat.service.ts` (импорты; `buildRelayStablePrefix`; `buildUploadHandoff`; `streamChat`; `streamUniversalAgent`)
- Test: `src/chat/chat.service.interactivity.spec.ts`

- [ ] **Step 1: Тест**

```ts
// src/chat/chat.service.interactivity.spec.ts
import { Readable } from 'stream';
import axios from 'axios';
import { ChatService } from './chat.service';
import { ASK_RULE } from './ask-rule';
import { LANGUAGE_REPLY_LINE } from '../common/services/language.service';

jest.mock('axios');

/**
 * Шаги работы и карточки вопросов на пути релея (streamUniversalAgent).
 * Гоняется НАСТОЯЩИЙ метод с замоканными axios/pg/res — как в
 * chat.service.speech-marker.spec.ts.
 */

const PHONE = '79030169187';

function sseStream(events: any[]): Readable {
  const s = new Readable({ read() {} });
  process.nextTick(() => {
    for (const ev of events) s.push(`data: ${JSON.stringify(ev)}\n`);
    s.push(null);
  });
  return s;
}

/** Поля multipart-запроса к релею. */
function fieldsOf(fd: any): Record<string, string> {
  const boundary = fd.getBoundary();
  const raw = fd.getBuffer().toString('utf8');
  const out: Record<string, string> = {};
  for (const part of raw.split(`--${boundary}`)) {
    const name = /name="([^"]+)"/.exec(part);
    const head = part.indexOf('\r\n\r\n');
    if (!name || head < 0) continue;
    out[name[1]] = part.slice(head + 4).replace(/\r\n$/, '');
  }
  return out;
}

const EVENTS = [
  { type: 'tool', tool: 'WebSearch', input: '{"query":"офис Казань"}' },
  { type: 'tool', tool: 'Bash', input: '{"command":"sleep 4"}' },
  { type: 'delta', text: 'Нашёл три варианта.' },
  { type: 'done' },
];

function makeHarness() {
  const written: any[] = [];
  const pg = {
    query: jest.fn(async (sql: string) => {
      if (/AS spent/.test(sql)) return { rows: [{ spent: 0 }] };
      return { rows: [] };
    }),
  };
  const language = { resolveUserLanguage: jest.fn(async () => 'ru') };
  const svc = new ChatService(
    pg as any, null as any, null as any, null as any, null as any,
    language as any, undefined, undefined, undefined, undefined,
  );
  const post = axios.post as jest.Mock;
  post.mockResolvedValue({ data: sseStream(EVENTS) });
  const res: any = {
    status: jest.fn(),
    setHeader: jest.fn(),
    write: jest.fn((l: string) => { written.push(JSON.parse(l)); return true; }),
    end: jest.fn(),
  };
  const run = async (ui?: { activity: boolean; ask: boolean }) => {
    await (svc as any).streamUniversalAgent(
      PHONE, 'найди офис', '12', '12', [], '', res, 'Роман', '', '', undefined, false,
      undefined, undefined, undefined, undefined, undefined, false, ui,
    );
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  };
  return { written, post, run };
}

describe('streamUniversalAgent: шаги работы и правило карточек', () => {
  // persistResponse ставит таймер очистки dedup-карты; без unref jest не выходит.
  const realSetTimeout = global.setTimeout;
  const OLD_SECRET = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-interactivity';
    (global as any).setTimeout = (fn: any, ms?: number, ...a: any[]) => {
      const t: any = (realSetTimeout as any)(fn, ms, ...a);
      if (t && typeof t.unref === 'function') t.unref();
      return t;
    };
  });
  afterAll(() => {
    (global as any).setTimeout = realSetTimeout;
    process.env.JWT_SECRET = OLD_SECRET;
  });
  beforeEach(() => jest.clearAllMocks());

  it('клиенту, который умеет, уходит шаг — без служебного sleep', async () => {
    const h = makeHarness();
    await h.run({ activity: true, ask: false });
    expect(h.written.filter((w) => w.type === 'activity'))
      .toEqual([{ type: 'activity', kind: 'web_search', detail: 'офис Казань' }]);
  });

  it('шаг не попадает в текст ответа', async () => {
    const h = makeHarness();
    await h.run({ activity: true, ask: false });
    const text = h.written.filter((w) => w.type === 'item').map((w) => w.content).join('');
    expect(text).toBe('Нашёл три варианта.');
  });

  it('без ui шагов нет — мобилка получает ход как раньше', async () => {
    const h = makeHarness();
    await h.run(undefined);
    expect(h.written.some((w) => w.type === 'activity')).toBe(false);
  });

  it('правило карточек — в системном промпте при ui.ask, а не в реплике', async () => {
    const h = makeHarness();
    await h.run({ activity: false, ask: true });
    const f = fieldsOf(h.post.mock.calls[0][1]);
    expect(f.systemPrompt).toContain(ASK_RULE);
    // В реплике правило копилось бы в резюмируемой сессии на каждом ходе.
    expect(f.message).not.toContain('УТОЧНЯЮЩИЕ ВОПРОСЫ');
    // Язык по-прежнему последней строкой перед репликой.
    expect(f.message).toContain(LANGUAGE_REPLY_LINE.ru);
  });

  it('без ui.ask правила нет нигде', async () => {
    const h = makeHarness();
    await h.run(undefined);
    const f = fieldsOf(h.post.mock.calls[0][1]);
    expect(f.systemPrompt).not.toContain('УТОЧНЯЮЩИЕ ВОПРОСЫ');
    expect(f.message).not.toContain('УТОЧНЯЮЩИЕ ВОПРОСЫ');
  });
});

describe('buildUploadHandoff: системный промпт загрузки совпадает с текстовым ходом', () => {
  it('при ask — с правилом карточек, без — без', async () => {
    const pg = {
      query: jest.fn(async (sql: string) => {
        if (/FROM agents WHERE id/.test(sql)) {
          return { rows: [{ id: 12, name: 'Роман', description: '', system_prompt: '', category: 'business', is_active: true }] };
        }
        return { rows: [] };
      }),
    };
    const language = { resolveUserLanguage: jest.fn(async () => 'ru') };
    const svc = new ChatService(
      pg as any, null as any, null as any, null as any, null as any,
      language as any, undefined, undefined, undefined, undefined,
    );
    const withAsk = await svc.buildUploadHandoff({ userId: PHONE, assistantId: '12', ask: true });
    const without = await svc.buildUploadHandoff({ userId: PHONE, assistantId: '12' });
    expect(withAsk.systemPrompt).toContain(ASK_RULE);
    expect(without.systemPrompt).not.toContain('УТОЧНЯЮЩИЕ ВОПРОСЫ');
  });
});
```

- [ ] **Step 2: Коммит и прогон — красный**

```bash
git -C $BACK add src/chat/chat.service.interactivity.spec.ts
git -C $BACK commit -q -m "test(chat): шаги и правило карточек на пути релея — красный" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/chat.service.interactivity.spec.ts
```

Ожидается: FAIL — шагов нет в `written`, правила нет в `systemPrompt`. (Тест `buildUploadHandoff` может упасть на типах — ts-jest не проверяет их при isolatedModules; падение по содержимому.)

- [ ] **Step 3: Импорты** — в `src/chat/chat.service.ts` после строки `import { MEETING_HONESTY_RULE } from './meeting-honesty';` добавить:

```ts
import { ClientUi, NO_CLIENT_UI } from './client-ui';
import { toActivity } from './activity-map';
import { ASK_RULE } from './ask-rule';
```

- [ ] **Step 4: `buildRelayStablePrefix` — опция `ask`.** В типе `opts` после `profileText?: string;` добавить:

```ts
    /** Клиент рисует карточки вопросов (см. client-ui.ts, ask-rule.ts). */
    ask?: boolean;
```

И перед `return stablePrefix;` этого метода:

```ts
    // Правило карточек — сюда, в системный промпт, а не в реплику: релей
    // резюмит сессию, и реплики в ней копятся (см. ask-rule.ts).
    if (opts.ask) stablePrefix += `${ASK_RULE}\n\n`;
```

- [ ] **Step 5: `buildUploadHandoff` — пробросить `ask`.** В типе параметра `p` после `requestLang?: string;` добавить:

```ts
    // Клиент рисует карточки вопросов. Сессия у загрузки и текста одна, и
    // системный промпт обязан совпадать — иначе правило то есть, то нет.
    ask?: boolean;
```

В вызове `this.buildRelayStablePrefix({ … profileText, })` внутри метода добавить строку `ask: p.ask,` после `profileText,`.

- [ ] **Step 6: `streamChat` — параметр `ui`.** После строки `    probe: boolean = false,` в сигнатуре `streamChat` (первая из двух таких строк в файле, около строки 670) добавить:

```ts
    // Что умеет клиент: шаги работы и карточки вопросов (см. client-ui.ts).
    // Не прислал — не умеет: мобилка и старый веб получают ход как раньше.
    ui: ClientUi = NO_CLIENT_UI,
```

И в вызове `this.streamUniversalAgent(` внутри `streamChat` заменить строку

```ts
        agent.category, probe,
```

на

```ts
        agent.category, probe, ui,
```

- [ ] **Step 7: `streamUniversalAgent` — параметр `ui`.** После строки `    probe: boolean = false,` в сигнатуре `streamUniversalAgent` (вторая такая строка, около 1214) добавить:

```ts
    // Шаги работы и карточки вопросов — см. streamChat.
    ui: ClientUi = NO_CLIENT_UI,
```

- [ ] **Step 8: правило в системный промпт.** Заменить

```ts
    let stablePrefix = await this.buildRelayStablePrefix({
      agentId, agentName, agentDescription, agentSystemPrompt, agentCategory,
      userId, userLanguage, profileText,
    });
```

на

```ts
    let stablePrefix = await this.buildRelayStablePrefix({
      agentId, agentName, agentDescription, agentSystemPrompt, agentCategory,
      userId, userLanguage, profileText, ask: ui.ask,
    });
```

- [ ] **Step 9: ключ сессии — в константу.** Заменить

```ts
        fd.append(
          'sessionId',
          relaySessionKey(userId, assistantId, userLanguage, fresh ? freshSessionId : undefined),
        );
```

на

```ts
        fd.append('sessionId', relaySid);
```

и прямо перед строкой `      const callUpstreamOnce = async (): Promise<void> => {` добавить:

```ts
      // Ключ сессии релея: и в запросе, и для шагов работы — релей кладёт
      // загрузки под именем «<ключ>_<файл>», и префикс надо срезать.
      const relaySid = relaySessionKey(userId, assistantId, userLanguage, fresh ? freshSessionId : undefined);
```

- [ ] **Step 10: событие `tool` → шаг.** В разборе потока `callUpstreamOnce` перед строкой

```ts
                  } else if (ev.type === 'result' && ev.text) {
```

вставить:

```ts
                  } else if (ev.type === 'tool') {
                    // Шаг работы для клиента, который его рисует (activity-map.ts).
                    // В chunks не идёт: к тексту ответа отношения не имеет.
                    if (ui.activity) {
                      const step = toActivity(ev.tool, ev.input, { userId, relaySessionId: relaySid });
                      if (step) safeWrite(step);
                    }
```

- [ ] **Step 11: Коммит и прогон — зелёный**

```bash
git -C $BACK add src/chat/chat.service.ts
git -C $BACK commit -q -m "feat(chat): шаги работы и правило карточек на пути релея" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/chat.service.interactivity.spec.ts src/chat/chat.upload-session.spec.ts src/chat/chat.service.speech-marker.spec.ts src/chat/prompt-language-tail.spec.ts
```

Ожидается: PASS во всех четырёх.

## Task 5: Путь Маши

**Files:**
- Modify: `src/chat/chat.service.ts` (вызов `this.claudeCli.textWithCost` в Маша-only пути)
- Test: `src/chat/chat.service.masha-interactivity.spec.ts`

- [ ] **Step 1: Тест**

```ts
// src/chat/chat.service.masha-interactivity.spec.ts
import { ChatService } from './chat.service';
import { ASK_RULE } from './ask-rule';
import { LANGUAGE_REPLY_LINE } from '../common/services/language.service';

/**
 * Маша (agent 3) идёт локальным CLI, мимо релея. Шаг у неё один возможный —
 * инструмент продуктов, о вызове сообщает onProgress. Правило карточек — в
 * system вызова CLI, до хвоста языка.
 */

const USER = '79030169187';

function makeService() {
  const pg = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT tokens FROM ai_profiles_consolidated')) return { rows: [{ tokens: 100000 }] };
      if (sql.includes('FROM agents a')) {
        return { rows: [{ name: 'Маша', display_name: 'Маша', description: 'психолог', system_prompt: '' }] };
      }
      return { rows: [] };
    }),
  };
  const claudeCli = {
    textWithCost: jest.fn(async (_prompt: string, opts: any) => {
      opts.onProgress?.({ kind: 'tool_use', name: 'mcp__products__manage_product' });
      return { text: 'Поправила заголовок сайта.', costUsd: 0.01 };
    }),
  };
  const language = { resolveUserLanguage: jest.fn(async () => 'ru') };
  const balanceCtx = { buildContextForPrompt: jest.fn(async () => '') };
  const svc = new ChatService(
    pg as any, undefined as any, undefined as any, {} as any,
    claudeCli as any, language as any, balanceCtx as any,
  );
  jest.spyOn(svc as any, 'resolveAgent').mockResolvedValue({
    id: 3, name: 'Маша', description: 'психолог', system_prompt: 'Ты Маша.', category: 'personal',
  });
  jest.spyOn(svc as any, 'saveChatHistory').mockResolvedValue(undefined);
  jest.spyOn(svc as any, 'addTokenTask').mockResolvedValue(undefined);
  return { svc, claudeCli };
}

async function runMasha(ui?: { activity: boolean; ask: boolean }) {
  const { svc, claudeCli } = makeService();
  const writes: any[] = [];
  const res: any = {
    status: jest.fn(() => res),
    setHeader: jest.fn(),
    write: jest.fn((s: string) => { writes.push(JSON.parse(s)); return true; }),
    end: jest.fn(),
    json: jest.fn(),
  };
  await svc.streamChat(USER, 'поправь заголовок', '3', `${USER}_3`, '', res,
    undefined, false, undefined, undefined, false, false, ui);
  await new Promise((r) => setImmediate(r));
  return { opts: claudeCli.textWithCost.mock.calls[0][1], writes };
}

describe('Маша: шаги работы и карточки', () => {
  const OLD_SECRET = process.env.JWT_SECRET;
  const OLD_DS = process.env.DEEPSEEK_API_KEY;
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-masha-interactivity';
    delete process.env.DEEPSEEK_API_KEY;
  });
  afterAll(() => {
    process.env.JWT_SECRET = OLD_SECRET;
    if (OLD_DS === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = OLD_DS;
  });

  it('вызов инструмента продуктов — шаг для клиента, который умеет', async () => {
    const { writes } = await runMasha({ activity: true, ask: false });
    expect(writes.filter((w) => w.type === 'activity')).toEqual([{ type: 'activity', kind: 'product' }]);
  });

  it('без ui шагов нет', async () => {
    const { writes } = await runMasha(undefined);
    expect(writes.some((w) => w.type === 'activity')).toBe(false);
  });

  it('правило карточек в system при ui.ask; язык остаётся последней строкой', async () => {
    const { opts } = await runMasha({ activity: false, ask: true });
    const system = String(opts.system);
    expect(system).toContain(ASK_RULE);
    expect(system.trimEnd().endsWith(LANGUAGE_REPLY_LINE.ru)).toBe(true);
  });

  it('без ui.ask правила нет', async () => {
    const { opts } = await runMasha(undefined);
    expect(String(opts.system)).not.toContain('УТОЧНЯЮЩИЕ ВОПРОСЫ');
  });
});
```

- [ ] **Step 2: Коммит и прогон — красный**

```bash
git -C $BACK add src/chat/chat.service.masha-interactivity.spec.ts
git -C $BACK commit -q -m "test(chat): шаги и карточки у Маши — красный" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/chat.service.masha-interactivity.spec.ts
```

Ожидается: FAIL в тестах «шаг» и «правило в system»; тесты «без ui» проходят.

- [ ] **Step 3: Реализация.** В Маша-only пути заменить

```ts
          system: stableSystemPrompt + `\n\n${products.promptBlock}` + volatileSystemPrompt + replyLanguageTail,
```

на

```ts
          // Правило карточек — только клиенту, который их рисует; до хвоста
          // языка, который обязан остаться последним.
          system: stableSystemPrompt + `\n\n${products.promptBlock}` +
            (ui.ask ? `\n\n${ASK_RULE}` : '') + volatileSystemPrompt + replyLanguageTail,
```

и заменить

```ts
          onProgress: (ev) => {
            if (ev.kind === 'tool_use' && ev.name === products.toolName) usedProductsTool = true;
          },
```

на

```ts
          onProgress: (ev) => {
            if (ev.kind === 'tool_use' && ev.name === products.toolName) usedProductsTool = true;
            // Шаг работы для клиента, который его рисует. Аргументов onProgress
            // не отдаёт — хватает имени: у Маши из инструментов только продукты.
            if (ui.activity && ev.kind === 'tool_use') {
              const step = toActivity(ev.name, '', { userId });
              if (step) {
                try { res.write(JSON.stringify(step) + '\n'); } catch { /* клиент ушёл — ход доводим */ }
              }
            }
          },
```

- [ ] **Step 4: Коммит и прогон — зелёный**

```bash
git -C $BACK add src/chat/chat.service.ts
git -C $BACK commit -q -m "feat(chat): шаги и правило карточек у Маши" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/chat.service.masha-interactivity.spec.ts src/chat/chat.service.masha-products.spec.ts
```

Ожидается: PASS в обоих.

## Task 6: Контроллер — `ui` из запроса, шаги в загрузке

**Files:**
- Modify: `src/chat/chat.controller.ts` (хендлеры `chat` и `uploadAndChat`)
- Test: `src/chat/chat.controller.interactivity.spec.ts`

- [ ] **Step 1: Тест**

```ts
// src/chat/chat.controller.interactivity.spec.ts
import { Readable } from 'stream';
import axios from 'axios';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

jest.mock('axios');
jest.mock('../common/telegram-alert', () => ({ sendTelegramAlert: jest.fn(async () => {}) }));

const PHONE = '79030169187';

function sseStream(events: any[]): Readable {
  const s = new Readable({ read() {} });
  process.nextTick(() => {
    for (const ev of events) s.push(`data: ${JSON.stringify(ev)}\n`);
    s.push(null);
  });
  return s;
}

function makeRes() {
  const written: any[] = [];
  return {
    written,
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    write: jest.fn((s: string) => { try { written.push(JSON.parse(s)); } catch {} return true; }),
    end: jest.fn(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as any;
}

const jwtSvc = { verify: jest.fn(() => ({ type: 'access', userId: PHONE })) };

describe('POST soulmate/chat: ui доезжает до сервиса', () => {
  const run = async (body: any) => {
    const streamChat = jest.fn(async () => {});
    const ctrl = new ChatController({ streamChat } as any, jwtSvc as any, undefined as any, undefined);
    await ctrl.chat(
      { headers: { authorization: 'Bearer t' }, body: { chatInput: 'привет', assistant: '12', ...body } } as any,
      makeRes(),
    );
    const args = streamChat.mock.calls[0] as any[];
    return args[args.length - 1];
  };

  it('веб прислал ui — сервис получает обе возможности', async () => {
    expect(await run({ ui: { activity: true, ask: true } })).toEqual({ activity: true, ask: true });
  });

  it('без ui — ничего нового', async () => {
    expect(await run({})).toEqual({ activity: false, ask: false });
  });
});

describe('upload-and-chat: шаги работы и правило карточек', () => {
  const AGENT = { id: 12, name: 'Роман', display_name: 'Роман', description: '', system_prompt: '', category: 'business', is_active: true };

  const upload = async (body: any) => {
    const pg = {
      query: jest.fn(async (sql: string) => {
        if (/SELECT tokens FROM ai_profiles_consolidated/.test(sql)) return { rows: [{ tokens: 1_000_000 }] };
        if (/FROM agents WHERE id/.test(sql)) return { rows: [AGENT] };
        return { rows: [] };
      }),
    };
    const language = { resolveUserLanguage: jest.fn(async (_u: string, hint?: string) => hint || 'ru') };
    const svc = new ChatService(
      pg as any, null as any, null as any, null as any, null as any,
      language as any, undefined, undefined, undefined, undefined,
    );
    const ctrl = new ChatController(svc, jwtSvc as any, undefined as any, undefined);
    const post = jest.fn(async () => ({
      data: sseStream([
        { type: 'tool', tool: 'Read', input: `{"file_path":"/tmp/agent-uploads/${PHONE}_12_ru_egrul.pdf"}` },
        { type: 'delta', text: 'Выписка на трёх листах.' },
        { type: 'done' },
      ]),
    }));
    (axios as any).default = { post };
    (axios as any).post = post;
    const res = makeRes();
    await ctrl.uploadAndChat({
      headers: { authorization: 'Bearer t' },
      files: [{ originalname: 'egrul.pdf', buffer: Buffer.from('x'), mimetype: 'application/pdf', size: 1 }],
      body: { message: 'сколько листов?', assistantId: '12', ...body },
    } as any, res);
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    const fd: any = (post.mock.calls[0] as any[])[1];
    return { written: res.written, systemPrompt: fd.getBuffer().toString('utf8') };
  };

  it('клиент прислал ui строкой — шаг чтения файла уходит', async () => {
    const { written } = await upload({ ui: '{"activity":true,"ask":true}' });
    expect(written.filter((w: any) => w.type === 'activity'))
      .toEqual([{ type: 'activity', kind: 'read_upload', detail: 'egrul.pdf' }]);
  });

  it('с ui.ask системный промпт загрузки содержит правило карточек', async () => {
    const { systemPrompt } = await upload({ ui: '{"activity":true,"ask":true}' });
    expect(systemPrompt).toContain('УТОЧНЯЮЩИЕ ВОПРОСЫ');
  });

  it('без ui — ни шагов, ни правила', async () => {
    const { written, systemPrompt } = await upload({});
    expect(written.some((w: any) => w.type === 'activity')).toBe(false);
    expect(systemPrompt).not.toContain('УТОЧНЯЮЩИЕ ВОПРОСЫ');
  });
});
```

- [ ] **Step 2: Коммит и прогон — красный**

```bash
git -C $BACK add src/chat/chat.controller.interactivity.spec.ts
git -C $BACK commit -q -m "test(chat): ui в контроллере и шаги загрузки — красный" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/chat.controller.interactivity.spec.ts
```

Ожидается: FAIL (последний аргумент `streamChat` — `false`, шагов нет, правила нет).

- [ ] **Step 3: Импорты** — в `src/chat/chat.controller.ts` после `import { TEST_USERS } from '../common/test-users';`:

```ts
import { parseClientUi } from './client-ui';
import { toActivity } from './activity-map';
```

- [ ] **Step 4: Хендлер `chat`.** Перед строкой `    const startedAt = Date.now();` добавить:

```ts
    // Что умеет клиент — шаги работы и карточки вопросов (client-ui.ts).
    const ui = parseClientUi(body.ui);
```

и в вызове `this.chatService.streamChat(` заменить

```ts
        storeBuild,
        probe,
      );
```

на

```ts
        storeBuild,
        probe,
        ui,
      );
```

- [ ] **Step 5: `uploadAndChat` — разбор `ui` и правило.** Заменить

```ts
    const handoff = await this.chatService.buildUploadHandoff({
      userId,
      assistantId: String(assistantId),
      profileText,
      freshSessionId,
      requestLang: typeof body.lang === 'string' ? body.lang : undefined,
    });
```

на

```ts
    // Что умеет клиент (client-ui.ts). Тело multipart — ui приезжает строкой.
    const ui = parseClientUi(body.ui);

    const handoff = await this.chatService.buildUploadHandoff({
      userId,
      assistantId: String(assistantId),
      profileText,
      freshSessionId,
      requestLang: typeof body.lang === 'string' ? body.lang : undefined,
      ask: ui.ask,
    });
```

- [ ] **Step 6: `uploadAndChat` — шаги.** В разборе потока релея перед строкой

```ts
              } else if (ev.type === 'result' && ev.text && chunks.length === 0) {
```

вставить:

```ts
              } else if (ev.type === 'tool') {
                // Шаг работы (activity-map.ts): чтение большого PDF — ровно то
                // место, где человек дольше всего смотрит на пустой пузырь.
                if (ui.activity) {
                  const step = toActivity(ev.tool, ev.input, { userId, relaySessionId: handoff.sessionId });
                  if (step) safeWrite(step);
                }
```

- [ ] **Step 7: Коммит и прогон — зелёный**

```bash
git -C $BACK add src/chat/chat.controller.ts
git -C $BACK commit -q -m "feat(chat): ui из запроса; шаги работы и правило карточек в загрузке файла" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat/chat.controller.interactivity.spec.ts src/chat/chat.upload-session.spec.ts src/chat/chat.upload-billing.spec.ts
```

Ожидается: PASS.

## Task 7: Ворота бэка

- [ ] **Step 1: Весь `src/chat` и типы** — сравнить с базовой линией из Task 0 Step 5:

```bash
~/Downloads/spirits_back/.worktrees/backtest-chat-interactivity.sh src/chat 2>&1 | grep -E "^(Tests|Test Suites):|✕"
ssh dv@85.192.61.231 'cd ~/ci/wt/chat-interactivity-back && source ~/.nvm/nvm.sh && npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep "error TS" | head; echo count=$(npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep -c "error TS")'
ssh dv@85.192.61.231 'cat ~/ci/wt/base-back-jest.txt ~/ci/wt/base-back-tsc.txt'
```

Ожидается: упавших тестов не больше, чем в базе, и это те же тесты; ошибок `tsc` не больше базы и ни одной в наших файлах. Любое новое падение — чинить до перехода дальше.

- [ ] **Step 2: Сборка** (ловит то, что пропускают jest и tsc, — см. заметку про подпроекты в корне):

```bash
ssh dv@85.192.61.231 'cd ~/ci/wt/chat-interactivity-back && source ~/.nvm/nvm.sh && npm run build 2>&1 | tail -3'
```

Ожидается: без ошибок.

---

# Часть B — фронт (`FRONT`)

Точечный прогон: `cd $FRONT && ../../node_modules/.bin/vitest run <файл>` (или `./node_modules/.bin/vitest`, если в Task 0 Step 6 ставили зависимости в worktree).

## Task 8: Логика шагов хода

**Files:**
- Create: `src/components/chat/turnActivity.ts`
- Test: `src/components/chat/turnActivity.test.ts`

Компонент отрисовки будет называться `ActivitySteps.tsx`, а НЕ `TurnActivity.tsx`: на маке ФС нечувствительна к регистру, и импорт `./TurnActivity` найдёт `turnActivity.ts`.

- [ ] **Step 1: Тест**

```ts
// src/components/chat/turnActivity.test.ts
import { describe, it, expect } from 'vitest';
import ru from '../../i18n/locales/ru.json';
import {
  ACTIVITY_KINDS, startActivity, addStep, markTextStarted, finishActivity, normalizeKind, durationParts,
} from './turnActivity';

describe('шаги хода', () => {
  it('новый шаг закрывает предыдущий', () => {
    let a = startActivity(0);
    a = addStep(a, 'web_search', 'офис');
    a = addStep(a, 'web_fetch', 'avito.ru');
    expect(a.steps.map((s) => [s.kind, s.done])).toEqual([['web_search', true], ['web_fetch', false]]);
  });

  it('повтор того же шага — счётчик, а не новая строка', () => {
    let a = startActivity(0);
    for (let i = 0; i < 6; i++) a = addStep(a, 'compute');
    expect(a.steps).toEqual([{ kind: 'compute', detail: undefined, count: 6, done: false }]);
  });

  it('тот же вид с другим уточнением — отдельная строка', () => {
    const a = addStep(addStep(startActivity(0), 'web_search', 'а'), 'web_search', 'б');
    expect(a.steps).toHaveLength(2);
  });

  it('пошёл текст — текущий шаг сделан; без шагов состояние то же самое', () => {
    const empty = startActivity(0);
    expect(markTextStarted(empty)).toBe(empty);
    expect(markTextStarted(addStep(empty, 'web_search')).steps[0].done).toBe(true);
  });

  it('текст идёт дальше — объект не пересоздаётся (нет лишних перерисовок)', () => {
    const a = markTextStarted(addStep(startActivity(0), 'web_search'));
    expect(markTextStarted(a)).toBe(a);
  });

  it('конец хода: итог с длительностью, все шаги сделаны', () => {
    const a = addStep(addStep(startActivity(1000), 'web_search'), 'write_file', 'Отчёт.pdf');
    expect(finishActivity(a, 43_000)).toEqual({
      steps: [
        { kind: 'web_search', detail: undefined, count: 1, done: true },
        { kind: 'write_file', detail: 'Отчёт.pdf', count: 1, done: true },
      ],
      durationMs: 42_000,
    });
  });

  it('ход без шагов итога не оставляет', () => {
    expect(finishActivity(startActivity(0), 8000)).toBeUndefined();
  });

  it('незнакомый код от более нового бэка — other', () => {
    expect(normalizeKind('teleport')).toBe('other');
    expect(addStep(startActivity(0), 'teleport').steps[0].kind).toBe('other');
  });

  it('у каждого вида шага есть подпись в ru.json', () => {
    const kinds = (ru as any).chat.activity.kind;
    for (const k of ACTIVITY_KINDS) expect(typeof kinds[k]).toBe('string');
    expect(typeof kinds.read_file_plain).toBe('string');
  });

  it('длительность — минуты и секунды', () => {
    expect(durationParts(42_400)).toEqual({ m: 0, s: 42 });
    expect(durationParts(185_000)).toEqual({ m: 3, s: 5 });
  });
});
```

- [ ] **Step 2: Прогон — красный**

`cd $FRONT && ../../node_modules/.bin/vitest run src/components/chat/turnActivity.test.ts` → FAIL, модуль не найден.

- [ ] **Step 3: Реализация**

```ts
// src/components/chat/turnActivity.ts
// Шаги работы ассистента за один ход — то, что показывается вместо трёх точек.
//
// Бэкенд присылает события {type:'activity', kind, detail?} (spirits_back,
// chat/activity-map.ts). Здесь — чистая логика: склейка повторов, отметка
// «сделано», итог хода. Отрисовка — ActivitySteps.tsx.

/** Коды шагов — контракт с бэком (activity-map.ts, ActivityKind). */
export const ACTIVITY_KINDS = [
  'web_search', 'web_fetch', 'read_upload', 'read_file', 'write_file', 'search_files',
  'compute', 'image_generate', 'image_edit', 'video', 'speech', 'calendar_read',
  'calendar_propose', 'routine', 'notes', 'messages_read', 'message_send',
  'mail_read', 'mail_send', 'product', 'other',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface ActivityStep {
  kind: ActivityKind;
  detail?: string;
  /** Сколько раз подряд пришёл тот же шаг: «Обрабатываю данные ×6». */
  count: number;
  /**
   * Шаг закончился. Успешно ли — неизвестно: результатов инструментов релей
   * не присылает. Поэтому и отметка на экране нейтральная.
   */
  done: boolean;
}

export interface TurnActivity {
  startedAt: number;
  steps: ActivityStep[];
}

/** Итог хода. Живёт у завершённого сообщения только в памяти. */
export interface ActivitySummary {
  steps: ActivityStep[];
  durationMs: number;
}

export function startActivity(at: number): TurnActivity {
  return { startedAt: at, steps: [] };
}

export function normalizeKind(kind: unknown): ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(kind as string) ? (kind as ActivityKind) : 'other';
}

const closeLast = (steps: ActivityStep[]): ActivityStep[] => {
  const last = steps[steps.length - 1];
  return last && !last.done ? [...steps.slice(0, -1), { ...last, done: true }] : steps;
};

/** Пришёл шаг: предыдущий сделан, повтор того же — счётчик. */
export function addStep(a: TurnActivity, kind: unknown, detail?: unknown): TurnActivity {
  const k = normalizeKind(kind);
  const d = typeof detail === 'string' && detail.trim() ? detail.trim() : undefined;
  const last = a.steps[a.steps.length - 1];
  if (last && last.kind === k && last.detail === d) {
    return { ...a, steps: [...a.steps.slice(0, -1), { ...last, count: last.count + 1, done: false }] };
  }
  return { ...a, steps: [...closeLast(a.steps), { kind: k, detail: d, count: 1, done: false }] };
}

/** Пошёл текст ответа: текущий шаг закончился. Без изменений — тот же объект. */
export function markTextStarted(a: TurnActivity): TurnActivity {
  const steps = closeLast(a.steps);
  return steps === a.steps ? a : { ...a, steps };
}

/** Ход закончился. Без шагов итога нет: «Думал 8 с» над каждым ответом — шум. */
export function finishActivity(a: TurnActivity, at: number): ActivitySummary | undefined {
  if (a.steps.length === 0) return undefined;
  return {
    steps: a.steps.map((s) => (s.done ? s : { ...s, done: true })),
    durationMs: Math.max(0, at - a.startedAt),
  };
}

export function durationParts(ms: number): { m: number; s: number } {
  const total = Math.max(0, Math.round(ms / 1000));
  return { m: Math.floor(total / 60), s: total % 60 };
}
```

- [ ] **Step 4: Прогон.** Тест «подпись в ru.json» упадёт до Task 9 — это ожидаемо. Остальные должны пройти:

`../../node_modules/.bin/vitest run src/components/chat/turnActivity.test.ts` → 9 passed, 1 failed («у каждого вида шага есть подпись»).

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/turnActivity.ts src/components/chat/turnActivity.test.ts
git -C $FRONT commit -q -m "feat(chat): логика шагов хода — склейка, «сделано», итог" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 9: Локали

**Files:** Modify: `src/i18n/locales/{ru,en,de,es,fr,pt,zh}.json` — ключи `chat.activity.*` и `chat.ask.*`.

Файлы локалей переживают `JSON.stringify(…, null, 2) + '\n'` байт в байт (проверено), поэтому ключи вставляются скриптом без лишнего диффа. Плюральные категории — ровно те, что у существующего `chat.file_count_*` в каждой локали (ru: one/few/many/other; en, de: one/other; es, fr, pt: one/many/other; zh: other). Обращение — как в локали: de/es/fr/zh на «ты», pt нейтрально, ru на «вы».

- [ ] **Step 1: Скрипт** — сохранить как `$FRONT/add-chat-keys.tmp.mjs`, запустить из `$FRONT` и сразу удалить:

```js
import { readFileSync, writeFileSync } from 'node:fs';

const K = {
  ru: {
    activity: {
      thinking: 'Думает', sec: '{{s}} с', min_sec: '{{m}} мин {{s}} с',
      steps_one: '{{count}} шаг', steps_few: '{{count}} шага', steps_many: '{{count}} шагов', steps_other: '{{count}} шага',
      show: 'Показать шаги', hide: 'Скрыть шаги',
      kind: {
        web_search: 'Ищу в интернете', web_fetch: 'Читаю страницу', read_upload: 'Читаю ваш файл',
        read_file: 'Читаю файл', read_file_plain: 'Изучаю материалы', write_file: 'Готовлю файл',
        search_files: 'Ищу в материалах', compute: 'Обрабатываю данные', image_generate: 'Рисую изображение',
        image_edit: 'Дорабатываю изображение', video: 'Запускаю генерацию видео', speech: 'Озвучиваю текст',
        calendar_read: 'Смотрю календарь', calendar_propose: 'Готовлю событие в календарь',
        routine: 'Настраиваю напоминание', notes: 'Работаю с заметками', messages_read: 'Смотрю сообщения',
        message_send: 'Отправляю сообщение', mail_read: 'Смотрю почту', mail_send: 'Отправляю письмо',
        product: 'Работаю над вашим сайтом или ботом', other: 'Работаю над задачей',
      },
    },
    ask: { custom: 'Свой вариант', custom_placeholder: 'Ваш ответ', submit: 'Ответить', multi_hint: 'Можно выбрать несколько', preparing: 'Готовлю вопрос…' },
  },
  en: {
    activity: {
      thinking: 'Thinking', sec: '{{s}}s', min_sec: '{{m}}m {{s}}s',
      steps_one: '{{count}} step', steps_other: '{{count}} steps',
      show: 'Show steps', hide: 'Hide steps',
      kind: {
        web_search: 'Searching the web', web_fetch: 'Reading a page', read_upload: 'Reading your file',
        read_file: 'Reading a file', read_file_plain: 'Reviewing materials', write_file: 'Preparing a file',
        search_files: 'Searching the materials', compute: 'Processing data', image_generate: 'Drawing an image',
        image_edit: 'Refining the image', video: 'Starting video generation', speech: 'Voicing the text',
        calendar_read: 'Checking the calendar', calendar_propose: 'Preparing a calendar event',
        routine: 'Setting up a reminder', notes: 'Working with notes', messages_read: 'Checking messages',
        message_send: 'Sending a message', mail_read: 'Checking mail', mail_send: 'Sending an email',
        product: 'Working on your website or bot', other: 'Working on the task',
      },
    },
    ask: { custom: 'Other', custom_placeholder: 'Your answer', submit: 'Reply', multi_hint: 'You can pick several', preparing: 'Preparing a question…' },
  },
  de: {
    activity: {
      thinking: 'Denkt nach', sec: '{{s}} s', min_sec: '{{m}} Min. {{s}} s',
      steps_one: '{{count}} Schritt', steps_other: '{{count}} Schritte',
      show: 'Schritte anzeigen', hide: 'Schritte ausblenden',
      kind: {
        web_search: 'Suche im Internet', web_fetch: 'Lese eine Seite', read_upload: 'Lese deine Datei',
        read_file: 'Lese eine Datei', read_file_plain: 'Sehe die Unterlagen durch', write_file: 'Bereite eine Datei vor',
        search_files: 'Durchsuche die Unterlagen', compute: 'Verarbeite Daten', image_generate: 'Zeichne ein Bild',
        image_edit: 'Überarbeite das Bild', video: 'Starte die Videoerstellung', speech: 'Vertone den Text',
        calendar_read: 'Sehe in den Kalender', calendar_propose: 'Bereite einen Kalendertermin vor',
        routine: 'Richte eine Erinnerung ein', notes: 'Arbeite mit Notizen', messages_read: 'Sehe Nachrichten durch',
        message_send: 'Sende eine Nachricht', mail_read: 'Sehe E-Mails durch', mail_send: 'Sende eine E-Mail',
        product: 'Arbeite an deiner Website oder deinem Bot', other: 'Arbeite an der Aufgabe',
      },
    },
    ask: { custom: 'Eigene Antwort', custom_placeholder: 'Deine Antwort', submit: 'Antworten', multi_hint: 'Mehrfachauswahl möglich', preparing: 'Bereite eine Frage vor…' },
  },
  es: {
    activity: {
      thinking: 'Pensando', sec: '{{s}} s', min_sec: '{{m}} min {{s}} s',
      steps_one: '{{count}} paso', steps_many: '{{count}} de pasos', steps_other: '{{count}} pasos',
      show: 'Mostrar pasos', hide: 'Ocultar pasos',
      kind: {
        web_search: 'Buscando en internet', web_fetch: 'Leyendo una página', read_upload: 'Leyendo tu archivo',
        read_file: 'Leyendo un archivo', read_file_plain: 'Revisando materiales', write_file: 'Preparando un archivo',
        search_files: 'Buscando en los materiales', compute: 'Procesando datos', image_generate: 'Dibujando una imagen',
        image_edit: 'Retocando la imagen', video: 'Iniciando la generación del vídeo', speech: 'Poniendo voz al texto',
        calendar_read: 'Consultando el calendario', calendar_propose: 'Preparando un evento de calendario',
        routine: 'Configurando un recordatorio', notes: 'Trabajando con notas', messages_read: 'Revisando mensajes',
        message_send: 'Enviando un mensaje', mail_read: 'Revisando el correo', mail_send: 'Enviando un correo',
        product: 'Trabajando en tu sitio web o bot', other: 'Trabajando en la tarea',
      },
    },
    ask: { custom: 'Otra respuesta', custom_placeholder: 'Tu respuesta', submit: 'Responder', multi_hint: 'Puedes elegir varias', preparing: 'Preparando una pregunta…' },
  },
  fr: {
    activity: {
      thinking: 'Réfléchit', sec: '{{s}} s', min_sec: '{{m}} min {{s}} s',
      steps_one: '{{count}} étape', steps_many: "{{count}} d'étapes", steps_other: '{{count}} étapes',
      show: 'Afficher les étapes', hide: 'Masquer les étapes',
      kind: {
        web_search: 'Recherche sur internet', web_fetch: "Lecture d'une page", read_upload: 'Lecture de ton fichier',
        read_file: "Lecture d'un fichier", read_file_plain: 'Examen des documents', write_file: "Préparation d'un fichier",
        search_files: 'Recherche dans les documents', compute: 'Traitement des données', image_generate: "Création d'une image",
        image_edit: "Retouche de l'image", video: 'Lancement de la génération vidéo', speech: 'Mise en voix du texte',
        calendar_read: 'Consultation du calendrier', calendar_propose: "Préparation d'un événement",
        routine: "Configuration d'un rappel", notes: 'Travail sur les notes', messages_read: 'Consultation des messages',
        message_send: "Envoi d'un message", mail_read: 'Consultation du courrier', mail_send: "Envoi d'un e-mail",
        product: 'Travail sur ton site ou ton bot', other: 'Travail sur la tâche',
      },
    },
    ask: { custom: 'Autre réponse', custom_placeholder: 'Ta réponse', submit: 'Répondre', multi_hint: 'Plusieurs choix possibles', preparing: "Préparation d'une question…" },
  },
  pt: {
    activity: {
      thinking: 'A pensar', sec: '{{s}} s', min_sec: '{{m}} min {{s}} s',
      steps_one: '{{count}} passo', steps_many: '{{count}} de passos', steps_other: '{{count}} passos',
      show: 'Mostrar passos', hide: 'Ocultar passos',
      kind: {
        web_search: 'A pesquisar na internet', web_fetch: 'A ler uma página', read_upload: 'A ler o seu ficheiro',
        read_file: 'A ler um ficheiro', read_file_plain: 'A analisar os materiais', write_file: 'A preparar um ficheiro',
        search_files: 'A pesquisar nos materiais', compute: 'A processar dados', image_generate: 'A desenhar uma imagem',
        image_edit: 'A retocar a imagem', video: 'A iniciar a geração do vídeo', speech: 'A dar voz ao texto',
        calendar_read: 'A consultar o calendário', calendar_propose: 'A preparar um evento no calendário',
        routine: 'A configurar um lembrete', notes: 'A trabalhar com notas', messages_read: 'A consultar mensagens',
        message_send: 'A enviar uma mensagem', mail_read: 'A consultar o correio', mail_send: 'A enviar um e-mail',
        product: 'A trabalhar no seu site ou bot', other: 'A trabalhar na tarefa',
      },
    },
    ask: { custom: 'Outra resposta', custom_placeholder: 'A sua resposta', submit: 'Responder', multi_hint: 'Pode escolher várias', preparing: 'A preparar uma pergunta…' },
  },
  zh: {
    activity: {
      thinking: '思考中', sec: '{{s}} 秒', min_sec: '{{m}} 分 {{s}} 秒',
      steps_other: '{{count}} 个步骤',
      show: '显示步骤', hide: '隐藏步骤',
      kind: {
        web_search: '正在搜索网络', web_fetch: '正在阅读网页', read_upload: '正在阅读你的文件',
        read_file: '正在阅读文件', read_file_plain: '正在查看资料', write_file: '正在准备文件',
        search_files: '正在查找资料', compute: '正在处理数据', image_generate: '正在绘制图片',
        image_edit: '正在修改图片', video: '正在启动视频生成', speech: '正在为文本配音',
        calendar_read: '正在查看日历', calendar_propose: '正在准备日历事件',
        routine: '正在设置提醒', notes: '正在处理笔记', messages_read: '正在查看消息',
        message_send: '正在发送消息', mail_read: '正在查看邮件', mail_send: '正在发送邮件',
        product: '正在处理你的网站或机器人', other: '正在处理任务',
      },
    },
    ask: { custom: '其他答案', custom_placeholder: '你的回答', submit: '回答', multi_hint: '可多选', preparing: '正在准备问题…' },
  },
};

for (const [lang, keys] of Object.entries(K)) {
  const p = `src/i18n/locales/${lang}.json`;
  const d = JSON.parse(readFileSync(p, 'utf8'));
  if (d.chat.activity || d.chat.ask) throw new Error(`${lang}: chat.activity/chat.ask уже есть`);
  d.chat.activity = keys.activity;
  d.chat.ask = keys.ask;
  writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
}
console.log('ok');
```

```bash
cd $FRONT && node add-chat-keys.tmp.mjs && rm add-chat-keys.tmp.mjs && git diff --stat
```

Ожидается: `ok`, изменены ровно 7 файлов локалей.

- [ ] **Step 2: Проверки локалей и тест из Task 8**

```bash
cd $FRONT && node scripts/check-locales.mjs && node scripts/check-no-hardcoded-locale.mjs && ../../node_modules/.bin/vitest run src/components/chat/turnActivity.test.ts scripts/
```

Ожидается: check-locales без пропусков (в том числе по плюральным категориям), vitest — все зелёные.

- [ ] **Step 3: Коммит**

```bash
git -C $FRONT add src/i18n/locales/ru.json src/i18n/locales/en.json src/i18n/locales/de.json src/i18n/locales/es.json src/i18n/locales/fr.json src/i18n/locales/pt.json src/i18n/locales/zh.json
git -C $FRONT commit -q -m "i18n(chat): подписи шагов работы и карточки вопроса в семи локалях" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 10: Отрисовка шагов

**Files:**
- Create: `src/components/chat/ActivitySteps.tsx`
- Test: `src/components/chat/ActivitySteps.test.tsx`

- [ ] **Step 1: Тест**

```tsx
// src/components/chat/ActivitySteps.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, click, byButton, visibleText } from '../../test/dom';
import { LiveActivity, ActivitySummaryView } from './ActivitySteps';
import { addStep, startActivity } from './turnActivity';

// tRu не знает плюралов — выбираем форму так же, как i18next, по Intl.PluralRules.
vi.mock('react-i18next', async () => {
  const { tRu } = await import('../../test/dom');
  const rules = new Intl.PluralRules('ru');
  const t = (key: string, opts?: Record<string, unknown>) =>
    typeof opts?.count === 'number' ? tRu(`${key}_${rules.select(opts.count)}`, opts) : tRu(key, opts);
  return { useTranslation: () => ({ t }) };
});

describe('шаги работы на экране', () => {
  it('пока шагов нет — «Думает» с таймером вместо трёх точек', () => {
    const { container } = mount(<LiveActivity activity={startActivity(Date.now())} />);
    expect(visibleText(container)).toMatch(/Думает · \d+ с/);
  });

  it('шаги: подпись, уточнение и счётчик повторов', () => {
    let a = addStep(startActivity(Date.now()), 'web_search', 'офис Казань');
    a = addStep(addStep(a, 'compute'), 'compute');
    const { container } = mount(<LiveActivity activity={a} />);
    const text = visibleText(container);
    expect(text).toContain('Ищу в интернете · офис Казань');
    expect(text).toContain('Обрабатываю данные ×2');
    expect(text).not.toContain('Думает');
  });

  it('чтение файла без имени — «Изучаю материалы»', () => {
    const { container } = mount(<LiveActivity activity={addStep(startActivity(Date.now()), 'read_file')} />);
    expect(visibleText(container)).toContain('Изучаю материалы');
  });

  it('итог хода свёрнут в «N шагов · время» и раскрывается по нажатию', () => {
    const summary = {
      steps: [
        { kind: 'web_search' as const, detail: 'офис', count: 1, done: true },
        { kind: 'write_file' as const, detail: 'Отчёт.pdf', count: 1, done: true },
      ],
      durationMs: 42_000,
    };
    const { container } = mount(<ActivitySummaryView summary={summary} />);
    expect(visibleText(container)).toContain('2 шага · 42 с');
    expect(visibleText(container)).not.toContain('Отчёт.pdf');
    click(byButton(container, /2 шага/)!);
    expect(visibleText(container)).toContain('Готовлю файл · Отчёт.pdf');
  });

  it('длинный ход — минуты', () => {
    const summary = { steps: [{ kind: 'compute' as const, count: 1, done: true }], durationMs: 185_000 };
    const { container } = mount(<ActivitySummaryView summary={summary} />);
    expect(visibleText(container)).toContain('1 шаг · 3 мин 5 с');
  });
});
```

- [ ] **Step 2: Прогон — красный** (`vitest run src/components/chat/ActivitySteps.test.tsx` → модуль не найден).

- [ ] **Step 3: Реализация**

```tsx
// src/components/chat/ActivitySteps.tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { durationParts, type ActivityStep, type ActivitySummary, type TurnActivity } from './turnActivity';

// Шаги работы ассистента: во время хода — вместо трёх точек, после — свёрнутой
// строкой над ответом. Логика — turnActivity.ts.

function useDuration(): (ms: number) => string {
  const { t } = useTranslation();
  return (ms) => {
    const { m, s } = durationParts(ms);
    return m > 0 ? t('chat.activity.min_sec', { m, s }) : t('chat.activity.sec', { s });
  };
}

function StepRow({ step }: { step: ActivityStep }) {
  const { t } = useTranslation();
  // «Читаю файл» без имени звучит обрывком — для чужих путей своя подпись.
  const key = step.kind === 'read_file' && !step.detail ? 'read_file_plain' : step.kind;
  return (
    <li className="flex items-start gap-2 text-xs leading-5 text-gray-600">
      {step.done
        ? <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" aria-hidden />
        : <Loader2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-forest-500 animate-spin" aria-hidden />}
      <span className="min-w-0 break-words">
        {t(`chat.activity.kind.${key}`)}
        {step.detail && <span className="text-gray-400"> · {step.detail}</span>}
        {step.count > 1 && <span className="text-gray-400"> ×{step.count}</span>}
      </span>
    </li>
  );
}

/** Идущий ход: «Думает · 5 с», потом список шагов и общий таймер. */
export function LiveActivity({ activity }: { activity: TurnActivity }) {
  const { t } = useTranslation();
  const fmt = useDuration();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = fmt(now - activity.startedAt);

  if (activity.steps.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 h-[24px]">
        <Loader2 className="w-4 h-4 text-forest-500 animate-spin" aria-hidden />
        <span>{t('chat.activity.thinking')} · {elapsed}</span>
      </div>
    );
  }
  return (
    <div className="mb-2 not-prose">
      <ul className="space-y-0.5">
        {activity.steps.map((s, i) => <StepRow key={i} step={s} />)}
      </ul>
      <div className="text-[11px] text-gray-400 mt-1">{elapsed}</div>
    </div>
  );
}

/** Завершённый ход: «▸ 3 шага · 42 с», по нажатию — список. */
export function ActivitySummaryView({ summary }: { summary: ActivitySummary }) {
  const { t } = useTranslation();
  const fmt = useDuration();
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-1 not-prose">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? t('chat.activity.hide') : t('chat.activity.show')}
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ChevronRight className={clsx('w-3.5 h-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
        {t('chat.activity.steps', { count: summary.steps.length })} · {fmt(summary.durationMs)}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-1">
          {summary.steps.map((s, i) => <StepRow key={i} step={s} />)}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Прогон — зелёный**, затем `node scripts/check-no-hardcoded.mjs` (кириллицы вне t() быть не должно).

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/ActivitySteps.tsx src/components/chat/ActivitySteps.test.tsx
git -C $FRONT commit -q -m "feat(chat): отрисовка шагов работы — «Думает», список, свёрнутый итог" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 11: Разбор блока `ask`

**Files:**
- Create: `src/utils/askBlock.ts`
- Test: `src/utils/askBlock.test.ts`

- [ ] **Step 1: Тест**

```ts
// src/utils/askBlock.test.ts
import { describe, it, expect } from 'vitest';
import { extractAskBlocks, parseAskJson, askBlocksToPlainText } from './askBlock';

const Q = { header: 'Для кого', question: 'Для кого поздравление?', multi: false, options: ['Коллеге', 'Руководителю', 'Другу'] };
const J = JSON.stringify({ questions: [Q] });
const block = (json: string) => '```ask\n' + json + '\n```';

describe('блок ask в тексте ответа', () => {
  it('целый блок → карточка, текст вокруг остаётся', () => {
    const { content, asks } = extractAskBlocks(`Сначала пара слов.\n\n${block(J)}\n`);
    expect(content).toBe('Сначала пара слов.\n\n__ASK_0__\n');
    expect(asks.get('0')).toEqual({ kind: 'card', questions: [Q] });
  });

  it('недописанный блок во время стрима — заглушка, JSON не виден', () => {
    const { content, asks } = extractAskBlocks('Текст\n```ask\n{"questions":[{"quest', { streaming: true });
    expect(content).toBe('Текст\n__ASK_0__');
    expect(asks.get('0')).toEqual({ kind: 'pending' });
  });

  it('незакрытый блок в готовом сообщении разбирается до конца текста', () => {
    const { asks } = extractAskBlocks('```ask\n' + J);
    expect(asks.get('0')).toEqual({ kind: 'card', questions: [Q] });
  });

  it('битый JSON — вопрос и варианты обычным текстом', () => {
    const broken = '{"questions":[{"question":"Какой тон?","options":["Тёплый","Деловой"],}';
    const { asks } = extractAskBlocks(block(broken));
    expect(asks.get('0')).toEqual({ kind: 'fallback', text: '**Какой тон?**\n- Тёплый\n- Деловой' });
  });

  it('мягкие пределы: первые 3 годных вопроса, до 4 вариантов, повторы схлопнуты', () => {
    const qs = parseAskJson(JSON.stringify({ questions: [
      { question: 'A?', options: ['1', '2', '2', '3', '4', '5'] },
      { question: 'B?', options: ['только один'] },
      { question: '', options: ['1', '2'] },
      { question: 'C?', options: ['1', '2'] },
      { question: 'D?', options: ['1', '2'], multi: true },
      { question: 'E?', options: ['1', '2'] },
    ] }))!;
    expect(qs.map((q) => q.question)).toEqual(['A?', 'C?', 'D?']);
    expect(qs[0].options).toEqual(['1', '2', '3', '4']);
    expect(qs[2].multi).toBe(true);
  });

  it('ни одного годного вопроса — null', () => {
    expect(parseAskJson('{"questions":[]}')).toBeNull();
    expect(parseAskJson('{"foo":1}')).toBeNull();
  });

  it('несколько блоков — у каждого свой маркер', () => {
    const { content, asks } = extractAskBlocks(`${block(J)}\nи ещё\n${block(J)}`);
    expect(content).toBe('__ASK_0__\nи ещё\n__ASK_1__');
    expect(asks.size).toBe(2);
  });

  it('открывающая строка: регистр и пробелы не важны', () => {
    expect(extractAskBlocks('``` ASK \n' + J + '\n```').asks.get('0')?.kind).toBe('card');
  });

  it('обычный блок кода не трогается', () => {
    const src = '```js\nconst a = 1;\n```';
    const { content, asks } = extractAskBlocks(src);
    expect(content).toBe(src);
    expect(asks.size).toBe(0);
  });

  it('копирование: вместо блока — вопрос и варианты текстом', () => {
    expect(askBlocksToPlainText(`Итак.\n${block(J)}`))
      .toBe('Итак.\nДля кого поздравление?\n- Коллеге\n- Руководителю\n- Другу');
  });
});
```

- [ ] **Step 2: Прогон — красный.**

- [ ] **Step 3: Реализация**

```ts
// src/utils/askBlock.ts
// Уточняющий вопрос ассистента — блок кода с языком `ask` и JSON внутри.
//
// Формат — контракт с бэком (spirits_back, chat/ask-rule.ts):
//   ```ask
//   {"questions":[{"header":"…","question":"…","multi":false,"options":["…","…"]}]}
//   ```
// Блок живёт в тексте сообщения, поэтому карточка восстанавливается из
// истории. Сырой JSON человек не видит никогда: недописанный блок (ответ ещё
// стримится) становится заглушкой, битый — обычным текстом.

export interface AskQuestion {
  question: string;
  header?: string;
  multi: boolean;
  options: string[];
}

export type AskBlock =
  | { kind: 'card'; questions: AskQuestion[] }
  | { kind: 'pending' }
  | { kind: 'fallback'; text: string };

const MAX_QUESTIONS = 3;
const MAX_OPTIONS = 4;
const OPEN_RE = /(^|\n)[ \t]*```[ \t]*ask[ \t]*\r?\n/i;
const CLOSE_RE = /(^|\r?\n)[ \t]*```[ \t]*(?=\r?\n|$)/;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function toQuestion(raw: unknown): AskQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const question = str(q.question);
  const options = Array.isArray(q.options)
    ? [...new Set(q.options.map(str).filter(Boolean))].slice(0, MAX_OPTIONS)
    : [];
  if (!question || options.length < 2) return null;
  const header = str(q.header);
  return { question, ...(header ? { header } : {}), multi: q.multi === true, options };
}

/** JSON блока → вопросы. null — если годного вопроса нет. */
export function parseAskJson(body: string): AskQuestion[] | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const list = (data as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return null;
  const questions = list
    .map(toQuestion)
    .filter((q): q is AskQuestion => q !== null)
    .slice(0, MAX_QUESTIONS);
  return questions.length ? questions : null;
}

const unquote = (s: string): string => {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
};

/** Что удалось достать из битого блока: вопрос жирным и варианты списком. */
function askFallbackText(body: string): string {
  const qs = [...body.matchAll(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
  return qs
    .map((m, i) => {
      const from = m.index ?? 0;
      const to = i + 1 < qs.length ? qs[i + 1].index ?? body.length : body.length;
      const opts = /"options"\s*:\s*\[([^\]]*)\]/.exec(body.slice(from, to));
      const items = opts
        ? [...opts[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((o) => `- ${unquote(o[1])}`)
        : [];
      return [`**${unquote(m[1])}**`, ...items].join('\n');
    })
    .join('\n\n');
}

/**
 * Заменяет блоки маркерами `__ASK_<n>__`, разобранное — в карте по n.
 * streaming: незакрытый блок — заглушка (дописывается); иначе он разбирается
 * до конца текста (модель не закрыла блок, но ответ уже готов).
 */
export function extractAskBlocks(
  content: string,
  opts: { streaming?: boolean } = {},
): { content: string; asks: Map<string, AskBlock> } {
  const asks = new Map<string, AskBlock>();
  let rest = content;
  let out = '';
  for (let n = 0; ; n++) {
    const open = OPEN_RE.exec(rest);
    if (!open) break;
    const id = String(n);
    out += `${rest.slice(0, open.index)}${open[1]}__ASK_${id}__`;
    const bodyStart = open.index + open[0].length;
    const tail = rest.slice(bodyStart);
    const close = CLOSE_RE.exec(tail);
    if (!close && opts.streaming) {
      asks.set(id, { kind: 'pending' });
      rest = '';
      break;
    }
    const body = close ? tail.slice(0, close.index) : tail;
    const questions = parseAskJson(body);
    asks.set(id, questions ? { kind: 'card', questions } : { kind: 'fallback', text: askFallbackText(body) });
    rest = close ? tail.slice(close.index + close[0].length) : '';
  }
  return { content: out + rest, asks };
}

/** Текст для копирования: вместо блоков — вопросы и варианты. */
export function askBlocksToPlainText(content: string): string {
  const { content: marked, asks } = extractAskBlocks(content);
  return marked.replace(/__ASK_(\d+)__/g, (_m, id: string) => {
    const b = asks.get(id);
    if (!b || b.kind === 'pending') return '';
    if (b.kind === 'fallback') return b.text;
    return b.questions.map((q) => [q.question, ...q.options.map((o) => `- ${o}`)].join('\n')).join('\n\n');
  });
}
```

- [ ] **Step 4: Прогон — зелёный.**

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/utils/askBlock.ts src/utils/askBlock.test.ts
git -C $FRONT commit -q -m "feat(chat): разбор блока ask — карточка, заглушка, текст вместо битого JSON" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 12: Текст ответа из карточки

**Files:**
- Create: `src/components/chat/askAnswer.ts`
- Test: `src/components/chat/askAnswer.test.ts`

- [ ] **Step 1: Тест**

```ts
// src/components/chat/askAnswer.test.ts
import { describe, it, expect } from 'vitest';
import type { AskQuestion } from '../../utils/askBlock';
import { buildAskAnswer, parseAskAnswer, isAskComplete } from './askAnswer';

const WHO: AskQuestion = { header: 'Для кого', question: 'Для кого поздравление?', multi: false, options: ['Коллеге', 'Руководителю', 'Другу'] };
const TONE: AskQuestion = { header: 'Тон', question: 'Какой тон?', multi: true, options: ['Тёплый', 'С юмором', 'Деловой'] };
const pick = (selected: string[], custom = '') => ({ selected, custom });

describe('ответ из карточки', () => {
  it('один вопрос — просто выбранное', () => {
    expect(buildAskAnswer([WHO], [pick(['Коллеге'])])).toBe('Коллеге');
  });

  it('несколько вариантов — через запятую', () => {
    expect(buildAskAnswer([TONE], [pick(['Тёплый', 'С юмором'])])).toBe('Тёплый, С юмором');
  });

  it('свой вариант в одиночном выборе заменяет чип', () => {
    expect(buildAskAnswer([WHO], [pick(['Коллеге'], ' Тёще ')])).toBe('Тёще');
  });

  it('свой вариант в множественном добавляется к чипам', () => {
    expect(buildAskAnswer([TONE], [pick(['Тёплый'], 'стихами')])).toBe('Тёплый, стихами');
  });

  it('несколько вопросов — строка на вопрос с подписью', () => {
    expect(buildAskAnswer([WHO, TONE], [pick(['Коллеге']), pick(['Тёплый'])])).toBe('Для кого: Коллеге\nТон: Тёплый');
  });

  it('без подписи строка начинается с вопроса', () => {
    const bare = { ...WHO, header: undefined };
    expect(buildAskAnswer([bare, TONE], [pick(['Другу']), pick(['Деловой'])]))
      .toBe('Для кого поздравление?: Другу\nТон: Деловой');
  });

  it('готовность: ответ нужен на каждый вопрос', () => {
    expect(isAskComplete([WHO, TONE], [pick(['Коллеге']), pick([])])).toBe(false);
    expect(isAskComplete([WHO, TONE], [pick(['Коллеге']), pick([], 'стихами')])).toBe(true);
    expect(isAskComplete([WHO], [pick([], '   ')])).toBe(false);
  });

  it('после перезагрузки выбор восстанавливается из текста ответа', () => {
    const qs = [WHO, TONE];
    const text = buildAskAnswer(qs, [pick(['Руководителю']), pick(['Тёплый', 'Деловой'])]);
    expect(parseAskAnswer(qs, text)).toEqual([['Руководителю'], ['Тёплый', 'Деловой']]);
  });

  it('ответ своими словами — ничего не подсвечено', () => {
    expect(parseAskAnswer([WHO], 'а можно маме?')).toEqual([[]]);
  });
});
```

- [ ] **Step 2: Прогон — красный.**

- [ ] **Step 3: Реализация**

```ts
// src/components/chat/askAnswer.ts
import type { AskQuestion } from '../../utils/askBlock';

/** Выбор по одному вопросу карточки. */
export interface AskPick {
  selected: string[];
  /** «Свой вариант» — текст поля; пустая строка, если не заполнено. */
  custom: string;
}

const NONE: AskPick = { selected: [], custom: '' };

export const emptyPicks = (n: number): AskPick[] =>
  Array.from({ length: n }, () => ({ selected: [], custom: '' }));

function answersOf(q: AskQuestion, p: AskPick): string[] {
  const custom = p.custom.trim();
  if (!q.multi) return custom ? [custom] : p.selected.slice(0, 1);
  return custom ? [...p.selected, custom] : p.selected;
}

/** На каждый вопрос есть ответ — можно отправлять. */
export function isAskComplete(questions: AskQuestion[], picks: AskPick[]): boolean {
  return questions.every((q, i) => answersOf(q, picks[i] ?? NONE).length > 0);
}

/**
 * Текст ответа — обычное сообщение пользователя.
 * Один вопрос: «Коллеге» / «Тёплый, С юмором». Несколько — строка на вопрос:
 * «<header или вопрос>: <выбранное>». По этому же формату parseAskAnswer
 * восстанавливает подсветку после перезагрузки.
 */
export function buildAskAnswer(questions: AskQuestion[], picks: AskPick[]): string {
  const parts = questions.map((q, i) => answersOf(q, picks[i] ?? NONE).join(', '));
  if (questions.length === 1) return parts[0];
  return questions.map((q, i) => `${q.header || q.question}: ${parts[i]}`).join('\n');
}

function matchOptions(q: AskQuestion, segment: string): string[] {
  const s = segment.trim();
  const items = s.split(', ');
  return q.options.filter((o) => s === o || items.includes(o));
}

/** Какие варианты выбраны в уже отправленном ответе. Не узнали — пусто. */
export function parseAskAnswer(questions: AskQuestion[], answer: string): string[][] {
  if (questions.length === 1) return [matchOptions(questions[0], answer)];
  const lines = answer.split('\n');
  return questions.map((q) => {
    const prefix = `${q.header || q.question}: `;
    const line = lines.find((l) => l.startsWith(prefix));
    return line ? matchOptions(q, line.slice(prefix.length)) : [];
  });
}
```

- [ ] **Step 4: Прогон — зелёный.**

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/askAnswer.ts src/components/chat/askAnswer.test.ts
git -C $FRONT commit -q -m "feat(chat): текст ответа из карточки и обратный разбор для подсветки" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 13: Карточка вопроса

**Files:**
- Create: `src/components/chat/AskCard.tsx`
- Test: `src/components/chat/AskCard.test.tsx`

- [ ] **Step 1: Тест**

```tsx
// src/components/chat/AskCard.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, click, type, byButton, visibleText } from '../../test/dom';
import { AskCard, AskBlockView } from './AskCard';
import type { AskQuestion } from '../../utils/askBlock';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const WHO: AskQuestion = { header: 'Для кого', question: 'Для кого поздравление?', multi: false, options: ['Коллеге', 'Руководителю', 'Другу'] };
const TONE: AskQuestion = { header: 'Тон', question: 'Какой тон?', multi: true, options: ['Тёплый', 'С юмором', 'Деловой'] };

describe('карточка вопроса', () => {
  it('один вопрос с одиночным выбором: ответ уходит по нажатию, карточка гаснет', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[WHO]} mode="active" onSubmit={onSubmit} />);
    expect(byButton(container, /^Ответить$/)).toBeNull();
    click(byButton(container, /^Коллеге$/)!);
    expect(onSubmit).toHaveBeenCalledWith('Коллеге');
    expect(byButton(container, /^Другу$/)!.disabled).toBe(true);
  });

  it('несколько вопросов: «Ответить» активна, только когда отвечено на каждый', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[WHO, TONE]} mode="active" onSubmit={onSubmit} />);
    const submit = () => byButton(container, /^Ответить$/)!;
    expect(submit().disabled).toBe(true);
    click(byButton(container, /^Руководителю$/)!);
    expect(submit().disabled).toBe(true);
    click(byButton(container, /^Тёплый$/)!);
    click(byButton(container, /^Деловой$/)!);
    expect(submit().disabled).toBe(false);
    click(submit());
    expect(onSubmit).toHaveBeenCalledWith('Для кого: Руководителю\nТон: Тёплый, Деловой');
  });

  it('множественный выбор: повторное нажатие снимает вариант', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[TONE]} mode="active" onSubmit={onSubmit} />);
    click(byButton(container, /^Тёплый$/)!);
    click(byButton(container, /^С юмором$/)!);
    click(byButton(container, /^Тёплый$/)!);
    click(byButton(container, /^Ответить$/)!);
    expect(onSubmit).toHaveBeenCalledWith('С юмором');
  });

  it('свой вариант: поле и отправка', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[WHO]} mode="active" onSubmit={onSubmit} />);
    click(byButton(container, /^Свой вариант$/)!);
    type(container.querySelector('input')!, 'Тёще');
    click(byButton(container, /^Ответить$/)!);
    expect(onSubmit).toHaveBeenCalledWith('Тёще');
  });

  it('после ответа: всё неактивно, выбранное подсвечено, лишних кнопок нет', () => {
    const { container } = mount(
      <AskCard questions={[WHO, TONE]} mode="answered" answerText={'Для кого: Другу\nТон: С юмором'} onSubmit={() => {}} />,
    );
    const pressed = Array.from(container.querySelectorAll('button[aria-pressed="true"]')).map((b) => b.textContent);
    expect(pressed).toEqual(['Другу', 'С юмором']);
    expect(Array.from(container.querySelectorAll('button')).every((b) => b.disabled)).toBe(true);
    expect(visibleText(container)).not.toContain('Свой вариант');
    expect(visibleText(container)).not.toContain('Ответить');
  });

  it('пока идёт ход — варианты видны, нажать нельзя', () => {
    const { container } = mount(<AskCard questions={[WHO]} mode="disabled" onSubmit={() => {}} />);
    expect(byButton(container, /^Коллеге$/)!.disabled).toBe(true);
    expect(byButton(container, /^Свой вариант$/)).toBeNull();
  });

  it('недописанный блок — «Готовлю вопрос…»', () => {
    const { container } = mount(<AskBlockView block={{ kind: 'pending' }} mode="disabled" onSubmit={() => {}} components={{}} />);
    expect(visibleText(container)).toContain('Готовлю вопрос…');
  });
});
```

- [ ] **Step 2: Прогон — красный.**

- [ ] **Step 3: Реализация**

```tsx
// src/components/chat/AskCard.tsx
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import type { AskBlock, AskQuestion } from '../../utils/askBlock';
import { buildAskAnswer, emptyPicks, isAskComplete, parseAskAnswer, type AskPick } from './askAnswer';

// Карточка уточняющего вопроса ассистента (блок ```ask, см. utils/askBlock.ts).
// Ответ уходит обычным сообщением пользователя — модель видит его как ответ
// на свой вопрос, а в истории он читается и без карточки.

/**
 * active — последний вопрос, ход не идёт: можно отвечать.
 * answered — после карточки уже есть сообщение пользователя.
 * disabled — идёт ход или карточка не последняя.
 */
export type AskMode = 'active' | 'answered' | 'disabled';

interface AskCardProps {
  questions: AskQuestion[];
  mode: AskMode;
  /** Для answered — следующее сообщение пользователя: по нему подсветка. */
  answerText?: string;
  onSubmit: (text: string) => void;
}

export function AskCard({ questions, mode, answerText, onSubmit }: AskCardProps) {
  const { t } = useTranslation();
  const [picks, setPicks] = useState<AskPick[]>(() => emptyPicks(questions.length));
  const [customOpen, setCustomOpen] = useState<boolean[]>(() => questions.map(() => false));
  // Отправили — карточка гаснет сразу, не дожидаясь ответа в ленте.
  const [sent, setSent] = useState(false);

  const live = mode === 'active' && !sent;
  // Один вопрос с одиночным выбором уходит по нажатию на вариант; «Ответить»
  // нужна только для своего варианта.
  const quick = questions.length === 1 && !questions[0].multi;
  const shown: string[][] = mode === 'answered' && !sent
    ? parseAskAnswer(questions, answerText ?? '')
    : picks.map((p) => p.selected);

  const send = (next: AskPick[]) => {
    if (!live || !isAskComplete(questions, next)) return;
    setSent(true);
    onSubmit(buildAskAnswer(questions, next));
  };

  const toggle = (qi: number, option: string) => {
    if (!live) return;
    const q = questions[qi];
    const next = picks.map((p, i) => {
      if (i !== qi) return p;
      if (!q.multi) return { selected: [option], custom: '' };
      const on = p.selected.includes(option);
      return { ...p, selected: on ? p.selected.filter((o) => o !== option) : [...p.selected, option] };
    });
    if (!q.multi) setCustomOpen((c) => c.map((v, i) => (i === qi ? false : v)));
    setPicks(next);
    if (quick) send(next);
  };

  const setCustom = (qi: number, value: string) =>
    setPicks((prev) => prev.map((p, i) =>
      i === qi ? { selected: questions[qi].multi ? p.selected : [], custom: value } : p));

  const showSubmit = live && (!quick || customOpen[0]);

  return (
    <div className="not-prose my-2 rounded-xl border border-forest-200 bg-forest-50/40 p-3 space-y-3">
      {questions.map((q, qi) => (
        <div key={qi} role="group" aria-label={q.question}>
          <p className="text-sm font-medium text-gray-800 mb-1.5">{q.question}</p>
          {q.multi && live && <p className="text-xs text-gray-400 -mt-1 mb-1.5">{t('chat.ask.multi_hint')}</p>}
          <div className="flex flex-wrap gap-2">
            {q.options.map((o) => {
              const on = !!shown[qi]?.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  disabled={!live}
                  aria-pressed={on}
                  onClick={() => toggle(qi, o)}
                  className={clsx(
                    'text-sm rounded-full px-3 py-1.5 border transition-colors text-left',
                    on ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-forest-700 border-forest-300',
                    live ? !on && 'hover:border-forest-400 hover:bg-forest-50' : 'opacity-60 cursor-default',
                  )}
                >
                  {o}
                </button>
              );
            })}
            {live && (
              <button
                type="button"
                aria-pressed={customOpen[qi]}
                onClick={() => setCustomOpen((c) => c.map((v, i) => (i === qi ? !v : v)))}
                className={clsx(
                  'text-sm rounded-full px-3 py-1.5 border border-dashed bg-white transition-colors',
                  customOpen[qi] ? 'border-forest-500 text-forest-700' : 'border-forest-300 text-forest-600 hover:bg-forest-50',
                )}
              >
                {t('chat.ask.custom')}
              </button>
            )}
          </div>
          {live && customOpen[qi] && (
            <input
              type="text"
              value={picks[qi].custom}
              onChange={(e) => setCustom(qi, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(picks); }}
              placeholder={t('chat.ask.custom_placeholder')}
              aria-label={t('chat.ask.custom_placeholder')}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              autoFocus
            />
          )}
        </div>
      ))}
      {showSubmit && (
        <button
          type="button"
          disabled={!isAskComplete(questions, picks)}
          onClick={() => send(picks)}
          className="text-sm font-medium rounded-lg px-4 py-1.5 bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t('chat.ask.submit')}
        </button>
      )}
    </div>
  );
}

/** Маркер `__ASK_n__` в ленте: карточка, заглушка или текст вместо битого блока. */
export function AskBlockView({ block, mode, answerText, onSubmit, components }: {
  block: AskBlock;
  mode: AskMode;
  answerText?: string;
  onSubmit: (text: string) => void;
  components: any;
}) {
  const { t } = useTranslation();
  if (block.kind === 'pending') {
    return <p className="text-xs text-gray-400 italic my-2">{t('chat.ask.preparing')}</p>;
  }
  if (block.kind === 'fallback') {
    return block.text
      ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{block.text}</ReactMarkdown>
      : null;
  }
  return <AskCard questions={block.questions} mode={mode} answerText={answerText} onSubmit={onSubmit} />;
}
```

- [ ] **Step 4: Прогон — зелёный**, затем `node scripts/check-no-hardcoded.mjs`.

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/components/chat/AskCard.tsx src/components/chat/AskCard.test.tsx
git -C $FRONT commit -q -m "feat(chat): карточка уточняющего вопроса — чипы, свой вариант, состояния" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 14: `parseCustomMarkdown` знает про блоки `ask`

**Files:**
- Modify: `src/utils/customMarkdown.tsx`
- Test: `src/utils/customMarkdown.test.ts` (дописать describe в конец)

- [ ] **Step 1: Тест** — дописать в конец `src/utils/customMarkdown.test.ts`:

```ts
describe('parseCustomMarkdown: блоки уточняющих вопросов', () => {
  const ASK = '```ask\n{"questions":[{"question":"Какой баннер?","options":["https://x.io/a.png","https://x.io/b.png"]}]}\n```';

  it('блок уходит в маркер раньше остальных разборов — ссылки внутри JSON не трогаются', () => {
    const { content, asks, images } = parseCustomMarkdown(`Выбери:\n${ASK}`);
    expect(content).toBe('Выбери:\n__ASK_0__');
    expect(asks.get('0')?.kind).toBe('card');
    expect(images.size).toBe(0);
  });

  it('во время стрима незакрытый блок — заглушка', () => {
    const { asks } = parseCustomMarkdown('```ask\n{"questions":[', { streaming: true });
    expect(asks.get('0')).toEqual({ kind: 'pending' });
  });
});
```

- [ ] **Step 2: Прогон — красный.**

- [ ] **Step 3: Реализация** — в `src/utils/customMarkdown.tsx`:

После `import * as LucideIcons from 'lucide-react';` добавить:

```ts
import { extractAskBlocks, type AskBlock } from './askBlock';
```

Заменить начало функции

```ts
export const parseCustomMarkdown = (content: string): {
```

на

```ts
export const parseCustomMarkdown = (content: string, opts: { streaming?: boolean } = {}): {
```

в типе результата после `  meetings: Map<string, MeetingCard>;` добавить `  asks: Map<string, AskBlock>;`, а строку

```ts
  let parsedContent = content;
```

заменить на

```ts
  // Первым делом — блоки уточняющих вопросов: внутри них JSON, и регулярки
  // ссылок и картинок ниже разобрали бы варианты ответа как разметку.
  const { content: withoutAsks, asks } = extractAskBlocks(content, opts);
  let parsedContent = withoutAsks;
```

и строку возврата

```ts
  return { content: parsedContent, buttons, links, videos, images, audioClips, voiceCalls, meetings };
```

на

```ts
  return { content: parsedContent, buttons, links, videos, images, audioClips, voiceCalls, meetings, asks };
```

- [ ] **Step 4: Прогон** `vitest run src/utils/customMarkdown.test.ts src/utils/askBlock.test.ts` — зелёный.

- [ ] **Step 5: Коммит**

```bash
git -C $FRONT add src/utils/customMarkdown.tsx src/utils/customMarkdown.test.ts
git -C $FRONT commit -q -m "feat(chat): parseCustomMarkdown выносит блоки ask в маркеры первым делом" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 15: Связка в `ChatInterface.tsx`

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx`
- Test: `src/components/chat/interactivityWiring.test.ts`

Компонент на 3200 строк не монтируется в тестах; связку сторожит тест по исходнику — как `streamFailureWiring.test.ts`.

- [ ] **Step 1: Тест**

```ts
// src/components/chat/interactivityWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож связки шагов и карточек в ChatInterface: чистые модули
 * (turnActivity, askBlock, askAnswer) покрыты своими тестами, а вот что их
 * вообще зовут — видно только здесь. Убрать `ui` из запроса или ветку
 * `activity` из цикла стрима — и всё останется зелёным, а фича пропадёт.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const between = (from: string, to: string): string => {
  const a = SRC.indexOf(from);
  expect(a).toBeGreaterThan(-1);
  const b = SRC.indexOf(to, a);
  expect(b).toBeGreaterThan(a);
  return SRC.slice(a, b);
};

describe('связка шагов работы', () => {
  const send = () => between('const sendMessageToAI = async', '// Cleanup on unmount');
  const upload = () => between('const handleFileUpload = async', 'const handleSelectAssistant = async');

  it('текстовый ход просит у бэка шаги и карточки', () => {
    expect(send()).toContain('ui: { activity: true, ask: true }');
  });

  it('цикл стрима принимает шаги и отмечает начало текста', () => {
    expect(send()).toContain("data.type === 'activity'");
    expect(send()).toContain('addStep(');
    expect(send()).toContain('markTextStarted(');
  });

  it('итог шагов прикрепляется к завершённому сообщению', () => {
    expect(send()).toContain('activity: finishActivity(');
  });

  it('загрузка файла тоже просит шаги и принимает их', () => {
    expect(upload()).toContain("formData.append('ui', JSON.stringify({ activity: true, ask: true }))");
    expect(upload()).toContain("event.type === 'activity'");
    expect(upload()).toContain('activity: finishActivity(');
  });

  it('идущий ход передаёт шаги в StreamingMessage', () => {
    expect(SRC).toContain('activity={streamActivity}');
  });
});

describe('связка карточек вопросов', () => {
  it('маркер ask разбирается в обоих рендерах — стриминговом и ленте', () => {
    expect(SRC.match(/startsWith\('__ASK_'\)/g)?.length).toBe(2);
  });

  it('стриминговый рендер разбирает с streaming: true', () => {
    expect(SRC).toContain('parseCustomMarkdown(content, { streaming: true })');
  });

  it('ответ из карточки идёт тем же путём, что набранный текст (очередь, удалённый ход)', () => {
    const body = between('const handleAskAnswer = async', '};');
    expect(body).toContain('submitText(');
    expect(body).toContain('sendingRef.current');
  });

  it('копирование ответа превращает блок в текст', () => {
    expect(SRC).toContain('askBlocksToPlainText(');
  });
});
```

- [ ] **Step 2: Прогон — красный.**

- [ ] **Step 3: Импорты** — после строки `import { balanceLevel } from '../../config/balanceThresholds';` добавить:

```ts
import { startActivity, addStep, markTextStarted, finishActivity, type TurnActivity, type ActivitySummary } from './turnActivity';
import { LiveActivity, ActivitySummaryView } from './ActivitySteps';
import { AskBlockView, type AskMode } from './AskCard';
import { askBlocksToPlainText } from '../../utils/askBlock';
```

- [ ] **Step 4: `Message`** — после поля `calendarProposalIds?: string[];` (перед закрывающей `}` интерфейса) добавить:

```ts
  /** Шаги работы ассистента в этом ходе (turnActivity.ts). Только в памяти:
   *  из истории сообщение приходит без них. */
  activity?: ActivitySummary;
```

- [ ] **Step 5: `StreamingMessage` — шаги и карточки.** Над `const StreamingMessage = React.memo(({` добавить:

```ts
// Карточка в идущем ходе не кликается — отвечать можно, когда ход закончен.
const noopAskSubmit = () => {};
```

В деструктуризации пропсов после `  onJoinMeeting,` добавить `  activity,`, в типе пропсов после `  onJoinMeeting?: (callId: string) => void;` добавить:

```ts
  /** Шаги работы идущего хода. null — показываем прежние три точки. */
  activity?: TurnActivity | null;
```

Заменить

```ts
  const { content: parsedContent, buttons, links, videos, images, audioClips, voiceCalls, meetings } = parseCustomMarkdown(content);
```

на

```ts
  const { content: parsedContent, buttons, links, videos, images, audioClips, voiceCalls, meetings, asks } = parseCustomMarkdown(content, { streaming: true });
```

В `renderContent` этого компонента после строки `    const meetingMatches = [...parsedContent.matchAll(/__MEETING_([\w-]+)__/g)];` добавить

```ts
    const askMatches = [...parsedContent.matchAll(/__ASK_(\d+)__/g)];
```

а строку

```ts
    const allMatches = [...buttonMatches, ...linkMatches, ...videoMatches, ...imageMatches, ...audioClipMatches, ...voiceCallMatches, ...meetingMatches].sort((a, b) => (a.index || 0) - (b.index || 0));
```

(первое вхождение в файле) заменить на

```ts
    const allMatches = [...buttonMatches, ...linkMatches, ...videoMatches, ...imageMatches, ...audioClipMatches, ...voiceCallMatches, ...meetingMatches, ...askMatches].sort((a, b) => (a.index || 0) - (b.index || 0));
```

В том же `renderContent` ветку встречи

```tsx
        if (meeting && onJoinMeeting) {
          parts.push(
            <MeetingJoinCard
              key={`meeting-${idx}`}
              code={meeting.code}
              title={meeting.title}
              provider={meeting.provider}
              url={meeting.url}
              agentId={meetingAgentId}
              onJoined={onJoinMeeting}
            />,
          );
        }
      }
```

заменить на

```tsx
        if (meeting && onJoinMeeting) {
          parts.push(
            <MeetingJoinCard
              key={`meeting-${idx}`}
              code={meeting.code}
              title={meeting.title}
              provider={meeting.provider}
              url={meeting.url}
              agentId={meetingAgentId}
              onJoined={onJoinMeeting}
            />,
          );
        }
      } else if (match[0].startsWith('__ASK_')) {
        const block = asks.get(match[1]);
        if (block) {
          parts.push(
            <AskBlockView key={`ask-${idx}`} block={block} mode="disabled" onSubmit={noopAskSubmit} components={components} />,
          );
        }
      }
```

Разметку пузыря

```tsx
        <div className="min-h-[24px]">
          {content ? (
            <>
              <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                {renderContent()}
              </div>
              <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-forest-500 rounded-full animate-pulse" />
            </>
          ) : (
            <div className="flex space-x-1 items-center h-[24px]">
```

заменить на

```tsx
        <div className="min-h-[24px]">
          {/* Шаги — над текстом; пока нет ни шагов, ни текста — «Думает · N с». */}
          {activity && (activity.steps.length > 0 || !content) && <LiveActivity activity={activity} />}
          {content ? (
            <>
              <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                {renderContent()}
              </div>
              <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-forest-500 rounded-full animate-pulse" />
            </>
          ) : !activity && (
            <div className="flex space-x-1 items-center h-[24px]">
```

- [ ] **Step 6: Состояние.** После `  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);` добавить:

```ts
  // Шаги работы идущего хода — рисуются вместо трёх точек (ActivitySteps.tsx).
  const [streamActivity, setStreamActivity] = useState<TurnActivity | null>(null);
```

После блока `const sendBlocked = turnRunningAnywhere({ … });` добавить:

```ts
  // Карточку вопроса можно нажать, только когда отправка пойдёт сразу: ответ
  // в очередь посреди чужого хода выглядел бы как проглоченный.
  const askLive = !sendBlocked && !streamingMessageId && !historyLoading;
```

- [ ] **Step 7: `sendMessageToAI`.** Заменить

```ts
  const sendMessageToAI = async (userMessage: string) => {
    setIsTyping(true);
    setCurrentStreamingMessage('');
```

на

```ts
  const sendMessageToAI = async (userMessage: string) => {
    setIsTyping(true);
    setCurrentStreamingMessage('');
    // Шаги хода копятся локально (цикл ниже живёт дольше одного рендера) и
    // зеркалятся в состояние для StreamingMessage.
    let activity = startActivity(Date.now());
    setStreamActivity(activity);
```

В теле запроса после `        tz: clientTimeZone(),` добавить:

```ts
        // Клиент рисует шаги работы и карточки вопросов — бэк включает их
        // только по этому полю, мобилка его не шлёт.
        ui: { activity: true, ask: true },
```

В цикле разбора строку

```ts
            if (data.type === 'item' && data.content) {
              accumulatedContent += data.content;
```

(первое вхождение — в `sendMessageToAI`) заменить на

```ts
            if (data.type === 'activity') {
              activity = addStep(activity, data.kind, data.detail);
              if (selectedAssistantIdRef.current === streamAssistantId) setStreamActivity(activity);
            }
            if (data.type === 'item' && data.content) {
              accumulatedContent += data.content;
              const afterText = markTextStarted(activity);
              if (afterText !== activity) {
                activity = afterText;
                if (selectedAssistantIdRef.current === streamAssistantId) setStreamActivity(activity);
              }
```

В `completedMessage` после строки `          calendarProposalIds: calendarProposalIds.length > 0 ? [...calendarProposalIds] : undefined,` добавить:

```ts
          activity: finishActivity(activity, Date.now()),
```

В `finally` этого метода после `        setStreamingMessageId(null);` (внутри `if (selectedAssistantIdRef.current === streamAssistantId)`) добавить `        setStreamActivity(null);`.

- [ ] **Step 8: Загрузка файла (`handleFileUpload`, бинарный путь).** Заменить

```ts
    setStreamingMessageId(assistantMsgId);
    setCurrentStreamingMessage('');

    try {
      await apiClient.refreshTokenIfNeeded();
```

на

```ts
    setStreamingMessageId(assistantMsgId);
    setCurrentStreamingMessage('');
    let activity = startActivity(Date.now());
    setStreamActivity(activity);

    try {
      await apiClient.refreshTokenIfNeeded();
```

После блока `if (freshTs) { … }` добавить:

```ts
      // Шаги работы и карточки — как у текстового хода. multipart везёт
      // объект строкой, бэк это учитывает (client-ui.ts).
      formData.append('ui', JSON.stringify({ activity: true, ask: true }));
```

Заменить

```ts
            if (event.type === 'item' && event.content) {
              accumulatedContent += event.content;
              setCurrentStreamingMessage(accumulatedContent);
            } else if (event.type === 'end') {
```

на

```ts
            if (event.type === 'activity') {
              activity = addStep(activity, event.kind, event.detail);
              setStreamActivity(activity);
            } else if (event.type === 'item' && event.content) {
              accumulatedContent += event.content;
              setCurrentStreamingMessage(accumulatedContent);
              const afterText = markTextStarted(activity);
              if (afterText !== activity) {
                activity = afterText;
                setStreamActivity(activity);
              }
            } else if (event.type === 'end') {
```

В `assistantMsg` после `        tokensUsed: lastTokensUsed,` добавить `        activity: finishActivity(activity, Date.now()),`. В `finally` после `      setCurrentStreamingMessage('');` добавить `      setStreamActivity(null);`.

- [ ] **Step 9: Отправка ответа из карточки.** Заменить в `handleSendInner`

```ts
    voiceCommittedRef.current = '';
    const text = input;
    setInput('');

    // Ход ещё идёт — не шлём параллельно (релей убил бы текущий ответ), а
```

на

```ts
    voiceCommittedRef.current = '';
    const text = input;
    setInput('');
    await submitText(text);
  };

  // Отправка готового текста тем же путём, что из поля ввода: очередь, если
  // ход идёт, и проверка удалённого хода. Отдельно от handleSendInner, потому
  // что ответ из карточки вопроса приходит не из поля — черновик в поле
  // трогать нельзя.
  const submitText = async (text: string) => {
    // Ход ещё идёт — не шлём параллельно (релей убил бы текущий ответ), а
```

(остаток бывшего тела — `enqueue`, проверки, `await sendMessageText(text)`, `refreshWidget` — остаётся как есть и становится телом `submitText`). Сразу после закрывающей `};` функции `submitText` (перед комментарием `// Досылка очереди:`) добавить:

```ts
  // Ответ из карточки уточняющего вопроса (AskCard). Тот же замок, что у
  // handleSend: двойное нажатие не должно уйти двумя ходами.
  const handleAskAnswer = async (text: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      await submitText(text);
    } finally {
      sendingRef.current = false;
    }
  };
```

- [ ] **Step 10: Лента.** Заменить `        ) : messages.map((message) => (` на `        ) : messages.map((message, mi) => (`.

Заменить

```tsx
              ) : message.type === 'assistant' ? (
                <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                  {(() => {
                    const contentForRender = stripCalendarProposalMarkers(stripVideoJobMarkers(message.content));
                    const { content: parsedContent, buttons, links, videos, images, audioClips, voiceCalls, meetings } = parseCustomMarkdown(contentForRender);
```

на

```tsx
              ) : message.type === 'assistant' ? (
                <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                  {message.activity && <ActivitySummaryView summary={message.activity} />}
                  {(() => {
                    const contentForRender = stripCalendarProposalMarkers(stripVideoJobMarkers(message.content));
                    const { content: parsedContent, buttons, links, videos, images, audioClips, voiceCalls, meetings, asks } = parseCustomMarkdown(contentForRender);
                    // Состояние карточки вопроса: ответили ли уже (следующее
                    // сообщение — пользователя) и можно ли отвечать сейчас.
                    const nextMsg = messages[mi + 1];
                    const answered = nextMsg?.type === 'user';
                    const askMode: AskMode = answered
                      ? 'answered'
                      : mi === messages.length - 1 && askLive ? 'active' : 'disabled';
```

В этом рендере после `                    const meetingMatches = [...parsedContent.matchAll(/__MEETING_([\w-]+)__/g)];` добавить

```ts
                    const askMatches = [...parsedContent.matchAll(/__ASK_(\d+)__/g)];
```

и оставшееся вхождение строки `const allMatches = [...buttonMatches, …, ...meetingMatches].sort(…)` дополнить `, ...askMatches` так же, как в Step 5.

Ветку встречи ленты

```tsx
                              agentId={Number(selectedAssistant?.id) || 0}
                              onJoined={setMeetingCallId}
                            />,
                          );
                        }
                      }
```

заменить на

```tsx
                              agentId={Number(selectedAssistant?.id) || 0}
                              onJoined={setMeetingCallId}
                            />,
                          );
                        }
                      } else if (match[0].startsWith('__ASK_')) {
                        const block = asks.get(match[1]);
                        if (block) {
                          parts.push(
                            <AskBlockView
                              key={`ask-${idx}`}
                              block={block}
                              mode={askMode}
                              answerText={answered ? nextMsg.content : undefined}
                              onSubmit={handleAskAnswer}
                              components={markdownComponents}
                            />,
                          );
                        }
                      }
```

- [ ] **Step 11: `StreamingMessage` в ленте и копирование.** В вызове `<StreamingMessage` после `              onJoinMeeting={setMeetingCallId}` добавить `              activity={streamActivity}`. В кнопке копирования заменить

```ts
onClick={() => handleCopyMessage(parseCustomMarkdown(stripCalendarProposalMarkers(stripVideoJobMarkers(message.content))).content || message.content, message.id)}
```

на

```ts
onClick={() => handleCopyMessage(parseCustomMarkdown(askBlocksToPlainText(stripCalendarProposalMarkers(stripVideoJobMarkers(message.content)))).content || message.content, message.id)}
```

- [ ] **Step 12: Прогон**

```bash
cd $FRONT && ../../node_modules/.bin/vitest run src/components/chat/ src/utils/ \
  && node scripts/check-no-hardcoded.mjs && node scripts/check-keys-exist.mjs && node scripts/check-locales.mjs \
  && ../../node_modules/.bin/eslint src/components/chat/ChatInterface.tsx src/components/chat/AskCard.tsx src/components/chat/ActivitySteps.tsx src/components/chat/turnActivity.ts src/components/chat/askAnswer.ts src/utils/askBlock.ts src/utils/customMarkdown.tsx
```

Ожидается: всё зелёное, в том числе `interactivityWiring.test.ts`, `streamFailureWiring.test.ts`, `remoteTurnWiring.test.ts`. Новых ошибок eslint нет (старые предупреждения в ChatInterface — не наши; сравнить с `git stash`-версией не нужно, смотреть только на строки, которые меняли).

- [ ] **Step 13: Коммит**

```bash
git -C $FRONT add src/components/chat/ChatInterface.tsx src/components/chat/interactivityWiring.test.ts
git -C $FRONT commit -q -m "feat(chat): шаги работы вместо трёх точек и карточки вопросов в ленте" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Task 16: Ворота фронта

- [ ] **Step 1: Пуш и прогон на ноде**

```bash
git -C $FRONT push -q origin feat/chat-interactivity
SHA=$(git -C $FRONT rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/wt/chat-interactivity-front && git fetch -q origin && git checkout -q --detach $SHA && git log -1 --oneline && source ~/.nvm/nvm.sh && pnpm test 2>&1 | grep -E 'Test Files|Tests |FAIL' ; pnpm typecheck 2>&1 | grep 'error TS' | sort > /tmp/front-tsc.txt; comm -13 ~/ci/wt/base-front-tsc.txt /tmp/front-tsc.txt; pnpm build 2>&1 | tail -3"
```

Ожидается:
- vitest — без падений сверх базовой линии;
- `comm -13` (новые ошибки типов) — пусто. Строки старых ошибок `ChatInterface.tsx` могут сдвинуться по номеру и попасть в вывод — тогда сверить текст ошибки, а не номер;
- `vite build` — успешно.

- [ ] **Step 2: Посмотреть глазами** (`superpowers:verification-before-completion`): `pnpm dev` в `$FRONT` — только если владелец разрешит локальный запуск, иначе проверка на test.linkeon.io в Task 17. Проверить:
  - ширину 375 px: чипы переносятся, горизонтального скролла нет;
  - строку «Думает · N с» вместо точек;
  - заглушку «Готовлю вопрос…» во время стрима.

---

# Часть C — выкат

## Task 17: Слияние и выкат — только с OK владельца

- [ ] **Step 1: Спросить владельца.** `deploy.sh` без явного OK не запускать. Параллельная сессия может вести свою раскатку — спросить и про это. Предложить порядок: `TEST_ONLY=1` → ручная проверка на test.linkeon.io → полный `deploy.sh`.

- [ ] **Step 2: Слить обе ветки в main** (сначала бэк: новый фронт на старом бэке просто не видит шагов, обратный порядок тоже безопасен):

```bash
git -C ~/Downloads/spirits_back fetch -q origin
git -C $BACK rebase -q origin/main   # если main ушёл вперёд; затем снова Task 7
git -C ~/Downloads/spirits_back switch main && git -C ~/Downloads/spirits_back merge --ff-only origin/main
git -C ~/Downloads/spirits_back merge --no-ff feat/chat-interactivity -m "Merge feat/chat-interactivity: шаги работы ассистента и карточки уточняющих вопросов (API)"
git -C ~/Downloads/spirits_back push origin main
# то же для фронта: "Merge feat/chat-interactivity: шаги работы вместо трёх точек и карточки вопросов"
```

Перед `switch main` в общем чекауте проверить `git status --short`: чужие изменения — стоп и спросить. После пуша проверить `git merge-base --is-ancestor feat/chat-interactivity origin/main` — `push origin main` пушит ветку `main`, а не HEAD.

- [ ] **Step 3: Выкат** — `bash ~/Downloads/spirits_back/scripts/deploy.sh`, отвязанно (дольше лимита инструмента; убитый процесс откатывает test), без `| tail`. Фронт `deploy.sh` берёт из локальной main — если в общем чекауте есть чужой незапушенный коммит, катить через `LOCAL_FRONT_DIR` на свежий клон.

- [ ] **Step 4: Ручная проверка на test.linkeon.io / прод** (аккаунт владельца, веб):
  - «Найди свежие новости про …» — идут шаги поиска и чтения страниц, после ответа сворачиваются в «N шагов · время».
  - «Напиши поздравление коллеге» — приходит карточка; нажатие уходит ответом, карточка гаснет.
  - F5 — карточка на месте, неактивна, выбор подсвечен; шагов после перезагрузки нет (так задумано).
  - Загрузка PDF — шаг «Читаю ваш файл».
  - Мобилка (Flutter) — ответы без мусора: шаги в текст не вклеились.

- [ ] **Step 5: Уборка** — `git worktree remove` для `$BACK`, `$FRONT`, `~/ci/wt/chat-interactivity-*` на ноде, скрипт `backtest-chat-interactivity.sh`. Через неделю — SQL из раздела «Риски» спецификации (как часто ассистенты спрашивают карточкой).
