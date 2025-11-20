import React from 'react';
import { Sparkles } from 'lucide-react';

interface Assistant {
  id: number;
  name: string;
  description: string;
}

interface AssistantSelectionProps {
  assistants: Assistant[];
  onSelectAssistant: (assistant: Assistant) => void;
  isLoading: boolean;
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

export const AssistantSelection: React.FC<AssistantSelectionProps> = ({
  assistants,
  onSelectAssistant,
  isLoading
}) => {
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
    <div className="flex-1 flex flex-col items-center justify-start bg-gradient-to-br from-blue-50 via-white to-pink-50 overflow-y-auto p-6">
      <div className="w-full max-w-4xl mx-auto">
        <div className="text-center mb-8 mt-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-pink-500 rounded-full mb-4 shadow-lg">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Выберите ассистента
          </h1>
          <p className="text-lg text-gray-600">
            С кем вы хотите начать общение?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {assistants.map((assistant) => (
            <button
              key={assistant.id}
              onClick={() => onSelectAssistant(assistant)}
              className="group bg-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-blue-500 hover:scale-105 active:scale-95 text-left"
            >
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <img
                    src={getAvatarUrl(assistant.id)}
                    alt={assistant.name}
                    className="w-24 h-24 rounded-full object-cover shadow-lg ring-4 ring-white group-hover:ring-blue-100 transition-all duration-300"
                  />
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-gradient-to-br from-blue-500 to-pink-500 rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  {assistant.name}
                </h3>

                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full mb-3">
                  {getRoleForAssistant(assistant.description)}
                </span>

                <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                  {assistant.description}
                </p>

                <div className="mt-4 pt-4 border-t border-gray-100 w-full">
                  <span className="text-sm font-medium text-blue-600 group-hover:text-blue-700 transition-colors">
                    Начать общение →
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {assistants.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <p className="text-gray-500">Нет доступных ассистентов</p>
          </div>
        )}
      </div>
    </div>
  );
};
