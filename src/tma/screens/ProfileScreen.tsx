import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson, postJson, putForm, getBlob } from '../api';
import { SUPPORTED_LANGUAGES } from '../../i18n/languages';
import { extractProfile, saveProfile, uploadAvatar } from './profileData';

export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [language, setLanguage] = useState(i18n.language);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const loadAvatar = () => {
    getBlob('/webhook/avatar').then((blob) => setAvatarUrl(blob ? URL.createObjectURL(blob) : null));
  };

  useEffect(() => {
    getJson('/webhook/profile').then((r) => {
      const p = extractProfile(r);
      setName(p.name);
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
        { name, birthday, language },
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
          {avatarUrl ? (
            <img src={avatarUrl} alt={t('tma.profile.avatar')} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-full border" />
          )}
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
          <span className="text-sm opacity-70">{t('tma.profile.name')}</span>
          <input className="rounded-xl border px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">{t('tma.profile.birthday')}</span>
          <input type="date" className="rounded-xl border px-4 py-3" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm opacity-70">{t('tma.profile.language')}</span>
          <select className="rounded-xl border px-4 py-3" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.nativeName}</option>
            ))}
          </select>
        </label>

        <button
          className="rounded-xl bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
          onClick={save}
          disabled={status === 'saving'}
        >
          {t('tma.profile.save')}
        </button>

        {status === 'saved' && <p className="text-green-600">{t('tma.profile.saved')}</p>}
        {status === 'failed' && <p className="text-red-500">{t('tma.profile.failed')}</p>}
      </div>
    </div>
  );
}
