export type TaskStatus = 'active' | 'archived' | 'done';

export interface TaskListItem {
  id: string;
  title: string;
  status: TaskStatus;
  summary: string | null;
  last_active_at: string | null; // ISO
  /**
   * Ручной CLAUDE.md задачи и признак его блокировки.
   *
   * На бэке колонки NOT NULL с дефолтами (tasks/001_tasks.sql), но список
   * задач их не всегда отдаёт — поэтому необязательные. Читает только
   * админка (UserActivityDrawer).
   */
  claudemd?: string;
  claudemd_locked?: boolean;
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
