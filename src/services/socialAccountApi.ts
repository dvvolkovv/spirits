import { apiClient } from './apiClient';
import { SmmPlatform, SocialAccount } from '../types/smm';

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    message = body?.message ?? body?.error ?? message;
  } catch {
    // body not JSON — keep the status-line message
  }
  throw new Error(message);
}

export const socialAccountApi = {
  async list(): Promise<SocialAccount[]> {
    const r = await apiClient.get('/webhook/smm/social-accounts');
    return parseOrThrow<SocialAccount[]>(r);
  },

  async createTelegram(body: {
    botToken: string;
    chatId: string;
    displayName?: string;
  }): Promise<{ id: string; displayName: string; platform: 'telegram' }> {
    const r = await apiClient.post('/webhook/smm/social-accounts/telegram', body);
    return parseOrThrow(r);
  },

  async remove(id: string): Promise<{ ok: boolean }> {
    const r = await apiClient.delete(`/webhook/smm/social-accounts/${id}`);
    return parseOrThrow(r);
  },

  async getOAuthStartUrl(
    platform: Exclude<SmmPlatform, 'telegram'>,
    redirect?: string,
  ): Promise<{ authorizeUrl: string }> {
    const qs = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
    const r = await apiClient.get(`/webhook/smm/oauth/${platform}/start${qs}`);
    return parseOrThrow(r);
  },
};
