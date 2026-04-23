import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, TrendingUp, MessageCircle, Check, Send, Loader2 } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { fetchPeerState, sendPeerRequest, PeerState } from '../peer/usePeer';

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
  interests?: string[];
  skills?: string[];
  name?: string;
  family_name?: string;
  completeness?: string;
  avatar_url?: string;
}

interface UserProfileModalProps {
  user: UserMatch;
  isOpen: boolean;
  onClose: () => void;
  onStartChat?: (user: UserMatch) => void;
}

const parseProfileParams = (paramsRaw: any): FullProfile | null => {
  if (!paramsRaw) return null;

  let str = typeof paramsRaw === 'string' ? paramsRaw : JSON.stringify(paramsRaw);

  str = str.trim();
  if (str.startsWith("'") && str.endsWith("'")) {
    str = str.slice(1, -1);
  }

  try {
    const parsed = JSON.parse(str);

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
  } catch {
    // ignore parse errors
  }

  return null;
};

const INTRO_MAX = 500;

const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, isOpen, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [fullProfile, setFullProfile] = useState<FullProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [peerState, setPeerState] = useState<PeerState | null>(null);
  const [composing, setComposing] = useState(false);
  const [intro, setIntro] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const targetUserId = (user.phone || '').replace(/\D/g, '');

  useEffect(() => {
    if (!isOpen || !targetUserId) return;

    setFullProfile(null);
    setIsLoading(true);
    setPeerState(null);
    setComposing(false);
    setIntro('');
    setSendError(null);
    setSent(false);

    apiClient.get(`/webhook/user-profile?userId=${targetUserId}`)
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          // Try legacy n8n params format first; fall back to direct profile_data / root.
          let profile = parseProfileParams(data?.params);
          if (!profile) profile = parseProfileParams(data?.profile_data);
          const pd = data?.profile_data || data || {};
          if (!profile && (pd.values || pd.interests || pd.skills || pd.name)) {
            profile = {
              values: Array.isArray(pd.values) ? pd.values : [],
              beliefs: Array.isArray(pd.beliefs) ? pd.beliefs : [],
              desires: Array.isArray(pd.desires) ? pd.desires : [],
              intents: Array.isArray(pd.intents) ? pd.intents : [],
              interests: Array.isArray(pd.interests) ? pd.interests : [],
              skills: Array.isArray(pd.skills) ? pd.skills : [],
              name: pd.name,
              family_name: pd.family_name,
              avatar_url: pd.avatar_url,
            };
          } else if (profile) {
            if (!profile.interests && Array.isArray(pd.interests)) profile.interests = pd.interests;
            if (!profile.skills && Array.isArray(pd.skills)) profile.skills = pd.skills;
            if (!profile.avatar_url && pd.avatar_url) profile.avatar_url = pd.avatar_url;
          }
          setFullProfile(profile);
        }
      })
      .catch(() => {/* ignore */})
      .finally(() => setIsLoading(false));

    fetchPeerState(targetUserId).then(setPeerState);
  }, [isOpen, targetUserId]);

  useEffect(() => {
    if (!isOpen) {
      setFullProfile(null);
      setPeerState(null);
      setComposing(false);
      setIntro('');
    }
  }, [isOpen]);

  const getAvatarInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const displayName = fullProfile?.name && fullProfile?.family_name
    ? `${fullProfile.name} ${fullProfile.family_name}`
    : fullProfile?.name || user.name;

  const values = fullProfile?.values?.length ? fullProfile.values : user.values || [];
  const interests = fullProfile?.interests?.length ? fullProfile.interests : user.interests || [];
  const skills = fullProfile?.skills?.length ? fullProfile.skills : user.skills || [];
  const avatarUrl = user.avatar || fullProfile?.avatar_url || null;

  const handleSend = async () => {
    if (!targetUserId) return;
    const trimmed = intro.trim();
    if (!trimmed) {
      setSendError(t('peer.errors.introRequired'));
      return;
    }
    setSendError(null);
    setSending(true);
    try {
      const res = await sendPeerRequest(targetUserId, trimmed);
      if (res.conversationId) {
        onClose();
        navigate(`/chats/${res.conversationId}`);
        return;
      }
      setSent(true);
      setComposing(false);
      setPeerState({
        conversationId: null,
        pendingRequest: {
          id: res.id,
          direction: 'outgoing',
          introMessage: trimmed,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (e: any) {
      const body = e?.body;
      if (body?.conversationId) {
        onClose();
        navigate(`/chats/${body.conversationId}`);
        return;
      }
      if (e?.status === 429 || e?.status === 403) {
        setSendError(t('peer.errors.rateLimited'));
      } else {
        setSendError(e?.message || t('peer.errors.sendFailed'));
      }
    } finally {
      setSending(false);
    }
  };

  const openExistingChat = () => {
    if (peerState?.conversationId) {
      onClose();
      navigate(`/chats/${peerState.conversationId}`);
    }
  };

  const goToRequests = () => {
    onClose();
    navigate('/search?tab=requests');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">
            {t('peer.profile.title', 'Профиль пользователя')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-forest-500 to-warm-500 flex items-center justify-center border-4 border-white shadow-lg">
                {isLoading ? (
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : avatarUrl ? (
                  <img
                    src={avatarUrl.startsWith('http') || avatarUrl.startsWith('/') || avatarUrl.startsWith('data:') ? avatarUrl : `/${avatarUrl}`}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-bold text-2xl">
                    {getAvatarInitials(displayName)}
                  </span>
                )}
              </div>

              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
                {user.corellation > 0 && (
                  <div className="flex items-center justify-center space-x-2 mt-2">
                    <span className="text-sm text-blue-600 font-medium">
                      {t('peer.profile.match', 'Совпадение')}: {Math.round(user.corellation * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-forest-600" />
              {t('peer.profile.values', 'Ценности')}
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
              <p className="text-gray-500">{t('peer.profile.noValues', 'Ценности не указаны')}</p>
            )}
          </div>

          {interests.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t('peer.profile.interests', 'Интересы')}
              </h2>
              <div className="flex flex-wrap gap-2">
                {interests.map((interest, index) => (
                  <span key={index} className="px-3 py-1 bg-red-50 text-red-700 text-sm rounded-full">
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}

          {skills.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {t('peer.profile.skills', 'Навыки')}
              </h2>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill, index) => (
                  <span key={index} className="px-3 py-1 bg-yellow-50 text-yellow-700 text-sm rounded-full">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer — context-aware action */}
        <div className="bg-gray-50 px-6 py-4 border-t flex flex-col gap-3 flex-shrink-0">
          {/* State: conversation already exists */}
          {peerState?.conversationId && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600">
                {t('peer.profile.alreadyChatting', 'У вас уже есть чат')}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('common.close', 'Закрыть')}
                </button>
                <button
                  onClick={openExistingChat}
                  className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('peer.profile.openChat', 'Открыть чат')}
                </button>
              </div>
            </div>
          )}

          {/* State: outgoing pending */}
          {!peerState?.conversationId && peerState?.pendingRequest?.direction === 'outgoing' && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Check className="w-4 h-4 text-green-600" />
                {t('peer.profile.requestSentAwaiting', 'Запрос отправлен, ждём ответа')}
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('common.close', 'Закрыть')}
              </button>
            </div>
          )}

          {/* State: incoming pending */}
          {!peerState?.conversationId && peerState?.pendingRequest?.direction === 'incoming' && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                {t('peer.profile.hasSentYouRequest', 'Этот пользователь прислал вам запрос')}
              </div>
              <button
                onClick={goToRequests}
                className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg transition-colors"
              >
                {t('peer.profile.openRequests', 'Перейти к запросам')}
              </button>
            </div>
          )}

          {/* State: no relationship — compose or initial */}
          {!peerState?.conversationId && !peerState?.pendingRequest && !sent && (
            <>
              {!composing ? (
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {t('common.close', 'Закрыть')}
                  </button>
                  <button
                    onClick={() => setComposing(true)}
                    disabled={!targetUserId}
                    className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {t('peer.profile.requestChat', 'Запросить общение')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('peer.profile.introLabel', 'Короткое сообщение получателю')}
                  </label>
                  <textarea
                    value={intro}
                    onChange={(e) => setIntro(e.target.value.slice(0, INTRO_MAX))}
                    placeholder={t('peer.profile.introPlaceholder', 'Почему хотите познакомиться? (до 500 символов)') as string}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${intro.length >= INTRO_MAX - 20 ? 'text-red-600' : 'text-gray-500'}`}>
                      {intro.length} / {INTRO_MAX}
                    </span>
                    {sendError && (
                      <span className="text-xs text-red-600">{sendError}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setComposing(false); setIntro(''); setSendError(null); }}
                      disabled={sending}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {t('common.cancel', 'Отмена')}
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={sending || !intro.trim()}
                      className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {t('peer.profile.sendRequest', 'Отправить запрос')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* State: just sent */}
          {sent && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <Check className="w-4 h-4" />
                {t('peer.profile.sentOk', 'Запрос отправлен')}
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg transition-colors"
              >
                {t('common.close', 'Закрыть')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
