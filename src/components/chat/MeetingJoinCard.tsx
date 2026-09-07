import { useEffect, useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

/**
 * Attendee сам поднимает Chrome и грузит страницу Meet — это ощутимо дольше,
 * чем вход в LiveKit-комнату, поэтому подсказку держим дольше, чем обычный
 * тост, но не бесконечно: если хозяин так и не впустил, она гаснет сама.
 */
const WAITING_ADMIT_TIMEOUT_MS = 90_000;

interface Props {
  code: string;
  title: string;
  /** Чья встреча. Без него — своя, как было до появления чужих комнат. */
  provider?: 'linkeon' | 'talerid' | 'meet';
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
export default function MeetingJoinCard({ code, title, provider = 'linkeon', agentId, onJoined }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // В Meet бот попадает в комнату ожидания, и впустить его должен хозяин
  // встречи. Без этой подсказки человек ждёт ассистента, а ассистент — его.
  const [waitingAdmit, setWaitingAdmit] = useState(false);

  // Таймер обязан очищаться при размонтировании — иначе setState прилетит на
  // снятый компонент. Эффект перезапускается вместе с waitingAdmit, поэтому
  // повторный вход после сброса подсказки заново уводит её через 90с, а не
  // держит старый (уже истёкший) таймер.
  useEffect(() => {
    if (!waitingAdmit) return;
    const timer = window.setTimeout(() => setWaitingAdmit(false), WAITING_ADMIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [waitingAdmit]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post('/webhook/meeting/join', { agentId, code, provider });
      if (!res.ok) {
        // 409 бывает по двум разным причинам, и текст должен объяснять
        // именно свою, а не пугать общим «не поломка ли это»:
        //  - ассистент уже на другой встрече или на звонке (already_in);
        //  - потолок в одну одновременную встречу Meet занят ЧУЖИМ
        //    разговором (meet_busy, reason из тела ответа) — при этом
        //    потолке второй пользователь упирается в него как в норму, а
        //    не как в редкость (см. infra/attendee/README.md), и должен
        //    получить понятный отказ сразу, а не невнятный через несколько
        //    секунд от воркера.
        let reason: string | undefined;
        try { reason = (await res.json())?.reason; } catch { /* тело не JSON или пустое */ }
        if (res.status === 409 && reason === 'meet_busy') throw new Error('meet_busy');
        throw new Error(res.status === 409 ? 'already_in' : 'join_failed');
      }
      const data = await res.json();
      if (provider === 'meet') setWaitingAdmit(true);
      onJoined(data.callId);
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'join_failed';
      setError(reason === 'already_in' || reason === 'meet_busy' ? reason : 'join_failed');
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
      {waitingAdmit && <p className="mt-1 text-xs text-gray-500">{t('chat.meeting.waiting_admit')}</p>}
    </div>
  );
}
