import { describe, it, expect } from 'vitest';
import ru from '../../../i18n/locales/ru.json';
import en from '../../../i18n/locales/en.json';
import de from '../../../i18n/locales/de.json';
import es from '../../../i18n/locales/es.json';
import fr from '../../../i18n/locales/fr.json';
import pt from '../../../i18n/locales/pt.json';
import zh from '../../../i18n/locales/zh.json';

/** Ключи панели «Медиа и файлы». check-locales требует их везде, тест — ещё и без кириллицы вне ru. */
const KEYS = [
  'open', 'title', 'tab_media', 'tab_files', 'empty_media', 'empty_files', 'load_error', 'retry',
  'download', 'close', 'back', 'prev', 'next', 'unsaved', 'unsaved_hint', 'video', 'image',
];
const LOCALES: Record<string, any> = { ru, en, de, es, fr, pt, zh };

describe('тексты панели «Медиа и файлы»', () => {
  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name}: все ключи на месте`, () => {
      for (const k of KEYS) {
        const v = loc.chat?.files?.[k];
        expect(typeof v, `${name}: chat.files.${k}`).toBe('string');
        expect(v, `${name}: chat.files.${k}`).toBeTruthy();
        if (name !== 'ru') expect(v, `${name}: chat.files.${k}`).not.toMatch(/[Ѐ-ӿ]/);
      }
      expect(loc.chat.files.unsaved).toContain('{{n}}');
    });
  }
});
