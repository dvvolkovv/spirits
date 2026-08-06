import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { CountrySelect } from './CountrySelect';
import { defaultCountryForLanguage } from './phoneCountry';

interface PhoneInputProps {
  onSubmit: (phone: string) => void;
  onDemoClick?: () => void;
  isLoading: boolean;
}

const PhoneInput: React.FC<PhoneInputProps> = ({ onSubmit, isLoading }) => {
  const { t, i18n } = useTranslation();
  const [country, setCountry] = useState<CountryCode>(() => defaultCountryForLanguage(i18n.language));
  const [national, setNational] = useState('');
  const [touched, setTouched] = useState(false);

  /**
   * Номер собирается из выбранной страны и национальной части.
   *
   * Раньше здесь была маска, намертво зашитая на +7 (11 цифр) — телефоном
   * могли войти только Россия и Казахстан, остальной мир упирался в форму,
   * которая физически не принимала его номер.
   *
   * Валидация — через libphonenumber-js, а не своей регуляркой: длина и
   * формат номера различаются по странам и даже по операторам внутри страны,
   * самодельная проверка неизбежно ошибётся.
   */
  const parsed = parsePhoneNumberFromString(national, country);
  const isValidPhone = Boolean(parsed?.isValid());
  const canSubmit = isValidPhone && !isLoading;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // AsYouType форматирует по мере ввода в формате выбранной страны.
    // Стираем форматирование при удалении, иначе backspace «залипает»
    // на скобке или дефисе, которые формат вставил сам.
    const raw = e.target.value;
    const formatter = new AsYouType(country);
    setNational(raw.endsWith(' ') || raw.endsWith(')') ? raw : formatter.input(raw));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit || !parsed) return;
    // На бэк уходит E.164 без плюса: authService всё равно вырезает нецифры,
    // но так формат номера однозначен независимо от того, как его ввели.
    onSubmit(parsed.number);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('onboarding.enter_phone')}
          </label>
          <div className="flex">
            <CountrySelect value={country} onChange={setCountry} disabled={isLoading} />
            <input
              type="tel"
              value={national}
              onChange={handleChange}
              onBlur={() => setTouched(true)}
              data-testid="phone-input"
              placeholder={new AsYouType(country).input('0'.repeat(9))}
              className="flex-1 min-w-0 px-4 py-3 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent text-lg"
              autoFocus
            />
          </div>
          {touched && national && !isValidPhone && (
            <p className="text-red-500 text-sm mt-1">
              {t('onboarding.phone_invalid')}
            </p>
          )}
        </div>

        <button
          type="submit"
          data-testid="phone-submit-btn"
          disabled={!canSubmit}
          className={clsx(
            'w-full px-6 py-3 rounded-lg font-medium flex items-center justify-center space-x-2 transition-all duration-200',
            canSubmit
              ? 'bg-forest-600 hover:bg-forest-700 text-white shadow-md hover:shadow-lg'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed',
          )}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>{t('onboarding.send_code')}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default PhoneInput;
