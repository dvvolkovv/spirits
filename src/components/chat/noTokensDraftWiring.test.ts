// src/components/chat/noTokensDraftWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож связки «отказ по балансу → черновик обратно». Поведение разбора
 * события покрыто noTokensDraft.test.ts; здесь — что оба пути (текст и файлы)
 * действительно зовут восстановление и открывают пополнение, а служебные
 * промпты (приветствие, PDF Маши) черновик НЕ восстанавливают.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const body = (marker: string): string => {
  const start = SRC.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  const bodyStart = start + marker.length;
  let depth = 1;
  let i = bodyStart;
  while (depth > 0) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') depth--;
    i++;
  }
  return SRC.slice(bodyStart, i - 1);
};

describe('отказ по балансу — черновик возвращается', () => {
  it('sendMessageToAI принимает onNoTokens и зовёт его вместе с окном пополнения', () => {
    const fn = body('const sendMessageToAI = async (userMessage: string, opts?: { onNoTokens?: () => void }) => {');
    expect(fn).toContain('if (isNoTokensEnd(data)) noTokens = true;');
    expect(fn).toContain('setShowTokenPackages(true);');
    expect(fn).toContain('opts?.onNoTokens?.();');
  });

  it('восстановление — только когда человек остался на том же ассистенте', () => {
    const fn = body('const sendMessageToAI = async (userMessage: string, opts?: { onNoTokens?: () => void }) => {');
    const at = fn.indexOf('opts?.onNoTokens?.();');
    const guard = fn.lastIndexOf('if (selectedAssistantIdRef.current === streamAssistantId)', at);
    expect(guard).toBeGreaterThan(-1);
  });

  it('текстовый путь возвращает отправленное в поле ввода, не затирая новый набор', () => {
    const fn = body('const sendMessageText = async (text: string) => {');
    expect(fn).toContain('setInput(prev => restoreDraftText(prev, text))');
  });

  it('служебный PDF-промпт Маши черновик НЕ восстанавливает', () => {
    const fn = body('const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {');
    expect(fn).toContain('await sendMessageToAI(prompt);');
    expect(fn).not.toContain('onNoTokens');
  });

  it('файловая задача: инлайн-файл передаёт onNoTokens, multipart ловит reason', () => {
    const fn = body('const handleFileTaskSubmit = async () => {');
    expect(fn).toContain('setPendingFiles(files);');
    expect(fn).toContain('setFileTaskInput(task);');
    expect(fn).toContain('reopenFileTaskRef.current = true;');
    expect(fn).toContain('await sendMessageToAI(prompt, { onNoTokens: restoreFileTask });');
    expect(fn).toContain('if (isNoTokensEnd(event)) noTokens = true;');
    expect(fn).toContain('restoreFileTask();');
    expect(fn).toContain('setShowTokenPackages(true);');
  });

  it('файловая модалка переоткрывается после закрытия окна пополнения', () => {
    expect(SRC).toContain('if (reopenFileTaskRef.current) {');
    const close = SRC.indexOf('<TokenPackages onClose={() => {');
    expect(close).toBeGreaterThan(-1);
    const after = SRC.slice(close, close + 600);
    expect(after).toContain('setShowTokenPackages(false);');
    expect(after).toContain('setShowFileTaskModal(true);');
  });

  it('multipart не возвращает файлы другому ассистенту (guard как в текстовом пути)', () => {
    const fn = body('const handleFileTaskSubmit = async () => {');
    expect(fn).toContain('const uploadAssistantId = selectedAssistant?.id ?? null;');
    expect(fn).toContain('if (noTokens && selectedAssistantIdRef.current === uploadAssistantId) {');
  });

  it('после разобранного end поток закрываем сами — обрыв не уведёт в catch', () => {
    expect(SRC.match(/if \(noTokens\) break;/g)?.length).toBe(2);
  });

  it('очередь не досылается в шлагбаум вслед за отклонённым сообщением', () => {
    const at = SRC.indexOf('// Досылка очереди:');
    const effect = SRC.slice(at, at + 2500);
    expect(effect).toContain('if (noTokensHoldRef.current) return;');
  });

  it('отложенная очистка ?say= не стирает восстановленный черновик', () => {
    const fn = body('const clearResidue = () => {');
    expect(fn).toContain('if (noTokensHoldRef.current) return;');
  });

  it('явная отправка снимает остановку очереди и стирает сохранённую копию', () => {
    const fn = body('const handleSendInner = async () => {');
    expect(fn).toContain('noTokensHoldRef.current = false;');
    expect(fn).toContain('clearNoTokensDraft(selectedAssistant.id)');
  });

  it('копия в sessionStorage пишется при отказе и читается при монтировании', () => {
    const send = body('const sendMessageText = async (text: string) => {');
    expect(send).toContain('saveNoTokensDraft(id, text)');
    expect(SRC).toContain('const saved = peekNoTokensDraft(selectedAssistant.id);');
  });

  it('смена ассистента снимает остановку очереди', () => {
    const at = SRC.indexOf('prevSelectedAssistantIdRef.current = newId;');
    const effect = SRC.slice(Math.max(0, at - 1500), at);
    expect(effect).toContain('noTokensHoldRef.current = false;');
  });
});
