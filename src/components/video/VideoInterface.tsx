import { useState } from 'react';
import { Film, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoJobs, VideoJob } from './useVideoJobs';
import VideoCreateForm, { FormState } from './VideoCreateForm';
import VideoGallery from './VideoGallery';

type Tab = 'create' | 'gallery';

export default function VideoInterface() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { jobs, loading, deleteJob, refetch } = useVideoJobs();
  const [tab, setTab] = useState<Tab>('create');
  const [prefill, setPrefill] = useState<Partial<FormState>>({});

  function onExtend(j: VideoJob) {
    setPrefill({ mode: 'extend', sourceVideoId: j.id, model: j.model as FormState['model'], quality: j.quality as FormState['quality'] });
    setTab('create');
  }

  function onLipsync(j: VideoJob) {
    setPrefill({ mode: 'lipsync', sourceVideoId: j.id, model: 'kling-v1-6', quality: j.quality as FormState['quality'] });
    setTab('create');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-forest-600" />
          <h1 className="text-base font-semibold text-gray-900">{t('video.pageTitle')}</h1>
        </div>
        {user?.tokens !== undefined && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Coins className="w-4 h-4 text-forest-600" />
            <span className="font-medium">{user.tokens.toLocaleString('ru-RU')}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0 bg-white px-4">
        {(['create', 'gallery'] as const).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === x
                ? 'border-forest-600 text-forest-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(`video.tabs.${x}`)}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'create' && (
          <VideoCreateForm
            defaults={prefill}
            onCreated={() => { refetch(); setTab('gallery'); setPrefill({}); }}
          />
        )}
        {tab === 'gallery' && (
          <VideoGallery jobs={jobs} loading={loading} onDelete={deleteJob} onExtend={onExtend} onLipsync={onLipsync} />
        )}
      </div>
    </div>
  );
}
