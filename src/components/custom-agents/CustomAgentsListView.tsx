import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { customAgentsApi, type CustomAgent } from '../../services/customAgentsApi';
import { CustomAgentCard } from './CustomAgentCard';
import { CustomAgentCreateModal } from './CustomAgentCreateModal';
import { CustomAgentEditModal } from './CustomAgentEditModal';

export const CustomAgentsListView: React.FC = () => {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomAgent | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setAgents(await customAgentsApi.list());
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Не удалось загрузить агентов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleDelete = async (a: CustomAgent) => {
    if (!confirm(`Удалить агента "${a.name}"?`)) return;
    try {
      await customAgentsApi.remove(a.id);
      toast.success('Удалён');
      reload();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Ошибка удаления');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мои агенты</h1>
          <p className="text-sm text-gray-600 mt-1">
            Личные AI-ассистенты с собственными ролями — доступны в /chat
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
        >
          <Plus size={16} /> Создать
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Загрузка...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
          <p className="text-gray-600 mb-3">У тебя пока нет кастомных агентов.</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
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
    </div>
  );
};
