import { apiClient } from './apiClient';

export interface SupportOperator {
  id: string;
  name: string;
}

export interface SupportAssignmentTicket {
  id: string;
  updated_at: string;
  assigned_to: string | null;
  assigned_at: string | null;
  first_response_due_at: string | null;
  first_owner_reply_at: string | null;
  status?: string;
  assigned_name?: string | null;
}

export interface AssignTicketInput {
  assigneeId: string | null;
  expectedUpdatedAt: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw Object.assign(new Error(text || `HTTP ${response.status}`), { status: response.status });
  }
  return response.json() as Promise<T>;
}

export const supportAssignmentApi = {
  async operators(): Promise<SupportOperator[]> {
    return parseResponse<SupportOperator[]>(
      await apiClient.get('/webhook/support/admin/operators'),
    );
  },

  async assign(ticketId: string, input: AssignTicketInput): Promise<SupportAssignmentTicket> {
    return parseResponse<SupportAssignmentTicket>(await apiClient.post(
      `/webhook/support/admin/ticket/${encodeURIComponent(ticketId)}/assign`,
      input,
    ));
  },
};
