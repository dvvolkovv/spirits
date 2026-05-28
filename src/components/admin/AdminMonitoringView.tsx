import React, { useEffect, useState, useCallback } from 'react';
import { Activity, Cpu, MemoryStick, HardDrive, Globe, Lock, AlertCircle, Loader, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';

interface NodeRow {
  instance: string;
  host: string;
  up: boolean;
  load1: number | null;
  cpuPct: number | null;
  memPct: number | null;
  diskPct: number | null;
  uptimeSec: number | null;
}

interface ProbeRow {
  target: string;
  success: boolean;
  httpStatus: number | null;
  latencySec: number | null;
  tlsSecLeft: number | null;
}

interface Overview {
  nodes: NodeRow[];
  probes: ProbeRow[];
  generatedAt: string;
}

const REFRESH_MS = 30_000;

const formatUptime = (sec: number | null): string => {
  if (sec === null || !isFinite(sec)) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return `${d}д ${h}ч`;
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
};

const formatTlsDays = (sec: number | null): string => {
  if (sec === null) return '—';
  const days = Math.floor(sec / 86400);
  return `${days} дн.`;
};

// Thresholds for color coding
const pctColor = (v: number | null, warn = 70, crit = 90): string => {
  if (v === null) return 'text-gray-400';
  if (v >= crit) return 'text-rose-600';
  if (v >= warn) return 'text-amber-600';
  return 'text-emerald-600';
};

const tlsDaysColor = (sec: number | null): string => {
  if (sec === null) return 'text-gray-400';
  const days = sec / 86400;
  if (days < 7) return 'text-rose-600';
  if (days < 30) return 'text-amber-600';
  return 'text-emerald-600';
};

const Metric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}> = ({ icon, label, value, valueClass }) => (
  <div className="flex items-center justify-between py-2">
    <span className="flex items-center gap-2 text-sm text-gray-600">
      {icon}
      {label}
    </span>
    <span className={clsx('text-sm font-semibold', valueClass)}>{value}</span>
  </div>
);

const NodeCard: React.FC<{ row: NodeRow }> = ({ row }) => (
  <div className={clsx(
    'rounded-lg border bg-white p-4 shadow-sm',
    row.up ? 'border-gray-200' : 'border-rose-300 bg-rose-50',
  )}>
    <div className="flex items-center justify-between mb-3">
      <div>
        <div className="font-semibold text-gray-900">{row.instance}</div>
        <div className="text-xs text-gray-500">{row.host}</div>
      </div>
      <span className={clsx(
        'text-xs font-medium px-2 py-1 rounded',
        row.up ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
      )}>
        {row.up ? 'UP' : 'DOWN'}
      </span>
    </div>
    <div className="divide-y divide-gray-100">
      <Metric
        icon={<Cpu className="w-4 h-4" />}
        label="CPU"
        value={row.cpuPct !== null ? `${row.cpuPct.toFixed(0)}%` : '—'}
        valueClass={pctColor(row.cpuPct, 70, 90)}
      />
      <Metric
        icon={<MemoryStick className="w-4 h-4" />}
        label="RAM"
        value={row.memPct !== null ? `${row.memPct.toFixed(0)}%` : '—'}
        valueClass={pctColor(row.memPct, 80, 90)}
      />
      <Metric
        icon={<HardDrive className="w-4 h-4" />}
        label="Диск /"
        value={row.diskPct !== null ? `${row.diskPct.toFixed(0)}%` : '—'}
        valueClass={pctColor(row.diskPct, 70, 85)}
      />
      <Metric
        icon={<Activity className="w-4 h-4" />}
        label="Load1"
        value={row.load1 !== null ? row.load1.toFixed(2) : '—'}
      />
      <Metric
        icon={<Activity className="w-4 h-4" />}
        label="Uptime"
        value={formatUptime(row.uptimeSec)}
      />
    </div>
  </div>
);

const ProbeCard: React.FC<{ row: ProbeRow }> = ({ row }) => (
  <div className={clsx(
    'rounded-lg border bg-white p-4 shadow-sm',
    row.success ? 'border-gray-200' : 'border-rose-300 bg-rose-50',
  )}>
    <div className="flex items-center justify-between mb-3">
      <div className="font-semibold text-gray-900 truncate" title={row.target}>
        {row.target.replace(/^https?:\/\//, '')}
      </div>
      <span className={clsx(
        'text-xs font-medium px-2 py-1 rounded',
        row.success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
      )}>
        {row.success ? 'OK' : 'FAIL'}
      </span>
    </div>
    <div className="divide-y divide-gray-100">
      <Metric
        icon={<Globe className="w-4 h-4" />}
        label="HTTP"
        value={row.httpStatus !== null ? String(row.httpStatus) : '—'}
        valueClass={row.httpStatus && row.httpStatus >= 200 && row.httpStatus < 400 ? 'text-emerald-600' : 'text-rose-600'}
      />
      <Metric
        icon={<Activity className="w-4 h-4" />}
        label="Latency"
        value={row.latencySec !== null ? `${(row.latencySec * 1000).toFixed(0)} ms` : '—'}
        valueClass={
          row.latencySec === null ? 'text-gray-400'
            : row.latencySec > 3 ? 'text-rose-600'
            : row.latencySec > 1.5 ? 'text-amber-600'
            : 'text-emerald-600'
        }
      />
      <Metric
        icon={<Lock className="w-4 h-4" />}
        label="TLS до истечения"
        value={formatTlsDays(row.tlsSecLeft)}
        valueClass={tlsDaysColor(row.tlsSecLeft)}
      />
    </div>
  </div>
);

const AdminMonitoringView: React.FC = () => {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/webhook/admin/monitoring/tech/overview');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      const json: Overview = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить метрики');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader className="w-6 h-6 text-forest-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Здоровье инфраструктуры</h2>
          <p className="text-xs text-gray-500">
            Обновлено: {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('ru-RU') : '—'}
            {' · автообновление каждые 30 с'}
          </p>
        </div>
        <button
          onClick={() => load(false)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-forest-600 hover:bg-gray-50 rounded-md transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-rose-700">{error}</div>
        </div>
      )}

      {/* Nodes */}
      <section>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Узлы</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.nodes.map((n) => <NodeCard key={n.instance} row={n} />)}
        </div>
        {data && data.nodes.length === 0 && (
          <div className="text-sm text-gray-500">Нет данных</div>
        )}
      </section>

      {/* Probes */}
      <section>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Доступность сервисов</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.probes.map((p) => <ProbeCard key={p.target} row={p} />)}
        </div>
        {data && data.probes.length === 0 && (
          <div className="text-sm text-gray-500">Нет данных</div>
        )}
      </section>
    </div>
  );
};

export default AdminMonitoringView;
