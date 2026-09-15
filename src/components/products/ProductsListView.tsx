import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, CircleDot, Plus, RotateCw, X } from 'lucide-react';
import { productsApi } from '../../services/productsApi';
import type {
  Product,
  ProductKind,
  NewProductInput,
  Problem,
} from '../../services/productsApi';
import { NewProductForm } from './NewProductForm';
import type { SubmitResult } from './NewProductForm';

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

interface Props {
  onOpen: (product: Product) => void;
}

export const ProductsListView: React.FC<Props> = ({ onOpen }) => {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<ProductKind>('site');
  const [loadFailed, setLoadFailed] = useState(false);
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
    const rows = await productsApi.list();
    setLoading(false);
    if (rows === null) {
      // Состояние НЕ затирается. Прежде неудачная перечитка выдавала пустой
      // список: экран объявлял «продуктов нет», заводящихся в нём не
      // оставалось, интервал снимался — и опрос не возобновлялся до
      // перезагрузки вкладки, пока заведение шло своим ходом.
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setProducts(rows);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const anyProvisioning = products.some((p) => p.status === 'provisioning');
  useEffect(() => {
    if (!anyProvisioning) return undefined;
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [anyProvisioning, reload]);

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
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('products.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('products.subtitle')}</p>
          </div>
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
          <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-forest-600 to-forest-800 flex items-center justify-center mx-auto mb-4 shadow-md">
              <Server size={24} className="text-white" />
            </div>
            <p className="text-gray-600 font-medium">{t('products.empty')}</p>
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
                      {p.domain && <div className="text-sm text-gray-500 truncate">{p.domain}</div>}
                    </div>
                  </button>
                  <span
                    className={`flex items-center gap-1 text-xs shrink-0 ${STATUS_STYLE[p.status] ?? 'text-gray-400'}`}
                  >
                    <CircleDot className="w-3 h-3" />
                    {t(`products.status.${p.status}`)}
                  </span>
                </div>

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
