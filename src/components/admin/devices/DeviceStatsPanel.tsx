import React, { useEffect, useState } from 'react';
import { Loader, AlertCircle, Smartphone } from 'lucide-react';
import { apiClient } from '../../../services/apiClient';
import { platformLabel, osLabel, sharePct } from './deviceLabels';

interface Bucket {
  key: string;
  users: number;
}

interface DeviceStats {
  windowDays: number;
  totalUsers: number;
  byPlatform: Bucket[];
  byOs: Bucket[];
  byBrowser: Bucket[];
  mobileTouched: number;
  mobileOnly: number;
  unknownUsers: number;
}

/** Столбик разбивки: подпись, число людей и доля. */
const BucketList: React.FC<{
  title: string;
  items: Bucket[];
  total: number;
  label?: (key: string) => string;
}> = ({ title, items, total, label }) => (
  <div>
    <h3 className="text-xs uppercase text-gray-500 mb-2">{title}</h3>
    {items.length === 0 ? (
      <p className="text-sm text-gray-400">пока пусто</p>
    ) : (
      <div className="space-y-1.5">
        {items.map((b) => (
          <div key={b.key} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-gray-800 truncate">{(label ?? ((k) => k))(b.key)}</span>
            <span className="text-gray-500 tabular-nums">{b.users}</span>
            <span className="w-10 text-right text-gray-400 tabular-nums">{sharePct(b.users, total)}%</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

const DeviceStatsPanel: React.FC = () => {
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiClient.get('/webhook/admin/devices/stats');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) setStats(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'не удалось загрузить');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex justify-center">
        <Loader className="w-5 h-5 animate-spin text-forest-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-2 text-red-600 text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>Устройства: {error}</span>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-forest-600" />
        <h2 className="text-sm font-medium text-gray-900">С чего заходят</h2>
        <span className="text-xs text-gray-400">
          {stats.totalUsers} активных за {stats.windowDays} дней
        </span>
      </div>

      {stats.totalUsers === 0 ? (
        <p className="text-sm text-gray-500">
          Данных пока нет. Сбор начался с выката, записи появляются при входе и продлении сессии —
          первые цифры будут в течение суток.
        </p>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            <BucketList title="Платформы" items={stats.byPlatform} total={stats.totalUsers} label={platformLabel} />
            <BucketList title="Операционные системы" items={stats.byOs} total={stats.totalUsers} label={osLabel} />
            <BucketList title="Браузеры" items={stats.byBrowser} total={stats.totalUsers} label={osLabel} />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700 border-t border-gray-100 pt-3">
            <span>
              Трогали мобилку хоть раз: <strong>{stats.mobileTouched}</strong>
            </span>
            <span>
              Сидят только на мобилке: <strong>{stats.mobileOnly}</strong>
            </span>
            {stats.unknownUsers > 0 && (
              <span className="text-amber-700">
                Не удалось определить: <strong>{stats.unknownUsers}</strong>
              </span>
            )}
          </div>

          {/*
            Без этой подписи первый же вопрос будет «почему в сумме 120».
            Суммы больше ста — устройство данных, а не ошибка счёта.
          */}
          <p className="text-xs text-gray-400">
            Считаются люди, а не визиты. Один человек попадает в несколько строк, если заходит с
            разных устройств, — поэтому доли в сумме дают больше 100%.
          </p>
        </>
      )}
    </div>
  );
};

export default DeviceStatsPanel;
