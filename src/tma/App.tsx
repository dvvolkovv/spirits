import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Users, Search, Wallet, User } from 'lucide-react';
import { DayScreen } from './screens/DayScreen';
import { AssistantsScreen } from './screens/AssistantsScreen';
import { SearchScreen } from './screens/SearchScreen';
import { WalletScreen } from './screens/WalletScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { BottomNav, type NavTab } from '../shared/ui/BottomNav';
import { ProductActionCard } from '../components/products/ProductActionCard';
import { actionFromLocation } from './productAction';
import { closeApp } from './telegram';

type Tab = 'day' | 'assistants' | 'search' | 'wallet' | 'profile';

const ICONS = { day: CalendarDays, assistants: Users, search: Search, wallet: Wallet, profile: User } as const;
// Поиск — между ассистентами и кошельком: это работа с людьми, а не с
// деньгами, и рядом с ассистентами читается как продолжение той же темы.
const ORDER: Tab[] = ['day', 'assistants', 'search', 'wallet', 'profile'];

export function App() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('day');
  // Карточка ключей бота по ссылке из Telegram: кнопка создания бота открывает
  // мини-приложение адресом `?pa=<id>` (с `#pa=<id>` запасным путём) — вместо
  // вкладок показывается только карточка. App монтируется из main.tsx только
  // после успешного входа (Root показывает её лишь в состоянии
  // 'authenticated'), поэтому к моменту этого рендера JWT уже в localStorage
  // и apiClient внутри ProductActionCard авторизован.
  const [actionId, setActionId] = useState<string | null>(() => actionFromLocation(window.location.search, window.location.hash));
  if (actionId) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <ProductActionCard
          actionId={actionId}
          via="tma"
          onClose={() => {
            setActionId(null);
            closeApp();
          }}
        />
      </div>
    );
  }

  const tabs: Array<NavTab<Tab>> = ORDER.map((id) => ({
    id,
    icon: ICONS[id],
    label: t(`tma.nav.${id}`),
  }));

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex-1 overflow-y-auto pb-20">
        {tab === 'day' && <DayScreen />}
        {tab === 'assistants' && <AssistantsScreen />}
        {tab === 'search' && <SearchScreen />}
        {tab === 'wallet' && <WalletScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </main>

      <BottomNav tabs={tabs} active={tab} onSelect={setTab} />
    </div>
  );
}
