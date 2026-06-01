import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader, RefreshCw, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

type Status = 'good' | 'warn' | 'bad' | 'unknown';
export type SummaryGroup = 'growth' | 'funnel' | 'risk' | 'infra';

interface Indicator {
  id: string;
  group: SummaryGroup;
  label: string;
  value: string;
  numeric: number | null;
  status: Status;
  target: string;
  hint?: string;
}

interface Summary {
  generatedAt: string;
  indicators: Indicator[];
}

const GROUP_LABEL: Record<SummaryGroup, string> = {
  growth: 'Рост и продукт',
  funnel: 'Воронка',
  risk:   'Риски',
  infra:  'Инфра',
};

const STATUS_STYLE: Record<Status, { card: string; pill: string; value: string }> = {
  good:    { card: 'border-emerald-200', pill: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-700' },
  warn:    { card: 'border-amber-200',   pill: 'bg-amber-100 text-amber-700',     value: 'text-amber-700'   },
  bad:     { card: 'border-rose-300 bg-rose-50', pill: 'bg-rose-100 text-rose-700', value: 'text-rose-700'   },
  unknown: { card: 'border-gray-200',    pill: 'bg-gray-100 text-gray-500',       value: 'text-gray-500'    },
};

const StatusIcon: React.FC<{ s: Status; className?: string }> = ({ s, className }) => {
  const props = { className: clsx('w-4 h-4', className) };
  if (s === 'good') return <CheckCircle2 {...props} />;
  if (s === 'warn') return <AlertTriangle {...props} />;
  if (s === 'bad')  return <XCircle {...props} />;
  return <HelpCircle {...props} />;
};

// Two visual modes: `compact` packs more indicators into a single screen
// (used by the tech-only summary in Мониторинг → Сводка), `normal` is the
// roomier card used by Управление продуктом → Сводка.
const IndicatorCard: React.FC<{ ind: Indicator; compact?: boolean }> = ({ ind, compact }) => {
  const st = STATUS_STYLE[ind.status];
  if (compact) {
    return (
      <div className={clsx('rounded border bg-white px-3 py-2 shadow-sm', st.card)}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-gray-700 font-medium leading-tight truncate" title={ind.label}>{ind.label}</div>
          <StatusIcon s={ind.status} className={clsx(st.value, 'flex-shrink-0 w-3.5 h-3.5')} />
        </div>
        <div className={clsx('text-lg font-semibold mt-0.5', st.value)}>{ind.value}</div>
        <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={`цель: ${ind.target}`}>{ind.target}</div>
      </div>
    );
  }
  return (
    <div className={clsx('rounded-lg border bg-white p-4 shadow-sm transition-all', st.card)}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm text-gray-700 font-medium leading-snug">{ind.label}</div>
        <StatusIcon s={ind.status} className={clsx(st.value, 'flex-shrink-0 w-5 h-5')} />
      </div>
      <div className={clsx('text-3xl font-semibold', st.value)}>{ind.value}</div>
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className={clsx('text-xs px-2 py-0.5 rounded font-medium', st.pill)}>цель: {ind.target}</span>
      </div>
      {ind.hint && <div className="text-xs text-gray-400 mt-2">{ind.hint}</div>}
    </div>
  );
};

interface SummaryViewProps {
  /** Which indicator groups to render. Default = all four. */
  groups?: SummaryGroup[];
  /** Compact layout — smaller cards, denser grid, fits-on-one-screen. */
  compact?: boolean;
  /** Render section headings between groups. Defaults true; pass false when
   *  the wrapper only renders one group and the heading would be redundant. */
  showGroupHeadings?: boolean;
}

const SummaryView: React.FC<SummaryViewProps> = ({
  groups: groupFilter,
  compact = false,
  showGroupHeadings = true,
}) => {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/webhook/admin/monitoring/overview');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить сводку');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const orderedGroups: SummaryGroup[] = groupFilter ?? ['growth', 'funnel', 'risk', 'infra'];
  const groups = orderedGroups
    .map((id) => ({ id, items: data?.indicators.filter((i) => i.group === id) || [] }));

  const visible = groups.flatMap((g) => g.items);
  const counts = data ? {
    good: visible.filter((i) => i.status === 'good').length,
    warn: visible.filter((i) => i.status === 'warn').length,
    bad:  visible.filter((i) => i.status === 'bad').length,
    unknown: visible.filter((i) => i.status === 'unknown').length,
  } : null;

  const gridClass = compact
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2'
    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3';

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      <div className="flex items-center justify-between">
        {counts && (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-4 h-4" />{counts.good}</span>
            <span className="flex items-center gap-1 text-amber-700"><AlertTriangle className="w-4 h-4" />{counts.warn}</span>
            <span className="flex items-center gap-1 text-rose-700"><XCircle className="w-4 h-4" />{counts.bad}</span>
            <span className="flex items-center gap-1 text-gray-500"><HelpCircle className="w-4 h-4" />{counts.unknown}</span>
            <span className="text-gray-400 ml-2">/ всего {visible.length}</span>
          </div>
        )}
        <button onClick={load}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-forest-600 hover:bg-gray-50 rounded-md transition-colors">
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

      {data && groups.map((g) => (
        g.items.length > 0 && (
          <section key={g.id}>
            {showGroupHeadings && (
              <h3 className={clsx('font-medium text-gray-700', compact ? 'text-xs mb-2' : 'text-sm mb-3')}>
                {GROUP_LABEL[g.id]}
              </h3>
            )}
            <div className={gridClass}>
              {g.items.map((ind) => <IndicatorCard key={ind.id} ind={ind} compact={compact} />)}
            </div>
          </section>
        )
      ))}

      {data && (
        <div className={clsx('text-gray-400 pt-2 border-t border-gray-100', compact ? 'text-[10px]' : 'text-xs')}>
          Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')} · автообновление 60 с
        </div>
      )}
    </div>
  );
};

// Public wrappers for the two callers.
const MonitoringSummaryView: React.FC = () => (
  <SummaryView groups={['risk', 'infra']} compact />
);

export const ProductSummaryView: React.FC = () => (
  <SummaryView groups={['growth', 'funnel']} />
);

export default MonitoringSummaryView;
