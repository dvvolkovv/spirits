import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ImageGenProvider } from './contexts/ImageGenContext';
import Navigation from './components/layout/Navigation';
import OnboardingPage from './pages/OnboardingPage';            // eager: первый экран нового юзера — критичный путь к регистрации, грузим мгновенно
import { ErrorBoundary } from './components/ErrorBoundary';
import MaintenancePage from './pages/MaintenancePage';          // eager: гейт режима обслуживания (крошечный)
import { track } from './services/eventsClient';
import './i18n';

// Ленивые маршруты — грузятся ПО ТРЕБОВАНИЮ (code-split), а не одним монолитом.
// Холодный новый юзер для регистрации качает только онбординг; чат/админка/видео/
// студия/картинки и пр. — отдельные чанки, подгружаются при первом заходе в раздел
// (кешируются после). Это срезает первый экран с ~1.7МБ до малого старта.
const ChatPage = lazy(() => import('./pages/ChatPage'));
const ChatConversationPage = lazy(() => import('./pages/ChatConversationPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const ProfileView = lazy(() => import('./components/profile/ProfileView'));
const NetworkingPage = lazy(() => import('./pages/NetworkingPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const CardPage = lazy(() => import('./pages/CardPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const ImageGenPage = lazy(() => import('./pages/ImageGenPage'));
const VideoPage = lazy(() => import('./pages/VideoPage'));
const MyVideosPage = lazy(() => import('./pages/MyVideosPage'));
const PaymentSuccessPage = lazy(() => import('./pages/PaymentSuccessPage'));
const TokenPurchasePage = lazy(() => import('./pages/TokenPurchasePage'));
const AuthEmailConfirmPage = lazy(() => import('./pages/AuthEmailConfirmPage'));
const AuthOAuthCallbackPage = lazy(() => import('./pages/AuthOAuthCallbackPage'));
const DozvonPage = lazy(() => import('./pages/DozvonPage'));
const ContactRequestsPage = lazy(() => import('./pages/ContactRequestsPage'));
const SettingsSocialPage = lazy(() => import('./pages/SettingsSocialPage'));
const StudioPage = lazy(() => import('./pages/StudioPage'));
const TelegramBotsNewPage = lazy(() => import('./pages/TelegramBotsPage').then((m) => ({ default: m.TelegramBotsNewPage })));

// Лёгкий fallback, пока подгружается ленивый чанк раздела.
const RouteFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-forest-300 border-t-forest-600 rounded-full animate-spin" />
  </div>
);

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation();

  // Fire a referral_click once per session when someone lands via ?ref=<slug>
  // (feeds snapshot.referral.referral_clicks_7d).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref) return;
    const key = `referral_click_fired_${ref}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    // rt = точка касания, встроенная в ссылку поверхностью шеринга (71afe7f7):
    // dashboard_cta | notification_link | in_chat_share | profile_share | manual_copy.
    const rt = params.get('rt');
    track('referral_click', { slug: ref, referral_touch: rt || 'direct' });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <OnboardingPage />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Navigation - hidden on mobile for main content */}
      <div className="hidden md:block">
        <Navigation />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col pb-20 md:pb-0">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chats" element={<Navigate to="/search?tab=chats" replace />} />
            <Route path="/chats/:chatId" element={<ChatConversationPage />} />
            <Route path="/profile" element={<ProfileView />} />
            <Route path="/studio" element={<StudioPage />} />
            {/* Старые URL — редиректим на Студию для бэк-совместимости bookmark-ов. */}
            <Route path="/my-agents" element={<Navigate to="/studio" replace />} />
            <Route path="/telegram-bots" element={<Navigate to="/studio?tab=bots" replace />} />
            <Route path="/telegram-bots/new" element={<TelegramBotsNewPage />} />
            <Route path="/search" element={<NetworkingPage />} />
            <Route path="/compatibility" element={<Navigate to="/search" replace />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/dozvon" element={<DozvonPage />} />
            <Route path="/referral" element={<Navigate to="/profile" replace />} />
            <Route path="/image-gen" element={<ImageGenPage />} />
            <Route path="/video" element={<VideoPage />} />
            <Route path="/my-videos" element={<MyVideosPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/contact-requests" element={<ContactRequestsPage />} />
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
            <Route path="/settings/social" element={<SettingsSocialPage />} />
            <Route path="/card" element={<CardPage />} />
            <Route path="/payment/success" element={<PaymentSuccessPage />} />
            <Route path="/" element={<Navigate to="/chat" replace />} />
          </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden">
        <Navigation />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const isMaintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

  if (isMaintenanceMode) {
    return <MaintenancePage />;
  }

  return (
    <Router>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <AuthProvider>
        <ImageGenProvider>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/tokens" element={<TokenPurchasePage />} />
            <Route path="/auth/:provider/callback" element={<AuthOAuthCallbackPage />} />
            <Route path="/auth/email/confirm" element={<AuthEmailConfirmPage />} />
            <Route path="*" element={<AppContent />} />
          </Routes>
          </Suspense>
        </ImageGenProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;