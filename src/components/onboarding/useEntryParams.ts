import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { rememberLoginIntent } from '../../utils/loginIntent';

const REFERRAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

/**
 * Что экран входа делал при открытии — общее у него и у пробы без входа
 * (spec 2026-10-30-guest-trial): рефссылка (?ref=) и намерение (?assistant=,
 * раздел кабинета) запоминаются, чтобы пережить вход. Без этого гость,
 * пришедший по реферальной ссылке, потерял бы привязку: экран входа он больше
 * не открывает.
 */
export function useEntryParams(): void {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  useEffect(() => {
    const refSlug = searchParams.get('ref');
    if (refSlug) {
      localStorage.setItem('referral_slug', refSlug);
      localStorage.setItem('referral_slug_expires', String(Date.now() + REFERRAL_TTL_MS));
    }

    // Пришёл со страницы ассистента (?assistant=) или с кнопки «Сделать сайт
    // или бота» (/studio?tab=products): запоминаем — после входа кабинет
    // откроет нужное, а не голый чат. Последнее намерение побеждает
    // (utils/loginIntent.ts).
    rememberLoginIntent(location.pathname, location.search);
  }, [searchParams, location.pathname, location.search]);
}
