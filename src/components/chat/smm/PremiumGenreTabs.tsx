import React from 'react';
import { PremiumGenre } from './smm-api';
import { useAuth } from '../../../contexts/AuthContext';
import { Sparkles, User, Film } from 'lucide-react';

interface Props {
  selected: PremiumGenre | null;          // null = классика
  onChange: (g: PremiumGenre | null) => void;
  disabled?: boolean;
}

const GENRES: Array<{ id: PremiumGenre; label: string; subtitle: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'surreal',   label: 'Surreal',   subtitle: 'Невозможные кадры',  Icon: Sparkles },
  { id: 'pov',       label: 'POV',       subtitle: 'От лица предмета',   Icon: User },
  { id: 'cinematic', label: 'Cinematic', subtitle: 'Киноязык',           Icon: Film },
];

export function PremiumGenreTabs({ selected, onChange, disabled }: Props) {
  const { user } = useAuth();
  // Phase 1 — admin only
  if (!user?.isAdmin) return null;

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
        Классика
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
