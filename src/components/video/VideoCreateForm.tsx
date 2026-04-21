import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Settings2, ChevronDown, ChevronUp, Loader, AlertCircle, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/apiClient';

interface Props {
  onCreated: (jobId: string) => void;
  defaults?: Partial<FormState>;
}

type Mode = 'text2video' | 'image2video' | 'extend' | 'lipsync';
type Model = 'kling-v1-6' | 'kling-v2-master';
type Quality = 'std' | 'pro';

export interface FormState {
  mode: Mode;
  model: Model;
  quality: Quality;
  duration: 5 | 10;
  prompt: string;
  negativePrompt: string;
  cfgScale: number;
  sourceImageUrl?: string;
  sourceVideoId?: string;
  audioUrl?: string;
  cameraType?: string;
}

const PRICES: Record<string, number> = {
  'text2video.kling-v1-6.std.5': 25000,      'text2video.kling-v1-6.std.10': 50000,
  'text2video.kling-v1-6.pro.5': 50000,      'text2video.kling-v1-6.pro.10': 100000,
  'text2video.kling-v2-master.std.5': 150000, 'text2video.kling-v2-master.std.10': 300000,
  'text2video.kling-v2-master.pro.5': 150000, 'text2video.kling-v2-master.pro.10': 300000,
  'image2video.kling-v1-6.std.5': 25000,     'image2video.kling-v1-6.std.10': 50000,
  'image2video.kling-v1-6.pro.5': 50000,     'image2video.kling-v1-6.pro.10': 100000,
  'image2video.kling-v2-master.std.5': 150000,'image2video.kling-v2-master.std.10': 300000,
  'image2video.kling-v2-master.pro.5': 150000,'image2video.kling-v2-master.pro.10': 300000,
  'extend.kling-v1-6.std.5': 25000,  'extend.kling-v1-6.pro.5': 50000,
  'extend.kling-v2-master.std.5': 150000, 'extend.kling-v2-master.pro.5': 150000,
  'lipsync.kling-v1-6.std.5': 15000, 'lipsync.kling-v1-6.std.10': 15000,
};

function costFor(s: FormState): number {
  const key = `${s.mode}.${s.model}.${s.quality}.${s.duration}`;
  return PRICES[key] ?? 0;
}

async function uploadFile(kind: 'image' | 'audio', file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const resp = await apiClient.post(`/webhook/video/upload-${kind}`, fd);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error ?? 'upload failed');
  return data.url as string;
}

function Hint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex ml-1.5 align-middle cursor-help">
      <Info className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition-colors" />
      <span className="pointer-events-none absolute left-0 top-full mt-1.5 w-60 rounded-lg bg-gray-800 text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg leading-relaxed">
        {text}
      </span>
    </span>
  );
}

const MODE_HINTS: Record<Mode, string> = {
  text2video: 'Опишите сцену текстом — ИИ создаст видео с нуля.',
  image2video: 'Загрузите стартовый кадр, ИИ анимирует его в видео.',
  extend: 'Продолжает ваше уже готовое видео ещё на 5 секунд.',
  lipsync: 'Синхронизирует движение губ готового видео с аудиодорожкой.',
};

export default function VideoCreateForm({ onCreated, defaults }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const balance = user?.tokens ?? 0;
  const [showSettings, setShowSettings] = useState(false);

  const [s, setS] = useState<FormState>({
    mode: 'text2video',
    model: 'kling-v1-6',
    quality: 'std',
    duration: 5,
    prompt: '',
    negativePrompt: '',
    cfgScale: 0.5,
    ...defaults,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cost = useMemo(() => costFor(s), [s]);
  const showPrompt = s.mode !== 'lipsync';
  const showNegativePrompt = s.mode !== 'lipsync';
  const showCfg = s.mode !== 'lipsync';
  const showDuration = s.mode !== 'extend';
  const showCamera = s.mode === 'text2video' || s.mode === 'image2video';
  const showImageUpload = s.mode === 'image2video';
  const showSourceVideo = s.mode === 'extend' || s.mode === 'lipsync';
  const showAudio = s.mode === 'lipsync';

  useEffect(() => {
    if (s.mode === 'lipsync' && s.model !== 'kling-v1-6') setS(x => ({ ...x, model: 'kling-v1-6' }));
    if (s.mode === 'extend' && s.duration !== 5) setS(x => ({ ...x, duration: 5 }));
  }, [s.mode, s.model, s.duration]);

  const insufficient = balance < cost;
  const canSubmit = !submitting && !insufficient && (s.mode !== 'image2video' || !!s.sourceImageUrl);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const body: any = {
        mode: s.mode, model: s.model, quality: s.quality, duration: s.duration,
        prompt: showPrompt ? s.prompt : undefined,
        negativePrompt: showNegativePrompt ? s.negativePrompt || undefined : undefined,
        cfgScale: showCfg ? s.cfgScale : undefined,
        sourceImageUrl: showImageUpload ? s.sourceImageUrl : undefined,
        sourceVideoId: showSourceVideo ? s.sourceVideoId : undefined,
        audioUrl: showAudio ? s.audioUrl : undefined,
        cameraType: showCamera ? s.cameraType : undefined,
      };
      const resp = await apiClient.post('/webhook/video/jobs', body);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error ?? 'create failed');
      onCreated(data.jobId);
    } catch (e: any) {
      setError(e?.message ?? 'submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300 focus:border-transparent bg-white';

  return (
    <div className="p-4 space-y-3 border-b border-gray-100">
      {/* Prompt — top and prominent */}
      {showPrompt && (
        <textarea
          rows={4}
          className={`${inputClass} resize-none`}
          placeholder={t('video.prompt.placeholder') as string}
          value={s.prompt}
          onChange={e => setS({ ...s, prompt: e.target.value })}
        />
      )}

      {/* Mode chips */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
          {t('video.mode.label')}
          <Hint text="Выберите режим генерации. Текст→Видео — самый простой старт." />
        </p>
        <div className="flex flex-wrap gap-2">
          {(['text2video', 'image2video', 'extend', 'lipsync'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setS({ ...s, mode: m })}
              title={MODE_HINTS[m]}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                s.mode === m
                  ? 'border-forest-400 bg-forest-50 text-forest-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
              )}
            >
              {t(`video.mode.${m}`)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">{MODE_HINTS[s.mode]}</p>
      </div>

      {/* Settings toggle */}
      <button
        type="button"
        onClick={() => setShowSettings(!showSettings)}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-forest-600 transition-colors"
      >
        <Settings2 className="w-4 h-4" />
        <span>Настройки</span>
        {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {/* Collapsible settings panel */}
      {showSettings && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-4">
          {/* Model */}
          {s.mode !== 'lipsync' && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.model.label')}
                <Hint text="Стандарт (v1.6) — быстрее и дешевле. Премиум (v2 Master) — максимальное качество, в 6× дороже." />
              </p>
              <div className="flex gap-2">
                {(['kling-v1-6', 'kling-v2-master'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setS({ ...s, model: m })}
                    className={clsx(
                      'flex-1 py-2 rounded-lg border text-xs font-medium transition-colors',
                      s.model === m
                        ? 'border-forest-400 bg-forest-50 text-forest-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    )}
                  >
                    {t(`video.model.${m === 'kling-v1-6' ? 'standard' : 'premium'}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quality */}
          {s.mode !== 'lipsync' && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.quality.label')}
                <Hint text="Обычное (std) — стандартное разрешение. Профи (pro) — высокое разрешение и детализация, вдвое дороже." />
              </p>
              <div className="flex gap-2">
                {(['std', 'pro'] as const).map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setS({ ...s, quality: q })}
                    className={clsx(
                      'flex-1 py-2 rounded-lg border text-xs font-medium transition-colors',
                      s.quality === q
                        ? 'border-forest-400 bg-forest-50 text-forest-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    )}
                  >
                    {t(`video.quality.${q}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Duration */}
          {showDuration && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.duration.label')}
                <Hint text="Длина итогового видео. 10 секунд стоит вдвое дороже 5." />
              </p>
              <div className="flex gap-2">
                {([5, 10] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setS({ ...s, duration: d })}
                    className={clsx(
                      'flex-1 py-2 rounded-lg border text-xs font-medium transition-colors',
                      s.duration === d
                        ? 'border-forest-400 bg-forest-50 text-forest-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    )}
                  >
                    {t(`video.duration.${d}s`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Negative prompt */}
          {showNegativePrompt && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.negativePrompt.label')}
                <Hint text="Укажите, что НЕ должно появиться в видео. Например: «размытость, артефакты, текст на экране»." />
              </p>
              <textarea
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white"
                placeholder="размытость, артефакты, плохое качество..."
                value={s.negativePrompt}
                onChange={e => setS({ ...s, negativePrompt: e.target.value })}
              />
            </div>
          )}

          {/* CFG Scale */}
          {showCfg && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.cfgScale.label')}: <span className="ml-1 text-gray-700 font-semibold">{s.cfgScale.toFixed(1)}</span>
                <Hint text="Насколько точно ИИ следует промпту. 0.5 — баланс свободы и точности. Ближе к 1 — строже следует тексту." />
              </p>
              <input
                type="range" min={0} max={1} step={0.1}
                className="w-full accent-forest-600"
                value={s.cfgScale}
                onChange={e => setS({ ...s, cfgScale: parseFloat(e.target.value) })}
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Свободнее</span>
                <span>Точнее</span>
              </div>
            </div>
          )}

          {/* Camera presets */}
          {showCamera && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.cameraType.label')}
                <Hint text="Тип движения камеры в видео. Оставьте пустым — ИИ выберет сам." />
              </p>
              <select
                className={`${inputClass} appearance-none`}
                value={s.cameraType ?? ''}
                onChange={e => setS({ ...s, cameraType: e.target.value || undefined })}
              >
                <option value="">— Автоматически —</option>
                <option value="simple">Статичная (simple)</option>
                <option value="down_back">Назад-вниз (down_back)</option>
                <option value="forward_up">Вперёд-вверх (forward_up)</option>
                <option value="right_turn_forward">Поворот вправо (right_turn_forward)</option>
                <option value="left_turn_forward">Поворот влево (left_turn_forward)</option>
              </select>
            </div>
          )}

          {/* Image upload */}
          {showImageUpload && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.sourceImage.label')}
                <Hint text="Загрузите первый кадр будущего видео. ИИ анимирует его в движение. Форматы: JPG, PNG, WebP." />
              </p>
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-forest-400 cursor-pointer transition-colors bg-white text-sm text-gray-500 hover:text-forest-600">
                <span>Выбрать изображение</span>
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const url = await uploadFile('image', f);
                      setS(x => ({ ...x, sourceImageUrl: url }));
                    } catch (err: any) { setError(err?.message ?? 'image upload failed'); }
                  }}
                />
              </label>
              {s.sourceImageUrl && (
                <img src={s.sourceImageUrl} alt="preview" className="mt-2 max-h-40 rounded-lg object-cover" />
              )}
            </div>
          )}

          {/* Source video */}
          {showSourceVideo && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.sourceVideo.label')}
                <Hint text="ID готового видео из галереи «Мои видео». Откройте галерею, наведите на нужное видео — ID показывается во всплывающей подсказке при нажатии «Продолжить» или «Липсинк»." />
              </p>
              <input
                className={inputClass}
                placeholder="Автоматически из галереи при нажатии «Продолжить»"
                value={s.sourceVideoId ?? ''}
                onChange={e => setS({ ...s, sourceVideoId: e.target.value })}
              />
              {!s.sourceVideoId && (
                <p className="text-xs text-gray-400 mt-1">
                  Совет: перейдите в «Мои видео» и нажмите кнопку «Продолжить» или «Липсинк» — ID заполнится автоматически.
                </p>
              )}
            </div>
          )}

          {/* Audio upload */}
          {showAudio && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.audio.label')}
                <Hint text="Аудиофайл с речью, под которую синхронизируются губы в видео. Форматы: MP3, WAV, M4A. Длительность должна совпадать с видео." />
              </p>
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-forest-400 cursor-pointer transition-colors bg-white text-sm text-gray-500 hover:text-forest-600">
                <span>Выбрать аудиофайл</span>
                <input
                  type="file" accept="audio/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const url = await uploadFile('audio', f);
                      setS(x => ({ ...x, audioUrl: url }));
                    } catch (err: any) { setError(err?.message ?? 'audio upload failed'); }
                  }}
                />
              </label>
              {s.audioUrl && <p className="text-xs text-green-600 mt-1">Аудио загружено</p>}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Insufficient tokens */}
      {insufficient && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          Нужно {cost.toLocaleString('ru-RU')} токенов, у вас {balance.toLocaleString('ru-RU')}.{' '}
          <a href="/chat?view=tokens" className="underline font-medium">Пополнить</a>
        </div>
      )}

      {/* Generate button */}
      <button
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
        className={clsx(
          'w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all',
          canSubmit
            ? 'bg-forest-600 hover:bg-forest-700 text-white shadow-sm'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        )}
      >
        {submitting ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            <span>Создаём видео…</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span>{t('video.submit.create')}</span>
            <span className="text-xs opacity-70 ml-1">({cost.toLocaleString('ru-RU')} токенов)</span>
          </>
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">Генерация занимает 3–5 минут</p>
    </div>
  );
}
