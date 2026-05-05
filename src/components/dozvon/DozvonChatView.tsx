import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, Plus, Trash2, Play, Loader, Send, MessageCircle, Paperclip, Search } from 'lucide-react';
import { clsx } from 'clsx';
import * as XLSX from 'xlsx';
import { apiClient } from '../../services/apiClient';

interface Campaign {
  id: number;
  title: string;
  status: 'planning' | 'ready' | 'draft' | 'running' | 'scheduled' | 'done' | 'failed' | 'paused';
  task_text: string | null;
  call_plan: { goal?: string; calls: Array<{ name: string; phone: string; script_hint?: string }>; notes?: string } | null;
  summary: any;
  created_at: string;
  updated_at: string;
  total_calls: number;
  done_calls: number;
  last_message_preview: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const StatusBadge: React.FC<{ status: Campaign['status'] }> = ({ status }) => {
  const map: Record<Campaign['status'], { label: string; cls: string }> = {
    planning:  { label: 'Планирование', cls: 'bg-blue-100 text-blue-700' },
    ready:     { label: 'План готов',    cls: 'bg-violet-100 text-violet-700' },
    draft:     { label: 'Черновик',      cls: 'bg-gray-100 text-gray-600' },
    running:   { label: 'Обзвон',        cls: 'bg-amber-100 text-amber-800 animate-pulse' },
    scheduled: { label: 'Запланирован',  cls: 'bg-sky-100 text-sky-700' },
    done:      { label: 'Готово',        cls: 'bg-green-100 text-green-700' },
    failed:    { label: 'Ошибка',        cls: 'bg-red-100 text-red-700' },
    paused:    { label: 'Пауза',         cls: 'bg-yellow-100 text-yellow-800' },
  };
  const m = map[status] || map.draft;
  return <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', m.cls)}>{m.label}</span>;
};

// Парсер inline-маркера [[CAMPAIGN_PLAN]]{...}[[/CAMPAIGN_PLAN]].
// Возвращает части: текст до плана, сам plan JSON (или null), текст после.
const parsePlanMarker = (text: string) => {
  const re = /\[\[CAMPAIGN_PLAN\]\]([\s\S]*?)\[\[\/CAMPAIGN_PLAN\]\]/;
  const m = text.match(re);
  if (!m) return { before: text, plan: null as any, after: '' };
  const before = text.slice(0, m.index);
  const after = text.slice((m.index || 0) + m[0].length);
  try {
    return { before, plan: JSON.parse(m[1].trim()), after };
  } catch {
    return { before: text, plan: null, after: '' };
  }
};

const DozvonChatView: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [pricing, setPricing] = useState<{ setup_fee: number; per_minute_fee: number } | null>(null);
  const [insufficientMsg, setInsufficientMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Авто-рост textarea под содержимое (до 320px, затем появляется scroll).
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
  }, [input]);

  const loadCampaigns = useCallback(async () => {
    const r = await apiClient.get('/webhook/dozvon/campaigns');
    if (!r.ok) return;
    const rows = await r.json();
    setCampaigns(Array.isArray(rows) ? rows : []);
  }, []);

  const loadHistory = useCallback(async (campaignId: number) => {
    const r = await apiClient.get(`/webhook/dozvon/campaigns/${campaignId}/history`);
    if (!r.ok) return;
    const rows = await r.json();
    setMessages(Array.isArray(rows) ? rows : []);
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => {
    apiClient.get('/webhook/dozvon/pricing').then(async (r) => {
      if (r.ok) setPricing(await r.json());
    }).catch(() => {/* ignore */});
  }, []);
  useEffect(() => {
    // При смене треда: сбрасываем состояние стриминга и показ инпута,
    // чтобы уже летящие дельты предыдущей кампании не попали в новый чат.
    setStreamingText('');
    setSearchQuery(null);
    setMessages([]);
    if (selectedId != null) loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  // Poll list + history (пока running / ждём план) для live-обновлений.
  useEffect(() => {
    const id = setInterval(() => {
      loadCampaigns();
      if (selectedId != null) {
        const c = campaigns.find((x) => x.id === selectedId);
        if (c && ['running', 'planning', 'ready'].includes(c.status)) loadHistory(selectedId);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [loadCampaigns, loadHistory, selectedId, campaigns]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingText]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedId) || null;

  const handleNew = async () => {
    const r = await apiClient.post('/webhook/dozvon/campaigns', {});
    if (!r.ok) return;
    const c = await r.json();
    await loadCampaigns();
    setSelectedId(c.id);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить задачу?')) return;
    await apiClient.delete(`/webhook/dozvon/campaigns/${id}`);
    if (selectedId === id) setSelectedId(null);
    loadCampaigns();
  };

  const handleFile = async (file: File) => {
    if (selectedId == null) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    let extracted: Array<{ name?: string; phone?: string; [k: string]: any }> = [];
    try {
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
        // Нормализуем: ищем поля с телефоном/именем.
        const phoneKeys = ['phone', 'телефон', 'номер', 'tel', 'mobile'];
        const nameKeys  = ['name', 'имя', 'название', 'компания', 'организация', 'контакт'];
        const pickKey = (row: any, keys: string[]) => {
          for (const k of Object.keys(row)) {
            if (keys.some((w) => k.toLowerCase().includes(w))) return row[k];
          }
          return null;
        };
        extracted = rows.map((r) => ({
          name: String(pickKey(r, nameKeys) || '').trim() || undefined,
          phone: String(pickKey(r, phoneKeys) || '').trim() || undefined,
        })).filter((r) => r.phone);
      } else if (ext === 'txt') {
        const text = await file.text();
        // Простой парс: каждая строка, пытаемся найти телефон и имя.
        extracted = text.split(/\r?\n/).map((line) => {
          const phoneMatch = line.match(/\+?\d[\d\s\-()]{8,}/);
          return {
            phone: phoneMatch ? phoneMatch[0].replace(/[\s\-()]/g, '') : undefined,
            name: phoneMatch ? line.replace(phoneMatch[0], '').replace(/[,;:—–-]\s*/g, ' ').trim() : line.trim(),
          };
        }).filter((r) => r.phone);
      }
    } catch (e: any) {
      alert(`Ошибка чтения файла: ${e.message}`);
      return;
    }

    const preview = extracted.slice(0, 20).map((r, i) =>
      `${i + 1}. ${r.name || '—'} — ${r.phone || '—'}`).join('\n');
    const msg = `📎 Прикреплён файл "${file.name}" (найдено ${extracted.length} контактов):\n${preview}${extracted.length > 20 ? `\n…и ещё ${extracted.length - 20}` : ''}`;
    setInput(msg);
    fileInputRef.current && (fileInputRef.current.value = '');
  };

  // Следим за тем, какой чат сейчас открыт — для отмены UI-апдейтов стрима,
  // когда юзер переключился на другую кампанию пока LLM стримит.
  const activeCampaignRef = useRef<number | null>(null);
  useEffect(() => { activeCampaignRef.current = selectedId; }, [selectedId]);

  const handleSend = async () => {
    if (!input.trim() || selectedId == null) return;
    const campaignAtStart = selectedId;
    const isActive = () => activeCampaignRef.current === campaignAtStart;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setSending(true);
    setStreamingText('');
    setSearchQuery(null);

    try {
      const reader = await apiClient.fetchStream(`/webhook/dozvon/campaigns/${campaignAtStart}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      if (!reader) throw new Error('no stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'delta' && ev.text) {
              accumulated += ev.text;
              if (isActive()) setStreamingText(accumulated);
            } else if (ev.type === 'tool' && ev.name === 'web_search') {
              if (isActive()) setSearchQuery(ev.query || '…');
            } else if (ev.type === 'done') {
              if (isActive()) {
                setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }]);
                setStreamingText('');
                setSearchQuery(null);
                await loadHistory(campaignAtStart);
              }
              await loadCampaigns();
            } else if (ev.type === 'error' && ev.text) {
              if (isActive()) {
                setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ Ошибка: ${ev.text}` }]);
                setStreamingText('');
                setSearchQuery(null);
              }
            }
          } catch { /* ignore partial chunks */ }
        }
      }
    } catch (e: any) {
      if (isActive()) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${e.message || 'Ошибка соединения'}` }]);
      }
    } finally {
      if (isActive()) setSending(false);
    }
  };

  const handleExecute = async () => {
    if (selectedId == null) return;
    setExecuting(true);
    setInsufficientMsg(null);
    try {
      const r = await apiClient.post(`/webhook/dozvon/campaigns/${selectedId}/execute`, {});
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const text = err.error || err.message || 'Не удалось запустить обзвон';
        // 400 "Недостаточно токенов" → модалка с кнопкой «Пополнить».
        if (r.status === 400 && /недостаточно токенов/i.test(String(text))) {
          setInsufficientMsg(String(text));
        } else {
          alert(text);
        }
      } else {
        await loadCampaigns();
        await loadHistory(selectedId);
      }
    } finally {
      setExecuting(false);
    }
  };

  // Из последнего assistant-сообщения или из campaign.call_plan достаём план для inline-карточки.
  const inlinePlan: Campaign['call_plan'] = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'assistant') continue;
      const { plan } = parsePlanMarker(messages[i].content);
      if (plan?.calls) return plan;
      break;
    }
    return selectedCampaign?.call_plan || null;
  })();

  return (
    <div className="h-screen flex flex-col md:flex-row bg-gray-50 overflow-hidden">
      {/* Sidebar: список задач */}
      <aside className={clsx(
        'border-r border-gray-200 bg-white flex-shrink-0 flex flex-col overflow-hidden',
        selectedId != null ? 'hidden md:flex md:w-80' : 'flex w-full md:w-80',
      )}>
        <div className="px-4 py-4 border-b flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Phone className="w-5 h-5 text-forest-600" /> Обзвон
          </h1>
          <button
            onClick={handleNew}
            className="flex items-center gap-1 px-3 py-1.5 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-sm"
          >
            <Plus className="w-4 h-4" /> Новая
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {campaigns.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-500">
              Пока нет задач. Нажмите «Новая».
            </div>
          )}
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={clsx(
                'w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors',
                selectedId === c.id && 'bg-forest-50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-900 flex-1 truncate">{c.title}</p>
                <StatusBadge status={c.status} />
              </div>
              {c.last_message_preview && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.last_message_preview}</p>
              )}
              {c.total_calls > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {c.done_calls}/{c.total_calls} звонков
                </p>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Main: чат задачи */}
      <main className={clsx(
        'flex-1 flex flex-col min-w-0',
        selectedId == null ? 'hidden md:flex' : 'flex',
      )}>
        {selectedCampaign ? (
          <>
            <header className="bg-white border-b px-4 py-3 flex items-center justify-between gap-2">
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden text-forest-600 text-sm"
              >
                ← Все задачи
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">{selectedCampaign.title}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={selectedCampaign.status} />
                  {selectedCampaign.total_calls > 0 && (
                    <span className="text-xs text-gray-500">
                      {selectedCampaign.done_calls}/{selectedCampaign.total_calls}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(selectedCampaign.id)}
                className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                title="Удалить задачу"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && !streamingText && (
                <div className="text-center text-sm text-gray-500 mt-8">
                  Опишите задачу обзвона: «Найди 5 автосервисов в Москве по ремонту BMW X5 и узнай сроки», или пришлите готовый список контактов.
                </div>
              )}
              {messages.map((m, i) => (
                <MessageBubble key={i} msg={m} onExecute={handleExecute} executing={executing} status={selectedCampaign.status} />
              ))}
              {searchQuery && !streamingText && (
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 w-fit">
                  <Search className="w-4 h-4 animate-pulse text-blue-600" />
                  Ищу: «{searchQuery}»…
                </div>
              )}
              {streamingText && (
                <MessageBubble msg={{ role: 'assistant', content: streamingText }} streaming />
              )}
            </div>

            {/* Inline plan card — если есть готовый план и статус planning/ready */}
            {inlinePlan?.calls?.length && selectedCampaign.status !== 'running' && selectedCampaign.status !== 'done' && (
              <div className="bg-violet-50 border-t border-violet-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-violet-900">
                      План обзвона: {inlinePlan.calls.length} {inlinePlan.calls.length === 1 ? 'звонок' : 'звонков'}
                    </p>
                    {inlinePlan.goal && <p className="text-xs text-violet-700 truncate">{inlinePlan.goal}</p>}
                    {pricing && (
                      <p className="text-xs text-violet-600 mt-1">
                        Тариф: {pricing.setup_fee.toLocaleString('ru')} + {pricing.per_minute_fee.toLocaleString('ru')}/мин ·
                        &nbsp;ориентировочно {((pricing.setup_fee + pricing.per_minute_fee) * inlinePlan.calls.length).toLocaleString('ru')}–
                        {((pricing.setup_fee + 3 * pricing.per_minute_fee) * inlinePlan.calls.length).toLocaleString('ru')} токенов
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleExecute}
                    disabled={executing || selectedCampaign.status === 'running'}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                  >
                    {executing ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Запустить обзвон
                  </button>
                </div>
              </div>
            )}

            {insufficientMsg && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
                   onClick={() => setInsufficientMsg(null)}>
                <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Недостаточно токенов</h3>
                  <p className="text-sm text-gray-600 mb-5">{insufficientMsg}</p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setInsufficientMsg(null)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
                    >
                      Закрыть
                    </button>
                    <button
                      onClick={() => { setInsufficientMsg(null); window.location.href = '/chat?view=tokens'; }}
                      className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-sm font-medium"
                    >
                      Пополнить
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border-t p-3 flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Прикрепить файл с контактами (xlsx/csv/txt)"
                className="p-2 text-gray-500 hover:text-forest-600 rounded-lg hover:bg-forest-50 disabled:opacity-50"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Опишите задачу или прикрепите список контактов…"
                rows={1}
                className="flex-1 resize-none px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent overflow-y-auto"
                style={{ maxHeight: 320 }}
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg disabled:opacity-60 flex items-center gap-1"
              >
                {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Выберите задачу или создайте новую</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ─── Message bubble ─────────────────────────────────────────────────

/**
 * Рендер простого markdown: **bold**, [text](url), переносы.
 * Не полноценный парсер — только то что бот реально шлёт.
 */
const renderInline = (text: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={i++}>{m[1]}</strong>);
    else if (m[2] && m[3]) out.push(
      <a key={i++} href={m[3]} target="_blank" rel="noreferrer"
         className="text-forest-700 underline hover:text-forest-900">{m[2]}</a>,
    );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const MessageBubble: React.FC<{
  msg: ChatMessage;
  streaming?: boolean;
  onExecute?: () => void;
  executing?: boolean;
  status?: Campaign['status'];
}> = ({ msg, streaming }) => {
  const { before, plan, after } = parsePlanMarker(msg.content);
  const isUser = msg.role === 'user';
  const isCallResult = /^[✅❌📵⏳ℹ️]/.test(msg.content);
  const isSystem = isCallResult || msg.content.startsWith('▶️') || msg.content.startsWith('📞');
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Для системного сообщения о завершённом звонке: вытаскиваем «Диалог:» в
  // collapsible-блок, остальное (резюме + ссылка на запись) показываем сразу.
  let visibleContent = before;
  let dialogContent: string | null = null;
  if (!plan && isCallResult) {
    const m = before.match(/([\s\S]*?)\n\n\*\*Диалог:\*\*\n([\s\S]*?)(?=\n\n🎧|$)/);
    if (m) {
      visibleContent = before.replace(m[0], m[1] || '') +
        before.slice((m.index || 0) + m[0].length);
      dialogContent = m[2].trim();
    }
  }

  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={clsx(
        'max-w-[85%] rounded-2xl px-4 py-2 text-sm',
        isUser ? 'bg-forest-600 text-white' :
        isSystem ? 'bg-amber-50 border border-amber-200 text-gray-800' :
        'bg-white border border-gray-200 text-gray-800',
      )}>
        {visibleContent && <div className="whitespace-pre-wrap">{renderInline(visibleContent)}</div>}
        {dialogContent && (
          <div className="mt-2">
            <button
              onClick={() => setDialogOpen((v) => !v)}
              className="text-xs text-forest-700 underline hover:text-forest-900"
            >
              {dialogOpen ? 'Скрыть диалог ▲' : 'Показать диалог ▼'}
            </button>
            {dialogOpen && (
              <pre className="mt-2 text-xs bg-white/60 border border-gray-200 rounded p-2 whitespace-pre-wrap font-sans text-gray-700 leading-relaxed">
                {dialogContent}
              </pre>
            )}
          </div>
        )}
        {plan?.calls && (
          <div className="mt-2 border-t border-gray-200 pt-2 space-y-1">
            <p className="text-xs font-semibold text-gray-600">
              {plan.goal || 'План'} ({plan.calls.length})
            </p>
            <ul className="text-xs text-gray-700 space-y-0.5">
              {plan.calls.slice(0, 10).map((c: any, i: number) => (
                <li key={i}>• <strong>{c.name}</strong> — {c.phone}</li>
              ))}
              {plan.calls.length > 10 && (
                <li className="text-gray-500">…и ещё {plan.calls.length - 10}</li>
              )}
            </ul>
          </div>
        )}
        {after && <div className="whitespace-pre-wrap">{renderInline(after)}</div>}
        {streaming && <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-1" />}
      </div>
    </div>
  );
};

export default DozvonChatView;
