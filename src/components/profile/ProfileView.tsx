import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { CreditCard as Edit2, Shield, Calendar, TrendingUp, User, Camera, Upload } from 'lucide-react';
import { clsx } from 'clsx';

const ProfileView: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateProfile, updateUserInfo, updateAvatar } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editingInfo, setEditingInfo] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || ''
  });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const mockProfile = {
    values: [
      { name: 'Честность', confidence: 95, private: false },
      { name: 'Креативность', confidence: 88, private: false },
      { name: 'Семья', confidence: 92, private: true },
      { name: 'Саморазвитие', confidence: 85, private: false },
    ],
    beliefs: [
      'Важность баланса между работой и личной жизнью',
      'Каждый человек уникален и ценен',
      'Непрерывное обучение - ключ к успеху',
    ],
    desires: [
      'Создать собственный проект',
      'Путешествовать по миру',
      'Найти единомышленников',
    ],
    intentions: [
      'Изучить новый навык в этом году',
      'Расширить круг общения',
      'Запустить социальный проект',
    ],
    completion: 78,
  };

  const profile = user?.profile || mockProfile;

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
                  ? 'bg-primary-600 hover:bg-primary-700 text-white'
                  : 'bg-warm-600 hover:bg-warm-700 text-white'
              )}
            >
              {isEditing ? t('profile.save') : t('profile.edit')}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 pb-20 md:pb-4 space-y-6 overflow-y-auto">
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
                <div className="w-24 h-24 bg-gradient-to-br from-primary-500 to-warm-500 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                  <span className="text-white font-bold text-2xl">
                    {getAvatarInitials(getUserDisplayName())}
                  </span>
                </div>
              )}
              
              {/* Upload button overlay */}
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-700 transition-colors shadow-lg">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
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
                  {user?.firstName || t('profile.not_specified')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{t('profile.last_name')}:</span>
                <span className="text-sm text-gray-900">
                  {user?.lastName || t('profile.not_specified')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{t('profile.phone')}:</span>
                <span className="text-sm text-gray-900">{user?.phone}</span>
              </div>
              {(!user?.firstName || !user?.lastName) && (
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
              className="bg-gradient-to-r from-primary-500 to-warm-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${profile.completion}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Продолжайте общение с ассистентом для улучшения профиля
          </p>
        </div>

        {/* Values */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-primary-600" />
              {t('profile.values')}
            </h2>
            {isEditing && (
              <button className="text-blue-600 hover:text-blue-800 text-sm">
                {t('profile.add_value')}
              </button>
            )}
          </div>
          <div className="grid gap-3">
            {profile.values.map((value, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <span className="font-medium text-gray-900">{value.name}</span>
                  {value.private && (
                    <Shield className="w-4 h-4 text-gray-500" />
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <div className="text-sm text-gray-600">
                    {value.confidence}%
                  </div>
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full"
                      style={{ width: `${value.confidence}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Beliefs */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {t('profile.beliefs')}
          </h2>
          <div className="space-y-2">
            {profile.beliefs.map((belief, index) => (
              <div key={index} className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />
                <p className="text-gray-700">{belief}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Desires */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {t('profile.desires')}
          </h2>
          <div className="space-y-2">
            {profile.desires.map((desire, index) => (
              <div key={index} className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-secondary-500 rounded-full mt-2 flex-shrink-0" />
                <p className="text-gray-700">{desire}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Intentions */}
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

        {/* Timeline */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-gray-600" />
            {t('profile.timeline')}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center space-x-3 text-sm">
              <div className="w-2 h-2 bg-primary-500 rounded-full" />
              <span className="text-gray-500">2 дня назад</span>
              <span className="text-gray-900">Добавлена ценность "Креативность"</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <div className="w-2 h-2 bg-secondary-500 rounded-full" />
              <span className="text-gray-500">5 дней назад</span>
              <span className="text-gray-900">Обновлено намерение: "Изучить новый навык"</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <div className="w-2 h-2 bg-earth-500 rounded-full" />
              <span className="text-gray-500">1 неделя назад</span>
              <span className="text-gray-900">Профиль создан</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileView;