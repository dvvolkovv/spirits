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

  // Mock profile completion - в реальном приложении это будет браться из профиля пользователя
  const mockProfile = {
    values: [
      { name: 'Честность', confidence: 95, private: false },
      { name: 'Креативность', confidence: 88, private: false },
      { name: 'Семья', confidence: 92, private: true },
      { name: 'Саморазвитие', confidence: 85, private: false },
    ],
    beliefs: [
      'Важность баланса между работой и личной жизнью',
      'Каждый человек уникален и ценен',
      'Непрерывное обучение - ключ к успеху',
    ],
    desires: [
      'Создать собственный проект',
      'Путешествовать по миру',
      'Найти единомышленников',
    ],
    intentions: [
      'Изучить новый навык в этом году',
      'Расширить круг общения',
      'Запустить социальный проект',
    ],
    completion: 78,
  };

  const profile = user?.profile || mockProfile;

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
          <span className="text-lg font-bold text-forest-600">
            {profile.completion}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-forest-500 to-warm-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${profile.completion}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Продолжайте общение для улучшения профиля
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