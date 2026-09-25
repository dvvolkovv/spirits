import { describe, it, expect } from 'vitest';
import ru from '../../i18n/locales/ru.json';
import en from '../../i18n/locales/en.json';
import pt from '../../i18n/locales/pt.json';

/**
 * Раздел admin переведён только в ru, en и pt: остальные языки берут
 * английский по цепочке откатов (en → ru), а check-locales ключи admin.*
 * не требует вовсе. Поэтому ключ, забытый в en, никто не поймает — его
 * немецкий, испанский и прочие администраторы увидят русским.
 */
const LOCALES: Record<string, any> = { ru, en, pt };

const NEW_KEYS = [
  'provider.linkeon', 'provider.linkeon_room', 'provider.talerid', 'provider.meet',
  'provider.zoom', 'provider.teams', 'provider.telemost',
  'flag.failed', 'flag.live', 'tokensHint',
];

const at = (obj: any, path: string) => path.split('.').reduce((o, k) => o?.[k], obj);

describe('ключи раздела звонков', () => {
  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name}: площадки, новые пометки и подсказка списания`, () => {
      for (const key of NEW_KEYS) {
        const v = at(loc, `admin.calls.${key}`);
        expect(typeof v, `${name}: admin.calls.${key}`).toBe('string');
        expect(v, `${name}: admin.calls.${key}`).toBeTruthy();
        // Перевод руками: самая вероятная ошибка — русская строка, вставленная
        // в en или pt. Такую увидели бы все нерусские администраторы.
        if (name !== 'ru') expect(v as string, `${name}: admin.calls.${key}`).not.toMatch(/[Ѐ-ӿ]/);
      }
    });
  }

  it('подсказка списания подставляет обе части', () => {
    for (const [name, loc] of Object.entries(LOCALES)) {
      const hint = at(loc, 'admin.calls.tokensHint') as string;
      expect(hint, name).toContain('{{call}}');
      expect(hint, name).toContain('{{consult}}');
    }
  });

  it('заголовок блока в карточке говорит и про встречи', () => {
    expect(at(ru, 'admin.calls.sectionTitle')).toBe('Звонки и встречи');
    expect(at(en, 'admin.calls.sectionTitle')).toBe('Calls and meetings');
    expect(at(pt, 'admin.calls.sectionTitle')).toBe('Chamadas e reuniões');
  });
});
