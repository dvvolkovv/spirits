import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, ShieldCheck, ExternalLink } from 'lucide-react';
import {
  hasSmsBridge, smsHasPermission, smsRequestPermission, smsList, smsMark, type Sms,
} from '../services/smsClient';

type Tab = 'important' | 'spam';

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>('important');
  const [granted, setGranted] = useState<boolean | null>(null);
  const [items, setItems] = useState<Sms[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    setItems(await smsList(t));
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      if (!hasSmsBridge()) { setGranted(false); return; }
      const g = await smsHasPermission();
      setGranted(g);
      if (g) load(tab);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (granted) load(tab); }, [tab, granted, load]);

  const onRequest = async () => {
    const g = await smsRequestPermission();
    setGranted(g);
    if (g) load(tab);
  };

  const onMark = async (s: Sms, spam: boolean) => {
    await smsMark(s.sender, spam);
    setItems((prev) => prev.filter((x) => x !== s));
  };

  if (granted === false) {
    return (
      <div className="max-w-xl mx-auto p-5">
        <h1 className="text-xl font-bold mb-2">Сообщения</h1>
        <p className="text-gray-600 mb-4">
          Линкеон может показывать входящие SMS без спама — прямо на устройстве, ничего не отправляя в сеть.
          Для этого нужен доступ к сообщениям и контактам.
        </p>
        {hasSmsBridge()
          ? <button onClick={onRequest} className="px-4 py-3 rounded-2xl bg-indigo-600 text-white font-semibold w-full">
              Разрешить доступ
            </button>
          : <p className="text-sm text-gray-400">Функция доступна в приложении Линкеон на Android.</p>}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-3">Сообщения</h1>

      <div className="flex gap-2 mb-3">
        <TabBtn active={tab === 'important'} onClick={() => setTab('important')} icon={<ShieldCheck size={16} />} label="Важные" />
        <TabBtn active={tab === 'spam'} onClick={() => setTab('spam')} icon={<AlertTriangle size={16} />} label="Спам" />
      </div>

      {tab === 'spam' && (
        <div className="mb-3 text-[13px] text-indigo-800 bg-indigo-50 rounded-xl px-3 py-2">
          Линкеон показывает без спама. Удалить эти сообщения можно в приложении «Сообщения».
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">Загрузка…</p>}
      {!loading && items.length === 0 && (
        <p className="text-gray-400 text-sm">{tab === 'spam' ? 'Спам не найден 🎉' : 'Пусто'}</p>
      )}

      <ul className="space-y-2">
        {items.map((s, i) => (
          <li key={i} className="bg-white rounded-2xl p-3 shadow-sm">
            <div className="flex justify-between items-baseline">
              <span className="font-semibold text-sm">{s.sender || 'Без номера'}</span>
              <span className="text-xs text-gray-400">{new Date(s.date).toLocaleDateString()}</span>
            </div>
            <p className="text-sm text-gray-700 mt-1 line-clamp-2">{s.body}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => onMark(s, tab !== 'spam')}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 font-medium">
                {tab === 'spam' ? 'Не спам' : 'Это спам'}
              </button>
              <a href={`sms:${encodeURIComponent(s.sender)}`}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 font-medium inline-flex items-center gap-1">
                <ExternalLink size={13} /> Открыть в Сообщениях
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold ${
        active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
      }`}>
      {icon}{label}
    </button>
  );
}
