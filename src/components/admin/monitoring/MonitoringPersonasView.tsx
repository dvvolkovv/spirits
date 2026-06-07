import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader, RefreshCw, Users, Briefcase, Heart, Image, Megaphone, HelpCircle, Layers } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

type PersonaKey = 'business' | 'personal_growth' | 'content_creator' | 'smm' | 'curious' | 'mixed';

interface PersonaBucket {
  key: PersonaKey;
  label: string;
  description: string;
  users: number;
  sharePct: number;
  avgPaymentRub: number | null;
  avgMessages: number | null;
  activeInLast14d: number;
  retention14dPct: number | null;
  topAssistants: Array<{ name: string; displayName: string | null; share: number }>;
}

interface PersonaRunMeta {
  createdAt: string;
  triggeredBy: string | null;
  trigger: 'manual' | 'cron' | 'auto';
  durationMs: number | null;
  totalUsers: number;
  tokensSpent: number;
  error: string | null;
}

interface PersonasOverview {
  generatedAt: string;
  excludedUsers: string[];
  totalUsers: number;
  buckets: PersonaBucket[];
  lastRun?: PersonaRunMeta;
}

const PERSONA_ICON: Record<PersonaKey, React.ReactNode> = {
  business:        <Briefcase className="w-5 h-5" />,
  personal_growth: <Heart className="w-5 h-5" />,
  content_creator: <Image className="w-5 h-5" />,
  smm:             <Megaphone className="w-5 h-5" />,
  curious:         <HelpCircle className="w-5 h-5" />,
  mixed:           <Layers className="w-5 h-5" />,
};

const PERSONA_COLOR: Record<PersonaKey, { ring: string; icon: string; bar: string }> = {
  business:        { ring: 'border-sky-200',     icon: 'text-sky-600 bg-sky-50',         bar: 'bg-sky-500' },
  personal_growth: { ring: 'border-rose-200',    icon: 'text-rose-600 bg-rose-50',       bar: 'bg-rose-500' },
  content_creator: { ring: 'border-amber-200',   icon: 'text-amber-700 bg-amber-50',     bar: 'bg-amber-500' },
  smm:             { ring: 'border-violet-200',  icon: 'text-violet-600 bg-violet-50',   bar: 'bg-violet-500' },
  curious:         { ring: 'border-gray-200',    icon: 'text-gray-600 bg-gray-50',       bar: 'bg-gray-500' },
  mixed:           { ring: 'border-emerald-200', icon: 'text-emerald-600 bg-emerald-50', bar: 'bg-emerald-500' },
};

const fmtPct = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%`;
const fmtRub = (v: number | null) => v === null ? '—' : `${Math.round(v).toLocaleString('ru-RU')} ₽`;
const fmtNum = (v: number | null) => v === null ? '—' : (typeof v === 'number' ? v.toLocaleString('ru-RU') : v);

const retentionColor = (pct: number | null) => {
  if (pct === null) return 'text-gray-400';
  if (pct >= 60) return 'text-emerald-600';
  if (pct >= 30) return 'text-amber-600';
  return 'text-rose-600';
};

const PersonaCard: React.FC<{ bucket: PersonaBucket }> = ({ bucket }) => {
  const c = PERSONA_COLOR[bucket.key];
  return (
    <div className={clsx('rounded-lg border bg-white p-4 shadow-sm', c.ring)}>
      <div className="flex items-start gap-3 mb-3">
        <div className={clsx('w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0', c.icon)}>
          {PERSONA_ICON[bucket.key]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900">{bucket.label}</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-semibold text-gray-900">{bucket.users}</span>
            <span className="text-sm text-gray-500">юзеров · {bucket.sharePct.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Share bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div className={clsx('h-full rounded-full', c.bar)} style={{ width: `${bucket.sharePct}%` }} />
      </div>

      <p className="text-xs text-gray-500 leading-snug mb-3">{bucket.description}</p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded px-2 py-1.5">
          <div className="text-gray-500">Ср. выручка</div>
          <div className="font-semibold text-gray-900">{fmtRub(bucket.avgPaymentRub)}</div>
        </div>
        <div className="bg-gray-50 rounded px-2 py-1.5">
          <div className="text-gray-500">Активны (14 дн)</div>
          <div className={clsx('font-semibold', retentionColor(bucket.retention14dPct))}>
            {bucket.activeInLast14d} ({fmtPct(bucket.retention14dPct)})
          </div>
        </div>
        <div className="bg-gray-50 rounded px-2 py-1.5">
          <div className="text-gray-500">Ср. сообщений</div>
          <div className="font-semibold text-gray-900">{fmtNum(bucket.avgMessages)}</div>
        </div>
      </div>

      {bucket.topAssistants.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-1.5">Топ-ассистенты</div>
          <div className="space-y-1">
            {bucket.topAssistants.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-700">{a.displayName || a.name}</span>
                <span className="text-gray-500">{(a.share * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const fmtRunDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const MonitoringPersonasView: React.FC = () => {
  const [data, setData] = useState<PersonasOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Первичная загрузка — последний сохранённый снапшот (мгновенно).
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/webhook/admin/monitoring/product/personas');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить персон');
    } finally {
      setLoading(false);
    }
  }, []);

  // Кнопка «Обновить» — реальный пересчёт (POST), фиксируется в persona_runs.
  const recompute = useCallback(async () => {
    setRecomputing(true);
    setError(null);
    try {
      const res = await apiClient.post('/webhook/admin/monitoring/product/personas/recompute', {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      const fresh = await res.json();
      setData(fresh);
      if (fresh?.lastRun?.error) setError(fresh.lastRun.error);
    } catch (e: any) {
      setError(e?.message || 'Не удалось пересчитать персон');
    } finally {
      setRecomputing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {data && (
          <div className="text-sm text-gray-600">
            <Users className="w-4 h-4 inline mr-1 -mt-0.5" />
            Всего активных юзеров: <span className="font-semibold text-gray-900">{data.totalUsers}</span>
          </div>
        )}
        <button
          onClick={recompute}
          disabled={recomputing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-forest-600 hover:bg-gray-50 rounded-md transition-colors disabled:opacity-60"
        >
          <RefreshCw className={clsx('w-4 h-4', recomputing && 'animate-spin')} />
          {recomputing ? 'Пересчёт…' : 'Обновить'}
        </button>
      </div>

      {/* Last-run meta — как у «виртуального PM» */}
      {data?.lastRun && (
        <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
          <span>Последний пересчёт: <span className="text-gray-700">{fmtRunDate(data.lastRun.createdAt)}</span></span>
          {data.lastRun.durationMs != null && <span>· за {(data.lastRun.durationMs / 1000).toFixed(1)}с</span>}
          <span>· токены: {data.lastRun.tokensSpent} <span className="text-gray-400">(правило-ориентированный, без LLM)</span></span>
          <span>· триггер: {data.lastRun.trigger === 'manual' ? 'вручную' : data.lastRun.trigger === 'cron' ? 'по расписанию' : 'авто'}</span>
          {data.lastRun.error && <span className="text-rose-700">· ошибка: {data.lastRun.error.slice(0, 80)}</span>}
        </div>
      )}

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.buckets.map((b) => <PersonaCard key={b.key} bucket={b} />)}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <strong>Метод:</strong> правило-ориентированная разметка (не ML, без LLM —
            поэтому токены не тратятся). Признаки: топ-3 ассистента по категориям
            (business / personal / smm), суммарное число генераций (картинки + видео),
            общая активность. «Обновить» делает реальный пересчёт и сохраняет снапшот;
            до ~500 активных юзеров этого достаточно, дальше — ночной cron.
          </div>

          <div className="text-xs text-gray-400">
            Из расчёта исключены все админ-аккаунты (включая владельца) и тестовые
            номера: {data.excludedUsers.join(', ')}
          </div>
        </>
      )}
    </div>
  );
};

export default MonitoringPersonasView;
