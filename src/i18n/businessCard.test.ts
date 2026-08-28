import { describe, it, expect } from 'vitest';
import { BUSINESS_FIELDS } from '../components/profile/businessFields';

import ru from './locales/ru.json';
import en from './locales/en.json';
import es from './locales/es.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';

const LOCALES: Record<string, any> = { ru, en, es, de, fr, pt, zh };

function get(obj: any, dotted: string): unknown {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

describe('переводы бизнес-карточки', () => {
  const required: string[] = [
    'businessCard.title',
    'businessCard.subtitle',
    'businessCard.addMore',
    'businessCard.filledByAssistant',
    'businessCard.empty',
    'businessCard.saveError',
    ...BUSINESS_FIELDS.map(f => f.labelKey),
    ...BUSINESS_FIELDS.flatMap(f =>
      (f.options || []).map(o => `businessCard.option.${f.key}.${o}`),
    ),
  ];

  for (const [name, bundle] of Object.entries(LOCALES)) {
    it(`${name}: есть все ключи карточки`, () => {
      const missing = required.filter(k => typeof get(bundle, k) !== 'string');
      expect(missing).toEqual([]);
    });

    it(`${name}: ни один перевод не пустой`, () => {
      const blank = required.filter(k => !String(get(bundle, k) ?? '').trim());
      expect(blank).toEqual([]);
    });
  }

  it('нерусские локали не оставили русский текст в заголовке', () => {
    for (const [name, bundle] of Object.entries(LOCALES)) {
      if (name === 'ru') continue;
      expect(String(get(bundle, 'businessCard.title'))).not.toMatch(/[А-Яа-я]/);
    }
  });
});
