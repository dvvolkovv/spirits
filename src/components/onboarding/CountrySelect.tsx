import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';

interface CountrySelectProps {
  value: CountryCode;
  onChange: (country: CountryCode) => void;
  disabled?: boolean;
}

/** ISO 3166-1 alpha-2 → эмодзи-флаг: два regional indicator symbol. */
function flagOf(iso: string): string {
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/**
 * Выбор страны для телефонного ввода.
 *
 * Названия стран берутся из Intl.DisplayNames — они локализованы браузером
 * на язык интерфейса, поэтому свой словарь на 250 стран × 6 языков вести
 * не нужно: немец видит «Deutschland», китаец «德国».
 *
 * Список стран и коды — из libphonenumber-js, чтобы не разъезжались
 * с валидацией номера.
 */
export const CountrySelect: React.FC<CountrySelectProps> = ({ value, onChange, disabled }) => {
  const { t, i18n } = useTranslation();

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([i18n.language], { type: 'region' });
    return getCountries()
      .map((iso) => ({
        iso,
        dial: `+${getCountryCallingCode(iso)}`,
        name: names.of(iso) ?? iso,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  }, [i18n.language]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CountryCode)}
      disabled={disabled}
      data-testid="country-select"
      aria-label={t('onboarding.country')}
      className="px-2 py-3 border border-gray-300 rounded-l-lg border-r-0 bg-white text-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent max-w-[7.5rem]"
    >
      {countries.map((c) => (
        <option key={c.iso} value={c.iso}>
          {flagOf(c.iso)} {c.dial}
        </option>
      ))}
    </select>
  );
};
