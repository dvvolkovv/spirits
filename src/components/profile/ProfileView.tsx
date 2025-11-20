import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { CreditCard, Shield, Calendar, TrendingUp, User, Camera, Upload, LogOut, Trash2, Heart, Lightbulb, X, Coins } from 'lucide-react';
import { clsx } from 'clsx';

interface ProfileData {
  profile?: string[];
  values?: string[];
  beliefs?: string[];
  desires?: string[];
  intents?: string[];
  interests?: string[];
  skills?: string[];
  name?: string;
  family_name?: string;
  user_nickname?: string;
  completeness?: string;
  user_id?: string;
}

const ProfileView: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateProfile, updateUserInfo, updateAvatar, logout, deleteProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editingInfo, setEditingInfo] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || ''
  });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [editedData, setEditedData] = useState<ProfileData | null>(null);

  // Используем только данные с сервера (или отредактированные данные в режиме редактирования)
  const getProfileValues = () => {
    const data = isEditing ? editedData : profileData;
    if (Array.isArray(data?.values)) {
      return data.values.map(value => ({
        name: value,
        confidence: 90,
        private: false
      }));
    }
    return [];
  };

  const getProfileBeliefs = () => {
    const data = isEditing ? editedData : profileData;
    return Array.isArray(data?.beliefs) ? data.beliefs : [];
  };
  const getProfileDesires = () => {
    const data = isEditing ? editedData : profileData;
    return Array.isArray(data?.desires) ? data.desires : [];
  };
  const getProfileIntentions = () => {
    const data = isEditing ? editedData : profileData;
    return Array.isArray(data?.intents) ? data.intents : [];
  };
  const getProfileInterests = () => {
    const data = isEditing ? editedData : profileData;
    return Array.isArray(data?.interests) ? data.interests : [];
  };
  const getProfileSkills = () => {
    const data = isEditing ? editedData : profileData;
    return Array.isArray(data?.skills) ? data.skills : [];
  };
  const getProfileParams = () => {
    const data = isEditing ? editedData : profileData;
    return Array.isArray(data?.profile) ? data.profile : [];
  };
  const profile = {
    values: getProfileValues(),
    beliefs: getProfileBeliefs(),
    desires: getProfileDesires(),
    intentions: getProfileIntentions(),
    interests: getProfileInterests(),
    skills: getProfileSkills(),
    params: getProfileParams(),
  };

  // Загрузка профиля с сервера
  const loadProfileFromServer = async () => {
    if (!user?.phone) return;

    setIsLoadingProfile(true);
    
    // Очищаем номер телефона от всех символов кроме цифр
    const cleanPhone = user.phone.replace(/\D/g, '');
    
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/16279efb-08c5-4255-9ded-fdbafb507f32/profile/${cleanPhone}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

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
        
        // Извлекаем profile_data из записи
        const data: ProfileData = profileRecord.profile_data || profileRecord;
        setProfileData(data);
        
        // Обновляем имя и фамилию в контексте, если они пришли с сервера
        if (data.name || data.family_name) {
          updateUserInfo({
            firstName: data.name || user.firstName,
            lastName: data.family_name || user.lastName
          });
          setEditingInfo({
            firstName: data.name || user.firstName || '',
            lastName: data.family_name || user.lastName || ''
          });
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

  // Загрузка аватара с сервера
  const loadAvatarFromServer = async () => {
    if (!user?.phone) return;

    const cleanPhone = user.phone.replace(/\D/g, '');
    const avatarUrl = `${import.meta.env.VITE_BACKEND_URL}/webhook/0cdacf32-7bfd-4888-b24f-3a6af3b5f99e/avatar/${cleanPhone}`;

    try {
      const response = await fetch(avatarUrl);
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
    if (!user?.phone) {
      alert('Номер телефона не найден');
      return;
    }

    // Очищаем номер телефона от всех символов кроме цифр
    const cleanPhone = user.phone.replace(/\D/g, '');

    try {
      const payload: any = {
        user_id: cleanPhone,
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

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/profile-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

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

    if (!user?.phone) {
      alert('Номер телефона не найден');
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const cleanPhone = user.phone.replace(/\D/g, '');
      const uploadUrl = `${import.meta.env.VITE_BACKEND_URL}/webhook/44307ad8-9652-43b4-b63a-ca1a780e7247/avatar/${cleanPhone}`;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file
      });

      if (!response.ok) {
        throw new Error(`Ошибка загрузки аватара: ${response.status}`);
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        updateAvatar(result);
        setIsUploadingAvatar(false);
        alert('Аватар успешно загружен');
      };
      reader.onerror = () => {
        throw new Error('Ошибка при чтении файла');
      };
      reader.readAsDataURL(file);
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
    if (window.confirm('Это действие необратимо. Все ваши данные будут удалены с сервера. Удалить аккаунт?')) {
      deleteProfile().catch((error: Error) => {
        alert(`Ошибка при удалении аккаунта: ${error.message}`);
      });
    }
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
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
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
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('profile.cancel')}
              </button>
            )}
            <button
              onClick={isEditing ? handleSave : handleEdit}
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
              <h2 className="text-xl font-bold text-gray-900">
                {getUserDisplayName()}
              </h2>
              {profileData?.user_nickname && (
                <p className="text-sm text-gray-500">@{profileData.user_nickname}</p>
              )}
              <p className="text-sm text-gray-600">{user?.phone}</p>
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
              <span className="text-4xl font-bold text-forest-700">
                {user?.tokens !== undefined ? user.tokens : 0}
              </span>
              <span className="text-lg text-gray-600 ml-2">токенов</span>
            </div>

            <button
              onClick={() => window.location.href = '/chat?view=tokens'}
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
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{t('profile.phone')}:</span>
                <span className="text-sm text-gray-900">{user?.phone}</span>
              </div>
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
                <div key={index} className="flex items-start space-x-2 group">
                  <div className="w-2 h-2 bg-forest-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700 flex-1">{typeof value === 'string' ? value : value.name}</p>
                  {isEditing && (
                    <button
                      onClick={() => removeFromArray('values', index)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded flex-shrink-0"
                      title="Удалить"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  )}
                </div>
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
                <div key={index} className="flex items-start space-x-2 group">
                  <div className="w-2 h-2 bg-forest-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700 flex-1">{belief}</p>
                  {isEditing && (
                    <button
                      onClick={() => removeFromArray('beliefs', index)}
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

        {/* Desires */}
        {profile.desires.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t('profile.desires')}
            </h2>
            <div className="space-y-2">
              {profile.desires.map((desire, index) => (
                <div key={index} className="flex items-start space-x-2 group">
                  <div className="w-2 h-2 bg-warm-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700 flex-1">{desire}</p>
                  {isEditing && (
                    <button
                      onClick={() => removeFromArray('desires', index)}
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

        {/* Intentions */}
        {profile.intentions.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t('profile.intentions')}
            </h2>
            <div className="space-y-2">
              {profile.intentions.map((intention, index) => (
                <div key={index} className="flex items-start space-x-2 group">
                  <div className="w-2 h-2 bg-earth-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700 flex-1">{intention}</p>
                  {isEditing && (
                    <button
                      onClick={() => removeFromArray('intents', index)}
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

        {/* Interests */}
        {profile.interests.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Интересы
            </h2>
            <div className="space-y-2">
              {profile.interests.map((interest, index) => (
                <div key={index} className="flex items-start space-x-2 group">
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700 flex-1">{interest}</p>
                  {isEditing && (
                    <button
                      onClick={() => removeFromArray('interests', index)}
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

        {/* Skills */}
        {profile.skills.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Навыки
            </h2>
            <div className="space-y-2">
              {profile.skills.map((skill, index) => (
                <div key={index} className="flex items-start space-x-2 group">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700 flex-1">{skill}</p>
                  {isEditing && (
                    <button
                      onClick={() => removeFromArray('skills', index)}
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
    </div>
  );
};

export default ProfileView;