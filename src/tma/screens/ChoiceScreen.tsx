import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { runStart, runSendCode, runConfirmLink } from '../choiceFlow';
import { SUPPORTED_LANGUAGES } from '../../i18n/languages';

interface Props {
  onAuthenticated: () => void;
}

type Stage = 'choice' | 'phone' | 'code';

/**
 * Экран первого входа для незнакомого Telegram. Вся логика решений живёт в
 * ../choiceFlow.ts (см. комментарий там про порядок вход-потом-привязка) —
 * этот компонент только собирает форму и дёргает те функции.
 */
export function ChoiceScreen({ onAuthenticated }: Props) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>('choice');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    const r = await runStart();
    setBusy(false);
    if (r.ok) onAuthenticated();
    else setError(t('tma.choice.failed'));
  };

  const handleSendCode = async () => {
    setBusy(true);
    setError(null);
    const r = await runSendCode(phone);
    setBusy(false);
    if (r.ok) setStage('code');
    else setError(t('tma.choice.failed'));
  };

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    const r = await runConfirmLink(phone, code);
    setBusy(false);
    if (r.status === 'ok') {
      onAuthenticated();
      return;
    }
    setError(t(r.status === 'conflict' ? 'tma.choice.conflict' : 'tma.choice.failed'));
  };

  return (
    <div className="flex min-h-screen flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('tma.choice.title')}</h1>
        <p className="mt-2 text-gray-500">{t('tma.choice.subtitle')}</p>
      </div>

      {error && <p className="text-red-500">{error}</p>}

      {stage === 'choice' && (
        <div className="flex flex-col gap-3">
          {/*
            Язык спрашиваем ДО регистрации, а не угадываем: у нового человека
            профиля ещё нет, и остаётся только язык устройства — на общем или
            англоязычном телефоне это промах. Список тот же, что на сайте.
            Выбор применяется сразу и уедет в profile_data.language при
            сохранении профиля.
          */}
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-500">{t('tma.choice.language')}</span>
            <select
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3"
              value={SUPPORTED_LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : 'ru'}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.nativeName}</option>
              ))}
            </select>
          </label>

          <button
            className="rounded-2xl bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
            onClick={handleStart}
            disabled={busy}
          >
            {t('tma.choice.start')}
          </button>
          <button
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 font-medium disabled:opacity-50"
            onClick={() => setStage('phone')}
            disabled={busy}
          >
            {t('tma.choice.haveAccount')}
          </button>
        </div>
      )}

      {stage === 'phone' && (
        <div className="flex flex-col gap-3">
          <label className="text-sm text-gray-500">{t('tma.choice.phoneLabel')}</label>
          <input
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            className="rounded-2xl bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
            onClick={handleSendCode}
            disabled={busy || phone.length < 10}
          >
            {t('tma.choice.sendCode')}
          </button>
          <button className="px-4 py-2 opacity-70" onClick={() => setStage('choice')}>
            {t('tma.choice.back')}
          </button>
        </div>
      )}

      {stage === 'code' && (
        <div className="flex flex-col gap-3">
          <label className="text-sm text-gray-500">{t('tma.choice.codeLabel')}</label>
          <input
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 tracking-[0.5em]"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            className="rounded-2xl bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
            onClick={handleConfirm}
            disabled={busy || code.length < 4}
          >
            {t('tma.choice.confirm')}
          </button>
          <button className="px-4 py-2 opacity-70" onClick={() => setStage('phone')}>
            {t('tma.choice.back')}
          </button>
        </div>
      )}
    </div>
  );
}
