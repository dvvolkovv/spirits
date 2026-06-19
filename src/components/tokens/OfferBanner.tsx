import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X, Gift, Sparkles, Users } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { track } from '../../services/eventsClient';

const SESSION_KEY = 'offer_banner_shown';

type Variant = 'offer' | 'nudge' | 'referral';

/**
 * Неблокирующий баннер оффера вовлечённому неплатящему (+50% к первой покупке).
 * Eligibility считает бэкенд (GET /offer/status); фронт только показывает.
 * Fail-closed: если статус не получен — баннер не показываем.
 */
const OfferBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [variant, setVariant] = useState<Variant>('offer');

  useEffect(() => {
    let alive = true;
    // показываем максимум 1 раз за сессию
    if (sessionStorage.getItem(SESSION_KEY)) return;
    (async () => {
      try {
        const res = await apiClient.get('/webhook/offer/status');
        if (!res.ok || !alive) return;
        const data = await res.json();
        // Приоритет: +50%-оффер → нудж после первого чата → реф-надж (DEV-4).
        const v: Variant | null = data?.eligible ? 'offer' : (data?.first_chat_nudge ? 'nudge' : (data?.referral_nudge ? 'referral' : null));
        if (v) {
          sessionStorage.setItem(SESSION_KEY, '1');
          setVariant(v);
          setVisible(true);
          track('offer_shown', { message_count: data.message_count, kind: v });
        }
      } catch {
        // fail-closed — баннер просто не появляется
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!visible) return null;

  const onCta = () => {
    track('offer_clicked', { kind: variant });
    navigate(variant === 'referral' ? '/profile' : '/chat?view=tokens&offer=1');
  };

  const onClose = () => {
    setVisible(false);
    const qs = variant === 'referral' ? '?kind=referral' : '';
    apiClient.post(`/webhook/offer/dismiss${qs}`, {}).catch(() => {});
  };

  return (
    <div
      data-testid="offer-banner"
      className="mx-3 mb-2 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm"
    >
      {variant === 'offer'
        ? <Gift className="w-5 h-5 text-amber-600 flex-shrink-0" />
        : variant === 'referral'
          ? <Users className="w-5 h-5 text-amber-600 flex-shrink-0" />
          : <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0" />}
      <p className="text-sm text-amber-900 flex-1 leading-snug">
        {variant === 'offer'
          ? t('offer.text')
          : variant === 'referral'
            ? t('offer.referral_text', 'Приглашайте друзей в Linkeon — получайте до 10% с их оплат и выводите деньги.')
            : t('offer.nudge_text')}
      </p>
      <button
        onClick={onCta}
        data-testid="offer-cta"
        className="text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors"
      >
        {variant === 'offer'
          ? t('offer.cta')
          : variant === 'referral'
            ? t('offer.referral_cta', 'Пригласить')
            : t('offer.nudge_cta')}
      </button>
      <button
        onClick={onClose}
        data-testid="offer-dismiss"
        aria-label="close"
        className="text-amber-500 hover:text-amber-700 flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default OfferBanner;
