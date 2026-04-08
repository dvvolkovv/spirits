import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, TrendingUp, MessageCircle } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

interface UserMatch {
  id: string;
  name: string;
  avatar?: string;
  values: string[];
  intents: string[];
  interests?: string[];
  skills?: string[];
  corellation: number;
  phone?: string;
}

interface FullProfile {
  values?: string[];
  beliefs?: string[];
  desires?: string[];
  intents?: string[];
  name?: string;
  family_name?: string;
  completeness?: string;
}

interface UserProfileModalProps {
  user: UserMatch;
  isOpen: boolean;
  onClose: () => void;
  onStartChat: (user: UserMatch) => void;
}

const parseProfileParams = (paramsRaw: any): FullProfile | null => {
  if (!paramsRaw) return null;

  let str = typeof paramsRaw === 'string' ? paramsRaw : JSON.stringify(paramsRaw);

  // Strip wrapping single quotes if present: '{"..."}'
  str = str.trim();
  if (str.startsWith("'") && str.endsWith("'")) {
    str = str.slice(1, -1);
  }

  try {
    const parsed = JSON.parse(str);

    // New format: { values: [...], beliefs: [...], desires: [...], intents: [...], name, family_name }
    if (Array.isArray(parsed.values)) {
      return {
        values: parsed.values,
        beliefs: Array.isArray(parsed.beliefs) ? parsed.beliefs : [],
        desires: Array.isArray(parsed.desires) ? parsed.desires : [],
        intents: Array.isArray(parsed.intents) ? parsed.intents : [],
        name: parsed.name,
        family_name: parsed.family_name,
        completeness: parsed.completeness,
      };
    }

    // Format with nested profile object: { profile: { values: [...] } }
    if (parsed.profile && Array.isArray(parsed.profile.values)) {
      return {
        values: parsed.profile.values,
        beliefs: Array.isArray(parsed.profile.beliefs) ? parsed.profile.beliefs : [],
        desires: Array.isArray(parsed.profile.desires) ? parsed.profile.desires : [],
        intents: Array.isArray(parsed.profile.intents) ? parsed.profile.intents : [],
        name: parsed.profile.name,
        family_name: parsed.profile.family_name,
        completeness: parsed.completeness,
      };
    }

    // Old text format: { "person values": "...", beliefs: "...", desires: "...", intents: "..." }
    if (parsed['person values'] || parsed.beliefs) {
      const splitText = (text: string) =>
        text ? text.split(/[;,]\s*/).map((s: string) => s.trim()).filter(Boolean) : [];
      return {
        values: splitText(parsed['person values'] || ''),
        beliefs: splitText(parsed.beliefs || ''),
        desires: splitText(parsed.desires || ''),
        intents: splitText(parsed.intents || ''),
        name: parsed['user nickname'],
      };
    }
  } catch (e) {
    // ignore parse errors
  }

  return null;
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onStartChat
}) => {
  const { t } = useTranslation();
  const [fullProfile, setFullProfile] = useState<FullProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !user.phone) return;

    setFullProfile(null);
    setIsLoading(true);

    const userId = user.phone.replace(/\D/g, '');

    apiClient.get(`/webhook/user-profile?userId=${userId}`)
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          const profile = parseProfileParams(data?.params);
          setFullProfile(profile);
        }
      })
      .catch(() => {/* ignore, fallback to search data */})
      .finally(() => setIsLoading(false));
  }, [isOpen, user.phone]);

  useEffect(() => {
    if (!isOpen) setFullProfile(null);
  }, [isOpen]);

  const getAvatarInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const displayName = fullProfile?.name && fullProfile?.family_name
    ? `${fullProfile.name} ${fullProfile.family_name}`
    : fullProfile?.name || user.name;

  const values = fullProfile?.values?.length ? fullProfile.values : user.values || [];

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
          {/* Profile Photo */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="w-24 h-24 bg-gradient-to-br from-forest-500 to-warm-500 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                {isLoading ? (
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-white font-bold text-2xl">
                    {getAvatarInitials(displayName)}
                  </span>
                )}
              </div>

              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900">
                  {displayName}
                </h2>
                <div className="flex items-center justify-center space-x-2 mt-2">
                  <span className="text-sm text-blue-600 font-medium">
                    Совпадение: {Math.round(user.corellation * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Values ценности */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-forest-600" />
              Ценности
            </h2>
            {values.length > 0 ? (
              <div className="space-y-2">
                {values.map((value, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-forest-500 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-gray-700">{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">Ценности не указаны</p>
            )}
          </div>

          {/* Interests интересы */}
          {user.interests && user.interests.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Интересы
              </h2>
              <div className="flex flex-wrap gap-2">
                {user.interests.map((interest, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-red-50 text-red-700 text-sm rounded-full"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Skills навыки */}
          {user.skills && user.skills.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Навыки
              </h2>
              <div className="flex flex-wrap gap-2">
                {user.skills.map((skill, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-yellow-50 text-yellow-700 text-sm rounded-full"
                  >
                    {skill}
                  </span>
                ))}
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
          {/* Telegram hidden — contact through platform */}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
