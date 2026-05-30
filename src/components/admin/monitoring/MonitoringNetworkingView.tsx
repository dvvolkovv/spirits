import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader, RefreshCw, Users, UserPlus, UserMinus, Clock, ShieldOff } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

type Window = '24h' | '7d' | '30d' | '90d' | 'all';
const WINDOW_LABEL: Record<Window, string> = {
  '24h': '24 ч', '7d': '7 дней', '30d': '30 дней', '90d': '90 дней', 'all': 'всё время',
};

interface NetworkingOverview {
  window: Window;
  generatedAt: string;
  requests: {
    total: number; pending: number; approved: number; declined: number;
    acceptRatePct: number | null;
    medianTimeToAcceptHours: number | null;
    pendingOlder24h: number;
  };
  blocks: { total: number; inWindow: number };
  topRequesters: Array<{ userId: string; sent: number; accepted: number }>;
  topTargets:    Array<{ userId: string; received: number; accepted: number }>;
}

const fmtPct = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%`;
const fmtHrs = (v: number | null) => {
  if (v === null) return '—';
  if (v < 1) return `${Math.round(v * 60)} мин`;
  if (v < 48) return `${v.toFixed(1)} ч`;
  return `${(v / 24).toFixed(1)} дн`;
};
const fmtNum = (n: number) => n.toLocaleString('ru-RU');

const acceptColor = (pct: number | null): string => {
  if (pct === null) return 'text-gray-400';
  if (pct >= 40) return 'text-emerald-600';
  if (pct >= 20) return 'text-amber-600';
  return 'text-rose-600';
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }> = ({ icon, label, value, sub, valueClass }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{icon}{label}</div>
    <div className={clsx('text-2xl font-semibold text-gray-900', valueClass)}>{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

const MonitoringNetworkingView: React.FC = () => {
  const [windowKey, setWindowKey] = useState<Window>('30d');
  const [data, setData] = useState<NetworkingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/webhook/admin/monitoring/product/networking?window=${windowKey}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить нетворкинг');
    } finally {
      setLoading(false);
    }
  }, [windowKey]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
          {(['24h', '7d', '30d', '90d', 'all'] as Window[]).map((w) => (
            <button key={w} onClick={() => setWindowKey(w)}
              className={clsx('px-3 py-1.5 text-sm rounded transition-colors',
                windowKey === w ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900')}>
              {WINDOW_LABEL[w]}
            </button>
          ))}
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-forest-600 hover:bg-gray-50 rounded-md transition-colors">
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />Обновить
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-rose-700">{error}</div>
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-10">
          <Loader className="w-6 h-6 text-forest-600 animate-spin" />
        </div>
      )}

      {data && (
        <>
          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Запросы на общение ({WINDOW_LABEL[data.window]})</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<UserPlus className="w-3.5 h-3.5" />} label="Отправлено" value={fmtNum(data.requests.total)}
                sub={`принято ${data.requests.approved} · отклонено ${data.requests.declined}`} />
              <Stat icon={<UserPlus className="w-3.5 h-3.5" />} label="Accept rate"
                value={fmtPct(data.requests.acceptRatePct)}
                valueClass={acceptColor(data.requests.acceptRatePct)}
                sub="approved / (approved + declined)" />
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Медиана до принятия"
                value={fmtHrs(data.requests.medianTimeToAcceptHours)}
                sub="от created_at до resolved_at" />
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Pending > 24 ч"
                value={fmtNum(data.requests.pendingOlder24h)}
                sub="застряли в очереди"
                valueClass={data.requests.pendingOlder24h > 0 ? 'text-amber-600' : undefined} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Безопасность</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<ShieldOff className="w-3.5 h-3.5" />} label="Блокировок всего" value={fmtNum(data.blocks.total)} />
              <Stat icon={<ShieldOff className="w-3.5 h-3.5" />} label="Блокировок в окне" value={fmtNum(data.blocks.inWindow)} />
              <Stat icon={<UserMinus className="w-3.5 h-3.5" />} label="Отклонено запросов" value={fmtNum(data.requests.declined)} />
              <Stat icon={<Users className="w-3.5 h-3.5" />} label="Pending в очереди" value={fmtNum(data.requests.pending)} />
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Топ-отправители</h3>
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr><th className="text-left px-3 py-2 font-medium">user_id</th>
                        <th className="text-right px-3 py-2 font-medium">Отправил</th>
                        <th className="text-right px-3 py-2 font-medium">Принято</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.topRequesters.map((r) => (
                      <tr key={r.userId}>
                        <td className="px-3 py-2 font-mono text-xs">{r.userId}</td>
                        <td className="px-3 py-2 text-right">{r.sent}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{r.accepted}</td>
                      </tr>
                    ))}
                    {data.topRequesters.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-gray-500 px-3 py-4 text-sm">Нет данных</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Топ-получатели</h3>
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr><th className="text-left px-3 py-2 font-medium">user_id</th>
                        <th className="text-right px-3 py-2 font-medium">Получил</th>
                        <th className="text-right px-3 py-2 font-medium">Принял</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.topTargets.map((r) => (
                      <tr key={r.userId}>
                        <td className="px-3 py-2 font-mono text-xs">{r.userId}</td>
                        <td className="px-3 py-2 text-right">{r.received}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{r.accepted}</td>
                      </tr>
                    ))}
                    {data.topTargets.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-gray-500 px-3 py-4 text-sm">Нет данных</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')}{' · '}
            События поиска (Search → Request) появятся когда добавим search_performed в трекинг.
          </div>
        </>
      )}
    </div>
  );
};

export default MonitoringNetworkingView;
