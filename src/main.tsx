import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { trackLandingOnce } from './services/eventsClient';
import { initVkPixel } from './services/vkPixel';
import { ensureServiceWorker } from './services/pushClient';

initVkPixel();
trackLandingOnce();

// Регистрируем PWA service worker (standalone-установка + web-push транспорт).
// Best-effort, не блокирует загрузку; на неподдерживающих браузерах — no-op.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    ensureServiceWorker();
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);