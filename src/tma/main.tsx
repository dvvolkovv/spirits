import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import '../index.css';
// Как и в src/main.tsx: просто импортируем конфиг и рендерим сразу, без
// ожидания инициализации. ru — единственный синхронно забандленный язык
// (см. src/i18n/index.ts, partialBundledLanguages+fallbackLng), поэтому
// ключи не мелькают сырыми строками ни для ru, ни для остальных языков —
// фолбэк на ru готов уже на первом рендере, пока догружается нужный бэкендом.
import '../i18n';
import { App } from './App';
import { ChoiceScreen } from './screens/ChoiceScreen';
import { runBoot, BootState } from './boot';

function Root() {
  const { t } = useTranslation();
  const [state, setState] = useState<BootState | 'loading'>('loading');

  useEffect(() => {
    runBoot().then(setState);
  }, []);

  if (state === 'loading') return <div className="p-6 opacity-60">…</div>;
  if (state === 'needsChoice') return <ChoiceScreen onAuthenticated={() => setState('authenticated')} />;
  if (state === 'outside') {
    return (
      <div className="flex min-h-screen flex-col justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">{t('tma.outside.title')}</h1>
        <p className="opacity-70">{t('tma.outside.body')}</p>
      </div>
    );
  }
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
