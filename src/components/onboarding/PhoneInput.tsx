import React from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';

interface PhoneInputProps {
  onSubmit: (phone: string) => void;
  onDemoClick?: () => void;
  isLoading: boolean;
}

interface FormData {
  phone: string;
}

const PhoneInput: React.FC<PhoneInputProps> = ({ onSubmit, isLoading }) => {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<FormData>();

  const phone = watch('phone');

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 0) return '';
    if (digits.length <= 1) return '+7';
    if (digits.length <= 4) return `+7 (${digits.slice(1)}`;
    if (digits.length <= 7) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`;
    if (digits.length <= 9) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    e.target.value = formatted;
  };

  const isValidPhone = phone && phone.replace(/\D/g, '').length === 11;
  const canSubmit = isValidPhone && !isLoading;

  return (
    <form onSubmit={handleSubmit((data) => onSubmit(data.phone))}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('onboarding.enter_phone')}
          </label>
          <input
            type="tel"
            {...register('phone', {
              required: true,
              onChange: handlePhoneChange,
            })}
            data-testid="phone-input"
            placeholder={t('onboarding.phone_placeholder')}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent text-lg"
            autoFocus
          />
          {errors.phone && (
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
