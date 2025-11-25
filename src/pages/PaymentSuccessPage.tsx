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
      const userId = searchParams.get('user_id');

      console.log('=== Payment Verification Debug ===');
      console.log('URL params:', Object.fromEntries(searchParams.entries()));
      console.log('Full URL:', window.location.href);
      console.log('userId (phone):', userId);

      if (!userId) {
        setStatus('error');
        setErrorMessage('Недостаточно данных для проверки платежа (отсутствует user_id)');
        return;
      }

      let paymentId: string | null = null;

      try {
        console.log('Fetching payment from database for phone:', userId);
        const { data: payment, error: dbError } = await supabase
          .from('payments')
          .select('payment_id, status, user_id, phone')
          .eq('phone', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log('Database query result:', { payment, error: dbError });

        if (dbError) {
          console.error('Database error:', dbError);
        } else if (payment) {
          paymentId = payment.payment_id;
          console.log('Found pending payment in database:', payment);
          console.log('Using payment_id:', paymentId);
        } else {
          console.log('No pending payment found in database for phone:', userId);
        }
      } catch (error) {
        console.error('Error fetching payment from database:', error);
      }

      if (!paymentId) {
        const paymentIdFromStorage = localStorage.getItem('pending_payment_id');
        const paymentIdFromSession = sessionStorage.getItem('pending_payment_id');
        paymentId = paymentIdFromStorage || paymentIdFromSession;
        console.log('Fallback to storage:', { paymentIdFromStorage, paymentIdFromSession, paymentId });
      }

      if (!paymentId) {
        setStatus('error');
        setErrorMessage('Не найден платеж для проверки. Попробуйте снова или свяжитесь с поддержкой.');
        console.error('Payment ID not found anywhere!');
        return;
      }

      try {
        console.log('Sending payment verification request:', { payment_id: paymentId, user_id: userId });

        const response = await fetch('https://travel-n8n.up.railway.app/webhook/yookassa/verify-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payment_id: paymentId,
            user_id: userId,
          }),
        });

        console.log('Payment verification response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('Payment verification response data:', data);

          if (data.yoo_status === 'succeeded' || data.db_status === 'succeeded') {
            setTokensAdded(data.tokens);
            if (user) {
              updateTokens((user.tokens || 0) + data.tokens);
            }
            setStatus('success');
            localStorage.removeItem('pending_payment_id');

            setTimeout(() => {
              navigate('/chat');
            }, 3000);
          } else if (data.yoo_status === 'pending' || data.db_status === 'pending') {
            setStatus('error');
            setErrorMessage('Платеж еще обрабатывается. Пожалуйста, подождите несколько минут и обновите страницу.');
          } else {
            setStatus('error');
            setErrorMessage('Платеж не был завершен');
            localStorage.removeItem('pending_payment_id');
          }
        } else {
          const errorData = await response.json();
          setStatus('error');
          setErrorMessage(errorData.message || 'Ошибка проверки платежа');
        }
      } catch (error) {
        console.error('Error verifying payment:', error);
        setStatus('error');
        setErrorMessage(`Произошла ошибка при проверке платежа: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
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
