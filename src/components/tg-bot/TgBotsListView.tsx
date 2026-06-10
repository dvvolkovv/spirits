import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { tgBotApi, type TgBotConfig } from '../../services/tgBotApi';
import { TgBotCard } from './TgBotCard';
import { TgBotEditModal } from './TgBotEditModal';
import { TgBotMessagesView } from './TgBotMessagesView';

interface Props {
  /** Если true — без внешней h-full обёртки и без заголовка страницы. */
  embedded?: boolean;
}

export const TgBotsListView: React.FC<Props> = ({ embedded = false }) => {
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

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? (
      <div className="max-w-4xl mx-auto px-4 pt-4 pb-6">{children}</div>
    ) : (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">{children}</div>
      </div>
    );

  return (
    <Wrapper>
      {!embedded && (
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мои боты</h1>
          <p className="text-sm text-gray-500 mt-1">Telegram-боты, работающие в твоих группах</p>
        </div>
        <button
          onClick={() => navigate('/telegram-bots/new')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus size={16} /> Создать
        </button>
      </div>
      )}

      {embedded && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => navigate('/telegram-bots/new')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200"
          >
            <Plus size={16} /> Создать
          </button>
        </div>
      )}

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {([['active', 'Активные'], ['archived', 'Архив']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === k ? 'border-forest-600 text-forest-700' : 'border-transparent text-gray-500 hover:text-forest-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-forest-600 to-forest-800 flex items-center justify-center mx-auto mb-4 shadow-md">
            <Plus size={24} className="text-white" />
          </div>
          <p className="text-gray-600 font-medium mb-1">{tab === 'active' ? 'Нет активных ботов' : 'Архив пуст'}</p>
          {tab === 'active' && (
            <>
              <p className="text-sm text-gray-400 mb-4">Создай бота для своей Telegram-группы</p>
              <button
                onClick={() => navigate('/telegram-bots/new')}
                className="px-5 py-2.5 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200"
              >
                Создать первого
              </button>
            </>
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
    </Wrapper>
  );
};
