// Шеринг результата генерации вместе с реферальной ссылкой (виральность +
// двусторонний бонус). Web Share API с фолбэком на копирование в буфер.
import { apiClient } from './apiClient';

let cachedLink: string | null = null;

export async function getReferralLink(): Promise<string | null> {
  if (cachedLink) return cachedLink;
  try {
    const r = await apiClient.get('/webhook/referral/stats');
    if (!r.ok) return null;
    const d = await r.json();
    cachedLink = d?.referral_link || null;
    return cachedLink;
  } catch {
    return null;
  }
}

// Возвращает 'shared' | 'copied' | 'cancelled' для UI-фидбэка.
export async function shareWithReferral(text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const link = (await getReferralLink()) || 'https://my.linkeon.io';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Linkeon', text, url: link });
      return 'shared';
    }
    await navigator.clipboard.writeText(`${text} ${link}`);
    return 'copied';
  } catch {
    return 'cancelled';
  }
}
