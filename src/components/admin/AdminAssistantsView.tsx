import React, { useState, useEffect } from 'react';
import { Save, X, Edit2, Shield } from 'lucide-react';
import { clsx } from 'clsx';

interface Agent {
  id: number;
  name: string;
  system_prompt: string;
}

const AdminAssistantsView: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/agent-details`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

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
    setSelectedAgent(agent);
    setEditedPrompt(agent.system_prompt);
  };

  const handleSave = async () => {
    if (!selectedAgent) return;

    setIsSaving(true);
    setError(null);

    try {
      const formData = new URLSearchParams();
      formData.append('agent-id', selectedAgent.id.toString());
      formData.append('system_prompt', editedPrompt);
      formData.append('description', '');
      formData.append('name', selectedAgent.name);

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook-test/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      });

      if (!response.ok) {
        throw new Error(`Ошибка сохранения: ${response.status}`);
      }

      const result = await response.json();

      if (result.success === 'agent updated') {
        const updatedAgents = agents.map(agent =>
          agent.id === selectedAgent.id
            ? { ...agent, system_prompt: editedPrompt }
            : agent
        );
        setAgents(updatedAgents);
        setSelectedAgent({ ...selectedAgent, system_prompt: editedPrompt });

        alert('Системный промпт успешно обновлен');
      } else {
        throw new Error('Сервер не подтвердил обновление');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при сохранении');
      console.error('Error saving agent:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedAgent) {
      setEditedPrompt(selectedAgent.system_prompt);
    }
  };

  const hasChanges = selectedAgent && editedPrompt !== selectedAgent.system_prompt;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
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
              <div className="space-y-2">
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
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Edit2 className="w-5 h-5 mr-2 text-forest-600" />
                    {selectedAgent.name}
                  </h2>
                  <div className="flex space-x-2">
                    {hasChanges && (
                      <button
                        onClick={handleCancel}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <X className="w-4 h-4 inline mr-1" />
                        Отменить
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={!hasChanges || isSaving}
                      className={clsx(
                        'px-4 py-2 rounded-lg font-medium transition-colors flex items-center',
                        hasChanges
                          ? 'bg-forest-600 hover:bg-forest-700 text-white'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      )}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {isSaving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </div>
                {hasChanges && (
                  <p className="text-sm text-amber-600 mt-2">
                    Есть несохраненные изменения
                  </p>
                )}
              </div>

              <div className="flex-1 p-6 overflow-y-auto pb-20 md:pb-6">
                <div className="max-w-4xl">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Системный промпт
                  </label>
                  <textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    className="w-full h-96 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-colors font-mono text-sm"
                    placeholder="Введите системный промпт для ассистента..."
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Символов: {editedPrompt.length}
                  </p>
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
