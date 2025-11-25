import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader, AlertCircle, Coins, ArrowLeft } from 'lucide-react';

const PaymentSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'pending'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkPaymentStatus = () => {
      const paymentStatus = searchParams.get('status');
      const paymentId = searchParams.get('payment_id');

      if (!paymentId) {
        setStatus('error');
        setMessage('Не найден идентификатор платежа');
        return;
      }

      if (paymentStatus === 'success' || paymentStatus === 'succeeded') {
        setStatus('success');
        setMessage('Платеж успешно обработан. Токены будут зачислены в ближайшее время.');
      } else if (paymentStatus === 'pending' || paymentStatus === 'waiting_for_capture') {
        setStatus('pending');
        setMessage('Платеж находится в обработке. Пожалуйста, подождите.');
      } else if (paymentStatus === 'canceled' || paymentStatus === 'cancelled') {
        setStatus('error');
        setMessage('Платеж был отменен');
      } else {
        setStatus('pending');
        setMessage('Проверка статуса платежа. Токены будут зачислены автоматически после подтверждения оплаты.');
      }
    };

    setTimeout(() => {
      checkPaymentStatus();
    }, 1000);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-forest-50 via-white to-warm-50 flex items-center justify-center p-4">
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
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Оплата прошла успешно!
            </h2>
            <p className="text-gray-600 mb-8">
              {message}
            </p>

            <div className="bg-gradient-to-br from-forest-50 to-warm-50 rounded-xl p-6 border-2 border-forest-200 mb-8">
              <div className="flex items-center justify-center space-x-3 mb-3">
                <Coins className="w-10 h-10 text-forest-600" />
                <span className="text-2xl font-bold text-forest-700">
                  Токены зачисляются
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Баланс обновится автоматически в течение нескольких минут
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/chat')}
                className="w-full py-3 px-4 bg-gradient-to-r from-forest-600 to-warm-600 hover:from-forest-700 hover:to-warm-700 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg"
              >
                Перейти в чат
              </button>
              <button
                onClick={() => navigate('/profile')}
                className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors"
              >
                Мой профиль
              </button>
            </div>
          </div>
        )}

        {status === 'pending' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader className="w-12 h-12 text-blue-600 animate-spin" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Платеж обрабатывается
            </h2>
            <p className="text-gray-600 mb-8">
              {message}
            </p>

            <div className="bg-blue-50 rounded-xl p-6 border-2 border-blue-200 mb-8">
              <div className="flex items-center space-x-3 mb-3">
                <AlertCircle className="w-8 h-8 text-blue-600" />
                <p className="text-sm text-gray-700 text-left">
                  Платеж находится в обработке. Токены будут автоматически зачислены после подтверждения платежа банком.
                </p>
              </div>
              <p className="text-xs text-gray-600 mt-3">
                Обычно это занимает от нескольких секунд до 5 минут.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/chat')}
                className="w-full py-3 px-4 bg-forest-600 hover:bg-forest-700 text-white rounded-lg font-semibold transition-colors"
              >
                Перейти в чат
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
              >
                <Loader className="w-5 h-5" />
                <span>Обновить статус</span>
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-12 h-12 text-red-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              Ошибка оплаты
            </h2>
            <p className="text-gray-600 mb-8">
              {message || 'Что-то пошло не так при обработке платежа'}
            </p>

            <div className="bg-red-50 rounded-xl p-6 border-2 border-red-200 mb-8">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-sm text-gray-700 mb-2">
                    Возможные причины:
                  </p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>• Платеж был отменен</li>
                    <li>• Недостаточно средств на карте</li>
                    <li>• Истекло время ожидания</li>
                    <li>• Технические проблемы</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/chat')}
                className="w-full py-3 px-4 bg-forest-600 hover:bg-forest-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Вернуться в чат</span>
              </button>
              <button
                onClick={() => window.history.back()}
                className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors"
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
