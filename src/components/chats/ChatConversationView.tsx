import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft,
  Send,
  Paperclip,
  Mic,
  Phone,
  Video,
  MoreVertical,
  Users,
  Info
} from 'lucide-react';
import { clsx } from 'clsx';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'file';
  status: 'sending' | 'sent' | 'delivered' | 'read';
}

interface Chat {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatar?: string;
  members: Array<{
    id: string;
    name: string;
    avatar?: string;
    isOnline: boolean;
    lastSeen?: Date;
  }>;
  isOnline?: boolean;
  lastSeen?: Date;
}

interface ChatConversationViewProps {
  chatId: string;
}

const ChatConversationView: React.FC<ChatConversationViewProps> = ({ chatId }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mock data
  const mockChats: Record<string, Chat> = {
    '1': {
      id: '1',
      type: 'direct',
      name: 'Анна Петрова',
      members: [
        { id: 'user', name: 'Вы', isOnline: true },
        { id: '1', name: 'Анна Петрова', isOnline: true }
      ],
      isOnline: true
    },
    '2': {
      id: '2',
      type: 'group',
      name: 'Стартап команда',
      members: [
        { id: 'user', name: 'Вы', isOnline: true },
        { id: '1', name: 'Анна Петрова', isOnline: true },
        { id: '2', name: 'Михаил Сидоров', isOnline: false, lastSeen: new Date(Date.now() - 1000 * 60 * 30) },
        { id: '3', name: 'Елена Васильева', isOnline: true }
      ]
    },
    '3': {
      id: '3',
      type: 'direct',
      name: 'Елена Васильева',
      members: [
        { id: 'user', name: 'Вы', isOnline: true },
        { id: '3', name: 'Елена Васильева', isOnline: false, lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 2) }
      ],
      isOnline: false,
      lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 2)
    }
  };

  const mockMessages: Record<string, Message[]> = {
    '1': [
      {
        id: '1',
        senderId: '1',
        senderName: 'Анна Петрова',
        content: 'Привет! Как дела с проектом?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60),
        type: 'text',
        status: 'read'
      },
      {
        id: '2',
        senderId: 'user',
        senderName: 'Вы',
        content: 'Привет! Всё идёт по плану. Завтра должны закончить MVP.',
        timestamp: new Date(Date.now() - 1000 * 60 * 45),
        type: 'text',
        status: 'read'
      },
      {
        id: '3',
        senderId: '1',
        senderName: 'Анна Петрова',
        content: 'Отлично! Не могу дождаться посмотреть результат.',
        timestamp: new Date(Date.now() - 1000 * 60 * 15),
        type: 'text',
        status: 'delivered'
      }
    ],
    '2': [
      {
        id: '1',
        senderId: '3',
        senderName: 'Елена Васильева',
        content: 'Всем привет! Как прошла встреча с инвесторами?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
        type: 'text',
        status: 'read'
      },
      {
        id: '2',
        senderId: '1',
        senderName: 'Анна Петрова',
        content: 'Встреча прошла отлично! Они заинтересованы в нашем проекте.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
        type: 'text',
        status: 'read'
      },
      {
        id: '3',
        senderId: 'user',
        senderName: 'Вы',
        content: 'Супер! Встречаемся завтра в 10:00 для обсуждения деталей?',
        timestamp: new Date(Date.now() - 1000 * 60 * 60),
        type: 'text',
        status: 'read'
      }
    ],
    '3': [
      {
        id: '1',
        senderId: '3',
        senderName: 'Елена Васильева',
        content: 'Спасибо за рекомендацию книги! Очень полезная.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
        type: 'text',
        status: 'read'
      },
      {
        id: '2',
        senderId: 'user',
        senderName: 'Вы',
        content: 'Рад, что понравилась! У автора есть ещё несколько интересных работ.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 23),
        type: 'text',
        status: 'delivered'
      }
    ]
  };

  useEffect(() => {
    const currentChat = mockChats[chatId];
    const currentMessages = mockMessages[chatId] || [];
    
    if (currentChat) {
      setChat(currentChat);
      setMessages(currentMessages);
    }
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !chat) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      senderId: 'user',
      senderName: 'Вы',
      content: input,
      timestamp: new Date(),
      type: 'text',
      status: 'sending'
    };

    setMessages(prev => [...prev, newMessage]);
    setInput('');

    // Simulate message delivery
    setTimeout(() => {
      setMessages(prev => prev.map(msg => 
        msg.id === newMessage.id 
          ? { ...msg, status: 'delivered' as const }
          : msg
      ));
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getAvatarInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const getOnlineStatus = () => {
    if (chat?.type === 'direct') {
      const otherMember = chat.members.find(m => m.id !== 'user');
      if (otherMember?.isOnline) return t('chats.online');
      if (otherMember?.lastSeen) {
        const diffMs = Date.now() - otherMember.lastSeen.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffMins < 60) return `был(а) в сети ${diffMins}м назад`;
        if (diffHours < 24) return `был(а) в сети ${diffHours}ч назад`;
        return 'был(а) в сети давно';
      }
    } else {
      const onlineCount = chat?.members.filter(m => m.isOnline).length || 0;
      return `${onlineCount} из ${chat?.members.length} онлайн`;
    }
    return '';
  };

  if (!chat) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Чат не найден</p>
          <button
            onClick={() => navigate('/chats')}
            className="mt-2 text-blue-600 hover:underline"
          >
            Вернуться к чатам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 border-b flex items-center space-x-3 flex-shrink-0">
        <button
          onClick={() => navigate('/chats')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>

        {/* Avatar */}
        <div className="relative">
          {chat.type === 'direct' ? (
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-teal-500 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {getAvatarInitials(chat.name)}
              </span>
            </div>
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
          )}
          
          {chat.type === 'direct' && chat.isOnline && (
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">
            {chat.name}
          </h1>
          <p className="text-sm text-gray-600 truncate">
            {getOnlineStatus()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {chat.type === 'direct' && (
            <>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Phone className="w-5 h-5 text-gray-600" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Video className="w-5 h-5 text-gray-600" />
              </button>
            </>
          )}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Info className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.map((message, index) => {
          const isOwn = message.senderId === 'user';
          const showAvatar = !isOwn && (
            index === 0 || 
            messages[index - 1].senderId !== message.senderId ||
            (message.timestamp.getTime() - messages[index - 1].timestamp.getTime()) > 5 * 60 * 1000
          );
          
          return (
            <div
              key={message.id}
              className={clsx(
                'flex',
                isOwn ? 'justify-end' : 'justify-start'
              )}
            >
              {!isOwn && (
                <div className="w-8 mr-2 flex-shrink-0">
                  {showAvatar && (
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-teal-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold text-xs">
                        {getAvatarInitials(message.senderName)}
                      </span>
                    </div>
                  )}
                </div>
              )}
              
              <div className={clsx(
                'max-w-xs sm:max-w-md',
                isOwn ? 'ml-8' : 'mr-8'
              )}>
                {!isOwn && showAvatar && chat.type === 'group' && (
                  <p className="text-xs text-gray-500 mb-1 ml-3">
                    {message.senderName}
                  </p>
                )}
                
                <div
                  className={clsx(
                    'px-4 py-2 rounded-2xl',
                    isOwn
                      ? 'bg-forest-600 text-white rounded-br-md'
                      : 'bg-white text-gray-900 shadow-sm rounded-bl-md'
                  )}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  <div className={clsx(
                    'flex items-center justify-between mt-1',
                    isOwn ? 'text-forest-100' : 'text-gray-500'
                  )}>
                    <span className="text-xs">
                      {formatTime(message.timestamp)}
                    </span>
                    {isOwn && (
                      <div className="flex items-center space-x-1">
                        {message.status === 'sending' && (
                          <div className="w-3 h-3 border border-forest-200 border-t-transparent rounded-full animate-spin" />
                        )}
                        {message.status === 'sent' && (
                          <div className="w-3 h-3 border border-forest-200 rounded-full" />
                        )}
                        {message.status === 'delivered' && (
                          <div className="w-3 h-3 bg-forest-200 rounded-full" />
                        )}
                        {message.status === 'read' && (
                          <div className="w-3 h-3 bg-forest-200 rounded-full border-2 border-forest-100" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="w-8 mr-2 flex-shrink-0" />
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
      <div className="bg-white border-t px-4 py-3">
        <div className="flex items-end space-x-2">
          <button className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
            <Paperclip className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('chat.placeholder')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
          </div>

          <button className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
            <Mic className="w-5 h-5" />
          </button>

          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              input.trim()
                ? 'bg-forest-600 text-white hover:bg-forest-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Chat Info Sidebar */}
      {showInfo && (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-lg border-l z-50 overflow-y-auto">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {chat.type === 'group' ? t('chats.group_info') : 'Информация'}
              </h2>
              <button
                onClick={() => setShowInfo(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-6">
            {/* Chat Avatar and Name */}
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-3">
                {chat.type === 'direct' ? (
                  <span className="text-white font-semibold text-xl">
                    {getAvatarInitials(chat.name)}
                  </span>
                ) : (
                  <Users className="w-10 h-10 text-white" />
                )}
              </div>
              <h3 className="text-xl font-semibold text-gray-900">{chat.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{getOnlineStatus()}</p>
            </div>

            {/* Members */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                {t('chats.members')} ({chat.members.length})
              </h4>
              <div className="space-y-2">
                {chat.members.map((member) => (
                  <div key={member.id} className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-teal-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold text-xs">
                          {getAvatarInitials(member.name)}
                        </span>
                      </div>
                      {member.isOnline && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-500">
                        {member.isOnline ? t('chats.online') : 'не в сети'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {chat.type === 'group' && (
                <>
                  <button className="w-full px-4 py-2 text-left text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    {t('chats.add_members')}
                  </button>
                  <button className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    {t('chats.leave_group')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatConversationView;