// src/components/chat/interactivityWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож связки шагов и карточек в ChatInterface: чистые модули
 * (turnActivity, askBlock, askAnswer) покрыты своими тестами, а вот что их
 * вообще зовут — видно только здесь. Убрать `ui` из запроса или ветку
 * `activity` из цикла стрима — и всё останется зелёным, а фича пропадёт.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const between = (from: string, to: string): string => {
  const a = SRC.indexOf(from);
  expect(a).toBeGreaterThan(-1);
  const b = SRC.indexOf(to, a);
  expect(b).toBeGreaterThan(a);
  return SRC.slice(a, b);
};

describe('связка шагов работы', () => {
  const send = () => between('const sendMessageToAI = async', '// Cleanup on unmount');
  const upload = () => between('const handleFileUpload = async', 'const handleSelectAssistant = async');

  it('текстовый ход просит у бэка шаги и карточки', () => {
    expect(send()).toContain('ui: { activity: true, ask: true }');
  });

  it('цикл стрима принимает шаги и отмечает начало текста', () => {
    expect(send()).toContain("data.type === 'activity'");
    expect(send()).toContain('addStep(');
    expect(send()).toContain('markTextStarted(');
  });

  it('итог шагов прикрепляется к завершённому сообщению', () => {
    expect(send()).toContain('activity: finishActivity(');
  });

  it('загрузка файла тоже просит шаги и принимает их', () => {
    expect(upload()).toContain("formData.append('ui', JSON.stringify({ activity: true, ask: true }))");
    expect(upload()).toContain("event.type === 'activity'");
    expect(upload()).toContain('activity: finishActivity(');
  });

  it('идущий ход передаёт шаги в StreamingMessage', () => {
    expect(SRC).toContain('activity={streamActivity}');
  });
});

describe('связка карточек вопросов', () => {
  it('маркер ask разбирается в обоих рендерах — стриминговом и ленте', () => {
    expect(SRC.match(/startsWith\('__ASK_'\)/g)?.length).toBe(2);
  });

  it('стриминговый рендер разбирает с streaming: true', () => {
    expect(SRC).toContain('parseCustomMarkdown(content, { streaming: true })');
  });

  it('ответ из карточки идёт тем же путём, что набранный текст (очередь, удалённый ход)', () => {
    const body = between('const handleAskAnswer = async', '};');
    expect(body).toContain('submitText(');
    expect(body).toContain('sendingRef.current');
  });

  it('копирование ответа превращает блок в текст', () => {
    expect(SRC).toContain('askBlocksToPlainText(');
  });
});
