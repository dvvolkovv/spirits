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
  it('есть привязка к исходному assistant и точный текст результата savePendingDraft', () => {
    expect(SRC).toContain('const [pendingFilesAssistantId, setPendingFilesAssistantId]');
    expect(SRC).toContain('const fileTaskDraftSavedRef = useRef(false);');
    expect(SRC).toContain('const fileTaskDraftTextRef = useRef<string | null>(null);');
    expect(SRC).toContain('const originalFileTaskDraftTextRef = useRef<string | null>(null);');
    expect(filesSubmit()).toContain('const uploadAssistantId = selectedAssistant?.id ?? null;');
    expect(restoreFiles()).toContain('fileTaskDraftSavedRef.current = uploadAssistantId !== null');
    expect(restoreFiles()).toContain('savePendingDraft(task, uploadAssistantId)');
    expect(restoreFiles()).toContain('fileTaskDraftTextRef.current');
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

  it('late restore пишет в per-assistant store ДО guard, а текущий state — только после него', () => {
    const fn = restoreFiles();
    const guard = fn.indexOf('selectedAssistantIdRef.current !== uploadAssistantId');
    const store = fn.indexOf('deferredFileTasksRef.current.set(uploadAssistantId');
    expect(guard).toBeGreaterThan(-1);
    expect(store).toBeGreaterThan(-1);
    expect(store).toBeLessThan(guard);
    expect(fn.slice(0, guard)).not.toContain('setPendingFiles(files);');
    expect(fn.slice(0, guard)).not.toContain('setFileTaskInput(task);');
    expect(fn.slice(guard)).toContain('setPendingFiles(files);');
    expect(fn.slice(guard)).toContain('setFileTaskInput(task);');
  });

  it('одиночный .txt идёт без id synthetic prompt и разбирает исход; error не снимает draft', () => {
    const fn = filesSubmit();
    const single = fn.slice(fn.indexOf('isTextFile(files[0])'), fn.indexOf('// Binary file'));
    expect(single).toContain('outcome = await sendMessageToAI(prompt);');
    const read = single.indexOf('await file.text()');
    const typing = single.indexOf('setIsTyping(true);');
    const streaming = single.indexOf('setStreamingMessageId(');
    expect(typing).toBeGreaterThan(-1);
    expect(typing).toBeLessThan(read);
    expect(streaming).toBeGreaterThan(-1);
    expect(streaming).toBeLessThan(read);
    expect(single).toContain('} finally {');
    expect(single).toContain("if (outcome === 'no_tokens')");
    expect(single).toContain('restoreFileTaskOnNoTokens(userMessage.id, null, files, task, uploadAssistantId);');
    expect(single).toContain("else if (outcome === 'ok' && uploadAssistantId !== null)");
    expect(single).toContain('completeSuccessfulFileTask();');
    expect(fn).toContain('forgetPendingDraftIfSent(uploadAssistantId, originalFileTaskDraftText);');
  });

  it('multipart использует общий restore, успех снимает task draft', () => {
    const fn = filesSubmit();
    expect(fn).toContain('restoreFileTaskOnNoTokens(userMessage.id, assistantMsg, files, task, uploadAssistantId);');
    expect(fn).toContain('completeSuccessfulFileTask();');
    expect(fn).toContain('forgetPendingDraftIfSent(uploadAssistantId, originalFileTaskDraftText);');
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

  it('отправка сбрасывает assistant id, а Cancel/remove последнего файла зовут общий cancel', () => {
    const fn = filesSubmit();
    expect(fn.slice(fn.indexOf("setFileTaskInput('');"), fn.indexOf("setFileTaskInput('');") + 500))
      .toContain('setPendingFilesAssistantId(null);');
    const cancel = between('const cancelDeferredFileTask =', 'const handleSelectAssistant = async');
    expect(cancel).toContain('setPendingFilesAssistantId(null);');
    expect(cancel).toContain('pendingDraftMatches(');
    expect(cancel).toContain('forgetPendingDraftIfSent(');
    expect(cancel).toContain('noTokensHoldRef.current = false;');
    const cancelAt = SRC.indexOf("t('chat.file_modal_cancel')");
    expect(SRC.slice(Math.max(0, cancelAt - 650), cancelAt)).toContain('cancelDeferredFileTask();');
    const removeAt = SRC.indexOf("t('chat.file_remove')");
    expect(SRC.slice(Math.max(0, removeAt - 650), removeAt)).toContain('cancelDeferredFileTask();');
  });
});

describe('один носитель задачи и reopen только на новом переходе баланса', () => {
  it('pending-draft effect уступает живым deferred files и различает возврат/clean sheet', () => {
    const effect = between('const draftEffectAppliedForRef =', '// ?say=<text>');
    expect(effect).toContain('pendingFiles.length > 0 && pendingFilesAssistantId === selectedAssistant.id');
    expect(effect).toContain('draftEffectAppliedForRef.current !== selectedAssistant.id');
    expect(effect).toContain('pendingDraftMatches(selectedAssistant.id, fileTaskDraftTextRef.current');
    expect(effect).toContain('setPendingFilesAssistantId(null);');
  });

  it('auto-reopen требует observed ≤0→>0, исходного assistant и срабатывает один раз', () => {
    const effect = between('const fileTaskAutoReopenedRef =', 'const handleSelectAssistant = async');
    expect(effect).toContain('const lastSeenTokensRef = useRef<number | null>(null);');
    expect(effect).toContain('if (prevTokens === null || prevTokens > 0 || tokensNow <= 0) return;');
    expect(effect).toContain('selectedAssistant?.id !== pendingFilesAssistantId');
    expect(effect).toContain('fileTaskAutoReopenedRef.current = true;');
    const ownerGuard = effect.indexOf('if (!ownsPendingFiles)');
    const seenUpdate = effect.indexOf('lastSeenTokensRef.current = tokensNow;');
    expect(ownerGuard).toBeGreaterThan(-1);
    expect(ownerGuard).toBeLessThan(seenUpdate);
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
    expect(draftImport).toContain('pendingDraftMatches');
    expect(between('interface Message {', '\n}')).toContain('noTokensStop?: boolean');
  });
});
