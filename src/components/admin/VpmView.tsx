import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles, Loader, ListPlus, X as XIcon, CheckCircle2, AlertCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';

type Priority = 'critical' | 'high' | 'medium' | 'low';
type Status   = 'pending' | 'in_backlog' | 'dismissed' | 'done';

interface Recommendation {
  id: string;
  run_id: string;
  priority: Priority;
  title: string;
  rationale_md: string;
  proposed_action_md: string;
  related_metrics: string[];
  status: Status;
  backlog_item_id: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  created_at: string;
}

interface Run {
  id: string;
  triggered_by: string | null;
  trigger: 'manual' | 'cron';
  cost_usd: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  rec_count: number;
}

const PRIORITY_STYLE: Record<Priority, { card: string; pill: string; rank: number }> = {
  critical: { card: 'border-rose-300 bg-rose-50',  pill: 'bg-rose-100 text-rose-800',     rank: 0 },
  high:     { card: 'border-amber-300 bg-amber-50',pill: 'bg-amber-100 text-amber-800',   rank: 1 },
  medium:   { card: 'border-gray-200',             pill: 'bg-blue-100 text-blue-700',     rank: 2 },
  low:      { card: 'border-gray-200',             pill: 'bg-gray-100 text-gray-600',     rank: 3 },
};

const STATUS_FILTERS: Status[] = ['pending', 'in_backlog', 'done', 'dismissed'];

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const VpmView: React.FC = () => {
  const { t } = useTranslation();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | 'all'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recsR, runsR] = await Promise.all([
        apiClient.post('/webhook/admin/vpm', { action: 'list', limit: 100 }),
        apiClient.post('/webhook/admin/vpm', { action: 'list_runs', limit: 10 }),
      ]);
      if (!recsR.ok) throw new Error(`recs ${recsR.status}`);
      setRecs(await recsR.json());
      if (runsR.ok) setRuns(await runsR.json());
    } catch (e: any) {
      setError(e?.message || t('admin.product.vpm.error_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await apiClient.post('/webhook/admin/vpm', { action: 'generate' });
      if (!r.ok) throw new Error(await r.text() || `${r.status}`);
      await load();
    } catch (e: any) {
      setError(e?.message || t('admin.product.vpm.error_generate'));
    } finally {
      setGenerating(false);
    }
  };

  const updateOne = (rec: Recommendation) => {
    setRecs((prev) => prev.map((p) => (p.id === rec.id ? rec : p)));
  };

  const dismiss = async (id: string) => {
    const r = await apiClient.post('/webhook/admin/vpm', { action: 'dismiss', id });
    if (r.ok) updateOne(await r.json());
  };
  const markDone = async (id: string) => {
    const r = await apiClient.post('/webhook/admin/vpm', { action: 'mark_done', id });
    if (r.ok) updateOne(await r.json());
  };
  const toBacklog = async (id: string) => {
    if (!confirm(t('admin.product.vpm.confirm_to_backlog'))) return;
    const r = await apiClient.post('/webhook/admin/vpm', { action: 'to_backlog', id });
    if (!r.ok) { alert(await r.text()); return; }
    const data = await r.json();
    updateOne(data.recommendation);
    if (confirm(t('admin.product.vpm.open_product', { title: data.backlogItem.title }))) {
      window.location.href = `/admin?tab=product`;
    }
  };

  const filtered = useMemo(
    () => filter === 'all' ? recs : recs.filter((r) => r.status === filter),
    [recs, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: recs.length };
    for (const s of STATUS_FILTERS) c[s] = recs.filter((r) => r.status === s).length;
    return c;
  }, [recs]);

  const lastRun = runs[0];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="border-b border-gray-200 bg-white flex-shrink-0">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {(['all', ...STATUS_FILTERS] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s as any)}
                className={clsx(
                  'flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-full border transition-colors',
                  filter === s ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-gray-600 border-gray-200 hover:border-forest-300',
                )}
              >
                {t(`admin.product.vpm.filters.${s}`)} <span className="opacity-60">({counts[s] ?? 0})</span>
              </button>
            ))}
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white text-sm font-medium rounded-md hover:bg-forest-700 disabled:opacity-60 transition-colors"
          >
            {generating ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? t('admin.product.vpm.generating') : t('admin.product.vpm.generate')}
          </button>
        </div>
        {lastRun && (
          <div className="px-4 sm:px-6 pb-2 text-xs text-gray-500 flex items-center gap-3 flex-wrap">
            <span>{t('admin.product.vpm.last_run')}: {fmtDate(lastRun.created_at)}</span>
            {lastRun.cost_usd != null && <span>· {t('admin.product.vpm.cost')}: ${(+lastRun.cost_usd).toFixed(4)}</span>}
            {lastRun.duration_ms != null && <span>· {(lastRun.duration_ms / 1000).toFixed(1)}с</span>}
            <span>· {t('admin.product.vpm.recs_count', { count: lastRun.rec_count })}</span>
            {lastRun.error_message && (
              <span className="text-rose-700">· {t('admin.product.vpm.error_in_run')}: {lastRun.error_message.slice(0, 80)}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {loading && recs.length === 0 && (
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
        {!loading && filtered.length === 0 && (
          <div className="text-center text-gray-500 py-12 text-sm">
            {filter === 'pending' && recs.length === 0
              ? t('admin.product.vpm.empty_first_run')
              : t('admin.product.vpm.empty')}
          </div>
        )}

        {filtered.map((rec) => {
          const st = PRIORITY_STYLE[rec.priority];
          const expanded = expandedId === rec.id;
          return (
            <div key={rec.id} className={clsx('bg-white border rounded-lg overflow-hidden', st.card)}>
              <button
                onClick={() => setExpandedId(expanded ? null : rec.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
              >
                {expanded
                  ? <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  : <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={clsx('text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded', st.pill)}>
                      {t(`admin.product.vpm.priority.${rec.priority}`)}
                    </span>
                    <h3 className="font-medium text-gray-900">{rec.title}</h3>
                    {rec.status !== 'pending' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                        {t(`admin.product.vpm.status.${rec.status}`)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {rec.related_metrics.length > 0 && <span className="mr-2">{rec.related_metrics.slice(0, 3).join(' · ')}</span>}
                    <span>· {fmtDate(rec.created_at)}</span>
                  </div>
                </div>
              </button>
              {expanded && (
                <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                  <section>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      {t('admin.product.vpm.section_rationale')}
                    </div>
                    <div className="prose prose-sm max-w-none prose-p:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{rec.rationale_md || '_не указано_'}</ReactMarkdown>
                    </div>
                  </section>
                  <section>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      {t('admin.product.vpm.section_action')}
                    </div>
                    <div className="prose prose-sm max-w-none prose-p:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{rec.proposed_action_md || '_не указано_'}</ReactMarkdown>
                    </div>
                  </section>
                  {rec.related_metrics.length > 0 && (
                    <section>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                        {t('admin.product.vpm.section_metrics')}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {rec.related_metrics.map((m, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700">{m}</span>
                        ))}
                      </div>
                    </section>
                  )}

                  {rec.status === 'pending' && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                      <button
                        onClick={() => toBacklog(rec.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium rounded-md"
                      >
                        <ListPlus className="w-3.5 h-3.5" /> {t('admin.product.vpm.to_backlog')}
                      </button>
                      <button
                        onClick={() => markDone(rec.id)}
                        className="flex items-center gap-1 px-3 py-1.5 border border-emerald-300 text-emerald-700 text-sm rounded-md hover:bg-emerald-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> {t('admin.product.vpm.mark_done')}
                      </button>
                      <button
                        onClick={() => dismiss(rec.id)}
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-md hover:bg-gray-100 ml-auto"
                      >
                        <XIcon className="w-3.5 h-3.5" /> {t('admin.product.vpm.dismiss')}
                      </button>
                    </div>
                  )}

                  {rec.status === 'in_backlog' && rec.backlog_item_id && (
                    <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                      {t('admin.product.vpm.in_backlog_note')}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VpmView;
