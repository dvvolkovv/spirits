import { describe, it, expect } from 'vitest';
import { isDictationLanguageSupported, DICTATION_UNSUPPORTED_LANGUAGES } from './dictationLanguages';
import { SUPPORTED_CODES } from '../i18n/languages';

/**
 * Языки, для которых голосового ввода нет. Сервер (spirits_back
 * speechkit-stt.service.ts) для них не открывает распознавание и отвечает
 * lang_unsupported; фронт отказывает раньше — не захватывая микрофон.
 */
describe('языки диктовки', () => {
  it('без диктовки — только китайский', () => {
    expect(SUPPORTED_CODES.filter((l) => !isDictationLanguageSupported(l))).toEqual(['zh']);
    expect([...DICTATION_UNSUPPORTED_LANGUAGES]).toEqual(['zh']);
  });

  it('полный тег схлопывается до корня', () => {
    expect(isDictationLanguageSupported('zh-CN')).toBe(false);
    expect(isDictationLanguageSupported('zh_TW')).toBe(false);
    expect(isDictationLanguageSupported('en-US')).toBe(true);
    expect(isDictationLanguageSupported('pt-PT')).toBe(true);
  });

  it('язык не определён — не отказываем: последнее слово за сервером', () => {
    expect(isDictationLanguageSupported(undefined)).toBe(true);
    expect(isDictationLanguageSupported('')).toBe(true);
  });
});
