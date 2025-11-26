import React, { useState } from 'react';
import { X, Coins, Check, Loader, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  price: number;
  popular?: boolean;
  savings?: string;
}

interface TokenPackagesProps {
  onClose: () => void;
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

export const TokenPackages: React.FC<TokenPackagesProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoadingEmail, setIsLoadingEmail] = useState(true);

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString('ru-RU');
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  React.useEffect(() => {
    const fetchUserEmail = async () => {
      if (!user?.phone) {
        setIsLoadingEmail(false);
        return;
      }

      try {
        const cleanPhone = user.phone.replace(/\D/g, '');
        const response = await fetch(
          `https://travel-n8n.up.railway.app/webhook/16279efb-08c5-4255-9ded-fdbafb507f32/profile/${cleanPhone}`
        );

        if (response.ok) {
          const data = await response.json();
          if (data.email) {
            setEmail(data.email);
          }
        }
      } catch (error) {
        console.error('Error fetching user email:', error);
      } finally {
        setIsLoadingEmail(false);
      }
    };

    fetchUserEmail();
  }, [user?.phone]);

  const handlePurchase = async (packageId: string) => {
    const selectedPkg = packages.find(pkg => pkg.id === packageId);
    if (!selectedPkg || !user?.phone) return;

    if (!email.trim()) {
      setEmailError('Пожалуйста, укажите email для получения чека');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Пожалуйста, укажите корректный email');
      return;
    }

    setEmailError('');
    setIsProcessing(true);
    setSelectedPackage(packageId);

    try {
      const cleanPhone = user.phone.replace(/\D/g, '');

      await fetch('https://travel-n8n.up.railway.app/webhook/set-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: cleanPhone,
          email: email.trim(),
        }),
      });

      const response = await fetch('https://travel-n8n.up.railway.app/webhook/yookassa/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: cleanPhone,
          package_id: packageId,
          email: email.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();

        if (data && data.confirmation_url) {
          window.location.href = data.confirmation_url;
        } else {
          throw new Error('Не получена ссылка на оплату');
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Пополнение токенов</h2>
            <p className="text-sm text-gray-600 mt-1">
              Выберите пакет токенов для продолжения работы с ассистентами
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
                  <span className="text-sm font-medium text-gray-700">Текущий баланс:</span>
                </div>
                <span className="text-xl font-bold text-forest-700">
                  {formatTokens(user.tokens)} токенов
                </span>
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-gray-600" />
                <span>Email для получения чека</span>
              </div>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              placeholder={isLoadingEmail ? 'Загрузка...' : 'example@mail.com'}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-colors ${
                emailError ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isProcessing || isLoadingEmail}
            />
            {emailError && (
              <p className="mt-2 text-sm text-red-600">{emailError}</p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              На указанный email будет отправлен чек об оплате
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
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

          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
              <Check className="w-5 h-5 text-blue-600 mr-2" />
              Что включено
            </h4>
            <ul className="space-y-2 text-sm text-gray-700">
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
        </div>
      </div>
    </div>
  );
};
