import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X, Gift } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { track } from '../../services/eventsClient';

const SESSION_KEY = 'offer_banner_shown';

/**
 * Неблокирующий баннер оффера вовлечённому неплатящему (+50% к первой покупке).
 * Eligibility считает бэкенд (GET /offer/status); фронт только показывает.
 * Fail-closed: если статус не получен — баннер не показываем.
 */
const OfferBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    // показываем максимум 1 раз за сессию
    if (sessionStorage.getItem(SESSION_KEY)) return;
    (async () => {
      try {
        const res = await apiClient.get('/webhook/offer/status');
        if (!res.ok || !alive) return;
        const data = await res.json();
        if (data?.eligible) {
          sessionStorage.setItem(SESSION_KEY, '1');
          setVisible(true);
          track('offer_shown', { message_count: data.message_count });
        }
      } catch {
        // fail-closed — баннер просто не появляется
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!visible) return null;

  const onCta = () => {
    track('offer_clicked', {});
    navigate('/chat?view=tokens&offer=1');
  };

  const onClose = () => {
    setVisible(false);
    apiClient.post('/webhook/offer/dismiss', {}).catch(() => {});
  };

  return (
    <div
      data-testid="offer-banner"
      className="mx-3 mb-2 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm"
    >
      <Gift className="w-5 h-5 text-amber-600 flex-shrink-0" />
      <p className="text-sm text-amber-900 flex-1 leading-snug">{t('offer.text')}</p>
      <button
        onClick={onCta}
        data-testid="offer-cta"
        className="text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors"
      >
        {t('offer.cta')}
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
