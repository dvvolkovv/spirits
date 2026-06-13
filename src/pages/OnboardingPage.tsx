import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LoginTabs from '../components/onboarding/LoginTabs';

const REFERRAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

const OnboardingPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const refSlug = searchParams.get('ref');
    if (refSlug) {
      localStorage.setItem('referral_slug', refSlug);
      localStorage.setItem('referral_slug_expires', String(Date.now() + REFERRAL_TTL_MS));
    }
  }, [searchParams]);

  // Message-match: пришёл с рекламы под персону (?seg=biz/creator) — показываем
  // подзаголовок под ту же персону, что в объявлении/лендинге, чтобы обещание не
  // рвалось на экране регистрации (выше конверсия в регистрацию).
  const seg = searchParams.get('seg');
  const segSubtitle = seg === 'biz'
    ? t('onboarding.seg_biz')
    : seg === 'creator'
      ? t('onboarding.seg_creator')
      : t('onboarding.subtitle');

  return (
    <div
      data-testid="onboarding-root"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-warm-50 via-white to-forest-50 py-12 px-4"
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-24 h-24 mx-auto mb-4">
            <img src="/logo-Photoroom.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('onboarding.welcome')}</h1>
          <p className="text-gray-600">{segSubtitle}</p>
          <p className="mt-3 text-sm font-medium text-forest-700">{t('onboarding.trust')}</p>
        </div>
        <LoginTabs />
      </div>
    </div>
  );
};

export default OnboardingPage;
