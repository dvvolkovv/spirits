import { apiClient } from './apiClient';

export interface CustomAgent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    message = body?.message ?? body?.error ?? message;
  } catch {}
  throw new Error(message);
}

export const customAgentsApi = {
  async list(): Promise<CustomAgent[]> {
    const r = await apiClient.get('/webhook/custom-agents');
    return parseOrThrow<CustomAgent[]>(r);
  },

  async create(body: {
    name: string;
    description?: string;
    systemPrompt: string;
  }): Promise<CustomAgent> {
    const r = await apiClient.post('/webhook/custom-agents', body);
    return parseOrThrow<CustomAgent>(r);
  },

  async draft(description: string): Promise<{ name: string; systemPrompt: string }> {
    const r = await apiClient.post('/webhook/custom-agents/draft', { description });
    return parseOrThrow<{ name: string; systemPrompt: string }>(r);
  },

  async update(
    id: string,
    body: { name?: string; description?: string; systemPrompt?: string },
  ): Promise<CustomAgent> {
    const r = await apiClient.patch(`/webhook/custom-agents/${id}`, body);
    return parseOrThrow<CustomAgent>(r);
  },

  async remove(id: string): Promise<{ ok: boolean }> {
    const r = await apiClient.delete(`/webhook/custom-agents/${id}`);
    return parseOrThrow<{ ok: boolean }>(r);
  },
};
