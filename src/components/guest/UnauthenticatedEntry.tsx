import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import OnboardingPage from '../../pages/OnboardingPage';
import { decideUnauthEntry } from './decideUnauthEntry';
import { fetchGuestConfig } from './guestApi';
import { hasAccount, previewRequested, rememberPreviewFromUrl } from './guestStorage';
import type { GuestConfig } from './guestTypes';

// Отдельным чанком: устройству, где уже входили, чат пробы не нужен вовсе, а
// экран входа должен открываться так же быстро, как раньше.
const GuestChatPage = lazy(() => import('./GuestChatPage'));

const isNative = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();

const Spinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * Кабинет без входа (spec 2026-10-30-guest-trial): проба с ассистентом или
 * экран входа. Правило — в decideUnauthEntry. Сервер спрашиваем, только когда
 * проба вообще возможна: иначе экран входа показывается сразу, без ожидания.
 */
const UnauthenticatedEntry: React.FC = () => {
  const location = useLocation();
  // До чтения previewRequested(): вкладка с ?trial=1 запоминается сразу.
  rememberPreviewFromUrl(location.search);
  const base = { native: isNative(), hasAccount: hasAccount(), pathname: location.pathname };
  const possible = decideUnauthEntry({ ...base, mode: 'on', preview: true }) === 'guest';
  const [config, setConfig] = useState<GuestConfig | null | undefined>(undefined);

  useEffect(() => {
    if (!possible) return;
    let alive = true;
    void fetchGuestConfig().then((c) => { if (alive) setConfig(c); });
    return () => { alive = false; };
  }, [possible]);

  if (!possible) return <OnboardingPage />;
  if (config === undefined) return <Spinner />;
  const preview = previewRequested();
  if (!config || decideUnauthEntry({ ...base, mode: config.mode, preview }) !== 'guest') return <OnboardingPage />;
  return (
    <Suspense fallback={<Spinner />}>
      <GuestChatPage config={config} preview={preview} />
    </Suspense>
  );
};

export default UnauthenticatedEntry;
