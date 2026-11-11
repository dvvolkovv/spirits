# No Tokens Followups Current Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести текущий `main` до approved-поведения при `end.reason=no_tokens`: вернуть отклонённый текст без потери нового ввода и без дублирования, убрать пузырь человека, сохранить общий `pending_draft` на час/до 2000 символов, сохранить файлы без reload, не открывать пополнение автоматически и восстановить финальные исправления файлового flow и `RoutinesManager`.

**Architecture:** Точечно заменить только no_tokens-подсистему текущего `ChatInterface.tsx`, используя чистые helpers из `noTokensDraft.ts` и существующий `src/utils/pendingDraft.ts`. Старые ветки служат поведенческим эталоном, но не мерджатся и не cherry-pick'ятся целиком. Текущие защиты очереди/`?say=` и досрочный выход после разобранного `no_tokens` сохраняются. Поведение проверяется настоящим монтированием `ChatInterface`, а не только чтением исходника.

**Tech Stack:** React 18, TypeScript 5, Vite 5, Vitest 2, jsdom 25, i18next, pnpm.

**База и эталоны:** работа в `/Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current`, ветка `fix/followups-1111-current`, база `origin/main` = `c776a2a`. Базовый сценарий пришёл из `7f53a4ca`; финальные решения сверены с `09a4adfa` и коммитами `5125ff7`, `f09b537`, `9e61a7f`, `8ea9853`, `12c1dfa`, `9469e96`, `97e2d3f`, `76d1484`, `2646c87`.

---

## Проверенное исходное состояние и границы

1. `c776a2a` содержит `7f53a4ca`; между `7f53a4ca` и `c776a2a` `ChatInterface.tsx` и `pendingDraft.ts` больше не менялись. Поэтому финальные правки переносятся на ту же chat-реализацию, без разбора новых конфликтов.
2. Текущий `src/components/chat/noTokensDraft.ts` экспортирует `restoreDraftText`, `saveNoTokensDraft`, `peekNoTokensDraft`, `clearNoTokensDraft`; его `restoreDraftText` при непустом `current` теряет отклонённый `sent`, а копия живёт в `sessionStorage` под `no_tokens_draft:<assistantId>` без TTL.
3. Текущий `ChatInterface.tsx` открывает `TokenPackages` в обеих no_tokens-ветках и переоткрывает файловую задачу при закрытии пополнения. Approved-поведение другое: пополнение само не открывается; файловая модалка после отказа скрыта и автоматически открывается только на переходе баланса `<=0 → >0`.
4. В `c776a2a` есть `noTokensDraftWiring.test.ts`, но нет `noTokensWiring.test.ts` и `noTokensMount.test.tsx`. Первый файл сохранить и адаптировать к approved-контракту; второй восстановить выборочно по `09a4adfa`; mount-файл создать как самостоятельный behavioral suite по сценариям E0–E10/R, не копировать старый файл wholesale.
5. Текущие `savePendingDraft(...): void`, `takePendingDraftFor`, `takePendingDraftEntry`, `hasPendingDraftFor`, `forgetPendingDraft` уже используются:
   - `GuestChat.tsx` игнорирует результат `savePendingDraft`, поэтому возврат `boolean` обратносовместим;
   - `GuestChatPage.tsx` использует `takePendingDraftEntry` и поле `auto`;
   - `index.html` пишет тот же `pending_draft` с `expires`, `assistant`, `text`, `auto`;
   - `clearAppStorage.ts` использует `forgetPendingDraft`;
   - `sendInitialGreeting` использует `hasPendingDraftFor`.
   Формат записи, `DRAFT_KEY`, `DRAFT_TTL_MS`, `DRAFT_MAX_LENGTH=600` для URL-capture и `PENDING_DRAFT_STORE_MAX=2000` не менять.
6. Во всех семи текущих локалях есть `settings.routines.test_success/test_no_push`, но нет `test_busy/test_failed`. Старая ветка отстаёт от `main` в других ключах; переносить только две строки на локаль, ничего из её diff больше не брать.
7. Flutter не трогаем. Не меняем API, backend, `index.html`, guest-формат записи, зависимости, deploy-скрипты. Deploy в этот план не входит.
8. Существующие `if (noTokens) break;` в текстовом и multipart-потоках оставить: после уже разобранного `end(no_tokens)` поздний сетевой обрыв не должен увести в `catch` и подменить исход на `error`. Существующий `noTokensHoldRef` тоже оставить для очереди и отложенной очистки `?say=`; при явной отправке файловой задачи его надо снимать так же, как при текстовой отправке.

## Правила исполнения

- Не выполнять `git merge`, `git cherry-pick` старой ветки или `git checkout 09a4adfa -- <file>`. Читать эталон через `git show`, переносить только описанные ниже решения в текущие файлы.
- На маке не запускать `pnpm test`, полный `vitest`, `tsc` или `pnpm build`. Все такие команды идут через `front-ci` на `dv@85.192.61.231` в отдельный CI-worktree `~/ci/wt/followups-1111-front`.
- CI-worktree ставить на точный SHA, не на имя ветки. Живые `~/spirits_front` и `~/spirits_back` на ноде не трогать.
- Каждая функциональная задача: сначала красный тест на ноде, затем минимальная реализация, зелёный прогон, commit и push `fix/followups-1111-current`. Тесты не ослаблять ради зелёного результата.
- `git add` только с явными путями. Все commit messages заканчивать trailer `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

### Task 0: Воспроизводимая команда прогонов на ноде

**Files:**
- Изменений нет; worktree и dedicated CI-path уже существуют.

- [ ] **Step 1: Проверить исходную ветку**

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current status --short --branch
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current merge-base HEAD origin/main
```

Expected: ветка `fix/followups-1111-current`, рабочее дерево чистое, HEAD — коммит этого плана поверх базы, merge-base = `c776a2a7dda2c75eb6c9d5a639e40cf5ba52288b`.

- [ ] **Step 2: Объявить `front-ci` в каждой shell, где идёт реализация**

```bash
front-ci() {
  local sha
  sha=$(git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse HEAD) || return 1
  git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current push -q origin HEAD:refs/heads/fix/followups-1111-current || return 1
  ssh dv@85.192.61.231 "git -C ~/ci/wt/followups-1111-front fetch -q origin && git -C ~/ci/wt/followups-1111-front checkout -q $sha && source ~/.nvm/nvm.sh && cd ~/ci/wt/followups-1111-front && $*"
}
```

`front-ci` публикует ровно текущий коммит в рабочую ветку, затем запускает команду на ноде на этом SHA. Для красного коммита это намеренная публикация red-test-only; для зелёного — публикация проверяемой реализации.

- [ ] **Step 3: Проверить CI-path и установить зависимости один раз**

```bash
front-ci "git status --short --branch && pnpm install"
```

Expected: CI-worktree переключён на точный SHA в detached HEAD, `pnpm install` завершается с exit code 0. Зависимости далее не меняются, повторная установка не нужна.

---

### Task 1: Чистые no_tokens helpers и совместимый `pendingDraft`

**Files:**
- Modify: `src/components/chat/noTokensDraft.ts`
- Modify: `src/components/chat/noTokensDraft.test.ts`
- Modify: `src/utils/pendingDraft.ts`
- Modify: `src/utils/pendingDraft.test.ts`

- [ ] **Step 1: Заменить тесты старого sessionStorage-контракта на красные тесты чистых helpers**

В `noTokensDraft.test.ts` импортировать:

```ts
import {
  applyNoTokensOutcome,
  collapseNoTokensStop,
  isNoTokensEnd,
  restoreIntoInput,
} from './noTokensDraft';
```

Покрыть такие конкретные случаи:

```ts
describe('restoreIntoInput', () => {
  it('возвращает rejected в пустое поле', () => {
    expect(restoreIntoInput('', 'отклонённое')).toBe('отклонённое');
    expect(restoreIntoInput('   ', 'отклонённое')).toBe('отклонённое');
  });

  it('не теряет ни текущий набор, ни rejected', () => {
    expect(restoreIntoInput('набираю новое', 'отклонённое'))
      .toBe('набираю новое\n\nотклонённое');
  });

  it('пустой rejected не меняет поле', () => {
    expect(restoreIntoInput('набираю новое', '   ')).toBe('набираю новое');
    expect(restoreIntoInput('', '')).toBe('');
  });
});
```

Для `applyNoTokensOutcome` закрепить отсутствие параметра `currentInput`: функция возвращает только отклонённый текст + очередь, а слияние с актуальным полем делает вызывающий функциональным `setInput`. Это устраняет самодублирование из `5125ff7`, когда захваченный в замыкание `input` был равен `rejectedText`.

```ts
it('не принимает stale currentInput и не дублирует rejected', () => {
  expect(applyNoTokensOutcome({ rejectedText: 'привет', queuedText: '' }))
    .toEqual({ input: 'привет', draftText: 'привет' });
});

it('возвращает очередь вместе с rejected и тем же текстом в draft', () => {
  expect(applyNoTokensOutcome({
    rejectedText: 'первое',
    queuedText: 'второе\n\nтретье',
  })).toEqual({
    input: 'первое\n\nвторое\n\nтретье',
    draftText: 'первое\n\nвторое\n\nтретье',
  });
});
```

Для `collapseNoTokensStop` использовать минимальный структурный тип:

```ts
interface Msg {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  noTokensStop?: boolean;
}
const user = (id: string, content: string): Msg => ({ id, type: 'user', content });
const bot = (id: string, content: string, noTokensStop = false): Msg => ({
  id, type: 'assistant', content, ...(noTokensStop ? { noTokensStop: true } : {}),
});
```

Обязательные assertions:

```ts
const previous = [user('u0', 'старое'), bot('stop-1', 'STOP', true), user('u1', 'отклонённое')];
const nextStop = bot('stop-2', 'STOP', true);
expect(collapseNoTokensStop(previous, 'u1', nextStop))
  .toEqual([user('u0', 'старое'), nextStop]);

const success = bot('a1', 'обычный ответ');
expect(collapseNoTokensStop([success, user('u1', 'x')], 'u1', nextStop))
  .toEqual([success, nextStop]);

// Синтетический ход без пузыря: id не найден, просто ставится/заменяется stop.
expect(collapseNoTokensStop([bot('stop-1', 'STOP', true)], '', nextStop))
  .toEqual([nextStop]);
```

Для `isNoTokensEnd` оставить текущие полезные проверки `end/no_tokens`, обычного `end`, `item`, `ping`, `null`, `undefined`, `{}` и добавить `reason: 'preempted' → false`.

- [ ] **Step 2: Добавить красные тесты `pendingDraft` на boolean, TTL и безопасное снятие**

В `pendingDraft.test.ts` добавить импорты `forgetPendingDraftIfSent` и `savePendingDraft`, затем:

```ts
it('savePendingDraft пишет ровно на час и возвращает true', () => {
  expect(savePendingDraft('сожми фото', 12, NOW)).toBe(true);
  const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) as string);
  expect(stored).toMatchObject({ text: 'сожми фото', assistant: '12' });
  expect(stored.expires).toBe(NOW + DRAFT_TTL_MS);
});

it('принимает ровно 2000 и отклоняет 2001 символ', () => {
  expect(savePendingDraft('я'.repeat(PENDING_DRAFT_STORE_MAX), 12, NOW)).toBe(true);
  expect(savePendingDraft('я'.repeat(PENDING_DRAFT_STORE_MAX + 1), 12, NOW)).toBe(false);
});

it('не затирает живой черновик другого ассистента и сообщает false', () => {
  put({ text: 'черновик Райи', assistant: '14', expires: NOW + DRAFT_TTL_MS, auto: true });
  expect(savePendingDraft('задача Роману', 12, NOW)).toBe(false);
  expect(takePendingDraftEntry(14, NOW))
    .toEqual({ text: 'черновик Райи', auto: true });
});

it('снимает совпавший/дополненный черновик только у того же ассистента', () => {
  put({ text: '  вопрос  ', assistant: '14', expires: NOW + DRAFT_TTL_MS });
  forgetPendingDraftIfSent(14, ' вопрос\n\nи дополнение ', NOW);
  expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

  put({ text: 'вопрос', assistant: '14', expires: NOW + DRAFT_TTL_MS });
  forgetPendingDraftIfSent(12, 'вопрос', NOW);
  expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
});

it('не продлевает TTL несовпавшего черновика и сохраняет auto', () => {
  const expires = NOW + DRAFT_TTL_MS;
  put({ text: 'другой вопрос', assistant: '14', expires, auto: true });
  forgetPendingDraftIfSent(14, 'непохожий текст', NOW + 1000);
  expect(JSON.parse(localStorage.getItem(DRAFT_KEY) as string).expires).toBe(expires);
  expect(takePendingDraftEntry(14, NOW)).toEqual({ text: 'другой вопрос', auto: true });
});

it('просроченную запись стирает сразу', () => {
  put({ text: 'вопрос', assistant: '14', expires: NOW + DRAFT_TTL_MS });
  forgetPendingDraftIfSent(14, 'вопрос', NOW + DRAFT_TTL_MS + 1);
  expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
});
```

- [ ] **Step 3: Закоммитить только красные тесты и доказать RED на ноде**

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current add \
  src/components/chat/noTokensDraft.test.ts \
  src/utils/pendingDraft.test.ts
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current commit \
  -m "test(chat): финальные helpers no_tokens и pendingDraft (красный)" \
  -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
front-ci "pnpm exec vitest run src/components/chat/noTokensDraft.test.ts src/utils/pendingDraft.test.ts"
```

Expected: FAIL — отсутствуют экспорты `restoreIntoInput`, `collapseNoTokensStop`, `applyNoTokensOutcome`, `forgetPendingDraftIfSent`; `savePendingDraft` ещё возвращает `void`.

- [ ] **Step 4: Минимально реализовать чистый `noTokensDraft.ts`**

Удалить sessionStorage API и тип `ChatStreamEvent`; оставить следующий публичный контракт и реализацию:

```ts
interface EndEventLike {
  type?: string;
  reason?: string;
}

export function isNoTokensEnd(event: EndEventLike | null | undefined): boolean {
  return event?.type === 'end' && event?.reason === 'no_tokens';
}

export function restoreIntoInput(current: string, rejected: string): string {
  if (!rejected.trim()) return current;
  return current.trim() ? `${current}\n\n${rejected}` : rejected;
}

export interface ChatMessageLike {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  noTokensStop?: boolean;
}

export function collapseNoTokensStop<M extends ChatMessageLike>(
  messages: M[],
  rejectedId: string,
  stopMessage: M,
): M[] {
  const withoutRejected = messages.filter((m) => m.id !== rejectedId);
  const last = withoutRejected[withoutRejected.length - 1];
  const withoutPriorStop = last?.noTokensStop ? withoutRejected.slice(0, -1) : withoutRejected;
  return [...withoutPriorStop, stopMessage];
}

export interface ApplyNoTokensOutcomeArgs {
  rejectedText: string;
  queuedText: string;
}

export interface NoTokensOutcome {
  input: string;
  draftText: string;
}

export function applyNoTokensOutcome(args: ApplyNoTokensOutcomeArgs): NoTokensOutcome {
  const queued = args.queuedText.trim();
  const combined = queued ? `${args.rejectedText}\n\n${queued}` : args.rejectedText;
  return { input: combined, draftText: combined };
}
```

Не добавлять сюда `currentInput` и не сохранять ничего в storage. Дублирование предотвращается контрактом: актуальное поле будет читаться только в `setInput(prev => ...)`, а не из stale closure.

- [ ] **Step 5: Минимально расширить `pendingDraft.ts`, не меняя существующие consumers**

Добавить read-only helper сразу после `forgetPendingDraft`:

```ts
export function forgetPendingDraftIfSent(
  assistantId: string | number,
  sentText: string,
  now = Date.now(),
): void {
  const stored = read(now);
  if (
    stored &&
    stored.assistant === String(assistantId) &&
    sentText.trim().includes(stored.text.trim())
  ) {
    forget();
  }
}
```

Он не должен вызывать `takePendingDraftFor` или `savePendingDraft`: несовпавшая запись не пересохраняется, её TTL и `auto` остаются нетронутыми.

Изменить только возвращаемый тип и return-ветки `savePendingDraft`; аргументы и формат записи остаются прежними:

```ts
export function savePendingDraft(
  text: string,
  assistantId: string | number,
  now = Date.now(),
): boolean {
  const t = text.trim();
  if (!t || t.length > PENDING_DRAFT_STORE_MAX) return false;
  const existing = read(now);
  if (existing && existing.assistant !== String(assistantId)) return false;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      text: t,
      assistant: String(assistantId),
      expires: now + DRAFT_TTL_MS,
    }));
    return true;
  } catch {
    return false;
  }
}
```

Больше 2000 символов не обрезать: storage отклоняет запись, а видимое поле ввода всё равно получит полный текст. `GuestChat.tsx` продолжает игнорировать возвращаемое значение; его поведение не меняется.

- [ ] **Step 6: Зафиксировать реализацию, доказать GREEN на её SHA и опубликовать**

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current add \
  src/components/chat/noTokensDraft.ts \
  src/components/chat/noTokensDraft.test.ts \
  src/utils/pendingDraft.ts \
  src/utils/pendingDraft.test.ts
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current commit \
  -m "fix(chat): чистые helpers no_tokens и общий pendingDraft" \
  -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
front-ci "pnpm exec vitest run src/components/chat/noTokensDraft.test.ts src/utils/pendingDraft.test.ts src/utils/pendingDraft.entry.test.ts src/utils/draftCapture.test.ts src/utils/draftCaptureAsk.test.ts src/utils/clearAppStorage.test.ts"
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current status --short
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse HEAD
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse origin/fix/followups-1111-current
```

Expected: все перечисленные suites PASS на точном SHA реализации; `front-ci` уже опубликовал этот же коммит в `origin/fix/followups-1111-current`. Status пуст, локальный и удалённый SHA совпадают.

---

### Task 2: `ChatInterface` и живые E0–E10/R regression tests

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx`
- Modify: `src/components/chat/noTokensDraftWiring.test.ts`
- Create: `src/components/chat/noTokensWiring.test.ts`
- Create: `src/components/chat/noTokensMount.test.tsx`
- Modify: `src/components/chat/streamFailureWiring.test.ts`
- Modify: `src/components/chat/draftWiring.test.ts`
- Modify: `src/components/chat/greetingRaceWiring.test.ts`

- [ ] **Step 1: Создать behavioral mount suite и адаптировать source-сторожа до реализации**

Старый эталон для сценариев и NDJSON-харнесса:

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current show \
  09a4adfa:src/components/chat/noTokensMount.test.tsx
```

Не копировать файл целиком. В новом `noTokensMount.test.tsx` использовать `// @vitest-environment jsdom`, настоящий `ChatInterface`, `MemoryRouter`, `mount/flush/type` из `src/test/dom`, моки сети и тяжёлых детей по эталону. Обязательные элементы харнесса:

```tsx
const auth = vi.hoisted(() => ({
  user: { phone: '70000000000', tokens: 0 } as Record<string, unknown>,
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));

const net = vi.hoisted(() => ({
  history: [] as unknown[],
  chatStreams: [] as Array<() => unknown>,
  uploadStreams: [] as Array<() => unknown>,
  posts: [] as Array<{ path: string; body: unknown }>,
}));

const NO_TOKENS = [
  { type: 'begin' },
  { type: 'item', content: 'STOPZEROBALANCE' },
  { type: 'end', content: 'STOPZEROBALANCE', reason: 'no_tokens', usage: { total: 0 } },
];
const NORMAL = (text: string) => [
  { type: 'begin' },
  { type: 'item', content: text },
  { type: 'end', usage: { input: 1, output: 1, total: 2 } },
];
```

`apiClient.post` должен по `/webhook/soulmate/chat` и `/webhook/agent/upload-and-chat` возвращать запланированные NDJSON streams; `/webhook/chat/history` возвращает управляемую историю; `/webhook/chat/active-turn` — `{active:false}`. Реализовать `ndjson(events, gate?)` с `TextEncoder`, `getReader().read()` и optional deferred перед последней строкой. Добавить полифил `File.prototype.text` через `FileReader`, `ResizeObserver`, `IntersectionObserver`, `matchMedia`, `Element.prototype.scrollIntoView`.

В отличие от старого эталона, `TokenPackages` должен быть видимым маркером, чтобы approved-запрет проверялся поведением:

```tsx
vi.mock('../tokens/TokenPackages', () => ({
  TokenPackages: () => <div data-testid="token-packages" />,
}));
const tokenModalVisible = () =>
  view!.container.querySelector('[data-testid="token-packages"]') !== null;
```

Харнесс должен включать helpers `open`, `send`, `attach`, `submitFileTask`, `switchTo`, `setTokens`, `draft`, `feedText`, `countStops`, `modalVisible`, `modalTask`, `chatPosts`. `feedText` удаляет `textarea` из клона, чтобы ввод не смешивался с лентой.

Зафиксировать все сценарии ниже; assertions про экран обязательны, source text недостаточен.

| ID | Действие | Обязательный результат |
|---|---|---|
| E0 | Обычный успешный текстовый ход | Ответ в ленте, поле пустое, `pending_draft` нет, пополнения нет |
| E1 | `no_tokens` после «привет» | В поле ровно `привет`; `pending_draft.text === 'привет'`; пузыря `привет` в ленте нет; один STOP; `tokenModalVisible() === false` |
| E2 | Пока END ждёт gate, набрать «набираю» | Поле содержит `набираю` и ровно одно `первое`; rejected не потерян и не задублирован |
| E3 | `?say=первое`, затем второе в очередь и третье в поле | Один chat POST; `первое` и `второе` по разу; `третье` сохранено; автодосылки в ноль нет |
| E4 | Два прямых отказа подряд | Один STOP |
| E5 | Автоприветствие на пустой истории получает `no_tokens` | Поле пустое, `pending_draft` отсутствует, синтетический greeting не сохранён |
| E6 | Multipart `no_tokens`, баланс 0 → 5000 → 4990, затем Cancel и 4980 | Сразу модалка файлов закрыта; пополнение не открыто; после 5000 файловая модалка открыта один раз с задачей и именем файла; 4990 не переоткрывает; после Cancel 4980 не воскрешает |
| E7 | Текстовый отказ, затем отказ одиночного `.txt` | Один STOP; ранее восстановленное поле не перезаписано промптом файла |
| E8 | Multipart `no_tokens`, но кабинет ещё показывает 120 | Файловая модалка сразу не открывается; нужен сначала наблюдаемый 0, затем положительный баланс |
| E9 | Отказ у A, переход к B и новый файл | В окне B только файл B; старого имени нет; текст задачи пуст |
| E10 | Отказ у A → B → A → баланс >0 | Текст задачи не находится одновременно в основном поле и файловой модалке |
| R6 | Отказ → «Чистый лист» → баланс >0 | Нет дублирования задачи в поле и окне |
| R11 | Два multipart-отказа подряд с разными задачами | Один STOP; после пополнения вторая задача и оба актуальных имени файла |
| R12 | Живой черновик другого ассистента блокирует `savePendingDraft` → B → A → баланс >0 | Задача не потеряна: присутствует либо в поле A, либо в модалке A; файлы не сняты при неуспешном сохранении |
| R13 | Отказ → пополнение → повторный отказ при stale positive balance → 0 → 7000 | Модалка открывается после каждого нового перехода в положительный баланс, но не сразу при повторном отказе |
| R14 | `.txt`: отказ → пополнение → успешная повторная отправка | Ответ в ленте; `pending_draft` снят; поле пустое; после B → A задача не воскресает |
| R17 | Успешный multipart без предшествующего отказа | Ответ в ленте, `pending_draft` нет, модалка закрыта |
| R18 | END приходит после ухода A → B, затем возврат к A | Черновик задачи сохранён для A (`assistant === '12'`), B не получает файлы/задачу, при возврате текст в поле A |

Ключевые assertions E1/E2/E6 записать явно, а не только оставить в таблице:

```tsx
it('E1: rejected возвращается один раз, пузырь убран, пополнение не открыто', async () => {
  net.chatStreams.push(ndjson(NO_TOKENS));
  await open();
  await send('привет');
  expect(field().value).toBe('привет');
  expect(draft()?.text).toBe('привет');
  expect(feedText()).not.toContain('привет');
  expect(countStops()).toBe(1);
  expect(tokenModalVisible()).toBe(false);
});

it('E2: новый набор и rejected сохраняются без дублирования', async () => {
  const gate = deferred();
  net.chatStreams.push(ndjson(NO_TOKENS, gate.promise));
  await open();
  typeInto(field(), 'первое');
  await clickEl(sendBtn());
  await settle();
  typeInto(field(), 'набираю');
  await act(async () => { gate.resolve(); });
  await settle(14);
  expect(field().value).toContain('набираю');
  expect(field().value.split('первое').length - 1).toBe(1);
});
```

В `noTokensDraftWiring.test.ts` сохранить текущие полезные проверки двух `if (noTokens) break`, очереди/`noTokensHoldRef`, `clearResidue`, смены ассистента и synthetic PDF. Заменить устаревшие ожидания `onNoTokens`, `restoreDraftText`, `save/peek/clearNoTokensDraft`, автооткрытия `TokenPackages` на новый контракт `userMessageId`, `applyNoTokensOutcome`, `savePendingDraft`, `forgetPendingDraftIfSent` и отсутствие `setShowTokenPackages` в no_tokens-ветках. Не удалять suite.

В новом `noTokensWiring.test.ts` выборочно перенести из `09a4adfa` проверки:
- сигнатура содержит optional `userMessageId`, возврат `noTokens ? 'no_tokens' : 'ok'`;
- `isNoTokensEnd` разбирается внутри `data.type === 'end'` независимо от `usage`;
- только `userMessageId !== undefined` открывает восстановление текста/черновика;
- greeting, regenerate, PDF Маши вызывают `sendMessageToAI` без id;
- `collapseNoTokensStop`, очистка очереди, `savePendingDraft`, `forgetPendingDraftIfSent`;
- общий `restoreFileTaskOnNoTokens` для inline и multipart;
- `pendingFilesAssistantId` сбрасывается на submit/cancel;
- `setShowTokenPackages` отсутствует в `sendMessageToAI`, `handleFileTaskSubmit`, `restoreFileTaskOnNoTokens`;
- `Message.noTokensStop?: boolean` и нужные imports.

В `streamFailureWiring.test.ts` закрепить `return 'error'` для `AbortError`, живого серверного хода и окончательного catch; успешный inline-файл не должен считать обрыв успехом. В `draftWiring.test.ts` искать import-line и отдельные имена вместо точного полного import. В `greetingRaceWiring.test.ts` использовать marker `string | RegExp` из `fb7195d` и:

```ts
expect(body(/const sendMessageToAI = async \([^)]*\)(?:\s*:\s*[^{]+)?\s*=>\s*\{/))
  .toContain('sendSeqRef.current += 1;');
```

- [ ] **Step 2: Закоммитить красные behavioral/wiring tests и доказать RED на ноде**

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current add \
  src/components/chat/noTokensDraftWiring.test.ts \
  src/components/chat/noTokensWiring.test.ts \
  src/components/chat/noTokensMount.test.tsx \
  src/components/chat/streamFailureWiring.test.ts \
  src/components/chat/draftWiring.test.ts \
  src/components/chat/greetingRaceWiring.test.ts
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current commit \
  -m "test(chat): живые no_tokens и файловые регрессии (красный)" \
  -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
front-ci "pnpm exec vitest run src/components/chat/noTokensMount.test.tsx src/components/chat/noTokensDraftWiring.test.ts src/components/chat/noTokensWiring.test.ts src/components/chat/streamFailureWiring.test.ts src/components/chat/draftWiring.test.ts src/components/chat/greetingRaceWiring.test.ts"
```

Expected: FAIL как минимум E1/E2/E6/E8/E10/R12/R14 и новых wiring assertions. E0 и R17 могут остаться зелёными — это санитарные сценарии, а не признак ложного RED. В выводе должны быть реальные DOM-расхождения, а не только отсутствие файла/импорта.

- [ ] **Step 3: Минимально перестроить текстовый no_tokens-путь**

В `ChatInterface.tsx` заменить imports:

```ts
import {
  forgetPendingDraftIfSent,
  hasPendingDraftFor,
  savePendingDraft,
  takePendingDraftFor,
} from '../../utils/pendingDraft';
import {
  applyNoTokensOutcome,
  collapseNoTokensStop,
  isNoTokensEnd,
  restoreIntoInput,
} from './noTokensDraft';
```

В `Message` добавить `noTokensStop?: boolean`. В `returnQueueToInput` использовать существующий helper:

```ts
setInput((prev) => restoreIntoInput(prev, pending));
```

Удалить mount-effect с `peekNoTokensDraft` и вызов `clearNoTokensDraft` из `handleSendInner`; общий effect `takePendingDraftFor` остаётся. Сохранить `noTokensHoldRef.current = false` при явной отправке.

Сигнатура и outcome:

```ts
const sendMessageToAI = async (
  userMessage: string,
  userMessageId?: string,
): Promise<'ok' | 'no_tokens' | 'error'> => {
```

В цикле разбора объединить end-логику, не пряча no_tokens за `usage`:

```ts
if (data.type === 'end') {
  if (data.usage) lastUsage = data.usage;
  if (isNoTokensEnd(data)) noTokens = true;
}
```

Сохранить текущий `if (noTokens) break;`. При завершении в том же ассистенте:

```ts
const completedMessage: Message = {
  // существующие поля сообщения остаются без изменений
  id: assistantMessageId,
  type: 'assistant',
  content: accumulatedContent,
  timestamp: new Date(),
  isStreaming: false,
  tokensUsed: lastUsage?.total || undefined,
  inlineJobIds: inlineJobIds.length > 0 ? [...inlineJobIds] : undefined,
  calendarProposalIds: calendarProposalIds.length > 0 ? [...calendarProposalIds] : undefined,
  activity: finishActivity(activity, Date.now()),
  noTokensStop: noTokens || undefined,
};

if (noTokens) {
  noTokensHoldRef.current = true;
  setMessages(prev => collapseNoTokensStop(prev, userMessageId ?? '', completedMessage));
} else {
  setMessages(prev => [...prev, completedMessage]);
}

if (userMessageId !== undefined && streamAssistantId !== null) {
  if (noTokens) {
    const queuedText = joinQueue(queuedRef.current);
    if (queuedRef.current.length) applyQueued(() => []);
    const outcome = applyNoTokensOutcome({ rejectedText: userMessage, queuedText });
    setInput(prev => restoreIntoInput(prev, outcome.input));
    savePendingDraft(outcome.draftText, streamAssistantId);
  } else {
    forgetPendingDraftIfSent(streamAssistantId, userMessage);
  }
}
setStreamingMessageId(null);
```

Здесь нет `setShowTokenPackages(true)` и нет `opts.onNoTokens`. `savePendingDraft` сохраняет rejected + очередь, но не затирает актуальный новый ввод; сам `setInput` видит актуальное `prev` и поэтому не дублирует stale `input`.

`sendMessageText` создаёт человеческий пузырь и передаёт его id:

```ts
setMessages(prev => [...prev, userMessage]);
await sendMessageToAI(text, userMessage.id);
```

`sendInitialGreeting`, `handleRegenerateResponse`, PDF Маши продолжают вызывать `sendMessageToAI(...)` без id. Их stop-сообщение схлопывается, но поле и черновик синтетическим промптом не наполняются.

Все три catch-выхода возвращают `'error'`; после `finally`:

```ts
return noTokens ? 'no_tokens' : 'ok';
```

Зафиксировать текстовую часть отдельным минимальным коммитом, чтобы CI проверил именно её:

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current add \
  src/components/chat/ChatInterface.tsx
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current commit \
  -m "fix(chat): вернуть текст и пузырь при no_tokens" \
  -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
front-ci "pnpm exec vitest run src/components/chat/noTokensMount.test.tsx -t 'E0|E1|E2|E3|E4|E5'"
```

Expected: E0–E5 PASS на SHA текстовой реализации; `front-ci` опубликовал этот коммит. Файловые сценарии на этом шаге ещё не запускаются.

- [ ] **Step 4: Добавить привязку deferred files и общий restore без auto-open**

Рядом с файловым state добавить:

```ts
const [pendingFilesAssistantId, setPendingFilesAssistantId] = useState<number | null>(null);
const fileTaskDraftSavedRef = useRef(false);
```

В универсальном эффекте смены ассистента, после `returnQueueToInput()`:

```ts
if (pendingFilesAssistantId !== null && newId !== pendingFilesAssistantId) {
  if (hasPendingDraftFor(pendingFilesAssistantId) || fileTaskDraftSavedRef.current) {
    setPendingFiles([]);
    setFileTaskInput('');
    setPendingFilesAssistantId(null);
    fileTaskDraftSavedRef.current = false;
  }
}
```

Если сохранение задачи не удалось, файлы и текст не снимаются: они остаются единственным носителем задачи для исходного ассистента; auto-open у другого ассистента всё равно запрещён по id.

Перед `handleFileTaskSubmit` добавить общую функцию с точной сигнатурой:

```ts
const restoreFileTaskOnNoTokens = (
  rejectedMessageId: string,
  stopMessage: Message | null,
  files: File[],
  task: string,
  uploadAssistantId: number | null,
) => {
  fileTaskDraftSavedRef.current = uploadAssistantId !== null
    ? savePendingDraft(task, uploadAssistantId)
    : false;
  if (uploadAssistantId === null || selectedAssistantIdRef.current !== uploadAssistantId) return;

  noTokensHoldRef.current = true;
  setMessages(prev => {
    if (stopMessage) return collapseNoTokensStop(prev, rejectedMessageId, stopMessage);
    const withoutBubble = prev.filter(m => m.id !== rejectedMessageId);
    const newStop = withoutBubble[withoutBubble.length - 1];
    if (!newStop?.noTokensStop) return withoutBubble;
    return collapseNoTokensStop(withoutBubble.slice(0, -1), '', newStop);
  });
  setPendingFiles(files);
  setFileTaskInput(task);
  setPendingFilesAssistantId(uploadAssistantId);
};
```

Функция сохраняет именно `task`, не prompt с содержимым файла; File-объекты остаются живыми в памяти без reload. Она не вызывает ни `setShowFileTaskModal`, ни `setShowTokenPackages`.

В начале `handleFileTaskSubmit`, после guards, захватить ассистента до очистки state и снять hold явной отправки:

```ts
const files = pendingFiles;
const task = fileTaskInput.trim();
const uploadAssistantId = selectedAssistant?.id ?? null;
noTokensHoldRef.current = false;
```

При очистке перед отправкой также `setPendingFilesAssistantId(null)`. В Cancel добавить тот же сброс id.

Для одиночного текстового файла не передавать `userMessageId` в `sendMessageToAI`: prompt синтетический. Использовать трёхзначный outcome:

```ts
let outcome: 'ok' | 'no_tokens' | 'error';
try {
  const text = await file.text();
  const prompt = `Пользователь загрузил файл "${file.name}".\n\nСодержимое:\n\`\`\`\n${text.slice(0, 50000)}\n\`\`\`\n\nЗадание: ${task}`;
  outcome = await sendMessageToAI(prompt);
} catch {
  outcome = await sendMessageToAI(`Файл "${file.name}" — не удалось прочитать. Задание: ${task}`);
}
if (outcome === 'no_tokens') {
  restoreFileTaskOnNoTokens(userMessage.id, null, files, task, uploadAssistantId);
} else if (outcome === 'ok' && uploadAssistantId !== null) {
  forgetPendingDraftIfSent(uploadAssistantId, task);
}
return;
```

`'error'` черновик не снимает. В multipart-сообщении добавить `noTokensStop: noTokens || undefined`; сохранить текущий `if (noTokens) break;` и заменить финал:

```ts
if (noTokens) {
  restoreFileTaskOnNoTokens(userMessage.id, assistantMsg, files, task, uploadAssistantId);
} else {
  setMessages(prev => [...prev, assistantMsg]);
  if (uploadAssistantId !== null) forgetPendingDraftIfSent(uploadAssistantId, task);
}
```

Удалить старые локальные `restoreFileTask`, `reopenFileTaskRef`, вызовы `setShowTokenPackages(true)` и специальный `TokenPackages.onClose`. Оставить обычное ручное пополнение:

```tsx
{showTokenPackages && (
  <TokenPackages onClose={() => setShowTokenPackages(false)} />
)}
```

- [ ] **Step 5: Запретить draft-дубль и открывать deferred modal только на переходе баланса**

Перед существующим pending-draft effect добавить `draftEffectAppliedForRef` и guards:

```ts
const draftEffectAppliedForRef = useRef<number | null>(null);
useEffect(() => {
  if (!selectedAssistant || historyLoading) return;
  if (historyLoadedForRef.current !== selectedAssistant.id) return;
  if (textareaRef.current?.value.trim()) return;

  if (pendingFiles.length > 0 && pendingFilesAssistantId === selectedAssistant.id) {
    const arrivedViaSwitch = draftEffectAppliedForRef.current !== selectedAssistant.id;
    if (!arrivedViaSwitch || !hasPendingDraftFor(selectedAssistant.id)) return;
    setPendingFiles([]);
    setFileTaskInput('');
    setPendingFilesAssistantId(null);
    fileTaskDraftSavedRef.current = false;
  }
  draftEffectAppliedForRef.current = selectedAssistant.id;
  const draft = takePendingDraftFor(selectedAssistant.id);
  if (!draft) return;
  setInput(draft);
  textareaRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedAssistant?.id, historyLoading]);
```

Это сохраняет R6: перечитывание истории не подставляет задачу в поле, пока живы deferred files. При реальном возврате к ассистенту с надёжно сохранённым draft остаётся один носитель текста.

После `handleFileTaskSubmit` добавить auto-reopen только по переходу:

```ts
const fileTaskAutoReopenedRef = useRef(false);
const lastSeenTokensRef = useRef<number | null>(null);
useEffect(() => {
  const prevTokens = lastSeenTokensRef.current;
  const tokensNow = user?.tokens ?? 0;
  lastSeenTokensRef.current = tokensNow;
  if (!pendingFiles.length) {
    fileTaskAutoReopenedRef.current = false;
    return;
  }
  if (showFileTaskModal || fileTaskAutoReopenedRef.current) return;
  if (prevTokens === null || prevTokens > 0 || tokensNow <= 0) return;
  if (pendingFilesAssistantId === null || selectedAssistant?.id !== pendingFilesAssistantId) return;
  fileTaskAutoReopenedRef.current = true;
  setShowFileTaskModal(true);
}, [user?.tokens, pendingFiles.length, showFileTaskModal, pendingFilesAssistantId, selectedAssistant?.id]);
```

Ручной выбор файла по-прежнему открывает обычную модалку задачи; ограничение `tokens > 0` относится именно к автоматическому reopen после отказа. При stale positive балансе окно сразу не открывается: сначала должен быть наблюден `<=0`.

Зафиксировать файловую часть и прогнать весь живой suite на её SHA:

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current add \
  src/components/chat/ChatInterface.tsx
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current commit \
  -m "fix(chat): сохранить отложенные файлы после no_tokens" \
  -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
front-ci "pnpm exec vitest run src/components/chat/noTokensMount.test.tsx"
```

Expected: E0–E10 и R6/R11/R12/R13/R14/R17/R18 PASS на SHA файловой реализации; `front-ci` опубликовал этот коммит. Пополнение ни в одном no_tokens-сценарии не появляется.

- [ ] **Step 6: Финальный связанный прогон и проверка публикации**

```bash
front-ci "pnpm exec vitest run src/components/chat/noTokensDraft.test.ts src/components/chat/noTokensDraftWiring.test.ts src/components/chat/noTokensWiring.test.ts src/components/chat/noTokensMount.test.tsx src/components/chat/streamFailureWiring.test.ts src/components/chat/draftWiring.test.ts src/components/chat/greetingRaceWiring.test.ts src/components/chat/interactivityWiring.test.ts src/utils/pendingDraft.test.ts src/components/guest/GuestChat.test.tsx src/components/guest/GuestChatPage.test.tsx"
```

Expected: все suites PASS. Существующие `noTokensDraftWiring`, greeting, draft, interactivity и guest consumers не сломаны. Реализация уже закоммичена двумя минимальными коммитами выше; `front-ci` опубликовал финальный HEAD перед прогоном.

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current status --short
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse HEAD
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse origin/fix/followups-1111-current
```

Expected: status пустой, оба SHA совпадают и указывают на коммит файловой реализации. Если совместимость потребовала дополнительную правку, её сначала покрывают красным тестом, затем коммитят с тем же trailer и повторяют полный связанный прогон через `front-ci`.

---

### Task 3: `RoutinesManager` busy/failed и семь локалей без потери новых строк

**Files:**
- Create: `src/components/settings/RoutinesManager.test.tsx`
- Modify: `src/components/settings/RoutinesManager.tsx`
- Modify: `src/i18n/locales/ru.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/es.json`
- Modify: `src/i18n/locales/de.json`
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/i18n/locales/pt.json`
- Modify: `src/i18n/locales/zh.json`

- [ ] **Step 1: Добавить живой красный тест четырёх исходов**

Использовать jsdom и существующий `src/test/dom`, без новой библиотеки. Мок `react-i18next` обязан использовать `importOriginal`, потому что `RoutinesManager` импортирует общий i18n instance:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  byButton, clickAsync, flush, mount, tRu, visibleText, type Mounted,
} from '../../test/dom';
import RoutinesManager from './RoutinesManager';
import { apiClient } from '../../services/apiClient';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const { tRu: t } = await import('../../test/dom');
  return { ...actual, useTranslation: () => ({ t }) };
});
vi.mock('../../services/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const api = vi.mocked(apiClient);
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as any;
const ROUTINE = {
  id: 'r1', title: 'Энергия дня', assistantId: '14', prompt: 'Дай энергию дня',
  sendHour: 8, tz: 'Europe/Moscow', days: null, enabled: true,
};
let view: Mounted | null = null;
const settle = async () => { await flush(); await flush(); };
const render = () => { view = mount(<RoutinesManager />); return view; };
const clickTest = async (container: HTMLElement) => {
  const button = byButton(container, new RegExp(tRu('settings.routines.test_button')));
  expect(button).not.toBeNull();
  await clickAsync(button!);
  await settle();
};
```

В `beforeEach` очищать mocks и возвращать `[ROUTINE]` из `/webhook/routines`, `[]` из agents; в `afterEach` размонтировать. Тесты busy/failed сравнивают с буквальным русским текстом, не с `tRu` того же ключа:

```tsx
it('busy показывает занятость, а не совет включить push', async () => {
  api.post.mockResolvedValue(ok({ ok: true, delivered: 0, busy: true }));
  const { container } = render();
  await settle();
  await clickTest(container);
  expect(visibleText(container)).toContain('Ассистент сейчас занят — попробуй через минуту.');
  expect(visibleText(container)).not.toContain('Сгенерировали, но пуш не доставлен');
});

it('failed показывает сбой подготовки, а не совет включить push', async () => {
  api.post.mockResolvedValue(ok({ ok: true, delivered: 0, failed: true }));
  const { container } = render();
  await settle();
  await clickTest(container);
  expect(visibleText(container)).toContain('Не получилось подготовить сообщение — попробуй ещё раз чуть позже.');
  expect(visibleText(container)).not.toContain('Сгенерировали, но пуш не доставлен');
});
```

Добавить control cases `delivered:1 → 'Отправили — проверь уведомление 🔔'` и `delivered:0` без flags → существующий полный `test_no_push`.

- [ ] **Step 2: Закоммитить красный тест и доказать RED на ноде**

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current add \
  src/components/settings/RoutinesManager.test.tsx
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current commit \
  -m "test(settings): исходы busy и failed у рутины (красный)" \
  -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
front-ci "pnpm exec vitest run src/components/settings/RoutinesManager.test.tsx"
```

Expected: FAIL в busy/failed — текущий компонент показывает `test_no_push`; control cases успеха/no_push остаются зелёными.

- [ ] **Step 3: Минимально изменить обработчик и вставить только 14 переводов**

В `RoutinesManager.tsx` заменить только `test`:

```ts
const test = async (rt: Routine) => {
  const d = await post({ action: 'test', id: rt.id });
  if (!d) return;
  if (d.busy) { setMsg(t('settings.routines.test_busy')); return; }
  if (d.failed) { setMsg(t('settings.routines.test_failed')); return; }
  setMsg(d.delivered > 0
    ? t('settings.routines.test_success')
    : t('settings.routines.test_no_push'));
};
```

В каждой локали точечным Edit вставить две строки сразу после существующего `test_no_push`; не использовать `translate-locales`, не форматировать файл целиком и не копировать locale из старой ветки:

| Локаль | `test_busy` | `test_failed` |
|---|---|---|
| ru | `Ассистент сейчас занят — попробуй через минуту.` | `Не получилось подготовить сообщение — попробуй ещё раз чуть позже.` |
| en | `The assistant is busy right now — try again in a minute.` | `Couldn't prepare the message — try again a bit later.` |
| es | `El asistente está ocupado ahora mismo: inténtalo de nuevo en un minuto.` | `No se pudo preparar el mensaje: inténtalo de nuevo un poco más tarde.` |
| de | `Der Assistent ist gerade beschäftigt — versuche es in einer Minute noch einmal.` | `Die Nachricht konnte nicht vorbereitet werden — versuche es etwas später noch einmal.` |
| fr | `L'assistant est occupé en ce moment — réessaie dans une minute.` | `Impossible de préparer le message — réessaie un peu plus tard.` |
| pt | `O assistente está ocupado agora mesmo — tenta dentro de um minuto.` | `Não foi possível preparar a mensagem — tenta de novo um pouco mais tarde.` |
| zh | `助手现在正忙——过一分钟再试试。` | `没能生成消息——晚一点再试一次。` |

Это финальные формулировки `09a4adfa` после `2646c87`, а не промежуточные «busy talking with you».

- [ ] **Step 4: Зафиксировать реализацию и точечные locale-вставки**

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current add \
  src/components/settings/RoutinesManager.tsx \
  src/components/settings/RoutinesManager.test.tsx \
  src/i18n/locales/ru.json src/i18n/locales/en.json src/i18n/locales/es.json \
  src/i18n/locales/de.json src/i18n/locales/fr.json src/i18n/locales/pt.json \
  src/i18n/locales/zh.json
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current commit \
  -m "fix(settings): различать busy и failed при проверке рутины" \
  -m "Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

Expected: HEAD содержит обработчик, behavioral test и ровно две новые строки в каждой из семи локалей; посторонних locale-изменений нет. Сам test уже находится в предыдущем RED-коммите, поэтому в новом diff обязательны реализация и locale-вставки.

- [ ] **Step 5: Доказать GREEN на SHA реализации, проверить неизменность остальных ключей и публикацию**

```bash
front-ci "pnpm exec vitest run src/components/settings/RoutinesManager.test.tsx src/components/webvisorPrivacy.test.ts && pnpm check-locales && pnpm check-keys && pnpm check-hardcoded"
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current diff --numstat c776a2a -- src/i18n/locales
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current status --short
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse HEAD
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse origin/fix/followups-1111-current
```

Expected: suites и три проверки PASS на опубликованном green-коммите; для каждой из семи локалей numstat ровно `2 0` относительно базы. Новые privacy/admin/retention и другие строки `main` не удалены. Status пустой, локальный и удалённый SHA совпадают.

---

### Task 4: Финальные проверки, baseline delta и diff audit

**Files:**
- Изменений по плану нет. Любая регрессия возвращает исполнителя к соответствующей задаче через новый red test; нельзя маскировать её ослаблением assertions.

- [ ] **Step 1: Полный связанный Vitest-набор на финальном SHA**

```bash
front-ci "pnpm exec vitest run src/components/chat/noTokensDraft.test.ts src/components/chat/noTokensDraftWiring.test.ts src/components/chat/noTokensWiring.test.ts src/components/chat/noTokensMount.test.tsx src/components/chat/streamFailure.test.ts src/components/chat/streamFailureWiring.test.ts src/components/chat/draftWiring.test.ts src/components/chat/greetingRaceWiring.test.ts src/components/chat/interactivityWiring.test.ts src/components/settings/RoutinesManager.test.tsx src/components/webvisorPrivacy.test.ts src/utils/pendingDraft.test.ts src/utils/pendingDraft.entry.test.ts src/utils/draftCapture.test.ts src/utils/draftCaptureAsk.test.ts src/utils/clearAppStorage.test.ts src/components/guest/GuestChat.test.tsx src/components/guest/GuestChatPage.test.tsx"
```

Expected: все suites PASS, 0 failed. Это целевой набор, не тяжёлый полный прогон репозитория.

- [ ] **Step 2: Сравнить `tsc -p tsconfig.app.json` с базой, а не требовать нулевой исторический baseline**

Сохранить финальный SHA, снять baseline-вывод на `c776a2a`, вернуть CI-worktree на финал и нормализовать только line/column, чтобы сдвиг строк не маскировал новые ошибки:

```bash
FINAL_SHA=$(git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse HEAD) || exit 1
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current push -q origin HEAD:refs/heads/fix/followups-1111-current || exit 1
ssh dv@85.192.61.231 "git -C ~/ci/wt/followups-1111-front fetch -q origin && git -C ~/ci/wt/followups-1111-front checkout -q c776a2a7dda2c75eb6c9d5a639e40cf5ba52288b && source ~/.nvm/nvm.sh && cd ~/ci/wt/followups-1111-front && pnpm exec tsc --noEmit -p tsconfig.app.json > /tmp/followups-1111-tsc-base.log 2>&1; base_status=\$?; git -C ~/ci/wt/followups-1111-front checkout -q $FINAL_SHA && pnpm exec tsc --noEmit -p tsconfig.app.json > /tmp/followups-1111-tsc-final.log 2>&1; final_status=\$?; printf 'baseline=%s final=%s\n' \"\$base_status\" \"\$final_status\""
ssh dv@85.192.61.231 'node -e '\''const fs=require("fs"); for (const f of process.argv.slice(1)) { const lines=fs.readFileSync(f,"utf8").split("\n").map((l)=>l.replace(/^(.+?)\(\d+,\d+\): (error TS\d+:.*)$/,"$1: $2")).sort(); fs.writeFileSync(f+".norm",lines.join("\n")+"\n"); }'\'' /tmp/followups-1111-tsc-base.log /tmp/followups-1111-tsc-final.log && diff -u /tmp/followups-1111-tsc-base.log.norm /tmp/followups-1111-tsc-final.log.norm'
```

Expected: `diff` пустой и exit code 0; новых TypeScript-ошибок нет. Исторические baseline-ошибки могут остаться, но их нормализованный набор не должен измениться. CI-worktree в конце стоит на `FINAL_SHA`.

- [ ] **Step 3: Production build на ноде**

```bash
front-ci "pnpm build"
```

Expected: Vite build завершается exit code 0, `dist/` создан на CI-ноде. Ничего из `dist` не копировать и не деплоить.

- [ ] **Step 4: Все i18n checks, включая известный baseline-red check-locale-format**

```bash
front-ci "pnpm check-locales && pnpm check-keys && pnpm check-hardcoded"
```

Expected: все три PASS.

`check-locale-format` на текущем `main` уже имеет известные hits жёстких локалей. Сравнить его вывод с базой аналогично tsc, нормализуя номера строк:

```bash
FINAL_SHA=$(git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse HEAD) || exit 1
ssh dv@85.192.61.231 "git -C ~/ci/wt/followups-1111-front checkout -q c776a2a7dda2c75eb6c9d5a639e40cf5ba52288b && source ~/.nvm/nvm.sh && cd ~/ci/wt/followups-1111-front && pnpm check-locale-format > /tmp/followups-1111-locale-base.log 2>&1; git -C ~/ci/wt/followups-1111-front checkout -q $FINAL_SHA && pnpm check-locale-format > /tmp/followups-1111-locale-final.log 2>&1"
ssh dv@85.192.61.231 'node -e '\''const fs=require("fs"); for (const f of process.argv.slice(1)) { const lines=fs.readFileSync(f,"utf8").split("\n").map((l)=>l.replace(/^(\s*src\/.+?):\d+(  .*)$/,"$1$2")).sort(); fs.writeFileSync(f+".norm",lines.join("\n")+"\n"); }'\'' /tmp/followups-1111-locale-base.log /tmp/followups-1111-locale-final.log && diff -u /tmp/followups-1111-locale-base.log.norm /tmp/followups-1111-locale-final.log.norm'
```

Expected: normalized diff пустой; никаких новых hardcoded locale-formats. Известный baseline-red не объявлять своей регрессией и не чинить в рамках этой задачи.

- [ ] **Step 5: Проверить точный состав diff и отсутствие побочных изменений**

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current fetch -q origin
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current diff --check origin/main...HEAD
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current diff --numstat origin/main...HEAD -- src/i18n/locales
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current diff --name-only origin/main...HEAD | sort
```

Expected:
- `diff --check` без вывода;
- каждая локаль `2 0`;
- файлы строго ограничены этим списком:

```text
docs/superpowers/plans/2026-11-11-no-tokens-followups-current.md
src/components/chat/ChatInterface.tsx
src/components/chat/draftWiring.test.ts
src/components/chat/greetingRaceWiring.test.ts
src/components/chat/noTokensDraft.test.ts
src/components/chat/noTokensDraft.ts
src/components/chat/noTokensDraftWiring.test.ts
src/components/chat/noTokensMount.test.tsx
src/components/chat/noTokensWiring.test.ts
src/components/chat/streamFailureWiring.test.ts
src/components/settings/RoutinesManager.test.tsx
src/components/settings/RoutinesManager.tsx
src/i18n/locales/de.json
src/i18n/locales/en.json
src/i18n/locales/es.json
src/i18n/locales/fr.json
src/i18n/locales/pt.json
src/i18n/locales/ru.json
src/i18n/locales/zh.json
src/utils/pendingDraft.test.ts
src/utils/pendingDraft.ts
```

Отдельно убедиться, что старое sessionStorage API полностью ушло, а одобренные guards присутствуют:

```bash
rg -n "no_tokens_draft|saveNoTokensDraft|peekNoTokensDraft|clearNoTokensDraft|restoreDraftText" \
  /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current/src || true
rg -n "setShowTokenPackages\(true\)|forgetPendingDraftIfSent|restoreFileTaskOnNoTokens|pendingFilesAssistantId" \
  /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current/src/components/chat/ChatInterface.tsx
```

Expected: первый поиск пуст; во втором `setShowTokenPackages(true)` остаётся только у ручной кнопки баланса и `initialShowTokens`, но не в `sendMessageToAI`, `handleFileTaskSubmit`, `restoreFileTaskOnNoTokens`; общие helpers подключены. Нет Flutter-файлов, backend-файлов, deploy-файлов, `package.json` или lockfile в diff.

- [ ] **Step 6: Финальный push и проверка удалённого SHA**

```bash
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current push origin HEAD:refs/heads/fix/followups-1111-current
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current fetch -q origin
LOCAL_SHA=$(git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse HEAD) || exit 1
REMOTE_SHA=$(git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current rev-parse origin/fix/followups-1111-current) || exit 1
test "$LOCAL_SHA" = "$REMOTE_SHA"
git -C /Users/dmitry/Downloads/spirits_front/.worktrees/followups-1111-current status --short
```

Expected: SHA совпадают, status пустой. Остановиться здесь: не merge в `main`, не запускать `deploy.sh`, не выкатывать test/prod.

---

## Самопроверка плана по обязательному остатку

1. **Непустой current + rejected:** `restoreIntoInput` объединяет оба текста; `applyNoTokensOutcome` не получает stale `currentInput`; E1/E2 считают rejected ровно один раз. Пузырь удаляется по `userMessageId`; synthetic greeting/regenerate/PDF и file prompt идут без id.
2. **Общий draft:** используется только `pending_draft` через `savePendingDraft`, `takePendingDraftFor`, `hasPendingDraftFor`, `forgetPendingDraftIfSent`; TTL `DRAFT_TTL_MS=1ч`, лимит 2000, несовпавшие записи не пересохраняются. SessionStorage API удалён; consumers guest/index/clearAppStorage сохранены и проверены.
3. **Файлы:** `uploadAssistantId`/`pendingFilesAssistantId` не дают переноса и auto-open у другого ассистента; File-объекты и задача сохраняются без reload; modal открывается только на `<=0 → >0`; stops схлопываются в обеих ветках; успешный `.txt` снимает draft только при `'ok'`; pending-draft effect уступает deferred files; при `savePendingDraft=false` файлы не снимаются.
4. **Живые регрессии:** E0–E10 и R6/R11/R12/R13/R14/R17/R18 монтируют настоящий компонент, проверяют DOM, localStorage, число POST и видимость обоих модалок. `noTokensDraftWiring` сохранён; `noTokensWiring` восстановлен выборочно; source-only assertions больше не являются единственной защитой.
5. **Routines:** busy/failed обрабатываются до delivered; четыре поведенческих исхода; во всех семь локалей добавлены ровно две финальные строки, numstat `2 0` исключает затирание новых строк.
6. **Проверки:** каждая функциональная задача имеет RED на `~/ci/wt/followups-1111-front`, минимальную реализацию, GREEN, commit+push. Финал включает связанные Vitest, tsc baseline delta, build, i18n checks и точный diff audit. Deploy и Flutter исключены.
