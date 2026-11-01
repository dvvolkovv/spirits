import React, { useState, useEffect } from 'react';
import { CreditCard as Edit2, Shield } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import AgentVersionEditor from './assistants/AgentVersionEditor';

interface Agent {
  id: number;
  name: string;
  system_prompt: string;
  description: string;
}

interface Props {
  editorDirty: boolean;
  onEditorDirtyChange: (dirty: boolean) => void;
}

const AdminAssistantsView: React.FC<Props> = ({ editorDirty, onEditorDirtyChange }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/webhook/agent-details');

      if (!response.ok) {
        throw new Error(`Ошибка загрузки ассистентов: ${response.status}`);
      }

      const data = await response.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      console.error('Error loading agents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAgent = (agent: Agent) => {
    if (selectedAgent?.id === agent.id) return;
    if (editorDirty && !window.confirm('Есть несохранённые изменения. Переключить ассистента и потерять их?')) {
      return;
    }
    onEditorDirtyChange(false);
    setSelectedAgent(agent);
  };

  return (
    // h-full, а НЕ h-screen. Вкладка живёт внутри AdminPage, где над ней
    // строка вкладок, а контейнер содержимого — flex-1 с overflow-hidden.
    // При h-screen вкладка занимала всю высоту окна, то есть на высоту строки
    // вкладок больше, чем ей отведено, и этот избыток родитель обрезал: низ
    // списка ассистентов уезжал за границу и не докручивался. Заметно стало,
    // когда появился девятнадцатый ассистент — до него нельзя было добраться.
    // У остальных десяти вкладок админки h-full, эта была единственным
    // исключением.
    <div className="h-full bg-gray-50 flex flex-col overflow-hidden">
      <div className="bg-white shadow-sm px-4 py-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 flex items-center">
            <Shield className="w-6 h-6 mr-2 text-forest-600" />
            Админ-панель: Редактирование ассистентов
          </h1>
          <button
            onClick={loadAgents}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Загрузка...' : 'Обновить'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Ассистенты</h2>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-forest-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : agents.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Ассистенты не найдены
              </p>
            ) : (
              <div data-testid="admin-assistants-list" className="space-y-2">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => handleSelectAgent(agent)}
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded-lg transition-colors',
                      selectedAgent?.id === agent.id
                        ? 'bg-forest-100 text-forest-900 font-medium'
                        : 'hover:bg-gray-100 text-gray-700'
                    )}
                  >
                    {agent.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedAgent ? (
            <>
              <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Edit2 className="w-5 h-5 mr-2 text-forest-600" />
                  {selectedAgent.name}
                </h2>
                {editorDirty && (
                  <p className="text-sm text-amber-600 mt-2">
                    Есть несохранённые изменения
                  </p>
                )}
              </div>

              <div className="flex-1 p-4 md:p-6 overflow-y-auto pb-20 md:pb-6">
                <div className="max-w-5xl">
                  <AgentVersionEditor
                    key={selectedAgent.id}
                    agentId={selectedAgent.id}
                    initialDescription={selectedAgent.description || ''}
                    initialPrompt={selectedAgent.system_prompt}
                    onDirtyChange={onEditorDirtyChange}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">
                  Выберите ассистента для редактирования
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminAssistantsView;
