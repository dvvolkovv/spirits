import React, { useState, useEffect, useCallback } from 'react';
import {
  Phone, Plus, Trash2, Play, Clock, CheckCircle, XCircle,
  Loader, User, Settings, RefreshCw, Sparkles, Save, ChevronRight,
  PhoneCall, AlignLeft, Volume2, Calendar, Square
} from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: number;
  task_text: string;
  status: 'draft' | 'running' | 'paused' | 'done' | 'failed';
  call_plan: any;
  summary: any;
  voice_id: string | null;
  system_prompt: string | null;
  scheduled_at: string | null;
  created_at: string;
}

interface Call {
  id: number;
  business_name: string;
  phone_number: string;
  status: 'pending' | 'calling' | 'completed' | 'failed';
  transcript: string | null;
  summary: string | null;
  created_at: string;
}

interface Contact {
  id: number;
  name: string;
  phone: string;
  notes: string | null;
  created_at: string;
}

interface Voice {
  voice_id: string;
  name: string;
  preview_url: string | null;
}

interface DozvonSettings {
  voice_id: string;
  system_prompt: string | null;
  agent_name: string;
}

type Tab = 'campaigns' | 'contacts' | 'settings';

// ─── Status helpers ────────────────────────────────────────────────────────────

const CampaignStatusBadge: React.FC<{ status: Campaign['status'] }> = ({ status }) => {
  const map: Record<Campaign['status'], { label: string; cls: string }> = {
    draft:   { label: 'Черновик', cls: 'bg-gray-100 text-gray-600' },
    running: { label: 'Выполняется', cls: 'bg-blue-100 text-blue-700' },
    paused:  { label: 'Пауза', cls: 'bg-yellow-100 text-yellow-700' },
    done:    { label: 'Завершена', cls: 'bg-green-100 text-green-700' },
    failed:  { label: 'Ошибка', cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', cls)}>{label}</span>;
};

const CallStatusIcon: React.FC<{ status: Call['status'] }> = ({ status }) => {
  if (status === 'completed') return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === 'failed')    return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === 'calling')   return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
  return <Clock className="w-4 h-4 text-gray-400" />;
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ─── Campaigns Tab ────────────────────────────────────────────────────────────

const CampaignsTab: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  // New campaign form state
  const [taskText, setTaskText] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/webhook/dozvon/campaigns');
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch {
      setError('Ошибка загрузки кампаний');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCalls = useCallback(async (id: number) => {
    const res = await apiClient.get(`/webhook/dozvon/campaigns/${id}`);
    const data = await res.json();
    setCalls(Array.isArray(data.calls) ? data.calls : []);
    // Refresh campaign status
    if (data.id) {
      setCampaigns(prev => prev.map(c => c.id === data.id ? data : c));
      setSelected(data);
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  useEffect(() => {
    if (!selected) return;
    loadCalls(selected.id);
    // Poll if running
    if (selected.status === 'running') {
      const t = setInterval(() => loadCalls(selected.id), 5000);
      return () => clearInterval(t);
    }
  }, [selected?.id, selected?.status]);

  const handleCreate = async () => {
    if (!taskText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.post('/webhook/dozvon/campaigns', { task_text: taskText.trim() });
      const data = await res.json();
      if (data.id) {
        setCampaigns(prev => [data, ...prev]);
        setTaskText('');
        setShowNewForm(false);
        setSelected(data);
      } else {
        throw new Error(data.message || 'Ошибка создания');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания кампании');
    } finally {
      setSaving(false);
    }
  };

  const handleExecute = async (c: Campaign) => {
    setError(null);
    try {
      const res = await apiClient.post(`/webhook/dozvon/campaigns/${c.id}/execute`, {});
      if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
      await loadCampaigns();
      setSelected(prev => prev?.id === c.id ? { ...prev, status: 'running' } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка запуска');
    }
  };

  const handleSchedule = async (c: Campaign) => {
    if (!scheduledAt) return;
    setError(null);
    try {
      const res = await apiClient.post(`/webhook/dozvon/campaigns/${c.id}/schedule`, { scheduled_at: scheduledAt });
      if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка планирования');
    }
  };

  const handleDelete = async (c: Campaign) => {
    if (!confirm(`Удалить кампанию "${c.task_text.slice(0, 40)}..."?`)) return;
    try {
      await apiClient.delete(`/webhook/dozvon/campaigns/${c.id}`);
      setCampaigns(prev => prev.filter(x => x.id !== c.id));
      if (selected?.id === c.id) setSelected(null);
    } catch {
      setError('Ошибка удаления');
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel: campaign list */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Кампании</span>
          <div className="flex gap-1">
            <button onClick={loadCampaigns} className="p-1.5 hover:bg-gray-100 rounded">
              <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <button
              onClick={() => { setShowNewForm(true); setSelected(null); }}
              className="p-1.5 bg-forest-600 hover:bg-forest-700 rounded text-white"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Нет кампаний</p>
          ) : campaigns.map(c => (
            <button
              key={c.id}
              onClick={() => { setSelected(c); setShowNewForm(false); }}
              className={clsx(
                'w-full text-left px-3 py-2.5 rounded-lg transition-colors group',
                selected?.id === c.id ? 'bg-forest-50 border border-forest-200' : 'hover:bg-gray-50'
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="text-sm text-gray-800 line-clamp-2 flex-1">{c.task_text}</p>
                <CampaignStatusBadge status={c.status} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{formatDate(c.created_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {showNewForm ? (
          <div className="p-6 max-w-2xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Phone className="w-5 h-5 text-forest-600" />
              Новая кампания обзвона
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Задача для AI-агента
                </label>
                <textarea
                  value={taskText}
                  onChange={e => setTaskText(e.target.value)}
                  rows={4}
                  placeholder="Например: Найди кузовной ремонт BMW X5 в Москве, запишись на завтра до полудня, узнай стоимость и адрес"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent text-sm resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">AI составит план звонков и подготовит скрипт автоматически</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={saving || !taskText.trim()}
                  className="px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-sm"
                >
                  {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Создать кампанию
                </button>
                <button
                  onClick={() => setShowNewForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : selected ? (
          <div className="p-6">
            {/* Campaign header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <CampaignStatusBadge status={selected.status} />
                  <span className="text-xs text-gray-400">{formatDate(selected.created_at)}</span>
                </div>
                <h2 className="text-base font-semibold text-gray-900">{selected.task_text}</h2>
              </div>
              <button
                onClick={() => handleDelete(selected)}
                className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Actions */}
            {(selected.status === 'draft' || selected.status === 'paused') && (
              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  onClick={() => handleExecute(selected)}
                  className="px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors flex items-center gap-1.5 text-sm"
                >
                  <Play className="w-4 h-4" />
                  Запустить сейчас
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => handleSchedule(selected)}
                    disabled={!scheduledAt}
                    className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 text-sm disabled:opacity-40"
                  >
                    <Calendar className="w-4 h-4" />
                    По расписанию
                  </button>
                </div>
              </div>
            )}

            {/* Call plan */}
            {selected.call_plan?.businesses?.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <AlignLeft className="w-4 h-4 text-gray-400" />
                  План обзвона ({selected.call_plan.businesses.length} контактов)
                </h3>
                <div className="bg-gray-50 rounded-lg divide-y divide-gray-100">
                  {selected.call_plan.businesses.map((b: any, i: number) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{b.name}</p>
                        <p className="text-xs text-gray-500">{b.phone}</p>
                      </div>
                      {b.reason && <p className="text-xs text-gray-400 max-w-xs text-right">{b.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Calls */}
            {calls.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <PhoneCall className="w-4 h-4 text-gray-400" />
                  Звонки
                </h3>
                <div className="space-y-2">
                  {calls.map(call => (
                    <CallCard key={call.id} call={call} />
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            {selected.summary && (
              <div className="mb-6 p-4 bg-forest-50 border border-forest-100 rounded-lg">
                <h3 className="text-sm font-semibold text-forest-800 mb-2">Итоги кампании</h3>
                <p className="text-sm text-forest-900 whitespace-pre-wrap">
                  {typeof selected.summary === 'string' ? selected.summary : JSON.stringify(selected.summary, null, 2)}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Выберите кампанию или создайте новую</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CallCard: React.FC<{ call: Call }> = ({ call }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
      >
        <CallStatusIcon status={call.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{call.business_name}</p>
          <p className="text-xs text-gray-400">{call.phone_number}</p>
        </div>
        <ChevronRight className={clsx('w-4 h-4 text-gray-300 transition-transform', expanded && 'rotate-90')} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {call.summary && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Итог</p>
              <p className="text-sm text-gray-700">{call.summary}</p>
            </div>
          )}
          {call.transcript && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Транскрипт</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2 max-h-48 overflow-y-auto font-sans">
                {call.transcript}
              </pre>
            </div>
          )}
          {!call.summary && !call.transcript && (
            <p className="text-xs text-gray-400 italic">Звонок ещё не завершён</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Contacts Tab ─────────────────────────────────────────────────────────────

const ContactsTab: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get('/webhook/dozvon/contacts');
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch {
      setError('Ошибка загрузки');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditContact(null);
    setName(''); setPhone(''); setNotes('');
    setShowForm(true);
  };

  const openEdit = (c: Contact) => {
    setEditContact(c);
    setName(c.name); setPhone(c.phone); setNotes(c.notes ?? '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let res;
      if (editContact) {
        res = await apiClient.put(`/webhook/dozvon/contacts/${editContact.id}`, { name: name.trim(), phone: phone.trim(), notes: notes || null });
      } else {
        res = await apiClient.post('/webhook/dozvon/contacts', { name: name.trim(), phone: phone.trim(), notes: notes || null });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Contact) => {
    if (!confirm(`Удалить контакт "${c.name}"?`)) return;
    await apiClient.delete(`/webhook/dozvon/contacts/${c.id}`);
    setContacts(prev => prev.filter(x => x.id !== c.id));
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Контакты ({contacts.length})</h2>
          <button
            onClick={openCreate}
            className="px-3 py-1.5 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors flex items-center gap-1.5 text-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        {showForm && (
          <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-white space-y-3">
            <h3 className="text-sm font-medium text-gray-800">{editContact ? 'Редактировать' : 'Новый контакт'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Имя / Компания</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="ООО Автосервис" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Телефон</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+79001234567" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-transparent" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Заметки</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Необязательно" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-transparent" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving || !name.trim() || !phone.trim()} className="px-3 py-1.5 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors text-sm disabled:opacity-50 flex items-center gap-1.5">
                {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Сохранить
              </button>
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">Отмена</button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <User className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Нет контактов</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.phone}{c.notes ? ` · ${c.notes}` : ''}</p>
                </div>
                <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400">
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(c)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Settings Tab ─────────────────────────────────────────────────────────────

const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<DozvonSettings>({ voice_id: 'default', system_prompt: null, agent_name: 'Алина' });
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [taskDesc, setTaskDesc] = useState('');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const [audioRef] = useState<{ current: HTMLAudioElement | null }>({ current: null });

  const handlePreview = async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // If already playing this voice, stop it
    if (playingVoice === voiceId && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoice(null);
      return;
    }

    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoice(null);
    }

    setLoadingVoice(voiceId);
    try {
      const res = await apiClient.get(`/webhook/dozvon/voices/preview/${voiceId}`);
      if (!res.ok) throw new Error('Preview failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingVoice(null);
        audioRef.current = null;
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setPlayingVoice(null);
        audioRef.current = null;
        URL.revokeObjectURL(url);
      };
      await audio.play();
      setPlayingVoice(voiceId);
    } catch {
      setError('Ошибка воспроизведения голоса');
    } finally {
      setLoadingVoice(null);
    }
  };

  useEffect(() => {
    Promise.all([
      apiClient.get('/webhook/dozvon/settings').then(r => r.json()),
      apiClient.get('/webhook/dozvon/voices').then(r => r.json()),
    ]).then(([s, v]) => {
      setSettings(s);
      setVoices(Array.isArray(v) ? v : []);
    }).catch(() => setError('Ошибка загрузки настроек')).finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.put('/webhook/dozvon/settings', settings);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!taskDesc.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post('/webhook/dozvon/generate-prompt', {
        task_description: taskDesc.trim(),
        agent_name: settings.agent_name,
      });
      const data = await res.json();
      if (data.system_prompt) {
        setSettings(s => ({ ...s, system_prompt: data.system_prompt }));
      }
    } catch {
      setError('Ошибка генерации промпта');
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader className="w-5 h-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-xl space-y-6">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        {/* Agent name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Имя агента</label>
          <input
            value={settings.agent_name}
            onChange={e => {
              const newName = e.target.value;
              setSettings(s => {
                const updated = { ...s, agent_name: newName };
                // Auto-replace old name in system prompt
                if (s.system_prompt && s.agent_name && newName) {
                  updated.system_prompt = s.system_prompt
                    .replace(new RegExp(s.agent_name, 'g'), newName);
                }
                return updated;
              });
            }}
            placeholder="Алина"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-transparent"
          />
        </div>

        {/* Voice selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-gray-400" />
            Голос агента
          </label>
          {voices.length === 0 ? (
            <p className="text-sm text-gray-400">Нет доступных голосов</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {voices.map(v => (
                <div
                  key={v.voice_id}
                  onClick={() => setSettings(s => ({ ...s, voice_id: v.voice_id }))}
                  className={clsx(
                    'text-left px-3 py-2.5 rounded-lg border transition-colors text-sm cursor-pointer flex items-center gap-2',
                    settings.voice_id === v.voice_id
                      ? 'border-forest-400 bg-forest-50 text-forest-800'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  )}
                >
                  <button
                    onClick={(e) => handlePreview(v.voice_id, e)}
                    disabled={loadingVoice === v.voice_id}
                    className={clsx(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                      playingVoice === v.voice_id
                        ? 'bg-forest-500 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-forest-100 hover:text-forest-600'
                    )}
                  >
                    {loadingVoice === v.voice_id ? (
                      <Loader className="w-3.5 h-3.5 animate-spin" />
                    ) : playingVoice === v.voice_id ? (
                      <Square className="w-3 h-3" />
                    ) : (
                      <Play className="w-3.5 h-3.5 ml-0.5" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{v.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System prompt */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Системный промпт агента</label>
          <textarea
            value={settings.system_prompt ?? ''}
            onChange={e => setSettings(s => ({ ...s, system_prompt: e.target.value || null }))}
            rows={6}
            placeholder="Инструкции для AI-агента при звонке. Если не заполнено — используется автоматический промпт на основе задачи."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none"
          />
          {/* AI prompt generator */}
          <div className="mt-2 flex gap-2">
            <input
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
              placeholder="Описание задачи для генерации промпта..."
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-forest-500 focus:border-transparent"
            />
            <button
              onClick={handleGenerate}
              disabled={generating || !taskDesc.trim()}
              className="px-3 py-1.5 border border-forest-300 text-forest-700 rounded-lg hover:bg-forest-50 transition-colors text-sm disabled:opacity-40 flex items-center gap-1.5"
            >
              {generating ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Сгенерировать
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={clsx(
            'px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 text-sm',
            saved
              ? 'bg-green-600 text-white'
              : 'bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-50'
          )}
        >
          {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Сохранено!' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const DozvonDashboard: React.FC = () => {
  const [tab, setTab] = useState<Tab>('campaigns');

  const tabs: { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: 'campaigns', label: 'Кампании', Icon: Phone },
    { id: 'contacts',  label: 'Контакты', Icon: User },
    { id: 'settings',  label: 'Настройки', Icon: Settings },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-4 flex-shrink-0">
        <div className="flex space-x-1">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                tab === id
                  ? 'border-forest-600 text-forest-600'
                  : 'border-transparent text-gray-600 hover:text-forest-600 hover:border-gray-300'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {tab === 'campaigns' && <CampaignsTab />}
        {tab === 'contacts'  && <ContactsTab />}
        {tab === 'settings'  && <SettingsTab />}
      </div>
    </div>
  );
};

export default DozvonDashboard;
