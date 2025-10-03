import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { Send, Paperclip, Mic, MicOff, RotateCcw, Copy, Check, Trash2, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface ChatInterfaceProps {
  title?: string;
  welcomeMessage?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  title, 
  welcomeMessage 
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('chat_messages');
    if (saved) {
      const parsedMessages = JSON.parse(saved);
      return parsedMessages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);</parameter>

  // Сохраняем сообщения в localStorage при изменениях
  useEffect(() => {
    // Ограничиваем количество сообщений до 100
    const messagesToSave = messages.slice(-100);
    localStorage.setItem('chat_messages', JSON.stringify(messagesToSave));
  }, [messages]);

  // Отдельный useEffect для прокрутки
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  // Handle scroll to show/hide scroll-to-bottom button
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setShowScrollButton(!isNearBottom && messages.length > 3);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages.length]);

  useEffect(() => {
    if (welcomeMessage && messages.length === 0) {
      setMessages([{
        id: '1',
        type: 'assistant',
        content: welcomeMessage,
        timestamp: new Date()
      }]);
    }
  }, [welcomeMessage, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessageToAI = async (userMessage: string) => {
    setIsTyping(true);
    setCurrentStreamingMessage('');
    
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    // Extract phone number from user data and clean it for sessionId
    const phoneNumber = user?.phone?.replace(/\D/g, '') || 'anonymous';
    
    try {
      const response = await fetch('https://travel-n8n.up.railway.app/webhook/soulmate/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatInput: userMessage,
          sessionId: phoneNumber
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      let accumulatedContent = '';
      let assistantMessageId = Date.now().toString();
      
      // Add initial empty assistant message
      const initialAssistantMessage: Message = {
        id: assistantMessageId,
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true
      };
      
      setMessages(prev => [...prev, initialAssistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.type === 'item' && data.content) {
              accumulatedContent += data.content;
              setCurrentStreamingMessage(accumulatedContent);
              
              // Update the streaming message
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId 
                  ? { ...msg, content: accumulatedContent }
                  : msg
              ));
            }
          } catch (e) {
            // Skip invalid JSON lines
            console.warn('Failed to parse streaming data:', line);
          }
        }
      }
      
      // Finalize the message
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, isStreaming: false }
          : msg
      ));
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }
      
      console.error('Error sending message to AI:', error);
      
      // Show error message
      const errorMessage: Message = {
        id: Date.now().toString(),
        type: 'assistant',
        content: 'Извините, произошла ошибка при обработке вашего сообщения. Попробуйте еще раз.',
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setCurrentStreamingMessage('');
      abortControllerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = input;
    setInput('');
    
    await sendMessageToAI(messageText);
  };

  const handleClearChat = () => {
    if (window.confirm('Очистить историю чата? Это действие нельзя отменить.')) {
      setMessages([]);
      localStorage.removeItem('chat_messages');
      if (welcomeMessage) {
        setMessages([{
          id: '1',
          type: 'assistant',
          content: welcomeMessage,
          timestamp: new Date()
        }]);
      }
    }
  };

  const handleCopyMessage = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const handleRegenerateResponse = async () => {
    if (messages.length < 2) return;
    
    // Find the last user message
    const lastUserMessageIndex = messages.findLastIndex(msg => msg.type === 'user');
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = messages[lastUserMessageIndex];
    
    // Remove all messages after the last user message
    const newMessages = messages.slice(0, lastUserMessageIndex + 1);
    setMessages(newMessages);
    
    // Regenerate response
    await sendMessageToAI(lastUserMessage.content);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustTextareaHeight();
  };

  const insertSuggestion = (suggestion: string) => {
    setInput(suggestion);
    textareaRef.current?.focus();
    adjustTextareaHeight();
  };

  const handleVoiceInput = () => {
    if (!recognition || !isVoiceSupported) {
      alert('Голосовой ввод не поддерживается в вашем браузере');
      return;
    }

    if (isRecording) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };</parameter>

  const quickSuggestions = [
    "Расскажи о моих ценностях",
    "Какие у меня цели в жизни?",
    "Что меня мотивирует?",
    "Помоги найти единомышленников"
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">
            {title || t('chat.title')}
          </h1>
          <div className="flex items-center space-x-2">
            {messages.length > 1 && (
              <>
                <button
                  onClick={handleRegenerateResponse}
                  disabled={isTyping}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Перегенерировать ответ"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClearChat}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Очистить чат"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0" ref={messagesContainerRef}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={clsx(
              'flex',
              message.type === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={clsx(
                'max-w-xs sm:max-w-md px-4 py-2 rounded-2xl',
                message.type === 'user'
                  ? 'bg-forest-600 text-white rounded-br-md'
                  : 'bg-white text-gray-900 shadow-sm rounded-bl-md relative'
              )}
            >
              {message.type === 'assistant' ? (
                <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="text-sm">{children}</li>,
                      code: ({ children }) => (
                        <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre className="bg-gray-100 text-gray-800 p-2 rounded text-xs font-mono overflow-x-auto mb-2">
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-gray-300 pl-2 italic text-gray-600 mb-2">
                          {children}
                        </blockquote>
                      ),
                      h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                      br: () => <br />,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm leading-relaxed">{message.content}</p>
              )}
              {message.isStreaming && (
                <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-forest-500 rounded-full animate-pulse" />
              )}
              <p className={clsx(
                'text-xs mt-1',
                message.type === 'user' ? 'text-forest-100' : 'text-gray-500'
              )}>
                {message.timestamp.toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white shadow-sm px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t px-4 py-3 flex-shrink-0">
        <div className="flex items-end space-x-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={t('chat.placeholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
          </div>

          <button 
            onClick={handleVoiceInput}
            disabled={!isVoiceSupported}
            className={clsx(
              'p-2 transition-colors rounded-lg',
              isRecording 
                ? 'text-red-600 bg-red-50 hover:bg-red-100' 
                : isVoiceSupported
                  ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  : 'text-gray-300 cursor-not-allowed'
            )}
            title={
              !isVoiceSupported 
                ? 'Голосовой ввод не поддерживается' 
                : isRecording 
                  ? 'Остановить запись' 
                  : 'Начать голосовой ввод'
            }
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              input.trim() && !isTyping
                ? 'bg-forest-600 text-white hover:bg-forest-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {isTyping ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-forest-600 rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;