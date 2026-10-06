// src/components/chat/listenWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож связки кнопки «Прослушать»: speechText, плеер и кнопка покрыты
 * своими тестами, а вот что ChatInterface их вообще зовёт — видно только
 * здесь. Убрать кнопку из строки под ответом — и всё остальное останется
 * зелёным.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const listenTag = (): string => {
  const a = SRC.indexOf('<ListenButton');
  expect(a).toBeGreaterThan(-1);
  return SRC.slice(a, SRC.indexOf('/>', a));
};

describe('связка кнопки «Прослушать»', () => {
  it('один плеер на ленту', () => {
    expect(SRC.match(/useListenPlayer\(\)/g)?.length).toBe(1);
  });

  it('кнопка стоит в строке под ответом сразу после «Копировать»', () => {
    const copy = SRC.indexOf("t('chat.copy', 'Копировать')");
    expect(copy).toBeGreaterThan(-1);
    const listen = SRC.indexOf('<ListenButton', copy);
    expect(listen).toBeGreaterThan(copy);
    expect(SRC.slice(copy, listen)).not.toContain('</div>');
  });

  it('только у завершённых ответов ассистента', () => {
    const at = SRC.indexOf('<ListenButton');
    expect(SRC.slice(at - 160, at)).toContain("message.type === 'assistant' && !message.isStreaming && message.content");
  });

  it('кнопке передан ассистент ленты и общий плеер', () => {
    const tag = listenTag();
    expect(tag).toContain('content={message.content}');
    expect(tag).toContain('assistant={selectedAssistant?.name}');
    expect(tag).toContain('phase={listen.phaseOf(message.id)}');
    expect(tag).toContain('onToggle={listen.toggle}');
  });

  it('смена ассистента глушит озвучку', () => {
    expect(SRC).toMatch(/useEffect\(\(\) => \{\s*stopListening\(\);\s*\}, \[selectedAssistant\?\.id, stopListening\]\)/);
  });

  it('строка под ответом переносится, а не вылезает за пузырь', () => {
    expect(SRC).toContain("'flex flex-wrap items-center gap-2 text-xs mt-1'");
  });
});
