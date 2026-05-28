import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import PhoneInput from './PhoneInput';
import OTPInput from './OTPInput';
import { authService } from '../../services/authService';

type Step = 'phone' | 'otp';

const SmsLoginPane: React.FC = () => {
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
          alert('Ваш аккаунт заблокирован. Пожалуйста, свяжитесь с поддержкой.');
        } else {
          alert('Ошибка отправки СМС. Попробуйте еще раз.');
        }
      }
    } catch (error) {
      console.error('Error sending SMS:', error);
      alert('Ошибка отправки СМС. Попробуйте еще раз.');
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
        await authService.registerReferral();
        navigate('/chat', { replace: true });
      } else {
        if (result.error === 'Wrong code') {
          setOtpError('Неверный код. Попробуйте еще раз.');
        } else if (result.error === 'Code not found') {
          setOtpError('Код не найден. Запросите новый код.');
        } else if (result.error === 'User disable') {
          setOtpError('Ваш аккаунт отключен. Обратитесь в поддержку.');
        } else {
          setOtpError('Ошибка проверки кода. Попробуйте еще раз.');
        }
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      setOtpError('Ошибка проверки кода. Попробуйте еще раз.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      const result = await authService.requestSMSCode(phone);
      if (!result.success) {
        alert('Ошибка повторной отправки СМС. Попробуйте еще раз.');
      }
    } catch (error) {
      console.error('Error resending SMS:', error);
      alert('Ошибка повторной отправки СМС. Попробуйте еще раз.');
    }
  };

  const handleBack = () => {
    setStep('phone');
  };

  if (step === 'phone') {
    return <PhoneInput onSubmit={handlePhoneSubmit} isLoading={isLoading} onDemoClick={() => {}} />;
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
