import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Mail, Loader } from 'lucide-react';
import { authService } from '../../services/authService';
import type { Identity } from '../../types/auth';

const providerLabel = (p: Identity['provider']): string => {
  if (p === 'phone')  return 'Телефон';
  if (p === 'email')  return 'Email';
  if (p === 'google') return 'Google';
  return 'Yandex';
};

const LinkedAccountsView: React.FC = () => {
  const { t } = useTranslation();
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUnlink, setPendingUnlink] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await authService.listIdentities();
      setIdentities(data);
      setError(null);
    } catch {
      setError(t('settings.linkedAccounts.loadError', 'Не удалось загрузить'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleUnlink = async (id: string) => {
    setPendingUnlink(id);
    const r = await authService.unlinkIdentity(id);
    setPendingUnlink(null);
    if (r.ok) load();
    else setError(t('settings.linkedAccounts.unlinkError', 'Не удалось отвязать'));
  };

  const handleLinkOAuth = async (provider: 'google' | 'yandex') => {
    try {
      const { authorizeUrl } = await authService.oauthInit(provider, 'link');
      window.location.href = authorizeUrl;
    } catch {
      setError(t('settings.linkedAccounts.oauthError', 'Не удалось начать привязку'));
    }
  };

  if (!identities && loading) {
    return <div className="py-8 flex justify-center"><Loader className="w-5 h-5 animate-spin text-forest-600" /></div>;
  }

  const linkedProviders = new Set(identities?.map(id => id.provider));
  const isLastMethod = (identities?.length ?? 0) <= 1;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium">
        {t('settings.linkedAccounts.title', 'Способы входа')}
      </div>
      {error && <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">{error}</div>}
      <div className="divide-y divide-gray-100">
        {identities?.map(id => (
          <div key={id.id} className="px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {id.provider === 'phone' && <Smartphone className="w-4 h-4 text-gray-500" />}
              {id.provider === 'email' && <Mail className="w-4 h-4 text-gray-500" />}
              {(id.provider === 'google' || id.provider === 'yandex') && (
                <span className={`inline-flex w-5 h-5 rounded items-center justify-center text-xs font-bold ${id.provider === 'google' ? 'bg-white border' : 'bg-red-600 text-white'}`}>
                  {id.provider === 'google' ? 'G' : 'Я'}
                </span>
              )}
              <div>
                <p className="text-sm font-medium">{providerLabel(id.provider)}</p>
                <p className="text-xs text-gray-500">{id.providerSub}</p>
              </div>
            </div>
            <button
              onClick={() => handleUnlink(id.id)}
              disabled={isLastMethod || pendingUnlink === id.id}
              title={isLastMethod ? t('settings.linkedAccounts.lastMethod', 'Это единственный способ входа') : ''}
              className="text-xs text-red-600 hover:text-red-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {pendingUnlink === id.id ? '...' : t('settings.linkedAccounts.unlink', 'Отвязать')}
            </button>
          </div>
        ))}

        {!linkedProviders.has('google') && (
          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex w-5 h-5 rounded bg-white border items-center justify-center text-xs font-bold">G</span>
              <p className="text-sm">Google</p>
            </div>
            <button onClick={() => handleLinkOAuth('google')} className="text-xs text-forest-600 hover:text-forest-800">
              {t('settings.linkedAccounts.link', 'Привязать')}
            </button>
          </div>
        )}
        {!linkedProviders.has('yandex') && (
          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex w-5 h-5 rounded bg-red-600 text-white items-center justify-center text-xs font-bold">Я</span>
              <p className="text-sm">Yandex</p>
            </div>
            <button onClick={() => handleLinkOAuth('yandex')} className="text-xs text-forest-600 hover:text-forest-800">
              {t('settings.linkedAccounts.link', 'Привязать')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkedAccountsView;
