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

/** Заглушить элемент и отвязать его обработчики от прошлого прогона. */
function silence(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.onended = null;
  el.onerror = null;
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
  const stateRef = useRef<State>(IDLE);
  stateRef.current = state;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Куски по (id, текст): повтор в той же сессии не ходит на бэк вовсе.
  const partsRef = useRef(new Map<string, string[]>());

  const element = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = document.createElement('audio');
    return audioRef.current;
  }, []);

  const stop = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    silence(audioRef.current);
    setState((s) => (s.id === null ? s : IDLE));
  }, []);

  const fail = useCallback((run: number, message: string) => {
    if (run !== runRef.current) return;
    toast.error(message);
    silence(audioRef.current);
    setState(IDLE);
  }, []);

  const errorMessage = useCallback((status: number, body: any): string => {
    if (status === 402) {
      return t('chat.listen_no_tokens', { required: formatNumber(Number(body?.required) || 0) });
    }
    if (status === 429) return t('chat.listen_rate_limited');
    if (status === 400 && body?.error === 'text_too_long') {
      return t('chat.listen_too_long', { max: formatNumber(Number(body?.maxChars) || LISTEN_MAX_CHARS) });
    }
    return t('chat.listen_failed');
  }, [t]);

  const play = useCallback((run: number, id: string, key: string, parts: string[]) => {
    const el = element();
    let index = 0;
    const start = () => {
      el.src = parts[index];
      Promise.resolve(el.play()).then(
        () => {
          if (run === runRef.current) setState({ id, phase: 'playing' });
        },
        (err: unknown) => {
          if (run !== runRef.current) return;
          // Браузер не дал звук без свежего жеста — куски уже есть, второе
          // нажатие сыграет их сразу. Иначе файл битый: куски забываем.
          const blocked = (err as { name?: string } | null)?.name === 'NotAllowedError';
          if (!blocked) partsRef.current.delete(key);
          fail(run, blocked ? t('chat.listen_tap_again') : t('chat.listen_failed'));
        },
      );
    };
    el.onended = () => {
      if (run !== runRef.current) return;
      index += 1;
      if (index < parts.length) {
        start();
        return;
      }
      el.onended = null;
      el.onerror = null;
      setState(IDLE);
    };
    el.onerror = () => {
      if (run !== runRef.current) return;
      partsRef.current.delete(key);
      fail(run, t('chat.listen_failed'));
    };
    start();
  }, [element, fail, t]);

  const toggle = useCallback((id: string, text: string, assistant?: string) => {
    const cur = stateRef.current;
    if (cur.id === id && cur.phase !== 'idle') {
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
    setState({ id, phase: 'loading' });

    const key = `${id}\u0000${text}`;
    const known = partsRef.current.get(key);
    if (known) {
      play(run, id, key, known);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    void (async () => {
      let res: Response;
      let body: any = null;
      try {
        res = await apiClient.post('/webhook/speech/listen', { text, assistant }, { signal: ctrl.signal });
        body = await res.json().catch(() => null);
      } catch {
        fail(run, t('chat.listen_failed'));
        return;
      }
      if (run !== runRef.current) return;
      if (abortRef.current === ctrl) abortRef.current = null;
      if (res.ok && body?.ok && Array.isArray(body.parts) && body.parts.length > 0) {
        partsRef.current.set(key, body.parts);
        play(run, id, key, body.parts);
        return;
      }
      fail(run, errorMessage(res.status, body));
    })();
  }, [element, errorMessage, fail, play, stop, t]);

  // Уход из чата не оставляет играющий звук и висящий запрос.
  useEffect(() => () => {
    runRef.current += 1;
    abortRef.current?.abort();
    silence(audioRef.current);
  }, []);

  const phaseOf = useCallback(
    (id: string): ListenPhase => (state.id === id ? state.phase : 'idle'),
    [state],
  );

  return { phaseOf, toggle, stop };
}
