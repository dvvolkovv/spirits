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
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsLoading(false);
    setStep('otp');
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
    // Simulate resend
    await new Promise(resolve => setTimeout(resolve, 500));
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