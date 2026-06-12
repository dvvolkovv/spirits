import { tokenManager } from '../utils/tokenManager';
import { apiClient } from './apiClient';
import { vkReachGoal } from './vkPixel';
import { AuthResponse, RefreshResponse, SMSResponse } from '../types/auth';
import type { Identity } from '../types/auth';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

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
            // Новый пользователь → фиксируем регистрацию в VK-пикселе (цель для
            // оптимизации рекламных кампаний на реальные регистрации).
            if (data['is-new-user']) vkReachGoal('registration');
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
      console.warn('No refresh token available for refresh');
      return null;
    }

    // Проверяем, не истек ли refresh token
    if (tokenManager.isTokenExpired(refreshToken)) {
      console.error('Refresh token has expired');
      tokenManager.clearTokens();
      return null;
    }

    try {
      const response = await fetch(`${BASE_URL}/webhook/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();

        if (data['access-token'] && data['refresh-token']) {
          // Сохраняем новые токены
          tokenManager.saveTokens(data['access-token'], data['refresh-token']);
          console.log('Tokens successfully refreshed and saved');
          return {
            'access-token': data['access-token'],
            'refresh-token': data['refresh-token']
          };
        } else {
          console.error('Invalid token response format from refresh endpoint');
          return null;
        }
      } else if (response.status === 401) {
        // Refresh token тоже невалиден или истек
        console.error('Refresh token rejected by server (401), clearing tokens');
        tokenManager.clearTokens();
        return null;
      } else {
        console.error(`Token refresh failed with status: ${response.status}`);
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Error response:', errorText);
        return null;
      }
    } catch (error) {
      console.error('Network error during token refresh:', error);
      return null;
    }
  }

  async registerReferral(): Promise<void> {
    const slug = localStorage.getItem('referral_slug');
    const expires = Number(localStorage.getItem('referral_slug_expires') || 0);
    if (!slug || Date.now() >= expires) {
      localStorage.removeItem('referral_slug');
      localStorage.removeItem('referral_slug_expires');
      return;
    }
    try {
      await apiClient.post('/webhook/referral/register', { slug });
    } catch (error) {
      console.error('Error registering referral:', error);
    } finally {
      localStorage.removeItem('referral_slug');
      localStorage.removeItem('referral_slug_expires');
    }
  }

  async requestMagicLink(email: string): Promise<{ sent: boolean }> {
    const resp = await apiClient.post('/webhook/auth/email/request', { email });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({} as Record<string, unknown>));
      throw new Error((body as Record<string, unknown>)?.error as string || 'request failed');
    }
    return await resp.json();
  }

  async oauthInit(provider: 'google' | 'yandex', intent: 'login' | 'link' = 'login'): Promise<{ authorizeUrl: string }> {
    const resp = await apiClient.post('/webhook/auth/oauth/init', { provider, intent });
    if (!resp.ok) throw new Error('oauth init failed');
    return await resp.json();
  }

  async listIdentities(): Promise<Identity[]> {
    const resp = await apiClient.get('/webhook/auth/identities');
    if (!resp.ok) throw new Error('list identities failed');
    return await resp.json();
  }

  async unlinkIdentity(id: string): Promise<{ ok: boolean }> {
    const resp = await apiClient.delete(`/webhook/auth/identities/${id}`);
    return { ok: resp.ok };
  }

  logout(): void {
    tokenManager.clearTokens();
  }
}

export const authService = new AuthService();
