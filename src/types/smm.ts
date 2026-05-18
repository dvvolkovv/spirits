export type SmmPlatform = 'telegram' | 'vk' | 'youtube' | 'tiktok' | 'instagram';

export interface SocialAccount {
  id: string;
  platform: SmmPlatform;
  displayName: string;
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
}

export interface SocialConnectResult {
  platform: SmmPlatform;
  method: 'oauth' | 'manual';
  authorizeUrl?: string;       // when method=oauth
  instructions?: string;       // when method=manual (Telegram)
}

export const PLATFORM_LABELS: Record<SmmPlatform, string> = {
  telegram: 'Telegram',
  vk: 'VK',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};
