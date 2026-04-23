import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Send, AlertTriangle, CheckCircle, Inbox, Clock, Bot, UserCircle2, Headphones, ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';

interface TicketListItem {
  id: string;
  userId: string;
  userName: string | null;
  userTokens: number;
  status: 'ai_handling' | 'escalated' | 'owner_handling' | 'resolved' | 'closed';
  urgency: string | null;
  topic: string | null;
  escalationReason: string | null;
  notes: string | null;
  lastMessage: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

interface TicketDetail {
  ticket: any;
  messages: Array<{
    id: string;
    ticket_id: string;
    sender_type: 'user' | 'ai' | 'owner' | 'system';
    content: string;
    metadata: any;
    visible_to_user: boolean;
    created_at: string;
  }>;
  events: Array<{ action: string; actor_type: string; payload: any; created_at: string }>;
  user: any;
}

const URGENCY_BADGE: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-red-100 text-red-800',
  normal: 'bg-blue-100 text-blue-800',
  low: 'bg-gray-100 text-gray-600',
};

interface SupportStats {
  window_days: number;
  active: { escalated: number; owner_handling: number; ai_handling: number };
  created_in_window: number;
  resolved_in_window: number;
  ai_only_in_window: number;
  avg_first_owner_reply_seconds: number | null;
  refund_count: number;
  refund_sum: number;
}

const AdminSupportView: React.FC = () => {
  const { t } = useTranslation();
  const STATUS_FILTERS: { id: string; label: string }[] = [
    { id: 'escalated', label: t('admin.support.filters.escalated') },
    { id: 'owner_handling', label: t('admin.support.filters.owner_handling') },
    { id: 'ai_handling', label: t('admin.support.filters.ai_handling') },
    { id: 'resolved', label: t('admin.support.filters.resolved') },
    { id: 'all', label: t('admin.support.filters.all') },
  ];
  const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    ai_handling: { label: 'AI', cls: 'bg-gray-100 text-gray-700' },
    escalated: { label: 'Escalated', cls: 'bg-red-100 text-red-700' },
    owner_handling: { label: t('admin.support.status.owner_handling'), cls: 'bg-forest-100 text-forest-700' },
    resolved: { label: t('admin.support.status.resolved'), cls: 'bg-green-100 text-green-700' },
    closed: { label: t('admin.support.status.closed'), cls: 'bg-gray-200 text-gray-600' },
  };
  const timeAgo = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t('admin.support.time.just_now');
    if (mins < 60) return t('admin.support.time.minutes_ago', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('admin.support.time.hours_ago', { count: hours });
    const days = Math.floor(hours / 24);
    return t('admin.support.time.days_ago', { count: days });
  };
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<string>('escalated');
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('ticket'));
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyInternal, setReplyInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    try {
      setLoadingList(true);
      const r = await apiClient.get(`/webhook/support/admin/tickets?status=${encodeURIComponent(filter)}&limit=100`);
      const data = await r.json();
      if (Array.isArray(data)) setTickets(data);
    } catch (e: any) {
      setError(e?.message || 'failed to load tickets');
    } finally {
      setLoadingList(false);
    }
  }, [filter]);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      setLoadingDetail(true);
      const r = await apiClient.get(`/webhook/support/admin/ticket/${id}`);
      const data = await r.json();
      setDetail(data);
    } catch (e: any) {
      setError(e?.message || 'failed to load ticket');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await apiClient.get('/webhook/support/admin/stats?windowDays=7');
      if (r.ok) setStats(await r.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    const id = setInterval(() => { fetchList(); fetchStats(); }, 15_000);
    return () => clearInterval(id);
  }, [fetchList, fetchStats]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    fetchDetail(selectedId);
    const id = setInterval(() => fetchDetail(selectedId), 8_000);
    return () => clearInterval(id);
  }, [selectedId, fetchDetail]);

  // Reflect selected ticket in URL so Telegram deep-links survive back/forward.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (selectedId) next.set('ticket', selectedId);
    else next.delete('ticket');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [selectedId, params, setParams]);

  // If URL says to show a specific ticket, make sure 'all' filter is active so it appears in the list.
  useEffect(() => {
    const incoming = params.get('ticket');
    if (incoming && incoming !== selectedId) setSelectedId(incoming);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    tickets.forEach((t) => { c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }, [tickets]);

  const handleReply = async () => {
    if (!selectedId || !replyText.trim() || sending) return;
    setSending(true);
    try {
      const r = await apiClient.post(`/webhook/support/admin/ticket/${selectedId}/reply`, {
        content: replyText.trim(),
        visibleToUser: !replyInternal,
      });
      if (!r.ok) throw new Error(await r.text());
      setReplyText('');
      setReplyInternal(false);
      await fetchDetail(selectedId);
      fetchList();
    } catch (e: any) {
      setError(e?.message || 'send failed');
    } finally {
      setSending(false);
    }
  };

  const handleStatus = async (status: string, note?: string) => {
    if (!selectedId) return;
    try {
      const r = await apiClient.post(`/webhook/support/admin/ticket/${selectedId}/status`, { status, note });
      if (!r.ok) throw new Error(await r.text());
      await fetchDetail(selectedId);
      fetchList();
    } catch (e: any) {
      setError(e?.message || 'status update failed');
    }
  };

  const selected = detail;

  const formatSec = (s: number | null): string => {
    if (s == null) return t('admin.support.time.dash');
    if (s < 60) return t('admin.support.time.seconds', { count: s });
    if (s < 3600) return t('admin.support.time.minutes_short', { count: Math.round(s / 60) });
    return t('admin.support.time.hours_short', { count: Number((s / 3600).toFixed(1)) });
  };
  const aiSharePercent = (() => {
    if (!stats || !stats.resolved_in_window) return null;
    return Math.round((stats.ai_only_in_window / stats.resolved_in_window) * 100);
  })();

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* KPI Bar */}
      {stats && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 flex-shrink-0">
          <span title="Escalated / Owner / AI">
            🚨 <b className="text-gray-900">{stats.active.escalated}</b>
            <span className="text-gray-400 mx-1">·</span>
            🛠 <b className="text-gray-900">{stats.active.owner_handling}</b>
            <span className="text-gray-400 mx-1">·</span>
            🤖 <b className="text-gray-900">{stats.active.ai_handling}</b>
          </span>
          <span className="[&_b]:text-gray-900">
            {t('admin.support.kpi_window', { days: 7, created: stats.created_in_window, resolved: stats.resolved_in_window })}
          </span>
          {aiSharePercent != null && (
            <span>{t('admin.support.kpi_ai_share', { percent: aiSharePercent })}</span>
          )}
          <span>{t('admin.support.kpi_first_reply', { value: formatSec(stats.avg_first_owner_reply_seconds) })}</span>
          <span>{t('admin.support.kpi_refunds', { count: stats.refund_count, sum: stats.refund_sum.toLocaleString() })}</span>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
      {/* LIST */}
      <div className={clsx(
        'md:w-80 md:flex-shrink-0 border-r border-gray-200 bg-white flex flex-col',
        selectedId && 'hidden md:flex',
      )}>
        <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={clsx(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                filter === f.id
                  ? 'bg-forest-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList && tickets.length === 0 ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-forest-600" /></div>
          ) : tickets.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-10 px-4">
              <Inbox className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              {t('admin.support.empty_state')}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tickets.map((ticket) => {
                const badge = STATUS_BADGE[ticket.status];
                return (
                  <li key={ticket.id}>
                    <button
                      onClick={() => setSelectedId(ticket.id)}
                      className={clsx(
                        'w-full text-left px-3 py-3 hover:bg-gray-50 transition-colors',
                        selectedId === ticket.id && 'bg-forest-50',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', badge.cls)}>{badge.label}</span>
                          {ticket.urgency && (
                            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', URGENCY_BADGE[ticket.urgency] || 'bg-gray-100 text-gray-600')}>
                              {ticket.urgency}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 flex-shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(ticket.updatedAt)}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {ticket.userName || `+${ticket.userId.slice(0, 1)} *** *** ${ticket.userId.slice(-2)}`}
                      </div>
                      {ticket.escalationReason && (
                        <div className="text-[11px] text-red-700 truncate mt-0.5">
                          ⚠ {ticket.escalationReason}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {ticket.lastMessage || t('admin.support.no_messages')}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">
                        {t('admin.support.message_count', { count: ticket.messageCount, tokens: ticket.userTokens.toLocaleString() })}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* DETAIL */}
      <div className={clsx('flex-1 flex flex-col min-w-0', !selectedId && 'hidden md:flex')}>
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm p-8 text-center">
            <Headphones className="w-10 h-10 mb-3 text-gray-300" />
            {t('admin.support.hint_select')}
            <div className="mt-4 text-xs text-gray-400">
              {t('admin.support.hint_counts', { escalated: counts.escalated || 0, owner: counts.owner_handling || 0, ai: counts.ai_handling || 0 })}
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setSelectedId(null)} className="md:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900 truncate">
                    {selected?.user?.profile_data?.name || selected?.ticket?.user_id || '...'}
                  </h2>
                  {selected?.ticket && (
                    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', STATUS_BADGE[selected.ticket.status]?.cls)}>
                      {STATUS_BADGE[selected.ticket.status]?.label}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400">
                  id: {selected?.ticket?.id?.slice(0, 8)} · {t('admin.support.tokens_unit', { value: Number(selected?.user?.tokens || 0).toLocaleString() })}
                  {selected?.user?.email && ` · ${selected.user.email}`}
                </div>
              </div>
              <div className="flex gap-1.5">
                {selected?.ticket?.status !== 'resolved' && (
                  <button
                    onClick={() => handleStatus('resolved')}
                    className="px-2.5 py-1.5 rounded-md bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium flex items-center gap-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t('admin.support.resolve')}
                  </button>
                )}
                {selected?.ticket?.status === 'owner_handling' && (
                  <button
                    onClick={() => handleStatus('ai_handling', t('admin.support.return_ai_note'))}
                    className="px-2.5 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium flex items-center gap-1"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    {t('admin.support.return_ai')}
                  </button>
                )}
              </div>
            </div>

            {/* AI notes */}
            {selected?.ticket?.notes && (
              <div className="px-4 py-2 bg-warm-50 border-b border-warm-100 text-xs text-warm-800">
                <div className="font-semibold mb-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> {t('admin.support.ai_note_title')}
                </div>
                <div className="whitespace-pre-wrap">{selected.ticket.notes}</div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-2.5">
              {loadingDetail && !selected ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-forest-600" /></div>
              ) : (
                selected?.messages.map((m) => {
                  const isUser = m.sender_type === 'user';
                  const isOwner = m.sender_type === 'owner';
                  const isAi = m.sender_type === 'ai';
                  const isSystem = m.sender_type === 'system';
                  if (isSystem) {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className={clsx(
                          'px-3 py-1.5 rounded-lg text-[11px] italic max-w-md text-center',
                          m.visible_to_user ? 'bg-gray-200 text-gray-600' : 'bg-amber-50 text-amber-800 border border-amber-200',
                        )}>
                          {!m.visible_to_user && '🔒 '}{m.content}
                        </div>
                      </div>
                    );
                  }
                  const bubble = isUser
                    ? 'bg-blue-100 text-gray-900 rounded-br-sm'
                    : isOwner
                      ? 'bg-forest-600 text-white rounded-bl-sm'
                      : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100';
                  return (
                    <div key={m.id} className={clsx('flex flex-col', isUser ? 'items-end' : 'items-start')}>
                      <div className="text-[10px] text-gray-500 mb-0.5 px-1 flex items-center gap-1">
                        {isAi && <><Bot className="w-3 h-3 text-forest-600" /> AI</>}
                        {isOwner && <><UserCircle2 className="w-3 h-3" /> {t('admin.support.sender_team')}</>}
                        {isUser && <>{t('admin.support.sender_user')}</>}
                        <span className="text-gray-400">· {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className={clsx('max-w-[80%] px-3 py-2 rounded-2xl shadow-sm', bubble)}>
                        <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply box */}
            <div className="bg-white border-t border-gray-200 p-3 flex-shrink-0">
              {error && (
                <div className="text-xs text-red-600 mb-2 px-1">{error}</div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value.slice(0, 4000))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply(); }}
                    placeholder={replyInternal ? t('admin.support.reply_placeholder_internal') : t('admin.support.reply_placeholder_user')}
                    rows={2}
                    className={clsx(
                      'w-full resize-none px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 max-h-40',
                      replyInternal ? 'border-amber-300 bg-amber-50' : 'border-gray-300',
                    )}
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-500 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replyInternal}
                      onChange={(e) => setReplyInternal(e.target.checked)}
                      className="w-3 h-3"
                    />
                    {t('admin.support.internal_note_label')}
                  </label>
                </div>
                <button
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  className="p-2.5 bg-forest-600 hover:bg-forest-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-full flex-shrink-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
};

export default AdminSupportView;
