import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож на связку «сообщение, отклонённое на нуле» (бэклог 2d71aaf8; дизайн
 * — spirits_back docs/superpowers/specs/2026-11-03-background-turns-and-no-tokens-draft-design.md, §2).
 *
 * isNoTokensEnd/restoreIntoInput проверены как чистые функции в
 * noTokensDraft.test.ts. Но ChatInterface — это ДВА независимых разбора
 * потока (текстовый ход в sendMessageToAI и загрузка в handleFileTaskSubmit),
 * и типичная ошибка здесь — забыть позвать isNoTokensEnd в одной из точек,
 * или позвать, но не довести дело до savePendingDraft/снятия пузыря. Юнит-тест
 * чистых функций такую ошибку не ловит: обе функции остаются целыми и
 * зелёными, просто не вызванными откуда нужно — отсюда отдельный сторож по
 * тексту исходника (как remoteTurnWiring.test.ts/filesEventsWiring.test.ts).
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

describe('текстовый ход (sendMessageToAI)', () => {
  const body = between('const sendMessageToAI = async', 'const sendMessageText = async');

  it('принимает id пузыря пользователя вторым (опциональным) параметром', () => {
    expect(SRC).toContain(
      "const sendMessageToAI = async (userMessage: string, userMessageId?: string) => {",
    );
  });

  it('разбор end зовёт isNoTokensEnd независимо от наличия usage', () => {
    // Раньше ветка про end была гейтилась `data.usage` — отказ на нуле usage
    // не несёт (ход не оплачен), и такой гейт замолчал бы признак совсем.
    expect(body).toContain("if (data.type === 'end') {");
    expect(body).toContain('if (isNoTokensEnd(data)) noTokens = true;');
  });

  it('на noTokens — пузырь убран (фильтр по id), ответ бэка остаётся в ленте', () => {
    const commit = body.slice(body.indexOf('Only commit to UI state'));
    expect(commit).toContain(
      'setMessages(prev => [...prev.filter(m => m.id !== userMessageId), completedMessage]);',
    );
  });

  it('на noTokens — текст возвращается в поле через restoreIntoInput', () => {
    expect(body).toContain('setInput(prev => restoreIntoInput(prev, userMessage));');
  });

  it('черновик сохраняется ДО гейта «пользователь ещё в этом чате» — переживает уход на оплату', () => {
    // Та же фраза-гейт встречается и ВНУТРИ цикла разбора потока (throttle
    // обновления стримящегося текста) — ищем гейт коммита ПОСЛЕ маркера
    // noTokens, а не первое попавшееся совпадение от начала функции.
    const noTokensAt = body.indexOf('if (noTokens && streamAssistantId');
    expect(noTokensAt).toBeGreaterThan(-1);
    const gateAt = body.indexOf('if (selectedAssistantIdRef.current === streamAssistantId) {', noTokensAt);
    expect(gateAt).toBeGreaterThan(noTokensAt);
    const beforeGate = body.slice(noTokensAt, gateAt);
    expect(beforeGate).toContain('savePendingDraft(userMessage, streamAssistantId);');
  });

  it('успешное (не noTokens) завершение снимает совпавший черновик через forgetDraftIfSent', () => {
    expect(body).toContain('if (streamAssistantId !== null) forgetDraftIfSent(streamAssistantId, userMessage);');
  });
});

describe('sendMessageText передаёт id созданного пузыря в sendMessageToAI', () => {
  it('вызов sendMessageToAI(text, userMessage.id)', () => {
    const body = between('const sendMessageText = async', 'const handleSend = async');
    expect(body).toContain('await sendMessageToAI(text, userMessage.id);');
  });
});

describe('загрузка файлов (handleFileTaskSubmit)', () => {
  const body = between('const handleFileTaskSubmit = async', 'const handleSelectAssistant = async');

  it('разбор end зовёт isNoTokensEnd', () => {
    expect(body).toContain("} else if (event.type === 'end') {");
    expect(body).toContain('if (isNoTokensEnd(event)) noTokens = true;');
  });

  it('на noTokens — пузырь убран, файлы и текст задачи возвращены в окно отправки', () => {
    expect(body).toContain('setMessages(prev => [...prev.filter(m => m.id !== userMessage.id), assistantMsg]);');
    expect(body).toContain('setPendingFiles(files);');
    expect(body).toContain('setFileTaskInput(task);');
    expect(body).toContain('setShowFileTaskModal(true);');
  });

  it('текст задачи на noTokens ещё и в savePendingDraft', () => {
    expect(body).toContain('savePendingDraft(task, selectedAssistant.id);');
  });

  it('успешное завершение снимает совпавший черновик', () => {
    expect(body).toContain('forgetDraftIfSent(selectedAssistant.id, task);');
  });
});

describe('forgetDraftIfSent — общий хелпер для обеих точек', () => {
  it('забирает черновик и кладёт обратно, если текст не совпал (не трогаем чужой)', () => {
    const body = between('const forgetDraftIfSent = (', 'const sendMessageToAI = async');
    expect(body).toContain('const existing = takePendingDraftFor(assistantId);');
    expect(body).toContain('savePendingDraft(existing, assistantId);');
  });
});

describe('подключение модулей', () => {
  it('isNoTokensEnd/restoreIntoInput импортированы из noTokensDraft', () => {
    expect(SRC).toContain("import { isNoTokensEnd, restoreIntoInput } from './noTokensDraft';");
  });

  it('savePendingDraft импортирован вместе с остальными хелперами черновика', () => {
    expect(SRC).toContain(
      "import { hasPendingDraftFor, savePendingDraft, takePendingDraftFor } from '../../utils/pendingDraft';",
    );
  });
});
