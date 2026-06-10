import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Bot, Send } from 'lucide-react';
import { CustomAgentsListView } from '../components/custom-agents/CustomAgentsListView';
import { TgBotsListView } from '../components/tg-bot/TgBotsListView';

type Tab = 'agents' | 'bots';

const StudioPage: React.FC = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'bots' ? 'bots' : 'agents';

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'agents') p.delete('tab'); else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('studio.title')}</h1>
        <p className="text-sm text-gray-500 mb-4">
          {tab === 'agents'
            ? 'Личные AI-ассистенты — доступны в /chat'
            : 'Telegram-боты для твоих групп'}
        </p>

        <div className="flex gap-1 border-b border-gray-200">
          {([
            ['agents', t('studio.tabs.agents'), Bot],
            ['bots', t('studio.tabs.bots'), Send],
          ] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                tab === k
                  ? 'border-forest-600 text-forest-700'
                  : 'border-transparent text-gray-500 hover:text-forest-600'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'agents' ? <CustomAgentsListView embedded /> : <TgBotsListView embedded />}
    </div>
  );
};

export default StudioPage;
