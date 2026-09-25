import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { CallSessionItem, type CallSession } from './CallSessionItem';

/** Сколько сессий добавляет «Показать ещё». */
const PAGE = 50;

/** Потолок сервера за один запрос (AdminService.clampLimit для ленты). */
const MAX_LIMIT = 500;

interface SessionsResp {
  total: number;
  limit: number;
  sessions: CallSession[];
}

/**
 * Лента сессий раздела «Звонки»: звонки и встречи всех площадок строками,
 * новые сверху.
 *
 * «Показать ещё» перезапрашивает первые N+50 целиком, а не следующую страницу
 * по курсору: сессий сотни, и так пришедшая за это время новая сессия не
 * сдвигает страницы и не задваивает строку.
 *
 * При смене фильтров родитель пересоздаёт ленту через key — лимит сам
 * возвращается к первой порции.
 */
const CallSessionsFeed: React.FC<{
  /** Строка фильтров без limit — та же, что у таблицы над лентой. */
  query: string;
  /** Растёт по кнопке «Обновить» в шапке раздела. */
  reloadKey: number;
  onOpenUser: (userId: string) => void;
}> = ({ query, reloadKey, onOpenUser }) => {
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<SessionsResp | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setError(null);
    apiClient
      .get(`/webhook/admin/calls/sessions?${query}&limit=${limit}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Сессии: ${r.status}`);
        const d = await r.json();
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Не удалось загрузить сессии');
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => { alive = false; };
  }, [query, limit, reloadKey]);

  const sessions = data?.sessions ?? [];
  const hasMore = !!data && sessions.length < data.total;
  // На потолке сервера кнопка ничего бы не догрузила — вместо неё подсказка.
  const atCap = limit >= MAX_LIMIT;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Сессии</h2>
        {data && (
          <span data-testid="call-sessions-count" className="text-xs text-gray-400">
            Показано {sessions.length} из {data.total}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!data ? (
        isLoading && <p className="text-sm text-gray-400 py-12 text-center">Загрузка…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-400 py-12 text-center">Сессий за период не было</p>
      ) : (
        <ul data-testid="call-sessions" className="flex flex-col gap-2 p-4">
          {sessions.map((s) => (
            <CallSessionItem key={s.id} session={s} onOpenUser={onOpenUser} />
          ))}
        </ul>
      )}

      {hasMore && !atCap && (
        <div className="px-4 pb-4">
          <button
            data-testid="call-sessions-more"
            onClick={() => setLimit((l) => Math.min(l + PAGE, MAX_LIMIT))}
            disabled={isLoading}
            className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:border-forest-400 hover:bg-forest-50 disabled:opacity-50"
          >
            {isLoading ? 'Загрузка…' : 'Показать ещё'}
          </button>
        </div>
      )}

      {hasMore && atCap && (
        <p data-testid="call-sessions-capped" className="px-4 pb-4 text-xs text-gray-400">
          Показаны последние {sessions.length}. Чтобы увидеть более ранние, сузьте период или выберите площадку.
        </p>
      )}
    </div>
  );
};

export default CallSessionsFeed;
