# Disable Auto Greeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пустой обычный чат, «Чистый лист» и выбор ассистента из карточки не отправляют автоматический платный запрос «Расскажи про себя».

**Architecture:** Убираем триггер на уровне `ChatInterface`, поэтому запрос не создаётся вовсе и не требует изменений биллинга или API. Тесты фиксируют отсутствие пути автоприветствия, а прежние проверки гонок истории и черновиков сохраняются.

**Tech Stack:** React 18, TypeScript, Vitest, pnpm; тесты и сборка только на `dv@85.192.61.231`.

---

### Task 1: Зафиксировать новое поведение красным тестом

**Files:**
- Create: `src/components/chat/noAutoGreetingWiring.test.ts`
- Modify: `src/components/chat/greetingRaceWiring.test.ts`
- Modify: `src/components/chat/draftWiring.test.ts`
- Delete: `src/components/chat/greetingGate.test.ts`

- [ ] **Step 1: Написать структурный тест отсутствия автоприветствия**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

describe('пустой чат не делает платный ход без действия человека', () => {
  it('не содержит пути автоприветствия', () => {
    expect(SRC).not.toContain('sendInitialGreeting');
    expect(SRC).not.toContain("t('chat.initial_greeting')");
    expect(SRC).not.toContain('greetingStillWanted');
    expect(SRC).not.toContain('sendSeqRef');
  });

  it('сохраняет обычную отправку сообщения человеком', () => {
    expect(SRC).toContain('const sendMessageToAI = async (');
  });
});
```

- [ ] **Step 2: Убрать старые ожидания автоприветствия**

Из `greetingRaceWiring.test.ts` удалить describe про `greetingStillWanted`, сохранив helper `body` для теста очереди и тесты устаревшей истории. Из `draftWiring.test.ts` удалить helper `greeting` и describe «автоприветствие уступает черновику», сохранив проверки подстановки черновика. Удалить `greetingGate.test.ts` вместе с тестируемым только старым поведением.

- [ ] **Step 3: Закоммитить красный тест**

```bash
git add src/components/chat/noAutoGreetingWiring.test.ts src/components/chat/greetingRaceWiring.test.ts src/components/chat/draftWiring.test.ts src/components/chat/greetingGate.test.ts
git commit -m "test(chat): запретить автоприветствие пустого чата (красный)"
```

- [ ] **Step 4: Запустить тест по точному SHA и убедиться, что он красный именно на старом пути**

```bash
SHA=$(git rev-parse HEAD)
git push -u origin fix/disable-auto-greeting
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm vitest run src/components/chat/noAutoGreetingWiring.test.ts --maxWorkers=1 --minWorkers=1"
```

Ожидание: FAIL, `SRC` содержит `sendInitialGreeting`.

### Task 2: Удалить автоматический платный ход

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx`
- Delete: `src/components/chat/greetingGate.ts`

- [ ] **Step 1: Удалить реализацию и все вызовы**

Удалить:

```ts
import { greetingStillWanted } from './greetingGate';
const sendSeqRef = useRef(0);
```

Удалить `sendSeqRef.current += 1`, всю функцию `sendInitialGreeting` и её вызовы после пустой истории, fallback и выбора ассистента из карточки. Не добавлять замену или условный флаг. Удалить неиспользуемый `greetingGate.ts`.

- [ ] **Step 2: Закоммитить исправление**

```bash
git add src/components/chat/ChatInterface.tsx src/components/chat/greetingGate.ts
git commit -m "fix(chat): не отправлять автоприветствие и не списывать за него"
```

- [ ] **Step 3: Прогнать целевые тесты по точному SHA**

```bash
SHA=$(git rev-parse HEAD)
git push origin fix/disable-auto-greeting
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git fetch -q origin && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm vitest run src/components/chat/noAutoGreetingWiring.test.ts src/components/chat/greetingRaceWiring.test.ts src/components/chat/draftWiring.test.ts --maxWorkers=1 --minWorkers=1"
```

Ожидание: все файлы PASS.

### Task 3: Проверить и выпустить

**Files:**
- Verify only; новых файлов нет.

- [ ] **Step 1: Прогнать полный набор и сборку на ноде**

```bash
SHA=$(git rev-parse HEAD)
ssh dv@85.192.61.231 "cd ~/ci/spirits_front && git checkout -q $SHA && source ~/.nvm/nvm.sh && pnpm install && pnpm test && pnpm build"
```

Ожидание: тесты PASS, сборка создаёт `dist` без ошибок. Существующие несвязанные падения фиксировать отдельно с доказательством, что они есть и на базовом SHA.

- [ ] **Step 2: Проверить diff и интегрировать только эту ветку**

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- src/components/chat
git push origin HEAD:main
```

Перед push повторно `git fetch origin`; если `origin/main` изменился, перебазировать эту ветку и повторить проверки. Локальный общий `main` с чужой работой не использовать.

- [ ] **Step 3: Выкатить штатно и проверить прод**

```bash
bash ~/Downloads/spirits_back/scripts/deploy.sh
```

После зелёного test/prod smoke сверить свежий бандл и отсутствие `sendInitialGreeting`/`chat.initial_greeting` в нём. В БД прода у тестовой fresh-сессии пустая история не должна пополняться автоматическим human/AI ходом; новых автоматических списаний быть не должно.
