import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import PhoneInput from './PhoneInput';
import OTPInput from './OTPInput';
import { authService, STORAGE_FULL } from '../../services/authService';

type Step = 'phone' | 'otp';

interface Props {
  /** Согласие ещё не отмечено — отправлять нельзя. */
  blocked?: boolean;
  /** Блок согласия. Общий для обеих форм, поэтому приходит снаружи. */
  consent?: React.ReactNode;
  /** Рисуется под кнопкой: переключение на вход по почте. */
  footer?: React.ReactNode;
}

const SmsLoginPane: React.FC<Props> = ({ blocked, consent, footer }) => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [otpError, setOtpError] = useState<string>('');

  const handlePhoneSubmit = async (phoneNumber: string) => {
    setIsLoading(true);
    setPhone(phoneNumber);
    try {
      const result = await authService.requestSMSCode(phoneNumber);
      if (result.success) {
        setStep('otp');
      } else {
        if (result.message === 'User blocked') {
          toast.error(t('auth.sms.userBlocked', 'Ваш аккаунт заблокирован. Пожалуйста, свяжитесь с поддержкой.'));
        } else {
          toast.error(t('auth.sms.sendError', 'Ошибка отправки СМС. Попробуйте еще раз.'));
        }
      }
    } catch (error) {
      console.error('Error sending SMS:', error);
      toast.error(t('auth.sms.sendError', 'Ошибка отправки СМС. Попробуйте еще раз.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async (code: string) => {
    setIsLoading(true);
    setOtpError('');
    try {
      const result = await authService.verifyCode(phone, code);
      if (result.success) {
        if (result.tokens) {
          await login(phone, result.tokens['access-token']);
        } else {
          await login(phone, 'legacy-token');
        }
        // registerReferral теперь вызывается централизованно в AuthContext.login()
        // (покрывает SMS/OAuth/email) — здесь дублировать не нужно.
        navigate('/chat', { replace: true });
      } else {
        if (result.error === STORAGE_FULL) {
          // Код был верным и уже погашен сервером — предлагать «ввести ещё раз»
          // бессмысленно, человеку надо освободить место или выйти из приватного
          // режима, а потом запросить новый код.
          setOtpError(t('auth.sms.storageUnavailable'));
        } else if (result.error === 'Wrong code') {
          setOtpError(t('auth.sms.wrongCode', 'Неверный код. Попробуйте еще раз.'));
        } else if (result.error === 'Code not found') {
          setOtpError(t('auth.sms.codeNotFound', 'Код не найден. Запросите новый код.'));
        } else if (result.error === 'User disable') {
          setOtpError(t('auth.sms.userDisabled', 'Ваш аккаунт отключен. Обратитесь в поддержку.'));
        } else {
          setOtpError(t('auth.sms.verifyError', 'Ошибка проверки кода. Попробуйте еще раз.'));
        }
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      setOtpError(t('auth.sms.verifyError', 'Ошибка проверки кода. Попробуйте еще раз.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      const result = await authService.requestSMSCode(phone);
      if (!result.success) {
        toast.error(t('auth.sms.resendError', 'Ошибка повторной отправки СМС. Попробуйте еще раз.'));
      }
    } catch (error) {
      console.error('Error resending SMS:', error);
      toast.error(t('auth.sms.resendError', 'Ошибка повторной отправки СМС. Попробуйте еще раз.'));
    }
  };

  const handleBack = () => {
    setStep('phone');
  };

  if (step === 'phone') {
    return (
      <PhoneInput
        onSubmit={handlePhoneSubmit}
        isLoading={isLoading}
        onDemoClick={() => {}}
        blocked={blocked}
        consent={consent}
        footer={footer}
      />
    );
  }
  return (
    <OTPInput
      phone={phone}
      onSubmit={handleOTPSubmit}
      onBack={handleBack}
      isLoading={isLoading}
      onResend={handleResendOTP}
      error={otpError}
      onErrorClear={() => setOtpError('')}
    />
  );
};

export default SmsLoginPane;
