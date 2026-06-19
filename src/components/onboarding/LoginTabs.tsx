import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Mail } from 'lucide-react';
import SmsLoginPane from './SmsLoginPane';
import EmailLoginPane from './EmailLoginPane';
import OAuthButton from './OAuthButton';
import LoginConsentBlock from './LoginConsentBlock';

type TabKey = 'sms' | 'email';

// DEV-6: вход без телефона (Яндекс/Google) — равноправный и более заметный.
// Данные показали: холодные пользователи упираются в телефон-стену (0 начали
// ввод телефона). Поэтому one-tap входы (без телефона) вынесены наверх и видны
// сразу, а SMS/email — вторичным блоком ниже. Все способы доступны.
const LoginTabs: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = localStorage.getItem('lastLoginTab');
    return saved === 'email' ? 'email' : 'sms';
  });
  useEffect(() => { localStorage.setItem('lastLoginTab', tab); }, [tab]);

  const [consentGiven, setConsentGiven] = useState<boolean>(() => {
    return localStorage.getItem('loginConsent') === 'true';
  });
  useEffect(() => {
    localStorage.setItem('loginConsent', consentGiven ? 'true' : 'false');
  }, [consentGiven]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'sms',    label: t('auth.tabs.sms', 'По телефону'), icon: <Smartphone className="w-4 h-4" /> },
    { key: 'email',  label: t('auth.tabs.email', 'Email'),     icon: <Mail className="w-4 h-4" /> },
  ];

  return (
    <div className="w-full max-w-md mx-auto">
      <LoginConsentBlock checked={consentGiven} onChange={setConsentGiven} />

      <div
        className={consentGiven ? '' : 'opacity-40 pointer-events-none select-none'}
        aria-disabled={!consentGiven}
      >
        {/* Быстрый вход без телефона — самые заметные */}
        <div className="space-y-2.5">
          <OAuthButton provider="yandex" />
          <OAuthButton provider="google" />
        </div>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-400 whitespace-nowrap">{t('auth.orPhoneEmail', 'или по телефону / email')}</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* SMS / Email — вторичные способы */}
        <div className="flex border-b border-gray-200 mb-4">
          {tabs.map(tabDef => (
            <button
              key={tabDef.key}
              onClick={() => setTab(tabDef.key)}
              className={`flex-1 px-3 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                tab === tabDef.key
                  ? 'border-forest-600 text-forest-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tabDef.icon}
              {tabDef.label}
            </button>
          ))}
        </div>

        {tab === 'sms'   && <SmsLoginPane />}
        {tab === 'email' && <EmailLoginPane />}
      </div>

      {!consentGiven && (
        <p className="text-xs text-gray-500 text-center mt-3">
          {t('auth.consent.needToAccept', 'Сначала примите условия выше')}
        </p>
      )}
    </div>
  );
};

export default LoginTabs;
