import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Coins, Check, Loader, ArrowLeft, Mail } from 'lucide-react';
import CouponInput from '../components/tokens/CouponInput';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/apiClient';
import { formatNumber } from '../utils/formatters';
import { TopUpHistory } from '../components/tokens/TopUpHistory';
import { RUB_PACKAGES, CRYPTO_NAME_KEY, CRYPTO_NAME_KEY_FALLBACK } from '../config/tokenPackages';

/** Ответ /webhook/payments/methods — какой способ оплаты доступен юзеру. */
interface PaymentMethod {
  provider: 'yookassa' | 'priem';
  currency: 'RUB' | 'USD';
  packages: { id: string; tokens: number; usd: number; cardAvailable?: boolean }[];
}

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

const TokenPurchasePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  // Способ оплаты решает бэкенд по языку профиля. Эта страница открывается по
  // прямой ссылке с лендинга, то есть с другого origin, и своей догадки о языке
  // у неё нет — спрашиваем.
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const isCrypto = method?.provider === 'priem';

  const packages: TokenPackage[] = isCrypto
    ? (method?.packages ?? []).map((p) => ({
        id: p.id,
        name: t(CRYPTO_NAME_KEY[p.id] ?? CRYPTO_NAME_KEY_FALLBACK),
        tokens: p.tokens,
        price: p.usd,
        cardAvailable: p.cardAvailable,
      }))
    : getPackages(t);

  /**
   * Режим «пять карточек в ряд» — см. такой же флаг в TokenPackages.tsx.
   * Витрина здесь своя, не общий компонент: в один модуль свели прайс
   * (config/tokenPackages.ts), а разметку — нет, поэтому правки в раскладке
   * приходится делать в обоих местах.
   */
  const fiveUp = packages.length > 3;

  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);
  const emailInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    // До ответа считаем оплату рублёвой — прежнее поведение.
    apiClient.get(`/webhook/payments/methods?lang=${encodeURIComponent(i18n.language || 'ru')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.provider) setMethod(data); })
      .catch((e) => console.error('payment methods:', e));
    // Язык в зависимостях: витрина зависит от него, и при переключении
    // языка в приложении рублёвые пакеты должны смениться долларовыми.
  }, [i18n.language]);

  useEffect(() => {
    const phoneParam = searchParams.get('phone');

    if (phoneParam) {
      setPhone(phoneParam);
    }

    if (user?.email) {
      setEmail(user.email);
    }

  }, [searchParams, user]);

  // Предвыбор пакета из адреса — отдельным эффектом, завязанным на method.
  // Список пакетов теперь приезжает с бэкенда, и на первом рендере он ещё
  // рублёвый: ссылка вида ?package=pro_usd не нашла бы себя и молча потерялась.
  // В зависимости стоит method, а не packages: последний — новый массив на
  // каждый рендер, и эффект перезаписывал бы выбор пользователя.
  useEffect(() => {
    const packageParam = searchParams.get('package');
    if (packageParam && packages.some(pkg => pkg.id === packageParam)) {
      setSelectedPackage(packageParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, method]);

  useEffect(() => {
    const fetchUserEmail = async () => {
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

  const formatTokens = (tokens: number) => {
    return formatNumber(tokens);
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handlePurchase = async (packageId: string, method: 'card' | 'crypto' = 'crypto') => {
    const selectedPkg = packages.find(pkg => pkg.id === packageId);
    if (!selectedPkg) return;

    if (isCrypto) {
      // Почта нужна YooKassa для чека по 54-ФЗ, к криптоплатежу не относится.
      setIsProcessing(true);
      setSelectedPackage(packageId);
      try {
        const response = await apiClient.post('/webhook/priem/create-payment', { package: packageId });
        const data = await response.json();
        if (!response.ok || !data?.payment_url) throw new Error(data?.error || 'no payment_url');
        // Обе ссылки — один платёж; card_url берём из свежего ответа и не
        // сохраняем: у закрытого платежа он null, а страница отвечает 409.
        window.location.href = method === 'card' && data.card_url ? data.card_url : data.payment_url;
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
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      emailInputRef.current?.focus();
      emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!validateEmail(email)) {
      setEmailError(t('payment.email_invalid_error'));
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      emailInputRef.current?.focus();
      emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    <div data-testid="token-packages-root" className="min-h-screen bg-gradient-to-br from-forest-50 via-white to-warm-50 relative">
      {showToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
          <div className="bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <Mail className="w-5 h-5" />
            <span className="font-medium">{t('payment.fill_email_toast')}</span>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('common.back')}</span>
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-forest-600 to-warm-600 px-6 py-8 text-white">
            <div className="flex items-center justify-center mb-4">
              <Coins className="w-12 h-12" />
            </div>
            <h1 className="text-3xl font-bold text-center mb-2">{t('payment.topup_modal_title')}</h1>
            <p className="text-center text-forest-50">
              {t('payment.topup_modal_subtitle')}
            </p>
          </div>

          <div className="p-8">
            {/* Почта нужна YooKassa для чека по 54-ФЗ; к криптоплатежу
                отношения не имеет — для него поле не показываем. */}
            <div className={`mb-8 ${isCrypto ? 'hidden' : ''}`}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-gray-600" />
                  <span>{t('payment.email_label')}</span>
                </div>
              </label>
              <input
                ref={emailInputRef}
                data-testid="token-email-input"
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

            {isCrypto && (
              <p className="mt-4 text-xs text-gray-500">{t('payment.card_note')}</p>
            )}

            {/* Подсказка про оплату картой снята: касса «Приёма» её не предлагает
                (проверено 2026-08-08 — только список монет и адрес для перевода).
                Вернуть, когда кнопка «Картой» появится. */}

            {/* Сетку делят две витрины разной длины: рублёвая на пять пакетов
                и валютная на три. Пять колонок на трёх карточках дали бы две
                пустые — расширяем только когда карточек больше 3. */}
            <div className={`grid md:grid-cols-3 gap-6 mb-8 ${fiveUp ? 'xl:grid-cols-5' : ''}`}>
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  data-testid={`token-package-${pkg.id}`}
                  /* min-w-0 обязателен: без него длинное слово задаёт колонке
                     минимальную ширину по себе и распирает трек грида наружу,
                     вместо того чтобы ужаться внутри карточки. */
                  className={`relative rounded-xl border-2 p-6 min-w-0 transition-all duration-200 ${
                    fiveUp ? 'xl:p-4' : ''
                  } ${
                    selectedPackage === pkg.id
                      ? 'border-forest-600 shadow-xl scale-105'
                      : pkg.popular
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

                  {pkg.savings && (
                    <div className="absolute -top-3 right-4">
                      <span className="bg-warm-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                        {pkg.savings}
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-6">
                    <h3 className={`text-xl font-bold text-gray-900 mb-2 leading-tight break-words ${
                      fiveUp ? 'xl:text-sm' : ''
                    }`}>{pkg.name}</h3>
                    <div className="flex items-center justify-center space-x-1 mb-2">
                      {/* shrink-0 — иначе на узкой колонке флексбокс сжимал
                          иконку в ноль и она обрезалась половиной монеты. */}
                      <Coins className="w-5 h-5 shrink-0 text-forest-600" />
                      <span className={`text-2xl font-bold text-forest-700 ${
                        fiveUp ? 'xl:text-xl' : ''
                      }`}>
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
                    <span className={`text-4xl font-bold text-gray-900 ${
                      fiveUp ? 'xl:text-3xl' : ''
                    }`}>{pkg.price}</span>
                    {!isCrypto && <span className="text-xl text-gray-600 ml-1">₽</span>}
                    </div>
                    <p className="text-center text-xs text-gray-500 mt-1">
                      {t(isCrypto ? 'payment.price_per_1000_tokens_usd' : 'payment.price_per_1000_tokens', {
                        price: (pkg.price / (pkg.tokens / 1000)).toFixed(isCrypto ? 3 : 2),
                      })}
                    </p>
                  </div>

                  {/* Для крипто-пути — две кнопки: «Приём» принимает и карту,
                      и криптовалюту, это один платёж. Карту ставим первой: у
                      большинства нет кошелька. Показываем её только если пакет
                      выше порога ($10) — ниже него card_url приходит null.
                      data-testid сохранён на обеих ветках: на него опирается смоук. */}
                  {isCrypto && pkg.cardAvailable ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => handlePurchase(pkg.id, 'card')}
                        disabled={isProcessing}
                        data-testid="token-buy-btn"
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
                    data-testid="token-buy-btn"
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

            {/* История — под кнопками оплаты, а не перед ними. */}
            <div className="mb-8">
              <TopUpHistory />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Check className="w-5 h-5 text-blue-600 mr-2" />
                  {t('payment.included_title')}
                </h4>
                <ul className="space-y-3 text-sm text-gray-700">
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

              <div className="p-6 bg-green-50 rounded-xl border border-green-200">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Coins className="w-5 h-5 text-green-600 mr-2" />
                  {t('payment.how_it_works_title')}
                </h4>
                <ol className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-2">1.</span>
                    <span>{t('payment.how_it_works_step1')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-2">2.</span>
                    <span>{t(isCrypto ? 'payment.how_it_works_step2_crypto' : 'payment.how_it_works_step2')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-2">3.</span>
                    <span>{t('payment.how_it_works_step3')}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-2">4.</span>
                    <span>{t('payment.how_it_works_step4')}</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenPurchasePage;
