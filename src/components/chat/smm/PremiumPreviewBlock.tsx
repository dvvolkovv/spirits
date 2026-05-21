import React from 'react';
import { PremiumPreview, PremiumGenre } from './smm-api';
import { Film, Clock, Coins, Loader2 } from 'lucide-react';

interface Props {
  genre: PremiumGenre;
  preview: PremiumPreview;
  onGenerate: () => void;
  generating: boolean;
}

const GENRE_LABELS: Record<PremiumGenre, string> = {
  surreal: 'Surreal',
  pov: 'POV',
  cinematic: 'Cinematic',
};

export function PremiumPreviewBlock({ genre, preview, onGenerate, generating }: Props) {
  return (
    <div className="mt-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
      <div className="flex items-center gap-2 mb-3">
        <Film className="w-5 h-5 text-purple-600" />
        <h4 className="font-semibold text-purple-900">{GENRE_LABELS[genre]}</h4>
      </div>
      <div className="text-sm text-gray-700 mb-3">
        <div className="font-medium mb-1.5">Юля придумывает:</div>
        {preview.scenes.map((s, i) => (
          <div key={i} className="ml-2 mt-1 leading-snug">
            <span className="text-purple-600 font-medium">{i + 1}.</span> «{s.motion_prompt}»
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600 mb-3">
        <span className="flex items-center gap-1">
          <Film className="w-3.5 h-3.5" /> {preview.scenes.length} kling-кадра
        </span>
        <span className="flex items-center gap-1">
          <Coins className="w-3.5 h-3.5" /> {preview.tokensCost.toLocaleString('ru-RU')} токенов
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> ~{preview.estimatedMinutes} мин
        </span>
      </div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {generating && <Loader2 className="w-4 h-4 animate-spin" />}
        {generating ? 'Юля работает…' : 'Сгенерировать'}
      </button>
    </div>
  );
}
