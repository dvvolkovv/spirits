import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, Users, MessageCircle, Heart } from 'lucide-react';
import { clsx } from 'clsx';

interface UserMatch {
  id: string;
  name: string;
  avatar?: string;
  matchScore: number;
  commonValues: string[];
  isComplementary: boolean;
  topIntent: string;
}

const SearchInterface: React.FC = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<UserMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Mock data for recommendations
  const mockRecommendations: UserMatch[] = [
    {
      id: '1',
      name: 'Анна Петрова',
      matchScore: 95,
      commonValues: ['Честность', 'Креативность', 'Саморазвитие'],
      isComplementary: true,
      topIntent: 'Ищет партнера для стартапа'
    },
    {
      id: '2',
      name: 'Михаил Сидоров',
      matchScore: 88,
      commonValues: ['Семья', 'Путешествия'],
      isComplementary: false,
      topIntent: 'Хочет найти единомышленников'
    },
    {
      id: '3',
      name: 'Елена Васильева',
      matchScore: 82,
      commonValues: ['Экология', 'Волонтерство', 'Образование'],
      isComplementary: true,
      topIntent: 'Планирует социальный проект'
    },
    {
      id: '4',
      name: 'Дмитрий Козлов',
      matchScore: 76,
      commonValues: ['Технологии', 'Инновации'],
      isComplementary: false,
      topIntent: 'Изучает искусственный интеллект'
    }
  ];

  useEffect(() => {
    // Load initial recommendations
    setResults(mockRecommendations);
    
    // Scroll to top on mobile when component mounts
    window.scrollTo(0, 0);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    
    // Simulate search delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Filter results based on query
    const filtered = mockRecommendations.filter(user => 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.commonValues.some(value => 
        value.toLowerCase().includes(searchQuery.toLowerCase())
      ) ||
      user.topIntent.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    setResults(filtered);
    setIsSearching(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-100';
    if (score >= 80) return 'text-blue-600 bg-blue-100';
    if (score >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
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
        {!searchQuery && (
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2 text-forest-600" />
            {t('search.recommendations')}
          </h2>
        )}

        {results.length === 0 && searchQuery ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('search.no_results')}
            </h3>
            <p className="text-gray-600">
              {t('search.try_different')}
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
                        getScoreColor(user.matchScore)
                      )}>
                        {user.matchScore}%
                      </div>
                    </div>

                    <p className="text-gray-600 text-sm mb-3">
                      {user.topIntent}
                    </p>

                    {/* Common Values */}
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 mb-2">
                        {user.commonValues.length} {t('search.common_values')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {user.commonValues.map((value, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-forest-50 text-forest-700 text-xs rounded-full"
                          >
                            {value}
                          </span>
                        ))}
                        {user.isComplementary && (
                          <span className="px-2 py-1 bg-warm-50 text-warm-700 text-xs rounded-full flex items-center">
                            <Heart className="w-3 h-3 mr-1" />
                            {t('search.complementary')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex space-x-3">
                      <button className="flex-1 px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors text-sm font-medium">
                        {t('search.view_profile')}
                      </button>
                      <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
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
    </div>
  );
};

export default SearchInterface;