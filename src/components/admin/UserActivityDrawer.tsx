import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  X, Loader, AlertCircle, Coins, MessageSquare, Image as ImageIcon,
  Video, Phone, ArrowDown, ArrowUp, Activity, CreditCard,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';

interface ActivityResp {
  user: {
    phone: string;
    registered_at: string | null;
    balance: number;
    email: string | null;
    isadmin: boolean;
    preferred_agent: string | null;
    paid_count: number;
    paid_rub: number;
    referral_leader_name: string | null;
    last_active: string | null;
  } | null;
  totals: {
    spent_total: number;
    spent_period: number;
    queries_total: number;
    queries_period: number;
    images_count: number;
    videos_count: number;
    calls_count: number;
  };
  series: Array<{ day: string; tokens_spent: number; queries: number }>;
  byAssistant: Array<{ id: number; name: string; queries: number; tokens: number; last_used: string | null }>;
  transactions: Array<{ id: string; created_at: string; amount: number; transaction_type: string; reason: string }>;
  recentMessages: Array<{
    id: string; created_at: string; agent_id: number | null;
    agent_name: string | null; role: string; preview: string;
  }>;
  payments?: Array<{
    id: string;
    payment_id: string;
    package_id: string | null;
    amount_rub: number;
    tokens: number;
    status: string;
    created_at: string;
    completed_at: string | null;
  }>;
}

const PACKAGE_LABEL_RU: Record<string, string> = {
  starter: 'Стартовый',
  basic: 'Базовый',
  extended: 'Расширенный',
  professional: 'Профессиональный',
};
const PACKAGE_LABEL_EN: Record<string, string> = {
  starter: 'Starter',
  basic: 'Basic',
  extended: 'Extended',
  professional: 'Professional',
};

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
const formatDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  return formatDateOnly(iso);
};

type Metric = 'tokens' | 'queries';
const PERIODS: number[] = [30, 90];

interface Props {
  phone: string | null;
  onClose: () => void;
}

const UserActivityDrawer: React.FC<Props> = ({ phone, onClose }) => {
  const { t, i18n } = useTranslation();
  const labelForPackage = (pkg: string | null): string => {
    if (!pkg) return '—';
    const map = i18n.language?.startsWith('en') ? PACKAGE_LABEL_EN : PACKAGE_LABEL_RU;
    return map[pkg] ?? pkg;
  };
  const paymentStatusClass = (status: string): string => {
    switch (status) {
      case 'succeeded':
      case 'completed':
        return 'bg-forest-50 text-forest-700';
      case 'pending':
        return 'bg-amber-50 text-amber-700';
      case 'failed':
        return 'bg-red-50 text-red-700';
      case 'canceled':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };
  const paymentStatusLabel = (status: string): string => {
    const knownStatusKeys: Record<string, string> = {
      succeeded: 'admin.userActivity.paymentStatus.completed',
      completed: 'admin.userActivity.paymentStatus.completed',
      pending: 'admin.userActivity.paymentStatus.pending',
      failed: 'admin.userActivity.paymentStatus.failed',
      canceled: 'admin.userActivity.paymentStatus.canceled',
    };
    const key = knownStatusKeys[status];
    return key ? t(key) : status;
  };
  const [data, setData] = useState<ActivityResp | null>(null);
  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<Metric>('tokens');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Body scroll lock + ESC handler
  useEffect(() => {
    if (!phone) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [phone, onClose]);

  // Fetch on phone/days change
  useEffect(() => {
    if (!phone) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const resp = await apiClient.get(
          `/webhook/admin/users/${encodeURIComponent(phone)}/activity?days=${days}`,
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Не удалось загрузить данные');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [phone, days]);

  const maxValue = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...data.series.map(s => metric === 'tokens' ? s.tokens_spent : s.queries));
  }, [data, metric]);

  if (!phone) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/40 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div className="w-full max-w-3xl bg-gray-50 shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900">
                {t('admin.userActivity.title', 'Активность пользователя')}
              </h2>
              {data?.user?.isadmin && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-semibold">
                  ADMIN
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-xs">
              <span className="font-mono text-gray-700">{formatPhone(phone)}</span>
              {data?.user?.email && (
                <span className="text-gray-500">{data.user.email}</span>
              )}
              {data?.user?.registered_at && (
                <span className="text-gray-400">
                  {t('admin.userActivity.registeredOn', 'с')} {formatDateOnly(data.user.registered_at)}
                </span>
              )}
              {data?.user?.referral_leader_name && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-medium">
                  {data.user.referral_leader_name}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-4 md:p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading && !data && (
            <div className="flex items-center justify-center py-16">
              <Loader className="w-6 h-6 animate-spin text-forest-600" />
            </div>
          )}

          {data && (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KPI
                  icon={<Coins className="w-4 h-4 text-forest-600" />}
                  label={t('admin.userActivity.kpis.balance', 'Баланс')}
                  value={formatTokens(data.user?.balance ?? 0)}
                  hint={
                    data.user && data.user.paid_count > 0
                      ? `${data.user.paid_count} × ${formatRub(data.user.paid_rub)}`
                      : t('admin.userActivity.kpis.noPayments', 'без оплат')
                  }
                  accent
                />
                <KPI
                  icon={<ArrowDown className="w-4 h-4 text-amber-600" />}
                  label={t('admin.userActivity.kpis.spentPeriod', 'Списано за период')}
                  value={formatTokens(data.totals.spent_period)}
                  hint={`${t('admin.userActivity.kpis.allTime', 'всего')}: ${formatTokens(data.totals.spent_total)}`}
                />
                <KPI
                  icon={<MessageSquare className="w-4 h-4 text-forest-600" />}
                  label={t('admin.userActivity.kpis.queries', 'Запросов')}
                  value={formatTokens(data.totals.queries_period)}
                  hint={`${t('admin.userActivity.kpis.allTime', 'всего')}: ${formatTokens(data.totals.queries_total)}`}
                />
                <KPI
                  icon={<ImageIcon className="w-4 h-4 text-purple-600" />}
                  label={t('admin.userActivity.kpis.images', 'Изображений')}
                  value={formatTokens(data.totals.images_count)}
                />
                <KPI
                  icon={<Video className="w-4 h-4 text-pink-600" />}
                  label={t('admin.userActivity.kpis.videos', 'Видео')}
                  value={formatTokens(data.totals.videos_count)}
                />
                <KPI
                  icon={<Phone className="w-4 h-4 text-blue-600" />}
                  label={t('admin.userActivity.kpis.calls', 'Звонков')}
                  value={formatTokens(data.totals.calls_count)}
                  hint={
                    data.user?.last_active
                      ? `${t('admin.userActivity.kpis.lastActive', 'актив')}: ${formatRelative(data.user.last_active)}`
                      : undefined
                  }
                />
              </div>

              {/* Chart */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 inline-flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-forest-600" />
                      {metric === 'tokens'
                        ? t('admin.userActivity.chart.tokens', 'Списание токенов')
                        : t('admin.userActivity.chart.queries', 'Запросы')} {t('admin.userActivity.chart.byDay', 'по дням')}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t('admin.userActivity.chart.lastDays', 'За последние {{days}} дн', { days })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex gap-1">
                      {([
                        { id: 'tokens', label: t('admin.userActivity.chart.metric.tokens', 'Токены') },
                        { id: 'queries', label: t('admin.userActivity.chart.metric.queries', 'Запросы') },
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

                {data.series.length === 0 || maxValue <= 1 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">
                    {t('admin.userActivity.empty', 'Нет данных за выбранный период')}
                  </p>
                ) : (() => {
                  const yMax = niceCeil(maxValue);
                  const ticks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];
                  return (
                    <div className="flex gap-2 min-w-0">
                      <div className="flex flex-col justify-between text-[10px] text-gray-400 h-44 pb-5 text-right shrink-0 w-12">
                        {ticks.map((tk, i) => (
                          <span key={i} className="leading-none">{formatTokens(Math.round(tk))}</span>
                        ))}
                      </div>
                      <div className="flex-1 min-w-0 relative" onMouseLeave={() => setHoveredIdx(null)}>
                        {hoveredIdx !== null && data.series[hoveredIdx] && (
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs whitespace-nowrap shadow-lg pointer-events-none z-20 -translate-y-full">
                            <div className="font-medium">{formatDay(data.series[hoveredIdx].day)}</div>
                            <div className="text-amber-300 font-semibold">
                              {metric === 'tokens'
                                ? `−${formatTokens(data.series[hoveredIdx].tokens_spent)} ток.`
                                : `${formatTokens(data.series[hoveredIdx].queries)} запр.`}
                            </div>
                            <div className="text-gray-300 text-[10px]">
                              {metric === 'tokens'
                                ? `${data.series[hoveredIdx].queries} запросов`
                                : `−${formatTokens(data.series[hoveredIdx].tokens_spent)} ток.`}
                            </div>
                          </div>
                        )}
                        <div className="overflow-x-auto">
                          <div className="relative h-44 min-w-full" style={{ minWidth: data.series.length * 14 }}>
                            <div className="absolute inset-0 bottom-5 flex flex-col justify-between pointer-events-none">
                              {ticks.map((_, i) => (
                                <div key={i} className={clsx('w-full border-t', i === ticks.length - 1 ? 'border-gray-300' : 'border-gray-100 border-dashed')} />
                              ))}
                            </div>
                            <div className="relative flex gap-0.5 h-full">
                              {data.series.map((p, i) => {
                                const v = metric === 'tokens' ? p.tokens_spent : p.queries;
                                const heightPct = (v / yMax) * 100;
                                const total = data.series.length;
                                const showLabel = i === 0 || i === total - 1 || i % Math.ceil(total / 8) === 0;
                                const isHovered = hoveredIdx === i;
                                return (
                                  <div
                                    key={p.day}
                                    className="flex-1 flex flex-col h-full min-w-[10px] cursor-pointer"
                                    onMouseEnter={() => setHoveredIdx(i)}
                                  >
                                    <div className="flex-1 flex items-end justify-center relative">
                                      <div
                                        className={clsx(
                                          'w-full max-w-[16px] rounded-t transition-all',
                                          v > 0
                                            ? isHovered
                                              ? metric === 'tokens' ? 'bg-amber-700' : 'bg-forest-700'
                                              : metric === 'tokens' ? 'bg-amber-500' : 'bg-forest-500'
                                            : 'bg-transparent',
                                        )}
                                        style={{ height: `${Math.max(heightPct, v > 0 ? 2 : 0)}%` }}
                                      />
                                    </div>
                                    <span className={clsx('text-[9px] mt-1 truncate w-full text-center h-3', isHovered ? 'text-gray-700 font-medium' : 'text-gray-400', !showLabel && !isHovered && 'invisible')}>
                                      {formatDay(p.day)}
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

              {/* By assistant */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-medium text-gray-900">
                  {t('admin.userActivity.sections.byAssistant', 'По ассистентам')}
                </div>
                {data.byAssistant.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">
                    {t('admin.userActivity.empty', 'Нет данных за выбранный период')}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">{t('admin.userActivity.col.assistant', 'Ассистент')}</th>
                          <th className="text-right px-4 py-2 font-medium">{t('admin.userActivity.col.queries', 'Запросов')}</th>
                          <th className="text-right px-4 py-2 font-medium">{t('admin.userActivity.col.tokens', 'Токенов')}</th>
                          <th className="text-left px-4 py-2 font-medium">{t('admin.userActivity.col.lastUsed', 'Последний')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.byAssistant.map(a => (
                          <tr key={a.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">{a.name}</td>
                            <td className="px-4 py-2 text-right text-gray-700 font-medium">{formatTokens(a.queries)}</td>
                            <td className="px-4 py-2 text-right text-amber-700 font-medium">
                              {a.tokens > 0 ? formatTokens(a.tokens) : <span className="text-gray-300 font-normal">—</span>}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{formatRelative(a.last_used)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Payments */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-gray-900 inline-flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-forest-600" />
                    {t('admin.userActivity.sections.payments', 'Платежи')}
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-medium tabular-nums">
                    {data.payments?.length ?? 0}
                  </span>
                </div>
                {!data.payments || data.payments.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">
                    {t('admin.userActivity.empty', 'Нет данных за выбранный период')}
                  </p>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                    {data.payments.map(p => (
                      <div key={p.id} className="px-4 py-2.5 flex items-start gap-3 text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-medium text-gray-800">
                              {labelForPackage(p.package_id)}
                            </span>
                            <span className="text-gray-700 tabular-nums">
                              {formatRub(p.amount_rub)}
                            </span>
                            <span className="text-amber-700 tabular-nums">
                              +{formatTokens(p.tokens)}
                            </span>
                            <span
                              className={clsx(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                                paymentStatusClass(p.status),
                              )}
                            >
                              {paymentStatusLabel(p.status)}
                            </span>
                          </div>
                        </div>
                        <span className="text-gray-400 text-[10px] whitespace-nowrap pt-0.5">
                          {formatRelative(p.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Transactions + recent messages — two columns on md+ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Transactions */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-medium text-gray-900">
                    {t('admin.userActivity.sections.transactions', 'Транзакции')}
                  </div>
                  {data.transactions.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">
                      {t('admin.userActivity.empty', 'Нет данных за выбранный период')}
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                      {data.transactions.map(tx => {
                        const isTopup = tx.transaction_type === 'topup' || tx.amount > 0;
                        return (
                          <div key={tx.id} className="px-4 py-2 flex items-start gap-2 text-xs">
                            <span className={clsx(
                              'flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full',
                              isTopup ? 'bg-forest-50 text-forest-700' : 'bg-amber-50 text-amber-700',
                            )}>
                              {isTopup ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 justify-between">
                                <span className={clsx('font-medium tabular-nums', isTopup ? 'text-forest-700' : 'text-amber-700')}>
                                  {tx.amount > 0 ? '+' : ''}{formatTokens(tx.amount)}
                                </span>
                                <span className="text-gray-400 text-[10px] whitespace-nowrap">{formatDateTime(tx.created_at)}</span>
                              </div>
                              {tx.reason && (
                                <p className="text-gray-500 truncate mt-0.5" title={tx.reason}>{tx.reason}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recent messages */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-medium text-gray-900">
                    {t('admin.userActivity.sections.messages', 'Последние сообщения')}
                  </div>
                  {data.recentMessages.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">
                      {t('admin.userActivity.empty', 'Нет данных за выбранный период')}
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                      {data.recentMessages.map(m => (
                        <div key={m.id} className="px-4 py-2 text-xs">
                          <div className="flex items-baseline gap-2 justify-between">
                            <span className="font-medium text-gray-700 truncate">
                              {m.role === 'human'
                                ? t('admin.userActivity.role.user', 'Пользователь')
                                : (m.agent_name || t('admin.userActivity.role.assistant', 'Ассистент'))}
                            </span>
                            <span className="text-gray-400 text-[10px] whitespace-nowrap">{formatDateTime(m.created_at)}</span>
                          </div>
                          <p className="text-gray-600 mt-0.5 line-clamp-2 break-words">{m.preview}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const KPI: React.FC<{ icon?: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean }> = ({ icon, label, value, hint, accent }) => (
  <div className={clsx('rounded-xl border p-3', accent ? 'border-forest-300 bg-forest-50' : 'border-gray-200 bg-white')}>
    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
      {icon}
      <span>{label}</span>
    </div>
    <p className={clsx('text-lg font-semibold', accent ? 'text-forest-800' : 'text-gray-900')}>{value}</p>
    {hint && <p className="text-[10px] text-gray-400 mt-1 leading-tight">{hint}</p>}
  </div>
);

export default UserActivityDrawer;
