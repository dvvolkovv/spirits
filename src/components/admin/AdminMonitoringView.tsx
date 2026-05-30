import React, { useState } from 'react';
import { clsx } from 'clsx';
import MonitoringInfraView from './monitoring/MonitoringInfraView';
import MonitoringFunnelView from './monitoring/MonitoringFunnelView';
import MonitoringProductView from './monitoring/MonitoringProductView';
import MonitoringLogsView from './monitoring/MonitoringLogsView';
import MonitoringStubView from './monitoring/MonitoringStubView';

type Section = 'overview' | 'infra' | 'funnel' | 'product' | 'logs';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'overview', label: 'Сводка' },
  { id: 'infra',    label: 'Инфра' },
  { id: 'funnel',   label: 'Воронка' },
  { id: 'product',  label: 'Продукт' },
  { id: 'logs',     label: 'Логи' },
];

const AdminMonitoringView: React.FC = () => {
  const [section, setSection] = useState<Section>('funnel');

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tab bar */}
      <div className="border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex gap-1 px-4 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={clsx(
                'flex-shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                section === s.id
                  ? 'border-forest-600 text-forest-600'
                  : 'border-transparent text-gray-500 hover:text-forest-600 hover:border-gray-300',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {section === 'overview' && (
          <MonitoringStubView
            title="Сводка"
            description="Топ-10 индикаторов здоровья продукта (Profile Depth Score, Request Accept rate, TTV, AI-share поддержки, Margin, два вороночных, два churn, Feature health). В разработке."
          />
        )}
        {section === 'infra' && <MonitoringInfraView />}
        {section === 'funnel' && <MonitoringFunnelView />}
        {section === 'product' && <MonitoringProductView />}
        {section === 'logs' && <MonitoringLogsView />}
      </div>
    </div>
  );
};

export default AdminMonitoringView;
