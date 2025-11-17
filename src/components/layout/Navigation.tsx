import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MessageCircle,
  Users,
  User,
  TrendingUp,
  Heart,
  ArrowRight,
  Shield
} from 'lucide-react';
import { clsx } from 'clsx';

const Navigation: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [profileCompletion, setProfileCompletion] = React.useState<number | null>(null);
  const [isLoadingCompletion, setIsLoadingCompletion] = React.useState(false);

  // Загрузка заполнения профиля с сервера
  const loadProfileCompletion = React.useCallback(async () => {
    if (!user?.phone) return;

    setIsLoadingCompletion(true);
    
    // Очищаем номер телефона от всех символов кроме цифр
    const cleanPhone = user.phone.replace(/\D/g, '');
    
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/16279efb-08c5-4255-9ded-fdbafb507f32/profile/${cleanPhone}`, {
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
        if (data.completeness) {
          const completion = parseInt(data.completeness);
          // Если это валидное число, сохраняем его, иначе null
          setProfileCompletion(isNaN(completion) ? null : completion);
        } else {
          setProfileCompletion(0);
        }
      } else {
        console.warn('Профиль не найден на сервере');
        setProfileCompletion(null);
      }
    } catch (error) {
      console.error('Ошибка при загрузке заполнения профиля:', error);
      setProfileCompletion(null);
    } finally {
      setIsLoadingCompletion(false);
    }
  }, [user?.phone]);

  // Загружаем заполнение профиля при монтировании компонента
  React.useEffect(() => {
    loadProfileCompletion();
  }, [loadProfileCompletion]);

  const baseNavItems = [
    {
      to: '/chat',
      icon: MessageCircle,
      label: t('chat.title'),
      isLogo: false,
    },
    {
      to: '/search',
      icon: ArrowRight,
      label: t('search.title'),
      isLogo: false,
    },
    {
      to: '/compatibility',
      icon: Heart,
      label: 'Совместимость',
      isLogo: false,
    },
    {
      to: '/profile',
      icon: User,
      label: t('profile.title'),
      isLogo: false,
    },
  ];

  const adminNavItem = {
    to: '/admin',
    icon: Shield,
    label: 'Admin',
    isLogo: false,
  };

  const navItems = user?.isAdmin ? [...baseNavItems, adminNavItem] : baseNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-50 md:relative md:border-t-0 md:border-r md:w-64 md:h-screen md:bg-gray-50">
      {/* Profile Completion - только для десктопа */}


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
              {item.isLogo ? (
                <img
                  src="/logo-Photoroom.png"
                  alt={item.label}
                  className="w-6 h-6 md:w-5 md:h-5 md:mr-3 object-contain"
                />
              ) : (
                <Icon className="w-6 h-6 md:w-4 md:h-4 md:mr-3" />
              )}
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