import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send, MoreVertical, ShieldAlert, UserX, Loader2, Heart, Eye } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { usePeerConversation, blockUser, reportUser } from '../peer/usePeer';
import { AvatarBubble } from '../peer/PeerInboxPanels';
import UserProfileModal from '../search/UserProfileModal';

interface Props {
  chatId: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

function dayLabel(iso: string, t: (k: string, f?: string) => string): string {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(iso, now.toISOString())) return t('peer.chat.today', 'Сегодня');
  const y = new Date(); y.setDate(now.getDate() - 1);
  if (sameDay(iso, y.toISOString())) return t('peer.chat.yesterday', 'Вчера');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const ChatConversationView: React.FC<Props> = ({ chatId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const myId = user?.phone ? user.phone.replace(/\D/g, '') : '';

  const { conv, messages, loading, sendMessage, markRead } = usePeerConversation(chatId);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrolledCountRef = useRef<number>(0);

  useEffect(() => {
    if (messages.length !== lastScrolledCountRef.current) {
      lastScrolledCountRef.current = messages.length;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages.length]);

  useEffect(() => {
    if (!messages.length) return;
    const hasUnread = messages.some((m) => !m.readAt && m.senderId !== myId);
    if (hasUnread) markRead();
  }, [messages, myId, markRead]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await sendMessage(text);
      setInput('');
    } catch (e: any) {
      setSendError(e?.message || t('peer.chat.sendFailed', 'Не удалось отправить'));
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBlock = async () => {
    if (!conv) return;
    const confirmed = window.confirm(
      t('peer.chat.confirmBlock', 'Заблокировать этого пользователя? Он больше не сможет вам писать.') as string,
    );
    if (!confirmed) return;
    await blockUser(conv.peerUserId);
    navigate('/search?tab=chats');
  };

  const submitReport = async () => {
    if (!conv) return;
    const reason = reportReason.trim();
    if (!reason) return;
    await reportUser(conv.peerUserId, reason, { contextType: 'message', contextId: chatId });
    setReportReason('');
    setReportOpen(false);
    alert(t('peer.chat.reportSent', 'Жалоба отправлена'));
  };

  const handleCompatibility = () => {
    if (!conv) return;
    setMenuOpen(false);
    navigate(`/search?tab=compatibility&user=${encodeURIComponent(conv.peerUserId)}`);
  };

  if (loading && !conv) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-forest-600" />
      </div>
    );
  }

  if (!conv) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-500">{t('peer.chat.notFound', 'Чат не найден')}</p>
        <button
          onClick={() => navigate('/search?tab=chats')}
          className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-sm"
        >
          {t('peer.chat.backToList', 'К списку чатов')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate('/search?tab=chats')}
          className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <AvatarBubble
          name={conv.peerName}
          url={conv.peerAvatar}
          size="sm"
          onClick={() => setProfileOpen(true)}
          title={t('peer.profile.title', 'Профиль пользователя') as string}
        />
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <h1 className="text-sm font-semibold text-gray-900 truncate">{conv.peerName}</h1>
          <p className="text-[11px] text-gray-400 truncate">
            {t('peer.chat.tapForProfile', 'Нажмите, чтобы открыть профиль')}
          </p>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  {t('peer.requests.viewProfile', 'Посмотреть профиль')}
                </button>
                <button
                  type="button"
                  onClick={handleCompatibility}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Heart className="w-4 h-4" />
                  {t('peer.requests.compatibility', 'Совместимость')}
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <ShieldAlert className="w-4 h-4" />
                  {t('peer.chat.report', 'Пожаловаться')}
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); handleBlock(); }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <UserX className="w-4 h-4" />
                  {t('peer.chat.block', 'Заблокировать')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-10">
            {t('peer.chat.emptyMessages', 'Напишите первое сообщение')}
          </div>
        ) : (
          messages.map((m, i) => {
            const isMine = m.senderId === myId;
            const prev = messages[i - 1];
            const showDaySep = !prev || !sameDay(prev.createdAt, m.createdAt);
            return (
              <React.Fragment key={m.id}>
                {showDaySep && (
                  <div className="flex justify-center my-2">
                    <span className="px-3 py-1 rounded-full bg-gray-200 text-gray-600 text-[11px]">
                      {dayLabel(m.createdAt, t as any)}
                    </span>
                  </div>
                )}
                <div className={clsx('flex', isMine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={clsx(
                      'max-w-[75%] px-3 py-2 rounded-2xl shadow-sm',
                      isMine
                        ? 'bg-forest-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100',
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                    <div className={clsx('text-[10px] mt-0.5 text-right', isMine ? 'text-white/70' : 'text-gray-400')}>
                      {formatTime(m.createdAt)}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Report modal */}
      {reportOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setReportOpen(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {t('peer.chat.reportTitle', 'Пожаловаться на пользователя')}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {t('peer.chat.reportHint', 'Опишите, что именно вас беспокоит. Модерация рассмотрит жалобу.')}
            </p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value.slice(0, 2000))}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none"
              placeholder={t('peer.chat.reportPlaceholder', 'Причина жалобы…') as string}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setReportOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                onClick={submitReport}
                disabled={!reportReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {t('peer.chat.send', 'Отправить')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input — extra bottom padding on mobile to clear the fixed bottom navigation (~80px).
          Desktop renders the nav as a sidebar, so no offset is needed. */}
      <div className="bg-white border-t border-gray-200 px-3 pt-2.5 pb-20 md:pb-2.5 flex-shrink-0">
        {sendError && (
          <div className="text-xs text-red-600 mb-1 px-1">{sendError}</div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 4000))}
            onKeyDown={handleKey}
            placeholder={t('peer.chat.inputPlaceholder', 'Напишите сообщение…') as string}
            rows={1}
            className="flex-1 resize-none px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent max-h-32"
            style={{ minHeight: '40px' }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="p-2.5 bg-forest-600 hover:bg-forest-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-full transition-colors flex-shrink-0"
            aria-label={t('peer.chat.send', 'Отправить') as string}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Profile modal */}
      {profileOpen && conv && (
        <UserProfileModal
          user={{
            id: conv.peerUserId,
            name: conv.peerName,
            avatar: conv.peerAvatar ?? undefined,
            values: [],
            intents: [],
            corellation: 0,
            phone: conv.peerUserId,
          }}
          isOpen={true}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
};

export default ChatConversationView;
