import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Settings2, ChevronDown, ChevronUp, Loader, AlertCircle, Info, Image as ImageIcon, X } from 'lucide-react';
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
type Engine = 'kling' | 'veo';
type VeoTier = 'fast' | 'standard';

// Veo length steps (base 8s + 7s native extends). Trimmed to the exact value.
const VEO_LENGTHS = [8, 12, 16, 24, 32, 48, 60] as const;

export interface FormState {
  mode: Mode;
  model: Model;
  quality: Quality;
  duration: 5 | 10;
  // Engine selector: Kling (default, existing controls) vs Veo 3.1 (long-form
  // talking-head, native audio, portrait). Veo uses veoTier + veoLengthSec.
  engine?: Engine;
  veoTier?: VeoTier;
  veoLengthSec?: number;
  veoAspectRatio?: '16:9' | '9:16';   // формат: 9:16 для соцсетей (фидбэк katya)
  veoResolution?: '720p' | '1080p';   // 1080p — детализация кожи/пор
  // For long-form video (> 10s). When set, backend chains base+extend and
  // ffmpeg-concats to this exact duration.
  targetDurationSec?: number;
  prompt: string;
  negativePrompt: string;
  cfgScale: number;
  sourceImageUrl?: string;
  sourceVideoId?: string;
  audioUrl?: string;
  cameraType?: string;
}

const COMPOSABLE_DURATIONS = [5, 10, 15, 20, 24, 30, 45, 60] as const;
type ComposableDuration = typeof COMPOSABLE_DURATIONS[number];

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

const AUTO_STILL_TOKENS = 5000;

// Veo token pricing — mirrors backend video.dto.ts (owner-approved ~2x cost).
const VEO_PRICES: Record<VeoTier, { base: number; ext: number }> = {
  fast: { base: 90000, ext: 63000 },
  standard: { base: 240000, ext: 170000 },
};
function veoCostFor(tier: VeoTier, lengthSec: number): number {
  const p = VEO_PRICES[tier];
  const extendCount = Math.ceil(Math.max(0, lengthSec - 8) / 7);
  return p.base + extendCount * p.ext;
}

function costFor(s: FormState): number {
  if (s.engine === 'veo') return veoCostFor(s.veoTier ?? 'fast', s.veoLengthSec ?? 24);
  // Composed long video: base 10s + N × extend 5s.
  if (s.targetDurationSec && s.targetDurationSec > 10) {
    const baseKey = `${s.mode}.${s.model}.${s.quality}.10`;
    const extendKey = `extend.${s.model}.${s.quality}.5`;
    const baseCost = PRICES[baseKey] ?? 0;
    const extendCost = PRICES[extendKey] ?? 0;
    const extendCount = Math.ceil((s.targetDurationSec - 10) / 5);
    let total = baseCost + extendCount * extendCost;
    if (s.mode === 'text2video' && !s.sourceImageUrl) total += AUTO_STILL_TOKENS;
    return total;
  }
  const key = `${s.mode}.${s.model}.${s.quality}.${s.duration}`;
  const base = PRICES[key] ?? 0;
  if (s.mode === 'text2video' && !s.sourceImageUrl) return base + AUTO_STILL_TOKENS;
  return base;
}

// Effective video duration to display (target if composed, else per-segment).
function effectiveDuration(s: FormState): number {
  return s.targetDurationSec && s.targetDurationSec > 10 ? s.targetDurationSec : s.duration;
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
  text2video: 'Опишите сцену текстом — ИИ сначала создаст стартовый кадр (Nano Banana, +5000 токенов), затем анимирует его. Так композиция стабильнее, чем «голый» text→video.',
  image2video: 'Загрузите стартовый кадр, ИИ анимирует его в видео.',
  extend: 'Продолжает ваше уже готовое видео ещё на 5 секунд.',
  lipsync: 'Синхронизирует движение губ готового видео с аудиодорожкой.',
};

const PROMPT_EXAMPLES_T2V = [
  { label: 'Лошадь на пляже', text: 'Белая лошадь скачет по пляжу на закате, брызги воды в воздухе, замедленная съёмка, кинематографичный свет' },
  { label: 'Токио под дождём', text: 'Ночной Токио под дождём, неоновые отражения на мокром асфальте, медленное движение камеры вперёд, кинематографично' },
  { label: 'Дракон взлетает', text: 'Огромный дракон взлетает с вершины горы, мощно хлопая крыльями, облака расступаются, широкий эпичный кадр' },
  { label: 'Астронавт', text: 'Астронавт парит в невесомости внутри космической станции, в иллюминаторе видна Земля, плавное движение камеры' },
  { label: 'Колибри', text: 'Колибри зависает перед ярко-красным цветком, крылья размыты движением, макросъёмка, мягкое боке' },
  { label: 'Шоколад-макро', text: 'Горячий шоколадный соус медленно льётся на бисквитный торт, замедленная съёмка, студийный свет, макро' },
  { label: 'Танцовщица', text: 'Танцовщица в красном платье кружится на крыше на закате, ветер развевает ткань, тёплый контровой свет' },
  { label: 'Кит', text: 'Огромный синий кит медленно всплывает из глубины, лучи солнца пробиваются сквозь воду, подводная съёмка' },
  { label: 'Паркур', text: 'Паркурщик прыгает между крышами небоскрёбов, вид сверху с дрона, динамичное движение камеры' },
  { label: 'Лаванда', text: 'Бесконечное поле лаванды на закате, лёгкий ветер колышет цветы, пролёт камеры вперёд, кинематографично' },
];

const PROMPT_EXAMPLES_I2V = [
  { label: 'Оживить портрет', text: 'Человек на фото медленно улыбается и моргает, лёгкое движение волос от ветра, камера чуть приближается' },
  { label: 'Пейзаж в движении', text: 'Облака в небе медленно плывут, листья деревьев шевелятся от ветра, солнечные блики мерцают' },
  { label: 'Пролёт вперёд', text: 'Камера плавно движется вперёд в сцену, эффект погружения, кинематографичная глубина резкости' },
  { label: 'Орбита', text: 'Камера медленно облетает главный объект по дуге, сохраняя фокус, студийный свет' },
  { label: 'Взмах волос', text: 'Волосы персонажа развеваются от ветра, ткань одежды колышется, драматичное замедление' },
  { label: 'Дождь начинается', text: 'Начинается дождь, появляются капли на поверхностях, атмосфера становится туманной' },
  { label: 'Смена дня и ночи', text: 'Плавный переход от дня к ночи, зажигаются огни города, облака несутся быстрее' },
  { label: 'Zoom-out', text: 'Камера медленно отъезжает, раскрывая всё больше окружения вокруг главного объекта' },
];

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
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [pickerImages, setPickerImages] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const toAbsoluteUrl = (url: string): string =>
    url.startsWith('http://') || url.startsWith('https://') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;

  const openImagePicker = async () => {
    setShowImagePicker(true);
    setPickerError(null);
    if (pickerImages.length > 0) return;
    setPickerLoading(true);
    try {
      const resp = await apiClient.get('/webhook/imagegen/history');
      if (!resp.ok) throw new Error(`Ошибка ${resp.status}`);
      const data = await resp.json();
      setPickerImages(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setPickerError(e?.message ?? 'Не удалось загрузить картинки');
    } finally {
      setPickerLoading(false);
    }
  };

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
    // Long-form video is only valid for text2video / image2video. If user
    // had 24/30/60 selected and then switched to extend/lipsync, reset.
    if ((s.mode === 'extend' || s.mode === 'lipsync') && s.targetDurationSec) {
      setS(x => ({ ...x, targetDurationSec: undefined }));
    }
  }, [s.mode, s.model, s.duration, s.targetDurationSec]);

  const insufficient = balance < cost;
  const canSubmit = !submitting && !insufficient && (
    s.engine === 'veo'
      ? s.prompt.trim().length > 0
      : (s.mode !== 'image2video' || !!s.sourceImageUrl)
  );

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (s.engine === 'veo') {
        const body: any = {
          model: (s.veoTier ?? 'fast') === 'standard' ? 'veo-3.1' : 'veo-3.1-fast',
          mode: s.sourceImageUrl ? 'image2video' : 'text2video',
          prompt: s.prompt,
          sourceImageUrl: s.sourceImageUrl || undefined,
          negativePrompt: s.negativePrompt || undefined,
          targetDurationSec: s.veoLengthSec ?? 24,
          aspectRatio: s.veoAspectRatio ?? '9:16',
          resolution: s.veoResolution ?? '1080p',
        };
        const resp = await apiClient.post('/webhook/video/jobs', body);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error ?? 'create failed');
        onCreated(data.jobId);
        return;
      }
      const body: any = {
        mode: s.mode, model: s.model, quality: s.quality, duration: s.duration,
        prompt: showPrompt ? s.prompt : undefined,
        negativePrompt: showNegativePrompt ? s.negativePrompt || undefined : undefined,
        cfgScale: showCfg ? s.cfgScale : undefined,
        sourceImageUrl: showImageUpload ? s.sourceImageUrl : undefined,
        sourceVideoId: showSourceVideo ? s.sourceVideoId : undefined,
        audioUrl: showAudio ? s.audioUrl : undefined,
        cameraType: showCamera ? s.cameraType : undefined,
        // Long-form video: pass target duration when user picked > 10s.
        targetDurationSec: s.targetDurationSec && s.targetDurationSec > 10 ? s.targetDurationSec : undefined,
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

      {/* Prompt examples */}
      {showPrompt && (s.mode === 'text2video' || s.mode === 'image2video') && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Примеры — нажмите, чтобы подставить
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {(s.mode === 'text2video' ? PROMPT_EXAMPLES_T2V : PROMPT_EXAMPLES_I2V).map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setS(x => ({ ...x, prompt: ex.text }))}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-forest-400 hover:bg-forest-50 hover:text-forest-700 transition-colors whitespace-nowrap"
                title={ex.text}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Engine selector */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
          Движок
          <Hint text="Kling — универсальная генерация. Veo 3.1 — длинные ролики «говорящая голова» с нативной озвучкой и портретом." />
        </p>
        <div className="flex gap-2">
          {(['kling', 'veo'] as const).map(en => (
            <button
              key={en}
              type="button"
              onClick={() => setS({ ...s, engine: en })}
              className={clsx(
                'flex-1 py-2 rounded-lg border text-xs font-medium transition-colors',
                (s.engine ?? 'kling') === en
                  ? 'border-forest-400 bg-forest-50 text-forest-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
              )}
            >
              {en === 'kling' ? 'Kling' : 'Veo 3.1 · говорящая голова'}
            </button>
          ))}
        </div>
      </div>

      {s.engine !== 'veo' && (<>
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
                <Hint text="Длина итогового видео. Свыше 10 секунд — это автоматически склеенные сегменты, считается дороже (база 10 с + по 5 с за каждый дополнительный кусок)." />
              </p>
              <div className="grid grid-cols-4 gap-2">
                {COMPOSABLE_DURATIONS.map((d) => {
                  const selected = d <= 10
                    ? !s.targetDurationSec && s.duration === d
                    : s.targetDurationSec === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        d <= 10
                          ? setS({ ...s, duration: d as 5 | 10, targetDurationSec: undefined })
                          : setS({ ...s, duration: 10, targetDurationSec: d })
                      }
                      className={clsx(
                        'py-2 rounded-lg border text-xs font-medium transition-colors',
                        selected
                          ? 'border-forest-400 bg-forest-50 text-forest-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                      )}
                    >
                      {d} с
                    </button>
                  );
                })}
              </div>
              {s.targetDurationSec && s.targetDurationSec > 10 && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Соберём из {Math.ceil((s.targetDurationSec - 10) / 5) + 1} сегментов и склеим в один ролик автоматически.
                </p>
              )}
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
                <Hint text="Загрузите первый кадр будущего видео или возьмите из ваших сгенерированных картинок. Форматы: JPG, PNG, WebP." />
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-forest-400 cursor-pointer transition-colors bg-white text-sm text-gray-500 hover:text-forest-600">
                  <span>Загрузить файл</span>
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
                <button
                  type="button"
                  onClick={openImagePicker}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-forest-400 hover:bg-forest-50 hover:text-forest-700 transition-colors bg-white text-sm text-gray-600"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Из моих картинок</span>
                </button>
              </div>
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
      </>)}

      {/* Veo 3.1 panel */}
      {s.engine === 'veo' && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-4">
          <p className="text-[11px] text-gray-500 -mb-1">
            Реплику/речь пишите прямо в промпт — Veo озвучит её сам (нативный lipsync). Портрет ниже — опционально, для «говорящей головы».
          </p>

          {/* Talking-head preset */}
          <button
            type="button"
            onClick={() => setS(x => ({
              ...x,
              engine: 'veo', veoTier: 'fast', veoLengthSec: 24,
              prompt: x.prompt || 'Девушка дружелюбно смотрит в камеру и говорит: «Привет! Рада видеть тебя в Linkeon — здесь ты найдёшь близких по духу людей.» Мягкий дневной свет, тёплый тон, естественные жесты.',
            }))}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-forest-300 bg-forest-50 text-forest-700 hover:bg-forest-100 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" /> Пресет «Говорящая голова»
          </button>

          {/* Tier */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
              Качество
              <Hint text="Fast — быстрее и дешевле. Standard — выше детализация, дороже (~2.7×)." />
            </p>
            <div className="flex gap-2">
              {(['fast', 'standard'] as const).map(tier => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setS({ ...s, veoTier: tier })}
                  className={clsx(
                    'flex-1 py-2 rounded-lg border text-xs font-medium transition-colors',
                    (s.veoTier ?? 'fast') === tier
                      ? 'border-forest-400 bg-forest-50 text-forest-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  )}
                >
                  {tier === 'fast' ? 'Fast' : 'Standard'}
                </button>
              ))}
            </div>
          </div>

          {/* Format (aspect ratio) */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
              Формат
              <Hint text="9:16 — вертикаль для соцсетей (Reels, Shorts, Stories, TikTok). 16:9 — горизонталь. Для портрета лучше 9:16." />
            </p>
            <div className="flex gap-2">
              {([['9:16', '9:16 · вертикаль'], ['16:9', '16:9 · горизонталь']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setS({ ...s, veoAspectRatio: val })}
                  className={clsx(
                    'flex-1 py-2 rounded-lg border text-xs font-medium transition-colors',
                    (s.veoAspectRatio ?? '9:16') === val
                      ? 'border-forest-400 bg-forest-50 text-forest-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
              Разрешение
              <Hint text="1080p — выше детализация (кожа, поры). 720p — быстрее. Extend-сегменты у Veo всегда 720p, поэтому 1080p заметнее на роликах до 8с." />
            </p>
            <div className="flex gap-2">
              {(['1080p', '720p'] as const).map(res => (
                <button
                  key={res}
                  type="button"
                  onClick={() => setS({ ...s, veoResolution: res })}
                  className={clsx(
                    'flex-1 py-2 rounded-lg border text-xs font-medium transition-colors',
                    (s.veoResolution ?? '1080p') === res
                      ? 'border-forest-400 bg-forest-50 text-forest-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  )}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

          {/* Length */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
              Длина
              <Hint text="Veo собирает одно непрерывное видео: база 8с + расширения по 7с, обрезается до выбранной длины." />
            </p>
            <div className="grid grid-cols-4 gap-2">
              {VEO_LENGTHS.map(len => (
                <button
                  key={len}
                  type="button"
                  onClick={() => setS({ ...s, veoLengthSec: len })}
                  className={clsx(
                    'py-2 rounded-lg border text-xs font-medium transition-colors',
                    (s.veoLengthSec ?? 24) === len
                      ? 'border-forest-400 bg-forest-50 text-forest-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  )}
                >
                  {len} с
                </button>
              ))}
            </div>
          </div>

          {/* Portrait (optional) */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
              Портрет (опционально)
              <Hint text="Фронтальный портрет хорошего качества — Veo сделает говорящую голову с этим лицом. Без портрета — сцена по описанию." />
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-forest-400 cursor-pointer transition-colors bg-white text-sm text-gray-500 hover:text-forest-600">
                <span>Загрузить файл</span>
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
              <button
                type="button"
                onClick={openImagePicker}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-forest-400 hover:bg-forest-50 hover:text-forest-700 transition-colors bg-white text-sm text-gray-600"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Из моих картинок</span>
              </button>
            </div>
            {s.sourceImageUrl && (
              <div className="mt-2 flex items-start gap-2">
                <img src={s.sourceImageUrl} alt="portrait" className="max-h-40 rounded-lg object-cover" />
                <button type="button" onClick={() => setS(x => ({ ...x, sourceImageUrl: undefined }))} className="text-xs text-gray-400 hover:text-red-500">убрать</button>
              </div>
            )}
          </div>
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

      {/* Image picker modal */}
      {showImagePicker && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowImagePicker(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full p-5 shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-forest-600" />
                <h3 className="text-base font-semibold text-gray-900">Выбрать из моих картинок</h3>
              </div>
              <button onClick={() => setShowImagePicker(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pickerLoading && (
              <div className="flex-1 flex items-center justify-center py-8">
                <Loader className="w-6 h-6 animate-spin text-forest-600" />
              </div>
            )}

            {pickerError && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{pickerError}</span>
              </div>
            )}

            {!pickerLoading && !pickerError && pickerImages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <ImageIcon className="w-10 h-10 text-gray-200 mb-2" />
                <p className="text-sm text-gray-500">У вас пока нет сгенерированных картинок.</p>
                <a href="/imagegen" className="mt-3 text-sm text-forest-600 hover:text-forest-700 underline">Перейти к генератору картинок</a>
              </div>
            )}

            {!pickerLoading && pickerImages.length > 0 && (
              <div className="flex-1 overflow-y-auto -mx-1 px-1">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {pickerImages.map((it: any) => {
                    const cleanPrompt = (it.prompt || '').replace(/^\[edit\]\s*|^\[compose\s+\d+\]\s*/, '');
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => {
                          setS(x => ({ ...x, sourceImageUrl: toAbsoluteUrl(it.image_url) }));
                          setShowImagePicker(false);
                        }}
                        className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-forest-400 hover:ring-2 hover:ring-forest-200 transition-all bg-gray-50"
                        title={cleanPrompt}
                      >
                        <img src={it.image_url} className="w-full h-full object-cover" loading="lazy" alt="" />
                        <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent text-[10px] text-white line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {cleanPrompt || 'Без описания'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
