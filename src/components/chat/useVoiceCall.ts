import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Room, RoomEvent, Track } from 'livekit-client';
import { apiClient } from '../../services/apiClient';
import { startRingback, type Ringback } from './ringback';

export type CallState = 'idle' | 'connecting' | 'waiting_agent' | 'active' | 'ended' | 'error';

/** Сколько ждём, пока воркер войдёт в комнату, прежде чем признать неудачу. */
const AGENT_WAIT_MS = 15_000;

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
 * Дождаться, пока в комнате появится собеседник. Проверяет уже вошедших ДО
 * подписки на событие и ещё раз сразу после — участник может войти ровно
 * между этими двумя шагами.
 */
export function waitForAgent(room: Room): Promise<boolean> {
  if (room.remoteParticipants.size > 0) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      room.off(RoomEvent.ParticipantConnected, onJoin);
      clearTimeout(timer);
      resolve(ok);
    };
    const onJoin = () => finish(true);
    room.on(RoomEvent.ParticipantConnected, onJoin);
    const timer = setTimeout(() => finish(false), AGENT_WAIT_MS);
    // Повторная проверка: участник мог войти между первой проверкой и подпиской.
    if (room.remoteParticipants.size > 0) finish(true);
  });
}

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
  const ringbackRef = useRef<Ringback | null>(null);

  /** Гудки глушим ровно в одном месте, чтобы не остались звучать после ошибки. */
  const stopRingback = useCallback(() => {
    ringbackRef.current?.stop();
    ringbackRef.current = null;
  }, []);

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
    stopRingback();
    cleanupAudioElements();
    if (callId) { try { await apiClient.post(`/webhook/voice-call/${callId}/end`); } catch { /* best-effort */ } }
    setState('ended');
    setThinking([]);
  }, [callId, cleanupAudioElements, stopRingback]);

  const start = useCallback(async () => {
    // Второй клик по «Позвонить», пока первый ещё соединяется, создал бы вторую
    // Room и потерял ссылку на первую — она осталась бы висеть подключённой.
    if (roomRef.current) return;
    setState('connecting');
    setError(null);
    // Гудки — сразу по клику: это единственный момент, когда браузер точно
    // разрешит звук (пользовательский жест), и именно с этой секунды идёт
    // дозвон, о котором пользователю надо сообщить.
    ringbackRef.current = startRingback();
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
        // Контракт версионирован: подсистемы Zoom и телефонии будут слушать
        // тот же канал. Чужая версия — не наша схема, молча игнорируем,
        // иначе старая вкладка нарисует плашки по неизвестным правилам.
        if (msg?.v !== 1) return;
        if (msg.type === 'specialist_pending') {
          setThinking((prev) => [...prev, { jobId: msg.jobId, specialist: msg.specialist }]);
        } else if (msg.type === 'specialist_answer' || msg.type === 'specialist_failed') {
          setThinking((prev) => prev.filter((item) => item.jobId !== msg.jobId));
        }
      });

      // Агент вышел из комнаты — разговор окончен, даже если наш сокет жив.
      room.on(RoomEvent.ParticipantDisconnected, () => {
        if (room.remoteParticipants.size === 0) {
          setState('ended');
          setThinking([]);
          cleanupAudioElements();
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setState('ended');
        setThinking([]);
        stopRingback();
        cleanupAudioElements();
      });

      // «Разговор идёт» только когда в комнате реально есть собеседник.
      //
      // Раньше здесь стоял setState('active') сразу после connect(): фронт
      // объявлял звонок состоявшимся, подключившись к ПУСТОЙ комнате. Если
      // воркер не поднялся или не успел войти, пользователь видел «разговор
      // идёт» и слушал тишину, неотличимую от рабочего звонка. Поймано живым
      // звонком на проде 25.08.2026 — ни один тест такого не покажет.
      await room.connect(wsUrl, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState('waiting_agent');

      // Ждать агента можно только ПОСЛЕ connect, и обязательно с повторной
      // проверкой уже присутствующих участников.
      //
      // Первая версия создавала промис до connect: проверка
      // remoteParticipants.size там всегда давала 0 (комнаты ещё нет), а если
      // воркер успевал войти раньше нас, событие ParticipantConnected уже не
      // приходило. Пользователь видел «Ждём Романа…» пятнадцать секунд, слушая,
      // как Роман говорит, а потом звонок обрывался по таймауту. Проявилось
      // ровно тогда, когда убрали 40-секундную паузу на preamble и воркер стал
      // успевать первым. Живой звонок 26.08.2026.
      const joined = await waitForAgent(room);
      stopRingback();
      if (!joined) {
        throw new Error(t('chat.voice_call.agent_no_show'));
      }
      setState('active');
    } catch (e) {
      const message = e instanceof Error ? e.message : undefined;
      setError(message || t('chat.voice_call.error'));
      setState('error');
      stopRingback();
      cleanupAudioElements();

      // Обязательно отключаемся, а не только обнуляем ref. Самый частый сбой
      // здесь — пользователь запретил микрофон: connect() уже прошёл, воркер
      // задиспатчен, Realtime-сессия тарифицируется. Просто забыв про Room,
      // мы оставляли её подключённой навсегда, а кнопка «Позвонить» снова
      // становилась активной и заводила вторую такую же.
      const orphan = roomRef.current;
      roomRef.current = null;
      if (orphan) { try { await orphan.disconnect(); } catch { /* уже отключились */ } }
      if (callId) { try { await apiClient.post(`/webhook/voice-call/${callId}/end`); } catch { /* best-effort */ } }
    }
  }, [t, cleanupAudioElements, callId, stopRingback]);

  // Уходя со страницы, кладём трубку: иначе комната живёт до таймаута воркера.
  useEffect(() => () => { void roomRef.current?.disconnect(); ringbackRef.current?.stop(); }, []);

  return { state, error, thinking, callId, start, hangUp };
}
