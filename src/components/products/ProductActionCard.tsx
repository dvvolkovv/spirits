import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { productActionsApi, isProblem, type ActionSource, type ProductActionView } from '../../services/productActionsApi';
import type { Problem } from '../../services/productsApi';
import {
  EXTRA_SECRETS_MAX,
  SECRET_COUNT_MAX,
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
 * Смена ключей пересоздаёт контейнер и ждёт его /health — до пары минут, а
 * не секунды, как удаление: минута опроса обрывалась бы на живой смене.
 */
const WORKING_POLL_MAX_ATTEMPTS_KEYS = 60;

/**
 * Карточка ожидающего действия продукта: удаление (кнопка), создание бота
 * (токен и ключи) и смена ключей продукта. Значения уходят прямо на сервер —
 * ни ассистент, ни история чата их не видят. Вся карточка скрыта от Вебвизора
 * (ym-hide-content), поля ключей — ym-disable-keys (сторож —
 * webvisorPrivacy.test.ts).
 *
 * Смена ключей: имена текущих ключей — с сервера, значения не приходят
 * никогда; поле замены пустое, и пустое при отправке — ключ остаётся
 * прежним. Новые ключи — те же строки «имя — значение», что у формы бота.
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
 * Telegram на токен), у бота и удаления показывается КАК ЕСТЬ, без перевода:
 * это известное ограничение уровня плана — текст у сервера русский на всех
 * языках кабинета. У смены ключей сервер кладёт рядом причину (`reason`), и
 * текст берётся по ней на языке человека (см. keysErrorText); русский
 * `error` — только запасной показ.
 */
export function ProductActionCard({
  actionId,
  via,
  onClose,
  onResolved,
}: {
  actionId: string;
  via: ActionSource;
  onClose?: () => void;
  /**
   * Действие покинуло очередь ожидания: вызывается РОВНО ОДИН РАЗ в момент
   * перехода из pending/working в финальный статус по ответу отправки,
   * отмены или тика опроса — не на первой загрузке карточки (там это не
   * переход, а просто показ уже решённого действия). Раздел «Продукты» на
   * StudioPage слушает этот колбэк, чтобы перечитать список: удалённый
   * продукт должен пропасть, а новый бот — появиться без обновления страницы.
   */
  onResolved?: (view: ProductActionView) => void;
}) {
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
  // Ключи: новые значения существующих (пустое — «оставить как есть») и
  // помеченные к удалению. Значения живут только здесь и в теле отправки.
  // Map, а не объект: имя ключа — любое годное имя переменной, в том числе
  // constructor, toString и __proto__ (сервер их принимает), а у объекта они
  // читались бы унаследованными из Object.prototype — в поле «function
  // Object()…», при отправке падение на .trim.
  const [replace, setReplace] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [removed, setRemoved] = useState<string[]>([]);
  // Опрос «в работе» остановился, не дождавшись исхода (20 попыток, минута;
  // у смены ключей — 60, три минуты).
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

  // Статус карточки, обновляется СИНХРОННО в момент каждого setView — рядом,
  // а не из рендера. Опросу «в работе» это нужно, чтобы решить «статус на
  // экране ещё working?» прямо в момент ответа тика, не полагаясь на то, что
  // замыкание эффекта увидит свежий `view` (оно не увидит: эффект не
  // пересоздаётся внутри одного «working», см. ниже). React мог бы вызвать
  // функцию-обновитель setView дважды в StrictMode — вызывать onResolved
  // прямо в ней было бы небезопасно, поэтому решение «применять или нет»
  // принимается здесь, а setView(r) дальше — обычный, без функции.
  const statusRef = useRef<ProductActionView['status'] | null>(null);

  /**
   * Текст отказа на языке человека. Сервер кладёт в result причину (reason)
   * любого исхода карточки ключей; перевод — products.action.keys.errors.<reason>,
   * в том числе у причины failed (свой текст: нечитаемые ключи повтором не
   * лечатся). Русский error сервера — запасной показ: причина новее фронта или
   * карточка другого вида (бот, удаление) — там всё как было. Нет и его —
   * null, и ветка failed показывает общее failedGeneric.
   *
   * Причина — только словом из строчных латинских и «_»: так выглядят все
   * причины сервера, а произвольная строка в пути ключа могла бы указать на
   * узел словаря, а не на текст.
   */
  const keysErrorText = (v: ProductActionView): string | null => {
    const raw = typeof v.result?.error === 'string' ? v.result.error : null;
    const reason = typeof v.result?.reason === 'string' ? v.result.reason : null;
    if (v.kind !== 'keys' || !reason || !/^[a-z][a-z_]*$/.test(reason)) return raw;
    const key = `products.action.keys.errors.${reason}`;
    const text = t(key, { field: typeof v.result?.field === 'string' ? v.result.field : '' });
    return text && text !== key ? text : raw;
  };

  const load = async (id: string, gen: number) => {
    const r = await productActionsApi.get(id);
    if (!aliveRef.current || gen !== genRef.current) return;
    if (isProblem(r)) {
      setLoadError(r.status === 404 ? 'notFound' : 'failed');
      return;
    }
    setLoadError(null);
    statusRef.current = r.status;
    setView(r);
    setError(r.status === 'pending' ? keysErrorText(r) : null);
  };

  useEffect(() => {
    genRef.current += 1;
    const gen = genRef.current;
    // Сброс НА СМЕНУ actionId, а не только на ответ load(): до первого ответа
    // новой карточки на экране не должно оставаться ни вида, ни токена, ни
    // строк ключей от предыдущей.
    setView(null);
    statusRef.current = null;
    setLoadError(null);
    setError(null);
    setToken('');
    setRows([]);
    setRowErrors([]);
    setReplace(new Map());
    setRemoved([]);
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
  // попыток (каждая — 3 с, то есть минута; у смены ключей — 60, три минуты)
  // истекли без исхода — тогда опрос останавливается и ждёт «Проверить снова»
  // вместо того, чтобы стучаться бесконечно.
  useEffect(() => {
    if (view?.status !== 'working') return undefined;
    const gen = genRef.current;
    let attempts = 0;
    let inFlight = false;
    // onResolved зовётся не больше одного раза за этот прогон эффекта: как
    // только тик довёл статус до исхода, следующие тики того же прогона (их
    // не бывает — эффект пересоздастся на смену статуса, но запрос, ушедший
    // до этого, мог вернуться позже) видят resolved и не зовут колбэк снова.
    let resolved = false;
    const maxAttempts = view?.kind === 'keys' ? WORKING_POLL_MAX_ATTEMPTS_KEYS : WORKING_POLL_MAX_ATTEMPTS;
    const timer = setInterval(() => {
      if (inFlight) return;
      if (attempts >= maxAttempts) {
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
        // Применяем ответ ТОЛЬКО если статус на экране ещё 'working' (по
        // statusRef, а не по замыканию на `view` — см. комментарий у ref):
        // этот тик мог уйти, пока статус был working, и вернуться ПОСЛЕ
        // того, как более свежий ответ (например, от «Отмены» в этой же
        // карточке) уже сменил его на другой — устаревший «ещё работает» не
        // должен закатать более новый исход.
        if (statusRef.current !== 'working') return;
        statusRef.current = r.status;
        setView(r);
        setError(r.status === 'pending' ? keysErrorText(r) : null);
        // Действие дотянулось опросом до исхода — ровно один раз за этот
        // прогон эффекта (resolved в замыкании тика, не статус-состояние).
        if (!resolved && r.status !== 'working') {
          resolved = true;
          onResolved?.(r);
        }
      })();
    }, WORKING_POLL_MS);
    return () => clearInterval(timer);
  }, [actionId, view?.status, view?.kind, pollEpoch]);

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
    // Статус ДО обновления — из statusRef, не из состояния: отправка
    // (submit/cancel) всегда уходит из pending-карточки (кнопки есть только
    // там), но ref надёжнее замыкания на случай гонки с тиком опроса.
    const wasPending = statusRef.current === 'pending' || statusRef.current === 'working';
    statusRef.current = r.status;
    setView(r);
    setError(r.status === 'pending' ? keysErrorText(r) : null);
    if (r.status !== 'pending') {
      setToken('');
      setRows([]);
      setReplace(new Map());
      setRemoved([]);
    }
    if (wasPending && r.status !== 'pending' && r.status !== 'working') onResolved?.(r);
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

  const toggleRemove = (n: string) =>
    setRemoved((rs) => (rs.includes(n) ? rs.filter((x) => x !== n) : [...rs, n]));

  const submitKeys = () => {
    if (!view) return;
    // Прежнее сообщение («ничего не изменено», прошлый отказ сервера) — про
    // прошлую отправку; рядом с новыми ошибками строк оно сбивало бы с толку.
    setError(null);
    const existing = new Set(view.keyNames);
    // Проверка новых строк — та же, что у формы бота; плюс повтор имени,
    // которое уже есть выше: его меняют полем замены, а не новой строкой.
    // BOT_TOKEN у формы бота — «поле токена выше»; здесь такого поля нет: у
    // бота токен — в списке текущих (новая строка с ним — тот же повтор), у
    // сайта это обычный ключ (сервер считает так же, product-keys.service).
    const errs = validateExtraSecrets(rows).map((e, i): ExtraSecretError => {
      const n = rows[i].name.trim();
      if (e.name === 'products.new.errors.secretNameBotToken') {
        const again = existing.has(n)
          ? 'products.action.keys.duplicate'
          : rows.slice(0, i).some((r) => r.name.trim() === n) ? 'products.new.errors.secretNameDuplicate' : undefined;
        return { ...e, name: again };
      }
      return !e.name && existing.has(n) ? { ...e, name: 'products.action.keys.duplicate' } : e;
    });
    setRowErrors(errs);
    if (errs.some((e) => e.name || e.value)) return;
    // Object.fromEntries, а не присваивание: см. extraSecretsPayload.
    const set = Object.fromEntries([
      ...view.keyNames
        .filter((n) => !removed.includes(n))
        .map((n) => [n, (replace.get(n) ?? '').trim()] as const)
        .filter(([, v]) => v !== ''),
      ...Object.entries(extraSecretsPayload(rows)),
    ]);
    const remove = view.keyNames.filter((n) => removed.includes(n));
    if (!Object.keys(set).length && !remove.length) {
      setError(t('products.action.keys.nothing'));
      return;
    }
    void run(() => productActionsApi.submit(actionId, { set, remove, via }));
  };

  const name = view?.productName ?? '';

  // Поле, к которому сервер отнёс поправимый отказ карточки ключей (field):
  // годное имя (в том числе занятое платформой) приходит целиком и
  // сравнивается точно; негодное — обрезком shownSecretName (первые 8 знаков
  // и «…»), и строка ищется по началу имени. Новое имя строки переименовали —
  // подсветка снимается сама: имя больше не совпадает.
  const serverField = view?.kind === 'keys' && view.status === 'pending' && typeof view.result?.field === 'string'
    ? view.result.field
    : '';
  const isServerField = (n: string) =>
    serverField !== '' && n !== '' &&
    (serverField.endsWith('…') ? n.startsWith(serverField.slice(0, -1)) : n === serverField);

  // Новые строки «имя — значение»: одни и те же у формы бота и у формы ключей.
  // maxRows — сколько строк ещё помещается под потолок ключей продукта: у
  // формы бота это свой потолок рядом с BOT_TOKEN, у формы ключей — остаток
  // от текущего набора.
  const extraRows = (titleId: string, title: string, maxRows: number) => (
    <div role="group" aria-labelledby={titleId} className="space-y-2">
      <p id={titleId} className="text-xs font-medium">{title}</p>
      {rows.map((row, i) => (
        <div key={row.id} className="flex gap-2">
          <input type="text" maxLength={SECRET_NAME_MAX} aria-label={t('products.action.createBot.keyName')}
            placeholder="API_KEY" value={row.name} disabled={busy}
            aria-invalid={Boolean(rowErrors[i]?.name) || isServerField(row.name.trim())}
            onChange={(e) => updateRow(row.id, { name: e.target.value })}
            className="w-2/5 rounded-lg border border-gray-300 aria-[invalid=true]:border-red-500 px-2 py-1.5 text-xs" />
          <input data-testid="product-action-secret-value" type="password" autoComplete="off" spellCheck={false}
            aria-label={t('products.action.createBot.keyValue')} value={row.value} disabled={busy}
            aria-invalid={Boolean(rowErrors[i]?.value)}
            onChange={(e) => updateRow(row.id, { value: e.target.value })}
            className="ym-disable-keys flex-1 rounded-lg border border-gray-300 aria-[invalid=true]:border-red-500 px-2 py-1.5 text-xs" />
          <button type="button" disabled={busy} onClick={() => removeRow(row.id)} className="text-xs text-gray-500">
            {t('products.action.createBot.removeKey')}
          </button>
          {(rowErrors[i]?.name || rowErrors[i]?.value) && (
            <span role="alert" className="text-xs text-red-700">{t((rowErrors[i].name ?? rowErrors[i].value)!)}</span>
          )}
        </div>
      ))}
      {rows.length < maxRows && (
        <button type="button" disabled={busy} onClick={() => setRows([...rows, { id: nextId.current++, name: '', value: '' }])}
          className="text-xs text-forest-700">
          {t('products.action.createBot.addKey')}
        </button>
      )}
    </div>
  );

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
        <p>{view.kind === 'keys' ? t('products.action.keys.working') : t('products.action.working')}</p>
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
    const reason = keysErrorText(view);
    body = <p>{reason ? t('products.action.failed', { reason }) : t('products.action.failedGeneric')}</p>;
  } else if (view.status === 'done') {
    body = view.kind === 'delete' ? (
      <p>{t('products.action.delete.done', { name, date: fmt(view.result?.restoreUntil) })}</p>
    ) : view.kind === 'create_bot' ? (
      <p>{t('products.action.createBot.done', { name })}</p>
    ) : view.kind === 'keys' ? (
      <p>{t('products.action.keys.done', { name })}</p>
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
        {extraRows('product-action-extra-title', t('products.action.createBot.extraTitle'), EXTRA_SECRETS_MAX)}
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
    // BOT_TOKEN бота убрать нельзя — только заменить (сервер отбьёт тоже).
    const canRemove = (n: string) => !(view.productKind === 'bot' && n === 'BOT_TOKEN');
    // Потолок сервера — на итоговый набор: новые строки помещаются в то, что
    // не заняли остающиеся ключи (убранный ключ освобождает место).
    const kept = view.keyNames.filter((n) => !removed.includes(n)).length;
    body = (
      <>
        <p className="font-medium">{t('products.action.keys.title', { name })}</p>
        <p className="text-xs text-gray-600">{t('products.action.keys.hint')}</p>
        <div role="group" aria-labelledby="product-action-keys-current" className="space-y-2">
          <p id="product-action-keys-current" className="text-xs font-medium">{t('products.action.keys.current')}</p>
          {view.keyNames.length === 0 && <p className="text-xs text-gray-500">{t('products.action.keys.none')}</p>}
          {view.keyNames.map((n) => (
            <div key={n} className="flex gap-2 items-center">
              <span className="w-2/5 font-mono text-xs break-all">{n}</span>
              {removed.includes(n) ? (
                <span className="flex-1 text-xs text-gray-500">{t('products.action.keys.willRemove')}</span>
              ) : (
                <input data-testid="product-action-key-replace" type="password" autoComplete="off" spellCheck={false}
                  aria-label={t('products.action.keys.newValue', { name: n })} placeholder={t('products.action.keys.keepPlaceholder')}
                  value={replace.get(n) ?? ''} disabled={busy}
                  aria-invalid={isServerField(n)}
                  onChange={(e) => setReplace((r) => new Map(r).set(n, e.target.value))}
                  className="ym-disable-keys flex-1 rounded-lg border border-gray-300 aria-[invalid=true]:border-red-500 px-2 py-1.5 text-xs" />
              )}
              {canRemove(n) && (
                <button type="button" disabled={busy} onClick={() => toggleRemove(n)} className="text-xs text-gray-500">
                  {removed.includes(n) ? t('products.action.keys.undoRemove') : t('products.action.keys.remove')}
                </button>
              )}
            </div>
          ))}
        </div>
        {extraRows('product-action-keys-add', t('products.action.keys.addTitle'), SECRET_COUNT_MAX - kept)}
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={submitKeys}
            className="px-4 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-medium disabled:opacity-50">
            {busy ? t('products.action.keys.submitting') : t('products.action.keys.submit')}
          </button>
          <button type="button" disabled={busy} onClick={() => void run(() => productActionsApi.cancel(actionId))}
            className="px-4 py-1.5 rounded-lg border border-gray-300 text-xs">
            {t('products.action.cancel')}
          </button>
        </div>
      </>
    );
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
