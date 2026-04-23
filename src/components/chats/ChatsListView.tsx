import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Inbox } from 'lucide-react';
import { clsx } from 'clsx';
import { usePeerInbox, ChatRequest } from '../peer/usePeer';
import { RequestsPanel, ConversationsList } from '../peer/PeerInboxPanels';
import UserProfileModal from '../search/UserProfileModal';

type Tab = 'chats' | 'requests';

const ChatsListView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialTab = params.get('tab') === 'requests' ? 'requests' : 'chats';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [modalUser, setModalUser] = useState<any>(null);

  const { incoming, outgoing, conversations, loading, accept, decline, withdraw } = usePeerInbox();

  const unreadChats = useMemo(
    () => conversations.reduce((n, c) => n + (c.unreadCount || 0), 0),
    [conversations],
  );

  const onTab = (next: Tab) => {
    setTab(next);
    const p = new URLSearchParams(params);
    if (next === 'requests') p.set('tab', 'requests');
    else p.delete('tab');
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

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-forest-600" />
          <h1 className="text-base font-semibold text-gray-900">
            {t('peer.pageTitle', 'Чаты')}
          </h1>
        </div>
      </div>

      <div className="flex border-b border-gray-100 flex-shrink-0 bg-white px-4">
        <button
          type="button"
          onClick={() => onTab('chats')}
          className={clsx(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
            tab === 'chats'
              ? 'border-forest-600 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <MessageCircle className="w-4 h-4" />
          {t('peer.tabs.chats', 'Чаты')}
          {unreadChats > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full leading-none">
              {unreadChats}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onTab('requests')}
          className={clsx(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
            tab === 'requests'
              ? 'border-forest-600 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <Inbox className="w-4 h-4" />
          {t('peer.tabs.requests', 'Запросы')}
          {incoming.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full leading-none">
              {incoming.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'chats' && (
          <ConversationsList
            loading={loading}
            items={conversations}
            onOpen={(id) => navigate(`/chats/${id}`)}
            t={t as any}
          />
        )}
        {tab === 'requests' && (
          <RequestsPanel
            loading={loading}
            incoming={incoming}
            outgoing={outgoing}
            onAccept={handleAccept}
            onDecline={(r) => decline(r.id)}
            onWithdraw={(r) => withdraw(r.id)}
            onViewProfile={handleViewProfile}
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

export default ChatsListView;
