import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { customAgentsApi, type CustomAgent } from '../../services/customAgentsApi';

interface Props {
  agent: CustomAgent;
  onClose: () => void;
  onSaved: () => void;
}

export const CustomAgentEditModal: React.FC<Props> = ({ agent, onClose, onSaved }) => {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || systemPrompt.trim().length < 20) {
      toast.error('Имя и промпт (мин 20 символов) обязательны');
      return;
    }
    setSaving(true);
    try {
      await customAgentsApi.update(agent.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
      });
      toast.success('Сохранено');
      onSaved();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Не удалось сохранить');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Редактировать ассистента</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Имя</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              maxLength={80}
            />
          </label>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Описание (опционально)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              maxLength={300}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">System prompt</span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={14}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
            />
          </label>
          <div className="flex gap-2 mt-5">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
