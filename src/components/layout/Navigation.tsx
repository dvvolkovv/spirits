import React, { useState } from 'react';
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
  Shield,
  Coins,
  Plus
} from 'lucide-react';
import { clsx } from 'clsx';
import { TokenPackages } from '../tokens/TokenPackages';

const Navigation: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateTokens } = useAuth();
  const [showTokenPackages, setShowTokenPackages] = useState(false);

  React.useEffect(() => {
    if (user && user.tokens === undefined) {
      updateTokens(50000);
    }
  }, [user, updateTokens]);

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

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString('ru-RU');
  };

  return (
    <>
      {showTokenPackages && (
        <TokenPackages onClose={() => setShowTokenPackages(false)} />
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-50 md:relative md:border-t-0 md:border-r md:w-64 md:h-screen md:bg-gray-50">
        {/* Tokens Display - только для десктопа */}
        {user?.tokens !== undefined && (
          <div className="hidden md:block mb-4 px-4 pt-4">
            <button
              onClick={() => setShowTokenPackages(true)}
              className="w-full bg-gradient-to-br from-forest-50 to-warm-50 rounded-lg p-4 border border-forest-200 hover:border-forest-300 transition-all hover:shadow-md text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Coins className="w-5 h-5 text-forest-600" />
                  <span className="text-sm font-medium text-gray-700">Токены</span>
                </div>
                <Plus className="w-4 h-4 text-forest-600" />
              </div>
              <div className="text-2xl font-bold text-forest-700">
                {formatTokens(user.tokens)}
              </div>
              <p className="text-xs text-forest-600 mt-1 font-medium">
                Нажмите для пополнения
              </p>
            </button>
          </div>
        )}

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
    </>
  );
};

export default Navigation;