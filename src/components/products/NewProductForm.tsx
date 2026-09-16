import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus } from 'lucide-react';
import type { NewProductInput, ProductKind } from '../../services/productsApi';

/**
 * ФОРМА СЛАГА — ТРЕТЬЯ КОПИЯ ОДНОЙ И ТОЙ ЖЕ ПРОВЕРКИ.
 *
 * Оригинал — `SLUG_RE` в `spirits_back/src/products/provisioning.service.ts`,
 * оттуда же его берёт `CreateProductDto`. Вторая копия живёт в агенте хоста
 * (`product-runner/src/host/provision.ts`) — там она последний рубеж перед
 * тем, как слаг станет именем контейнера, каталогом на машине продуктов и
 * меткой домена. Эта, третья, нужна ради объяснения на месте: без неё отказ
 * прилетает 400-й уже после нажатия, и пользователь не понимает, что не так.
 *
 * Разъехаться им нельзя. В плане этой задачи стоял /^[a-z0-9-]{2,40}$/ — он
 * расходится с сервером В ОБЕ СТОРОНЫ: пропускает '-rf' и '--' (ведущий дефис
 * в аргументе docker/nginx разбирается как флаг) и отбивает односимвольный
 * слаг, который сервер принимает. Здесь стоит серверный, символ в символ.
 */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Потолки — из CreateProductDto и create() на бэкенде. */
const SLUG_MAX = 40;
const NAME_MAX = 80;
const SECRET_VALUE_MAX = 8192;

/**
 * Публичная зона продуктов — `PUBLIC_ZONE` в provisioning.service.ts.
 * Показывается подсказкой: человек вводит слаг, а видит будущий адрес.
 */
const PUBLIC_ZONE = 'p.linkeon.io';

/** Длина случайного хвоста у слага бота. 36^6 — столкновение неправдоподобно. */
const BOT_SUFFIX_LEN = 6;

// Практическая транслитерация, а не ГОСТ: слаг бота человеку не показывается
// (домена у бота нет), он всего лишь обязан быть годным именем контейнера и
// каталога. Задача таблицы — чтобы от русского названия вообще что-то
// осталось.
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  // Украинские и белорусские буквы, которых нет в русском алфавите: иначе они
  // выпадают в дефис и режут слово пополам.
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g', ў: 'u',
};

/**
 * Название → слаг.
 *
 * Черновик плана делал это так: `name.toLowerCase().replace(/[^a-z0-9-]/g,
 * '-')`. На «Магазин цветов» получается пятнадцать дефисов подряд: сервер
 * отбивает такой слаг 400-й с текстом про поле, которого у бота на экране нет
 * вовсе, и отказ выглядит необъяснимым.
 */
export function slugifyName(name: string): string {
  const latin = Array.from(
    name
      .toLowerCase()
      // Диакритика снимается ДО таблицы: 'é' одним кодовым знаком в таблице
      // нет, и он выпадал в дефис — 'Café Fleuri' давало 'caf-fleuri', а
      // 'Ação Rápida' — 'a-o-r-pida'. Слаг оставался годным, но имя
      // рассыпалось, и это било по четырём нашим локалям сразу (fr, pt, es,
      // de). NFD разлагает букву на основу и надстрочный знак, вторая часть
      // диапазона U+0300..U+036F выбрасывается.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  )
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
  return (
    latin
      // Прогон недопустимого — ОДИН дефис, а не по дефису на символ.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_MAX)
      // Ещё раз после обрезки: срез мог прийтись ровно на дефис, а дефис по
      // краям слага запрещён.
      .replace(/-+$/g, '')
  );
}

/** Случайный хвост слага. Криптостойкость тут не нужна, нужна неповторяемость. */
function randomSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(BOT_SUFFIX_LEN);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Слаг бота: основа из названия плюс случайный хвост.
 *
 * Хвост не украшение. Слаг бота выводится автоматически, поля для него на
 * экране нет — а значит, у 409 «слаг уже занят» не было бы способа исправить
 * ситуацию: два бота с названием «Магазин цветов» дали бы один и тот же слаг,
 * и второй не завёлся бы никогда. Показывать этот слаг некому: домена у бота
 * нет по замыслу.
 */
export function deriveBotSlug(name: string, suffix: string): string {
  const room = SLUG_MAX - suffix.length - 1;
  const base = slugifyName(name).slice(0, room).replace(/-+$/g, '');
  // Пустая основа — название из одних знаков или эмодзи. Слаг всё равно
  // обязан быть годным, поэтому своя основа, а не голый хвост с дефисом.
  return base ? `${base}-${suffix}` : `bot-${suffix}`;
}

type Field = 'name' | 'slug' | 'token';
type Errors = Partial<Record<Field, string>>;

interface Draft {
  kind: ProductKind;
  name: string;
  slug: string;
  token: string;
}

/**
 * Проверка полей. Вынесена из компонента и возвращает КЛЮЧИ переводов, а не
 * текст: правило «что считается негодным» проверяется без рендера, а
 * показывает его компонент.
 */
export function validateDraft(d: Draft): Errors {
  const errors: Errors = {};
  const name = d.name.trim();

  if (!name) errors.name = 'products.new.errors.nameRequired';
  else if (name.length > NAME_MAX) errors.name = 'products.new.errors.nameTooLong';

  if (d.kind === 'site') {
    const slug = d.slug.trim();
    if (!slug) errors.slug = 'products.new.errors.slugRequired';
    else if (!SLUG_RE.test(slug)) errors.slug = 'products.new.errors.slugInvalid';
  }

  if (d.kind === 'bot') {
    const token = d.token.trim();
    // Пустой секрет бэкенд отбивает («значение должно быть непустой строкой»),
    // и это правильно: переменная без значения доезжает до контейнера, бот
    // читает её как «токена нет» и молча не стартует.
    if (!token) errors.token = 'products.new.errors.tokenRequired';
    else if (token.length > SECRET_VALUE_MAX) errors.token = 'products.new.errors.tokenTooLong';
  }

  return errors;
}

export type SubmitResult = { ok: true } | { ok: false; message: string };

interface Props {
  kind: ProductKind;
  /**
   * Отдаёт итог СЕРВЕРА, а не void: без него форма не знает, разблокировать
   * ли кнопку и что показать при 409. Черновик плана был синхронным — с ним
   * отказ сервера не доходил до экрана вообще.
   */
  onSubmit: (input: NewProductInput) => Promise<SubmitResult>;
}

export const NewProductForm: React.FC<Props> = ({ kind, onSubmit }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [token, setToken] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  // Хвост слага бота живёт в состоянии, а не считается в submit: иначе
  // показать будущее имя контейнера нельзя (подсказка врала бы), а после
  // 409 повторное нажатие уходило бы с тем же слагом. Перевыпускается на
  // каждом неудачном заходе — это и есть способ разойтись с занятым слагом
  // на форме, где поля адреса нет.
  const [suffix, setSuffix] = useState(randomSuffix);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Замок отдельно от состояния: setSubmitting(true) применяется только к
  // следующему рендеру, а два клика подряд успевают пройти в одном тике —
  // и заводят два продукта под двумя слагами.
  const busy = useRef(false);

  const submit = async () => {
    if (busy.current) return;

    const found = validateDraft({ kind, name, slug, token });
    setErrors(found);
    setServerError(null);
    // Тихого return здесь нет: сообщения уже на экране, и нажатие всегда
    // чем-то отвечает. Молчаливый отказ выглядит как зависание — это главная
    // повторяющаяся форма дефекта в этой работе.
    if (Object.keys(found).length > 0) return;

    const finalSlug = kind === 'site' ? slug.trim() : deriveBotSlug(name, suffix);

    if (!SLUG_RE.test(finalSlug)) {
      // Практически недостижимо (deriveBotSlug всегда даёт годную основу), но
      // отправлять заведомо негодный слаг ради 400-й нельзя, а молчать —
      // тем более.
      setErrors({ name: 'products.new.errors.nameNoSlug' });
      return;
    }

    busy.current = true;
    setSubmitting(true);
    try {
      const result = await onSubmit({
        name: name.trim(),
        slug: finalSlug,
        kind,
        // Пустой объект, а не { BOT_TOKEN: '' }: у сайта секретов нет, и
        // лишнее имя уехало бы переменной окружения в контейнер.
        secrets: kind === 'bot' ? { BOT_TOKEN: token.trim() } : {},
      });
      if (!result.ok) {
        setServerError(result.message);
        // Слаг бота мог оказаться занятым, а исправить его на этой форме
        // нечем — поля адреса у бота нет. Новый хвост означает, что второе
        // нажатие «Создать» уйдёт под другим слагом.
        setSuffix(randomSuffix());
        return;
      }
      // Секрет не живёт в состоянии дольше нужного: форму после удачи
      // закрывают, но пока она на экране, токен из неё стирается.
      setToken('');
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const fieldClass = (field: Field) =>
    `w-full px-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-forest-500 disabled:bg-gray-50 disabled:text-gray-400 ${
      errors[field] ? 'border-red-300 bg-red-50' : 'border-gray-200'
    }`;

  const fieldError = (field: Field) =>
    errors[field] ? (
      <p role="alert" className="mt-1 text-xs text-red-600">
        {t(errors[field] as string)}
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="np-name" className="block text-sm font-medium text-gray-700 mb-1">
          {t('products.new.name')}
        </label>
        <input
          id="np-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onEnter}
          disabled={submitting}
          maxLength={NAME_MAX}
          aria-invalid={Boolean(errors.name)}
          placeholder={t('products.new.namePlaceholder')}
          className={fieldClass('name')}
        />
        {fieldError('name')}
        {kind === 'bot' && name.trim() && (
          // Домена у бота нет, и слаг нигде больше не виден — а всплывает он
          // каталогом на машине продуктов и строкой в логах, когда кто-то
          // разбирает отказ. Тайно сгенерированная идентичность — плохая
          // идентичность, поэтому показываем её здесь.
          <p className="mt-1 text-xs text-gray-500 break-all">
            {t('products.new.botSlugHint', { slug: deriveBotSlug(name, suffix) })}
          </p>
        )}
      </div>

      {kind === 'site' && (
        <div>
          <label htmlFor="np-slug" className="block text-sm font-medium text-gray-700 mb-1">
            {t('products.new.slug')}
          </label>
          <input
            id="np-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onKeyDown={onEnter}
            disabled={submitting}
            maxLength={SLUG_MAX}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.slug)}
            placeholder={t('products.new.slugPlaceholder')}
            className={fieldClass('slug')}
          />
          <p className="mt-1 text-xs text-gray-500 break-all">
            {slug.trim() && SLUG_RE.test(slug.trim())
              ? `${slug.trim()}.${PUBLIC_ZONE}`
              : t('products.new.slugHint')}
          </p>
          {fieldError('slug')}
        </div>
      )}

      {kind === 'bot' && (
        <div>
          <label htmlFor="np-token" className="block text-sm font-medium text-gray-700 mb-1">
            {t('products.new.token')}
          </label>
          <input
            id="np-token"
            // Секрет: в открытом поле он остаётся на экране и уезжает в
            // менеджер паролей и историю автозаполнения браузера.
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={onEnter}
            disabled={submitting}
            aria-invalid={Boolean(errors.token)}
            placeholder={t('products.new.tokenPlaceholder')}
            className={fieldClass('token')}
          />
          <p className="mt-1 text-xs text-gray-500">{t('products.new.tokenHint')}</p>
          {fieldError('token')}
        </div>
      )}

      {serverError && (
        <div
          role="alert"
          className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm break-words"
        >
          {serverError}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="flex items-center justify-center gap-1.5 w-full md:w-auto md:self-start px-5 py-2.5 rounded-xl bg-forest-600 hover:bg-forest-700 disabled:bg-gray-300 text-white font-medium text-sm shadow-md hover:shadow-lg disabled:shadow-none transition-all duration-200"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {t('products.new.creating')}
          </>
        ) : (
          <>
            <Plus size={16} />
            {t('products.new.submit')}
          </>
        )}
      </button>
    </div>
  );
};
