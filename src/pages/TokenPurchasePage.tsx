import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Coins, Check, Loader, ArrowLeft } from 'lucide-react';

interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  price: number;
  popular?: boolean;
  savings?: string;
}

const packages: TokenPackage[] = [
  {
    id: 'starter',
    name: 'Стартовый',
    tokens: 50000,
    price: 149,
  },
  {
    id: 'extended',
    name: 'Расширенный',
    tokens: 200000,
    price: 499,
    popular: true,
    savings: 'Экономия 15%',
  },
  {
    id: 'professional',
    name: 'Профессиональный',
    tokens: 1000000,
    price: 1990,
    savings: 'Экономия 30%',
  },
];

const TokenPurchasePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    const phoneParam = searchParams.get('phone');
    const packageParam = searchParams.get('package');

    if (phoneParam) {
      setPhone(phoneParam);
    }

    if (packageParam && packages.some(pkg => pkg.id === packageParam)) {
      setSelectedPackage(packageParam);
    }
  }, [searchParams]);

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString('ru-RU');
  };

  const handlePurchase = async (packageId: string) => {
    const selectedPkg = packages.find(pkg => pkg.id === packageId);
    if (!selectedPkg) return;

    if (!phone) {
      alert('Пожалуйста, укажите номер телефона');
      return;
    }

    setIsProcessing(true);
    setSelectedPackage(packageId);

    try {
      const cleanPhone = phone.replace(/\D/g, '');

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/yookassa/create-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: cleanPhone,
          package_id: packageId,
          tokens: selectedPkg.tokens,
          amount: selectedPkg.price,
          description: `Пополнение ${formatTokens(selectedPkg.tokens)} токенов`,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.confirmation_url) {
          window.location.href = data.confirmation_url;
        } else {
          throw new Error('Не получен URL для оплаты');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Ошибка создания платежа');
      }
    } catch (error) {
      console.error('Ошибка при создании платежа:', error);
      alert('Произошла ошибка при создании платежа. Попробуйте позже.');
      setIsProcessing(false);
      setSelectedPackage(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-forest-50 via-white to-warm-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Назад</span>
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-forest-600 to-warm-600 px-6 py-8 text-white">
            <div className="flex items-center justify-center mb-4">
              <Coins className="w-12 h-12" />
            </div>
            <h1 className="text-3xl font-bold text-center mb-2">Пополнение токенов</h1>
            <p className="text-center text-forest-50">
              Выберите пакет токенов для продолжения работы с ассистентами
            </p>
          </div>

          <div className="p-8">
            {!phone && (
              <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Важно:</strong> Для покупки токенов необходим номер телефона. Пожалуйста, укажите его в параметре URL.
                </p>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`relative rounded-xl border-2 p-6 transition-all duration-200 ${
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
                        Популярный
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
                    <p className="text-sm text-gray-600">токенов</p>
                  </div>

                  <div className="mb-6">
                    <div className="text-center">
                      <span className="text-4xl font-bold text-gray-900">{pkg.price}</span>
                      <span className="text-xl text-gray-600 ml-1">₽</span>
                    </div>
                    <p className="text-center text-xs text-gray-500 mt-1">
                      ~{(pkg.price / (pkg.tokens / 1000)).toFixed(2)} ₽ за 1000 токенов
                    </p>
                  </div>

                  <button
                    onClick={() => handlePurchase(pkg.id)}
                    disabled={isProcessing || !phone}
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 ${
                      pkg.popular
                        ? 'bg-gradient-to-r from-forest-600 to-warm-600 text-white hover:from-forest-700 hover:to-warm-700 shadow-md hover:shadow-lg'
                        : 'bg-forest-600 text-white hover:bg-forest-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isProcessing && selectedPackage === pkg.id ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        <span>Обработка...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        <span>Купить</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Check className="w-5 h-5 text-blue-600 mr-2" />
                  Что включено
                </h4>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span>Общение со всеми доступными ассистентами</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span>Токены не сгорают и действуют бессрочно</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span>Безопасная оплата через ЮKassa</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span>Мгновенное зачисление токенов после оплаты</span>
                  </li>
                </ul>
              </div>

              <div className="p-6 bg-green-50 rounded-xl border border-green-200">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Coins className="w-5 h-5 text-green-600 mr-2" />
                  Как это работает
                </h4>
                <ol className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-2">1.</span>
                    <span>Выберите подходящий пакет токенов</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-2">2.</span>
                    <span>Оплатите удобным способом через ЮKassa</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-2">3.</span>
                    <span>Токены мгновенно зачислятся на ваш счет</span>
                  </li>
                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-2">4.</span>
                    <span>Начните общение с ассистентами</span>
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
