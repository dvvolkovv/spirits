import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

describe('пустой чат не делает платный ход без действия человека', () => {
  it('не содержит пути автоприветствия', () => {
    expect(SRC).not.toContain('sendInitialGreeting');
    expect(SRC).not.toContain("t('chat.initial_greeting')");
    expect(SRC).not.toContain('greetingStillWanted');
    expect(SRC).not.toContain('sendSeqRef');
  });

  it('сохраняет обычную отправку сообщения человеком', () => {
    expect(SRC).toContain('const sendMessageToAI = async (');
  });
});
