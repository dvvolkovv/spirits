import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from 'lucide-react';
import { authService } from '../../services/authService';
import type { OAuthProviderId } from '../../types/auth';

interface Props {
  provider: OAuthProviderId;
}

/** Как выглядит кнопка провайдера: значок, подпись и голое имя провайдера (для интерполяции). */
// i18n-ignore: label — только defaultValue для t('auth.oauth.*'), ключи есть
// во всех локалях и фолбэк не срабатывает; «Я» — брендовый глиф Яндекса.
const LOOKS: Record<OAuthProviderId, { label: string; providerName: string; badge: React.ReactNode }> = {
  google: {
    label: 'Войти через Google',
    providerName: 'Google',
    badge: (
      <span className="inline-flex w-6 h-6 rounded items-center justify-center font-bold text-sm bg-white border">
        G
      </span>
    ),
  },
  yandex: {
    label: 'Войти через Yandex',
    providerName: 'Yandex',
    badge: (
      <span className="inline-flex w-6 h-6 rounded items-center justify-center font-bold text-sm bg-red-600 text-white">
        Я
      </span>
    ),
  },
  // Логотип настоящий, из брендбука провайдера (id.taler.tirol/brand),
  // а не буква в кружке: Taler ID — внешний сервис, и подменять его
  // фирменный знак самодельным значком нельзя.
  talerid: {
    label: 'Войти через Taler ID',
    providerName: 'Taler ID',
    badge: (
      <img
        src="/talerid-logo.png"
        alt=""
        className="w-6 h-6 rounded"
        loading="lazy"
      />
    ),
  },
};

const OAuthButton: React.FC<Props> = ({ provider }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const look = LOOKS[provider];

  const handleClick = async () => {
    setLoading(true);
    try {
      const { authorizeUrl } =
        provider === 'talerid'
          ? await authService.taleridLoginStart()
          : await authService.oauthInit(provider, 'login');
      window.location.href = authorizeUrl;
    } catch (e) {
      setLoading(false);
      const notConfigured =
        e instanceof Error && e.message === 'oauth provider not configured';
      alert(
        notConfigured
          ? t(
              'auth.oauth.notConfigured',
              // i18n-ignore: defaultValue многострочного t(), ключ есть во всех локалях
        'Вход через {{provider}} пока не настроен на сервере',
              { provider: look.providerName },
            )
          : t('auth.oauth.initFailed', 'Не удалось начать вход через провайдер'),
      );
    }
  };

  const label = t(`auth.oauth.${provider}`, look.label);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
    >
      {loading ? <Loader className="w-5 h-5 animate-spin" /> : look.badge}
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  );
};

export default OAuthButton;
