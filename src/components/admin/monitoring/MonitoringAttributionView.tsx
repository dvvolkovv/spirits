import React, { useCallback, useEffect, useState } from 'react';
import { Loader, RefreshCw, AlertCircle, Radar } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';
import { SortableTh, useTableSort, cmp, SortState } from '../shared/sortableTable';

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
interface CampaignRow {
  campaign: string;
  registrations: number;
  activated: number;
  payers: number;
  revenueRub: number;
}
interface AttributionOverview {
  generatedAt: string;
  windowDays: number;
  rows: AttributionRow[];
  byCampaign?: CampaignRow[];
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

  type SourceSortKey = 'landings' | 'registrations' | 'activated' | 'payers' | 'revenueRub';
  type CampaignSortKey = 'registrations' | 'activated' | 'payers' | 'revenueRub';

  const [sourceSort, setSourceSort] = useState<SortState<SourceSortKey>>({ key: 'revenueRub', dir: 'desc' });
  const [campaignSort, setCampaignSort] = useState<SortState<CampaignSortKey>>({ key: 'revenueRub', dir: 'desc' });

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

  const sortedSources = useTableSort<AttributionRow, SourceSortKey>(data?.rows ?? [], sourceSort, {
    landings: cmp.num<AttributionRow>(r => r.landings),
    registrations: cmp.num<AttributionRow>(r => r.registrations),
    activated: cmp.num<AttributionRow>(r => r.activated),
    payers: cmp.num<AttributionRow>(r => r.payers),
    revenueRub: cmp.num<AttributionRow>(r => r.revenueRub),
  });
  const sortedCampaigns = useTableSort<CampaignRow, CampaignSortKey>(data?.byCampaign ?? [], campaignSort, {
    registrations: cmp.num<CampaignRow>(r => r.registrations),
    activated: cmp.num<CampaignRow>(r => r.activated),
    payers: cmp.num<CampaignRow>(r => r.payers),
    revenueRub: cmp.num<CampaignRow>(r => r.revenueRub),
  });

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
                <SortableTh sortKey="landings" state={sourceSort} onSort={setSourceSort} align="right" className="!px-3 !py-2">Лендинги</SortableTh>
                <SortableTh sortKey="registrations" state={sourceSort} onSort={setSourceSort} align="right" className="!px-3 !py-2">Регистрации</SortableTh>
                <SortableTh sortKey="activated" state={sourceSort} onSort={setSourceSort} align="right" className="!px-3 !py-2">Активация</SortableTh>
                <SortableTh sortKey="payers" state={sourceSort} onSort={setSourceSort} align="right" className="!px-3 !py-2">Платящие</SortableTh>
                <SortableTh sortKey="revenueRub" state={sourceSort} onSort={setSourceSort} align="right" className="!px-3 !py-2">Выручка</SortableTh>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Данных за период нет</td></tr>
              )}
              {sortedSources.map((r) => {
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

      {data && data.byCampaign && data.byCampaign.length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm font-medium text-gray-700 mb-2">A/B по кампаниям и креативам</h4>
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-3 py-2 font-medium">Кампания / креатив</th>
                  <SortableTh sortKey="registrations" state={campaignSort} onSort={setCampaignSort} align="right" className="!px-3 !py-2">Регистрации</SortableTh>
                  <SortableTh sortKey="activated" state={campaignSort} onSort={setCampaignSort} align="right" className="!px-3 !py-2">Активация</SortableTh>
                  <SortableTh sortKey="payers" state={campaignSort} onSort={setCampaignSort} align="right" className="!px-3 !py-2">Платящие</SortableTh>
                  <SortableTh sortKey="revenueRub" state={campaignSort} onSort={setCampaignSort} align="right" className="!px-3 !py-2">Выручка</SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedCampaigns.map((c) => (
                  <tr key={c.campaign} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 font-medium text-gray-800">{c.campaign}</td>
                    <td className="px-3 py-2 text-right text-gray-800 font-medium">{fmt(c.registrations)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {fmt(c.activated)}
                      {c.registrations > 0 && <span className="text-gray-400 text-xs"> ({Math.round((100 * c.activated) / c.registrations)}%)</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{fmt(c.payers)}</td>
                    <td className="px-3 py-2 text-right text-gray-800">{c.revenueRub > 0 ? `${fmt(c.revenueRub)} ₽` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-400 mt-1.5">Разрез по utm_campaign/utm_content (напр. biz_jun26/cr_A vs biz_jun26/cr_B). Какой креатив даёт регистрации/оплаты, а не только клики.</div>
        </div>
      )}

      {data && (
        <div className="text-xs text-gray-400 mt-2 leading-snug">{data.note}</div>
      )}
    </section>
  );
};

export default MonitoringAttributionView;
