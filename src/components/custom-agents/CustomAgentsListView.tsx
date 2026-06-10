import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { customAgentsApi, type CustomAgent } from '../../services/customAgentsApi';
import { CustomAgentCard } from './CustomAgentCard';
import { CustomAgentCreateModal } from './CustomAgentCreateModal';
import { CustomAgentEditModal } from './CustomAgentEditModal';

interface Props {
  /** Если true — без внешней h-full overflow-y-auto обёртки и без заголовка
   *  страницы. Используется когда вью встроена в StudioPage. */
  embedded?: boolean;
}

export const CustomAgentsListView: React.FC<Props> = ({ embedded = false }) => {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomAgent | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setAgents(await customAgentsApi.list());
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Не удалось загрузить ассистентов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleDelete = async (a: CustomAgent) => {
    if (!confirm(`Удалить ассистента "${a.name}"?`)) return;
    try {
      await customAgentsApi.remove(a.id);
      toast.success('Удалён');
      reload();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Ошибка удаления');
    }
  };

  // ВАЖНО: контент строится прямо в JSX. Inline-Wrapper-FC создавался
  // на каждом ре-рендере и вызывал ре-маунт детей (см. комментарий в
  // TgBotsListView).
  const content = (
    <>
      {!embedded && (
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мои ассистенты</h1>
          <p className="text-sm text-gray-500 mt-1">
            Личные AI-ассистенты с собственными ролями — доступны в /chat
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200"
        >
          <Plus size={16} /> Создать
        </button>
      </div>
      )}

      {embedded && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200"
          >
            <Plus size={16} /> Создать
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">Загрузка...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-forest-600 to-forest-800 flex items-center justify-center mx-auto mb-4 shadow-md">
            <Plus size={24} className="text-white" />
          </div>
          <p className="text-gray-600 font-medium mb-1">Нет кастомных ассистентов</p>
          <p className="text-sm text-gray-400 mb-4">Создай первого — он появится в /chat</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200"
          >
            Создать первого
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((a) => (
            <CustomAgentCard
              key={a.id}
              agent={a}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <CustomAgentCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); reload(); }}
        />
      )}
      {editing && (
        <CustomAgentEditModal
          agent={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </>
  );

  return embedded ? (
    <div className="max-w-4xl mx-auto px-4 pt-4 pb-6">{content}</div>
  ) : (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">{content}</div>
    </div>
  );
};
