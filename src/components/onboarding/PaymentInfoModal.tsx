import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, CreditCard, Shield, Info, Mail } from 'lucide-react';
import { RUB_PACKAGES } from '../../config/tokenPackages';
import { formatNumber } from '../../utils/formatters';

interface PaymentInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * «Описание услуг и порядок оплаты» — условия, которые человек принимает
 * галочкой при входе (LoginConsentBlock).
 *
 * Весь текст живёт в ключах payment.info.* семи локалей; источник правды —
 * ru.json, раздел «Возвраты» сверен с §8 оферты (LegalModal). Второй копии
 * текста здесь быть не должно, поэтому у t() нет defaultValue: до 07.10.2026
 * английский шёл отдельным рукописным блоком в этом файле, правки локалей до
 * него не доходили, и англичанин два месяца читал, что возврат не
 * предусмотрен вовсе, — прямо против оферты.
 *
 * Таблица собирается из прайса RUB_PACKAGES, как витрина, — разойтись с ней
 * она не может. Проверка — PaymentInfoModal.test.tsx, по всем языкам.
 */
const PaymentInfoModal: React.FC<PaymentInfoModalProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  if (!isOpen) return null;
  // Юридическую силу имеет русская редакция. Читателю перевода об этом
  // говорит оговорка — та же, что в переводах оферты на лендинге.
  const isRu = (i18n?.language ?? '').startsWith('ru');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-forest-600 to-warm-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CreditCard className="w-6 h-6 text-white" />
            <h2 className="text-xl font-bold text-white">
              {t('onboarding.payment_info_link')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6 space-y-6">
          {!isRu && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
              {t('payment.info.translation_notice')}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">{t('payment.info.service_title')}</h3>
              <p className="text-sm text-blue-800">{t('payment.info.site_label')} <a href="https://linkeon.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-600">linkeon.io</a></p>
            </div>
          </div>

          <section className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">1</span>
              {t('payment.info.section1_title')}
            </h3>
            <p className="text-gray-700 leading-relaxed">
              {t('payment.info.section1_body')}
            </p>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section1_item1')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section1_item2')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section1_item3')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section1_item4')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section1_item5')}</span></li>
            </ul>
            <p className="text-gray-600 text-sm italic mt-2">
              {t('payment.info.section1_note')}
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">2</span>
              {t('payment.info.section2_title')}
            </h3>
            <p className="text-gray-700 leading-relaxed">
              {t('payment.info.section2_body_pre')}<strong>{t('payment.info.tokens_label')}</strong>{t('payment.info.section2_body_post')}
            </p>
            <p className="text-gray-700 leading-relaxed">
              {t('payment.info.section2_bonus')}
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-amber-900 text-sm">
                {t('payment.info.section2_note')}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">3</span>
              {t('payment.info.section3_title')}
            </h3>
            <p className="text-gray-700 mb-3">{t('payment.info.section3_intro')}</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm">
                <thead className="bg-forest-600 text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">{t('payment.info.table_header_package')}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('payment.info.table_header_amount')}</th>
                    <th className="px-4 py-3 text-left font-semibold">{t('payment.info.table_header_price')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {RUB_PACKAGES.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{t(p.nameKey)}</td>
                      <td className="px-4 py-3 text-gray-700">{t(p.amountKey)}</td>
                      <td className="px-4 py-3 text-forest-600 font-semibold">{`${formatNumber(p.priceRub)}\u00A0₽`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
              <p className="text-gray-700 text-sm">• {t('payment.info.section3_note1')}</p>
              <p className="text-gray-700 text-sm">• {t('payment.info.section3_note2')}</p>
              <p className="text-gray-700 text-sm">• {t('payment.info.section3_note3')}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">4</span>
              {t('payment.info.section4_title')}
            </h3>
            <p className="text-gray-700 leading-relaxed mb-2">{t('payment.info.section4_intro')}</p>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section4_item1')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section4_item2')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section4_item3')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section4_item4')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section4_item5')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section4_item6')}</span></li>
            </ul>
            <p className="text-gray-600 text-sm italic mt-3">
              {t('payment.info.section4_note')}
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">5</span>
              {t('payment.info.section5_title')}
            </h3>
            <ol className="space-y-2 ml-4">
              <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">1.</span><span className="text-gray-700">{t('payment.info.section5_step1')}</span></li>
              <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">2.</span><span className="text-gray-700">{t('payment.info.section5_step2')}</span></li>
              <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">3.</span><span className="text-gray-700">{t('payment.info.section5_step3')}</span></li>
              <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">4.</span><span className="text-gray-700">{t('payment.info.section5_step4')}</span></li>
              <li className="flex items-start"><span className="text-forest-600 font-semibold mr-2">5.</span><span className="text-gray-700">{t('payment.info.section5_step5')}</span></li>
            </ol>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-green-900 text-sm font-medium">
                {t('payment.info.section5_note')}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">6</span>
              {t('payment.info.section6_title')}
            </h3>
            <p className="text-gray-700">{t('payment.info.section6_intro')}</p>
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 font-mono text-center">
              <p className="text-gray-900 font-semibold">LINKEON.IO / LINK EON SERVICE</p>
              <p className="text-gray-600 text-xs mt-1">{t('payment.info.section6_descriptor_note')}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <span className="bg-forest-100 text-forest-700 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm font-bold">7</span>
              {t('payment.info.section7_title')}
            </h3>
            <p className="text-gray-700 leading-relaxed">
              {t('payment.info.section7_intro')}
            </p>
            <ul className="space-y-2 ml-4">
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section7_item1')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section7_item2')}</span></li>
              <li className="flex items-start"><span className="text-forest-500 mr-2">•</span><span className="text-gray-700">{t('payment.info.section7_item3')}</span></li>
            </ul>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-blue-900 text-sm">
                {t('payment.info.section7_note')}
              </p>
            </div>
          </section>

          <section className="bg-gradient-to-br from-forest-50 to-warm-50 rounded-lg p-6 border border-forest-200">
            <h3 className="text-lg font-bold text-gray-900 flex items-center mb-4">
              <Shield className="w-6 h-6 mr-2 text-forest-600" />
              {t('payment.info.support_title')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Mail className="w-5 h-5 text-forest-600 flex-shrink-0" />
                <a href="mailto:support@linkeon.io" className="text-forest-600 hover:text-forest-700 font-medium">
                  support@linkeon.io
                </a>
              </div>
            </div>
          </section>
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors font-medium"
          >
            {t('payment.info.got_it')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentInfoModal;
