/**
 * Прайс токенов — единственный источник правды для витрин.
 *
 * До этого модуля прайс был выписан в пяти местах: две витрины, таблица в
 * PaymentInfoModal, перечисление в оферте LegalModal и карта tokensForPackage
 * на бэкенде. Копии разошлись: оферта перечисляла три пакета.
 *
 * Проценты скидок здесь — ЯРЛЫКИ, а не расчёт. Они округлены вниз до пятёрки,
 * чтобы обещание в интерфейсе оставалось заведомо выполнимым: у «Расширенного»
 * фактические 16.3% подписаны как 15%, у «Профессионального» 33.2% — как 30%.
 * Тест рядом следит, чтобы ярлык не обогнал фактическую выгоду.
 */

export interface RubPackage {
  id: string;
  priceRub: number;
  tokens: number;
  /** Ключ i18n для названия пакета. */
  nameKey: string;
  /**
   * Ключ i18n для строки вида «3 000 000 токенов». Число живёт внутри строки,
   * а не собирается из числа и слова: склонение «токенов» в семи языках
   * устроено по-разному, и склеивать его в коде некорректно.
   */
  amountKey: string;
  /** Ярлык скидки в процентах. У базового пакета отсутствует. */
  savingsPct?: number;
  popular?: boolean;
}

export const RUB_PACKAGES: RubPackage[] = [
  {
    id: 'starter',
    priceRub: 149,
    tokens: 50_000,
    // Ключ верхнеуровневый, а не payment.info.package_*, как у соседей: он
    // старше выделения секции payment.info и уже переведён везде — заводить
    // дубль незачем.
    nameKey: 'payment.package_starter_name',
    amountKey: 'payment.info.package_basic_amount',
  },
  {
    id: 'extended',
    priceRub: 499,
    tokens: 200_000,
    nameKey: 'payment.info.package_extended',
    amountKey: 'payment.info.package_extended_amount',
    savingsPct: 15,
  },
  {
    id: 'professional',
    priceRub: 1990,
    tokens: 1_000_000,
    nameKey: 'payment.info.package_pro',
    amountKey: 'payment.info.package_pro_amount',
    savingsPct: 30,
    popular: true,
  },
  {
    id: 'business',
    priceRub: 4990,
    tokens: 3_000_000,
    nameKey: 'payment.info.package_business',
    amountKey: 'payment.info.package_business_amount',
    savingsPct: 40,
  },
  {
    id: 'maximum',
    priceRub: 9990,
    tokens: 7_000_000,
    // Ключ существует с тех пор, когда «Максимальным» назывался валютный
    // max_usd. Переведён во всех семи локалях — заводить второй незачем.
    nameKey: 'payment.package_max_name',
    amountKey: 'payment.info.package_maximum_amount',
    savingsPct: 50,
  },
];

/**
 * Базовая цена за 1000 токенов — стартовый пакет. От неё считаются скидки.
 *
 * Выводится из самого прайса, а не выписывается числом: иначе при снижении
 * цены стартового пакета база осталась бы завышенной, «фактическая выгода»
 * посчиталась бы больше настоящей, и тест честности ярлыков остался бы зелёным
 * при завышенных обещаниях.
 */
export const BASE_PRICE_PER_1000 = RUB_PACKAGES[0].priceRub / (RUB_PACKAGES[0].tokens / 1000);

/**
 * id валютного пакета → ключ названия. Сами пакеты (цена, объём) приходят с
 * бэкенда через /webhook/payments/methods; фронт знает только, как их назвать.
 *
 * max_usd снят с витрины 11.08.2026: рядом с business_usd он ломал
 * монотонность — $19.6 за миллион против $20.7, то есть более крупный пакет
 * оказывался невыгодным. Ключ оставлен: пакет может приехать из кеша старого
 * ответа бэкенда, и подписать его всё равно надо.
 */
export const CRYPTO_NAME_KEY: Record<string, string> = {
  pro_usd: 'payment.info.package_pro',
  business_usd: 'payment.info.package_business',
  maximum_usd: 'payment.package_max_name',
  max_usd: 'payment.package_max_name',
};

/** Чем подписать валютный пакет с незнакомым id. */
export const CRYPTO_NAME_KEY_FALLBACK = 'payment.info.package_pro';

/**
 * Во столько токенов витрина оценивает одно сообщение в подписи «≈ N сообщений».
 *
 * Держится ВЫШЕ фактического среднего хода — обещание на витрине должно быть
 * заведомо выполнимым, как и ярлыки скидок выше. Замер прода 11–16.08.2026:
 * $0.798 за ход при курсе 4 500 токенов за доллар (spirits_back,
 * common/billing-rates.ts) — это ~3 600 токенов, берём 4 400 с запасом ~20%.
 *
 * Курс и эта оценка меняются ТОЛЬКО вместе. 17.08.2026 курс поднимали с 3 600 до
 * 4 500 — без правки этой константы витрина продолжила бы обещать 286 сообщений
 * за пакет 1990 ₽ там, где их осталось 278.
 */
export const TOKENS_PER_MESSAGE_ESTIMATE = 4400;

/** Сколько сообщений обещать за пакет — с округлением вниз. */
export const approxMessages = (tokens: number): number =>
  Math.floor(tokens / TOKENS_PER_MESSAGE_ESTIMATE);
