import React from 'react';
import { useTranslation } from 'react-i18next';
import { Edit2, Trash2, Send, MessageSquare, RefreshCw } from 'lucide-react';
import type { TgBotConfig } from '../../services/tgBotApi';

interface Props {
  config: TgBotConfig;
  onEdit: (c: TgBotConfig) => void;
  onDelete: (c: TgBotConfig) => void;
  onMessages: (c: TgBotConfig) => void;
  onReconnect?: (c: TgBotConfig) => void;
}

const modeLabelKey: Record<string, string> = {
  strict: 'tgBot.mode_strict',
  always: 'tgBot.mode_always',
  smart: 'tgBot.mode_smart',
};

const statusBadge: Record<string, { key: string; cls: string }> = {
  pending: { key: 'tgBot.status_pending', cls: 'bg-yellow-100 text-yellow-800' },
  active: { key: 'tgBot.status_active', cls: 'bg-green-100 text-green-800' },
  silent: { key: 'tgBot.status_silent', cls: 'bg-gray-200 text-gray-700' },
  archived: { key: 'tgBot.status_archived', cls: 'bg-gray-100 text-gray-500' },
};

export const TgBotCard: React.FC<Props> = ({ config, onEdit, onDelete, onMessages, onReconnect }) => {
  const { t } = useTranslation();
  const badge = statusBadge[config.status] ?? statusBadge.archived;
  const canReconnect = onReconnect && (config.status === 'archived' || config.status === 'pending');
  return (
    <div className="group bg-white rounded-2xl p-4 shadow-md hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-forest-400 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-forest-600 to-forest-800 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform duration-300">
          <Send size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{config.displayName}</h3>
            <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{t(badge.key)}</span>
          </div>
          <p className="text-sm text-gray-600 mt-1 truncate">
            {config.tgChatTitle ?? (config.status === 'pending' ? '—' : t('tgBot.card_no_title'))}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {t('tgBot.card_mode_voice', { mode: t(modeLabelKey[config.addressingMode]), voice: config.voiceReplyMode })}
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
        {canReconnect && (
          <button
            onClick={() => onReconnect!(config)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} /> {t('tgBot.card_reconnect')}
          </button>
        )}
        <button
          onClick={() => onEdit(config)}
          className={canReconnect
            ? 'py-2 px-3 rounded-xl text-forest-700 hover:bg-forest-50 transition-colors'
            : 'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-forest-50 hover:bg-forest-100 text-forest-700 text-sm font-medium transition-colors'}
          aria-label={t('settings.routines.edit_title')}
          title={t('settings.routines.edit_title')}
        >
          <Edit2 size={14} />{!canReconnect && ` ${t('settings.routines.edit_title')}`}
        </button>
        <button
          onClick={() => onMessages(config)}
          className="py-2 px-3 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label={t('tgBot.card_history_aria')}
          title={t('tgBot.card_history_title')}
        >
          <MessageSquare size={16} />
        </button>
        <button
          onClick={() => onDelete(config)}
          className="py-2 px-3 rounded-xl text-red-500 hover:bg-red-50 transition-colors"
          aria-label={t('tgBot.card_archive_aria')}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};
