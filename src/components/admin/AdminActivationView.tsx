import React, { useState, useEffect } from 'react';
import { Send, Loader, RefreshCw, Clock } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

// Activation outreach (backlog c45c71df). Нудж новичкам, которые
// зарегистрировались, но ни разу не написали. preview строит черновики
// (ничего не шлёт); отправка наружу — через confirm-диалог (реальная рассылка).
interface ActivationDraft {
  phone: string;
  preferred_agent: string | null;
  assistant_name: string | null;
  created_at: string;
  hours_since_reg: number;
  message: string;
  last_sent_at: string | null;
  in_cooldown: boolean;
}
interface ActivationPreview {
  channel: string;
  campaign: string;
  window: { min_hours: number; max_days: number };
  cooldown_days: number;
  count: number;
  drafts: ActivationDraft[];
}

const AdminActivationView: React.FC = () => {
  const [preview, setPreview] = useState<ActivationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null); // phone | 'all'
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await apiClient.post('/webhook/admin/activation', { action: 'preview' });
      if (!r.ok) throw new Error(`Ошибка: ${r.status}`);
      setPreview(await r.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось построить сегмент');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const send = async (phones?: string[], resend = false) => {
    const newCount = preview?.drafts.filter((d) => !d.in_cooldown).length || 0;
    const who = phones ? 'выбранному пользователю' : `${newCount} пользователям (вне cooldown)`;
    if (!window.confirm(`Отправить SMS ${who}? Это реальная отправка сообщений людям.`)) return;
    setSending(phones && phones.length === 1 ? phones[0] : 'all');
    setResult(null);
    setError(null);
    try {
      const r = await apiClient.post('/webhook/admin/activation', { action: 'send', confirm: true, phones, resend });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || `Ошибка: ${r.status}`);
      setResult(`Отправлено: ${data.sent} · ошибок: ${data.failed} · пропущено (cooldown): ${data.skipped_cooldown}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отправки');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 flex items-center justify-between border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-forest-600" />
                Активация
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                новички без первого чата · вежливый нудж по SMS · отправка наружу — по подтверждению
              </p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-forest-600 hover:bg-gray-50 rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
              Обновить
            </button>
          </div>

          <div className="p-4 space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
            )}
            {loading && !preview && (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-6 h-6 text-forest-600 animate-spin" />
              </div>
            )}
            {preview && (
              <>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-gray-500">
                    {preview.count} новичков без первого чата · рег ≥{preview.window.min_hours}ч, ≤{preview.window.max_days}д ·
                    канал SMS · cooldown {preview.cooldown_days} дн · проверьте тексты перед отправкой
                  </p>
                  <button
                    onClick={() => send()}
                    disabled={sending !== null || preview.drafts.every((d) => d.in_cooldown)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-warm-600 text-white rounded-lg hover:bg-warm-700 transition-colors text-sm disabled:opacity-50"
                  >
                    {sending === 'all' ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Отправить всем (вне cooldown)
                  </button>
                </div>
                {result && (
                  <div className="bg-green-50 border border-green-200 rounded p-2 text-green-700 text-xs">{result}</div>
                )}
                {preview.count === 0 && (
                  <p className="text-sm text-gray-500 py-6 text-center">Сейчас новичков без первого чата в окне нет.</p>
                )}
                <div className="space-y-2">
                  {preview.drafts.map((d) => (
                    <div key={d.phone} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="text-sm font-medium text-gray-800">
                          {d.phone}
                          {d.assistant_name && <span className="text-gray-400 font-normal"> · {d.assistant_name}</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{d.hours_since_reg} ч
                          </span>
                          {d.in_cooldown && (
                            <span className="text-[10px] text-amber-600" title={d.last_sent_at || ''}>cooldown</span>
                          )}
                          <button
                            onClick={() => send([d.phone], d.in_cooldown)}
                            disabled={sending !== null}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-forest-300 text-forest-700 hover:bg-forest-50 disabled:opacity-50"
                          >
                            {sending === d.phone ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            {d.in_cooldown ? 'Повторить' : 'Отправить'}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap">{d.message}</p>
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

export default AdminActivationView;
