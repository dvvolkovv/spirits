import React, { useState } from 'react';
import SearchInterface from '../components/search/SearchInterface';
import CompatibilityInterface from '../components/search/CompatibilityInterface';
import { Search, Heart } from 'lucide-react';

const NetworkingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'compatibility'>('search');

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 pt-2">
        <button
          onClick={() => setActiveTab('search')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'search'
              ? 'border-forest-600 text-forest-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Search className="w-4 h-4" />
          Поиск людей
        </button>
        <button
          onClick={() => setActiveTab('compatibility')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'compatibility'
              ? 'border-forest-600 text-forest-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Heart className="w-4 h-4" />
          Совместимость
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'search' ? <SearchInterface /> : <CompatibilityInterface />}
      </div>
    </div>
  );
};

export default NetworkingPage;
