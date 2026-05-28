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

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      <label className="flex items-start space-x-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          data-testid="consent-checkbox"
          className="mt-1 w-4 h-4 text-forest-600 border-gray-300 rounded focus:ring-forest-500 flex-shrink-0"
        />
        <span className="text-sm text-gray-700 leading-relaxed">
          {t('auth.consent.ageAndPrefix', 'Мне больше 18 лет, я ознакомлен(а) с ')}
          <button
            type="button"
            onClick={openTerms}
            className="text-forest-600 hover:underline font-medium"
          >
            {t('auth.consent.servicesLink', 'описанием услуг')}
          </button>
          {t('auth.consent.and', ' и ')}
          <button
            type="button"
            onClick={() => setPaymentOpen(true)}
            className="text-forest-600 hover:underline font-medium"
          >
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
