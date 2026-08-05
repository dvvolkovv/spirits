import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { Loader } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';

const AuthOAuthCallbackPage: React.FC = () => {
  const { t } = useTranslation();
  const { provider } = useParams<{ provider: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [mergeState, setMergeState] = useState<{ mergeToken: string; conflictTokens: number } | null>(null);
  const [merging, setMerging] = useState(false);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const code = params.get('code');
    const state = params.get('state');
    const errParam = params.get('error');

    if (errParam) { setError(t('pages.oauth_provider_error', { error: errParam })); return; }
    if (!code || !state || !provider) { setError(t('pages.oauth_broken_link')); return; }
    if (provider !== 'google' && provider !== 'yandex' && provider !== 'talerid') { setError(t('pages.oauth_unknown_provider')); return; }

    (async () => {
      try {
        const resp = await apiClient.post(`/webhook/auth/oauth/${provider}`, { code, state });
        const body = await resp.json().catch(() => ({} as Record<string, unknown>));

        if (resp.status === 409 && (body as any).mergeToken) {
          setMergeState({ mergeToken: (body as any).mergeToken, conflictTokens: (body as any).conflictTokens ?? 0 });
          return;
        }

        if (!resp.ok) {
          setError((body as any)?.error || 'oauth callback failed');
          return;
        }

        if ((body as any).linked) {
          navigate('/settings?linked=1');
          return;
        }

        localStorage.setItem('jwt_access_token', (body as any)['access-token']);
        localStorage.setItem('jwt_refresh_token', (body as any)['refresh-token']);
        await login('', (body as any)['access-token']);
        navigate('/chat', { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'failed');
      }
    })();
  }, [provider, params, navigate, login]);

  const handleMerge = async () => {
    if (!mergeState) return;
    setMerging(true);
    try {
      const resp = await apiClient.post('/webhook/auth/identities/merge', { mergeToken: mergeState.mergeToken });
      if (resp.ok) {
        navigate('/settings?linked=1');
      } else {
        const body = await resp.json().catch(() => ({}));
        setError((body as any)?.error || t('pages.oauth_merge_failed'));
        setMergeState(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
      setMergeState(null);
    } finally {
      setMerging(false);
    }
  };

  if (mergeState) {
    // i18n-ignore: имена брендов не переводятся; «Я» — брендовый глиф Яндекса,
  // тот же, что на кнопке входа (OAuthButton).
  const providerLabel = provider === 'google' ? 'Google' : 'Yandex';
    return (
      <div className="max-w-md mx-auto py-20 text-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-4 text-4xl">{provider === 'google' ? 'G' : 'Я'}</div>
          <h1 className="text-xl font-semibold mb-2">{t('pages.oauth_account_exists_title')}</h1>
          <p className="text-gray-600 text-sm mb-4">
            {mergeState.conflictTokens > 0 ? (
              <Trans
                i18nKey="pages.oauth_merge_desc_tokens"
                values={{ provider: providerLabel, tokens: mergeState.conflictTokens.toLocaleString('ru-RU') }}
                components={{ bold: <strong /> }}
              />
            ) : (
              t('pages.oauth_merge_desc', { provider: providerLabel })
            )}
          </p>
          <p className="text-gray-600 text-sm mb-6">
            {mergeState.conflictTokens > 0 ? t('pages.oauth_merge_confirm_tokens') : t('pages.oauth_merge_confirm')}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/settings')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleMerge}
              disabled={merging}
              className="px-4 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 disabled:opacity-50 flex items-center gap-2"
            >
              {merging && <Loader className="w-4 h-4 animate-spin" />}
              {t('pages.oauth_merge_button')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto py-20 text-center px-4">
        <h1 className="text-xl font-semibold">{t('pages.oauth_login_failed_title')}</h1>
        <p className="mt-2 text-gray-600 text-sm">{error}</p>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 bg-forest-600 text-white rounded-lg">
          {t('pages.oauth_back')}
        </button>
      </div>
    );
  }

  return <div className="max-w-md mx-auto py-20 text-center"><p className="text-gray-500">{t('pages.signing_in')}</p></div>;
};

export default AuthOAuthCallbackPage;
