import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { ArrowRight, Info } from 'lucide-react';
import { clsx } from 'clsx';
import LegalModal from './LegalModal';
import PaymentInfoModal from './PaymentInfoModal';

interface PhoneInputProps {
  onSubmit: (phone: string) => void;
  onDemoClick: () => void;
  isLoading: boolean;
}

interface FormData {
  phone: string;
  allConsents: boolean;
}

const PhoneInput: React.FC<PhoneInputProps> = ({ onSubmit, onDemoClick, isLoading }) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'terms' | 'privacy'>('terms');
  const [paymentInfoOpen, setPaymentInfoOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch
  } = useForm<FormData>();

  const phone = watch('phone');
  const allConsents = watch('allConsents');

  const openModal = (type: 'terms' | 'privacy') => {
    setModalType(type);
    setModalOpen(true);
  };

  const formatPhone = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as +7 (XXX) XXX-XX-XX
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
  const canSubmit = isValidPhone && allConsents && !isLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-forest-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-4">
            <img
              src="/logo-Photoroom.png"
              alt="Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t('onboarding.welcome')}
          </h1>
          <p className="text-gray-600">
            {t('onboarding.subtitle')}
          </p>
          <button
            type="button"
            onClick={() => setPaymentInfoOpen(true)}
            className="mt-4 inline-flex items-center space-x-2 text-sm text-forest-600 hover:text-forest-700 font-medium transition-colors"
          >
            <Info className="w-4 h-4" />
            <span>Описание услуг и порядок оплаты</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit((data) => onSubmit(data.phone))}>
          <div className="space-y-6">
            {/* Phone Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('onboarding.enter_phone')}
              </label>
              <input
                type="tel"
                {...register('phone', {
                  required: true,
                  onChange: handlePhoneChange
                })}
                placeholder={t('onboarding.phone_placeholder')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent text-lg"
                autoFocus
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">
                  Введите корректный номер телефона
                </p>
              )}
            </div>

            {/* Legal Consents */}
            <div className="bg-gray-50 rounded-lg p-4">
              <label className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  {...register('allConsents', { required: true })}
                  className="mt-1 w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  Мне больше 18 лет, принимаю{' '}
                  <button
                    type="button"
                    className="text-forest-600 hover:underline font-medium"
                    onClick={() => openModal('terms')}
                  >
                    Пользовательское соглашение
                  </button>
                  ,{' '}
                  <button
                    type="button"
                    className="text-forest-600 hover:underline font-medium"
                    onClick={() => openModal('privacy')}
                  >
                    Политику конфиденциальности
                  </button>
                  {' '}и даю согласие на обработку персональных данных
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className={clsx(
                'w-full px-6 py-3 rounded-lg font-medium flex items-center justify-center space-x-2 transition-all duration-200',
                canSubmit
                  ? 'bg-forest-600 hover:bg-forest-700 text-white shadow-md hover:shadow-lg'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
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

            {/* Demo Mode Button */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">или</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onDemoClick}
              className="w-full px-6 py-3 rounded-lg font-medium border-2 border-forest-600 text-forest-600 hover:bg-forest-50 transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <span>Попробовать без регистрации</span>
            </button>
          </div>
        </form>
      </div>

      <LegalModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        type={modalType}
      />

      <PaymentInfoModal
        isOpen={paymentInfoOpen}
        onClose={() => setPaymentInfoOpen(false)}
      />
    </div>
  );
};

export default PhoneInput;