import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { clsx } from 'clsx';
import AdminAssistantsView from '../components/admin/AdminAssistantsView';
import AdminCouponsView from '../components/admin/AdminCouponsView';

type AdminTab = 'assistants' | 'coupons';

const AdminPage: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('assistants');

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
    { id: 'assistants', label: 'Ассистенты' },
    { id: 'coupons', label: 'Купоны' },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 flex-shrink-0">
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
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
        {activeTab === 'assistants' ? <AdminAssistantsView /> : <AdminCouponsView />}
      </div>
    </div>
  );
};

export default AdminPage;
