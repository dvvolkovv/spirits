// src/components/chat/AudioClip.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Download, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

interface ClipMeta {
  id: string;
  url: string;
  durationSec: number;
  chars?: number;
  voice: string;
  provider?: string;
  lang?: string;
  createdAt?: string;
}

/**
 * Плеер одной озвучки. В текст сообщения бэкенд/стрим кладёт только маркер
 * {{audio:id=<uuid>}}, а не ссылку на mp3 — иначе после перезагрузки страницы
 * в истории остался бы протухший URL. Метаданные (в т.ч. свежий url) тянем
 * по clipId с GET /webhook/speech/:id.
 */
const AudioClip: React.FC<{ clipId: string }> = ({ clipId }) => {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<ClipMeta | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  // Длительность из самого файла: держим в state, а не читаем audioRef при
  // рендере — ref не вызывает перерисовку, и шкала осталась бы на нуле.
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // apiClient в этом проекте возвращает сырой Response (см. smm-api.ts),
        // а не распарсенный объект — поэтому .ok + .json(), без res.data.
        const res = await apiClient.get(`/webhook/speech/${clipId}`);
        if (!res.ok) throw new Error(`speech ${clipId}: ${res.status}`);
        const data: ClipMeta = await res.json();
        if (!cancelled) setMeta(data);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clipId]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      void el.play();
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 my-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{t('chat.audio_load_error')}</span>
      </div>
    );
  }

  if (!meta) {
    return <div className="my-2 h-14 rounded-lg bg-gray-100 animate-pulse" aria-hidden="true" />;
  }

  const total = duration || meta.durationSec || 0;
  const pct = total > 0 ? Math.min(100, (progress / total) * 100) : 0;
  const fmt = (s: number) =>
    Number.isFinite(s) && s > 0
      ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
      : '0:00';

  return (
    <div className="flex items-center gap-3 my-2 p-3 rounded-lg bg-forest-50 border border-forest-100">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('chat.audio_pause') : t('chat.audio_play')}
        title={playing ? t('chat.audio_pause') : t('chat.audio_play')}
        className="w-10 h-10 shrink-0 rounded-full bg-forest-600 text-white flex items-center justify-center hover:bg-forest-700 transition-colors"
      >
        {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full bg-forest-200 overflow-hidden">
          <div className="h-full bg-forest-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-xs text-forest-900/70 tabular-nums">
          {fmt(progress)} / {fmt(total)}
        </div>
      </div>

      <a
        href={meta.url}
        download={`linkeon-speech-${clipId.slice(0, 8)}.mp3`}
        aria-label={t('chat.audio_download')}
        title={t('chat.audio_download')}
        className="w-8 h-8 shrink-0 rounded-full text-forest-700 hover:bg-forest-100 flex items-center justify-center"
      >
        <Download className="w-4 h-4" />
      </a>

      <audio
        ref={audioRef}
        src={meta.url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = (e.target as HTMLAudioElement).duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
        onError={() => setError(true)}
      />
    </div>
  );
};

export default AudioClip;
