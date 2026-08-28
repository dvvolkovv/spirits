import { useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

interface Props {
  code: string;
  title: string;
  /** Ассистент, в чьём чате лежит карточка — он и пойдёт на встречу. */
  agentId: number;
  onJoined: (callId: string) => void;
}

/**
 * Карточка «Зайти во встречу» в ленте чата.
 *
 * Появляется, когда пользователь кинул в чат ссылку на комнату Linkeon.
 * Заходит именно тот ассистент, в чьём чате она лежит.
 */
export default function MeetingJoinCard({ code, title, agentId, onJoined }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post('/webhook/meeting/join', { agentId, code });
      if (!res.ok) {
        // 409 — ассистент уже на другой встрече или на звонке. Это не поломка,
        // и текст должен объяснять, что делать, а не пугать.
        throw new Error(res.status === 409 ? 'already_in' : 'join_failed');
      }
      const data = await res.json();
      onJoined(data.callId);
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'join_failed';
      setError(reason === 'already_in' ? 'already_in' : 'join_failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="my-2 rounded-xl border border-forest-200 bg-forest-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Video className="w-4 h-4 text-forest-700 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-forest-900 truncate">{title}</p>
          <p className="text-xs text-gray-500">{code}</p>
        </div>
        <button
          onClick={join}
          disabled={busy}
          data-testid="meeting-join"
          className="px-3 py-1.5 rounded-lg bg-forest-700 text-white text-xs font-medium disabled:opacity-50 hover:bg-forest-800 transition-colors"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : t('chat.meeting.join')}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{t(`chat.meeting.${error}`)}</p>}
    </div>
  );
}
