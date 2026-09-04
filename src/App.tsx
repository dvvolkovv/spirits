import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast, { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ImageGenProvider } from './contexts/ImageGenContext';
import Navigation from './components/layout/Navigation';
import ReferralWelcomeBanner from './components/referral/ReferralWelcomeBanner';
import { FloatingCallButton } from './components/chat/FloatingCallButton';
import OnboardingPage from './pages/OnboardingPage';            // eager: первый экран нового юзера — критичный путь к регистрации, грузим мгновенно
import { ErrorBoundary } from './components/ErrorBoundary';
import MaintenancePage from './pages/MaintenancePage';          // eager: гейт режима обслуживания (крошечный)
import { track, trackAuthed } from './services/eventsClient';
import { apiClient } from './services/apiClient';
import { tokenManager } from './utils/tokenManager';
import { refreshWidget, initWidgetNavigation, onAppResume, initDeepLinks, openLauncherOnboarding } from './services/widgetClient';
import { registerNativePush } from './services/pushClient';
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
const AdminPage = lazy(() => import('./pages/AdminPage'));
const ImageGenPage = lazy(() => import('./pages/ImageGenPage'));
const VideoPage = lazy(() => import('./pages/VideoPage'));
const MyVideosPage = lazy(() => import('./pages/MyVideosPage'));
const PaymentSuccessPage = lazy(() => import('./pages/PaymentSuccessPage'));
const TokenPurchasePage = lazy(() => import('./pages/TokenPurchasePage'));
const AuthEmailConfirmPage = lazy(() => import('./pages/AuthEmailConfirmPage'));
const AuthOAuthCallbackPage = lazy(() => import('./pages/AuthOAuthCallbackPage'));
const ContactRequestsPage = lazy(() => import('./pages/ContactRequestsPage'));
const SettingsSocialPage = lazy(() => import('./pages/SettingsSocialPage'));
const StudioPage = lazy(() => import('./pages/StudioPage'));
const TelegramBotsNewPage = lazy(() => import('./pages/TelegramBotsPage').then((m) => ({ default: m.TelegramBotsNewPage })));
// Голосовая комната. Ленивая намеренно: тянет за собой livekit-client, а
// открывают её единицы — грузить его всем в основном чанке незачем.
const RoomPage = lazy(() => import('./pages/RoomPage'));

// Лёгкий fallback, пока подгружается ленивый чанк раздела.
const RouteFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-forest-300 border-t-forest-600 rounded-full animate-spin" />
  </div>
);

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, user, login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const widgetInit = React.useRef(false);

  // Домашний виджет [Натив 4] (натив-приложение; на вебе — no-op): обновляем
  // контент виджета при входе и возврате на передний план; обрабатываем
  // deep-link, с которым открыли из виджета (Продолжить/Картинка/Голос).
  useEffect(() => {
    if (!isAuthenticated) return;
    refreshWidget();
    if (!widgetInit.current) {
      widgetInit.current = true;
      initWidgetNavigation((path) => navigate(path));
      initDeepLinks((path) => navigate(path));
      onAppResume(() => refreshWidget());
      // Нативные пуши [Натив 3]: запрос разрешения + регистрация FCM-токена (натив; на вебе no-op).
      registerNativePush();
    }
  }, [isAuthenticated]);

  // Онбординг лаунчера [2026-08-27]: если компаньон открыли по linkeon://login из мастера, надо
  // вернуть человека в мастер лаунчера сразу после входа. Детект launch-url НЕ завязан на auth —
  // мастер шлёт login именно неавторизованному; флаг ставим до входа.
  useEffect(() => {
    const app = (window as any).Capacitor?.Plugins?.App;
    if (!app) return;
    const markIfLogin = (url?: string) => {
      if (url && /^linkeon:\/\/login(\b|\/|\?|$)/i.test(url)) {
        try { sessionStorage.setItem('return_to_onboarding', '1'); } catch {}
      }
    };
    try { app.getLaunchUrl?.().then((r: any) => markIfLogin(r?.url)).catch(() => {}); } catch {}
    let sub: any;
    try { sub = app.addListener?.('appUrlOpen', (ev: any) => markIfLogin(ev?.url)); } catch {}
    return () => { try { sub?.remove?.(); } catch {} };
  }, []);

  // После успешного входа — вернуть в мастер лаунчера (нативный VIEW linkeon://onboarding).
  useEffect(() => {
    if (!isAuthenticated) return;
    let flag = false;
    try { flag = sessionStorage.getItem('return_to_onboarding') === '1'; } catch {}
    if (!flag) return;
    try { sessionStorage.removeItem('return_to_onboarding'); } catch {}
    void openLauncherOnboarding();
  }, [isAuthenticated]);

  // app_open: открытие приложения авторизованным юзером, раз на сессию браузера
  // (71afe7f7). С user_id → snapshot считает app_opens_7d по персонам и ratio
  // chat_sessions/app_opens (барьер discovery vs re-engagement у Mixed).
  useEffect(() => {
    if (!isAuthenticated || !user?.phone) return;
    const key = 'app_open_fired';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    trackAuthed('app_open', user.phone);
  }, [isAuthenticated, user?.phone]);

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

  // Возврат из ВХОДА через TalerID: callback приводит сюда с одноразовым
  // кодом ?talerid_login=<handoff>. Токены не едут в адресной строке — она
  // осела бы в истории браузера и в логах прокси, — поэтому код меняем на
  // них отдельным запросом. Параметр сразу вычищаем: обновление страницы
  // не должно пытаться погасить уже использованный код.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get('talerid_login');
    const failed = params.get('talerid_login_error');
    if (!handoff && !failed) return;

    const strip = () => {
      params.delete('talerid_login');
      params.delete('talerid_login_error');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    };

    if (failed || !handoff) {
      toast.error(t('pages.talerid_login_failed'));
      strip();
      return;
    }

    (async () => {
      try {
        const resp = await apiClient.post('/webhook/ecosystem/talerid/login/redeem', { handoff });
        const body = await resp.json().catch(() => ({} as Record<string, string>));
        if (!resp.ok || !body['access-token']) {
          toast.error(t('pages.talerid_login_expired'));
          strip();
          return;
        }
        // Через tokenManager: голый setItem бросал QuotaExceededError на
        // переполненном localStorage, и вход падал в общий catch ниже.
        if (!tokenManager.saveTokens(body['access-token'], body['refresh-token'])) {
          toast.error(t('auth.sms.storageUnavailable'));
          strip();
          return;
        }
        strip();
        await login('', body['access-token']);
      } catch {
        toast.error(t('pages.talerid_login_failed'));
        strip();
      }
    })();
  }, [login, t]);

  // TalerID account-linking return: the OAuth callback redirects back to the SPA with
  // ?talerid_link=<status>. Turn it into a toast and strip the param so a refresh doesn't re-fire.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const link = params.get('talerid_link');
    if (!link) return;
    const M: Record<string, { kind: 'success' | 'error' | 'info'; text: string }> = {
      linked: { kind: 'success', text: t('pages.talerid_link_success') },
      cancelled: { kind: 'info', text: t('pages.talerid_link_cancelled') },
      expired: { kind: 'error', text: t('pages.talerid_link_expired') },
      different_phone: { kind: 'error', text: t('pages.talerid_link_different_phone') },
      phone_taken: { kind: 'error', text: t('pages.talerid_link_phone_taken') },
      has_messages: { kind: 'error', text: t('pages.talerid_link_has_messages') },
      error: { kind: 'error', text: t('pages.talerid_link_error') },
    };
    const m = M[link] || M.error;
    if (m.kind === 'success') toast.success(m.text);
    else if (m.kind === 'error') toast.error(m.text);
    else toast(m.text);
    params.delete('talerid_link');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, [t]);

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
      <ReferralWelcomeBanner />
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
            <Route path="/referral" element={<Navigate to="/profile" replace />} />
            <Route path="/image-gen" element={<ImageGenPage />} />
            <Route path="/video" element={<VideoPage />} />
            <Route path="/my-videos" element={<MyVideosPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/contact-requests" element={<ContactRequestsPage />} />
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
            <Route path="/settings/social" element={<SettingsSocialPage />} />
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

      {/*
        Звонок Роману — плавающей кнопкой поверх всех экранов. Смонтирована
        здесь, а не внутри чата: раньше кнопка жила в шапке ChatInterface и
        только при выбранном Романе, то есть попасть на неё можно было лишь
        зная о ней заранее. Внутри layout, а не рядом с Routes — иначе она
        появилась бы и на публичной странице комнаты, куда приходят люди без
        аккаунта в Linkeon.
      */}
      <FloatingCallButton />
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
            {/*
              Комната — публичная: по присланной ссылке приходят люди, которые
              в Linkeon не заводились. Маршрут ОБЯЗАН быть здесь, соседом
              AppContent, а не веткой внутри него. Внутри гостевая страница
              унаследовала бы весь его жизненный цикл — deep-links, виджет,
              аналитику, — и при появлении авторизации (например, у владельца
              комнаты остались токены) эти эффекты уводят навигацию из-под
              смонтированной страницы. Проверено на test 27.08.2026: страница
              падала с React #321 ровно через секунду после обновления токенов.
            */}
            <Route path="/room/:code" element={<RoomPage />} />
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