import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader, AlertCircle, Coins } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const PaymentSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, updateTokens } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [tokensAdded, setTokensAdded] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyPayment = async () => {
      const paymentId = searchParams.get('payment_id');

      if (!paymentId || !user?.phone) {
        setStatus('error');
        setErrorMessage('Недостаточно данных для проверки платежа');
        return;
      }

      try {
        const cleanPhone = user.phone.replace(/\D/g, '');

        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/yookassa/verify-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payment_id: paymentId,
            phone: cleanPhone,
          }),
        });

        if (response.ok) {
          const data = await response.json();

          if (data.status === 'succeeded') {
            setTokensAdded(data.tokens_added);
            updateTokens((user.tokens || 0) + data.tokens_added);
            setStatus('success');

            setTimeout(() => {
              navigate('/chat');
            }, 3000);
          } else {
            setStatus('error');
            setErrorMessage(data.message || 'Платеж не был завершен');
          }
        } else {
          const errorData = await response.json();
          setStatus('error');
          setErrorMessage(errorData.message || 'Ошибка проверки платежа');
        }
      } catch (error) {
        console.error('Error verifying payment:', error);
        setStatus('error');
        setErrorMessage('Произошла ошибка при проверке платежа');
      }
    };

    verifyPayment();
  }, [searchParams, user, updateTokens, navigate]);

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString('ru-RU');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-forest-50 to-warm-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
        {status === 'loading' && (
          <div className="text-center">
            <Loader className="w-16 h-16 text-forest-600 animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Проверка платежа
            </h2>
            <p className="text-gray-600">
              Пожалуйста, подождите...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Оплата прошла успешно!
            </h2>
            <p className="text-gray-600 mb-6">
              Ваши токены успешно зачислены
            </p>

            <div className="bg-forest-50 rounded-lg p-6 border border-forest-200 mb-6">
              <div className="flex items-center justify-center space-x-3 mb-2">
                <Coins className="w-8 h-8 text-forest-600" />
                <span className="text-4xl font-bold text-forest-700">
                  +{formatTokens(tokensAdded)}
                </span>
              </div>
              <p className="text-sm text-gray-600">токенов добавлено</p>
            </div>

            <div className="text-sm text-gray-500">
              Вы будете перенаправлены в чат через несколько секунд...
            </div>

            <button
              onClick={() => navigate('/chat')}
              className="mt-6 w-full py-3 px-4 bg-forest-600 hover:bg-forest-700 text-white rounded-lg font-semibold transition-colors"
            >
              Перейти в чат
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Ошибка оплаты
            </h2>
            <p className="text-gray-600 mb-6">
              {errorMessage || 'Что-то пошло не так'}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/chat')}
                className="w-full py-3 px-4 bg-forest-600 hover:bg-forest-700 text-white rounded-lg font-semibold transition-colors"
              >
                Вернуться в чат
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors"
              >
                Попробовать снова
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccessPage;
