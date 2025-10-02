import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import {
  Shield,
  Globe,
  Bell,
  User,
  LogOut,
  Trash2,
  Eye,
  EyeOff,
  MessageCircle
} from 'lucide-react';
import { clsx } from 'clsx';

const SettingsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, logout, deleteProfile } = useAuth();
  const [settings, setSettings] = useState({
    profileVisibility: 'public',
    valuesVisibility: 'all',
    allowChats: 'all',
    language: i18n.language,
    notifications: {
      messages: true,
      matches: true,
      updates: false
    }
  });

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    handleSettingChange('language', lang);
  };

  const handleLogout = () => {
    if (window.confirm('Вы уверены, что хотите выйти?')) {
      logout();
    }
  };

  const handleDeleteAccount = () => {
    if (window.confirm('Это действие необратимо. Все ваши данные будут удалены с сервера. Удалить аккаунт?')) {
      deleteProfile()
        .then(() => {
          // Успешное удаление - пользователь автоматически выйдет из системы
          console.log('Профиль успешно удален');
        })
        .catch((error) => {
          alert(`Ошибка при удалении аккаунта: ${error.message}`);
        });
    }
  };

  const ToggleSwitch: React.FC<{
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    disabled?: boolean;
  }> = ({ enabled, onChange, disabled }) => (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={clsx(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        enabled ? 'bg-forest-600' : 'bg-gray-300',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={clsx(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          enabled ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-4 border-b flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">
          {t('settings.title')}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4 space-y-6">
        {/* Privacy Settings */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-forest-600" />
              {t('settings.privacy')}
            </h2>
          </div>
          <div className="p-6 space-y-6">
            {/* Profile Visibility */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  {t('settings.profile_visibility')}
                </h3>
                <p className="text-sm text-gray-600">
                  Кто может видеть ваш профиль в поиске
                </p>
              </div>
              <select
                value={settings.profileVisibility}
                onChange={(e) => handleSettingChange('profileVisibility', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              >
                <option value="public">Всем</option>
                <option value="matches">Только совпадениям</option>
                <option value="private">Никому</option>
              </select>
            </div>

            {/* Values Visibility */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  {t('settings.values_visibility')}
                </h3>
                <p className="text-sm text-gray-600">
                  Показывать ваши ценности другим
                </p>
              </div>
              <ToggleSwitch
                enabled={settings.valuesVisibility === 'all'}
                onChange={(enabled) => 
                  handleSettingChange('valuesVisibility', enabled ? 'all' : 'none')
                }
              />
            </div>

            {/* Chat Permissions */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  {t('settings.allow_chats')}
                </h3>
                <p className="text-sm text-gray-600">
                  Кто может начать с вами чат
                </p>
              </div>
              <select
                value={settings.allowChats}
                onChange={(e) => handleSettingChange('allowChats', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              >
                <option value="all">Все пользователи</option>
                <option value="matches">Только совпадения</option>
                <option value="none">Никто</option>
              </select>
            </div>
          </div>
        </div>

        {/* Language Settings */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Globe className="w-5 h-5 mr-2 text-forest-600" />
              {t('settings.language')}
            </h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  Язык интерфейса
                </h3>
                <p className="text-sm text-gray-600">
                  Выберите предпочитаемый язык
                </p>
              </div>
              <select
                value={settings.language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              >
                <option value="ru">🇷🇺 Русский</option>
                <option value="en">🇺🇸 English</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Bell className="w-5 h-5 mr-2 text-warm-600" />
              {t('settings.notifications')}
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  Новые сообщения
                </h3>
                <p className="text-sm text-gray-600">
                  Уведомления о новых сообщениях в чатах
                </p>
              </div>
              <ToggleSwitch
                enabled={settings.notifications.messages}
                onChange={(enabled) => 
                  handleSettingChange('notifications', {
                    ...settings.notifications,
                    messages: enabled
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  Новые совпадения
                </h3>
                <p className="text-sm text-gray-600">
                  Уведомления о подходящих людях
                </p>
              </div>
              <ToggleSwitch
                enabled={settings.notifications.matches}
                onChange={(enabled) => 
                  handleSettingChange('notifications', {
                    ...settings.notifications,
                    matches: enabled
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Account Actions */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <User className="w-5 h-5 mr-2 text-gray-600" />
              {t('settings.account')}
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('settings.logout')}</span>
            </button>
            
            <button
              onClick={handleDeleteAccount}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('settings.delete_account')}</span>
            </button>
          </div>
        </div>

        {/* App Info */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6">
            <div className="text-center text-sm text-gray-500">
              <p>{t('settings.version')} 1.0.0 (MVP)</p>
              <p className="mt-1">© 2025 Близкие по Духу</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;