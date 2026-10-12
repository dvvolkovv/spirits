// src/components/chat/greetingRaceWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Гонка «Чистого листа» (прод, 08.10.2026). Включение режима запускает новую
 * загрузку истории, а ответ прежней, устаревшей, приходил позже и всё равно
 * применялся: показывал старую переписку и снимал признак загрузки. Человек
 * видел готовый чат и писал; затем приходила пустая история новой сессии —
 * лента затиралась, а автоприветствие уходило поверх его хода и прерывало его.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

/** Тело функции `marker {...}` — по парным скобкам. */
const body = (marker: string): string => {
  const start = SRC.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const from = start + marker.length;
  let depth = 1;
  let i = from;
  while (depth > 0) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') depth--;
    i++;
  }
  return SRC.slice(from, i - 1);
};

const historyEffect = (): string => {
  const a = SRC.indexOf('&limit=30&offset=0${freshParam}');
  expect(a).toBeGreaterThan(-1);
  const start = SRC.lastIndexOf('useEffect(', a);
  const end = SRC.indexOf('}, [selectedAssistant?.id, hasUserSelectedAssistant, freshTs]);', a);
  expect(end).toBeGreaterThan(-1);
  return SRC.slice(start, end);
};

describe('загрузка истории не применяет устаревший ответ', () => {
  it('эффект помечает свой запуск устаревшим при смене ассистента или «Чистого листа»', () => {
    expect(historyEffect()).toMatch(/return \(\) => \{\s*stale = true;\s*\};/);
  });

  it('устаревший ответ не трогает ленту', () => {
    const e = historyEffect();
    const guard = e.indexOf('if (stale) return;', e.indexOf('await apiClient.get('));
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(e.indexOf('setMessages(msgs)'));
  });

  it('устаревший сбой не подставляет локальную копию', () => {
    const e = historyEffect();
    const c = e.indexOf('} catch {');
    expect(c).toBeGreaterThan(-1);
    const guard = e.indexOf('if (stale) return;', c);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(e.indexOf('localStorage.getItem', c));
  });

  it('устаревший запуск не снимает признак загрузки за новый', () => {
    const e = historyEffect();
    const f = e.indexOf('} finally {');
    expect(f).toBeGreaterThan(-1);
    // Не `return` — его в finally запрещает no-unsafe-finally.
    const guard = e.indexOf('if (!stale) {', f);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(e.indexOf('setHistoryLoading(false)', f));
  });
});

describe('пока грузится история, сообщение ждёт в очереди', () => {
  it('submitText кладёт реплику в очередь и во время загрузки истории', () => {
    expect(body('const submitText = async (text: string) => {')).toMatch(
      /if \(sendBlocked \|\| historyLoading\) \{\s*enqueue\(\);\s*return;\s*\}/,
    );
  });
});

describe('автоприветствие не перебивает человека', () => {
  it('sendMessageToAI считает отправки', () => {
    expect(body('const sendMessageToAI = async (userMessage: string) => {')).toContain('sendSeqRef.current += 1;');
  });

  it('решение «приветствовать» перепроверяется прямо перед отправкой', () => {
    const g = body('const sendInitialGreeting = async () => {');
    const seq = g.indexOf('const seqAtDecision = sendSeqRef.current;');
    const check = g.indexOf('greetingStillWanted(');
    const send = g.indexOf('await sendMessageToAI(');
    expect(seq).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    // Номер запоминаем до первой паузы, а проверяем после последней — той,
    // что стоит перед самой отправкой.
    expect(seq).toBeLessThan(g.indexOf('await '));
    expect(check).toBeGreaterThan(g.lastIndexOf('await ', send - 1));
    expect(check).toBeLessThan(send);
  });

  it('проверка черновика остаётся первой', () => {
    const g = body('const sendInitialGreeting = async () => {');
    expect(g.indexOf('hasPendingDraftFor(selectedAssistant.id)')).toBeLessThan(g.indexOf('greetingStillWanted('));
  });
});
