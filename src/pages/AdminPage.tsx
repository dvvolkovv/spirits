import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useSpaNavigationGuard } from '../hooks/useSpaNavigationGuard';
import AdminAssistantsView from '../components/admin/AdminAssistantsView';
import AdminCouponsView from '../components/admin/AdminCouponsView';
import AdminReferralsView from '../components/admin/AdminReferralsView';
import AdminSupportView from '../components/admin/AdminSupportView';
import AdminPaymentsView from '../components/admin/AdminPaymentsView';
import AdminTokensView from '../components/admin/AdminTokensView';
import AdminUsageView from '../components/admin/AdminUsageView';
import AdminCallsView from '../components/admin/AdminCallsView';
import AdminUsersView from '../components/admin/AdminUsersView';
import AdminProductsView from '../components/admin/AdminProductsView';
import AdminMonitoringView from '../components/admin/AdminMonitoringView';
import AdminProductManagementView from '../components/admin/AdminProductManagementView';
import AdminRetentionView from '../components/admin/AdminRetentionView';
import AdminActivationView from '../components/admin/AdminActivationView';
import AdminIntegrationsView from '../components/admin/AdminIntegrationsView';
import AdminBlogView from '../components/admin/AdminBlogView';
import GlobalLlmBanner from '../components/admin/GlobalLlmBanner';

type AdminTab = 'support' | 'users' | 'products' | 'payments' | 'tokens' | 'usage' | 'calls' | 'assistants' | 'coupons' | 'referrals' | 'retention' | 'activation' | 'monitoring' | 'product' | 'integrations' | 'blog';
type AdminGroupId = 'work' | 'money' | 'catalog' | 'growth' | 'system';

const GROUP_TABS: Record<AdminGroupId, AdminTab[]> = {
  work: ['support', 'users', 'calls'],
  money: ['payments', 'tokens', 'coupons', 'referrals'],
  catalog: ['products', 'assistants', 'blog'],
  growth: ['usage', 'retention', 'activation', 'product'],
  system: ['monitoring', 'integrations'],
};

// `?tab=backlog` used to point at a standalone Бэклог tab.
// We folded backlog into Управление продуктом — keep the URL working.
const TAB_ALIASES: Record<string, AdminTab> = {
  // Жалобы переехали внутрь поддержки; старые ссылки должны продолжать работать.
  reports: 'support',
  backlog: 'product',
};

const AdminPage: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [params, setSearchParams] = useSearchParams();
  const KNOWN_TABS: AdminTab[] = ['support', 'users', 'products', 'payments', 'tokens', 'usage', 'calls', 'assistants', 'coupons', 'referrals', 'retention', 'activation', 'monitoring', 'product', 'integrations', 'blog'];
  const rawTab = params.get('tab') || '';
  const aliasResolved = TAB_ALIASES[rawTab] ?? (rawTab as AdminTab);
  const initialTab: AdminTab = KNOWN_TABS.includes(aliasResolved) ? aliasResolved : 'support';
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [assistantsDirty, setAssistantsDirty] = useState(false);
  const [openGroup, setOpenGroup] = useState<AdminGroupId | null>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  useSpaNavigationGuard(
    activeTab === 'assistants' && assistantsDirty,
    'Есть несохранённые изменения. Покинуть раздел и потерять их?',
  );
  useEffect(() => {
    if (activeTab !== 'assistants') setAssistantsDirty(false);
  }, [activeTab]);

  // Переключение раздела пишет ?tab=<id> в URL → раздел переживает F5 и
  // ложится в историю браузера (back/forward). replace, чтобы каждый клик не
  // плодил запись в истории (задача 748eb4b0).
  const selectTab = (id: AdminTab) => {
    setOpenGroup(null);
    if (id === activeTab) return;
    if (!(activeTab === 'assistants' && assistantsDirty)) {
      setActiveTab(id);
    }
    const next = new URLSearchParams(params);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  // Синхронизация в обратную сторону: навигация браузера (back/forward) меняет
  // ?tab — подхватываем активный раздел из URL.
  useEffect(() => {
    if (KNOWN_TABS.includes(aliasResolved) && aliasResolved !== activeTab) {
      setActiveTab(aliasResolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab]);

  useEffect(() => {
    if (!openGroup) return;
    const closeOutside = (event: MouseEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) setOpenGroup(null);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroup(null);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [openGroup]);

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
    // «Сайты и боты» — продукты пользователей. Не путать с 'product' ниже:
    // там «Управление продуктом», аналитика самого Linkeon.
    { id: 'products', label: t('admin.tabs.products') },
    { id: 'payments', label: t('admin.tabs.payments') },
    { id: 'tokens', label: t('admin.tabs.tokens') },
    { id: 'usage', label: t('admin.tabs.usage') },
    { id: 'calls', label: t('admin.tabs.calls') },
    { id: 'assistants', label: t('admin.tabs.assistants') },
    { id: 'coupons', label: t('admin.tabs.coupons') },
    { id: 'referrals', label: t('admin.tabs.referrals') },
    { id: 'retention', label: t('admin.tabs.retention') },
    { id: 'activation', label: t('admin.tabs.activation') },
    { id: 'monitoring', label: t('admin.tabs.monitoring') },
    { id: 'product', label: t('admin.tabs.product') },
    { id: 'integrations', label: t('admin.tabs.integrations') },
    { id: 'blog', label: t('admin.tabs.blog') },
  ];

  const groups = (Object.keys(GROUP_TABS) as AdminGroupId[]).map((id) => ({
    id,
    label: t(`admin.groups.${id}`),
    tabs: GROUP_TABS[id].map((tabId) => tabs.find((tab) => tab.id === tabId)!),
  }));

  return (
    <div data-testid="admin-root" className="h-screen flex flex-col bg-gray-50">
      <div ref={navigationRef} className="relative z-30 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="md:hidden px-3 py-2.5">
          <label htmlFor="admin-section-select" className="sr-only">{t('admin.section_label')}</label>
          <select
            id="admin-section-select"
            data-testid="admin-section-select"
            value={activeTab}
            onChange={(event) => selectTab(event.target.value as AdminTab)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-100"
          >
            {groups.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="hidden md:flex px-3 py-2 gap-1">
          {groups.map((group) => {
            const active = group.tabs.some((tab) => tab.id === activeTab);
            return (
              <div key={group.id} className="relative">
                <button
                  type="button"
                  data-testid={`admin-group-${group.id}`}
                  aria-expanded={openGroup === group.id}
                  onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-forest-50 text-forest-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  {group.label}
                  <ChevronDown className={clsx('w-4 h-4 transition-transform', openGroup === group.id && 'rotate-180')} />
                </button>
                <div className={clsx(
                  'absolute left-0 top-full mt-1 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg',
                  openGroup === group.id ? 'block' : 'hidden',
                )}>
                  {group.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`admin-tab-${tab.id}`}
                      onClick={() => selectTab(tab.id)}
                      className={clsx(
                        'w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors',
                        activeTab === tab.id
                          ? 'border-forest-600 bg-forest-50 text-forest-700 font-medium'
                          : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <GlobalLlmBanner activeTab={activeTab} hideOpen={activeTab === 'assistants'} onOpen={() => selectTab('assistants')} />
      <div className="flex-1 overflow-hidden">
        {activeTab === 'support' && <AdminSupportView />}
        {activeTab === 'users' && <AdminUsersView />}
        {activeTab === 'products' && <AdminProductsView />}
        {activeTab === 'payments' && <AdminPaymentsView />}
        {activeTab === 'tokens' && <AdminTokensView />}
        {activeTab === 'usage' && <AdminUsageView />}
        {activeTab === 'calls' && <AdminCallsView />}
        {activeTab === 'assistants' && (
          <AdminAssistantsView
            editorDirty={assistantsDirty}
            onEditorDirtyChange={setAssistantsDirty}
          />
        )}
        {activeTab === 'coupons' && <AdminCouponsView />}
        {activeTab === 'referrals' && <AdminReferralsView />}
        {activeTab === 'retention' && <AdminRetentionView />}
        {activeTab === 'activation' && <AdminActivationView />}
        {activeTab === 'monitoring' && <AdminMonitoringView />}
        {activeTab === 'product' && <AdminProductManagementView />}
        {activeTab === 'integrations' && <AdminIntegrationsView />}
        {activeTab === 'blog' && <AdminBlogView />}
      </div>
    </div>
  );
};

export default AdminPage;
