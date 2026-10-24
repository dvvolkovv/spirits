import { useState, useEffect } from 'react';
import { Film, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useVideoJobs, VideoJob } from './useVideoJobs';
import VideoCreateForm, { FormState, VEO_LENGTHS } from './VideoCreateForm';
import VideoGallery from './VideoGallery';
import { formatNumber } from '../../utils/formatters';

type Tab = 'create' | 'gallery';

// Галерея картинок отдаёт относительные пути, а бэкенд скачивает референс по
// полному адресу — как и выбор картинки внутри формы.
const toAbsoluteUrl = (url: string): string =>
  /^https?:\/\//.test(url) ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;

export default function VideoInterface() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { jobs, loading, deleteJob, refetch } = useVideoJobs();
  const [searchParams, setSearchParams] = useSearchParams();

  // Принять prefill из ?mode=image2video&sourceImageUrl=... (приход с /image-gen «Сделать видео»):
  // картинка становится первым референс-фото Veo.
  // ВАЖНО: инициализируем СИНХРОННО (через ленивый initializer useState), потому что
  // VideoCreateForm читает defaults один раз в своём useState — если выставлять prefill
  // через useEffect ПОСЛЕ монтирования, форма уже инициализировалась с дефолтами и
  // sourceImageUrl/mode не подхватит.
  const initialPrefill = (): Partial<FormState> => {
    const sourceImageUrl = searchParams.get('sourceImageUrl');
    if (sourceImageUrl && searchParams.get('mode') === 'image2video') {
      return { sourceImageUrls: [toAbsoluteUrl(sourceImageUrl)] };
    }
    return {};
  };

  const [tab, setTab] = useState<Tab>('create');
  const [prefill, setPrefill] = useState<Partial<FormState>>(initialPrefill);

  // Чистим query после монтирования, чтобы reload и переключение вкладок не реактивировали prefill.
  useEffect(() => {
    if (searchParams.has('sourceImageUrl') || searchParams.has('mode')) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onRepeat(j: VideoJob) {
    // «Сделать заново» — копируем prompt + параметры в форму, юзер нажимает «Создать»
    // (не auto-submit чтобы можно было что-то подкорректировать). Длину приводим
    // к ближайшему шагу Veo — у старых роликов Kling она была 5 или 10 с.
    const sec = j.target_duration_sec ?? j.duration_sec;
    const veoLengthSec = VEO_LENGTHS.reduce((best, len) =>
      Math.abs(len - sec) < Math.abs(best - sec) ? len : best, VEO_LENGTHS[0] as number);
    setPrefill({
      prompt: j.prompt ?? '',
      veoLengthSec,
    });
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
            <span className="font-medium">{formatNumber(user.tokens)}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0 bg-white px-4">
        {([
          { id: 'create', label: t('video.tabs.create') },
          { id: 'gallery', label: t('video.tabs.gallery') },
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
          <VideoGallery jobs={jobs} loading={loading} onDelete={deleteJob} onRepeat={onRepeat} />
        )}
      </div>
    </div>
  );
}
