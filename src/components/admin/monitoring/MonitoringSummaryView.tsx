import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Loader, RefreshCw, CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  Wallet, Archive, Server, Globe,
} from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

// =============================================================================
//  Product summary (Управление продуктом → Сводка)
// =============================================================================
//
//  Renders product indicators returned by /admin/monitoring/overview:
//    - growth  (retention / TTV / etc)
//    - funnel  (signup → activation → first paid → repeat paid)
//    - risk    (churn D30, paid churn 60d — these are PRODUCT metrics)
//
//  Layout: roomy cards, 4 columns on xl.

type Status = 'good' | 'warn' | 'bad' | 'unknown';
type ProductGroup = 'growth' | 'funnel' | 'risk';

interface ProductIndicator {
  id: string;
  group: ProductGroup;
  label: string;
  value: string;
  status: Status;
  target: string;
  hint?: string;
}

interface OverviewSummary {
  generatedAt: string;
  indicators: ProductIndicator[];
}

const PRODUCT_GROUP_LABEL: Record<ProductGroup, string> = {
  growth: 'Рост и продукт',
  funnel: 'Воронка',
  risk:   'Риски (отток)',
};

const STATUS_STYLE: Record<Status, { card: string; pill: string; value: string }> = {
  good:    { card: 'border-emerald-200', pill: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-700' },
  warn:    { card: 'border-amber-200',   pill: 'bg-amber-100 text-amber-700',     value: 'text-amber-700'   },
  bad:     { card: 'border-rose-300 bg-rose-50', pill: 'bg-rose-100 text-rose-700', value: 'text-rose-700'   },
  unknown: { card: 'border-gray-200',    pill: 'bg-gray-100 text-gray-500',       value: 'text-gray-500'    },
};

const StatusIcon: React.FC<{ s: Status; className?: string }> = ({ s, className }) => {
  const props = { className: clsx('w-5 h-5', className) };
  if (s === 'good') return <CheckCircle2 {...props} />;
  if (s === 'warn') return <AlertTriangle {...props} />;
  if (s === 'bad')  return <XCircle {...props} />;
  return <HelpCircle {...props} />;
};

const ProductIndicatorCard: React.FC<{ ind: ProductIndicator }> = ({ ind }) => {
  const st = STATUS_STYLE[ind.status];
  return (
    <div className={clsx('rounded-lg border bg-white p-4 shadow-sm transition-all', st.card)}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm text-gray-700 font-medium leading-snug">{ind.label}</div>
        <StatusIcon s={ind.status} className={clsx(st.value, 'flex-shrink-0')} />
      </div>
      <div className={clsx('text-3xl font-semibold', st.value)}>{ind.value}</div>
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className={clsx('text-xs px-2 py-0.5 rounded font-medium', st.pill)}>цель: {ind.target}</span>
      </div>
      {ind.hint && <div className="text-xs text-gray-400 mt-2">{ind.hint}</div>}
    </div>
  );
};

export const ProductSummaryView: React.FC = () => {
  const [data, setData] = useState<OverviewSummary | null>(null);
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

  const orderedGroups: ProductGroup[] = ['growth', 'funnel', 'risk'];
  const groups = orderedGroups
    .map((id) => ({ id, items: data?.indicators.filter((i) => i.group === id) || [] }));
  const visible = groups.flatMap((g) => g.items);
  const counts = data ? {
    good: visible.filter((i) => i.status === 'good').length,
    warn: visible.filter((i) => i.status === 'warn').length,
    bad:  visible.filter((i) => i.status === 'bad').length,
    unknown: visible.filter((i) => i.status === 'unknown').length,
  } : null;

  return (
    <div className="space-y-6">
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
            <h3 className="text-sm font-medium text-gray-700 mb-3">{PRODUCT_GROUP_LABEL[g.id]}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {g.items.map((ind) => <ProductIndicatorCard key={ind.id} ind={ind} />)}
            </div>
          </section>
        )
      ))}
      {data && (
        <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')} · автообновление 60 с
        </div>
      )}
    </div>
  );
};

// =============================================================================
//  Tech summary (Мониторинг → Сводка)
// =============================================================================
//
//  One-screen dashboard for operational health. Aggregates four sub-endpoints
//  the Инфра tab already exposes so we don't add a new backend route:
//    - balances of paid external services (SMS, OpenRouter, ElevenLabs, Claude)
//    - latest backup status (fresh+complete+intact)
//    - nodes (prod / node-3 / test) up + load
//    - service availability probes (my.linkeon.io / test.linkeon.io)

interface SmsTech { balance: { rub: number | null }; alertThresholdRub: number }
interface OpenRouterTech { balance: { usd: number | null }; alertThresholdUsd: number; configured: boolean }
interface ElevenLabsTech { balance: { charactersLeft: number | null }; alertThresholdChars: number; configured: boolean }
interface ClaudeTech {
  usage: { cost30dUsd: number | null; subscriptionType: string | null; apiKeyValid: boolean | null };
  alertThreshold30dUsd: number;
}
interface BackupsTech {
  latest: { ageHours: number; fresh: boolean; complete: boolean; healthy: boolean } | null;
  freshHours: number;
}
interface NodesTech {
  nodes: Array<{ instance: string; up: boolean; cpuPct: number | null; memPct: number | null; diskPct: number | null }>;
  probes: Array<{ target: string; success: boolean; httpStatus: number | null; latencySec: number | null }>;
}

const MonitoringSummaryView: React.FC = () => {
  const [sms, setSms] = useState<SmsTech | null>(null);
  const [or, setOr] = useState<OpenRouterTech | null>(null);
  const [el, setEl] = useState<ElevenLabsTech | null>(null);
  const [cl, setCl] = useState<ClaudeTech | null>(null);
  const [bk, setBk] = useState<BackupsTech | null>(null);
  const [overview, setOverview] = useState<NodesTech | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rSms, rOr, rEl, rCl, rBk, rOv] = await Promise.all([
        apiClient.get('/webhook/admin/monitoring/tech/sms'),
        apiClient.get('/webhook/admin/monitoring/tech/openrouter'),
        apiClient.get('/webhook/admin/monitoring/tech/elevenlabs'),
        apiClient.get('/webhook/admin/monitoring/tech/claude'),
        apiClient.get('/webhook/admin/monitoring/tech/backups'),
        apiClient.get('/webhook/admin/monitoring/tech/overview'),
      ]);
      if (rSms.ok) setSms(await rSms.json());
      if (rOr.ok)  setOr(await rOr.json());
      if (rEl.ok)  setEl(await rEl.json());
      if (rCl.ok)  setCl(await rCl.json());
      if (rBk.ok)  setBk(await rBk.json());
      if (rOv.ok)  setOverview(await rOv.json());
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
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

      {/* Balances */}
      <section>
        <h3 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5" /> Балансы внешних сервисов
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <BalanceTile
            label="SMS Aero"
            value={sms?.balance.rub === null || sms?.balance.rub === undefined ? '—' : `${sms.balance.rub.toFixed(0)} ₽`}
            tone={balanceTone(sms?.balance.rub ?? null, sms?.alertThresholdRub ?? 500)}
          />
          <BalanceTile
            label="OpenRouter"
            value={or?.balance.usd === null || or?.balance.usd === undefined
              ? (or?.configured === false ? 'нет ключа' : '—')
              : `$${or.balance.usd.toFixed(2)}`}
            tone={or?.configured === false ? 'gray' : balanceTone(or?.balance.usd ?? null, or?.alertThresholdUsd ?? 5)}
          />
          <BalanceTile
            label="ElevenLabs"
            value={el?.balance.charactersLeft === null || el?.balance.charactersLeft === undefined
              ? (el?.configured === false ? 'нет ключа' : '—')
              : el.balance.charactersLeft.toLocaleString('ru-RU')}
            tone={el?.configured === false ? 'gray' : balanceTone(el?.balance.charactersLeft ?? null, el?.alertThresholdChars ?? 50000)}
          />
          <BalanceTile
            label="Claude 30д"
            value={cl?.usage.cost30dUsd === null || cl?.usage.cost30dUsd === undefined ? '—' : `$${cl.usage.cost30dUsd.toFixed(2)}`}
            tone={claudeSpendTone(cl?.usage.cost30dUsd ?? null, cl?.alertThreshold30dUsd ?? 100)}
          />
        </div>
      </section>

      {/* Backup + nodes + probes — three blocks side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
            <Archive className="w-3.5 h-3.5" /> Бэкап
          </div>
          {bk?.latest ? (
            <>
              <div className={clsx(
                'text-xl font-semibold',
                bk.latest.healthy ? 'text-emerald-600'
                  : bk.latest.fresh ? 'text-amber-600'
                  : 'text-rose-600',
              )}>
                {bk.latest.healthy ? '✓ OK' : bk.latest.fresh ? '⚠ проблема' : '✗ протух'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {bk.latest.ageHours < 1
                  ? `${Math.round(bk.latest.ageHours * 60)} мин назад`
                  : `${bk.latest.ageHours.toFixed(1)} ч назад`}
                {' · '}порог {bk.freshHours}ч
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">нет данных</div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
            <Server className="w-3.5 h-3.5" /> Узлы
          </div>
          {overview?.nodes && overview.nodes.length > 0 ? (
            <div className="space-y-1.5">
              {overview.nodes.map((n) => (
                <div key={n.instance} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className={clsx(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      n.up ? 'bg-emerald-500' : 'bg-rose-500',
                    )} />
                    <span className="font-medium text-gray-700">{n.instance}</span>
                  </div>
                  <span className="text-gray-500">
                    CPU {(n.cpuPct ?? 0).toFixed(0)}% · disk {(n.diskPct ?? 0).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400">нет данных</div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
            <Globe className="w-3.5 h-3.5" /> Сервисы
          </div>
          {overview?.probes && overview.probes.length > 0 ? (
            <div className="space-y-1.5">
              {overview.probes.map((p) => {
                const host = p.target.replace(/^https?:\/\//, '').replace(/\/$/, '');
                return (
                  <div key={p.target} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={clsx(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        p.success ? 'bg-emerald-500' : 'bg-rose-500',
                      )} />
                      <span className="font-medium text-gray-700 truncate" title={p.target}>{host}</span>
                    </div>
                    <span className="text-gray-500">
                      {p.httpStatus ?? '—'} · {((p.latencySec ?? 0) * 1000).toFixed(0)} мс
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-400">нет данных</div>
          )}
        </section>
      </div>

      <div className="text-xs text-gray-400 pt-1">
        автообновление 60 с
      </div>
    </div>
  );
};

// ---- helpers ----

type Tone = 'good' | 'warn' | 'bad' | 'gray';

const TONE_CLASS: Record<Tone, { card: string; value: string }> = {
  good: { card: 'border-emerald-200',           value: 'text-emerald-700' },
  warn: { card: 'border-amber-200',             value: 'text-amber-700' },
  bad:  { card: 'border-rose-300 bg-rose-50',   value: 'text-rose-700' },
  gray: { card: 'border-gray-200 bg-gray-50',   value: 'text-gray-500' },
};

const BalanceTile: React.FC<{ label: string; value: string; tone: Tone }> = ({ label, value, tone }) => {
  const t = TONE_CLASS[tone];
  return (
    <div className={clsx('rounded border bg-white px-3 py-2 shadow-sm', t.card)}>
      <div className="text-xs text-gray-500 truncate" title={label}>{label}</div>
      <div className={clsx('text-xl font-semibold mt-0.5 truncate', t.value)} title={value}>{value}</div>
    </div>
  );
};

const balanceTone = (val: number | null, threshold: number): Tone => {
  if (val === null) return 'gray';
  if (val <= threshold) return 'bad';
  if (val <= threshold * 2) return 'warn';
  return 'good';
};

const claudeSpendTone = (val: number | null, threshold: number): Tone => {
  if (val === null) return 'gray';
  if (val >= threshold) return 'bad';
  if (val >= threshold * 0.7) return 'warn';
  return 'good';
};

export default MonitoringSummaryView;
