import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader, RefreshCw, TrendingDown, UserX, Trash2, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

interface ChurnOverview {
  generatedAt: string;
  excludedUsers: string[];
  retention: {
    cohortD30: number; activeD30: number; churnD30Pct: number | null;
    cohortD90: number; activeD90: number; churnD90Pct: number | null;
    payersCohort: number; payersChurn60d: number; paidChurn60Pct: number | null;
    dormantUsers: number;
  };
  deletions: { total: number; last30d: number };
  bounce: { cohort30d: number; bouncedCount: number; bouncedPct: number | null };
  requestQuality: { declined: number; pendingIgnored7d: number; blockRatePerKActive: number | null };
  cohorts: Array<{
    week: string; signups: number;
    retainedD7: number; retainedD30: number;
    retentionD7Pct: number | null; retentionD30Pct: number | null;
  }>;
}

const fmtPct = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%`;
const fmtNum = (n: number) => n.toLocaleString('ru-RU');

// For churn metrics: LOWER is better.
const churnColor = (pct: number | null): string => {
  if (pct === null) return 'text-gray-400';
  if (pct < 30) return 'text-emerald-600';
  if (pct < 50) return 'text-amber-600';
  return 'text-rose-600';
};
const bounceColor = (pct: number | null): string => {
  if (pct === null) return 'text-gray-400';
  if (pct < 30) return 'text-emerald-600';
  if (pct < 60) return 'text-amber-600';
  return 'text-rose-600';
};
const retentionColor = (pct: number | null): string => {
  if (pct === null) return 'text-gray-400';
  if (pct >= 50) return 'text-emerald-600';
  if (pct >= 25) return 'text-amber-600';
  return 'text-rose-600';
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }> = ({ icon, label, value, sub, valueClass }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{icon}{label}</div>
    <div className={clsx('text-2xl font-semibold text-gray-900', valueClass)}>{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

const MonitoringChurnView: React.FC = () => {
  const [data, setData] = useState<ChurnOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/webhook/admin/monitoring/product/churn');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить churn');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
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
            <h3 className="text-sm font-medium text-gray-700 mb-3">Удержание и отток</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<TrendingDown className="w-3.5 h-3.5" />} label="Churn D30"
                value={fmtPct(data.retention.churnD30Pct)} valueClass={churnColor(data.retention.churnD30Pct)}
                sub={`из ${data.retention.cohortD30} активны ${data.retention.activeD30}`} />
              <Stat icon={<TrendingDown className="w-3.5 h-3.5" />} label="Churn D90"
                value={fmtPct(data.retention.churnD90Pct)} valueClass={churnColor(data.retention.churnD90Pct)}
                sub={`из ${data.retention.cohortD90} активны ${data.retention.activeD90}`} />
              <Stat icon={<TrendingDown className="w-3.5 h-3.5" />} label="Paid churn 60д"
                value={fmtPct(data.retention.paidChurn60Pct)} valueClass={churnColor(data.retention.paidChurn60Pct)}
                sub={`из ${data.retention.payersCohort} платящих покинули ${data.retention.payersChurn60d}`} />
              <Stat icon={<UserX className="w-3.5 h-3.5" />} label="Dormant (14 дней без сообщений)"
                value={fmtNum(data.retention.dormantUsers)}
                sub="ещё не churned, но молчат" />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Сигналы неудовлетворённости</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Bounce after onboarding"
                value={fmtPct(data.bounce.bouncedPct)} valueClass={bounceColor(data.bounce.bouncedPct)}
                sub={`signup без сообщения за 24 ч (${data.bounce.bouncedCount} из ${data.bounce.cohort30d}, 30 дн)`} />
              <Stat icon={<Trash2 className="w-3.5 h-3.5" />} label="Удалённых аккаунтов"
                value={fmtNum(data.deletions.total)}
                sub={`за 30 дней: ${data.deletions.last30d}`}
                valueClass={data.deletions.last30d > 0 ? 'text-amber-600' : undefined} />
              <Stat icon={<UserX className="w-3.5 h-3.5" />} label="Отклонённых запросов"
                value={fmtNum(data.requestQuality.declined)}
                sub={`+ pending > 7 дн: ${data.requestQuality.pendingIgnored7d}`} />
              <Stat icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Блок-ставка на 1k активных"
                value={data.requestQuality.blockRatePerKActive === null
                  ? '—'
                  : data.requestQuality.blockRatePerKActive.toFixed(1)}
                sub="user_blocks / MAU × 1000" />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Retention по когортам (последние 12 недель)</h3>
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Неделя</th>
                    <th className="text-right px-3 py-2 font-medium">Signups</th>
                    <th className="text-right px-3 py-2 font-medium">D7 удержано</th>
                    <th className="text-right px-3 py-2 font-medium">D7 retention</th>
                    <th className="text-right px-3 py-2 font-medium">D30 удержано</th>
                    <th className="text-right px-3 py-2 font-medium">D30 retention</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.cohorts.map((c) => (
                    <tr key={c.week} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{c.week}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(c.signups)}</td>
                      <td className="px-3 py-2 text-right">{fmtNum(c.retainedD7)}</td>
                      <td className={clsx('px-3 py-2 text-right font-medium', retentionColor(c.retentionD7Pct))}>
                        {fmtPct(c.retentionD7Pct)}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtNum(c.retainedD30)}</td>
                      <td className={clsx('px-3 py-2 text-right font-medium', retentionColor(c.retentionD30Pct))}>
                        {fmtPct(c.retentionD30Pct)}
                      </td>
                    </tr>
                  ))}
                  {data.cohorts.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-gray-500 px-3 py-4 text-sm">Нет когорт за последние 12 недель</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Retention считается по событию <code>message_sent</code>: окно ±1 день вокруг D7/D30 от регистрации.
              Пока events таблица молода, для старых когорт цифры будут «—» / 0% — это артефакт, не реальный отток.
            </div>
          </section>

          <div className="text-xs text-gray-400">
            Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')}{' · '}
            Исключены тестовые пользователи: {data.excludedUsers.join(', ')}
          </div>
        </>
      )}
    </div>
  );
};

export default MonitoringChurnView;
