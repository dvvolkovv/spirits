import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LegalModal from './LegalModal';
import PaymentInfoModal from './PaymentInfoModal';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const LoginConsentBlock: React.FC<Props> = ({ checked, onChange }) => {
  const { t } = useTranslation();
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalType, setLegalType] = useState<'terms' | 'privacy'>('terms');
  const [paymentOpen, setPaymentOpen] = useState(false);

  const openTerms = () => { setLegalType('terms'); setLegalOpen(true); };

  // Ни mb-*, ни mt-* на корне: вертикальные интервалы задаёт space-y-3 на самой
  // форме, свой отступ здесь сложился бы с ним и удвоил зазор.
  return (
    <div>
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          data-testid="consent-checkbox"
          className="mt-0.5 w-4 h-4 shrink-0 text-forest-800 border-gray-300 rounded focus:ring-forest-700"
        />
        <span className="text-xs text-gray-600 leading-relaxed">
          {t('auth.consent.ageAndPrefix', 'Мне больше 18 лет, я ознакомлен(а) с ')}
          <button type="button" onClick={openTerms} className="text-forest-800 hover:underline font-medium">
            {t('auth.consent.servicesLink', 'описанием услуг')}
          </button>
          {t('auth.consent.and', ' и ')}
          <button type="button" onClick={() => setPaymentOpen(true)} className="text-forest-800 hover:underline font-medium">
            {t('auth.consent.paymentLink', 'порядком оплаты')}
          </button>
          {t('auth.consent.suffix', ' и принимаю их.')}
        </span>
      </label>
      <LegalModal isOpen={legalOpen} onClose={() => setLegalOpen(false)} type={legalType} />
      <PaymentInfoModal isOpen={paymentOpen} onClose={() => setPaymentOpen(false)} />
    </div>
  );
};

export default LoginConsentBlock;
