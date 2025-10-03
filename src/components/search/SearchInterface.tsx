import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../contexts/AuthContext';
import UserProfileModal from './UserProfileModal';
import { Search, Filter, Users, MessageCircle, Heart } from 'lucide-react';
import { clsx } from 'clsx';

interface UserMatch {
  id: string;
  name: string;
  avatar?: string;
  values: string[];
  intents: string[];
  corellation: number;
  phone?: string;
}

const SearchInterface: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  // Используем localStorage для сохранения состояния поиска
  const [searchQuery, setSearchQuery] = useState(() => {
    return localStorage.getItem('search_query') || '';
  });
  const [results, setResults] = useState<UserMatch[]>(() => {
    const saved = localStorage.getItem('search_results');
    return saved ? JSON.parse(saved) : [];
  });
  const [isSearching, setIsSearching] = useState(false);
  const [searchComment, setSearchComment] = useState(() => {
    return localStorage.getItem('search_comment') || '';
  });
  const [hasSearched, setHasSearched] = useState(() => {
    return localStorage.getItem('has_searched') === 'true';
  });
  const [selectedUser, setSelectedUser] = useState<UserMatch | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    // Scroll to top on mobile when component mounts
    window.scrollTo(0, 0);
  }, []);

  // Сохраняем состояние в localStorage при изменениях
  useEffect(() => {
    localStorage.setItem('search_query', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem('search_results', JSON.stringify(results));
  }, [results]);

  useEffect(() => {
    localStorage.setItem('search_comment', searchComment);
  }, [searchComment]);

  useEffect(() => {
    localStorage.setItem('has_searched', hasSearched.toString());
  }, [hasSearched]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchComment('');
    setResults([]);
    setHasSearched(true);
    
    // Очищаем предыдущие результаты из localStorage
    localStorage.removeItem('search_results');
    localStorage.removeItem('search_comment');
    
    // Get user phone number for userId
    const userId = user?.phone?.replace(/\D/g, '') || 'anonymous';
    
    try {
      const response = await fetch('https://travel-n8n.up.railway.app/webhook/search-mate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          userId: userId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      let accumulatedText = '';
      let searchResultFound = false;
      let jsonBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.type === 'item' && data.content) {
              accumulatedText += data.content;
              
              // Check if we've reached the search_result marker
              if (accumulatedText.includes('search_result:')) {
                searchResultFound = true;
                // Extract everything after search_result:
                const searchResultIndex = accumulatedText.indexOf('search_result:');
                const beforeSearchResult = accumulatedText.substring(0, searchResultIndex);
                const afterSearchResult = accumulatedText.substring(searchResultIndex + 'search_result:'.length);
                
                // Update comment with text before search_result
                setSearchComment(beforeSearchResult.trim());
                
                // Start collecting JSON
                jsonBuffer = afterSearchResult;
              } else if (!searchResultFound) {
                // Still collecting comment text
                setSearchComment(accumulatedText);
              } else {
                // Collecting JSON data
                jsonBuffer += data.content;
              }
            }
          } catch (e) {
            // Skip invalid JSON lines
            console.warn('Failed to parse streaming data:', line);
          }
        }
      }
      
      // Parse the final JSON results
      if (searchResultFound && jsonBuffer.trim()) {
        try {
          // Clean up the JSON buffer - remove any trailing text and parse
          let cleanJson = jsonBuffer.trim();
          
          // Remove any trailing non-JSON content
          const lastBraceIndex = cleanJson.lastIndexOf('}');
          const lastBracketIndex = cleanJson.lastIndexOf(']');
          const lastValidIndex = Math.max(lastBraceIndex, lastBracketIndex);
          
          if (lastValidIndex > -1) {
            cleanJson = cleanJson.substring(0, lastValidIndex + 1);
          }
          
          console.log('Parsing JSON:', cleanJson);
          const searchResults = JSON.parse(cleanJson);
          
          if (Array.isArray(searchResults)) {
            const formattedResults: UserMatch[] = searchResults.map((result: any) => ({
              id: result.id || result.userId || result.user_id || Math.random().toString(),
              name: result.name || 'Неизвестный пользователь',
              values: result.values || [],
              intents: result.intents || [],
              corellation: result.corellation || result.correlation || 0,
              phone: result.id || result.userId || result.user_id || null
            }));
            
            console.log('Formatted results:', formattedResults);
            setResults(formattedResults);
          } else if (searchResults && typeof searchResults === 'object') {
            // Handle single result object
            const singleResult: UserMatch = {
              id: searchResults.id || searchResults.userId || searchResults.user_id || Math.random().toString(),
              name: searchResults.name || 'Неизвестный пользователь',
              values: searchResults.values || [],
              intents: searchResults.intents || [],
              corellation: searchResults.corellation || searchResults.correlation || 0,
              phone: searchResults.id || searchResults.userId || searchResults.user_id || null
            };
            
            console.log('Single result:', singleResult);
            setResults([singleResult]);
          } else {
            console.warn('Unexpected search results format:', searchResults);
            setResults([]);
          }
        } catch (jsonError) {
          console.error('Failed to parse search results JSON:', jsonError);
          console.log('Raw JSON buffer:', jsonBuffer);
          console.log('Cleaned JSON:', cleanJson);
          // Fallback to empty results
          setResults([]);
        }
      } else {
        console.log('No search results found in stream');
        setResults([]);
      }
      
    } catch (error) {
      console.error('Error during search:', error);
      setSearchComment('Произошла ошибка при поиске. Попробуйте еще раз.');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-100';
    if (score >= 0.8) return 'text-blue-600 bg-blue-100';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
  };

  const handleChatClick = (user: UserMatch) => {
    if (user.phone) {
      // Очищаем номер телефона от всех символов кроме цифр
      const cleanPhone = user.phone.replace(/\D/g, '');
      // Открываем Telegram с номером телефона
      window.open(`https://t.me/+${cleanPhone}`, '_blank');
    } else {
      alert('Номер телефона пользователя недоступен');
    }
  };

  const handleViewProfile = (user: UserMatch) => {
    setSelectedUser(user);
    setIsProfileModalOpen(true);
  };

  const handleCloseProfileModal = () => {
    setIsProfileModalOpen(false);
    setSelectedUser(null);
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-4 border-b flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900 mb-4">
          {t('search.title')}
        </h1>
        
        {/* Search Bar */}
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('search.placeholder')}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors disabled:opacity-50"
          >
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
          </button>
          <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
        {/* Search Comment */}
        {(searchComment || isSearching) && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                {isSearching ? (
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-5 h-5 text-blue-600 mt-0.5" />
                )}
              </div>
              <div className="flex-1">
                <div className="text-blue-800 text-sm leading-relaxed prose prose-sm max-w-none prose-blue">
                  {isSearching && !searchComment ? (
                    <p>Ищем подходящих людей...</p>
                  ) : (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-blue-900">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="text-sm">{children}</li>,
                        code: ({ children }) => (
                          <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded text-xs font-mono">
                            {children}
                          </code>
                        ),
                        pre: ({ children }) => (
                          <pre className="bg-blue-100 text-blue-900 p-2 rounded text-xs font-mono overflow-x-auto mb-2">
                            {children}
                          </pre>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-blue-300 pl-2 italic text-blue-700 mb-2">
                            {children}
                          </blockquote>
                        ),
                        h1: ({ children }) => <h1 className="text-base font-bold mb-2 text-blue-900">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-2 text-blue-900">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-bold mb-1 text-blue-900">{children}</h3>,
                        br: () => <br />,
                      }}
                    >
                      {searchComment}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!hasSearched && !searchQuery && (
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-forest-600" />
            Начните поиск людей
          </h2>
        )}

        {results.length === 0 && hasSearched && !isSearching ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('search.no_results')}
            </h3>
            <p className="text-gray-600">
              {t('search.try_different')}
            </p>
          </div>
        ) : !hasSearched && !searchQuery ? (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Найдите людей, близких по духу
            </h3>
            <p className="text-gray-600">
              Введите запрос в поисковую строку, чтобы найти единомышленников
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {results.map((user) => (
              <div
                key={user.id}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start space-x-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 bg-gradient-to-br from-forest-500 to-warm-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-semibold text-lg">
                      {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {user.name}
                      </h3>
                      <div className={clsx(
                        'px-2 py-1 rounded-full text-sm font-medium',
                        getScoreColor(user.corellation)
                      )}>
                        {Math.round(user.corellation * 100)}%
                      </div>
                    </div>

                    <p className="text-gray-600 text-sm mb-3">
                      {user.intents[0] || 'Нет описания'}
                    </p>

                    {/* Common Values */}
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 mb-2">
                        Ценности ({user.values.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {user.values.slice(0, 3).map((value, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-forest-50 text-forest-700 text-xs rounded-full"
                          >
                            {value}
                          </span>
                        ))}
                        {user.values.length > 3 && (
                          <span className="px-2 py-1 bg-warm-50 text-warm-700 text-xs rounded-full flex items-center">
                            +{user.values.length - 3}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex space-x-3">
                      <button className="flex-1 px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors text-sm font-medium">
                        onClick={() => handleViewProfile(user)}
                        className="flex-1 px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors text-sm font-medium"
                      >
                      </button>
                      <button 
                        onClick={() => handleChatClick(user)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        title="Написать в Telegram"
                      >
                        <MessageCircle className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Profile Modal */}
      {selectedUser && (
        <UserProfileModal
          user={selectedUser}
          isOpen={isProfileModalOpen}
          onClose={handleCloseProfileModal}
          onStartChat={handleChatClick}
        />
      )}
    </div>
  );
};

export default SearchInterface;