import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, AlertCircle, RefreshCw, Search, Loader, Globe, Bot } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { formatTokens } from './callsFormat';
import AdminProductCard from './AdminProductCard';
import {
  PARAM,
  PERIODS,
  SEARCH_DEBOUNCE_MS,
  countByStatus,
  domainStatusLabel,
  domainStatusTone,
  formatDate,
  formatDateTime,
  formatRelative,
  isPast,
  kindLabel,
  listQuery,
  orderStatuses,
  problemText,
  readFilters,
  rowStatus,
  statusChips,
  statusLabel,
  statusTone,
  withFilters,
  withProduct,
  NETWORK_ERROR,
  type AdminProductRow,
  type AdminProductsResponse,
  type KindFilter,
  type ProductFilters,
} from './adminProducts';

const KINDS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'site', label: 'Сайты' },
  { id: 'bot', label: 'Боты' },
];

const chipClass = (active: boolean) =>
  clsx(
    'px-2.5 py-1 text-xs rounded-md border transition-colors',
    active
      ? 'border-forest-400 bg-forest-50 text-forest-700'
      : 'border-gray-200 text-gray-600 hover:border-gray-300',
  );

const badge = 'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap';

/** Ответ списка вместе с запросом, на который он пришёл. */
interface Shown {
  query: string;
  body: AdminProductsResponse;
  /** Сервер отдал только первые строки из совпавших (truncated: true). */
  truncated: boolean;
}

/**
 * Раздел «Сайты и боты»: продукты пользователей — сайты и Telegram-боты — с
 * фильтрами, сводкой по статусам и карточкой (`?product=<id>`), из которой
 * продукт можно погасить или снять с него блок.
 *
 * Фильтры живут в адресе страницы, как ?tab и ?sub соседних разделов: F5 и
 * ссылка коллеге показывают ту же выборку.
 */
const AdminProductsView: React.FC = () => {
  const [params, setParams] = useSearchParams();
  // Последний адрес и сеттер — через ref: поиск пишется в адрес по таймеру, и
  // замыкание рендера, в котором таймер заведён, затёрло бы фильтр, выбранный
  // за время паузы.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const setParamsRef = useRef(setParams);
  setParamsRef.current = setParams;

  const navigate = useCallback((build: (p: URLSearchParams) => URLSearchParams) => {
    const next = build(paramsRef.current);
    paramsRef.current = next;
    setParamsRef.current(next, { replace: true });
  }, []);

  const filters = useMemo(() => readFilters(params), [params]);
  const query = listQuery(filters);
  const selectedId = params.get(PARAM.product);

  const setFilters = useCallback(
    (patch: Partial<ProductFilters>) => navigate((p) => withFilters(p, patch)),
    [navigate],
  );
  const openProduct = useCallback((id: string) => navigate((p) => withProduct(p, id)), [navigate]);
  const closeProduct = useCallback(() => navigate((p) => withProduct(p, null)), [navigate]);

  // Поиск: поле обновляется сразу, в адрес и в запрос текст уходит после паузы.
  const [search, setSearch] = useState(filters.q);
  useEffect(() => {
    const q = search.trim();
    if (q === readFilters(paramsRef.current).q.trim()) return;
    const timer = setTimeout(() => setFilters({ q }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, setFilters]);

  const [shown, setShown] = useState<Shown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Статусы, встреченные в данных за время работы раздела: кнопка незнакомого
  // статуса не должна пропадать, как только по другому статусу включат фильтр.
  const [seen, setSeen] = useState<string[]>([]);

  // Номер последнего запроса: ответ устаревшего (быстрые клики по фильтрам) не
  // должен затереть свежий — иначе таблица показала бы не тот набор, что фильтры.
  const lastReq = useRef(0);

  const load = useCallback(async () => {
    const req = ++lastReq.current;
    setIsLoading(true);
    setError(null);
    const fail = (message: string) => {
      if (req !== lastReq.current) return;
      setError(message);
      // Прежний ответ остаётся на экране, только если это ответ на те же
      // фильтры (не удалось «Обновить»); ответ на другие фильтры — неправда.
      setShown((s) => (s && s.query === query ? s : null));
    };
    try {
      const res = await apiClient.get(`/webhook/admin/products?${query}`);
      if (!res.ok) {
        fail(await problemText(res));
        return;
      }
      const body = (await res.json().catch(() => null)) as Partial<AdminProductsResponse> | null;
      if (!body || typeof body !== 'object' || !Array.isArray(body.products)) {
        fail('Ответ сервера не похож на список продуктов — возможно, бэкенд раздела ещё не выкачен.');
        return;
      }
      if (req !== lastReq.current) return;
      const products = body.products.filter((r): r is AdminProductRow => !!r && typeof r === 'object');
      setShown({
        query,
        body: { periodDays: Number(body.periodDays) || 0, products },
        // Только настоящее true: нет поля (или не булево) — выдача полная.
        truncated: body.truncated === true,
      });
      setSeen((prev) => orderStatuses([...prev, ...products.map(rowStatus)]));
    } catch {
      fail(NETWORK_ERROR);
    } finally {
      if (req === lastReq.current) setIsLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const rows = shown?.body.products ?? [];
  const truncated = shown?.truncated ?? false;
  const counts = countByStatus(rows);
  const chips = statusChips(seen, filters.statuses);
  const periodDays = shown?.body.periodDays || filters.periodDays;
  const selectedRow = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  // От последнего адреса, а не от отрисованного: два быстрых клика по разным
  // статусам не должны терять первый.
  const toggleStatus = (s: string) =>
    navigate((p) => {
      const current = readFilters(p).statuses;
      return withFilters(p, { statuses: current.includes(s) ? current.filter((x) => x !== s) : [...current, s] });
    });

  return (
    <>
      <div className="h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5 pb-20 md:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Boxes className="w-6 h-6 text-forest-600" />
              <h1 className="text-xl font-bold text-gray-900">Сайты и боты</h1>
            </div>
            <button
              data-testid="admin-products-refresh"
              onClick={() => { load(); }}
              disabled={isLoading}
              className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:border-forest-400 hover:bg-forest-50 disabled:opacity-50"
            >
              <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
              Обновить
            </button>
          </div>

          <div className="space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                data-testid="admin-products-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                // q ищет по названию, слагу, адресу платформы, своему домену,
                // user_id и имени владельца (согласовано с бэкендом).
                placeholder="Название, адрес, домен или владелец"
                aria-label="Поиск"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-forest-400 focus:ring-1 focus:ring-forest-200 outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Статус">
              <button
                data-testid="admin-products-status-all"
                onClick={() => setFilters({ statuses: [] })}
                aria-pressed={filters.statuses.length === 0}
                className={chipClass(filters.statuses.length === 0)}
              >
                Все статусы
              </button>
              {chips.map((s) => (
                <button
                  key={s}
                  data-testid={`admin-products-status-${s}`}
                  onClick={() => toggleStatus(s)}
                  aria-pressed={filters.statuses.includes(s)}
                  title={s}
                  className={chipClass(filters.statuses.includes(s))}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex gap-1" role="group" aria-label="Вид">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    data-testid={`admin-products-kind-${k.id}`}
                    onClick={() => setFilters({ kind: k.id })}
                    aria-pressed={filters.kind === k.id}
                    className={chipClass(filters.kind === k.id)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1" role="group" aria-label="Период">
                {PERIODS.map((d) => (
                  <button
                    key={d}
                    data-testid={`admin-products-period-${d}`}
                    onClick={() => setFilters({ periodDays: d })}
                    aria-pressed={filters.periodDays === d}
                    className={chipClass(filters.periodDays === d)}
                  >
                    {d} дней
                  </button>
                ))}
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
                <input
                  data-testid="admin-products-include-test"
                  type="checkbox"
                  checked={filters.includeTest}
                  onChange={(e) => setFilters({ includeTest: e.target.checked })}
                  className="rounded border-gray-300 text-forest-600 focus:ring-forest-500"
                />
                тестовые аккаунты
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
                <input
                  data-testid="admin-products-include-archived"
                  type="checkbox"
                  checked={filters.includeArchived}
                  onChange={(e) => setFilters({ includeArchived: e.target.checked })}
                  className="rounded border-gray-300 text-forest-600 focus:ring-forest-500"
                />
                архивные
              </label>
            </div>
          </div>

          {error && (
            <div data-testid="admin-products-error" className="flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {shown && (
            <div data-testid="admin-products-summary" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
              <span className="font-semibold text-gray-900">Всего: {rows.length}{truncated && '+'}</span>
              {truncated && (
                <span data-testid="admin-products-truncated" className="inline-flex items-center gap-1 text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Показаны первые {rows.length} — уточните фильтр
                </span>
              )}
              {/* При обрезанной выдаче счётчики — только по показанным строкам. */}
              <span
                data-testid="admin-products-status-counts"
                data-partial={String(truncated)}
                title={truncated ? 'Только по показанным строкам — в выдачу попали не все' : undefined}
                className="inline-flex flex-wrap items-center gap-1.5"
              >
                {truncated && <span className="text-xs text-gray-500">среди показанных:</span>}
                {counts.map((c) => (
                  <span key={c.status} title={c.status} className={clsx(badge, statusTone(c.status))}>
                    {statusLabel(c.status)}: {c.count}
                  </span>
                ))}
              </span>
            </div>
          )}

          <div className={clsx('bg-white border border-gray-200 rounded-xl overflow-hidden', isLoading && shown && 'opacity-60')} aria-busy={isLoading}>
            {isLoading && !shown && (
              <div data-testid="admin-products-loading" className="flex items-center justify-center py-12">
                <Loader className="w-6 h-6 animate-spin text-forest-600" />
              </div>
            )}
            {shown && rows.length === 0 && (
              <p data-testid="admin-products-empty" className="text-sm text-gray-400 py-12 text-center">
                Ничего не найдено — попробуйте ослабить фильтры
              </p>
            )}
            {rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Продукт</th>
                      <th className="text-left px-4 py-2.5 font-medium">Вид</th>
                      <th className="text-left px-4 py-2.5 font-medium">Статус</th>
                      <th className="text-left px-4 py-2.5 font-medium">Владелец</th>
                      <th className="text-left px-4 py-2.5 font-medium">Хост</th>
                      <th className="text-left px-4 py-2.5 font-medium">Создан</th>
                      <th className="text-left px-4 py-2.5 font-medium">Оплачен до</th>
                      <th className="text-left px-4 py-2.5 font-medium">Активность</th>
                      <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap">Правок за {periodDays} дн</th>
                      <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap">Токенов за {periodDays} дн</th>
                    </tr>
                  </thead>
                  <tbody data-testid="admin-products-rows" className="divide-y divide-gray-100">
                    {rows.map((r) => (
                      <ProductRow key={r.id} row={r} onOpen={openProduct} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedId && (
        <AdminProductCard
          key={selectedId}
          productId={selectedId}
          periodDays={filters.periodDays}
          initial={selectedRow}
          onClose={closeProduct}
          onChanged={load}
        />
      )}
    </>
  );
};

const ProductRow: React.FC<{ row: AdminProductRow; onOpen: (id: string) => void }> = ({ row: r, onOpen }) => {
  const status = rowStatus(r);
  const overdue = isPast(r.paidUntil);
  const custom = r.customDomain;
  const customHost = custom?.domainUnicode || custom?.domain || null;
  // Ссылки в строке ведут на сайт, а не в карточку — и кликом, и Enter:
  // иначе событие всплывало бы до строки и открывало карточку поверх.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <tr
      data-testid={`admin-product-row-${r.id}`}
      onClick={() => onOpen(r.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.id); }}
      tabIndex={0}
      className="hover:bg-forest-50 transition-colors cursor-pointer align-top"
    >
      <td className="px-4 py-2.5 min-w-[14rem]">
        <div className="font-medium text-gray-900">{r.name || '—'}</div>
        <div className="text-xs text-gray-400 font-mono">{r.slug}</div>
        {r.domain && (
          <a
            data-testid={`admin-product-link-${r.id}`}
            href={`https://${r.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            onKeyDown={stop}
            className="block text-xs text-forest-700 hover:underline break-all"
          >
            {r.domain}
          </a>
        )}
        {custom && customHost && (
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
            {custom.status === 'active' ? (
              <a
                data-testid={`admin-product-custom-link-${r.id}`}
                href={`https://${custom.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={stop}
                onKeyDown={stop}
                className="text-xs text-forest-700 hover:underline break-all"
              >
                {customHost}
              </a>
            ) : (
              <span className="text-xs text-gray-700 break-all">{customHost}</span>
            )}
            {custom.status && (
              <span title={custom.status} className={clsx(badge, domainStatusTone(custom.status))}>
                {domainStatusLabel(custom.status)}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">
        <span className="inline-flex items-center gap-1">
          {r.kind === 'bot' ? <Bot className="w-3.5 h-3.5 text-gray-400" /> : <Globe className="w-3.5 h-3.5 text-gray-400" />}
          <span data-testid={`admin-product-kind-${r.id}`}>{kindLabel(r.kind)}</span>
        </span>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <span data-testid={`admin-product-status-${r.id}`} title={status} className={clsx(badge, statusTone(status))}>
          {statusLabel(status)}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="text-gray-900">{r.owner?.name || '—'}</div>
        {r.owner?.email && <div className="text-xs text-gray-500 break-all">{r.owner.email}</div>}
        {r.owner?.userId && <div className="text-xs text-gray-400 font-mono break-all">{r.owner.userId}</div>}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs text-gray-600" title={r.host?.id}>
        {r.host?.publicIp || '—'}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{formatDate(r.createdAt)}</td>
      <td
        data-testid={`admin-product-paid-${r.id}`}
        data-overdue={String(overdue)}
        title={overdue ? 'Срок оплаты аренды прошёл' : undefined}
        className={clsx('px-4 py-2.5 whitespace-nowrap', overdue ? 'text-red-600 font-medium' : 'text-gray-600')}
      >
        {formatDate(r.paidUntil)}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-gray-500" title={formatDateTime(r.lastActivityAt)}>
        {formatRelative(r.lastActivityAt)}
      </td>
      <td data-testid={`admin-product-turns-${r.id}`} className="px-4 py-2.5 text-right text-gray-900">
        {formatTokens(r.turnsInPeriod)}
      </td>
      <td data-testid={`admin-product-tokens-${r.id}`} className="px-4 py-2.5 text-right font-medium text-forest-800">
        {formatTokens(r.tokensInPeriod)}
      </td>
    </tr>
  );
};

export default AdminProductsView;
