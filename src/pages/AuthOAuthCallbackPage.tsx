import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';

const AuthOAuthCallbackPage: React.FC = () => {
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

    if (errParam) { setError('Провайдер вернул ошибку: ' + errParam); return; }
    if (!code || !state || !provider) { setError('Битая ссылка'); return; }
    if (provider !== 'google' && provider !== 'yandex') { setError('Неизвестный провайдер'); return; }

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
        setError((body as any)?.error || 'Не удалось слить аккаунты');
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
    const providerLabel = provider === 'google' ? 'Google' : 'Яндекс';
    return (
      <div className="max-w-md mx-auto py-20 text-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-4 text-4xl">{provider === 'google' ? 'G' : 'Я'}</div>
          <h1 className="text-xl font-semibold mb-2">Аккаунт уже существует</h1>
          <p className="text-gray-600 text-sm mb-4">
            Этот {providerLabel}-аккаунт уже зарегистрирован как отдельный профиль
            {mergeState.conflictTokens > 0 && (
              <> с <strong>{mergeState.conflictTokens.toLocaleString('ru-RU')} токенами</strong></>
            )}.
          </p>
          <p className="text-gray-600 text-sm mb-6">
            Слить его с вашим текущим аккаунтом?{mergeState.conflictTokens > 0 ? ' Токены перейдут.' : ''}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/settings')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              onClick={handleMerge}
              disabled={merging}
              className="px-4 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 disabled:opacity-50 flex items-center gap-2"
            >
              {merging && <Loader className="w-4 h-4 animate-spin" />}
              Слить аккаунты
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto py-20 text-center px-4">
        <h1 className="text-xl font-semibold">Не удалось войти</h1>
        <p className="mt-2 text-gray-600 text-sm">{error}</p>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 bg-forest-600 text-white rounded-lg">
          Назад
        </button>
      </div>
    );
  }

  return <div className="max-w-md mx-auto py-20 text-center"><p className="text-gray-500">Входим...</p></div>;
};

export default AuthOAuthCallbackPage;
