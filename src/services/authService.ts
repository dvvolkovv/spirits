import { tokenManager } from '../utils/tokenManager';
import { AuthResponse, RefreshResponse, SMSResponse } from '../types/auth';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'https://travel-n8n.up.railway.app';

class AuthService {
  async requestSMSCode(phone: string): Promise<SMSResponse> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const response = await fetch(`${BASE_URL}/webhook/898c938d-f094-455c-86af-969617e62f7a/sms/${cleanPhone}`, {
        method: 'GET',
      });

      if (response.ok) {
        return { success: true, message: 'SMS sent' };
      } else if (response.status === 403) {
        const errorText = await response.text();
        return { success: false, message: errorText || 'User blocked' };
      } else {
        return { success: false, message: 'Failed to send SMS' };
      }
    } catch (error) {
      console.error('Error requesting SMS code:', error);
      return { success: false, message: 'Network error' };
    }
  }

  async verifyCode(phone: string, code: string): Promise<AuthResponse> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const response = await fetch(`${BASE_URL}/webhook/a376a8ed-3bf7-4f23-aaa5-236eea72871b/check-code/${cleanPhone}/${code}`, {
        method: 'GET',
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();

          if (data['access-token'] && data['refresh-token']) {
            tokenManager.saveTokens(data['access-token'], data['refresh-token']);
            return {
              success: true,
              tokens: {
                'access-token': data['access-token'],
                'refresh-token': data['refresh-token']
              }
            };
          }

          return { success: false, error: 'Invalid token response' };
        } else {
          const text = await response.text();
          if (text.trim() === 'Confirmed') {
            return { success: true };
          }

          return { success: false, error: text };
        }
      } else {
        const errorText = await response.text();

        if (errorText.includes('Wrong code')) {
          return { success: false, error: 'Wrong code' };
        } else if (errorText.includes('Code not found')) {
          return { success: false, error: 'Code not found' };
        } else if (errorText.includes('User disable')) {
          return { success: false, error: 'User disable' };
        }

        return { success: false, error: errorText || 'Verification failed' };
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async refreshTokens(): Promise<RefreshResponse | null> {
    const refreshToken = tokenManager.getRefreshToken();

    if (!refreshToken) {
      console.warn('No refresh token available');
      return null;
    }

    try {
      const response = await fetch(`${BASE_URL}/webhook/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${refreshToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();

        if (data['access-token'] && data['refresh-token']) {
          tokenManager.saveTokens(data['access-token'], data['refresh-token']);
          return data as RefreshResponse;
        }
      } else {
        console.error('Refresh token invalid or expired');
        tokenManager.clearTokens();
        return null;
      }
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      return null;
    }

    return null;
  }

  logout(): void {
    tokenManager.clearTokens();
  }
}

export const authService = new AuthService();
