import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader, AlertCircle, Globe, Send, Bot, ShieldAlert, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { formatTokens } from './callsFormat';
import {
  availableAction,
  describeBlock,
  detailUrl,
  describeUnblock,
  domainStatusLabel,
  domainStatusTone,
  formatDate,
  formatDateTime,
  formatRelative,
  isPast,
  jobKindLabel,
  kindLabel,
  normalizeDetail,
  periodLabel,
  preview,
  problemText,
  rowStatus,
  statusLabel,
  statusTone,
  workStatusLabel,
  workStatusTone,
  NETWORK_ERROR,
  type AdminProductDetail,
  type AdminProductRow,
  type AdminProductTurn,
} from './adminProducts';

interface Props {
  productId: string;
  /** Период списка: карточка считает правки и токены за тот же срок. */
  periodDays: number;
  /** Строка из списка — чтобы шапка не пустовала, пока грузится карточка. */
  initial?: AdminProductRow | null;
  onClose: () => void;
  /** Состояние продукта изменилось (погашен или снят блок) — пора перечитать список. */
  onChanged?: () => void;
}

type Mode = 'idle' | 'block' | 'unblock';

const badge = 'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap';

/**
 * Карточка продукта: все поля, домен, правки, задания и два действия —
 * «Погасить» (с обязательной причиной) и «Снять блок». Оба действия — через
 * существующие ручки POST /webhook/products/block и /unblock; ключ — id
 * продукта, так сервер не гадает, домен это, слаг или идентификатор.
 */
const AdminProductCard: React.FC<Props> = ({ productId, periodDays, initial = null, onClose, onChanged }) => {
  const [detail, setDetail] = useState<AdminProductDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Замок от двойного нажатия: состояние `busy` доходит до кнопки только со
  // следующей отрисовкой, а два клика в одном тике увидели бы его пустым.
  const busyRef = useRef(false);
  const reqRef = useRef(0);
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;

  const loadDetail = useCallback(async () => {
    const req = ++reqRef.current;
    setIsLoading(true);
    try {
      const res = await apiClient.get(detailUrl(productId, periodDays));
      if (!res.ok) {
        const msg = await problemText(res);
        if (req === reqRef.current) setError(msg);
        return;
      }
      const next = normalizeDetail(await res.json().catch(() => null));
      if (req !== reqRef.current) return;
      if (!next) {
        setError('Ответ сервера не похож на карточку продукта');
        return;
      }
      setDetail(next);
      setError(null);
    } catch {
      if (req === reqRef.current) setError(NETWORK_ERROR);
    } finally {
      if (req === reqRef.current) setIsLoading(false);
    }
  }, [productId, periodDays]);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setMode('idle');
    setReason('');
    setActionError(null);
    setActionResult(null);
    setExpanded({});
    loadDetail();
    // Ответ, пришедший после закрытия или смены карточки, не должен в неё лечь:
    // уборка сдвигает счётчик запросов. Нужен именно последний его номер, а не
    // снятый при запуске эффекта, — поэтому берётся сам ref, а не его значение.
    const requests = reqRef;
    return () => { requests.current++; };
  }, [loadDetail]);

  const cancel = useCallback(() => {
    setMode('idle');
    setReason('');
    setActionError(null);
  }, []);

  // Escape: сначала закрывает открытую форму действия, и только потом карточку —
  // иначе промах по клавише стирал бы набранную причину вместе с карточкой.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modeRef.current !== 'idle') {
        cancel();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, cancel]);

  const product = detail?.product ?? initial;
  const action = detail ? availableAction(detail.product) : null;
  const key = detail?.product.id || productId;

  const run = async (kind: 'block' | 'unblock') => {
    const why = reason.trim();
    if (busyRef.current || (kind === 'block' && !why)) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    setActionResult(null);
    try {
      const res = kind === 'block'
        ? await apiClient.post('/webhook/products/block', { key, reason: why })
        : await apiClient.post('/webhook/products/unblock', { key });
      if (!res.ok) {
        setActionError(await problemText(res));
        return;
      }
      const body = await res.json().catch(() => null);
      setActionResult(kind === 'block' ? describeBlock(body) : describeUnblock(body));
      setMode('idle');
      setReason('');
      onChanged?.();
      await loadDetail();
    } catch {
      setActionError(NETWORK_ERROR);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const startAction = (next: Mode) => {
    setMode(next);
    setActionError(null);
    setActionResult(null);
  };

  const status = product ? rowStatus(product) : null;
  const turns = detail?.turns ?? [];
  const jobs = detail?.jobs ?? [];

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Карточка продукта">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div data-testid="admin-product-card" className="w-full max-w-2xl bg-gray-50 shadow-2xl overflow-y-auto flex flex-col">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {product?.kind === 'bot'
                ? <Bot className="w-5 h-5 text-forest-600 flex-shrink-0" />
                : <Globe className="w-5 h-5 text-forest-600 flex-shrink-0" />}
              <h2 className="text-lg font-semibold text-gray-900 break-words">{product?.name || 'Продукт'}</h2>
              {status && (
                <span data-testid="admin-product-card-status" title={status} className={clsx(badge, statusTone(status))}>
                  {statusLabel(status)}
                </span>
              )}
            </div>
            {product && (
              <p className="mt-0.5 text-xs text-gray-500">
                {kindLabel(product.kind)} · <span className="font-mono">{product.slug}</span>
              </p>
            )}
          </div>
          <button
            data-testid="admin-product-card-close"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex-shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-4 md:p-6 space-y-5">
          {error && (
            <div data-testid="admin-product-card-error" className="flex items-start gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isLoading && !detail && (
            <div data-testid="admin-product-card-loading" className="flex items-center justify-center py-16">
              <Loader className="w-6 h-6 animate-spin text-forest-600" />
            </div>
          )}

          {detail && (
            <>
              <Actions
                action={action}
                mode={mode}
                reason={reason}
                busy={busy}
                slug={detail.product.slug}
                result={actionResult}
                error={actionError}
                onStart={startAction}
                onReason={setReason}
                onCancel={cancel}
                onRun={run}
              />
              <Reasons product={detail.product} />
              <Fields product={detail.product} periodDays={detail.periodDays} />
              <DomainBlock detail={detail} />
              <Section title="Правки" count={turns.length}>
                {turns.length === 0 ? (
                  <p className="text-sm text-gray-400">Правок нет</p>
                ) : (
                  <ul className="space-y-2">
                    {turns.map((t) => (
                      <TurnItem
                        key={t.id}
                        turn={t}
                        open={!!expanded[t.id]}
                        onToggle={() => setExpanded((s) => ({ ...s, [t.id]: !s[t.id] }))}
                      />
                    ))}
                  </ul>
                )}
              </Section>
              <Section title="Задания машины продуктов" count={jobs.length}>
                {jobs.length === 0 ? (
                  <p className="text-sm text-gray-400">Заданий нет</p>
                ) : (
                  <ul className="space-y-2">
                    {jobs.map((j) => (
                      <li key={j.id} data-testid={`admin-product-job-${j.id}`} className="bg-white rounded-lg border border-gray-200 p-3 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">{jobKindLabel(j.kind)}</span>
                          <span title={j.status} className={clsx(badge, workStatusTone(j.status))}>{workStatusLabel(j.status)}</span>
                          <span className="text-xs text-gray-400">
                            {formatDateTime(j.createdAt)} → {j.finishedAt ? formatDateTime(j.finishedAt) : '…'}
                          </span>
                        </div>
                        {j.error && (
                          <p className="mt-1.5 text-xs text-red-700 bg-red-50 rounded px-2 py-1 whitespace-pre-wrap break-words">{j.error}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface ActionsProps {
  action: 'block' | 'unblock' | null;
  mode: Mode;
  reason: string;
  busy: boolean;
  slug: string;
  result: string | null;
  error: string | null;
  onStart: (m: Mode) => void;
  onReason: (v: string) => void;
  onCancel: () => void;
  onRun: (kind: 'block' | 'unblock') => void;
}

const Actions: React.FC<ActionsProps> = ({ action, mode, reason, busy, slug, result, error, onStart, onReason, onCancel, onRun }) => (
  <div className="space-y-3">
    {result && (
      <div data-testid="admin-product-action-result" className="flex items-start gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{result}</span>
      </div>
    )}
    {error && (
      <div data-testid="admin-product-action-error" className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    )}

    {action === null && (
      <p className="text-sm text-gray-500">Продукт в архиве — гасить и снимать блок нельзя.</p>
    )}

    {action === 'block' && mode === 'idle' && (
      <button
        data-testid="admin-product-block"
        onClick={() => onStart('block')}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-300 text-red-700 hover:bg-red-50"
      >
        <ShieldAlert className="w-4 h-4" />
        Погасить
      </button>
    )}
    {action === 'block' && mode === 'block' && (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
        <p className="text-sm text-red-800">
          Контейнер продукта остановят, адрес сайта уйдёт на заглушку, идущая правка владельца оборвётся.
          Пополнение баланса продукт не разбудит — вернуть его сможет только администратор.
        </p>
        <label htmlFor="admin-product-block-reason" className="block text-xs font-medium text-gray-700">
          За что гасим — причину владелец увидит в карточке своего продукта
        </label>
        <textarea
          id="admin-product-block-reason"
          data-testid="admin-product-block-reason"
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          rows={3}
          autoFocus
          disabled={busy}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:border-red-400 focus:ring-1 focus:ring-red-200 outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <button
            data-testid="admin-product-block-confirm"
            onClick={() => onRun('block')}
            disabled={busy || !reason.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader className="w-4 h-4 animate-spin" />}
            Подтвердить гашение
          </button>
          <button
            data-testid="admin-product-block-cancel"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-white disabled:opacity-50"
          >
            Отмена
          </button>
        </div>
      </div>
    )}

    {action === 'unblock' && mode === 'idle' && (
      <button
        data-testid="admin-product-unblock"
        onClick={() => onStart('unblock')}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-forest-300 text-forest-700 hover:bg-forest-50"
      >
        <ShieldCheck className="w-4 h-4" />
        Снять блок
      </button>
    )}
    {action === 'unblock' && mode === 'unblock' && (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
        <p className="text-sm text-amber-900">
          Снять блокировку с «{slug}»? Продукт вернётся в сон, и ему поставят пробуждение; причина блокировки сотрётся.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            data-testid="admin-product-unblock-confirm"
            onClick={() => onRun('unblock')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {busy && <Loader className="w-4 h-4 animate-spin" />}
            Да, снять блок
          </button>
          <button
            data-testid="admin-product-unblock-cancel"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-white disabled:opacity-50"
          >
            Отмена
          </button>
        </div>
      </div>
    )}
  </div>
);

/** Причины сна, блокировки и сорванного заведения — видны сразу, без раскрытия. */
const Reasons: React.FC<{ product: AdminProductRow }> = ({ product }) => {
  const items = [
    { label: 'Причина блокировки', text: product.blockReason, tone: 'border-red-200 bg-red-50 text-red-800' },
    { label: 'Причина сна', text: product.sleepReason, tone: 'border-gray-200 bg-white text-gray-800' },
  ].filter((i) => i.text);
  if (items.length === 0 && !product.provisionError) return null;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.label} className={clsx('rounded-lg border px-3 py-2 text-sm', i.tone)}>
          <div className="text-xs font-medium opacity-70 mb-0.5">{i.label}</div>
          <div className="whitespace-pre-wrap break-words">{i.text}</div>
        </div>
      ))}
      {product.provisionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <div className="text-xs font-medium opacity-70 mb-0.5">Ошибка заведения</div>
          <pre className="text-xs whitespace-pre-wrap break-words font-mono max-h-48 overflow-y-auto">{product.provisionError}</pre>
        </div>
      )}
    </div>
  );
};

/** `periodDays` — из ответа: число называет сервер, за какой срок он и посчитал. */
const Fields: React.FC<{ product: AdminProductRow; periodDays: number | null }> = ({ product: p, periodDays }) => {
  const overdue = isPast(p.paidUntil);
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'ID', value: <span className="font-mono text-xs break-all">{p.id}</span> },
    {
      label: 'Адрес платформы',
      value: p.domain ? (
        <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" className="text-forest-700 hover:underline break-all">
          {p.domain}
        </a>
      ) : '—',
    },
    {
      label: 'Владелец',
      value: (
        <span className="flex flex-col">
          <span>{p.owner?.name || '—'}</span>
          {p.owner?.email && <span className="text-xs text-gray-500 break-all">{p.owner.email}</span>}
          {p.owner?.userId && <span className="text-xs text-gray-400 font-mono break-all">{p.owner.userId}</span>}
        </span>
      ),
    },
    {
      label: 'Хост',
      value: p.host ? (
        <span className="flex flex-col">
          <span className="font-mono">{p.host.publicIp || '—'}</span>
          <span className="text-xs text-gray-400 font-mono break-all">{p.host.id}</span>
        </span>
      ) : '—',
    },
    { label: 'Создан', value: formatDateTime(p.createdAt) },
    ...(p.archivedAt ? [{ label: 'В архиве с', value: formatDateTime(p.archivedAt) }] : []),
    {
      label: 'Оплачен до',
      value: (
        <span
          data-testid="admin-product-card-paid"
          data-overdue={String(overdue)}
          className={clsx(overdue && 'text-red-600 font-medium')}
        >
          {formatDate(p.paidUntil)}
          {overdue && ' · просрочено'}
        </span>
      ),
    },
    { label: 'Раннер на связи', value: <span title={formatDateTime(p.runnerSeenAt)}>{formatRelative(p.runnerSeenAt)}</span> },
    { label: 'Последняя правка', value: <span title={formatDateTime(p.lastTurnAt)}>{formatRelative(p.lastTurnAt)}</span> },
    { label: 'Последняя активность', value: <span title={formatDateTime(p.lastActivityAt)}>{formatRelative(p.lastActivityAt)}</span> },
    { label: `Правок ${periodLabel(periodDays)}`, value: formatTokens(p.turnsInPeriod) },
    { label: `Токенов ${periodLabel(periodDays)}`, value: formatTokens(p.tokensInPeriod) },
  ];
  return (
    <dl className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-3 gap-3 px-4 py-2">
          <dt className="text-gray-500">{r.label}</dt>
          <dd className="col-span-2 text-gray-900 min-w-0">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
};

/**
 * Свой домен. Подробности — из `domain` карточки; если бэкенд их не прислал,
 * хватает краткого `customDomain` строки списка.
 */
const DomainBlock: React.FC<{ detail: AdminProductDetail }> = ({ detail }) => {
  const full = detail.domain;
  const short = detail.product.customDomain;
  const domain = full?.domain ?? short?.domain ?? null;
  const unicode = full?.domainUnicode || short?.domainUnicode || domain;
  const status = full?.status ?? short?.status ?? null;
  const names = full && Array.isArray(full.names) ? full.names : [];
  return (
    <Section title="Свой домен" testId="admin-product-domain">
      {!domain ? (
        <p className="text-sm text-gray-400">Своего домена нет</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-1.5 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            {status === 'active' ? (
              <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="font-medium text-forest-700 hover:underline break-all">
                {unicode}
              </a>
            ) : (
              <span className="font-medium text-gray-900 break-all">{unicode}</span>
            )}
            {status && <span title={status} className={clsx(badge, domainStatusTone(status))}>{domainStatusLabel(status)}</span>}
          </div>
          {unicode !== domain && <div className="text-xs text-gray-400 font-mono break-all">{domain}</div>}
          {names.length > 0 && (
            <div className="text-xs text-gray-600">
              Имена: <span className="break-all">{names.join(', ')}</span>
            </div>
          )}
          {full?.error && (
            <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 whitespace-pre-wrap break-words">
              {full.error}
              {full.errorReason && <span className="text-red-400"> ({full.errorReason})</span>}
            </p>
          )}
          {full?.checkedAt && <div className="text-xs text-gray-400">Проверен {formatDateTime(full.checkedAt)}</div>}
        </div>
      )}
    </Section>
  );
};

const TurnItem: React.FC<{ turn: AdminProductTurn; open: boolean; onToggle: () => void }> = ({ turn: t, open, onToggle }) => (
  <li data-testid={`admin-product-turn-${t.id}`} className="bg-white rounded-lg border border-gray-200 p-3 text-sm">
    <div className="flex items-center gap-2 flex-wrap">
      {t.channel === 'telegram'
        ? <Send role="img" aria-label="Telegram" className="w-3.5 h-3.5 text-sky-600" />
        : <Globe role="img" aria-label="Веб" className="w-3.5 h-3.5 text-gray-500" />}
      <span title={t.status} className={clsx(badge, workStatusTone(t.status))}>{workStatusLabel(t.status)}</span>
      {t.tokensSpent != null && <span className="text-xs text-gray-600">{formatTokens(t.tokensSpent)} ток.</span>}
      <span className="text-xs text-gray-400">
        {formatDateTime(t.startedAt)} → {t.finishedAt ? formatDateTime(t.finishedAt) : '…'}
      </span>
      <button
        data-testid={`admin-product-turn-toggle-${t.id}`}
        onClick={onToggle}
        aria-expanded={open}
        className="ml-auto text-xs text-forest-700 hover:underline"
      >
        {open ? 'скрыть' : 'показать'}
      </button>
    </div>
    {open ? (
      <div className="mt-2 space-y-2">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Запрос</div>
          <pre className="text-xs whitespace-pre-wrap break-words font-sans bg-gray-50 rounded p-2">{t.prompt || '—'}</pre>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Ответ</div>
          <pre className="text-xs whitespace-pre-wrap break-words font-sans bg-gray-50 rounded p-2">{t.result || '—'}</pre>
        </div>
      </div>
    ) : (
      <p className="mt-1 text-gray-700 break-words">{preview(t.prompt) || '—'}</p>
    )}
    {t.error && (
      <p className="mt-1.5 text-xs text-red-700 bg-red-50 rounded px-2 py-1 whitespace-pre-wrap break-words">{t.error}</p>
    )}
  </li>
);

const Section: React.FC<{ title: string; count?: number; testId?: string; children: React.ReactNode }> = ({ title, count, testId, children }) => (
  <section data-testid={testId} className="space-y-2">
    <h3 className="text-sm font-semibold text-gray-900">
      {title}
      {count !== undefined && count > 0 && <span className="ml-1.5 text-gray-400 font-normal">{count}</span>}
    </h3>
    {children}
  </section>
);

export default AdminProductCard;
