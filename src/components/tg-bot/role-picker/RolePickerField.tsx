import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { apiClient } from '../../../services/apiClient';
import { customAgentsApi, type CustomAgent } from '../../../services/customAgentsApi';
import { avatarService } from '../../../services/avatarService';

interface Preset {
  id: number | string;
  name: string;
  displayName?: string;
  description?: string | null;
  category?: string | null;
}

interface Props {
  value: { type: 'preset' | 'custom'; id: string } | null;
  onChange: (v: { type: 'preset' | 'custom'; id: string }) => void;
}

export const RolePickerField: React.FC<Props> = ({ value, onChange }) => {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [customs, setCustoms] = useState<CustomAgent[]>([]);
  const [presetAvatars, setPresetAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    apiClient.get('/webhook/agents')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((list: Preset[]) => {
        setPresets(list);
        // Параллельно подгружаем аватары — кеш в avatarService предотвратит дубли.
        Promise.all(
          list.map(async p => {
            try {
              const url = await avatarService.getAvatarUrl(Number(p.id));
              return [String(p.id), url] as const;
            } catch {
              return null;
            }
          }),
        ).then(pairs => {
          const map: Record<string, string> = {};
          for (const pair of pairs) {
            if (pair) map[pair[0]] = pair[1];
          }
          setPresetAvatars(map);
        });
      })
      .catch(() => {});
    customAgentsApi.list().then(setCustoms).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      {customs.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Мои</div>
          <div className="grid grid-cols-1 gap-2">
            {customs.map(c => {
              const selected = value?.type === 'custom' && value.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onChange({ type: 'custom', id: String(c.id) })}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${selected ? 'border-forest-600 bg-forest-50' : 'border-gray-200 hover:border-forest-300'}`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-forest-600 to-forest-800 flex items-center justify-center shrink-0 shadow-sm">
                    <Sparkles size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    {c.description && <div className="text-xs text-gray-600 truncate">{c.description}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Пресеты Linkeon</div>
        <div className="grid grid-cols-1 gap-2">
          {presets.map(p => {
            const idStr = String(p.id);
            const selected = value?.type === 'preset' && value.id === idStr;
            const avatarUrl = presetAvatars[idStr];
            const name = p.displayName || p.name;
            const initial = (name || '?').trim().charAt(0).toUpperCase();
            return (
              <button
                key={idStr}
                type="button"
                onClick={() => onChange({ type: 'preset', id: idStr })}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${selected ? 'border-forest-600 bg-forest-50' : 'border-gray-200 hover:border-forest-300'}`}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-gray-200"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-forest-500 to-forest-700 flex items-center justify-center shrink-0 text-white text-sm font-semibold">
                    {initial}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{name}</div>
                  {p.description && <div className="text-xs text-gray-600 truncate">{p.description}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
