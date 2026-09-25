import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, CircleDot, Plus, RotateCw, X, AlertTriangle, Moon, ShieldAlert } from 'lucide-react';
import { productsApi, siteAddress } from '../../services/productsApi';
import type {
  Product,
  ProductKind,
  NewProductInput,
  Problem,
  HostAgentState,
} from '../../services/productsApi';
import { NewProductForm } from './NewProductForm';
import { CustomDomain } from './CustomDomain';
import type { SubmitResult } from './NewProductForm';
import { useAuth } from '../../contexts/AuthContext';
import {
  SUPPORT_HREF,
  TOPUP_HREF,
  formatPaidUntil,
  formatRentAmount,
  rentWarningDue,
  wakeExpected,
} from './rent';

// Цвет статуса — вынесен из JSX, чтобы не пересчитывать на каждый рендер
// и не плодить длинные тернарники внутри карточки.
const STATUS_STYLE: Record<string, string> = {
  running: 'text-green-600',
  degraded: 'text-amber-600',
  stopped: 'text-gray-400',
  provisioning: 'text-blue-600',
  archived: 'text-gray-400',
  // Отказ обязан быть виден как отказ: тем же серым он читался бы как ещё
  // одно спокойное состояние, а это единственный статус, требующий действия.
  failed: 'text-red-600',
  // Сон — не поломка (код и история целы, продукт вернётся сам), но и не
  // спокойное состояние: без действия владельца он не кончится никогда.
  // Отсюда янтарный, тот же, что у прочих «нужно что-то сделать», а не
  // красный «сломалось».
  sleeping: 'text-amber-600',
  // Гашение администратором — красный, а не янтарный «нужно что-то сделать».
  // Янтарным в этом списке отмечено то, что владелец чинит сам и деньгами
  // (сон, близкое списание); блокировку он не снимет ничем, а продукт при этом
  // выключен целиком. Общим серым она читалась бы как «Остановлен» — то есть
  // как его собственное решение, которого он не принимал.
  blocked: 'text-red-600',
};

/**
 * Период перечитывания списка, пока хоть один продукт заводится.
 *
 * Без него «Заводится…» висит до ручной перезагрузки страницы: заведение
 * идёт на другой машине и сообщить о себе в открытую вкладку некому. Срок
 * заведения на бэкенде — 10 минут, всё это время человек смотрел бы на
 * неменяющийся экран и не отличал бы работу от зависания.
 */
const POLL_MS = 5000;

/**
 * Аренда в карточке: до какого числа оплачено, сон и предупреждение.
 *
 * Отдельный компонент, а не ещё сто строк внутри `map`: у карточки уже есть
 * свой блок отказа заведения, и третий уровень вложенных тернарников в JSX —
 * это то место, где следующая правка ломает соседнее состояние молча.
 */
const RentNote: React.FC<{ product: Product; balance?: number }> = ({ product, balance }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n?.language || 'ru';

  if (product.status === 'sleeping') {
    return (
      <div className="px-4 pb-4 -mt-1">
        <div className="flex flex-col gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900">
          {/*
            Слова «Спит» здесь нет намеренно: оно уже стоит значком статуса в
            шапке карточки, и вторым экземпляром читалось бы как два разных
            сообщения об одном и том же. Значок Moon оставлен — он связывает
            объяснение со статусом взглядом.
          */}
          {wakeExpected(balance) ? (
            /*
              Денег уже хватает — значит сервер будит продукт САМ: подметание
              спящих ходит раз в минуту, дальше старт контейнера. Просить
              владельца пополнить ещё раз здесь было бы прямой неправдой, а
              молчаливое «Спит» на карточке — теми же граблями, на которых
              залипала тревога о молчащем сервере: состояние, которое вот-вот
              изменится, обязано говорить, что оно меняется.
            */
            <span className="flex items-start gap-1.5">
              <Moon size={14} className="shrink-0 mt-0.5" />
              {t('products.rent.waking')}
            </span>
          ) : (
            <>
              {/*
                Причина — С СЕРВЕРА, если он её прислал. Своя строка остаётся
                запасной: `sleep_reason` пустой у старого бэкенда и у продукта,
                усыплённого без записи причины. Ровно так же устроена причина
                сорванного заведения этажом ниже.
              */}
              <span className="flex items-start gap-1.5">
                <Moon size={14} className="shrink-0 mt-0.5" />
                {product.sleep_reason || t('products.rent.sleepingWhy')}
              </span>
              <span>{t('products.rent.wakeHint', { amount: formatRentAmount(lang) })}</span>
              <a
                href={TOPUP_HREF}
                className="self-start mt-1 px-4 py-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-xs font-medium"
              >
                {t('products.rent.topUp')}
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  // Заведение не завершилось (или продукт в архиве) — аренда к нему ещё (уже)
  // не относится: платят только running и degraded, и срок в карточке отказа
  // отвлекал бы от единственного, что там важно, — причины и кнопки повтора.
  //
  // БЛОКИРОВАННЫЙ ЗДЕСЬ ЖЕ, И ЭТО НЕ АККУРАТНОСТЬ, А ГЛАВНОЕ МЕСТО ВСЕЙ ЭТОЙ
  // ПРАВКИ. Без него 'blocked' проваливался в ветку ниже — и у владельца, у
  // которого мало токенов, а срок близко (то есть ровно у того, кого гасят
  // чаще всего), в карточке погашенного продукта загоралась тревога
  // «Списание 25.09, на балансе не хватает» с кнопкой «Пополнить баланс».
  // Кнопка берёт деньги и не меняет НИЧЕГО: пробуждение отбирает строго
  // `status = 'sleeping'`, блокированный в него не попадает. Аренда с него к
  // тому же не берётся (`chargeRent` — `status IN ('running','degraded')`), так
  // что и сам срок здесь неправда.
  if (
    product.status === 'failed' ||
    product.status === 'archived' ||
    product.status === 'blocked'
  ) {
    return null;
  }

  const paidUntil = formatPaidUntil(product.paid_until, lang);
  // Срока нет — не говорим ничего. Выдумывать его нельзя (это единственное
  // место, где владелец узнаёт дату списания), а «неизвестно» в карточке
  // работающего продукта — тревога на пустом месте.
  if (!paidUntil) return null;

  const warn = rentWarningDue(product.paid_until, balance);

  return (
    <div className="px-4 pb-3 -mt-1 flex flex-col gap-1.5">
      <span className="text-xs text-gray-500">
        {t('products.rent.paidUntil', { date: paidUntil })}
      </span>
      {warn && (
        <div
          role="alert"
          className="flex flex-col gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900"
        >
          <span className="flex items-start gap-1.5">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            {t('products.rent.soonWarning', { date: paidUntil })}
          </span>
          <a
            href={TOPUP_HREF}
            className="self-start px-4 py-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-xs font-medium"
          >
            {t('products.rent.topUp')}
          </a>
        </div>
      )}
    </div>
  );
};

/**
 * Продукт погашен администратором.
 *
 * Отдельный блок, а не строка рядом с арендой: у этого состояния ДРУГОЙ набор
 * действий. Сон снимается деньгами, отказ заведения — кнопкой «повторить», а
 * блокировку не снимает ни то, ни другое.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Кнопки «Пополнить баланс» — нет ни одной:
 * пополнение блокированного не будит, и такая кнопка собрала бы деньги за то,
 * что от денег не меняется. Тем же рассуждением на бэкенде выбран код отказа
 * правке — 409, а не 402: 402 в чате правок зажигает пополнение
 * (`setNeedsTopUp(started.status === 402)` в ProductChat.tsx).
 *
 * Причина — С СЕРВЕРА. Сервер без непустой причины гасить отказывается (400 в
 * `BlockService.block`), так что своя строка — запас на бэкенд, выкаченный до
 * 007, и на ответ, из которого причина не доехала. Молчать в этом месте
 * нельзя: общего списка продуктов у администратора нет, уведомлений владельцу
 * кусок 4б не делает — эта строка и есть единственный способ узнать, что
 * случилось.
 */
const BlockedNote: React.FC<{ product: Product }> = ({ product }) => {
  const { t } = useTranslation();

  return (
    <div className="px-4 pb-4 -mt-1">
      <div
        role="alert"
        className="flex flex-col gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-900"
      >
        {/*
          Слова «Остановлен администратором» здесь нет намеренно: оно уже стоит
          значком статуса в шапке карточки — так же, как не повторяется «Спит»
          в блоке аренды. Значок связывает объяснение со статусом взглядом.
        */}
        <span className="flex items-start gap-1.5">
          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          <span className="break-words">
            {product.block_reason || t('products.blocked.unknownReason')}
          </span>
        </span>
        <span>{t('products.blocked.noTopUp')}</span>
        <a
          href={SUPPORT_HREF}
          className="self-start mt-1 px-4 py-1.5 rounded-lg border border-red-300 hover:border-red-400 text-xs font-medium"
        >
          {t('products.blocked.contact')}
        </a>
      </div>
    </div>
  );
};

interface Props {
  onOpen: (product: Product) => void;
  /** Внутри вкладки Студии: заголовок и подпись рисует Студия, не список. */
  embedded?: boolean;
}

export const ProductsListView: React.FC<Props> = ({ onOpen, embedded = false }) => {
  // i18n нужен пустому состоянию: цена аренды форматируется по языку
  // пользователя (Intl), как и дата списания в карточке. `?.` — тесты
  // подменяют useTranslation заглушкой без i18n.
  const { t, i18n } = useTranslation();
  const lang = i18n?.language || 'ru';
  // Баланс — из уже идущего опроса AuthContext (раз в пять секунд). Своего
  // запроса здесь нет намеренно: второй опрос того же числа разъезжается с
  // первым, и владелец видит два разных баланса на одном экране.
  const { user } = useAuth();
  const balance = user?.tokens;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<ProductKind>('site');
  const [loadFailed, setLoadFailed] = useState(false);
  // Вердикт сервера про агента машины продуктов. null — «сервер ничего не
  // сказал»: так отвечает бэкенд до этой доработки и так выглядит ответ, из
  // которого прокси срезал заголовок. Тревоги в этом случае нет.
  const [hostAgent, setHostAgent] = useState<HostAgentState>(null);
  // Множество, а не один id: продукты падают ПАЧКАМИ — они падают от одной
  // причины на одной машине. Один замок на весь список означал, что кнопка
  // второго сорванного продукта на экране активна, а нажатие уходит в
  // return: ни запроса, ни сообщения. Это тот же тихий отказ, ради которого
  // переписана форма, только в соседнем месте.
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});

  // Замок отдельно от состояния: setRetryingIds применится только к
  // следующему рендеру, а два клика подряд успевают пройти в одном тике.
  // Второе задание на тот же продукт бэкенд отобьёт по частичному индексу
  // one_active, но пользователь увидит непонятное «заведение уже идёт» в
  // ответ на собственное же первое нажатие. Замок ПОПРОДУКТНЫЙ.
  const retryBusy = useRef(new Set<string>());

  const reload = useCallback(async () => {
    // productsApi.list() сам гасит сетевые и авторизационные отказы и
    // возвращает null — try/catch тут не нужен, в отличие от
    // CustomAgentsListView, где customAgentsApi бросает исключение.
    const listing = await productsApi.list();
    setLoading(false);
    if (listing === null) {
      // Состояние НЕ затирается. Прежде неудачная перечитка выдавала пустой
      // список: экран объявлял «продуктов нет», заводящихся в нём не
      // оставалось, интервал снимался — и опрос не возобновлялся до
      // перезагрузки вкладки, пока заведение шло своим ходом.
      //
      // Вердикт про агента хоста не трогается по той же причине: неудачный
      // запрос — это отсутствие ответа, а не ответ «агент молчит». Сбрасывать
      // его в null тоже нельзя: тревога, погашенная собственным обрывом
      // связи, — это ровно то враньё, которого здесь избегают.
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setProducts(listing.rows);
    setHostAgent(listing.hostAgent);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const anyProvisioning = products.some((p) => p.status === 'provisioning');
  // Опрос идёт и при молчащем агенте, а не только при заводящемся продукте.
  // Тревога, которую нечем погасить, залипает: агент возвращается через
  // полминуты (systemd Restart=always, перезапуск юнита, починенный токен), а
  // на экране висит «задания никто не забирает» до перезагрузки вкладки. Ровно
  // так уже залипал алерт о молчании телеграм-бота.
  // Спящий продукт, на который денег уже хватает, вот-вот проснётся сам:
  // подметание на сервере ходит раз в минуту, дальше старт контейнера. Это
  // ровно тот случай, когда список обязан догнать состояние без действий
  // владельца — иначе «Спит» висит на экране уже проснувшегося продукта до
  // перезагрузки вкладки.
  //
  // НОВОГО ОПРОСА ЗДЕСЬ НЕ ЗАВЕДЕНО: перечитка списка включается от баланса,
  // который AuthContext и так тянет раз в пять секунд. Пока денег не хватает,
  // ждать нечего и список не опрашивается вовсе — спящий продукт мог бы
  // пролежать так месяц.
  const anyWaking = wakeExpected(balance) && products.some((p) => p.status === 'sleeping');
  const watching = anyProvisioning || hostAgent === 'silent' || anyWaking;
  useEffect(() => {
    if (!watching) return undefined;
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [watching, reload]);

  /**
   * Причина отказа для человека.
   *
   * Код разбирается здесь, а не в форме: 409 значит «слаг занят» и чинится
   * сменой адреса, 0 — обрыв связи и чинится повтором, а текст 400-й приходит
   * с сервера про конкретное поле и полезен как есть. Одна формулировка на
   * все три случая отправила бы человека чинить не то.
   */
  const explain = (p: Problem, kind: ProductKind): string => {
    if (p.status === 0) return t('products.new.errors.network');
    if (p.status === 409) {
      // У бота поля адреса на форме нет — совет «выберите другой» предлагал
      // бы действие, недоступное на экране. Правильное действие там —
      // нажать «Создать» ещё раз: хвост слага перевыпускается при каждом
      // отказе (см. NewProductForm).
      return kind === 'bot'
        ? t('products.new.errors.slugTakenBot')
        : t('products.new.errors.slugTaken');
    }
    // Глобального фильтра исключений на бэке нет: неперехваченная ошибка
    // приходит как {"message":"Internal server error"}. Показывать
    // русскоязычному владельцу строку фреймворка — то же самое, что не
    // показывать ничего.
    if (p.status >= 500) return t('products.new.errors.rejected');
    return p.message || t('products.new.errors.rejected');
  };

  const create = async (input: NewProductInput): Promise<SubmitResult> => {
    const result = await productsApi.create(input);
    if (!result.ok) {
      // Форма остаётся открытой со всем введённым: адрес меняется одним
      // словом, а закрытая форма означала бы ввод заново.
      return { ok: false, message: explain(result, input.kind) };
    }
    setCreating(false);
    await reload();
    return { ok: true };
  };

  const retry = async (productId: string) => {
    if (retryBusy.current.has(productId)) return;
    retryBusy.current.add(productId);
    setRetryingIds((prev) => [...prev, productId]);
    setRetryErrors((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    const result = await productsApi.retry(productId);
    retryBusy.current.delete(productId);
    setRetryingIds((prev) => prev.filter((id) => id !== productId));
    if (!result.ok) {
      // Кнопка уже разблокирована выше: отказ обязан оставлять способ
      // попробовать ещё раз, иначе карточка замирает навсегда.
      const message =
        result.status === 0
          ? t('products.new.errors.network')
          : result.status === 409
            ? t('products.retryErrors.busy')
            : // Та же английская строка Nest, что и у заведения: своей
              // формулировки у пятисотки нет, и брать её как есть нельзя.
              result.status >= 500
              ? t('products.retryErrors.failed')
              : result.message || t('products.retryErrors.failed');
      setRetryErrors((prev) => ({ ...prev, [productId]: message }));
      return;
    }
    await reload();
  };

  return (
    <div className={embedded ? '' : 'h-full overflow-y-auto'}>
      <div className={`max-w-4xl mx-auto px-4 ${embedded ? 'pt-4 pb-6' : 'py-6'}`}>
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          {/* Во вкладке Студии заголовок уже нарисован над табами. Пустой div
              оставлен нарочно: без него кнопка «Новый продукт» уедет влево —
              justify-between распределяет по числу детей, а не по месту. */}
          {embedded ? (
            <div />
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('products.title')}</h1>
              <p className="text-sm text-gray-500 mt-1">{t('products.subtitle')}</p>
            </div>
          )}
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center justify-center gap-1.5 w-full md:w-auto shrink-0 px-5 py-2.5 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200"
            >
              <Plus size={16} />
              {t('products.new.button')}
            </button>
          )}
        </div>

        {/*
          Предупреждение стоит ВЫШЕ формы, а не над списком: его смысл — быть
          прочитанным ДО нажатия «Создать». Под списком оно означало бы то же
          самое, что и сегодняшнее молчание, — узнать о мёртвом агенте через
          десять минут, из карточки с неверной причиной «срок заведения истёк».

          Предупреждение, а НЕ запрет. Кнопка остаётся рабочей, и это решение,
          а не недоделка:
            - вердикт — это состояние ЧУЖОЙ машины с точностью до двух минут.
              Агент мог перезапускаться ровно в эту секунду, а задание живёт в
              очереди и достаётся ему через три секунды после возвращения:
              заведение при таком «отказе» прошло бы нормально;
            - цена ложного запрета несимметрична. Неверная тревога стоит строки
              текста, неверный отказ — введённой заново формы вместе с
              секретами продукта, которые в ней не сохраняются;
            - заперев кнопку, ошибка в самой проверке выключила бы заведение
              продуктов целиком и без обходного пути. Баннер деградирует
              безопасно: он врёт текстом, а не отнимает действие.
        */}
        {hostAgent === 'silent' && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm"
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{t('products.hostAgentSilent')}</span>
          </div>
        )}

        {creating && (
          <div className="mb-6 p-4 bg-white rounded-2xl border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{t('products.new.title')}</h2>
              <button
                onClick={() => setCreating(false)}
                aria-label={t('products.new.cancel')}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
              >
                <X size={16} />
                {t('products.new.cancel')}
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              {(['site', 'bot'] as ProductKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-xl border text-sm font-medium ${
                    kind === k
                      ? 'border-forest-600 bg-forest-50 text-forest-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {t(`products.new.kind.${k}`)}
                </button>
              ))}
            </div>

            {/*
              key={kind}: смена формы продукта обязана обнулять поля. Иначе
              токен, введённый для бота, остаётся в состоянии формы после
              переключения на сайт — секрет живёт в памяти вкладки без всякой
              причины, а поля показывают чужой ввод.
            */}
            <NewProductForm key={kind} kind={kind} onSubmit={create} />
          </div>
        )}

        {loadFailed && (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm"
          >
            <span>{t('products.loadFailed')}</span>
            <button
              onClick={reload}
              className="shrink-0 px-4 py-1.5 rounded-lg border border-amber-300 hover:border-amber-400 text-sm"
            >
              {t('products.reload')}
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-12">{t('common.loading')}</div>
        ) : products.length === 0 ? (
          // Пустой экран только когда сервер ДЕЙСТВИТЕЛЬНО сказал «пусто».
          // При неудачной перечитке над списком уже висит баннер выше, и
          // объявлять вдобавок «продуктов нет» значит врать.
          loadFailed ? null : (
          /*
            ПУСТОЙ КАБИНЕТ — ВИТРИНА, А НЕ ПОМЕТКА О ПУСТОТЕ.
            Этот экран впервые видит человек без продуктов, без токенов и без
            единого платежа: с этого куска вкладка открыта ВСЕМ, а не одному
            владельцу сервиса. Решение, которое он тут принимает, — платить или
            уйти, и принять его он может, только если экран отвечает на три
            вопроса. Прежде тут стояла одна строка «Пока ни одного продукта» —
            она не отвечала ни на один.

              1. ЧТО ЭТО. «Продукты» ничего не значит без объяснения: соседние
                 вкладки Студии — ассистенты и телеграм-боты, и человек вправе
                 решить, что это ещё один их сорт.
              2. СКОЛЬКО СТОИТ. Цену он всё равно узнает — через месяц, когда
                 продукт уснёт за неуплату. Узнать её ПОСЛЕ того, как вложил
                 работу, хуже, чем до.
              3. ЧТО НАЖАТЬ. Кнопка здесь своя, а не одна на экран: та, что в
                 шапке, на мобильном стоит над пустым блоком, а на десктопе
                 уезжает в правый угол — то есть в стороне от текста, который
                 человек только что прочитал.
          */
          <div className="text-center py-12 px-6 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-forest-600 to-forest-800 flex items-center justify-center mx-auto mb-4 shadow-md">
              <Server size={24} className="text-white" />
            </div>
            <p className="text-gray-900 font-semibold">{t('products.empty')}</p>
            <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
              {t('products.emptyWhat')}
            </p>
            {/*
              Цена — из того же зеркала RENT_TOKENS, что и подсказка спящему
              продукту: два числа на одном экране разъехались бы молча.
              «Первый месяц бесплатно» — не обещание маркетинга, а поведение
              кода: `paid_until` заводится со значением `now() + 1 month`
              (миграция 004), а сборщик аренды берёт деньги только с тех, у кого
              срок уже вышел.
            */}
            <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
              {t('products.emptyPrice', { amount: formatRentAmount(lang) })}
            </p>
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                className="mt-5 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200"
              >
                <Plus size={16} />
                {t('products.new.button')}
              </button>
            )}
          </div>
          )
        ) : (
          <div className="space-y-2">
            {products.map((p) => (
              // div, а не button: внутри карточки отказа живёт своя кнопка
              // «повторить», а кнопка внутри кнопки — невалидная разметка,
              // и клик по ней всплывает в открытие продукта.
              <div key={p.id} className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => onOpen(p)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <Server className="w-5 h-5 text-gray-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{p.name}</div>
                      {/* Работающий свой домен — главный адрес, иначе адрес платформы. */}
                      {siteAddress(p) && (
                        <div className="text-sm text-gray-500 truncate">{siteAddress(p)}</div>
                      )}
                    </div>
                  </button>
                  <span
                    className={`flex items-center gap-1 text-xs shrink-0 ${STATUS_STYLE[p.status] ?? 'text-gray-400'}`}
                  >
                    <CircleDot className="w-3 h-3" />
                    {t(`products.status.${p.status}`)}
                  </span>
                </div>

                <RentNote product={p} balance={balance} />

                {p.status === 'blocked' && <BlockedNote product={p} />}

                {/*
                  Свой домен — только у сайта и только у заведённого: сервер
                  выпускает сертификат при running/degraded/sleeping.
                */}
                {p.kind === 'site' && ['running', 'degraded', 'sleeping'].includes(p.status) && (
                  <CustomDomain product={p} onChanged={reload} />
                )}
                {/*
                  Погашенный — только отвязка: привязывать и выпускать нельзя,
                  а снять уже работающий домен владелец вправе, и сервер раздаёт
                  задания домена погашенным. Сорванному и заводящемуся — нет:
                  им задания не раздаются, отвязка повисла бы.
                */}
                {p.kind === 'site' && p.status === 'blocked' && (
                  <CustomDomain product={p} onChanged={reload} detachOnly />
                )}

                {p.status === 'failed' && (
                  <div className="px-4 pb-4 -mt-1">
                    <div className="text-xs font-medium text-gray-700 mb-1">
                      {t('products.failReason')}
                    </div>
                    {/*
                      Причина приходит с машины продуктов и бывает длинной и
                      технической («Command failed: docker build …» вместе со
                      stderr) — на бэкенде у неё намеренно нет потолка длины.
                      Поэтому своя прокрутка: обрезать её нельзя (обрезанный
                      stderr бесполезен), а распирать список на два экрана она
                      не должна.
                    */}
                    <div className="max-h-32 overflow-y-auto rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 font-mono whitespace-pre-wrap break-words">
                      {p.provision_error || t('products.failUnknown')}
                    </div>

                    <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                      <button
                        onClick={() => retry(p.id)}
                        disabled={retryingIds.includes(p.id)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 hover:border-gray-300 disabled:opacity-60 text-sm text-gray-700"
                      >
                        <RotateCw
                          size={14}
                          className={retryingIds.includes(p.id) ? 'animate-spin' : ''}
                        />
                        {retryingIds.includes(p.id) ? t('products.retrying') : t('products.retry')}
                      </button>
                      {retryErrors[p.id] && (
                        <span role="alert" className="text-xs text-red-600 break-words">
                          {retryErrors[p.id]}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
