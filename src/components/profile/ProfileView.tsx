import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { CreditCard, Calendar, TrendingUp, User, Camera, Upload, LogOut, Trash2, X, Coins, Settings2, ChevronDown, ChevronUp, Send, Handshake } from 'lucide-react';
import { clsx } from 'clsx';
import { apiClient } from '../../services/apiClient';
import { EntityItem, EntityRich } from './EntityItem';
import SettingsView from '../settings/SettingsView';
import ReferralDashboard from './ReferralDashboard';
import ProfileTasks from './ProfileTasks';
import InviteFriendBlock from './InviteFriendBlock';
import { tgBotApi, type IdentityStatus } from '../../services/tgBotApi';

interface ProfileData {
  profile?: string[];
  values?: string[];
  beliefs?: string[];
  desires?: string[];
  intents?: string[];
  interests?: string[];
  skills?: string[];
  // Rich-формат: канонические группы с персональным gloss и aliases.
  valuesRich?: EntityRich[];
  beliefsRich?: EntityRich[];
  desiresRich?: EntityRich[];
  intentsRich?: EntityRich[];
  interestsRich?: EntityRich[];
  skillsRich?: EntityRich[];
  name?: string;
  family_name?: string;
  user_nickname?: string;
  completeness?: string;
  user_id?: string;
}

const toRich = (plain?: string[], rich?: EntityRich[]): EntityRich[] => {
  if (Array.isArray(rich) && rich.length) return rich;
  if (Array.isArray(plain)) return plain.map((name) => ({ name }));
  return [];
};

const ProfileView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUserInfo, updateAvatar, logout, deleteProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editingInfo, setEditingInfo] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || ''
  });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [editedData, setEditedData] = useState<ProfileData | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tgIdentity, setTgIdentity] = useState<IdentityStatus | null>(null);

  // Используем данные с сервера (или отредактированные в режиме редактирования).
  // В edit-режиме — только plain (индексы должны совпадать с editedData.<field> для removeFromArray).
  // В view-режиме — приоритет rich-полей (gloss/aliases для tooltip).
  const data = isEditing ? editedData : profileData;
  const profile = {
    values:     isEditing ? toRich(data?.values)     : toRich(data?.values,     data?.valuesRich),
    beliefs:    isEditing ? toRich(data?.beliefs)    : toRich(data?.beliefs,    data?.beliefsRich),
    desires:    isEditing ? toRich(data?.desires)    : toRich(data?.desires,    data?.desiresRich),
    intentions: isEditing ? toRich(data?.intents)    : toRich(data?.intents,    data?.intentsRich),
    interests:  isEditing ? toRich(data?.interests)  : toRich(data?.interests,  data?.interestsRich),
    skills:     isEditing ? toRich(data?.skills)     : toRich(data?.skills,     data?.skillsRich),
    params:     Array.isArray(data?.profile) ? data.profile : [],
  };

  // Загрузка профиля с сервера
  const loadProfileFromServer = async () => {
    if (!user?.phone) return;

    setIsLoadingProfile(true);

    try {
      const response = await apiClient.get(`/webhook/profile`);

      if (response.ok) {
        const responseData = await response.json();

        // Проверяем, является ли ответ массивом
        let profileRecord;
        if (Array.isArray(responseData) && responseData.length > 0) {
          // Берем первый элемент массива
          profileRecord = responseData[0];
        } else if (responseData && typeof responseData === 'object') {
          // Если это объект, используем его напрямую
          profileRecord = responseData;
        } else {
          throw new Error('Неожиданный формат ответа сервера');
        }

        // Извлекаем данные профиля из записи
        // Поддерживаем оба формата: profileJson (новый) и profile_data (старый)
        const data: ProfileData = profileRecord.profileJson || profileRecord.profile_data || profileRecord;
        setProfileData(data);

        // Обновляем данные пользователя в контексте
        const updates: any = {};

        if (data.name || data.family_name) {
          updates.firstName = data.name || user.firstName;
          updates.lastName = data.family_name || user.lastName;
          setEditingInfo({
            firstName: data.name || user.firstName || '',
            lastName: data.family_name || user.lastName || ''
          });
        }

        if (Object.keys(updates).length > 0) {
          updateUserInfo(updates);
        }
      } else {
        console.warn('Профиль не найден на сервере, используем локальные данные');
      }
    } catch (error) {
      console.error('Ошибка при загрузке профиля:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Загружаем профиль и аватар при монтировании компонента
  React.useEffect(() => {
    loadProfileFromServer();
    loadAvatarFromServer();
  }, [user?.phone]);

  useEffect(() => {
    tgBotApi.identityStatus().then(setTgIdentity).catch(() => {});
  }, []);

  // Загрузка аватара с сервера
  const loadAvatarFromServer = async (bypassCache = false) => {
    if (!user?.phone) return;

    try {
      // Добавляем параметр для обхода кеша браузера при необходимости
      const url = bypassCache 
        ? `/webhook/avatar?t=${Date.now()}`
        : '/webhook/avatar';
      
      const response = await apiClient.get(url);
      if (response.ok) {
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          updateAvatar(base64data);
        };
        reader.readAsDataURL(blob);
      }
    } catch (error) {
      console.error('Ошибка при загрузке аватара:', error);
    }
  };

  const handleEdit = () => {
    if (!isEditing) {
      // Entering edit mode - copy current data to edited state
      setEditedData(JSON.parse(JSON.stringify(profileData || {})));
    }
    setIsEditing(!isEditing);
  };

  const handleSave = () => {
    // Save all changes to server
    updateProfileOnServer();
  };

  const updateProfileOnServer = async () => {
    // Очищаем номер телефона от всех символов кроме цифр
    try {
      const payload: any = {
        name: editingInfo.firstName,
        family_name: editingInfo.lastName
      };

      // Add all edited arrays if they exist
      if (editedData?.values) payload.values = editedData.values;
      if (editedData?.beliefs) payload.beliefs = editedData.beliefs;
      if (editedData?.desires) payload.desires = editedData.desires;
      if (editedData?.intents) payload.intents = editedData.intents;
      if (editedData?.interests) payload.interests = editedData.interests;
      if (editedData?.skills) payload.skills = editedData.skills;
      if (editedData?.profile) payload.profile = editedData.profile;

      const response = await apiClient.post('/webhook/profile-update', payload);

      if (!response.ok) {
        throw new Error(`Ошибка обновления профиля: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Обновляем локальные данные только после успешного сохранения на сервере
        updateUserInfo({
          firstName: editingInfo.firstName,
          lastName: editingInfo.lastName
        });

        // Перезагружаем профиль с сервера для получения актуальных данных
        await loadProfileFromServer();

        setIsEditing(false);
        setEditedData(null);
        alert('Профиль успешно обновлен');
      } else {
        throw new Error('Сервер вернул ошибку');
      }
    } catch (error) {
      console.error('Ошибка при обновлении профиля:', error);
      alert(`Ошибка при обновлении профиля: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  };

  const handleCancel = () => {
    setEditingInfo({
      firstName: user?.firstName || '',
      lastName: user?.lastName || ''
    });
    setEditedData(null);
    setIsEditing(false);
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Размер файла не должен превышать 5MB');
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const response = await apiClient.request('/webhook/avatar', {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file
      });

      if (!response.ok) {
        throw new Error(`Ошибка загрузки аватара: ${response.status}`);
      }

      // Перезагружаем аватар с сервера с параметром для обхода кеша браузера
      await loadAvatarFromServer(true);
      
      setIsUploadingAvatar(false);
      //alert('Аватар успешно загружен');
    } catch (error) {
      console.error('Ошибка при загрузке аватара:', error);
      alert(`Ошибка при загрузке аватара: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      setIsUploadingAvatar(false);
    }
  };

  const getAvatarInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    // Используем данные с сервера, если они есть
    if (profileData?.name && profileData?.family_name) {
      return `${profileData.name} ${profileData.family_name}`;
    }
    if (profileData?.name) {
      return profileData.name;
    }
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) {
      return user.firstName;
    }
    return 'Пользователь';
  };

  const handleLogout = () => {
    if (window.confirm('Вы уверены, что хотите выйти?')) {
      logout();
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteAccount = () => {
    setShowDeleteConfirm(false);
    deleteProfile().catch((error: Error) => {
      alert(`Ошибка при удалении аккаунта: ${error.message}`);
    });
  };

  const removeFromArray = (field: keyof ProfileData, index: number) => {
    if (!editedData) return;

    const currentArray = editedData[field];
    if (!Array.isArray(currentArray)) return;

    const newArray = currentArray.filter((_, i) => i !== index);
    setEditedData({
      ...editedData,
      [field]: newArray
    });
  };

  return (
    <div data-testid="profile-root" className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            {t('profile.title')}
          </h1>
          <div className="flex space-x-2">
            <button
              onClick={loadProfileFromServer}
              disabled={isLoadingProfile}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isLoadingProfile ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                'Обновить'
              )}
            </button>
            {isEditing && (
              <button
                onClick={handleCancel}
                data-testid="profile-cancel-btn"
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('profile.cancel')}
              </button>
            )}
            <button
              onClick={isEditing ? handleSave : handleEdit}
              data-testid={isEditing ? 'profile-save-btn' : 'profile-edit-btn'}
              className={clsx(
                'px-4 py-2 rounded-lg font-medium transition-colors',
                isEditing
                  ? 'bg-forest-600 hover:bg-forest-700 text-white'
                  : 'bg-warm-600 hover:bg-warm-700 text-white'
              )}
            >
              {isEditing ? t('profile.save') : t('profile.edit')}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 pb-20 md:pb-4 space-y-6 overflow-y-auto">
        {/* Loading indicator */}
        {isLoadingProfile && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-blue-800">Загружаем профиль с сервера...</span>
            </div>
          </div>
        )}

        {/* Profile Photo */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 bg-gradient-to-br from-forest-500 to-warm-500 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                  <span className="text-white font-bold text-2xl">
                    {getAvatarInitials(getUserDisplayName())}
                  </span>
                </div>
              )}
              
              {/* Upload button overlay */}
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-forest-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-forest-700 transition-colors shadow-lg">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={isUploadingAvatar}
                />
                {isUploadingAvatar ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-white" />
                )}
              </label>
            </div>
            
            <div className="text-center">
              <h2 data-testid="profile-name" className="text-xl font-bold text-gray-900">
                {getUserDisplayName()}
              </h2>
              {profileData?.user_nickname && (
                <p className="text-sm text-gray-500">@{profileData.user_nickname}</p>
              )}
              <p data-testid="profile-phone" className="text-sm text-gray-600">{user?.phone || user?.email}</p>
            </div>
            
            <label className="flex items-center space-x-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
                disabled={isUploadingAvatar}
              />
              <Upload className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-700">
                {isUploadingAvatar ? 'Загрузка...' : 'Изменить фото'}
              </span>
            </label>
          </div>
        </div>
        {/* Token Balance */}
        <div className="bg-gradient-to-br from-forest-50 to-warm-50 rounded-lg shadow-sm p-6 border border-forest-200">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-forest-500 to-warm-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">Баланс токенов</h2>
              <p className="text-sm text-gray-600">Используется для общения с ассистентом</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-baseline">
              <span data-testid="profile-token-balance" className="text-4xl font-bold text-forest-700">
                {user?.tokens !== undefined ? user.tokens : 0}
              </span>
              <span className="text-lg text-gray-600 ml-2">токенов</span>
            </div>

            <button
              onClick={() => navigate('/chat?view=tokens')}
              className="flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-forest-600 to-warm-600 text-white rounded-lg hover:from-forest-700 hover:to-warm-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 w-full sm:w-auto"
            >
              <CreditCard className="w-5 h-5" />
              <span className="font-medium">Пополнить</span>
            </button>
          </div>

          {user?.tokens !== undefined && user.tokens < 10 && (
            <div className="mt-4 p-3 bg-warm-100 border border-warm-300 rounded-lg">
              <p className="text-sm text-warm-800">
                <span className="font-semibold">Низкий баланс!</span> Пополните токены для продолжения общения с ассистентом.
              </p>
            </div>
          )}
        </div>

        {/* Invite a friend (referral entry point) */}
        <InviteFriendBlock />

        {/* Telegram identity — для привязки своего TG к Студии (создание ботов) */}
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-500" />
            Telegram
          </h2>
            {tgIdentity?.bound ? (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                Привязан
                {tgIdentity.tgUsername && <span className="text-blue-600 font-medium">@{tgIdentity.tgUsername}</span>}
                {!tgIdentity.tgUsername && tgIdentity.tgFirstName && <span className="text-gray-600">{tgIdentity.tgFirstName}</span>}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Не привязан</span>
                <button
                  onClick={() => navigate('/telegram-bots/new')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Привязать →
                </button>
              </div>
          )}
        </div>

        {/* Personal Information */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2 text-forest-600" />
            {t('profile.personal_info')}
          </h2>
          
          {isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('profile.first_name')}
                </label>
                <input
                  type="text"
                  data-testid="profile-name-input"
                  value={editingInfo.firstName}
                  onChange={(e) => setEditingInfo(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder={t('profile.first_name_placeholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-colors"
                  maxLength={50}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('profile.last_name')}
                </label>
                <input
                  type="text"
                  data-testid="profile-lastname-input"
                  value={editingInfo.lastName}
                  onChange={(e) => setEditingInfo(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder={t('profile.last_name_placeholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-colors"
                  maxLength={50}
                />
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-gray-500">
                  {t('profile.name_help_text')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{t('profile.first_name')}:</span>
                <span className="text-sm text-gray-900">
                  {profileData?.name || user?.firstName || t('profile.not_specified')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{t('profile.last_name')}:</span>
                <span className="text-sm text-gray-900">
                  {profileData?.family_name || user?.lastName || t('profile.not_specified')}
                </span>
              </div>
              {profileData?.user_nickname && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Никнейм:</span>
                  <span className="text-sm text-gray-900">@{profileData.user_nickname}</span>
                </div>
              )}
              {(user?.phone || user?.email) && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {user?.phone ? t('profile.phone') : 'Email'}:
                  </span>
                  <span className="text-sm text-gray-900">{user?.phone || user?.email}</span>
                </div>
              )}
              {(!profileData?.name && !user?.firstName || !profileData?.family_name && !user?.lastName) && (
                <div className="mt-3 p-3 bg-warm-50 border border-warm-200 rounded-lg">
                  <p className="text-sm text-warm-800">
                    {t('profile.complete_name_prompt')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Settings — collapsible аккордеон сразу после личной информации */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
          >
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Settings2 className="w-5 h-5 mr-2 text-forest-600" />
              {t('settings.title')}
            </h2>
            {showSettings
              ? <ChevronUp className="w-5 h-5 text-gray-400" />
              : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>
          {showSettings && (
            <div className="px-4 pb-4 border-t border-gray-100">
              <div className="pt-4">
                <SettingsView />
              </div>
            </div>
          )}
        </div>

        {/* Referral — collapsible аккордеон по тому же паттерну что и Settings. */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowReferral((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
          >
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Handshake className="w-5 h-5 mr-2 text-forest-600" />
              {t('nav.referral')}
            </h2>
            {showReferral
              ? <ChevronUp className="w-5 h-5 text-gray-400" />
              : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>
          {showReferral && (
            <div className="px-4 pb-4 border-t border-gray-100">
              <div className="pt-4">
                <ReferralDashboard />
              </div>
            </div>
          )}
        </div>

        {/* Values */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-forest-600" />
              {t('profile.values')}
            </h2>
          </div>
          {profile.values.length > 0 ? (
            <div className="space-y-2">
              {profile.values.map((value, index) => (
                <EntityItem
                  key={index}
                  item={value}
                  dotColor="bg-forest-500"
                  isEditing={isEditing}
                  onRemove={() => removeFromArray('values', index)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                Ценности не указаны. Начните общение с ассистентом для их определения.
              </p>
            </div>
          )}
        </div>

        {/* Profile Parameters */}
        {profile.params.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Параметры профиля
            </h2>
            <div className="space-y-2">
              {profile.params.map((param, index) => (
                <div key={index} className="flex items-start space-x-2 group">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700 flex-1">{param}</p>
                  {isEditing && (
                    <button
                      onClick={() => removeFromArray('profile', index)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded flex-shrink-0"
                      title="Удалить"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Beliefs */}
        {profile.beliefs.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t('profile.beliefs')}
            </h2>
            <div className="space-y-2">
              {profile.beliefs.map((belief, index) => (
                <EntityItem
                  key={index}
                  item={belief}
                  dotColor="bg-forest-500"
                  isEditing={isEditing}
                  onRemove={() => removeFromArray('beliefs', index)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Desires */}
        {profile.desires.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t('profile.desires')}
            </h2>
            <div className="space-y-2">
              {profile.desires.map((desire, index) => (
                <EntityItem
                  key={index}
                  item={desire}
                  dotColor="bg-warm-500"
                  isEditing={isEditing}
                  onRemove={() => removeFromArray('desires', index)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Intentions */}
        {profile.intentions.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t('profile.intentions')}
            </h2>
            <div className="space-y-2">
              {profile.intentions.map((intention, index) => (
                <EntityItem
                  key={index}
                  item={intention}
                  dotColor="bg-earth-500"
                  isEditing={isEditing}
                  onRemove={() => removeFromArray('intents', index)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Interests */}
        {profile.interests.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Интересы
            </h2>
            <div className="space-y-2">
              {profile.interests.map((interest, index) => (
                <EntityItem
                  key={index}
                  item={interest}
                  dotColor="bg-red-500"
                  isEditing={isEditing}
                  onRemove={() => removeFromArray('interests', index)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {profile.skills.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Навыки
            </h2>
            <div className="space-y-2">
              {profile.skills.map((skill, index) => (
                <EntityItem
                  key={index}
                  item={skill}
                  dotColor="bg-yellow-500"
                  isEditing={isEditing}
                  onRemove={() => removeFromArray('skills', index)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tasks */}
        <ProfileTasks />

        {/* Empty state when no data */}
        {!profileData && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Профиль не найден
              </h3>
              <p className="text-gray-600 mb-4">
                Начните общение с ассистентом для создания профиля
              </p>
              <button
                onClick={() => window.location.href = '/chat'}
                className="px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors"
              >
                Перейти к чату
              </button>
            </div>
          </div>
        )}


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
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('settings.delete_account')}</span>
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-gray-600" />
            {t('profile.timeline')}
          </h2>
          <div className="space-y-3">
            {profileData && (
              <div className="flex items-center space-x-3 text-sm">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-gray-500">Сейчас</span>
                <span className="text-gray-900">Профиль загружен с сервера</span>
              </div>
            )}
            <div className="flex items-center space-x-3 text-sm">
              <div className="w-2 h-2 bg-forest-500 rounded-full" />
              <span className="text-gray-500">История</span>
              <span className="text-gray-900">
                {profileData ? 'Профиль обновляется через общение с ассистентом' : 'Профиль будет создан после первого общения с ассистентом'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>

            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
              Удалить аккаунт?
            </h3>

            <div className="mb-6 space-y-3">
              <p className="text-gray-700 text-center">
                Это действие необратимо. Будут удалены:
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start space-x-2">
                  <span className="text-red-500 font-bold">•</span>
                  <span>Все личные данные и профиль</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-red-500 font-bold">•</span>
                  <span>История общения с ассистентами</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-red-500 font-bold">•</span>
                  <span>Баланс токенов</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-red-500 font-bold">•</span>
                  <span>Все настройки и предпочтения</span>
                </li>
              </ul>
              <p className="text-red-600 font-semibold text-center mt-4">
                Восстановление данных будет невозможно
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Отмена
              </button>
              <button
                onClick={confirmDeleteAccount}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Удалить навсегда
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileView;