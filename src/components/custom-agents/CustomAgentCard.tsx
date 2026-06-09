import React from 'react';
import { Edit2, Trash2, Bot } from 'lucide-react';
import type { CustomAgent } from '../../services/customAgentsApi';

interface Props {
  agent: CustomAgent;
  onEdit: (a: CustomAgent) => void;
  onDelete: (a: CustomAgent) => void;
}

export const CustomAgentCard: React.FC<Props> = ({ agent, onEdit, onDelete }) => (
  <div className="group bg-white rounded-2xl p-4 shadow-md hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-forest-400 flex flex-col gap-3">
    <div className="flex items-start gap-3">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-forest-600 to-forest-800 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform duration-300">
        <Bot size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
        {agent.description && (
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{agent.description}</p>
        )}
      </div>
    </div>
    <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
      <button
        onClick={() => onEdit(agent)}
        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-forest-50 hover:bg-forest-100 text-forest-700 text-sm font-medium transition-colors"
      >
        <Edit2 size={14} /> Изменить
      </button>
      <button
        onClick={() => onDelete(agent)}
        className="py-2 px-3 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
        aria-label="Удалить"
      >
        <Trash2 size={16} />
      </button>
    </div>
  </div>
);
