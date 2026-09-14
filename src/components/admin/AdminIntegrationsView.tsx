import React, { useEffect, useState } from 'react';
import { Loader, RefreshCw } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

// Выключатели интеграций. Экспериментальная интеграция не должна включаться
// фактом выката кода: на бэке нет строки — значит выключено, а здесь её
// включают руками и видят, кто это сделал.
interface IntegrationFlag {
  key: string;
  title: string;
  note: string;
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const AdminIntegrationsView: React.FC = () => {
  const [items, setItems] = useState<IntegrationFlag[]>([]);
  const [loading, setLoading] = useState(false);
  // Какой именно переключатель сейчас в полёте: гасим только его, а не всю
  // страницу — остальные должны оставаться живыми.
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiClient.get('/webhook/admin/integrations');
      if (!r.ok) throw new Error(`Ошибка: ${r.status}`);
      const data = await r.json();
      setItems(data.integrations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить интеграции');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (item: IntegrationFlag) => {
    // Включение открывает возможность всем пользователям сразу — спрашиваем.
    // Выключение подтверждения не требует: оно всегда безопасно.
    if (!item.enabled && !window.confirm(
      `Включить «${item.title}» для всех пользователей?`,
    )) return;
    setSaving(item.key);
    setError(null);
    try {
      const r = await apiClient.post('/webhook/admin/integrations', {
        key: item.key,
        enabled: !item.enabled,
      });
      if (!r.ok) throw new Error(`Ошибка: ${r.status}`);
      const data = await r.json();
      setItems(data.integrations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось переключить');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div data-testid="admin-integrations" className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Интеграции</h2>
          <p className="text-sm text-gray-600">
            Выключенная интеграция не показывает карточку входа и не пускает во встречу —
            ни из чата, ни из телеграм-бота.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:text-forest-600 disabled:opacity-50"
        >
          <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader className="w-4 h-4 animate-spin" /> Загрузка…
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.key}
              data-testid={`integration-${item.key}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-gray-900">{item.title}</div>
                <div className="text-sm text-gray-600">{item.note}</div>
                {item.updatedAt && (
                  <div className="text-xs text-gray-400 mt-1">
                    {item.enabled ? 'включена' : 'выключена'}{' '}
                    {new Date(item.updatedAt).toLocaleString('ru-RU')}
                    {item.updatedBy ? `, ${item.updatedBy}` : ''}
                  </div>
                )}
              </div>
              <button
                data-testid={`integration-toggle-${item.key}`}
                onClick={() => toggle(item)}
                disabled={saving === item.key}
                aria-pressed={item.enabled}
                className={
                  'flex-shrink-0 w-28 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ' +
                  (item.enabled
                    ? 'bg-forest-600 text-white hover:bg-forest-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                }
              >
                {saving === item.key ? '…' : item.enabled ? 'Включена' : 'Выключена'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminIntegrationsView;
