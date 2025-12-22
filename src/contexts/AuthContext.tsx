import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { tokenManager } from '../utils/tokenManager';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';

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
  login: (phone: string, token: string) => void;
  logout: () => void;
  deleteProfile: () => Promise<void>;
  updateProfile: (profile: Partial<User['profile']>) => void;
  updateUserInfo: (info: { firstName?: string; lastName?: string }) => void;
  updateAvatar: (avatar: string) => void;
  checkAdminStatus: () => Promise<void>;
  updateTokens: (tokens: number) => void;
  consumeTokens: (amount: number) => void;
  refreshTokens: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  const updateTokens = useCallback((tokens: number) => {
    const currentUser = userRef.current;
    if (currentUser) {
      const updatedUser = {
        ...currentUser,
        tokens
      };
      setUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(sanitizeUserForStorage(updatedUser)));
    }
  }, []);

  const checkAdminStatus = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser?.phone) return;

    const cleanPhone = currentUser.phone.replace(/\D/g, '');

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/16279efb-08c5-4255-9ded-fdbafb507f32/profile/${cleanPhone}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const responseData = await response.json();

        let profileRecord;
        if (Array.isArray(responseData) && responseData.length > 0) {
          profileRecord = responseData[0];
        } else if (responseData && typeof responseData === 'object') {
          profileRecord = responseData;
        }

        if (profileRecord) {
          const profileData = profileRecord.profileJson || profileRecord.profile_data || profileRecord;

          const updatedUser = {
            ...currentUser,
            isAdmin: profileData.isadmin === true,
            email: profileData.email || profileRecord.email || currentUser.email,
            preferredAgent: profileData.preferred_agent || currentUser.preferredAgent
          };
          setUser(updatedUser);
          localStorage.setItem('userData', JSON.stringify(sanitizeUserForStorage(updatedUser)));
        }
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('authToken');
      const userData = localStorage.getItem('userData');

      if (token && userData) {
        try {
          const parsedUser = JSON.parse(userData);

          if (tokenManager.hasTokens()) {
            if (tokenManager.isAccessTokenExpiringSoon(120)) {
              await authService.refreshTokens();
            }
          }

          const tokens = await fetchUserTokens();
          if (tokens !== undefined) {
            parsedUser.tokens = tokens;
          }

          setUser(parsedUser);
          localStorage.setItem('userData', JSON.stringify(sanitizeUserForStorage(parsedUser)));

          loadAvatarFromServer(parsedUser.phone);
        } catch (error) {
          console.error('Error parsing user data:', error);
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
          tokenManager.clearTokens();
        }
      }

      setIsLoading(false);
    };

    initAuth();
  }, []);

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
          setUser((currentUser) => {
            if (currentUser?.phone) {
              const updatedUser = {
                ...currentUser,
                isAdmin: profileRecord.isadmin === true,
                email: profileRecord.email || currentUser.email
              };
              localStorage.setItem('userData', JSON.stringify(updatedUser));
              return updatedUser;
            }
            return currentUser;
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
  }, [user?.phone, isLoading, checkAdminStatus]);

  const updateTokens = useCallback((tokens: number) => {
    setUser((currentUser) => {
      if (currentUser) {
        const updatedUser = {
          ...currentUser,
          tokens
        };
        localStorage.setItem('userData', JSON.stringify(updatedUser));
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
  }, [user?.phone, isLoading, fetchUserTokens, updateTokens]);

  const login = async (phone: string, token: string) => {
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

    localStorage.setItem('authToken', token);

    const tokens = await fetchUserTokens();
    if (tokens !== undefined) {
      newUser.tokens = tokens;
    }

    localStorage.setItem('userData', JSON.stringify(newUser));
    setUser(newUser);

    await checkAdminStatus();
  };


  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    tokenManager.clearTokens();
    authService.logout();
    setUser(null);
  };

  const deleteProfile = async () => {
    if (!user?.phone) {
      throw new Error('Номер телефона не найден');
    }

    try {
      const response = await apiClient.delete(`/webhook/profile`);

      if (!response.ok) {
        throw new Error(`Ошибка удаления профиля: ${response.status}`);
      }

      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
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
        localStorage.setItem('userData', JSON.stringify(updatedUser));
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
        localStorage.setItem('userData', JSON.stringify(updatedUser));
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
        localStorage.setItem('userData', JSON.stringify(updatedUser));
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
        localStorage.setItem('userData', JSON.stringify(updatedUser));
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
        updateTokens,
        consumeTokens,
        refreshTokens,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};