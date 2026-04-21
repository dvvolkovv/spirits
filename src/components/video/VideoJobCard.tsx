// src/components/video/VideoJobCard.tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Download, Send, Film, Mic, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { VideoJob } from './useVideoJobs';

interface Props {
  job: VideoJob;
  onDelete?: (id: string) => void;
  onExtend?: (job: VideoJob) => void;
  onLipsync?: (job: VideoJob) => void;
  onSendToChat?: (job: VideoJob) => void;
  /** When true, the card is rendered inline in a chat — hides gallery-only actions. */
  compact?: boolean;
}

function formatElapsed(startIso: string) {
  const diffSec = Math.max(0, (Date.now() - new Date(startIso).getTime()) / 1000);
  const m = Math.floor(diffSec / 60);
  const s = Math.floor(diffSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function VideoJobCard({
  job, onDelete, onExtend, onLipsync, onSendToChat, compact,
}: Props) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(() => formatElapsed(job.created_at));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (job.status !== 'processing' && job.status !== 'pending') return;
    const id = setInterval(() => setElapsed(formatElapsed(job.created_at)), 1000);
    return () => clearInterval(id);
  }, [job.status, job.created_at]);

  const thumbStyle = job.thumbnail_url
    ? { backgroundImage: `url(${job.thumbnail_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-100 aspect-video group" style={thumbStyle}>
      {(job.status === 'pending' || job.status === 'processing') && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>{t('video.job.statusProcessing', { elapsed })}</span>
        </div>
      )}

      {job.status === 'failed' && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-red-900/70 text-white text-sm p-2 text-center"
          title={job.error_message ?? ''}
        >
          <AlertCircle className="w-5 h-5 mr-2" />
          {t('video.job.statusFailed')}
        </div>
      )}

      {job.status === 'ready' && (
        <>
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition"
            onClick={() => setOpen(true)}
            aria-label={t('video.job.actions.play') as string}
          >
            <Play className="w-12 h-12 text-white drop-shadow opacity-80" />
          </button>

          {!compact && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 p-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
              {job.video_url && (
                <a
                  href={job.video_url}
                  download
                  className="p-1.5 rounded hover:bg-white/20 text-white"
                  title={t('video.job.actions.download') as string}
                >
                  <Download className="w-4 h-4" />
                </a>
              )}
              {onExtend && (
                <button
                  type="button"
                  onClick={() => onExtend(job)}
                  className="p-1.5 rounded hover:bg-white/20 text-white"
                  title={t('video.job.actions.extend') as string}
                >
                  <Film className="w-4 h-4" />
                </button>
              )}
              {onLipsync && job.model === 'kling-v1-6' && (
                <button
                  type="button"
                  onClick={() => onLipsync(job)}
                  className="p-1.5 rounded hover:bg-white/20 text-white"
                  title={t('video.job.actions.lipsync') as string}
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
              {onSendToChat && (
                <button
                  type="button"
                  onClick={() => onSendToChat(job)}
                  className="p-1.5 rounded hover:bg-white/20 text-white"
                  title={t('video.job.actions.sendToChat') as string}
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(job.id)}
                  className="ml-auto p-1.5 rounded hover:bg-red-500/30 text-white"
                  title={t('video.job.actions.delete') as string}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </>
      )}

      {open && job.video_url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <video
            src={job.video_url}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
