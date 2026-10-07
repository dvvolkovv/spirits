// src/components/chat/listen/useListenPlayer.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { apiClient } from '../../../services/apiClient';
import { formatNumber } from '../../../utils/formatters';
import { LISTEN_MAX_CHARS } from './speechText';

export type ListenPhase = 'idle' | 'loading' | 'playing';

export interface ListenPlayer {
  /** Фаза кнопки конкретного ответа: звучит не больше одного. */
  phaseOf: (id: string) => ListenPhase;
  /** Куски ответа уже в памяти — повтор бесплатен, цену в надписи не показываем. */
  isKnown: (id: string, text: string) => boolean;
  /** Нажатие на кнопку ответа: запустить, а на звучащем — остановить. */
  toggle: (id: string, text: string, assistant?: string) => void;
  stop: () => void;
}

/**
 * 50 мс тишины (WAV, 8 кГц, 8 бит). Проигрывается синхронно в обработчике
 * нажатия: iOS Safari и WKWebView дают звук элементу, который уже играл по
 * жесту пользователя, а настоящие куски приходят через секунды синтеза, когда
 * жест давно истёк. CSP на my.linkeon.io нет — data: URI проходит.
 */
const SILENT_WAV =
  'data:audio/wav;base64,' +
  'UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
  'gICAgICAgICAgICA';

interface State { id: string | null; phase: ListenPhase }
const IDLE: State = { id: null, phase: 'idle' };

/** Тело ответа POST /webhook/speech/listen — и успеха, и отказа. */
interface ListenReply {
  ok?: boolean;
  parts?: unknown;
  error?: string;
  required?: number;
  maxChars?: number;
}

/** Итог запроса озвучки: куски или текст для тоста. */
type Fetched = { parts: string[] } | { error: string };

/** Заглушить элемент и отвязать его обработчики от прошлого прогона. */
function release(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.onended = null;
  el.onerror = null;
  el.onpause = null;
  try {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } catch { /* элемент уже отпущен */ }
}

/**
 * Общий плеер ленты: один <audio> на весь чат, звучит не больше одного
 * ответа. Каждый старт и стоп увеличивают номер прогона — отставший ответ бэка
 * или событие плеера от прошлого прогона ничего не трогают.
 */
export function useListenPlayer(): ListenPlayer {
  const { t } = useTranslation();
  const [state, setState] = useState<State>(IDLE);
  // Свежее состояние для обработчиков: два нажатия до перерисовки (двойной
  // клик) обязаны видеть друг друга, а не одно и то же «idle».
  const stateRef = useRef<State>(IDLE);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Следующий кусок, подгружаемый заранее, — чтобы на стыке не было паузы.
  const nextRef = useRef<HTMLAudioElement | null>(null);
  const runRef = useRef(0);
  // Куски по (id, текст): повтор в той же сессии не ходит на бэк вовсе.
  const partsRef = useRef(new Map<string, string[]>());
  // Запросы в полёте по тому же ключу. Синтез оплачивается на сервере в любом
  // случае, поэтому брошенный запрос не отменяется: его куски ложатся в
  // partsRef, а вернувшийся к ответу ждёт тот же запрос, а не шлёт второй.
  const inflightRef = useRef(new Map<string, Promise<Fetched>>());
  // Те же ключи, но в состоянии: кнопка перерисовывается без цены, как только
  // куски легли в память (повтор уже оплачен).
  const [known, setKnown] = useState<ReadonlySet<string>>(() => new Set());

  const remember = useCallback((key: string, parts: string[]) => {
    partsRef.current.set(key, parts);
    setKnown((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const forget = useCallback((key: string) => {
    partsRef.current.delete(key);
    setKnown((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const update = useCallback((next: State) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const element = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = document.createElement('audio');
    return audioRef.current;
  }, []);

  const silence = useCallback(() => {
    release(audioRef.current);
    release(nextRef.current);
    nextRef.current = null;
  }, []);

  const stop = useCallback(() => {
    runRef.current += 1;
    silence();
    if (stateRef.current.id !== null) update(IDLE);
  }, [silence, update]);

  // Ошибка прогона — один тост на прогон. Номер прогона двигаем: браузер шлёт
  // событие error и следом отклоняет висящий play(), и без этого обе ветки
  // показали бы по тосту.
  const fail = useCallback((run: number, message: string) => {
    if (run !== runRef.current) return;
    runRef.current += 1;
    toast.error(message);
    silence();
    update(IDLE);
  }, [silence, update]);

  const errorMessage = useCallback((status: number, body: ListenReply | null): string => {
    if (status === 402) {
      return t('chat.listen_no_tokens', { required: formatNumber(Number(body?.required) || 0) });
    }
    if (status === 429) return t('chat.listen_rate_limited');
    if (status === 400 && body?.error === 'text_too_long') {
      return t('chat.listen_too_long', { max: formatNumber(Number(body?.maxChars) || LISTEN_MAX_CHARS) });
    }
    return t('chat.listen_failed');
  }, [t]);

  const fetchParts = useCallback((key: string, text: string, assistant?: string): Promise<Fetched> => {
    const pending = inflightRef.current.get(key);
    if (pending) return pending;
    const request = (async (): Promise<Fetched> => {
      try {
        const res = await apiClient.post('/webhook/speech/listen', { text, assistant });
        const body: ListenReply | null = await res.json().catch(() => null);
        if (res.ok && body?.ok && Array.isArray(body.parts) && body.parts.length > 0) {
          const parts = body.parts.map(String);
          remember(key, parts);
          return { parts };
        }
        return { error: errorMessage(res.status, body) };
      } catch {
        return { error: t('chat.listen_failed') };
      } finally {
        inflightRef.current.delete(key);
      }
    })();
    inflightRef.current.set(key, request);
    return request;
  }, [errorMessage, remember, t]);

  const play = useCallback((run: number, id: string, key: string, parts: string[]) => {
    const el = element();
    let index = 0;
    // Пауза извне — звонок, экран блокировки, гарнитура. Слушаем её только
    // пока кусок реально звучит: на стыке и при разблокировке src меняется, и
    // браузер вправе прислать pause, которая остановкой не является. В конце
    // куска pause приходит перед ended — её отличает el.ended.
    const onPause = () => {
      if (run === runRef.current && !el.ended) stop();
    };
    const preload = (i: number) => {
      release(nextRef.current);
      nextRef.current = null;
      if (i >= parts.length) return;
      const next = document.createElement('audio');
      next.preload = 'auto';
      next.src = parts[i];
      nextRef.current = next;
    };
    const start = () => {
      el.onpause = null;
      el.src = parts[index];
      Promise.resolve(el.play()).then(
        () => {
          if (run !== runRef.current) return;
          el.onpause = onPause;
          update({ id, phase: 'playing' });
        },
        (err: unknown) => {
          if (run !== runRef.current) return;
          // Браузер не дал звук без свежего жеста — куски уже есть, второе
          // нажатие сыграет их сразу. Иначе файл битый: куски забываем.
          const blocked = (err as { name?: string } | null)?.name === 'NotAllowedError';
          if (!blocked) forget(key);
          fail(run, blocked ? t('chat.listen_tap_again') : t('chat.listen_failed'));
        },
      );
      preload(index + 1);
    };
    el.onended = () => {
      if (run !== runRef.current) return;
      index += 1;
      if (index < parts.length) {
        start();
        return;
      }
      silence();
      update(IDLE);
    };
    el.onerror = () => {
      if (run !== runRef.current) return;
      forget(key);
      fail(run, t('chat.listen_failed'));
    };
    start();
  }, [element, fail, forget, silence, stop, t, update]);

  const toggle = useCallback((id: string, text: string, assistant?: string) => {
    const cur = stateRef.current;
    if (cur.id === id) {
      // Пока озвучивается, нажатие ничего не отменяет: синтез уже оплачивается
      // на сервере, «отмена» значила бы заплатить и ничего не услышать.
      if (cur.phase === 'loading') return;
      stop();
      return;
    }
    stop();
    const run = runRef.current;

    // Разблокировка звука — строго синхронно, пока жест пользователя «жив».
    const el = element();
    try {
      el.src = SILENT_WAV;
      Promise.resolve(el.play()).catch(() => { /* прервётся настоящим куском */ });
    } catch { /* движок без промиса у play() */ }
    update({ id, phase: 'loading' });

    const key = JSON.stringify([id, text]);
    const known = partsRef.current.get(key);
    if (known) {
      play(run, id, key, known);
      return;
    }
    void fetchParts(key, text, assistant).then((result) => {
      if (run !== runRef.current) return;
      if ('parts' in result) play(run, id, key, result.parts);
      else fail(run, result.error);
    });
  }, [element, fail, fetchParts, play, stop, update]);

  // Уход из чата не оставляет играющий звук.
  useEffect(() => () => {
    runRef.current += 1;
    silence();
  }, [silence]);

  const phaseOf = useCallback(
    (id: string): ListenPhase => (state.id === id ? state.phase : 'idle'),
    [state],
  );

  const isKnown = useCallback(
    (id: string, text: string): boolean => known.has(JSON.stringify([id, text])),
    [known],
  );

  return { phaseOf, isKnown, toggle, stop };
}
