import React from 'react';
import { useTranslation } from 'react-i18next';
import { PremiumGenre } from './smm-api';
import { Sparkles, User, Film } from 'lucide-react';

interface Props {
  selected: PremiumGenre | null;          // null = классика
  onChange: (g: PremiumGenre | null) => void;
  disabled?: boolean;
}

export function PremiumGenreTabs({ selected, onChange, disabled }: Props) {
  const { t } = useTranslation();

  const GENRES: Array<{ id: PremiumGenre; label: string; subtitle: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'surreal',   label: 'Surreal',   subtitle: t('studio.genre_surreal_subtitle'),  Icon: Sparkles },
    { id: 'pov',       label: 'POV',       subtitle: t('studio.genre_pov_subtitle'),   Icon: User },
    { id: 'cinematic', label: 'Cinematic', subtitle: t('studio.genre_cinematic_subtitle'),           Icon: Film },
  ];

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <button
        type="button"
        className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
          selected === null
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
        }`}
        onClick={() => onChange(null)}
        disabled={disabled}
      >
        {t('studio.genre_classic')}
      </button>
      {GENRES.map(({ id, label, subtitle, Icon }) => (
        <button
          key={id}
          type="button"
          title={subtitle}
          className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition flex items-center gap-1.5 ${
            selected === id
              ? 'bg-purple-600 text-white'
              : 'bg-purple-50 hover:bg-purple-100 text-purple-700'
          }`}
          onClick={() => onChange(id)}
          disabled={disabled}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
