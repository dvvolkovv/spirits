import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import LoginTabs from '../components/onboarding/LoginTabs';

const REFERRAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

const OnboardingPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const refSlug = searchParams.get('ref');
    if (refSlug) {
      localStorage.setItem('referral_slug', refSlug);
      localStorage.setItem('referral_slug_expires', String(Date.now() + REFERRAL_TTL_MS));
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-forest-50 to-white py-12 px-4">
      <LoginTabs />
    </div>
  );
};

export default OnboardingPage;
