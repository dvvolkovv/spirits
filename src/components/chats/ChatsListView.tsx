import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MessageCircle,
  Users,
  Search,
  Plus,
  UserPlus,
  MoreVertical,
  Clock,
  Heart
} from 'lucide-react';
import { clsx } from 'clsx';

interface Chat {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatar?: string;
  lastMessage?: {
    text: string;
    timestamp: Date;
    senderId: string;
    senderName: string;
  };
  unreadCount: number;
  members: string[];
  isOnline?: boolean;
}

interface Friend {
  id: string;
  name: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen?: Date;
  commonValues: string[];
  matchScore: number;
}

type ChatFilter = 'all' | 'direct' | 'group' | 'friends';

const ChatsListView: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<ChatFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);

  // Mock data for demonstration
  const mockChats: Chat[] = [
    {
      id: '1',
      type: 'direct',
      name: 'Анна Петрова',
      lastMessage: {
        text: 'Привет! Как дела с проектом?',
        timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
        senderId: '1',
        senderName: 'Анна Петрова'
      },
      unreadCount: 2,
      members: ['user', '1'],
      isOnline: true
    },
    {
      id: '2',
      type: 'group',
      name: 'Стартап команда',
      lastMessage: {
        text: 'Встречаемся завтра в 10:00',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        senderId: '3',
        senderName: 'Михаил'
      },
      unreadCount: 0,
      members: ['user', '1', '2', '3']
    },
    {
      id: '3',
      type: 'direct',
      name: 'Елена Васильева',
      lastMessage: {
        text: 'Спасибо за рекомендацию!',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
        senderId: '3',
        senderName: 'Елена Васильева'
      },
      unreadCount: 0,
      members: ['user', '3']
    },
    {
      id: '4',
      type: 'group',
      name: 'Волонтеры экологии',
      lastMessage: {
        text: 'Новое мероприятие на выходных',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
        senderId: '4',
        senderName: 'Дмитрий'
      },
      unreadCount: 1,
      members: ['user', '3', '4', '5', '6']
    }
  ];

  const mockFriends: Friend[] = [
    {
      id: '1',
      name: 'Анна Петрова',
      isOnline: true,
      commonValues: ['Честность', 'Креативность', 'Саморазвитие'],
      matchScore: 95
    },
    {
      id: '2',
      name: 'Михаил Сидоров',
      isOnline: false,
      lastSeen: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      commonValues: ['Семья', 'Путешествия'],
      matchScore: 88
    },
    {
      id: '3',
      name: 'Елена Васильева',
      isOnline: true,
      commonValues: ['Экология', 'Волонтерство', 'Образование'],
      matchScore: 82
    },
    {
      id: '4',
      name: 'Дмитрий Козлов',
      isOnline: false,
      lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      commonValues: ['Технологии', 'Инновации'],
      matchScore: 76
    }
  ];

  useEffect(() => {
    setChats(mockChats);
    setFriends(mockFriends);
  }, []);

  const filteredChats = chats.filter(chat => {
    const matchesSearch = chat.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    switch (activeFilter) {
      case 'direct':
        return chat.type === 'direct' && matchesSearch;
      case 'group':
        return chat.type === 'group' && matchesSearch;
      case 'friends':
        return false; // Friends are shown separately
      default:
        return matchesSearch;
    }
  });

  const filteredFriends = friends.filter(friend =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'сейчас';
    if (diffMins < 60) return `${diffMins}м`;
    if (diffHours < 24) return `${diffHours}ч`;
    if (diffDays < 7) return `${diffDays}д`;
    return date.toLocaleDateString();
  };

  const getAvatarInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) {
      return user.firstName;
    }
    return 'Пользователь';
  };

  const handleChatClick = (chatId: string) => {
    // Navigate to specific chat
    navigate(`/chats/${chatId}`);
  };

  const handleFriendClick = (friendId: string) => {
    // Start chat with friend or open existing chat
    // For now, navigate to a mock chat. In real app, create/find existing chat
    navigate(`/chats/1`);
  };

  const handleNewChat = () => {
    // Open contact picker modal
    console.log('Creating new chat');
  };

  const handleNewGroup = () => {
    // Open group creation modal
    console.log('Creating new group');
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">
            {t('chats.title')}
          </h1>
          <div className="flex space-x-2">
            <button
              onClick={handleNewChat}
              className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              title={t('chats.new_chat')}
            >
              <MessageCircle className="w-5 h-5" />
            </button>
            <button
              onClick={handleNewGroup}
              className="p-2 bg-warm-600 text-white rounded-lg hover:bg-warm-700 transition-colors"
              title={t('chats.new_group')}
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('chats.search_contacts')}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: 'all', label: 'Все', icon: MessageCircle },
            { key: 'friends', label: 'Друзья', icon: Heart },
            { key: 'direct', label: '1:1', icon: Users },
            { key: 'group', label: 'Группы', icon: Users }
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key as ChatFilter)}
              className={clsx(
                'flex-1 flex items-center justify-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                activeFilter === key
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
        {activeFilter === 'friends' ? (
          /* Friends List */
          <div className="space-y-3">
            {filteredFriends.length === 0 ? (
              <div className="text-center py-12">
                <Heart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchQuery ? 'Друзья не найдены' : 'У вас пока нет друзей'}
                </h3>
                <p className="text-gray-600">
                  {searchQuery 
                    ? 'Попробуйте изменить поисковый запрос'
                    : 'Найдите единомышленников в разделе поиска'
                  }
                </p>
              </div>
            ) : (
              filteredFriends.map((friend) => (
                <div
                  key={friend.id}
                  onClick={() => handleFriendClick(friend.id)}
                  className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    {/* Avatar */}
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-warm-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold">
                          {getAvatarInitials(friend.name)}
                        </span>
                      </div>
                      {/* Online indicator */}
                      <div className={clsx(
                        'absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white',
                        friend.isOnline ? 'bg-green-500' : 'bg-gray-400'
                      )} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {friend.name}
                        </h3>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-blue-600 font-medium">
                            {friend.matchScore}%
                          </span>
                          <button className="p-1 text-gray-400 hover:text-gray-600">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-xs text-gray-500 mb-2">
                        {friend.isOnline 
                          ? t('chats.online')
                          : friend.lastSeen 
                            ? `был(а) в сети ${formatTime(friend.lastSeen)}`
                            : 'был(а) в сети давно'
                        }
                      </p>

                      {/* Common values */}
                      <div className="flex flex-wrap gap-1">
                        {friend.commonValues.slice(0, 2).map((value, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded-full"
                          >
                            {value}
                          </span>
                        ))}
                        {friend.commonValues.length > 2 && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                            +{friend.commonValues.length - 2}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Chats List */
          <div className="space-y-2">
            {filteredChats.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchQuery ? 'Чаты не найдены' : 'У вас пока нет чатов'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {searchQuery 
                    ? 'Попробуйте изменить поисковый запрос'
                    : 'Начните общение с единомышленниками'
                  }
                </p>
                {!searchQuery && (
                  <div className="flex justify-center space-x-3">
                    <button
                      onClick={handleNewChat}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
                    >
                      {t('chats.new_chat')}
                    </button>
                    <button
                      onClick={handleNewGroup}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                    >
                      {t('chats.new_group')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => handleChatClick(chat.id)}
                  className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    {/* Avatar */}
                    <div className="relative">
                      {chat.type === 'direct' ? (
                        <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-warm-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-semibold">
                            {getAvatarInitials(chat.name)}
                          </span>
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-gradient-to-br from-warm-500 to-primary-500 rounded-full flex items-center justify-center">
                          <Users className="w-6 h-6 text-white" />
                        </div>
                      )}
                      
                      {/* Online indicator for direct chats */}
                      {chat.type === 'direct' && chat.isOnline && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
                      )}
                      
                      {/* Unread indicator */}
                      {chat.unreadCount > 0 && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">
                            {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {chat.name}
                        </h3>
                        <div className="flex items-center space-x-2">
                          {chat.type === 'group' && (
                            <span className="text-xs text-gray-500">
                              {chat.members.length} {t('chats.members')}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {chat.lastMessage && formatTime(chat.lastMessage.timestamp)}
                          </span>
                        </div>
                      </div>
                      
                      {chat.lastMessage && (
                        <div className="flex items-center space-x-1">
                          {chat.type === 'group' && chat.lastMessage.senderId !== 'user' && (
                            <span className="text-xs text-gray-500">
                              {chat.lastMessage.senderName}:
                            </span>
                          )}
                          <p className={clsx(
                            'text-sm truncate',
                            chat.unreadCount > 0 ? 'text-gray-900 font-medium' : 'text-gray-600'
                          )}>
                            {chat.lastMessage.text}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button for Mobile */}
      <div className="fixed bottom-20 right-4 md:hidden">
        <button
          onClick={handleNewChat}
          className="w-14 h-14 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-colors flex items-center justify-center"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default ChatsListView;