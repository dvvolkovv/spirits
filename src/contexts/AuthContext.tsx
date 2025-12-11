import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  const fetchUserTokens = async () => {
    try {
      const response = await apiClient.get('/webhook/get-user-tokens/user/tokens/');

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
  };

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
          localStorage.setItem('userData', JSON.stringify(parsedUser));
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

  useEffect(() => {
    if (user && !isLoading) {
      checkAdminStatus();
    }
  }, [user?.phone]);

  useEffect(() => {
    if (!user || isLoading) return;

    const interval = setInterval(async () => {
      const tokens = await fetchUserTokens();
      if (tokens !== undefined) {
        updateTokens(tokens);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user?.phone, isLoading]);

  const login = async (phone: string, token: string) => {
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
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

  const checkAdminStatus = async () => {
    if (!user?.phone) return;

    try {
      const response = await apiClient.get(`/webhook-test/profile`);

      if (response.ok) {
        const responseData = await response.json();

        let profileRecord;
        if (Array.isArray(responseData) && responseData.length > 0) {
          profileRecord = responseData[0];
        } else if (responseData && typeof responseData === 'object') {
          profileRecord = responseData;
        }

        if (profileRecord) {
          const updatedUser = {
            ...user,
            isAdmin: profileRecord.isadmin === true,
            email: profileRecord.email || user.email
          };
          setUser(updatedUser);
          localStorage.setItem('userData', JSON.stringify(updatedUser));
        }
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
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
      const response = await apiClient.delete(`/webhook/c6880b9e-3cb3-4d36-8eb8-abeda33e37e8/profile/`);

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

  const updateProfile = (profileUpdate: Partial<User['profile']>) => {
    if (user) {
      const updatedUser = {
        ...user,
        profile: {
          ...user.profile!,
          ...profileUpdate
        }
      };
      setUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(updatedUser));
    }
  };

  const updateUserInfo = (info: { firstName?: string; lastName?: string }) => {
    if (user) {
      const updatedUser = {
        ...user,
        ...info
      };
      setUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(updatedUser));
    }
  };

  const updateAvatar = (avatar: string) => {
    if (user) {
      const updatedUser = {
        ...user,
        avatar
      };
      setUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(updatedUser));
    }
  };

  const updateTokens = (tokens: number) => {
    if (user) {
      const updatedUser = {
        ...user,
        tokens
      };
      setUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(updatedUser));
    }
  };

  const consumeTokens = (amount: number) => {
    if (user && user.tokens !== undefined) {
      const newTokens = Math.max(0, user.tokens - amount);
      updateTokens(newTokens);
    }
  };

  const refreshTokens = async () => {
    if (user?.phone) {
      const tokens = await fetchUserTokens();
      if (tokens !== undefined) {
        updateTokens(tokens);
      }
    }
  };

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