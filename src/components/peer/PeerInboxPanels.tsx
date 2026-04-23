import React from 'react';
import { Inbox, Check, X, Clock, Users, Eye, Heart } from 'lucide-react';
import { ChatRequest, PeerConversation } from './usePeer';

export function avatarInitials(name: string): string {
  return (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

/** /static/… is served by Nginx under the same origin; absolute URLs pass through. */
function resolveAvatarUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

interface AvatarBubbleProps {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md';
  onClick?: () => void;
  title?: string;
}
export const AvatarBubble: React.FC<AvatarBubbleProps> = ({ name, url, size = 'md', onClick, title }) => {
  const px = size === 'sm' ? 'w-10 h-10 text-sm' : 'w-11 h-11 text-sm';
  const resolved = resolveAvatarUrl(url);
  const inner = resolved ? (
    <img src={resolved} alt={name} className="w-full h-full rounded-full object-cover" />
  ) : (
    <span>{avatarInitials(name)}</span>
  );
  const classes = `${px} rounded-full overflow-hidden bg-gradient-to-br from-forest-500 to-warm-500 flex items-center justify-center text-white font-semibold flex-shrink-0`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`${classes} hover:opacity-80 transition-opacity`}
      >
        {inner}
      </button>
    );
  }
  return <div className={classes}>{inner}</div>;
};

export function timeAgo(iso: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('peer.time.now');
  if (mins < 60) return `${mins} ${t('peer.time.min')}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${t('peer.time.hr')}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${t('peer.time.day')}`;
  return new Date(iso).toLocaleDateString('ru-RU');
}

type T = (k: string, fallback?: string) => string;

// -------------------- Conversations list --------------------

export interface ConversationsListProps {
  loading: boolean;
  items: PeerConversation[];
  onOpen: (conversationId: string) => void;
  t: T;
}

export const ConversationsList: React.FC<ConversationsListProps> = ({ loading, items, onOpen, t }) => {
  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="w-8 h-8 border-4 border-forest-300 border-t-forest-600 rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-400">{t('peer.loading', 'Загружаем…')}</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Users className="w-12 h-12 text-gray-200 mb-3" />
        <p className="text-sm text-gray-400">
          {t('peer.emptyChats', 'Пока нет чатов')}
        </p>
        <p className="text-xs text-gray-300 mt-1">
          {t('peer.emptyChatsHint', 'Найдите собеседника на вкладке Нетворкинг')}
        </p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-gray-100 bg-white">
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOpen(c.id)}
          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
        >
          <AvatarBubble name={c.peerName} url={c.peerAvatar} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{c.peerName}</h3>
              {c.lastMessageAt && (
                <span className="text-[11px] text-gray-400 flex-shrink-0">
                  {timeAgo(c.lastMessageAt, t as any)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500 truncate">
                {c.lastMessage?.content ?? t('peer.noMessagesYet', 'Нет сообщений')}
              </p>
              {c.unreadCount > 0 && (
                <span className="bg-forest-600 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[18px] text-center">
                  {c.unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

// -------------------- Requests panel --------------------

export interface RequestsPanelProps {
  loading: boolean;
  incoming: ChatRequest[];
  outgoing: ChatRequest[];
  onAccept: (r: ChatRequest) => void;
  onDecline: (r: ChatRequest) => void;
  onWithdraw: (r: ChatRequest) => void;
  onViewProfile?: (r: ChatRequest) => void;
  onCompatibility?: (r: ChatRequest) => void;
  t: T;
}

export const RequestsPanel: React.FC<RequestsPanelProps> = ({
  loading, incoming, outgoing, onAccept, onDecline, onWithdraw, onViewProfile, onCompatibility, t,
}) => {
  if (loading && incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="w-8 h-8 border-4 border-forest-300 border-t-forest-600 rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-400">{t('peer.loading', 'Загружаем…')}</p>
      </div>
    );
  }

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Inbox className="w-12 h-12 text-gray-200 mb-3" />
        <p className="text-sm text-gray-400">{t('peer.emptyRequests', 'Нет активных запросов')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {incoming.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('peer.requests.incoming', 'Входящие')} ({incoming.length})
          </h2>
          <div className="space-y-2">
            {incoming.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                direction="incoming"
                onAccept={() => onAccept(r)}
                onDecline={() => onDecline(r)}
                onViewProfile={onViewProfile ? () => onViewProfile(r) : undefined}
                onCompatibility={onCompatibility ? () => onCompatibility(r) : undefined}
                t={t}
              />
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
            {t('peer.requests.outgoing', 'Отправленные')} ({outgoing.length})
          </h2>
          <div className="space-y-2">
            {outgoing.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                direction="outgoing"
                onWithdraw={() => onWithdraw(r)}
                onViewProfile={onViewProfile ? () => onViewProfile(r) : undefined}
                onCompatibility={onCompatibility ? () => onCompatibility(r) : undefined}
                t={t}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// -------------------- Request card --------------------

interface RequestCardProps {
  request: ChatRequest;
  direction: 'incoming' | 'outgoing';
  onAccept?: () => void;
  onDecline?: () => void;
  onWithdraw?: () => void;
  onViewProfile?: () => void;
  onCompatibility?: () => void;
  t: T;
}

const RequestCard: React.FC<RequestCardProps> = ({
  request, direction, onAccept, onDecline, onWithdraw, onViewProfile, onCompatibility, t,
}) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <AvatarBubble
          name={request.peerName}
          url={request.peerAvatar}
          size="sm"
          onClick={onViewProfile}
          title={onViewProfile ? (t('peer.requests.viewProfile', 'Посмотреть профиль') as string) : undefined}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {onViewProfile ? (
              <button
                type="button"
                onClick={onViewProfile}
                className="text-sm font-semibold text-gray-900 truncate hover:text-forest-700 transition-colors text-left"
              >
                {request.peerName}
              </button>
            ) : (
              <h3 className="text-sm font-semibold text-gray-900 truncate">{request.peerName}</h3>
            )}
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(request.createdAt, t as any)}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">
            {request.introMessage}
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {onViewProfile && (
              <button
                type="button"
                onClick={onViewProfile}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                {t('peer.requests.viewProfile', 'Посмотреть профиль')}
              </button>
            )}
            {onCompatibility && (
              <button
                type="button"
                onClick={onCompatibility}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-medium rounded-lg transition-colors"
              >
                <Heart className="w-3.5 h-3.5" />
                {t('peer.requests.compatibility', 'Совместимость')}
              </button>
            )}
            {direction === 'incoming' ? (
              <>
                <button
                  type="button"
                  onClick={onAccept}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 hover:bg-forest-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  {t('peer.requests.accept', 'Принять')}
                </button>
                <button
                  type="button"
                  onClick={onDecline}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  {t('peer.requests.decline', 'Отклонить')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onWithdraw}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                {t('peer.requests.withdraw', 'Отозвать')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
