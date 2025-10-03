import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MessageCircle,
  Users,
  Search,
  User,
  Settings,
  TrendingUp
} from 'lucide-react';
import { clsx } from 'clsx';

const Navigation: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [profileCompletion, setProfileCompletion] = React.useState<number>(0);
  const [isLoadingCompletion, setIsLoadingCompletion] = React.useState(false);

  // Загрузка заполнения профиля с сервера
  const loadProfileCompletion = React.useCallback(async () => {
    if (!user?.phone) return;

    setIsLoadingCompletion(true);
    
    // Очищаем номер телефона от всех символов кроме цифр
    const cleanPhone = user.phone.replace(/\D/g, '');
    
    try {
      const response = await fetch(`https://travel-n8n.up.railway.app/webhook/16279efb-08c5-4255-9ded-fdbafb507f32/profile/${cleanPhone}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const responseData = await response.json();
        
        // Проверяем, является ли ответ массивом
        let profileRecord;
        if (Array.isArray(responseData) && responseData.length > 0) {
          // Берем первый элемент массива
          profileRecord = responseData[0];
        } else if (responseData && typeof responseData === 'object') {
          // Если это объект, используем его напрямую
          profileRecord = responseData;
        } else {
          throw new Error('Неожиданный формат ответа сервера');
        }
        
        // Извлекаем profile_data из записи
        const data = profileRecord.profile_data || profileRecord;
        
        // Получаем completeness и конвертируем в число
        const completion = data.completeness ? parseInt(data.completeness) : 0;
        setProfileCompletion(completion);
      } else {
        console.warn('Профиль не найден на сервере');
        setProfileCompletion(0);
      }
    } catch (error) {
      console.error('Ошибка при загрузке заполнения профиля:', error);
      setProfileCompletion(0);
    } finally {
      setIsLoadingCompletion(false);
    }
  }, [user?.phone]);

  // Загружаем заполнение профиля при монтировании компонента
  React.useEffect(() => {
    loadProfileCompletion();
  }, [loadProfileCompletion]);

  const navItems = [
    {
      to: '/chat',
      icon: MessageCircle,
      label: t('chat.title'),
    },
    {
      to: '/search',
      icon: Search,
      label: t('search.title'),
    },
    {
      to: '/profile',
      icon: User,
      label: t('profile.title'),
    },
    {
      to: '/settings',
      icon: Settings,
      label: t('settings.title'),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 md:relative md:border-t-0 md:border-r md:w-64 md:h-screen md:bg-gray-50">
      {/* Profile Completion - только для десктопа */}
      <div className="hidden md:block p-4 border-b border-gray-200 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">
            Заполнение профиля
          </h3>
          {isLoadingCompletion ? (
            <div className="w-4 h-4 border-2 border-forest-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg font-bold text-forest-600">
              {profileCompletion}%
            </span>
          )}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-forest-500 to-warm-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${profileCompletion}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {profileCompletion === 0 
            ? 'Начните общение с ассистентом для создания профиля'
            : 'Продолжайте общение для улучшения профиля'
          }
        </p>
      </div>

      <div className="flex justify-around md:flex-col md:space-y-2 md:p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center px-3 py-2 rounded-lg transition-colors duration-200',
                  'md:flex-row md:justify-start md:px-4 md:py-3',
                  isActive
                    ? 'text-forest-600 bg-forest-50'
                    : 'text-gray-600 hover:text-forest-600 hover:bg-warm-50'
                )
              }
            >
              <Icon className="w-6 h-6 md:w-4 md:h-4 md:mr-3" />
              <span className="hidden md:block text-sm">
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default Navigation;