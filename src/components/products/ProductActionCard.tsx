import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { productActionsApi, isProblem, type ActionSource, type ProductActionView } from '../../services/productActionsApi';
import type { Problem } from '../../services/productsApi';
import {
  EXTRA_SECRETS_MAX,
  SECRET_NAME_MAX,
  extraSecretsPayload,
  validateExtraSecrets,
  type ExtraSecretError,
  type ExtraSecretRow,
} from './secretNames';

/** Период опроса «в работе» и предел попыток — см. комментарий у эффекта опроса ниже. */
const WORKING_POLL_MS = 3000;
const WORKING_POLL_MAX_ATTEMPTS = 20;

/**
 * Карточка ожидающего действия продукта: удаление (кнопка) и создание бота
 * (токен и ключи). Значения уходят прямо на сервер — ни ассистент, ни история
 * чата их не видят. Вся карточка скрыта от Вебвизора (ym-hide-content), поля
 * ключей — ym-disable-keys.
 *
 * Поля формы (токен, строки ключей) остаются на месте после отказа, который
 * человек может поправить сам (Telegram не принял токен, занятое имя ключа):
 * набирать уже введённые значения заново не нужно, достаточно поправить одно
 * поле и нажать кнопку снова. Стираются они, только когда действие покидает
 * `pending` — получилось (`done`) или карточка больше не ждёт ввода вовсе
 * (`working`/`failed`/`expired`/`cancelled`), — а также при смене `actionId`:
 * вторая карточка не должна унаследовать значения первой.
 *
 * Отказ ЗАГРУЗКИ карточки разбирается по статусу: 404 значит «такого
 * действия нет» (просрочено дольше окна карточки, отменено кем-то ещё) и
 * показывается как есть, а всё остальное (обрыв связи, 5xx, что угодно
 * ещё) — временный сбой со своей надписью и кнопкой «Повторить», которая
 * просто перечитывает карточку заново.
 *
 * Отказ ОТПРАВКИ — отдельно: 429 значит «слишком часто» (защита от того же
 * двойного нажатия, которое не поймал замок на этой же карточке — например,
 * вторая открытая вкладка), 404 — действие уже не существует, 0 — обрыв
 * связи, остальное — текст сервера, если он есть, иначе общее «не удалось»
 * без повисшего «причина:» (см. `failedGeneric`).
 *
 * `result.error`, который сервер кладёт в тело ответа (например, отказ
 * Telegram на токен), показывается КАК ЕСТЬ, без перевода: это известное
 * ограничение уровня плана — текст у сервера русский на всех языках
 * кабинета, своего перевода у произвольного текста стороннего сервиса нет.
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
  // Опрос «в работе» остановился, не дождавшись исхода (20 попыток, минута).
  // Отдельно от view.status: сам статус всё ещё 'working', но сторож дальше
  // не стучится сам — дальше решает человек кнопкой «Проверить снова».
  const [pollStalled, setPollStalled] = useState(false);
  // Растёт при нажатии «Проверить снова» после остановки опроса — участвует
  // в зависимостях эффекта опроса ровно для того, чтобы завести его заново
  // со свежим счётчиком попыток.
  const [pollEpoch, setPollEpoch] = useState(0);
  const nextId = useRef(1);
  // Замок ПО ССЫЛКЕ, а не только через setBusy: два клика подряд случаются в
  // одном тике, до того как React успеет применить disabled по новому
  // состоянию (см. doubleClick в src/test/dom.tsx) — своим же вторым нажатием
  // человек не должен отправить действие дважды.
  const busyRef = useRef(false);
  // true — компонент на экране. Не useEffect(() => () => { aliveRef.current
  // = false }, []) САМ ПО СЕБЕ: StrictMode в разработке монтирует эффекты
  // дважды (эффект — снятие — эффект), и если тело эффекта ничего не
  // устанавливает, снятие первого прохода гасит флаг навсегда, а второй
  // проход его не поднимает — карточка застревает на «Загрузка…», потому что
  // load() ниже всегда видит aliveRef.current === false. Флаг поднимается
  // явно при каждом монтировании эффекта.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Поколение текущего actionId. Растёт при каждой смене actionId — ответ
  // запроса, ушедшего ДО смены и вернувшегося ПОСЛЕ, несёт чужое поколение и
  // применяться не должен: иначе вторая карточка на секунду показала бы
  // данные первой, а то и получила бы её токен обратно в поле.
  const genRef = useRef(0);

  const load = async (id: string, gen: number) => {
    const r = await productActionsApi.get(id);
    if (!aliveRef.current || gen !== genRef.current) return;
    if (isProblem(r)) {
      setLoadError(r.status === 404 ? 'notFound' : 'failed');
      return;
    }
    setLoadError(null);
    setView(r);
    setError(r.status === 'pending' && typeof r.result?.error === 'string' ? r.result.error : null);
  };

  useEffect(() => {
    genRef.current += 1;
    const gen = genRef.current;
    // Сброс НА СМЕНУ actionId, а не только на ответ load(): до первого ответа
    // новой карточки на экране не должно оставаться ни вида, ни токена, ни
    // строк ключей от предыдущей.
    setView(null);
    setLoadError(null);
    setError(null);
    setToken('');
    setRows([]);
    setRowErrors([]);
    setPollStalled(false);
    void load(actionId, gen);
    // actionId — единственная причина перечитать с нуля; load() всегда
    // читает актуальный actionId из аргумента, а не из замыкания.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId]);

  // Действие «в работе» (взято в обработку, двойное нажатие уже не страшно) —
  // карточка сама дотягивает исход опросом, а не ждёт, что человек обновит
  // страницу. Пределы: статус сменился, карточку размонтировали, actionId
  // сменился (гасится через gen), предыдущий запрос этого же опроса ещё не
  // вернулся (без этого медленная сеть копила бы параллельные запросы), и 20
  // попыток (каждая — 3 с, то есть минута) истекли без исхода — тогда опрос
  // останавливается и ждёт «Проверить снова» вместо того, чтобы стучаться
  // бесконечно.
  useEffect(() => {
    if (view?.status !== 'working') return undefined;
    const gen = genRef.current;
    let attempts = 0;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      if (attempts >= WORKING_POLL_MAX_ATTEMPTS) {
        clearInterval(timer);
        if (aliveRef.current && gen === genRef.current) setPollStalled(true);
        return;
      }
      attempts += 1;
      inFlight = true;
      void (async () => {
        const r = await productActionsApi.get(actionId);
        inFlight = false;
        if (!aliveRef.current || gen !== genRef.current) return;
        // Сбой самого опроса не портит карточку текстом «не удалось»: это
        // был бы ложный диагноз по единичному сбою сети, а не по действию.
        // Человек дождётся следующего тика или истечения отведённых попыток.
        if (isProblem(r)) return;
        // Применяем ответ ТОЛЬКО если статус на экране ещё 'working': этот
        // тик мог уйти, пока статус был working, и вернуться ПОСЛЕ того, как
        // более свежий ответ (например, от «Отмены» в этой же карточке) уже
        // сменил его на другой — устаревший «ещё работает» не должен
        // закатать более новый исход.
        setView((prev) => (prev && prev.status === 'working' ? r : prev));
        setError((prevErr) => {
          if (r.status !== 'pending') return r.status === 'working' ? prevErr : null;
          return typeof r.result?.error === 'string' ? r.result.error : null;
        });
      })();
    }, WORKING_POLL_MS);
    return () => clearInterval(timer);
  }, [actionId, view?.status, pollEpoch]);

  const fmt = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(at);
    } catch {
      // Незнакомый язык или сборка node без локальных данных Intl — поле
      // используется только внутри готовой фразы («вернуть можно до …»), и
      // пустая строка там читается лучше половинного/битого форматирования.
      return '';
    }
  };

  const apply = (r: ProductActionView | Problem) => {
    if (isProblem(r)) {
      if (r.status === 429) setError(t('products.action.tooOften'));
      else if (r.status === 404) setError(t('products.action.notFound'));
      else if (r.status === 0) setError(t('products.action.network'));
      else setError(r.message || t('products.action.failedGeneric'));
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
    const gen = genRef.current;
    try {
      const r = await fn();
      if (!aliveRef.current || gen !== genRef.current) return;
      apply(r);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const updateRow = (id: number, patch: Partial<ExtraSecretRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    // Как в NewProductForm: правка строки может чинить то, что подсветила
    // прошлая проверка — старое сообщение рядом со свежим текстом вводит в
    // заблуждение. Следующее нажатие «Создать бота» посчитает ошибки заново.
    setRowErrors([]);
  };

  const removeRow = (id: number) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
    // Ошибки привязаны к позиции строки: после удаления сообщение от снятой
    // строки повисло бы на соседней.
    setRowErrors([]);
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
        <button type="button" onClick={() => void load(actionId, genRef.current)} className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs">
          {t('products.action.retry')}
        </button>
      </>
    );
  } else if (!view) body = <p className="opacity-60">{t('products.action.loading')}</p>;
  else if (view.status === 'working') {
    body = (
      <>
        <p>{t('products.action.working')}</p>
        {pollStalled && (
          <button
            type="button"
            onClick={() => {
              void load(actionId, genRef.current);
              setPollStalled(false);
              setPollEpoch((n) => n + 1);
            }}
            className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs"
          >
            {t('products.action.checkAgain')}
          </button>
        )}
      </>
    );
  } else if (view.status === 'expired') body = <p>{t('products.action.expired')}</p>;
  else if (view.status === 'cancelled') body = <p>{t('products.action.cancelled')}</p>;
  else if (view.status === 'failed') {
    const reason = view.result?.error;
    body = <p>{reason ? t('products.action.failed', { reason }) : t('products.action.failedGeneric')}</p>;
  } else if (view.status === 'done') {
    body = view.kind === 'delete' ? (
      <p>{t('products.action.delete.done', { name, date: fmt(view.result?.restoreUntil) })}</p>
    ) : view.kind === 'create_bot' ? (
      <p>{t('products.action.createBot.done', { name })}</p>
    ) : (
      // Любой другой вид действия (сейчас такого в очереди 1 нет, задел на
      // будущее): свой текст про удаление/бота тут не подходит ни одному.
      <p>{t('products.action.doneGeneric')}</p>
    );
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
            value={token} onChange={(e) => setToken(e.target.value)} disabled={busy}
            className="ym-disable-keys mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5" />
        </label>
        <div role="group" aria-labelledby="product-action-extra-title" className="space-y-2">
          <p id="product-action-extra-title" className="text-xs font-medium">{t('products.action.createBot.extraTitle')}</p>
          {rows.map((row, i) => (
            <div key={row.id} className="flex gap-2">
              <input type="text" maxLength={SECRET_NAME_MAX} aria-label={t('products.action.createBot.keyName')}
                placeholder="API_KEY" value={row.name} disabled={busy}
                aria-invalid={Boolean(rowErrors[i]?.name)}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
                className="w-2/5 rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
              <input data-testid="product-action-secret-value" type="password" autoComplete="off" spellCheck={false}
                aria-label={t('products.action.createBot.keyValue')} value={row.value} disabled={busy}
                aria-invalid={Boolean(rowErrors[i]?.value)}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
                className="ym-disable-keys flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
              <button type="button" disabled={busy} onClick={() => removeRow(row.id)} className="text-xs text-gray-500">
                {t('products.action.createBot.removeKey')}
              </button>
              {(rowErrors[i]?.name || rowErrors[i]?.value) && (
                <span role="alert" className="text-xs text-red-700">{t((rowErrors[i].name ?? rowErrors[i].value)!)}</span>
              )}
            </div>
          ))}
          {rows.length < EXTRA_SECRETS_MAX && (
            <button type="button" disabled={busy} onClick={() => setRows([...rows, { id: nextId.current++, name: '', value: '' }])}
              className="text-xs text-forest-700">
              {t('products.action.createBot.addKey')}
            </button>
          )}
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
  } else if (view.kind === 'keys') {
    body = <p>{t('products.action.keys.unsupported')}</p>;
  } else {
    // Записи журнала без формы на этой карточке (restore/revert — ходят по
    // отдельной ссылке, не сюда): показать как «нет такой карточки», а не
    // молчать или рисовать пустое.
    body = <p>{t('products.action.notACard')}</p>;
  }

  return (
    <div data-testid="product-action-card" className="ym-hide-content not-prose my-2 rounded-xl border border-forest-200 bg-forest-50/40 p-3 space-y-3 text-sm">
      {body}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {onClose && (
        <button type="button" onClick={onClose} className="text-xs text-gray-500">
          {t('products.action.close')}
        </button>
      )}
    </div>
  );
}
