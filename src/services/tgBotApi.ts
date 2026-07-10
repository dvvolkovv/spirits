import { apiClient } from './apiClient';

export type AddressingMode = 'strict' | 'always' | 'smart';
export type VoiceReplyMode = 'never' | 'mirror' | 'always';
export type BotStatus = 'pending' | 'active' | 'silent' | 'archived';

export interface TgBotConfig {
  id: string;
  tgChatId: string | null;
  tgChatTitle: string | null;
  displayName: string;
  presetAgentId: string | null;
  customAgentId: string | null;
  addressingMode: AddressingMode;
  voiceReplyMode: VoiceReplyMode;
  status: BotStatus;
  lastReplyAt: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface IdentityStatus {
  bound: boolean;
  tgUsername?: string | null;
  tgFirstName?: string | null;
}

export interface ConfigCreateResponse {
  config: TgBotConfig;
  claimToken: string;
  deepLink: string;
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let message = `HTTP ${response.status}`;
  try { const b = await response.json(); message = b?.message ?? b?.error ?? message; } catch {}
  throw new Error(message);
}

export const tgBotApi = {
  async identityStatus(): Promise<IdentityStatus> {
    const r = await apiClient.get('/webhook/tg-bot/identity-status');
    return parseOrThrow(r);
  },
  async identityLink(): Promise<{ token: string; deepLink: string }> {
    const r = await apiClient.post('/webhook/tg-bot/identity-link', {});
    return parseOrThrow(r);
  },
  async list(): Promise<TgBotConfig[]> {
    const r = await apiClient.get('/webhook/tg-bot/configs');
    return parseOrThrow(r);
  },
  async create(body: {
    displayName: string;
    presetAgentId?: string;
    customAgentId?: string;
    addressingMode: AddressingMode;
    voiceReplyMode: VoiceReplyMode;
  }): Promise<ConfigCreateResponse> {
    const r = await apiClient.post('/webhook/tg-bot/configs', body);
    return parseOrThrow(r);
  },
  async get(id: string): Promise<TgBotConfig> {
    const r = await apiClient.get(`/webhook/tg-bot/configs/${id}`);
    return parseOrThrow(r);
  },
  async update(id: string, body: Partial<{ displayName: string; presetAgentId: string; customAgentId: string; addressingMode: AddressingMode; voiceReplyMode: VoiceReplyMode }>): Promise<TgBotConfig> {
    const r = await apiClient.patch(`/webhook/tg-bot/configs/${id}`, body);
    return parseOrThrow(r);
  },
  // Перевыпуск claim-ссылки для archived/pending конфига: бэк разархивирует
  // конфиг и возвращает свежий deepLink (тот же формат, что при создании).
  async reissueClaim(id: string): Promise<ConfigCreateResponse> {
    const r = await apiClient.post(`/webhook/tg-bot/configs/${id}/reissue-claim`, {});
    return parseOrThrow(r);
  },
  async remove(id: string): Promise<{ ok: boolean }> {
    const r = await apiClient.delete(`/webhook/tg-bot/configs/${id}`);
    return parseOrThrow(r);
  },
  async messages(id: string): Promise<any[]> {
    const r = await apiClient.get(`/webhook/tg-bot/configs/${id}/messages`);
    return parseOrThrow(r);
  },
};
