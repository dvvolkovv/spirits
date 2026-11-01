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
  description: string;
  system_prompt: string;
  base_version_id: string;
}

export interface TestAgentVersionInput {
  version_id: string;
  message: string;
  session_id?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isAgentVersion(value: unknown): value is AgentVersion {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.agent_id === 'number' &&
    typeof value.version === 'number' &&
    typeof value.description === 'string' &&
    typeof value.system_prompt === 'string' &&
    (value.status === 'draft' || value.status === 'published' || value.status === 'superseded') &&
    isNullableString(value.base_version_id) &&
    typeof value.created_by === 'string' &&
    typeof value.created_at === 'string' &&
    isNullableString(value.published_at) &&
    isNullableString(value.published_by);
}

function isAgentState(value: unknown): value is AgentState {
  return isRecord(value) &&
    (value.published === null || isAgentVersion(value.published)) &&
    (value.draft === null || isAgentVersion(value.draft));
}

function isAgentVersionArray(value: unknown): value is AgentVersion[] {
  return Array.isArray(value) && value.every(isAgentVersion);
}

function isTestReply(value: unknown): value is TestReply {
  return isRecord(value) &&
    typeof value.text === 'string' &&
    typeof value.session_id === 'string' &&
    typeof value.tokens === 'number';
}

function protocolError(expected: string): Error {
  return new Error(`Invalid agent versions API response: expected ${expected}`);
}

function parseSuccess<T>(
  text: string,
  expected: string,
  isExpected: (value: unknown) => value is T,
): T {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw protocolError(expected);
  }

  if (!isExpected(payload)) {
    throw protocolError(expected);
  }
  return payload;
}

function errorMessage(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.trim() ? payload : '';
  }
  if (!isRecord(payload)) {
    return '';
  }

  for (const key of ['message', 'error']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (Array.isArray(value)) {
      const messages = value.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      );
      if (messages.length > 0) {
        return messages.join('; ');
      }
    }
  }
  return '';
}

async function parseResponse<T>(
  response: Response,
  expected: string,
  isExpected: (value: unknown) => value is T,
): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }

    const error = new Error(errorMessage(payload) || `HTTP ${response.status}`) as Error & {
      status: number;
      payload: unknown;
    };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return parseSuccess(text, expected, isExpected);
}

const agentPath = (agentId: number) =>
  `/webhook/admin/agents/${encodeURIComponent(String(agentId))}`;

export const agentVersionsApi = {
  async state(agentId: number): Promise<AgentState> {
    return parseResponse(
      await apiClient.get(`${agentPath(agentId)}/state`),
      'AgentState',
      isAgentState,
    );
  },

  async versions(agentId: number, limit = 50): Promise<AgentVersion[]> {
    return parseResponse(
      await apiClient.get(`${agentPath(agentId)}/versions?limit=${encodeURIComponent(String(limit))}`),
      'AgentVersion[]',
      isAgentVersionArray,
    );
  },

  async createDraft(agentId: number, input: CreateDraftInput): Promise<AgentVersion> {
    return parseResponse(
      await apiClient.post(`${agentPath(agentId)}/drafts`, input),
      'AgentVersion',
      isAgentVersion,
    );
  },

  async publish(
    agentId: number,
    versionId: string,
    expectedPublishedVersionId: string | null,
  ): Promise<AgentVersion> {
    return parseResponse(
      await apiClient.post(
        `${agentPath(agentId)}/versions/${encodeURIComponent(versionId)}/publish`,
        { expected_published_version_id: expectedPublishedVersionId },
      ),
      'AgentVersion',
      isAgentVersion,
    );
  },

  async test(agentId: number, input: TestAgentVersionInput): Promise<TestReply> {
    return parseResponse(
      await apiClient.post(`${agentPath(agentId)}/test`, input),
      'TestReply',
      isTestReply,
    );
  },
};
