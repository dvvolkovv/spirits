import { apiClient } from './apiClient';

export interface ActionPlanItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ActionPlan {
  id: string;
  assistantId: string;
  title: string;
  summary: string;
  items: ActionPlanItem[];
  createdAt: string;
  updatedAt: string;
}

export type ActionPlanInput = Pick<ActionPlan, 'title' | 'summary' | 'items'>;

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`action plan request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export const actionPlansApi = {
  async get(assistantId: string | number, freshTs?: string | null): Promise<ActionPlan | null> {
    const params = new URLSearchParams({ assistantId: String(assistantId) });
    if (freshTs) params.set('freshTs', freshTs);
    const response = await apiClient.get(`/webhook/chat/action-plans?${params}`);
    const data = await json<{ plan: ActionPlan | null }>(response);
    return data.plan;
  },

  async generate(assistantId: string | number, freshTs?: string | null): Promise<ActionPlan> {
    const response = await apiClient.post('/webhook/chat/action-plans/generate', {
      assistantId: String(assistantId),
      ...(freshTs ? { freshTs } : {}),
    });
    return json<ActionPlan>(response);
  },

  async update(planId: string, input: ActionPlanInput): Promise<ActionPlan> {
    const response = await apiClient.patch(`/webhook/chat/action-plans/${planId}`, input);
    const data = await json<{ plan: ActionPlan }>(response);
    return data.plan;
  },

  async remove(planId: string): Promise<void> {
    const response = await apiClient.delete(`/webhook/chat/action-plans/${planId}`);
    await json<{ removed: boolean }>(response);
  },
};
