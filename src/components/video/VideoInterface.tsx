// src/components/video/VideoInterface.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoJobs, VideoJob } from './useVideoJobs';
import VideoCreateForm, { FormState } from './VideoCreateForm';
import VideoGallery from './VideoGallery';

type Tab = 'create' | 'gallery';

export default function VideoInterface() {
  const { t } = useTranslation();
  const { jobs, loading, deleteJob, refetch } = useVideoJobs();
  const [tab, setTab] = useState<Tab>('create');
  const [prefill, setPrefill] = useState<Partial<FormState>>({});

  function onExtend(j: VideoJob) {
    setPrefill({
      mode: 'extend',
      sourceVideoId: j.id,
      model: j.model as FormState['model'],
      quality: j.quality as FormState['quality'],
    });
    setTab('create');
  }

  function onLipsync(j: VideoJob) {
    setPrefill({
      mode: 'lipsync',
      sourceVideoId: j.id,
      model: 'kling-v1-6',
      quality: j.quality as FormState['quality'],
    });
    setTab('create');
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t('video.pageTitle')}</h1>

      <div className="flex gap-2 mb-4 border-b">
        {(['create', 'gallery'] as const).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            className={`px-4 py-2 ${
              tab === x ? 'border-b-2 border-green-600 font-semibold' : 'text-gray-500'
            }`}
          >
            {t(`video.tabs.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'create' && (
        <VideoCreateForm
          defaults={prefill}
          onCreated={() => {
            refetch();
            setTab('gallery');
            setPrefill({});
          }}
        />
      )}
      {tab === 'gallery' && (
        <VideoGallery
          jobs={jobs}
          loading={loading}
          onDelete={deleteJob}
          onExtend={onExtend}
          onLipsync={onLipsync}
        />
      )}
    </div>
  );
}
