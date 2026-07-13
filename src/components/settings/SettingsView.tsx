import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { APP_BUILD } from '../../buildInfo';
import {
  Shield,
  Globe,
  Bell,
  Eye,
  EyeOff,
  MessageCircle,
  UserCheck
} from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import LinkedAccountsView from './LinkedAccountsView';
import RoutinesManager from './RoutinesManager';
import {
  pushSupported,
  isPushSubscribed,
  enablePush,
  disablePush,
  sendTestPush,
} from '../../services/pushClient';

type ContactVisibility = 'public' | 'matchOnly' | 'private';

const SettingsView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
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

  const [contactVisibility, setContactVisibility] = useState<ContactVisibility>('matchOnly');
  const [contactVisibilitySaving, setContactVisibilitySaving] = useState(false);
  useEffect(() => {
    apiClient.get('/webhook/contact-visibility')
      .then(async (r) => { if (r.ok) { const d = await r.json(); if (d?.visibility) setContactVisibility(d.visibility); } })
      .catch(() => {/* ignore */});
  }, []);
  const changeContactVisibility = async (v: ContactVisibility) => {
    const prev = contactVisibility;
    setContactVisibility(v);
    setContactVisibilitySaving(true);
    try {
      const r = await apiClient.post('/webhook/contact-visibility', { visibility: v });
      if (!r.ok) setContactVisibility(prev);
    } catch {
      setContactVisibility(prev);
    } finally {
      setContactVisibilitySaving(false);
    }
  };

  // Push-уведомления на это устройство (PWA / браузер). Реальный опт-ин через
  // PushManager + бэкенд, в отличие от локальных тумблеров ниже.
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const canPush = pushSupported();
  useEffect(() => {
    if (canPush) isPushSubscribed().then(setPushOn).catch(() => {});
  }, [canPush]);
  const togglePush = async () => {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        const ok = await enablePush();
        setPushOn(ok);
        if (!ok) setPushMsg('Не удалось включить. Проверь, что уведомления разрешены в браузере.');
      }
    } finally {
      setPushBusy(false);
    }
  };
  const testPush = async () => {
    setPushBusy(true);
    setPushMsg(null);
    try {
      const ok = await sendTestPush();
      setPushMsg(ok ? 'Отправили тестовое уведомление ✅' : 'Не получилось отправить.');
    } finally {
      setPushBusy(false);
    }
  };

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
    <div className="space-y-6">
        {/* Push на это устройство — реальный опт-ин (PWA / браузер) */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Bell className="w-5 h-5 mr-2 text-forest-600" />
              Уведомления на этом устройстве
            </h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <h3 className="text-sm font-medium text-gray-900">Push-уведомления</h3>
                <p className="text-sm text-gray-600">
                  Ответы ассистентов, готовое видео и напоминания будут приходить, даже когда вкладка закрыта.
                  {' '}Установи Linkeon на домашний экран — и это будет как обычное приложение.
                </p>
              </div>
              <ToggleSwitch enabled={pushOn} onChange={togglePush} disabled={!canPush || pushBusy} />
            </div>
            {pushOn && (
              <button
                onClick={testPush}
                disabled={pushBusy}
                className="text-sm text-forest-600 hover:text-forest-700 font-medium disabled:opacity-50"
              >
                Отправить тестовое уведомление
              </button>
            )}
            {!canPush && (
              <p className="text-xs text-gray-500">
                Этот браузер не поддерживает push. На iPhone: открой в Safari, «Поделиться» → «На экран Домой», затем включи здесь.
              </p>
            )}
            {pushMsg && <p className="text-xs text-gray-600">{pushMsg}</p>}
          </div>
        </div>

        {/* Мои напоминания — проактивные рутинные пуши от ассистентов (Слой 3, обобщённые) */}
        <RoutinesManager />

        {/* Contact Visibility — кто может получить твой контакт (phone) через поиск */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <UserCheck className="w-5 h-5 mr-2 text-forest-600" />
              Видимость контакта
            </h2>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-600">
              Кто может получить твой номер телефона, когда найдёт тебя через поиск единомышленников.
            </p>
            {([
              { v: 'public',    title: 'Публичный',       desc: 'Любой авторизованный пользователь сразу видит твой телефон.' },
              { v: 'matchOnly', title: 'По запросу',      desc: 'Телефон скрыт. Другие видят профиль и могут прислать запрос на контакт — ты сам решаешь, принимать или нет.' },
              { v: 'private',   title: 'Закрытый',        desc: 'Телефон скрыт. Запросы на контакт автоматически не принимаются.' },
            ] as Array<{ v: ContactVisibility; title: string; desc: string }>).map((opt) => (
              <label key={opt.v} className={clsx(
                'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                contactVisibility === opt.v ? 'border-forest-500 bg-forest-50' : 'border-gray-200 hover:bg-gray-50',
                contactVisibilitySaving && 'opacity-60 cursor-wait',
              )}>
                <input
                  type="radio"
                  name="contactVisibility"
                  value={opt.v}
                  checked={contactVisibility === opt.v}
                  onChange={() => !contactVisibilitySaving && changeContactVisibility(opt.v)}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">{opt.title}</div>
                  <div className="text-xs text-gray-600">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Linked Accounts */}
        <LinkedAccountsView />

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
                  {t('settings.profile_visibility_desc')}
                </p>
              </div>
              <select
                value={settings.profileVisibility}
                onChange={(e) => handleSettingChange('profileVisibility', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              >
                <option value="public">{t('settings.visibility.all')}</option>
                <option value="matches">{t('settings.visibility.matches')}</option>
                <option value="private">{t('settings.visibility.private')}</option>
              </select>
            </div>

            {/* Values Visibility */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  {t('settings.values_visibility')}
                </h3>
                <p className="text-sm text-gray-600">
                  {t('settings.values_visibility_desc')}
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
                  {t('settings.allow_chats_desc')}
                </p>
              </div>
              <select
                value={settings.allowChats}
                onChange={(e) => handleSettingChange('allowChats', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              >
                <option value="all">{t('settings.chat_access.all')}</option>
                <option value="matches">{t('settings.chat_access.matches')}</option>
                <option value="none">{t('settings.chat_access.none')}</option>
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
                  {t('settings.language_title')}
                </h3>
                <p className="text-sm text-gray-600">
                  {t('settings.language_desc')}
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
                  {t('settings.new_messages')}
                </h3>
                <p className="text-sm text-gray-600">
                  {t('settings.new_messages_desc')}
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
                  {t('settings.new_matches')}
                </h3>
                <p className="text-sm text-gray-600">
                  {t('settings.new_matches_desc')}
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

        <p className="mt-8 text-center text-xs text-gray-400">
          Linkeon · сборка {APP_BUILD}
        </p>

    </div>
  );
};

export default SettingsView;