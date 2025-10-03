import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import PhoneInput from '../components/onboarding/PhoneInput';
import OTPInput from '../components/onboarding/OTPInput';

type OnboardingStep = 'phone' | 'otp' | 'consent';

const OnboardingPage: React.FC = () => {
  const { login } = useAuth();
  const [step, setStep] = useState<OnboardingStep>('phone');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePhoneSubmit = async (phoneNumber: string) => {
    setIsLoading(true);
    setPhone(phoneNumber);

    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const response = await fetch(`https://travel-n8n.up.railway.app/w/898c938d-f094-455c-86af-969617e62f7a/sms/${cleanPhone}`);

      if (!response.ok) {
        throw new Error('Failed to send SMS');
      }

      setStep('otp');
    } catch (error) {
      console.error('Error sending SMS:', error);
      alert('Ошибка отправки СМС. Попробуйте еще раз.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async (code: string) => {
    setIsLoading(true);

    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const response = await fetch(`https://travel-n8n.up.railway.app/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/${cleanPhone}/${code}`);

      if (!response.ok) {
        throw new Error('Failed to verify code');
      }

      const result = await response.text();

      if (result.trim() === 'Confirmed') {
        const mockToken = 'mock-jwt-token';
        login(phone, mockToken);
      } else {
        alert('Неверный код. Попробуйте еще раз.');
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      alert('Ошибка проверки кода. Попробуйте еще раз.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const response = await fetch(`https://travel-n8n.up.railway.app/w/898c938d-f094-455c-86af-969617e62f7a/sms/${cleanPhone}`);

      if (!response.ok) {
        throw new Error('Failed to resend SMS');
      }
    } catch (error) {
      console.error('Error resending SMS:', error);
      alert('Ошибка повторной отправки СМС. Попробуйте еще раз.');
    }
  };

  const handleBack = () => {
    setStep('phone');
  };

  switch (step) {
    case 'phone':
      return (
        <PhoneInput
          onSubmit={handlePhoneSubmit}
          isLoading={isLoading}
        />
      );
    case 'otp':
      return (
        <OTPInput
          phone={phone}
          onSubmit={handleOTPSubmit}
          onBack={handleBack}
          isLoading={isLoading}
          onResend={handleResendOTP}
        />
      );
    default:
      return null;
  }
};

export default OnboardingPage;