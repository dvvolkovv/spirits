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

/**
 * Текст 400 от POST generate, когда для плана мало разговора
 * (spirits_back: action-plans.service.ts). После «Чистого листа» бэк строит
 * план только по разговору после точки отсчёта — без новых сообщений его нет.
 */
const NOT_ENOUGH_CONVERSATION = 'not enough conversation for an action plan';

/**
 * Сбой ручки плана с кодом ответа и текстом бэка. NestJS отдаёт ошибку телом
 * { statusCode, message, error }; serverMessage — это message, если он строка
 * (у ValidationPipe он массив, у прокси тело не JSON — тогда null).
 */
export class ActionPlanRequestError extends Error {
  readonly status: number;
  readonly serverMessage: string | null;
  /**
   * «Мало разговора»: повтор не поможет, нужно написать ассистенту.
   * Различаем по тексту — у той же ручки есть и другие 400.
   */
  readonly notEnoughConversation: boolean;

  constructor(status: number, serverMessage: string | null) {
    super(`action plan request failed: ${status}`);
    this.name = 'ActionPlanRequestError';
    this.status = status;
    this.serverMessage = serverMessage;
    this.notEnoughConversation = status === 400 && serverMessage === NOT_ENOUGH_CONVERSATION;
  }
}

async function serverMessageOf(response: Response): Promise<string | null> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : null;
  } catch {
    return null;
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new ActionPlanRequestError(response.status, await serverMessageOf(response));
  return response.json() as Promise<T>;
}

export const actionPlansApi = {
  // Точка отсчёта «Чистого листа» — на сервере: только ассистент, без метки.
  async get(assistantId: string | number): Promise<ActionPlan | null> {
    const params = new URLSearchParams({ assistantId: String(assistantId) });
    const response = await apiClient.get(`/webhook/chat/action-plans?${params}`);
    const data = await json<{ plan: ActionPlan | null }>(response);
    return data.plan;
  },

  async generate(assistantId: string | number): Promise<ActionPlan> {
    const response = await apiClient.post('/webhook/chat/action-plans/generate', {
      assistantId: String(assistantId),
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
