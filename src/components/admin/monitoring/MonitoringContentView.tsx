import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader, RefreshCw, Image, Video, Phone, Clock, Zap, Wallet } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../../services/apiClient';

type Window = '24h' | '7d' | '30d' | '90d' | 'all';
const WINDOW_LABEL: Record<Window, string> = {
  '24h': '24 ч', '7d': '7 дней', '30d': '30 дней', '90d': '90 дней', 'all': 'всё время',
};

interface ContentOverview {
  window: Window;
  generatedAt: string;
  excludedUsers: string[];
  images: { total: number; uniqueUsers: number; avgTokens: number | null };
  videos: {
    total: number; completed: number; failed: number; inFlight: number;
    successRatePct: number | null;
    avgWaitSeconds: number | null;
    avgTokens: number | null;
  };
  dozvon: {
    total: number; completed: number;
    completionRatePct: number | null;
    avgDurationSec: number | null;
  };
}

const fmtNum = (n: number) => n.toLocaleString('ru-RU');
const fmtPct = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%`;
const fmtTokens = (n: number | null) => n === null ? '—' : n.toLocaleString('ru-RU');
const fmtSec = (v: number | null) => {
  if (v === null) return '—';
  if (v < 60) return `${v.toFixed(0)} с`;
  return `${(v / 60).toFixed(1)} мин`;
};

const successColor = (pct: number | null) => {
  if (pct === null) return 'text-gray-400';
  if (pct >= 95) return 'text-emerald-600';
  if (pct >= 80) return 'text-amber-600';
  return 'text-rose-600';
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string }> =
({ icon, label, value, sub, valueClass }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">{icon}{label}</div>
    <div className={clsx('text-2xl font-semibold text-gray-900', valueClass)}>{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

const MonitoringContentView: React.FC = () => {
  const [windowKey, setWindowKey] = useState<Window>('30d');
  const [data, setData] = useState<ContentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/webhook/admin/monitoring/product/content?window=${windowKey}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Не удалось получить контент');
    } finally {
      setLoading(false);
    }
  }, [windowKey]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
          {(['24h', '7d', '30d', '90d', 'all'] as Window[]).map((w) => (
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
            <h3 className="text-sm font-medium text-gray-700 mb-3">Изображения ({WINDOW_LABEL[data.window]})</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat icon={<Image className="w-3.5 h-3.5" />} label="Сгенерировано" value={fmtNum(data.images.total)} />
              <Stat icon={<Image className="w-3.5 h-3.5" />} label="Уникальных юзеров" value={fmtNum(data.images.uniqueUsers)} />
              <Stat icon={<Wallet className="w-3.5 h-3.5" />} label="Средний расход токенов" value={fmtTokens(data.images.avgTokens)} />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Таблица generated_images фиксирует только успешные генерации — % ошибок появится с событиями imagegen.
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Видео</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<Video className="w-3.5 h-3.5" />} label="Job-ов всего" value={fmtNum(data.videos.total)}
                sub={`в работе ${data.videos.inFlight} · готово ${data.videos.completed} · упало ${data.videos.failed}`} />
              <Stat icon={<Zap className="w-3.5 h-3.5" />} label="Success rate"
                value={fmtPct(data.videos.successRatePct)} valueClass={successColor(data.videos.successRatePct)}
                sub="completed / (completed + failed)" />
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Средн. время генерации" value={fmtSec(data.videos.avgWaitSeconds)} />
              <Stat icon={<Wallet className="w-3.5 h-3.5" />} label="Средн. расход токенов" value={fmtTokens(data.videos.avgTokens)} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Дозвон</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Stat icon={<Phone className="w-3.5 h-3.5" />} label="Звонков всего" value={fmtNum(data.dozvon.total)}
                sub={`завершено ${data.dozvon.completed}`} />
              <Stat icon={<Zap className="w-3.5 h-3.5" />} label="Completion rate"
                value={fmtPct(data.dozvon.completionRatePct)} valueClass={successColor(data.dozvon.completionRatePct)} />
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Средн. длительность" value={fmtSec(data.dozvon.avgDurationSec)} />
            </div>
          </section>

          <div className="text-xs text-gray-400">
            Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU')}{' · '}
            Исключены тестовые пользователи (по images/videos): {data.excludedUsers.join(', ')}
          </div>
        </>
      )}
    </div>
  );
};

export default MonitoringContentView;
