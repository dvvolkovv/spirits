import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader, RefreshCw, MessageSquare, Zap, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

type Window = '24h' | '7d' | '30d' | '90d' | 'all';
const WINDOW_LABEL: Record<Window, string> = {
  '24h': '24 ч', '7d': '7 дней', '30d': '30 дней', '90d': '90 дней', 'all': 'всё время',
};

interface SupportOverview {
  window: Window;
  generatedAt: string;
  totals: { tickets: number; escalated: number; closed: number; resolved: number; refunds: number };
  shareAiPct: number | null;
  ttfrAiMedianMinutes: number | null;
  ttfrOwnerMedianMinutes: number | null;
  ttrMedianHours: number | null;
  urgencyDistribution: Array<{ urgency: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

const fmtPct = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%`;
const fmtNum = (n: number) => n.toLocaleString('ru-RU');
const fmtMin = (v: number | null) => {
  if (v === null) return '—';
  if (v < 1) return `${Math.round(v * 60)} с`;
  if (v < 60) return `${v.toFixed(1)} мин`;
  return `${(v / 60).toFixed(1)} ч`;
};
const fmtHrs = (v: number | null) => {
  if (v === null) return '—';
  if (v < 1) return `${Math.round(v * 60)} мин`;
  if (v < 48) return `${v.toFixed(1)} ч`;
  return `${(v / 24).toFixed(1)} дн`;
};

const aiShareColor = (pct: number | null) => {
  if (pct === null) return 'text-gray-400';
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 60) return 'text-amber-600';
  return 'text-rose-600';
};
const ttfrAiColor = (v: number | null) => {
  if (v === null) return 'text-gray-400';
  if (v < 1) return 'text-emerald-600';
  if (v < 5) return 'text-amber-600';
  return 'text-rose-600';
};
const ttfrOwnerColor = (v: number | null) => {
  if (v === null) return 'text-gray-400';
  if (v < 30) return 'text-emerald-600';
  if (v < 120) return 'text-amber-600';
  return 'text-rose-600';
};

const STATUS_LABEL: Record<string, string> = {
  ai_handling: 'AI ведёт', escalated: 'Эскалирован', owner_handling: 'У команды',
  resolved: 'Решён', closed: 'Закрыт',
};
const URGENCY_LABEL: Record<string, string> = {
  low: 'низкая', normal: 'обычная', high: 'высокая', critical: 'критическая', '—': 'не задано',
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }> =
({ icon, label, value, sub, valueClass }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{icon}{label}</div>
    <div className={clsx('text-2xl font-semibold text-gray-900', valueClass)}>{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

const MonitoringSupportView: React.FC = () => {
  const [windowKey, setWindowKey] = useState<Window>('30d');
  const [data, setData] = useState<SupportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/webhook/admin/monitoring/product/support?window=${windowKey}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить поддержку');
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
            <h3 className="text-sm font-medium text-gray-700 mb-3">Объём ({WINDOW_LABEL[data.window]})</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<MessageSquare className="w-3.5 h-3.5" />} label="Всего тикетов" value={fmtNum(data.totals.tickets)}
                sub={`решено ${data.totals.resolved} · закрыто ${data.totals.closed}`} />
              <Stat icon={<RotateCcw className="w-3.5 h-3.5" />} label="Эскалировано команде" value={fmtNum(data.totals.escalated)}
                sub="событие 'escalate' в истории" />
              <Stat icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Рефанды" value={fmtNum(data.totals.refunds)}
                sub="событие 'refund'"
                valueClass={data.totals.refunds > 0 ? 'text-amber-600' : undefined} />
              <Stat icon={<Zap className="w-3.5 h-3.5" />} label="AI-share"
                value={fmtPct(data.shareAiPct)} valueClass={aiShareColor(data.shareAiPct)}
                sub="без эскалации к команде" />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Время реакции</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="TTFR-AI (медиана)"
                value={fmtMin(data.ttfrAiMedianMinutes)} valueClass={ttfrAiColor(data.ttfrAiMedianMinutes)}
                sub="первый ответ AI" />
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="TTFR-owner (медиана)"
                value={fmtMin(data.ttfrOwnerMedianMinutes)} valueClass={ttfrOwnerColor(data.ttfrOwnerMedianMinutes)}
                sub="эскалация → ответ команды" />
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="TTR (медиана)"
                value={fmtHrs(data.ttrMedianHours)} sub="created → resolved" />
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Распределение по статусам</h3>
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr><th className="text-left px-3 py-2 font-medium">Статус</th>
                        <th className="text-right px-3 py-2 font-medium">Кол-во</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.byStatus.map((s) => (
                      <tr key={s.status}>
                        <td className="px-3 py-2">{STATUS_LABEL[s.status] || s.status}</td>
                        <td className="px-3 py-2 text-right font-semibold">{s.count}</td>
                      </tr>
                    ))}
                    {data.byStatus.length === 0 && (
                      <tr><td colSpan={2} className="text-center text-gray-500 px-3 py-4 text-sm">Нет тикетов в окне</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Срочность</h3>
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr><th className="text-left px-3 py-2 font-medium">Урgency</th>
                        <th className="text-right px-3 py-2 font-medium">Кол-во</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.urgencyDistribution.map((u) => (
                      <tr key={u.urgency}>
                        <td className="px-3 py-2">{URGENCY_LABEL[u.urgency] || u.urgency}</td>
                        <td className="px-3 py-2 text-right font-semibold">{u.count}</td>
                      </tr>
                    ))}
                    {data.urgencyDistribution.length === 0 && (
                      <tr><td colSpan={2} className="text-center text-gray-500 px-3 py-4 text-sm">Нет данных</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="text-xs text-gray-400">
            Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')}{' · '}
            CSAT и «преждевременная эскалация» появятся когда команда будет отмечать «Вернуть AI» в админке поддержки.
          </div>
        </>
      )}
    </div>
  );
};

export default MonitoringSupportView;
