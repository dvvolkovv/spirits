// src/components/chat/smm/MyVideosList.tsx
// Список всех SMM-видео текущего юзера. Источник: GET /webhook/smm/videos
import { useEffect, useState } from 'react';
import { Film, Loader2, Sparkles, User, Clock, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../services/apiClient';
import { regenerateVideo } from './smm-api';

interface MyVideo {
  id: string;
  status: string;
  mp4Url: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  tokensCharged: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  assistantRole: string;
  mood: string;
  premiumGenre: 'surreal' | 'pov' | 'cinematic' | null;
}

const GENRE_ICON: Record<string, JSX.Element> = {
  surreal: <Sparkles className="w-3.5 h-3.5" />,
  pov: <User className="w-3.5 h-3.5" />,
  cinematic: <Film className="w-3.5 h-3.5" />,
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  queued: { label: 'В очереди', cls: 'bg-yellow-100 text-yellow-800' },
  rendering: { label: 'Рендерим', cls: 'bg-blue-100 text-blue-800' },
  ready: { label: 'Готово', cls: 'bg-green-100 text-green-800' },
  approved: { label: 'Одобрено', cls: 'bg-green-100 text-green-800' },
  failed: { label: 'Ошибка', cls: 'bg-red-100 text-red-800' },
  rejected: { label: 'Отклонено', cls: 'bg-gray-100 text-gray-600' },
  escape_hatch_offered: { label: 'Нужно решение', cls: 'bg-yellow-100 text-yellow-800' },
  cancelled: { label: 'Отменено', cls: 'bg-gray-100 text-gray-600' },
};

export function MyVideosList() {
  const [videos, setVideos] = useState<MyVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  async function handleRegenerate(id: string) {
    if (!confirm('Перерендерить с нуля? Спишутся токены ещё раз (предыдущий mp4 сохранится в render_state).')) return;
    setRegenerating(id);
    try {
      await regenerateVideo(id);
      toast.success('Перерендер запущен — обнови страницу через минуту');
      // Refresh list
      const r = await apiClient.get('/webhook/smm/videos');
      if (r.ok) setVideos(await r.json());
    } catch (e: any) {
      toast.error(`Не удалось: ${e?.message ?? 'ошибка'}`);
    } finally {
      setRegenerating(null);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiClient.get('/webhook/smm/videos')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (alive) { setVideos(data); setLoading(false); }
      })
      .catch((e: any) => { if (alive) { setErr(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Загружаем твои видео…
      </div>
    );
  }

  if (err) {
    return <div className="text-red-600 text-sm p-4">Ошибка загрузки: {err}</div>;
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Film className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>У тебя ещё нет SMM-видео.</p>
        <p className="text-xs mt-2">
          Зайди в чат к Юле и попроси сделать ролик — он появится здесь.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h2 className="text-lg font-semibold mb-4">Мои SMM-видео ({videos.length})</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {videos.map((v) => {
          const st = STATUS_LABEL[v.status] ?? { label: v.status, cls: 'bg-gray-100' };
          return (
            <div key={v.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              {/* Video preview / thumbnail */}
              {v.mp4Url ? (
                <video
                  src={v.mp4Url}
                  className="w-full aspect-[9/16] object-cover bg-gray-900"
                  controls
                  preload="metadata"
                />
              ) : (
                <div className="w-full aspect-[9/16] bg-gray-100 flex items-center justify-center text-gray-400">
                  <Film className="w-12 h-12" />
                </div>
              )}
              <div className="p-3 space-y-1.5">
                <h3 className="text-sm font-medium text-gray-900 line-clamp-2">{v.title}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className={`px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                  {v.premiumGenre && (
                    <span className="inline-flex items-center gap-0.5 text-purple-600 font-medium capitalize">
                      {GENRE_ICON[v.premiumGenre]}
                      {v.premiumGenre}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {v.durationSec && (
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />{v.durationSec}с
                    </span>
                  )}
                  <span>{new Date(v.createdAt).toLocaleDateString('ru-RU')}</span>
                </div>
                <div className="flex items-center gap-3 text-xs mt-1">
                  {v.mp4Url && (
                    <a
                      href={v.mp4Url}
                      download={`linkeon-smm-${v.id.slice(0, 8)}.mp4`}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      Скачать
                    </a>
                  )}
                  {['ready', 'approved', 'failed', 'rejected'].includes(v.status) && (
                    <button
                      onClick={() => handleRegenerate(v.id)}
                      disabled={regenerating === v.id}
                      className="inline-flex items-center gap-1 text-forest-700 hover:text-forest-800 disabled:opacity-50"
                    >
                      {regenerating === v.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <RotateCcw className="w-3 h-3" />}
                      Сделать заново
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
