import { useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

/**
 * Плашка «ассистент на встрече» над лентой чата.
 *
 * Пока она видна, ассистент сидит в комнате и тарифицируется — поэтому кнопка
 * выхода должна быть на виду, а не спрятана в меню.
 */
export default function MeetingStatusBar({
  callId,
  onLeft,
}: {
  callId: string;
  onLeft: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    setBusy(true);
    try {
      await apiClient.post(`/webhook/meeting/${callId}/leave`);
    } catch {
      // Best-effort: ассистент мог выйти сам — по опустевшей комнате или по
      // потолку. Плашку в любом случае убираем, иначе она застрянет навсегда.
    }
    setBusy(false);
    onLeft();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-forest-100 border-b border-forest-200">
      <Video className="w-4 h-4 text-forest-700 animate-pulse flex-shrink-0" />
      <span className="text-xs text-forest-900 flex-1">{t('chat.meeting.in_progress')}</span>
      <button
        onClick={leave}
        disabled={busy}
        data-testid="meeting-leave"
        className="px-2 py-1 rounded-md bg-white text-forest-800 text-xs font-medium disabled:opacity-50 hover:bg-forest-50 transition-colors"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : t('chat.meeting.leave')}
      </button>
    </div>
  );
}
