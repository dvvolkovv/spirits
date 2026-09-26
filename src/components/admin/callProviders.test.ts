import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { providerLabel, KNOWN_PROVIDERS } from './callProviders';
import ru from '../../i18n/locales/ru.json';
import en from '../../i18n/locales/en.json';
import pt from '../../i18n/locales/pt.json';

describe('подписи площадок', () => {
  const t = ((key: string, def?: string) => def ?? key) as unknown as TFunction;

  it('площадки встреч подписаны по-человечески', () => {
    expect(providerLabel('meet', t)).toBe('Google Meet');
    expect(providerLabel('telemost', t)).toBe('Яндекс Телемост');
    expect(providerLabel('talerid', t)).toBe('Taler ID');
    expect(providerLabel('linkeon', t)).toBe('Звонок');
    expect(KNOWN_PROVIDERS).toHaveLength(7);
  });

  it('незнакомая площадка показывается техническим именем', () => {
    // Бэкенд заводит площадку раньше, чем фронт узнаёт её подпись.
    expect(providerLabel('webex', t)).toBe('webex');
  });

  it('имя из прототипа объекта не подменяет подпись', () => {
    expect(providerLabel('constructor', t)).toBe('constructor');
    expect(providerLabel('toString', t)).toBe('toString');
  });

  it('подпись каждой известной площадки лежит в ru, en и pt', () => {
    // Фальшивый t выше отдаёт русский default, и опечатка в ключе LABELS
    // прошла бы зелёной, а en и pt показали бы русское «Звонок». Здесь t
    // строгий: нет ключа в локали — нет подписи.
    const at = (obj: unknown, path: string): unknown =>
      path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
    for (const [name, loc] of Object.entries({ ru, en, pt })) {
      const strict = ((key: string) => at(loc, key) ?? `MISSING ${key}`) as unknown as TFunction;
      for (const p of KNOWN_PROVIDERS) expect(providerLabel(p, strict), `${name}: ${p}`).toBe(at(loc, `admin.calls.provider.${p}`));
    }
  });
});
