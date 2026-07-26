// src/components/calendar/ConnectCalendarModal.tsx
import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ApiPost } from './types';

interface Props {
  apiPost: ApiPost;
  onClose: () => void;
  /** Called after a successful connect — parent re-renders the proposal card as connected. */
  onConnected: () => void;
}

export const ConnectCalendarModal: React.FC<Props> = ({ apiPost, onClose, onConnected }) => {
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = username.trim().length > 0 && appPassword.trim().length > 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiPost('/webhook/calendar/connect', {
        provider: 'yandex',
        username: username.trim(),
        appPassword: appPassword.trim(),
      });
      if (r?.ok) {
        onConnected();
      } else {
        setError(r?.error || 'Не удалось подключить календарь');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Не удалось подключить календарь');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Подключить календарь</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Провайдер</label>
            <input
              type="text"
              value="Яндекс"
              disabled
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Логин (email)</label>
            <input
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="you@yandex.ru"
              autoComplete="username"
              disabled={loading}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Пароль приложения</label>
            <input
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx"
              autoComplete="new-password"
              disabled={loading}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
            />
          </div>
          <a
            href="https://yandex.ru/support/id/authorization/app-passwords.html"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-blue-600 hover:underline"
          >
            Как создать пароль приложения в Яндексе
          </a>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Подключить
          </button>
        </div>
      </form>
    </div>
  );
};

export default ConnectCalendarModal;
