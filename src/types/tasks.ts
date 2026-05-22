export type TaskStatus = 'active' | 'archived' | 'done';

export interface TaskListItem {
  id: string;
  title: string;
  status: TaskStatus;
  summary: string | null;
  last_active_at: string | null; // ISO
}

export interface TaskEvent {
  id: string;
  content: string;
  agent_id: number | null;
  agent_name: string | null;
  created_at: string; // ISO
}

export interface TaskDetails {
  task: TaskListItem;
  events: TaskEvent[];
}
