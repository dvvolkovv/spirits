import React, { useEffect, useState } from 'react';
import { Wrench, Clock, AlertCircle } from 'lucide-react';
import { calculateTimeRemaining, formatTimeUnit, getMaintenanceEndTime, TimeRemaining } from '../utils/timeUtils';

const MaintenancePage: React.FC = () => {
  const maintenanceTimeInSeconds = parseInt(import.meta.env.VITE_MAINTENANCE_TIME || '0', 10);
  const [endTime] = useState(() => getMaintenanceEndTime(maintenanceTimeInSeconds));
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(calculateTimeRemaining(endTime));

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining(endTime);
      setTimeRemaining(remaining);

      if (remaining.total <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  const isExpired = timeRemaining.total <= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-forest-50 via-white to-warm-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-forest-600 to-warm-600 px-8 py-12 text-white text-center">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-white opacity-20 rounded-full animate-ping"></div>
                <Wrench className="w-20 h-20 relative z-10" />
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-3">Технические работы</h1>
            <p className="text-forest-50 text-lg">
              Мы улучшаем наш сервис для вас
            </p>
          </div>

          <div className="p-8 md:p-12">
            <div className="text-center mb-10">
              <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-6 py-3 rounded-full mb-6">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Сервис временно недоступен</span>
              </div>
              <p className="text-gray-600 text-lg leading-relaxed">
                В данный момент проводятся плановые технические работы для улучшения качества обслуживания.
                Приносим извинения за временные неудобства.
              </p>
            </div>

            {!isExpired ? (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 mb-8">
                <div className="flex items-center justify-center space-x-2 mb-6">
                  <Clock className="w-6 h-6 text-forest-600" />
                  <h2 className="text-xl font-semibold text-gray-800">Работы завершатся через:</h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl p-4 shadow-md">
                    <div className="text-4xl md:text-5xl font-bold text-forest-700 mb-2">
                      {String(timeRemaining.days).padStart(2, '0')}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                      {formatTimeUnit(timeRemaining.days, 'день', 'дней', 'дня')}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-4 shadow-md">
                    <div className="text-4xl md:text-5xl font-bold text-forest-700 mb-2">
                      {String(timeRemaining.hours).padStart(2, '0')}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                      {formatTimeUnit(timeRemaining.hours, 'час', 'часов', 'часа')}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-4 shadow-md">
                    <div className="text-4xl md:text-5xl font-bold text-forest-700 mb-2">
                      {String(timeRemaining.minutes).padStart(2, '0')}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                      {formatTimeUnit(timeRemaining.minutes, 'минута', 'минут', 'минуты')}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-4 shadow-md">
                    <div className="text-4xl md:text-5xl font-bold text-forest-700 mb-2">
                      {String(timeRemaining.seconds).padStart(2, '0')}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                      {formatTimeUnit(timeRemaining.seconds, 'секунда', 'секунд', 'секунды')}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-8 mb-8 text-center">
                <div className="text-green-600 text-xl font-semibold mb-2">
                  Технические работы завершены!
                </div>
                <p className="text-gray-600">
                  Пожалуйста, обновите страницу для продолжения работы с сервисом.
                </p>
              </div>
            )}

            <div className="text-center">
              <p className="text-gray-500 text-sm mb-4">
                Следите за обновлениями или свяжитесь с нами, если у вас возникли вопросы
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 bg-gradient-to-r from-forest-600 to-warm-600 text-white rounded-lg font-medium hover:from-forest-700 hover:to-warm-700 transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  Обновить страницу
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>Linkeon - платформа для поиска единомышленников</p>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
