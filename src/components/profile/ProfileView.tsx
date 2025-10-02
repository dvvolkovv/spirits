import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { CreditCard as Edit2, Shield, Calendar, TrendingUp, User, Camera, Upload } from 'lucide-react';
import { clsx } from 'clsx';

interface ProfileData {
  profile?: string[];
  values?: string[];
  beliefs?: string[];
  desires?: string[];
  intents?: string[];
  name?: string;
  family_name?: string;
  user_nickname?: string;
  completeness?: string;
  user_id?: string;
}

const ProfileView: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateProfile, updateUserInfo, updateAvatar } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editingInfo, setEditingInfo] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || ''
  });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);

  // Используем только данные с сервера
  const getProfileValues = () => {
    if (Array.isArray(profileData?.values)) {
      return profileData.values.map(value => ({
        name: value,
        confidence: 90, // Значение по умолчанию
        private: false
      }));
    }
    return [];
  };

  const getProfileBeliefs = () => Array.isArray(profileData?.beliefs) ? profileData.beliefs : [];
  const getProfileDesires = () => Array.isArray(profileData?.desires) ? profileData.desires : [];
  const getProfileIntentions = () => Array.isArray(profileData?.intents) ? profileData.intents : [];
  const getProfileCompletion = () => profileData?.completeness ? parseInt(profileData.completeness) : 0;

  const profile = {
    values: getProfileValues(),
    beliefs: getProfileBeliefs(),
    desires: getProfileDesires(),
    intentions: getProfileIntentions(),
    completion: getProfileCompletion(),
  };

  // Загрузка профиля с сервера
  const loadProfileFromServer = async () => {
    if (!user?.phone) return;

    setIsLoadingProfile(true);
    
    // Очищаем номер телефона от всех символов кроме цифр
    const cleanPhone = user.phone.replace(/\D/g, '');
    
    try {
      const response = await fetch(`https://travel-n8n.up.railway.app/webhook/16279efb-08c5-4255-9ded-fdbafb507f32/profile/${cleanPhone}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const data: ProfileData = await response.json();
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

  // Загружаем профиль при монтировании компонента
  React.useEffect(() => {
    loadProfileFromServer();
  }, [user?.phone]);

  const handleEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleSave = () => {
    // Save user info changes
    if (editingInfo.firstName !== user?.firstName || editingInfo.lastName !== user?.lastName) {
      updateUserInfo({
        firstName: editingInfo.firstName,
        lastName: editingInfo.lastName
      });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditingInfo({
      firstName: user?.firstName || '',
      lastName: user?.lastName || ''
    });
    setIsEditing(false);
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Размер файла не должен превышать 5MB');
      return;
    }

    setIsUploadingAvatar(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      updateAvatar(result);
      setIsUploadingAvatar(false);
    };
    reader.onerror = () => {
      alert('Ошибка при загрузке файла');
      setIsUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
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

        {/* Profile Completion */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {t('profile.completion')}
            </h2>
            <span className="text-2xl font-bold text-blue-600">
              {profile.completion}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-forest-500 to-warm-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${profile.completion}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {profileData 
              ? 'Данные загружены с сервера' 
              : profile.completion === 0 
                ? 'Профиль не найден. Начните общение с ассистентом для создания профиля'
                : 'Продолжайте общение с ассистентом для улучшения профиля'
            }
          </p>
        </div>

        {/* Values */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-forest-600" />
              {t('profile.values')}
            </h2>
            {isEditing && (
              <button className="text-blue-600 hover:text-blue-800 text-sm">
                {t('profile.add_value')}
              </button>
            )}
          </div>
          {profile.values.length > 0 ? (
            <div className="grid gap-3">
              {profile.values.map((value, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className="font-medium text-gray-900">{typeof value === 'string' ? value : value.name}</span>
                    {typeof value === 'object' && value.private && (
                      <Shield className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                  {typeof value === 'object' && (
                    <div className="flex items-center space-x-2">
                      <div className="text-sm text-gray-600">
                        {value.confidence}%
                      </div>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-forest-500 h-2 rounded-full"
                          style={{ width: `${value.confidence}%` }}
                        />
                      </div>
                    </div>
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
        {profileData?.profile && profileData.profile.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Параметры профиля
            </h2>
            <div className="space-y-2">
              {profileData.profile.map((param, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700">{param}</p>
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
                <div key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-forest-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700">{belief}</p>
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
                <div key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-warm-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700">{desire}</p>
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
                <div key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-earth-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700">{intention}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no data */}
        {!profileData && profile.completion === 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Профиль не найден
              </h3>
              <p className="text-gray-600 mb-4">
                Начните общение с ассистентом для создания и заполнения профиля
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