import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { tgBotApi, type TgBotConfig } from '../../services/tgBotApi';
import { TgBotCard } from './TgBotCard';
import { TgBotEditModal } from './TgBotEditModal';
import { TgBotMessagesView } from './TgBotMessagesView';

export const TgBotsListView: React.FC = () => {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<TgBotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [editing, setEditing] = useState<TgBotConfig | null>(null);
  const [viewingMessages, setViewingMessages] = useState<TgBotConfig | null>(null);

  const reload = async () => {
    setLoading(true);
    try { setConfigs(await tgBotApi.list()); }
    catch (e: any) { toast.error(e?.message ?? 'Не удалось загрузить ботов'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const filtered = configs.filter(c => tab === 'active' ? c.status !== 'archived' : c.status === 'archived');

  const handleDelete = async (c: TgBotConfig) => {
    if (!confirm(`Архивировать «${c.displayName}»?\nБот выйдет из группы. Конфиг можно восстановить.`)) return;
    try {
      await tgBotApi.remove(c.id);
      toast.success('Архивировано');
      reload();
    } catch (e: any) { toast.error(e?.message ?? 'Ошибка'); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мои боты</h1>
          <p className="text-sm text-gray-600 mt-1">Telegram-боты, работающие в твоих группах</p>
        </div>
        <button
          onClick={() => navigate('/telegram-bots/new')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
        >
          <Plus size={16} /> Создать
        </button>
      </div>

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {([['active', 'Активные'], ['archived', 'Архив']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === k ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
          <p className="text-gray-600 mb-3">{tab === 'active' ? 'У тебя пока нет активных ботов.' : 'Архив пуст.'}</p>
          {tab === 'active' && (
            <button
              onClick={() => navigate('/telegram-bots/new')}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
            >
              Создать первого
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => (
            <TgBotCard
              key={c.id}
              config={c}
              onEdit={setEditing}
              onDelete={handleDelete}
              onMessages={setViewingMessages}
            />
          ))}
        </div>
      )}

      {editing && (
        <TgBotEditModal
          config={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {viewingMessages && (
        <TgBotMessagesView
          config={viewingMessages}
          onClose={() => setViewingMessages(null)}
        />
      )}
    </div>
  );
};
