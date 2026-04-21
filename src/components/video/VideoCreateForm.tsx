// src/components/video/VideoCreateForm.tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  'text2video.kling-v1-6.std.5': 25000,   'text2video.kling-v1-6.std.10': 50000,
  'text2video.kling-v1-6.pro.5': 50000,   'text2video.kling-v1-6.pro.10': 100000,
  'text2video.kling-v2-master.std.5': 150000, 'text2video.kling-v2-master.std.10': 300000,
  'text2video.kling-v2-master.pro.5': 150000, 'text2video.kling-v2-master.pro.10': 300000,
  'image2video.kling-v1-6.std.5': 25000,  'image2video.kling-v1-6.std.10': 50000,
  'image2video.kling-v1-6.pro.5': 50000,  'image2video.kling-v1-6.pro.10': 100000,
  'image2video.kling-v2-master.std.5': 150000, 'image2video.kling-v2-master.std.10': 300000,
  'image2video.kling-v2-master.pro.5': 150000, 'image2video.kling-v2-master.pro.10': 300000,
  'extend.kling-v1-6.std.5': 25000, 'extend.kling-v1-6.pro.5': 50000,
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
  // apiClient.post handles JSON by default; for multipart we pass FormData — fetch picks the right boundary.
  const resp = await apiClient.post(`/webhook/video/upload-${kind}`, fd);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error ?? 'upload failed');
  return data.url as string;
}

export default function VideoCreateForm({ onCreated, defaults }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const balance = user?.tokens ?? 0;

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

  // Guardrails: lipsync requires v1-6, extend is fixed at 5s — normalize in an effect (avoid setState-during-render).
  useEffect(() => {
    if (s.mode === 'lipsync' && s.model !== 'kling-v1-6') {
      setS((x) => ({ ...x, model: 'kling-v1-6' }));
    }
    if (s.mode === 'extend' && s.duration !== 5) {
      setS((x) => ({ ...x, duration: 5 }));
    }
  }, [s.mode, s.model, s.duration]);

  const insufficient = balance < cost;

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const body: any = {
        mode: s.mode,
        model: s.model,
        quality: s.quality,
        duration: s.duration,
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

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      {/* Mode */}
      <div>
        <label className="text-sm font-medium">{t('video.mode.label')}</label>
        <select
          className="block w-full mt-1 rounded-md border px-2 py-1.5"
          value={s.mode}
          onChange={(e) => setS({ ...s, mode: e.target.value as Mode })}
        >
          <option value="text2video">{t('video.mode.text2video')}</option>
          <option value="image2video">{t('video.mode.image2video')}</option>
          <option value="extend">{t('video.mode.extend')}</option>
          <option value="lipsync">{t('video.mode.lipsync')}</option>
        </select>
      </div>

      {/* Model */}
      {s.mode !== 'lipsync' && (
        <div>
          <label className="text-sm font-medium">{t('video.model.label')}</label>
          <select
            className="block w-full mt-1 rounded-md border px-2 py-1.5"
            value={s.model}
            onChange={(e) => setS({ ...s, model: e.target.value as Model })}
          >
            <option value="kling-v1-6">{t('video.model.standard')}</option>
            <option value="kling-v2-master">{t('video.model.premium')}</option>
          </select>
        </div>
      )}

      {/* Quality */}
      {s.mode !== 'lipsync' && (
        <div>
          <label className="text-sm font-medium">{t('video.quality.label')}</label>
          <select
            className="block w-full mt-1 rounded-md border px-2 py-1.5"
            value={s.quality}
            onChange={(e) => setS({ ...s, quality: e.target.value as Quality })}
          >
            <option value="std">{t('video.quality.std')}</option>
            <option value="pro">{t('video.quality.pro')}</option>
          </select>
        </div>
      )}

      {/* Duration */}
      {showDuration && (
        <div>
          <label className="text-sm font-medium">{t('video.duration.label')}</label>
          <select
            className="block w-full mt-1 rounded-md border px-2 py-1.5"
            value={s.duration}
            onChange={(e) => setS({ ...s, duration: Number(e.target.value) as 5 | 10 })}
          >
            <option value={5}>{t('video.duration.5s')}</option>
            <option value={10}>{t('video.duration.10s')}</option>
          </select>
        </div>
      )}

      {/* Prompt */}
      {showPrompt && (
        <div>
          <label className="text-sm font-medium">{t('video.prompt.label')}</label>
          <textarea
            rows={3}
            className="block w-full mt-1 rounded-md border px-2 py-1.5"
            placeholder={t('video.prompt.placeholder') as string}
            value={s.prompt}
            onChange={(e) => setS({ ...s, prompt: e.target.value })}
          />
        </div>
      )}

      {/* Negative prompt */}
      {showNegativePrompt && (
        <div>
          <label className="text-sm font-medium">{t('video.negativePrompt.label')}</label>
          <input
            className="block w-full mt-1 rounded-md border px-2 py-1.5"
            value={s.negativePrompt}
            onChange={(e) => setS({ ...s, negativePrompt: e.target.value })}
          />
        </div>
      )}

      {/* CFG */}
      {showCfg && (
        <div>
          <label className="text-sm font-medium">
            {t('video.cfgScale.label')}: {s.cfgScale.toFixed(1)}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            className="block w-full mt-1"
            value={s.cfgScale}
            onChange={(e) => setS({ ...s, cfgScale: parseFloat(e.target.value) })}
          />
        </div>
      )}

      {/* Image upload */}
      {showImageUpload && (
        <div>
          <label className="text-sm font-medium">{t('video.sourceImage.label')}</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const url = await uploadFile('image', f);
                setS((x) => ({ ...x, sourceImageUrl: url }));
              } catch (err: any) {
                setError(err?.message ?? 'image upload failed');
              }
            }}
          />
          {s.sourceImageUrl && (
            <img src={s.sourceImageUrl} alt="" className="mt-2 max-h-40 rounded" />
          )}
        </div>
      )}

      {/* Source video picker */}
      {showSourceVideo && (
        <div>
          <label className="text-sm font-medium">{t('video.sourceVideo.label')}</label>
          <input
            className="block w-full mt-1 rounded-md border px-2 py-1.5"
            placeholder="jobId of a ready video"
            value={s.sourceVideoId ?? ''}
            onChange={(e) => setS({ ...s, sourceVideoId: e.target.value })}
          />
        </div>
      )}

      {/* Audio upload */}
      {showAudio && (
        <div>
          <label className="text-sm font-medium">{t('video.audio.label')}</label>
          <input
            type="file"
            accept="audio/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const url = await uploadFile('audio', f);
                setS((x) => ({ ...x, audioUrl: url }));
              } catch (err: any) {
                setError(err?.message ?? 'audio upload failed');
              }
            }}
          />
        </div>
      )}

      {/* Camera presets */}
      {showCamera && (
        <div>
          <label className="text-sm font-medium">{t('video.cameraType.label')}</label>
          <select
            className="block w-full mt-1 rounded-md border px-2 py-1.5"
            value={s.cameraType ?? ''}
            onChange={(e) => setS({ ...s, cameraType: e.target.value || undefined })}
          >
            <option value="">—</option>
            <option value="simple">simple</option>
            <option value="down_back">down_back</option>
            <option value="forward_up">forward_up</option>
            <option value="right_turn_forward">right_turn_forward</option>
            <option value="left_turn_forward">left_turn_forward</option>
          </select>
        </div>
      )}

      {/* Cost + submit */}
      <div className="rounded-md border p-3 bg-gray-50 flex items-center justify-between">
        <div className="text-sm">
          {t('video.submit.cost', { tokens: cost.toLocaleString() })}
          <br />
          <span className="text-gray-500">Баланс: {balance.toLocaleString()}</span>
        </div>
        <button
          type="button"
          disabled={submitting || insufficient || (s.mode === 'image2video' && !s.sourceImageUrl)}
          onClick={onSubmit}
          className="px-4 py-2 rounded-md bg-green-600 text-white disabled:opacity-50"
        >
          {t('video.submit.create')}
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {insufficient && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 flex items-center justify-between">
          <div>{t('video.insufficientTokens.title')}</div>
          <a
            href="/chat?view=tokens"
            className="px-3 py-1.5 rounded bg-yellow-500 text-white"
          >
            {t('video.insufficientTokens.cta')}
          </a>
        </div>
      )}
    </div>
  );
}
