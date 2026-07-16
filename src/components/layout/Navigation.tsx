import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  MessageCircle,
  User,
  TrendingUp,
  Heart,
  ArrowRight,
  Shield,
  Coins,
  Plus,
  ImageIcon,
  Film,
  HelpCircle,
  Sparkles,
  Inbox,
} from 'lucide-react';
import { clsx } from 'clsx';
import { TokenPackages } from '../tokens/TokenPackages';
import LegalModal from '../onboarding/LegalModal';
import { useUnreadSummary } from '../peer/usePeer';
import { hasSmsBridge } from '../../services/smsClient';

const Navigation: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateTokens, checkAdminStatus } = useAuth();
  const [showTokenPackages, setShowTokenPackages] = useState(false);
  const [showLegal, setShowLegal] = useState<'terms' | 'privacy' | null>(null);
  const unread = useUnreadSummary();
  const peerBadge = unread.incomingRequests + unread.unreadMessages;
  const location = useLocation();
  const mobileNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mobileNavRef.current;
    if (!container || window.innerWidth >= 768) return; // md breakpoint — only on mobile
    const activePath = location.pathname.split('/')[1];
    const activeEl = container.querySelector<HTMLElement>(`[data-testid="nav-item-${activePath}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [location.pathname]);

  useEffect(() => {
    if (user && user.tokens === undefined) {
      updateTokens(0);
    }
  }, [user, updateTokens]);

  useEffect(() => {
    if (user?.phone) {
      checkAdminStatus();
    }
  }, [user?.phone]);


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
      label: t('nav.networking'),
      isLogo: false,
      badge: peerBadge,
    },
    {
      to: '/image-gen',
      icon: ImageIcon,
      label: t('nav.image_gen'),
      isLogo: false,
    },
    {
      to: '/video',
      icon: Film,
      label: t('video.navTitle'),
      isLogo: false,
    },
  ];

  // SMS-линза [Фаза 3a] — только в нативном приложении (плагин SmsBridge есть
  // лишь там). На вебе плагина нет → пункт не показывается. Даёт точку входа на
  // экран «Сообщения», где доступ к SMS запрашивается в контексте.
  const messagesNavItem = {
    to: '/messages',
    icon: Inbox,
    label: t('nav.messages', 'Сообщения'),
    isLogo: false,
  };

  // Профиль отдельно — чтобы можно было вставить «Студию» (и другие админские
  // пункты) до него.
  const profileNavItem = {
    to: '/profile',
    icon: User,
    label: t('profile.title'),
    isLogo: false,
  };

  const adminNavItem = {
    to: '/admin',
    icon: Shield,
    label: t('admin.title'),
    isLogo: false,
  };

  const studioNavItem = {
    to: '/studio',
    icon: Sparkles,
    label: t('studio.nav'),
    isLogo: false,
  };

  // Реферальная программа переехала в аккордеон Профиля — пункт из nav убран.

  const helpNavItem = {
    to: '/help',
    icon: HelpCircle,
    label: t('nav.help'),
    isLogo: false,
  };

  const navItems = [
    ...baseNavItems,
    // «Сообщения» (SMS-линза) — только в нативном приложении.
    ...(hasSmsBridge() ? [messagesNavItem] : []),
    // Студия доступна всем (создание агентов и Telegram-ботов).
    studioNavItem,
    // Админ-инструменты — только для админов.
    ...(user?.isAdmin ? [adminNavItem] : []),
    profileNavItem,
    helpNavItem,
  ];

  const formatTokens = (tokens: number) => {
    return tokens.toLocaleString();
  };

  return (
    <>
      {showTokenPackages && (
        <TokenPackages onClose={() => setShowTokenPackages(false)} />
      )}
      {showLegal && (
        <LegalModal isOpen={true} onClose={() => setShowLegal(null)} type={showLegal} />
      )}

      <nav data-testid="nav-root" className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-50 md:relative md:border-t-0 md:border-r md:w-64 md:h-screen md:bg-gray-50 md:overflow-y-auto">
        {/* Logo — desktop only */}
        <a href="/profile" className="hidden md:flex items-center gap-2 px-4 pt-3 pb-1 hover:opacity-70 transition-opacity">
          <img src="/logo-Photoroom.png" alt="LINKEON.IO" className="w-6 h-6 object-contain opacity-70" />
          <span className="text-xs font-medium text-gray-400">LINKEON.IO</span>
        </a>

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
                  <span className="text-sm font-medium text-gray-700">{t('nav.tokens.label')}</span>
                </div>
                <Plus className="w-4 h-4 text-forest-600" />
              </div>
              <div className="text-2xl font-bold text-forest-700">
                {formatTokens(user.tokens)}
              </div>
              <p className="text-xs text-forest-600 mt-1 font-medium">
                {t('nav.tokens.top_up')}
              </p>
            </button>
            {/* Token pricing info */}
            <div className="relative mt-2 group">
              <button className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors px-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="2"/><path strokeLinecap="round" d="M12 16v-4m0-4h.01" strokeWidth="2"/></svg>
                <span>{t('nav.tokens.how_question')}</span>
              </button>
              <div className="hidden group-hover:block absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 text-[11px] text-gray-600 leading-relaxed">
                <p className="font-semibold text-gray-800 mb-1">{t('nav.tokens.how_title')}</p>
                <p className="mb-1">{t('nav.tokens.how_line1')}</p>
                <p className="mb-1">{t('nav.tokens.how_line2')}</p>
                <p className="text-gray-500">{t('nav.tokens.how_line3')}</p>
              </div>
            </div>
          </div>
        )}

      <div
        ref={mobileNavRef}
        className="flex gap-1 overflow-x-auto scrollbar-hide md:overflow-x-visible md:gap-0 md:flex-col md:space-y-2 md:p-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const navTestId = `nav-item-${item.to.replace('/', '')}`;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={navTestId}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center px-3 py-2 rounded-lg transition-colors duration-200 flex-shrink-0 min-w-[60px]',
                  'md:flex-row md:justify-start md:px-4 md:py-3 md:min-w-0 md:flex-shrink',
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
                <div className="relative md:mr-3 flex-shrink-0">
                  <Icon className="w-6 h-6 md:w-4 md:h-4" />
                  {'badge' in item && typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center leading-none">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
              )}
              <span className="hidden md:block text-sm">
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>

      {/* Legal links — desktop only */}
      <div className="hidden md:block mt-auto px-4 pb-4 pt-2 border-t border-gray-200">
        <div className="flex flex-col gap-1">
          <button onClick={() => setShowLegal('terms')} className="text-[10px] text-gray-400 hover:text-gray-600 text-left transition-colors">
            {t('nav.legal.terms')}
          </button>
          <button onClick={() => setShowLegal('privacy')} className="text-[10px] text-gray-400 hover:text-gray-600 text-left transition-colors">
            {t('nav.legal.privacy')}
          </button>
        </div>
      </div>

      </nav>
    </>
  );
};

export default Navigation;