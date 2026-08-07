import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailCheck, ArrowLeft } from 'lucide-react';
import { authService } from '../../services/authService';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';

interface Props {
  /** Согласие ещё не отмечено — отправлять нельзя. */
  blocked?: boolean;
  /** Блок согласия. Рендерится между полем и кнопкой; общий для обеих форм, поэтому приходит снаружи. */
  consent?: React.ReactNode;
  /** Рисуется под кнопкой: переключение на вход по телефону. */
  footer?: React.ReactNode;
}

const EmailLoginPane: React.FC<Props> = ({ blocked, consent, footer }) => {
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
      <div className="text-center py-4">
        <MailCheck className="w-10 h-10 text-forest-700 mx-auto mb-3" aria-hidden />
        <h3 className="text-base font-medium text-gray-900">{t('auth.email.sentTitle', 'Проверь почту')}</h3>
        <p className="text-sm text-gray-600 mt-1.5">
          {t('auth.email.sentBody', 'Мы отправили ссылку для входа на')}{' '}
          <span className="font-medium text-gray-900">{email}</span>
        </p>
        <button
          onClick={() => setStep('input')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mt-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          {t('common.back', 'Назад')}
        </button>
      </div>
    );
  }

  // space-y-3 на форме, а не отступы на детях: между полем, блоком согласия
  // и кнопкой получается одинаковый зазор независимо от того, передан
  // consent или нет. Отступ на самом consent дал бы двойной интервал.
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField
        label={t('auth.email.label', 'Электронная почта')}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="you@example.com"
        data-testid="email-input"
        error={error}
      />
      {consent}
      <Button
        type="submit"
        loading={loading}
        disabled={!email || blocked}
        data-testid="email-submit-btn"
      >
        {t('auth.email.submit', 'Получить ссылку для входа')}
      </Button>
      {footer}
    </form>
  );
};

export default EmailLoginPane;
