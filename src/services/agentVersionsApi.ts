import { apiClient } from './apiClient';

export type AgentVersionStatus = 'draft' | 'published' | 'superseded';

export interface AgentVersion {
  id: string;
  agent_id: number;
  version: number;
  description: string;
  system_prompt: string;
  status: AgentVersionStatus;
  base_version_id: string | null;
  created_by: string;
  created_at: string;
  published_at: string | null;
  published_by: string | null;
}

export interface AgentState {
  published: AgentVersion | null;
  draft: AgentVersion | null;
}

export interface TestReply {
  text: string;
  session_id: string;
  tokens: number;
}

export interface CreateDraftInput {
  description?: string;
  system_prompt: string;
  base_version_id: string;
}

export interface TestAgentVersionInput {
  version_id: string;
  message: string;
  session_id?: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = text;

  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const error = new Error(text) as Error & { status: number; payload: unknown };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload as T;
}

const agentPath = (agentId: number) =>
  `/webhook/admin/agents/${encodeURIComponent(String(agentId))}`;

export const agentVersionsApi = {
  async state(agentId: number): Promise<AgentState> {
    return parseResponse<AgentState>(await apiClient.get(`${agentPath(agentId)}/state`));
  },

  async versions(agentId: number, limit = 50): Promise<AgentVersion[]> {
    return parseResponse<AgentVersion[]>(
      await apiClient.get(`${agentPath(agentId)}/versions?limit=${encodeURIComponent(String(limit))}`),
    );
  },

  async createDraft(agentId: number, input: CreateDraftInput): Promise<AgentVersion> {
    return parseResponse<AgentVersion>(
      await apiClient.post(`${agentPath(agentId)}/drafts`, input),
    );
  },

  async publish(
    agentId: number,
    versionId: string,
    expectedPublishedVersionId: string | null,
  ): Promise<AgentVersion> {
    return parseResponse<AgentVersion>(
      await apiClient.post(
        `${agentPath(agentId)}/versions/${encodeURIComponent(versionId)}/publish`,
        { expected_published_version_id: expectedPublishedVersionId },
      ),
    );
  },

  async test(agentId: number, input: TestAgentVersionInput): Promise<TestReply> {
    return parseResponse<TestReply>(await apiClient.post(`${agentPath(agentId)}/test`, input));
  },
};
