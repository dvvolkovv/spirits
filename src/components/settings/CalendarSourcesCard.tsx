// «Календари» — простое, заметное место, чтобы добавить свой календарь (образец — Apple:
// вводишь почту и пароль, ничего не «регистрируешь»). Surface для УЖЕ рабочего flow: Яндекс
// подключается по логину + паролю приложения (ConnectCalendarModal). Outlook/Google требуют
// разовой регистрации приложения на стороне продукта (не пользователя) — пока показаны как
// «готовим», без ложных обещаний. Данные календаря живут в облаке Линкеона (мульти-устройство).
import React, { useEffect, useState } from 'react';
import { Calendar, Check, Loader2, Plus, Clock } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { ConnectCalendarModal } from '../calendar/ConnectCalendarModal';

type Status = 'loading' | 'not_connected' | 'connected';

// Человеческое имя провайдера для строки статуса.
const PROVIDER_LABEL: Record<string, string> = {
  yandex: 'Яндекс.Календарь',
};

// ConnectCalendarModal ждёт apiPost, отдающий уже распарсенный JSON (r.ok/r.error).
// apiClient.post отдаёт Response — оборачиваем.
const apiPost = async (path: string, body: any) => {
  const r = await apiClient.post(path, body);
  return r.json().catch(() => ({}));
};

const CalendarSourcesCard: React.FC = () => {
  const [status, setStatus] = useState<Status>('loading');
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  const loadStatus = async () => {
    try {
      const r = await apiClient.get('/webhook/calendar/status');
      if (!r.ok) { setStatus('not_connected'); return; }
      const d = await r.json().catch(() => ({}));
      if (d?.connected) { setStatus('connected'); setProvider(d.provider); }
      else { setStatus('not_connected'); setProvider(undefined); }
    } catch {
      setStatus('not_connected');
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const disconnect = async () => {
    setBusy(true);
    try { await apiClient.delete('/webhook/calendar/connect'); } catch {}
    setStatus('not_connected'); setProvider(undefined); setBusy(false);
  };

  const onConnected = () => {
    setShowConnect(false);
    loadStatus();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">
          <Calendar className="w-5 h-5 mr-2 text-forest-600" />
          Календари
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Добавь свои календари — события из всех сразу видны в «твоём сегодня». Вводишь почту
          и пароль, ничего регистрировать не нужно. Данные хранятся в облаке Линкеона, так что
          видны на всех твоих устройствах.
        </p>

        <div className="mt-4">
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

          {status === 'not_connected' && (
            <div className="space-y-2.5">
              {/* Яндекс — рабочий путь: почта + пароль приложения */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                <span className="text-sm font-medium text-gray-900">Яндекс.Календарь</span>
                <button
                  type="button" onClick={() => setShowConnect(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-forest-700"
                >
                  <Plus className="w-4 h-4" />Подключить
                </button>
              </div>

              {/* Outlook / Google — требуют разовой регистрации приложения на стороне продукта.
                  Показываем честно как «готовим», без клика, чтобы не обещать несуществующее. */}
              {['Outlook', 'Google Календарь'].map((name) => (
                <div key={name} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <span className="text-sm text-gray-500">{name}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3.5 h-3.5" />готовим простой вход
                  </span>
                </div>
              ))}
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
