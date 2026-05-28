import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, ArrowLeft, Loader } from 'lucide-react';
import { authService } from '../../services/authService';

const EmailLoginPane: React.FC = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'input' | 'sent'>('input');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.requestMagicLink(email.trim().toLowerCase());
      setStep('sent');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'failed';
      if (msg === 'tempmail_blocked') setError(t('auth.email.tempmailBlocked', 'Используйте постоянную почту'));
      else if (msg === 'rate_limit') setError(t('auth.email.rateLimit', 'Слишком частые запросы, подожди минуту'));
      else setError(t('auth.email.requestError', 'Не удалось отправить ссылку'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'sent') {
    return (
      <div className="space-y-4 text-center py-6">
        <Mail className="w-12 h-12 text-forest-600 mx-auto" />
        <h3 className="text-lg font-medium">{t('auth.email.sentTitle', 'Проверь почту')}</h3>
        <p className="text-sm text-gray-600">
          {t('auth.email.sentBody', 'Мы отправили ссылку для входа на')} <span className="font-medium">{email}</span>
        </p>
        <button
          onClick={() => setStep('input')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-3 h-3" />
          {t('common.back', 'Назад')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-gray-700">{t('auth.email.label', 'Электронная почта')}</span>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-forest-500 focus:ring-1 focus:ring-forest-500"
          placeholder="you@example.com"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !email}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50"
      >
        {loading && <Loader className="w-4 h-4 animate-spin" />}
        {t('auth.email.submit', 'Получить ссылку для входа')}
      </button>
    </form>
  );
};

export default EmailLoginPane;
