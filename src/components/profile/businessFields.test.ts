import { describe, it, expect } from 'vitest';
import { BUSINESS_FIELDS, filledFields, emptyFields, isCardEmpty } from './businessFields';
import type { BusinessProfile } from './businessFields';

const PROFILE: BusinessProfile = {
  what: { value: 'студия маникюра', source: 'user', updated_at: 'x' },
  tax_mode: { value: 'usn_d', source: 'assistant', updated_at: 'x' },
};

describe('businessFields', () => {
  it('описывает восемь полей в фиксированном порядке', () => {
    expect(BUSINESS_FIELDS.map(f => f.key)).toEqual([
      'what', 'legal_form', 'tax_mode', 'stage', 'revenue', 'team', 'customers', 'focus',
    ]);
  });

  it('у каждого поля есть i18n-ключ лейбла', () => {
    for (const f of BUSINESS_FIELDS) {
      expect(f.labelKey).toMatch(/^businessCard\.field\./);
    }
  });

  it('enum-поля несут ключи опций, а не готовый текст', () => {
    const tax = BUSINESS_FIELDS.find(f => f.key === 'tax_mode')!;
    expect(tax.options).toEqual(['npd', 'usn_d', 'usn_dr', 'patent', 'osno']);
  });

  it('делит поля на заполненные и пустые с сохранением порядка', () => {
    expect(filledFields(PROFILE).map(f => f.key)).toEqual(['what', 'tax_mode']);
    expect(emptyFields(PROFILE).map(f => f.key)).toEqual([
      'legal_form', 'stage', 'revenue', 'team', 'customers', 'focus',
    ]);
  });

  it('пустую карточку распознаёт', () => {
    expect(isCardEmpty({})).toBe(true);
    expect(isCardEmpty({ what: { value: '  ', source: 'user', updated_at: 'x' } })).toBe(true);
    expect(isCardEmpty(PROFILE)).toBe(false);
  });
});
