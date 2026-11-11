import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Выборочные сторожа файлового no_tokens и публичного контракта sendMessageToAI.
 * Видимое поведение покрыто noTokensMount; здесь только связи, которые DOM-тесту
 * дорого проверять отдельно (сохранение File-объектов, boolean save и исходы).
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');
const between = (fromMarker: string, toMarker: string): string => {
  const from = SRC.indexOf(fromMarker);
  expect(from, fromMarker).toBeGreaterThan(-1);
  const to = SRC.indexOf(toMarker, from + fromMarker.length);
  expect(to, toMarker).toBeGreaterThan(from);
  return SRC.slice(from, to);
};
const filesSubmit = () => between('const handleFileTaskSubmit = async', 'const handleSelectAssistant = async');
const restoreFiles = () => between('const restoreFileTaskOnNoTokens = (', 'const handleFileTaskSubmit = async');

describe('файловая задача после no_tokens', () => {
  it('есть привязка к исходному assistant и признак результата savePendingDraft', () => {
    expect(SRC).toContain('const [pendingFilesAssistantId, setPendingFilesAssistantId]');
    expect(SRC).toContain('const fileTaskDraftSavedRef = useRef(false);');
    expect(filesSubmit()).toContain('const uploadAssistantId = selectedAssistant?.id ?? null;');
    expect(restoreFiles()).toContain('fileTaskDraftSavedRef.current = uploadAssistantId !== null');
    expect(restoreFiles()).toContain('savePendingDraft(task, uploadAssistantId)');
  });

  it('общий restore сохраняет task/File-объекты, схлопывает bubble/stop и не открывает модалки', () => {
    const fn = restoreFiles();
    expect(fn).toContain('selectedAssistantIdRef.current !== uploadAssistantId');
    expect(fn).toContain('collapseNoTokensStop');
    expect(fn).toContain('setPendingFiles(files);');
    expect(fn).toContain('setFileTaskInput(task);');
    expect(fn).toContain('setPendingFilesAssistantId(uploadAssistantId);');
    expect(fn).not.toContain('setShowFileTaskModal');
    expect(fn).not.toContain('setShowTokenPackages');
  });

  it('одиночный .txt идёт без id synthetic prompt и разбирает исход; error не снимает draft', () => {
    const fn = filesSubmit();
    const single = fn.slice(fn.indexOf('isTextFile(files[0])'), fn.indexOf('// Binary file'));
    expect(single).toContain('outcome = await sendMessageToAI(prompt);');
    expect(single).toContain("if (outcome === 'no_tokens')");
    expect(single).toContain('restoreFileTaskOnNoTokens(userMessage.id, null, files, task, uploadAssistantId);');
    expect(single).toContain("else if (outcome === 'ok' && uploadAssistantId !== null)");
    expect(single).toContain('forgetPendingDraftIfSent(uploadAssistantId, task);');
  });

  it('multipart использует общий restore, успех снимает task draft', () => {
    const fn = filesSubmit();
    expect(fn).toContain('restoreFileTaskOnNoTokens(userMessage.id, assistantMsg, files, task, uploadAssistantId);');
    expect(fn).toContain('forgetPendingDraftIfSent(uploadAssistantId, task);');
    expect(fn).toMatch(/noTokensStop:\s*noTokens\s*\|\|\s*undefined/);
  });

  it('явный submit снимает hold до очистки, а refusal в restore его сохраняет', () => {
    const fn = filesSubmit();
    const reset = fn.indexOf('noTokensHoldRef.current = false;');
    const clear = fn.indexOf('setShowFileTaskModal(false);');
    expect(reset).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(clear);
    expect(restoreFiles()).toContain('noTokensHoldRef.current = true;');
  });

  it('отправка и Cancel сбрасывают assistant id отложенных файлов', () => {
    const fn = filesSubmit();
    expect(fn.slice(fn.indexOf("setFileTaskInput('');"), fn.indexOf("setFileTaskInput('');") + 500))
      .toContain('setPendingFilesAssistantId(null);');
    const cancelAt = SRC.indexOf("t('chat.file_modal_cancel')");
    expect(SRC.slice(Math.max(0, cancelAt - 650), cancelAt)).toContain('setPendingFilesAssistantId(null);');
  });
});

describe('один носитель задачи и reopen только на новом переходе баланса', () => {
  it('pending-draft effect уступает живым deferred files и различает возврат/clean sheet', () => {
    const effect = between('const draftEffectAppliedForRef =', '// ?say=<text>');
    expect(effect).toContain('pendingFiles.length > 0 && pendingFilesAssistantId === selectedAssistant.id');
    expect(effect).toContain('draftEffectAppliedForRef.current !== selectedAssistant.id');
    expect(effect).toContain('hasPendingDraftFor(selectedAssistant.id)');
    expect(effect).toContain('setPendingFilesAssistantId(null);');
  });

  it('auto-reopen требует observed ≤0→>0, исходного assistant и срабатывает один раз', () => {
    const effect = between('const fileTaskAutoReopenedRef =', 'const handleSelectAssistant = async');
    expect(effect).toContain('const lastSeenTokensRef = useRef<number | null>(null);');
    expect(effect).toContain('if (prevTokens === null || prevTokens > 0 || tokensNow <= 0) return;');
    expect(effect).toContain('selectedAssistant?.id !== pendingFilesAssistantId');
    expect(effect).toContain('fileTaskAutoReopenedRef.current = true;');
  });

  it('TokenPackages закрывается только вручную и больше не управляет файловой модалкой', () => {
    const at = SRC.indexOf('<TokenPackages onClose={() => {');
    expect(at).toBeGreaterThan(-1);
    const region = SRC.slice(at, at + 250);
    expect(region).toContain('setShowTokenPackages(false);');
    expect(region).not.toContain('setShowFileTaskModal');
    expect(SRC).not.toContain('reopenFileTaskRef');
  });
});

describe('synthetic вызовы и экспорты helpers', () => {
  it('greeting/regenerate/PDF не передают human id', () => {
    expect(between('const sendInitialGreeting = async', 'const loadingMoreRef ='))
      .toContain('await sendMessageToAI(greetingMessage);');
    expect(between('const handleRegenerateResponse = async', 'const scrollToBottom'))
      .toContain('await sendMessageToAI(lastUserMessage.content);');
    expect(between('const handleFileUpload = async', 'const restoreFileTaskOnNoTokens ='))
      .toContain('await sendMessageToAI(prompt);');
  });

  it('используются чистые helpers и общий pendingDraft, Message знает noTokensStop', () => {
    const noTokensImport = SRC.split('\n').find((line) => line.includes("from './noTokensDraft';"));
    for (const name of ['isNoTokensEnd', 'restoreIntoInput', 'collapseNoTokensStop', 'applyNoTokensOutcome']) {
      expect(noTokensImport).toContain(name);
    }
    const draftImport = SRC.split('\n').find((line) => line.includes("from '../../utils/pendingDraft';"));
    expect(draftImport).toContain('savePendingDraft');
    expect(draftImport).toContain('forgetPendingDraftIfSent');
    expect(between('interface Message {', '\n}')).toContain('noTokensStop?: boolean');
  });
});
