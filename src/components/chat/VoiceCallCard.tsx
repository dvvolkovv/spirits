import { useState } from 'react';
import { Phone, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

interface VoiceCallDetails {
  duration_sec: number | null;
  status: string;
  transcript: { role: 'user' | 'assistant'; text: string; ts: number }[] | null;
  /** Списано за разговор. Считает бэкенд — курс живёт там и меняется. */
  tokens_charged?: number | null;
}

/**
 * Карточка состоявшегося звонка в ленте чата. Резюме приходит вместе с
 * сообщением, а транскрипт тянем по требованию: он бывает на сотни реплик и
 * в ленте не нужен, пока его не развернули.
 */
export default function VoiceCallCard({ callId }: { callId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<VoiceCallDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (details || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await apiClient.get(`/webhook/voice-call/${callId}`);
      if (!res.ok) throw new Error(String(res.status));
      setDetails(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const minutes =
    details?.duration_sec != null ? Math.max(1, Math.round(details.duration_sec / 60)) : null;
  // Разряды пробелами, как в остальной ленте.
  const tokens =
    details?.tokens_charged != null && details.tokens_charged > 0
      ? details.tokens_charged.toLocaleString('ru-RU').replace(/\u00A0/g, ' ')
      : null;

  return (
    <div className="my-2 rounded-xl border border-forest-200 bg-forest-50 overflow-hidden">
      <button
        onClick={toggle}
        data-testid="voice-call-card"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-forest-100 transition-colors"
      >
        <Phone className="w-4 h-4 text-forest-700 flex-shrink-0" />
        <span className="text-sm font-medium text-forest-900 flex-1">
          {t('chat.voice_call.card_title')}
          {minutes !== null && ` · ${t('chat.voice_call.card_minutes', { count: minutes })}`}
        </span>
        {tokens && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {t('chat.voice_call.tokens_spent', { tokens })}
          </span>
        )}
        {open ? (
          <ChevronUp className="w-4 h-4 text-forest-700" />
        ) : (
          <ChevronDown className="w-4 h-4 text-forest-700" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-forest-200 pt-2">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('common.loading')}
            </div>
          )}
          {failed && <p className="text-xs text-red-600">{t('chat.voice_call.card_load_failed')}</p>}
          {details && !loading && (
            details.transcript?.length ? (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {details.transcript.map((line, i) => (
                  <p key={i} className="text-xs text-gray-700">
                    <span className="font-medium text-forest-800">
                      {line.role === 'user' ? t('chat.voice_call.speaker_you') : t('chat.voice_call.speaker_assistant')}:
                    </span>{' '}
                    {line.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">{t('chat.voice_call.card_no_transcript')}</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
