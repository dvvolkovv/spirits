import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader, RefreshCw, AlertCircle, TrendingUp, Users, Wallet, Activity, Zap, CreditCard } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

type Window = '24h' | '7d' | '30d' | '90d' | 'all';

interface Economy {
  window: Window;
  generatedAt: string;
  excludedUsers: string[];
  revenue: { totalRub: number; paymentsCount: number; avgCheckRub: number };
  paying: {
    uniquePayersWindow: number;
    uniquePayersAllTime: number;
    arppuRub: number;
    arpuRub: number;
    paidConversionPct: number;
    repeatRatePctAllTime: number;
  };
  engagement: { dau: number; wau: number; mau: number; stickinessPct: number };
  activation: { signupsInWindow: number; activatedInWindow: number; activationRatePct: number };
  tokens: { totalBalance: number; avgBalance: number };
  dailyRevenue: Array<{ day: string; rub: number; payments: number }>;
}

const WINDOW_LABEL: Record<Window, string> = {
  '24h': '24 ч',
  '7d':  '7 дней',
  '30d': '30 дней',
  '90d': '90 дней',
  'all': 'всё время',
};

const fmtRub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const fmtNum = (n: number) => n.toLocaleString('ru-RU');
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K`;
  return String(n);
};

// Color-code key product ratios based on §3.5 of monitoring.functions.md
const stickinessColor = (pct: number) => pct >= 30 ? 'text-emerald-600' : pct >= 15 ? 'text-amber-600' : 'text-rose-600';
const repeatColor     = (pct: number) => pct >= 30 ? 'text-emerald-600' : pct >= 15 ? 'text-amber-600' : 'text-rose-600';
const conversionColor = (pct: number) => pct >= 5  ? 'text-emerald-600' : pct >= 2  ? 'text-amber-600' : 'text-rose-600';
const activationColor = (pct: number) => pct >= 50 ? 'text-emerald-600' : pct >= 25 ? 'text-amber-600' : 'text-rose-600';

const Stat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}> = ({ icon, label, value, sub, valueClass }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{icon}{label}</div>
    <div className={clsx('text-2xl font-semibold text-gray-900', valueClass)}>{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

// Lightweight sparkline-as-bars: SVG-free, just flex columns.
const RevenueSpark: React.FC<{ data: Array<{ day: string; rub: number }> }> = ({ data }) => {
  const max = Math.max(1, ...data.map((d) => d.rub));
  if (data.length === 0) {
    return <div className="text-sm text-gray-500">Платежей за 30 дней нет</div>;
  }
  return (
    <div className="flex items-end gap-1 h-24" title="Дневная выручка за 30 дней">
      {data.map((d) => {
        const h = Math.max(4, (d.rub / max) * 100);
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${fmtRub(d.rub)}`}>
            <div className="w-full bg-forest-500/80 rounded-sm transition-all hover:bg-forest-600" style={{ height: `${h}%` }} />
            <div className="text-[9px] text-gray-400">{d.day.slice(5)}</div>
          </div>
        );
      })}
    </div>
  );
};

const MonitoringEconomyView: React.FC = () => {
  const [windowKey, setWindowKey] = useState<Window>('30d');
  const [data, setData] = useState<Economy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/webhook/admin/monitoring/economy?window=${windowKey}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить экономику');
    } finally {
      setLoading(false);
    }
  }, [windowKey]);

  useEffect(() => { load(); }, [load]);

  const totalRevenueAll = useMemo(() => {
    if (!data) return null;
    return data.dailyRevenue.reduce((acc, d) => acc + d.rub, 0);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
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
          <RefreshCw className="w-4 h-4" />Обновить
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
          {/* Revenue + monetization */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Выручка ({WINDOW_LABEL[data.window]})</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<Wallet className="w-3.5 h-3.5" />} label="Выручка"
                value={fmtRub(data.revenue.totalRub)}
                sub={`${data.revenue.paymentsCount} платежа${data.revenue.paymentsCount % 10 === 1 && data.revenue.paymentsCount % 100 !== 11 ? '' : 'ей'}`} />
              <Stat icon={<CreditCard className="w-3.5 h-3.5" />} label="Средний чек"
                value={fmtRub(data.revenue.avgCheckRub)} />
              <Stat icon={<Users className="w-3.5 h-3.5" />} label="Платящих в окне"
                value={fmtNum(data.paying.uniquePayersWindow)}
                sub={`всего за время: ${data.paying.uniquePayersAllTime}`} />
              <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Repeat rate (всё время)"
                value={fmtPct(data.paying.repeatRatePctAllTime)}
                valueClass={repeatColor(data.paying.repeatRatePctAllTime)}
                sub="≥ 2 платежей" />
            </div>
          </section>

          {/* Per-user economy */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Юнит-экономика</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat icon={<Wallet className="w-3.5 h-3.5" />} label="ARPPU"
                value={fmtRub(data.paying.arppuRub)}
                sub="выручка / платящие в окне" />
              <Stat icon={<Wallet className="w-3.5 h-3.5" />} label="ARPU"
                value={fmtRub(data.paying.arpuRub)}
                sub="выручка / активные в окне" />
              <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Paid conversion"
                value={fmtPct(data.paying.paidConversionPct)}
                valueClass={conversionColor(data.paying.paidConversionPct)}
                sub="платящие / регистрации" />
            </div>
          </section>

          {/* Engagement */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Вовлечённость</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<Activity className="w-3.5 h-3.5" />} label="DAU" value={fmtNum(data.engagement.dau)} />
              <Stat icon={<Activity className="w-3.5 h-3.5" />} label="WAU" value={fmtNum(data.engagement.wau)} />
              <Stat icon={<Activity className="w-3.5 h-3.5" />} label="MAU" value={fmtNum(data.engagement.mau)} />
              <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Stickiness DAU/MAU"
                value={fmtPct(data.engagement.stickinessPct)}
                valueClass={stickinessColor(data.engagement.stickinessPct)} />
            </div>
          </section>

          {/* Activation */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Активация ({WINDOW_LABEL[data.window]})</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat icon={<Users className="w-3.5 h-3.5" />} label="Регистраций" value={fmtNum(data.activation.signupsInWindow)} />
              <Stat icon={<Zap className="w-3.5 h-3.5" />} label="Активировались" value={fmtNum(data.activation.activatedInWindow)}
                sub="≥ 3 сообщения за 24 ч от регистрации" />
              <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Activation rate"
                value={fmtPct(data.activation.activationRatePct)}
                valueClass={activationColor(data.activation.activationRatePct)} />
            </div>
          </section>

          {/* Tokens */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Токены (общий пул)</h3>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<Wallet className="w-3.5 h-3.5" />} label="Суммарный баланс" value={fmtTokens(data.tokens.totalBalance)} />
              <Stat icon={<Wallet className="w-3.5 h-3.5" />} label="Средний баланс на юзера" value={fmtTokens(data.tokens.avgBalance)} />
            </div>
          </section>

          {/* Daily revenue chart */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Дневная выручка (последние 30 дней)</h3>
              {totalRevenueAll !== null && (
                <span className="text-xs text-gray-500">Итого за окно: {fmtRub(totalRevenueAll)}</span>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <RevenueSpark data={data.dailyRevenue} />
            </div>
          </section>

          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
            Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')}{' · '}
            Исключены тестовые пользователи: {data.excludedUsers.join(', ')}
          </div>
        </>
      )}
    </div>
  );
};

export default MonitoringEconomyView;
