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

    // Очищаем номер телефона от всех символов кроме цифр
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    try {
      const response = await fetch(`https://travel-n8n.up.railway.app/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/${cleanPhone}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Ошибка отправки SMS: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error('Не удалось отправить SMS');
      }

      setIsLoading(false);
      setStep('otp');
    } catch (error) {
      console.error('Ошибка при отправке SMS:', error);
      alert('Ошибка при отправке кода. Попробуйте еще раз.');
      setIsLoading(false);
    }
  };

  const handleOTPSubmit = async (code: string) => {
    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Mock successful login
    const mockToken = 'mock-jwt-token';
    login(phone, mockToken);
    
    setIsLoading(false);
  };

  const handleResendOTP = async () => {
    // Очищаем номер телефона от всех символов кроме цифр
    const cleanPhone = phone.replace(/\D/g, '');

    try {
      const response = await fetch(`https://travel-n8n.up.railway.app/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/${cleanPhone}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Ошибка отправки SMS: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error('Не удалось отправить SMS');
      }
    } catch (error) {
      console.error('Ошибка при повторной отправке SMS:', error);
      alert('Ошибка при отправке кода. Попробуйте еще раз.');
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