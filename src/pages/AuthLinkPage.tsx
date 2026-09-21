import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Link2, Phone, UserPlus } from 'lucide-react';
import PhoneInput from '../components/onboarding/PhoneInput';
import OTPInput from '../components/onboarding/OTPInput';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import { tokenManager } from '../utils/tokenManager';

/**
 * Вход остановлен: почта принадлежит аккаунту, где она указана в профиле, но
 * не заведена как способ входа.
 *
 * Сюда уводят все входы по почте и OAuth, когда бэк ответил link_required.
 * Раньше такой вход молча заводил второй аккаунт со своим приветственным
 * бонусом — 19.09.2026 так разъехался аккаунт victoria-337@mail.ru, и человек
 * оказался в пустом чате при живом старом аккаунте.
 *
 * Автоматически склеивать нельзя: профильная почта никем не проверена.
 * Поэтому здесь ровно два выхода, и оба выбирает человек.
 */
const AuthLinkPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const ticket = params.get('ticket') || '';
  const hint = params.get('hint') || '';

  const [step, setStep] = useState<'choose' | 'phone' | 'code'>('choose');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fail = (key: string) => {
    setError(t(key));
    setBusy(false);
  };

  const sendSms = async (value: string) => {
    setBusy(true);
    setError('');
    const r = await authService.requestSMSCode(value);
    setBusy(false);
    if (!r.success) return setError(r.message || t('authLink.smsFailed'));
    setPhone(value);
    setStep('code');
  };

  /**
   * Код принят — аккаунт подтверждён. Только теперь привязываем почту: до
   * этого момента владение аккаунтом ничем не доказано.
   */
  const verifyAndAttach = async (code: string) => {
    setBusy(true);
    setError('');
    const r = await authService.verifyCode(phone, code);
    if (!r.success) return fail(r.error === 'Wrong code' ? 'authLink.wrongCode' : 'authLink.verifyFailed');

    try {
      await apiClient.post('/webhook/auth/link/attach', { ticket });
    } catch {
      // Вход уже состоялся, токены сохранены. Не привязалась только почта —
      // это не повод выкидывать человека обратно на экран входа: пусть
      // заходит, привязку можно повторить в настройках.
      console.error('link/attach не удался — почта осталась непривязанной');
    }
    window.location.replace('/chat');
  };

  const createSeparate = async () => {
    setBusy(true);
    setError('');
    try {
      const resp = await apiClient.post('/webhook/auth/link/new', { ticket });
      const data = resp.data || resp;
      if (!data['access-token'] || !data['refresh-token']) return fail('authLink.ticketExpired');
      if (!tokenManager.saveTokens(data['access-token'], data['refresh-token'])) {
        return fail('authLink.storageFull');
      }
      window.location.replace('/chat');
    } catch {
      fail('authLink.ticketExpired');
    }
  };

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center">
          <p className="text-gray-700 mb-4">{t('authLink.ticketExpired')}</p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium"
          >
            {t('authLink.backToLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-6">
        {step === 'choose' && (
          <>
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
              <Link2 className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('authLink.title')}</h1>
            <p className="text-gray-600 mb-6">
              {t('authLink.explain', { hint })}
            </p>

            <button
              onClick={() => setStep('phone')}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-medium mb-3"
            >
              <Phone className="w-4 h-4" />
              {t('authLink.loginByPhone')}
            </button>

            <button
              onClick={createSeparate}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              {t('authLink.createNew')}
            </button>
            <p className="text-xs text-gray-500 mt-3">{t('authLink.createNewHint')}</p>

            {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
          </>
        )}

        {step === 'phone' && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('authLink.phoneTitle')}</h1>
            <p className="text-gray-600 mb-6">{t('authLink.phoneSubtitle', { hint })}</p>
            <PhoneInput onSubmit={sendSms} isLoading={busy} />
            {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
          </>
        )}

        {step === 'code' && (
          <OTPInput
            phone={phone}
            onSubmit={verifyAndAttach}
            onBack={() => setStep('phone')}
            onResend={() => sendSms(phone)}
            isLoading={busy}
            error={error}
            onErrorClear={() => setError('')}
          />
        )}
      </div>
    </div>
  );
};

export default AuthLinkPage;
