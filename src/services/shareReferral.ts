// Шеринг результата генерации вместе с реферальной ссылкой (виральность +
// двусторонний бонус). Web Share API с фолбэком на копирование в буфер.
import { apiClient } from './apiClient';
import { track } from './eventsClient';

let cachedLink: string | null = null;

// Точки касания рефералки (touchpoint) — какой surface привёл к клику.
// Встраивается в ссылку как &rt=<touch>; на приходе App.tsx кладёт его в
// referral_click.props.referral_touch, снапшот VPM агрегирует топ-3 за 7d (71afe7f7).
export type ReferralTouch =
  | 'dashboard_cta' | 'notification_link' | 'in_chat_share' | 'profile_share' | 'manual_copy';

// Добавляет тег точки касания к реферальной ссылке (?ref=... уже есть → &rt=).
export function withTouch(link: string, touch: ReferralTouch): string {
  if (!link) return link;
  const sep = link.includes('?') ? '&' : '?';
  return `${link}${sep}rt=${encodeURIComponent(touch)}`;
}

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
// touch — точка касания (по умолчанию in_chat_share: шеринг результата из чата).
export async function shareWithReferral(
  text: string,
  touch: ReferralTouch = 'in_chat_share',
): Promise<'shared' | 'copied' | 'cancelled'> {
  const base = (await getReferralLink()) || 'https://my.linkeon.io';
  const link = withTouch(base, touch);
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Linkeon', text, url: link });
      track('referral_share', { source: touch, referral_touch: touch });
      return 'shared';
    }
    await navigator.clipboard.writeText(`${text} ${link}`);
    track('referral_link_copied', { source: touch, referral_touch: touch });
    return 'copied';
  } catch {
    return 'cancelled';
  }
}
