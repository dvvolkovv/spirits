// src/components/chat/noTokensDraftWiring.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/** Связка текстового no_tokens с готовыми чистыми helpers. */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const body = (marker: string): string => {
  const start = SRC.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  const bodyStart = SRC.indexOf('{', start) + 1;
  let depth = 1;
  let i = bodyStart;
  while (depth > 0 && i < SRC.length) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') depth--;
    i++;
  }
  expect(depth, `незакрытое тело ${marker}`).toBe(0);
  return SRC.slice(bodyStart, i - 1);
};

const sendAI = () => body('const sendMessageToAI = async');
const sendText = () => body('const sendMessageText = async');

describe('текстовый no_tokens — исход, пузырь и ввод', () => {
  it('sendMessageToAI принимает optional userMessageId и возвращает трёхзначный исход', () => {
    expect(SRC).toMatch(/const sendMessageToAI = async \(userMessage: string, userMessageId\?: string\)/);
    expect(sendAI()).toContain("return noTokens ? 'no_tokens' : 'ok';");
  });

  it('end разбирается по type независимо от usage', () => {
    const fn = sendAI();
    expect(fn).toContain("if (data.type === 'end') {");
    expect(fn).toContain('if (data.usage) lastUsage = data.usage;');
    expect(fn).toContain('if (isNoTokensEnd(data)) noTokens = true;');
  });

  it('реальный человеческий пузырь передаётся по id, синтетический id не выдумывается', () => {
    expect(sendText()).toContain('await sendMessageToAI(text, userMessage.id);');
    expect(sendText()).not.toContain('onNoTokens');
    expect(sendAI()).toContain('collapseNoTokensStop(prev, userMessageId ?? \'\', completedMessage)');
    expect(sendAI()).toMatch(/noTokensStop:\s*noTokens\s*\|\|\s*undefined/);
  });

  it('rejected+queue идут в applyNoTokensOutcome, затем функциональный restore и общий draft', () => {
    const fn = sendAI();
    const gate = fn.indexOf('if (userMessageId !== undefined');
    expect(gate).toBeGreaterThan(-1);
    const scoped = fn.slice(gate);
    expect(scoped).toContain('joinQueue(queuedRef.current)');
    expect(scoped).toContain('applyQueued(() => [])');
    expect(scoped).toContain('applyNoTokensOutcome({ rejectedText: userMessage, queuedText })');
    expect(scoped).toContain('setInput(prev => restoreIntoInput(prev, outcome.input))');
    expect(scoped).toContain('savePendingDraft(outcome.draftText, streamAssistantId)');
  });

  it('успешный human ход снимает только совпавший draft; явная отправка сама по себе его не стирает', () => {
    const fn = sendAI();
    const gate = fn.indexOf('if (userMessageId !== undefined');
    expect(gate).toBeGreaterThan(-1);
    expect(fn.slice(gate)).toContain('forgetPendingDraftIfSent(streamAssistantId, userMessage)');
    expect(body('const handleSendInner = async')).not.toContain('clearNoTokensDraft');
  });

  it('no_tokens не открывает TokenPackages ни в текстовом, ни в файловом пути', () => {
    expect(sendAI()).not.toContain('setShowTokenPackages');
    expect(body('const handleFileTaskSubmit = async')).not.toContain('setShowTokenPackages');
  });
});

describe('сохранённые защиты и удаление legacy', () => {
  it('text NDJSON завершается по terminal END, multipart — по no_tokens', () => {
    expect(sendAI()).toContain('if (endReceived) break;');
    expect(body('const handleFileTaskSubmit = async')).toContain('if (noTokens) break;');
  });

  it('noTokensHoldRef останавливает досылку и отложенную очистку ?say=', () => {
    expect(sendAI()).toContain('noTokensHoldRef.current = true;');
    const queueAt = SRC.indexOf('// Досылка очереди:');
    expect(SRC.slice(queueAt, queueAt + 2600)).toContain('if (noTokensHoldRef.current) return;');
    expect(body('const clearResidue = () =>')).toContain('if (noTokensHoldRef.current) return;');
  });

  it('смена ассистента по-прежнему снимает остановку очереди', () => {
    const at = SRC.indexOf('prevSelectedAssistantIdRef.current = newId;');
    expect(SRC.slice(Math.max(0, at - 4200), at)).toContain('noTokensHoldRef.current = false;');
  });

  it('sessionStorage wrappers и mount peek/clear полностью удалены после миграции', () => {
    for (const legacy of [
      'restoreDraftText',
      'saveNoTokensDraft',
      'peekNoTokensDraft',
      'clearNoTokensDraft',
      'reopenFileTaskRef',
    ]) {
      expect(SRC).not.toContain(legacy);
    }
  });
});
