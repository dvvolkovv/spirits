import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, ArrowLeft } from 'lucide-react';

interface OTPInputProps {
  phone: string;
  onSubmit: (code: string) => void;
  onBack: () => void;
  isLoading: boolean;
  onResend: () => void;
  error?: string;
  onErrorClear?: () => void;
}

const OTPInput: React.FC<OTPInputProps> = ({
  phone,
  onSubmit,
  onBack,
  isLoading,
  onResend,
  error,
  onErrorClear
}) => {
  const { t } = useTranslation();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      onErrorClear?.();
    }
  }, [error, onErrorClear]);

  const handleInputChange = (index: number, value: string) => {
    if (value.length > 1) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all fields are filled
    if (newCode.every(digit => digit) && value) {
      onSubmit(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = () => {
    setResendTimer(60);
    onResend();
  };

  const maskedPhone = phone.replace(/(\+7)(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 ($2) ***-**-$5');

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-forest-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">{t('common.back')}</span>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-forest-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t('onboarding.enter_code')}
          </h1>
          <p className="text-gray-600">
            {t('onboarding.code_sent')} {maskedPhone}
          </p>
        </div>

        {/* OTP Input */}
        <div className="space-y-6">
          <div className="flex justify-center space-x-3">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-12 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:border-forest-500 focus:ring-2 focus:ring-forest-200 transition-colors"
                disabled={isLoading}
              />
            ))}
          </div>

          {/* Resend */}
          <div className="text-center">
            {resendTimer > 0 ? (
              <p className="text-gray-500 text-sm">
                {t('onboarding.resend_code')} через {resendTimer}с
              </p>
            ) : (
              <button
                onClick={handleResend}
                className="text-forest-600 hover:text-forest-700 text-sm font-medium hover:underline"
              >
                {t('onboarding.resend_code')}
              </button>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-center">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 text-gray-600">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-forest-600 rounded-full animate-spin" />
                <span className="text-sm">{t('common.loading')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OTPInput;