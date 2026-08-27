import { LogOut, Mic, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Peer } from './useRoom';

interface Props {
  title: string;
  peers: Peer[];
  micOn: boolean;
  onToggleMic: () => void;
  onLeave: () => void;
}

/** Идёт ли встреча. Показывается вместо аватара, картинок у гостей нет. */
function Initial({ name }: { name: string }) {
  return <span className="text-sm font-semibold text-forest-800">{(name || '?').charAt(0).toUpperCase()}</span>;
}

export default function RoomStage({ title, peers, micOn, onToggleMic, onLeave }: Props) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="px-4 py-3 bg-white border-b border-gray-200">
        <h1 className="text-base font-semibold text-gray-900 truncate">{title}</h1>
        <p className="text-xs text-gray-500">
          {t('room.participants')}: {peers.length}
        </p>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-2 max-w-md mx-auto">
          {peers.map((p) => (
            <li
              key={p.identity}
              data-testid="room-peer"
              data-speaking={p.speaking ? 'yes' : 'no'}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
                p.speaking ? 'border-forest-500 bg-forest-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  p.speaking ? 'bg-forest-200 ring-2 ring-forest-500' : 'bg-gray-100'
                }`}
              >
                <Initial name={p.isSelf ? t('room.you') : p.name} />
              </div>
              <span className="text-sm text-gray-900 truncate">
                {p.isSelf ? t('room.you') : p.name}
              </span>
            </li>
          ))}
        </ul>
      </main>

      <footer className="px-4 py-3 bg-white border-t border-gray-200 flex items-center justify-center gap-3">
        <button
          onClick={onToggleMic}
          data-testid="room-mic"
          aria-label={micOn ? t('room.mic_off') : t('room.mic_on')}
          title={micOn ? t('room.mic_off') : t('room.mic_on')}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            micOn ? 'bg-forest-700 text-white hover:bg-forest-800' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        <button
          onClick={onLeave}
          data-testid="room-leave"
          aria-label={t('room.leave')}
          title={t('room.leave')}
          className="w-12 h-12 rounded-full flex items-center justify-center bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </footer>
    </div>
  );
}
