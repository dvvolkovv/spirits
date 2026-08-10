import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, Loader, AlertCircle, RefreshCw, Users, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import UserActivityDrawer from './UserActivityDrawer';
import { SortableTh, useTableSort, cmp, SortState } from './shared/sortableTable';

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
  status: 'pending' | 'succeeded' | 'canceled' | 'failed' | string;
  provider: string;
  currency: string;
  is_test: boolean;
  created_at: string;
  completed_at: string | null;
  referral_leader: ReferralLeader | null;
}
/** Выручка по валютам: {RUB: 46079, USD: 50}. Складывать между собой нельзя. */
type RevenueByCurrency = Record<string, number>;
interface DailyPoint {
  day: string;
  revenue: RevenueByCurrency;
  succeeded: number;
  pending: number;
  canceled: number;
  failed: number;
}
interface Stats {
  currencies: string[];
  include_test: boolean;
  daily: DailyPoint[];
  totals: {
    succeeded_count: number;
    pending_count: number;
    canceled_count: number;
    failed_count: number;
    total_count: number;
    revenue_all: RevenueByCurrency;
    revenue_30d: RevenueByCurrency;
    revenue_7d: RevenueByCurrency;
    revenue_today: RevenueByCurrency;
    unique_payers: number;
  };
}

type StatusFilter = 'all' | 'succeeded' | 'pending' | 'canceled' | 'failed';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  succeeded: { label: 'Успешен', color: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'Ожидает', color: 'bg-amber-100 text-amber-700' },
  canceled: { label: 'Отменён', color: 'bg-gray-100 text-gray-600' },
  // Выставляет только «Приём»: expired / failed / refunded. У YooKassa
  // неудачная оплата приезжает как canceled.
  failed: { label: 'Ошибка', color: 'bg-red-100 text-red-700' },
};

const PROVIDER_LABEL: Record<string, string> = {
  yookassa: 'YooKassa',
  priem: 'Приём',
};

// Курса между рублём и долларом у нас нет, и подставлять его здесь нельзя:
// суммы разных валют форматируются каждая в своей и рядом не складываются.
const formatMoney = (n: number, currency: string) => {
  const num = n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
  if (currency === 'USD') return `$${num}`;
  if (currency === 'RUB') return `${num} ₽`;
  return `${num} ${currency}`;
};
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
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  // Тестовые аккаунты показываем по умолчанию: все платежи «Приёма» пока
  // существуют только в виде наших прогонов, и без них раздел выглядит так,
  // будто валютного провайдера нет вовсе. Выключается одним кликом — тогда
  // цифры снова становятся чистой выручкой.
  const [includeTest, setIncludeTest] = useState(true);
  // null — «первая доступная валюта»; выбор пользователя переживает перезагрузку данных.
  const [chartCurrency, setChartCurrency] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const test = includeTest ? '&includeTest=1' : '';
      const [pResp, sResp] = await Promise.all([
        apiClient.get(`/webhook/admin/payments?status=${statusFilter}&limit=300${test}`),
        apiClient.get(`/webhook/admin/payments/stats?days=${days}${test}`),
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

  useEffect(() => { load(); }, [statusFilter, days, includeTest]); // eslint-disable-line

  // Валюта графика: выбранная, иначе первая доступная (бэк ставит рубль вперёд).
  const activeCurrency = useMemo(() => {
    const available = stats?.currencies ?? [];
    if (chartCurrency && available.includes(chartCurrency)) return chartCurrency;
    return available[0] ?? 'RUB';
  }, [stats, chartCurrency]);

  const maxRevenue = useMemo(() => {
    if (!stats) return 0;
    return Math.max(1, ...stats.daily.map(d => d.revenue[activeCurrency] ?? 0));
  }, [stats, activeCurrency]);

  type PaymentSortKey = 'amount' | 'tokens' | 'status' | 'created_at';
  const [sort, setSort] = useState<SortState<PaymentSortKey>>({ key: 'created_at', dir: 'desc' });

  const sortedPayments = useTableSort(payments, sort, {
    amount: cmp.num<PaymentItem>(p => p.amount),
    tokens: cmp.num<PaymentItem>(p => p.tokens),
    status: cmp.str<PaymentItem>(p => p.status),
    created_at: cmp.date<PaymentItem>(p => p.completed_at || p.created_at),
  });

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
        {stats && (() => {
          // Первая валюта — крупной цифрой, остальные строкой под ней.
          // Ни при каких условиях не в одну сумму: курса у нас нет.
          const money = (rev: RevenueByCurrency) => {
            const list = (stats.currencies.length ? stats.currencies : ['RUB'])
              .map(c => formatMoney(rev[c] ?? 0, c));
            return { value: list[0], hint: list.length > 1 ? list.slice(1).join(' · ') : undefined };
          };
          const all = money(stats.totals.revenue_all);
          const d30 = money(stats.totals.revenue_30d);
          const d7 = money(stats.totals.revenue_7d);
          const today = money(stats.totals.revenue_today);
          return (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Всего выручка" value={all.value} hint={all.hint} icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} />
              <StatCard label="За 30 дней" value={d30.value} hint={d30.hint} />
              <StatCard label="За 7 дней" value={d7.value} hint={d7.hint} />
              <StatCard label="Сегодня" value={today.value} hint={today.hint} accent />
              <StatCard
                label="Платящих"
                value={stats.totals.unique_payers.toLocaleString('ru-RU')}
                icon={<Users className="w-4 h-4 text-forest-600" />}
                hint={`${stats.totals.succeeded_count} успешных · ${stats.totals.pending_count} в ожидании · ${stats.totals.canceled_count} отменено · ${stats.totals.failed_count} с ошибкой`}
              />
            </div>
          );
        })()}

        {stats?.include_test && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Цифры включают тестовые аккаунты — это не чистая выручка. Снимите чип «Тестовые» ниже, чтобы их исключить.
          </p>
        )}

        {/* Chart */}
        {stats && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-medium text-gray-900">Выручка по дням</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Только успешно оплаченные транзакции{stats.currencies.length > 1 ? ` · ${activeCurrency}` : ''}
                </p>
              </div>
              <div className="flex gap-1">
                {/* Валюты рисуем отдельными рядами, а не одним стеком: 1 ₽ и $1
                    несопоставимы по высоте, общий столбик врал бы масштабом. */}
                {stats.currencies.length > 1 && stats.currencies.map(c => (
                  <button
                    key={c}
                    onClick={() => setChartCurrency(c)}
                    className={clsx(
                      'px-2.5 py-1 text-xs rounded-md border transition-colors',
                      activeCurrency === c
                        ? 'border-forest-400 bg-forest-50 text-forest-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300',
                    )}
                  >
                    {c === 'RUB' ? '₽' : c === 'USD' ? '$' : c}
                  </button>
                ))}
                {stats.currencies.length > 1 && <span className="w-2" />}
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
                <div className="flex gap-2 min-w-0">
                  <div className="flex flex-col justify-between text-[10px] text-gray-400 h-56 pb-5 text-right shrink-0 w-14">
                    {ticks.map((t, i) => (
                      <span key={i} className="leading-none">{formatMoney(t, activeCurrency)}</span>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0 relative" onMouseLeave={() => setHoveredIdx(null)}>
                    {hoveredIdx !== null && stats.daily[hoveredIdx] && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs whitespace-nowrap shadow-lg pointer-events-none z-20 -translate-y-full">
                        <div className="font-medium">{formatDayShort(stats.daily[hoveredIdx].day)}</div>
                        <div className="text-emerald-300 font-semibold">
                          {formatMoney(stats.daily[hoveredIdx].revenue[activeCurrency] ?? 0, activeCurrency)}
                        </div>
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
                            const dayRevenue = d.revenue[activeCurrency] ?? 0;
                            const heightPct = (dayRevenue / yMax) * 100;
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
                                      dayRevenue > 0
                                        ? isHovered ? 'bg-forest-700' : 'bg-forest-500'
                                        : 'bg-transparent',
                                    )}
                                    style={{ height: `${Math.max(heightPct, dayRevenue > 0 ? 2 : 0)}%` }}
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
          {(['all', 'succeeded', 'pending', 'canceled', 'failed'] as StatusFilter[]).map(f => (
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
          <button
            onClick={() => setIncludeTest(v => !v)}
            title="Платежи тестовых аккаунтов — в списке и в цифрах выше"
            className={clsx(
              'px-3 py-1 text-xs rounded-full border transition-colors',
              includeTest
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300',
            )}
          >
            {includeTest ? '✓ ' : ''}Тестовые
          </button>
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
                    <SortableTh sortKey="amount" state={sort} onSort={setSort} align="right">Сумма</SortableTh>
                    <th className="text-left px-4 py-2.5 font-medium">Провайдер</th>
                    <SortableTh sortKey="tokens" state={sort} onSort={setSort} align="right">Токены</SortableTh>
                    <th className="text-left px-4 py-2.5 font-medium">Реферал</th>
                    <SortableTh sortKey="status" state={sort} onSort={setSort} defaultDir="asc">Статус</SortableTh>
                    <SortableTh sortKey="created_at" state={sort} onSort={setSort}>Дата</SortableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedPayments.map(p => {
                    const meta = STATUS_LABEL[p.status] || { label: p.status, color: 'bg-gray-100 text-gray-600' };
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedPhone(p.phone)}
                        className="hover:bg-forest-50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-800">
                          <span className="inline-flex items-center gap-1.5">
                            {formatPhone(p.phone)}
                            {p.is_test && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-sans font-medium">тест</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatMoney(p.amount, p.currency)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{PROVIDER_LABEL[p.provider] || p.provider}</td>
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

export default AdminPaymentsView;
