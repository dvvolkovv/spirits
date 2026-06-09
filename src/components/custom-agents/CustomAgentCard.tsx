import React from 'react';
import { Edit2, Trash2, Bot } from 'lucide-react';
import type { CustomAgent } from '../../services/customAgentsApi';

interface Props {
  agent: CustomAgent;
  onEdit: (a: CustomAgent) => void;
  onDelete: (a: CustomAgent) => void;
}

export const CustomAgentCard: React.FC<Props> = ({ agent, onEdit, onDelete }) => (
  <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex flex-col gap-3">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        <Bot size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
        {agent.description && (
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{agent.description}</p>
        )}
      </div>
    </div>
    <div className="flex gap-2 mt-auto">
      <button
        onClick={() => onEdit(agent)}
        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
      >
        <Edit2 size={14} /> Изменить
      </button>
      <button
        onClick={() => onDelete(agent)}
        className="py-2 px-3 rounded-lg text-red-600 hover:bg-red-50"
        aria-label="Удалить"
      >
        <Trash2 size={16} />
      </button>
    </div>
  </div>
);
