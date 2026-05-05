import React, { useCallback, useEffect, useState } from 'react';
import { Check, X, Loader2, Inbox, Send, MessageCircle } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { clsx } from 'clsx';

type Status = 'pending' | 'approved' | 'rejected' | 'cancelled';

interface ContactRequest {
  id: number;
  requester_id: number;
  target_id: number;
  message: string | null;
  status: Status;
  created_at: string;
  resolved_at: string | null;
  requester_phone?: string;  // только для approved
  requester_name?: string | null;
  target_phone?: string;     // только для approved (в outgoing)
  target_name?: string | null;
}

const ContactRequestsPage: React.FC = () => {
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [incoming, setIncoming] = useState<ContactRequest[]>([]);
  const [outgoing, setOutgoing] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inResp, outResp] = await Promise.all([
        apiClient.get('/webhook/contact-requests'),
        apiClient.get('/webhook/contact-requests/sent'),
      ]);
      if (inResp.ok)  setIncoming(await inResp.json());
      if (outResp.ok) setOutgoing(await outResp.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: number, decision: 'approve' | 'reject') => {
    setResolvingId(id);
    try {
      const r = await apiClient.post(`/webhook/contact-request/${id}/${decision}`, {});
      if (r.ok) await load();
    } finally {
      setResolvingId(null);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const statusBadge = (s: Status) => {
    const map: Record<Status, { label: string; cls: string }> = {
      pending:   { label: 'Ожидает',  cls: 'bg-amber-100 text-amber-800' },
      approved:  { label: 'Принят',   cls: 'bg-green-100 text-green-800' },
      rejected:  { label: 'Отклонён', cls: 'bg-gray-100 text-gray-600' },
      cancelled: { label: 'Отменён',  cls: 'bg-gray-100 text-gray-600' },
    };
    const m = map[s];
    return <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', m.cls)}>{m.label}</span>;
  };

  const list = tab === 'incoming' ? incoming : outgoing;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <div className="bg-white shadow-sm px-4 py-4 border-b flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Inbox className="w-6 h-6 text-forest-600" />
          Запросы на контакт
        </h1>
      </div>

      <div className="bg-white border-b flex-shrink-0">
        <div className="flex">
          {([
            { key: 'incoming' as const, label: 'Входящие', icon: Inbox, count: incoming.filter((r) => r.status === 'pending').length },
            { key: 'outgoing' as const, label: 'Отправленные', icon: Send,  count: outgoing.filter((r) => r.status === 'pending').length },
          ]).map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'flex-1 px-4 py-3 flex items-center justify-center gap-2 border-b-2 transition-colors',
                tab === key ? 'border-forest-600 text-forest-700' : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{label}</span>
              {count > 0 && (
                <span className="px-2 py-0.5 bg-forest-100 text-forest-700 text-xs rounded-full font-semibold">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {!loading && list.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {tab === 'incoming' ? 'Пока никто не запросил ваш контакт.' : 'Вы ещё не отправляли запросов на контакт.'}
            </p>
          </div>
        )}

        {!loading && list.map((r) => (
          <div key={r.id} className="bg-white rounded-lg shadow-sm p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {tab === 'incoming'
                    ? (r.requester_name || 'Пользователь')
                    : (r.target_name || 'Пользователь')}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {fmtDate(r.created_at)}
                  {r.resolved_at && ` · обработано ${fmtDate(r.resolved_at)}`}
                </div>
              </div>
              {statusBadge(r.status)}
            </div>

            {r.message && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3">
                {r.message}
              </p>
            )}

            {r.status === 'approved' && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded p-2">
                <MessageCircle className="w-4 h-4" />
                Контакт открыт:&nbsp;
                <span className="font-medium">
                  {tab === 'incoming' ? r.requester_phone : r.target_phone}
                </span>
              </div>
            )}

            {tab === 'incoming' && r.status === 'pending' && (
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  onClick={() => resolve(r.id, 'reject')}
                  disabled={resolvingId === r.id}
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  Отклонить
                </button>
                <button
                  onClick={() => resolve(r.id, 'approve')}
                  disabled={resolvingId === r.id}
                  className="px-3 py-1.5 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {resolvingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Принять
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContactRequestsPage;
