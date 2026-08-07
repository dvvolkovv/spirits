// src/components/settings/VoiceSettings.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { resolveLanguage } from '../../i18n/languages';
import { nextVoiceSelection, type VoiceSelection } from './voiceSelection';

interface Voice {
  id: string;
  provider: string;
  gender: 'm' | 'f';
  /** Имя голоса и описание тембра приходят с бэкенда — это данные, не UI-строки. */
  title: string;
  description: string;
  /** Готовая ссылка на превью в MinIO: фронт её не собирает, MINIO_PUBLIC_URL ему неизвестен. */
  sampleUrl: string;
}

interface Assistant {
  id: number | string;
  name: string;
  displayName?: string;
}

const VoiceSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selection, setSelection] = useState<VoiceSelection>({});
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Один общий элемент на всю секцию: без него нажатие на второе превью
  // не глушило бы первое, и голоса заиграли бы хором.
  const previewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // apiClient отдаёт сырой Response (см. smm-api.ts), а не распарсенный
        // объект: нужны .ok + .json(), никаких res.data.
        // Каталог голосов уже отфильтрован бэкендом по языку профиля —
        // параметра lang у /webhook/speech/voices нет и быть не должно.
        const [vRes, aRes, pRes] = await Promise.all([
          apiClient.get('/webhook/speech/voices'),
          apiClient.get(`/webhook/agents?lang=${resolveLanguage(i18n.language)}`),
          apiClient.get('/webhook/profile'),
        ]);

        if (!vRes.ok) throw new Error(`speech/voices: ${vRes.status}`);
        const vData = await vRes.json();
        const list: Voice[] = Array.isArray(vData?.voices) ? vData.voices : [];

        const agentList: Assistant[] = aRes.ok ? await aRes.json() : [];

        // GET /webhook/profile отдаёт массив из одной записи с profileJson
        // внутри (profile.service.ts). assistant_voices лежит и в сыром
        // profile_data, и в разложенных полях — берём то, что нашлось.
        let picked: VoiceSelection = {};
        if (pRes.ok) {
          const pData = await pRes.json();
          const record = Array.isArray(pData) ? pData[0] : pData;
          const json = record?.profileJson || record || {};
          const raw = json?.profile_data?.assistant_voices ?? json?.assistant_voices;
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) picked = raw;
        }

        if (cancelled) return;
        setVoices(list);
        setAssistants(Array.isArray(agentList) ? agentList : []);
        setSelection(picked);
        setAvailable(list.length > 0);
      } catch {
        // Модуль озвучки может быть не раскатан — тогда секцию просто не показываем,
        // вместо пустого селекта без единого голоса.
        if (!cancelled) setAvailable(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  // Уход со страницы не должен оставлять играющий сэмпл.
  useEffect(() => () => previewRef.current?.pause(), []);

  const play = (voiceId?: string) => {
    const entry = voices.find((v) => v.id === voiceId);
    if (!entry?.sampleUrl) return;
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current.currentTime = 0;
    }
    const audio = new Audio(entry.sampleUrl);
    previewRef.current = audio;
    void audio.play().catch(() => {/* автоплей мог быть заблокирован — молча */});
  };

  const change = async (assistantName: string, voiceId: string) => {
    const prev = selection;
    const next = nextVoiceSelection(prev, assistantName, voiceId);
    setSelection(next);
    setSaving(true);
    setError(null);
    try {
      // profile-update — POST, не PUT: в бэкенде это @Post('profile-update').
      const res = await apiClient.post('/webhook/profile-update', { assistant_voices: next });
      if (!res.ok) throw new Error(`profile-update: ${res.status}`);
      if (voiceId) play(voiceId);
    } catch {
      setSelection(prev);
      setError(t('settings.voices.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="bg-white rounded-lg shadow-sm h-32 animate-pulse" aria-hidden="true" />;
  }

  if (!available || assistants.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Volume2 className="w-5 h-5 mr-2 text-forest-600" />
          {t('settings.voices.title')}
        </h2>
      </div>
      <div className="p-6 space-y-3">
        <p className="text-sm text-gray-600">{t('settings.voices.desc')}</p>

        {assistants.map((a) => {
          const chosen = selection[a.name] ?? '';
          return (
            <div key={String(a.id)} className="flex items-center gap-3">
              <span className="w-28 md:w-40 shrink-0 text-sm text-gray-900 truncate">
                {a.displayName || a.name}
              </span>
              <select
                value={chosen}
                onChange={(e) => change(a.name, e.target.value)}
                disabled={saving}
                aria-label={t('settings.voices.select_label', { assistant: a.displayName || a.name })}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-transparent disabled:opacity-60"
              >
                <option value="">{t('settings.voices.default')}</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} — {v.description}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => play(chosen)}
                disabled={!chosen}
                aria-label={t('settings.voices.preview')}
                title={t('settings.voices.preview')}
                className="w-9 h-9 shrink-0 rounded-full text-forest-700 hover:bg-forest-50 flex items-center justify-center disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
};

export default VoiceSettings;
