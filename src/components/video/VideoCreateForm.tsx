import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Sparkles, Settings2, ChevronDown, ChevronUp, Loader, AlertCircle, Info, Image as ImageIcon, X, Wand2, Mic } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/apiClient';
import VideoExamples from './VideoExamples';
import { useVoiceProfile } from './useVoiceProfile';
import VoiceSamplePanel from './VoiceSamplePanel';
import { formatNumber } from '../../utils/formatters';

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
  sourceImageUrls?: string[];   // Veo: до 3 референс-фото (Ingredients) для сходства
  sourceVideoId?: string;
  audioUrl?: string;
  cameraType?: string;
  useOwnVoice?: boolean;   // Veo: озвучить голосом пользователя (96cba3f7)
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
function veoCostFor(tier: VeoTier, lengthSec: number, aspect: '16:9' | '9:16' = '9:16'): number {
  const p = VEO_PRICES[tier];
  // 9:16 длиннее 8с: Veo extend умеет только 16:9, поэтому вертикаль собирается
  // как concat N независимых 8с-клипов — каждый клип это полная база (N×base).
  // 16:9 и короткая вертикаль (≤8с) — база + native extend по 7с.
  if (aspect === '9:16' && lengthSec > 8) {
    return Math.ceil(lengthSec / 8) * p.base;
  }
  const extendCount = Math.ceil(Math.max(0, lengthSec - 8) / 7);
  return p.base + extendCount * p.ext;
}

// Надбавка за «голосом оригинала» — зеркало backend computeOwnVoiceSurcharge:
// ElevenLabs STS (~15 симв/с × $0.30/1k) × Veo markup 75000 ток/$ ≈ 338 ток/сек.
function ownVoiceSurcharge(sec: number): number {
  const s = Math.max(1, Math.round(sec || 0));
  return Math.ceil((s * 15 / 1000) * 0.30 * 75000);
}

function costFor(s: FormState): number {
  if (s.engine === 'veo') {
    let c = veoCostFor(s.veoTier ?? 'fast', s.veoLengthSec ?? 24, s.veoAspectRatio ?? '9:16');
    if (s.useOwnVoice) c += ownVoiceSurcharge(s.veoLengthSec ?? 24);
    return c;
  }
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

function getModeHints(t: TFunction): Record<Mode, string> {
  return {
    text2video: t('video.mode.hint_text2video'),
    image2video: t('video.mode.hint_image2video'),
    extend: t('video.mode.hint_extend'),
    lipsync: t('video.mode.hint_lipsync'),
  };
}

function getPromptExamplesT2V(t: TFunction) {
  return [
    { label: t('video.create.prompt_examples_t2v.horse_beach.label'), text: t('video.create.prompt_examples_t2v.horse_beach.text') },
    { label: t('video.create.prompt_examples_t2v.tokyo_rain.label'), text: t('video.create.prompt_examples_t2v.tokyo_rain.text') },
    { label: t('video.create.prompt_examples_t2v.dragon_takeoff.label'), text: t('video.create.prompt_examples_t2v.dragon_takeoff.text') },
    { label: t('video.create.prompt_examples_t2v.astronaut.label'), text: t('video.create.prompt_examples_t2v.astronaut.text') },
    { label: t('video.create.prompt_examples_t2v.hummingbird.label'), text: t('video.create.prompt_examples_t2v.hummingbird.text') },
    { label: t('video.create.prompt_examples_t2v.chocolate_macro.label'), text: t('video.create.prompt_examples_t2v.chocolate_macro.text') },
    { label: t('video.create.prompt_examples_t2v.dancer.label'), text: t('video.create.prompt_examples_t2v.dancer.text') },
    { label: t('video.create.prompt_examples_t2v.whale.label'), text: t('video.create.prompt_examples_t2v.whale.text') },
    { label: t('video.create.prompt_examples_t2v.parkour.label'), text: t('video.create.prompt_examples_t2v.parkour.text') },
    { label: t('video.create.prompt_examples_t2v.lavender.label'), text: t('video.create.prompt_examples_t2v.lavender.text') },
  ];
}

function getPromptExamplesI2V(t: TFunction) {
  return [
    { label: t('video.create.prompt_examples_i2v.animate_portrait.label'), text: t('video.create.prompt_examples_i2v.animate_portrait.text') },
    { label: t('video.create.prompt_examples_i2v.landscape_motion.label'), text: t('video.create.prompt_examples_i2v.landscape_motion.text') },
    { label: t('video.create.prompt_examples_i2v.flythrough.label'), text: t('video.create.prompt_examples_i2v.flythrough.text') },
    { label: t('video.create.prompt_examples_i2v.orbit.label'), text: t('video.create.prompt_examples_i2v.orbit.text') },
    { label: t('video.create.prompt_examples_i2v.hair_flow.label'), text: t('video.create.prompt_examples_i2v.hair_flow.text') },
    { label: t('video.create.prompt_examples_i2v.rain_starts.label'), text: t('video.create.prompt_examples_i2v.rain_starts.text') },
    { label: t('video.create.prompt_examples_i2v.day_night.label'), text: t('video.create.prompt_examples_i2v.day_night.text') },
    { label: t('video.create.prompt_examples_i2v.zoom_out.label'), text: t('video.create.prompt_examples_i2v.zoom_out.text') },
  ];
}

export default function VideoCreateForm({ onCreated, defaults }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const balance = user?.tokens ?? 0;
  const voice = useVoiceProfile();   // клон голоса пользователя (96cba3f7)
  const [showSettings, setShowSettings] = useState(false);
  const MODE_HINTS = useMemo(() => getModeHints(t), [t]);
  const promptExamplesT2V = useMemo(() => getPromptExamplesT2V(t), [t]);
  const promptExamplesI2V = useMemo(() => getPromptExamplesI2V(t), [t]);

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
      if (!resp.ok) throw new Error(t('video.create.picker_error_status', { status: resp.status }));
      const data = await resp.json();
      setPickerImages(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setPickerError(e?.message ?? t('video.create.picker_load_error'));
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
  // «Голосом оригинала» включено, но клон ещё не готов → сначала загрузить голос.
  const ownVoiceBlocks = s.engine === 'veo' && !!s.useOwnVoice && !voice.hasVoice;
  const canSubmit = !submitting && !insufficient && !ownVoiceBlocks && (
    s.engine === 'veo'
      ? s.prompt.trim().length > 0
      : (s.mode !== 'image2video' || !!s.sourceImageUrl)
  );

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (s.engine === 'veo') {
        const veoImgs = (s.sourceImageUrls ?? []).slice(0, 3);
        const body: any = {
          model: (s.veoTier ?? 'fast') === 'standard' ? 'veo-3.1' : 'veo-3.1-fast',
          mode: veoImgs.length ? 'image2video' : 'text2video',
          prompt: s.prompt,
          sourceImageUrls: veoImgs.length ? veoImgs : undefined,
          sourceImageUrl: veoImgs[0] || undefined,
          negativePrompt: s.negativePrompt || undefined,
          targetDurationSec: s.veoLengthSec ?? 24,
          aspectRatio: s.veoAspectRatio ?? '9:16',
          resolution: s.veoResolution ?? '1080p',
          ownVoice: !!(s.useOwnVoice && voice.hasVoice) || undefined,
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
      {/* Готовые видео-примеры (вдохновить + подставить промпт) */}
      <VideoExamples
        onUse={(ex) => setS((x) => ({
          ...x,
          prompt: ex.prompt,
          engine: ex.engine,
          mode: 'text2video',
          ...(ex.engine === 'veo' ? { veoAspectRatio: ex.aspect } : {}),
        }))}
      />

      {/* Prompt — главное целевое действие, визуально выделено */}
      {showPrompt && (
        <div>
          <label htmlFor="video-prompt" className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-1.5">
            <Wand2 className="w-4 h-4 text-forest-600" />
            {t('video.create.prompt_heading')}
          </label>
          <textarea
            id="video-prompt"
            rows={4}
            className="w-full rounded-xl border-2 border-forest-300 bg-forest-50/40 px-4 py-3 text-base text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-forest-400/60 focus:border-forest-400 resize-none transition-colors"
            placeholder={t('video.prompt.placeholder') as string}
            value={s.prompt}
            onChange={e => setS({ ...s, prompt: e.target.value })}
          />
          <p className="text-xs text-gray-400 mt-1">{t('video.prompt.hint')}</p>
        </div>
      )}

      {/* Prompt examples */}
      {showPrompt && (s.mode === 'text2video' || s.mode === 'image2video') && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            {t('video.create.examples_hint')}
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {(s.mode === 'text2video' ? promptExamplesT2V : promptExamplesI2V).map((ex, i) => (
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
          {t('video.engine.label')}
          <Hint text={t('video.engine.hint') as string} />
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
              {en === 'kling' ? 'Kling' : t('video.engine.veo_option')}
            </button>
          ))}
        </div>
      </div>

      {s.engine !== 'veo' && (<>
      {/* Mode chips */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
          {t('video.mode.label')}
          <Hint text={t('video.mode.hint') as string} />
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
        <span>{t('video.create.settings_toggle')}</span>
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
                <Hint text={t('video.model.hint') as string} />
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
                <Hint text={t('video.quality.hint') as string} />
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
                <Hint text={t('video.duration.hint') as string} />
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
                      {t('video.duration.seconds_short', { count: d })}
                    </button>
                  );
                })}
              </div>
              {s.targetDurationSec && s.targetDurationSec > 10 && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {t('video.create.segments_hint', { count: Math.ceil((s.targetDurationSec - 10) / 5) + 1 })}
                </p>
              )}
            </div>
          )}

          {/* Negative prompt */}
          {showNegativePrompt && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.negativePrompt.label')}
                <Hint text={t('video.negativePrompt.hint') as string} />
              </p>
              <textarea
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white"
                placeholder={t('video.negativePrompt.placeholder') as string}
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
                <Hint text={t('video.cfgScale.hint') as string} />
              </p>
              <input
                type="range" min={0} max={1} step={0.1}
                className="w-full accent-forest-600"
                value={s.cfgScale}
                onChange={e => setS({ ...s, cfgScale: parseFloat(e.target.value) })}
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>{t('video.cfgScale.loose')}</span>
                <span>{t('video.cfgScale.precise')}</span>
              </div>
            </div>
          )}

          {/* Camera presets */}
          {showCamera && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.cameraType.label')}
                <Hint text={t('video.cameraType.hint') as string} />
              </p>
              <select
                className={`${inputClass} appearance-none`}
                value={s.cameraType ?? ''}
                onChange={e => setS({ ...s, cameraType: e.target.value || undefined })}
              >
                <option value="">{t('video.cameraType.auto_option')}</option>
                <option value="simple">{t('video.cameraType.option_simple')}</option>
                <option value="down_back">{t('video.cameraType.option_down_back')}</option>
                <option value="forward_up">{t('video.cameraType.option_forward_up')}</option>
                <option value="right_turn_forward">{t('video.cameraType.option_right_turn')}</option>
                <option value="left_turn_forward">{t('video.cameraType.option_left_turn')}</option>
              </select>
            </div>
          )}

          {/* Image upload */}
          {showImageUpload && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.sourceImage.label')}
                <Hint text={t('video.sourceImage.hint') as string} />
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-forest-400 cursor-pointer transition-colors bg-white text-sm text-gray-500 hover:text-forest-600">
                  <span>{t('video.sourceImage.upload_file')}</span>
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
                  <span>{t('video.imagePicker.from_gallery_button')}</span>
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
                <Hint text={t('video.sourceVideo.hint') as string} />
              </p>
              <input
                className={inputClass}
                placeholder={t('video.sourceVideo.placeholder') as string}
                value={s.sourceVideoId ?? ''}
                onChange={e => setS({ ...s, sourceVideoId: e.target.value })}
              />
              {!s.sourceVideoId && (
                <p className="text-xs text-gray-400 mt-1">
                  {t('video.sourceVideo.tip')}
                </p>
              )}
            </div>
          )}

          {/* Audio upload */}
          {showAudio && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
                {t('video.audio.label')}
                <Hint text={t('video.audio.hint') as string} />
              </p>
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-forest-400 cursor-pointer transition-colors bg-white text-sm text-gray-500 hover:text-forest-600">
                <span>{t('video.audio.select_file')}</span>
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
              {s.audioUrl && <p className="text-xs text-green-600 mt-1">{t('video.audio.uploaded')}</p>}
            </div>
          )}
        </div>
      )}
      </>)}

      {/* Veo 3.1 panel */}
      {s.engine === 'veo' && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-4">
          <p className="text-[11px] text-gray-500 -mb-1">
            {t('video.veo.prompt_hint')}
          </p>

          {/* Поясняющий блок «что такое говорящая голова» (бэклог d6479951:
              термин не всем понятен — показываем схему вход→выход). */}
          <div className="rounded-lg border border-forest-200 bg-white p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">{t('video.veo.talking_head_title')}</p>
            <p className="text-[11px] text-gray-500 leading-snug mb-3">
              {t('video.veo.talking_head_desc')}
            </p>
            {/* Анимированная подсказка: шаги по очереди «подсвечиваются» (бегущая
                волна), на результате пульсирует play. */}
            <div className="flex items-center justify-center gap-2 sm:gap-3 text-center">
              <div className="flex flex-col items-center gap-1">
                <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-2xl animate-pulse [animation-duration:2.4s] [animation-delay:0ms]" aria-hidden="true">🖼️</div>
                <span className="text-[10px] text-gray-400 leading-tight">{t('video.veo.step_photos_top')}<br />{t('video.veo.step_photos_bottom')}</span>
              </div>
              <span className="text-gray-300 text-lg animate-pulse [animation-duration:2.4s] [animation-delay:300ms]" aria-hidden="true">→</span>
              <div className="flex flex-col items-center gap-1">
                <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-2xl animate-pulse [animation-duration:2.4s] [animation-delay:600ms]" aria-hidden="true">📝</div>
                <span className="text-[10px] text-gray-400 leading-tight">{t('video.veo.step_text_top')}<br />{t('video.veo.step_text_bottom')}</span>
              </div>
              <span className="text-gray-300 text-lg animate-pulse [animation-duration:2.4s] [animation-delay:900ms]" aria-hidden="true">→</span>
              <div className="flex flex-col items-center gap-1">
                <div className="w-16 h-16 rounded-lg bg-forest-50 border border-forest-200 flex items-center justify-center text-2xl relative animate-pulse [animation-duration:2.4s] [animation-delay:1200ms]" aria-hidden="true">
                  🗣️
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-forest-600 text-white text-[10px] flex items-center justify-center">
                    ▶
                    <span className="absolute inset-0 rounded-full bg-forest-500 opacity-60 animate-ping" />
                  </span>
                </div>
                <span className="text-[10px] text-forest-600 font-medium leading-tight">{t('video.veo.step_result_top')}<br />{t('video.veo.step_result_bottom')}</span>
              </div>
            </div>
          </div>

          {/* Talking-head preset */}
          <button
            type="button"
            onClick={() => setS(x => ({
              ...x,
              engine: 'veo', veoTier: 'fast', veoLengthSec: 24,
              prompt: x.prompt || t('video.veo.preset_talking_head_prompt'),
            }))}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-forest-300 bg-forest-50 text-forest-700 hover:bg-forest-100 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" /> {t('video.veo.preset_talking_head_button')}
          </button>

          {/* Озвучить моим голосом (96cba3f7) */}
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                <Mic className="w-4 h-4 text-forest-600" /> {t('video.veo.own_voice_label')}
                <Hint text={t('video.veo.own_voice_hint') as string} />
              </span>
              <input
                type="checkbox"
                checked={!!s.useOwnVoice}
                onChange={(e) => setS(x => ({ ...x, useOwnVoice: e.target.checked }))}
              />
            </label>
            {s.useOwnVoice && (
              <div className="mt-2 space-y-1">
                <VoiceSamplePanel
                  status={voice.status}
                  hasVoice={voice.hasVoice}
                  descriptor={voice.descriptor}
                  error={voice.error}
                  onUpload={voice.uploadSample}
                  onDelete={voice.deleteVoice}
                />
                <p className="text-[11px] text-gray-400">
                  {t('video.veo.own_voice_surcharge', { amount: ownVoiceSurcharge(s.veoLengthSec ?? 24).toLocaleString('ru') })}
                </p>
              </div>
            )}
          </div>

          {/* Tier */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center">
              {t('video.quality.label')}
              <Hint text={t('video.veo.tier_hint') as string} />
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
              {t('video.veo.aspect_label')}
              <Hint text={t('video.veo.aspect_hint') as string} />
            </p>
            <div className="flex gap-2">
              {([['9:16', t('video.veo.aspect_vertical')], ['16:9', t('video.veo.aspect_horizontal')]] as const).map(([val, label]) => (
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
              {t('video.veo.resolution_label')}
              <Hint text={t('video.veo.resolution_hint') as string} />
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
              {t('video.duration.label')}
              <Hint text={t('video.veo.length_hint') as string} />
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
                  {t('video.duration.seconds_short', { count: len })}
                </button>
              ))}
            </div>
            {(s.veoAspectRatio ?? '9:16') === '9:16' && (s.veoLengthSec ?? 24) > 8 && (
              <p className="mt-2 text-xs text-gray-500">
                {t('video.veo.vertical_segments_hint', { sec: s.veoLengthSec ?? 24, count: Math.ceil((s.veoLengthSec ?? 24) / 8) })}
              </p>
            )}
          </div>

          {/* Portrait (optional) */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1 flex items-center">
              {t('video.veo.portrait_photos_label')}
              <Hint text={t('video.veo.portrait_photos_hint') as string} />
            </p>
            <p className="text-[11px] text-forest-600 mb-2">
              <Trans i18nKey="video.veo.portrait_photos_recommend">
                💡 Рекомендуем загрузить <b>3 фотографии</b> (разные ракурсы) — так сходство лица заметно лучше.
              </Trans>
            </p>
            {(s.sourceImageUrls?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {(s.sourceImageUrls ?? []).map((u) => (
                  <div key={u} className="relative">
                    <img src={u} alt="ref" className="h-24 w-20 rounded-lg object-cover border border-gray-200" />
                    <button
                      type="button"
                      onClick={() => setS(x => ({ ...x, sourceImageUrls: (x.sourceImageUrls ?? []).filter(v => v !== u) }))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-red-500 text-xs leading-none"
                      aria-label="remove"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            {(s.sourceImageUrls?.length ?? 0) < 3 && (
              <div className="flex flex-col sm:flex-row gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-forest-400 cursor-pointer transition-colors bg-white text-sm text-gray-500 hover:text-forest-600">
                  <span>{t('video.veo.add_photo_button', { count: s.sourceImageUrls?.length ?? 0 })}</span>
                  <input
                    type="file" accept="image/*" multiple className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (!files.length) return;
                      const slots = 3 - (s.sourceImageUrls?.length ?? 0);
                      try {
                        const urls: string[] = [];
                        for (const f of files.slice(0, slots)) urls.push(await uploadFile('image', f));
                        setS(x => ({ ...x, sourceImageUrls: [...(x.sourceImageUrls ?? []), ...urls].slice(0, 3) }));
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
                  <span>{t('video.imagePicker.from_gallery_button')}</span>
                </button>
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
          {t('video.insufficientTokens.message', { cost: formatNumber(cost), balance: formatNumber(balance) })}{' '}
          <a href="/chat?view=tokens" className="underline font-medium">{t('video.insufficientTokens.cta')}</a>
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
            <span>{t('video.create.submitting')}</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span>{t('video.submit.create')}</span>
            <span className="text-xs opacity-70 ml-1">{t('video.create.cost_suffix', { cost: formatNumber(cost) })}</span>
          </>
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">{t('video.create.generation_time_hint')}</p>

      {/* Image picker modal */}
      {showImagePicker && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowImagePicker(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full p-5 shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-forest-600" />
                <h3 className="text-base font-semibold text-gray-900">{t('video.imagePicker.title')}</h3>
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
                <p className="text-sm text-gray-500">{t('video.imagePicker.empty')}</p>
                <a href="/imagegen" className="mt-3 text-sm text-forest-600 hover:text-forest-700 underline">{t('video.imagePicker.go_to_generator')}</a>
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
                          const url = toAbsoluteUrl(it.image_url);
                          setS(x => x.engine === 'veo'
                            ? { ...x, sourceImageUrls: [...(x.sourceImageUrls ?? []), url].slice(0, 3) }
                            : { ...x, sourceImageUrl: url });
                          setShowImagePicker(false);
                        }}
                        className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-forest-400 hover:ring-2 hover:ring-forest-200 transition-all bg-gray-50"
                        title={cleanPrompt}
                      >
                        <img src={it.image_url} className="w-full h-full object-cover" loading="lazy" alt="" />
                        <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent text-[10px] text-white line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {cleanPrompt || t('video.imagePicker.no_description')}
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
