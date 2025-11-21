import { avatarCache } from '../utils/avatarCache';

const AVATAR_BASE_URL = 'https://travel-n8n.up.railway.app/webhook/0cdacf32-7bfd-4888-b24f-3a6af3b5f99e/agent/avatar';

class AvatarService {
  private loadingPromises: Map<number, Promise<string>> = new Map();

  async getAvatarUrl(agentId: number): Promise<string> {
    const cached = await avatarCache.get(agentId);
    if (cached) {
      return cached;
    }

    if (this.loadingPromises.has(agentId)) {
      return this.loadingPromises.get(agentId)!;
    }

    const promise = this.fetchAndCacheAvatar(agentId);
    this.loadingPromises.set(agentId, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.loadingPromises.delete(agentId);
    }
  }

  private async fetchAndCacheAvatar(agentId: number): Promise<string> {
    const url = `${AVATAR_BASE_URL}/${agentId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-cache'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch avatar: ${response.status}`);
      }

      const blob = await response.blob();

      await avatarCache.set(agentId, url, blob);

      return URL.createObjectURL(blob);
    } catch (error) {
      console.error(`Error fetching avatar for agent ${agentId}:`, error);
      return url;
    }
  }

  async preloadAvatars(agentIds: number[]): Promise<void> {
    const promises = agentIds.map(id => this.getAvatarUrl(id).catch(err => {
      console.error(`Failed to preload avatar for agent ${id}:`, err);
    }));

    await Promise.all(promises);
  }

  async clearCache(): Promise<void> {
    await avatarCache.clear();
  }

  async refreshAvatar(agentId: number): Promise<string> {
    await avatarCache.delete(agentId);
    return this.getAvatarUrl(agentId);
  }

  async cleanExpiredCache(): Promise<void> {
    await avatarCache.cleanExpired();
  }
}

export const avatarService = new AvatarService();
