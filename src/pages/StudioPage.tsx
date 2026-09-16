import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Bot, Send, Server } from 'lucide-react';
import { CustomAgentsListView } from '../components/custom-agents/CustomAgentsListView';
import { TgBotsListView } from '../components/tg-bot/TgBotsListView';
import { ProductsSection } from '../components/products/ProductsSection';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'agents' | 'bots' | 'products';

const StudioPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  // Продукты заводит пока только владелец. Вкладка скрыта не косметически:
  // разбор параметра тоже её не принимает, иначе /studio?tab=products открыл
  // бы раздел любому, кто подставит адрес руками.
  const canProducts = !!user?.isAdmin;
  const raw = params.get('tab');
  const tab: Tab =
    raw === 'bots' ? 'bots' : raw === 'products' && canProducts ? 'products' : 'agents';

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'agents') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  const tabs = [
    ['agents', t('studio.tabs.agents'), Bot],
    ['bots', t('studio.tabs.bots'), Send],
    ...(canProducts ? [['products', t('studio.tabs.products'), Server] as const] : []),
  ] as const;

  const subtitle =
    tab === 'agents'
      ? t('pages.studio.agents_subtitle')
      : tab === 'bots'
        ? t('pages.studio.bots_subtitle')
        : t('products.subtitle');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('studio.title')}</h1>
        <p className="text-sm text-gray-500 mb-4">{subtitle}</p>

        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map(([k, label, Icon]) => (
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

      {tab === 'agents' && <CustomAgentsListView embedded />}
      {tab === 'bots' && <TgBotsListView embedded />}
      {tab === 'products' && <ProductsSection embedded />}
    </div>
  );
};

export default StudioPage;
