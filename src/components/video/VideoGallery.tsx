// src/components/video/VideoGallery.tsx
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
    return <div className="p-8 text-center text-gray-500">Loading…</div>;
  }
  if (!jobs.length) {
    return (
      <div className="p-8 text-center text-gray-500">
        {t('video.job.emptyGallery')}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4">
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
  );
}
