// «Календари» — заметное место, чтобы добавить свои календари (образец — Apple: без «регистрации»).
// Два механизма: (1) Яндекс — по логину + паролю приложения (ConnectCalendarModal, read-write);
// (2) по ссылке (ICS) — Outlook «Опубликовать календарь», Google, iCloud (read-only, видно в «сегодня»).
// Данные календаря живут в облаке Линкеона (мульти-устройство).
import React, { useEffect, useState } from 'react';
import { Calendar, Check, Loader2, Plus, Link2 } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { ConnectCalendarModal } from '../calendar/ConnectCalendarModal';

type Status = 'loading' | 'not_connected' | 'connected';

const PROVIDER_LABEL: Record<string, string> = { yandex: 'Яндекс.Календарь' };
const ICS_LABEL: Record<string, string> = { outlook: 'Outlook', google: 'Google', icloud: 'iCloud', work: 'Рабочий' };

// ConnectCalendarModal ждёт apiPost, отдающий уже распарсенный JSON (r.ok/r.error).
const apiPost = async (path: string, body: any) => {
  const r = await apiClient.post(path, body);
  return r.json().catch(() => ({}));
};

interface IcsSource { kind: string; url: string; enabled: boolean }

const CalendarSourcesCard: React.FC = () => {
  const [status, setStatus] = useState<Status>('loading');
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [canReenable, setCanReenable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Календари по ссылке (ICS)
  const [ics, setIcs] = useState<IcsSource[]>([]);
  const [showAddIcs, setShowAddIcs] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [icsBusy, setIcsBusy] = useState(false);
  const [icsError, setIcsError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const r = await apiClient.get('/webhook/calendar/status');
      if (!r.ok) { setStatus('not_connected'); return; }
      const d = await r.json().catch(() => ({}));
      setProvider(d?.provider);
      setUsername(d?.username);
      setCanReenable(!!d?.canReenable);
      setStatus(d?.connected ? 'connected' : 'not_connected');
    } catch {
      setStatus('not_connected');
    }
  };

  const loadIcs = async () => {
    try {
      const r = await apiClient.get('/webhook/calendar/ics');
      if (!r.ok) return;
      const d = await r.json().catch(() => []);
      setIcs(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadStatus(); loadIcs(); }, []);

  const disconnect = async () => {
    setBusy(true); setError(null);
    try { await apiClient.delete('/webhook/calendar/connect'); } catch {}
    await loadStatus(); // подключение остаётся сохранённым → появится «Подключить снова»
    setBusy(false);
  };

  // Переподключить сохранённое подключение одним тапом (пароль уже в облаке).
  const reconnect = async () => {
    setBusy(true); setError(null);
    try {
      const r = await apiClient.post('/webhook/calendar/reconnect', {});
      const d = await r.json().catch(() => ({}));
      if (d?.ok) { await loadStatus(); }
      else { setError(d?.error || 'Не удалось переподключить'); setShowConnect(true); }
    } catch { setError('Не удалось переподключить'); }
    finally { setBusy(false); }
  };

  const onConnected = () => { setShowConnect(false); loadStatus(); };

  const addIcs = async () => {
    setIcsBusy(true); setIcsError(null);
    try {
      const r = await apiClient.post('/webhook/calendar/ics', { url: icsUrl.trim(), kind: 'outlook' });
      const d = await r.json().catch(() => ({}));
      if (d?.ok) { setIcsUrl(''); setShowAddIcs(false); await loadIcs(); }
      else setIcsError(d?.error || 'Не удалось добавить');
    } catch { setIcsError('Не удалось добавить'); }
    finally { setIcsBusy(false); }
  };

  const removeIcs = async (kind: string) => {
    try { await apiClient.delete(`/webhook/calendar/ics/${encodeURIComponent(kind)}`); } catch {}
    await loadIcs();
  };

  return (
    <div id="calendar-sources" className="bg-white rounded-lg shadow-sm scroll-mt-4">
      <div className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Calendar className="w-5 h-5 mr-2 text-forest-600" />
          Календари
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Добавь свои календари — события из всех сразу видны в «твоём сегодня». Данные хранятся
          в облаке Линкеона, поэтому видны на всех твоих устройствах.
        </p>

        <div className="mt-4 space-y-2.5">
          {/* ——— Яндекс (по логину + паролю приложения) ——— */}
          {status === 'loading' && (
            <div className="flex items-center text-sm text-gray-400">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />Проверяю…
            </div>
          )}

          {status === 'connected' && (
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center text-sm font-medium text-forest-700">
                <Check className="w-4 h-4 mr-1.5" />
                {PROVIDER_LABEL[provider || ''] || 'Календарь'} · подключён
              </span>
              <button
                type="button" onClick={disconnect} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Отключить
              </button>
            </div>
          )}

          {status === 'not_connected' && (canReenable ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                <span className="text-sm text-gray-700 truncate">
                  {PROVIDER_LABEL[provider || ''] || 'Календарь'}{username ? ` · ${username}` : ''}
                </span>
                <button
                  type="button" onClick={reconnect} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50 shrink-0"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Подключить снова
                </button>
              </div>
              <button
                type="button" onClick={() => setShowConnect(true)}
                className="text-xs text-forest-700 underline underline-offset-2 hover:text-forest-800"
              >
                Подключить другой аккаунт
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
              <span className="text-sm font-medium text-gray-900">Яндекс.Календарь</span>
              <button
                type="button" onClick={() => setShowConnect(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-forest-700"
              >
                <Plus className="w-4 h-4" />Подключить
              </button>
            </div>
          ))}

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div>
          )}

          {/* ——— По ссылке (ICS): Outlook, Google, iCloud — read-only ——— */}
          {ics.map((s) => (
            <div key={s.kind} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
              <span className="inline-flex items-center text-sm font-medium text-forest-700 truncate">
                <Check className="w-4 h-4 mr-1.5 shrink-0" />
                {ICS_LABEL[s.kind] || s.kind} · по ссылке
              </span>
              <button
                type="button" onClick={() => removeIcs(s.kind)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shrink-0"
              >
                Убрать
              </button>
            </div>
          ))}

          {!ics.some((s) => s.kind === 'outlook') && !showAddIcs && (
            <button
              type="button" onClick={() => { setShowAddIcs(true); setIcsError(null); }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900">Outlook — по ссылке</span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700">
                <Link2 className="w-4 h-4" />Добавить
              </span>
            </button>
          )}

          {showAddIcs && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="text-sm font-medium text-gray-900">Outlook по ссылке (только просмотр)</div>
              <p className="text-xs text-gray-500">
                В Outlook в браузере: Настройки → Календарь → <b>Общие календари</b> → «Опубликовать календарь» →
                скопируй ссылку <b>ICS</b> и вставь сюда. Если такого пункта нет — публикацию закрыл админ компании,
                тогда напиши мне, подключим через вход Microsoft.
              </p>
              <input
                type="url" value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)}
                placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
              />
              {icsError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{icsError}</div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => { setShowAddIcs(false); setIcsError(null); }} className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900">
                  Отмена
                </button>
                <button
                  type="button" onClick={addIcs} disabled={icsBusy || icsUrl.trim().length < 8}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
                >
                  {icsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Добавить
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showConnect && (
        <ConnectCalendarModal
          apiPost={apiPost}
          onClose={() => setShowConnect(false)}
          onConnected={onConnected}
        />
      )}
    </div>
  );
};

export default CalendarSourcesCard;
