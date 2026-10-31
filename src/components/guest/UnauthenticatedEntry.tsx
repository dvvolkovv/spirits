import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import OnboardingPage from '../../pages/OnboardingPage';
import { decideUnauthEntry } from './decideUnauthEntry';
import { fetchGuestConfig } from './guestApi';
import { hasAccount, previewRequested, rememberPreviewFromUrl } from './guestStorage';
import type { GuestConfig } from './guestTypes';

/** Запасной экран, когда проба недоступна (сбой чанка или ошибка внутри
 * пробы, C2) — обычный вход, как если бы пробы не было вовсе. */
const LoginFallback: React.FC = () => <OnboardingPage />;

/**
 * C2 (Critical, ревью качества B9-fix): протухший index.html после выката
 * (старый хеш чанка в закэшированной странице у человека) делает import()
 * отклонённым промисом — без .catch() это необработанное исключение внутри
 * React.lazy и белый экран на самом массовом входе сайта. .catch() превращает
 * отказ в обычный (успешный) модуль с запасным компонентом: React.lazy даже
 * не узнаёт, что был сбой, и просто рисует запасной компонент как настоящий.
 *
 * Выделено отдельной функцией (а не инлайном внутри lazy()) ради теста
 * (UnauthenticatedEntry.staleChunk.test.tsx) — там отказ подаётся обычным
 * Promise.reject(), без vi.mock('./GuestChatPage', ...): бросок внутри
 * фабрики vi.mock превращается в СОБСТВЕННУЮ ошибку мокинга Vitest, а не в
 * обычный rejected import(), и .catch() тогда не успевает сработать вовсе.
 */
export function withChunkFailureFallback<T>(
  importer: () => Promise<{ default: T }>,
  fallback: T,
): () => Promise<{ default: T }> {
  return () => importer().catch(() => ({ default: fallback }));
}

// Отдельным чанком: устройству, где уже входили, чат пробы не нужен вовсе, а
// экран входа должен открываться так же быстро, как раньше.
const GuestChatPage = lazy(withChunkFailureFallback(() => import('./GuestChatPage'), LoginFallback));

const isNative = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();

const Spinner: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

interface BoundaryState {
  hasError: boolean;
}

/**
 * C2 (Critical, ревью качества B9-fix): ошибка РЕНДЕРА внутри самой пробы
 * (не только сбой чанка выше, который withChunkFailureFallback уже
 * обезвредил) не должна дать белый экран самому массовому входу сайта —
 * только тихий откат на экран входа. Общий ErrorBoundary кабинета
 * (components/ErrorBoundary.tsx) рисует технический экран со стеком — он для
 * авторизованных разделов, гостю на первом экране сайта он не нужен и только
 * пугает.
 */
class GuestTrialBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[guest-trial] сбой пробы — тихий откат на экран входа', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) return <LoginFallback />;
    return this.props.children;
  }
}

/**
 * Кабинет без входа (spec 2026-10-30-guest-trial): проба с ассистентом или
 * экран входа. Правило — в decideUnauthEntry. Сервер спрашиваем, только когда
 * проба вообще возможна: иначе экран входа показывается сразу, без ожидания.
 */
const UnauthenticatedEntry: React.FC = () => {
  const location = useLocation();
  // m4: вызов синхронно здесь, в теле компонента (не в эффекте), — осознанно.
  // До чтения previewRequested(): вкладка с ?trial=1 запоминается сразу, и
  // ЭТОТ ЖЕ проход рендера (ниже) читает previewRequested() — эффект (который
  // применился бы только ПОСЛЕ первого рендера) отдал бы на первом проходе
  // устаревшее значение. Запись идемпотентна: повторный вызов с тем же
  // ?trial=1 на каждой перерисовке — не проблема, тот же ключ получает то же
  // '1' (а без ?trial=1 вызов и вовсе no-op, см. rememberPreviewFromUrl).
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
      <GuestTrialBoundary>
        <GuestChatPage config={config} preview={preview} />
      </GuestTrialBoundary>
    </Suspense>
  );
};

export default UnauthenticatedEntry;
