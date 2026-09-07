import { describe, it, expect } from 'vitest';
import { buildSections, SECTION_KEYS } from './profileSections';

const профиль = (data: Record<string, unknown>) => [{ profileJson: data }];

describe('buildSections', () => {
  it('богатая форма побеждает простую: в ней есть пояснения', () => {
    const s = buildSections(профиль({
      desires: ['Свобода'],
      desiresRich: [{ name: 'Свобода', description: 'Работать откуда угодно' }],
    }));
    expect(s).toHaveLength(1);
    expect(s[0].items[0]).toEqual({ name: 'Свобода', description: 'Работать откуда угодно' });
  });

  it('без богатой берёт простую', () => {
    const s = buildSections(профиль({ beliefs: ['Люди договороспособны'] }));
    expect(s[0].key).toBe('beliefs');
    expect(s[0].items[0]).toEqual({ name: 'Люди договороспособны' });
  });

  it('пустые разделы не показываем вовсе', () => {
    // У свежего аккаунта пусты все шесть: шесть заголовков с прочерками
    // читались бы как поломка, а не как «пока ничего не набралось».
    expect(buildSections(профиль({ desires: [], beliefs: null }))).toEqual([]);
    expect(buildSections(профиль({}))).toEqual([]);
  });

  it('порядок разделов совпадает с веб-профилем', () => {
    const все = Object.fromEntries(SECTION_KEYS.map((k) => [k, ['пункт']]));
    expect(buildSections(профиль(все)).map((s) => s.key)).toEqual([...SECTION_KEYS]);
  });

  it('поле называется intents, а не intentions — как отдаёт бэкенд', () => {
    expect(buildSections(профиль({ intents: ['Запустить продукт'] }))[0].key).toBe('intents');
    expect(buildSections(профиль({ intentions: ['Запустить продукт'] }))).toEqual([]);
  });

  it('старый формат profile_data тоже понимаем', () => {
    expect(buildSections([{ profile_data: { values: ['Честность'] } }])[0].key).toBe('values');
  });

  it('мусор вместо массива не роняет экран', () => {
    expect(buildSections(профиль({ desires: 'строка', beliefsRich: 42 }))).toEqual([]);
    expect(buildSections(null)).toEqual([]);
    expect(buildSections('ерунда')).toEqual([]);
  });

  it('пункты без имени отбрасываются, а не рисуются пустыми строками', () => {
    const s = buildSections(профиль({ interestsRich: [{ description: 'без имени' }, { name: 'Горы' }] }));
    expect(s[0].items).toEqual([{ name: 'Горы' }]);
  });
});
