import { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';

// Готовые примеры видео — показываем РЕЗУЛЬТАТ генерации (а не только текст
// промпта), чтобы вдохновить пользователя и показать качество Veo/Kling.
// Видео отрисованы заранее и лежат в /static/videos. Кнопка «Взять промпт»
// подставляет промпт и движок в форму. (бэклог aa630688)

export interface VideoExample {
  key: string;
  label: string;
  engine: 'veo' | 'kling';
  aspect: '9:16' | '16:9';
  videoUrl: string;
  prompt: string;
}

export const VIDEO_EXAMPLES: VideoExample[] = [
  {
    key: 'veo_nature',
    label: 'Горы на рассвете',
    engine: 'veo',
    aspect: '9:16',
    videoUrl: 'https://my.linkeon.io/static/videos/d7a37660-4fc9-4dcb-91ec-9cd85037d87c.mp4',
    prompt: 'Пролёт дрона над туманными зелёными горами на рассвете, золотой свет пробивается сквозь облака, внизу извивается река, плавное движение камеры, кинематографично, фотореалистично',
  },
  {
    key: 'veo_coffee',
    label: 'Кофе у окна',
    engine: 'veo',
    aspect: '16:9',
    videoUrl: 'https://my.linkeon.io/static/videos/f9008e01-a565-4684-9f55-7144c24fd8d0.mp4',
    prompt: 'Дымящаяся чашка кофе на деревянном столе у окна с дождём в уютном кафе, тёплый мягкий свет, малая глубина резкости, поднимается пар, спокойная атмосфера, фотореалистично',
  },
  {
    key: 'kling_horse',
    label: 'Лошадь на пляже',
    engine: 'kling',
    aspect: '16:9',
    videoUrl: 'https://my.linkeon.io/smm-media/linkeon-smm-videos/videos/3eff4ad6-5d6d-42ff-8d8d-e07424309d7b.mp4',
    prompt: 'Белая лошадь скачет по пляжу на закате, брызги воды в замедленной съёмке, драматичный золотой свет, кинематографично, динамичная камера',
  },
];

interface Props {
  onUse: (ex: VideoExample) => void;
}

export default function VideoExamples({ onUse }: Props) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div>
      <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        Примеры — что можно сгенерировать
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {VIDEO_EXAMPLES.map((ex) => (
          <div
            key={ex.key}
            className="flex-shrink-0 w-40 rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-forest-300 transition-colors"
          >
            <div className={ex.aspect === '9:16' ? 'aspect-[9/16] bg-black' : 'aspect-video bg-black'}>
              <video
                src={ex.videoUrl}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                preload="metadata"
                controls={active === ex.key}
                onMouseEnter={(e) => { (e.currentTarget as HTMLVideoElement).play().catch(() => {}); }}
                onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); }}
                onClick={() => setActive(ex.key)}
              />
            </div>
            <div className="p-2">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-xs font-medium text-gray-800 truncate">{ex.label}</span>
                <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 flex-shrink-0">
                  {ex.engine}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onUse(ex)}
                className="w-full flex items-center justify-center gap-1 text-xs font-medium text-forest-700 border border-forest-200 rounded-lg py-1 hover:bg-forest-50 transition-colors"
              >
                <Wand2 className="w-3 h-3" /> Взять промпт
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
