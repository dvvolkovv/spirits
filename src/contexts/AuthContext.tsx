import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';

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
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const sanitizeUserForStorage = (user: User) => {
    return {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      isAdmin: user.isAdmin,
      tokens: user.tokens,
      email: user.email,
      preferredAgent: user.preferredAgent,
      profile: user.profile ? {
        completion: user.profile.completion
      } : undefined
    };
  };

  const fetchUserTokens = async (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/get-user-tokens/user/tokens/${cleanPhone}`);

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

          const tokens = await fetchUserTokens(parsedUser.phone);
          if (tokens !== undefined) {
            parsedUser.tokens = tokens;
          }

          setUser(parsedUser);
          localStorage.setItem('userData', JSON.stringify(sanitizeUserForStorage(parsedUser)));
        } catch (error) {
          console.error('Error parsing user data:', error);
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
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
  }, [user?.phone, isLoading, checkAdminStatus]);

  useEffect(() => {
    if (!user || isLoading) return;

    const interval = setInterval(async () => {
      const currentUser = userRef.current;
      if (currentUser?.phone) {
        const tokens = await fetchUserTokens(currentUser.phone);
        if (tokens !== undefined && tokens !== currentUser.tokens) {
          updateTokens(tokens);
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user?.phone, isLoading, updateTokens]);

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

    const tokens = await fetchUserTokens(phone);
    if (tokens !== undefined) {
      newUser.tokens = tokens;
    }

    localStorage.setItem('authToken', token);
    localStorage.setItem('userData', JSON.stringify(sanitizeUserForStorage(newUser)));
    setUser(newUser);

    await checkAdminStatus();
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    setUser(null);
  };

  const deleteProfile = async () => {
    if (!user?.phone) {
      throw new Error('Номер телефона не найден');
    }

    // Очищаем номер телефона от всех символов кроме цифр
    const cleanPhone = user.phone.replace(/\D/g, '');

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/webhook/c6880b9e-3cb3-4d36-8eb8-abeda33e37e8/profile/${cleanPhone}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Ошибка удаления профиля: ${response.status}`);
      }

      // После успешного удаления на сервере, очищаем только данные пользователя
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
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
      localStorage.setItem('userData', JSON.stringify(sanitizeUserForStorage(updatedUser)));
    }
  };

  const updateUserInfo = (info: { firstName?: string; lastName?: string }) => {
    if (user) {
      const updatedUser = {
        ...user,
        ...info
      };
      setUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(sanitizeUserForStorage(updatedUser)));
    }
  };

  const updateAvatar = (avatar: string) => {
    if (user) {
      const updatedUser = {
        ...user,
        avatar
      };
      setUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(sanitizeUserForStorage(updatedUser)));
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
      const tokens = await fetchUserTokens(user.phone);
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