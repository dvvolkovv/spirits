import { resolveLanguage } from '../i18n/languages';

/**
 * Языки интерфейса, для которых голосового ввода нет: у Yandex SpeechKit v3
 * нет распознавания китайского. Источник правды — сервер (spirits_back
 * src/voice/speechkit-stt.service.ts, SPEECHKIT_LANGUAGE_CODES): он для такого
 * языка профиля отвечает lang_unsupported. Здесь — ранний отказ, чтобы не
 * спрашивать доступ к микрофону ради сокета, который тут же закроется.
 */
export const DICTATION_UNSUPPORTED_LANGUAGES: readonly string[] = ['zh'];

/** Язык не определён — не отказываем: последнее слово за сервером. */
export function isDictationLanguageSupported(lang: string | null | undefined): boolean {
  if (!lang) return true;
  return !DICTATION_UNSUPPORTED_LANGUAGES.includes(resolveLanguage(lang));
}
