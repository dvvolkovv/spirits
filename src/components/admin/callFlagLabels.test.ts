import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { flagLabel, flagTone, KNOWN_FLAGS } from './callFlagLabels';
import ru from '../../i18n/locales/ru.json';
import en from '../../i18n/locales/en.json';
import pt from '../../i18n/locales/pt.json';

describe('подписи пометок', () => {
  const t = ((key: string, def?: string) => def ?? key) as unknown as TFunction;

  it('у каждой известной пометки есть подпись и тон', () => {
    for (const f of KNOWN_FLAGS) {
      expect(flagLabel(f, t)).toBeTruthy();
      expect(['danger', 'warn', 'neutral']).toContain(flagTone(f));
    }
  });

  it('незнакомая пометка с бэкенда не роняет строку', () => {
    // Бэкенд может завести новую пометку раньше, чем обновится фронт.
    expect(flagLabel('что-то новое', t)).toBe('что-то новое');
    expect(flagTone('что-то новое')).toBe('neutral');
  });

  it('сбой встречи и идущая сессия подписаны и окрашены', () => {
    expect(flagLabel('failed', t)).toBe('сбой');
    expect(flagTone('failed')).toBe('danger');
    expect(flagLabel('live', t)).toBe('идёт сейчас');
    expect(flagTone('live')).toBe('neutral');
  });

  it.each(['constructor', '__proto__', 'toString'])('имя из прототипа %s не подменяет подпись и тон', (name) => {
    // Без hasOwnProperty таблица отдала бы функцию Object вместо тона, и
    // пометка отрисовалась бы без стиля.
    expect(flagLabel(name, t)).toBe(name);
    expect(flagTone(name)).toBe('neutral');
  });

  it('подпись каждой известной пометки лежит в ru, en и pt', () => {
    // Фальшивый t выше отдаёт русский default, и перепутанный ключ в LABELS
    // прошёл бы зелёным. Здесь t строгий, и подпись сверяется с ключом самой
    // пометки: ключ выводится из id (nearly_silent → nearlySilent).
    const at = (obj: unknown, path: string): unknown =>
      path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
    const keyOf = (f: string) => `admin.calls.flag.${f.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`;
    for (const [name, loc] of Object.entries({ ru, en, pt })) {
      const strict = ((key: string) => at(loc, key) ?? `MISSING ${key}`) as unknown as TFunction;
      for (const f of KNOWN_FLAGS) expect(flagLabel(f, strict), `${name}: ${f}`).toBe(at(loc, keyOf(f)));
    }
  });

  it('русский текст в коде совпадает с ru.json', () => {
    // ru лежит в бандле и замыкает цепочку откатов, так что default из кода
    // на экран не попадает никогда: разойдись они — тест выше проверял бы
    // строку, которой админ не видит.
    const at = (obj: unknown, path: string): unknown =>
      path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
    const strictRu = ((key: string) => at(ru, key) ?? `MISSING ${key}`) as unknown as TFunction;
    for (const f of KNOWN_FLAGS) expect(flagLabel(f, strictRu), f).toBe(flagLabel(f, t));
  });
});
