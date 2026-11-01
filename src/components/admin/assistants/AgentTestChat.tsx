import React, { useRef, useState } from 'react';
import { Loader2, RotateCcw, Send } from 'lucide-react';
import { agentVersionsApi } from '../../../services/agentVersionsApi';

interface AgentTestChatProps {
  agentId: number;
  versionId: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  tokens?: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return 'неизвестная ошибка';
}

const AgentTestChat: React.FC<AgentTestChatProps> = ({ agentId, versionId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string>();
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const send = async () => {
    const message = input.trim();
    if (!message || busy || inFlightRef.current) return;

    inFlightRef.current = true;
    if (pendingMessage !== message) {
      setMessages((current) => [...current, { role: 'user', text: message }]);
      setPendingMessage(message);
    }
    setBusy(true);
    setError(null);
    try {
      const reply = await agentVersionsApi.test(agentId, {
        version_id: versionId,
        message,
        session_id: sessionId,
      });
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: reply.text, tokens: reply.tokens },
      ]);
      setSessionId(reply.session_id);
      setPendingMessage(null);
      setInput('');
    } catch (testError: unknown) {
      setError(`Не удалось выполнить тест: ${errorMessage(testError)}`);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  const reset = () => {
    if (busy || inFlightRef.current) return;
    setMessages([]);
    setSessionId(undefined);
    setPendingMessage(null);
    setError(null);
  };

  return (
    <section className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Тестовый диалог</h3>
          <p className="text-xs text-gray-500 mt-1">Проверка сохранённой версии {versionId}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={reset}
          className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm flex items-center disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Новый тест
        </button>
      </div>

      <div role="log" aria-live="polite" className="space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">Отправьте сообщение, чтобы проверить черновик.</p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={message.role === 'user'
              ? 'ml-auto max-w-[90%] p-3 bg-forest-50 border border-forest-100 rounded-lg'
              : 'mr-auto max-w-[90%] p-3 bg-gray-50 border border-gray-200 rounded-lg'}
          >
            <p className="text-xs font-medium text-gray-500 mb-1">
              {message.role === 'user' ? 'Вы' : 'Ассистент'}
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{message.text}</p>
            {message.role === 'assistant' && message.tokens !== undefined && (
              <p className="text-xs text-gray-500 mt-2">Токены: {message.tokens}</p>
            )}
          </div>
        ))}
        {busy && (
          <p className="text-sm text-gray-500 flex items-center">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Отправка...
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      <div>
        <label htmlFor={`agent-test-input-${versionId}`} className="block text-sm font-medium text-gray-700 mb-2">
          Сообщение для теста
        </label>
        <textarea
          id={`agent-test-input-${versionId}`}
          data-testid="agent-test-input"
          value={input}
          disabled={busy}
          onChange={(event) => setInput(event.target.value)}
          className="w-full h-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent text-sm disabled:bg-gray-50"
        />
      </div>
      <button
        type="button"
        disabled={busy || !input.trim()}
        onClick={send}
        className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-sm flex items-center disabled:bg-gray-200 disabled:text-gray-500"
      >
        <Send className="w-4 h-4 mr-1" />
        {busy ? 'Отправка...' : 'Отправить'}
      </button>
    </section>
  );
};

export default AgentTestChat;
