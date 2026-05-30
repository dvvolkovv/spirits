import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader, RefreshCw, Network, TrendingUp, Layers, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

interface EntityCount { label: string; count: number; weight: number }

interface ProfileDepth {
  generatedAt: string;
  entityCounts: EntityCount[];
  totalEntities: number;
  totalPds: number;
  perUser: { profiles: number; avgPds: number | null; p50Pds: number | null; p95Pds: number | null };
  weeklyGrowth: Array<{ week: string; newProfiles: number }>;
}

const LABEL_RU: Record<string, string> = {
  Value: 'Ценности', Belief: 'Убеждения', Desire: 'Желания',
  Intent: 'Намерения', Interest: 'Интересы', Skill: 'Навыки',
};

const LABEL_COLOR: Record<string, string> = {
  Value: 'bg-emerald-500', Belief: 'bg-sky-500', Desire: 'bg-amber-500',
  Intent: 'bg-violet-500', Interest: 'bg-rose-500', Skill: 'bg-cyan-500',
};

const fmtNum = (n: number) => n.toLocaleString('ru-RU');

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> =
({ icon, label, value, sub }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{icon}{label}</div>
    <div className="text-2xl font-semibold text-gray-900">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

const MonitoringProfileView: React.FC = () => {
  const [data, setData] = useState<ProfileDepth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/webhook/admin/monitoring/product/profile');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить профиль');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxCount = data ? Math.max(...data.entityCounts.map((e) => e.count), 1) : 1;
  const maxWeek = data ? Math.max(...data.weeklyGrowth.map((w) => w.newProfiles), 1) : 1;

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
            <h3 className="text-sm font-medium text-gray-700 mb-3">Сводка</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<Users className="w-3.5 h-3.5" />} label="Профилей" value={fmtNum(data.perUser.profiles)} />
              <Stat icon={<Layers className="w-3.5 h-3.5" />} label="Всего сущностей" value={fmtNum(data.totalEntities)}
                sub={`PDS итого: ${fmtNum(data.totalPds)}`} />
              <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Средний PDS"
                value={data.perUser.avgPds === null ? '—' : fmtNum(data.perUser.avgPds)}
                sub={`p50 ${data.perUser.p50Pds ?? '—'} · p95 ${data.perUser.p95Pds ?? '—'}`} />
              <Stat icon={<Network className="w-3.5 h-3.5" />} label="Avg сущностей на профиль"
                value={data.perUser.profiles > 0 ? (data.totalEntities / data.perUser.profiles).toFixed(1) : '—'} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Сущности по типам</h3>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              {data.entityCounts.map((e) => {
                const barPct = (e.count / maxCount) * 100;
                return (
                  <div key={e.label}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">
                        {LABEL_RU[e.label] || e.label}
                        <span className="text-xs text-gray-400 ml-2">× {e.weight}</span>
                      </span>
                      <span className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-900">{fmtNum(e.count)}</span>
                        <span className="text-xs text-gray-500 ml-2">вклад в PDS: {fmtNum(e.count * e.weight)}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={clsx('h-full rounded-full transition-all', LABEL_COLOR[e.label] || 'bg-gray-500')} style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                );
              })}
              {data.entityCounts.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">Графовые сущности не найдены</div>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Веса по §3.3: Value × 3, Intent × 3, Belief × 2, Desire × 2, Skill × 2, Interest × 1.
              PDS = Σ (count × weight).
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Прирост профилей (последние 8 недель)</h3>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              {data.weeklyGrowth.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">У узлов Profile нет проставленного `created_at`</div>
              ) : (
                <div className="flex items-end gap-2 h-24">
                  {data.weeklyGrowth.map((w) => {
                    const h = Math.max(4, (w.newProfiles / maxWeek) * 100);
                    return (
                      <div key={w.week} className="flex-1 flex flex-col items-center gap-1" title={`${w.week}: ${w.newProfiles} новых`}>
                        <div className="w-full bg-forest-500/80 rounded-sm hover:bg-forest-600 transition-all" style={{ height: `${h}%` }} />
                        <div className="text-[9px] text-gray-400">{w.week.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <div className="text-xs text-gray-400">
            Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')}
          </div>
        </>
      )}
    </div>
  );
};

export default MonitoringProfileView;
