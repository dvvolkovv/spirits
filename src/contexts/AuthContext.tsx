import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode} from 'react';
import { tokenManager } from '../utils/tokenManager';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import { clearAppStorage } from '../utils/clearAppStorage';
import { setItemResilient } from '../utils/persistentStorage';
import { attributeSource } from '../services/eventsClient';
import { markHasAccount } from '../components/guest/guestStorage';
import { claimPendingGuestTrial } from '../components/guest/guestClaim';
import i18n from '../i18n';
import { resolveLanguage } from '../i18n/languages';


interface User {
  id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  isAdmin?: boolean;
  tokens?: number;
  email?: string;
  preferredAgent?: string;
  referralSlug?: string;
  onboarded?: boolean;
  profile?: {
    values: Array<{ name: string; confidence: number; private: boolean }>;
    beliefs: string[];
    desires: string[];
    intentions: string[];
    completion: number;
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // m8 (ревью качества B9-fix): Promise<void>, не void — все вызывающие уже
  // делают await login(...) (SmsLoginPane, AuthOAuthCallbackPage, эффект
  // Taler ID в App.tsx); тип должен это отражать, а не молча скрывать, что
  // вызов асинхронный и небезопасно «уронить» без ожидания.
  login: (phone: string, token: string) => Promise<void>;
  logout: () => void;
  deleteProfile: () => Promise<void>;
  updateProfile: (profile: Partial<User['profile']>) => void;
  updateUserInfo: (info: { firstName?: string; lastName?: string }) => void;
  updateAvatar: (avatar: string) => void;
  checkAdminStatus: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateTokens: (tokens: number) => void;
  consumeTokens: (amount: number) => void;
  refreshTokens: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Persist user to localStorage without the avatar (base64 avatars push us over the 5MB quota
 * on iOS Safari, which throws QuotaExceededError and unmounts the React tree).
 * Avatar is re-fetched from /webhook/avatar on each page load.
 */
function persistUser(user: any): void {
  if (!user) return;
  const { avatar: _drop, ...rest } = user;
  // setItemResilient освобождает место за счёт восстановимого кеша (история
  // чатов, результаты поиска) и повторяет запись. Если и это не помогло —
  // storage заблокирован: in-memory состояние верно, следующая загрузка
  // перезапросит профиль с сервера.
  if (!setItemResilient('userData', JSON.stringify(rest))) {
    // eslint-disable-next-line no-console
    console.warn('[auth] userData persist failed: storage unavailable');
    try { localStorage.removeItem('userData'); } catch {}
  }
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserTokens = useCallback(async () => {
    try {
      const response = await apiClient.get('/webhook/user/tokens/');

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.tokens !== undefined) {
          return data.tokens;
        }
      }
    } catch (error) {
      console.error('Error fetching user tokens:', error);
    }

    return undefined;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const token = localStorage.getItem('authToken');
      const userData = localStorage.getItem('userData');

      if (token && userData) {
        try {
          // m6 (ревью качества B9-fix): отмечаем «устройство входило» сразу,
          // как только это известно — по самому факту наличия authToken и
          // userData, ДО сетевых вызовов ниже (баланс, аватар), а не после
          // них. Раньше отметка стояла в самом конце — и при сбое одного из
          // этих вызовов (или при размонтировании посреди них) рисковала не
          // проставиться вовсе, хотя «устройство входило» уже было известно
          // с этой самой строки.
          markHasAccount();
          const parsedUser = JSON.parse(userData);

          if (tokenManager.hasTokens()) {
            if (tokenManager.isAccessTokenExpiringSoon(120)) {
              await authService.refreshTokens();
            }
          }

          // I2 (ревью качества B9-fix): перенос пробы без входа
          // запускается ПАРАЛЛЕЛЬНО с балансом токенов (оба — сетевые
          // вызовы, незачем ждать их по очереди), но результат дожидаемся
          // (await claim) только ПОЗЖЕ, перед setUser — раньше перенос не
          // ждали вовсе (void claimPendingGuestTrial()), и гонка с первой
          // загрузкой истории чата иногда показывала пустую ленту и
          // приветственный ход ассистента заново (токены, «знакомство»),
          // а проба становилась видна только после перезагрузки страницы.
          const claim = claimPendingGuestTrial();
          const tokens = await fetchUserTokens();
          if (tokens !== undefined && isMounted) {
            parsedUser.tokens = tokens;
          }

          // Загружаем аватар с сервера, если его нет
          if (!parsedUser.avatar && isMounted) {
            try {
              const avatarResponse = await apiClient.get('/webhook/avatar');
              if (avatarResponse.ok && isMounted) {
                const blob = await avatarResponse.blob();
                const base64data = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
                if (isMounted) {
                  parsedUser.avatar = base64data;
                }
              }
            } catch (error) {
              if (isMounted) {
                console.error('Error loading avatar:', error);
              }
            }
          }

          // I2: дождаться переноса ДО setUser — иначе чат откроет историю
          // без только что перенесённой пробы.
          await claim;

          if (isMounted) {
            setUser(parsedUser);
            persistUser(parsedUser);
          }
        } catch (error) {
          if (isMounted) {
            console.error('Error parsing user data:', error);
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            tokenManager.clearTokens();
          }
        }
      }

      if (isMounted) {
        setIsLoading(false);
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [fetchUserTokens]);

  const checkAdminStatus = useCallback(async () => {
    try {
      const response = await apiClient.get(`/webhook/profile`);

      if (response.ok) {
        const responseData = await response.json();

        let profileRecord;
        if (Array.isArray(responseData) && responseData.length > 0) {
          profileRecord = responseData[0];
        } else if (responseData && typeof responseData === 'object') {
          profileRecord = responseData;
        }

        if (profileRecord) {
          const profileJson = profileRecord.profileJson || profileRecord;

          // Язык профиля — источник правды: он синхронизирует UI между
          // устройствами. Если в профиле пусто, молча сохраняем то, что
          // определил детектор, чтобы следующее устройство получило язык.
          const profileLang = profileJson.language;
          if (profileLang) {
            const resolved = resolveLanguage(profileLang);
            if (resolved !== i18n.language) {
              i18n.changeLanguage(resolved);
            }
          } else {
            const detected = resolveLanguage(i18n.language);
            apiClient
              .post('/webhook/profile-update', { language: detected })
              .catch((e) => console.warn('Не удалось сохранить язык в профиль:', e));
          }

          setUser((currentUser) => {
            if (!currentUser) return currentUser;
            const updatedUser = {
              ...currentUser,
              phone: profileJson.phone || currentUser.phone || '',
              isAdmin: profileJson.isadmin === true,
              onboarded: profileJson.onboarded === true,
              email: profileJson.email || currentUser.email,
              referralSlug: profileJson.referral_slug || currentUser.referralSlug,
            };
            persistUser(updatedUser);
            return updatedUser;
          });
        }
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  }, []);

  useEffect(() => {
    if (user && !isLoading) {
      checkAdminStatus();
    }
  }, [user?.id, isLoading, checkAdminStatus]);

  const updateTokens = useCallback((tokens: number) => {
    setUser((currentUser) => {
      if (currentUser) {
        const updatedUser = {
          ...currentUser,
          tokens
        };
        persistUser(updatedUser);
        return updatedUser;
      }
      return currentUser;
    });
  }, []);

  useEffect(() => {
    if (!user || isLoading) return;

    const interval = setInterval(async () => {
      const tokens = await fetchUserTokens();
      if (tokens !== undefined) {
        updateTokens(tokens);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user?.id, isLoading, fetchUserTokens, updateTokens]);

  const login = useCallback(async (phone: string, token: string) => {
    const newUser: User = {
      id: Math.random().toString(36).substring(2, 11),
      phone,
      profile: {
        values: [],
        beliefs: [],
        desires: [],
        intentions: [],
        completion: 0
      }
    };

    // authToken — legacy-зеркало access-токена, гейт восстановления сессии в
    // initAuth. Голый setItem здесь бросал QuotaExceededError ДО setUser, и
    // успешный вход по SMS выглядел как «Неверный код» (инцидент 2026-08-07):
    // сервер OTP принял и погасил, а человек запрашивал код по кругу.
    // Настоящие токены уже сохранены tokenManager'ом, так что промах этой
    // записи не повод ронять вход.
    setItemResilient('authToken', token);

    // Привязать источник привлечения к юзеру (надёжная атрибуция рекламы:
    // session_id анонимного захода не доживает до регистрации). first-touch,
    // пишется на бэке один раз.
    attributeSource(token);

    // Зарегистрировать реферала ЦЕНТРАЛЬНО — на любом способе входа (SMS, OAuth,
    // email), а не только в SMS-пане (b1ee61fd: рефералы через OAuth/email
    // терялись). Идемпотентно: slug снимается после использования, бэк не
    // двоит уже зарегистрированных.
    authService.registerReferral();

    // Проба без входа (spec 2026-10-30-guest-trial): устройство отныне «входило».
    markHasAccount();
    // m7 (ревью качества B9-fix): перенос пробы и баланс токенов — ОБА
    // сетевые вызовы, незачем ждать их по очереди (раньше перенос ждали
    // полностью, а уже ПОТОМ запрашивали баланс). Порядок «перенос до
    // setUser» (чат не должен открыться без только что перенесённой пробы)
    // сохраняется: Promise.all ждёт оба, и только потом ниже — setUser.
    // Перенос не дольше 5 с (GUEST_CLAIM_TIMEOUT_MS); сбой входу не мешает.
    const [, tokens] = await Promise.all([claimPendingGuestTrial(), fetchUserTokens()]);
    if (tokens !== undefined) {
      newUser.tokens = tokens;
    }

    persistUser(newUser);
    setUser(newUser);

    await checkAdminStatus();
  }, [fetchUserTokens, checkAdminStatus]);


  const logout = () => {
    clearAppStorage();
    tokenManager.clearTokens();
    authService.logout();
    setUser(null);
  };

  const deleteProfile = async () => {
    try {
      const response = await apiClient.delete(`/webhook/profile`);

      if (!response.ok) {
        throw new Error(`Ошибка удаления профиля: ${response.status}`);
      }

      clearAppStorage();
      tokenManager.clearTokens();
      setUser(null);
    } catch (error) {
      console.error('Ошибка при удалении профиля:', error);
      throw error;
    }
  };

  const updateProfile = useCallback((profileUpdate: Partial<User['profile']>) => {
    setUser((currentUser) => {
      if (currentUser) {
        const updatedUser = {
          ...currentUser,
          profile: {
            ...currentUser.profile!,
            ...profileUpdate
          }
        };
        persistUser(updatedUser);
        return updatedUser;
      }
      return currentUser;
    });
  }, []);

  const updateUserInfo = useCallback((info: { firstName?: string; lastName?: string }) => {
    setUser((currentUser) => {
      if (currentUser) {
        const updatedUser = {
          ...currentUser,
          ...info
        };
        persistUser(updatedUser);
        return updatedUser;
      }
      return currentUser;
    });
  }, []);

  const updateAvatar = useCallback((avatar: string) => {
    setUser((currentUser) => {
      if (currentUser) {
        const updatedUser = {
          ...currentUser,
          avatar
        };
        persistUser(updatedUser);
        return updatedUser;
      }
      return currentUser;
    });
  }, []);

  const consumeTokens = useCallback((amount: number) => {
    setUser((currentUser) => {
      if (currentUser && currentUser.tokens !== undefined) {
        const newTokens = Math.max(0, currentUser.tokens - amount);
        const updatedUser = {
          ...currentUser,
          tokens: newTokens
        };
        persistUser(updatedUser);
        return updatedUser;
      }
      return currentUser;
    });
  }, []);

  const refreshTokens = useCallback(async () => {
    const tokens = await fetchUserTokens();
    if (tokens !== undefined) {
      updateTokens(tokens);
    }
  }, [fetchUserTokens, updateTokens]);

  // Onboarding: оптимистично помечаем пройденным локально, шлём на сервер
  // в фоне. Если запрос упадёт — не блокируем UX, флаг до-проставится при
  // следующем заходе (показ экрана повторно — приемлемая деградация).
  const completeOnboarding = useCallback(async () => {
    setUser((u) => {
      if (!u) return u;
      const nu = { ...u, onboarded: true };
      persistUser(nu);
      return nu;
    });
    try {
      await apiClient.post('/webhook/onboarding/complete', {});
    } catch (e) {
      console.warn('[onboarding] complete failed', e);
    }
  }, []);

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        deleteProfile,
        updateProfile,
        updateUserInfo,
        updateAvatar,
        checkAdminStatus,
        completeOnboarding,
        updateTokens,
        consumeTokens,
        refreshTokens,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};