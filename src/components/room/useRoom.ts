import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { apiClient } from '../../services/apiClient';

export interface Peer {
  identity: string;
  name: string;
  speaking: boolean;
  /** Мы сами. Показывается первым и подписывается иначе. */
  isSelf: boolean;
}

export type RoomState = 'idle' | 'joining' | 'connected' | 'left' | 'error';

/**
 * Подключение к голосовой комнате Linkeon.
 *
 * Только звук: видео и демонстрации экрана в v1 нет, камеру не просим вовсе —
 * лишний запрос разрешения отпугивает гостя, которому просто дали ссылку.
 */
export function useRoom(code: string) {
  const roomRef = useRef<Room | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [state, setState] = useState<RoomState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);

  // track.attach() (см. исходник livekit-client) только создаёт <audio> и
  // назначает srcObject — в document его никто не вставляет, и без appendChild
  // звука не будет. Храним созданные элементы, чтобы убрать их самим: иначе за
  // каждый вход в <body> оседает висячий <audio>. Та же схема, что в
  // useVoiceCall.
  const audioElsRef = useRef<Set<HTMLMediaElement>>(new Set());

  const cleanupAudio = useCallback(() => {
    audioElsRef.current.forEach((el) => {
      try { el.remove(); } catch { /* уже не в DOM */ }
    });
    audioElsRef.current.clear();
  }, []);

  const refresh = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const local = room.localParticipant;
    const list: Peer[] = [
      {
        identity: local.identity,
        name: local.name || '',
        speaking: local.isSpeaking,
        isSelf: true,
      },
      ...[...room.remoteParticipants.values()].map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
        speaking: p.isSpeaking,
        isSelf: false,
      })),
    ];
    setPeers(list);
  }, []);

  const join = useCallback(async (name: string) => {
    // Второй клик по «Войти», пока первый ещё соединяется, создал бы вторую
    // Room и потерял ссылку на первую — она осталась бы висеть подключённой.
    if (roomRef.current) return;
    setState('joining');
    setError(null);

    try {
      const res = await apiClient.post(`/webhook/room/public/${code}/join`, { name });
      if (!res.ok) throw new Error('join_failed');
      const { token, wsUrl } = await res.json();

      // adaptiveStream и dynacast выключены: они управляют качеством видео,
      // которого у нас нет. Так же сделано в useVoiceCall.
      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.autoplay = true;
        document.body.appendChild(el);
        audioElsRef.current.add(el);
      });

      // Участник может переопубликовать дорожку посреди встречи
      // (переподключение) — тогда старый элемент осиротеет, если не убрать его
      // именно здесь, а не ждать общей уборки на выходе.
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        track.detach().forEach((el) => {
          audioElsRef.current.delete(el);
          el.remove();
        });
      });

      room.on(RoomEvent.ParticipantConnected, refresh);
      room.on(RoomEvent.ParticipantDisconnected, refresh);
      room.on(RoomEvent.ActiveSpeakersChanged, refresh);
      room.on(RoomEvent.TrackMuted, refresh);
      room.on(RoomEvent.TrackUnmuted, refresh);

      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        cleanupAudio();
        setState('left');
      });

      await room.connect(wsUrl, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicOn(true);
      setState('connected');
      refresh();
    } catch (e) {
      roomRef.current = null;
      cleanupAudio();
      // join_failed — комнаты нет или ограничение частоты; всё остальное
      // (чаще всего отказ в доступе к микрофону) требует другого совета
      // пользователю, поэтому исходы различаются.
      const reason = e instanceof Error ? e.message : '';
      setError(reason === 'join_failed' ? 'join_failed' : 'connect_failed');
      setState('error');
    }
  }, [code, cleanupAudio, refresh]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
    refresh();
  }, [micOn, refresh]);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) { try { await room.disconnect(); } catch { /* уже отключились */ } }
    cleanupAudio();
    setState('left');
  }, [cleanupAudio]);

  // Уход со страницы обязан рвать соединение. Иначе участник остаётся в
  // комнате призраком, и правило «все ушли → ассистент выходит» не сработает:
  // он будет сидеть и жечь Realtime, пока не упрётся в потолок.
  useEffect(() => {
    // Множество копируем в переменную здесь, а не читаем ref в самой уборке:
    // к моменту размонтирования ref.current может указывать уже не на тот
    // объект, и висячие <audio> остались бы в DOM. Идентичность Set при этом
    // не меняется — мы его только наполняем.
    const els = audioElsRef.current;
    return () => {
      const room = roomRef.current;
      roomRef.current = null;
      if (room) { try { void room.disconnect(); } catch { /* уже отключились */ } }
      els.forEach((el) => {
        try { el.remove(); } catch { /* уже не в DOM */ }
      });
      els.clear();
    };
  }, []);

  return { peers, state, error, micOn, join, toggleMic, leave };
}
