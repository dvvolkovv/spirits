import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { trackLandingOnce } from './services/eventsClient';
import { initVkPixel } from './services/vkPixel';

initVkPixel();
trackLandingOnce();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);