import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';

/**
 * Сколько blob-запросов идёт разом. Панель с сотнями загрузок иначе забила бы
 * все соединения браузера (их около 6 на хост) превью, и запросы самого чата
 * ждали бы в общей очереди. Кэш браузера тут не помогает: бэк отдаёт файлы с
 * no-store (общие устройства), поэтому очередь — своя.
 */
const MAX_IN_FLIGHT = 6;

interface Job {
  run: () => Promise<void>;
  signal: AbortSignal;
  onAbort: () => void;
}

let inFlight = 0;
const waiting: Job[] = [];

/** Запуск занимает место; освобождается оно в finally при любом исходе. */
async function start(run: () => Promise<void>): Promise<void> {
  inFlight += 1;
  try {
    await run();
  } finally {
    inFlight -= 1;
    const next = waiting.shift();
    if (next) {
      next.signal.removeEventListener('abort', next.onAbort);
      void start(next.run);
    }
  }
}

/**
 * Свободно место — запрос стартует сразу (синхронно), иначе ждёт в очереди.
 * Отменённый до старта (плитка ушла) места не занимает: из очереди он
 * снимается, а уже отменённый в неё не встаёт.
 */
function schedule(signal: AbortSignal, run: () => Promise<void>): void {
  if (signal.aborted) return;
  if (inFlight < MAX_IN_FLIGHT) {
    void start(run);
    return;
  }
  const job: Job = {
    run,
    signal,
    onAbort: () => {
      const i = waiting.indexOf(job);
      if (i >= 0) waiting.splice(i, 1);
    },
  };
  signal.addEventListener('abort', job.onAbort, { once: true });
  waiting.push(job);
}

export interface AuthedBlob {
  /** blob:-адрес; undefined — файл едет, не загрузился или запрос выключен. */
  url: string | undefined;
  /**
   * Загрузка по этому path не удалась (не 2xx, сеть, протухший вход): ждать
   * больше нечего, вызывающий показывает значок вместо индикатора. Отменённый
   * запрос (смена path, размонтирование) неудачей не считается.
   */
  failed: boolean;
}

/**
 * Приватный файл (загрузка пользователя или её миниатюра) как адрес для
 * <img>/<video>.
 *
 * Адреса /webhook/chat-uploads/... отдаются только владельцу по JWT, а <img src>
 * заголовок Authorization не шлёт и получил бы 401. Поэтому байты забираются
 * через apiClient (он сам ставит Bearer и обновляет токен при 401) и
 * отдаются как blob:-адрес.
 *
 * Адрес отзывается (revokeObjectURL) при смене path и при размонтировании,
 * иначе каждая открытая панель держала бы копии картинок в памяти вкладки.
 */
export function useAuthedBlob(path: string | undefined, enabled = true): AuthedBlob {
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!path || !enabled) return undefined;
    let cancelled = false;
    let objectUrl: string | null = null;
    // Отмена нужна ради видео: просмотр закрыли — недокачанные мегабайты не тянем.
    const controller = new AbortController();
    const fail = () => {
      if (!cancelled) setFailedPath(path);
    };
    schedule(controller.signal, async () => {
      try {
        // Ушли, пока ждали очереди, — запрос не шлём.
        if (cancelled) return;
        const res = await apiClient.get(path, { signal: controller.signal });
        if (!res.ok) {
          fail();
          return;
        }
        const blob = await res.blob();
        // Пока ехало тело, адрес сменился или компонент ушёл — blob не создаём.
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ path, url: objectUrl });
      } catch {
        // Сеть, протухший вход — превью нет, вызывающий рисует значок. Отмена
        // (cancelled) сюда тоже попадает, но неудачей не считается.
        fail();
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
      // Смена path или уход: прежняя неудача к новому адресу не относится.
      setFailedPath((cur) => (cur === path ? null : cur));
      if (objectUrl) {
        const revoked = objectUrl;
        URL.revokeObjectURL(revoked);
        setLoaded((cur) => (cur?.url === revoked ? null : cur));
      }
    };
  }, [path, enabled]);

  // Сверка path: после смены адреса, пока не пришёл новый blob, прежний
  // (уже отозванный) не отдаём.
  return {
    url: enabled && loaded && loaded.path === path ? loaded.url : undefined,
    failed: enabled && !!path && failedPath === path,
  };
}

/**
 * Только адрес: undefined, пока файл едет, при любой ошибке и при
 * enabled=false. Плиткам «едет» и «не загрузился» различать не нужно — в обоих
 * случаях они рисуют значок.
 */
export function useAuthedBlobUrl(path: string | undefined, enabled = true): string | undefined {
  return useAuthedBlob(path, enabled).url;
}
