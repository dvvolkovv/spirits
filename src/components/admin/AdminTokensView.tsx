import React, { useState, useEffect, useMemo } from 'react';
import { Coins, Loader, AlertCircle, RefreshCw, TrendingDown, Users, Wallet } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import UserActivityDrawer from './UserActivityDrawer';
import { SortableTh, useTableSort, cmp, SortState } from './shared/sortableTable';

interface UserTokenRow {
  phone: string;
  balance: number;
  spent_total: number;
  spent_period: number;
  last_active: string | null;
  paid_count: number;
  paid_rub: number;
  referral_leader_name: string | null;
}

interface UsersResp {
  hours: number;
  users: UserTokenRow[];
  totals: {
    users_with_balance: number;
    users_total: number;
    total_balance: number;
  };
}

interface SeriesPoint {
  bucket: string;
  spent: number;
  tx_count: number;
}
interface SpendStats {
  bucket: 'day' | 'hour';
  series: SeriesPoint[];
  totals: {
    spent_today: number;
    spent_7d: number;
    spent_30d: number;
    spent_all: number;
    active_users_30d: number;
  };
}

const formatPhone = (raw: string) => {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length === 11 && (d.startsWith('7') || d.startsWith('8'))) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw;
};
const formatTokens = (n: number) => n.toLocaleString('ru-RU');
const formatRub = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
const niceCeil = (v: number) => {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / exp;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return nice * exp;
};
const formatBucket = (iso: string, bucket: 'day' | 'hour') => {
  const d = new Date(iso);
  if (bucket === 'hour') {
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
  }
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

type TokenSortKey = 'balance' | 'spent_period' | 'last_active' | 'paid_count';
type Bucket = 'day' | 'hour';

const AdminTokensView: React.FC = () => {
  const [usersData, setUsersData] = useState<UsersResp | null>(null);
  const [spendStats, setSpendStats] = useState<SpendStats | null>(null);
  const [sort, setSort] = useState<SortState<TokenSortKey>>({ key: 'spent_period', dir: 'desc' });
  const [bucket, setBucket] = useState<Bucket>('day');
  const [days, setDays] = useState<number>(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  const periodHours = days * 24;
  const periodLabel =
    bucket === 'hour'
      ? days === 1 ? 'за 24 ч' : `за ${days * 24} ч`
      : `за ${days} дн`;

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [uResp, sResp] = await Promise.all([
        apiClient.get(`/webhook/admin/users/tokens?hours=${periodHours}&limit=200`),
        apiClient.get(`/webhook/admin/tokens/stats?bucket=${bucket}&days=${days}`),
      ]);
      if (!uResp.ok) throw new Error(`Пользователи: ${uResp.status}`);
      if (!sResp.ok) throw new Error(`Статистика: ${sResp.status}`);
      setUsersData(await uResp.json());
      setSpendStats(await sResp.json());
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [bucket, days]); // eslint-disable-line

  const maxSpent = useMemo(() => {
    if (!spendStats) return 0;
    return Math.max(1, ...spendStats.series.map(s => s.spent));
  }, [spendStats]);

  const sortedUsers = useTableSort(usersData?.users ?? [], sort, {
    balance: cmp.num<UserTokenRow>(u => u.balance),
    spent_period: cmp.num<UserTokenRow>(u => u.spent_period),
    last_active: cmp.date<UserTokenRow>(u => u.last_active),
    paid_count: cmp.num<UserTokenRow>(u => u.paid_count),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-forest-600" />
            <h1 className="text-lg font-semibold text-gray-900">Токены</h1>
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
        {(usersData || spendStats) && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard
              label="Баланс всех"
              value={formatTokens(usersData?.totals.total_balance ?? 0)}
              icon={<Wallet className="w-4 h-4 text-forest-600" />}
              hint={`${usersData?.totals.users_with_balance ?? 0} из ${usersData?.totals.users_total ?? 0} пользователей`}
            />
            <StatCard
              label="Списано сегодня"
              value={formatTokens(spendStats?.totals.spent_today ?? 0)}
              icon={<TrendingDown className="w-4 h-4 text-amber-600" />}
              accent
            />
            <StatCard label="За 7 дней" value={formatTokens(spendStats?.totals.spent_7d ?? 0)} />
            <StatCard label="За 30 дней" value={formatTokens(spendStats?.totals.spent_30d ?? 0)} />
            <StatCard
              label="Активных за 30 дней"
              value={formatTokens(spendStats?.totals.active_users_30d ?? 0)}
              icon={<Users className="w-4 h-4 text-forest-600" />}
              hint={`всего списаний: ${formatTokens(spendStats?.totals.spent_all ?? 0)}`}
            />
          </div>
        )}

        {/* Spend chart */}
        {spendStats && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-medium text-gray-900">Списания токенов по {bucket === 'hour' ? 'часам' : 'дням'}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Только транзакции типа «consumed»</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1">
                  {(['day', 'hour'] as const).map(b => (
                    <button
                      key={b}
                      onClick={() => { setBucket(b); setDays(b === 'hour' ? 2 : 30); }}
                      className={clsx(
                        'px-2.5 py-1 text-xs rounded-md border transition-colors',
                        bucket === b
                          ? 'border-forest-400 bg-forest-50 text-forest-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {b === 'day' ? 'По дням' : 'По часам'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {(bucket === 'day' ? [7, 30, 90] : [1, 2, 7]).map(d => (
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
                      {bucket === 'day' ? `${d} дн` : (d === 1 ? '24 ч' : `${d * 24} ч`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {spendStats.series.length === 0 || maxSpent <= 1 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Нет данных за выбранный период</p>
            ) : (() => {
              const yMax = niceCeil(maxSpent);
              const ticks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];
              return (
                <div className="flex gap-2 min-w-0">
                  <div className="flex flex-col justify-between text-[10px] text-gray-400 h-56 pb-5 text-right shrink-0 w-16">
                    {ticks.map((t, i) => (
                      <span key={i} className="leading-none">{formatTokens(Math.round(t))}</span>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0 relative" onMouseLeave={() => setHoveredIdx(null)}>
                    {hoveredIdx !== null && spendStats.series[hoveredIdx] && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs whitespace-nowrap shadow-lg pointer-events-none z-20 -translate-y-full">
                        <div className="font-medium">{formatBucket(spendStats.series[hoveredIdx].bucket, bucket)}</div>
                        <div className="text-amber-300 font-semibold">−{formatTokens(spendStats.series[hoveredIdx].spent)} токенов</div>
                        <div className="text-gray-300 text-[10px]">{spendStats.series[hoveredIdx].tx_count} транзакций</div>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <div className="relative h-56 min-w-full" style={{ minWidth: spendStats.series.length * (bucket === 'hour' ? 14 : 18) }}>
                        <div className="absolute inset-0 bottom-5 flex flex-col justify-between pointer-events-none">
                          {ticks.map((_, i) => (
                            <div key={i} className={clsx('w-full border-t', i === ticks.length - 1 ? 'border-gray-300' : 'border-gray-100 border-dashed')} />
                          ))}
                        </div>
                        <div className="relative flex gap-0.5 h-full">
                          {spendStats.series.map((d, i) => {
                            const heightPct = (d.spent / yMax) * 100;
                            const total = spendStats.series.length;
                            const showLabel = i === 0 || i === total - 1 || i % Math.ceil(total / 8) === 0;
                            const isHovered = hoveredIdx === i;
                            return (
                              <div
                                key={d.bucket}
                                className="flex-1 flex flex-col h-full min-w-[12px] cursor-pointer"
                                onMouseEnter={() => setHoveredIdx(i)}
                              >
                                <div className="flex-1 flex items-end justify-center relative">
                                  <div
                                    className={clsx(
                                      'w-full max-w-[20px] rounded-t transition-all',
                                      d.spent > 0
                                        ? isHovered ? 'bg-amber-600' : 'bg-amber-500'
                                        : 'bg-transparent',
                                    )}
                                    style={{ height: `${Math.max(heightPct, d.spent > 0 ? 2 : 0)}%` }}
                                  />
                                </div>
                                <span className={clsx('text-[9px] mt-1 truncate w-full text-center h-3', isHovered ? 'text-amber-700 font-medium' : 'text-gray-400', !showLabel && !isHovered && 'invisible')}>
                                  {formatBucket(d.bucket, bucket)}
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

        {/* Users counter */}
        <div className="flex items-center justify-end">
          <span className="text-xs text-gray-400">
            {usersData?.users.length ?? 0} пользователей
          </span>
        </div>

        {/* Users table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isLoading && !usersData && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-forest-600" />
            </div>
          )}
          {usersData && usersData.users.length === 0 && !error && (
            <p className="text-sm text-gray-400 py-12 text-center">Нет пользователей</p>
          )}
          {usersData && usersData.users.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 font-medium">Телефон</th>
                    <SortableTh sortKey="balance" state={sort} onSort={setSort} align="right">Баланс</SortableTh>
                    <SortableTh sortKey="spent_period" state={sort} onSort={setSort} align="right">Списано {periodLabel}</SortableTh>
                    <SortableTh sortKey="last_active" state={sort} onSort={setSort}>Последняя активность</SortableTh>
                    <th className="text-right px-4 py-2.5 font-medium">Списано всего</th>
                    <SortableTh sortKey="paid_count" state={sort} onSort={setSort} align="right">Платежей</SortableTh>
                    <th className="text-left px-4 py-2.5 font-medium">Реферал</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedUsers.map((u, idx) => (
                    <tr
                      key={u.phone}
                      onClick={() => setSelectedPhone(u.phone)}
                      className="hover:bg-forest-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{formatPhone(u.phone)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-forest-700">{formatTokens(u.balance)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700 font-medium">{u.spent_period > 0 ? `−${formatTokens(u.spent_period)}` : <span className="text-gray-300 font-normal">—</span>}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {u.last_active ? new Date(u.last_active).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{u.spent_total > 0 ? formatTokens(u.spent_total) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-right">
                        {u.paid_count > 0 ? (
                          <span className="text-xs text-gray-700"><span className="font-semibold">{u.paid_count}</span> · {formatRub(u.paid_rub)}</span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {u.referral_leader_name ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-medium">{u.referral_leader_name}</span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <UserActivityDrawer
        phone={selectedPhone}
        onClose={() => setSelectedPhone(null)}
      />
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; icon?: React.ReactNode; hint?: string; accent?: boolean }> = ({ label, value, icon, hint, accent }) => (
  <div className={clsx('rounded-xl border p-3', accent ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white')}>
    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
      {icon}
      <span>{label}</span>
    </div>
    <p className={clsx('text-lg font-semibold', accent ? 'text-amber-800' : 'text-gray-900')}>{value}</p>
    {hint && <p className="text-[10px] text-gray-400 mt-1 leading-tight">{hint}</p>}
  </div>
);

export default AdminTokensView;
