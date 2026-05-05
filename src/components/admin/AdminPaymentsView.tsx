import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, Loader, AlertCircle, RefreshCw, Users, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';

interface ReferralLeader {
  id: string;
  name: string;
  slug: string;
}
interface PaymentItem {
  id: string;
  payment_id: string;
  phone: string;
  package_id: string | null;
  amount: number;
  tokens: number;
  status: 'pending' | 'succeeded' | 'canceled' | string;
  created_at: string;
  completed_at: string | null;
  referral_leader: ReferralLeader | null;
}
interface DailyPoint {
  day: string;
  revenue: number;
  succeeded: number;
  pending: number;
  canceled: number;
}
interface Stats {
  daily: DailyPoint[];
  totals: {
    succeeded_count: number;
    pending_count: number;
    canceled_count: number;
    total_count: number;
    revenue_all: number;
    revenue_30d: number;
    revenue_7d: number;
    revenue_today: number;
    unique_payers: number;
  };
}

type StatusFilter = 'all' | 'succeeded' | 'pending' | 'canceled';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  succeeded: { label: 'Успешен', color: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'Ожидает', color: 'bg-amber-100 text-amber-700' },
  canceled: { label: 'Отменён', color: 'bg-gray-100 text-gray-600' },
};

const formatRub = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
const formatPhone = (raw: string) => {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length === 11 && (d.startsWith('7') || d.startsWith('8'))) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw;
};
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const formatDayShort = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const AdminPaymentsView: React.FC = () => {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [days, setDays] = useState<number>(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [pResp, sResp] = await Promise.all([
        apiClient.get(`/webhook/admin/payments?status=${statusFilter}&limit=300`),
        apiClient.get(`/webhook/admin/payments/stats?days=${days}`),
      ]);
      if (!pResp.ok) throw new Error(`Список: ${pResp.status}`);
      if (!sResp.ok) throw new Error(`Статистика: ${sResp.status}`);
      const pData = await pResp.json();
      const sData = await sResp.json();
      setPayments(Array.isArray(pData) ? pData : []);
      setStats(sData);
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, days]); // eslint-disable-line

  const maxRevenue = useMemo(() => {
    if (!stats) return 0;
    return Math.max(1, ...stats.daily.map(d => d.revenue));
  }, [stats]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-forest-600" />
            <h1 className="text-lg font-semibold text-gray-900">Платежи</h1>
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

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Всего выручка" value={formatRub(stats.totals.revenue_all)} icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} />
            <StatCard label="За 30 дней" value={formatRub(stats.totals.revenue_30d)} />
            <StatCard label="За 7 дней" value={formatRub(stats.totals.revenue_7d)} />
            <StatCard label="Сегодня" value={formatRub(stats.totals.revenue_today)} accent />
            <StatCard
              label="Платящих"
              value={stats.totals.unique_payers.toLocaleString('ru-RU')}
              icon={<Users className="w-4 h-4 text-forest-600" />}
              hint={`${stats.totals.succeeded_count} успешных · ${stats.totals.pending_count} в ожидании · ${stats.totals.canceled_count} отменено`}
            />
          </div>
        )}

        {/* Chart */}
        {stats && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-medium text-gray-900">Выручка по дням</h2>
                <p className="text-xs text-gray-500 mt-0.5">Только успешно оплаченные транзакции</p>
              </div>
              <div className="flex gap-1">
                {([7, 30, 90] as const).map(d => (
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

            {stats.daily.length === 0 || maxRevenue <= 1 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Нет данных за выбранный период</p>
            ) : (() => {
              const niceCeil = (v: number) => {
                if (v <= 0) return 1;
                const exp = Math.pow(10, Math.floor(Math.log10(v)));
                const m = v / exp;
                const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
                return nice * exp;
              };
              const yMax = niceCeil(maxRevenue);
              const ticks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];
              return (
                <div className="flex gap-2">
                  <div className="flex flex-col justify-between text-[10px] text-gray-400 h-56 pb-5 text-right shrink-0 w-14">
                    {ticks.map((t, i) => (
                      <span key={i} className="leading-none">{formatRub(t)}</span>
                    ))}
                  </div>
                  <div className="flex-1 relative" onMouseLeave={() => setHoveredIdx(null)}>
                    {hoveredIdx !== null && stats.daily[hoveredIdx] && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs whitespace-nowrap shadow-lg pointer-events-none z-20 -translate-y-full">
                        <div className="font-medium">{formatDayShort(stats.daily[hoveredIdx].day)}</div>
                        <div className="text-emerald-300 font-semibold">{formatRub(stats.daily[hoveredIdx].revenue)}</div>
                        <div className="text-gray-300 text-[10px]">{stats.daily[hoveredIdx].succeeded} платеж(ей)</div>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <div className="relative h-56 min-w-full" style={{ minWidth: stats.daily.length * 18 }}>
                        <div className="absolute inset-0 bottom-5 flex flex-col justify-between pointer-events-none">
                          {ticks.map((_, i) => (
                            <div key={i} className={clsx('w-full border-t', i === ticks.length - 1 ? 'border-gray-300' : 'border-gray-100 border-dashed')} />
                          ))}
                        </div>
                        <div className="relative flex gap-1 h-full">
                          {stats.daily.map((d, i) => {
                            const heightPct = (d.revenue / yMax) * 100;
                            const showLabel = i === 0 || i === stats.daily.length - 1 || i % Math.ceil(stats.daily.length / 8) === 0;
                            const isHovered = hoveredIdx === i;
                            return (
                              <div
                                key={d.day}
                                className="flex-1 flex flex-col h-full min-w-[14px] cursor-pointer"
                                onMouseEnter={() => setHoveredIdx(i)}
                              >
                                <div className="flex-1 flex items-end justify-center relative">
                                  <div
                                    className={clsx(
                                      'w-full max-w-[20px] rounded-t transition-all',
                                      d.revenue > 0
                                        ? isHovered ? 'bg-forest-700' : 'bg-forest-500'
                                        : 'bg-transparent',
                                    )}
                                    style={{ height: `${Math.max(heightPct, d.revenue > 0 ? 2 : 0)}%` }}
                                  />
                                </div>
                                <span className={clsx('text-[9px] mt-1 truncate w-full text-center h-3', isHovered ? 'text-forest-700 font-medium' : 'text-gray-400', !showLabel && !isHovered && 'invisible')}>
                                  {formatDayShort(d.day)}
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

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Статус:</span>
          {(['all', 'succeeded', 'pending', 'canceled'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={clsx(
                'px-3 py-1 text-xs rounded-full border transition-colors',
                statusFilter === f
                  ? 'border-forest-400 bg-forest-50 text-forest-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              {f === 'all' ? 'Все' : STATUS_LABEL[f]?.label || f}
            </button>
          ))}
          <span className="text-xs text-gray-400 ml-auto">{payments.length} записей</span>
        </div>

        {/* Payments list */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-forest-600" />
            </div>
          )}
          {!isLoading && payments.length === 0 && !error && (
            <p className="text-sm text-gray-400 py-12 text-center">Нет платежей</p>
          )}
          {!isLoading && payments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Телефон</th>
                    <th className="text-right px-4 py-2.5 font-medium">Сумма</th>
                    <th className="text-right px-4 py-2.5 font-medium">Токены</th>
                    <th className="text-left px-4 py-2.5 font-medium">Реферал</th>
                    <th className="text-left px-4 py-2.5 font-medium">Статус</th>
                    <th className="text-left px-4 py-2.5 font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map(p => {
                    const meta = STATUS_LABEL[p.status] || { label: p.status, color: 'bg-gray-100 text-gray-600' };
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{formatPhone(p.phone)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatRub(p.amount)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600 text-xs">{p.tokens.toLocaleString('ru-RU')}</td>
                        <td className="px-4 py-2.5">
                          {p.referral_leader ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-medium" title={`/${p.referral_leader.slug}`}>
                              {p.referral_leader.name}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={clsx('inline-block px-2 py-0.5 rounded-full text-xs font-medium', meta.color)}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {formatDateTime(p.completed_at || p.created_at)}
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

export default AdminPaymentsView;
