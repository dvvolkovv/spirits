import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Coins, Check, Loader, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/apiClient';
import CouponInput from './CouponInput';
import { TopUpHistory } from './TopUpHistory';
import { formatNumber } from '../../utils/formatters';
import { RUB_PACKAGES, CRYPTO_NAME_KEY, CRYPTO_NAME_KEY_FALLBACK } from '../../config/tokenPackages';

interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  price: number;
  /** Только для крипто-витрины: проходит ли пакет порог оплаты картой. */
  cardAvailable?: boolean;
  popular?: boolean;
  savings?: string;
}

interface TokenPackagesProps {
  onClose: () => void;
}

/** Ответ /webhook/payments/methods — какой способ оплаты доступен юзеру. */
interface PaymentMethod {
  provider: 'yookassa' | 'priem';
  currency: 'RUB' | 'USD';
  packages: { id: string; tokens: number; usd: number; cardAvailable?: boolean }[];
  available: boolean;
}

const getPackages = (t: (key: string, opts?: Record<string, unknown>) => string): TokenPackage[] =>
  RUB_PACKAGES.map((p) => ({
    id: p.id,
    name: t(p.nameKey),
    tokens: p.tokens,
    price: p.priceRub,
    popular: p.popular,
    savings: p.savingsPct === undefined
      ? undefined
      : t('payment.package_savings', { percent: p.savingsPct }),
  }));

export const TokenPackages: React.FC<TokenPackagesProps> = ({ onClose }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  // Способ оплаты решает бэкенд по языку профиля: ru — YooKassa в рублях,
  // остальные — «Приём» (криптовалюта) в долларах. Фронт не гадает сам, иначе
  // правило пришлось бы держать в двух местах.
  //
  // Долларовые пакеты приходят оттуда же: они НЕ пересчитаны из рублёвых.
  // Комиссия сети не зависит от суммы, поэтому на мелком чеке она разорительна
  // (на $5 это +16% в TRON), а оплата картой у «Приёма» недоступна ниже $10.
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const isCrypto = method?.provider === 'priem';
  const [isProcessing, setIsProcessing] = useState(false);
  // Пришли из оффера (?offer=1) — показываем бейдж «+50% к первому пакету».
  // Реальный бонус всё равно начисляет бэкенд по факту первой оплаты вовлечённого.
  const isOffer = new URLSearchParams(window.location.search).get('offer') === '1';
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);

  const formatTokens = (tokens: number) => {
    return formatNumber(tokens);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  React.useEffect(() => {
    const fetchUserEmail = async () => {
      // Pre-fill from context if already known
      if (user?.email) {
        setEmail(user.email);
        setIsLoadingEmail(false);
        return;
      }
      try {
        const response = await apiClient.get(`/webhook/profile`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            const profileData = data[0].profileJson || data[0];
            setEmail(profileData.email || '');
          }
        }
      } catch (error) {
        console.error('Error fetching user email:', error);
      } finally {
        setIsLoadingEmail(false);
      }
    };

    fetchUserEmail();
  }, [user?.id]);

  React.useEffect(() => {
    // До ответа считаем оплату рублёвой: это прежнее поведение, и если запрос
    // не дойдёт, российский пользователь ничего не заметит.
    apiClient.get(`/webhook/payments/methods?lang=${encodeURIComponent(i18n.language || 'ru')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.provider) setMethod(data); })
      .catch((e) => console.error('payment methods:', e));
    // Язык в зависимостях: витрина зависит от него, и при переключении
    // языка в приложении рублёвые пакеты должны смениться долларовыми.
  }, [i18n.language]);

  // Рублёвая витрина зашита на фронте, долларовая приходит с бэкенда.
  const packages: TokenPackage[] = isCrypto
    ? (method?.packages ?? []).map((p) => ({
        id: p.id,
        // Название берём именным ключом, а не строкой с числом: количество
        // токенов карточка и так показывает отдельной строкой, а склонение
        // «токенов» в шести языках устроено по-разному, и подставлять его
        // в название незачем.
        name: t(CRYPTO_NAME_KEY[p.id] ?? CRYPTO_NAME_KEY_FALLBACK),
        tokens: p.tokens,
        price: p.usd,
        cardAvailable: p.cardAvailable,
      }))
    : getPackages(t);

  const handlePurchase = async (packageId: string, method: 'card' | 'crypto' = 'crypto') => {
    const selectedPkg = packages.find(pkg => pkg.id === packageId);
    if (!selectedPkg) return;

    if (isCrypto) {
      // Почта здесь не спрашивается: она нужна YooKassa для фискального чека
      // по 54-ФЗ, а к криптоплатежу отношения не имеет.
      setIsProcessing(true);
      setSelectedPackage(packageId);
      try {
        const response = await apiClient.post('/webhook/priem/create-payment', { package: packageId });
        const data = await response.json();
        if (!response.ok || !data?.payment_url) {
          throw new Error(data?.error || 'no payment_url');
        }
        // Обе ссылки ведут на ОДИН платёж — карточный путь не заводит второго
        // счёта, и коллбэк придёт с тем же payment_id. Ссылку берём из свежего
        // ответа и никуда не сохраняем: у зачисленного или истёкшего платежа
        // card_url становится null, а страница отвечает 409.
        const target = method === 'card' && data.card_url ? data.card_url : data.payment_url;
        if (data.payment_id) localStorage.setItem('pending_payment_id', data.payment_id);
        window.location.href = target;
      } catch (error) {
        console.error('Ошибка при создании крипто-платежа:', error);
        alert(t('payment.create_payment_error'));
        setIsProcessing(false);
        setSelectedPackage(null);
      }
      return;
    }

    if (!email.trim()) {
      setEmailError(t('payment.email_required_error'));
      return;
    }

    if (!validateEmail(email)) {
      setEmailError(t('payment.email_invalid_error'));
      return;
    }

    setEmailError('');
    setIsProcessing(true);
    setSelectedPackage(packageId);

    try {
      await apiClient.post('/webhook/set-email', {
        email: email.trim(),
      });

      const response = await apiClient.post('/webhook/yookassa/create-payment', {
        package_id: packageId,
        email: email.trim(),
      });

      if (response.ok) {
        const data = await response.json();

        if (data && data.confirmation_url) {
          if (data.payment_id) localStorage.setItem('pending_payment_id', data.payment_id);
          window.location.href = data.confirmation_url;
        } else {
          // i18n-ignore: текст ловится catch'ем ниже и уходит в console.error;
          // пользователю показывается переведённый alert payment.create_payment_error
          throw new Error('Не получена ссылка на оплату');
        }
      } else {
        const errorData = await response.json();
        // i18n-ignore: см. выше — до UI не доходит
        throw new Error(errorData.message || 'Ошибка создания платежа');
      }
    } catch (error) {
      console.error('Ошибка при создании платежа:', error);
      alert(t('payment.create_payment_error'));
      setIsProcessing(false);
      setSelectedPackage(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t('payment.topup_modal_title')}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {t('payment.topup_modal_subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
            disabled={isProcessing}
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="p-6">
          {user?.tokens !== undefined && (
            <div className="mb-6 p-4 bg-forest-50 rounded-lg border border-forest-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Coins className="w-5 h-5 text-forest-600" />
                  <span className="text-sm font-medium text-gray-700">{t('payment.current_balance_label')}</span>
                </div>
                <span className="text-xl font-bold text-forest-700">
                  {formatTokens(user.tokens)} {t('chat.tokens_suffix')}
                </span>
              </div>
            </div>
          )}

          <div className="mb-6">
            <CouponInput />
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-white text-gray-500">{t('payment.or_buy_package')}</span>
            </div>
          </div>

          {/* Почта нужна YooKassa для фискального чека по 54-ФЗ. К криптоплатежу
              она отношения не имеет — для него поле не показываем. */}
          <div className={`mb-6 ${isCrypto ? 'hidden' : ''}`}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-gray-600" />
                <span>{t('payment.email_label')}</span>
              </div>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              placeholder={isLoadingEmail ? t('common.loading') : 'example@mail.com'}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-colors ${
                emailError ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isProcessing || isLoadingEmail}
            />
            {emailError && (
              <p className="mt-2 text-sm text-red-600">{emailError}</p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              {t('payment.email_hint')}
            </p>
          </div>

          {isCrypto && (
            <p className="mt-4 text-xs text-gray-500">{t('payment.card_note')}</p>
          )}

          {/* Подсказка про оплату картой снята: касса «Приёма» её не предлагает
              (проверено 2026-08-08 — только список монет и адрес для перевода).
              Вернуть, когда кнопка «Картой» появится. */}

          {/* Сетку делят две витрины разной длины: рублёвая на пять пакетов и
              валютная на три. Пять колонок на трёх карточках дали бы две
              пустые — поэтому расширяем сетку только когда карточек больше 3. */}
          <div className={`grid md:grid-cols-3 gap-6 ${packages.length > 3 ? 'lg:grid-cols-5' : ''}`}>
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className={`relative rounded-xl border-2 p-6 transition-all duration-200 ${
                  pkg.popular
                    ? 'border-forest-500 shadow-lg scale-105'
                    : 'border-gray-200 hover:border-forest-300 hover:shadow-md'
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-to-r from-forest-600 to-warm-600 text-white px-4 py-1 rounded-full text-xs font-semibold">
                      {t('payment.popular_badge')}
                    </span>
                  </div>
                )}

                {isOffer && (
                  <div className="absolute -top-3 left-4">
                    <span className="bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                      {t('payment.offer_badge')}
                    </span>
                  </div>
                )}

                {pkg.savings && (
                  <div className="absolute -top-3 right-4">
                    <span className="bg-warm-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                      {pkg.savings}
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{pkg.name}</h3>
                  <div className="flex items-center justify-center space-x-1 mb-2">
                    <Coins className="w-5 h-5 text-forest-600" />
                    <span className="text-2xl font-bold text-forest-700">
                      {formatTokens(pkg.tokens)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{t('chat.tokens_suffix')}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {t('payment.approx_messages_label', {
                      count: Math.floor(pkg.tokens / 3500),
                      formatted: formatNumber(Math.floor(pkg.tokens / 3500)),
                    })}
                  </p>
                </div>

                <div className="mb-6">
                  <div className="text-center">
                    {isCrypto && <span className="text-xl text-gray-600 mr-1">$</span>}
                    <span className="text-4xl font-bold text-gray-900">{pkg.price}</span>
                    {!isCrypto && <span className="text-xl text-gray-600 ml-1">₽</span>}
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-1">
                    {t(isCrypto ? 'payment.price_per_1000_tokens_usd' : 'payment.price_per_1000_tokens', {
                      price: (pkg.price / (pkg.tokens / 1000)).toFixed(isCrypto ? 3 : 2),
                    })}
                  </p>
                </div>

                {/* Для крипто-пути — две кнопки: «Приём» принимает и карту, и
                    криптовалюту, это один и тот же платёж. Карту ставим первой:
                    у большинства нет кошелька, и без неё оплата им недоступна.
                    Кнопка карты показывается только если пакет выше порога
                    (сейчас $10) — ниже него «Приём» отдаёт card_url = null,
                    и кнопка вела бы в отказ. */}
                {isCrypto && pkg.cardAvailable ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => handlePurchase(pkg.id, 'card')}
                      disabled={isProcessing}
                      className="w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing && selectedPackage === pkg.id ? (
                        <>
                          <Loader className="w-5 h-5 animate-spin" />
                          <span>{t('payment.processing_label')}</span>
                        </>
                      ) : (
                        <span>{t('payment.pay_by_card')}</span>
                      )}
                    </button>
                    <button
                      onClick={() => handlePurchase(pkg.id, 'crypto')}
                      disabled={isProcessing}
                      className="w-full py-2.5 px-4 rounded-lg font-medium transition-all duration-200 border border-forest-600 text-forest-700 hover:bg-forest-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>{t('payment.pay_by_crypto')}</span>
                    </button>
                  </div>
                ) : (
                <button
                  onClick={() => handlePurchase(pkg.id)}
                  disabled={isProcessing}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 ${
                    pkg.popular
                      ? 'bg-gradient-to-r from-forest-600 to-warm-600 text-white hover:from-forest-700 hover:to-warm-700 shadow-md hover:shadow-lg'
                      : 'bg-forest-600 text-white hover:bg-forest-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isProcessing && selectedPackage === pkg.id ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      <span>{t('payment.processing_label')}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      <span>{t('payment.buy_button')}</span>
                    </>
                  )}
                </button>
                )}
              </div>
            ))}
          </div>

          {/* История — под кнопками оплаты: сначала то, ради чего пришли,
              потом справка о прошлых пополнениях. */}
          <div className="mt-8">
            <TopUpHistory />
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
              <Check className="w-5 h-5 text-blue-600 mr-2" />
              {t('payment.included_title')}
            </h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>{t('payment.included_item_chat')}</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>{t('payment.included_item_no_expiry')}</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>{t(isCrypto ? 'payment.included_item_secure_payment_crypto' : 'payment.included_item_secure_payment')}</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>{t('payment.included_item_instant_credit')}</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span className="text-gray-500">{t('payment.included_item_messages_note')}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
