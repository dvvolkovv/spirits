export type FieldSource = 'user' | 'assistant';

export interface BusinessField {
  value: string;
  source: FieldSource;
  updated_at: string;
}

export type BusinessFieldKey =
  | 'what' | 'legal_form' | 'tax_mode' | 'stage' | 'revenue' | 'team' | 'customers' | 'focus';

export type BusinessProfile = Partial<Record<BusinessFieldKey, BusinessField>>;

export interface FieldSpec {
  key: BusinessFieldKey;
  labelKey: string;
  /** Коды опций; текст берётся из i18n по businessCard.option.<key>.<code> */
  options?: string[];
  multiline?: boolean;
}

// Порядок фиксирован: он же порядок показа. Совпадает с бэкендом.
export const BUSINESS_FIELDS: FieldSpec[] = [
  { key: 'what',       labelKey: 'businessCard.field.what' },
  { key: 'legal_form', labelKey: 'businessCard.field.legal_form', options: ['self_employed', 'ip', 'ooo'] },
  { key: 'tax_mode',   labelKey: 'businessCard.field.tax_mode',   options: ['npd', 'usn_d', 'usn_dr', 'patent', 'osno'] },
  { key: 'stage',      labelKey: 'businessCard.field.stage',      options: ['idea', 'year_one', 'stable', 'growth'] },
  { key: 'revenue',    labelKey: 'businessCard.field.revenue',    options: ['lt_300k', '300k_1m', '1m_3m', '3m_10m', 'gt_10m'] },
  { key: 'team',       labelKey: 'businessCard.field.team' },
  { key: 'customers',  labelKey: 'businessCard.field.customers',  multiline: true },
  { key: 'focus',      labelKey: 'businessCard.field.focus',      multiline: true },
];

const hasValue = (p: BusinessProfile, k: BusinessFieldKey) => (p[k]?.value || '').trim().length > 0;

export const filledFields = (p: BusinessProfile): FieldSpec[] =>
  BUSINESS_FIELDS.filter(f => hasValue(p, f.key));

export const emptyFields = (p: BusinessProfile): FieldSpec[] =>
  BUSINESS_FIELDS.filter(f => !hasValue(p, f.key));

export const isCardEmpty = (p: BusinessProfile): boolean =>
  !BUSINESS_FIELDS.some(f => hasValue(p, f.key));
