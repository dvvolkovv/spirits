import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader, RefreshCw, MessageSquare, Zap, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

type Window = '24h' | '7d' | '30d' | 'all';
const WINDOW_LABEL: Record<Window, string> = {
  '24h': '24 ч', '7d': '7 дней', '30d': '30 дней', 'all': 'всё время',
};

interface AssistantRow {
  assistantId: string;
  assistantName: string;
  displayName: string | null;
  category: string | null;
  messages: number;
  uniqueUsers: number;
  avgRespMs: number | null;
  p95RespMs: number | null;
  failures: number;
  failureRatePct: number;
  avgPerSession: number | null;
}

interface QualityOverview {
  window: Window;
  generatedAt: string;
  excludedUsers: string[];
  totalMessages: number;
  totalUsers: number;
  oneAndDoneSessionPct: number | null;
  globalP95RespMs: number | null;
  globalFailureRatePct: number;
  perAssistant: AssistantRow[];
}

const fmtMs = (ms: number | null): string => {
  if (ms === null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} с`;
  return `${Math.round(ms)} мс`;
};
const fmtPct = (n: number | null): string => n === null ? '—' : `${n.toFixed(1)}%`;
const fmtNum = (n: number): string => n.toLocaleString('ru-RU');

const latencyColor = (ms: number | null): string => {
  if (ms === null) return 'text-gray-400';
  if (ms > 8000) return 'text-rose-600';
  if (ms > 3000) return 'text-amber-600';
  return 'text-emerald-600';
};
const failureColor = (pct: number): string => {
  if (pct > 5) return 'text-rose-600';
  if (pct > 1) return 'text-amber-600';
  return 'text-emerald-600';
};
const oneAndDoneColor = (pct: number | null): string => {
  if (pct === null) return 'text-gray-400';
  if (pct > 50) return 'text-rose-600';
  if (pct > 30) return 'text-amber-600';
  return 'text-emerald-600';
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }> =
({ icon, label, value, sub, valueClass }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{icon}{label}</div>
    <div className={clsx('text-2xl font-semibold text-gray-900', valueClass)}>{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

const CATEGORY_LABEL: Record<string, string> = {
  business: 'Бизнес', personal: 'Личностный рост', assistant: 'Ассистент', smm: 'SMM',
};

const MonitoringQualityView: React.FC = () => {
  const [windowKey, setWindowKey] = useState<Window>('30d');
  const [data, setData] = useState<QualityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/webhook/admin/monitoring/product/quality?window=${windowKey}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить качество');
    } finally {
      setLoading(false);
    }
  }, [windowKey]);

  useEffect(() => { load(); }, [load]);

  const maxMsg = useMemo(() => {
    if (!data || data.perAssistant.length === 0) return 1;
    return Math.max(...data.perAssistant.map((a) => a.messages), 1);
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
          {(['24h', '7d', '30d', 'all'] as Window[]).map((w) => (
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
            <h3 className="text-sm font-medium text-gray-700 mb-3">Сводка ({WINDOW_LABEL[data.window]})</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<MessageSquare className="w-3.5 h-3.5" />} label="Сообщений" value={fmtNum(data.totalMessages)} />
              <Stat icon={<Users className="w-3.5 h-3.5" />} label="Активных юзеров" value={fmtNum(data.totalUsers)} />
              <Stat icon={<Zap className="w-3.5 h-3.5" />} label="p95 latency"
                value={fmtMs(data.globalP95RespMs)} valueClass={latencyColor(data.globalP95RespMs)}
                sub="ответ ассистента" />
              <Stat icon={<AlertCircle className="w-3.5 h-3.5" />} label="One-and-done"
                value={fmtPct(data.oneAndDoneSessionPct)} valueClass={oneAndDoneColor(data.oneAndDoneSessionPct)}
                sub="1 сообщение в сессии" />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Ассистенты</h3>
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Ассистент</th>
                    <th className="text-left px-3 py-2 font-medium">Категория</th>
                    <th className="text-right px-3 py-2 font-medium">Сообщений</th>
                    <th className="text-right px-3 py-2 font-medium">Юзеров</th>
                    <th className="text-right px-3 py-2 font-medium">Средн. ответ</th>
                    <th className="text-right px-3 py-2 font-medium">p95</th>
                    <th className="text-right px-3 py-2 font-medium">Ср. на сессию</th>
                    <th className="text-right px-3 py-2 font-medium">% ошибок</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.perAssistant.map((a) => {
                    const barPct = (a.messages / maxMsg) * 100;
                    return (
                      <tr key={a.assistantId} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{a.displayName || a.assistantName}</div>
                          <div className="text-xs text-gray-400">id={a.assistantId}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {a.category ? (CATEGORY_LABEL[a.category] || a.category) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="font-semibold text-gray-900">{fmtNum(a.messages)}</div>
                          <div className="h-1 bg-gray-100 rounded mt-1 overflow-hidden w-24 ml-auto">
                            <div className="h-full bg-forest-500 rounded" style={{ width: `${barPct}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{fmtNum(a.uniqueUsers)}</td>
                        <td className={clsx('px-3 py-2 text-right', latencyColor(a.avgRespMs))}>{fmtMs(a.avgRespMs)}</td>
                        <td className={clsx('px-3 py-2 text-right', latencyColor(a.p95RespMs))}>{fmtMs(a.p95RespMs)}</td>
                        <td className="px-3 py-2 text-right">{a.avgPerSession === null ? '—' : a.avgPerSession.toFixed(1)}</td>
                        <td className={clsx('px-3 py-2 text-right', failureColor(a.failureRatePct))}>
                          {fmtPct(a.failureRatePct)}
                          {a.failures > 0 && <span className="text-xs text-gray-400 ml-1">({a.failures})</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {data.perAssistant.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-gray-500 px-3 py-6 text-sm">Нет данных за выбранный период</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="text-xs text-gray-400">
            Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')}{' · '}
            Исключены тестовые пользователи: {data.excludedUsers.join(', ')}
          </div>
        </>
      )}
    </div>
  );
};

export default MonitoringQualityView;
