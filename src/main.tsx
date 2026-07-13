import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { trackLandingOnce } from './services/eventsClient';
import { initVkPixel } from './services/vkPixel';
import { ensureServiceWorker, maybeResubscribe } from './services/pushClient';

initVkPixel();
trackLandingOnce();

// Регистрируем PWA service worker (standalone-установка + web-push транспорт).
// Best-effort, не блокирует загрузку; на неподдерживающих браузерах — no-op.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    ensureServiceWorker();
    // Тихо восстанавливаем push-подписку, если разрешение уже есть, но подписка
    // слетела (напр. после переустановки PWA) — чтобы уведомления не «немели».
    maybeResubscribe();
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// OTA (нативное приложение, @capgo/capacitor-updater): как только бандл
// поднялся и отрендерился — подтверждаем плагину, что он рабочий
// (notifyAppReady). Без этого capgo через таймаут откатит только что
// применённый OTA-бандл (safety-rollback). Вызываем ЧЕРЕЗ глобальный
// Capacitor-мост, без npm-зависимости в вебе — на вебе window.Capacitor
// отсутствует → no-op, деплой фронта не затрагивается.
try {
  const cap = (window as any).Capacitor;
  const updater = cap?.Plugins?.CapacitorUpdater;
  if (updater?.notifyAppReady) {
    // небольшой отложенный вызов — дать React смонтировать дерево
    setTimeout(() => { updater.notifyAppReady().catch(() => {}); }, 300);
  }
} catch { /* веб / плагин недоступен — игнорируем */ }