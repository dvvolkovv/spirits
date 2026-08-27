import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import JoinForm from '../components/room/JoinForm';
import RoomStage from '../components/room/RoomStage';
import { useRoom } from '../components/room/useRoom';

/**
 * Публичная страница голосовой комнаты.
 *
 * Гости — не пользователи Linkeon, авторизации у них нет и взяться ей неоткуда:
 * человеку просто прислали ссылку. Поэтому маршрут вынесен в App.tsx ДО
 * проверки авторизации, а данные тянутся публичными ручками.
 */
export default function RoomPage() {
  const { code = '' } = useParams();
  const { t } = useTranslation();
  const [title, setTitle] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const { peers, state, error, micOn, join, toggleMic, leave } = useRoom(code);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/webhook/room/public/${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        if (!cancelled) setTitle(data.title || t('room.default_title'));
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => { cancelled = true; };
  }, [code, t]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-600 text-center">{t('room.not_found')}</p>
      </div>
    );
  }

  if (title === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (state === 'left') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-600 text-center">{t('room.you_left')}</p>
      </div>
    );
  }

  if (state === 'connected') {
    return (
      <RoomStage
        title={title}
        peers={peers}
        micOn={micOn}
        onToggleMic={toggleMic}
        onLeave={leave}
      />
    );
  }

  return (
    <JoinForm
      title={title}
      busy={state === 'joining'}
      error={error}
      onJoin={join}
    />
  );
}
