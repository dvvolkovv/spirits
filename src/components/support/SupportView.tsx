import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send, Loader2, Headphones, Bot, UserCircle2, AlertTriangle, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { useSupport, SupportMessage, SupportTicket } from './useSupport';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function SenderBadge({ type, t }: { type: SupportMessage['senderType']; t: (k: string) => string }) {
  if (type === 'ai') return (
    <span className="inline-flex items-center gap-1 text-[10px] text-forest-600 font-medium">
      <Bot className="w-3 h-3" /> {t('support.sender_ai')}
    </span>
  );
  if (type === 'owner') return (
    <span className="inline-flex items-center gap-1 text-[10px] text-warm-700 font-medium">
      <UserCircle2 className="w-3 h-3" /> {t('support.sender_team')}
    </span>
  );
  if (type === 'system') return (
    <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
      <AlertTriangle className="w-3 h-3" /> {t('support.sender_system')}
    </span>
  );
  return null;
}

function MessageBubble({ m, t }: { m: SupportMessage; t: (k: string) => string }) {
  const isMine = m.senderType === 'user';
  const bubbleStyle = isMine
    ? 'bg-forest-600 text-white rounded-br-sm'
    : m.senderType === 'owner'
      ? 'bg-warm-50 text-gray-900 rounded-bl-sm border border-warm-200'
      : m.senderType === 'system'
        ? 'bg-gray-100 text-gray-600 text-xs italic'
        : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100';
  return (
    <div className={clsx('flex flex-col', isMine ? 'items-end' : 'items-start')}>
      {!isMine && <div className="mb-1 px-1"><SenderBadge type={m.senderType} t={t} /></div>}
      <div className={clsx('max-w-[85%] md:max-w-[75%] px-3 py-2 rounded-2xl shadow-sm', bubbleStyle)}>
        <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
        <div className={clsx('text-[10px] mt-0.5 text-right', isMine ? 'text-white/70' : 'text-gray-400')}>
          {formatTime(m.createdAt)}
        </div>
      </div>
    </div>
  );
}

const SupportView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    tickets,
    latestTicket,
    isLatestActive,
    composingNew,
    startNewTicket,
    loading, sending, waitingForAi,
    sendMessage,
  } = useSupport();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const totalMsgsRef = useRef(0);

  // Total messages across all tickets — drives auto-scroll
  const totalMsgs = tickets.reduce((sum, tk) => sum + tk.messages.length, 0);

  useEffect(() => {
    if (totalMsgs !== totalMsgsRef.current) {
      totalMsgsRef.current = totalMsgs;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [totalMsgs, waitingForAi]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    await sendMessage(text);
    setInput('');
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Banner reflects status of the latest ticket
  const statusBanner = (() => {
    if (!latestTicket) return null;
    if (latestTicket.status === 'escalated') return {
      text: t('support.banner_escalated'),
      color: 'bg-warm-50 text-warm-800 border-warm-200',
    };
    if (latestTicket.status === 'owner_handling') return {
      text: t('support.banner_owner'),
      color: 'bg-forest-50 text-forest-800 border-forest-200',
    };
    if (latestTicket.status === 'resolved' || latestTicket.status === 'closed') return {
      text: t('support.banner_closed'),
      color: 'bg-gray-50 text-gray-600 border-gray-200',
    };
    return null;
  })();

  // Lock input when latest ticket is closed AND user hasn't pressed "Open new ticket"
  const lockInput = latestTicket && !isLatestActive && !composingNew;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-forest-500 to-warm-500 flex items-center justify-center text-white flex-shrink-0">
          <Headphones className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-900">{t('support.title')}</h1>
          <p className="text-[11px] text-gray-400">
            {t('support.subtitle')}
          </p>
        </div>
      </div>

      {statusBanner && (
        <div className={clsx('text-xs px-4 py-2 border-b', statusBanner.color)}>
          {statusBanner.text}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-forest-600" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-forest-50 flex items-center justify-center mb-3">
              <Headphones className="w-7 h-7 text-forest-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-800 mb-1">{t('support.empty_title')}</h2>
            <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
              {t('support.empty_body')}
            </p>
          </div>
        ) : (
          tickets.map((tk: SupportTicket, idx: number) => (
            <React.Fragment key={tk.id}>
              {idx > 0 && (
                <div className="flex items-center gap-2 my-4">
                  <div className="flex-1 h-px bg-gray-300" />
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium whitespace-nowrap">
                    {t('support.new_ticket_divider')} · {formatDate(tk.createdAt, i18n.language)}
                  </span>
                  <div className="flex-1 h-px bg-gray-300" />
                </div>
              )}
              <div className="space-y-3">
                {tk.messages.map((m, i) => {
                  const prev = tk.messages[i - 1];
                  const showDay =
                    !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                  return (
                    <React.Fragment key={m.id}>
                      {showDay && (
                        <div className="flex justify-center my-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-500 font-medium">
                            {formatDate(m.createdAt, i18n.language)}
                          </span>
                        </div>
                      )}
                      <MessageBubble m={m} t={t} />
                    </React.Fragment>
                  );
                })}
              </div>
            </React.Fragment>
          ))
        )}
        {waitingForAi && (
          <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
            <Loader2 className="w-3 h-3 animate-spin text-forest-600" />
            {t('support.ai_typing')}
          </div>
        )}
      </div>

      {/* Input or "open new ticket" button */}
      <div className="bg-white border-t border-gray-200 px-3 pt-2.5 pb-20 md:pb-2.5 flex-shrink-0">
        {lockInput ? (
          <button
            type="button"
            onClick={startNewTicket}
            className="w-full py-2.5 rounded-2xl border-2 border-dashed border-forest-300 text-forest-700 hover:bg-forest-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {t('support.open_new_ticket')}
          </button>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 4000))}
              onKeyDown={handleKey}
              placeholder={composingNew ? t('support.new_ticket_placeholder') : t('support.input_placeholder')}
              rows={1}
              autoFocus={composingNew}
              className="flex-1 resize-none px-3 py-2 border border-gray-300 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent max-h-32"
              style={{ minHeight: '40px' }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="p-2.5 bg-forest-600 hover:bg-forest-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-full transition-colors flex-shrink-0"
              aria-label={t('support.send_aria')}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportView;
