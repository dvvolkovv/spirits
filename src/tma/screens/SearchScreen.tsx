import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, Loader2 } from 'lucide-react';
import { runSearch, mergeMatch, type SearchMatch } from './searchFlow';

/**
 * Поиск людей в мини-аппе.
 *
 * Находки дорисовываются по мере прихода: выдача идёт десятки секунд, и
 * ждать её целиком на телефоне никто не станет — пустой экран читается как
 * «зависло». Логика разбора живёт в searchFlow.ts и проверяется без React.
 */
export function SearchScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Был ли хоть один поиск: до него «никого не нашлось» показывать нельзя. */
  const [searched, setSearched] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !query.trim()) return;
    setBusy(true);
    setFailed(false);
    setSearched(true);
    // Прошлую выдачу убираем сразу: показывать её рядом с новым запросом
    // значит выдавать старое за свежее.
    setMatches([]);
    try {
      await runSearch(query, (m) => setMatches((prev) => mergeMatch(prev, m)));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{t('tma.search.title')}</h1>
      <p className="mt-1 text-sm text-gray-500">{t('tma.search.hint')}</p>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('tma.search.placeholder')}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="flex items-center gap-1 rounded-lg bg-forest-700 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
        </button>
      </form>

      {failed && <p className="mt-4 text-red-600">{t('tma.search.failed')}</p>}

      {/* Счётчик виден и во время поиска: он показывает, что работа идёт. */}
      {matches.length > 0 && (
        <p className="mt-4 text-xs text-gray-400">
          {t('tma.search.found', { count: matches.length })}
        </p>
      )}

      <ul className="mt-2 space-y-2">
        {matches.map((m) => (
          <li key={m.userId} className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-sm font-medium">{m.name}</p>
            {m.reason && <p className="mt-1 text-xs text-gray-500">{m.reason}</p>}
          </li>
        ))}
      </ul>

      {busy && matches.length === 0 && (
        <p className="mt-4 text-sm text-gray-400">{t('tma.search.searching')}</p>
      )}
      {!busy && searched && !failed && matches.length === 0 && (
        <p className="mt-4 text-sm text-gray-400">{t('tma.search.empty')}</p>
      )}
    </div>
  );
}
