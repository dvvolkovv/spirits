import { useState } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  busy: boolean;
  error: string | null;
  onJoin: (name: string) => void;
}

/**
 * Экран до входа: как вас зовут.
 *
 * Имя обязательно и спрашивается заранее, а не берётся «Гость» по умолчанию:
 * в комнате оно единственный способ понять, кто говорит, — разметка говорящего
 * у ассистента строится на нём же.
 */
export default function JoinForm({ title, busy, error, onJoin }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    onJoin(clean);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-lg font-semibold text-gray-900 mb-1">{title}</h1>
        <p className="text-sm text-gray-500 mb-5">{t('room.audio_only')}</p>

        <label htmlFor="room-name" className="block text-sm font-medium text-gray-700 mb-1">
          {t('room.your_name')}
        </label>
        <input
          id="room-name"
          data-testid="room-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          autoFocus
          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-forest-500 mb-4"
        />

        <button
          type="submit"
          disabled={busy || !name.trim()}
          data-testid="room-join"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-forest-700 text-white font-medium disabled:opacity-50 hover:bg-forest-800 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          {busy ? t('room.joining') : t('room.join')}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{t(`room.${error}`)}</p>}
      </form>
    </div>
  );
}
