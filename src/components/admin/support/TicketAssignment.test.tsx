// @vitest-environment jsdom
import React, { useState } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byButton, clickAsync, mount, tRu, type, visibleText } from '../../../test/dom';
import { supportAssignmentApi } from '../../../services/supportAssignmentApi';
import { TicketAssignment } from './TicketAssignment';
import type { AssignmentTicket } from './TicketAssignment';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1' } }),
}));

vi.mock('../../../services/supportAssignmentApi', () => ({
  supportAssignmentApi: {
    operators: vi.fn(),
    assign: vi.fn(),
  },
}));

const OPERATORS = [
  { id: 'admin-1', name: 'Иван' },
  { id: 'admin-2', name: 'Мария' },
];

const NOW_FOR_TESTS = Date.parse('2026-11-03T12:00:00Z');

const baseTicket: AssignmentTicket = {
  id: 'ticket-1',
  updated_at: '2026-11-03T11:00:00Z',
  assigned_to: null,
  assigned_at: null,
  first_response_due_at: null,
  first_owner_reply_at: null,
};

function chooseOperator(container: HTMLElement, id: string) {
  const select = container.querySelector('select')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(select, id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('назначение ответственного', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_FOR_TESTS);
    vi.clearAllMocks();
    vi.mocked(supportAssignmentApi.assign).mockResolvedValue(baseTicket);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('показывает просрочку и позволяет взять тикет в работу', async () => {
    const ticket = { ...baseTicket, first_response_due_at: '2026-11-03T10:00:00Z' };
    const onAssigned = vi.fn();
    const view = mount(<TicketAssignment ticket={ticket} operators={OPERATORS} onAssigned={onAssigned} />);

    expect(visibleText(view.container)).toContain(tRu('admin.support.sla.overdue'));
    await clickAsync(byButton(view.container, /Взять в работу/)!);

    expect(supportAssignmentApi.assign).toHaveBeenCalledWith(ticket.id, {
      assigneeId: 'admin-1', expectedUpdatedAt: ticket.updated_at,
    });
    expect(onAssigned).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('переназначает выбранному оператору с версией открытого тикета', async () => {
    const ticket = { ...baseTicket, assigned_to: 'admin-1', assigned_at: '2026-11-03T11:00:00Z' };
    const view = mount(<TicketAssignment ticket={ticket} operators={OPERATORS} onAssigned={vi.fn()} />);
    chooseOperator(view.container, 'admin-2');

    await clickAsync(byButton(view.container, /Переназначить/)!);

    expect(supportAssignmentApi.assign).toHaveBeenCalledWith(ticket.id, {
      assigneeId: 'admin-2', expectedUpdatedAt: ticket.updated_at,
    });
    view.unmount();
  });

  it('снимает назначение только после подтверждения', async () => {
    const ticket = { ...baseTicket, assigned_to: 'admin-1', assigned_at: '2026-11-03T11:00:00Z' };
    const view = mount(<TicketAssignment ticket={ticket} operators={OPERATORS} onAssigned={vi.fn()} />);

    await clickAsync(byButton(view.container, /Снять назначение/)!);

    expect(window.confirm).toHaveBeenCalledWith(tRu('admin.support.assignment.unassign_confirm'));
    expect(supportAssignmentApi.assign).toHaveBeenCalledWith(ticket.id, {
      assigneeId: null, expectedUpdatedAt: ticket.updated_at,
    });
    view.unmount();
  });

  it('при 409 обновляет фактическое назначение и сохраняет текст ответа', async () => {
    vi.mocked(supportAssignmentApi.assign).mockRejectedValue(
      Object.assign(new Error('conflict'), { status: 409 }),
    );

    function Harness() {
      const [ticket, setTicket] = useState(baseTicket);
      const [reply, setReply] = useState('');
      return (
        <>
          <textarea aria-label="reply" value={reply} onChange={(event) => setReply(event.target.value)} />
          <TicketAssignment
            ticket={ticket}
            operators={OPERATORS}
            onAssigned={() => setTicket({
              ...baseTicket,
              updated_at: '2026-11-03T11:05:00Z',
              assigned_to: 'admin-2',
              assigned_at: '2026-11-03T11:05:00Z',
            })}
          />
        </>
      );
    }

    const view = mount(<Harness />);
    const reply = view.container.querySelector('textarea')!;
    type(reply, 'Черновик ответа');
    await clickAsync(byButton(view.container, /Взять в работу/)!);

    expect(visibleText(view.container)).toContain(tRu('admin.support.assignment.conflict'));
    expect(visibleText(view.container)).toContain('Мария');
    expect((view.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Черновик ответа');
    view.unmount();
  });

  it('при обычной ошибке не перерисовывает ответственного и не сообщает об успехе', async () => {
    vi.mocked(supportAssignmentApi.assign).mockRejectedValue(new Error('network down'));
    const onAssigned = vi.fn();
    const ticket = { ...baseTicket, assigned_to: 'admin-1', assigned_at: '2026-11-03T11:00:00Z' };
    const view = mount(<TicketAssignment ticket={ticket} operators={OPERATORS} onAssigned={onAssigned} />);

    await clickAsync(byButton(view.container, /Снять назначение/)!);

    expect(visibleText(view.container)).toContain('network down');
    expect(onAssigned).not.toHaveBeenCalled();
    expect(supportAssignmentApi.assign).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
