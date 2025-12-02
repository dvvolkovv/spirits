import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, ArrowLeft, Clipboard } from 'lucide-react';

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
  const [resendTimer, setResendTimer] = useState(300);
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

  useEffect(() => {
    if ('OTPCredential' in window && navigator.credentials) {
      const ac = new AbortController();
      let isCompleted = false;

      const requestOTP = async () => {
        try {
          const otp: any = await navigator.credentials.get({
            otp: { transport: ['sms'] },
            signal: ac.signal,
          } as any);

          if (otp?.code && !isCompleted) {
            isCompleted = true;
            const digits = otp.code.split('');
            if (digits.length === 6) {
              setCode(digits);
              onSubmit(otp.code);
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError' && err.name !== 'InvalidStateError') {
            console.log('Web OTP error:', err);
          }
        }
      };

      requestOTP();

      return () => {
        isCompleted = true;
        ac.abort();
      };
    }
  }, [onSubmit]);

  const handleInputChange = (index: number, value: string) => {
    // Handle paste of full code
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      if (digits.length === 6) {
        setCode(digits);
        onSubmit(digits.join(''));
      }
      return;
    }

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

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const digits = pastedData.replace(/\D/g, '').slice(0, 6).split('');

    if (digits.length === 6) {
      setCode(digits);
      onSubmit(digits.join(''));
    }
  };

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const digits = text.replace(/\D/g, '').slice(0, 6).split('');

      if (digits.length === 6) {
        setCode(digits);
        onSubmit(digits.join(''));
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResend = () => {
    setResendTimer(300);
    onResend();
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
          <p className="text-gray-600 mb-3">
            {t('onboarding.code_sent')} {maskedPhone}
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-gray-700">
            <p className="mb-1">
              <span className="font-medium">Код отправлен в Telegram</span>
            </p>
            <p className="text-gray-600">
              Если у вас нет Telegram, код придет по SMS
            </p>
          </div>
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
                onPaste={handlePaste}
                className="w-12 h-12 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:border-forest-500 focus:ring-2 focus:ring-forest-200 transition-colors"
                disabled={isLoading}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
              />
            ))}
          </div>

          {/* Paste Button for Mobile */}
          <div className="flex justify-center">
            <button
              onClick={handleClipboardPaste}
              disabled={isLoading}
              className="flex items-center space-x-2 px-4 py-2 text-forest-600 hover:text-forest-700 hover:bg-forest-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Clipboard className="w-4 h-4" />
              <span className="text-sm font-medium">Вставить код из буфера</span>
            </button>
          </div>

          {/* Resend */}
          <div className="text-center">
            {resendTimer > 0 ? (
              <p className="text-gray-500 text-sm">
                {t('onboarding.resend_code')} через {formatTime(resendTimer)}
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