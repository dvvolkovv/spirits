// Экосистема TalerID — согласие на подключение (референс-коннектор над-экосистемного слоя).
// Подключение = провижининг TalerID-аккаунта из телефона юзера (бесшовно) + доступ к календарю
// через публичный MCP+OAuth. Пока — только календарь: при подключении события планируются в TalerID.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Check, Loader2, Link2, AlertCircle } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

type Conn = 'loading' | 'not_connected' | 'connected' | 'ambiguous' | 'error';

const TalerIdEcosystemCard: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<Conn>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const r = await apiClient.get('/webhook/ecosystem/talerid/status');
      if (!r.ok) { setState('not_connected'); return; }
      const d = await r.json().catch(() => ({}));
      setState(d?.connected ? 'connected' : 'not_connected');
    } catch {
      setState('not_connected');
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await apiClient.post('/webhook/ecosystem/talerid/connect', {});
      const d = await r.json().catch(() => ({}));
      const status = d?.status;
      if (status === 'connected') { setState('connected'); }
      else if (status === 'ambiguous') { setState('ambiguous'); setMsg(t('settings.talerid.ambiguous_msg')); }
      else { setState('error'); setMsg(t('settings.talerid.connect_error')); }
    } catch {
      setState('error'); setMsg(t('settings.talerid.connect_error'));
    } finally { setBusy(false); }
  };

  // «Уже есть аккаунт TalerID?» — OAuth-вход в существующий аккаунт: бэкенд отдаёт authorize-URL,
  // уводим туда браузер. После входа TalerID вернёт на SPA с ?talerid_link=<status> (тост в App.tsx).
  const startLink = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await apiClient.post('/webhook/ecosystem/talerid/oauth/start', {});
      const d = await r.json().catch(() => ({}));
      if (d?.authorizeUrl) { window.location.href = d.authorizeUrl; return; }
      setMsg(t('settings.talerid.link_error'));
    } catch {
      setMsg(t('settings.talerid.link_error'));
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true); setMsg(null);
    try { await apiClient.delete('/webhook/ecosystem/talerid/disconnect'); } catch {}
    setState('not_connected'); setBusy(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Calendar className="w-5 h-5 mr-2 text-forest-600" />
          {t('settings.talerid.title')}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('settings.talerid.desc')}
        </p>

        <div className="mt-4">
          {state === 'loading' && (
            <div className="flex items-center text-sm text-gray-400"><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('settings.checking')}</div>
          )}

          {state === 'connected' && (
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center text-sm font-medium text-forest-700">
                <Check className="w-4 h-4 mr-1.5" />{t('settings.talerid.connected')}
              </span>
              <button
                type="button" onClick={disconnect} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{t('settings.disconnect')}
              </button>
            </div>
          )}

          {(state === 'not_connected' || state === 'ambiguous' || state === 'error') && (
            <div className="flex flex-col items-start gap-2.5">
              <button
                type="button" onClick={connect} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {t('settings.talerid.connect_button')}
              </button>
              <button
                type="button" onClick={startLink} disabled={busy}
                className="text-sm text-forest-700 underline underline-offset-2 hover:text-forest-800 disabled:opacity-50"
              >
                {t('settings.talerid.already_have_account')}
              </button>
            </div>
          )}

          {msg && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{msg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TalerIdEcosystemCard;
