// src/components/chat/draftWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож связки черновика: pendingDraft.ts покрыт своими тестами, а вот что
 * ChatInterface его зовёт, ждёт истории нужного ассистента и НЕ отправляет
 * текст сам — видно только здесь.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const effect = (): string => {
  const a = SRC.indexOf('takePendingDraftFor(selectedAssistant.id)');
  expect(a).toBeGreaterThan(-1);
  const start = SRC.lastIndexOf('useEffect(', a);
  const end = SRC.indexOf('}, [selectedAssistant?.id, historyLoading]);', a);
  expect(end).toBeGreaterThan(-1);
  return SRC.slice(start, end);
};

// Тело sendInitialGreeting — поиском соответствующей закрывающей скобки, а не
// до следующего `const`: внутри своя `const greetingMessage = ...`, и наивный
// поиск «до следующего const» обрежет тело ДО вызова sendMessageToAI, спрятав
// от проверки именно то, что нужно проверить.
const greeting = (): string => {
  const marker = 'const sendInitialGreeting = async () => {';
  const start = SRC.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
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

describe('черновик со страницы linkeon.io', () => {
  it('ChatInterface забирает черновик из utils/pendingDraft', () => {
    expect(SRC).toContain("import { hasPendingDraftFor, takePendingDraftFor } from '../../utils/pendingDraft';");
  });

  it('ждёт, пока загрузится история именно выбранного ассистента', () => {
    expect(effect()).toContain('historyLoadedForRef.current !== selectedAssistant.id');
    expect(effect()).toContain('historyLoading');
  });

  it('кладёт текст в поле ввода и не отправляет его', () => {
    expect(effect()).toContain('setInput(');
    expect(effect()).not.toContain('sendMessageText');
    expect(effect()).not.toContain('handleSend');
  });

  // Черновик выдаётся один раз: забрать его при занятом поле — потерять.
  it('при занятом поле черновик не забирается', () => {
    const body = effect();
    const check = body.indexOf('if (textareaRef.current?.value.trim()) return;');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(body.indexOf('takePendingDraftFor('));
  });

  // Иначе вебвизор кабинета записал бы подставленные данные рождения до того,
  // как человек решил их отправить.
  it('поле ввода чата скрыто от Вебвизора', () => {
    const at = SRC.indexOf('data-testid="chat-input"');
    expect(at).toBeGreaterThan(-1);
    const tag = SRC.slice(SRC.lastIndexOf('<textarea', at), at);
    // Именно в className: рядом комментарий с тем же словом, и поиск по всему
    // тегу не заметил бы, что класс уехал на другое поле.
    const classes = tag.match(/className="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    expect(classes).toContain('ym-disable-keys');
  });
});

describe('автоприветствие уступает черновику с калькулятора', () => {
  // Если черновик ждёт этого ассистента, он сейчас подставится в поле ввода
  // (эффект выше) — автоприветствие ассистенту ни к чему: это ход впустую.
  it('sendInitialGreeting не отправляет приветствие, пока ждёт черновик этого ассистента', () => {
    const body = greeting();
    const guard = body.indexOf('hasPendingDraftFor(selectedAssistant.id)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('sendMessageToAI('));
  });
});
