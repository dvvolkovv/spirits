# Очередь отправки в чате — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разблокировать поле ввода чата во время ответа ассистента — новые реплики копятся локально и уходят одним склеенным ходом сразу после завершения текущего.

**Architecture:** Чистая логика очереди живёт в новом модуле `src/components/chat/sendQueue.ts` и покрыта unit-тестами. `ChatInterface.tsx` держит очередь в состоянии (плюс ref-зеркало для guard'ов), рендерит её приглушёнными пузырями под стримом и досылает через существующий `sendMessageText` в эффекте, срабатывающем по завершении хода. Параллельная отправка невозможна принципиально: релей `r.linkeon.io` убивает предыдущий процесс `claude` при новом `/chat` на тот же `sessionId` — поэтому именно очередь, а не второй запрос.

**Tech Stack:** React 18 + TypeScript, vitest (`pnpm test`), Tailwind, i18next (семь локалей).

**Спека:** `docs/superpowers/specs/2026-09-09-chat-send-queue-design.md`

---

## File Structure

| Файл | Ответственность |
|------|-----------------|
| `src/components/chat/sendQueue.ts` | **Создать.** Чистые функции очереди: добавить, удалить, склеить. Ноль зависимостей от React. |
| `src/components/chat/sendQueue.test.ts` | **Создать.** Unit-тесты к нему (vitest, по образцу `historyMerge.test.ts`). |
| `src/components/chat/ChatInterface.tsx` | **Изменить.** Состояние очереди, `turnBusy`, разблокировка `handleSend`, эффект досылки, рендер, guard'ы поллинга, возврат текста при смене ассистента. |
| `src/i18n/locales/{ru,en,es,de,fr,pt,zh}.json` | **Изменить.** Два ключа в секцию `chat`. |

---

## Task 1: Чистая логика очереди

**Files:**
- Create: `src/components/chat/sendQueue.ts`
- Test: `src/components/chat/sendQueue.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `src/components/chat/sendQueue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addToQueue, removeFromQueue, joinQueue, type QueuedMessage } from './sendQueue';

const q = (id: string, text: string): QueuedMessage => ({ id, text });

describe('addToQueue', () => {
  it('дописывает в конец, сохраняя порядок', () => {
    const before = [q('a', 'первое')];
    expect(addToQueue(before, 'второе', 'b')).toEqual([q('a', 'первое'), q('b', 'второе')]);
  });

  it('не мутирует исходный массив — React сравнивает по ссылке', () => {
    const before = [q('a', 'первое')];
    addToQueue(before, 'второе', 'b');
    expect(before).toEqual([q('a', 'первое')]);
  });
});

describe('removeFromQueue', () => {
  it('убирает нужный элемент, не задевая соседей', () => {
    const before = [q('a', 'раз'), q('b', 'два'), q('c', 'три')];
    expect(removeFromQueue(before, 'b')).toEqual([q('a', 'раз'), q('c', 'три')]);
  });

  it('на неизвестный id возвращает то же содержимое', () => {
    const before = [q('a', 'раз')];
    expect(removeFromQueue(before, 'нет-такого')).toEqual([q('a', 'раз')]);
  });
});

describe('joinQueue', () => {
  it('склеивает через пустую строку между репликами', () => {
    expect(joinQueue([q('a', 'первое'), q('b', 'второе')])).toBe('первое\n\nвторое');
  });

  it('триммит края каждой реплики: перевод строки из textarea не должен ехать в промпт', () => {
    expect(joinQueue([q('a', '  первое \n'), q('b', '\nвторое  ')])).toBe('первое\n\nвторое');
  });

  it('выбрасывает пустые реплики, а не оставляет дыру из переводов строк', () => {
    expect(joinQueue([q('a', 'первое'), q('b', '   '), q('c', 'третье')])).toBe('первое\n\nтретье');
  });

  it('на пустой очереди даёт пустую строку — по ней вызывающий понимает, что слать нечего', () => {
    expect(joinQueue([])).toBe('');
  });

  it('очередь из одних пробелов тоже даёт пустую строку', () => {
    expect(joinQueue([q('a', '  '), q('b', '\n')])).toBe('');
  });
});
```

- [ ] **Step 2: Прогнать тест, убедиться что падает**

Run: `pnpm vitest run src/components/chat/sendQueue.test.ts`
Expected: FAIL — `Failed to resolve import "./sendQueue"`.

- [ ] **Step 3: Написать минимальную реализацию**

Создать `src/components/chat/sendQueue.ts`:

```ts
/**
 * Очередь досылки: реплики, написанные пока ассистент отвечает.
 *
 * Параллельно отправить их нельзя — релей (relay-agent/server.mjs) убивает
 * предыдущий процесс `claude` при новом /chat на тот же sessionId, иначе два
 * `claude --resume <тот же id>` дерутся за JSONL-лок. Поэтому реплики копятся
 * здесь и уходят одним склеенным ходом после завершения текущего.
 *
 * Функции чистые и не мутируют вход: ChatInterface хранит очередь в useState,
 * и мутация на месте не вызвала бы ре-рендер.
 */

export interface QueuedMessage {
  id: string;
  text: string;
}

export function addToQueue(queue: QueuedMessage[], text: string, id: string): QueuedMessage[] {
  return [...queue, { id, text }];
}

export function removeFromQueue(queue: QueuedMessage[], id: string): QueuedMessage[] {
  return queue.filter((m) => m.id !== id);
}

/**
 * Склейка для отправки одним ходом. Пустая строка означает «слать нечего» —
 * вызывающий обязан проверить, иначе уйдёт пустой ход и спишутся токены.
 *
 * Этой же функцией текст возвращается в поле ввода при смене ассистента:
 * одна склейка на оба сценария, чтобы формат не разъехался.
 */
export function joinQueue(queue: QueuedMessage[]): string {
  return queue
    .map((m) => m.text.trim())
    .filter((t) => t.length > 0)
    .join('\n\n');
}
```

- [ ] **Step 4: Прогнать тест, убедиться что проходит**

Run: `pnpm vitest run src/components/chat/sendQueue.test.ts`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/components/chat/sendQueue.ts src/components/chat/sendQueue.test.ts
git commit -m "feat(chat): чистая логика очереди досылки"
```

---

## Task 2: Состояние очереди и turnBusy

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx:15` (импорты), `:512` (состояние)

- [ ] **Step 1: Добавить импорт**

После строки 15 (импорт `lucide-react`; `X` там уже есть — новых иконок не нужно) найти блок локальных импортов рядом с `import { selectNewPolledMessages } from './historyMerge'` и добавить:

```ts
import { addToQueue, removeFromQueue, joinQueue, type QueuedMessage } from './sendQueue';
```

Если импорта `historyMerge` рядом нет — поставить строку сразу после последнего относительного импорта (`./`-путь) в шапке файла.

- [ ] **Step 2: Добавить состояние очереди**

Сразу после строки `const [isTyping, setIsTyping] = useState(false);` (`:512`) вставить:

```tsx
  // Очередь досылки: реплики, написанные пока идёт ход. Живёт ОТДЕЛЬНО от
  // messages — тот персистится в localStorage (assistant_{id}_messages), и
  // неотправленное всплывало бы после F5 как настоящее сообщение.
  const [queued, setQueued] = useState<QueuedMessage[]>([]);
  // Ref-зеркало: guard'ы поллинга и смена ассистента читают очередь вне
  // ре-рендера, где состояние ещё не доехало.
  const queuedRef = useRef<QueuedMessage[]>([]);
  // Досылка идёт: StrictMode в dev вызывает эффекты дважды, а setQueued([])
  // асинхронный — без флага второй вызов увидел бы ту же очередь и отправил
  // ход второй раз (и списал токены дважды).
  const flushingRef = useRef(false);
```

- [ ] **Step 3: Синхронизировать ref и завести turnBusy**

Сразу после блока из шага 2 вставить:

```tsx
  useEffect(() => { queuedRef.current = queued; }, [queued]);

  // «Ход этой вкладки не закончен»: либо стрим идёт, либо есть что дослать.
  // Между концом стрима и стартом досылки есть окно в один тик — если гейтить
  // поллинг по одному isTyping, он проснётся в этом окне и задвоит ход в ленте.
  const turnBusy = isTyping || queued.length > 0;
```

- [ ] **Step 4: Проверить типы**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: без ошибок. (Голый `tsc --noEmit` в этом проекте компилирует ноль файлов — флаг `-p tsconfig.app.json` обязателен.)

`turnBusy` пока нигде не используется — TypeScript на неиспользуемую `const` не ругается, ESLint в этом проекте тоже; если `pnpm lint` всё же выдаст `no-unused-vars`, просто перейти к Task 3, там она задействуется.

- [ ] **Step 5: Коммит**

```bash
git add src/components/chat/ChatInterface.tsx
git commit -m "feat(chat): состояние очереди досылки и признак turnBusy"
```

---

## Task 3: Разблокировать отправку и досылать очередь

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx:1501-1518` (`handleSend`), новый эффект рядом

- [ ] **Step 1: Переписать handleSend**

Заменить целиком блок `:1501-1518`:

```tsx
  const handleSend = async () => {
    if (!input.trim()) return;
    // Если идёт диктовка — глушим микрофон и отвязываем инстанс, чтобы поздние
    // partial/final (см. guard в onPartial/onFinal) не возвращали текст в поле.
    if (voiceRef.current) {
      const vd = voiceRef.current;
      voiceRef.current = null;
      try { vd.stop(); } catch {}
      setIsRecording(false);
    }
    voiceCommittedRef.current = '';
    const text = input;
    setInput('');

    // Ход ещё идёт — не шлём параллельно (релей убил бы текущий ответ), а
    // копим. Пин к низу ре-армим так же, как при обычной отправке: человек
    // только что написал и ждёт, что лента поедет за ним.
    if (turnBusy) {
      pinToBottomRef.current = true;
      pinStartedAtRef.current = performance.now();
      setQueued((prev) => addToQueue(prev, text, generateMessageId()));
      return;
    }

    await sendMessageText(text);
    // Обновляем контент домашнего виджета последней репликой (натив; на вебе no-op),
    // чтобы «последний разговор» в виджете был свежим, когда юзер свернёт приложение.
    try { refreshWidget(); } catch {}
  };
```

- [ ] **Step 2: Добавить эффект досылки**

Сразу после `handleSend` вставить:

```tsx
  // Досылка очереди: ход договорил — отправляем накопленное одним сообщением.
  // Один ход вместо N: обвязка Claude Code грузится в контекст на каждый ход
  // (~47k токенов) независимо от длины реплики.
  //
  // sendMessageText в зависимости не кладём: он пересоздаётся на каждый рендер,
  // и эффект стрелял бы на каждый чих.
  useEffect(() => {
    if (isTyping || streamingMessageId || historyLoading) return;
    if (queued.length === 0 || !selectedAssistant) return;
    if (flushingRef.current) return;

    const text = joinQueue(queued);
    setQueued([]);
    if (!text) return; // очередь была из одних пробелов — пустой ход не шлём

    flushingRef.current = true;
    void sendMessageText(text).finally(() => { flushingRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping, streamingMessageId, historyLoading, queued, selectedAssistant?.id]);
```

- [ ] **Step 3: Разблокировать кнопку отправки**

Заменить блок `:2883-2899` (кнопка Send):

```tsx
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            data-testid="chat-send-btn"
            className={clsx(
              'p-2 rounded-lg transition-colors',
              input.trim()
                ? 'bg-forest-600 text-white hover:bg-forest-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {/* Спиннера здесь больше нет: индикатор «ассистент печатает» живёт
                в ленте (streamingMessageId), а спиннер на активной кнопке
                читался бы как «заблокировано» — ровно то, что мы убираем. */}
            <Send className="w-5 h-5" />
          </button>
```

- [ ] **Step 4: Заблокировать по turnBusy то, что должно остаться заблокированным**

Три места, где `isTyping` меняется на `turnBusy` (загрузка файла идёт своим путём и своим ключом сессии релея — очередь её не покрывает, поэтому скрепка честно блокируется):

`:2826` — кнопка скрепки:
```tsx
            disabled={isUploadingFile || turnBusy}
```

`:2393` — кнопка в шапке:
```tsx
                  disabled={turnBusy}
```

`:2440` — пункт меню:
```tsx
                        disabled={turnBusy}
```

- [ ] **Step 5: Проверить типы и линт**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json && pnpm lint`
Expected: без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add src/components/chat/ChatInterface.tsx
git commit -m "feat(chat): отправка во время хода копит очередь и досылает после"
```

---

## Task 4: Guard'ы поллинга по turnBusy

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx:714-767` (поллинг истории), `:774-798` (поллинг active-turn), `:2794` (рендер индикатора)

- [ ] **Step 1: Поллинг истории**

В эффекте `:714` заменить строку `:716`:

```tsx
    if (turnBusy) return; // активный локальный стрим или очередь досылки — не дёргаем
```

и массив зависимостей `:767`:

```tsx
  }, [selectedAssistant?.id, hasUserSelectedAssistant, turnBusy, freshTs]);
```

Зачем: без этого между концом стрима и стартом досылки поллинг успевает подтянуть только что сохранённый ход из БД, и `selectNewPolledMessages` увидит его как новый — ход задвоится в ленте.

- [ ] **Step 2: Поллинг active-turn**

В эффекте `:774` заменить строку `:776`:

```tsx
    if (turnBusy) { setRemoteTurnActive(false); return; }
```

и зависимости `:798`:

```tsx
  }, [selectedAssistant?.id, hasUserSelectedAssistant, turnBusy]);
```

- [ ] **Step 3: Рендер карточки «ход идёт на сервере»**

Заменить условие `:2794`:

```tsx
        {remoteTurnActive && !streamingMessageId && !turnBusy && !historyLoading && (
```

Зачем: карточка «Ассистент работает над предыдущим сообщением» не должна мигать в паузе между ходом и досылкой.

- [ ] **Step 4: Проверить типы**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: без ошибок.

- [ ] **Step 5: Коммит**

```bash
git add src/components/chat/ChatInterface.tsx
git commit -m "fix(chat): поллинг не просыпается в окне между ходом и досылкой"
```

---

## Task 5: Ключи локализации

**Files:**
- Modify: `src/i18n/locales/ru.json`, `en.json`, `es.json`, `de.json`, `fr.json`, `pt.json`, `zh.json`

- [ ] **Step 1: Добавить два ключа в секцию `chat` каждого файла**

В объект `chat` (рядом с существующим `assistant_working`) добавить:

`ru.json`:
```json
    "queued_hint": "отправится следующим",
    "queued_remove": "Убрать",
```

`en.json`:
```json
    "queued_hint": "will be sent next",
    "queued_remove": "Remove",
```

`es.json`:
```json
    "queued_hint": "se enviará a continuación",
    "queued_remove": "Quitar",
```

`de.json`:
```json
    "queued_hint": "wird als Nächstes gesendet",
    "queued_remove": "Entfernen",
```

`fr.json`:
```json
    "queued_hint": "sera envoyé ensuite",
    "queued_remove": "Retirer",
```

`pt.json`:
```json
    "queued_hint": "será enviado a seguir",
    "queued_remove": "Remover",
```

`zh.json`:
```json
    "queued_hint": "将在下一条发送",
    "queued_remove": "移除",
```

- [ ] **Step 2: Проверить, что все семь файлов остались валидным JSON и ключи на месте**

Run:
```bash
for f in ru en es de fr pt zh; do
  node -e "const c=require('./src/i18n/locales/$f.json').chat; if(!c.queued_hint||!c.queued_remove) throw new Error('$f: нет ключей'); console.log('$f ok:', c.queued_hint)"
done
```
Expected: семь строк `ok:` — по одной на локаль.

- [ ] **Step 3: Проверить, что проверка ломается на пропуске**

Временно переименовать ключ в одной локали и убедиться, что команда падает:
```bash
node -e "
const fs=require('fs');const p='./src/i18n/locales/fr.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.chat.queued_hint_TMP=j.chat.queued_hint;delete j.chat.queued_hint;
fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');
"
node -e "const c=require('./src/i18n/locales/fr.json').chat; if(!c.queued_hint) throw new Error('fr: нет ключей')"
```
Expected: второй вызов падает с `fr: нет ключей`.

Затем откатить: `git checkout src/i18n/locales/fr.json` и заново внести ключи из шага 1.

Зачем этот шаг: зелёный результат проверки ничего не доказывает, пока не увидел, как она краснеет. На локализации этого проекта ложно-зелёные проверки уже случались.

- [ ] **Step 4: Коммит**

```bash
git add src/i18n/locales/
git commit -m "i18n(chat): ключи очереди досылки на семь языков"
```

---

## Task 6: Рендер очереди в ленте

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx` — вставка после блока `streamingMessageId` (`:2762-2783`)

- [ ] **Step 1: Вставить рендер**

Сразу после закрывающей `)}` блока `{streamingMessageId && !historyLoading && (...)}` (`:2783`) и перед комментарием про `meetingCallId` вставить:

```tsx
        {/* Очередь досылки. Приглушённые пузыри под стримом: человек видит, что
            написанное не потерялось, и до отправки может это убрать. */}
        {queued.map((q) => (
          <div key={q.id} className="flex justify-end" data-testid="chat-queued-message">
            <div className="max-w-xs sm:max-w-md">
              <div className="px-4 py-2 rounded-2xl bg-forest-600 text-white rounded-br-md opacity-70">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{q.text}</p>
              </div>
              <div className="flex items-center justify-end gap-2 mt-1 px-1">
                <span className="text-xs text-gray-400">{t('chat.queued_hint')}</span>
                <button
                  onClick={() => setQueued((prev) => removeFromQueue(prev, q.id))}
                  title={t('chat.queued_remove')}
                  aria-label={t('chat.queued_remove')}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
```

`X` уже импортирован из `lucide-react` в строке 15 — новых импортов не нужно.

- [ ] **Step 2: Проверить типы и линт**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json && pnpm lint`
Expected: без ошибок.

- [ ] **Step 3: Коммит**

```bash
git add src/components/chat/ChatInterface.tsx
git commit -m "feat(chat): ожидающие реплики видны в ленте и удаляются до отправки"
```

---

## Task 7: Очередь не уезжает чужому ассистенту

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx:2056-2079` (`handleSwitchAssistant`), `:1447-1462` (ветка смены ассистента в `sendMessageText`)

- [ ] **Step 1: Возврат текста в поле при переключении ассистента**

В `handleSwitchAssistant` сразу после `setIsTyping(false);` (`:2072`) вставить:

```tsx
    // Очередь принадлежала прежнему ассистенту — новому её слать нельзя.
    // Текст возвращаем в поле ввода: молча выбросить написанное человеком хуже,
    // чем заставить его нажать «отправить» ещё раз.
    if (queuedRef.current.length > 0) {
      const pending = joinQueue(queuedRef.current);
      setQueued([]);
      if (pending) {
        setInput((prev) => (prev.trim() ? `${prev}\n\n${pending}` : pending));
      }
    }
```

- [ ] **Step 2: То же для смены ассистента через другую вкладку**

В `sendMessageText`, внутри ветки `if (selectedAssistant?.id !== currentAssistant.id) {` (`:1452`), сразу после `setSelectedAssistant(currentAssistant);` вставить:

```tsx
          // Ассистента сменили в соседней вкладке — очередь этой вкладки
          // относилась к прежнему. Возвращаем в поле, как при обычном switch.
          if (queuedRef.current.length > 0) {
            const pending = joinQueue(queuedRef.current);
            setQueued([]);
            if (pending) {
              setInput((prev) => (prev.trim() ? `${prev}\n\n${pending}` : pending));
            }
          }
```

- [ ] **Step 3: Проверить типы и линт**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json && pnpm lint`
Expected: без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add src/components/chat/ChatInterface.tsx
git commit -m "fix(chat): при смене ассистента очередь возвращается в поле ввода"
```

---

## Task 8: Полный прогон на тестовой ноде

Локально `pnpm build` и полный `pnpm test` не гонять — мак не тянет, прогоны уходят в таймаут. Всё тяжёлое едет на `dv@85.192.61.231`, и **только в CI-клон** `~/ci/spirits_front`: `~/spirits_front` на этой ноде — живой чекаут, из которого работает `test.linkeon.io`.

- [ ] **Step 1: Запушить ветку**

```bash
git push -u origin HEAD
git rev-parse HEAD
```

Запомнить sha из вывода — дальше он подставляется вместо `<sha>`.

- [ ] **Step 2: Поставить CI-клон на этот sha**

Run:
```bash
ssh dv@85.192.61.231 'git -C ~/ci/spirits_front fetch -q origin && git -C ~/ci/spirits_front checkout -q <sha> && git -C ~/ci/spirits_front rev-parse HEAD'
```
Expected: тот же sha, что вывел шаг 1. Ставим именно на sha, а не на имя ветки: в общий чекаут параллельная сессия может дописать свой код.

- [ ] **Step 3: Установка, тесты, сборка**

Run:
```bash
ssh dv@85.192.61.231 'cd ~/ci/spirits_front && source ~/.nvm/nvm.sh && pnpm install && pnpm test && pnpm build'
```
Expected: `pnpm test` — все suite'ы зелёные, включая новый `sendQueue.test.ts` (8 тестов); `pnpm build` — успешная сборка в `dist/` (обычно ~6 секунд).

`source ~/.nvm/nvm.sh` обязателен: вне nvm на ноде `node` не найдётся.

Если какие-то тесты падали и до наших правок — мерить дельтой: сравнить список падений с прогоном на `git merge-base HEAD origin/main`, наши задачи закрыты только если новых падений нет.

- [ ] **Step 4: Коммит (если что-то чинилось)**

Если прогон потребовал правок:
```bash
git add -A
git commit -m "fix(chat): правки по прогону на тестовой ноде"
git push
```
и повторить шаги 2-3 на новом sha. Если правок не было — шаг пропускается.

---

## Task 9: Ручная проверка сценариев

Проверяется на `test.linkeon.io` после выката (выкат — отдельно, `bash ~/Downloads/spirits_back/scripts/deploy.sh`, **и только с явного согласия владельца**; `TEST_ONLY=1 FRONT_ONLY=1` достаточно для этой проверки). Запускать деплой самостоятельно нельзя.

Перед выводами убедиться, что смотришь свою сборку: сверить имя бандла в `dist/assets/` на ноде с тем, что отдаёт браузер. На этом проекте уже случалось делать выводы по чужой сборке и по файлам-сиротам прошлых выкатов.

- [ ] **Step 1: Базовый сценарий**

Отправить Роману длинный запрос. Пока идёт ответ — дописать две реплики.
Ожидается: (а) поле и кнопка активны всё время; (б) обе реплики видны приглушёнными пузырями с подписью «отправится следующим»; (в) первый ответ доходит целиком, без обрыва; (г) сразу после него уходит один ход с обеими репликами.

- [ ] **Step 2: Удаление из очереди**

Во время хода дописать реплику, нажать крестик.
Ожидается: пузырь исчезает, после завершения хода ничего не досылается.

- [ ] **Step 3: Отсутствие задвоения**

Тот же сценарий, что в шаге 1, но после досылки подождать 20 секунд (два цикла поллинга) и обновить страницу.
Ожидается: ход не задвоился ни в ленте, ни после перезагрузки.

- [ ] **Step 4: Смена ассистента**

Во время хода дописать реплику, затем переключиться на другого ассистента.
Ожидается: реплика оказалась в поле ввода нового чата, ничего не отправилось само.

- [ ] **Step 5: Ход упал**

Отправить сообщение, дописать реплику в очередь, дождаться ошибки хода (или спровоцировать её, отключив сеть на время стрима и вернув).
Ожидается: после появления ошибки очередь всё равно досылается, а не виснет навсегда.

---

## Что осталось за рамками

Зафиксировано в спеке как осознанные ограничения версии:

- Скрепка (загрузка файлов) во время хода заблокирована.
- Кнопки «новый чат» / очистка во время хода заблокированы.
- `src/components/products/ProductChat.tsx` не трогаем.
- Кнопки «прервать текущий ответ» нет.
- Очередь не переживает закрытие вкладки — намеренно: персистить намерение отправить значило бы обещать доставку, которую мы не гарантируем.
