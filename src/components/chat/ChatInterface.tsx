import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { Send, Paperclip, Mic, MicOff, RotateCcw, Copy, Check, Trash2, MessageSquare, Plus, ChevronDown, Coins } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { AssistantSelection } from './AssistantSelection';
import { TokenPackages } from '../tokens/TokenPackages';
import { useNavigate } from 'react-router-dom';
import { parseCustomMarkdown, createButtonComponent, createLinkComponent, createVideoComponent, ButtonConfig, LinkConfig } from '../../utils/customMarkdown';
import { ScenarioCard } from './smm/ScenarioCard';
import { SmmVideoPlayer } from './smm/SmmVideoPlayer';
import SocialConnectButton from './SocialConnectButton';
import TelegramConnectForm from './TelegramConnectForm';
import { SmmPlatform } from '../../types/smm';
import { avatarService } from '../../services/avatarService';
import { apiClient } from '../../services/apiClient';
import { useVideoJobs } from '../video/useVideoJobs';
import VideoJobCard from '../video/VideoJobCard';

interface Assistant {
  id: number;
  name: string;
  description: string;
}

const getRoleForAssistant = (description: string, t: (k: string) => string): string => {
  if (description.includes('Коуч')) return t('chat.assistant_role_coach');
  if (description.includes('Психолог')) return t('chat.assistant_role_psych');
  if (description.includes('Игропрактик')) return t('chat.assistant_role_gameplay');
  if (description.includes('Астролог')) return t('chat.assistant_role_astro');
  if (description.includes('Human Design')) return t('chat.assistant_role_hd');
  return t('chat.assistant_role_default');
};

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  messageType?: 'text' | 'image';
  imageUrl?: string;
  tokensUsed?: number;
  inlineJobIds?: string[];
}

interface ChatInterfaceProps {
  title?: string;
  welcomeMessage?: string;
  initialShowTokens?: boolean;
  preSelectedAssistant?: { id: number; name: string; description: string } | null;
  onAssistantSelected?: (a: any) => void;
  allAssistants?: any[];
}

// Backend tags streamed text with `[VIDEO_JOB:<uuid>]` markers so the frontend
// can attach inline video players. Hide these tokens from the user-visible text.
const VIDEO_JOB_MARKER_RE = /\s*\[VIDEO_JOB:[0-9a-f-]{36}\]\s*/gi;
const stripVideoJobMarkers = (text: string): string => text.replace(VIDEO_JOB_MARKER_RE, '');
const extractVideoJobIds = (text: string): string[] => {
  const ids: string[] = [];
  const matches = text.matchAll(/\[VIDEO_JOB:([0-9a-f-]{36})\]/gi);
  for (const m of matches) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
};

const StreamingMessage = React.memo(({
  content,
  components,
  onButtonClick,
  onLinkClick,
  onSendMessage,
}: {
  content: string;
  components: any;
  onButtonClick: (action: string) => void;
  onLinkClick: (url: string) => void;
  onSendMessage?: (text: string) => void;
}) => {
  const { content: parsedContent, buttons, links, videos, smmScenarios, smmVideos, socialButtons, socialTelegrams } = parseCustomMarkdown(content);

  const renderContent = () => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const buttonMatches = [...parsedContent.matchAll(/__BUTTON_(\w+)__/g)];
    const linkMatches = [...parsedContent.matchAll(/__LINK_(\w+)__/g)];
    const videoMatches = [...parsedContent.matchAll(/__VIDEO_(\w+)__/g)];
    const smmScenarioMatches = [...parsedContent.matchAll(/__SMM_SCENARIO_([\w-]+)__/g)];
    const smmVideoMatches = [...parsedContent.matchAll(/__SMM_VIDEO_([\w-]+)__/g)];
    const socialButtonMatches = [...parsedContent.matchAll(/__SOCIAL_BUTTON_(\w+)__/g)];
    const socialTelegramMatches = [...parsedContent.matchAll(/__SOCIAL_TELEGRAM_(\w+)__/g)];

    const allMatches = [...buttonMatches, ...linkMatches, ...videoMatches, ...smmScenarioMatches, ...smmVideoMatches, ...socialButtonMatches, ...socialTelegramMatches].sort((a, b) => (a.index || 0) - (b.index || 0));

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
      } else if (match[0].startsWith('__VIDEO_')) {
        const videoId = match[1];
        const videoSrc = videos.get(`video_${videoId}`);
        if (videoSrc) {
          parts.push(
            <span key={`video-${idx}`}>
              {createVideoComponent(videoSrc, `v-${idx}`)}
            </span>
          );
        }
      } else if (match[0].startsWith('__SMM_SCENARIO_')) {
        const key = match[1];
        const scenarioId = smmScenarios.get(key);
        if (scenarioId) {
          parts.push(
            <div key={`smm-scenario-${idx}`}>
              <ScenarioCard scenarioId={scenarioId} />
            </div>
          );
        }
      } else if (match[0].startsWith('__SMM_VIDEO_')) {
        const key = match[1];
        const vid = smmVideos.get(key);
        if (vid) {
          parts.push(
            <div key={`smm-video-${idx}`}>
              <SmmVideoPlayer videoId={vid} />
            </div>
          );
        }
      } else if (match[0].startsWith('__SOCIAL_BUTTON_')) {
        const key = match[1];
        const cfg = socialButtons.get(key);
        if (cfg) {
          parts.push(
            <div key={`social-btn-${idx}`}>
              <SocialConnectButton platform={cfg.platform as SmmPlatform} authorizeUrl={cfg.authorizeUrl} />
            </div>
          );
        }
      } else if (match[0].startsWith('__SOCIAL_TELEGRAM_')) {
        const key = match[1];
        if (socialTelegrams.has(key)) {
          parts.push(
            <div key={`social-tg-${idx}`}>
              <TelegramConnectForm onConnected={(displayName) => {
                onSendMessage?.(`Telegram подключил (${displayName}), продолжай.`);
              }} />
            </div>
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
      <div className="max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl px-4 py-2 rounded-2xl bg-white text-gray-900 shadow-sm rounded-bl-md relative transition-all duration-200">
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

// Функция для генерации уникальных ID сообщений
const generateMessageId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

const InlineVideoCards = ({ ids, messageTimestamp }: { ids: string[]; messageTimestamp?: Date }) => {
  const { jobs } = useVideoJobs();
  if (!ids.length) return null;
  const messageAgeSec = messageTimestamp ? (Date.now() - messageTimestamp.getTime()) / 1000 : Infinity;
  const isRecent = messageAgeSec < 90;
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {ids.map((id, i) => {
        if (id === 'pending') {
          return <div key={`p-${i}`} className="aspect-video rounded-xl bg-gray-200 animate-pulse" />;
        }
        const job = jobs.find((j) => j.id === id);
        if (!job) {
          // Recent message — show pending placeholder until polling catches up (typical
          // video render = 30-90 sec; useVideoJobs refetches on 'video-job-poll-bump').
          // Old message — likely a hallucinated UUID, render nothing.
          if (isRecent) {
            return <div key={id} className="aspect-video rounded-xl bg-gray-200 animate-pulse" />;
          }
          return null;
        }
        return <VideoJobCard key={id} job={job} compact />;
      })}
    </div>
  );
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  title,
  welcomeMessage,
  initialShowTokens = false,
  preSelectedAssistant,
  onAssistantSelected,
  allAssistants,
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
    // Static files and external URLs open in new tab
    if (url.startsWith('/static/') || url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener');
    } else if (url.startsWith('/')) {
      navigate(url);
    } else {
      window.open(url, '_blank', 'noopener');
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
    img: ({ src, alt }: any) => (
      <div className="not-prose my-2">
        <img
          src={src}
          alt={alt || t('chat.image_alt')}
          className="rounded-xl max-w-full w-72 sm:w-96 object-contain"
          loading="lazy"
        />
        <a
          href={src}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 flex items-center gap-1 text-xs text-forest-600 hover:text-forest-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {t('chat.download')}
        </a>
      </div>
    ),
  }), [handleLinkNavigation]);

  const getChatStorageKey = (assistantId: number | null) => {
    return `chat_messages_assistant_${assistantId || 'default'}`;
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  // chatContainerRef removed — using messagesContainerRef
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileTaskInput, setFileTaskInput] = useState('');
  const [showFileTaskModal, setShowFileTaskModal] = useState(false);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [isLoadingAssistants, setIsLoadingAssistants] = useState(true);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(() => {
    const saved = sessionStorage.getItem('selected_assistant');
    if (saved) {
      return JSON.parse(saved);
    }
    return null;
  });
  const [showAssistantDropdown, setShowAssistantDropdown] = useState(false);
  const [hasUserSelectedAssistant, setHasUserSelectedAssistant] = useState<boolean>(() => {
    return sessionStorage.getItem('selected_assistant') !== null;
  });
  const [showTokenPackages, setShowTokenPackages] = useState(initialShowTokens);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [assistantSwitchNotification, setAssistantSwitchNotification] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<number, string>>({});

  // Sync with ChatLayout sidebar selection
  useEffect(() => {
    if (preSelectedAssistant && preSelectedAssistant.id !== selectedAssistant?.id) {
      setSelectedAssistant(preSelectedAssistant as Assistant);
      setHasUserSelectedAssistant(true);
    }
  }, [preSelectedAssistant?.id]);

  // Universal: any change of selectedAssistant.id aborts in-flight stream
  // and clears typing/streaming UI state. Covers all paths that mutate
  // selectedAssistant — external prop, storage event, server sync, internal
  // handler — so the new assistant's view never inherits the old stream.
  const prevSelectedAssistantIdRef = useRef<number | null>(null);
  const selectedAssistantIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedAssistantIdRef.current = selectedAssistant?.id ?? null;
    const newId = selectedAssistant?.id ?? null;
    const prevId = prevSelectedAssistantIdRef.current;
    if (prevId !== null && newId !== prevId) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsTyping(false);
      setCurrentStreamingMessage('');
      setStreamingMessageId(null);
    }
    prevSelectedAssistantIdRef.current = newId;
  }, [selectedAssistant?.id]);

  useEffect(() => {
    if (initialShowTokens) {
      setShowTokenPackages(true);
    }
  }, [initialShowTokens]);

  useEffect(() => {
    if (!selectedAssistant || !hasUserSelectedAssistant) return;

    const load = async () => {
      setHistoryLoading(true);
      setHistoryOffset(0);
      try {
        const response = await apiClient.get(`/webhook/chat/history?assistantId=${selectedAssistant.id}&limit=30&offset=0`);
        if (response.ok) {
          const data = await response.json();
          const msgs = (data.messages || []).map((m: any) => {
            const ids = typeof m.content === 'string' ? extractVideoJobIds(m.content) : [];
            return {
              ...m,
              timestamp: new Date(m.timestamp),
              inlineJobIds: ids.length > 0 ? ids : m.inlineJobIds,
            };
          });
          setMessages(msgs);
          setHasMoreHistory(data.hasMore || false);
          setHistoryOffset(30);
          if (msgs.length === 0) sendInitialGreeting();
        } else {
          throw new Error('API error');
        }
      } catch {
        const saved = localStorage.getItem(getChatStorageKey(selectedAssistant.id));
        if (saved) {
          setMessages(JSON.parse(saved).map((m: any) => {
            const ids = typeof m.content === 'string' ? extractVideoJobIds(m.content) : [];
            return {
              ...m,
              timestamp: new Date(m.timestamp),
              inlineJobIds: ids.length > 0 ? ids : m.inlineJobIds,
            };
          }));
        } else {
          setMessages([]);
          sendInitialGreeting();
        }
      } finally {
        setHistoryLoading(false);
      }
    };

    load();
  }, [selectedAssistant?.id, hasUserSelectedAssistant]);

  // Background polling: подхватывает ответы, которые backend дописал в БД,
  // пока user был на другом ассистенте или закрыл вкладку.
  // Запускается, когда ChatInterface смонтирован для конкретного ассистента
  // и НЕТ активного локального стрима.
  useEffect(() => {
    if (!selectedAssistant || !hasUserSelectedAssistant) return;
    if (isTyping) return; // активный локальный стрим — не дёргаем

    let cancelled = false;
    const assistantId = selectedAssistant.id;

    const poll = async () => {
      try {
        const response = await apiClient.get(`/webhook/chat/history?assistantId=${assistantId}&limit=5&offset=0`);
        if (cancelled || !response.ok) return;
        const data = await response.json();
        const fresh = (data?.messages || []) as any[];
        if (!Array.isArray(fresh) || fresh.length === 0) return;

        setMessages(prev => {
          if (prev.length === 0) return prev; // initial-load обработает
          // Если ассистент уже сменился пока fetch шёл — не вмешиваемся
          if (selectedAssistant?.id !== assistantId) return prev;

          const lastLocal = prev[prev.length - 1];
          const lastLocalTime = lastLocal.timestamp instanceof Date
            ? lastLocal.timestamp.getTime()
            : new Date(lastLocal.timestamp as any).getTime();

          // Дедуп: по id (если backend вернул тот же id, маловероятно но возможно)
          // и по content — локальные сообщения создаются с uuid, в БД хранятся
          // с serial id, поэтому совпадение по id почти не работает. Контентный
          // дедуп берёт последние 8 локальных сообщений с тем же sender_type
          // и сравнивает строки, чтобы не задвоить только что отправленную
          // пару (timestamps локального и БД-копии расходятся на ~50-200мс из-за
          // setImmediate-persist на бэке).
          const existingIds = new Set(prev.map(m => m.id));
          const recentLocal = prev.slice(-8);
          const localContentByRole = new Map<string, Set<string>>();
          for (const m of recentLocal) {
            const role = (m as any).type === 'user' ? 'human' : 'ai';
            const c = (typeof m.content === 'string' ? m.content : '').trim();
            if (!c) continue;
            if (!localContentByRole.has(role)) localContentByRole.set(role, new Set());
            localContentByRole.get(role)!.add(c);
          }

          const newer = fresh.filter((m: any) => {
            const t = new Date(m.timestamp).getTime();
            if (Number.isNaN(t)) return false;
            if (m.id && existingIds.has(m.id)) return false;
            if (t <= lastLocalTime) return false;
            const role = m.type === 'user' ? 'human' : (m.type === 'assistant' ? 'ai' : (m.sender_type || 'ai'));
            const content = (typeof m.content === 'string' ? m.content : '').trim();
            if (content && localContentByRole.get(role)?.has(content)) return false;
            return true;
          });
          if (newer.length === 0) return prev;

          const newMsgs: Message[] = newer.map((m: any) => {
            const ids = typeof m.content === 'string' ? extractVideoJobIds(m.content) : [];
            return {
              ...m,
              timestamp: new Date(m.timestamp),
              inlineJobIds: ids.length > 0 ? ids : m.inlineJobIds,
            };
          });
          return [...prev, ...newMsgs];
        });
      } catch { /* ignore network errors during background poll */ }
    };

    // Первый poll через 3с, затем каждые 8с
    const t1 = setTimeout(poll, 3000);
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearInterval(id);
    };
  }, [selectedAssistant?.id, hasUserSelectedAssistant, isTyping]);

  const sendInitialGreeting = async () => {
    if (!selectedAssistant) return;

    if (lastChangedAgentRef.current !== selectedAssistant.name) {
      isChangingAgentRef.current = true;
      lastChangedAgentRef.current = selectedAssistant.name;
      await changeAgentOnServer(selectedAssistant.name);
      await new Promise(resolve => setTimeout(resolve, 500));
      isChangingAgentRef.current = false;
    }

    const greetingMessage = t('chat.initial_greeting');
    await sendMessageToAI(greetingMessage);
  };

  const loadMoreHistory = async () => {
    if (!selectedAssistant || loadingMore || !hasMoreHistory) return;
    setLoadingMore(true);
    try {
      const response = await apiClient.get(`/webhook/chat/history?assistantId=${selectedAssistant.id}&limit=30&offset=${historyOffset}`);
      if (response.ok) {
        const data = await response.json();
        const older = (data.messages || []).map((m: any) => {
          const ids = typeof m.content === 'string' ? extractVideoJobIds(m.content) : [];
          return {
            ...m,
            timestamp: new Date(m.timestamp),
            inlineJobIds: ids.length > 0 ? ids : m.inlineJobIds,
          };
        });
        if (older.length > 0) {
          const container = messagesContainerRef.current;
          const prevHeight = container?.scrollHeight || 0;
          setMessages(prev => [...older, ...prev]);
          setHistoryOffset(prev => prev + 30);
          setHasMoreHistory(data.hasMore || false);
          // Restore scroll position after prepending
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight - prevHeight;
            }
          });
        } else {
          setHasMoreHistory(false);
        }
      }
    } catch (e) {
      console.error('Error loading more history:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleChatScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop < 100 && hasMoreHistory && !loadingMore) {
      loadMoreHistory();
    }
  };


  useEffect(() => {
    const fetchAssistants = async () => {
      try {
        const response = await apiClient.get('/webhook/agents');
        if (response.ok) {
          const data = await response.json();
          setAssistants(data);

          const urls: Record<number, string> = {};
          await Promise.all(
            data.map(async (assistant: Assistant) => {
              try {
                const url = await avatarService.getAvatarUrl(assistant.id);
                urls[assistant.id] = url;
              } catch (error) {
                console.error(`Failed to load avatar for ${assistant.name}:`, error);
              }
            })
          );
          setAvatarUrls(urls);

          if (user?.preferredAgent && !hasUserSelectedAssistant) {
            const preferredAssistant = data.find((a: Assistant) => a.name === user.preferredAgent);
            if (preferredAssistant) {
              setSelectedAssistant(preferredAssistant);
              setHasUserSelectedAssistant(true);
            }
          }
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
  }, [user?.preferredAgent, hasUserSelectedAssistant]);

  // Флаг для предотвращения бесконечного цикла переключений
  const isChangingAgentRef = useRef(false);
  const lastChangedAgentRef = useRef<string | null>(null);

  const changeAgentOnServer = useCallback(async (agentName: string) => {
    if (!user?.phone) return;

    try {
      const response = await apiClient.post('/webhook/change-agent', {
        agent: agentName
      });

      if (!response.ok) {
        console.error('Failed to change agent on server');
      }
    } catch (error) {
      console.error('Error changing agent on server:', error);
    }
  }, [user?.phone]);

  useEffect(() => {
    if (selectedAssistant && !isChangingAgentRef.current) {
      // Проверяем, что это действительно новое значение
      if (lastChangedAgentRef.current !== selectedAssistant.name) {
        isChangingAgentRef.current = true;
        lastChangedAgentRef.current = selectedAssistant.name;
        sessionStorage.setItem('selected_assistant', JSON.stringify(selectedAssistant));

        changeAgentOnServer(selectedAssistant.name).finally(() => {
          // Сбрасываем флаг после небольшой задержки, чтобы дать серверу время обновиться
          setTimeout(() => {
            isChangingAgentRef.current = false;
          }, 2000);
        });
      }
    }
  }, [selectedAssistant, changeAgentOnServer]);

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

  // Per-tab independence: вкладки больше НЕ синхронизируются через server polling
  // и cross-tab storage event. Каждая вкладка хранит выбор в sessionStorage и
  // живёт со своим ассистентом независимо. Server.preferred_agent обновляется
  // последним выбором в любой вкладке — для дефолта при логине на новом устройстве.

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
        id: generateMessageId(),
        type: 'assistant',
        content: welcomeMessage,
        timestamp: new Date()
      }]);
    }
  }, [welcomeMessage, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
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
          alert(t('chat.voice_error', { error: event.error }));
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
    const assistantMessageId = generateMessageId();
    setStreamingMessageId(assistantMessageId);

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    // Capture assistant id at send time — if user switches assistants during
    // streaming, callbacks must NOT write into the new chat's state.
    const streamAssistantId = selectedAssistant?.id ?? null;

    // Extract phone number from user data and clean it for sessionId
    //const phoneNumber = user?.phone?.replace(/\D/g, '') || 'anonymous';

    // Получаем актуальный ID ассистента из sessionStorage (per-tab) для доп. проверки
    let currentAssistantId = selectedAssistant?.id || 1;
    const savedAssistant = sessionStorage.getItem('selected_assistant');
    if (savedAssistant) {
      try {
        const assistant = JSON.parse(savedAssistant);
        currentAssistantId = assistant.id;
      } catch (error) {
        console.error('Error parsing assistant from sessionStorage:', error);
      }
    }

    // Принудительно обновляем access token перед запросом к чату
    try {
      await apiClient.refreshTokenIfNeeded();
    } catch (error) {
      console.warn('Failed to refresh token before chat request:', error);
      // Продолжаем выполнение, так как запрос сам обработает ошибку авторизации
    }

    try {
      const response = await apiClient.post('/webhook/soulmate/chat', {
        chatInput: userMessage,
        assistant: currentAssistantId
      }, {
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
      const inlineJobIds: string[] = [];
      let lastUpdate = Date.now();
      const updateInterval = 50;
      let buffer = '';
      let lastUsage: { total?: number } | null = null;

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          buffer += new TextDecoder().decode(value);
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'begin' && data.metadata?.nodeName === 'Image Echo Agent') {
              setIsGeneratingImage(true);
            }
            if (data.type === 'item' && data.content) {
              accumulatedContent += data.content;
              // Parse [VIDEO_JOB:<uuid>] markers from full accumulated text (stream-safe:
              // a marker may be split across chunks; matching the whole buffer is robust).
              const matches = accumulatedContent.matchAll(/\[VIDEO_JOB:([0-9a-f-]{36})\]/gi);
              for (const m of matches) {
                const jobId = m[1];
                if (!inlineJobIds.includes(jobId)) {
                  inlineJobIds.push(jobId);
                  // Trigger immediate refetch in all <InlineVideoCards> via useVideoJobs hook
                  // so the player appears within ~1s instead of waiting up to 60s.
                  window.dispatchEvent(new CustomEvent('video-job-poll-bump'));
                }
              }
              const now = Date.now();
              if (now - lastUpdate >= updateInterval) {
                if (selectedAssistantIdRef.current === streamAssistantId) {
                  setCurrentStreamingMessage(accumulatedContent);
                }
                lastUpdate = now;
              }
            }
            if (data.type === 'end' && data.usage) {
              lastUsage = data.usage;
            }
            if (data.type === 'tool_start' && data.tool === 'generate_video') {
              inlineJobIds.push('pending');
            }
            if (data.type === 'tool_result' && data.tool === 'generate_video') {
              const idx = inlineJobIds.lastIndexOf('pending');
              if (idx >= 0) {
                if (data.result?.ok && data.result?.kind === 'video' && data.result?.jobId) {
                  inlineJobIds[idx] = data.result.jobId;
                } else {
                  inlineJobIds.splice(idx, 1);
                  const msg = data.result?.error ? `\n\n*${t('chat.video_gen_error', { error: data.result.error })}*` : '';
                  accumulatedContent += msg;
                }
              }
            }
            if (data.type === 'tool_result' && data.tool === 'generate_scenarios') {
              const scenarios = data.result?.scenarios as Array<{ id: string; title: string }> | undefined;
              if (Array.isArray(scenarios)) {
                for (const sc of scenarios) {
                  accumulatedContent += `\n\n{{smm_scenario:id=${sc.id}}}`;
                }
              } else if (data.result?.error) {
                accumulatedContent += `\n\n*Ошибка генерации сценариев: ${data.result.error}*`;
              }
            }
            if (data.type === 'tool_result' && data.tool === 'approve_scenarios') {
              const approved = data.result?.approved as Array<{ scenarioId: string; videoId: string }> | undefined;
              const failed = data.result?.failed as Array<{ scenarioId: string; reason: string }> | undefined;
              if (Array.isArray(approved)) {
                for (const a of approved) {
                  accumulatedContent += `\n\n{{smm_video:id=${a.videoId}}}`;
                }
              }
              if (Array.isArray(failed) && failed.length > 0) {
                for (const f of failed) {
                  accumulatedContent += `\n\n*Не утверждено (${f.reason}): ${f.scenarioId.slice(0, 8)}…*`;
                }
              }
            }
            if (data.type === 'tool_result' && data.tool === 'regenerate_scenario') {
              const sid = data.result?.scenarioId;
              if (sid) {
                accumulatedContent += `\n\n{{smm_scenario:id=${sid}}}`;
              }
            }
            if (data.type === 'tool_result' && data.tool === 'connect_social') {
              const result = data.result as { platform?: string; method?: 'oauth' | 'manual'; authorizeUrl?: string } | undefined;
              if (result?.method === 'oauth' && result.authorizeUrl) {
                accumulatedContent += `\n\n{{smm_social_connect_button:platform=${result.platform},authorize_url=${result.authorizeUrl}}}`;
              } else if (result?.method === 'manual' && result.platform === 'telegram') {
                accumulatedContent += `\n\n{{smm_social_connect_telegram}}`;
              }
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }

        if (done) {
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              if (data.type === 'item' && data.content) {
                accumulatedContent += data.content;
              }
            } catch (e) { /* ignore */ }
          }
          break;
        }
      }

      // Only commit to UI state if user is still on the assistant that initiated the stream.
      if (selectedAssistantIdRef.current === streamAssistantId) {
        setCurrentStreamingMessage(accumulatedContent);
        const completedMessage: Message = {
          id: assistantMessageId,
          type: 'assistant',
          content: accumulatedContent,
          timestamp: new Date(),
          isStreaming: false,
          tokensUsed: lastUsage?.total || undefined,
          inlineJobIds: inlineJobIds.length > 0 ? [...inlineJobIds] : undefined,
        };
        setMessages(prev => [...prev, completedMessage]);
        setStreamingMessageId(null);
      }
      // If user switched — backend has already saved to chat_history; polling
      // on the original assistant's view will surface the response on return.

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }

      console.error('Error sending message to AI:', error);

      // Only show error in UI if user is still on the originating chat
      if (selectedAssistantIdRef.current === streamAssistantId) {
        const errorMessage: Message = {
          id: generateMessageId(),
          type: 'assistant',
          content: t('chat.ai_error_fallback'),
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      // Only clear typing state if user is still on the originating chat;
      // otherwise the universal-switch effect has already reset it for the new chat.
      if (selectedAssistantIdRef.current === streamAssistantId) {
        setIsTyping(false);
        setIsGeneratingImage(false);
        setCurrentStreamingMessage('');
        setStreamingMessageId(null);
      }
      abortControllerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Intentionally NOT aborting on unmount — backend continues processing
      // and saves the response to chat_history asynchronously. When user returns
      // to this assistant, history reload + polling will surface the result.
      abortControllerRef.current = null;
    };
  }, []);

  const sendMessageText = async (text: string) => {
    if (!text.trim() || isTyping) return;

    // Проверяем актуальность выбранного ассистента перед отправкой (per-tab)
    const savedAssistant = sessionStorage.getItem('selected_assistant');
    if (savedAssistant) {
      try {
        const currentAssistant = JSON.parse(savedAssistant);
        // Если ассистент изменился, обновляем состояние
        if (selectedAssistant?.id !== currentAssistant.id) {
          setSelectedAssistant(currentAssistant);
          // changeAgentOnServer будет вызван автоматически через useEffect
          // Показываем уведомление
          setAssistantSwitchNotification(t('chat.switched_to', { name: currentAssistant.name }));
          setTimeout(() => setAssistantSwitchNotification(null), 3000);
        }
      } catch (error) {
        console.error('Error checking assistant before send:', error);
      }
    }

    const userMessage: Message = {
      id: generateMessageId(),
      type: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    await sendMessageToAI(text);
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const text = input;
    setInput('');
    await sendMessageText(text);
  };

  const handleClearChat = async () => {
    if (window.confirm(t('chat.clear_confirm'))) {
      setMessages([]);
      if (selectedAssistant) {
        localStorage.removeItem(getChatStorageKey(selectedAssistant.id));
        try {
          await apiClient.delete(`/webhook/chat/history?assistantId=${selectedAssistant.id}`);
        } catch (error) {
          console.error('Failed to delete chat history from server:', error);
        }
      }
      if (welcomeMessage) {
        setMessages([{
          id: generateMessageId(),
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
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = messages[lastUserMessageIndex];
    
    // Remove all messages after the last user message
    const newMessages = messages.slice(0, lastUserMessageIndex + 1);
    setMessages(newMessages);
    
    // Regenerate response
    await sendMessageToAI(lastUserMessage.content);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
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
      alert(t('chat.voice_not_supported'));
      return;
    }

    if (isRecording) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  // Маша (id=3) идёт через legacy chat.streamChat и НЕ имеет доступа к file-agent;
  // для неё пока оставляем PDF→profile-scan flow. Все остальные ассистенты идут
  // через r.linkeon.io (Claude Code + Python/Bash) и могут принимать любые файлы:
  // транскрибация аудио (whisper), парсинг docx/xlsx (pandoc/openpyxl), картинки
  // (vision), архивы, и т.д.
  const supportsUniversalFiles = selectedAssistant?.id !== 3;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) fileInputRef.current.value = '';

    if (supportsUniversalFiles) {
      // Универсальный flow: для любого файла показываем модалку с заданием.
      setPendingFile(file);
      setFileTaskInput('');
      setShowFileTaskModal(true);
      return;
    }

    // Legacy PDF-only path для Маши: scan-document → extracted profile data.
    if (file.type !== 'application/pdf') {
      alert(t('chat.pdf_only'));
      return;
    }

    setIsUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post('/webhook/scan-document', formData);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('File upload error:', { status: response.status, errorText });
        throw new Error(`Ошибка загрузки файла: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const profileData = result.output;

      let profileText = '📄 **Данные из документа обработаны:**\n\n';
      if (profileData.name && profileData.family_name) profileText += `**Имя:** ${profileData.name} ${profileData.family_name}\n`;
      for (const [key, label] of [['profile','Профиль'],['values','Ценности'],['skills','Навыки'],['beliefs','Убеждения'],['desires','Желания'],['interests','Интересы'],['intents','Поиск людей']] as const) {
        if (profileData[key]?.length > 0) {
          profileText += `\n**${label}:**\n`;
          profileData[key].forEach((item: string) => { profileText += `• ${item}\n`; });
        }
      }

      const userMessage: Message = { id: generateMessageId(), type: 'user', content: `Загружен файл: ${file.name}`, timestamp: new Date() };
      setMessages(prev => [...prev, userMessage]);

      const prompt = `Пользователь загрузил документ "${file.name}". Вот извлечённые данные:\n\n${profileText}\n\nЧто ты можешь предложить сделать с этой информацией?`;
      await sendMessageToAI(prompt);

    } catch (error) {
      console.error('Error uploading file:', error);
      const errorMessage = error instanceof Error ? error.message : t('chat.file_error_unknown');
      alert(t('chat.file_upload_error_generic', { error: errorMessage }));
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleFileTaskSubmit = async () => {
    if (!pendingFile || !fileTaskInput.trim()) return;

    setShowFileTaskModal(false);
    const file = pendingFile;
    const task = fileTaskInput.trim();
    setPendingFile(null);
    setFileTaskInput('');

    const userMessage: Message = { id: generateMessageId(), type: 'user', content: `📎 ${file.name}\n\n${task}`, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);

    // Check if text file — send inline, otherwise upload via multipart
    const textTypes = ['text/', 'application/json', 'application/xml', 'application/csv', 'text/csv'];
    const isTextFile = (textTypes.some(t => file.type.startsWith(t)) || !!file.name.match(/\.(txt|csv|json|xml|md|html|css|js|ts|py|sh|yaml|yml|toml|ini|cfg|log|sql)$/i)) && file.size < 500000;

    if (isTextFile) {
      try {
        const text = await file.text();
        const prompt = `Пользователь загрузил файл "${file.name}".\n\nСодержимое:\n\`\`\`\n${text.slice(0, 50000)}\n\`\`\`\n\nЗадание: ${task}`;
        await sendMessageToAI(prompt);
      } catch {
        await sendMessageToAI(`Файл "${file.name}" — не удалось прочитать. Задание: ${task}`);
      }
      return;
    }

    // Binary file — upload to server via multipart endpoint
    setIsTyping(true);
    const assistantMsgId = generateMessageId();
    setStreamingMessageId(assistantMsgId);
    setCurrentStreamingMessage('');

    try {
      await apiClient.refreshTokenIfNeeded();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('message', task);
      formData.append('assistantId', String(selectedAssistant?.id || 'Роман'));

      const response = await apiClient.post('/webhook/agent/upload-and-chat', formData);

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body reader');

      let accumulatedContent = '';
      let buffer = '';
      let lastTokensUsed = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += new TextDecoder().decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'item' && event.content) {
              accumulatedContent += event.content;
              setCurrentStreamingMessage(accumulatedContent);
            } else if (event.type === 'end') {
              accumulatedContent = event.content || accumulatedContent;
              lastTokensUsed = event.usage?.total || 0;
            }
          } catch {}
        }
      }

      const assistantMsg: Message = {
        id: assistantMsgId,
        type: 'assistant',
        content: accumulatedContent,
        timestamp: new Date(),
        tokensUsed: lastTokensUsed,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      const errMsg: Message = {
        id: assistantMsgId,
        type: 'assistant',
        content: t('chat.file_error_fallback'),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
      setStreamingMessageId(null);
      setCurrentStreamingMessage('');
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
    sessionStorage.setItem('selected_assistant', JSON.stringify(assistant));

    await sendInitialGreeting();
  };

  const handleSwitchAssistant = async (assistant: Assistant) => {
    if (selectedAssistant?.id === assistant.id) {
      setShowAssistantDropdown(false);
      return;
    }

    // Abort активный fetch — UI чистится сразу (isTyping=false), backend продолжит
    // читать r.linkeon.io (clientDisconnected detection) и сохранит ответ в БД.
    // При возврате на этого ассистента initial-load + polling поднимут результат.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setCurrentStreamingMessage('');
    setStreamingMessageId(null);
    setIsTyping(false);

    isChangingAgentRef.current = true;
    lastChangedAgentRef.current = assistant.name;

    setSelectedAssistant(assistant);
    sessionStorage.setItem('selected_assistant', JSON.stringify(assistant));
    setShowAssistantDropdown(false);
    // Sync with ChatLayout sidebar
    if (onAssistantSelected) onAssistantSelected(assistant);

    await changeAgentOnServer(assistant.name);

    setAssistantSwitchNotification(t('chat.switched_to', { name: assistant.name }));
    setTimeout(() => setAssistantSwitchNotification(null), 3000);

    setTimeout(() => {
      isChangingAgentRef.current = false;
    }, 1000);
  };

  if (!hasUserSelectedAssistant) {
    // If ChatLayout provides sidebar, show empty state instead of cards
    if (preSelectedAssistant !== undefined) {
      return (
        <div className="h-full flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <p className="text-lg mb-2">{t('chat.select_assistant')}</p>
            <p className="text-sm">{t('chat.select_assistant_hint')}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <AssistantSelection
          assistants={assistants}
          onSelectAssistant={handleSelectAssistant}
          isLoading={isLoadingAssistants}
        />
      </div>
    );
  }

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString();
  };

  return (
    <>
      {showTokenPackages && (
        <TokenPackages onClose={() => setShowTokenPackages(false)} />
      )}

      <div className="flex flex-col h-full bg-gray-50 relative" data-testid="chat-root">
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
                <span className="text-sm text-gray-600">{t('common.loading')}</span>
              </div>
            ) : selectedAssistant ? (
              <>
                <button
                  data-testid="assistant-dropdown-btn"
                  onClick={() => setShowAssistantDropdown(!showAssistantDropdown)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-forest-50 hover:bg-forest-100 rounded-lg transition-colors border border-forest-200"
                >
                  {avatarUrls[selectedAssistant.id] ? (
                    <img
                      src={avatarUrls[selectedAssistant.id]}
                      alt={selectedAssistant.name}
                      className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gradient-to-br from-forest-500 to-warm-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">👤</span>
                    </div>
                  )}
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-forest-900">{selectedAssistant.name}</span>
                    <span className="text-xs text-forest-600">{getRoleForAssistant(selectedAssistant.description, t)}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-forest-700" />
                </button>

                {showAssistantDropdown && (
                  <div data-testid="assistant-dropdown-list" className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-[60vh] overflow-y-auto">
                    <div className="py-1">
                      {[...assistants].sort((a, b) => {
                        const order = { assistant: 0, business: 1, personal: 2 };
                        return (order[(a as any).category] ?? 3) - (order[(b as any).category] ?? 3);
                      }).map((assistant) => (
                        <button
                          key={assistant.id}
                          onClick={() => handleSwitchAssistant(assistant)}
                          className={clsx(
                            'w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors',
                            selectedAssistant.id === assistant.id && 'bg-forest-50'
                          )}
                        >
                          <div className="flex items-center space-x-3">
                            {avatarUrls[assistant.id] ? (
                              <img
                                src={avatarUrls[assistant.id]}
                                alt={assistant.name}
                                className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 bg-gradient-to-br from-forest-500 to-warm-500 rounded-full flex items-center justify-center flex-shrink-0 text-xl">
                                👤
                              </div>
                            )}
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
                title={t('chat.tokens_top_up_title')}
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
                  title={t('chat.regenerate_title')}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleClearChat}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title={t('chat.clear_title')}
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
        className="flex-1 overflow-y-auto px-4 space-y-4 min-h-0 pt-20 md:pt-4 pb-4"
        ref={messagesContainerRef}
        onScroll={handleChatScroll}
        style={{ willChange: 'scroll-position' }}
        data-testid="chat-messages-list"
      >
        {loadingMore && (
          <div className="flex items-center justify-center py-3">
            <div className="w-5 h-5 border-2 border-forest-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-2 text-xs text-gray-400">{t('chat.loading_history')}</span>
          </div>
        )}
        {hasMoreHistory && !loadingMore && (
          <div className="flex items-center justify-center py-2">
            <button onClick={loadMoreHistory} className="text-xs text-forest-500 hover:text-forest-700">{t('chat.load_more')}</button>
          </div>
        )}
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-forest-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.map((message) => (
          <div
            key={message.id}
            data-testid="chat-message"
            className={clsx(
              'flex',
              message.type === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={clsx(
                'px-4 py-2 rounded-2xl',
                message.type === 'user'
                  ? 'max-w-xs sm:max-w-md bg-forest-600 text-white rounded-br-md'
                  : 'max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl bg-white text-gray-900 shadow-sm rounded-bl-md relative'
              )}
            >
              {message.type === 'assistant' && message.messageType === 'image' ? (
                <div className="text-sm">
                  {message.content && (
                    <p className="mb-2 text-gray-700">{message.content}</p>
                  )}
                  <img
                    src={message.imageUrl}
                    alt="Generated image"
                    className="rounded-xl max-w-full w-64 sm:w-80 object-contain"
                    loading="lazy"
                  />
                </div>
              ) : message.type === 'assistant' ? (
                <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                  {(() => {
                    const contentForRender = stripVideoJobMarkers(message.content);
                    const { content: parsedContent, buttons, links, videos, smmScenarios, smmVideos, socialButtons, socialTelegrams } = parseCustomMarkdown(contentForRender);
                    const parts: React.ReactNode[] = [];
                    let lastIndex = 0;
                    const buttonMatches = [...parsedContent.matchAll(/__BUTTON_(\w+)__/g)];
                    const linkMatches = [...parsedContent.matchAll(/__LINK_(\w+)__/g)];
                    const videoMatches = [...parsedContent.matchAll(/__VIDEO_(\w+)__/g)];
                    const smmScenarioMatches = [...parsedContent.matchAll(/__SMM_SCENARIO_([\w-]+)__/g)];
                    const smmVideoMatches = [...parsedContent.matchAll(/__SMM_VIDEO_([\w-]+)__/g)];
                    const socialButtonMatches = [...parsedContent.matchAll(/__SOCIAL_BUTTON_(\w+)__/g)];
                    const socialTelegramMatches = [...parsedContent.matchAll(/__SOCIAL_TELEGRAM_(\w+)__/g)];

                    const allMatches = [...buttonMatches, ...linkMatches, ...videoMatches, ...smmScenarioMatches, ...smmVideoMatches, ...socialButtonMatches, ...socialTelegramMatches].sort((a, b) => (a.index || 0) - (b.index || 0));

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
                      } else if (match[0].startsWith('__VIDEO_')) {
                        const videoId = match[1];
                        const videoSrc = videos.get(`video_${videoId}`);
                        if (videoSrc) {
                          parts.push(
                            <span key={`video-${idx}`}>
                              {createVideoComponent(videoSrc, `v-hist-${idx}`)}
                            </span>
                          );
                        }
                      } else if (match[0].startsWith('__SMM_SCENARIO_')) {
                        const key = match[1];
                        const scenarioId = smmScenarios.get(key);
                        if (scenarioId) {
                          parts.push(
                            <div key={`smm-scenario-${idx}`}>
                              <ScenarioCard scenarioId={scenarioId} />
                            </div>
                          );
                        }
                      } else if (match[0].startsWith('__SMM_VIDEO_')) {
                        const key = match[1];
                        const vid = smmVideos.get(key);
                        if (vid) {
                          parts.push(
                            <div key={`smm-video-${idx}`}>
                              <SmmVideoPlayer videoId={vid} />
                            </div>
                          );
                        }
                      } else if (match[0].startsWith('__SOCIAL_BUTTON_')) {
                        const key = match[1];
                        const cfg = socialButtons.get(key);
                        if (cfg) {
                          parts.push(
                            <div key={`social-btn-${idx}`}>
                              <SocialConnectButton platform={cfg.platform as SmmPlatform} authorizeUrl={cfg.authorizeUrl} />
                            </div>
                          );
                        }
                      } else if (match[0].startsWith('__SOCIAL_TELEGRAM_')) {
                        const key = match[1];
                        if (socialTelegrams.has(key)) {
                          parts.push(
                            <div key={`social-tg-${idx}`}>
                              <TelegramConnectForm onConnected={(displayName) => {
                                sendMessageText(`Telegram подключил (${displayName}), продолжай.`);
                              }} />
                            </div>
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
                        {contentForRender}
                      </ReactMarkdown>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-sm leading-relaxed">{message.content}</p>
              )}
              {message.type === 'assistant' && message.inlineJobIds && message.inlineJobIds.length > 0 && (
                <InlineVideoCards ids={message.inlineJobIds} messageTimestamp={message.timestamp} />
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
                {message.type === 'assistant' && message.tokensUsed ? (
                  <span className="ml-2 text-gray-400">• {message.tokensUsed.toLocaleString()} {t('chat.tokens_suffix')}</span>
                ) : null}
              </p>
            </div>
          </div>
        ))}

        {streamingMessageId && !historyLoading && (
          isGeneratingImage ? (
            <div className="flex justify-start">
              <div className="max-w-lg px-4 py-3 rounded-2xl bg-white text-gray-900 shadow-sm rounded-bl-md">
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <div className="w-5 h-5 border-2 border-forest-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span>{t('chat.generating_image')}</span>
                </div>
              </div>
            </div>
          ) : (
            <StreamingMessage
              content={stripVideoJobMarkers(currentStreamingMessage)}
              components={markdownComponents}
              onButtonClick={handleButtonAction}
              onLinkClick={handleLinkNavigation}
              onSendMessage={sendMessageText}
            />
          )
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t px-4 py-2 pb-2 md:pb-2 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={supportsUniversalFiles ? '*/*' : '.pdf'}
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
            title={supportsUniversalFiles ? t('chat.upload_any_file') : t('chat.upload_file')}
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
              data-testid="chat-input"
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
                ? t('chat.voice_not_supported_title')
                : isRecording
                  ? t('chat.voice_stop')
                  : t('chat.voice_start')
            }
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            data-testid="chat-send-btn"
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

      {/* File task modal for Роман */}
      {showFileTaskModal && pendingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
            <h3 className="text-lg font-semibold mb-2">{t('chat.file_modal_title')}</h3>
            <div className="bg-gray-50 rounded-lg p-3 mb-3 flex items-center gap-2">
              <span className="text-xl">📎</span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{pendingFile.name}</p>
                <p className="text-xs text-gray-500">{(pendingFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <textarea
              value={fileTaskInput}
              onChange={(e) => setFileTaskInput(e.target.value)}
              placeholder={t('chat.file_modal_placeholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-forest-500 focus:border-transparent mb-3"
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleFileTaskSubmit();
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowFileTaskModal(false); setPendingFile(null); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                {t('chat.file_modal_cancel')}
              </button>
              <button
                onClick={handleFileTaskSubmit}
                disabled={!fileTaskInput.trim()}
                className="flex-1 px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('chat.file_modal_submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatInterface;