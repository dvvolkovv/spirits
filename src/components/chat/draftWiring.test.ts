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

describe('черновик со страницы linkeon.io', () => {
  it('ChatInterface забирает черновик из utils/pendingDraft', () => {
    expect(SRC).toContain("import { takePendingDraftFor } from '../../utils/pendingDraft';");
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
