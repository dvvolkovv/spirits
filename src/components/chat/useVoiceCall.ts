import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Room, RoomEvent, Track } from 'livekit-client';
import { apiClient } from '../../services/apiClient';

export type CallState = 'idle' | 'connecting' | 'active' | 'ended' | 'error';

export interface ThinkingSpecialist {
  jobId: string;
  specialist: string;
}

/** Data-сообщения из комнаты LiveKit, topic `linkeon` (контракт бэкенда). */
interface LinkeonDataMessageBase {
  v: number;
  jobId: string;
  specialist: string;
}
interface SpecialistPendingMessage extends LinkeonDataMessageBase {
  type: 'specialist_pending';
}
interface SpecialistAnswerMessage extends LinkeonDataMessageBase {
  type: 'specialist_answer';
  text: string;
}
interface SpecialistFailedMessage extends LinkeonDataMessageBase {
  type: 'specialist_failed';
  reason: string;
}
type LinkeonDataMessage = SpecialistPendingMessage | SpecialistAnswerMessage | SpecialistFailedMessage;

/**
 * Звонок Роману. Комната LiveKit, воркер уже в ней; наше дело — отдать
 * микрофон, играть входящий звук и показывать, кого Роман сейчас спрашивает.
 */
export function useVoiceCall() {
  const { t } = useTranslation();
  const [state, setState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ThinkingSpecialist[]>([]);
  const [callId, setCallId] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);

  // track.attach() (см. исходник livekit-client) только создаёт <audio> и
  // назначает ему srcObject — в document его никто не вставляет. Без
  // appendChild элемент не встроен в дерево и звука не будет. Храним все
  // созданные элементы, чтобы на detach/hangup убрать их из DOM самим —
  // иначе за каждый звонок в <body> оседает висячий <audio>.
  const audioElsRef = useRef<Set<HTMLMediaElement>>(new Set());

  const cleanupAudioElements = useCallback(() => {
    audioElsRef.current.forEach((el) => {
      try { el.remove(); } catch { /* уже не в DOM */ }
    });
    audioElsRef.current.clear();
  }, []);

  const hangUp = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) { try { await room.disconnect(); } catch { /* уже отключились */ } }
    cleanupAudioElements();
    if (callId) { try { await apiClient.post(`/webhook/voice-call/${callId}/end`); } catch { /* best-effort */ } }
    setState('ended');
    setThinking([]);
  }, [callId, cleanupAudioElements]);

  const start = useCallback(async () => {
    // Второй клик по «Позвонить», пока первый ещё соединяется, создал бы вторую
    // Room и потерял ссылку на первую — она осталась бы висеть подключённой.
    if (roomRef.current) return;
    setState('connecting');
    setError(null);
    try {
      const res = await apiClient.post('/webhook/voice-call/start');
      if (!res.ok) {
        throw new Error(res.status === 403 ? t('chat.voice_call.admin_only') : t('chat.voice_call.error'));
      }
      const { callId: id, token, wsUrl } = await res.json();
      setCallId(id);

      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.autoplay = true;
        document.body.appendChild(el);
        audioElsRef.current.add(el);
      });

      // Воркер может переопубликовать трек посреди звонка (переподключение) —
      // тогда старый элемент осиротеет, если не убрать его именно здесь, а не
      // ждать общей уборки по hangUp/Disconnected.
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        track.detach().forEach((el) => {
          audioElsRef.current.delete(el);
          el.remove();
        });
      });

      room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
        if (topic !== 'linkeon') return;
        let msg: LinkeonDataMessage;
        try { msg = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
        if (msg.type === 'specialist_pending') {
          setThinking((prev) => [...prev, { jobId: msg.jobId, specialist: msg.specialist }]);
        } else if (msg.type === 'specialist_answer' || msg.type === 'specialist_failed') {
          setThinking((prev) => prev.filter((item) => item.jobId !== msg.jobId));
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setState('ended');
        setThinking([]);
        cleanupAudioElements();
      });

      await room.connect(wsUrl, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState('active');
    } catch (e) {
      const message = e instanceof Error ? e.message : undefined;
      setError(message || t('chat.voice_call.error'));
      setState('error');
      cleanupAudioElements();
      roomRef.current = null;
    }
  }, [t, cleanupAudioElements]);

  // Уходя со страницы, кладём трубку: иначе комната живёт до таймаута воркера.
  useEffect(() => () => { void roomRef.current?.disconnect(); }, []);

  return { state, error, thinking, callId, start, hangUp };
}
