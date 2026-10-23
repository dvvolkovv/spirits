import { describe, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({ lang: 'ru' }));
// formatDate берёт язык у экземпляра i18next — подставляем свой.
vi.mock('../i18n', () => ({
  default: {
    get language() {
      return state.lang;
    },
  },
}));

import { parseSpending, categoryLabelKey, monthLabel, spendingUrl } from './spending';

describe('parseSpending', () => {
  it('читает форму /webhook/tokens/spending', () => {
    const raw = {
      months: [{ month: '2026-10', total: 6193, categories: [{ key: 'replies', tokens: 6193, count: 12 }] }],
    };
    expect(parseSpending(raw)).toEqual(raw.months);
  });

  it('пустой список на мусоре', () => {
    expect(parseSpending(null)).toEqual([]);
    expect(parseSpending({ months: 'x' })).toEqual([]);
  });

  it('выбрасывает месяцы без даты и с нулём, категории с нулём', () => {
    const raw = {
      months: [
        { month: 'oct', total: 5, categories: [] },
        { month: '2026-09', total: 0, categories: [] },
        {
          month: '2026-08',
          total: 10,
          categories: [
            { key: 'images', tokens: 10, count: 1 },
            { key: 'video', tokens: 0, count: 0 },
          ],
        },
      ],
    };
    expect(parseSpending(raw)).toEqual([
      { month: '2026-08', total: 10, categories: [{ key: 'images', tokens: 10, count: 1 }] },
    ]);
  });
});

describe('categoryLabelKey', () => {
  it('известный ключ — свой текст', () => {
    expect(categoryLabelKey('tg_bots')).toBe('payment.spending.cat.tg_bots');
  });
  it('незнакомый ключ — «Прочее»', () => {
    expect(categoryLabelKey('music')).toBe('payment.spending.cat.other');
  });
});

describe('monthLabel', () => {
  it('месяц словом и год, с заглавной', () => {
    state.lang = 'ru';
    expect(monthLabel('2026-10')).toMatch(/^Октябрь 2026/);
    state.lang = 'en';
    expect(monthLabel('2026-10')).toBe('October 2026');
  });

  it('к западу от Гринвича не съезжает на месяц назад', () => {
    const prev = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      state.lang = 'en';
      expect(monthLabel('2026-10')).toBe('October 2026');
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });

  it('непонятную строку отдаёт как есть', () => {
    expect(monthLabel('oct')).toBe('oct');
  });
});

describe('spendingUrl', () => {
  it('передаёт пояс браузера', () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ timeZone: 'Asia/Novosibirsk' } as Intl.ResolvedDateTimeFormatOptions);
    expect(spendingUrl()).toBe('/webhook/tokens/spending?tz=Asia%2FNovosibirsk');
    spy.mockRestore();
  });

  it('без пояса — без параметра', () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ timeZone: '' } as Intl.ResolvedDateTimeFormatOptions);
    expect(spendingUrl()).toBe('/webhook/tokens/spending');
    spy.mockRestore();
  });
});
