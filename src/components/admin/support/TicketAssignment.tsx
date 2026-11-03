import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { useAuth } from '../../../contexts/AuthContext';
import { supportAssignmentApi } from '../../../services/supportAssignmentApi';
import type { SupportAssignmentTicket, SupportOperator } from '../../../services/supportAssignmentApi';
import { remainingText, slaState } from './sla';
import type { SlaState } from './sla';

export type AssignmentTicket = SupportAssignmentTicket;

interface TicketAssignmentProps {
  ticket: AssignmentTicket;
  operators: SupportOperator[];
  onAssigned: () => void | Promise<void>;
}

const SLA_BADGE: Record<SlaState, string> = {
  overdue: 'bg-red-100 text-red-700',
  soon: 'bg-amber-100 text-amber-800',
  normal: 'bg-gray-100 text-gray-600',
  answered: 'bg-green-100 text-green-700',
};

export const TicketAssignment: React.FC<TicketAssignmentProps> = ({ ticket, operators, onAssigned }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedOperator, setSelectedOperator] = useState(
    ticket.assigned_to || user?.id || operators[0]?.id || '',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setSelectedOperator(ticket.assigned_to || user?.id || operators[0]?.id || '');
  }, [ticket.id, ticket.assigned_to, user?.id, operators]);

  const state = slaState(ticket, nowMs);
  const assignedName = useMemo(() => {
    if (!ticket.assigned_to) return null;
    return operators.find((operator) => operator.id === ticket.assigned_to)?.name
      || ticket.assigned_name
      || ticket.assigned_to;
  }, [operators, ticket.assigned_name, ticket.assigned_to]);

  const assign = async (assigneeId: string | null) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await supportAssignmentApi.assign(ticket.id, {
        assigneeId,
        expectedUpdatedAt: ticket.updated_at,
      });
      await onAssigned();
    } catch (cause: any) {
      if (cause?.status === 409) {
        setError(t('admin.support.assignment.conflict'));
        await onAssigned();
      } else {
        setError(cause?.message || t('admin.support.assignment.failed'));
      }
    } finally {
      setPending(false);
    }
  };

  const dateTime = (iso: string) => new Date(iso).toLocaleString(i18n.language, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <section className="bg-white border-b border-gray-200 px-4 py-3 space-y-2 flex-shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">{t('admin.support.assignment.owner')}</span>
        <span className="text-sm text-gray-900">
          {assignedName || t('admin.support.assignment.unassigned')}
        </span>
        <span className={clsx('text-xs px-1.5 py-0.5 rounded', SLA_BADGE[state])}>
          {t(`admin.support.sla.${state}`)}
        </span>
      </div>

      <div className="text-xs text-gray-500">
        {t('admin.support.assignment.deadline')}: {ticket.first_response_due_at
          ? `${dateTime(ticket.first_response_due_at)} · ${remainingText(ticket.first_response_due_at, nowMs)}`
          : t('admin.support.time.dash')}
      </div>
      {ticket.first_owner_reply_at && (
        <div className="text-xs text-green-700">
          {t('admin.support.assignment.first_reply')}: {dateTime(ticket.first_owner_reply_at)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!ticket.assigned_to && user?.id && (
          <button
            type="button"
            disabled={pending}
            onClick={() => assign(user.id)}
            className="px-2.5 py-1.5 rounded-md bg-forest-600 hover:bg-forest-700 text-white text-xs font-medium disabled:opacity-60"
          >
            {t('admin.support.assignment.take')}
          </button>
        )}
        <select
          aria-label={t('admin.support.assignment.operator')}
          value={selectedOperator}
          disabled={pending}
          onChange={(event) => setSelectedOperator(event.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded-md text-xs text-gray-700 bg-white"
        >
          {operators.map((operator) => (
            <option key={operator.id} value={operator.id}>{operator.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !selectedOperator || selectedOperator === ticket.assigned_to}
          onClick={() => assign(selectedOperator)}
          className="px-2.5 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium disabled:opacity-60"
        >
          {t('admin.support.assignment.reassign')}
        </button>
        {ticket.assigned_to && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t('admin.support.assignment.unassign_confirm'))) assign(null);
            }}
            className="px-2.5 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium disabled:opacity-60"
          >
            {t('admin.support.assignment.unassign')}
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </section>
  );
};
