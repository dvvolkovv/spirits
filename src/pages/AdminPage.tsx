import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import AdminAssistantsView from '../components/admin/AdminAssistantsView';
import AdminCouponsView from '../components/admin/AdminCouponsView';
import AdminReferralsView from '../components/admin/AdminReferralsView';
import AdminSupportView from '../components/admin/AdminSupportView';
import AdminPaymentsView from '../components/admin/AdminPaymentsView';
import AdminTokensView from '../components/admin/AdminTokensView';
import AdminUsageView from '../components/admin/AdminUsageView';
import AdminUsersView from '../components/admin/AdminUsersView';
import AdminMonitoringView from '../components/admin/AdminMonitoringView';
import AdminBacklogView from '../components/admin/AdminBacklogView';

type AdminTab = 'support' | 'users' | 'payments' | 'tokens' | 'usage' | 'assistants' | 'coupons' | 'referrals' | 'monitoring' | 'backlog';

const AdminPage: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const initialTab = (['support', 'users', 'payments', 'tokens', 'usage', 'assistants', 'coupons', 'referrals', 'monitoring', 'backlog'] as AdminTab[])
    .includes(params.get('tab') as AdminTab)
    ? (params.get('tab') as AdminTab)
    : 'support';
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>(`[data-testid="admin-tab-${activeTab}"]`);
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

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
    { id: 'users', label: t('admin.tabs.users') },
    { id: 'payments', label: t('admin.tabs.payments') },
    { id: 'tokens', label: t('admin.tabs.tokens') },
    { id: 'usage', label: t('admin.tabs.usage') },
    { id: 'assistants', label: t('admin.tabs.assistants') },
    { id: 'coupons', label: t('admin.tabs.coupons') },
    { id: 'referrals', label: t('admin.tabs.referrals') },
    { id: 'monitoring', label: t('admin.tabs.monitoring') },
    { id: 'backlog', label: t('admin.tabs.backlog') },
  ];

  return (
    <div data-testid="admin-root" className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div
          ref={tabsContainerRef}
          className="flex space-x-1 px-4 overflow-x-auto scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-testid={`admin-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex-shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors',
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
        {activeTab === 'users' && <AdminUsersView />}
        {activeTab === 'payments' && <AdminPaymentsView />}
        {activeTab === 'tokens' && <AdminTokensView />}
        {activeTab === 'usage' && <AdminUsageView />}
        {activeTab === 'assistants' && <AdminAssistantsView />}
        {activeTab === 'coupons' && <AdminCouponsView />}
        {activeTab === 'referrals' && <AdminReferralsView />}
        {activeTab === 'monitoring' && <AdminMonitoringView />}
        {activeTab === 'backlog' && <AdminBacklogView />}
      </div>
    </div>
  );
};

export default AdminPage;
