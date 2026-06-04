import React, { useState } from 'react';
import { clsx } from 'clsx';
import MonitoringInfraView, { INFRA_TABS, InfraTab } from './monitoring/MonitoringInfraView';
import MonitoringLogsView from './monitoring/MonitoringLogsView';
import MonitoringSummaryView from './monitoring/MonitoringSummaryView';

// Продукт и Воронка переехали в Управление продуктом
// (AdminProductManagementView). Мониторинг теперь только техническое здоровье.
// «Инфра» (один длинный скролл из 14 секций) разнесена на несколько вкладок
// второго уровня — по одной теме на вкладку, чтобы контента было меньше:
// Сводка · Хост · Интеграции · Резервы и DR · Задачи · Логи.
type Section = 'overview' | InfraTab | 'logs';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'overview', label: 'Сводка' },
  ...INFRA_TABS,
  { id: 'logs',     label: 'Логи' },
];

const INFRA_TAB_IDS = INFRA_TABS.map((t) => t.id) as Section[];

const AdminMonitoringView: React.FC = () => {
  const [section, setSection] = useState<Section>('overview');

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
        {section === 'overview' && <MonitoringSummaryView />}
        {INFRA_TAB_IDS.includes(section) && <MonitoringInfraView tab={section as InfraTab} />}
        {section === 'logs' && <MonitoringLogsView />}
      </div>
    </div>
  );
};

export default AdminMonitoringView;
