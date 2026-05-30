import React, { useState } from 'react';
import { clsx } from 'clsx';
import MonitoringEconomyView from './MonitoringEconomyView';
import MonitoringQualityView from './MonitoringQualityView';
import MonitoringProfileView from './MonitoringProfileView';
import MonitoringNetworkingView from './MonitoringNetworkingView';
import MonitoringChurnView from './MonitoringChurnView';
import MonitoringSupportView from './MonitoringSupportView';
import MonitoringContentView from './MonitoringContentView';
import MonitoringStubView from './MonitoringStubView';

type Sub = 'economy' | 'quality' | 'profile' | 'networking' | 'support' | 'content' | 'churn' | 'personas';

const SUBS: Array<{ id: Sub; label: string; ready: boolean }> = [
  { id: 'economy',    label: 'Экономика',  ready: true  },
  { id: 'quality',    label: 'Качество',   ready: true  },
  { id: 'profile',    label: 'Профиль',    ready: true  },
  { id: 'networking', label: 'Нетворкинг', ready: true  },
  { id: 'support',    label: 'Поддержка',  ready: true  },
  { id: 'content',    label: 'Контент',    ready: true  },
  { id: 'churn',      label: 'Churn',      ready: true  },
  { id: 'personas',   label: 'Персоны',    ready: false },
];

const MonitoringProductView: React.FC = () => {
  const [sub, setSub] = useState<Sub>('economy');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-md p-0.5 w-fit">
        {SUBS.map((s) => (
          <button key={s.id} onClick={() => setSub(s.id)}
            className={clsx('px-3 py-1.5 text-sm rounded transition-colors flex items-center gap-1.5',
              sub === s.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900',
              !s.ready && 'opacity-60')}>
            {s.label}
            {!s.ready && <span className="text-[9px] text-gray-400 border border-gray-300 rounded px-1">скоро</span>}
          </button>
        ))}
      </div>

      {sub === 'economy' && <MonitoringEconomyView />}
      {sub === 'quality' && <MonitoringQualityView />}
      {sub === 'profile' && <MonitoringProfileView />}
      {sub === 'networking' && <MonitoringNetworkingView />}
      {sub === 'support'    && <MonitoringSupportView />}
      {sub === 'content'    && <MonitoringContentView />}
      {sub === 'churn'      && <MonitoringChurnView />}
      {sub === 'personas'   && <MonitoringStubView title="Персоны"    description="Кластеры пользователей по top-ассистентам, интентам, профилю. Пересчёт ежемесячно. В разработке." />}
    </div>
  );
};

export default MonitoringProductView;
