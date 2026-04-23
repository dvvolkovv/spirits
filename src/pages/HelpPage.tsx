import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, MessageCircle, Search, Heart, Image, User, Coins, Film, Inbox, Users, Headphones } from 'lucide-react';

const guideIcons = [MessageCircle, Search, Heart, Inbox, Users, Image, Film, User, Coins];

const HelpPage: React.FC = () => {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const navigate = useNavigate();

  const faqItems = t('help.faq', { returnObjects: true }) as { q: string; a: string }[];
  const guides = t('help.guides', { returnObjects: true }) as { title: string; desc: string }[];

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 md:py-10 pb-24 md:pb-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('help.title')}</h1>
          <p className="text-gray-500">{t('help.subtitle')}</p>
        </div>

        {/* Support CTA */}
        <div className="mb-8 bg-gradient-to-br from-forest-50 to-warm-50 border border-forest-200 rounded-xl p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Headphones className="w-6 h-6 text-forest-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 mb-1">{t('help.cta.title')}</h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              {t('help.cta.body')}
            </p>
            <button
              onClick={() => navigate('/support')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Headphones className="w-4 h-4" />
              {t('help.cta.button')}
            </button>
          </div>
        </div>

        {/* Quick Guide */}
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('help.quick_title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {guides.map((g, i) => {
              const Icon = guideIcons[i] ?? MessageCircle;
              return (
                <div key={i} className="bg-white rounded-lg p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-forest-50 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-forest-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">{g.title}</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">{g.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FAQ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('help.faq_title')}</h2>
          <div className="space-y-2">
            {faqItems.map((item, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800 pr-4">{item.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-3 text-sm text-gray-600 leading-relaxed whitespace-pre-line border-t border-gray-50">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;
