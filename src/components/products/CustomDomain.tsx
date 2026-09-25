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

interface Props {
  product: Product;
  /**
   * Работающий свой домен появился или пропал. Он — главный адрес карточки,
   * а тот приходит со списком продуктов: список обязан перечитаться.
   */
  onChanged?: () => void;
}

export const CustomDomain: React.FC<Props> = ({ product, onChanged }) => {
  const { t } = useTranslation();
  const [view, setViewState] = useState<DomainView | null | undefined>(undefined);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Колбэк в ref: иначе новая стрелка родителя на каждом рендере пересоздавала
  // бы load, а с ним и эффект первой загрузки.
  const changed = useRef(onChanged);
  changed.current = onChanged;

  /** Работал ли домен в последнем известном состоянии; undefined — ещё не знаем. */
  const wasActive = useRef<boolean | undefined>(undefined);

  const setView = useCallback((next: DomainView | null) => {
    if (!alive.current) return;
    const isActive = next?.status === 'active';
    // Первая загрузка — не перемена: список пришёл уже с этим состоянием.
    if (wasActive.current !== undefined && wasActive.current !== isActive) changed.current?.();
    wasActive.current = isActive;
    setViewState(next);
  }, []);

  const load = useCallback(async () => {
    const r = await productsApi.getDomain(product.id);
    if (r.ok) setView(r.view);
  }, [product.id, setView]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = view?.status;
  useEffect(() => {
    if (!status || !MOVING.includes(status)) return undefined;
    const timer = setInterval(() => void load(), DOMAIN_POLL_MS);
    return () => clearInterval(timer);
  }, [status, load]);

  /**
   * Отказ — по машинному коду: `message` сервера русский, а кабинет на семи
   * языках. Незнакомый код (сервер новее кабинета) — запасной текст сервера,
   * а не сырой ключ перевода.
   */
  const explain = (p: Problem): string => {
    if (p.status === 0) return t('products.domain.errors.network');
    if (p.reason) {
      const key = `products.domain.reasons.${p.reason}`;
      const text = t(key);
      if (text && text !== key) return text;
    }
    return p.message || t('products.domain.errors.generic');
  };

  const failureText = (v: DomainView): string => {
    if (v.errorReason) {
      const key = `products.domain.errorReasons.${v.errorReason}`;
      const text = t(key);
      if (text && text !== key) return text;
    }
    return v.error || t('products.domain.status.failed');
  };

  const act = async (fn: () => Promise<{ ok: true; view: DomainView | null } | { ok: true; removed: 'now' | 'queued' } | Problem>) => {
    setBusy(true);
    setError(null);
    setConfirming(false);
    const r = await fn();
    if (!alive.current) return;
    setBusy(false);
    if (!r.ok) {
      setError(explain(r));
      // Отказ по существу (409/404/429) часто значит, что на экране уже не то,
      // что на сервере: заявку сняли, выпуск начался, отвязка идёт.
      await load();
      return;
    }
    if ('view' in r) setView(r.view);
    else if (r.removed === 'now') setView(null);
    else await load();
  };

  const attach = () => {
    const domain = input.trim();
    if (!domain) return;
    void act(() => productsApi.attachDomain(product.id, domain));
  };

  if (view === undefined) return null;

  const detachPending = view?.status === 'failed' && !!view.errorReason && DETACH_PENDING.includes(view.errorReason);
  const showRecords = view?.status === 'awaiting_dns' || (view?.status === 'failed' && !detachPending);
  const canCheck = view?.status === 'awaiting_dns' || (view?.status === 'failed' && !detachPending);
  const canDetach = !!view && view.status !== 'issuing' && view.status !== 'removing';

  return (
    <div className="px-4 pb-4 -mt-1">
      <div className="rounded-lg border border-gray-200 px-3 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-gray-900">
          <Globe className="w-4 h-4 text-gray-400 shrink-0" />
          {t('products.domain.title')}
          {view && (
            <span className={`text-xs font-normal ${view.status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>
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
                onChange={(e) => setInput(e.target.value)}
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
                  {view.records.map((r) => (
                    <tr key={`${r.type}-${r.fqdn}`} className="align-top">
                      <td className="pr-2 py-1">{r.type}</td>
                      <td className="pr-2 py-1 font-mono">{r.name}</td>
                      <td className="pr-2 py-1 font-mono break-all">{r.value}</td>
                      <td className="py-1">
                        <button
                          onClick={() => void navigator.clipboard?.writeText(r.value).catch(() => {})}
                          className="text-forest-700 hover:underline"
                        >
                          {t('products.domain.copy')}
                        </button>
                      </td>
                    </tr>
                  ))}
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
                <div className="text-xs text-gray-500">{t('products.domain.lastCheck')}</div>
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
