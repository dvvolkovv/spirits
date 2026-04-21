import { Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import VideoJobCard from './VideoJobCard';
import type { VideoJob } from './useVideoJobs';

interface Props {
  jobs: VideoJob[];
  loading: boolean;
  onDelete: (id: string) => void;
  onExtend: (job: VideoJob) => void;
  onLipsync: (job: VideoJob) => void;
}

export default function VideoGallery({ jobs, loading, onDelete, onExtend, onLipsync }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="w-8 h-8 border-4 border-forest-300 border-t-forest-600 rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-400">Загружаем видео…</p>
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <Film className="w-12 h-12 text-gray-200 mb-3" />
        <p className="text-sm text-gray-400">{t('video.job.emptyGallery')}</p>
        <p className="text-xs text-gray-300 mt-1">Создайте первое видео на вкладке «Создать»</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map((j) => (
          <VideoJobCard
            key={j.id}
            job={j}
            onDelete={onDelete}
            onExtend={onExtend}
            onLipsync={onLipsync}
          />
        ))}
      </div>
    </div>
  );
}
