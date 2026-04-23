import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import AdminAssistantsView from '../components/admin/AdminAssistantsView';
import AdminCouponsView from '../components/admin/AdminCouponsView';
import AdminReferralsView from '../components/admin/AdminReferralsView';
import AdminSupportView from '../components/admin/AdminSupportView';

type AdminTab = 'support' | 'assistants' | 'coupons' | 'referrals';

const AdminPage: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const initialTab = (['support', 'assistants', 'coupons', 'referrals'] as AdminTab[])
    .includes(params.get('tab') as AdminTab)
    ? (params.get('tab') as AdminTab)
    : 'support';
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-forest-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return <Navigate to="/chat" replace />;
  }

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'support', label: t('admin.tabs.support') },
    { id: 'assistants', label: t('admin.tabs.assistants') },
    { id: 'coupons', label: t('admin.tabs.coupons') },
    { id: 'referrals', label: t('admin.tabs.referrals') },
  ];

  return (
    <div data-testid="admin-root" className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 flex-shrink-0">
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-testid={`admin-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-forest-600 text-forest-600'
                  : 'border-transparent text-gray-600 hover:text-forest-600 hover:border-gray-300'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'support' && <AdminSupportView />}
        {activeTab === 'assistants' && <AdminAssistantsView />}
        {activeTab === 'coupons' && <AdminCouponsView />}
        {activeTab === 'referrals' && <AdminReferralsView />}
      </div>
    </div>
  );
};

export default AdminPage;
