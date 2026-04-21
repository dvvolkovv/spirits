import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { avatarService } from '../../services/avatarService';

interface Assistant {
  id: number;
  name: string;
  description: string;
  category?: string;
}

interface AssistantSelectionProps {
  assistants: Assistant[];
  onSelectAssistant: (assistant: Assistant) => void;
  isLoading: boolean;
}

const getRoleForAssistant = (description: string): string => {
  if (description.includes('Коуч')) return 'Коуч';
  if (description.includes('Психолог')) return 'Психолог';
  if (description.includes('Игропрактик')) return 'Игропрактик';
  if (description.includes('Астролог')) return 'Астролог';
  if (description.includes('Human Design')) return 'Human Design';
  if (description.includes('Бухгалтер')) return 'Бухгалтер';
  if (description.includes('Юрист')) return 'Юрист';
  return 'Ассистент';
};

const AssistantCard: React.FC<{ assistant: Assistant; avatarUrl?: string; onSelect: (a: Assistant) => void }> = ({ assistant, avatarUrl, onSelect }) => (
  <button
    onClick={() => onSelect(assistant)}
    className="group bg-white rounded-2xl p-4 md:p-6 shadow-md hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-blue-500 hover:scale-105 active:scale-95 text-left"
  >
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-3 md:mb-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt={assistant.name} className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover shadow-lg ring-4 ring-white group-hover:ring-blue-100 transition-all duration-300" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-blue-500 to-pink-500 shadow-lg ring-4 ring-white group-hover:ring-blue-100 transition-all duration-300 flex items-center justify-center">
            <span className="text-2xl md:text-3xl">👤</span>
          </div>
        )}
        <div className="absolute -bottom-2 -right-2 w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-blue-500 to-pink-500 rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
          <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
        </div>
      </div>
      <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-1">{assistant.name}</h3>
      <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full mb-3">{getRoleForAssistant(assistant.description)}</span>
      <p className="text-xs md:text-sm text-gray-600 leading-relaxed line-clamp-3">{assistant.description}</p>
      <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-gray-100 w-full">
        <span className="text-xs md:text-sm font-medium text-blue-600 group-hover:text-blue-700 transition-colors">Начать общение →</span>
      </div>
    </div>
  </button>
);

export const AssistantSelection: React.FC<AssistantSelectionProps> = ({
  assistants,
  onSelectAssistant,
  isLoading
}) => {
  const [avatarUrls, setAvatarUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    if (assistants.length > 0) {
      const loadAvatars = async () => {
        const urls: Record<number, string> = {};

        await Promise.all(
          assistants.map(async (assistant) => {
            try {
              const url = await avatarService.getAvatarUrl(assistant.id);
              urls[assistant.id] = url;
            } catch (error) {
              console.error(`Failed to load avatar for ${assistant.name}:`, error);
            }
          })
        );

        setAvatarUrls(urls);
      };

      loadAvatars();
      avatarService.cleanExpiredCache();
    }
  }, [assistants]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-pink-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Загружаем ассистентов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-start bg-gradient-to-br from-blue-50 via-white to-pink-50 overflow-y-auto p-4 md:p-6">
      <div className="w-full max-w-4xl mx-auto pb-24 md:pb-6">
        <div className="text-center mb-6 mt-4 md:mb-8 md:mt-8">
          <div className="inline-flex items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-blue-500 to-pink-500 rounded-full mb-3 md:mb-4 shadow-lg">
            <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-white" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Выберите ассистента
          </h1>
          <p className="text-base md:text-lg text-gray-600">
            С кем вы хотите начать общение?
          </p>
        </div>

        {/* Личный ассистент */}
        {assistants.some(a => a.category === 'assistant') && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="text-xl">🤖</span> Личный ассистент
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {assistants.filter(a => a.category === 'assistant').map((assistant) => (
                <AssistantCard key={assistant.id} assistant={assistant} avatarUrl={avatarUrls[assistant.id]} onSelect={onSelectAssistant} />
              ))}
            </div>
          </div>
        )}

        {/* Для роста бизнеса */}
        {assistants.some(a => a.category === 'business') && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="text-xl">💼</span> Для роста бизнеса
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {assistants.filter(a => a.category === 'business').map((assistant) => (
                <AssistantCard key={assistant.id} assistant={assistant} avatarUrl={avatarUrls[assistant.id]} onSelect={onSelectAssistant} />
              ))}
            </div>
          </div>
        )}

        {/* Для личностного роста */}
        {assistants.some(a => a.category === 'personal') && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="text-xl">🌱</span> Для личностного роста
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {assistants.filter(a => a.category === 'personal').map((assistant) => (
                <AssistantCard key={assistant.id} assistant={assistant} avatarUrl={avatarUrls[assistant.id]} onSelect={onSelectAssistant} />
              ))}
            </div>
          </div>
        )}

        {/* Без категории (fallback) */}
        {assistants.some(a => !a.category) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {assistants.filter(a => !a.category).map((assistant) => (
              <AssistantCard key={assistant.id} assistant={assistant} avatarUrl={avatarUrls[assistant.id]} onSelect={onSelectAssistant} />
            ))}
          </div>
        )}

        {assistants.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <p className="text-gray-500">Нет доступных ассистентов</p>
          </div>
        )}
      </div>
    </div>
  );
};
