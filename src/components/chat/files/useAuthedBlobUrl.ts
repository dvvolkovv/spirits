import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';

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
    void (async () => {
      try {
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
    })();
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
