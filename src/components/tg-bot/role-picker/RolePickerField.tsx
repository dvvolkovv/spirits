import React, { useEffect, useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { apiClient } from '../../../services/apiClient';
import { customAgentsApi, type CustomAgent } from '../../../services/customAgentsApi';

interface Preset {
  id: string;
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

  useEffect(() => {
    apiClient.get('/webhook/agents')
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(setPresets)
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
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left ${selected ? 'border-forest-600 bg-forest-50' : 'border-gray-200 hover:border-forest-300'}`}
                >
                  <Sparkles size={18} className="text-forest-600 shrink-0" />
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
            const selected = value?.type === 'preset' && value.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ type: 'preset', id: String(p.id) })}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left ${selected ? 'border-forest-600 bg-forest-50' : 'border-gray-200 hover:border-forest-300'}`}
              >
                <Bot size={18} className="text-gray-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.displayName || p.name}</div>
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
