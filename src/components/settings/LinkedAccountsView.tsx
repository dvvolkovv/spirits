import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Mail, Loader } from 'lucide-react';
import { authService } from '../../services/authService';
import type { Identity } from '../../types/auth';
import type { TFunction } from 'i18next';

const providerLabel = (t: TFunction, p: Identity['provider']): string => {
  if (p === 'phone')   return t('profile.phone');
  if (p === 'email')   return 'Email';
  if (p === 'google')  return 'Google';
  if (p === 'talerid') return 'Taler ID';
  return 'Yandex';
};

/** Значок провайдера в списке. Логотип Taler ID — настоящий, из брендбука. */
const providerBadge = (p: Identity['provider']) => {
  if (p === 'talerid') {
    return <img src="/talerid-logo.png" alt="" className="w-5 h-5 rounded" />;
  }
  return (
    <span
      className={`inline-flex w-5 h-5 rounded items-center justify-center text-xs font-bold ${
        p === 'google' ? 'bg-white border' : 'bg-red-600 text-white'
      }`}
    >
      {/* i18n-ignore: брендовые глифы Google и Яндекса, не текст */}
      {p === 'google' ? 'G' : 'Я'}
    </span>
  );
};

const LinkedAccountsView: React.FC = () => {
  const { t } = useTranslation();
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingUnlink, setPendingUnlink] = useState<string | null>(null);
  // Инлайн-привязка телефона: phone → отправка кода → ввод кода → link.
  const [phoneStep, setPhoneStep] = useState<'idle' | 'phone' | 'code'>('idle');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

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

  const handleSendPhoneCode = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 11) { setError(t('settings.linkedAccounts.phoneInvalid', 'Введите номер телефона')); return; }
    setPhoneBusy(true);
    const r = await authService.requestSMSCode(clean);
    setPhoneBusy(false);
    if (r.success) { setError(null); setPhoneStep('code'); }
    else setError(r.message || t('settings.linkedAccounts.smsError', 'Не удалось отправить код'));
  };

  const handleLinkPhone = async () => {
    setPhoneBusy(true);
    const r = await authService.linkPhone(phone, smsCode.trim());
    setPhoneBusy(false);
    if (r.ok) {
      setPhoneStep('idle'); setPhone(''); setSmsCode(''); setError(null);
      load();
    } else if (r.reason === 'conflict') {
      // Номер уже привязан к другому аккаунту. Слияние по телефону из настроек
      // пока не заведено — честно объясняем, а не молчим.
      setError(t('settings.linkedAccounts.phoneConflict', 'Этот номер уже привязан к другому аккаунту. Войдите под ним, чтобы объединить.'));
    } else {
      setError(t('settings.linkedAccounts.phoneLinkError', 'Не удалось привязать номер'));
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
              {(id.provider === 'google' ||
                id.provider === 'yandex' ||
                id.provider === 'talerid') && providerBadge(id.provider)}
              <div>
                <p className="text-sm font-medium">{providerLabel(t, id.provider)}</p>
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
              {/* i18n-ignore: брендовый глиф, не текст */}
              <span className="inline-flex w-5 h-5 rounded bg-red-600 text-white items-center justify-center text-xs font-bold">Я</span>
              <p className="text-sm">Yandex</p>
            </div>
            <button onClick={() => handleLinkOAuth('yandex')} className="text-xs text-forest-600 hover:text-forest-800">
              {t('settings.linkedAccounts.link', 'Привязать')}
            </button>
          </div>
        )}
        {!linkedProviders.has('phone') && phoneStep === 'idle' && (
          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-gray-500" />
              <p className="text-sm">{t('profile.phone', 'Телефон')}</p>
            </div>
            <button onClick={() => { setError(null); setPhoneStep('phone'); }} className="text-xs text-forest-600 hover:text-forest-800">
              {t('settings.linkedAccounts.link', 'Привязать')}
            </button>
          </div>
        )}
        {!linkedProviders.has('phone') && phoneStep !== 'idle' && (
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-gray-500" />
              <p className="text-sm font-medium">{t('settings.linkedAccounts.linkPhoneTitle', 'Привязать телефон')}</p>
            </div>
            {phoneStep === 'phone' ? (
              <div className="flex gap-2">
                <input
                  type="tel"
                  inputMode="tel"
                  autoFocus
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+7 900 000-00-00"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={handleSendPhoneCode}
                  disabled={phoneBusy}
                  className="px-3 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {phoneBusy && <Loader className="w-4 h-4 animate-spin" />}
                  {t('settings.linkedAccounts.sendCode', 'Код')}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={smsCode}
                  onChange={e => setSmsCode(e.target.value)}
                  placeholder={t('settings.linkedAccounts.codePlaceholder', 'Код из SMS')}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={handleLinkPhone}
                  disabled={phoneBusy}
                  className="px-3 py-2 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {phoneBusy && <Loader className="w-4 h-4 animate-spin" />}
                  {t('settings.linkedAccounts.confirm', 'Привязать')}
                </button>
              </div>
            )}
            <button
              onClick={() => { setPhoneStep('idle'); setPhone(''); setSmsCode(''); setError(null); }}
              className="self-start text-xs text-gray-500 hover:text-gray-700"
            >
              {t('common.cancel', 'Отмена')}
            </button>
          </div>
        )}

        {/* Taler ID здесь намеренно НЕ предлагаем: его связывание устроено
            иначе — оно переносит телефон на сторону провайдера и имеет свои
            исходы (номер занят, на аккаунте уже есть переписка). Для этого
            есть отдельный блок TalerIdEcosystemCard; кнопка «Привязать»
            рядом с Google и Яндексом повела бы во ВХОД и завела человеку
            второй аккаунт вместо связывания с текущим. */}
      </div>
    </div>
  );
};

export default LinkedAccountsView;
