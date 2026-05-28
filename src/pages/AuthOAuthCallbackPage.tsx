import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../services/apiClient';

const AuthOAuthCallbackPage: React.FC = () => {
  const { provider } = useParams<{ provider: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const errParam = params.get('error');

    if (errParam) { setError('Провайдер вернул ошибку: ' + errParam); return; }
    if (!code || !state || !provider) { setError('Битая ссылка'); return; }
    if (provider !== 'google' && provider !== 'yandex') { setError('Неизвестный провайдер'); return; }

    (async () => {
      try {
        const resp = await apiClient.post(`/webhook/auth/oauth/${provider}`, { code, state });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({} as Record<string, unknown>));
          setError((body as Record<string, unknown>)?.error as string || 'oauth callback failed');
          return;
        }
        const data = await resp.json();
        if (data.linked) {
          navigate('/settings?linked=1');
          return;
        }
        localStorage.setItem('jwt_access_token', data['access-token']);
        localStorage.setItem('jwt_refresh_token', data['refresh-token']);
        localStorage.setItem('authToken', data['access-token']);
        window.location.replace('/chat');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'failed';
        setError(msg);
      }
    })();
  }, [provider, params, navigate]);

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
