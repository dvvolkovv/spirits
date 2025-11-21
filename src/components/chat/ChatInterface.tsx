import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { Send, Paperclip, Mic, MicOff, RotateCcw, Copy, Check, Trash2, MessageSquare, Plus, ChevronDown, Coins } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { AssistantSelection } from './AssistantSelection';
import { TokenPackages } from '../tokens/TokenPackages';
import { useNavigate } from 'react-router-dom';
import { parseCustomMarkdown, createButtonComponent, createLinkComponent, ButtonConfig, LinkConfig } from '../../utils/customMarkdown';

interface Assistant {
  id: number;
  name: string;
  description: string;
}

const getAvatarUrl = (agentId: number): string => {
  return `https://travel-n8n.up.railway.app/webhook/0cdacf32-7bfd-4888-b24f-3a6af3b5f99e/agent/avatar/${agentId}`;
};

const getRoleForAssistant = (description: string): string => {
  if (description.includes('Коуч')) return 'Коуч';
  if (description.includes('Психолог')) return 'Психолог';
  if (description.includes('Игропрактик')) return 'Игропрактик';
  if (description.includes('Астролог')) return 'Астролог';
  if (description.includes('Human Design')) return 'Human Design';
  return 'Ассистент';
};

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
  initialShowTokens?: boolean;
}

const StreamingMessage = React.memo(({
  content,
  components,
  onButtonClick,
  onLinkClick
}: {
  content: string;
  components: any;
  onButtonClick: (action: string) => void;
  onLinkClick: (url: string) => void;
}) => {
  const { content: parsedContent, buttons, links } = parseCustomMarkdown(content);

  const renderContent = () => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const buttonMatches = [...parsedContent.matchAll(/__BUTTON_(\w+)__/g)];
    const linkMatches = [...parsedContent.matchAll(/__LINK_(\w+)__/g)];

    const allMatches = [...buttonMatches, ...linkMatches].sort((a, b) => (a.index || 0) - (b.index || 0));

    allMatches.forEach((match, idx) => {
      const matchIndex = match.index || 0;

      if (lastIndex < matchIndex) {
        const textBefore = parsedContent.slice(lastIndex, matchIndex);
        parts.push(
          <ReactMarkdown key={`text-${idx}`} components={components}>
            {textBefore}
          </ReactMarkdown>
        );
      }

      if (match[0].startsWith('__BUTTON_')) {
        const buttonId = match[1];
        const buttonConfig = buttons.get(`btn_${buttonId}`);
        if (buttonConfig) {
          parts.push(
            <span key={`button-${idx}`}>
              {createButtonComponent(buttonConfig, onButtonClick)}
            </span>
          );
        }
      } else if (match[0].startsWith('__LINK_')) {
        const linkId = match[1];
        const linkConfig = links.get(`link_${linkId}`);
        if (linkConfig) {
          parts.push(
            <span key={`link-${idx}`}>
              {createLinkComponent(linkConfig, onLinkClick)}
            </span>
          );
        }
      }

      lastIndex = matchIndex + match[0].length;
    });

    if (lastIndex < parsedContent.length) {
      const textAfter = parsedContent.slice(lastIndex);
      parts.push(
        <ReactMarkdown key="text-last" components={components}>
          {textAfter}
        </ReactMarkdown>
      );
    }

    return parts.length > 0 ? parts : (
      <ReactMarkdown components={components}>
        {content}
      </ReactMarkdown>
    );
  };

  return (
    <div className="flex justify-start" style={{ transform: 'translateZ(0)', willChange: 'contents' }}>
      <div className="max-w-xs sm:max-w-md px-4 py-2 rounded-2xl bg-white text-gray-900 shadow-sm rounded-bl-md relative transition-all duration-200">
        <div className="min-h-[24px]">
          {content ? (
            <>
              <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                {renderContent()}
              </div>
              <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-forest-500 rounded-full animate-pulse" />
            </>
          ) : (
            <div className="flex space-x-1 items-center h-[24px]">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

StreamingMessage.displayName = 'StreamingMessage';

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  title,
  welcomeMessage,
  initialShowTokens = false
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleButtonAction = useCallback((action: string) => {
    switch(action) {
      case 'buy-tokens':
        setShowTokenPackages(true);
        break;
      case 'compatibility':
        navigate('/compatibility');
        break;
      case 'profile':
        navigate('/profile');
        break;
      case 'settings':
        navigate('/settings');
        break;
      case 'search':
        navigate('/search');
        break;
      case 'chats':
        navigate('/chats');
        break;
      case 'home':
        navigate('/');
        break;
      default:
        console.warn(`Unknown action: ${action}`);
    }
  }, [navigate]);

  const handleLinkNavigation = useCallback((url: string) => {
    if (url.startsWith('/')) {
      navigate(url);
    } else {
      window.location.href = url;
    }
  }, [navigate]);

  const markdownComponents = useMemo(() => ({
    p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
    strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }: any) => <em className="italic">{children}</em>,
    ul: ({ children }: any) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
    li: ({ children }: any) => <li className="text-sm">{children}</li>,
    code: ({ children }: any) => (
      <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    ),
    pre: ({ children }: any) => (
      <pre className="bg-gray-100 text-gray-800 p-2 rounded text-xs font-mono overflow-x-auto mb-2">
        {children}
      </pre>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-2 border-gray-300 pl-2 italic text-gray-600 mb-2">
        {children}
      </blockquote>
    ),
    h1: ({ children }: any) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-base font-bold mb-2">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
    br: () => <br />,
    a: ({ href, children }: any) => {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            if (href) handleLinkNavigation(href);
          }}
          className="text-forest-600 hover:text-forest-700 underline cursor-pointer"
        >
          {children}
        </a>
      );
    },
  }), [handleLinkNavigation]);

  const getChatStorageKey = (assistantId: number | null) => {
    return `chat_messages_assistant_${assistantId || 'default'}`;
  };

  const [messages, setMessages] = useState<Message[]>(() => {
    const savedAssistant = localStorage.getItem('selected_assistant');
    if (savedAssistant) {
      const assistant = JSON.parse(savedAssistant);
      const storageKey = getChatStorageKey(assistant.id);
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsedMessages = JSON.parse(saved);
        return parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      }
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<string>('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [isLoadingAssistants, setIsLoadingAssistants] = useState(true);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(() => {
    const saved = localStorage.getItem('selected_assistant');
    if (saved) {
      return JSON.parse(saved);
    }
    return null;
  });
  const [showAssistantDropdown, setShowAssistantDropdown] = useState(false);
  const [hasUserSelectedAssistant, setHasUserSelectedAssistant] = useState<boolean>(() => {
    return localStorage.getItem('selected_assistant') !== null;
  });
  const [showTokenPackages, setShowTokenPackages] = useState(initialShowTokens);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [assistantSwitchNotification, setAssistantSwitchNotification] = useState<string | null>(null);

  useEffect(() => {
    if (initialShowTokens) {
      setShowTokenPackages(true);
    }
  }, [initialShowTokens]);

  useEffect(() => {
    if (selectedAssistant && hasUserSelectedAssistant) {
      const storageKey = getChatStorageKey(selectedAssistant.id);
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsedMessages = JSON.parse(saved);
        setMessages(parsedMessages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })));
      } else {
        setMessages([]);
        sendInitialGreeting(selectedAssistant);
      }
    }
  }, [selectedAssistant, hasUserSelectedAssistant]);

  const sendInitialGreeting = async (assistant: Assistant) => {
    if (user?.phone) {
      const cleanPhone = user.phone.replace(/\D/g, '');
      try {
        const formData = new FormData();
        formData.append('user-id', cleanPhone);
        formData.append('agent', assistant.name);

        await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/change-agent`, {
          method: 'POST',
          body: formData
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Error changing agent on server:', error);
      }
    }

    const greetingMessage = "Привет! Расскажи про себя!";
    await sendMessageToAI(greetingMessage);
  };

  useEffect(() => {
    if (selectedAssistant) {
      const messagesToSave = messages.slice(-100);
      const storageKey = getChatStorageKey(selectedAssistant.id);
      localStorage.setItem(storageKey, JSON.stringify(messagesToSave));
    }
  }, [messages, selectedAssistant]);

  useEffect(() => {
    const fetchAssistants = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/agents`);
        if (response.ok) {
          const data = await response.json();
          setAssistants(data);
        } else {
          console.error('Failed to fetch assistants');
        }
      } catch (error) {
        console.error('Error fetching assistants:', error);
      } finally {
        setIsLoadingAssistants(false);
      }
    };

    fetchAssistants();
  }, []);

  useEffect(() => {
    if (selectedAssistant) {
      localStorage.setItem('selected_assistant', JSON.stringify(selectedAssistant));
      changeAgentOnServer(selectedAssistant.name);
    }
  }, [selectedAssistant]);

  const changeAgentOnServer = async (agentName: string) => {
    if (!user?.phone) return;

    const cleanPhone = user.phone.replace(/\D/g, '');

    try {
      const formData = new FormData();
      formData.append('user-id', cleanPhone);
      formData.append('agent', agentName);

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/change-agent`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        console.error('Failed to change agent on server');
      }
    } catch (error) {
      console.error('Error changing agent on server:', error);
    }
  };

  // Синхронизация выбора ассистента между окнами/вкладками
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'selected_assistant' && e.newValue) {
        try {
          const newAssistant = JSON.parse(e.newValue);

          // Проверяем, что это действительно другой ассистент
          if (selectedAssistant?.id !== newAssistant.id) {
            // Прерываем активные запросы
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              abortControllerRef.current = null;
            }

            // Очищаем потоковое сообщение
            setCurrentStreamingMessage('');
            setStreamingMessageId(null);
            setIsTyping(false);

            // Обновляем выбранного ассистента
            setSelectedAssistant(newAssistant);

            // Показываем уведомление
            setAssistantSwitchNotification(`Переключено на ${newAssistant.name}`);
            setTimeout(() => setAssistantSwitchNotification(null), 3000);
          }
        } catch (error) {
          console.error('Error parsing selected assistant from storage:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [selectedAssistant]);

  // Закрытие дропдауна при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAssistantDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Синхронизация выбранного ассистента с сервером каждые 10 секунд
  useEffect(() => {
    if (!user?.phone || !assistants.length) return;

    let intervalId: NodeJS.Timeout | null = null;

    const syncAssistantFromServer = async () => {
      if (document.hidden) return;

      const cleanPhone = user.phone.replace(/\D/g, '');

      try {
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/webhook/16279efb-08c5-4255-9ded-fdbafb507f32/profile/${cleanPhone}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          }
        );

        if (response.ok) {
          const responseData = await response.json();

          let profileRecord;
          if (Array.isArray(responseData) && responseData.length > 0) {
            profileRecord = responseData[0];
          } else if (responseData && typeof responseData === 'object') {
            profileRecord = responseData;
          }

          if (profileRecord) {
            const serverAgent = profileRecord.profile_data?.agent || profileRecord.agent;

            if (serverAgent && selectedAssistant?.name !== serverAgent) {
              const matchingAssistant = assistants.find(
                (a) => a.name === serverAgent
              );

              if (matchingAssistant) {
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                  abortControllerRef.current = null;
                }

                setCurrentStreamingMessage('');
                setStreamingMessageId(null);
                setIsTyping(false);

                setSelectedAssistant(matchingAssistant);
                localStorage.setItem('selected_assistant', JSON.stringify(matchingAssistant));

                setAssistantSwitchNotification(`Переключено на ${matchingAssistant.name}`);
                setTimeout(() => setAssistantSwitchNotification(null), 3000);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error syncing assistant from server:', error);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncAssistantFromServer();
      }
    };

    intervalId = setInterval(syncAssistantFromServer, 10000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    syncAssistantFromServer();

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.phone, assistants, selectedAssistant]);

  // Отдельный useEffect для прокрутки с throttling
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    let rafId: number;
    let lastScrollTime = 0;
    const scrollThrottle = 16;

    const scrollToBottom = () => {
      const now = Date.now();
      if (now - lastScrollTime < scrollThrottle) return;

      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom) {
        rafId = requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight;
            lastScrollTime = now;
          }
        });
      }
    };

    scrollToBottom();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [messages, currentStreamingMessage]);

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

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();

      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'ru-RU';

      recognitionInstance.onstart = () => {
        setIsRecording(true);
      };

      recognitionInstance.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + (prev ? ' ' : '') + transcript);
        adjustTextareaHeight();
      };

      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          alert('Ошибка распознавания речи: ' + event.error);
        }
      };

      recognitionInstance.onend = () => {
        setIsRecording(false);
      };

      setRecognition(recognitionInstance);
      setIsVoiceSupported(true);
    } else {
      setIsVoiceSupported(false);
    }
  }, []);

  const sendMessageToAI = async (userMessage: string) => {
    setIsTyping(true);
    setCurrentStreamingMessage('');

    // Set streaming message ID immediately to show loading state
    const assistantMessageId = Date.now().toString();
    setStreamingMessageId(assistantMessageId);

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    // Extract phone number from user data and clean it for sessionId
    const phoneNumber = user?.phone?.replace(/\D/g, '') || 'anonymous';

    // Получаем актуальный ID ассистента из localStorage для дополнительной проверки
    let currentAssistantId = selectedAssistant?.id || 1;
    const savedAssistant = localStorage.getItem('selected_assistant');
    if (savedAssistant) {
      try {
        const assistant = JSON.parse(savedAssistant);
        currentAssistantId = assistant.id;
      } catch (error) {
        console.error('Error parsing assistant from localStorage:', error);
      }
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/soulmate/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatInput: userMessage,
          sessionId: phoneNumber,
          assistant: currentAssistantId
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

      let lastUpdate = Date.now();
      const updateInterval = 50;

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

              const now = Date.now();
              if (now - lastUpdate >= updateInterval) {
                setCurrentStreamingMessage(accumulatedContent);
                lastUpdate = now;
              }
            }
          } catch (e) {
            // Skip invalid JSON lines
            console.warn('Failed to parse streaming data:', line);
          }
        }
      }

      setCurrentStreamingMessage(accumulatedContent);
      
      // Add the completed message to the messages array
      const completedMessage: Message = {
        id: assistantMessageId,
        type: 'assistant',
        content: accumulatedContent,
        timestamp: new Date(),
        isStreaming: false
      };

      setMessages(prev => [...prev, completedMessage]);
      setStreamingMessageId(null);
      
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
      setStreamingMessageId(null);
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

    // Проверяем актуальность выбранного ассистента перед отправкой
    const savedAssistant = localStorage.getItem('selected_assistant');
    if (savedAssistant) {
      try {
        const currentAssistant = JSON.parse(savedAssistant);
        // Если ассистент изменился, обновляем состояние
        if (selectedAssistant?.id !== currentAssistant.id) {
          setSelectedAssistant(currentAssistant);
          // Ожидаем обновления состояния и синхронизации с сервером
          await changeAgentOnServer(currentAssistant.name);
          // Показываем уведомление
          setAssistantSwitchNotification(`Переключено на ${currentAssistant.name}`);
          setTimeout(() => setAssistantSwitchNotification(null), 3000);
        }
      } catch (error) {
        console.error('Error checking assistant before send:', error);
      }
    }

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
      if (selectedAssistant) {
        const storageKey = getChatStorageKey(selectedAssistant.id);
        localStorage.removeItem(storageKey);
      }
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
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
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
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Пожалуйста, загрузите файл в формате PDF');
      return;
    }

    setIsUploadingFile(true);

    try {
      const userId = user?.phone?.replace(/\D/g, '') || 'anonymous';

      const formData = new FormData();
      formData.append('user-id', userId);
      formData.append('file', file);

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/scan-document`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки файла');
      }

      const result = await response.json();

      const userMessage: Message = {
        id: Date.now().toString(),
        type: 'user',
        content: `Загружен файл: ${file.name}`,
        timestamp: new Date()
      };

      const profileData = result.output;

      let profileText = '📄 **Данные из документа обработаны:**\n\n';

      if (profileData.name && profileData.family_name) {
        profileText += `**Имя:** ${profileData.name} ${profileData.family_name}\n`;
      }

      if (profileData.profile && profileData.profile.length > 0) {
        profileText += '\n**Профиль:**\n';
        profileData.profile.forEach((item: string) => {
          profileText += `• ${item}\n`;
        });
      }

      if (profileData.values && profileData.values.length > 0) {
        profileText += '\n**Ценности:**\n';
        profileData.values.forEach((item: string) => {
          profileText += `• ${item}\n`;
        });
      }

      if (profileData.skills && profileData.skills.length > 0) {
        profileText += '\n**Навыки:**\n';
        profileData.skills.forEach((item: string) => {
          profileText += `• ${item}\n`;
        });
      }

      if (profileData.beliefs && profileData.beliefs.length > 0) {
        profileText += '\n**Убеждения:**\n';
        profileData.beliefs.forEach((item: string) => {
          profileText += `• ${item}\n`;
        });
      }

      if (profileData.desires && profileData.desires.length > 0) {
        profileText += '\n**Желания:**\n';
        profileData.desires.forEach((item: string) => {
          profileText += `• ${item}\n`;
        });
      }

      if (profileData.interests && profileData.interests.length > 0) {
        profileText += '\n**Интересы:**\n';
        profileData.interests.forEach((item: string) => {
          profileText += `• ${item}\n`;
        });
      }

      if (profileData.intents && profileData.intents.length > 0) {
        profileText += '\n**Поиск людей:**\n';
        profileData.intents.forEach((item: string) => {
          profileText += `• ${item}\n`;
        });
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: profileText,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, userMessage, assistantMessage]);

      await new Promise(resolve => setTimeout(resolve, 500));

      await sendMessageToAI('В последнем сообщении выжимка из файла');

    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Произошла ошибка при загрузке файла. Попробуйте еще раз.');
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const quickSuggestions = [
    "Расскажи о моих ценностях",
    "Какие у меня цели в жизни?",
    "Что меня мотивирует?",
    "Помоги найти единомышленников"
  ];

  const handleSelectAssistant = async (assistant: Assistant) => {
    setSelectedAssistant(assistant);
    setHasUserSelectedAssistant(true);
    localStorage.setItem('selected_assistant', JSON.stringify(assistant));

    await sendInitialGreeting(assistant);
  };

  const handleSwitchAssistant = async (assistant: Assistant) => {
    if (selectedAssistant?.id === assistant.id) {
      setShowAssistantDropdown(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setCurrentStreamingMessage('');
    setStreamingMessageId(null);
    setIsTyping(false);

    setSelectedAssistant(assistant);
    localStorage.setItem('selected_assistant', JSON.stringify(assistant));
    setShowAssistantDropdown(false);

    setAssistantSwitchNotification(`Переключено на ${assistant.name}`);
    setTimeout(() => setAssistantSwitchNotification(null), 3000);
  };

  if (!hasUserSelectedAssistant) {
    return (
      <AssistantSelection
        assistants={assistants}
        onSelectAssistant={handleSelectAssistant}
        isLoading={isLoadingAssistants}
      />
    );
  }

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString('ru-RU');
  };

  return (
    <>
      {showTokenPackages && (
        <TokenPackages onClose={() => setShowTokenPackages(false)} />
      )}

      <div className="flex flex-col h-full bg-gray-50 relative">
        {/* Уведомление о смене ассистента */}
        {assistantSwitchNotification && (
          <div className="fixed top-20 md:top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
            <div className="bg-forest-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">{assistantSwitchNotification}</span>
            </div>
          </div>
        )}

        {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 border-b flex-shrink-0 fixed md:relative top-0 left-0 right-0 z-40">
        <div className="flex items-center justify-between max-w-full">
          <div className="relative" ref={dropdownRef}>
            {isLoadingAssistants ? (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                <div className="w-4 h-4 border-2 border-forest-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-600">Загрузка...</span>
              </div>
            ) : selectedAssistant ? (
              <>
                <button
                  onClick={() => setShowAssistantDropdown(!showAssistantDropdown)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-forest-50 hover:bg-forest-100 rounded-lg transition-colors border border-forest-200"
                >
                  <img
                    src={getAvatarUrl(selectedAssistant.id)}
                    alt={selectedAssistant.name}
                    className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = '<div class="w-8 h-8 bg-gradient-to-br from-forest-500 to-warm-500 rounded-full flex items-center justify-center flex-shrink-0"><span class="text-lg">👤</span></div>';
                      }
                    }}
                  />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-forest-900">{selectedAssistant.name}</span>
                    <span className="text-xs text-forest-600">{getRoleForAssistant(selectedAssistant.description)}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-forest-700" />
                </button>

                {showAssistantDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="py-1">
                      {assistants.map((assistant) => (
                        <button
                          key={assistant.id}
                          onClick={() => handleSwitchAssistant(assistant)}
                          className={clsx(
                            'w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors',
                            selectedAssistant.id === assistant.id && 'bg-forest-50'
                          )}
                        >
                          <div className="flex items-center space-x-3">
                            <img
                              src={getAvatarUrl(assistant.id)}
                              alt={assistant.name}
                              className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.innerHTML = '<div class="w-10 h-10 bg-gradient-to-br from-forest-500 to-warm-500 rounded-full flex items-center justify-center flex-shrink-0 text-xl">👤</div>';
                                }
                              }}
                            />
                            <div className="flex flex-col flex-1">
                              <span className="text-sm font-medium text-gray-900">{assistant.name}</span>
                              <span className="text-xs text-gray-500 mt-0.5">{assistant.description}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
          <div className="flex items-center space-x-3">
            {user?.tokens !== undefined && (
              <button
                onClick={() => setShowTokenPackages(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-forest-50 hover:bg-forest-100 rounded-lg border border-forest-200 hover:border-forest-300 transition-all cursor-pointer"
                title="Нажмите для пополнения токенов"
              >
                <Coins className="w-4 h-4 text-forest-600" />
                <span className="text-sm font-semibold text-forest-700">
                  {formatTokens(user.tokens)}
                </span>
              </button>
            )}
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
      <div
        className="flex-1 overflow-y-auto px-4 space-y-4 min-h-0 pt-4 pb-4"
        ref={messagesContainerRef}
        style={{ willChange: 'scroll-position' }}
      >
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
                  {(() => {
                    const { content: parsedContent, buttons, links } = parseCustomMarkdown(message.content);
                    const parts: React.ReactNode[] = [];
                    let lastIndex = 0;
                    const buttonMatches = [...parsedContent.matchAll(/__BUTTON_(\w+)__/g)];
                    const linkMatches = [...parsedContent.matchAll(/__LINK_(\w+)__/g)];

                    const allMatches = [...buttonMatches, ...linkMatches].sort((a, b) => (a.index || 0) - (b.index || 0));

                    allMatches.forEach((match, idx) => {
                      const matchIndex = match.index || 0;

                      if (lastIndex < matchIndex) {
                        const textBefore = parsedContent.slice(lastIndex, matchIndex);
                        parts.push(
                          <ReactMarkdown key={`text-${idx}`} components={markdownComponents}>
                            {textBefore}
                          </ReactMarkdown>
                        );
                      }

                      if (match[0].startsWith('__BUTTON_')) {
                        const buttonId = match[1];
                        const buttonConfig = buttons.get(`btn_${buttonId}`);
                        if (buttonConfig) {
                          parts.push(
                            <span key={`button-${idx}`}>
                              {createButtonComponent(buttonConfig, handleButtonAction)}
                            </span>
                          );
                        }
                      } else if (match[0].startsWith('__LINK_')) {
                        const linkId = match[1];
                        const linkConfig = links.get(`link_${linkId}`);
                        if (linkConfig) {
                          parts.push(
                            <span key={`link-${idx}`}>
                              {createLinkComponent(linkConfig, handleLinkNavigation)}
                            </span>
                          );
                        }
                      }

                      lastIndex = matchIndex + match[0].length;
                    });

                    if (lastIndex < parsedContent.length) {
                      const textAfter = parsedContent.slice(lastIndex);
                      parts.push(
                        <ReactMarkdown key="text-last" components={markdownComponents}>
                          {textAfter}
                        </ReactMarkdown>
                      );
                    }

                    return parts.length > 0 ? parts : (
                      <ReactMarkdown components={markdownComponents}>
                        {message.content}
                      </ReactMarkdown>
                    );
                  })()}
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

        {streamingMessageId && (
          <StreamingMessage
            content={currentStreamingMessage}
            components={markdownComponents}
            onButtonClick={handleButtonAction}
            onLinkClick={handleLinkNavigation}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t px-4 py-3 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingFile || isTyping}
            className={clsx(
              'p-2 transition-colors rounded-lg',
              isUploadingFile
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            )}
            title="Загрузить PDF файл"
          >
            {isUploadingFile ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-forest-600 rounded-full animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={t('chat.placeholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '200px' }}
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
    </>
  );
};

export default ChatInterface;