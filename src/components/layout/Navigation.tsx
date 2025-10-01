import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MessageCircle,
  Users,
  Search,
  User,
  Settings
} from 'lucide-react';
import { clsx } from 'clsx';

const Navigation: React.FC = () => {
  const { t } = useTranslation();

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
      to: '/chats',
      icon: Users,
      label: t('chats.title'),
    },
    {
      to: '/profile',
      icon: User,
      label: t('profile.title'),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 md:relative md:border-t-0 md:border-r md:w-64 md:h-screen md:bg-gray-50">
      <div className="flex justify-around md:flex-col md:space-y-2 md:p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center px-3 py-2 rounded-lg transition-colors duration-200',
                  'md:flex-row md:px-4 md:py-3',
                  isActive
                    ? 'text-forest-600 bg-forest-50'
                    : 'text-gray-600 hover:text-forest-600 hover:bg-warm-50'
                )
              }
            >
              <Icon className="w-5 h-5 md:w-4 md:h-4 md:mr-3" />
              <span className="text-xs mt-1 md:text-sm md:mt-0">
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
      
      {/* Settings at bottom on desktop */}
      <div className="hidden md:block md:mt-auto md:p-4">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            clsx(
              'flex items-center px-4 py-3 rounded-lg transition-colors duration-200',
              isActive
                ? 'text-forest-600 bg-forest-50'
                : 'text-gray-600 hover:text-forest-600 hover:bg-warm-50'
            )
          }
        >
          <Settings className="w-4 h-4 mr-3" />
          <span className="text-sm">{t('settings.title')}</span>
        </NavLink>
      </div>
    </nav>
  );
};

export default Navigation;