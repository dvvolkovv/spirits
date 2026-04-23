import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Heart, Inbox, MessageCircle } from 'lucide-react';
import { clsx } from 'clsx';
import SearchInterface from '../components/search/SearchInterface';
import CompatibilityInterface from '../components/search/CompatibilityInterface';
import UserProfileModal from '../components/search/UserProfileModal';
import { usePeerInbox, ChatRequest } from '../components/peer/usePeer';
import { RequestsPanel, ConversationsList } from '../components/peer/PeerInboxPanels';

type Tab = 'search' | 'compatibility' | 'requests' | 'chats';

const NetworkingPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const urlTab = params.get('tab');
  const initialTab: Tab = (['search','compatibility','requests','chats'] as Tab[])
    .includes(urlTab as Tab) ? (urlTab as Tab) : 'search';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [modalUser, setModalUser] = useState<any>(null);

  const { incoming, outgoing, conversations, loading, accept, decline, withdraw } = usePeerInbox();

  const incomingCount = incoming.length;
  const unreadChats = useMemo(
    () => conversations.reduce((n, c) => n + (c.unreadCount || 0), 0),
    [conversations],
  );

  const selectTab = (next: Tab) => {
    setActiveTab(next);
    const p = new URLSearchParams(params);
    if (next === 'search') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  const handleAccept = async (r: ChatRequest) => {
    const convId = await accept(r.id);
    if (convId) navigate(`/chats/${convId}`);
  };

  const handleViewProfile = (r: ChatRequest) => {
    setModalUser({
      id: r.peerUserId,
      name: r.peerName,
      avatar: r.peerAvatar ?? undefined,
      values: [],
      intents: [],
      corellation: 0,
      phone: r.peerUserId,
    });
  };

  const handleCompatibility = (r: ChatRequest) => {
    const p = new URLSearchParams(params);
    p.set('tab', 'compatibility');
    p.set('user', r.peerUserId);
    setParams(p, { replace: false });
    setActiveTab('compatibility');
  };

  const tabBtn = (key: Tab, icon: React.ReactNode, label: string, badge?: number) => (
    <button
      onClick={() => selectTab(key)}
      className={clsx(
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
        activeTab === key
          ? 'border-forest-600 text-forest-600'
          : 'border-transparent text-gray-500 hover:text-gray-700',
      )}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 bg-white px-4 pt-2 overflow-x-auto">
        {tabBtn('search', <Search className="w-4 h-4" />, t('peer.nav.searchPeople', 'Поиск людей'))}
        {tabBtn('compatibility', <Heart className="w-4 h-4" />, t('peer.nav.compatibility', 'Совместимость'))}
        {tabBtn('requests', <Inbox className="w-4 h-4" />, t('peer.tabs.requests', 'Запросы'), incomingCount)}
        {tabBtn('chats', <MessageCircle className="w-4 h-4" />, t('peer.tabs.chats', 'Чаты'), unreadChats)}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'search' && <SearchInterface />}
        {activeTab === 'compatibility' && <CompatibilityInterface />}
        {activeTab === 'requests' && (
          <RequestsPanel
            loading={loading}
            incoming={incoming}
            outgoing={outgoing}
            onAccept={handleAccept}
            onDecline={(r) => decline(r.id)}
            onWithdraw={(r) => withdraw(r.id)}
            onViewProfile={handleViewProfile}
            onCompatibility={handleCompatibility}
            t={t as any}
          />
        )}
        {activeTab === 'chats' && (
          <ConversationsList
            loading={loading}
            items={conversations}
            onOpen={(id) => navigate(`/chats/${id}`)}
            t={t as any}
          />
        )}
      </div>

      {modalUser && (
        <UserProfileModal
          user={modalUser}
          isOpen={true}
          onClose={() => setModalUser(null)}
        />
      )}
    </div>
  );
};

export default NetworkingPage;
