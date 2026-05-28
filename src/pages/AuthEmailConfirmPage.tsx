import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthEmailConfirmPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');

  if (!token) {
    return (
      <div className="max-w-md mx-auto py-20 text-center px-4">
        <h1 className="text-2xl font-semibold">Ссылка устарела</h1>
        <p className="mt-2 text-gray-600">Попробуй запросить новую</p>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 bg-forest-600 text-white rounded-lg">
          Назад к входу
        </button>
      </div>
    );
  }

  // When token is present, user clicked a link that points to /webhook/auth/email/confirm directly
  // (the backend serves an HTML page with inline-script that sets localStorage and redirects).
  // If we ended up here with a token in URL, it means routing went to frontend — render a loader
  // while we redirect to backend endpoint.
  React.useEffect(() => {
    window.location.replace(`/webhook/auth/email/confirm?token=${encodeURIComponent(token)}`);
  }, [token]);
  return <div className="max-w-md mx-auto py-20 text-center"><p className="text-gray-500">Входим...</p></div>;
};

export default AuthEmailConfirmPage;
