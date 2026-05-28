import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Mail } from 'lucide-react';

type TabKey = 'sms' | 'email' | 'google' | 'yandex';

const LoginTabs: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>(() => {
    const saved = localStorage.getItem('lastLoginTab') as TabKey | null;
    return saved && ['sms','email','google','yandex'].includes(saved) ? saved : 'sms';
  });
  useEffect(() => { localStorage.setItem('lastLoginTab', tab); }, [tab]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'sms',    label: t('auth.tabs.sms', 'SMS'),       icon: <Smartphone className="w-4 h-4" /> },
    { key: 'email',  label: t('auth.tabs.email', 'Email'),   icon: <Mail className="w-4 h-4" /> },
    { key: 'google', label: t('auth.tabs.google', 'Google'), icon: <span className="w-4 h-4 inline-block text-center font-bold">G</span> },
    { key: 'yandex', label: t('auth.tabs.yandex', 'Yandex'), icon: <span className="w-4 h-4 inline-block text-center font-bold">Я</span> },
  ];

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex border-b border-gray-200 mb-6">
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

      <div>
        {tab === 'sms'    && <div className="text-sm text-gray-400 text-center py-8">SMS pane TBD (Task 17)</div>}
        {tab === 'email'  && <div className="text-sm text-gray-400 text-center py-8">Email pane TBD (Task 18)</div>}
        {tab === 'google' && <div className="text-sm text-gray-400 text-center py-8">Google pane TBD (Task 19)</div>}
        {tab === 'yandex' && <div className="text-sm text-gray-400 text-center py-8">Yandex pane TBD (Task 19)</div>}
      </div>
    </div>
  );
};

export default LoginTabs;
