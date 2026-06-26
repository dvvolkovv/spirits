import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { clsx } from 'clsx';
import {
  Megaphone, RefreshCw, Loader, AlertCircle, Info, Calendar,
  ChevronDown, ChevronRight, ExternalLink, Film,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { SortableTh, useTableSort, cmp, SortState, Comparator } from './shared/sortableTable';

// Вкладка «Реклама» в управлении продуктом. Показывает платные кампании
// (сейчас — VK Реклама), их период, объявления, расход и метрики
// эффективности. Данные тянутся в БД по cron (каждые 3ч), здесь же есть
// кнопка ручного обновления. Источник правды — vk_ads_stats на бэке.

type AdState = 'delivering' | 'active_idle' | 'moderation' | 'paused' | 'finished' | 'rejected' | 'idle' | 'unknown';

interface Creative {
  content: string;
  bannerId: number | null;
  state: AdState;
  status: string | null;
  moderationStatus: string | null;
  delivery: string | null;
  shows: number;
  clicks: number;
  goals: number;
  spent: number;
  ctr: number | null;
  cpc: number | null;
  registrations: number;
  payers: number;
  cpr: number | null;
  landingUrl?: string | null;
  texts?: { title: string | null; text90: string | null; textLong: string | null };
  images?: { slot: string; url: string }[];
  video?: string | null;
}

interface Campaign {
  campaign: string;
  planId: number | null;
  planName: string | null;
  channel: string;
  state: AdState;
  status: string | null;
  delivery: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  budgetDay: number | null;
  shows: number;
  clicks: number;
  goals: number;
  spent: number;
  ctr: number | null;
  cpc: number | null;
  registrations: number;
  payers: number;
  cpr: number | null;
  creatives: Creative[];
}

interface Dashboard {
  configured: boolean;
  lastFetchedAt: string | null;
  windowDays: number;
  liveMeta?: boolean;
  campaigns: Campaign[];
  totals: { shows: number; clicks: number; spent: number; registrations: number; payers: number };
  error?: string;
}

// Цвет/подпись статуса берём по state из бэка (реальный статус VK, не «есть ли стата»).
const STATE_STYLE: Record<AdState, string> = {
  delivering:  'bg-emerald-100 text-emerald-800 border-emerald-200',
  active_idle: 'bg-sky-100 text-sky-800 border-sky-200',
  moderation:  'bg-amber-100 text-amber-800 border-amber-200',
  paused:      'bg-gray-100 text-gray-600 border-gray-200',
  finished:    'bg-slate-100 text-slate-500 border-slate-200',
  rejected:    'bg-rose-100 text-rose-700 border-rose-200',
  idle:        'bg-gray-100 text-gray-500 border-gray-200',
  unknown:     'bg-gray-100 text-gray-500 border-gray-200',
};

const StatusBadge: React.FC<{ state: AdState; label: string }> = ({ state, label }) => (
  <span className={clsx('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border', STATE_STYLE[state] || STATE_STYLE.unknown)}>
    {state === 'delivering' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
    {label}
  </span>
);

const fmtDate = (d: string | null): string => {
  if (!d) return '—';
  // d приходит как 'YYYY-MM-DD' или ISO — берём дату.
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
};

const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const fmtNum = (n: number | null | undefined): string =>
  n == null ? '—' : Number(n).toLocaleString('ru-RU');

const fmtRub = (n: number | null | undefined): string =>
  n == null ? '—' : `${Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;

const Metric: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex flex-col">
    <span className="text-[11px] uppercase tracking-wider text-gray-400">{label}</span>
    <span className={clsx('text-sm font-semibold', accent ? 'text-forest-700' : 'text-gray-900')}>{value}</span>
  </div>
);

type AdSortKey = 'shows' | 'clicks' | 'ctr' | 'cpc' | 'spent' | 'registrations' | 'payers' | 'cpr';

interface CreativeRowsProps {
  creatives: Creative[];
  sort: SortState<AdSortKey>;
  comparators: Record<AdSortKey, Comparator<Creative>>;
  openBanner: number | null;
  setOpenBanner: (n: number | null) => void;
  t: TFunction;
}

const CreativeRows: React.FC<CreativeRowsProps> = ({ creatives, sort, comparators, openBanner, setOpenBanner, t }) => {
  const sorted = useTableSort(creatives, sort, comparators);
  return (
    <>
      {sorted.map((cr) => {
        const hasContent = !!(cr.images?.length || cr.video || cr.texts?.title || cr.texts?.text90 || cr.landingUrl);
        const open = cr.bannerId != null && openBanner === cr.bannerId;
        return (
          <React.Fragment key={cr.bannerId ?? cr.content}>
            <tr className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-900">
                {hasContent ? (
                  <button
                    onClick={() => setOpenBanner(open ? null : (cr.bannerId ?? null))}
                    className="inline-flex items-center gap-1 hover:text-forest-700"
                  >
                    {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    {cr.content}
                  </button>
                ) : cr.content}
              </td>
              <td className="px-3 py-2"><StatusBadge state={cr.state} label={t(`admin.product.ads.state.${cr.state}`)} /></td>
              <td className="px-3 py-2 text-right text-gray-700">{fmtNum(cr.shows)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{fmtNum(cr.clicks)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{cr.ctr != null ? `${cr.ctr}%` : '—'}</td>
              <td className="px-3 py-2 text-right text-gray-700">{fmtRub(cr.cpc)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{fmtRub(cr.spent)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{fmtNum(cr.registrations)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{fmtNum(cr.payers)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{fmtRub(cr.cpr)}</td>
            </tr>
            {open && (
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <td colSpan={10} className="px-4 py-3">
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex flex-wrap gap-2">
                      {cr.images?.map((im) => (
                        <a key={im.slot} href={im.url} target="_blank" rel="noopener noreferrer"
                           title={im.slot} className="block">
                          <img src={im.url} alt={im.slot}
                               className="h-24 w-auto rounded border border-gray-200 object-cover hover:ring-2 hover:ring-forest-400" />
                        </a>
                      ))}
                      {cr.video && (
                        <a href={cr.video} target="_blank" rel="noopener noreferrer"
                           className="h-24 px-3 flex items-center gap-1.5 rounded border border-gray-200 bg-white text-sm text-forest-700 hover:ring-2 hover:ring-forest-400">
                          <Film className="w-4 h-4" /> {t('admin.product.ads.video')}
                        </a>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5 text-sm">
                      {cr.texts?.title && <div className="font-semibold text-gray-900">{cr.texts.title}</div>}
                      {cr.texts?.text90 && <div className="text-gray-700">{cr.texts.text90}</div>}
                      {cr.texts?.textLong && <div className="text-gray-500 text-xs">{cr.texts.textLong}</div>}
                      {cr.landingUrl && (
                        <a href={cr.landingUrl} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-1 text-xs text-forest-700 hover:underline break-all">
                          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> {cr.landingUrl}
                        </a>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

const AdsView: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openBanner, setOpenBanner] = useState<number | null>(null);

  const [sort, setSort] = useState<SortState<AdSortKey>>({ key: 'spent', dir: 'desc' });

  const adComparators = useMemo<Record<AdSortKey, Comparator<Creative>>>(() => ({
    shows: cmp.num<Creative>(c => c.shows),
    clicks: cmp.num<Creative>(c => c.clicks),
    ctr: cmp.num<Creative>(c => c.ctr),
    cpc: cmp.num<Creative>(c => c.cpc),
    spent: cmp.num<Creative>(c => c.spent),
    registrations: cmp.num<Creative>(c => c.registrations),
    payers: cmp.num<Creative>(c => c.payers),
    cpr: cmp.num<Creative>(c => c.cpr),
  }), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiClient.post('/webhook/admin/vk-ads', { action: 'dashboard' });
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
    } catch (e: any) {
      setError(e?.message || t('admin.product.ads.error_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const r = await apiClient.post('/webhook/admin/vk-ads', { action: 'refresh' });
      if (!r.ok) throw new Error(await r.text() || `${r.status}`);
      await load();
    } catch (e: any) {
      setError(e?.message || t('admin.product.ads.error_refresh'));
    } finally {
      setRefreshing(false);
    }
  };

  const totals = data?.totals;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="border-b border-gray-200 bg-white flex-shrink-0">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-forest-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('admin.product.ads.title')}</h2>
              <p className="text-xs text-gray-500">{t('admin.product.ads.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white text-sm font-medium rounded-md hover:bg-forest-700 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
            {refreshing ? t('admin.product.ads.refreshing') : t('admin.product.ads.refresh')}
          </button>
        </div>
        {data && (
          <div className="px-4 sm:px-6 pb-2 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
            <span>
              {t('admin.product.ads.last_updated')}:{' '}
              {data.lastFetchedAt ? fmtDateTime(data.lastFetchedAt) : t('admin.product.ads.never')}
            </span>
            <span>· {t('admin.product.ads.auto_note')}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {loading && !data && (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-6 h-6 text-forest-600 animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-rose-700">{error}</div>
          </div>
        )}

        {data && data.configured === false && (
          <div className="text-center text-gray-500 py-12 text-sm">{t('admin.product.ads.not_configured')}</div>
        )}

        {data && data.configured && (data.campaigns?.length ?? 0) === 0 && !loading && (
          <div className="text-center text-gray-500 py-12 text-sm">{t('admin.product.ads.empty')}</div>
        )}

        {/* Итоговая полоса по всем кампаниям */}
        {totals && (data?.campaigns?.length ?? 0) > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              {t('admin.product.ads.totals')}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Metric label={t('admin.product.ads.spent')} value={fmtRub(totals.spent)} accent />
              <Metric label={t('admin.product.ads.shows')} value={fmtNum(totals.shows)} />
              <Metric label={t('admin.product.ads.clicks')} value={fmtNum(totals.clicks)} />
              <Metric label={t('admin.product.ads.registrations')} value={fmtNum(totals.registrations)} />
              <Metric label={t('admin.product.ads.payers')} value={fmtNum(totals.payers)} />
            </div>
          </div>
        )}

        {/* Кампании */}
        {data?.campaigns?.map((c) => (
          <div key={c.planId ?? c.campaign} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                  {c.channel}
                </span>
                <h3 className="font-semibold text-gray-900">{c.planName || c.campaign}</h3>
                <StatusBadge state={c.state} label={t(`admin.product.ads.state.${c.state}`)} />
              </div>
              <div className="flex items-center gap-3 flex-wrap mb-2 text-xs text-gray-500">
                {c.planName && c.campaign && c.campaign !== c.planName && (
                  <span className="font-mono">utm: {c.campaign}</span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {t('admin.product.ads.period')}: {fmtDate(c.dateFrom)} – {fmtDate(c.dateTo)}
                </span>
                {c.budgetDay != null && (
                  <span>{t('admin.product.ads.budget_day')}: {fmtRub(c.budgetDay)}</span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <Metric label={t('admin.product.ads.spent')} value={fmtRub(c.spent)} accent />
                <Metric label={t('admin.product.ads.shows')} value={fmtNum(c.shows)} />
                <Metric label={t('admin.product.ads.clicks')} value={fmtNum(c.clicks)} />
                <Metric label={t('admin.product.ads.ctr')} value={c.ctr != null ? `${c.ctr}%` : '—'} />
                <Metric label={t('admin.product.ads.cpc')} value={fmtRub(c.cpc)} />
                <Metric label={t('admin.product.ads.registrations')} value={fmtNum(c.registrations)} />
                <Metric label={t('admin.product.ads.cpr')} value={fmtRub(c.cpr)} />
              </div>
            </div>

            {/* Объявления внутри кампании */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    <th className="px-4 py-2 font-medium">{t('admin.product.ads.creative')}</th>
                    <th className="px-3 py-2 font-medium">{t('admin.product.ads.status')}</th>
                    <SortableTh sortKey="shows" state={sort} onSort={setSort} align="right" className="!px-3 !py-2">{t('admin.product.ads.shows')}</SortableTh>
                    <SortableTh sortKey="clicks" state={sort} onSort={setSort} align="right" className="!px-3 !py-2">{t('admin.product.ads.clicks')}</SortableTh>
                    <SortableTh sortKey="ctr" state={sort} onSort={setSort} align="right" className="!px-3 !py-2">{t('admin.product.ads.ctr')}</SortableTh>
                    <SortableTh sortKey="cpc" state={sort} onSort={setSort} align="right" className="!px-3 !py-2">{t('admin.product.ads.cpc')}</SortableTh>
                    <SortableTh sortKey="spent" state={sort} onSort={setSort} align="right" className="!px-3 !py-2">{t('admin.product.ads.spent')}</SortableTh>
                    <SortableTh sortKey="registrations" state={sort} onSort={setSort} align="right" className="!px-3 !py-2">{t('admin.product.ads.registrations')}</SortableTh>
                    <SortableTh sortKey="payers" state={sort} onSort={setSort} align="right" className="!px-3 !py-2">{t('admin.product.ads.payers')}</SortableTh>
                    <SortableTh sortKey="cpr" state={sort} onSort={setSort} align="right" className="!px-3 !py-2">{t('admin.product.ads.cpr')}</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  <CreativeRows
                    creatives={c.creatives}
                    sort={sort}
                    comparators={adComparators}
                    openBanner={openBanner}
                    setOpenBanner={setOpenBanner}
                    t={t}
                  />
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Заметка про атрибуцию */}
        {data && data.configured && (data.campaigns?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">{t('admin.product.ads.attribution_warn')}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdsView;
