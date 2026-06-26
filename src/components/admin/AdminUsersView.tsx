import React, { useState, useEffect, useMemo } from 'react';
import { Users, Loader, AlertCircle, RefreshCw, UserPlus, Activity, Calendar, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import UserActivityDrawer from './UserActivityDrawer';
import { SortableTh, useTableSort, cmp, SortState } from './shared/sortableTable';

interface UserRow {
  phone: string;
  registered_at: string | null;
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
  users: UserRow[];
  totals: {
    users_with_balance: number;
    users_total: number;
    total_balance: number;
  };
}

interface ActiveSeriesPoint {
  day: string;
  unique_users: number;
  new_users: number;
}

interface ActiveResp {
  days: number;
  bucket: 'day' | 'week';
  series: ActiveSeriesPoint[];
  totals: {
    total_users: number;
    new_30d: number;
    new_7d: number;
    new_today: number;
    dau: number;
    wau: number;
    mau: number;
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
const formatDay = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const formatDateOnly = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
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

type UserSortKey = 'registered_at' | 'last_active' | 'spent_period' | 'balance' | 'paid_count';
type Metric = 'unique_users' | 'new_users';
const PERIODS: number[] = [7, 30, 90];

const AdminUsersView: React.FC = () => {
  const [active, setActive] = useState<ActiveResp | null>(null);
  const [users, setUsers] = useState<UsersResp | null>(null);
  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<Metric>('unique_users');
  const [sort, setSort] = useState<SortState<UserSortKey>>({ key: 'spent_period', dir: 'desc' });
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [aResp, uResp] = await Promise.all([
        apiClient.get(`/webhook/admin/users/active?days=${days}`),
        apiClient.get(`/webhook/admin/users/tokens?sort=spent_period&hours=720&limit=500`),
      ]);
      if (!aResp.ok) throw new Error(`Активность: ${aResp.status}`);
      if (!uResp.ok) throw new Error(`Пользователи: ${uResp.status}`);
      setActive(await aResp.json());
      setUsers(await uResp.json());
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]); // eslint-disable-line

  const maxValue = useMemo(() => {
    if (!active) return 0;
    return Math.max(1, ...active.series.map(s => metric === 'unique_users' ? s.unique_users : s.new_users));
  }, [active, metric]);

  const filteredUsers = useMemo(() => {
    if (!users) return [] as UserRow[];
    const q = search.trim().replace(/\D/g, '');
    if (q.length === 0) return users.users;
    return users.users.filter(u => (u.phone || '').replace(/\D/g, '').includes(q));
  }, [users, search]);

  const sortedUsers = useTableSort(filteredUsers, sort, {
    registered_at: cmp.date<UserRow>(u => u.registered_at),
    last_active: cmp.date<UserRow>(u => u.last_active),
    spent_period: cmp.num<UserRow>(u => u.spent_period),
    balance: cmp.num<UserRow>(u => u.balance),
    paid_count: cmp.num<UserRow>(u => u.paid_count),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-forest-600" />
            <h1 className="text-lg font-semibold text-gray-900">Пользователи</h1>
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
        {active && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard
              label="Всего пользователей"
              value={formatTokens(active.totals.total_users)}
              icon={<Users className="w-4 h-4 text-forest-600" />}
              accent
            />
            <StatCard
              label="DAU (сегодня)"
              value={formatTokens(active.totals.dau)}
              icon={<Activity className="w-4 h-4 text-amber-600" />}
              hint={`${active.totals.new_today} новых сегодня`}
            />
            <StatCard
              label="WAU (7 дней)"
              value={formatTokens(active.totals.wau)}
              icon={<Activity className="w-4 h-4 text-forest-600" />}
            />
            <StatCard
              label="MAU (30 дней)"
              value={formatTokens(active.totals.mau)}
              icon={<Activity className="w-4 h-4 text-forest-600" />}
            />
            <StatCard
              label="Новых за 30 дней"
              value={formatTokens(active.totals.new_30d)}
              icon={<UserPlus className="w-4 h-4 text-purple-600" />}
              hint={`${active.totals.new_7d} за 7 дн`}
            />
          </div>
        )}

        {/* Chart */}
        {active && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-medium text-gray-900">
                  {metric === 'unique_users' ? 'Уникальные активные пользователи' : 'Новые регистрации'} по дням
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  За последние {days} дней
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1">
                  {([
                    { id: 'unique_users', label: 'Активные' },
                    { id: 'new_users', label: 'Новые' },
                  ] as { id: Metric; label: string }[]).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMetric(m.id)}
                      className={clsx(
                        'px-2.5 py-1 text-xs rounded-md border transition-colors',
                        metric === m.id
                          ? 'border-forest-400 bg-forest-50 text-forest-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {m.label}
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

            {active.series.length === 0 || maxValue <= 1 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Нет данных за выбранный период</p>
            ) : (() => {
              const yMax = niceCeil(maxValue);
              const ticks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];
              return (
                <div className="flex gap-2 min-w-0">
                  <div className="flex flex-col justify-between text-[10px] text-gray-400 h-56 pb-5 text-right shrink-0 w-12">
                    {ticks.map((t, i) => (
                      <span key={i} className="leading-none">{formatTokens(Math.round(t))}</span>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0 relative" onMouseLeave={() => setHoveredIdx(null)}>
                    {hoveredIdx !== null && active.series[hoveredIdx] && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs whitespace-nowrap shadow-lg pointer-events-none z-20 -translate-y-full">
                        <div className="font-medium">{formatDay(active.series[hoveredIdx].day)}</div>
                        <div className="text-amber-300 font-semibold">
                          {metric === 'unique_users'
                            ? `${formatTokens(active.series[hoveredIdx].unique_users)} активных`
                            : `${formatTokens(active.series[hoveredIdx].new_users)} новых`}
                        </div>
                        <div className="text-gray-300 text-[10px]">
                          {metric === 'unique_users'
                            ? `${active.series[hoveredIdx].new_users} новых`
                            : `${active.series[hoveredIdx].unique_users} активных`}
                        </div>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <div className="relative h-56 min-w-full" style={{ minWidth: active.series.length * 18 }}>
                        <div className="absolute inset-0 bottom-5 flex flex-col justify-between pointer-events-none">
                          {ticks.map((_, i) => (
                            <div key={i} className={clsx('w-full border-t', i === ticks.length - 1 ? 'border-gray-300' : 'border-gray-100 border-dashed')} />
                          ))}
                        </div>
                        <div className="relative flex gap-0.5 h-full">
                          {active.series.map((d, i) => {
                            const v = metric === 'unique_users' ? d.unique_users : d.new_users;
                            const heightPct = (v / yMax) * 100;
                            const total = active.series.length;
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
                                          ? metric === 'unique_users' ? 'bg-forest-700' : 'bg-purple-700'
                                          : metric === 'unique_users' ? 'bg-forest-600' : 'bg-purple-500'
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

        {/* Search + sort */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по телефону..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-forest-400 focus:ring-1 focus:ring-forest-200 outline-none"
            />
          </div>
          <span className="text-xs text-gray-400 sm:ml-auto">
            {sortedUsers.length} из {users?.users.length ?? 0}
          </span>
        </div>

        {/* Users table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isLoading && !users && (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-forest-600" />
            </div>
          )}
          {users && sortedUsers.length === 0 && !error && (
            <p className="text-sm text-gray-400 py-12 text-center">Нет пользователей</p>
          )}
          {users && sortedUsers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 font-medium">Телефон</th>
                    <SortableTh sortKey="registered_at" state={sort} onSort={setSort}>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Зарегистрирован
                      </span>
                    </SortableTh>
                    <SortableTh sortKey="last_active" state={sort} onSort={setSort}>Последняя активность</SortableTh>
                    <SortableTh sortKey="spent_period" state={sort} onSort={setSort} align="right">Списано за 30 дн</SortableTh>
                    <SortableTh sortKey="balance" state={sort} onSort={setSort} align="right">Баланс</SortableTh>
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
                      <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatDateOnly(u.registered_at)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{formatRelative(u.last_active)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700 font-medium">
                        {u.spent_period > 0 ? `−${formatTokens(u.spent_period)}` : <span className="text-gray-300 font-normal">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-forest-700">{formatTokens(u.balance)}</td>
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
  <div className={clsx('rounded-xl border p-3', accent ? 'border-forest-300 bg-forest-50' : 'border-gray-200 bg-white')}>
    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
      {icon}
      <span>{label}</span>
    </div>
    <p className={clsx('text-lg font-semibold', accent ? 'text-forest-800' : 'text-gray-900')}>{value}</p>
    {hint && <p className="text-[10px] text-gray-400 mt-1 leading-tight">{hint}</p>}
  </div>
);

export default AdminUsersView;
