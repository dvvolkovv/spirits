import React, { useState, useEffect } from 'react';
import { Send, Loader, RefreshCw, Clock, Mail, MessageSquare } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

type RetentionChannel = 'email' | 'sms' | 'no_channel';
interface RetentionDraft {
  user_id: string;
  phone: string | null;
  email: string | null;
  channel: RetentionChannel;
  language: string;
  subject: string | null;
  assistant_id?: string;
  assistant_name?: string | null;
  last_at: string;
  days_inactive?: number;
  hours_inactive?: number;
  message: string;
  last_sent_at: string | null;
  in_cooldown: boolean;
}
interface RetentionPreview {
  channel: 'mixed';
  campaign: string;
  window: { min_days?: number; max_days?: number; min_hours?: number; max_hours?: number };
  cooldown_days: number;
  count: number;
  summary: { email: number; sms: number; no_channel: number; skipped_unsubscribed: number };
  drafts: RetentionDraft[];
}
interface RetentionResultRow { log_error?: boolean }
type Mode = 'general' | 'curious';

const AdminRetentionView: React.FC = () => {
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState({ minDays: 2, maxDays: 30 });
  const [mode, setMode] = useState<Mode>('general');

  const load = async (preserveResult = false) => {
    setLoading(true);
    if (!preserveResult) setResult(null);
    setError(null);
    try {
      const body = mode === 'curious'
        ? { action: 'curious_preview' }
        : { action: 'preview', minDays: win.minDays, maxDays: win.maxDays };
      const r = await apiClient.post('/webhook/admin/retention', body);
      if (!r.ok) throw new Error(`Ошибка: ${r.status}`);
      setPreview(await r.json());
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Не удалось построить сегмент');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [win, mode]);

  const send = async (userIds?: string[], resend = false) => {
    if (loading || sending !== null) return;
    const all = preview?.drafts || [];
    const selected = userIds ? all.filter((d) => userIds.includes(d.user_id)) : all;
    const targets = selected.filter((d) => d.channel !== 'no_channel' && (resend || !d.in_cooldown));
    const emails = targets.filter((d) => d.channel === 'email').length;
    const sms = targets.filter((d) => d.channel === 'sms').length;
    if (!targets.length || !window.confirm(`Реальная отправка людям: ${emails} email и ${sms} SMS. Продолжить?`)) return;

    setSending(userIds?.length === 1 ? userIds[0] : 'all');
    setResult(null);
    setError(null);
    try {
      const body = mode === 'curious'
        ? { action: 'curious_send', confirm: true, ...(userIds ? { userIds } : {}), resend }
        : { action: 'send', confirm: true, ...(userIds ? { userIds } : {}), resend, minDays: win.minDays, maxDays: win.maxDays };
      const r = await apiClient.post('/webhook/admin/retention', body);
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || `Ошибка: ${r.status}`);
      const logErrors = (data.results || []).filter((row: RetentionResultRow) => row.log_error).length;
      setResult(
        `Отправлено: ${data.sent} · Email: ${data.sent_email} · SMS: ${data.sent_sms} · ошибок: ${data.failed} · ` +
        `пауза: ${data.skipped_cooldown} · отписка: ${data.skipped_unsubscribed} · нет канала: ${data.no_channel}` +
        (logErrors ? ` · без записи cooldown: ${logErrors} — не повторять` : ''),
      );
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отправки');
    } finally {
      setSending(null);
    }
  };

  const sendable = preview?.drafts.filter((d) => d.channel !== 'no_channel' && !d.in_cooldown) || [];
  const bulkEmails = sendable.filter((d) => d.channel === 'email').length;
  const bulkSms = sendable.filter((d) => d.channel === 'sms').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-forest-600" />Удержание · рассылка
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">email при известном адресе · SMS без email · отправка наружу — по подтверждению</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {([{ l: 'Общий', v: 'general' }, { l: 'Новые 24–48 ч', v: 'curious' }] as const).map((p) => (
                <button key={p.v} onClick={() => setMode(p.v)} disabled={loading || sending !== null} className={`min-h-11 px-3 py-2 text-xs rounded-md border transition-colors ${mode === p.v ? 'bg-warm-50 border-warm-300 text-warm-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{p.l}</button>
              ))}
              {mode === 'general' && ([{ l: '48ч+', m: 2 }, { l: '3–30 дн', m: 3 }] as const).map((p) => (
                <button key={p.m} onClick={() => setWin({ minDays: p.m, maxDays: 30 })} disabled={loading || sending !== null} className={`min-h-11 px-3 py-2 text-xs rounded-md border transition-colors ${win.minDays === p.m ? 'bg-forest-50 border-forest-300 text-forest-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{p.l}</button>
              ))}
              <button onClick={() => load()} disabled={loading || sending !== null} className="min-h-11 flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-forest-600 hover:bg-gray-50 rounded-md transition-colors disabled:opacity-50">
                <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />Обновить
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}
            {loading && !preview && <div className="flex items-center justify-center py-8"><Loader className="w-6 h-6 text-forest-600 animate-spin" /></div>}
            {preview && (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-gray-500">
                    {preview.count} получателей · email: {preview.summary.email} · SMS: {preview.summary.sms} · нет канала: {preview.summary.no_channel} · отписка: {preview.summary.skipped_unsubscribed} · пауза {preview.cooldown_days} дн · к отправке {bulkEmails} email и {bulkSms} SMS
                  </p>
                  <button data-testid="retention-send-all" onClick={() => send()} disabled={loading || sending !== null || !sendable.length} className="flex items-center gap-1.5 px-3 py-1.5 bg-warm-600 text-white rounded-lg hover:bg-warm-700 transition-colors text-sm disabled:opacity-50">
                    {sending === 'all' ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Отправить всем (без паузы)
                  </button>
                </div>
                {result && <div className="bg-green-50 border border-green-200 rounded p-2 text-green-700 text-xs">{result}</div>}
                {preview.count === 0 && <p className="text-sm text-gray-500 py-6 text-center">Сейчас получателей в окне нет.</p>}
                <div className="space-y-2">
                  {preview.drafts.map((d) => (
                    <div key={d.user_id} data-testid={`retention-row-${d.user_id}`} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="text-sm font-medium text-gray-800">
                          <span className="inline-flex items-center gap-1 mr-2">
                            {d.channel === 'email' ? <Mail className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                            {d.channel === 'no_channel' ? 'нет канала' : d.channel}
                          </span>
                          {d.email || d.phone || d.user_id}
                          <span className="text-gray-400 font-normal"> · {d.language}</span>
                          {d.assistant_name && <span className="text-gray-400 font-normal"> · {d.assistant_name}</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{d.hours_inactive != null ? `${d.hours_inactive}ч` : `${d.days_inactive} дн`}</span>
                          {d.in_cooldown && <span className="text-xs text-amber-600" title={d.last_sent_at || ''}>пауза</span>}
                          <button data-testid={`retention-send-${d.user_id}`} onClick={() => send([d.user_id], d.in_cooldown)} disabled={loading || sending !== null || d.channel === 'no_channel'} className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-forest-300 text-forest-700 hover:bg-forest-50 disabled:opacity-50">
                            {sending === d.user_id ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            {d.in_cooldown ? 'Повторить' : 'Отправить'}
                          </button>
                        </div>
                      </div>
                      {d.subject && <p className="text-xs font-medium text-gray-700 mb-1">{d.subject}</p>}
                      {d.message && <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap">{d.message}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRetentionView;
