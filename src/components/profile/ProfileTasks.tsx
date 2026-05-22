import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import type { TaskListItem } from '../../types/tasks';

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
        <div className="px-4 py-3 text-xs text-gray-400">
          {tasks.length} задач загружено (рендер карточек — следующая задача).
        </div>
      )}
    </div>
  );
};

export default ProfileTasks;
