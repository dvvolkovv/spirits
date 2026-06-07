import React, { useCallback, useEffect, useState } from 'react';
import { Loader, RefreshCw, AlertCircle, Radar } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

// Атрибуция по источникам привлечения (UTM/referral/referrer): воронка
// лендинги → регистрации → активация → платящие/выручка. Закрывает critical-
// задачу Виртуального маркетолога и даёт способ проверить, что UTM-метки доходят.

interface AttributionRow {
  source: string;
  landings: number;
  registrations: number;
  activated: number;
  payers: number;
  revenueRub: number;
}
interface AttributionOverview {
  generatedAt: string;
  windowDays: number;
  rows: AttributionRow[];
  totals: { landings: number; registrations: number; activated: number; payers: number; revenueRub: number };
  note: string;
}

const WINDOWS = [7, 30, 90] as const;

const sourceLabel = (s: string): string => {
  if (s === 'unknown') return 'неизвестно';
  if (s === 'direct') return 'прямой заход';
  if (s.startsWith('utm:')) return `UTM · ${s.slice(4)}`;
  if (s.startsWith('referral:')) return `реферал · ${s.slice(9)}`;
  if (s.startsWith('ref-site:')) return `сайт · ${s.slice(9)}`;
  return s;
};

const fmt = (n: number) => n.toLocaleString('ru-RU');

const MonitoringAttributionView: React.FC = () => {
  const [data, setData] = useState<AttributionOverview | null>(null);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (wd: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/webhook/admin/monitoring/product/attribution?window=${wd}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить атрибуцию');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(windowDays); }, [load, windowDays]);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <Radar className="w-4 h-4" /> Источники привлечения (атрибуция)
        </h3>
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindowDays(w)}
              className={clsx(
                'px-2.5 py-1 text-xs font-medium rounded-md border transition-colors',
                windowDays === w ? 'border-forest-400 bg-forest-50 text-forest-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
              )}
            >
              {w} дн
            </button>
          ))}
          <button onClick={() => load(windowDays)} className="ml-1 p-1.5 text-gray-500 hover:text-forest-600 rounded-md hover:bg-gray-50">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex items-start gap-2 mb-3">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-rose-700">{error}</div>
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-8"><Loader className="w-6 h-6 text-forest-600 animate-spin" /></div>
      )}

      {data && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-3 py-2 font-medium">Источник</th>
                <th className="px-3 py-2 font-medium text-right">Лендинги</th>
                <th className="px-3 py-2 font-medium text-right">Регистрации</th>
                <th className="px-3 py-2 font-medium text-right">Активация</th>
                <th className="px-3 py-2 font-medium text-right">Платящие</th>
                <th className="px-3 py-2 font-medium text-right">Выручка</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Данных за период нет</td></tr>
              )}
              {data.rows.map((r) => {
                const isUtm = r.source.startsWith('utm:') || r.source.startsWith('referral:');
                return (
                  <tr key={r.source} className={clsx('border-b border-gray-50 last:border-0', isUtm && 'bg-forest-50/40')}>
                    <td className="px-3 py-2">
                      <span className={clsx('font-medium', isUtm ? 'text-forest-700' : 'text-gray-800')}>{sourceLabel(r.source)}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmt(r.landings)}</td>
                    <td className="px-3 py-2 text-right text-gray-800 font-medium">{fmt(r.registrations)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {fmt(r.activated)}
                      {r.registrations > 0 && <span className="text-gray-400 text-xs"> ({Math.round((100 * r.activated) / r.registrations)}%)</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmt(r.payers)}</td>
                    <td className="px-3 py-2 text-right text-gray-800">{r.revenueRub > 0 ? `${fmt(r.revenueRub)} ₽` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            {data.rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 text-gray-700 font-medium">
                  <td className="px-3 py-2">Итого</td>
                  <td className="px-3 py-2 text-right">{fmt(data.totals.landings)}</td>
                  <td className="px-3 py-2 text-right">{fmt(data.totals.registrations)}</td>
                  <td className="px-3 py-2 text-right">{fmt(data.totals.activated)}</td>
                  <td className="px-3 py-2 text-right">{fmt(data.totals.payers)}</td>
                  <td className="px-3 py-2 text-right">{data.totals.revenueRub > 0 ? `${fmt(data.totals.revenueRub)} ₽` : '—'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {data && (
        <div className="text-xs text-gray-400 mt-2 leading-snug">{data.note}</div>
      )}
    </section>
  );
};

export default MonitoringAttributionView;
