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
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [canReenable, setCanReenable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { loadStatus(); }, []);

  const disconnect = async () => {
    setBusy(true); setError(null);
    try { await apiClient.delete('/webhook/calendar/connect'); } catch {}
    await loadStatus(); // подключение остаётся сохранённым → появится «Подключить снова»
    setBusy(false);
  };

  // Переподключить сохранённое подключение одним тапом (пароль уже в облаке). Если он устарел —
  // бэкенд вернёт ошибку, и мы откроем полную форму для нового ввода.
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

  const onConnected = () => {
    setShowConnect(false);
    loadStatus();
  };

  return (
    <div id="calendar-sources" className="bg-white rounded-lg shadow-sm scroll-mt-4">
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
              {canReenable ? (
                /* Отключено, но креды сохранены → один тап, без повторного ввода пароля. */
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
                /* Яндекс — рабочий путь: почта + пароль приложения */
                <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                  <span className="text-sm font-medium text-gray-900">Яндекс.Календарь</span>
                  <button
                    type="button" onClick={() => setShowConnect(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-forest-700"
                  >
                    <Plus className="w-4 h-4" />Подключить
                  </button>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div>
              )}

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
