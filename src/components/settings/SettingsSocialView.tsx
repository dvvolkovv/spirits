import React, { useEffect, useState } from 'react';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { socialAccountApi } from '../../services/socialAccountApi';
import { SocialAccount, SmmPlatform, PLATFORM_LABELS } from '../../types/smm';
import TelegramConnectForm from '../chat/TelegramConnectForm';

const PLATFORMS: SmmPlatform[] = ['telegram', 'vk', 'youtube', 'tiktok', 'instagram'];

const SettingsSocialView: React.FC = () => {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [tgModalOpen, setTgModalOpen] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<SmmPlatform | null>(null);

  const refresh = async () => {
    try {
      const data = await socialAccountApi.list();
      setAccounts(data);
    } catch (e: any) {
      toast.error(`Не удалось загрузить список: ${e?.message ?? 'ошибка'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // OAuth callback handler (same shape as ChatInterface but no auto-resume)
    const params = new URLSearchParams(window.location.search);
    const success = params.get('smm_oauth_success');
    const error = params.get('smm_oauth_error');
    if (success) {
      const label = PLATFORM_LABELS[success as SmmPlatform] ?? success;
      toast.success(`${label} подключён`);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      toast.error(`Не удалось подключить: ${decodeURIComponent(error)}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async (platform: SmmPlatform) => {
    if (platform === 'telegram') {
      setTgModalOpen(true);
      return;
    }
    setConnectingPlatform(platform);
    try {
      const { authorizeUrl } = await socialAccountApi.getOAuthStartUrl(
        platform as Exclude<SmmPlatform, 'telegram'>,
        '/settings/social',
      );
      window.location.href = authorizeUrl;
    } catch (e: any) {
      const msg = e?.message ?? 'ошибка';
      toast.error(`${PLATFORM_LABELS[platform]}: ${msg}`);
      setConnectingPlatform(null);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Удалить подключение ${label}?`)) return;
    try {
      await socialAccountApi.remove(id);
      toast.success('Удалено');
      await refresh();
    } catch (e: any) {
      toast.error(`Не удалось удалить: ${e?.message ?? 'ошибка'}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Социальные сети</h1>
      <p className="text-gray-600 mb-6">
        Подключи свои каналы и аккаунты — AI-продюсер сможет публиковать видео туда.
      </p>

      {/* Connect grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => handleConnect(p)}
            disabled={connectingPlatform === p}
            className="border border-gray-200 hover:border-blue-400 rounded-lg p-4 text-left transition"
          >
            <div className="flex items-center gap-2 mb-1">
              {connectingPlatform === p
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4 text-blue-600" />}
              <span className="font-medium">{PLATFORM_LABELS[p]}</span>
            </div>
            <div className="text-xs text-gray-500">Подключить</div>
          </button>
        ))}
      </div>

      {/* Accounts list */}
      <h2 className="text-lg font-semibold mb-3">Подключённые аккаунты</h2>
      {loading ? (
        <div className="text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Загружаем…
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-gray-500 text-sm py-4 px-3 bg-gray-50 rounded">
          Пока пусто. Подключи первый аккаунт выше.
        </div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 px-3">Платформа</th>
              <th className="py-2 px-3">Название</th>
              <th className="py-2 px-3">Статус</th>
              <th className="py-2 px-3">Подключён</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3">{PLATFORM_LABELS[a.platform]}</td>
                <td className="py-2 px-3 font-mono text-xs">{a.displayName}</td>
                <td className="py-2 px-3">
                  <span className={a.status === 'active' ? 'text-green-600' : 'text-orange-500'}>
                    {a.status}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-500">
                  {new Date(a.createdAt).toLocaleDateString('ru-RU')}
                </td>
                <td className="py-2 px-3">
                  <button
                    onClick={() => handleDelete(a.id, PLATFORM_LABELS[a.platform])}
                    className="text-red-500 hover:text-red-700"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Telegram modal */}
      {tgModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setTgModalOpen(false); }}
        >
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Telegram-канал</h3>
              <button onClick={() => setTgModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <TelegramConnectForm onConnected={() => { setTgModalOpen(false); refresh(); }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsSocialView;
