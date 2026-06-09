import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { tgBotApi, type TgBotConfig } from '../../services/tgBotApi';

interface Props {
  config: TgBotConfig;
  onClose: () => void;
}

interface MessageRow {
  id: number;
  tg_user_id: number | null;
  tg_user_name: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  content_type: 'text' | 'voice_transcript' | 'voice_reply';
  tokens_charged: number;
  created_at: string;
}

export const TgBotMessagesView: React.FC<Props> = ({ config, onClose }) => {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tgBotApi.messages(config.id)
      .then((rows) => { setMessages([...rows].reverse()); setLoading(false); })
      .catch((e) => { toast.error(e?.message ?? 'Не удалось загрузить'); setLoading(false); });
  }, [config.id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">История</h2>
            <p className="text-xs text-gray-500">{config.displayName} · {config.tgChatTitle ?? '—'}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="text-center text-gray-500 py-8">Загрузка...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">История пуста.</div>
          ) : (
            <div className="space-y-2">
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`p-3 rounded-lg text-sm ${m.role === 'assistant' ? 'bg-blue-50 ml-6' : 'bg-gray-50 mr-6'}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-700">
                      {m.role === 'assistant' ? 'Бот' : (m.tg_user_name ?? 'Пользователь')}
                      {m.content_type === 'voice_transcript' && ' 🎙️'}
                      {m.content_type === 'voice_reply' && ' 🔊'}
                    </span>
                    <span className="text-[10px] text-gray-400">{new Date(m.created_at).toLocaleString('ru-RU')}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-gray-900">{m.content}</div>
                  {m.tokens_charged > 0 && (
                    <div className="text-[10px] text-gray-400 mt-1">🪙 {m.tokens_charged.toLocaleString('ru-RU')}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
