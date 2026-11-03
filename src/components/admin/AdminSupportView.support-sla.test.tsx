// @vitest-environment jsdom
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byButton, clickAsync, flush, mount, tRu, type, visibleText } from '../../test/dom';
import { apiClient } from '../../services/apiClient';
import { supportAssignmentApi } from '../../services/supportAssignmentApi';
import AdminSupportView from './AdminSupportView';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1' } }),
}));

vi.mock('../../services/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../services/supportAssignmentApi', () => ({
  supportAssignmentApi: { operators: vi.fn(), assign: vi.fn() },
}));

vi.mock('./AdminReportsView', () => ({ default: () => null }));

const OPERATORS = [
  { id: 'admin-1', name: 'Иван' },
  { id: 'admin-2', name: 'Мария' },
];

const LIST_TICKET = {
  id: 'ticket-1',
  userId: 'user-1',
  userName: 'Пользователь',
  userTokens: 100,
  status: 'escalated',
  urgency: 'high',
  topic: null,
  escalationReason: null,
  notes: null,
  assignedTo: null,
  assignedAt: null,
  assignedName: null,
  firstResponseDueAt: '2026-11-03T11:00:00Z',
  firstOwnerReplyAt: null,
  lastMessage: 'Нужна помощь',
  messageCount: 1,
  createdAt: '2026-11-03T10:00:00Z',
  updatedAt: '2026-11-03T11:00:00Z',
  lastMessageAt: '2026-11-03T10:30:00Z',
};

function detail(ticketOverrides: Record<string, unknown> = {}) {
  return {
    ticket: {
      id: 'ticket-1',
      user_id: 'user-1',
      status: 'escalated',
      urgency: 'high',
      notes: null,
      updated_at: '2026-11-03T11:00:00Z',
      assigned_to: null,
      assigned_at: null,
      first_response_due_at: '2026-11-03T11:00:00Z',
      first_owner_reply_at: null,
      ...ticketOverrides,
    },
    messages: [],
    events: [{
      action: 'assignment',
      actor_type: 'owner',
      payload: { from: null, to: 'admin-2' },
      created_at: '2026-11-03T11:05:00Z',
    }],
    user: { profile_data: { name: 'Пользователь' }, tokens: 100 },
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

describe('SLA и назначение в очереди поддержки', () => {
  let currentDetail = detail();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-11-03T12:00:00Z'));
    vi.clearAllMocks();
    currentDetail = detail();
    vi.mocked(supportAssignmentApi.operators).mockResolvedValue(OPERATORS);
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url.startsWith('/webhook/support/admin/tickets?')) return json([LIST_TICKET]);
      if (url === '/webhook/support/admin/ticket/ticket-1') return json(currentDetail);
      if (url.startsWith('/webhook/support/admin/stats')) return json(null, 500);
      if (url === '/webhook/admin/reports/summary') return json({ open: 0 });
      throw new Error(`Unexpected GET ${url}`);
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function render(path: string) {
    return mount(
      <MemoryRouter initialEntries={[path]}>
        <AdminSupportView />
      </MemoryRouter>,
    );
  }

  it('показывает индикатор и отправляет SLA-фильтр на сервер', async () => {
    const view = render('/admin');
    await flush();

    expect(visibleText(view.container)).toContain(tRu('admin.support.sla.overdue'));
    expect(visibleText(view.container)).toContain('−60 мин');

    await clickAsync(byButton(view.container, /^Просрочено$/)!);

    expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('sla=overdue'));
    view.unmount();
  });

  it('показывает дедлайн, контрол назначения и имена в истории', async () => {
    const view = render('/admin?ticket=ticket-1');
    await flush();
    await flush();

    expect(supportAssignmentApi.operators).toHaveBeenCalledTimes(1);
    expect(visibleText(view.container)).toContain(tRu('admin.support.assignment.deadline'));
    expect(byButton(view.container, /Взять в работу/)).not.toBeNull();
    expect(visibleText(view.container)).toContain(
      tRu('admin.support.assignment.event', { from: tRu('admin.support.assignment.unassigned'), to: 'Мария' }),
    );
    view.unmount();
  });

  it('409 обновляет карточку, но не очищает введённый ответ', async () => {
    vi.mocked(supportAssignmentApi.assign).mockRejectedValue(
      Object.assign(new Error('conflict'), { status: 409 }),
    );
    const view = render('/admin?ticket=ticket-1');
    await flush();
    await flush();
    const reply = view.container.querySelector('textarea')!;
    type(reply, 'Не потерять этот ответ');

    currentDetail = detail({
      status: 'owner_handling',
      updated_at: '2026-11-03T11:06:00Z',
      assigned_to: 'admin-2',
      assigned_at: '2026-11-03T11:06:00Z',
    });
    await clickAsync(byButton(view.container, /Взять в работу/)!);
    await flush();

    expect(visibleText(view.container)).toContain(tRu('admin.support.assignment.conflict'));
    expect(visibleText(view.container)).toContain('Мария');
    expect((view.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Не потерять этот ответ');
    view.unmount();
  });
});
