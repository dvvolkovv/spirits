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
    key: 'veo_talkinghead',
    label: 'Говорящая голова',
    engine: 'veo',
    aspect: '9:16',
    videoUrl: 'https://my.linkeon.io/static/videos/ca424799-ad2b-4eb0-8927-98962df1073a.mp4',
    prompt: 'Вертикальное видео 9:16, говорящая голова: дружелюбный эксперт 30–40 лет смотрит прямо в камеру и говорит на русском с естественной синхронизацией губ: «Привет! Сегодня расскажу, как…». Мягкий студийный свет, тёплый фон с лёгким боке, спокойная уверенная подача, фотореалистично, чистый голос без фоновой музыки.',
  },
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
      <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-forest-600" />
        Примеры — наведи посмотреть, нажми «Взять промпт»
      </p>
      {/* Единая ВЫСОТА видео-бокса, ширина = по реальному соотношению сторон —
          поэтому ряд выровнен (раньше карточки были одной ширины, но разной
          высоты: 9:16 — высокая, 16:9 — низкие → «криво»). object-cover без
          обрезки, т.к. бокс совпадает с aspect видео. */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 items-start">
        {VIDEO_EXAMPLES.map((ex) => (
          <div
            key={ex.key}
            className="flex-shrink-0 rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-forest-300 transition-colors flex flex-col"
          >
            <div
              className="h-48 bg-black relative"
              style={{ aspectRatio: ex.aspect === '9:16' ? '9 / 16' : '16 / 9' }}
            >
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
              <span className="absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-black/55 text-white backdrop-blur-sm">
                {ex.engine}
              </span>
            </div>
            <div className="p-2 flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-800 truncate">{ex.label}</span>
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
