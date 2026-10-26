import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { productActionsApi, isProblem, type ActionSource, type ProductActionView } from '../../services/productActionsApi';
import type { Problem } from '../../services/productsApi';
import { extraSecretsPayload, validateExtraSecrets, type ExtraSecretError, type ExtraSecretRow, SECRET_NAME_MAX } from './secretNames';

/**
 * Карточка ожидающего действия продукта: удаление (кнопка) и создание бота
 * (токен и ключи). Значения уходят прямо на сервер — ни ассистент, ни история
 * чата их не видят; после отправки поля очищаются. Вся карточка скрыта от
 * Вебвизора (ym-hide-content), поля ключей — ym-disable-keys.
 *
 * Отказ ЗАГРУЗКИ карточки разбирается по статусу: 404 значит «такого
 * действия нет» (просрочено дольше окна карточки, отменено кем-то ещё) и
 * показывается как есть, а всё остальное (обрыв связи, 5xx, что угодно
 * ещё) — временный сбой со своей надписью и кнопкой «Повторить», которая
 * просто перечитывает карточку заново.
 *
 * Отказ ОТПРАВКИ — отдельно: 429 значит «слишком часто» (защита от того же
 * двойного нажатия, которое не поймал замок на этой же карточке — например,
 * вторая открытая вкладка), 0 — обрыв связи, остальное — текст сервера, если
 * он есть, иначе общее «не удалось».
 */
export function ProductActionCard({ actionId, via, onClose }: { actionId: string; via: ActionSource; onClose?: () => void }) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<ProductActionView | null>(null);
  // null — загрузка идёт или успешна; иначе различаем «нет такого действия»
  // от «сейчас не получилось» — у них разные тексты и у второго есть повтор.
  const [loadError, setLoadError] = useState<'notFound' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [rows, setRows] = useState<Array<ExtraSecretRow & { id: number }>>([]);
  const [rowErrors, setRowErrors] = useState<ExtraSecretError[]>([]);
  const nextId = useRef(1);
  // Замок ПО ССЫЛКЕ, а не только через setBusy: два клика подряд случаются в
  // одном тике, до того как React успеет применить disabled по новому
  // состоянию (см. doubleClick в src/test/dom.tsx) — своим же вторым нажатием
  // человек не должен отправить действие дважды.
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => () => {
    aliveRef.current = false;
  }, []);

  const load = async () => {
    const r = await productActionsApi.get(actionId);
    if (!aliveRef.current) return;
    if (isProblem(r)) {
      setLoadError(r.status === 404 ? 'notFound' : 'failed');
      return;
    }
    setLoadError(null);
    setView(r);
    setError(r.status === 'pending' && typeof r.result?.error === 'string' ? r.result.error : null);
  };

  useEffect(() => {
    void load();
    // actionId — единственная причина перечитать с нуля; load() всегда
    // читает актуальный actionId из замыкания текущего рендера.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId]);

  // Действие «в работе» (взято в обработку, двойное нажатие уже не страшно) —
  // карточка сама дотягивает исход опросом, а не ждёт, что человек обновит
  // страницу. Три предела: статус сменился, карточку размонтировали, 20
  // попыток (каждая — 3 с, то есть минута) истекли без исхода.
  useEffect(() => {
    if (view?.status !== 'working') return undefined;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > 20) {
        clearInterval(timer);
        return;
      }
      void (async () => {
        const r = await productActionsApi.get(actionId);
        if (!aliveRef.current) return;
        // Сбой самого опроса не портит карточку текстом «не удалось»: это
        // был бы ложный диагноз по единичному сбою сети, а не по действию.
        // Человек дождётся следующего тика или истечения отведённых попыток.
        if (isProblem(r)) return;
        setView(r);
        setError(r.status === 'pending' && typeof r.result?.error === 'string' ? r.result.error : null);
      })();
    }, 3000);
    return () => clearInterval(timer);
  }, [actionId, view?.status]);

  const fmt = (iso: string | null | undefined) =>
    iso ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(new Date(iso)) : '';

  const apply = (r: ProductActionView | Problem) => {
    if (isProblem(r)) {
      if (r.status === 429) setError(t('products.action.tooOften'));
      else if (r.status === 0) setError(t('products.action.network'));
      else setError(r.message || t('products.action.failed', { reason: '' }));
      return;
    }
    setView(r);
    setError(r.status === 'pending' && typeof r.result?.error === 'string' ? r.result.error : null);
    if (r.status !== 'pending') {
      setToken('');
      setRows([]);
    }
  };

  const run = async (fn: () => Promise<ProductActionView | Problem>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      apply(await fn());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submitBot = () => {
    if (!token.trim()) {
      setError(t('products.action.createBot.tokenRequired'));
      return;
    }
    const errs = validateExtraSecrets(rows);
    setRowErrors(errs);
    if (errs.some((e) => e.name || e.value)) return;
    void run(() => productActionsApi.submit(actionId, { set: { ...extraSecretsPayload(rows), BOT_TOKEN: token.trim() }, via }));
  };

  const name = view?.productName ?? '';
  let body: React.ReactNode;
  if (loadError === 'notFound') body = <p>{t('products.action.notFound')}</p>;
  else if (loadError === 'failed') {
    body = (
      <>
        <p>{t('products.action.loadFailed')}</p>
        <button type="button" onClick={() => void load()} className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs">
          {t('products.action.retry')}
        </button>
      </>
    );
  } else if (!view) body = <p className="opacity-60">{t('products.action.loading')}</p>;
  else if (view.status === 'working') body = <p>{t('products.action.working')}</p>;
  else if (view.status === 'expired') body = <p>{t('products.action.expired')}</p>;
  else if (view.status === 'cancelled') body = <p>{t('products.action.cancelled')}</p>;
  else if (view.status === 'failed') body = <p>{t('products.action.failed', { reason: view.result?.error ?? '' })}</p>;
  else if (view.status === 'done') {
    body = view.kind === 'delete'
      ? <p>{t('products.action.delete.done', { name, date: fmt(view.result?.restoreUntil) })}</p>
      : <p>{t('products.action.createBot.done', { name })}</p>;
  } else if (view.kind === 'delete') {
    body = (
      <>
        <p className="font-medium">{t('products.action.delete.title', { name })}</p>
        <p>{t('products.action.delete.body', { date: fmt(view.restoreUntil) })}</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void run(() => productActionsApi.submit(actionId, { confirm: true, via }))}
            className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium disabled:opacity-50">
            {t('products.action.delete.confirm')}
          </button>
          <button type="button" disabled={busy} onClick={() => void run(() => productActionsApi.cancel(actionId))}
            className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs">
            {t('products.action.cancel')}
          </button>
        </div>
      </>
    );
  } else if (view.kind === 'create_bot') {
    body = (
      <>
        <p className="font-medium">{t('products.action.createBot.title', { name })}</p>
        <p className="text-xs text-gray-600">{t('products.action.createBot.hint')}</p>
        <label className="block text-xs">
          {t('products.action.createBot.token')}
          <input data-testid="product-action-token" type="password" autoComplete="off" spellCheck={false}
            value={token} onChange={(e) => setToken(e.target.value)}
            className="ym-disable-keys mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5" />
        </label>
        <div role="group" className="space-y-2">
          <p className="text-xs font-medium">{t('products.action.createBot.extraTitle')}</p>
          {rows.map((row, i) => (
            <div key={row.id} className="flex gap-2">
              <input type="text" maxLength={SECRET_NAME_MAX} aria-label={t('products.action.createBot.keyName')}
                placeholder="API_KEY" value={row.name}
                onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))}
                className="w-2/5 rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
              <input data-testid="product-action-secret-value" type="password" autoComplete="off" spellCheck={false}
                aria-label={t('products.action.createBot.keyValue')} value={row.value}
                onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))}
                className="ym-disable-keys flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
              <button type="button" onClick={() => setRows(rows.filter((r) => r.id !== row.id))} className="text-xs text-gray-500">
                {t('products.action.createBot.removeKey')}
              </button>
              {(rowErrors[i]?.name || rowErrors[i]?.value) && (
                <span className="text-xs text-red-700">{t((rowErrors[i].name ?? rowErrors[i].value)!)}</span>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setRows([...rows, { id: nextId.current++, name: '', value: '' }])}
            className="text-xs text-forest-700">
            {t('products.action.createBot.addKey')}
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={submitBot}
            className="px-4 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-medium disabled:opacity-50">
            {busy ? t('products.action.createBot.submitting') : t('products.action.createBot.submit')}
          </button>
          <button type="button" disabled={busy} onClick={() => void run(() => productActionsApi.cancel(actionId))}
            className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs">
            {t('products.action.cancel')}
          </button>
        </div>
      </>
    );
  } else {
    body = <p>{t('products.action.keys.unsupported')}</p>;
  }

  return (
    <div data-testid="product-action-card" className="ym-hide-content not-prose my-2 rounded-xl border border-forest-200 bg-forest-50/40 p-3 space-y-3 text-sm">
      {body}
      {error && <p className="text-xs text-red-700">{error}</p>}
      {onClose && (
        <button type="button" onClick={onClose} className="text-xs text-gray-500">
          {t('products.action.close')}
        </button>
      )}
    </div>
  );
}
