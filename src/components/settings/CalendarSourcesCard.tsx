// «Календари» — заметное место, чтобы добавить свои календари (образец — Apple: без «регистрации»).
// Два механизма: (1) Яндекс — по логину + паролю приложения (ConnectCalendarModal, read-write);
// (2) по ссылке (ICS) — Outlook «Опубликовать календарь», Google, iCloud (read-only, видно в «сегодня»).
// Данные календаря живут в облаке Линкеона (мульти-устройство).
import React, { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Calendar, Check, Loader2, Plus, Link2 } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { ConnectCalendarModal } from '../calendar/ConnectCalendarModal';

type Status = 'loading' | 'not_connected' | 'connected';

// ConnectCalendarModal ждёт apiPost, отдающий уже распарсенный JSON (r.ok/r.error).
const apiPost = async (path: string, body: any) => {
  const r = await apiClient.post(path, body);
  return r.json().catch(() => ({}));
};

interface IcsSource { kind: string; url: string; enabled: boolean }

const CalendarSourcesCard: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('loading');
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [canReenable, setCanReenable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exchange (рабочий Outlook по EWS)
  const [exchange, setExchange] = useState<{ connected: boolean; username?: string }>({ connected: false });
  const [showExForm, setShowExForm] = useState(false);
  const [exServer, setExServer] = useState('mail.clearwayintegration.com');
  const [exDomain, setExDomain] = useState('');
  const [exLogin, setExLogin] = useState('');
  const [exPassword, setExPassword] = useState('');
  const [exBusy, setExBusy] = useState(false);
  const [exError, setExError] = useState<string | null>(null);

  // Календари по ссылке (ICS)
  const [ics, setIcs] = useState<IcsSource[]>([]);
  const [showAddIcs, setShowAddIcs] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [icsBusy, setIcsBusy] = useState(false);
  const [icsError, setIcsError] = useState<string | null>(null);

  const providerLabel = (p?: string): string =>
    p === 'yandex' ? t('settings.calendar.yandex_calendar') : t('settings.calendar.generic');

  const icsLabel = (kind: string): string => {
    switch (kind) {
      case 'link': return t('settings.calendar.ics_label_link');
      case 'outlook':
      case 'corp': return t('settings.calendar.ics_label_outlook');
      case 'google': return 'Google';
      case 'icloud': return 'iCloud';
      case 'work': return t('settings.calendar.ics_label_work');
      default: return kind;
    }
  };

  const loadStatus = async () => {
    try {
      const r = await apiClient.get('/webhook/calendar/status');
      if (!r.ok) { setStatus('not_connected'); return; }
      const d = await r.json().catch(() => ({}));
      setProvider(d?.provider);
      setUsername(d?.username);
      setCanReenable(!!d?.canReenable);
      setExchange(d?.exchange || { connected: false });
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
      else { setError(d?.error || t('settings.calendar.reconnect_error')); setShowConnect(true); }
    } catch { setError(t('settings.calendar.reconnect_error')); }
    finally { setBusy(false); }
  };

  const onConnected = () => { setShowConnect(false); loadStatus(); };

  const connectExchange = async () => {
    setExBusy(true); setExError(null);
    try {
      const r = await apiClient.post('/webhook/calendar/exchange/connect', {
        server: exServer.trim(), domain: exDomain.trim(), login: exLogin.trim(), password: exPassword,
      });
      const d = await r.json().catch(() => ({}));
      if (d?.ok) { setExPassword(''); setShowExForm(false); await loadStatus(); }
      else setExError(d?.error || t('settings.calendar.exchange_login_error'));
    } catch { setExError(t('settings.calendar.exchange_login_error')); }
    finally { setExBusy(false); }
  };

  const disconnectExchange = async () => {
    setExBusy(true); setExError(null);
    try { await apiClient.delete('/webhook/calendar/exchange'); } catch {}
    await loadStatus(); setExBusy(false);
  };

  const addIcs = async () => {
    setIcsBusy(true); setIcsError(null);
    try {
      const r = await apiClient.post('/webhook/calendar/ics', { url: icsUrl.trim(), kind: 'link' });
      const d = await r.json().catch(() => ({}));
      if (d?.ok) { setIcsUrl(''); setShowAddIcs(false); await loadIcs(); }
      else setIcsError(d?.error || t('settings.calendar.ics_add_error'));
    } catch { setIcsError(t('settings.calendar.ics_add_error')); }
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
          {t('settings.calendar.title')}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('settings.calendar.desc')}
        </p>

        <div className="mt-4 space-y-2.5">
          {/* ——— Яндекс (по логину + паролю приложения) ——— */}
          {status === 'loading' && (
            <div className="flex items-center text-sm text-gray-400">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('settings.checking')}
            </div>
          )}

          {status === 'connected' && (
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center text-sm font-medium text-forest-700">
                <Check className="w-4 h-4 mr-1.5" />
                {t('settings.calendar.connected_as', { name: providerLabel(provider) })}
              </span>
              <button
                type="button" onClick={disconnect} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{t('settings.disconnect')}
              </button>
            </div>
          )}

          {status === 'not_connected' && (canReenable ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                <span className="text-sm text-gray-700 truncate">
                  {providerLabel(provider)}{username ? ` · ${username}` : ''}
                </span>
                <button
                  type="button" onClick={reconnect} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50 shrink-0"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{t('settings.calendar.reconnect')}
                </button>
              </div>
              <button
                type="button" onClick={() => setShowConnect(true)}
                className="text-xs text-forest-700 underline underline-offset-2 hover:text-forest-800"
              >
                {t('settings.calendar.connect_other')}
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
              <span className="text-sm font-medium text-gray-900">{t('settings.calendar.yandex_calendar')}</span>
              <button
                type="button" onClick={() => setShowConnect(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-forest-700"
              >
                <Plus className="w-4 h-4" />{t('settings.connect')}
              </button>
            </div>
          ))}

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div>
          )}

          {/* ——— Outlook (рабочий) через Exchange EWS — вход по логину/паролю, read-only ——— */}
          {exchange.connected ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
              <span className="inline-flex items-center text-sm font-medium text-forest-700 truncate">
                <Check className="w-4 h-4 mr-1.5 shrink-0" />
                {t('settings.calendar.outlook_work')}{exchange.username ? ` · ${exchange.username}` : ''}
              </span>
              <button
                type="button" onClick={disconnectExchange} disabled={exBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shrink-0"
              >
                {exBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{t('settings.disconnect')}
              </button>
            </div>
          ) : !showExForm ? (
            <button
              type="button" onClick={() => { setShowExForm(true); setExError(null); }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900">{t('settings.calendar.outlook_connect_prompt')}</span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700"><Plus className="w-4 h-4" />{t('settings.connect')}</span>
            </button>
          ) : (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="text-sm font-medium text-gray-900">{t('settings.calendar.outlook_form_title')}</div>
              <p className="text-xs text-gray-500">
                {t('settings.calendar.outlook_form_desc')}
              </p>
              <input
                value={exServer} onChange={(e) => setExServer(e.target.value)} placeholder={t('settings.calendar.server_placeholder') || ''}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
              />
              <div className="flex gap-2">
                <input
                  value={exDomain} onChange={(e) => setExDomain(e.target.value)} placeholder={t('settings.calendar.domain_placeholder') || ''}
                  className="w-1/2 text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
                />
                <input
                  value={exLogin} onChange={(e) => setExLogin(e.target.value)} placeholder={t('settings.calendar.login_placeholder') || ''} autoComplete="username"
                  className="w-1/2 text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
                />
              </div>
              <input
                type="password" value={exPassword} onChange={(e) => setExPassword(e.target.value)} placeholder={t('settings.calendar.password_placeholder') || ''} autoComplete="new-password"
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
              />
              {exError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{exError}</div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => { setShowExForm(false); setExError(null); }} className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900">{t('common.cancel')}</button>
                <button
                  type="button" onClick={connectExchange} disabled={exBusy || !exLogin.trim() || !exPassword}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
                >
                  {exBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{t('settings.connect')}
                </button>
              </div>
            </div>
          )}

          {/* ——— По ссылке (ICS): Outlook, Google, iCloud — read-only. Показываем только активные. ——— */}
          {ics.filter((s) => s.enabled).map((s) => (
            <div key={s.kind} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
              <span className="inline-flex items-center text-sm font-medium text-forest-700 truncate">
                <Check className="w-4 h-4 mr-1.5 shrink-0" />
                {t('settings.calendar.ics_connected', { label: icsLabel(s.kind) })}
              </span>
              <button
                type="button" onClick={() => removeIcs(s.kind)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shrink-0"
              >
                {t('settings.calendar.remove')}
              </button>
            </div>
          ))}

          {!showAddIcs && (
            <button
              type="button" onClick={() => { setShowAddIcs(true); setIcsError(null); }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900">{t('settings.calendar.add_other_ics')}</span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700">
                <Link2 className="w-4 h-4" />{t('common.add')}
              </span>
            </button>
          )}

          {showAddIcs && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="text-sm font-medium text-gray-900">{t('settings.calendar.ics_form_title')}</div>
              <p className="text-xs text-gray-500">
                <Trans i18nKey="settings.calendar.ics_form_desc">
                  Опубликуй календарь в своём сервисе (Google, iCloud, Outlook.com…) и вставь ссылку
                  <b> .ics</b> сюда. Это read-only: события будут видны в «сегодня».
                </Trans>
              </p>
              <input
                type="url" value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)}
                placeholder={t('settings.calendar.ics_url_placeholder') || ''}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
              />
              {icsError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{icsError}</div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => { setShowAddIcs(false); setIcsError(null); }} className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900">
                  {t('common.cancel')}
                </button>
                <button
                  type="button" onClick={addIcs} disabled={icsBusy || icsUrl.trim().length < 8}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
                >
                  {icsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{t('common.add')}
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
