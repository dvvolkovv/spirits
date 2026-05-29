import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader, RefreshCw, AlertCircle, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

interface FunnelStep {
  key: string;
  label: string;
  count: number;
  ratioToFirst: number | null;
  ratioToPrev: number | null;
  identity: 'session' | 'user';
}

interface FunnelResponse {
  from: string;
  to: string;
  source: string | null;
  excludedUsers: string[];
  steps: FunnelStep[];
  generatedAt: string;
}

type Window = '24h' | '7d' | '30d' | '90d';

const WINDOW_MS: Record<Window, number> = {
  '24h': 24 * 3600 * 1000,
  '7d':  7 * 24 * 3600 * 1000,
  '30d': 30 * 24 * 3600 * 1000,
  '90d': 90 * 24 * 3600 * 1000,
};

const WINDOW_LABEL: Record<Window, string> = {
  '24h': '24 ч',
  '7d':  '7 дней',
  '30d': '30 дней',
  '90d': '90 дней',
};

// Key conversions surfaced as big numbers above the funnel.
// Both endpoints are user-keyed so the ratio is honest. Visitor→user
// is intentionally omitted: it would mix session_id with user_id.
const KEY_PAIRS: Array<{ from: string; to: string; label: string }> = [
  { from: 'otp_request',          to: 'otp_verified',           label: 'SMS отправлен → введён' },
  { from: 'signup_completed',     to: 'first_response_received',label: 'Регистрация → первый ответ' },
  { from: 'first_payment_success',to: 'second_payment_success', label: 'Первая → вторая оплата' },
];

const dropColor = (ratioPct: number | null): string => {
  if (ratioPct === null) return 'text-gray-400';
  if (ratioPct < 30) return 'text-rose-600';
  if (ratioPct < 60) return 'text-amber-600';
  return 'text-emerald-600';
};

const MonitoringFunnelView: React.FC = () => {
  const [windowKey, setWindowKey] = useState<Window>('30d');
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const to = new Date();
    const from = new Date(to.getTime() - WINDOW_MS[windowKey]);
    try {
      const res = await apiClient.get(
        `/webhook/admin/monitoring/funnel?from=${from.toISOString()}&to=${to.toISOString()}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить воронку');
    } finally {
      setLoading(false);
    }
  }, [windowKey]);

  useEffect(() => { load(); }, [load]);

  const keyConversions = useMemo(() => {
    if (!data) return [];
    const byKey = new Map(data.steps.map((s) => [s.key, s]));
    return KEY_PAIRS.map(({ from, to, label }) => {
      const f = byKey.get(from);
      const t = byKey.get(to);
      const ratio = f && t && f.count > 0 ? (t.count / f.count) * 100 : null;
      return { label, fromCount: f?.count ?? 0, toCount: t?.count ?? 0, ratio };
    });
  }, [data]);

  const maxCount = useMemo(() => {
    if (!data || data.steps.length === 0) return 1;
    return Math.max(...data.steps.map((s) => s.count), 1);
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
          {(['24h', '7d', '30d', '90d'] as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindowKey(w)}
              className={clsx(
                'px-3 py-1.5 text-sm rounded transition-colors',
                windowKey === w ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900',
              )}
            >
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
          {/* Key conversions */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Ключевые конверсии</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {keyConversions.map((kc) => (
                <div key={kc.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-gray-500 mb-2">{kc.label}</div>
                  <div className="flex items-baseline gap-2">
                    <span className={clsx('text-3xl font-semibold', dropColor(kc.ratio))}>
                      {kc.ratio === null ? '—' : `${kc.ratio.toFixed(1)}%`}
                    </span>
                    <span className="text-sm text-gray-500">
                      {kc.toCount} из {kc.fromCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Funnel bars */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Воронка ({WINDOW_LABEL[windowKey]})</h3>
              <span className="text-xs text-gray-500">
                Окно: {new Date(data.from).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {' → '}
                {new Date(data.to).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="space-y-2">
                {data.steps.map((step, i) => {
                  const barPct = (step.count / maxCount) * 100;
                  const prevIdentity = i > 0 ? data.steps[i - 1].identity : null;
                  const identityChanged = prevIdentity !== null && prevIdentity !== step.identity;
                  return (
                    <div key={step.key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700 flex items-center gap-2">
                          <span className="text-gray-400 font-mono">{String(i + 1).padStart(2, '0')}</span>
                          {step.label}
                          {step.identity === 'session' && (
                            <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-gray-200 rounded px-1 py-0.5">
                              сессии
                            </span>
                          )}
                          {identityChanged && (
                            <span className="text-[10px] text-amber-700 border border-amber-200 bg-amber-50 rounded px-1 py-0.5">
                              ↓ переход на user_id
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-3">
                          {step.ratioToPrev !== null && (
                            <span className={clsx('inline-flex items-center gap-1 text-xs', dropColor(step.ratioToPrev))}>
                              {step.ratioToPrev < 100 && <TrendingDown className="w-3 h-3" />}
                              {step.ratioToPrev.toFixed(1)}%
                            </span>
                          )}
                          <span className="text-xs text-gray-500 w-12 text-right">
                            {step.ratioToFirst === null ? '—' : `${step.ratioToFirst.toFixed(0)}%`}
                          </span>
                          <span className="font-semibold text-gray-900 w-12 text-right">{step.count}</span>
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-forest-500 rounded-full transition-all"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {data.steps.every((s) => s.count === 0) && (
                <div className="text-sm text-gray-500 text-center py-4">
                  Данных за выбранный период нет
                </div>
              )}
              {data.excludedUsers.length > 0 && (
                <div className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
                  Исключены тестовые пользователи: {data.excludedUsers.join(', ')}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default MonitoringFunnelView;
