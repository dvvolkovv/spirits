import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send, Loader2, Headphones, Bot, UserCircle2, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { useSupport, SupportMessage } from './useSupport';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
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

const SupportView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ticket, messages, loading, sending, waitingForAi, sendMessage } = useSupport();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages.length, waitingForAi]);

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

  const statusBanner = (() => {
    if (!ticket) return null;
    if (ticket.status === 'escalated') return {
      text: t('support.banner_escalated'),
      color: 'bg-warm-50 text-warm-800 border-warm-200',
    };
    if (ticket.status === 'owner_handling') return {
      text: t('support.banner_owner'),
      color: 'bg-forest-50 text-forest-800 border-forest-200',
    };
    if (ticket.status === 'resolved' || ticket.status === 'closed') return {
      text: t('support.banner_closed'),
      color: 'bg-gray-50 text-gray-600 border-gray-200',
    };
    return null;
  })();

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
        ) : messages.length === 0 ? (
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
          messages.map((m) => {
            const isMine = m.senderType === 'user';
            const bubbleStyle = isMine
              ? 'bg-forest-600 text-white rounded-br-sm'
              : m.senderType === 'owner'
                ? 'bg-warm-50 text-gray-900 rounded-bl-sm border border-warm-200'
                : m.senderType === 'system'
                  ? 'bg-gray-100 text-gray-600 text-xs italic'
                  : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100';
            return (
              <div key={m.id} className={clsx('flex flex-col', isMine ? 'items-end' : 'items-start')}>
                {!isMine && <div className="mb-1 px-1"><SenderBadge type={m.senderType} t={t} /></div>}
                <div className={clsx('max-w-[85%] md:max-w-[75%] px-3 py-2 rounded-2xl shadow-sm', bubbleStyle)}>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                  <div className={clsx('text-[10px] mt-0.5 text-right', isMine ? 'text-white/70' : 'text-gray-400')}>
                    {formatTime(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {waitingForAi && (
          <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
            <Loader2 className="w-3 h-3 animate-spin text-forest-600" />
            {t('support.ai_typing')}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-3 pt-2.5 pb-20 md:pb-2.5 flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 4000))}
            onKeyDown={handleKey}
            placeholder={t('support.input_placeholder')}
            rows={1}
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
      </div>
    </div>
  );
};

export default SupportView;
