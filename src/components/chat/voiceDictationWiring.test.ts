// src/components/chat/voiceDictationWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import ru from '../../i18n/locales/ru.json';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import de from '../../i18n/locales/de.json';
import fr from '../../i18n/locales/fr.json';
import zh from '../../i18n/locales/zh.json';
import pt from '../../i18n/locales/pt.json';

/**
 * Сторож реакции чата на ошибки диктовки. Сервер (spirits_back voice-ws.ts)
 * слушает на языке профиля, а для языка без распознавания — китайского —
 * присылает { type: 'error', message: 'lang_unsupported' } и закрывает сокет.
 * Без отдельной ветки микрофон просто гас, и это выглядело поломкой.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const dictationOnError = (): string => {
  const start = SRC.indexOf('const vd = new VoiceDictation();');
  expect(start).toBeGreaterThan(-1);
  const at = SRC.indexOf('onError: (msg) => {', start);
  expect(at).toBeGreaterThan(start);
  return SRC.slice(at, SRC.indexOf('onClose:', at));
};

describe('диктовка: ошибки от сервера', () => {
  it('lang_unsupported — сообщение человеку, а не молчание', () => {
    expect(dictationOnError()).toMatch(
      /msg === 'lang_unsupported'\) \{ if \(!auto\) alert\(t\('chat\.voice_lang_unsupported'\)\); \}/,
    );
  });

  it('при авто-старте — без алерта, как и отказ микрофона', () => {
    const h = dictationOnError();
    expect(h).toContain("if (msg === 'mic_denied') { if (!auto) alert(t('chat.mic_access_denied')); }");
    expect(h).not.toMatch(/lang_unsupported'\) \{ alert/);
  });

  it('сообщение переведено на все языки и не копирует русское', () => {
    const locales = { en, es, de, fr, zh, pt } as Record<string, any>;
    const ruText = (ru as any).chat.voice_lang_unsupported;
    expect(typeof ruText).toBe('string');
    expect(ruText.length).toBeGreaterThan(0);
    for (const [lang, l] of Object.entries(locales)) {
      const text = l.chat?.voice_lang_unsupported;
      expect(typeof text, lang).toBe('string');
      expect(text, lang).not.toBe(ruText);
      expect(text, lang).not.toMatch(/[а-яё]/i);
    }
  });
});
