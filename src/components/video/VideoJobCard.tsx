import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Download, Film, Mic, Trash2, AlertCircle, Loader2, X, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { VideoJob } from './useVideoJobs';

interface Props {
  job: VideoJob;
  onDelete?: (id: string) => void;
  onExtend?: (job: VideoJob) => void;
  onLipsync?: (job: VideoJob) => void;
  onSendToChat?: (job: VideoJob) => void;
  compact?: boolean;
}

function formatElapsed(startIso: string) {
  const diffSec = Math.max(0, (Date.now() - new Date(startIso).getTime()) / 1000);
  const m = Math.floor(diffSec / 60);
  const s = Math.floor(diffSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function VideoJobCard({ job, onDelete, onExtend, onLipsync, onSendToChat, compact }: Props) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(() => formatElapsed(job.created_at));
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (job.status !== 'processing' && job.status !== 'pending') return;
    const id = setInterval(() => setElapsed(formatElapsed(job.created_at)), 1000);
    return () => clearInterval(id);
  }, [job.status, job.created_at]);

  const hasBg = !!job.thumbnail_url;
  const thumbStyle = hasBg
    ? { backgroundImage: `url(${job.thumbnail_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
  const showVideoPreview = !hasBg && job.status === 'ready' && !!job.video_url;

  const modeLabel: Record<string, string> = {
    text2video: t('video.job.modes.text2video'),
    image2video: t('video.job.modes.image2video'),
    extend: t('video.job.modes.extend'),
    lipsync: t('video.job.modes.lipsync'),
  };

  return (
    <>
      <div
        className={clsx(
          'relative rounded-xl overflow-hidden bg-gray-100 group',
          'aspect-video min-h-[180px]',
          job.status === 'ready' && 'cursor-pointer'
        )}
        style={thumbStyle}
        onClick={job.status === 'ready' ? () => setOpen(true) : undefined}
      >
        {/* Delete button — always visible top-right */}
        {onDelete && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onDelete(job.id); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium shadow-lg"
                >
                  <Check className="w-3 h-3" />
                  {t('video.job.confirmDelete')}
                </button>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setConfirmDelete(false); }}
                  className="p-1 rounded-lg bg-black/50 hover:bg-black/70 text-white shadow-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                className={clsx(
                  'p-1.5 rounded-lg text-white shadow-lg backdrop-blur-sm transition-opacity',
                  job.status === 'failed'
                    ? 'bg-red-500/80 hover:bg-red-600 opacity-100'
                    : 'bg-black/40 hover:bg-red-500/80 opacity-0 group-hover:opacity-100'
                )}
                title={t('video.job.titles.delete')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Video as thumbnail when no static thumbnail available */}
        {showVideoPreview && (
          <video
            src={job.video_url!}
            muted
            preload="metadata"
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Gradient overlay for info */}
        {job.status === 'ready' && (hasBg || showVideoPreview) && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        )}

        {/* Processing state */}
        {(job.status === 'pending' || job.status === 'processing') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/50 text-white gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-forest-400" />
            <span className="text-sm font-medium">{t('video.job.statusProcessing', { elapsed })}</span>
            <span className="text-xs text-white/60">{t('video.job.processingHint')}</span>
          </div>
        )}

        {/* Failed state */}
        {job.status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/70 text-white gap-2 p-3 text-center">
            <AlertCircle className="w-7 h-7" />
            <span className="text-sm font-medium">{t('video.job.statusFailed')}</span>
            {job.error_message && (
              <span className="text-xs text-red-200 line-clamp-2">{job.error_message}</span>
            )}
          </div>
        )}

        {/* Ready state */}
        {job.status === 'ready' && (
          <>
            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
                <Play className="w-6 h-6 text-white fill-white ml-0.5" />
              </div>
            </div>

            {/* Bottom info + actions */}
            {!compact && (
              <div className="absolute bottom-0 inset-x-0 p-2.5 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] text-white/70 bg-black/30 rounded px-1.5 py-0.5 backdrop-blur-sm">
                  {modeLabel[job.mode] ?? job.mode} · {job.duration}{t('video.duration.suffix')}
                </span>
                <div className="flex gap-1">
                  {job.video_url && (
                    <a
                      href={job.video_url}
                      download
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm"
                      title={t('video.job.titles.download')}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {onExtend && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onExtend(job); }}
                      className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm"
                      title={t('video.job.titles.extend')}
                    >
                      <Film className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onLipsync && job.model === 'kling-v1-6' && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onLipsync(job); }}
                      className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm"
                      title={t('video.job.titles.lipsync')}
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox player */}
      {open && job.video_url && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            onClick={() => setOpen(false)}
          >
            <X className="w-8 h-8" />
          </button>
          <video
            src={job.video_url}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
