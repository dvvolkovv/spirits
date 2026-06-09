import React from 'react';
import { Edit2, Trash2, Send, MessageSquare } from 'lucide-react';
import type { TgBotConfig } from '../../services/tgBotApi';

interface Props {
  config: TgBotConfig;
  onEdit: (c: TgBotConfig) => void;
  onDelete: (c: TgBotConfig) => void;
  onMessages: (c: TgBotConfig) => void;
}

const modeLabel: Record<string, string> = {
  strict: 'По обращению',
  always: 'Всегда',
  smart: 'Умно',
};

const statusBadge: Record<string, { text: string; cls: string }> = {
  pending: { text: 'Ждёт группы', cls: 'bg-yellow-100 text-yellow-800' },
  active: { text: 'Активен', cls: 'bg-green-100 text-green-800' },
  silent: { text: 'Молчит', cls: 'bg-gray-200 text-gray-700' },
  archived: { text: 'Архив', cls: 'bg-gray-100 text-gray-500' },
};

export const TgBotCard: React.FC<Props> = ({ config, onEdit, onDelete, onMessages }) => {
  const badge = statusBadge[config.status] ?? statusBadge.archived;
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Send size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{config.displayName}</h3>
            <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
          </div>
          <p className="text-sm text-gray-600 mt-1 truncate">
            {config.tgChatTitle ?? (config.status === 'pending' ? '—' : 'без названия')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {modeLabel[config.addressingMode]} · голос: {config.voiceReplyMode}
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => onEdit(config)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium"
        >
          <Edit2 size={14} /> Изменить
        </button>
        <button
          onClick={() => onMessages(config)}
          className="py-2 px-3 rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="История сообщений"
          title="История"
        >
          <MessageSquare size={16} />
        </button>
        <button
          onClick={() => onDelete(config)}
          className="py-2 px-3 rounded-lg text-red-600 hover:bg-red-50"
          aria-label="Архивировать"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};
