import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, User, TrendingUp, Calendar, MessageCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface UserMatch {
  id: string;
  name: string;
  avatar?: string;
  values: string[];
  intents: string[];
  corellation: number;
  phone?: string;
}

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

interface UserProfileModalProps {
  user: UserMatch;
  isOpen: boolean;
  onClose: () => void;
  onStartChat: (user: UserMatch) => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onStartChat
}) => {
  const { t } = useTranslation();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Загрузка профиля с сервера
  const loadUserProfile = async () => {
    if (!user.phone) return;

    setIsLoading(true);
    
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
        
        // Извлекаем данные профиля из записи
        // Поддерживаем оба формата: profileJson (новый) и profile_data (старый)
        const data: ProfileData = profileRecord.profileJson || profileRecord.profile_data || profileRecord;
        setProfileData(data);
      } else {
        console.warn('Профиль не найден на сервере');
      }
    } catch (error) {
      console.error('Ошибка при загрузке профиля:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Загружаем профиль при открытии модального окна
  useEffect(() => {
    if (isOpen && user.phone) {
      loadUserProfile();
    }
  }, [isOpen, user.phone]);

  // Сброс данных при закрытии
  useEffect(() => {
    if (!isOpen) {
      setProfileData(null);
    }
  }, [isOpen]);

  const getAvatarInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (profileData?.name && profileData?.family_name) {
      return `${profileData.name} ${profileData.family_name}`;
    }
    if (profileData?.name) {
      return profileData.name;
    }
    return user.name;
  };

  const getProfileValues = () => {
    if (Array.isArray(profileData?.values)) {
      return profileData.values;
    }
    return user.values || [];
  };

  const getProfileBeliefs = () => Array.isArray(profileData?.beliefs) ? profileData.beliefs : [];
  const getProfileDesires = () => Array.isArray(profileData?.desires) ? profileData.desires : [];
  const getProfileIntentions = () => Array.isArray(profileData?.intents) ? profileData.intents : user.intents || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-white shadow-sm px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Профиль пользователя
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-6">
          {/* Loading indicator */}
          {isLoading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-blue-800">Загружаем профиль...</span>
              </div>
            </div>
          )}

          {/* Profile Photo */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="w-24 h-24 bg-gradient-to-br from-forest-500 to-warm-500 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                <span className="text-white font-bold text-2xl">
                  {getAvatarInitials(getUserDisplayName())}
                </span>
              </div>
              
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900">
                  {getUserDisplayName()}
                </h2>
                {profileData?.user_nickname && (
                  <p className="text-sm text-gray-500">@{profileData.user_nickname}</p>
                )}
                <div className="flex items-center justify-center space-x-2 mt-2">
                  <span className="text-sm text-blue-600 font-medium">
                    Совпадение: {Math.round(user.corellation * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Values */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-forest-600" />
              Ценности
            </h2>
            {getProfileValues().length > 0 ? (
              <div className="space-y-2">
                {getProfileValues().map((value, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-forest-500 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-gray-700">{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Ценности не указаны</p>
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
          {getProfileBeliefs().length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Убеждения
              </h2>
              <div className="space-y-2">
                {getProfileBeliefs().map((belief, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-forest-500 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-gray-700">{belief}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Desires */}
          {getProfileDesires().length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Желания
              </h2>
              <div className="space-y-2">
                {getProfileDesires().map((desire, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-warm-500 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-gray-700">{desire}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Intentions */}
          {getProfileIntentions().length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Намерения
              </h2>
              <div className="space-y-2">
                {getProfileIntentions().map((intention, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-earth-500 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-gray-700">{intention}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no data */}
          {!profileData && !isLoading && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="text-center py-8">
                <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Профиль не найден
                </h3>
                <p className="text-gray-600 mb-4">
                  Не удалось загрузить подробную информацию о пользователе
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Закрыть
          </button>
          <button
            onClick={() => onStartChat(user)}
            className="px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors flex items-center space-x-2"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Написать в Telegram</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;