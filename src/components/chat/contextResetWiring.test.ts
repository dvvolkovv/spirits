import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * «Чистый лист» — точка отсчёта памяти ассистента (spec spirits_back
 * 2026-11-17-context-reset). Прежде это был тумблер: метка freshTs в
 * sessionStorage вкладки, и бэк вёл по ней отдельную скрытую ленту. Теперь
 * кнопка ставит точку на сервере (POST reset-context), история отдаёт её
 * полем contextResetAt, лента одна, а в месте точки — черта.
 *
 * Чистые функции черты покрыты contextReset.test.ts; здесь — что
 * ChatInterface их вообще зовёт и в нужных местах.
 */
const src = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

/** Тело функции `marker {...}` — по парным скобкам. */
const body = (marker: string): string => {
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const from = start + marker.length;
  let depth = 1;
  let i = from;
  while (depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(from, i - 1);
};

const startFresh = (): string => {
  const a = src.indexOf('const startFreshContext = async');
  const b = src.indexOf('const handleCopyMessage', a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

const historyEffect = (): string => {
  const a = src.indexOf('&limit=30&offset=0`');
  expect(a).toBeGreaterThan(-1);
  const start = src.lastIndexOf('useEffect(', a);
  const end = src.indexOf('}, [selectedAssistant?.id, hasUserSelectedAssistant]);', a);
  expect(end).toBeGreaterThan(-1);
  return src.slice(start, end);
};

describe('«Чистый лист» — точка отсчёта (проводка)', () => {
  it('метки freshTs больше нет нигде', () => {
    expect(src).not.toMatch(/freshTs|fresh_ts_|toggleFreshMode|getFreshKey|freshParam/);
    expect(src).not.toContain('fresh_mode_on_title');
    expect(src).not.toContain('sameResetAt');
  });

  it('импорты из contextReset и черта', () => {
    expect(src).toContain("import { ContextResetDivider } from './ContextResetDivider';");
    expect(src).toMatch(
      /import \{ parseContextResetAt, resetDividerIndex, mergePolledReset, type ResetMark \} from '\.\/contextReset';/,
    );
    expect(src).toContain('const [resetMark, setResetMark] = useState<ResetMark | null>(null);');
    expect(src).toContain('const [resettingContext, setResettingContext] = useState(false);');
  });

  it('кнопка спрашивает подтверждение и зовёт reset-context', () => {
    const b = startFresh();
    expect(b).toContain("window.confirm(t('chat.fresh_confirm'))");
    expect(b).toContain('returnQueueToInput()');
    expect(b).toContain('setResettingContext(true)');
    expect(b).toMatch(/finally \{\s*resettingRef\.current = false;\s*setResettingContext\(false\);\s*\}/);
    expect(b).toMatch(/resettingRef\.current = true;\s*setResettingContext\(true\);/);
  });

  it('сбой — тостом, как соседнее «занято», а не alert', () => {
    const b = startFresh();
    expect(b).toContain("toast.error(t('chat.fresh_failed'))");
    expect(b).not.toContain('window.alert');
  });

  it('reset-context ограничен таймаутом: подвисшая сеть иначе запрёт чат через sendBlocked', () => {
    expect(startFresh()).toContain(
      "apiClient.post('/webhook/chat/reset-context', { assistantId }, { signal: AbortSignal.timeout(15000) })",
    );
  });

  it('не ставит точку, пока ход идёт где угодно, вот-вот начнётся или грузится история', () => {
    // freshBlocked — то же, что блокирует отправку (включая ход на другом
    // устройстве), плюс загрузка истории.
    expect(src).toMatch(/const freshBlocked = sendBlocked \|\| historyLoading;/);
    expect(src.indexOf('const freshBlocked')).toBeGreaterThan(src.indexOf('const sendBlocked'));
    expect(startFresh()).toContain(
      'if (!selectedAssistant || freshBlocked || sendingRef.current || flushingRef.current) return;',
    );
  });

  it('перед точкой спрашивает про удалённый ход, если знание устарело', () => {
    const b = startFresh();
    const check = b.indexOf('/webhook/chat/active-turn?assistantId=${assistantId}');
    const post = b.indexOf("apiClient.post('/webhook/chat/reset-context'");
    expect(check).toBeGreaterThan(b.indexOf('setResettingContext(true)'));
    expect(check).toBeLessThan(post);
    const gate = b.slice(0, check);
    expect(gate).toContain('!remoteOverride && needsFreshRemoteCheck(remoteCheckedAtRef.current, Date.now())');
    const probe = b.slice(check, post);
    expect(probe).toContain('AbortSignal.timeout(2000)');
    expect(probe).toMatch(/if \(turn\?\.active\) \{\s*applyRemoteTurn\(true\);\s*toast\.error\(t\('chat\.busy_try_later'\)\);\s*return;\s*\}/);
    expect(probe).toContain('applyRemoteTurn(false)');
    // Сбой проверки — не повод не ставить точку.
    expect(probe).toMatch(/\} catch \{/);
  });

  it('якорь берётся синхронно после подтверждения, до первого await', () => {
    // Сообщения вкладки несут время клиента, а точку ставят часы базы: в своей
    // вкладке черта держится за id последнего сообщения в момент нажатия.
    const b = startFresh();
    const anchor = b.indexOf('const afterId = messages.length ? messages[messages.length - 1].id : null;');
    expect(anchor).toBeGreaterThan(b.indexOf('window.confirm('));
    expect(anchor).toBeLessThan(b.indexOf('await '));
  });

  it('точку ставят часы базы: без запасной даты клиента, только вперёд и для того же ассистента', () => {
    const b = startFresh();
    expect(b).toContain('const at = parseContextResetAt(data?.resetAt);');
    // Опрос мог уже принести точку новее (с другого устройства) — её не откатываем.
    const set = 'if (at) setResetMark(prev => (prev && prev.at.getTime() > at.getTime() ? prev : { at, afterId }));';
    expect(b).toContain(set);
    expect(b).not.toMatch(/new Date\(/);
    const stale = b.indexOf('if (selectedAssistantRef.current?.id !== assistantId) return;');
    expect(stale).toBeGreaterThan(b.indexOf('await response.json()'));
    expect(stale).toBeLessThan(b.indexOf(set));
  });

  it('возврат очереди в поле — страховка: при нажатии очередь отсекает условие выхода', () => {
    const b = startFresh();
    const ret = b.indexOf('returnQueueToInput();');
    expect(ret).toBeGreaterThan(b.indexOf('window.confirm('));
    // Комментарий между подтверждением и возвратом честно говорит, почему он не лишний.
    expect(b.slice(b.indexOf('window.confirm('), ret)).toContain('freshBlocked');
  });

  it('кнопка в шапке и пункт меню неактивны по freshBlocked', () => {
    // ровно два места: renderFreshButton и пункт меню «⋯»
    expect((src.match(/disabled=\{freshBlocked\}/g) || []).length).toBe(2);
    const btnAt = src.indexOf('const renderFreshButton = (testId: string, wrapperClass: string) => (');
    expect(btnAt).toBeGreaterThan(-1);
    const btn = src.slice(btnAt, src.indexOf('const renderCallButton', btnAt));
    expect(btn).toContain('onClick={() => { void startFreshContext(); }}');
    expect(btn).toContain('disabled={freshBlocked}');
    expect(btn).toContain("title={t('chat.fresh_mode_off_title')}");
    const item = src.slice(src.indexOf('data-testid="chat-fresh-menuitem"'), src.indexOf('data-testid="chat-fresh-menuitem"') + 500);
    expect(item).toContain('onClick={() => { setShowChatActions(false); void startFreshContext(); }}');
    expect(item).toContain('disabled={freshBlocked}');
    expect((src.match(/renderFreshButton\('/g) || []).length).toBe(2);
  });

  it('признак «ставится точка» продублирован в ref для колбэков вне рендера', () => {
    expect(src).toContain('const resettingRef = useRef(false);');
  });

  it('пока ставится точка, отправка копится, а досылка ждёт', () => {
    // Ход, ушедший до точки, ответил бы со старой памятью, а лёг бы под черту.
    expect(src).toMatch(/const sendBlocked = resettingContext \|\| turnRunningAnywhere\(\{/);
    const flush = src.slice(src.indexOf('Досылка очереди'));
    const effect = flush.slice(0, flush.indexOf(']);') + 3);
    expect(effect).toContain('if (resettingContext) return;');
    const deps = effect.slice(effect.lastIndexOf('}, ['));
    expect(deps).toContain('resettingContext');
  });

  it('история и опрос читают contextResetAt', () => {
    expect((src.match(/parseContextResetAt\(data\??\.contextResetAt\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('первая загрузка: точка сбрасывается до запроса и ставится без якоря', () => {
    const e = historyEffect();
    const reset = e.indexOf('setResetMark(null);');
    expect(reset).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(e.indexOf('await apiClient.get('));
    expect(e).toContain('const at = parseContextResetAt(data.contextResetAt);');
    expect(e).toContain('setResetMark(at ? { at } : null);');
    expect(e.indexOf('setResetMark(at ? { at } : null);')).toBeGreaterThan(e.indexOf('setHistoryOffset(30);'));
  });

  it('опрос: точка только вперёд, только для того же ассистента и до раннего выхода', () => {
    const p = body('const pullHistoryOnce = async (assistantId: number, isCancelled?: () => boolean) => {');
    const merge = p.indexOf('mergePolledReset(prev, parseContextResetAt(data?.contextResetAt))');
    expect(merge).toBeGreaterThan(p.indexOf('const data = await response.json();'));
    // Опрос без новых строк — обычное дело, а точку могли поставить с телефона.
    expect(merge).toBeLessThan(p.indexOf('if (fresh.length === 0) return;'));
    // Пока ставится своя точка, опрос её не сливает: принёс бы без якоря раньше
    // ответа reset-context, и черта мигнула бы по времени клиента.
    const gate = p.lastIndexOf('if (selectedAssistantIdRef.current === assistantId && !resettingRef.current)', merge);
    expect(gate).toBeGreaterThan(p.indexOf('const data = await response.json();'));
  });

  it('запросы истории идут без метки', () => {
    expect(src).toContain('/webhook/chat/history?assistantId=${selectedAssistant.id}&limit=30&offset=0`');
    expect(src).toContain('/webhook/chat/history?assistantId=${assistantId}&limit=5&offset=0`');
    expect(src).toContain('/webhook/chat/history?assistantId=${requestedAssistantId}&limit=30&offset=${historyOffset}`');
  });

  it('черта ставится по resetDividerIndex и не прикидывается сообщением', () => {
    expect(src).toContain('const resetDividerAt = useMemo(() => resetDividerIndex(messages, resetMark), [messages, resetMark]);');
    // Хук — до раннего return экрана выбора ассистента и до тех, кто его читает.
    const at = src.indexOf('const resetDividerAt = useMemo(');
    expect(at).toBeLessThan(src.indexOf('if (!hasUserSelectedAssistant) {'));
    expect(at).toBeGreaterThan(src.indexOf('const freshBlocked'));
    expect(at).toBeLessThan(src.indexOf('const handleRegenerateResponse'));
    expect(src).toMatch(
      /messages\.map\(\(message, mi\) => \(\s*<React\.Fragment key=\{message\.id\}>\s*\{mi === resetDividerAt && <ContextResetDivider \/>\}\s*<div\s*data-testid="chat-message"/,
    );
    expect(src).toContain('{!historyLoading && resetDividerAt === messages.length && <ContextResetDivider />}');
    expect((src.match(/<ContextResetDivider \/>/g) || []).length).toBe(2);
    const divider = readFileSync(join(__dirname, 'ContextResetDivider.tsx'), 'utf8');
    expect(divider).toContain('data-testid="chat-fresh-divider"');
    expect(divider).toContain('role="separator"');
    expect(divider).toContain("t('chat.fresh_divider')");
    expect(divider).not.toContain('chat-message');
  });

  it('черта читается скринридером одной фразой, а не тремя кусками', () => {
    const divider = readFileSync(join(__dirname, 'ContextResetDivider.tsx'), 'utf8');
    expect(divider).toContain("const label = t('chat.fresh_divider');");
    expect(divider).toMatch(/role="separator"[^>]*aria-label=\{label\}/);
    // Обе линии и текст скрыты от скринридера — их смысл уже в aria-label.
    expect((divider.match(/aria-hidden="true"/g) || []).length).toBe(3);
  });

  it('черта на телефоне: фраза не обрезается, линии не схлопываются', () => {
    const divider = readFileSync(join(__dirname, 'ContextResetDivider.tsx'), 'utf8');
    expect(divider).not.toContain('uppercase');
    expect(divider).not.toContain('tracking-wider');
    expect((divider.match(/min-w-6/g) || []).length).toBe(2);
    expect(divider).toContain('max-w-[80%]');
  });

  it('ход и загрузка уходят без полей fresh', () => {
    expect(src).not.toMatch(/fresh: true/);
    expect(src).not.toMatch(/formData\.append\('fresh/);
  });
});

describe('«Чистый лист» — соседние пути отправки', () => {
  it('«Перегенерировать» не уходит в идущий ход, в окно отправки и через черту', () => {
    const b = body('const handleRegenerateResponse = async () => {');
    expect(b).toContain('if (sendBlocked || historyLoading || sendingRef.current || flushingRef.current) return;');
    expect(b).toContain('if (lastQuestionAboveReset) return;');
    expect(src).toContain('const regenerateBlocked = sendBlocked || lastQuestionAboveReset;');
    // Обе кнопки: в ряду шапки и в меню «⋯».
    const desk = src.indexOf('onClick={handleRegenerateResponse}');
    expect(src.slice(desk, desk + 200)).toContain('disabled={regenerateBlocked}');
    const menu = src.indexOf('handleRegenerateResponse(); }}');
    expect(src.slice(menu, menu + 200)).toContain('disabled={regenerateBlocked}');
    expect((src.match(/disabled=\{regenerateBlocked\}/g) || []).length).toBe(2);
  });

  it('последний вопрос над чертой — перегенерация ушла бы в новую память без контекста', () => {
    const a = src.indexOf('const lastQuestionAboveReset = useMemo(');
    expect(a).toBeGreaterThan(src.indexOf('const resetDividerAt = useMemo('));
    const memo = src.slice(a, src.indexOf(']);', a) + 3);
    expect(memo).toContain('if (resetDividerAt === null) return false;');
    expect(memo).toContain("messages[i].type === 'user'");
    expect(memo).toContain('i < resetDividerAt');
    expect(memo).toContain('[messages, resetDividerAt]');
  });

  it('подсказки Романа — только когда отправка свободна, и через замок с очередью', () => {
    const chips = src.slice(src.indexOf('Suggested-prompt chips for Роман — nudge'), src.indexOf('{streamingMessageId && !historyLoading && ('));
    expect(chips).toContain('!sendBlocked');
    expect(chips).toContain('onClick={() => { void handleAskAnswer(s); }}');
    expect(chips).not.toContain('sendMessageText(');
  });

  it('карточка вопроса над чертой не активна: ассистент уже не помнит, что спрашивал', () => {
    expect(src).toContain(
      ": mi === messages.length - 1 && askLive && (resetDividerAt === null || mi >= resetDividerAt) ? 'active' : 'disabled';",
    );
  });

  it('очистка ленты снимает якорь, а пока ставится точка — не чистит', () => {
    const b = body('const handleClearChat = async () => {');
    const guard = b.indexOf('if (resettingContext) return;');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(b.indexOf('window.confirm('));
    const clear = b.indexOf('setMessages([]);');
    const unanchor = b.indexOf('setResetMark(prev => (prev ? { at: prev.at, afterId: null } : prev));');
    expect(unanchor).toBeGreaterThan(clear);
    // Обе кнопки очистки: в ряду шапки и в меню «⋯».
    const desk = src.indexOf('onClick={handleClearChat}');
    expect(src.slice(desk, desk + 200)).toContain('disabled={resettingContext}');
    const menu = src.indexOf('handleClearChat(); }}');
    expect(src.slice(menu, menu + 200)).toContain('disabled={resettingContext}');
  });

  it('?say= во время точки ложится в очередь, а не уходит со старой памятью', () => {
    const e = src.slice(src.indexOf('const trySend = () => {'), src.indexOf('setTimeout(trySend, 300);'));
    expect(e).toMatch(
      /if \(resettingRef\.current\) applyQueued\(\(prev\) => addToQueue\(prev, say, generateMessageId\(\)\)\);\s*else sendMessageText\(say\);/,
    );
  });
});
