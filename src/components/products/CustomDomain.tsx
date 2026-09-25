import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { productsApi } from '../../services/productsApi';
import type {
  DomainErrorReason,
  DomainRecordCheck,
  DomainStatus,
  DomainView,
  Problem,
  Product,
} from '../../services/productsApi';

/** Пока домен в движении, обновляемся сами: DNS и выпуск идут без участия человека. */
export const DOMAIN_POLL_MS = 10_000;
const MOVING: DomainStatus[] = ['awaiting_dns', 'issuing', 'removing'];

/**
 * Незавершённая отвязка. «Проверить снова» здесь выпустил бы домен заново, а
 * человек его отвязывал, — сервер такую проверку отобьёт (detach_pending).
 * Путь один: «Отвязать» ещё раз.
 */
const DETACH_PENDING: DomainErrorReason[] = ['orphan_removing', 'remove_failed'];

/**
 * Имя из DNS для глаз человека. Сервер отдаёт имена проверки в punycode
 * (`www.xn--e1afmkfd.xn--p1ai`), а человеческая форма есть только у самого
 * домена — поэтому подменяется ровно его хвост.
 */
function humanName(name: string, view: DomainView): string {
  if (!view.domainUnicode || view.domainUnicode === view.domain) return name;
  if (name === view.domain) return view.domainUnicode;
  if (name.endsWith(`.${view.domain}`)) {
    return `${name.slice(0, -view.domain.length)}${view.domainUnicode}`;
  }
  return name;
}

const Check: React.FC<{ c: DomainRecordCheck; view: DomainView }> = ({ c, view }) => {
  const { t } = useTranslation();
  // Порядок важен. Сбой резолвера даёт пустой current — это НЕ «записи нет»:
  // запись могла и быть, просто спросить не удалось.
  const text = c.ok
    ? t('products.domain.checkOk')
    : c.error
      ? t('products.domain.checkError', { code: c.error })
      : c.type === 'AAAA'
        ? t('products.domain.checkAaaa', { current: c.current.join(', ') })
        : c.current.length
          ? t('products.domain.checkNeed', { current: c.current.join(', '), want: c.want })
          : t('products.domain.checkMissing');
  return (
    <li className={`break-words ${c.ok ? 'text-green-700' : 'text-amber-700'}`}>
      {c.type} {humanName(c.name, view)}: {text}
    </li>
  );
};

/**
 * Время последней проверки — по языку кабинета, в местном времени. null —
 * проверки не было или строка битая (показывать «Invalid Date» хуже, чем ничего).
 */
export function formatCheckedAt(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(lang, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(at);
  } catch {
    return at.toLocaleString();
  }
}

/**
 * GET старше этого считается брошенным: опрос снова идёт, а его поздний ответ
 * отсекает проверка номера. Без потолка один зависший запрос (обрыв без
 * ошибки, прокси держит соединение) навсегда останавливал бы опрос.
 */
export const DOMAIN_GET_ABANDON_MS = 30_000;

/**
 * Ошибки, текст которых зовёт нажать «Проверить снова». В режиме «только
 * отвязка» такой кнопки нет — вместо них объясняем, почему.
 */
const NEEDS_CHECK_BUTTON: DomainErrorReason[] = ['issue_failed', 'orphan_issuing', 'agent_outdated'];

/** Сколько держится «Скопировано» / «не удалось» на кнопке копирования. */
const COPY_FLASH_MS = 2000;

type ActResult = { ok: true; view: DomainView | null } | { ok: true; removed: 'now' | 'queued' } | Problem;

interface Props {
  product: Product;
  /**
   * Работающий свой домен появился или пропал. Он — главный адрес карточки,
   * а тот приходит со списком продуктов: список обязан перечитаться.
   */
  onChanged?: () => void;
  /**
   * Только отвязка: продукт погашен администратором. Привязывать и выпускать
   * ему нельзя (гашение бывает за злоупотребление), а отвязать — можно и
   * нужно: сервер раздаёт задания домена и погашенным. Домена нет — блока нет.
   */
  detachOnly?: boolean;
}

export const CustomDomain: React.FC<Props> = ({ product, onChanged, detachOnly = false }) => {
  const { t, i18n } = useTranslation();
  // Тесты подменяют useTranslation заглушкой без i18n — как в карточке аренды.
  const lang = i18n?.language || 'ru';
  const [view, setViewState] = useState<DomainView | null | undefined>(undefined);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copyFlash, setCopyFlash] = useState<{ key: string; ok: boolean } | null>(null);

  const alive = useRef(true);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // Колбэк в ref: иначе новая стрелка родителя на каждом рендере пересоздавала
  // бы load, а с ним и эффект первой загрузки.
  const changed = useRef(onChanged);
  changed.current = onChanged;

  /**
   * Порядок ответов. Каждый запрос (GET и действие) берёт свой номер, и его
   * ответ применяется, только если номер всё ещё последний. Иначе GET опроса,
   * ушедший ДО отвязки и вернувшийся ПОСЛЕ неё, воскрешал бы снятый домен.
   */
  const seq = useRef(0);
  /**
   * Когда ушёл последний GET, который ещё не вернулся; null — в полёте нет.
   * Отметку снимает только сам последний GET: старый, вернувшись, не должен
   * снимать отметку нового.
   */
  const getSince = useRef<number | null>(null);
  const getSeq = useRef(0);
  /** Идёт действие: опрос в это время молчит — его ответ всё равно устарел бы. */
  const acting = useRef(false);

  /** Работал ли домен в последнем известном состоянии; undefined — ещё не знаем. */
  const wasActive = useRef<boolean | undefined>(undefined);
  /** Последний известный статус; undefined — ещё не загружали. */
  const lastStatus = useRef<DomainStatus | null | undefined>(undefined);

  const setView = useCallback((next: DomainView | null) => {
    if (!alive.current) return;
    const nextStatus = next?.status ?? null;
    // Статус сменился — прежняя ошибка и открытое подтверждение отвязки
    // относятся к тому, чего на экране уже нет.
    if (lastStatus.current !== undefined && lastStatus.current !== nextStatus) {
      setError(null);
      setConfirming(false);
    }
    lastStatus.current = nextStatus;
    const isActive = nextStatus === 'active';
    // Первая загрузка — не перемена: список пришёл уже с этим состоянием.
    if (wasActive.current !== undefined && wasActive.current !== isActive) changed.current?.();
    wasActive.current = isActive;
    setViewState(next);
  }, []);

  /**
   * Перечитать состояние. Возвращает свежий вид; undefined — ответа нет
   * (сбой или его обогнал более новый запрос). Сбой вид НЕ стирает: мигнувшая
   * сеть при опросе не должна убирать с экрана таблицу записей.
   */
  const load = useCallback(async (): Promise<DomainView | null | undefined> => {
    const my = ++seq.current;
    const myGet = ++getSeq.current;
    getSince.current = Date.now();
    try {
      const r = await productsApi.getDomain(product.id);
      if (my !== seq.current || !r.ok) return undefined;
      setView(r.view);
      return r.view;
    } finally {
      if (myGet === getSeq.current) getSince.current = null;
    }
  }, [product.id, setView]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = view?.status;
  useEffect(() => {
    if (!status || !MOVING.includes(status)) return undefined;
    const timer = setInterval(() => {
      // Идёт действие или прошлый GET ещё не вернулся — тик пропускаем. Но
      // зависший дольше DOMAIN_GET_ABANDON_MS считается брошенным.
      if (acting.current) return;
      if (getSince.current !== null && Date.now() - getSince.current < DOMAIN_GET_ABANDON_MS) return;
      void load();
    }, DOMAIN_POLL_MS);
    return () => clearInterval(timer);
  }, [status, load]);

  /**
   * Отказ — по машинному коду: `message` сервера русский, а кабинет на семи
   * языках. Незнакомый код (сервер новее кабинета) — запасной текст сервера,
   * а не сырой ключ перевода.
   */
  const explain = (p: Problem, known: DomainView | null | undefined): string => {
    if (p.status === 0) return t('products.domain.errors.network');
    if (p.reason === 'has_domain' && known) {
      return t('products.domain.hasDomainNamed', { domain: known.domainUnicode || known.domain });
    }
    if (p.reason) {
      const key = `products.domain.reasons.${p.reason}`;
      const text = t(key);
      if (text && text !== key) return text;
    }
    return p.message || t('products.domain.errors.generic');
  };

  const failureText = (v: DomainView): string => {
    if (detachOnly && v.errorReason && NEEDS_CHECK_BUTTON.includes(v.errorReason)) {
      return t('products.domain.detachOnlyNote');
    }
    if (v.errorReason) {
      const key = `products.domain.errorReasons.${v.errorReason}`;
      const text = t(key);
      if (text && text !== key) return text;
    }
    return v.error || t('products.domain.status.failed');
  };

  const act = async (fn: () => Promise<ActResult>) => {
    acting.current = true;
    setBusy(true);
    setError(null);
    setConfirming(false);
    const my = ++seq.current;
    let r: ActResult;
    try {
      r = await fn();
    } finally {
      acting.current = false;
    }
    if (!alive.current) return;
    setBusy(false);
    if (my !== seq.current) return;
    if (!r.ok) {
      // Отказ по существу (409/404/429) часто значит, что на экране уже не то,
      // что на сервере: заявку сняли, выпуск начался, отвязка идёт. Ошибка
      // ставится ПОСЛЕ перечитки: смена статуса гасит прежние ошибки, а эту
      // человек должен увидеть.
      const fresh = r.status === 0 ? undefined : await load();
      if (!alive.current) return;
      setError(explain(r, fresh === undefined ? view : fresh));
      return;
    }
    if ('view' in r) setView(r.view);
    else if (r.removed === 'now') setView(null);
    else await load();
  };

  const copyValue = async (value: string, key: string, cell: HTMLElement | null) => {
    let ok = true;
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(value);
    } catch {
      ok = false;
      // Буфер недоступен (нет разрешения, не https) — выделяем значение,
      // чтобы его можно было скопировать руками.
      if (cell) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(cell);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    if (!alive.current) return;
    setCopyFlash({ key, ok });
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => {
      if (alive.current) setCopyFlash(null);
    }, COPY_FLASH_MS);
  };

  const attach = () => {
    const domain = input.trim();
    if (!domain) return;
    void act(() => productsApi.attachDomain(product.id, domain));
  };

  if (view === undefined) return null;
  if (detachOnly && view === null) return null;

  const detachPending = view?.status === 'failed' && !!view.errorReason && DETACH_PENDING.includes(view.errorReason);
  const canCheck = !detachOnly && (view?.status === 'awaiting_dns' || (view?.status === 'failed' && !detachPending));
  const showRecords = canCheck;
  const checkedAt = formatCheckedAt(view?.checkedAt, lang);
  const canDetach = !!view && view.status !== 'issuing' && view.status !== 'removing';

  return (
    <div className="px-4 pb-4 -mt-1">
      <div className="rounded-lg border border-gray-200 px-3 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-gray-900">
          <Globe className="w-4 h-4 text-gray-400 shrink-0" />
          {t('products.domain.title')}
          {view && (
            <span
              aria-live="polite"
              className={`text-xs font-normal ${view.status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}
            >
              — {t(`products.domain.status.${view.status}`)}
            </span>
          )}
        </div>

        {!view && (
          <>
            <div className="mt-2 flex flex-col gap-2 md:flex-row">
              <label htmlFor={`domain-${product.id}`} className="sr-only">
                {t('products.domain.label')}
              </label>
              <input
                id={`domain-${product.id}`}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) attach();
                }}
                placeholder={t('products.domain.placeholder')}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="url"
                className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2"
              />
              <button
                onClick={attach}
                disabled={busy || !input.trim()}
                className="px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 text-white disabled:opacity-60"
              >
                {busy ? t('products.domain.attaching') : t('products.domain.attach')}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">{t('products.domain.free')}</p>
          </>
        )}

        {view && view.status === 'active' && (
          <a
            href={`https://${view.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-forest-700 hover:underline break-all"
          >
            {view.domainUnicode || view.domain}
          </a>
        )}

        {view && view.status !== 'active' && (
          <div className="mt-1 font-mono text-gray-700 break-all">{view.domainUnicode || view.domain}</div>
        )}

        {view && view.status === 'failed' && (
          <div className="mt-2 text-red-700 break-words">
            <p>{failureText(view)}</p>
            {/*
              Сырой отказ Let's Encrypt — длинный и технический, но без него
              не понять, какая именно запись мешает. Свёрнут и со своей
              прокруткой, как причина сорванного заведения в карточке.
            */}
            {view.errorReason === 'issue_failed' && view.error && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-gray-600">{t('products.domain.details')}</summary>
                <div className="mt-1 max-h-32 overflow-y-auto rounded bg-red-50 border border-red-200 px-2 py-1 text-xs text-red-800 font-mono whitespace-pre-wrap break-words">
                  {view.error}
                </div>
              </details>
            )}
          </div>
        )}

        {view && showRecords && (
          <div className="mt-2 space-y-2">
            <p>{t('products.domain.recordsIntro')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pr-2 font-normal">{t('products.domain.colType')}</th>
                    <th className="pr-2 font-normal">{t('products.domain.colName')}</th>
                    <th className="pr-2 font-normal">{t('products.domain.colValue')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {view.records.map((r) => {
                    const key = `${r.type}-${r.fqdn}`;
                    const flash = copyFlash?.key === key ? copyFlash : null;
                    const cellId = `domain-${product.id}-${key}`;
                    return (
                      <tr key={key} className="align-top">
                        <td className="pr-2 py-1">{r.type}</td>
                        <td className="pr-2 py-1 font-mono">{r.name}</td>
                        <td id={cellId} className="pr-2 py-1 font-mono break-all">
                          {r.value}
                        </td>
                        <td className="py-1 whitespace-nowrap">
                          <button
                            onClick={() => void copyValue(r.value, key, document.getElementById(cellId))}
                            aria-label={t('products.domain.copyAria', { type: r.type, name: r.name })}
                            className={flash && !flash.ok ? 'text-amber-700' : 'text-forest-700 hover:underline'}
                          >
                            {flash
                              ? flash.ok
                                ? t('products.domain.copied')
                                : t('products.domain.copyFailed')
                              : t('products.domain.copy')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-amber-700">{t('products.domain.deleteOthers')}</p>
            {view.status === 'awaiting_dns' && (
              <>
                <p className="text-gray-500">{t('products.domain.oldSite')}</p>
                <p className="text-gray-500">{t('products.domain.propagation')}</p>
              </>
            )}
            {view.check && view.check.length > 0 && (
              <div>
                <div className="text-xs text-gray-500">
                  {checkedAt ? `${t('products.domain.lastCheck')} ${checkedAt}` : t('products.domain.lastCheck')}
                </div>
                <ul className="text-xs">
                  {view.check.map((c, i) => (
                    <Check key={`${c.type}-${c.name}-${i}`} c={c} view={view} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {view && confirming && (
          <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-red-800">
              {t('products.domain.detachConfirm', { domain: view.domainUnicode || view.domain })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => void act(() => productsApi.detachDomain(product.id))}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
              >
                {t('products.domain.detachYes')}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700"
              >
                {t('products.domain.detachCancel')}
              </button>
            </div>
          </div>
        )}

        {view && !confirming && (canCheck || canDetach) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {canCheck && (
              <button
                onClick={() => void act(() => productsApi.checkDomain(product.id))}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 text-gray-700 disabled:opacity-60"
              >
                {view.status === 'failed' ? t('products.domain.checkAgain') : t('products.domain.checkNow')}
              </button>
            )}
            {canDetach && (
              <button
                onClick={() => {
                  // Работающий домен отвязывать — значит уронить сайт по этому
                  // адресу: спрашиваем. Заявку, которая ещё не работает,
                  // снимаем сразу — ломать нечего.
                  if (view.status === 'active') setConfirming(true);
                  else void act(() => productsApi.detachDomain(product.id));
                }}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 text-red-700 disabled:opacity-60"
              >
                {t('products.domain.detach')}
              </button>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-2 text-xs text-red-600 break-words">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
