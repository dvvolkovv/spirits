import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Users, Wallet, User } from 'lucide-react';
import { DayScreen } from './screens/DayScreen';
import { AssistantsScreen } from './screens/AssistantsScreen';
import { WalletScreen } from './screens/WalletScreen';
import { ProfileScreen } from './screens/ProfileScreen';

type Tab = 'day' | 'assistants' | 'wallet' | 'profile';

const TABS: Array<{ id: Tab; icon: typeof CalendarDays }> = [
  { id: 'day', icon: CalendarDays },
  { id: 'assistants', icon: Users },
  { id: 'wallet', icon: Wallet },
  { id: 'profile', icon: User },
];

export function App() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('day');

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 overflow-y-auto pb-20">
        {tab === 'day' && <DayScreen />}
        {tab === 'assistants' && <AssistantsScreen />}
        {tab === 'wallet' && <WalletScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex border-t bg-[var(--tg-bg-color,#fff)] pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
              tab === id ? 'text-green-600' : 'opacity-60'
            }`}
            onClick={() => setTab(id)}
          >
            <Icon size={20} />
            {t(`tma.nav.${id}`)}
          </button>
        ))}
      </nav>
    </div>
  );
}
