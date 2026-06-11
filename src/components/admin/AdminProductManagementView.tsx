import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import MonitoringProductView from './monitoring/MonitoringProductView';
import MonitoringFunnelView from './monitoring/MonitoringFunnelView';
import MonitoringAttributionView from './monitoring/MonitoringAttributionView';
import { ProductSummaryView } from './monitoring/MonitoringSummaryView';
import AdminBacklogView from './AdminBacklogView';
import VpmView from './VpmView';
import VmmView from './VmmView';

type Section = 'overview' | 'funnel' | 'metrics' | 'backlog' | 'vpm' | 'vmm';

const SUB_SECTIONS: Section[] = ['overview', 'funnel', 'metrics', 'backlog', 'vpm', 'vmm'];

const AdminProductManagementView: React.FC = () => {
  const { t } = useTranslation();
  const [params, setSearchParams] = useSearchParams();
  // Под-раздел тоже в URL (?sub=funnel) — переживает F5 и back/forward,
  // как и верхний ?tab (задача 748eb4b0).
  const rawSub = params.get('sub') || '';
  const initialSection: Section = (SUB_SECTIONS as string[]).includes(rawSub) ? (rawSub as Section) : 'overview';
  const [section, setSection] = useState<Section>(initialSection);

  const selectSection = (id: Section) => {
    setSection(id);
    const next = new URLSearchParams(params);
    next.set('sub', id);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if ((SUB_SECTIONS as string[]).includes(rawSub) && rawSub !== section) {
      setSection(rawSub as Section);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSub]);

  const SECTIONS: Array<{ id: Section; label: string; ready: boolean }> = [
    { id: 'overview', label: t('admin.product.tabs.overview'), ready: true  },
    { id: 'funnel',   label: t('admin.product.tabs.funnel'),   ready: true  },
    { id: 'metrics',  label: t('admin.product.tabs.metrics'),  ready: true  },
    { id: 'backlog',  label: t('admin.product.tabs.backlog'),  ready: true  },
    { id: 'vpm',      label: t('admin.product.tabs.vpm'),      ready: true  },
    { id: 'vmm',      label: t('admin.product.tabs.vmm'),      ready: true  },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex gap-1 px-4 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSection(s.id)}
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
          <MonitoringAttributionView />
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
      {section === 'vpm' && (
        <div className="flex-1 overflow-hidden">
          <VpmView />
        </div>
      )}
      {section === 'vmm' && (
        <div className="flex-1 overflow-hidden">
          <VmmView />
        </div>
      )}
    </div>
  );
};

export default AdminProductManagementView;
