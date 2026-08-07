import React from 'react';
import type { OAuthProviderId } from '../../types/auth';

/**
 * Знаки провайдеров в ОДИНАКОВЫХ слотах 18×18.
 *
 * Единообразие даётся слотом, а не приведением самих знаков к одному виду:
 * логотип Google перекрашивать нельзя по его брендбуку. Раньше здесь
 * соседствовали красный квадрат с буквой «Я», белый квадрат с рамкой и
 * буквой «G» и растровый PNG — три разные природы значка в трёх соседних
 * кнопках.
 */

const SLOT = 'w-[18px] h-[18px] shrink-0';

const GOOGLE = (
  <svg viewBox="0 0 48 48" className={SLOT} aria-hidden focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 14 17.6 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
    <path fill="#FBBC05" d="M10.4 28.2c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16 0 19.9 0 23.5s.9 7.5 2.6 10.8l7.8-6.1z"/>
    <path fill="#34A853" d="M24 47c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.8 2.2-7.7 2.2-6.4 0-11.7-4.5-13.6-10.7l-7.8 6.1C6.5 41.1 14.6 47 24 47z"/>
  </svg>
);

const YANDEX = (
  <svg viewBox="0 0 24 24" className={SLOT} aria-hidden focusable="false">
    <rect width="24" height="24" rx="5" fill="#FC3F1D"/>
    <path fill="#fff" d="M13.1 19h2.2V5h-3.2c-3.2 0-5.1 1.7-5.1 4.4 0 2.1 1 3.3 2.8 4.6L6.7 19h2.4l3.4-5.2-1.1-.8C10 12 9.2 11.2 9.2 9.3c0-1.7 1.1-2.7 2.9-2.7h1v12.4z"/>
  </svg>
);

const TALERID = (
  <img src="/talerid-logo.png" alt="" loading="lazy" className={`${SLOT} rounded-[4px] object-contain`} />
);

const MARKS: Record<OAuthProviderId, React.ReactNode> = {
  google: GOOGLE,
  yandex: YANDEX,
  talerid: TALERID,
};

export function providerMark(provider: OAuthProviderId): React.ReactNode {
  return MARKS[provider];
}
