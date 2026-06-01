import React, { useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import MonitoringProductView from './monitoring/MonitoringProductView';
import MonitoringFunnelView from './monitoring/MonitoringFunnelView';
import { ProductSummaryView } from './monitoring/MonitoringSummaryView';
import AdminBacklogView from './AdminBacklogView';

type Section = 'overview' | 'funnel' | 'metrics' | 'backlog' | 'vpm';

const AdminProductManagementView: React.FC = () => {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('overview');

  const SECTIONS: Array<{ id: Section; label: string; ready: boolean }> = [
    { id: 'overview', label: t('admin.product.tabs.overview'), ready: true  },
    { id: 'funnel',   label: t('admin.product.tabs.funnel'),   ready: true  },
    { id: 'metrics',  label: t('admin.product.tabs.metrics'),  ready: true  },
    { id: 'backlog',  label: t('admin.product.tabs.backlog'),  ready: true  },
    { id: 'vpm',      label: t('admin.product.tabs.vpm'),      ready: false },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex gap-1 px-4 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={clsx(
                'flex-shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
                section === s.id
                  ? 'border-forest-600 text-forest-600'
                  : 'border-transparent text-gray-500 hover:text-forest-600 hover:border-gray-300',
              )}
            >
              {s.label}
              {!s.ready && (
                <span className="text-[10px] uppercase tracking-wider text-gray-400 border border-gray-300 rounded px-1">
                  {t('admin.product.coming_soon')}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {section === 'overview' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <ProductSummaryView />
        </div>
      )}
      {section === 'funnel' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <MonitoringFunnelView />
        </div>
      )}
      {section === 'metrics' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <MonitoringProductView />
        </div>
      )}
      {section === 'backlog' && (
        <div className="flex-1 overflow-hidden">
          <AdminBacklogView />
        </div>
      )}
      {section === 'vpm' && <VpmPlaceholder />}
    </div>
  );
};

const VpmPlaceholder: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="inline-flex w-14 h-14 rounded-full bg-forest-50 items-center justify-center mb-4">
          <Sparkles className="w-7 h-7 text-forest-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('admin.product.vpm_title')}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          {t('admin.product.vpm_placeholder')}
        </p>
      </div>
    </div>
  );
};

export default AdminProductManagementView;
