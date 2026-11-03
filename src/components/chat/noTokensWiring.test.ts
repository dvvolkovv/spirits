import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож на связку «сообщение, отклонённое на нуле» (бэклог 2d71aaf8; дизайн
 * — spirits_back docs/superpowers/specs/2026-11-03-background-turns-and-no-tokens-draft-design.md, §2;
 * ревью Ф1 03.11 — C1/I2/I3/I4).
 *
 * Чистая логика (isNoTokensEnd/restoreIntoInput/collapseNoTokensStop/
 * applyNoTokensOutcome) проверена поведенчески в noTokensDraft.test.ts. Но
 * ChatInterface — это НЕСКОЛЬКО мест, зовущих sendMessageToAI, и
 * критическая ошибка (C1) была ровно в том, что юнит-тест чистых функций не
 * ловит: восстановление текста/черновика срабатывало при ЛЮБОМ no_tokens,
 * включая синтетические промпты (автоприветствие, регенерация, PDF Маши,
 * один текстовый файл) — в поле утекал промпт, а не текст человека.
 *
 * Проверки здесь — по ИМЕНАМ функций/переменных и структуре вызовов, а не по
 * точным спискам импорта или полным сигнатурам (ревью m7/m8): сигнатура
 * sendMessageToAI меняется (id пузыря, затем тип возврата), и дословная
 * строка — ложная тревога на следующей же правке рядом.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

/** Срез исходника между двумя маркерами — оба обязаны найтись. */
const between = (fromMarker: string, toMarker: string): string => {
  const from = SRC.indexOf(fromMarker);
  expect(from).toBeGreaterThan(-1);
  const to = SRC.indexOf(toMarker, from + fromMarker.length);
  expect(to).toBeGreaterThan(from);
  return SRC.slice(from, to);
};

const sendMessageToAI = () => between('const sendMessageToAI = async', 'const sendMessageText = async');
const sendInitialGreeting = () => between('const sendInitialGreeting = async', 'const loadMoreHistory = async');
const handleRegenerateResponse = () => between('const handleRegenerateResponse = async', 'const scrollToBottom');
const handleFileUpload = () => between('const handleFileUpload = async', 'const handleFileTaskSubmit = async');
const handleFileTaskSubmit = () => between('const handleFileTaskSubmit = async', 'const handleSelectAssistant = async');

describe('sendMessageToAI — сигнатура и исход', () => {
  it('принимает id пузыря пользователя именованным параметром userMessageId (опциональным)', () => {
    expect(SRC).toMatch(/const sendMessageToAI = async \([^)]*\buserMessageId\b[^)]*\)/);
  });

  it('возвращает исход хода вызывающему (C1: нужен веткам без id, которым генерик не подходит)', () => {
    expect(sendMessageToAI()).toMatch(/return\s+noTokens\s*\?\s*'no_tokens'\s*:\s*'ok'/);
  });

  it('разбор end зовёт isNoTokensEnd независимо от наличия usage', () => {
    // Раньше код гейтился условием `data.usage` целиком — у отказа на нуле
    // usage не бывает (ход не оплачен), и такой гейт не пустил бы noTokens.
    expect(sendMessageToAI()).toContain("if (data.type === 'end') {");
    expect(sendMessageToAI()).toContain('if (isNoTokensEnd(data)) noTokens = true;');
  });
});

describe('C1: текст/черновик трогаем ТОЛЬКО когда ход инициирован человеком напрямую', () => {
  it('решение о тексте/черновике гейтится наличием userMessageId', () => {
    expect(sendMessageToAI()).toMatch(/if \(userMessageId !== undefined/);
  });

  it('applyNoTokensOutcome (поле/черновик) зовётся только внутри этого гейта, а не безусловно при noTokens', () => {
    const body = sendMessageToAI();
    const gate = body.indexOf('if (userMessageId !== undefined');
    expect(gate).toBeGreaterThan(-1);
    expect(body.indexOf('applyNoTokensOutcome(')).toBeGreaterThan(gate);
    // И только один вызов на всю функцию — не разбросан по синтетической ветке.
    expect(body.split('applyNoTokensOutcome(').length - 1).toBe(1);
  });

  it('автоприветствие шлёт sendMessageToAI БЕЗ id — промпт синтетический, не текст человека', () => {
    expect(sendInitialGreeting()).toContain('await sendMessageToAI(greetingMessage);');
  });

  it('«Перегенерировать» шлёт sendMessageToAI БЕЗ id — пузырь уже существующий, не новый', () => {
    expect(handleRegenerateResponse()).toContain('await sendMessageToAI(lastUserMessage.content);');
  });

  it('PDF-поток Маши шлёт sendMessageToAI БЕЗ id — промпт с данными документа, не текст человека', () => {
    expect(handleFileUpload()).toContain('await sendMessageToAI(prompt);');
  });

  it('все три синтетических вызова передают РОВНО один аргумент (без userMessageId)', () => {
    for (const call of [
      'await sendMessageToAI(greetingMessage);',
      'await sendMessageToAI(lastUserMessage.content);',
      'await sendMessageToAI(prompt);',
    ]) {
      expect(call).not.toMatch(/,\s*\S/);
    }
  });
});

describe('m1: повторный такой же отказ подряд заменяет сообщение остановки, а не дублирует', () => {
  it('sendMessageToAI пишет ленту через collapseNoTokensStop при noTokens (а не безусловный append)', () => {
    const body = sendMessageToAI();
    expect(body).toContain("collapseNoTokensStop(prev, userMessageId ?? '', completedMessage)");
  });

  it('completedMessage помечен noTokensStop при noTokens — иначе collapse не узнает «такое же»', () => {
    expect(sendMessageToAI()).toMatch(/noTokensStop:\s*noTokens\s*\|\|\s*undefined/);
  });
});

describe('m2: очередь, скопившаяся за время хода, не досылается в заведомо нулевой баланс', () => {
  it('очередь читается (joinQueue) и чистится (applyQueued) в ветке noTokens с id', () => {
    const body = sendMessageToAI();
    const gate = body.indexOf('if (userMessageId !== undefined');
    const scoped = body.slice(gate);
    expect(scoped).toContain('joinQueue(queuedRef.current)');
    expect(scoped).toContain('applyQueued(() => [])');
  });
});

describe('m5: предел черновика — комментарий на месте вызова', () => {
  it('у вызова savePendingDraft в текстовом ходе есть пояснение про PENDING_DRAFT_STORE_MAX', () => {
    const body = sendMessageToAI();
    const at = body.indexOf('savePendingDraft(outcome.draftText');
    expect(at).toBeGreaterThan(-1);
    expect(body.slice(Math.max(0, at - 400), at)).toContain('PENDING_DRAFT_STORE_MAX');
  });
});

describe('успешное (не noTokens) завершение снимает совпавший черновик', () => {
  it('sendMessageToAI зовёт forgetPendingDraftIfSent (не takePendingDraftFor+savePendingDraft — I1)', () => {
    expect(sendMessageToAI()).toContain('forgetPendingDraftIfSent(streamAssistantId, userMessage)');
  });

  it('handleFileTaskSubmit тоже зовёт forgetPendingDraftIfSent при успехе', () => {
    expect(handleFileTaskSubmit()).toContain('forgetPendingDraftIfSent(uploadAssistantId, task)');
  });
});

describe('I3: загрузка файлов привязана к ассистенту', () => {
  it('handleFileTaskSubmit запоминает ассистента в начале (как streamAssistantId в sendMessageToAI)', () => {
    expect(handleFileTaskSubmit()).toMatch(/const uploadAssistantId = selectedAssistant\?\.id \?\? null;/);
  });

  it('восстановление интерфейса (не только черновика) сверяется с selectedAssistantIdRef', () => {
    const body = between('const restoreFileTaskOnNoTokens = (', 'const handleFileTaskSubmit = async');
    expect(body).toContain('selectedAssistantIdRef.current !== uploadAssistantId');
  });
});

describe('C1 + общая функция восстановления для ОБЕИХ веток загрузки', () => {
  it('есть общая функция restoreFileTaskOnNoTokens', () => {
    expect(SRC).toMatch(/const restoreFileTaskOnNoTokens = \(/);
  });

  it('ветка мультипарта зовёт её при noTokens', () => {
    expect(handleFileTaskSubmit()).toMatch(/restoreFileTaskOnNoTokens\(\s*userMessage\.id,\s*assistantMsg,/);
  });

  it('ветка одного текстового файла — по исходу sendMessageToAI (outcome), а не по собственному isNoTokensEnd', () => {
    const body = handleFileTaskSubmit();
    const singleFileBranch = body.slice(body.indexOf('isTextFile(files[0])'));
    expect(singleFileBranch).toMatch(/outcome\s*=\s*await sendMessageToAI\(/);
    expect(singleFileBranch).toContain("if (outcome === 'no_tokens')");
    // Та же общая функция — не отдельная копия восстановления.
    expect(singleFileBranch.indexOf('restoreFileTaskOnNoTokens(')).toBeGreaterThan(-1);
  });

  it('restoreFileTaskOnNoTokens сохраняет черновик ИЗ ТЕКСТА ЗАДАЧИ (task), не из промпта с содержимым файла', () => {
    const body = between('const restoreFileTaskOnNoTokens = (', 'const handleFileTaskSubmit = async');
    expect(body).toContain('savePendingDraft(task, uploadAssistantId)');
  });
});

describe('I2: окно задачи не открывается само сразу — ждёт пополнения баланса', () => {
  it('restoreFileTaskOnNoTokens не открывает модалку (setShowFileTaskModal отсутствует в её теле)', () => {
    const body = between('const restoreFileTaskOnNoTokens = (', 'const handleFileTaskSubmit = async');
    expect(body).not.toContain('setShowFileTaskModal');
  });

  it('есть эффект, открывающий модалку по user?.tokens', () => {
    const effectStart = SRC.indexOf('fileTaskAutoReopenedRef');
    expect(effectStart).toBeGreaterThan(-1);
    const effectRegion = SRC.slice(effectStart, SRC.indexOf('}, [', effectStart) + 400);
    expect(effectRegion).toContain('useEffect(');
    expect(effectRegion).toContain('user?.tokens');
    expect(effectRegion).toContain('setShowFileTaskModal(true)');
  });

  it('эффект открывает один раз — есть ref-гард до setShowFileTaskModal(true)', () => {
    const effectStart = SRC.indexOf('fileTaskAutoReopenedRef');
    const effectBody = SRC.slice(effectStart, SRC.indexOf('setShowFileTaskModal(true)', effectStart));
    expect(effectBody).toContain('fileTaskAutoReopenedRef.current');
  });

  it('эффект сверяет ассистента (I3) — не открывает модалку чужих файлов поверх текущего чата', () => {
    const effectStart = SRC.indexOf('fileTaskAutoReopenedRef');
    const effectRegion = SRC.slice(effectStart, SRC.indexOf('}, [', effectStart) + 200);
    expect(effectRegion).toContain('pendingFilesAssistantId');
    expect(effectRegion).toContain('selectedAssistant?.id');
  });
});

describe('окно пополнения токенов (TokenPackages) не открывается само', () => {
  it('ни одна из точек no_tokens не зовёт setShowTokenPackages', () => {
    expect(sendMessageToAI()).not.toContain('setShowTokenPackages');
    expect(handleFileTaskSubmit()).not.toContain('setShowTokenPackages');
    const restoreFn = between('const restoreFileTaskOnNoTokens = (', 'const handleFileTaskSubmit = async');
    expect(restoreFn).not.toContain('setShowTokenPackages');
  });
});

describe('подключение модулей', () => {
  it('collapseNoTokensStop и applyNoTokensOutcome импортированы из noTokensDraft', () => {
    const importLine = SRC.split('\n').find((l) => l.includes("from './noTokensDraft';"));
    expect(importLine).toBeDefined();
    expect(importLine).toContain('isNoTokensEnd');
    expect(importLine).toContain('restoreIntoInput');
    expect(importLine).toContain('collapseNoTokensStop');
    expect(importLine).toContain('applyNoTokensOutcome');
  });

  it('forgetPendingDraftIfSent импортирован из utils/pendingDraft (I1) — локального forgetDraftIfSent больше нет', () => {
    const importLine = SRC.split('\n').find((l) => l.includes("from '../../utils/pendingDraft';"));
    expect(importLine).toBeDefined();
    expect(importLine).toContain('forgetPendingDraftIfSent');
    expect(SRC).not.toContain('const forgetDraftIfSent = ');
  });

  it('Message несёт признак noTokensStop (для collapseNoTokensStop)', () => {
    const msgInterface = between('interface Message {', '\n}');
    expect(msgInterface).toContain('noTokensStop?: boolean');
  });
});
