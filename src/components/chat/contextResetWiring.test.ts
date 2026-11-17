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
    expect(b).toContain("apiClient.post('/webhook/chat/reset-context', { assistantId })");
    expect(b).toContain('returnQueueToInput()');
    expect(b).toContain("window.alert(t('chat.fresh_failed'))");
    expect(b).toContain('setResettingContext(true)');
    expect(b).toMatch(/finally \{\s*setResettingContext\(false\);\s*\}/);
  });

  it('не ставит точку, когда ход вот-вот начнётся или история грузится', () => {
    const b = startFresh();
    const guard = b.slice(0, b.indexOf('window.confirm('));
    for (const cond of ['!selectedAssistant', 'turnBusy', 'resettingContext', 'historyLoading', 'sendingRef.current', 'flushingRef.current']) {
      expect(guard, cond).toContain(cond);
    }
    expect(guard).toContain(') return;');
  });

  it('якорь берётся синхронно после подтверждения, до первого await', () => {
    // Сообщения вкладки несут время клиента, а точку ставят часы базы: в своей
    // вкладке черта держится за id последнего сообщения в момент нажатия.
    const b = startFresh();
    const anchor = b.indexOf('const afterId = messages.length ? messages[messages.length - 1].id : null;');
    expect(anchor).toBeGreaterThan(b.indexOf('window.confirm('));
    expect(anchor).toBeLessThan(b.indexOf('await '));
  });

  it('точку ставят часы базы: без запасной даты клиента, только для того же ассистента', () => {
    const b = startFresh();
    expect(b).toContain('const at = parseContextResetAt(data?.resetAt);');
    expect(b).toContain('if (at) setResetMark({ at, afterId });');
    expect(b).not.toMatch(/new Date\(/);
    const stale = b.indexOf('if (selectedAssistantRef.current?.id !== assistantId) return;');
    expect(stale).toBeGreaterThan(b.indexOf('await response.json()'));
    expect(stale).toBeLessThan(b.indexOf('setResetMark({ at, afterId })'));
  });

  it('кнопка в шапке и пункт меню неактивны, пока идёт ход, ставится точка или грузится история', () => {
    // ровно два места: renderFreshButton и пункт меню «⋯»
    expect((src.match(/disabled=\{turnBusy \|\| resettingContext \|\| historyLoading\}/g) || []).length).toBe(2);
    const btnAt = src.indexOf('const renderFreshButton = (testId: string, wrapperClass: string) => (');
    expect(btnAt).toBeGreaterThan(-1);
    const btn = src.slice(btnAt, src.indexOf('const renderCallButton', btnAt));
    expect(btn).toContain('onClick={() => { void startFreshContext(); }}');
    expect(btn).toContain("title={t('chat.fresh_mode_off_title')}");
    const item = src.slice(src.indexOf('data-testid="chat-fresh-menuitem"'), src.indexOf('data-testid="chat-fresh-menuitem"') + 500);
    expect(item).toContain('onClick={() => { setShowChatActions(false); void startFreshContext(); }}');
    expect(item).toContain('disabled={turnBusy || resettingContext || historyLoading}');
    expect((src.match(/renderFreshButton\('/g) || []).length).toBe(2);
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
    const gate = p.lastIndexOf('if (selectedAssistantIdRef.current === assistantId)', merge);
    expect(gate).toBeGreaterThan(p.indexOf('const data = await response.json();'));
  });

  it('запросы истории идут без метки', () => {
    expect(src).toContain('/webhook/chat/history?assistantId=${selectedAssistant.id}&limit=30&offset=0`');
    expect(src).toContain('/webhook/chat/history?assistantId=${assistantId}&limit=5&offset=0`');
    expect(src).toContain('/webhook/chat/history?assistantId=${requestedAssistantId}&limit=30&offset=${historyOffset}`');
  });

  it('черта ставится по resetDividerIndex и не прикидывается сообщением', () => {
    expect(src).toContain('const resetDividerAt = useMemo(() => resetDividerIndex(messages, resetMark), [messages, resetMark]);');
    // Хук — до раннего return экрана выбора ассистента.
    expect(src.indexOf('const resetDividerAt = useMemo(')).toBeLessThan(src.indexOf('if (!hasUserSelectedAssistant) {'));
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

  it('ход и загрузка уходят без полей fresh', () => {
    expect(src).not.toMatch(/fresh: true/);
    expect(src).not.toMatch(/formData\.append\('fresh/);
  });
});
