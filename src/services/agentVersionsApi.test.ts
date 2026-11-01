import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './apiClient';
import { agentVersionsApi } from './agentVersionsApi';
import type { AgentVersion } from './agentVersionsApi';

vi.mock('./apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const VERSION: AgentVersion = {
  id: 'version-1',
  agent_id: 7,
  version: 2,
  description: 'Second version',
  system_prompt: 'Be helpful',
  status: 'draft',
  base_version_id: 'version-0',
  created_by: 'admin-1',
  created_at: '2026-11-01T00:00:00.000Z',
  published_at: null,
  published_by: null,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

function textResponse(payload: string, status = 200): Response {
  return new Response(payload, { status });
}

describe('agentVersionsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gets agent state', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(
      jsonResponse({ published: VERSION, draft: null }),
    );

    await expect(agentVersionsApi.state(7)).resolves.toEqual({
      published: VERSION,
      draft: null,
    });
    expect(apiClient.get).toHaveBeenCalledWith('/webhook/admin/agents/7/state');
  });

  it('gets versions with the default limit', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(jsonResponse([VERSION]));

    await expect(agentVersionsApi.versions(7)).resolves.toEqual([VERSION]);
    expect(apiClient.get).toHaveBeenCalledWith('/webhook/admin/agents/7/versions?limit=50');
  });

  it('passes a custom versions limit', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(jsonResponse([]));

    await agentVersionsApi.versions(7, 25);
    expect(apiClient.get).toHaveBeenCalledWith('/webhook/admin/agents/7/versions?limit=25');
  });

  it('creates a draft with the complete body', async () => {
    const input = {
      description: 'Draft description',
      system_prompt: 'New prompt',
      base_version_id: 'version-1',
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(jsonResponse(VERSION));

    await expect(agentVersionsApi.createDraft(7, input)).resolves.toEqual(VERSION);
    expect(apiClient.post).toHaveBeenCalledWith('/webhook/admin/agents/7/drafts', input);
  });

  it('publishes with optimistic concurrency metadata', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(jsonResponse(VERSION));

    await agentVersionsApi.publish(7, 'version-2', 'version-1');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/webhook/admin/agents/7/versions/version-2/publish',
      { expected_published_version_id: 'version-1' },
    );
  });

  it('publishes the first version with a null expectation', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(jsonResponse(VERSION));

    await agentVersionsApi.publish(7, 'version-2', null);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/webhook/admin/agents/7/versions/version-2/publish',
      { expected_published_version_id: null },
    );
  });

  it('tests a version with the complete body', async () => {
    const input = {
      version_id: 'version-1',
      message: 'Hello',
      session_id: 'session-1',
    };
    const reply = { text: 'Hi', session_id: 'session-1', tokens: 12 };
    vi.mocked(apiClient.post).mockResolvedValueOnce(jsonResponse(reply));

    await expect(agentVersionsApi.test(7, input)).resolves.toEqual(reply);
    expect(apiClient.post).toHaveBeenCalledWith('/webhook/admin/agents/7/test', input);
  });

  it('preserves non-2xx status and payload and extracts message', async () => {
    const payload = { message: 'Version conflict', reason: 'changed' };
    vi.mocked(apiClient.get).mockResolvedValueOnce(jsonResponse(payload, 409));

    await expect(agentVersionsApi.state(7)).rejects.toMatchObject({
      message: 'Version conflict',
      status: 409,
      payload,
    });
  });

  it('joins array error messages', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(
      jsonResponse({ error: ['First problem', 'Second problem'] }, 400),
    );

    await expect(agentVersionsApi.test(7, {
      version_id: 'version-1',
      message: 'Hello',
    })).rejects.toMatchObject({
      message: 'First problem; Second problem',
      status: 400,
      payload: { error: ['First problem', 'Second problem'] },
    });
  });

  it('preserves plain-text error bodies', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(textResponse('Bad gateway', 502));

    await expect(agentVersionsApi.versions(7)).rejects.toMatchObject({
      message: 'Bad gateway',
      status: 502,
      payload: 'Bad gateway',
    });
  });

  it('uses an HTTP status message for an empty error payload', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(jsonResponse({}, 409));

    await expect(agentVersionsApi.publish(7, 'version-2', null)).rejects.toMatchObject({
      message: 'HTTP 409',
      status: 409,
      payload: {},
    });
  });

  it('rejects an HTML success response as a protocol error', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(textResponse('<html>SPA fallback</html>'));

    await expect(agentVersionsApi.state(7)).rejects.toThrow(
      /Invalid agent versions API response.*AgentState/,
    );
  });

  it('rejects valid JSON of the wrong kind for versions', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(jsonResponse({ rows: [] }));

    await expect(agentVersionsApi.versions(7)).rejects.toThrow(
      /Invalid agent versions API response.*AgentVersion\[\]/,
    );
  });

  it('rejects an incomplete version in a success response', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(
      jsonResponse({ ...VERSION, system_prompt: undefined }),
    );

    await expect(agentVersionsApi.createDraft(7, {
      description: 'Draft',
      system_prompt: 'Prompt',
      base_version_id: 'version-1',
    })).rejects.toThrow(/Invalid agent versions API response.*AgentVersion/);
  });

  it('rejects an incomplete test reply in a success response', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(
      jsonResponse({ text: 'Hi', session_id: 'session-1' }),
    );

    await expect(agentVersionsApi.test(7, {
      version_id: 'version-1',
      message: 'Hello',
    })).rejects.toThrow(/Invalid agent versions API response.*TestReply/);
  });
});
