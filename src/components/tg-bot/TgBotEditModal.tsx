import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { tgBotApi, type TgBotConfig, type AddressingMode, type VoiceReplyMode } from '../../services/tgBotApi';
import { RolePickerField } from './role-picker/RolePickerField';

interface Props {
  config: TgBotConfig;
  onClose: () => void;
  onSaved: () => void;
}

export const TgBotEditModal: React.FC<Props> = ({ config, onClose, onSaved }) => {
  const [displayName, setDisplayName] = useState(config.displayName);
  const [role, setRole] = useState<{ type: 'preset' | 'custom'; id: string } | null>(
    config.customAgentId
      ? { type: 'custom', id: config.customAgentId }
      : config.presetAgentId
      ? { type: 'preset', id: config.presetAgentId }
      : null
  );
  const [addressingMode, setAddressingMode] = useState<AddressingMode>(config.addressingMode);
  const [voiceReplyMode, setVoiceReplyMode] = useState<VoiceReplyMode>(config.voiceReplyMode);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!displayName.trim() || !role) {
      toast.error('Заполни имя и роль');
      return;
    }
    setSaving(true);
    try {
      await tgBotApi.update(config.id, {
        displayName: displayName.trim(),
        presetAgentId: role.type === 'preset' ? role.id : undefined,
        customAgentId: role.type === 'custom' ? role.id : undefined,
        addressingMode,
        voiceReplyMode,
      });
      toast.success('Сохранено');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? 'Не удалось сохранить');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-[60] md:p-4 pb-[env(safe-area-inset-bottom)] md:pb-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-2xl w-full h-[85dvh] md:h-auto md:max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Редактировать бота</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Имя в группе</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              maxLength={80}
            />
          </label>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Роль</h3>
            <RolePickerField value={role} onChange={setRole} />
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Когда отвечает</h3>
            {([
              ['strict', 'По обращению'],
              ['smart', 'Умно'],
              ['always', 'Всегда'],
            ] as const).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 py-1.5 cursor-pointer">
                <input type="radio" name="addr-edit" checked={addressingMode === val} onChange={() => setAddressingMode(val)} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Голос</h3>
            {([
              ['never', 'Никогда'],
              ['mirror', 'Зеркально'],
              ['always', 'Всегда'],
            ] as const).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 py-1.5 cursor-pointer">
                <input type="radio" name="voice-edit" checked={voiceReplyMode === val} onChange={() => setVoiceReplyMode(val)} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="bg-white border-t border-gray-200 px-5 py-4 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50"
          >
            {saving ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
};
