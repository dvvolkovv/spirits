import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Loader, AlertCircle, RefreshCw, MessageSquare, Coins, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';

interface AssistantRow {
  id: number;
  name: string;
  description: string;
  tokens: number;
  queries: number;
  unique_users: number;
  last_used: string | null;
}

interface SeriesPoint {
  day: string;
  queries: number;
  tokens: number;
}

interface AssistantsUsageResp {
  days: number;
  series: SeriesPoint[];
  byAssistant: AssistantRow[];
  totals: {
    queries_today: number;
    queries_7d: number;
    queries_30d: number;
    queries_all: number;
    tokens_today: number;
    tokens_7d: number;
    tokens_30d: number;
    tokens_all: number;
    active_users_7d: number;
    active_users_30d: number;
  };
}

const formatTokens = (n: number) => n.toLocaleString('ru-RU');
const niceCeil = (v: number) => {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / exp;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nice * exp;
};
const formatDay = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const formatRelative = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} дн назад`;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

type Metric = 'tokens' | 'queries';
const PERIODS: number[] = [7, 30, 90];

const AdminUsageView: React.FC = () => {
  const [data, setData] = useState<AssistantsUsageResp | null>(null);
  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<Metric>('tokens');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get(`/webhook/admin/usage/assistants?days=${days}`);
      if (!resp.ok) throw new Error(`Статистика: ${resp.status}`);
      setData(await resp.json());
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]); // eslint-disable-line

  const maxValue = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...data.series.map(s => metric === 'tokens' ? s.tokens : s.queries));
  }, [data, metric]);

  const maxRowValue = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...data.byAssistant.map(a => metric === 'tokens' ? a.tokens : a.queries));
  }, [data, metric]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-forest-600" />
            <h1 className="text-lg font-semibold text-gray-900">Использование ассистентов</h1>
          </div>
          <button
            onClick={load}
            disabled={isLoading}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:border-forest-400 hover:bg-forest-50 disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
            Обновить
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* KPI cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard
              label="Запросов сегодня"
              value={formatTokens(data.totals.queries_today)}
              icon={<MessageSquare className="w-4 h-4 text-forest-600" />}
              accent
            />
            <StatCard
              label="Запросов за 7 дней"
              value={formatTokens(data.totals.queries_7d)}
              hint={`${formatTokens(data.totals.queries_30d)} за 30 дн`}
            />
            <StatCard
              label="Токенов за 7 дней"
              value={formatTokens(data.totals.tokens_7d)}
              icon={<Coins className="w-4 h-4 text-amber-600" />}
              hint={`${formatTokens(data.totals.tokens_30d)} за 30 дн`}
            />
            <StatCard
              label="Активных за 7 дней"
              value={formatTokens(data.totals.active_users_7d)}
              icon={<Users className="w-4 h-4 text-forest-600" />}
              hint={`${formatTokens(data.totals.active_users_30d)} за 30 дн`}
            />
            <StatCard
              label="Запросов всего"
              value={formatTokens(data.totals.queries_all)}
              hint={`${formatTokens(data.totals.tokens_all)} токенов`}
            />
          </div>
        )}

        {/* Chart */}
        {data && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-medium text-gray-900">
                  {metric === 'tokens' ? 'Токены' : 'Запросы'} по дням
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  За последние {days} дней
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1">
                  {(['tokens', 'queries'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMetric(m)}
                      className={clsx(
                        'px-2.5 py-1 text-xs rounded-md border transition-colors',
                        metric === m
                          ? 'border-forest-400 bg-forest-50 text-forest-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {m === 'tokens' ? 'Токены' : 'Запросы'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {PERIODS.map(d => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={clsx(
                        'px-2.5 py-1 text-xs rounded-md border transition-colors',
                        days === d
                          ? 'border-forest-400 bg-forest-50 text-forest-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {d} дн
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {data.series.length === 0 || maxValue <= 1 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Нет данных за выбранный период</p>
            ) : (() => {
              const yMax = niceCeil(maxValue);
              const ticks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];
              return (
                <div className="flex gap-2">
                  <div className="flex flex-col justify-between text-[10px] text-gray-400 h-56 pb-5 text-right shrink-0 w-16">
                    {ticks.map((t, i) => (
                      <span key={i} className="leading-none">{formatTokens(Math.round(t))}</span>
                    ))}
                  </div>
                  <div className="flex-1 relative" onMouseLeave={() => setHoveredIdx(null)}>
                    {hoveredIdx !== null && data.series[hoveredIdx] && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs whitespace-nowrap shadow-lg pointer-events-none z-20 -translate-y-full">
                        <div className="font-medium">{formatDay(data.series[hoveredIdx].day)}</div>
                        <div className="text-amber-300 font-semibold">
                          {formatTokens(metric === 'tokens' ? data.series[hoveredIdx].tokens : data.series[hoveredIdx].queries)}{' '}
                          {metric === 'tokens' ? 'токенов' : 'запросов'}
                        </div>
                        {metric === 'tokens' && (
                          <div className="text-gray-300 text-[10px]">{data.series[hoveredIdx].queries} запросов</div>
                        )}
                        {metric === 'queries' && (
                          <div className="text-gray-300 text-[10px]">{formatTokens(data.series[hoveredIdx].tokens)} токенов</div>
                        )}
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <div className="relative h-56 min-w-full" style={{ minWidth: data.series.length * 18 }}>
                        <div className="absolute inset-0 bottom-5 flex flex-col justify-between pointer-events-none">
                          {ticks.map((_, i) => (
                            <div key={i} className={clsx('w-full border-t', i === ticks.length - 1 ? 'border-gray-300' : 'border-gray-100 border-dashed')} />
                          ))}
                        </div>
                        <div className="relative flex gap-0.5 h-full">
                          {data.series.map((d, i) => {
                            const v = metric === 'tokens' ? d.tokens : d.queries;
                            const heightPct = (v / yMax) * 100;
                            const total = data.series.length;
                            const showLabel = i === 0 || i === total - 1 || i % Math.ceil(total / 8) === 0;
                            const isHovered = hoveredIdx === i;
                            return (
                              <div
                                key={d.day}
                                className="flex-1 flex flex-col h-full min-w-[12px] cursor-pointer"
                                onMouseEnter={() => setHoveredIdx(i)}
                              >
                                <div className="flex-1 flex items-end justify-center relative">
                                  <div
                                    className={clsx(
                                      'w-full max-w-[20px] rounded-t transition-all',
                                      v > 0
                                        ? isHovered
                                          ? metric === 'tokens' ? 'bg-amber-600' : 'bg-forest-700'
                                          : metric === 'tokens' ? 'bg-amber-500' : 'bg-forest-600'
                                        : 'bg-transparent',
                                    )}
                                    style={{ height: `${Math.max(heightPct, v > 0 ? 2 : 0)}%` }}
                                  />
                                </div>
                                <span className={clsx('text-[9px] mt-1 truncate w-full text-center h-3', isHovered ? 'text-gray-700 font-medium' : 'text-gray-400', !showLabel && !isHovered && 'invisible')}>
                                  {formatDay(d.day)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Per-assistant table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-900">Разбивка по ассистентам</h2>
            <span className="text-xs text-gray-400">за {days} дней</span>
          </div>
          {isLoading && !data && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-forest-600" />
            </div>
          )}
          {data && data.byAssistant.length === 0 && !error && (
            <p className="text-sm text-gray-400 py-12 text-center">Нет данных</p>
          )}
          {data && data.byAssistant.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 font-medium">Ассистент</th>
                    <th className="text-right px-4 py-2.5 font-medium">Запросов</th>
                    <th className="text-right px-4 py-2.5 font-medium">Токенов</th>
                    <th className="text-right px-4 py-2.5 font-medium">Польз.</th>
                    <th className="text-right px-4 py-2.5 font-medium">Ср/запрос</th>
                    <th className="text-left px-4 py-2.5 font-medium">Доля</th>
                    <th className="text-right px-4 py-2.5 font-medium">Послед. использ.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.byAssistant.map((a, idx) => {
                    const v = metric === 'tokens' ? a.tokens : a.queries;
                    const pct = maxRowValue > 0 ? (v / maxRowValue) * 100 : 0;
                    const avg = a.queries > 0 ? Math.round(a.tokens / a.queries) : 0;
                    return (
                      <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-900">{a.name}</div>
                          {a.description && <div className="text-xs text-gray-500 truncate max-w-xs">{a.description}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                          {a.queries > 0 ? formatTokens(a.queries) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-700">
                          {a.tokens > 0 ? formatTokens(a.tokens) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-forest-700">
                          {a.unique_users > 0 ? a.unique_users : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                          {avg > 0 ? formatTokens(avg) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 max-w-[120px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={clsx('h-full rounded-full', metric === 'tokens' ? 'bg-amber-500' : 'bg-forest-600')}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400 w-9 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                          {formatRelative(a.last_used)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon?: React.ReactNode; hint?: string; accent?: boolean }> = ({ label, value, icon, hint, accent }) => (
  <div className={clsx('rounded-xl border p-3', accent ? 'border-forest-300 bg-forest-50' : 'border-gray-200 bg-white')}>
    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
      {icon}
      <span>{label}</span>
    </div>
    <p className={clsx('text-lg font-semibold', accent ? 'text-forest-800' : 'text-gray-900')}>{value}</p>
    {hint && <p className="text-[10px] text-gray-400 mt-1 leading-tight">{hint}</p>}
  </div>
);

export default AdminUsageView;
