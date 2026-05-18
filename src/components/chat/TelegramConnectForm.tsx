import React, { useState } from 'react';
import { Send, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { socialAccountApi } from '../../services/socialAccountApi';

interface Props {
  /** Called when account is created successfully. Parent uses to resume chat. */
  onConnected?: (displayName: string) => void;
}

export const TelegramConnectForm: React.FC<Props> = ({ onConnected }) => {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botToken.trim() || !chatId.trim()) {
      setError('Заполни bot token и chat id');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const acc = await socialAccountApi.createTelegram({
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        displayName: displayName.trim() || undefined,
      });
      setSuccess(true);
      toast.success(`Telegram подключён: ${acc.displayName}`);
      onConnected?.(acc.displayName);
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось подключить');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="my-3 p-4 rounded-lg border border-green-200 bg-green-50 flex items-center gap-2">
        <Check className="w-5 h-5 text-green-600" />
        <span className="text-green-800 font-medium">Telegram подключён</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="my-3 p-4 rounded-lg border border-gray-200 bg-white">
      <div className="text-sm font-medium mb-3">Подключить Telegram-канал</div>

      <input
        type="text"
        placeholder="Bot token (от @BotFather)"
        value={botToken}
        onChange={(e) => setBotToken(e.target.value)}
        className="w-full mb-2 px-3 py-2 border border-gray-300 rounded text-sm font-mono"
        autoComplete="off"
        disabled={loading}
      />
      <input
        type="text"
        placeholder="Chat ID или @username канала"
        value={chatId}
        onChange={(e) => setChatId(e.target.value)}
        className="w-full mb-2 px-3 py-2 border border-gray-300 rounded text-sm"
        autoComplete="off"
        disabled={loading}
      />
      <input
        type="text"
        placeholder="Название (опционально)"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded text-sm"
        autoComplete="off"
        disabled={loading}
      />

      <button
        type="button"
        onClick={() => setShowHelp(!showHelp)}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-3"
      >
        {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Как получить bot_token и chat_id?
      </button>

      {showHelp && (
        <div className="text-xs text-gray-600 mb-3 p-3 bg-gray-50 rounded space-y-1">
          <p><strong>Bot token:</strong> Напиши @BotFather, команда /newbot, следуй инструкциям. Получишь токен вида <code>123:ABC-XYZ</code>.</p>
          <p><strong>Chat ID:</strong> Создай канал, добавь своего бота как админа с правом постить, затем chat_id = <code>@my_channel</code> (для публичных) или числовой ID вида <code>-1001234567890</code> (получи через @userinfobot — добавь его в канал на минуту).</p>
        </div>
      )}

      {error && (
        <div className="mb-3 p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
          <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !botToken.trim() || !chatId.trim()}
        className="bg-sky-500 hover:bg-sky-600 disabled:bg-gray-300 text-white px-4 py-2 rounded font-medium flex items-center gap-2 text-sm"
      >
        <Send className="w-4 h-4" />
        {loading ? 'Подключаем…' : 'Подключить'}
      </button>
    </form>
  );
};

export default TelegramConnectForm;
