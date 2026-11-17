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

/**
 * Приватный файл (загрузка пользователя или её миниатюра) как адрес для
 * <img>/<video>.
 *
 * Адреса /webhook/chat-uploads/... отдаются только владельцу по JWT, а <img src>
 * заголовок Authorization не шлёт и получил бы 401. Поэтому байты забираются
 * через apiClient (он сам ставит Bearer и обновляет токен при 401) и
 * отдаются как blob:-адрес.
 *
 * Возвращает undefined, пока файл едет, при любой ошибке и при enabled=false.
 * Адрес отзывается (revokeObjectURL) при смене path и при размонтировании,
 * иначе каждая открытая панель держала бы копии картинок в памяти вкладки.
 */
export function useAuthedBlobUrl(path: string | undefined, enabled = true): string | undefined {
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path || !enabled) return undefined;
    let cancelled = false;
    let objectUrl: string | null = null;
    // Отмена нужна ради видео: просмотр закрыли — недокачанные мегабайты не тянем.
    const controller = new AbortController();
    schedule(controller.signal, async () => {
      try {
        // Ушли, пока ждали очереди, — запрос не шлём.
        if (cancelled) return;
        const res = await apiClient.get(path, { signal: controller.signal });
        if (!res.ok) return;
        const blob = await res.blob();
        // Пока ехало тело, адрес сменился или компонент ушёл — blob не создаём.
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ path, url: objectUrl });
      } catch {
        // Сеть, отмена, протухший вход — превью просто нет, вызывающий рисует значок.
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) {
        const revoked = objectUrl;
        URL.revokeObjectURL(revoked);
        setLoaded((cur) => (cur?.url === revoked ? null : cur));
      }
    };
  }, [path, enabled]);

  // Сверка path: после смены адреса, пока не пришёл новый blob, прежний
  // (уже отозванный) не отдаём.
  return enabled && loaded && loaded.path === path ? loaded.url : undefined;
}
