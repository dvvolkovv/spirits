// src/components/chat/smm/SmmVideoPlayer.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Check, X, Loader2, AlertCircle, Film, Send, RotateCcw } from 'lucide-react';
import {
  getVideo,
  approveVideo,
  rejectVideo,
  regenerateVideo,
  VideoDetail,
} from './smm-api';
import PublishModal from './PublishModal';

interface Props {
  videoId: string;
}

const POLL_INTERVAL_MS = 5000;

export const SmmVideoPlayer: React.FC<Props> = ({ videoId }) => {
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionInflight, setActionInflight] = useState<'approve' | 'reject' | 'regenerate' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchOnce = async () => {
      try {
        const v = await getVideo(videoId);
        if (!alive) return;
        setVideo(v);
        setError(null);
        if (v.status === 'ready' || v.status === 'failed' || v.status === 'approved' || v.status === 'rejected') {
          return;
        }
        pollTimerRef.current = setTimeout(fetchOnce, POLL_INTERVAL_MS);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        pollTimerRef.current = setTimeout(fetchOnce, POLL_INTERVAL_MS);
      }
    };
    fetchOnce();
    return () => {
      alive = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [videoId, pollKey]);

  const handleApprove = async () => {
    if (!video) return;
    setActionInflight('approve');
    setActionMessage(null);
    try {
      await approveVideo(videoId);
      const updated = await getVideo(videoId);
      setVideo(updated);
      setActionMessage('Утверждён');
    } catch (e) {
      setActionMessage(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionInflight(null);
    }
  };

  const handleRegenerate = async () => {
    if (!video) return;
    if (!window.confirm('Сделать ролик заново? Будут списаны токены повторно — старый файл сохранится в истории.')) return;
    setActionInflight('regenerate');
    setActionMessage(null);
    try {
      await regenerateVideo(videoId);
      const updated = await getVideo(videoId);
      setVideo(updated);
      setActionMessage('Перерендериваем — около минуты.');
      // Restart polling: previous loop stopped on terminal status, force re-run.
      setPollKey((k) => k + 1);
    } catch (e) {
      setActionMessage(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionInflight(null);
    }
  };

  const handleReject = async () => {
    if (!video) return;
    if (!window.confirm('Точно отклонить ролик?')) return;
    setActionInflight('reject');
    setActionMessage(null);
    try {
      await rejectVideo(videoId);
      const updated = await getVideo(videoId);
      setVideo(updated);
      setActionMessage('Отклонён');
    } catch (e) {
      setActionMessage(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionInflight(null);
    }
  };

  if (!video && !error) {
    return (
      <div className="my-3 inline-flex items-center space-x-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Загружаю видео…</span>
      </div>
    );
  }

  if (error && !video) {
    return (
      <div className="my-3 inline-flex items-center space-x-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4" />
        <span>Не удалось загрузить ролик ({error}).</span>
      </div>
    );
  }

  if (!video) return null;

  const isRendering = video.status === 'queued' || video.status === 'rendering';
  const isReady = video.status === 'ready';
  const isFailed = video.status === 'failed';
  const isTerminal = video.status === 'approved' || video.status === 'rejected';

  return (
    <div className="my-3 max-w-md rounded-xl border border-forest-200 bg-white shadow-sm">
      <div className="border-b border-forest-100 px-4 py-2 flex items-center gap-2">
        <Film className="h-4 w-4 text-forest-600" />
        <span className="text-sm font-medium text-forest-900">Ролик</span>
        <StatusBadge status={video.status} />
      </div>

      {isRendering && (
        <div className="px-4 py-6 text-center text-sm text-gray-500">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-forest-500" />
          <p>Рендерим… (~1 минута)</p>
        </div>
      )}

      {isFailed && (
        <div className="px-4 py-4 text-sm text-red-700">
          <p className="flex items-center gap-1.5 font-medium"><AlertCircle className="h-4 w-4" />Не получилось отрендерить.</p>
          {video.errorMessage && <p className="mt-1 text-xs text-red-600">{video.errorMessage}</p>}
          <p className="mt-2 text-xs text-gray-500">Токены возвращены на баланс.</p>
        </div>
      )}

      {(isReady || isTerminal) && video.mp4Url && (
        <>
          <video
            src={video.mp4Url}
            controls
            playsInline
            className="w-full rounded-b-none"
            style={{ maxHeight: 600 }}
          />
          {video.durationSec && (
            <div className="px-4 py-1 text-xs text-gray-400">
              {video.durationSec}с · {video.sizeBytes ? `${(video.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
            </div>
          )}
        </>
      )}

      {isReady && (
        <div className="flex items-center gap-2 border-t border-forest-100 bg-forest-50 px-4 py-2 flex-wrap">
          <button
            onClick={handleApprove}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {actionInflight === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Утвердить
          </button>
          <button
            onClick={() => setPublishOpen(true)}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            Опубликовать
          </button>
          <button
            onClick={handleRegenerate}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-forest-300 bg-white px-3 py-1.5 text-sm font-medium text-forest-700 hover:bg-forest-50 disabled:opacity-50"
          >
            {actionInflight === 'regenerate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Сделать заново
          </button>
          <button
            onClick={handleReject}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {actionInflight === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Отклонить
          </button>
        </div>
      )}

      {/* "Approved" stays publishable — show publish + regenerate */}
      {video.status === 'approved' && (
        <div className="flex items-center gap-2 border-t border-forest-100 bg-forest-50 px-4 py-2 flex-wrap">
          <button
            onClick={() => setPublishOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Send className="h-3.5 w-3.5" />
            Опубликовать
          </button>
          <button
            onClick={handleRegenerate}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-forest-300 bg-white px-3 py-1.5 text-sm font-medium text-forest-700 hover:bg-forest-50 disabled:opacity-50"
          >
            {actionInflight === 'regenerate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Сделать заново
          </button>
        </div>
      )}

      {/* On render failure — only regen makes sense */}
      {isFailed && (
        <div className="flex items-center gap-2 border-t border-forest-100 bg-forest-50 px-4 py-2">
          <button
            onClick={handleRegenerate}
            disabled={actionInflight !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {actionInflight === 'regenerate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Сделать заново
          </button>
        </div>
      )}

      {actionMessage && (
        <div className="border-t border-forest-100 bg-forest-50 px-4 py-2 text-xs text-forest-700">
          {actionMessage}
        </div>
      )}

      {publishOpen && (
        <PublishModal
          videoId={videoId}
          onClose={() => setPublishOpen(false)}
          onPublished={() => {
            // Refresh video to show updated status
            getVideo(videoId).then(setVideo).catch(() => {});
          }}
        />
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ status: VideoDetail['status'] }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: 'В очереди', cls: 'bg-yellow-100 text-yellow-800' },
    rendering: { label: 'Рендерим', cls: 'bg-blue-100 text-blue-800' },
    ready: { label: 'Готов', cls: 'bg-forest-100 text-forest-800' },
    failed: { label: 'Ошибка', cls: 'bg-red-100 text-red-700' },
    approved: { label: 'Утверждён', cls: 'bg-green-100 text-green-800' },
    rejected: { label: 'Отклонён', cls: 'bg-gray-200 text-gray-700' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
};
