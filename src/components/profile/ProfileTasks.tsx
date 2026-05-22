import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader, ChevronRight } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import type { TaskListItem, TaskStatus } from '../../types/tasks';

const formatRelative = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'только что';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} дн назад`;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const statusBadge = (status: TaskStatus): { cls: string; label: string } => {
  if (status === 'active') return { cls: 'bg-forest-50 text-forest-700', label: 'активна' };
  if (status === 'done')   return { cls: 'bg-gray-100 text-gray-600',     label: 'завершена' };
  return { cls: 'bg-gray-100 text-gray-500', label: 'архив' };
};

const ProfileTasks: React.FC = () => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<TaskListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutateError, setMutateError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const resp = await apiClient.get('/webhook/user/tasks');
      if (!resp.ok) {
        setLoadError(t('profile.tasks.loadError', 'Не удалось загрузить задачи'));
        return;
      }
      const data = await resp.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch {
      setLoadError(t('profile.tasks.loadError', 'Не удалось загрузить задачи'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeCount = tasks?.filter(t => t.status === 'active').length ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-900 inline-flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-forest-600" />
          {t('profile.tasks.title', 'Задачи')}
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-medium tabular-nums">
          {activeCount}
        </span>
      </div>

      {mutateError && (
        <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">
          {mutateError}
        </div>
      )}

      {loading && !tasks ? (
        <div className="py-6 flex items-center justify-center">
          <Loader className="w-4 h-4 animate-spin text-forest-600" />
        </div>
      ) : loadError ? (
        <div className="py-4 px-4 text-sm text-amber-700 flex items-center justify-between gap-2">
          <span>{loadError}</span>
          <button onClick={load} className="px-2 py-0.5 border border-amber-300 rounded text-xs hover:bg-amber-50">
            {t('common.retry', 'Повторить')}
          </button>
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 px-4 text-center">
          {t('profile.tasks.empty', 'Задач пока нет. Они появляются автоматически, когда ты обсуждаешь с ассистентами текущие дела.')}
        </p>
      ) : (
        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {tasks
            .filter(task => task.status === 'active')
            .map(task => {
              const badge = statusBadge(task.status);
              return (
                <div key={task.id} className="w-full px-4 py-2.5 flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 truncate">{task.title}</span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {task.summary && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.summary}</p>
                    )}
                    {task.last_active_at && (
                      <p className="text-[10px] text-gray-400 mt-1">{formatRelative(task.last_active_at)}</p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default ProfileTasks;
