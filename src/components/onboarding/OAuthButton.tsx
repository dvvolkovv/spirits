import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from 'lucide-react';
import { authService } from '../../services/authService';

interface Props {
  provider: 'google' | 'yandex';
}

const OAuthButton: React.FC<Props> = ({ provider }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { authorizeUrl } = await authService.oauthInit(provider, 'login');
      window.location.href = authorizeUrl;
    } catch {
      setLoading(false);
      alert(t('auth.oauth.initFailed', 'Не удалось начать вход через провайдер'));
    }
  };

  const label = provider === 'google'
    ? t('auth.oauth.google', 'Войти через Google')
    : t('auth.oauth.yandex', 'Войти через Yandex');

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
    >
      {loading
        ? <Loader className="w-5 h-5 animate-spin" />
        : (
          <span className={`inline-flex w-6 h-6 rounded items-center justify-center font-bold text-sm ${provider === 'google' ? 'bg-white border' : 'bg-red-600 text-white'}`}>
            {provider === 'google' ? 'G' : 'Я'}
          </span>
        )
      }
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  );
};

export default OAuthButton;
