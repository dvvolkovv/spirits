import { useState, useEffect } from 'react';
import { Film, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoJobs, VideoJob } from './useVideoJobs';
import VideoCreateForm, { FormState } from './VideoCreateForm';
import VideoGallery from './VideoGallery';
import { MyVideosList } from '../chat/smm/MyVideosList';

type Tab = 'create' | 'gallery' | 'smm';

export default function VideoInterface() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { jobs, loading, deleteJob, refetch } = useVideoJobs();
  const [tab, setTab] = useState<Tab>('create');
  const [prefill, setPrefill] = useState<Partial<FormState>>({});
  const [searchParams, setSearchParams] = useSearchParams();

  // Принять prefill из ?mode=...&sourceImageUrl=... (приход с /image-gen «Сделать видео»).
  // Очищаем query, чтобы reload и переключение вкладок не реактивировали prefill.
  useEffect(() => {
    const sourceImageUrl = searchParams.get('sourceImageUrl');
    const mode = searchParams.get('mode') as FormState['mode'] | null;
    if (sourceImageUrl && mode === 'image2video') {
      setPrefill({ mode, sourceImageUrl });
      setTab('create');
      setSearchParams({}, { replace: true });
    }
  }, []);

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
        {([
          { id: 'create', label: t('video.tabs.create') },
          { id: 'gallery', label: t('video.tabs.gallery') },
          { id: 'smm', label: 'SMM-ролики (Юля)' },
        ] as const).map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id as Tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === x.id
                ? 'border-forest-600 text-forest-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {x.label}
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
        {tab === 'smm' && <MyVideosList />}
      </div>
    </div>
  );
}
