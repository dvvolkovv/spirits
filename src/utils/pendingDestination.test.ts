// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  allowedDestination,
  forgetPendingDestination,
  rememberPendingDestination,
  takePendingDestination,
} from './pendingDestination';

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

describe('раздел, куда человек шёл до входа', () => {
  beforeEach(() => localStorage.clear());

  it('вкладка продуктов запоминается и отдаётся один раз', () => {
    expect(rememberPendingDestination('/studio', '?tab=products', NOW)).toBe(true);
    expect(takePendingDestination(NOW + 1000)).toBe('/studio?tab=products');
    expect(takePendingDestination(NOW + 2000)).toBeNull();
  });

  it('лишние параметры адреса отбрасываются', () => {
    rememberPendingDestination('/studio', '?tab=products&utm_content=sites&lang=en', NOW);
    expect(takePendingDestination(NOW)).toBe('/studio?tab=products');
  });

  // Белый список: иначе адрес из ссылки превратил бы кабинет в открытый редирект.
  it('адреса не из списка не запоминаются', () => {
    const others: [string, string][] = [
      ['/studio', '?tab=bots'],
      ['/studio', ''],
      ['/admin', '?tab=products'],
      ['//evil.example/studio', '?tab=products'],
      ['/chat', ''],
    ];
    for (const [path, search] of others) {
      expect(rememberPendingDestination(path, search, NOW), `${path}${search}`).toBe(false);
    }
    expect(takePendingDestination(NOW)).toBeNull();
  });

  it('через час забывается', () => {
    rememberPendingDestination('/studio', '?tab=products', NOW);
    expect(takePendingDestination(NOW + HOUR + 1)).toBeNull();
    expect(localStorage.getItem('pending_destination')).toBeNull();
  });

  it('подменённая запись не уводит за пределы списка', () => {
    localStorage.setItem('pending_destination', JSON.stringify({ value: 'https://evil.example/', expires: NOW + HOUR }));
    expect(takePendingDestination(NOW)).toBeNull();
  });

  it('битая запись не роняет и стирается', () => {
    localStorage.setItem('pending_destination', '{oops');
    expect(takePendingDestination(NOW)).toBeNull();
    expect(localStorage.getItem('pending_destination')).toBeNull();
  });

  it('forget стирает запомненное', () => {
    rememberPendingDestination('/studio', '?tab=products', NOW);
    forgetPendingDestination();
    expect(takePendingDestination(NOW)).toBeNull();
  });

  it('канонический вид адреса', () => {
    expect(allowedDestination('/studio', '?tab=products')).toBe('/studio?tab=products');
    expect(allowedDestination('/studio', '?tab=agents')).toBeNull();
  });
});
