import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader, RefreshCw, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

type Window = '5m' | '15m' | '1h' | '6h' | '24h';
const WINDOW_MS: Record<Window, number> = {
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '6h':  6  * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};
const WINDOW_LABEL: Record<Window, string> = {
  '5m': '5 мин', '15m': '15 мин', '1h': '1 час', '6h': '6 часов', '24h': '24 часа',
};

interface LogLine {
  ts: number;
  stream: Record<string, string>;
  line: string;
}

interface LogsResponse {
  query: string;
  from: string;
  to: string;
  lines: LogLine[];
  generatedAt: string;
}

interface Labels {
  hosts: string[];
  jobs: string[];
  levels: string[];
}

// Strip ANSI color codes that NestJS Logger writes to stdout
// (Promtail's replace stage doesn't catch them in some cases).
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const lineColor = (level: string | undefined, job: string | undefined): string => {
  if (level === 'ERROR' || job === 'nginx-error') return 'text-rose-600';
  if (level === 'WARN') return 'text-amber-700';
  if (level === 'DEBUG' || level === 'VERBOSE') return 'text-gray-400';
  return 'text-gray-700';
};

const fmtTs = (ms: number): string => {
  const d = new Date(ms);
  return d.toLocaleTimeString('ru-RU', { hour12: false }) + '.' +
    String(d.getMilliseconds()).padStart(3, '0');
};

const MonitoringLogsView: React.FC = () => {
  const [labels, setLabels] = useState<Labels | null>(null);
  const [host, setHost] = useState<string>('');
  const [job, setJob] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const [windowKey, setWindowKey] = useState<Window>('15m');
  const [extraFilter, setExtraFilter] = useState<string>('');
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build LogQL query from filters
  const builtQuery = useMemo(() => {
    const selectors: string[] = [];
    if (host) selectors.push(`host="${host}"`);
    if (job) selectors.push(`job="${job}"`);
    if (level) selectors.push(`level="${level}"`);
    if (selectors.length === 0) selectors.push('host=~".+"');
    let q = `{${selectors.join(',')}}`;
    if (extraFilter.trim()) q += ` |= \`${extraFilter.trim()}\``;
    return q;
  }, [host, job, level, extraFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const to = new Date().toISOString();
    const from = new Date(Date.now() - WINDOW_MS[windowKey]).toISOString();
    try {
      const res = await apiClient.get(
        `/webhook/admin/monitoring/logs?query=${encodeURIComponent(builtQuery)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=300`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить логи');
    } finally {
      setLoading(false);
    }
  }, [builtQuery, windowKey]);

  // Load labels once
  useEffect(() => {
    apiClient.get('/webhook/admin/monitoring/logs/labels').then(async (r) => {
      if (r.ok) setLabels(await r.json());
    });
  }, []);

  // Manual + auto-refresh
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) timerRef.current = setInterval(load, 10_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, load]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Узел</label>
          <select value={host} onChange={(e) => setHost(e.target.value)} className="border border-gray-200 rounded-md text-sm px-2 py-1.5 bg-white">
            <option value="">все</option>
            {labels?.hosts.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Сервис</label>
          <select value={job} onChange={(e) => setJob(e.target.value)} className="border border-gray-200 rounded-md text-sm px-2 py-1.5 bg-white">
            <option value="">все</option>
            {labels?.jobs.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Уровень</label>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="border border-gray-200 rounded-md text-sm px-2 py-1.5 bg-white">
            <option value="">все</option>
            {labels?.levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-col flex-1 min-w-[200px]">
          <label className="text-xs text-gray-500 mb-1">Содержит (опц.)</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={extraFilter}
              onChange={(e) => setExtraFilter(e.target.value)}
              placeholder='SMS Aero, payment, neo4j...'
              className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded-md text-sm bg-white"
            />
          </div>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">Окно</label>
          <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
            {(['5m','15m','1h','6h','24h'] as Window[]).map((w) => (
              <button key={w} onClick={() => setWindowKey(w)}
                className={clsx('px-2 py-1 text-xs rounded',
                  windowKey === w ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900')}>
                {WINDOW_LABEL[w]}
              </button>
            ))}
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-forest-600 hover:bg-gray-50 rounded-md transition-colors border border-gray-200">
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />Обновить
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Авто
        </label>
      </div>

      {/* Built LogQL */}
      <div className="text-xs text-gray-500 font-mono bg-gray-50 border border-gray-200 rounded-md px-3 py-2 break-all">
        {builtQuery}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-rose-700">{error}</div>
        </div>
      )}

      {/* Results */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-500 flex items-center justify-between">
          <span>{data ? `${data.lines.length} строк` : '—'}</span>
          {data && (
            <span>Обновлено: {new Date(data.generatedAt).toLocaleTimeString('ru-RU')}</span>
          )}
        </div>
        <div className="font-mono text-xs leading-relaxed max-h-[60vh] overflow-y-auto">
          {loading && !data && (
            <div className="flex items-center justify-center py-10">
              <Loader className="w-6 h-6 text-forest-600 animate-spin" />
            </div>
          )}
          {data && data.lines.length === 0 && !loading && (
            <div className="text-center py-6 text-gray-500 text-sm">Логов за выбранный период не найдено</div>
          )}
          {data?.lines.map((ln, i) => {
            const s = ln.stream;
            return (
              <div key={`${ln.ts}-${i}`} className="px-3 py-1 hover:bg-gray-50 border-b border-gray-50 flex gap-3">
                <span className="text-gray-400 flex-shrink-0">{fmtTs(ln.ts)}</span>
                <span className="text-forest-700 flex-shrink-0">{s.host}/{s.job}</span>
                <span className={clsx('flex-1 whitespace-pre-wrap break-all', lineColor(s.level, s.job))}>
                  {stripAnsi(ln.line)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MonitoringLogsView;
