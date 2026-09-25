import { describe, it, expect } from 'vitest';
import { providerLabel, KNOWN_PROVIDERS } from './callProviders';

describe('подписи площадок', () => {
  const t = ((key: string, def?: string) => def ?? key) as any;

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
});
