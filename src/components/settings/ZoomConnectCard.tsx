// Подключение аккаунта Zoom — ради того, чтобы ассистент мог заходить на любые
// встречи, а не только на встречи нашего же аккаунта.
//
// С 2 марта 2026 Zoom пускает приложение на Meeting SDK во встречу чужого
// аккаунта только с токеном On-Behalf-Of, а тот выдаётся от имени человека,
// который приложение авторизовал И присутствует на встрече. Для человека это
// одно действие: подключить свой Zoom один раз.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Video, Check, Loader2, AlertCircle } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

type Conn = 'loading' | 'not_connected' | 'connected';

const ZoomConnectCard: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<Conn>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const r = await apiClient.get('/webhook/ecosystem/zoom/status');
      if (!r.ok) { setState('not_connected'); return; }
      const d = await r.json().catch(() => ({}));
      setState(d?.connected ? 'connected' : 'not_connected');
    } catch {
      setState('not_connected');
    }
  };

  useEffect(() => {
    // Возврат от Zoom приходит на бэкенд, а тот переводит браузер сюда с
    // пометкой об исходе. Пометку из адреса убираем: перезагрузив страницу,
    // человек не должен увидеть вчерашнее сообщение снова.
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('zoom_connect');
    if (outcome) {
      if (outcome !== 'ok') setMsg(t(`settings.zoom.${outcome}`));
      params.delete('zoom_connect');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    void loadStatus();
  }, []);

  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await apiClient.post('/webhook/ecosystem/zoom/oauth/start', {});
      const d = await r.json().catch(() => ({}));
      if (d?.authorizeUrl) { window.location.href = d.authorizeUrl; return; }
      setMsg(t('settings.zoom.connect_error'));
    } catch {
      setMsg(t('settings.zoom.connect_error'));
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true); setMsg(null);
    try { await apiClient.post('/webhook/ecosystem/zoom/disconnect', {}); } catch { /* уже отключено */ }
    setState('not_connected');
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Video className="w-5 h-5 mr-2 text-forest-600" />
          {t('settings.zoom.title')}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{t('settings.zoom.description')}</p>

        {state === 'loading' && <Loader2 className="mt-4 w-4 h-4 animate-spin text-gray-400" />}

        {state === 'connected' && (
          <div className="mt-4 flex items-center gap-3">
            <span className="flex items-center text-sm text-forest-700" data-testid="zoom-connected">
              <Check className="w-4 h-4 mr-1" />
              {t('settings.zoom.connected')}
            </span>
            <button
              onClick={disconnect}
              disabled={busy}
              data-testid="zoom-disconnect"
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              {t('settings.zoom.disconnect')}
            </button>
          </div>
        )}

        {state === 'not_connected' && (
          <button
            onClick={connect}
            disabled={busy}
            data-testid="zoom-connect"
            className="mt-4 px-3 py-1.5 rounded-lg bg-forest-700 text-white text-xs font-medium disabled:opacity-50 hover:bg-forest-800 transition-colors"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : t('settings.zoom.connect')}
          </button>
        )}

        {msg && (
          <p className="mt-2 text-xs text-amber-700 flex items-center" data-testid="zoom-message">
            <AlertCircle className="w-3 h-3 mr-1 flex-shrink-0" />
            {msg}
          </p>
        )}
      </div>
    </div>
  );
};

export default ZoomConnectCard;
