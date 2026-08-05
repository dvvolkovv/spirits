import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Plus, Trash2, Pencil } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import i18n from '../../i18n';
import { resolveLanguage } from '../../i18n/languages';

interface Routine {
  id: string;
  title: string;
  assistantId: string;
  prompt: string;
  sendHour: number;
  tz: string;
  days: number[] | null;
  enabled: boolean;
}
interface Assistant { id: number; name: string; displayName?: string; }

const DAY_KEYS = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'] as const;
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

const eq = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

type Preset = 'daily' | 'weekdays' | 'weekends' | 'custom';
const daysToPreset = (days: number[] | null): Preset => {
  if (!days || days.length === 0 || days.length === 7) return 'daily';
  if (eq(days, WEEKDAYS)) return 'weekdays';
  if (eq(days, WEEKENDS)) return 'weekends';
  return 'custom';
};
const presetToDays = (p: Preset, custom: number[]): number[] => {
  if (p === 'weekdays') return WEEKDAYS;
  if (p === 'weekends') return WEEKENDS;
  if (p === 'custom') return custom;
  return [];
};

const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'; } catch { return 'Europe/Moscow'; } })();

interface FormState {
  id: string | null;
  title: string;
  assistantId: string;
  prompt: string;
  hour: number;
  preset: Preset;
  customDays: number[];
}
const emptyForm = (assistantId: string): FormState => ({
  id: null, title: '', assistantId, prompt: '', hour: 8, preset: 'daily', customDays: [],
});

const RoutinesManager: React.FC = () => {
  const { t } = useTranslation();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [agents, setAgents] = useState<Assistant[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dayLabels = DAY_KEYS.map((k) => t(`settings.routines.${k}`));

  const daysLabel = (days: number[] | null): string => {
    if (!days || days.length === 0 || days.length === 7) return t('settings.routines.label_daily');
    if (eq(days, WEEKDAYS)) return t('settings.routines.label_weekdays');
    if (eq(days, WEEKENDS)) return t('settings.routines.label_weekends');
    return [...days].sort().map((d) => dayLabels[d]).join(', ');
  };

  const agentName = (id: string) => {
    const a = agents.find((x) => String(x.id) === String(id));
    return a ? (a.displayName || a.name) : `#${id}`;
  };

  const load = async () => {
    try {
      const r = await apiClient.get('/webhook/routines');
      if (r.ok) setRoutines((await r.json()).routines || []);
      else setRoutines([]);
    } catch { setRoutines([]); }
  };
  useEffect(() => {
    load();
    apiClient.get(`/webhook/agents?lang=${resolveLanguage(i18n.language)}`).then(async (r) => { if (r.ok) setAgents(await r.json()); }).catch(() => {});
  }, []);

  const post = async (body: any) => {
    setBusy(true); setMsg(null);
    try {
      const r = await apiClient.post('/webhook/routines', body);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d?.error || t('settings.routines.error_generic')); return null; }
      return d;
    } catch { setMsg(t('settings.routines.error_network')); return null; }
    finally { setBusy(false); }
  };

  const toggle = async (rt: Routine) => {
    setRoutines((prev) => prev?.map((x) => x.id === rt.id ? { ...x, enabled: !x.enabled } : x) || null);
    await post({ action: 'update', id: rt.id, enabled: !rt.enabled });
    load();
  };
  const del = async (rt: Routine) => {
    if (!window.confirm(t('settings.routines.confirm_delete', { title: rt.title }))) return;
    await post({ action: 'delete', id: rt.id }); load();
  };
  const test = async (rt: Routine) => {
    const d = await post({ action: 'test', id: rt.id });
    if (d) setMsg(d.delivered > 0 ? t('settings.routines.test_success') : t('settings.routines.test_no_push'));
  };
  const addEnergy = async () => { await post({ action: 'preset_energy', tz: browserTz }); load(); };

  const openNew = () => setForm(emptyForm(agents.find((a) => String(a.id) === '14') ? '14' : String(agents[0]?.id ?? '14')));
  const openEdit = (rt: Routine) => setForm({
    id: rt.id, title: rt.title, assistantId: String(rt.assistantId), prompt: rt.prompt, hour: rt.sendHour,
    preset: daysToPreset(rt.days), customDays: rt.days && daysToPreset(rt.days) === 'custom' ? rt.days : [],
  });

  const saveForm = async () => {
    if (!form) return;
    if (!form.prompt.trim()) { setMsg(t('settings.routines.prompt_required')); return; }
    const days = presetToDays(form.preset, form.customDays);
    const body: any = {
      action: form.id ? 'update' : 'create',
      title: form.title.trim() || t('settings.routines.default_title'),
      assistant: form.assistantId,
      prompt: form.prompt.trim(),
      sendHour: form.hour,
      days,
      tz: browserTz,
    };
    if (form.id) body.id = form.id;
    const d = await post(body);
    if (d) { setForm(null); load(); }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent text-sm';

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Bell className="w-5 h-5 mr-2 text-warm-600" />
          {t('settings.routines.title')}
        </h2>
        {!form && (
          <button onClick={openNew} className="text-sm text-forest-600 hover:text-forest-700 font-medium flex items-center gap-1">
            <Plus className="w-4 h-4" /> {t('common.add')}
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">
          {t('settings.routines.desc')}
        </p>

        {/* Список */}
        {routines === null ? (
          <p className="text-sm text-gray-400">{t('settings.routines.loading')}</p>
        ) : routines.length === 0 && !form ? (
          <div className="text-sm text-gray-500">
            {t('settings.routines.empty')}{' '}
            <button onClick={addEnergy} disabled={busy} className="text-forest-600 hover:text-forest-700 font-medium disabled:opacity-50">
              {t('settings.routines.add_energy_preset')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {routines.map((rt) => (
              <div key={rt.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{rt.title}</div>
                  <div className="text-xs text-gray-500">
                    {agentName(rt.assistantId)} · {String(rt.sendHour).padStart(2, '0')}:00 · {daysLabel(rt.days)}
                  </div>
                </div>
                <button onClick={() => test(rt)} disabled={busy} title={t('settings.routines.test_now_title') || ''} className="text-xs text-forest-600 hover:text-forest-700 disabled:opacity-50 whitespace-nowrap">{t('settings.routines.test_button')}</button>
                <button onClick={() => openEdit(rt)} title={t('settings.routines.edit_title') || ''} className="text-gray-400 hover:text-gray-700"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => del(rt)} title={t('common.delete') || ''} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                <button
                  onClick={() => toggle(rt)}
                  disabled={busy}
                  className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0', rt.enabled ? 'bg-forest-600' : 'bg-gray-300')}
                >
                  <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', rt.enabled ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Форма создания/редактирования */}
        {form && (
          <div className="p-4 rounded-lg border border-forest-200 bg-forest-50/40 space-y-3">
            <div className="text-sm font-medium text-gray-900">{form.id ? t('settings.routines.edit_form_title') : t('settings.routines.new_form_title')}</div>
            <input className={inputCls} placeholder={t('settings.routines.name_placeholder') || ''} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select className={inputCls} value={form.assistantId} onChange={(e) => setForm({ ...form, assistantId: e.target.value })}>
                {agents.map((a) => <option key={a.id} value={String(a.id)}>{a.displayName || a.name}</option>)}
              </select>
              <select className={inputCls} value={form.hour} onChange={(e) => setForm({ ...form, hour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </div>
            <select className={inputCls} value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value as Preset })}>
              <option value="daily">{t('settings.routines.preset_daily')}</option>
              <option value="weekdays">{t('settings.routines.preset_weekdays')}</option>
              <option value="weekends">{t('settings.routines.preset_weekends')}</option>
              <option value="custom">{t('settings.routines.preset_custom')}</option>
            </select>
            {form.preset === 'custom' && (
              <div className="flex flex-wrap gap-1">
                {dayLabels.map((lbl, d) => {
                  const on = form.customDays.includes(d);
                  return (
                    <button key={d} type="button"
                      onClick={() => setForm({ ...form, customDays: on ? form.customDays.filter((x) => x !== d) : [...form.customDays, d] })}
                      className={clsx('px-2.5 py-1 rounded-full text-xs border', on ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-gray-600 border-gray-300')}
                    >{lbl}</button>
                  );
                })}
              </div>
            )}
            <textarea className={inputCls} rows={3} placeholder={t('settings.routines.prompt_placeholder') || ''} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
            <div className="flex items-center gap-2">
              <button onClick={saveForm} disabled={busy} className="px-4 py-2 rounded-lg bg-forest-600 text-white text-sm font-medium hover:bg-forest-700 disabled:opacity-50">
                {form.id ? t('common.save') : t('settings.routines.create')}
              </button>
              <button onClick={() => { setForm(null); setMsg(null); }} disabled={busy} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {msg && <p className="text-xs text-gray-600">{msg}</p>}
      </div>
    </div>
  );
};

export default RoutinesManager;
