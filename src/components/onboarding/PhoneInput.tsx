import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { CountrySelect } from './CountrySelect';
import { defaultCountryForLanguage } from './phoneCountry';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';

interface PhoneInputProps {
  onSubmit: (phone: string) => void;
  onDemoClick?: () => void;
  isLoading: boolean;
  /** Согласие ещё не отмечено — отправлять нельзя. */
  blocked?: boolean;
  /** Блок согласия. Рендерится между полем и кнопкой; общий для обеих форм, поэтому приходит снаружи. */
  consent?: React.ReactNode;
  /** Рисуется под кнопкой: переключение на вход по почте. */
  footer?: React.ReactNode;
}

const PhoneInput: React.FC<PhoneInputProps> = ({ onSubmit, isLoading, blocked, consent, footer }) => {
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

  // space-y-3 на форме, а не отступы на детях — так же, как в форме почты:
  // зазор между полем, блоком согласия и кнопкой одинаковый независимо от того,
  // передан consent или нет.
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField
        label={t('onboarding.enter_phone')}
        type="tel"
        value={national}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        data-testid="phone-input"
        placeholder={new AsYouType(country).input('0'.repeat(9))}
        autoFocus
        error={touched && national && !isValidPhone ? t('onboarding.phone_invalid') : null}
        prefix={
          <div className="flex items-center border-r border-gray-200 pl-1">
            <CountrySelect value={country} onChange={setCountry} disabled={isLoading} />
          </div>
        }
      />
      {consent}
      <Button
        type="submit"
        data-testid="phone-submit-btn"
        loading={isLoading}
        disabled={!canSubmit || blocked}
      >
        {t('onboarding.send_code')}
      </Button>
      {footer}
    </form>
  );
};

export default PhoneInput;
