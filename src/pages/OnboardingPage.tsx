import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LoginTabs from '../components/onboarding/LoginTabs';
import { LanguageSelect } from '../components/settings/LanguageSelect';

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
      className="relative min-h-screen overflow-hidden grain-overlay bg-gradient-to-br from-warm-50 via-white to-forest-50 py-10 px-4 flex items-center justify-center"
    >
      {/* Мягкое свечение за карточкой: даёт фону глубину, которой не было —
          градиент существовал и раньше, но не читался, потому что форму
          от него ничто не отделяло. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full blur-3xl opacity-40 bg-forest-200"
      />

      {/* Позиционируем обёрткой, а не через className самого LanguageSelect:
          в варианте pill его className ДОБАВЛЯЕТСЯ к базовым классам, и своя
          рамка или фон сложились бы с базовыми. */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSelect variant="pill" showFlag={false} />
      </div>

      <div className="relative w-full max-w-[400px]">
        <div className="text-center mb-6 animate-fade-in stagger-1">
          <img
            src="/logo-Photoroom.png"
            alt=""
            className="w-14 h-14 mx-auto mb-3 object-contain"
          />
          <h1 className="text-lg font-bold tracking-[0.02em] text-gray-900">
            {t('onboarding.welcome')}
          </h1>
          <p className="mt-1.5 text-sm text-gray-600">{segSubtitle}</p>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-[0_10px_30px_-14px_rgba(15,118,110,0.4)] animate-slide-up stagger-2">
          <LoginTabs />
        </div>

        <p className="text-center mt-4 animate-fade-in stagger-3">
          <span className="inline-block rounded-full bg-forest-50 text-forest-800 text-xs font-medium px-3.5 py-1.5">
            {t('onboarding.trust')}
          </span>
        </p>
      </div>
    </div>
  );
};

export default OnboardingPage;
