import React, { useState } from 'react';
import { Mic, Loader, CheckCircle2, AlertTriangle, Trash2, Upload } from 'lucide-react';
import type { VoiceState, VoiceDescriptor } from './useVoiceProfile';

// Панель загрузки сэмпла голоса + consent + статус клона (96cba3f7).
// Презентационная: всё состояние/запросы — в useVoiceProfile у родителя.
interface Props {
  status: VoiceState;
  hasVoice: boolean;
  descriptor?: VoiceDescriptor;
  error: string | null;
  onUpload: (file: File, consent: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}

const VoiceSamplePanel: React.FC<Props> = ({ status, hasVoice, descriptor, error, onUpload, onDelete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const submit = async () => {
    if (!file || !consent) return;
    setBusy(true); setLocalErr(null);
    try { await onUpload(file, consent); setFile(null); }
    catch (e: any) { setLocalErr(e?.message ?? 'Не удалось загрузить'); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setLocalErr(null);
    try { await onDelete(); setConsent(false); }
    catch (e: any) { setLocalErr(e?.message ?? 'Не удалось удалить'); }
    finally { setBusy(false); }
  };

  // Готовый клон — показываем статус + краткий дескриптор + удалить/заменить.
  if (hasVoice && status === 'ready') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-green-700 font-medium">
            <CheckCircle2 className="w-4 h-4" /> Голос готов
          </span>
          <button onClick={remove} disabled={busy} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 disabled:opacity-50">
            {busy ? <Loader className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Заменить
          </button>
        </div>
        {descriptor && (
          <p className="text-xs text-gray-500 mt-1">
            {[descriptor.gender, descriptor.approx_age_range, descriptor.pitch_register,
              Array.isArray(descriptor.timbre) ? descriptor.timbre.join(', ') : descriptor.timbre]
              .filter(Boolean).join(' · ')}
          </p>
        )}
        {localErr && <p className="text-xs text-red-600 mt-1">{localErr}</p>}
      </div>
    );
  }

  // Идёт клонирование.
  if (status === 'pending') {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm flex items-center gap-2 text-gray-600">
        <Loader className="w-4 h-4 animate-spin text-forest-600" />
        Анализируем и клонируем голос… (обычно меньше минуты)
      </div>
    );
  }

  // Нет голоса / ошибка → форма загрузки.
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm space-y-2">
      <div className="flex items-center gap-1.5 text-gray-700 font-medium">
        <Mic className="w-4 h-4 text-forest-600" /> Загрузите образец своего голоса
      </div>
      <p className="text-xs text-gray-500">
        ≥60 секунд, моно, без музыки и шума, разные интонации. Чем чище запись — тем точнее клон.
      </p>
      <input
        type="file"
        accept="audio/*,.flac,.wav,.mp3,.m4a,.ogg,.webm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-forest-50 file:text-forest-700 hover:file:bg-forest-100"
      />
      <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>Это мой голос, и я согласен(на) на его синтез для озвучки моих видео.</span>
      </label>
      {(localErr || (status === 'failed' && error)) && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="w-3.5 h-3.5" /> {localErr || error}
        </div>
      )}
      <button
        onClick={submit}
        disabled={!file || !consent || busy}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors text-sm disabled:opacity-50"
      >
        {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Загрузить голос
      </button>
    </div>
  );
};

export default VoiceSamplePanel;
