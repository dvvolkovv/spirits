import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Mail } from 'lucide-react';
import SmsLoginPane from './SmsLoginPane';
import EmailLoginPane from './EmailLoginPane';
import OAuthButton from './OAuthButton';
import LoginConsentBlock from './LoginConsentBlock';
import { Button } from '../ui/Button';

type Method = 'sms' | 'email';

/**
 * Вкладок больше нет: в карточке всегда ровно ОДНА основная форма, переключение
 * между почтой и телефоном идёт кнопкой на месте.
 *
 * Приоритет отдан почте — решение владельца продукта от 2026-08-07. Наблюдения
 * по регистрациям за 30 дней говорят в пользу телефона (11 против 5), но
 * стоимость SMS на каждой попытке в этих цифрах не отражена.
 *
 * Форма БОЛЬШЕ НЕ ГАСИТСЯ до галочки согласия. Раньше весь блок шёл под
 * opacity-40 pointer-events-none, и первое, что видел человек, — серая
 * нерабочая форма. Теперь неактивны только кнопки отправки.
 */
const LoginTabs: React.FC = () => {
  const { t } = useTranslation();

  const [method, setMethod] = useState<Method>(() =>
    localStorage.getItem('lastLoginTab') === 'sms' ? 'sms' : 'email',
  );
  useEffect(() => {
    try { localStorage.setItem('lastLoginTab', method); } catch { /* приватный режим */ }
  }, [method]);

  const [consentGiven, setConsentGiven] = useState<boolean>(
    () => localStorage.getItem('loginConsent') === 'true',
  );
  useEffect(() => {
    try { localStorage.setItem('loginConsent', consentGiven ? 'true' : 'false'); } catch { /* приватный режим */ }
  }, [consentGiven]);

  const consent = <LoginConsentBlock checked={consentGiven} onChange={setConsentGiven} />;

  const switchTo = (next: Method) => (
    <Button
      variant="ghost"
      className="mt-2.5"
      onClick={() => setMethod(next)}
      data-testid={next === 'sms' ? 'switch-to-phone' : 'switch-to-email'}
      leading={next === 'sms'
        ? <Smartphone className="w-[18px] h-[18px]" aria-hidden />
        : <Mail className="w-[18px] h-[18px]" aria-hidden />}
    >
      {next === 'sms'
        ? t('auth.switch.toPhone', 'Войти по номеру телефона')
        : t('auth.switch.toEmail', 'Войти по почте')}
    </Button>
  );

  return (
    <div className="w-full">
      {method === 'email' ? (
        <EmailLoginPane blocked={!consentGiven} consent={consent} footer={null} />
      ) : (
        <SmsLoginPane blocked={!consentGiven} consent={consent} footer={null} />
      )}

      <div className="flex items-center gap-3 my-5">
        <div className="h-px flex-1 bg-gray-100" />
        <span className="text-xs text-gray-400">{t('auth.or', 'или')}</span>
        <div className="h-px flex-1 bg-gray-100" />
      </div>

      <div className="space-y-2">
        <OAuthButton provider="yandex"  disabled={!consentGiven} />
        <OAuthButton provider="google"  disabled={!consentGiven} />
        <OAuthButton provider="talerid" disabled={!consentGiven} />
      </div>

      {switchTo(method === 'email' ? 'sms' : 'email')}
    </div>
  );
};

export default LoginTabs;
