import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { authService } from '../../services/authService';
import { Button } from '../ui/Button';
import { providerMark } from './providerMarks';
import type { OAuthProviderId } from '../../types/auth';

interface Props {
  provider: OAuthProviderId;
  disabled?: boolean;
}

// i18n-ignore: только defaultValue для t('auth.oauth.*'), ключи есть во всех локалях.
const LABELS: Record<OAuthProviderId, { label: string; providerName: string }> = {
  google:  { label: 'Продолжить с Google',   providerName: 'Google' },
  yandex:  { label: 'Продолжить с Yandex',   providerName: 'Yandex' },
  talerid: { label: 'Продолжить с Taler ID', providerName: 'Taler ID' },
};

const OAuthButton: React.FC<Props> = ({ provider, disabled }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const look = LABELS[provider];

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
      const notConfigured = e instanceof Error && e.message === 'oauth provider not configured';
      // Системный alert() заменён на toast: он не блокирует страницу и выглядит
      // как остальной продукт. Toaster уже смонтирован в App.tsx.
      toast.error(
        notConfigured
          // i18n-ignore: defaultValue многострочного t(), ключ есть во всех локалях
          ? t('auth.oauth.notConfigured', 'Вход через {{provider}} пока не настроен на сервере', {
              provider: look.providerName,
            })
          : t('auth.oauth.initFailed', 'Не удалось начать вход через провайдер'),
      );
    }
  };

  return (
    <Button
      variant="secondary"
      onClick={handleClick}
      loading={loading}
      disabled={disabled}
      data-testid={`oauth-${provider}`}
      leading={providerMark(provider)}
    >
      {t(`auth.oauth.${provider}`, look.label)}
    </Button>
  );
};

export default OAuthButton;
