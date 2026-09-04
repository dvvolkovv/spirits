import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../shared/ui/Avatar';
import { getJson, postJson, putForm, getBlob, del } from '../api';
import { closeApp } from '../telegram';
import { SUPPORTED_LANGUAGES } from '../../i18n/languages';
import { extractProfile, saveProfile, uploadAvatar } from './profileData';

export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthday, setBirthday] = useState('');
  const [language, setLanguage] = useState(i18n.language);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  /**
   * Удаление аккаунта — двухшаговое, как в вебе.
   *
   * В вебе стоит window.confirm, но в телеграмном вебвью системные диалоги
   * ведут себя непредсказуемо, а необратимое действие подтверждать надо.
   * Поэтому подтверждение своё, прямо на экране.
   */
  /**
   * Баланс дублируется из «Кошелька» по решению владельца: профиль должен
   * повторять веб один в один, а там баланс внутри профиля. Числа в двух
   * местах — ожидаемое следствие, а не расхождение.
   */
  const [tokens, setTokens] = useState<number | null>(null);
  useEffect(() => {
    getJson('/webhook/user/tokens/')
      .then((r: any) => setTokens(typeof r?.tokens === 'number' ? r.tokens : null))
      .catch(() => setTokens(null));
  }, []);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const loadAvatar = () => {
    getBlob('/webhook/avatar').then((blob) => setAvatarUrl(blob ? URL.createObjectURL(blob) : null));
  };

  useEffect(() => {
    getJson('/webhook/profile').then((r) => {
      const p = extractProfile(r);
      setName(p.name);
      setFamilyName(p.familyName);
      setNickname(p.nickname);
      setBirthday(p.birthday);
      if (p.language) setLanguage(p.language);
    }).catch(() => {});

    loadAvatar();
    // Ровно один раз при монтировании — оба запроса читают текущее
    // состояние, а не реагируют на смену языка интерфейса.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAvatarChange = async (file: File) => {
    setStatus('saving');
    try {
      await uploadAvatar(file, {
        putForm: (url, body) => putForm(url, body),
        getAvatarBlob: () => getBlob('/webhook/avatar'),
      });
      loadAvatar();
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  };

  const save = async () => {
    setStatus('saving');
    try {
      await saveProfile(
        { name, familyName, nickname, birthday, language },
        {
          postJson: (url, body) => postJson(url, body),
          changeLanguage: (lang) => i18n.changeLanguage(lang),
        },
      );
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{t('tma.profile.title')}</h1>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar src={avatarUrl} name={name || t('tma.profile.avatar')} size={64} />
          <label className="cursor-pointer text-green-600">
            {t('tma.profile.avatarChange')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAvatarChange(file);
              }}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">{t('tma.profile.name')}</span>
          <input className="rounded-2xl border border-gray-200 bg-white px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">{t('tma.profile.familyName')}</span>
          <input
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-sm text-gray-500">{t('tma.profile.nickname')}</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-sm text-gray-500">{t('tma.profile.birthday')}</span>
          <input type="date" className="rounded-2xl border border-gray-200 bg-white px-4 py-3" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-500">{t('tma.profile.language')}</span>
          <select className="rounded-2xl border border-gray-200 bg-white px-4 py-3" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.nativeName}</option>
            ))}
          </select>
        </label>

        <button
          className="rounded-2xl bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
          onClick={save}
          disabled={status === 'saving'}
        >
          {t('tma.profile.save')}
        </button>

        {status === 'saved' && <p className="text-green-600">{t('tma.profile.saved')}</p>}
        {status === 'failed' && <p className="text-red-500">{t('tma.profile.failed')}</p>}
      </div>

      {/* Баланс и пополнение — как в вебе. */}
      {tokens !== null && (
        <div className="mt-6 rounded-2xl bg-white p-4">
          <p className="text-sm text-gray-500">{t('tma.profile.balance')}</p>
          <p className="mt-1 text-2xl font-semibold">{tokens.toLocaleString()}</p>
          <button
            onClick={closeApp}
            className="mt-3 w-full rounded-2xl bg-forest-700 px-4 py-3 text-sm font-medium text-white"
          >
            {t('tma.profile.topUp')}
          </button>
          {/* Приглашение друга — вход в рефералку, как в вебе. Обе кнопки
              уводят в бот: покупка и рефералка живут там, и повторять их
              внутри мини-аппа значит держать две реализации одного. */}
          <button onClick={closeApp} className="mt-2 w-full text-sm text-forest-700 underline">
            {t('tma.profile.inviteFriend')}
          </button>
        </div>
      )}

      {/* Опасное действие — отдельно от формы и последним: чтобы палец не
          попал в него, промахнувшись мимо «Сохранить». */}
      <div className="mt-8 border-t border-gray-200 pt-4">
        {!confirmDelete && (
          <button onClick={() => setConfirmDelete(true)} className="text-sm text-red-600">
            {t('tma.profile.deleteAccount')}
          </button>
        )}

        {confirmDelete && (
          <div>
            <p className="text-sm text-gray-700">{t('tma.profile.deleteConfirm')}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  setDeleting(true);
                  setDeleteFailed(false);
                  try {
                    await del('/webhook/profile');
                    // Аккаунта больше нет — держать приложение открытым не на
                    // чем: любой следующий запрос упрётся в чужую пустоту.
                    closeApp();
                  } catch {
                    setDeleteFailed(true);
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                {t('tma.profile.deleteYes')}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {t('tma.profile.deleteNo')}
              </button>
            </div>
            {deleteFailed && (
              <p className="mt-2 text-sm text-red-500">{t('tma.profile.deleteFailed')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
